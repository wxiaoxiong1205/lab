from typing import Optional

import httpx
from fastapi import HTTPException
from fastapi_pagination import Page
from app.schemas.machine_learning_dataset import (
    MachineLearningDatasetAnnotationType,
    MachineLearningDatasetDataType,
    MachineLearningDatasetTemplateType,
    machine_learning_enum_display_name,
)
from app.schemas.online_annotation_service import (
    OnlineAnnotationAiProxyRequest,
    OnlineAnnotationServiceCreateRequest,
    OnlineAnnotationServiceResponse,
    OnlineAnnotationServiceStatus,
    OnlineAnnotationServiceTestRequest,
    OnlineAnnotationServiceUpdateRequest,
)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from starlette import status
from starlette.responses import Response
from app.core.logging import logger
from app.models.models import JwtUserInfo, AnnotationServiceModel
from app.repository.base_mapper import BaseMapper
from app.utils.error_messages import data_exists_error, data_not_found_error_by_name
from app.services.online_annotation_service.interface import OnlineAnnotationService


class DefaultOnlineAnnotationService(OnlineAnnotationService):

    def __init__(self, mapper: BaseMapper) -> None:
        self.mapper = mapper

    @staticmethod
    def build_service_type(instance: AnnotationServiceModel) -> Optional[str]:
        service_type_parts = [
            machine_learning_enum_display_name(
                instance.data_type, MachineLearningDatasetDataType
            ),
            machine_learning_enum_display_name(
                instance.annotation_type, MachineLearningDatasetAnnotationType
            ),
            machine_learning_enum_display_name(
                instance.template_type, MachineLearningDatasetTemplateType
            ),
        ]
        parts = [item for item in service_type_parts if item]
        return "-".join(parts) if parts else None
    
    async def validate_name_exists(self, project_id: int, name: str, service_id: int | None = None) -> None:
        query = select(AnnotationServiceModel.id).where(
            AnnotationServiceModel.project_id == project_id,
            AnnotationServiceModel.name == name
        )
        if service_id is not None:
            query = query.where(AnnotationServiceModel.id != service_id)
        existing_id = await self.mapper.query_one(query)
        if existing_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=data_exists_error(name)
            )

    async def create(self, project_id: int, current_user: JwtUserInfo, request: OnlineAnnotationServiceCreateRequest) -> bool:
        await self.validate_name_exists(project_id, request.name)
        try:
            instance = AnnotationServiceModel(
                **request.model_dump(),
                project_id=project_id,
                created_id=current_user.userId,
                created_by=current_user.username,
                tenant_id=current_user.tenantId,
            )
            await self.mapper.insert(instance)
            await self.mapper.commit()
            return True

        except IntegrityError as e:
            # 回滚事务
            await self.mapper.rollback()
            # 其他完整性错误
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="创建在线标注服务失败：数据完整性错误",
            )

    async def delete(self, project_id: int, service_id: int) -> None:
        instance = await self.mapper.query_one(
            select(AnnotationServiceModel).where(
                AnnotationServiceModel.project_id == project_id,
                AnnotationServiceModel.id == service_id,
            )
        )
        if not instance:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=data_not_found_error_by_name("在线标注服务"),
            )
        await self.mapper.delete(instance)
        await self.mapper.commit()

    async def update(self, project_id: int, current_user: JwtUserInfo, request: OnlineAnnotationServiceUpdateRequest) -> bool:
        if request.name:
            await self.validate_name_exists(project_id, request.name, request.id)

        instance = await self.mapper.query_one(
            select(AnnotationServiceModel).where(
                AnnotationServiceModel.project_id == project_id,
                AnnotationServiceModel.id == request.id,
            )
        )
        if not instance:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=data_not_found_error_by_name("在线标注服务"),
            )

        if request.name is not None:
            instance.name = request.name
        if request.description is not None:
            instance.description = request.description
        if request.base_url is not None:
            instance.base_url = request.base_url
        if request.category is not None:
            instance.category = request.category
        if request.data_type is not None:
            instance.data_type = request.data_type
        if request.annotation_type is not None:
            instance.annotation_type = request.annotation_type
        if request.template_type is not None:
            instance.template_type = request.template_type

        instance.status = OnlineAnnotationServiceStatus.UNTESTED.value
        instance.updated_id = current_user.userId
        instance.updated_by = current_user.username

        await self.mapper.commit()
        return True

    async def list_services(
        self,
        project_id: int,
        current_user: JwtUserInfo,
        page_num: int,
        page_size: int,
        name: Optional[str] = None,
        status: Optional[OnlineAnnotationServiceStatus] = None,
        template_type: Optional[MachineLearningDatasetTemplateType] = None,
    ) -> Page[OnlineAnnotationServiceResponse]:
        query = select(AnnotationServiceModel).where(
            AnnotationServiceModel.project_id == project_id
        )
        if name is not None:
            query = query.where(AnnotationServiceModel.name.like(f"%{name}%"))
        if status is not None:
            query = query.where(AnnotationServiceModel.status == status.value)
        if template_type is not None:
            query = query.where(AnnotationServiceModel.template_type == template_type.value)
        query = query.order_by(AnnotationServiceModel.created_at.desc())
        data = await self.mapper.query_page(query, page_num, page_size)
        items = [
            OnlineAnnotationServiceResponse(
                id=item.id,
                name=item.name,
                description=item.description,
                base_url=item.base_url,
                category=item.category,
                service_type=self.build_service_type(item),
                data_type=item.data_type,
                annotation_type=item.annotation_type,
                template_type=item.template_type,
                status=item.status,
                created_by=item.created_by,
                created_at=item.created_at,
            )
            for item in data.items
        ]
        return Page(
            items=items,
            total=data.total,
            page=data.page,
            size=data.size,
            pages=data.pages,
        )

    async def get_detail(
        self,
        project_id: int,
        service_id: int,
        current_user: JwtUserInfo,
    ) -> OnlineAnnotationServiceResponse:
        _ = current_user
        instance = await self.mapper.query_one(
            select(AnnotationServiceModel).where(
                AnnotationServiceModel.project_id == project_id,
                AnnotationServiceModel.id == service_id,
            )
        )
        if not instance:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=data_not_found_error_by_name("在线标注服务"),
            )
        return OnlineAnnotationServiceResponse(
            id=instance.id,
            name=instance.name,
            description=instance.description,
            base_url=instance.base_url,
            category=instance.category,
            service_type=self.build_service_type(instance),
            data_type=instance.data_type,
            annotation_type=instance.annotation_type,
            template_type=instance.template_type,
            status=instance.status,
            created_by=instance.created_by,
            created_at=instance.created_at,
        )

    @staticmethod
    async def annotation_service_health_get(url: str) -> bool:
        """GET 给定地址，响应 JSON 中 status 为 UP 视为连通。"""
        if not url:
            return False
        timeout = httpx.Timeout(10.0, connect=5.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(url)
                if response.status_code != 200:
                    logger.warning(f"连通性测试失败：HTTP {response.status_code} {response.text}")
                    return False
                try:
                    data = response.json()
                except Exception:
                    logger.warning("连通性测试失败：响应非 JSON")
                    return False
                return data.get("status") == "UP"
        except httpx.InvalidURL:
            logger.warning("连通性测试失败：无效的链接格式")
            return False
        except httpx.ConnectError:
            logger.warning("连通性测试失败：建立链接失败")
            return False
        except httpx.TimeoutException:
            logger.warning("连通性测试失败：链接超时")
            return False
        except httpx.RequestError as e:
            logger.warning(f"连通性测试失败：{e}")
            return False
        except Exception as e:
            logger.warning(f"连通性测试失败：{e}")
            return False

    async def test_connectivity(
        self,
        project_id: int,
        current_user: JwtUserInfo,
        request: OnlineAnnotationServiceTestRequest,
    ) -> bool:
        instance = await self.mapper.query_one(
            select(AnnotationServiceModel).where(
                AnnotationServiceModel.project_id == project_id,
                AnnotationServiceModel.id == request.id,
            )
        )
        if not instance:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=data_not_found_error_by_name("在线标注服务"),
            )

        health_url = instance.base_url.rstrip("/") + "/health"
        is_up = await self.annotation_service_health_get(health_url)
        instance.status = (
            OnlineAnnotationServiceStatus.SUCCESS.value
            if is_up
            else OnlineAnnotationServiceStatus.FAILED.value
        )
        instance.updated_id = current_user.userId
        instance.updated_by = current_user.username
        await self.mapper.commit()
        return is_up

    async def proxy_ai_annotation(
        self,
        project_id: int,
        current_user: JwtUserInfo,
        request: OnlineAnnotationAiProxyRequest,
    ) -> Response:
        predict_url = request.predict_base_url.rstrip("/") + "/predict"
        payload = request.model_dump(exclude={"predict_base_url"})
        timeout = httpx.Timeout(10.0, connect=5.0)
        headers = {"Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(predict_url, json=payload, headers=headers)
        except httpx.InvalidURL:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="AI 自动标注服务地址格式无效",
            )
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="AI 自动标注服务响应超时",
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="无法连接 AI 自动标注服务",
            )
        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type=response.headers.get("content-type"),
        )
