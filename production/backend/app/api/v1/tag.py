"""标签管理 API"""
from typing import Tuple, Optional, List

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, status
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import JwtUserInfo
from app.schemas.tag import (
    TagClassCreate, TagClassUpdate, TagClassResponse,
    TagElementCreate, TagElementUpdate, TagElementResponse,
    TagTypeListResponse, SaveBusinessTagsRequest, SaveBusinessTagsResponse,
    BusinessTagsResponse, RepositoryBusinessTypeResp, TagBusinessType
)
from app.services.tag.interface import TagService
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/api/v1/tags", tags=["tags"])


# =============== 标签分类管理 ===============
@router.get("/classes", response_model=Page[TagClassResponse])
@inject
async def list_tag_classes(
        business_type: Optional[str] = None,
        name: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> Page[TagClassResponse]:
    """获取标签分类列表"""
    db, current_user = deps
    return await tag_service.list_tag_classes(business_type, name, page, size)


@router.post("/classes", response_model=TagClassResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_tag_class(
        tag_class_create: TagClassCreate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> TagClassResponse:
    """创建标签分类"""
    db, current_user = deps
    return await tag_service.create_tag_class(tag_class_create, current_user)


@router.get("/classes/{tag_class_id}", response_model=TagClassResponse)
@inject
async def get_tag_class(
        tag_class_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> TagClassResponse:
    """获取标签分类详情"""
    db, current_user = deps
    return await tag_service.get_tag_class(tag_class_id)


@router.put("/classes/{tag_class_id}", response_model=TagClassResponse)
@inject
async def update_tag_class(
        tag_class_id: int,
        tag_class_update: TagClassUpdate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> TagClassResponse:
    """更新标签分类"""
    db, current_user = deps
    return await tag_service.update_tag_class(tag_class_id, tag_class_update)


@router.delete("/classes/{tag_class_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_tag_class(
        tag_class_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> None:
    """删除标签分类"""
    db, current_user = deps
    return await tag_service.delete_tag_class(tag_class_id)


# =============== 标签元素管理 ===============
@router.get("/elements", response_model=Page[TagElementResponse])
@inject
async def list_tag_elements(
        class_id: Optional[int] = None,
        name: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> Page[TagElementResponse]:
    """获取标签元素列表"""
    db, current_user = deps
    return await tag_service.list_tag_elements(class_id, name, page, size)


@router.post("/elements", response_model=TagElementResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_tag_element(
        tag_element_create: TagElementCreate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> TagElementResponse:
    """创建标签元素"""
    db, current_user = deps
    return await tag_service.create_tag_element(tag_element_create, current_user)


@router.get("/elements/{tag_element_id}", response_model=TagElementResponse)
@inject
async def get_tag_element(
        tag_element_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> TagElementResponse:
    """获取标签元素详情"""
    db, current_user = deps
    return await tag_service.get_tag_element(tag_element_id)


@router.put("/elements/{tag_element_id}", response_model=TagElementResponse)
@inject
async def update_tag_element(
        tag_element_id: int,
        tag_element_update: TagElementUpdate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> TagElementResponse:
    """更新标签元素"""
    db, current_user = deps
    return await tag_service.update_tag_element(tag_element_id, tag_element_update)


@router.delete("/elements/{tag_element_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_tag_element(
        tag_element_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> None:
    """删除标签元素"""
    db, current_user = deps
    return await tag_service.delete_tag_element(tag_element_id)


# =============== 标签类型返回接口（按分类分组） ===============
@router.get("/types/{business_type}", response_model=TagTypeListResponse)
@inject
async def get_tag_types(
        business_type: str,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> TagTypeListResponse:
    """
    获取标签类型列表（按分类分组返回）
    
    用于前端展示标签选择器，返回格式：
    {
        "data": [
            {
                "tag_class_id": 1,
                "tag_class_name": "框架版本",
                "elements": [
                    {"tag_element_id": 1, "tag_element_name": "Pytorch 2.x"},
                    {"tag_element_id": 2, "tag_element_name": "Pytorch 1.x"}
                ]
            }
        ]
    }
    """
    db, current_user = deps
    return await tag_service.get_tag_types(business_type)


# =============== 业务对象标签管理 ===============
@router.post("/business/{business_type}/{business_id}", response_model=SaveBusinessTagsResponse)
@inject
async def save_business_tags(
        business_type: str,
        business_id: str,
        request: SaveBusinessTagsRequest,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> SaveBusinessTagsResponse:
    """
    保存业务对象的标签（覆盖式修改）
    
    请求示例：
    {
        "tag_element_ids": [1, 7]
    }
    """
    db, current_user = deps
    return await tag_service.save_business_tags(business_type, business_id, request, current_user)


@router.get("/business/{business_type}/{business_id}", response_model=BusinessTagsResponse)
@inject
async def get_business_tags(
        business_type: str,
        business_id: str,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        tag_service: TagService = Depends(Provide[AutoContainer.tag_service])
) -> BusinessTagsResponse:
    """
    获取业务对象的标签列表
    
    返回格式：
    {
        "business_type": "IMAGE",
        "business_id": "123",
        "tags": [
            {
                "tag_class_id": 1,
                "tag_class_name": "框架版本",
                "tag_element_id": 1,
                "tag_element_name": "Pytorch 2.x"
            }
        ]
    }
    """
    db, current_user = deps
    return await tag_service.get_business_tags(business_type, business_id)

@router.get("/enums/type-list", response_model=List[RepositoryBusinessTypeResp])
async def get_type_list() -> List[RepositoryBusinessTypeResp]:
    """返回标签业务类型枚举（值+中文描述）"""
    return [
        RepositoryBusinessTypeResp(label=item.desc, value=item.value)
        for item in TagBusinessType
    ]