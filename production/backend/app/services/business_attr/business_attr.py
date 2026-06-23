from typing import List
from fastapi import HTTPException
from app.core import settings
from app.schemas.menu import MenuItem, MenuVoResponse
from app.utils.http_util import get_api_client
from fastapi_pagination import Page
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from starlette import status
from app.core.logging import logger
from app.models.models import BusinessAttr, BusinessAttrOption, JwtUserInfo, InferenceService, BusinessAttrValue, Project, ThirdPartyApiServiceModel
from app.models.training_dataset_manager import TrainingDataset
from app.repository.base_mapper import BaseMapper
from app.schemas.business_attr import (
    BusinessAttrCreateRequest,
    BusinessAttrUpdateRequest,
    BusinessAttrResponse,
    BusinessAttrQueryParams,
    GroupedBusinessAttrItem,
    BusinessAttrOptionResponse,
)
from app.schemas.business_attr_value import (
    BusinessAttrValueBusinessType,
    get_business_type_display_name,
)
from app.utils import app_runtime_context
from app.utils.error_messages import data_exists_error
from app.services.business_attr.interface import BusinessAttrService


class DefaultBusinessAttrService(BusinessAttrService):

    def __init__(self, mapper: BaseMapper) -> None:
        self.mapper = mapper

    async def get_app_menu(self) -> List[MenuItem]:
        """获取应用菜单，调用外部菜单 API"""
        client = get_api_client()
        app_id = settings.APP_ID
        res = await client.get(path=f"/v1/menu/{app_id}/appMenu")
        obj = MenuVoResponse.parse_obj(res)
        if obj.code == 0:
            return obj.payload if obj.payload is not None else []
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=obj.msg,
        )


    async def check_name_exists(self, name: str, business_type: str) -> None:
        """检查同一 business_type 下是否已存在同名属性（不同 business_type 允许同名）"""
        existing = await self.mapper.query_first(
            select(BusinessAttr).where(
                BusinessAttr.name == name,
                BusinessAttr.business_type == business_type,
            )
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=data_exists_error(name))

    async def create(self, current_user: JwtUserInfo, request: BusinessAttrCreateRequest) -> bool:
        try:
            # 检查同一 business_type 下是否已存在同名属性
            await self.check_name_exists(request.name, request.business_type.value)

            instance = BusinessAttr(
                **request.model_dump(exclude={"options"}),
                created_id=current_user.userId,
                created_by=current_user.username,
                tenant_id=current_user.tenantId,
            )
            await self.mapper.insert(instance)
            await self.mapper.flush()  # 拿到 instance.id 后再插 options
            if request.options:
                for opt in request.options:
                    await self.mapper.insert(
                        BusinessAttrOption(
                            attr_id=instance.id,
                            business_type=instance.business_type,
                            **opt.model_dump(),
                            created_id=current_user.userId,
                            created_by=current_user.username,
                            tenant_id=current_user.tenantId,
                        )
                    )
            await self.mapper.commit()
            return True

        except IntegrityError as e:
            # 回滚事务
            await self.mapper.rollback()

            # 检查是否是唯一约束冲突
            error_text = str(e.orig)
            if "uq_business_attr_option_attr_value_business" in error_text:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="请检查选项值是否重复",
                )
            # 其他完整性错误
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="创建属性失败：数据完整性错误",
            )

    async def update(
        self,
        attr_id: int,
        current_user: JwtUserInfo,
        request: BusinessAttrUpdateRequest,
    ) -> bool:
        """更新属性"""
        attr = await self.mapper.query_by_id(
            select(BusinessAttr).where(BusinessAttr.id == attr_id)
        )
        if not attr:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="属性不存在")
        # 更新 BusinessAttr 传入的字段
        payload = request.model_dump(exclude_unset=True, exclude={"options", "business_type"})
        for k, v in payload.items():
            if hasattr(attr, k):
                setattr(attr, k, v)
        # 若传了 options 则先删后插
        if request.options is not None:
            await self.mapper.delete_condition(
                delete(BusinessAttrOption).where(BusinessAttrOption.attr_id == attr_id)
            )
            for opt in request.options:
                await self.mapper.insert(
                    BusinessAttrOption(
                        attr_id=attr_id,
                        business_type=attr.business_type,
                        **opt.model_dump(),
                        created_id=current_user.userId,
                        created_by=current_user.username,
                        tenant_id=current_user.tenantId,
                    )
                )
        await self.mapper.flush()
        await self.mapper.commit()
        return True
    
    async def list_attrs(
        self,
        page_num: int,
        page_size: int,
        query_params: BusinessAttrQueryParams | None = None,
    ) -> Page[BusinessAttrResponse]:
        query = select(BusinessAttr).order_by(BusinessAttr.created_at.desc())

        # 过滤条件
        if query_params and query_params.name:
            query = query.where(BusinessAttr.name.ilike(f"%{query_params.name}%"))
        if query_params and query_params.business_type:
            query = query.where(BusinessAttr.business_type == query_params.business_type.value)

        data: Page[BusinessAttrResponse] = await self.mapper.query_page(query, page_num, page_size)
        if not data.items:
            return data

        # 获取当前页的 attr_ids
        attr_ids = [item.id for item in data.items if item.id is not None]
        if not attr_ids:
            return data

        # 查询当前页的 options
        option_query = (
            select(BusinessAttrOption)
            .where(BusinessAttrOption.attr_id.in_(attr_ids))
            .order_by(BusinessAttrOption.option_order.asc())
        )
        options = await self.mapper.query(option_query)
        options_by_attr: dict[int, list[BusinessAttrOption]] = {}
        for option in options:
            options_by_attr.setdefault(option.attr_id, []).append(option)
        for item in data.items:
            item.options = options_by_attr.get(item.id, [])

        return data

    async def list_attrs_grouped(
        self,
        query_params: BusinessAttrQueryParams | None = None,
    ) -> List[GroupedBusinessAttrItem]:
        """按 group 字段分组返回属性列表，查询参数与 list 接口一致"""
        query = select(BusinessAttr).order_by(
            BusinessAttr.group.asc().nullslast(), BusinessAttr.attr_order.asc()
        )
        if query_params and query_params.name:
            query = query.where(BusinessAttr.name.ilike(f"%{query_params.name}%"))
        if query_params and query_params.business_type:
            query = query.where(BusinessAttr.business_type == query_params.business_type.value)

        attrs: List[BusinessAttr] = await self.mapper.query(query)
        if not attrs:
            return []

        attr_ids = [a.id for a in attrs if a.id is not None]
        option_query = (
            select(BusinessAttrOption)
            .where(BusinessAttrOption.attr_id.in_(attr_ids))
            .order_by(BusinessAttrOption.option_order.asc())
        )
        options = await self.mapper.query(option_query)
        options_by_attr: dict[int, list[BusinessAttrOption]] = {}
        for option in options:
            options_by_attr.setdefault(option.attr_id, []).append(option)

        grouped: dict[str | None, List[BusinessAttrResponse]] = {}
        for attr in attrs:
            opt_list = options_by_attr.get(attr.id or 0, [])
            opt_responses = [
                BusinessAttrOptionResponse(option_value=o.option_value, option_order=o.option_order)
                for o in opt_list
            ]
            resp = BusinessAttrResponse.model_validate(attr)
            resp.options = opt_responses
            grouped.setdefault(attr.group, []).append(resp)

        sorted_keys = sorted(grouped.keys(), key=lambda k: (k is None or k == "", k or ""))
        return [GroupedBusinessAttrItem(group=key, items=grouped[key]) for key in sorted_keys]

    async def delete(self, ids: List[int]) -> None:
        logger.info(f"删除属性，属性id列表：{ids}")

        # 先查 BusinessAttr 只取 id、business_type
        tenant_id = app_runtime_context.get_tenant_id()
        where_conditions = [BusinessAttr.id.in_(ids)]
        if tenant_id is not None:
            where_conditions.append(BusinessAttr.tenant_id == tenant_id)
        result = await self.mapper.execute(
            select(BusinessAttr.id, BusinessAttr.business_type).where(*where_conditions)
        )
        rows = result.all()
        missing_ids = sorted(set(ids) - {r.id for r in rows})
        if missing_ids:
            raise HTTPException(status_code=404, detail=f"属性不存在或已被删除: {missing_ids}")
        
        inference_service_attr_ids = [
            r.id for r in rows
            if r.business_type == BusinessAttrValueBusinessType.INFERENCE_SERVICE.value
        ]
        api_service_attr_ids = [
            r.id for r in rows
            if r.business_type == BusinessAttrValueBusinessType.API_SERVICE.value
        ]
        training_dataset_attr_ids = [
            r.id for r in rows
            if r.business_type in (
                BusinessAttrValueBusinessType.TRAINING_MANAGEMENT.value,
                BusinessAttrValueBusinessType.TEST_MANAGEMENT.value,
                BusinessAttrValueBusinessType.BUSINESS_TRAINING.value,
                BusinessAttrValueBusinessType.BUSINESS_TEST.value,
            )
        ]

        # 仅当存在 inference_service 类型属性时，检查 InferenceService 是否有使用
        if inference_service_attr_ids:
            usage_query = (
                select(
                    BusinessAttrValue.reference_id,
                    BusinessAttrValue.business_type,
                    InferenceService.name,
                    Project.name.label("project_name"),
                )
                .join(InferenceService, InferenceService.id == BusinessAttrValue.reference_id)
                .join(Project, Project.id == InferenceService.project_id)
                .where(BusinessAttrValue.attr_id.in_(inference_service_attr_ids))
                .limit(1)
            )
            used_values = await self.mapper.execute(usage_query)
            used_row = used_values.first()
            if used_row:
                business_name = get_business_type_display_name(used_row.business_type)
                raise HTTPException(
                    status_code=400,
                    detail=f"已被'{business_name}'使用，不能删除，项目：{used_row.project_name}，对应数据名称：{used_row.name}",
                )

        # 仅当存在 api_service 类型属性时，检查 ThirdPartyApiServiceModel 是否有使用
        if api_service_attr_ids:
            usage_query = (
                select(
                    BusinessAttrValue.reference_id,
                    BusinessAttrValue.business_type,
                    ThirdPartyApiServiceModel.name,
                    Project.name.label("project_name"),
                )
                .join(ThirdPartyApiServiceModel, ThirdPartyApiServiceModel.id == BusinessAttrValue.reference_id)
                .join(Project, Project.id == ThirdPartyApiServiceModel.project_id)
                .where(BusinessAttrValue.attr_id.in_(api_service_attr_ids))
                .limit(1)
            )
            used_values = await self.mapper.execute(usage_query)
            used_row = used_values.first()
            if used_row:
                business_name = get_business_type_display_name(used_row.business_type)
                raise HTTPException(
                    status_code=400,
                    detail=f"已被'{business_name}'使用，不能删除，项目：{used_row.project_name}，对应数据名称：{used_row.name}",
                )

        # 仅当存在 training_management 或 test_management 类型属性时，检查 TrainingDataset 是否有使用
        if training_dataset_attr_ids:
            usage_query = (
                select(
                    BusinessAttrValue.reference_id,
                    BusinessAttrValue.business_type,
                    TrainingDataset.name,
                    Project.name.label("project_name"),
                )
                .join(TrainingDataset, TrainingDataset.id == BusinessAttrValue.reference_id)
                .join(Project, Project.id == TrainingDataset.project_id)
                .where(BusinessAttrValue.attr_id.in_(training_dataset_attr_ids))
                .limit(1)
            )
            used_values = await self.mapper.execute(usage_query)
            used_row = used_values.first()
            if used_row:
                business_name = get_business_type_display_name(used_row.business_type)
                raise HTTPException(
                    status_code=400,
                    detail=f"已被'{business_name}'使用，不能删除，项目：{used_row.project_name}，对应数据名称：{used_row.name}",
                )

        d = delete(BusinessAttr).where(BusinessAttr.id.in_(ids))
        d_options = delete(BusinessAttrOption).where(BusinessAttrOption.attr_id.in_(ids))

        await self.mapper.delete_condition(d_options)
        await self.mapper.delete_condition(d)
        await self.mapper.commit()
