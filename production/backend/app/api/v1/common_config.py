from typing import Optional

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query, Path
from fastapi_pagination import Page

from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.common_config import (
    CommonConfigResponse
)
from app.services.common_config.interface import CommonConfigService
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/v1/common-config", tags=["common-config"])


@router.get("", response_model=Page[CommonConfigResponse])
@inject
async def list_configs(
    key: Optional[str] = Query(None, description="配置键（支持模糊搜索）"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(10, ge=1, le=100, description="每页数量"),
    current_user: JwtUserInfo = Depends(get_current_user),
    common_config_service: CommonConfigService = Depends(Provide[AutoContainer.common_config_service])
) -> Page[CommonConfigResponse]:
    """获取通用配置列表
    
    ## 功能说明
    获取通用配置列表，支持按配置键模糊搜索，支持分页。
    
    ## 参数说明
    - `key`: 配置键（可选），支持模糊搜索
    - `page`: 页码，从1开始
    - `size`: 每页数量，范围1-100
    """
    return await common_config_service.list_configs(key, page, size)


@router.get("/key/{key}", response_model=CommonConfigResponse)
@inject
async def get_config_by_key(
    key: str = Path(..., description="配置键"),
    current_user: JwtUserInfo = Depends(get_current_user),
    common_config_service: CommonConfigService = Depends(Provide[AutoContainer.common_config_service])
) -> CommonConfigResponse:
    """根据键获取通用配置
    
    ## 功能说明
    根据配置键获取通用配置的详细信息。
    """
    config = await common_config_service.get_config_by_key(key)
    if not config:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=404,
            detail=f"配置不存在: {key}"
        )
    return config

