# app/services/inference_service/impl.py
from typing import List, Optional

import requests
import httpx
from fastapi import HTTPException
from fastapi_pagination import Page
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from starlette import status

from app.core.logging import logger
from app.models.models import InferenceService, JwtUserInfo
from app.repository.base_mapper import BaseMapper
from app.schemas.common import ModelTypeBase
from app.schemas.business_attr_value import BusinessAttrValueBusinessType
from app.schemas.inference_service import (
    InferenceServiceCreateRequest,
    InferenceServiceResponse,
    InferenceServiceUpdateRequest,
    InferenceServiceTestRequest, InferenceServiceListItemResponse, InferenceServiceDetailResponse
)
from app.schemas.workbench_page import WorkbenchPagePayload
from app.services.inference_service.interface import InferenceServiceService
from app.utils import app_runtime_context
from app.utils.error_messages import data_exists_error
from app.utils.business_attr_utils import BusinessAttrValueHelper


# from app.utils.logger import logger


class DefaultInferenceServiceService(InferenceServiceService):
    def __init__(self, mapper: BaseMapper) -> None:
        self.mapper = mapper
        self.attr_helper = BusinessAttrValueHelper(mapper)

    async def create(self, project_id, current_user: JwtUserInfo, request: InferenceServiceCreateRequest) -> bool:
        try:
            # 直接插入，捕获唯一性约束
            instance = InferenceService(
                **request.model_dump(exclude={"attr_values"}),
                created_id=current_user.userId,
                created_by=current_user.username,
                tenant_id=current_user.tenantId,
                status="未测试",
                project_id=project_id,
            )
            await self.mapper.insert(instance)
            await self.mapper.flush()

            # 插入属性值
            await self.attr_helper.create_attr_values(
                reference_id=instance.id,
                attr_values=request.attr_values or [],
                created_id=current_user.userId,
                created_by=current_user.username,
                tenant_id=current_user.tenantId,
            )
            await self.mapper.commit()
            return True

        except IntegrityError as e:
            # 回滚事务
            await self.mapper.rollback()

            # 检查是否是唯一约束冲突
            if 'uq_inference_service_project_name_tenant' in str(e.orig):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=data_exists_error(f"服务名称:{request.name}")
                )
            else:
                # 其他完整性错误
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="创建服务失败：数据完整性错误"
                )

    async def list_services(
        self,
        project_id,
        current_user: JwtUserInfo,
        page_num: int,
        page_size: int,
        name: Optional[str] = None,
        status: Optional[str] = None,
        model_type: Optional[str] = None,
    ) -> Page[InferenceServiceListItemResponse]:
        query = select(InferenceService).where(InferenceService.project_id == project_id)
        if name:
            query = query.where(InferenceService.name.ilike(f"%{name}%"))

        # 如果提供了状态筛选，添加状态条件
        if status is not None:
            query = query.where(InferenceService.status == status)

        # 如果提供了模型类型筛选，匹配数组中包含的类型
        if model_type:
            # 这里传入的model_type为value，需要映射为description
            model_type_description = ModelTypeBase.get_description_by_value(model_type)
            if model_type_description:
                # 使用映射后的 description 进行查询
                query = query.where(InferenceService.model_type.any(model_type_description))
            else:
                # 如果映射失败（无效的 value），可以选择：
                # 1. 返回空结果（不添加条件，让查询返回所有记录）
                # 这里选择返回空结果，因为无效的筛选条件不应该导致错误
                logger.warning(f"无效的模型类型值: {model_type}，返回空列表")
                query = query.where(InferenceService.id == -1)  # 永远不匹配的条件

        query = query.order_by(InferenceService.created_at.desc())
        data: Page[InferenceServiceListItemResponse] = await self.mapper.query_page(query, page_num, page_size)
        return data

    async def get_service_detail(self, project_id, current_user: JwtUserInfo, service_id: int) -> InferenceServiceDetailResponse:
        logger.info(f"获取在线推理服务模型详情: 项目->{project_id}，服务->{service_id}")
        query = select(InferenceService).where(InferenceService.project_id == project_id).where(InferenceService.id == service_id)
        instance = await self.mapper.query_one(query)

        if not instance:
            raise HTTPException(status_code=404, detail="Inference service not found")

        # 查询属性值
        attr_values = await self.attr_helper.query_attr_values_with_options(
            reference_id=service_id,
            business_type=BusinessAttrValueBusinessType.INFERENCE_SERVICE.value,
        )
        # 挂载属性选项
        await self.attr_helper.attach_attr_options(attr_values)
        instance.attr_values = attr_values

        return instance

    async def delete(self, project_id, ids: List[int]) -> None:
        if not ids:
            return None
        logger.info(f"删除服务，id列表：{ids}")
        # 删除属性值
        await self.attr_helper.delete_by_reference_ids(
            ids, business_type=BusinessAttrValueBusinessType.INFERENCE_SERVICE.value
        )
        d = delete(InferenceService).where(InferenceService.project_id == project_id).where(InferenceService.id.in_(ids))
        await self.mapper.delete_condition(d)
        await self.mapper.commit()
        return None

    async def update(self, project_id, current_user: JwtUserInfo, request: InferenceServiceUpdateRequest) -> bool:
        # 服务名称校验
        if request.name:
            is_exists = await self.exists(request.name,project_id,request.id)
            if is_exists:
                raise HTTPException(status_code=400, detail=f"项目中已存在同名服务名称：{request.name}")
        query = select(InferenceService).where(InferenceService.project_id == project_id).where(InferenceService.id == request.id)
        instance = await self.mapper.query_one(query)

        if not instance:
            raise HTTPException(status_code=404, detail="Inference service not found")

        if request.name is not None:
            instance.name = request.name
        instance.description = request.description
        if request.api_key is not None:
            instance.api_key = request.api_key
        if request.base_url is not None:
            instance.base_url = request.base_url
        if request.model_name is not None:
            instance.model_name = request.model_name
        if request.model_type is not None:
            instance.model_type = request.model_type

        instance.updated_id = current_user.userId
        instance.updated_by = current_user.username
        instance.status = "未测试"

        if request.attr_values is not None:
            await self.attr_helper.update_attr_values(
                attr_values=request.attr_values,
                created_id=current_user.userId,
                created_by=current_user.username,
                tenant_id=current_user.tenantId,
                reference_id=instance.id,
                business_type=BusinessAttrValueBusinessType.INFERENCE_SERVICE.value,
            )

        await self.mapper.commit()
        return True

    async def test_connectivity(self, project_id, current_user: JwtUserInfo, request: InferenceServiceTestRequest) -> bool:
        query = select(InferenceService).where(InferenceService.project_id == project_id).where(InferenceService.id == request.id)
        instance = await self.mapper.query_one(query)

        if not instance:
            raise HTTPException(status_code=404, detail="Inference service not found")

        # is_connected = await self.test_connection(instance.base_url, instance.api_key, instance.model_name)
        is_connected = await DefaultInferenceServiceService.conn_test(instance.base_url, instance.api_key, instance.model_name)

        status = "测试通过" if is_connected else "测试失败"
        instance.status = status
        instance.updated_id = current_user.userId
        instance.updated_by = current_user.username

        await self.mapper.commit()

        return is_connected

    @staticmethod
    async def conn_test(base_url: str, api_key: str, model_name: str) -> bool:
        """
        连通性测试
        直接使用用户提供的URL，不做额外处理

        返回格式：bool
        """
        # 检查base_url，api_key，model_name是否为空
        if not base_url or not api_key or not model_name:
            return False

        # 构造完整的请求
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        # 最小化测试载荷
        base_payload = {
            "model": model_name,
            "messages": [{"role":"user","content":"Return exactly: ok"}],
        }

        # 按兼容性顺序尝试
        candidate_payloads = [
            {
                **base_payload,
                "max_tokens": 8
            },
            {
                **base_payload,
                "max_completion_tokens": 8
            }
        ]

        # 发送测试请求
        # 总请求超时时间：10s
        # 链接超时时间：5s
        # 防止因为网络问题无限挂起
        timeout = httpx.Timeout(
            connect=5.0,
            read=120.0,
            write=30.0,
            pool=5.0
        )

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                for payload in candidate_payloads:
                    response = await client.post(base_url, json=payload, headers=headers)

                    # 任意 2xx 都认为成功
                    if 200 <= response.status_code < 300:
                        return True

                    # 特殊处理 400
                    if response.status_code == 400:
                        try:
                            error_data = response.json()
                            error_message = (
                                error_data.get("error", {})
                                .get("message", "")
                                .lower()
                            )
                        except Exception:
                            error_message = ""

                        # 参数不兼容 -> 回退参数重试
                        if (
                                "unsupported parameter" in error_message
                                or "not supported with this model" in error_message
                        ):
                            logger.info(f"参数不兼容，尝试回退: {response.text}")
                            continue

                        # token限制导致截断 -> 算成功
                        if (
                                "max_tokens" in error_message
                                and "limit was reached" in error_message
                        ):
                            logger.info("模型已成功响应，但输出被 token 限制截断")
                            return True

                        logger.info(f"请求失败: {response.text}")
                        return False

                    logger.info(
                        f"连通性测试失败: status={response.status_code}, body={response.text}"
                    )
                    return False

        # 捕获异常
        except httpx.InvalidURL:
            # 无效的链接格式
            logger.warning(f"连通性测试失败：无效的链接格式")
            return False
        except httpx.ConnectError:
            # 链接失败
            logger.warning(f"连通性测试失败：建立链接失败")
            return False
        except httpx.TimeoutException:
            # 链接超时
            logger.warning(f"连通性测试失败：链接超时未响应")
            return False
        except httpx.RequestError as e:
            # 请求失败
            logger.warning(f"连通性测试失败：{e}")
            return False
        except Exception as e:
            # 捕获所有其他异常，确保不会崩溃
            logger.warning(f"连通性测试失败：{e}")
            return False

    async def get_by_id(self, id_field_value):
        return await self.mapper.query_one(select(InferenceService).where(InferenceService.id == id_field_value))

    async def exists(
            self,
            name: str,
            project_id: int,
            id: int | None = None,
    ) -> bool:
        """True 表示已存在"""

        # 基础条件：同 project 内名称不能重复
        query = select(InferenceService.id).where(
            InferenceService.name == name,
            InferenceService.project_id == project_id
        )
        # ,
        # InferenceService.tenant_id == app_runtime_context.get_tenant_id()

        # 修改场景排除自身
        if id is not None:
            query = query.where(InferenceService.id != id)

        stmt = select(query.exists())
        is_exists = await self.mapper.execute(stmt)
        return is_exists.scalar()