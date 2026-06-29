import logging
from typing import List

from fastapi import HTTPException, status

from app.core import settings
from app.schemas.menu import MenuVoResponse, MenuItem
from app.utils import app_runtime_context
from app.utils.http_util import get_api_client
from app.utils.showcase_auth import SHOWCASE_TENANT_ID, is_showcase_preview_auth_enabled
from app.utils.showcase_menu import build_showcase_menu

logger = logging.getLogger(__name__)


async def get_menu() -> List[MenuItem]:
    client = get_api_client()
    # 获取菜单code admin 菜单名（管理员模式）
    app_id = settings.APP_ID
    try:
        res = await client.get(path=f"/v1/menu/{app_id}/appMenu")
        obj = MenuVoResponse.parse_obj(res)
    except Exception as exc:
        if is_showcase_preview_auth_enabled() and app_runtime_context.get_tenant_id() == SHOWCASE_TENANT_ID:
            return build_showcase_menu()
        raise exc
    if obj.code == 0:
        menu_list = obj.payload
        return menu_list
    else:
        if is_showcase_preview_auth_enabled() and app_runtime_context.get_tenant_id() == SHOWCASE_TENANT_ID:
            return build_showcase_menu()
        logger.error(f"调用菜单接口报错 {obj}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"调用菜单接口报错, {obj.msg}"
        )
