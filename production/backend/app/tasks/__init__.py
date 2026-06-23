"""
简化的任务管理模块
提供统一的任务管理接口
"""

# 导入简化的核心模块
from .task_base import TaskBase
# from .logger import TaskLogger, create_task_logger, archive_task_logs
from .constants import TaskStatus, TaskType
from .celery_app import celery_app


__all__ = [
    'TaskBase',
    'TaskLogger', 
    'create_task_logger',
    'archive_task_logs',
    'TaskStatus',
    'TaskType',
    'celery_app',
 
]


def third_api_batch_request_tasks():
    return None