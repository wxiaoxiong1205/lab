"""
通用Redis日志读取工具
负责从Redis中读取任务日志，提供给API接口使用
"""
import json
import redis
import gzip
import io
from typing import Dict, List, Optional
from app.core.config import settings
import logging
from minio import Minio
from minio.error import S3Error
from datetime import timedelta

logger = logging.getLogger(__name__)


class RedisKeys:
    """Redis键名模板"""    
    @staticmethod
    def get_custom_log_key(log_id: int, key_prefix: str) -> str:
        """获取自定义日志的Redis键名"""
        return f"{key_prefix}:{log_id}"

class RedisLogReader:
    """
    日志读取器
    负责从Redis中读取任务日志，提供给API接口使用
    """
    
    def __init__(self, redis_client: Optional[redis.Redis] = None):
        """
        初始化日志读取器
        
        Args:
            redis_client: Redis客户端（可选）
        """
        if redis_client:
            self.redis_client = redis_client
        else:
            try:
                # 使用配置中的同步 Redis 客户端，自动支持 Sentinel
                self.redis_client = settings.REDIS_CLIENT
            except Exception as e:
                logger.error(f"Redis连接失败: {e}")
                self.redis_client = None
        
        # 初始化MinIO客户端（用于从归档日志恢复）
        try:
            self.minio_client = Minio(
                endpoint=settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE.lower() == 'true'
            )
            self.bucket = settings.MINIO_BUCKET
            self.minio_available = True
        except Exception as e:
            logger.error(f"MinIO连接失败: {e}")
            self.minio_available = False
    
    def key_exists(self, key: str) -> bool:
        """
        检查Redis key是否存在
        
        Args:
            key: Redis键名
            
        Returns:
            bool: 键是否存在，连接失败时返回False
        """
        if not self.redis_client:
            logger.warning("Redis客户端未连接，返回key不存在")
            return False
            
        try:
            return self.redis_client.exists(key) > 0
        except Exception as e:
            logger.error(f"检查Redis key存在性失败: {e}")
            return False
    
    def load_archived_logs_to_redis(self, log_id: int, minio_log_path: str, key_prefix: str = "log") -> bool:
        """
        从MinIO下载归档日志并加载到Redis中
        
        Args:
            log_id: 日志ID（任务ID或测试运行ID）
            minio_log_path: MinIO中的日志文件路径
            key_prefix: Redis key前缀，默认为"log"，test_run使用"test_run_log"
            
        Returns:
            bool: 是否成功加载
        """

        try:
            # 从MinIO下载日志文件
            response = self.minio_client.get_object(
                bucket_name=self.bucket,
                object_name=minio_log_path
            )
            
            # 读取并解压日志内容
            compressed_data = response.read()
            decompressed_data = gzip.decompress(compressed_data)
            log_content = decompressed_data.decode('utf-8')
            
            # 解析日志行并转换为JSON格式
            log_lines = log_content.strip().split('\n')
            # 根据key_prefix生成对应的Redis key
            log_key = RedisKeys.get_custom_log_key(log_id, key_prefix)
            
            
            # 逐行处理日志并写入Redis
            for line in log_lines:
                if not line.strip():
                    continue
                
                try:
                    # 尝试解析日志行格式: "timestamp [level] message"
                    # 例如: "2024-01-01T12:00:00Z [INFO] Task started"
                    parts = line.split(' ', 2)
                   
                    timestamp = parts[0]
                    level = parts[1].strip('[]')
                    message = parts[2] if len(parts) > 2 else ""
                    
                    log_entry = {
                        "timestamp": timestamp,
                        "level": level,
                        "message": message
                    }
                    
                    log_json = json.dumps(log_entry, ensure_ascii=False)
                    self.redis_client.rpush(log_key, log_json)
                  
                        
                except Exception as e:
                    raise e
            
            # 设置较短的过期时间（1小时），因为这是从归档恢复的
            self.redis_client.expire(log_key, 3600)
            
            log_count = self.redis_client.llen(log_key)
            log_type = "测试运行" if key_prefix == "test_run_log" else "任务"
            logger.info(f"成功从MinIO加载{log_type}{log_id}的日志到Redis，共{log_count}条")
            return True
            
        except Exception as e:
            raise e
        finally:
            try:
                response.close()
            except:
                pass
    
    def get_logs(
        self, 
        log_id: int, 
        start: int = 0,
        limit: int = 20,
        key_prefix: str = "log"
    ) -> Dict:
        """
        获取日志
        
        Args:
            log_id: 日志ID（任务ID或测试运行ID）
            start: 起始位置（从0开始）
            limit: 限制条数（默认20条）
            key_prefix: Redis key前缀，默认为"log"，test_run使用"test_run_log"
            
        Returns:
            Dict: 包含日志数据和元信息的字典
                {
                    "logs": List[Dict],  # 日志列表
                    "start": int    # 下一个起始位置
                }
        """     
        try:
            log_key = RedisKeys.get_custom_log_key(log_id, key_prefix)
            # 获取总日志数量
            total_count = self.redis_client.llen(log_key)
            # 计算结束位置
            end = start + limit - 1
            # 从Redis获取日志条目
            log_entries = self.redis_client.lrange(log_key, start, end)
            
            # 解析日志条目
            logs = []
            for entry in log_entries:
                try:
                    log_data = json.loads(entry)
                    # 只保留必要的字段
                    filtered_log = {
                        "timestamp": log_data.get("timestamp", ""),
                        "level": log_data.get("level", "INFO"),
                        "message": log_data.get("message", "")
                    }
                    logs.append(filtered_log)
                except json.JSONDecodeError as e:
                    raise Exception(f"日志解析失败: {e}, 原始数据: {entry}")
            
            # 计算下一个起始位置和是否还有更多日志
            next_start = start + len(logs)
            
            return {
                "logs": logs,
                "start": next_start
            }
        except Exception as e:
            log_type = "测试运行" if key_prefix == "test_run_log" else "任务"
            logger.error(f"获取{log_type}{log_id}日志失败: {e}")
            raise e

# 全局日志读取器实例
redis_log_reader = RedisLogReader()


def get_task_logs(
    task_id: int, 
    start: int = 0, 
    limit: int = 20,
    key_prefix: str = "log"
) -> Dict:
    """
    获取日志的便捷函数
    
    Args:
        task_id: 任务ID或测试运行ID
        start: 起始位置
        limit: 限制条数（默认20条）
        key_prefix: Redis key前缀，默认为"log"，test_run使用"test_run_log"
        
    Returns:
        Dict: 日志数据
    """
    return redis_log_reader.get_logs(task_id, start, limit, key_prefix)


def load_archived_logs_to_redis(log_id: int, minio_log_path: str, key_prefix: str = "log") -> bool:
    """
    从MinIO加载归档日志到Redis的便捷函数
    
    Args:
        log_id: 日志ID（任务ID或测试运行ID）
        minio_log_path: MinIO中的日志文件路径
        key_prefix: Redis key前缀，默认为"log"，test_run使用"test_run_log"
        
    Returns:
        bool: 是否成功加载
    """
    return redis_log_reader.load_archived_logs_to_redis(log_id, minio_log_path, key_prefix) 