"""
Celery配置文件（旧版，建议使用 app/tasks/celery_app.py）
"""

from celery import Celery
from app.core.config import settings


def _get_broker_transport_options():
    """获取 Broker 传输选项（支持 Sentinel）"""
    base_options = {
        'max_retries': 3,
        'interval_start': 0,
        'interval_step': 0.2,
        'interval_max': 0.2,
        'socket_keepalive': True,
        'socket_timeout': 10.0,
        'connect_timeout': 10.0,
    }
    
    # 如果启用 Sentinel，添加 Sentinel 配置
    if settings.REDIS_SENTINEL and settings.REDIS_SENTINEL == 'enable':
        # kombu 通过 sentinel:// URL 格式自动识别 Sentinel 地址
        # 需要配置 master_name 和 sentinel_kwargs（Sentinel 密码，可选）
        # 注意：Redis 主节点密码在 URL 中传递（sentinel://:password@host:port）
        sentinel_options = {
            'master_name': settings.REDIS_MASTER_NAME,
        }
        
        # Sentinel 连接参数
        sentinel_kwargs = {
            'socket_timeout': 10.0,
            'socket_connect_timeout': 10.0,
        }
        
        # 如果 Sentinel 需要密码，添加到 sentinel_kwargs
        # 注意：如果 Sentinel 不需要密码，不要传递 password，否则会报错
        # 只有当明确设置了非空密码时才传递
        if settings.REDIS_SENTINEL_PASSWORD and settings.REDIS_SENTINEL_PASSWORD.strip():
            sentinel_kwargs['password'] = settings.REDIS_SENTINEL_PASSWORD
        
        sentinel_options['sentinel_kwargs'] = sentinel_kwargs
        
        # 注意：Redis 主节点密码在 URL 中传递（sentinel://:password@host:port），不需要在这里传递
        
        base_options.update(sentinel_options)
    
    return base_options


def _get_result_backend_transport_options():
    """获取 Result Backend 传输选项（支持 Sentinel）"""
    base_options = {
        'socket_keepalive': True,
        'socket_connect_timeout': 10,
        'socket_timeout': 10,
        'retry_on_timeout': True,
    }
    
    # 如果启用 Sentinel，添加 Sentinel 配置
    if settings.REDIS_SENTINEL and settings.REDIS_SENTINEL == 'enable':
        # kombu 通过 sentinel:// URL 格式自动识别 Sentinel 地址
        # 需要配置 master_name 和 sentinel_kwargs（Sentinel 密码，可选）
        # 注意：Redis 主节点密码在 URL 中传递（sentinel://:password@host:port）
        sentinel_options = {
            'master_name': settings.REDIS_MASTER_NAME,
        }
        
        # Sentinel 连接参数
        sentinel_kwargs = {
            'socket_timeout': 10.0,
            'socket_connect_timeout': 10.0,
        }
        
        # 如果 Sentinel 需要密码，添加到 sentinel_kwargs
        # 注意：如果 Sentinel 不需要密码，不要传递 password，否则会报错
        # 只有当明确设置了非空密码时才传递
        if settings.REDIS_SENTINEL_PASSWORD and settings.REDIS_SENTINEL_PASSWORD.strip():
            sentinel_kwargs['password'] = settings.REDIS_SENTINEL_PASSWORD
        
        sentinel_options['sentinel_kwargs'] = sentinel_kwargs
        
        # 注意：Redis 主节点密码在 URL 中传递（sentinel://:password@host:port），不需要在这里传递
        
        base_options.update(sentinel_options)
    
    return base_options


# 创建Celery实例
celery_app = Celery(
    'training_tasks',
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=['app.tasks.training_tasks']
)

# Celery配置
celery_app.conf.update(
    # 任务序列化格式
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Asia/Shanghai',
    enable_utc=True,
    
    # 任务路由
    task_routes={
        'app.tasks.training_tasks.*': {'queue': 'training_queue'},
    },
    
    # 任务执行配置
    task_acks_late=True,  # 任务执行完成后才确认
    worker_prefetch_multiplier=1,  # 每个worker一次只取一个任务
    
    # 结果配置
    result_expires=3600,  # 结果过期时间（秒）
    
    # 重试配置
    task_retry_delay=60,  # 重试延迟（秒）
    task_max_retries=3,   # 最大重试次数
    
    # 监控配置
    worker_send_task_events=True,
    task_send_sent_event=True,
    
    # 连接配置（支持 Sentinel）
    broker_transport_options=_get_broker_transport_options(),
    result_backend_transport_options=_get_result_backend_transport_options(),
) 