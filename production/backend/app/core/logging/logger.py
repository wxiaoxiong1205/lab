import os
import sys
import traceback
from pathlib import Path
from typing import Any, Optional
from loguru import logger as _logger
import logging
import inspect


class LogConfig:
    """日志配置类 - 统一管理所有日志相关配置"""
    
    def __init__(self):
        # 从统一配置管理器获取配置
        from app.core.config import settings
        
        self.level = settings.LOG_LEVEL.upper()
        self.file_path = settings.LOG_FILE
        self.rotation = settings.LOG_ROTATION or "1 day"
        self.retention = settings.LOG_RETENTION or "30 days"
        self.console_enabled = settings.LOG_TO_STDOUT
        self.file_enabled = settings.LOG_TO_FILE
        self.multiline_prefix_each_line = settings.LOG_MULTILINE_PREFIX_EACH_LINE

    @property
    def console_format(self) -> str:
        """控制台日志格式 - 彩色输出，包含关键信息"""
        return (
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
            "<cyan>{extra[request_id]}</cyan> | "
            "<level>{level: <5}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
            "<level>{message}</level>"
        )
    
    @property 
    def file_format(self) -> str:
        """文件日志格式 - 纯文本，包含完整信息"""
        return (
            "{time:YYYY-MM-DD HH:mm:ss.SSS} | "
            "{extra[request_id]} | "
            "{level: <5} | "
            "{name}:{function}:{line} | "
            "{message}"
        )


def _inject_request_id(record: dict) -> dict:
    """
    为每条 Loguru 记录注入 request_id（来自请求上下文）。
    若不在请求上下文中，则填充 "-"，保证 format 中 {extra[request_id]} 总是可用。
    """
    try:
        # 延迟导入，避免与 middleware -> logger 的循环依赖在 import-time 触发
        from app.core.logging.middleware import request_id_context  # noqa

        rid = request_id_context.get("") or "-"
    except Exception:
        rid = "-"

    record.setdefault("extra", {})
    record["extra"].setdefault("request_id", rid)
    # 供「多行前缀」模式下替代默认 {exception}，避免模板缺 key
    record["extra"].setdefault("_prefixed_exception", "")
    return record


def _line_prefix(record: dict) -> str:
    """与 message 多行前缀一致的：时间 | request_id | 级别 | 位置 |"""
    ts = record["time"].strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    rid = record["extra"].get("request_id", "-")
    lvl = record["level"].name
    loc = f"{record['name']}:{record['function']}:{record['line']}"
    return f"{ts} | {rid} | {lvl: <5} | {loc} | "


def _expand_multiline_message_with_prefix(record: dict) -> dict:
    """
    若开启 LOG_MULTILINE_PREFIX_EACH_LINE，且 message 含换行，则每一行前拼接：
    时间 | request_id | 级别 | name:function:line |
    并标记 extra._multiline_expanded，供 format 避免外层重复套一层表头。
    """
    try:
        from app.core.config import settings

        if not settings.LOG_MULTILINE_PREFIX_EACH_LINE:
            return record
    except Exception:
        return record

    msg = record.get("message")
    if msg is None:
        return record
    text = str(msg)
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    if "\n" not in normalized:
        return record

    prefix = _line_prefix(record)
    record["message"] = "\n".join(prefix + line for line in normalized.split("\n"))
    record.setdefault("extra", {})
    record["extra"]["_multiline_expanded"] = True
    return record


def _prefix_exception_trace_each_line(record: dict) -> dict:
    """
    异常堆栈由 Loguru 单独走 {exception}，与 message 分离。
    开启 LOG_MULTILINE_PREFIX_EACH_LINE 时，用 traceback 文本逐行加前缀，
    写入 extra._prefixed_exception，并清空 record['exception']，避免与默认 {exception} 重复。
    （与 Loguru diagnose/backtrace 的富文本相比，为标准 traceback 文本。）
    """
    try:
        from app.core.config import settings

        if not settings.LOG_MULTILINE_PREFIX_EACH_LINE:
            return record
    except Exception:
        return record

    record.setdefault("extra", {})
    exc = record.get("exception")
    if not exc:
        record["extra"].setdefault("_prefixed_exception", "")
        return record

    try:
        if isinstance(exc, tuple) and len(exc) == 3:
            typ, val, tb = exc
        else:
            typ = getattr(exc, "type", None)
            val = getattr(exc, "value", None)
            tb = getattr(exc, "traceback", None)
            if typ is None:
                record["extra"].setdefault("_prefixed_exception", "")
                return record

        text = "".join(traceback.format_exception(typ, val, tb)).rstrip("\n")
        prefix = _line_prefix(record)
        record["extra"]["_prefixed_exception"] = "\n".join(prefix + line for line in text.split("\n"))
        record["exception"] = None
    except Exception:
        record["extra"].setdefault("_prefixed_exception", "")

    return record


def _patch_record_for_logging(record: dict) -> dict:
    _inject_request_id(record)
    _expand_multiline_message_with_prefix(record)
    _prefix_exception_trace_each_line(record)
    return record


def _console_format_dynamic(record: dict) -> str:
    """控制台：多行 message / 异常栈逐行前缀在 extra._prefixed_exception；失败时回退 {exception}。"""
    record["extra"].setdefault("_prefixed_exception", "")
    _exc = "{extra[_prefixed_exception]}{exception}"
    if record["extra"].get("_multiline_expanded"):
        return f"<level>{{message}}</level>\n{_exc}\n"
    return (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<cyan>{extra[request_id]}</cyan> | "
        "<level>{level: <5}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "<level>{message}</level>\n" + _exc + "\n"
    )


def _file_format_dynamic(record: dict) -> str:
    """文件：同上。"""
    record["extra"].setdefault("_prefixed_exception", "")
    _exc = "{extra[_prefixed_exception]}{exception}"
    if record["extra"].get("_multiline_expanded"):
        return "{message}\n" + _exc + "\n"
    return (
        "{time:YYYY-MM-DD HH:mm:ss.SSS} | "
        "{extra[request_id]} | "
        "{level: <5} | "
        "{name}:{function}:{line} | "
        "{message}\n" + _exc + "\n"
    )


class InterceptHandler(logging.Handler):
    """
    拦截标准logging日志，转发到Loguru
    用于桥接SQLAlchemy等第三方库的日志到Loguru系统
    """
    
    def emit(self, record):
        try:
            # 获取对应的Loguru级别
            try:
                level = _logger.level(record.levelname).name
            except ValueError:
                level = record.levelno
            
            # 格式化消息
            message = record.getMessage()
            
            # 为SQLAlchemy日志添加特殊标识
            if record.name.startswith('sqlalchemy'):
                message = f"{message}"

            # 使用bind添加额外的上下文信息
            # logger_with_context = _logger.bind(
            #     name=record.name,
            #     module=record.module if hasattr(record, 'module') else 'unknown'
            # )
            #
            # # 记录日志，不需要查找调用者帧（避免性能问题）
            # logger_with_context.log(level, message)

            # 将标准库 logging 的调用位置映射回真实调用点（如 app/database/base.py）
            # 否则 {name}:{function}:{line} 会落在 InterceptHandler.emit 上
            frame = inspect.currentframe()
            depth = 2
            while frame and frame.f_code.co_filename == logging.__file__:
                frame = frame.f_back
                depth += 1

            _logger.opt(
                depth=depth,
                exception=record.exc_info,
            ).log(level, message)
            
        except Exception as e:
            # 如果处理日志时出错，至少要记录错误
            _logger.error(f"InterceptHandler处理日志时出错: {e}")


class SimpleLogger:
    """极简日志管理器 - 单例模式，统一管理日志配置和输出"""
    
    _instance: Optional['SimpleLogger'] = None
    _initialized: bool = False
    
    def __new__(cls) -> 'SimpleLogger':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self.config = LogConfig()
            self._setup_logger()
            self._initialized = True
    
    def _setup_logger(self) -> None:
        """配置日志记录器"""
        global _logger
        # request_id 注入 + 可选多行 message 每行前缀（与 LOG_MULTILINE_PREFIX_EACH_LINE 配合）
        _logger = _logger.patch(_patch_record_for_logging)

        # 移除默认处理器
        _logger.remove()

        console_fmt: Any = (
            _console_format_dynamic
            if self.config.multiline_prefix_each_line
            else self.config.console_format
        )
        file_fmt: Any = (
            _file_format_dynamic
            if self.config.multiline_prefix_each_line
            else self.config.file_format
        )

        # 添加控制台处理器
        if self.config.console_enabled:
            _logger.add(
                sys.stdout,
                format=console_fmt,
                level=self.config.level,
                colorize=True,
                backtrace=True,
                diagnose=True
            )
        
        # 添加文件处理器
        if self.config.file_enabled:
            # 确保日志目录存在
            log_file = Path(self.config.file_path)
            log_file.parent.mkdir(parents=True, exist_ok=True)
            
            _logger.add(
                self.config.file_path,
                format=file_fmt,
                level=self.config.level,
                rotation=self.config.rotation,
                retention=self.config.retention,
                encoding="utf-8",
                backtrace=True,
                diagnose=True
            )
        
        # 记录初始化信息
        _logger.info(f"日志系统初始化完成 | 级别: {self.config.level} | 文件: {self.config.file_path}")

        # 创建拦截器
        interceptor = InterceptHandler()

        # ========== 接管标准库 logging ==========
        # 若想恢复之前的logging格式，注释掉这段代码
        # 让 app/database/base.py 等使用 logging.getLogger(__name__) 的日志也统一走 Loguru 格式
        root_logger = logging.getLogger()
        root_logger.handlers.clear()
        root_logger.setLevel(getattr(logging, self.config.level, logging.INFO))
        root_logger.addHandler(interceptor)
        
        # ========== 配置SQLAlchemy日志 ==========
        # SQLAlchemy使用多个logger层级：
        # - sqlalchemy.engine.Engine: 实际记录SQL语句的logger
        # - sqlalchemy.engine: 引擎相关日志
        # - sqlalchemy.pool: 连接池相关日志
        # 需要确保所有层级都正确配置，避免重复输出
        # 需要确保所有层级都正确配置，避免重复输出 
        
        # 配置sqlalchemy根logger - 阻止所有sqlalchemy日志传播到root logger
        sqlalchemy_root_logger = logging.getLogger('sqlalchemy')
        sqlalchemy_root_logger.handlers.clear()
        sqlalchemy_root_logger.propagate = False  # 关键：阻止传播到root logger
        
        # 配置sqlalchemy.engine.Engine - 这是SQLAlchemy实际记录SQL的logger
        sqlalchemy_engine_echo_logger = logging.getLogger('sqlalchemy.engine.Engine')
        sqlalchemy_engine_echo_logger.handlers.clear()
        sqlalchemy_engine_echo_logger.setLevel(logging.INFO)
        sqlalchemy_engine_echo_logger.addHandler(interceptor)
        sqlalchemy_engine_echo_logger.propagate = False  # 不传播，直接由InterceptHandler处理
        
        # 配置sqlalchemy.engine - 引擎相关日志
        sqlalchemy_engine_logger = logging.getLogger('sqlalchemy.engine')
        sqlalchemy_engine_logger.handlers.clear()
        sqlalchemy_engine_logger.setLevel(logging.INFO)
        sqlalchemy_engine_logger.addHandler(interceptor)
        sqlalchemy_engine_logger.propagate = False
        
        # 配置sqlalchemy.pool - 连接池相关日志
        sqlalchemy_pool_logger = logging.getLogger('sqlalchemy.pool')
        sqlalchemy_pool_logger.handlers.clear()
        sqlalchemy_pool_logger.setLevel(logging.INFO)
        sqlalchemy_pool_logger.addHandler(interceptor)
        sqlalchemy_pool_logger.propagate = False
        
        # 记录SQLAlchemy日志配置信息
        _logger.info("SQLAlchemy日志记录器已配置：sqlalchemy.engine.Engine, sqlalchemy.engine 和 sqlalchemy.pool")
    
    
    @property
    def logger(self):
        """获取配置好的日志记录器实例"""
        return _logger


# 创建全局日志实例
_simple_logger = SimpleLogger()


def setup_logging() -> None:
    """
    设置日志系统
    
    应用启动时调用一次即可，会自动配置控制台和文件日志。
    配置通过环境变量控制：
    - LOG_LEVEL: 日志级别 (DEBUG/INFO/WARNING/ERROR)
    - LOG_FILE: 日志文件路径
    - LOG_ROTATION: 日志轮转策略
    - LOG_CONSOLE: 是否启用控制台输出
    - LOG_FILE_ENABLED: 是否启用文件输出
    - LOG_MULTILINE_PREFIX_EACH_LINE: 多行 message 是否每行带时间与 request_id 等前缀
    """
    # 初始化已在 SimpleLogger.__init__ 中完成
    pass


def get_logger(name: Optional[str] = None):
    """
    获取日志记录器
    
    Args:
        name: 记录器名称，通常使用 __name__
        
    Returns:
        配置好的日志记录器实例
        
    Usage:
        logger = get_logger(__name__)
        logger.info("Hello world")
    """
    if name:
        return _simple_logger.logger.bind(name=name)
    return _simple_logger.logger


# 导出默认日志实例，支持直接使用
logger = _simple_logger.logger