"""
简化的任务日志系统
合并了日志记录和归档功能，提供一个统一的日志管理接口
"""
import json
import gzip
import io
import os
import redis
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from minio import Minio
from minio.error import S3Error
from celery.utils.log import get_task_logger

from app.core.config import settings


class TaskLogger:
    """
    任务日志记录器
    集成Redis实时日志记录和MinIO日志归档功能
    """
    def __init__(self, task_id: int, task_type: str = "log"):
        pass
    
#     def __init__(self, task_id: int, task_type: str = "log"):
#         """
#         初始化任务日志记录器
        
#         Args:
#             task_id: 任务ID
#             task_type: 任务类型，用作Redis key前缀
#         """
#         self.task_id = str(task_id)
#         self.task_type = task_type
#         self.celery_logger = get_task_logger(f"task_{task_id}")
        
#         # 初始化Redis客户端（用于实时日志，支持 Sentinel）
#         try:
#             # 使用配置中的同步 Redis 客户端，自动支持 Sentinel
#             self.redis_client = settings.REDIS_CLIENT
#             self.redis_available = True
#         except Exception as e:
#             self.celery_logger.warning(f"Redis连接失败，仅使用Celery日志: {e}")
#             self.redis_available = False
        
#         # 初始化MinIO客户端（用于日志归档）
#         try:
#             self.minio_client = Minio(
#                 endpoint=settings.MINIO_ENDPOINT,
#                 access_key=settings.MINIO_ACCESS_KEY,
#                 secret_key=settings.MINIO_SECRET_KEY,
#                 secure=settings.MINIO_SECURE.lower() == 'true'
#             )
#             self.bucket = settings.MINIO_BUCKET
#             self._ensure_bucket_exists()
#             self.minio_available = True
#         except Exception as e:
#             self.celery_logger.warning(f"MinIO连接失败，无法归档日志: {e}")
#             self.minio_available = False
        
#         # Redis配置 - 使用动态的task_type作为key前缀
#         self.log_key = f"{task_type}:{task_id}"
#         self.max_entries = settings.REDIS_LOG_MAX_ENTRIES
#         self.expire_seconds = settings.REDIS_LOG_EXPIRE_SECONDS
    
#     def _ensure_bucket_exists(self):
#         """确保MinIO存储桶存在"""
#         try:
#             if not self.minio_client.bucket_exists(self.bucket):
#                 self.minio_client.make_bucket(self.bucket)
#                 self.celery_logger.info(f"创建MinIO存储桶: {self.bucket}")
#         except Exception as e:
#             self.celery_logger.error(f"检查/创建存储桶失败: {e}")
#             self.minio_available = False
    
#     # ========== 日志记录方法 ==========
    
#     def _log(self, level: str, message: str, extra_data: Optional[Dict] = None):
#         """
#         内部日志记录方法
        
#         Args:
#             level: 日志级别
#             message: 日志消息
#             extra_data: 额外数据
#         """
#         # 始终记录到Celery日志
#         log_func = getattr(self.celery_logger, level.lower(), self.celery_logger.info)
#         log_func(message)
        
#         # 如果Redis可用，记录到Redis
#         if self.redis_available:
#             try:
#                 log_entry = {
#                     "timestamp": datetime.utcnow().isoformat() + "Z",
#                     "level": level.upper(),
#                     "message": message
#                 }
                
#                 if extra_data:
#                     log_entry.update(extra_data)
                
#                 log_json = json.dumps(log_entry, ensure_ascii=False)
                
#                 # 写入Redis
#                 self.redis_client.rpush(self.log_key, log_json)
                
#                 # 限制列表长度
#                 if self.max_entries > 0:
#                     self.redis_client.ltrim(self.log_key, -self.max_entries, -1)
                
#                 # 设置过期时间
#                 if self.expire_seconds > 0:
#                     self.redis_client.expire(self.log_key, self.expire_seconds)
                    
#             except Exception as e:
#                 self.celery_logger.error(f"Redis日志写入失败: {e}")
    
#     def debug(self, message: str, **kwargs):
#         """记录DEBUG级别日志"""
#         self._log("DEBUG", message, kwargs)
    
#     def info(self, message: str, **kwargs):
#         """记录INFO级别日志"""
#         self._log("INFO", message, kwargs)
    
#     def warning(self, message: str, **kwargs):
#         """记录WARNING级别日志"""
#         self._log("WARNING", message, kwargs)
    
#     def error(self, message: str, **kwargs):
#         """记录ERROR级别日志"""
#         self._log("ERROR", message, kwargs)
    
#     def critical(self, message: str, **kwargs):
#         """记录CRITICAL级别日志"""
#         self._log("CRITICAL", message, kwargs)
    
#     def log_progress(self, current: int, total: int, message: str = None):
#         """记录进度日志"""
#         progress_percent = (current / total * 100) if total > 0 else 0
#         self.info(message, current=current, total=total, progress=progress_percent)
    
#     def log_start(self, message: str = "任务开始执行"):
#         """记录任务开始日志"""
#         self.info(message, event="task_start")
    
#     def log_complete(self, message: str = "任务执行完成"):
#         """记录任务完成日志"""
#         self.info(message, event="task_complete")
    
#     def log_error(self, error: Exception, message: str = None):
#         """记录错误日志"""
#         self.error(message, error_type=type(error).__name__, error_details=str(error))
    
#     # ========== 日志归档方法 ==========
    
#     def archive_logs(self) -> Optional[str]:
#         """
#         归档任务日志到MinIO
        
#         Returns:
#             Optional[str]: 归档成功返回MinIO对象路径，失败返回None
#         """
#         if not self.minio_available:
#             self.celery_logger.warning("MinIO不可用，无法归档日志")
#             return None
        
#         if not self.redis_available:
#             self.celery_logger.warning("Redis不可用，无法获取日志进行归档")
#             return None
        
#         try:
#             # 获取Redis中的所有日志
#             log_entries = self.redis_client.lrange(self.log_key, 0, -1)
#             if not log_entries:
#                 self.celery_logger.info(f"任务 {self.task_id} 没有日志数据，跳过归档")
#                 return None
            
#             # 转换为文本格式
#             log_lines = []
#             for entry in log_entries:
#                 try:
#                     log_data = json.loads(entry)
#                     log_line = f"{log_data['timestamp']} [{log_data['level']}] {log_data['message']}"
#                     log_lines.append(log_line)
#                 except json.JSONDecodeError:
#                     log_lines.append(str(entry))
            
#             # 合并并压缩日志内容
#             log_content = "\n".join(log_lines)
#             log_bytes = log_content.encode('utf-8')
#             compressed_content = gzip.compress(log_bytes)
            
#             # 生成MinIO对象路径
#             timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
#             object_name = f"logs/{self.task_id}/{timestamp}.log.gz"
            
#             # 上传到MinIO
#             compressed_stream = io.BytesIO(compressed_content)
            
#             self.minio_client.put_object(
#                 bucket_name=self.bucket,
#                 object_name=object_name,
#                 data=compressed_stream,
#                 length=len(compressed_content),
#                 content_type="application/gzip"
#             )
            
#             self.celery_logger.info(f"任务 {self.task_id} 日志归档成功: {object_name}")
            
#             # 归档成功后，设置较短的过期时间
#             self.redis_client.expire(self.log_key, 3600)  # 1小时后过期
            
#             return object_name
            
#         except Exception as e:
#             self.celery_logger.error(f"日志归档失败: {e}")
#             return None
    
#     def get_archived_log_url(self, object_name: str, expires_in_seconds: int = 3600) -> Optional[str]:
#         """
#         获取归档日志的预签名下载URL
        
#         Args:
#             object_name: MinIO中的对象路径
#             expires_in_seconds: URL过期时间（秒）
            
#         Returns:
#             Optional[str]: 预签名URL，失败返回None
#         """
#         if not self.minio_available:
#             return None
        
#         try:
#             url = self.minio_client.presigned_get_object(
#                 bucket_name=self.bucket,
#                 object_name=object_name,
#                 expires=timedelta(seconds=expires_in_seconds)
#             )
#             return url
#         except Exception as e:
#             self.celery_logger.error(f"生成预签名URL失败: {e}")
#             return None
    
#     def download_archived_logs(self, object_name: str) -> Optional[str]:
#         """
#         下载并解压归档的日志内容
        
#         Args:
#             object_name: MinIO中的对象路径
            
#         Returns:
#             Optional[str]: 解压后的日志内容，失败返回None
#         """
#         if not self.minio_available:
#             return None
        
#         try:
#             response = self.minio_client.get_object(
#                 bucket_name=self.bucket,
#                 object_name=object_name
#             )
            
#             compressed_data = response.read()
#             decompressed_data = gzip.decompress(compressed_data)
#             log_content = decompressed_data.decode('utf-8')
            
#             return log_content
            
#         except Exception as e:
#             self.celery_logger.error(f"下载归档日志失败: {e}")
#             return None
#         finally:
#             try:
#                 response.close()
#             except:
#                 pass
    
#     def clear_logs(self):
#         """清除任务的所有Redis日志"""
#         if self.redis_available:
#             try:
#                 self.redis_client.delete(self.log_key)
#             except Exception as e:
#                 self.celery_logger.error(f"清除任务日志失败: {e}")
    
#     def get_log_count(self) -> int:
#         """获取当前任务的日志数量"""
#         if not self.redis_available:
#             return 0
        
#         try:
#             return self.redis_client.llen(self.log_key)
#         except Exception:
#             return 0


# # ========== 便捷函数 ==========

# def create_task_logger(task_id: int, task_type:str) -> TaskLogger:
#     """
#     创建任务日志记录器的便捷函数
    
#     Args:
#         task_id: 任务ID
#         task_type: 任务类型，用作Redis key前缀  
        
#     Returns:
#         TaskLogger: 任务日志记录器
#     """
#     return TaskLogger(task_id, task_type)


# def archive_task_logs(task_id: int, task_type: str) -> Optional[str]:
#     """
#     归档任务日志的便捷函数
    
#     Args:
#         task_id: 任务ID
#         task_type: 任务类型，用作Redis key前缀
        
#     Returns:
#         Optional[str]: 归档成功返回MinIO对象路径，失败返回None
#     """
#     logger = TaskLogger(task_id, task_type)
#     return logger.archive_logs() 