#!/usr/bin/env python3
"""
公共日志服务模块

提供统一的日志获取功能，支持从MinIO和Loki获取日志。
"""

import os
import tempfile
from datetime import datetime, timezone, timedelta
from typing import List, Optional, AsyncIterator, Dict, Any
from urllib.parse import urlencode

import requests
from minio import Minio

from app.core.config import settings
from app.core.logging import logger


class LogService:
    """公共日志服务类"""
    
    def __init__(self):
        """初始化日志服务"""
        # Loki配置
        self.loki_url = f"{settings.LOKI_PROTOCOL}://{settings.LOKI_ADDRESS}/loki/api/v1/query_range"
        
        # MinIO配置
        try:
            self.minio_client = Minio(
                endpoint=settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE.lower() == 'true'
            )
            self.bucket = settings.MINIO_BUCKET
            # 确保bucket存在
            if not self.minio_client.bucket_exists(self.bucket):
                self.minio_client.make_bucket(self.bucket)
        except Exception as e:
            logger.error(f"MinIO初始化失败: {e}")
            self.minio_client = None

    def get_logs_from_minio(self, log_path: str) -> List[str]:
        """从MinIO获取归档日志
        
        Args:
            log_path: MinIO中的日志文件路径
            
        Returns:
            日志行列表
        """
        if not self.minio_client:
            logger.error("MinIO客户端未初始化")
            return []
        
        try:
            # 下载日志文件
            with tempfile.NamedTemporaryFile(mode='w+', delete=False) as temp_file:
                self.minio_client.fget_object(
                    bucket_name=self.bucket,
                    object_name=log_path,
                    file_path=temp_file.name
                )
                
                # 读取日志内容
                with open(temp_file.name, 'r', encoding='utf-8') as f:
                    log_content = f.read()
                
                # 清理临时文件
                os.unlink(temp_file.name)
                
                # 按行分割日志，过滤空行
                log_lines = [line.strip() for line in log_content.split('\n') if line.strip()]
                logger.info(f"从MinIO获取日志成功: {log_path}, 日志行数: {len(log_lines)}")
                return log_lines
                
        except Exception as e:
            logger.error(f"从MinIO获取日志失败: {e}")
            return []

    def get_logs_from_loki(self, lab_k8s_uuid: str, start_time: Optional[datetime] = None, 
                          end_time: Optional[datetime] = None, days: int = 30) -> List[str]:
        """从Loki获取实时日志"""
        try:
            # 如果没有指定时间范围，使用默认天数
            if not end_time:
                end_time = datetime.now(timezone.utc)
            if not start_time:
                start_time = end_time - timedelta(days=days)
            
            end_ns = int(end_time.timestamp() * 1e9)
            start_ns = int(start_time.timestamp() * 1e9)
            
            logger.info(f"从Loki获取日志，UUID: {lab_k8s_uuid}, 时间范围: {start_time} 到 {end_time}")
            
            all_logs = []
            current_end = end_ns
            page = 0
            max_pages = 50  # 限制最大页数
            
            # 分页获取日志
            while page < max_pages:
                page += 1
                
                # 构建查询参数
                query = f'{{deepexilab_k8s_uuid="{lab_k8s_uuid}"}}'
                params = {
                    "query": query,
                    "start": str(start_ns),
                    "end": str(current_end),
                    "limit": 1000,
                    "direction": "backward"
                }
                
                # 请求Loki
                response = requests.get(self.loki_url, params=params, timeout=30)
                response.raise_for_status()
                data = response.json()
                
                # 解析日志
                page_logs = []
                oldest_ts = None
                streams = data.get("data", {}).get("result", [])
                
                for stream in streams:
                    for ts_str, log_line in stream.get("values", []):
                        ts_int = int(ts_str)
                        page_logs.append({
                            "timestamp": ts_int,
                            "formatted": log_line.strip()
                        })
                        
                        if oldest_ts is None or ts_int < oldest_ts:
                            oldest_ts = ts_int
                
                if not page_logs:
                    break
                
                all_logs.extend(page_logs)
                
                # 更新下一页的结束时间
                if oldest_ts and oldest_ts < current_end:
                    current_end = oldest_ts - 1
                else:
                    break
            
            if not all_logs:
                logger.warning(f"未获取到任何日志，UUID: {lab_k8s_uuid}")
                return []
            
            # 按时间戳排序
            all_logs.sort(key=lambda x: x["timestamp"])
            
            # 返回日志行
            return [log["formatted"] for log in all_logs]
            
        except Exception as e:
            logger.error(f"从Loki获取日志失败，UUID: {lab_k8s_uuid}, 错误: {e}")
            return []

    async def stream_tail_ws_messages_from_loki(
        self,
        query: str,
        start_ns: Optional[int] = None,
        limit: int = 100,
    ) -> AsyncIterator[str]:
        """
        通过 Loki /loki/api/v1/tail 的 WebSocket 实时拉取日志。

        返回每一条 websocket message（通常是 JSON 字符串，形如 {"streams":[...]}）。
        """
        # 延迟导入，避免在不需要 WS 的场景下引入额外依赖错误
        import websockets

        base_url = f"{settings.LOKI_PROTOCOL}://{settings.LOKI_ADDRESS}"
        ws_base = base_url.replace("https://", "wss://").replace("http://", "ws://")
        params: Dict[str, Any] = {"query": query, "limit": str(limit)}
        if start_ns is not None:
            params["start"] = str(start_ns)
        ws_url = f"{ws_base}/loki/api/v1/tail?{urlencode(params)}"

        async with websockets.connect(
            ws_url,
            ping_interval=20,
            ping_timeout=20,
            close_timeout=2,
        ) as ws:
            async for msg in ws:
                if isinstance(msg, bytes):
                    yield msg.decode("utf-8", errors="replace")
                else:
                    yield msg


    def upload_logs_to_minio(self, logs: List[str], lab_k8s_uuid: str) -> str:
        """上传日志到MinIO
        
        Args:
            logs: 日志行列表
            lab_k8s_uuid: K8S UUID
            
        Returns:
            MinIO中的日志文件路径，失败返回空字符串
        """
        if not self.minio_client or not logs:
            return ""
        
        try:
            # 生成文件路径
            log_path = f"logs/{lab_k8s_uuid}.log"
            
            # 将日志列表转换为字符串，每行以换行符分隔
            log_content = '\n'.join(logs)
            
            # 创建临时文件
            with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False, encoding='utf-8') as temp_file:
                temp_file.write(log_content)
                temp_file_path = temp_file.name
            
            try:
                # 上传到MinIO
                self.minio_client.fput_object(
                    bucket_name=self.bucket,
                    object_name=log_path,
                    file_path=temp_file_path,
                    content_type='text/plain'
                )
                
                logger.info(f"成功上传日志到MinIO: {log_path}, 日志行数: {len(logs)}")
                return log_path
                
            finally:
                # 清理临时文件
                try:
                    os.unlink(temp_file_path)
                except:
                    pass
                    
        except Exception as e:
            logger.error(f"上传日志到MinIO失败，UUID: {lab_k8s_uuid}, 错误: {e}")
            return ""


# 创建全局日志服务实例
log_service = LogService()
