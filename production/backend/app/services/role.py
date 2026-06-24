import logging
from typing import List, Optional

from fastapi import HTTPException, status

from app.core import settings
from app.schemas.role import RoleItem
from app.schemas.role_vo_response import RoleVoResponse
from app.utils.http_util import get_api_client

logger = logging.getLogger(__name__)


async def get_roles(account_id: int) -> List[RoleItem]:
    client = get_api_client()
    res = await client.get(path=f"/v1/user/{account_id}/roleInfo")
    obj = RoleVoResponse.parse_obj(res)
    if obj.code == 0:
        if obj.payload is not None and obj.payload.roles is not None:
            return obj.payload.roles
        return []
    else:
        logger.error(f"调用菜单接口报错 {obj}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"调用菜单接口报错, {obj.msg}"
        )


async def get_admin_role(account_id: int) -> Optional[bool]:
    redis_client = settings.REDIS_CLIENT
    if redis_client is None:
        raise RuntimeError("redis client is not initialized")
    key = f"admin_role:{account_id}"
    val = await redis_client.get(key)
    if val is None:
        return None
    return bool(val) and val != "0"


async def set_admin_role(account_id: int, is_admin: bool) -> bool:
    redis_client = settings.REDIS_CLIENT
    if redis_client is None:
        raise RuntimeError("redis client is not initialized")
    key = f"admin_role:{account_id}"
    # 默认缓存一天，可按需调整
    if is_admin:
        await redis_client.set(key, 1, ex=60 * 60 * 24)
    else:
        await redis_client.set(key, 0, ex=60 * 60 * 24)
    return True
