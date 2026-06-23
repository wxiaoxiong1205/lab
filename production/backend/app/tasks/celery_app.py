"""
Celery应用配置
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
        'socket_keepalive_options': {
            'TCP_KEEPIDLE': 10,
            'TCP_KEEPINTVL': 10,
            'TCP_KEEPCNT': 10,
        },
        'socket_connect_timeout': 10,
        'socket_timeout': 10,
        'retry_on_timeout': True,
        'connection_pool_kwargs': {
            'max_connections': 50,
            'retry_on_timeout': True,
        }
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


# 构建 broker 和 backend URL
broker_url = settings.REDIS_URL
backend_url = settings.REDIS_URL

# 创建Celery应用实例
celery_app = Celery(
    'deepexi_lab',
    broker=broker_url,
    backend=backend_url,
    # 明确指定包含的任务模块
    include=[
        'app.tasks.training_tasks',  # 训练任务模块
        'app.tasks.inference_result_tasks',  # 推理结果数据集任务模块
        'app.tasks.business_inference_result_tasks',  # 业务推理结果数据集任务模块
        'app.tasks.evaluation_tasks',  # 评估任务模块
        'app.tasks.benchmark_tasks',  # 基准评估任务模块
        'app.tasks.data_cleaning_tasks',  # 数据清洗任务模块
        'app.tasks.example_notebook_tasks',  # Notebook 发布案例任务模块
        'app.tasks.ml_deploy_dev_notebook_tasks',  # ML 部署在线开发 Notebook 工作区初始化
        'app.tasks.dataset_processing_tasks',  # 数据集文件处理任务模块
        'app.tasks.model_storage_tasks',  # 模型存储复制任务模块
        'app.tasks.inference_deploy_tasks',  # 推理服务 K8s 异步部署
        'app.tasks.label_tasks',  # 标注数据集复制模块
        'app.tasks.machine_learning_dataset_export_tasks',  # 机器学习数据集导出缓存任务
        # 注意：已禁用的模块已移除
        # 'app.tasks.answer_generation',
        # 'app.tasks.test_run_evaluation',
    ]
)

# Celery配置
celery_app.conf.update(
    # 时区配置
    timezone=settings.CELERY_TIMEZONE,
    # 任务序列化配置
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',

    # 任务路由配置
    task_routes={
        'app.tasks.*': {'queue': 'default'},
    },

    # ========== 任务取消和控制相关配置 ==========
    # 启用任务取消功能
    task_reject_on_worker_lost=True,
    # 允许任务被远程控制
    worker_enable_remote_control=True,
    # 连接丢失时取消长时间运行的任务（解决 Celery 5.1 警告）
    worker_cancel_long_running_tasks_on_connection_loss=True,

    # ========== Worker行为配置 ==========
    # Worker预取任务数量，设置为1避免任务在worker内存中堆积
    worker_prefetch_multiplier=1,
    # 启用任务确认延迟，只有任务完成才确认
    #task_acks_late=True,

    # ========== 监控和日志配置 ==========
    # 启用任务事件监控
    worker_send_task_events=True,
    task_send_sent_event=True,
    # 任务结果过期时间（秒）
    result_expires=86400,  # 24小时

    # ========== 连接和重试配置 ==========
    # Broker连接重试
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_connection_max_retries=5,

    # ========== 连接稳定性配置 ==========
    # Broker心跳检测（秒）- 防止连接被意外关闭
    broker_heartbeat=10,
    # 连接池限制
    broker_pool_limit=10,
    # 连接超时配置
    broker_transport_options=_get_broker_transport_options(),

    # Redis 后端连接配置
    result_backend_transport_options=_get_result_backend_transport_options(),
)

# 手动导入任务模块确保注册
# 注意：已禁用的模块不再导入，避免循环导入问题
# from app.tasks import answer_generation, test_run_evaluation
try:
    from app.tasks import training_tasks
    from app.tasks import inference_result_tasks
    from app.tasks import evaluation_tasks
    from app.tasks import benchmark_tasks
    from app.tasks import dataset_processing_tasks
    from app.tasks import inference_deploy_tasks
    from app.tasks import machine_learning_dataset_export_tasks
except ImportError as e:
    # 如果导入失败，记录但不阻止应用启动
    print(f"警告：无法导入任务模块: {e}")