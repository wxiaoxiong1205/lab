import logging
from typing import List

from fastapi import HTTPException, status

from app.core import settings
from app.schemas.menu import MenuVoResponse, MenuItem
from app.utils.http_util import get_api_client

logger = logging.getLogger(__name__)


async def get_menu() -> List[MenuItem]:
    client = get_api_client()
    # 获取菜单code admin 菜单名（管理员模式）
    app_id = settings.APP_ID
    res = await client.get(path=f"/v1/menu/{app_id}/appMenu")
    obj = MenuVoResponse.parse_obj(res)
    if obj.code == 0:
        menu_list = obj.payload
        return menu_list
    else:
        logger.error(f"调用菜单接口报错 {obj}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"调用菜单接口报错, {obj.msg}"
        )
