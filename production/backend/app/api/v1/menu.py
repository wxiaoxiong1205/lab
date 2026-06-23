from typing import Tuple, List

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import settings
from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.menu import MenuItem, MenuVoResponse
from app.services.user.interface import UserService
from app.utils.dependencies import get_db_and_user
from app.utils.http_util import get_api_client, SafeHTTPClient

router = APIRouter(
    prefix="/api/v1/menu",
    tags=["menu"],
    responses={404: {"description": "Not found"}},
)


# 通过当前用户的获取菜单
@router.get("", response_model=List[MenuItem])
@inject
async def menu_list(
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),  # 使用组合依赖
        user_service: UserService = Depends(Provide[AutoContainer.user_service]),
        client: SafeHTTPClient = Depends(get_api_client)
):
    app_id = settings.APP_ID
    res = await client.get(path=f"/v1/menu/{app_id}/appMenu")
    obj = MenuVoResponse.parse_obj(res)

    # 获取菜单的时候触发一下admin的角色的刷新
    await user_service.refresh_main()
    if obj.code == 0:
        if obj.payload is not None:
            return obj.payload
        else:
            return []
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=obj.msg
        )
