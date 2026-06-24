from typing import List, Optional

from sqlalchemy import select, delete

from app.core.logging import logger
from app.models.models import (
    BusinessAttrOption,
    BusinessAttrValue,
    BusinessAttrValueOption,
    JwtUserInfo,
)
from app.repository.base_mapper import BaseMapper
from app.schemas.business_attr_value import BusinessAttrValueInput, BusinessAttrValueUpdateInput


class BusinessAttrValueHelper:
    """
    封装 BusinessAttrValue、BusinessAttrValueOption 表的新增、修改、查询、删除。
    不依赖 ORM 关联，供在线推理服务、数据集等业务复用。
    """

    def __init__(self, mapper: BaseMapper) -> None:
        self.mapper = mapper

    async def create_attr_values(
        self,
        reference_id: int,
        attr_values: List[BusinessAttrValueInput],
        created_id: Optional[int],
        created_by: Optional[str],
        tenant_id: str,
    ) -> List[BusinessAttrValue]:
        """
        批量新增属性值及选项。
        调用方需在 reference 主表 insert + flush 之后调用，以保证 reference_id 有效；
        本方法内会按需 flush，不会 commit。

        :param reference_id: 关联业务数据 id（如推理服务 id）
        :param attr_values: 属性值输入列表（来自请求体）
        :param created_id: 创建人 id
        :param created_by: 创建人名称
        :param tenant_id: 租户 id
        :return: 创建的 BusinessAttrValue 列表，每条带 .options（BusinessAttrValueOption 列表）
        """
        if not attr_values:
            return []
        created: List[BusinessAttrValue] = []
        for attr_input in attr_values:
            attr_instance = BusinessAttrValue(
                **attr_input.model_dump(exclude={"options", "reference_id"}),
                reference_id=reference_id,
                created_id=created_id,
                created_by=created_by,
                tenant_id=tenant_id,
            )
            await self.mapper.insert(attr_instance)
            await self.mapper.flush()
            opts: List[BusinessAttrValueOption] = []
            if attr_input.options:
                for opt in attr_input.options:
                    opt_instance = BusinessAttrValueOption(
                        **opt.model_dump(),
                        reference_id=reference_id,
                        attr_value_id=attr_instance.id,
                        business_type=attr_instance.business_type,
                        created_id=created_id,
                        created_by=created_by,
                        tenant_id=tenant_id,
                    )
                    await self.mapper.insert(opt_instance)
                    opts.append(opt_instance)
            attr_instance.options = opts
            created.append(attr_instance)
        await self.mapper.flush()
        return created

    async def query_attr_values_with_options(
        self, reference_id: int, business_type: str
    ) -> List[BusinessAttrValue]:
        """
        按 reference_id + business_type 查询属性值列表，并为每条挂载 options（BusinessAttrValueOption）。
        不包含 commit/flush，由调用方管理事务。

        :param reference_id: 关联业务数据 id
        :param business_type: 业务类型，与 reference_id 组合保证数据唯一
        :return: BusinessAttrValue 列表，每条带 .options 列表（可能为空）
        """
        attr_query = (
            select(BusinessAttrValue).where(
                BusinessAttrValue.reference_id == reference_id,
                BusinessAttrValue.business_type == business_type,
            )
        )
        attr_values = await self.mapper.query(attr_query)
        if not attr_values:
            return attr_values
        attr_value_ids = [av.id for av in attr_values]
        option_query = (
            select(BusinessAttrValueOption).where(
                BusinessAttrValueOption.attr_value_id.in_(attr_value_ids)
            )
        )
        options_list = await self.mapper.query(option_query)
        options_by_attr_value_id: dict[int, list] = {}
        for opt in options_list:
            options_by_attr_value_id.setdefault(opt.attr_value_id, []).append(opt)
        for av in attr_values:
            av.options = options_by_attr_value_id.get(av.id, [])
        return attr_values

    async def attach_attr_options(
        self, attr_values: List[BusinessAttrValue]
    ) -> None:
        """
        为属性值列表挂载 attr_options（来自 BusinessAttrOption，属性定义的可选列表，供前端下拉等）。
        原地修改 attr_values 中每条记录的 .attr_options。

        :param attr_values: 已查询的 BusinessAttrValue 列表（需含 attr_id）
        """
        if not attr_values:
            return
        attr_ids = list({av.attr_id for av in attr_values if av.attr_id is not None})
        if not attr_ids:
            for av in attr_values:
                av.attr_options = []
            return
        attr_option_query = (
            select(BusinessAttrOption)
            .where(BusinessAttrOption.attr_id.in_(attr_ids))
            .order_by(BusinessAttrOption.option_order.asc())
        )
        attr_options_list = await self.mapper.query(attr_option_query)
        options_by_attr: dict[int, list] = {}
        for opt in attr_options_list:
            options_by_attr.setdefault(opt.attr_id, []).append(opt)
        for av in attr_values:
            av.attr_options = options_by_attr.get(av.attr_id, [])

    async def update_attr_values(
        self,
        attr_values: List[BusinessAttrValueUpdateInput],
        created_id: Optional[int],
        created_by: Optional[str],
        tenant_id: str,
        reference_id: Optional[int] = None,
        business_type: Optional[str] = None,
    ) -> List[BusinessAttrValue]:
        """
        按 reference_id + business_type 查询旧属性值，再按 id 直接定位并部分更新。
        若 options 有传入则先删该属性值下所有选项再插入新选项。
        若旧属性值 id 不在本次传入列表中，则删除该属性值及其选项。
        返回更新后的属性值列表；不包含 commit，由调用方管理事务。

        :param attr_values: 属性值更新输入列表（含 id 定位记录）
        :param created_id: 创建人 id
        :param created_by: 创建人名称
        :param tenant_id: 租户 id
        :param reference_id: 业务对象 id
        :param business_type: 业务类型
        """
        if not attr_values:
            if reference_id is not None and business_type:
                await self.delete_by_reference_ids([reference_id], business_type)
            return []

        ids = [av.id for av in attr_values]
        if reference_id is not None and business_type:
            existing_values = await self.mapper.query(
                select(BusinessAttrValue).where(
                    BusinessAttrValue.reference_id == reference_id,
                    BusinessAttrValue.business_type == business_type,
                )
            )
            deleted_ids = [item.id for item in existing_values if item.id not in ids]
            if deleted_ids:
                await self.mapper.delete_condition(
                    delete(BusinessAttrValueOption).where(
                        BusinessAttrValueOption.attr_value_id.in_(deleted_ids)
                    )
                )
                await self.mapper.delete_condition(
                    delete(BusinessAttrValue).where(
                        BusinessAttrValue.id.in_(deleted_ids)
                    )
                )
            existing_by_id = {item.id: item for item in existing_values}
        else:
            existing_values = await self.mapper.query(
                select(BusinessAttrValue).where(BusinessAttrValue.id.in_(ids))
            )
            existing_by_id = {item.id: item for item in existing_values}

        updated_values: List[BusinessAttrValue] = []
        for attr_input in attr_values:
            instance_value = existing_by_id.get(attr_input.id)
            if instance_value is None:
                continue
            update_data = attr_input.model_dump(
                exclude_unset=True,
                exclude={"id", "options"},
            )
            for key, value in update_data.items():
                if hasattr(instance_value, key):
                    setattr(instance_value, key, value)
            instance_value.tenant_id = tenant_id
            instance_value.created_id = created_id
            instance_value.created_by = created_by
            if attr_input.options is not None:
                new_options = []
                await self.mapper.delete_condition(
                    delete(BusinessAttrValueOption).where(
                        BusinessAttrValueOption.attr_value_id == instance_value.id
                    )
                )
                for opt in attr_input.options:
                    opt_instance = BusinessAttrValueOption(
                        **opt.model_dump(),
                        reference_id=instance_value.reference_id,
                        attr_value_id=instance_value.id,
                        business_type=instance_value.business_type,
                        created_id=created_id,
                        created_by=created_by,
                        tenant_id=tenant_id,
                    )
                    await self.mapper.insert(opt_instance)
                    new_options.append(opt_instance)
                instance_value.options = new_options
            updated_values.append(instance_value)
        return updated_values

    async def delete_by_reference_ids(
        self, reference_ids: List[int], business_type: str
    ) -> None:
        """
        按 reference_id + business_type 批量删除属性值及选项（先删 option 再删 value）。
        不包含 commit，由调用方管理事务。
        BusinessAttrValueOption 表已有 business_type，可直接按 reference_id + business_type 删除。
        """
        if not reference_ids:
            return
        d_options = delete(BusinessAttrValueOption).where(
            BusinessAttrValueOption.reference_id.in_(reference_ids),
            BusinessAttrValueOption.business_type == business_type,
        )
        d_values = delete(BusinessAttrValue).where(
            BusinessAttrValue.reference_id.in_(reference_ids),
            BusinessAttrValue.business_type == business_type,
        )
        await self.mapper.delete_condition(d_options)
        await self.mapper.delete_condition(d_values)

    async def copy_attr_values_between_references(
        self,
        source_reference_id: int,
        source_business_type: str,
        target_reference_id: int,
        target_business_type: str,
        current_user: JwtUserInfo,
    ) -> List[BusinessAttrValue]:
        """
        按 reference_id + business_type 读取源端关联属性与选项，复制到目标 reference + business_type。
        基于已查到的 ORM 行新建记录（不含源 id），与 create_attr_values 写入规则一致。
        """
        source_attrs = await self.query_attr_values_with_options(
            reference_id=source_reference_id,
            business_type=source_business_type,
        )
        if not source_attrs:
            return []
        created_attrs: List[BusinessAttrValue] = []
        for av in source_attrs:
            try:
                new_av = BusinessAttrValue(
                    reference_id=target_reference_id,
                    attr_id=av.attr_id,
                    name=av.name,
                    data_type=av.data_type,
                    attr_value=av.attr_value,
                    input_type=av.input_type,
                    value_order=av.value_order,
                    required_tag=av.required_tag,
                    multi_select=av.multi_select,
                    business_type=target_business_type,
                    group=av.group,
                    created_id=current_user.userId,
                    created_by=current_user.username,
                    tenant_id=current_user.tenantId,
                )
                await self.mapper.insert(new_av)
                await self.mapper.flush()
                new_options = []
                for o in getattr(av, "options", None) or []:
                    new_opt = BusinessAttrValueOption(
                        reference_id=target_reference_id,
                        attr_value_id=new_av.id,
                        option_value=o.option_value,
                        option_order=o.option_order,
                        business_type=target_business_type,
                        created_id=current_user.userId,
                        created_by=current_user.username,
                        tenant_id=current_user.tenantId,
                    )
                    await self.mapper.insert(new_opt)
                    new_options.append(new_opt)
                new_av.options = new_options
                created_attrs.append(new_av)
                await self.mapper.flush()
            except Exception as e:
                logger.warning(
                    "跳过复制关联属性: attr_id=%s, error=%s",
                    getattr(av, "attr_id", None),
                    e,
                )
        await self.mapper.flush()
        return created_attrs

    async def replace_attr_values_between_references(
        self,
        source_reference_id: int,
        source_business_type: str,
        target_reference_id: int,
        target_business_type: str,
        current_user: JwtUserInfo,
    ) -> List[BusinessAttrValue]:
        """
        用源 reference 的属性值整组替换目标 reference 的属性值。
        先删除目标端已有属性值及选项，再复制源端属性值及选项。
        """
        await self.delete_by_reference_ids([target_reference_id], target_business_type)
        return await self.copy_attr_values_between_references(
            source_reference_id=source_reference_id,
            source_business_type=source_business_type,
            target_reference_id=target_reference_id,
            target_business_type=target_business_type,
            current_user=current_user,
        )
