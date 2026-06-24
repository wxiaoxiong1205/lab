"""
标注数据 Redis Streams 工具函数
"""
import json
import hashlib
from typing import Dict, Any

from app.core.logging import logger

# 常量
STREAM_NAME = "label:annotations"


def generate_idempotency_key(task_id: int, row_number: int, annotation: Dict[str, Any]) -> str:
    """
    生成幂等性 key（基于业务内容）
    
    同一个 task + row_number + annotation 组合，无论发送多少次，key 都相同
    用于消费者端判断是否已处理，防止重复写入
    """
    content = f"{task_id}:{row_number}:{json.dumps(annotation, sort_keys=True, ensure_ascii=False)}"
    return hashlib.md5(content.encode('utf-8')).hexdigest()


async def send_annotation_event(
    redis_client,
    task_id: int,
    dataset_id: int,
    row_number: int,
    annotation: Dict[str, Any],
    is_final: bool,
    user_id: int,
    username: str
) -> str:
    """
    发送单条标注事件到 Redis Streams
    
    Args:
        redis_client: Redis 异步客户端
        task_id: 任务ID
        dataset_id: 数据集ID
        row_number: 行号（从1开始）
        annotation: 标注内容
        is_final: 是否最终提交
        user_id: 用户ID
        username: 用户名
        
    Returns:
        事件ID（message ID）
    """
    idempotency_key = generate_idempotency_key(task_id, row_number, annotation)
    
    message = {
        "task_id": str(task_id),
        "dataset_id": str(dataset_id),
        "user_id": str(user_id),
        "username": username,
        "row_number": str(row_number),
        "annotation": json.dumps(annotation, ensure_ascii=False),
        "is_final": "1" if is_final else "0",
        "idempotency_key": idempotency_key
    }
    
    try:
        message_id = await redis_client.xadd(STREAM_NAME, message)
        logger.info(f"标注事件已发送: task_id={task_id}, row_number={row_number}")
        return message_id
    except Exception as e:
        logger.error(f"发送标注事件失败: {str(e)}")
        raise


async def send_batch_submit_event(
    redis_client,
    task_id: int,
    dataset_id: int,
    user_id: int,
    row_numbers: list
) -> str:
    """
    发送批量提交事件到 Redis Streams（将所有已暂存的标注标记为已提交）
    
    Args:
        redis_client: Redis 异步客户端
        task_id: 任务ID
        dataset_id: 数据集ID
        user_id: 用户ID
        row_numbers: 要提交的行号列表
        
    Returns:
        事件ID（message ID）
    """
    message = {
        "type": "batch_submit",
        "task_id": str(task_id),
        "dataset_id": str(dataset_id),
        "user_id": str(user_id),
        "row_numbers": json.dumps(row_numbers),
        "count": str(len(row_numbers))
    }
    
    try:
        message_id = await redis_client.xadd(STREAM_NAME, message)
        logger.info(f"批量提交事件已发送: task_id={task_id}, user_id={user_id}, count={len(row_numbers)}")
        return message_id
    except Exception as e:
        logger.error(f"发送批量提交事件失败: {str(e)}")
        raise

