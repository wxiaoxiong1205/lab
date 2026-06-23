import uuid
from app.core import settings
from typing import Optional
from app.core.logging import logger

async def try_acquire_lock(key: str, ttl: int) -> Optional[str]:
    """尝试获取分布式锁，返回唯一 token，失败返回 None"""
    redis_client = settings.REDIS_CLIENT_SYNC
    if redis_client is None:
        raise RuntimeError("redis client is not initialized")

    token = str(uuid.uuid4())
    got = redis_client.set(name=key, value=token, nx=True, ex=ttl)
    return token if got else None


async def release_lock_if_owner(key: str, token: str) -> bool:
    """只有当 value 等于 token 时才删除锁"""
    redis_client = settings.REDIS_CLIENT_SYNC
    if redis_client is None:
        raise RuntimeError("redis client is not initialized")

    lua = """
    if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
    else
        return 0
    end
    """
    res = redis_client.eval(lua, 1, key, token)
    return res == 1

async def build_notebook_lock_del(app_name:str):
    if not app_name:
        return
    # 清理锁
    redis_client = settings.REDIS_CLIENT_SYNC
    try:
        redis_key = f"build-image:{app_name}-deployment"
        redis_client.delete(redis_key)
    except Exception as e:
        logger.error(f"Error Delete build-image:{app_name}-deployment: {e}")