"""
极简日志系统

提供统一的日志记录接口，支持控制台和文件输出。

Quick Start:
    # 应用启动时
    from app.core.logging import setup_logging
    setup_logging()
    
    # 使用日志
    from app.core.logging import logger
    logger.info("Hello world")
    
    # 或者获取命名日志器
    from app.core.logging import get_logger
    logger = get_logger(__name__)
    logger.info("Hello world")

Environment Variables:
    LOG_LEVEL: 日志级别 (DEBUG/INFO/WARNING/ERROR，默认INFO)
    LOG_FILE: 日志文件路径 (默认logs/app.log)
    LOG_ROTATION: 日志轮转策略 (默认1 day)
    LOG_RETENTION: 日志保留时间 (默认30 days)
    LOG_CONSOLE: 是否启用控制台输出 (默认true)
    LOG_FILE_ENABLED: 是否启用文件输出 (默认true)
"""

from .logger import setup_logging, logger, get_logger
from .middleware import RequestLoggingMiddleware, get_request_id

__all__ = [
    # 核心功能
    "setup_logging",
    "logger", 
    "get_logger",
    
    # 中间件
    "RequestLoggingMiddleware",
    "get_request_id",
] 