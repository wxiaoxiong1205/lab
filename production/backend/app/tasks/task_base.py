"""
Celery任务基类
合并了任务基类和数据库操作，提供一个统一的任务管理接口
"""
import logging
from celery import Task
from celery.utils.log import get_task_logger
from celery.exceptions import Ignore, TaskRevokedError
from typing import Dict, Any, Optional, Callable
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
from contextlib import contextmanager
from functools import wraps

from app.database.base import SessionLocal
from app.tasks.constants import TaskStatus
# from app.tasks.logger import TaskLogger

logger = logging.getLogger(__name__)
celery_logger = get_task_logger(__name__)


# def db_operation_handler(func: Callable) -> Callable:
#     """数据库操作装饰器，统一处理异常和日志"""
#     @wraps(func)
#     def wrapper(self, *args, **kwargs):
#         try:
#             return func(self, *args, **kwargs)
#         except Exception as e:
#             self._log_error(f"数据库操作失败 [{func.__name__}]: {str(e)}")
#             return False
#     return wrapper


class TaskBase(Task):
    """
    任务基类
    集成了数据库操作、状态管理、日志记录、任务取消检查等核心功能
    """
    
    def __init__(self):
        super().__init__()
        self.task_id: Optional[int] = None
        self.task_name: Optional[str] = None
        self.task_type: Optional[str] = None
        self.logger = celery_logger
        # self.task_logger: Optional[TaskLogger] = None
    
    # # ========== 任务取消检查方法 ==========
    
    # def check_and_handle_cancellation(self):
    #     """
    #     检查并处理任务取消
        
    #     Raises:
    #         TaskRevokedError: 如果任务被取消
    #     """
    #     try:
    #         # 直接检查数据库中的任务状态
    #         if self.task_id:
    #             task_info = self._get_task_info(self.task_id)
    #             if task_info and task_info.get('status') == TaskStatus.CANCELLED:
    #                 self._log_info("检测到任务已被取消，正在停止执行...")
    #                 raise TaskRevokedError("任务被取消")
                    
    #     except TaskRevokedError:
    #         raise  # 重新抛出取消异常
    #     except Exception as e:
    #         # 如果检查过程出错，记录日志但不中断任务
    #         self._log_warning(f"检查任务取消状态时出错: {str(e)}")
    
    # # ========== 统一日志接口 ==========
    
    def _log_info(self, message: str, **kwargs):
        """统一的信息日志记录"""
        # if self.task_logger:
        #     self.task_logger.info(message, **kwargs)
        # else:
        self.logger.info(message)
    
    def _log_warning(self, message: str, **kwargs):
        """统一的警告日志记录"""
        # if self.task_logger:
        #     self.task_logger.warning(message, **kwargs)
        # else:
        self.logger.warning(message)
    
    def _log_error(self, message: str, error: Exception = None, **kwargs):
        """统一的错误日志记录"""
        # if self.task_logger:
        #     self.task_logger.log_error(error, message)
        # else:
        self.logger.error(message)
    
    def _log_start(self, message: str):
        """统一的任务开始日志记录"""
        # if self.task_logger and hasattr(self.task_logger, 'log_start'):
        #     self.task_logger.log_start(message)
        # else:
        self.logger.info(f"[START] {message}")
    
    def _log_complete(self, message: str):
        """统一的任务完成日志记录"""
        # if self.task_logger and hasattr(self.task_logger, 'log_complete'):
        #     self.task_logger.log_complete(message)
        # else:
        self._log_info(f"[COMPLETE] {message}")
    
    # def _log_progress(self, processed: int, total: int, message: str):
    #     """统一的进度日志记录"""
    #     if self.task_logger and hasattr(self.task_logger, 'log_progress'):
    #         self.task_logger.log_progress(processed, total, message)
    #     else:
    #         self._log_info(f"[PROGRESS] {message}")
    
    # # ========== 数据库操作方法 ==========
    
    # @contextmanager
    # def get_db_session(self):
    #     """获取数据库会话的上下文管理器"""
    #     session = SessionLocal()
    #     try:
    #         yield session
    #     except Exception as e:
    #         logger.error(f"数据库操作失败: {str(e)}")
    #         session.rollback()
    #         raise
    #     finally:
    #         session.close()
    
    # def _get_task_info(self, task_id: int) -> Optional[Dict[str, Any]]:
    #     """获取任务信息"""
    #     from app.models.models import Task as TaskModel
        
    #     with self.get_db_session() as session:
    #         task = session.query(TaskModel).filter(TaskModel.id == task_id).first()
    #         if not task:
    #             return None
            
    #         return {
    #             'id': task.id,
    #             'name': task.name,
    #             'status': task.status,
    #             'task_type': task.task_type,
    #             'project_id': task.project_id,
    #             'created_at': task.created_at,
    #             'updated_at': task.updated_at,
    #             'started_at': task.started_at,
    #             'finished_at': task.finished_at,
    #             'progress': task.progress,
    #             'processed_count': task.processed_count,
    #             'total_count': task.total_count,
    #             'successful_count': task.successful_count,
    #             'failed_count': task.failed_count,
    #             'error_message': task.error_message
    #         }
    
    # @db_operation_handler
    # def _update_task_fields(self, task_id: int, update_data: Dict[str, Any]) -> bool:
    #     """通用的任务字段更新方法"""
    #     from app.models.models import Task as TaskModel
        
    #     # 添加更新时间戳
    #     update_data['updated_at'] = datetime.utcnow()
        
    #     with self.get_db_session() as session:
    #         rows_affected = session.query(TaskModel).filter(
    #             TaskModel.id == task_id
    #         ).update(update_data)
            
    #         session.commit()
            
    #         if rows_affected > 0:
    #             return True
    #         else:
    #             self._log_warning(f"任务 {task_id} 不存在，无法更新")
    #             return False
    
    # @db_operation_handler
    # def _update_task_status(self, task_id: int, status: str, **kwargs) -> bool:
    #     """更新任务状态"""
    #     update_data = {'status': status, **kwargs}
        
    #     # 设置时间戳
    #     if status == TaskStatus.RUNNING:
    #         with self.get_db_session() as session:
    #             result = session.execute(
    #                 text("SELECT started_at FROM tasks WHERE id = :task_id"),
    #                 {'task_id': task_id}
    #             ).fetchone()
    #             if result and result[0] is None:
    #                 update_data['started_at'] = datetime.utcnow()
    #     elif status in TaskStatus.FINAL_STATUSES:
    #         update_data['finished_at'] = datetime.utcnow()
        
    #     success = self._update_task_fields(task_id, update_data)
    #     if success:
    #         self._log_info(f"任务 {task_id} ({self.task_name}) 状态更新为: {status}")
    #     return success
    
    # @db_operation_handler
    # def _update_task_progress(self, task_id: int, processed: int, total: int, 
    #                          success: int = 0, failed: int = 0) -> bool:
    #     """更新任务进度"""
    #     progress = min(100.0, (processed / total) * 100) if total > 0 else 0.0
        
    #     update_data = {
    #         'processed_count': processed,
    #         'total_count': total,
    #         'successful_count': success,
    #         'failed_count': failed,
    #         'progress': progress
    #     }
        
    #     success_update = self._update_task_fields(task_id, update_data)
    #     if success_update:
    #         self._log_info(f"任务 {task_id} 进度更新: {processed}/{total} ({progress:.1f}%)")
    #     return success_update
    
    # @db_operation_handler
    # def _update_task_log_path(self, task_id: int, log_path: str) -> bool:
    #     """更新任务日志路径"""
    #     success = self._update_task_fields(task_id, {'log_path': log_path})
    #     if success:
    #         self._log_info(f"任务 {task_id} ({self.task_name}) 日志路径更新为: {log_path}")
    #     return success
    
    # @db_operation_handler
    # def batch_insert_dataset_logs(self, dataset_logs: list) -> bool:
    #     """批量插入数据集日志"""
    #     with self.get_db_session() as session:
    #         session.add_all(dataset_logs)
    #         session.commit()
    #         self._log_info(f"批量插入 {len(dataset_logs)} 条数据集日志成功")
    #         return True
    
    # # ========== 任务管理方法 ==========
    
    # def setup_task(self, db_task_id: int) -> bool:
    #     """设置任务环境"""
    #     self.task_id = db_task_id
        
    #     # 获取任务信息
    #     task_info = self._get_task_info(db_task_id)
    #     if task_info:
    #         self.task_name = task_info['name']
    #         self.task_type = task_info['task_type']
    #         logger.info(f"任务信息已获取: {self.task_name} (状态: {task_info['status']})")
    #         status = task_info['status']
    #         # 只有pengding状态才能执行
    #         if status != 'PENDING':
    #             self._log_info(f"任务{self.task_name} 状态为 {status}，跳过执行")
    #             return False
    #     else:
    #         logger.warning(f"未找到任务 {db_task_id}")
    #         return False
        
    #     # 初始化日志记录器
    #     self.logger = get_task_logger(f"{__name__}.task_{db_task_id}")
    #     self.task_logger = TaskLogger(db_task_id, self.task_type)
        
    #     # 记录任务开始 - 使用统一日志接口
    #     self._log_start(f"任务 {db_task_id} ({self.task_name}) 环境设置完成")
    #     self._log_start(f"任务 {db_task_id} ({self.task_name}) 开始执行")
    #     return True
    
    # def cleanup_task(self):
    #     """清理任务环境和归档日志"""
    #     if not self.task_id or not self.task_logger:
    #         return
        
    #     # 记录任务完成并归档日志 - 使用统一日志接口
    #     self._log_complete(f"任务 {self.task_id} ({self.task_name}) 执行完成")
        
    #     try:
    #         log_path = self.task_logger.archive_logs()
    #         if log_path:
    #             self._update_task_log_path(self.task_id, log_path)
    #         else:
    #             self._log_warning("日志归档失败或无日志需要归档")
    #     except Exception as e:
    #         self._log_error(f"日志归档过程中出错: {str(e)}")
        
    #     self._log_info("任务环境清理完成")
    
    # def _validate_and_update_status(self, status: str, **kwargs) -> bool:
    #     """验证并更新任务状态"""
    #     if not self.task_id:
    #         self._log_warning("任务ID为空，无法更新状态")
    #         return False
        
    #     # 状态转换验证 - 直接从数据库获取当前状态
    #     task_info = self._get_task_info(self.task_id)
    #     if task_info:
    #         current_status = task_info['status']
    #         valid_transitions = TaskStatus.VALID_TRANSITIONS.get(current_status, [])
    #         if status not in valid_transitions:
    #             self._log_warning(f"无效的状态转换: {current_status} -> {status}")
    #             return False
        
    #     return self._update_task_status(self.task_id, status, **kwargs)
    
    # def update_status(self, status: str, **kwargs):
    #     """更新任务状态"""
    #     success = self._validate_and_update_status(status, **kwargs)
    #     if not success:
    #         self._log_error(f"任务状态更新失败: {status}")
    
    # def update_progress(self, processed: int, total: int, success: int = 0, failed: int = 0):
    #     """更新任务进度"""
    #     if not self.task_id:
    #         self._log_warning("任务ID为空，无法更新进度")
    #         return
        
    #     # 更新数据库进度
    #     progress = min(100.0, (processed / total) * 100) if total > 0 else 0.0
    #     success_update = self._update_task_progress(self.task_id, processed, total, success, failed)
        
    #     if success_update:
    #         # 更新Celery任务状态
    #         self.update_state(
    #             state="PROGRESS",
    #             meta={
    #                 'current': processed,
    #                 'total': total,
    #                 'success': success,
    #                 'failed': failed,
    #                 'percent': progress,
    #                 'message': f"处理进度: {processed}/{total} ({progress:.1f}%)"
    #             }
    #         )
            
    #         # 使用统一的进度日志接口
    #         self._log_progress(processed, total, f"处理进度: {processed}/{total} ({progress:.1f}%)")
    #     else:
    #         self._log_error(f"进度更新失败: {processed}/{total}")
    
    # # ========== 任务状态标记方法 ==========
    
    # def mark_success(self, message: str = "任务执行成功"):
    #     """标记任务成功"""
    #     self.update_status(TaskStatus.SUCCESS)
    #     self._log_info(message)
    
    # def mark_failed(self, error_message: str):
    #     """标记任务失败"""
    #     self.update_status(TaskStatus.FAILED, error_message=error_message)
    #     self._log_error(f"任务失败: {error_message}")
    
    # # ========== 公共日志接口 ==========
    
    # def log_info(self, message: str, **kwargs):
    #     """记录信息日志"""
    #     self._log_info(message, **kwargs)
    
    # def log_warning(self, message: str, **kwargs):
    #     """记录警告日志"""
    #     self._log_warning(message, **kwargs)
    
    # def log_error(self, message: str, error: Exception = None, **kwargs):
    #     """记录错误日志"""
    #     self._log_error(message, error, **kwargs)
    
    # # ========== 工具方法 ==========
    
    # def get_task_info(self) -> Optional[Dict[str, Any]]:
    #     """获取任务信息"""
    #     if not self.task_id:
    #         return None
    #     return self._get_task_info(self.task_id)