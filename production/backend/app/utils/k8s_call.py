import asyncio
from kubernetes import client, config

def get_k8s_api(config_dict, api_cls):
    """
    获取指定 API 类的实例 (CoreV1Api, AppsV1Api...)
    """
    config.load_kube_config_from_dict(config_dict)
    c = client.Configuration.get_default_copy()
    c.timeout = 5  # 请求超时，避免长时间阻塞
    c.retries = 0  # 禁止重试，避免总耗时叠加
    api_client = client.ApiClient(c)
    # 保险起见，也清掉底层 urllib3 pool 的 retries
    api_client.rest_client.pool_manager.connection_pool_kw["retries"] = 0
    return api_cls(api_client)

async def k8s_call(func, *args, **kwargs):
    # 默认超时 5 秒 (connect, read)
    timeout = (5, 5)
    kwargs.setdefault("_request_timeout", timeout)
    return await asyncio.to_thread(func, *args, **kwargs)