import json
import re
import shlex
from typing import Iterable, Optional

from fastapi import HTTPException
from fastapi_pagination import Page
from sqlalchemy import func, select
import yaml
from pydantic import ValidationError

from app.core.logging import logger
from app.models.advanced_template_manager import (
    AdvancedTemplate,
    AdvancedTemplateField,
    AdvancedTemplateTaskReference,
)
from app.models.models import JwtUserInfo
from app.schemas.advanced_template import (
    AdvancedTemplateCreate,
    AdvancedTemplateFieldCreate,
    AdvancedTemplateFieldGroupResponse,
    AdvancedTemplateFieldReorderRequest,
    AdvancedTemplateFieldResponse,
    AdvancedTemplateFieldUpdate,
    AdvancedTemplateResponse,
    AdvancedTemplateUpdate,
    AdvancedTemplateYamlCreate,
    AdvancedTemplateYamlToJsonRequest,
    AdvancedTemplateYamlToJsonResponse,
    AdvancedTemplateParsedFieldGroupResponse,
    AdvancedTemplateParsedFieldResponse,
    AdvancedTemplateYamlUpdate,
)
from app.services.advanced_template.interface import AdvancedTemplateService


class DefaultAdvancedTemplateService(AdvancedTemplateService):
    async def list_templates(
        self,
        domain: Optional[str] = None,
        template_type: Optional[str] = None,
        status: Optional[str] = None,
        name: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
    ) -> Page[AdvancedTemplateResponse]:
        query = select(AdvancedTemplate).where(AdvancedTemplate.is_current == True)

        if domain:
            query = query.where(AdvancedTemplate.domain == domain)
        if template_type:
            query = query.where(AdvancedTemplate.template_type == template_type)
        if status:
            query = query.where(AdvancedTemplate.status == status)
        if name:
            query = query.where(AdvancedTemplate.name.ilike(f"%{name}%"))

        query = query.order_by(AdvancedTemplate.updated_at.desc())
        page_result = await self.mapper.query_page(query, page, size)

        items = []
        for template in page_result.items:
            items.append(await self._to_template_response(template))

        return Page[AdvancedTemplateResponse](
            items=items,
            total=page_result.total,
            page=page_result.page,
            size=page_result.size,
            pages=page_result.pages,
        )

    async def create_template(
        self,
        payload: AdvancedTemplateCreate,
        current_user: JwtUserInfo,
    ) -> AdvancedTemplateResponse:
        try:
            await self._ensure_template_name_available(
                name=payload.name,
                domain=payload.domain,
                template_type=payload.template_type,
            )
            self._validate_fields(payload.fields)
            if payload.status == "enabled" and not any(field.enabled for field in payload.fields):
                raise HTTPException(status_code=400, detail="启用模板至少需要一个启用字段")

            template = AdvancedTemplate(
                name=payload.name,
                description=payload.description,
                domain=payload.domain,
                template_type=payload.template_type,
                status=payload.status,
                visibility=payload.visibility,
                yaml_content=getattr(payload, "yaml_content", None),
                version=1,
                is_current=True,
                created_id=current_user.userId,
                created_by=current_user.username,
            )
            await self.mapper.insert(template)
            await self.mapper.flush()
            template.root_template_id = template.id

            for field_payload in payload.fields:
                field = self._build_field(template.id, field_payload, current_user)
                await self.mapper.insert(field)

            await self.mapper.flush()
            await self.mapper.commit()
            await self.mapper.refresh(template)
            return await self._to_template_response(template)
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as exc:
            await self.mapper.rollback()
            logger.error(f"创建高级模板失败: {exc}")
            raise HTTPException(status_code=500, detail=f"创建高级模板失败: {exc}")

    async def create_template_from_yaml(
        self,
        payload: AdvancedTemplateYamlCreate,
        current_user: JwtUserInfo,
    ) -> AdvancedTemplateResponse:
        fields = self._parse_yaml_fields(payload.yaml_content)
        create_payload = AdvancedTemplateCreate(
            name=payload.name,
            description=payload.description,
            domain=payload.domain,
            template_type=payload.template_type,
            status=payload.status,
            visibility=payload.visibility,
            yaml_content=payload.yaml_content,
            fields=fields,
        )
        return await self.create_template(create_payload, current_user)

    async def yaml_to_json(
        self,
        payload: AdvancedTemplateYamlToJsonRequest,
    ) -> AdvancedTemplateYamlToJsonResponse:
        fields = self._parse_yaml_fields(payload.yaml_content)
        return AdvancedTemplateYamlToJsonResponse(
            yaml_content=payload.yaml_content,
            fields=self._group_parsed_fields_by_category(fields),
        )

    async def get_template(self, template_id: int) -> AdvancedTemplateResponse:
        template = await self._get_template_model(template_id)
        return await self._to_template_response(template)

    async def copy_template(
        self,
        template_id: int,
        current_user: JwtUserInfo,
    ) -> AdvancedTemplateResponse:
        try:
            template = await self._get_template_model(template_id)
            copy_name = f"{template.name} 副本"
            await self._ensure_template_name_available(
                name=copy_name,
                domain=template.domain,
                template_type=template.template_type,
            )

            copied_template = AdvancedTemplate(
                name=copy_name,
                description=template.description,
                domain=template.domain,
                template_type=template.template_type,
                status=template.status,
                visibility=template.visibility,
                yaml_content=template.yaml_content,
                version=1,
                is_current=True,
                created_id=current_user.userId,
                created_by=current_user.username,
            )
            await self.mapper.insert(copied_template)
            await self.mapper.flush()
            copied_template.root_template_id = copied_template.id

            field_data = await self._get_field_data(template.id)
            self._validate_field_data(field_data)
            for item in field_data:
                copied_field = self._build_field_from_data(
                    copied_template.id,
                    {
                        **item,
                        "created_id": current_user.userId,
                        "created_by": current_user.username,
                    },
                )
                await self.mapper.insert(copied_field)

            await self.mapper.flush()
            await self.mapper.commit()
            await self.mapper.refresh(copied_template)
            return await self._to_template_response(copied_template)
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as exc:
            await self.mapper.rollback()
            logger.error(f"复制高级模板失败: {exc}")
            raise HTTPException(status_code=500, detail=f"复制高级模板失败: {exc}")

    async def delete_template(self, template_id: int) -> None:
        try:
            template = await self._get_template_model(template_id)
            root_template_id = self._get_root_template_id(template)
            versions = await self.mapper.query(
                select(AdvancedTemplate).where(AdvancedTemplate.root_template_id == root_template_id)
            )
            if not versions:
                versions = [template]
            version_ids = [item.id for item in versions]

            reference_count = await self.mapper.query_one(
                select(func.count(AdvancedTemplateTaskReference.id)).where(
                    AdvancedTemplateTaskReference.template_id.in_(version_ids)
                )
            )
            if reference_count:
                raise HTTPException(status_code=400, detail="模板已被任务引用，不能删除")

            for version in versions:
                fields = await self._get_fields(version.id)
                for field in fields:
                    await self.mapper.delete(field)

            await self.mapper.flush()

            for version in versions:
                await self.mapper.delete(version)

            await self.mapper.commit()
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as exc:
            await self.mapper.rollback()
            logger.error(f"删除高级模板失败: {exc}")
            raise HTTPException(status_code=500, detail=f"删除高级模板失败: {exc}")

    async def update_template(
        self,
        template_id: int,
        payload: AdvancedTemplateUpdate,
    ) -> AdvancedTemplateResponse:
        try:
            template = await self._get_template_model(template_id)

            new_name = payload.name if payload.name is not None else template.name
            new_domain = payload.domain if payload.domain is not None else template.domain
            new_template_type = payload.template_type if payload.template_type is not None else template.template_type
            root_template_id = self._get_root_template_id(template)
            if (
                new_name != template.name
                or new_domain != template.domain
                or new_template_type != template.template_type
            ):
                await self._ensure_template_name_available(
                    name=new_name,
                    domain=new_domain,
                    template_type=new_template_type,
                    exclude_root_template_id=root_template_id,
                )

            update_data = payload.model_dump(exclude_unset=True)
            if update_data.get("status") == "enabled":
                fields = await self._get_fields(template_id)
                if not any(field.enabled for field in fields):
                    raise HTTPException(status_code=400, detail="启用模板至少需要一个启用字段")

            new_template, _ = await self._create_next_template_version(
                template,
                template_updates=update_data,
            )
            await self.mapper.commit()
            await self.mapper.refresh(new_template)
            return await self._to_template_response(new_template)
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as exc:
            await self.mapper.rollback()
            logger.error(f"更新高级模板失败: {exc}")
            raise HTTPException(status_code=500, detail=f"更新高级模板失败: {exc}")

    async def update_template_from_yaml(
        self,
        template_id: int,
        payload: AdvancedTemplateYamlUpdate,
        current_user: JwtUserInfo,
    ) -> AdvancedTemplateResponse:
        try:
            template = await self._get_template_model(template_id)
            fields = self._parse_yaml_fields(payload.yaml_content)

            new_name = payload.name if payload.name is not None else template.name
            new_domain = payload.domain if payload.domain is not None else template.domain
            new_template_type = payload.template_type if payload.template_type is not None else template.template_type
            root_template_id = self._get_root_template_id(template)
            if (
                new_name != template.name
                or new_domain != template.domain
                or new_template_type != template.template_type
            ):
                await self._ensure_template_name_available(
                    name=new_name,
                    domain=new_domain,
                    template_type=new_template_type,
                    exclude_root_template_id=root_template_id,
                )

            update_data = payload.model_dump(exclude={"yaml_content", "disable_missing_fields"}, exclude_unset=True)
            update_data["yaml_content"] = payload.yaml_content

            new_status = update_data.get("status", template.status)
            field_data = await self._merge_yaml_field_data(template_id, fields, current_user, payload.disable_missing_fields)
            if new_status == "enabled" and not any(field.get("enabled") for field in field_data):
                raise HTTPException(status_code=400, detail="启用模板至少需要一个启用字段")

            new_template, _ = await self._create_next_template_version(
                template,
                current_user=current_user,
                template_updates=update_data,
                field_data=field_data,
            )
            await self.mapper.commit()
            await self.mapper.refresh(new_template)
            return await self._to_template_response(new_template)
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as exc:
            await self.mapper.rollback()
            logger.error(f"通过 YAML 更新高级模板失败: {exc}")
            raise HTTPException(status_code=500, detail=f"通过 YAML 更新高级模板失败: {exc}")

    async def create_field(
        self,
        template_id: int,
        payload: AdvancedTemplateFieldCreate,
        current_user: JwtUserInfo,
    ) -> AdvancedTemplateFieldResponse:
        try:
            template = await self._get_template_model(template_id)
            self._validate_default_value(payload.field_type, payload.default_value, payload.enum_options)
            await self._ensure_field_name_available(template_id, payload.field_name)

            field_data = await self._get_field_data(template_id)
            field_data.append(self._field_payload_to_data(payload, current_user, return_marker=True))
            new_template, new_field = await self._create_next_template_version(
                template,
                current_user=current_user,
                field_data=field_data,
            )
            await self.mapper.commit()
            await self.mapper.refresh(new_template)
            await self.mapper.refresh(new_field)
            return AdvancedTemplateFieldResponse.model_validate(new_field)
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as exc:
            await self.mapper.rollback()
            logger.error(f"创建模板字段失败: {exc}")
            raise HTTPException(status_code=500, detail=f"创建模板字段失败: {exc}")

    async def update_field(
        self,
        template_id: int,
        field_id: int,
        payload: AdvancedTemplateFieldUpdate,
    ) -> AdvancedTemplateFieldResponse:
        try:
            template = await self._get_template_model(template_id)
            field = await self._get_field_model(template_id, field_id)

            new_field_name = payload.field_name if payload.field_name is not None else field.field_name
            if new_field_name != field.field_name:
                await self._ensure_field_name_available(template_id, new_field_name, exclude_id=field_id)

            new_field_type = payload.field_type if payload.field_type is not None else field.field_type
            new_default_value = payload.default_value if "default_value" in payload.model_fields_set else field.default_value
            new_enum_options = payload.enum_options if "enum_options" in payload.model_fields_set else field.enum_options
            self._validate_default_value(new_field_type, new_default_value, new_enum_options)

            update_data = payload.model_dump(exclude_unset=True)
            field_data = await self._get_field_data(template_id)
            for item in field_data:
                if item.get("_source_id") == field_id:
                    item.update(update_data)
                    item["_return_marker"] = True

            new_template, new_field = await self._create_next_template_version(
                template,
                field_data=field_data,
            )
            await self.mapper.commit()
            await self.mapper.refresh(new_template)
            await self.mapper.refresh(new_field)
            return AdvancedTemplateFieldResponse.model_validate(new_field)
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as exc:
            await self.mapper.rollback()
            logger.error(f"更新模板字段失败: {exc}")
            raise HTTPException(status_code=500, detail=f"更新模板字段失败: {exc}")

    async def reorder_fields(
        self,
        template_id: int,
        payload: AdvancedTemplateFieldReorderRequest,
    ) -> AdvancedTemplateResponse:
        try:
            template = await self._get_template_model(template_id)
            fields = await self._get_fields(template_id)
            field_by_id = {field.id: field for field in fields}

            missing_ids = [item.field_id for item in payload.items if item.field_id not in field_by_id]
            if missing_ids:
                raise HTTPException(status_code=404, detail=f"模板字段不存在: {missing_ids}")

            sort_order_by_id = {item.field_id: item.sort_order for item in payload.items}
            field_data = await self._get_field_data(template_id)
            for item in field_data:
                source_id = item.get("_source_id")
                if source_id in sort_order_by_id:
                    item["sort_order"] = sort_order_by_id[source_id]

            new_template, _ = await self._create_next_template_version(
                template,
                field_data=field_data,
            )
            await self.mapper.commit()
            await self.mapper.refresh(new_template)
            return await self._to_template_response(new_template)
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as exc:
            await self.mapper.rollback()
            logger.error(f"调整模板字段排序失败: {exc}")
            raise HTTPException(status_code=500, detail=f"调整模板字段排序失败: {exc}")

    async def enable_template(self, template_id: int) -> AdvancedTemplateResponse:
        return await self._set_template_status(template_id, "enabled")

    async def disable_template(self, template_id: int) -> AdvancedTemplateResponse:
        return await self._set_template_status(template_id, "disabled")

    async def _set_template_status(self, template_id: int, status: str) -> AdvancedTemplateResponse:
        try:
            template = await self._get_template_model(template_id)
            if status == "enabled":
                fields = await self._get_fields(template_id)
                if not any(field.enabled for field in fields):
                    raise HTTPException(status_code=400, detail="启用模板至少需要一个启用字段")
            new_template, _ = await self._create_next_template_version(
                template,
                template_updates={"status": status},
            )
            await self.mapper.commit()
            await self.mapper.refresh(new_template)
            return await self._to_template_response(new_template)
        except HTTPException:
            await self.mapper.rollback()
            raise
        except Exception as exc:
            await self.mapper.rollback()
            logger.error(f"更新模板状态失败: {exc}")
            raise HTTPException(status_code=500, detail=f"更新模板状态失败: {exc}")

    async def _create_next_template_version(
        self,
        template: AdvancedTemplate,
        current_user: Optional[JwtUserInfo] = None,
        *,
        template_updates: Optional[dict] = None,
        field_data: Optional[list[dict]] = None,
    ) -> tuple[AdvancedTemplate, Optional[AdvancedTemplateField]]:
        root_template_id = self._get_root_template_id(template)
        next_version = await self._next_version_no(root_template_id)
        current_templates = await self.mapper.query(
            select(AdvancedTemplate).where(AdvancedTemplate.root_template_id == root_template_id)
        )
        for current_template in current_templates:
            current_template.is_current = False

        update_data = template_updates or {}
        new_template = AdvancedTemplate(
            name=update_data.get("name", template.name),
            description=update_data.get("description", template.description),
            domain=update_data.get("domain", template.domain),
            template_type=update_data.get("template_type", template.template_type),
            status=update_data.get("status", template.status),
            visibility=update_data.get("visibility", template.visibility),
            yaml_content=update_data.get("yaml_content", template.yaml_content),
            root_template_id=root_template_id,
            version=next_version,
            is_current=True,
            created_id=getattr(current_user, "userId", None) or template.created_id,
            created_by=getattr(current_user, "username", None) or template.created_by,
        )
        await self.mapper.insert(new_template)
        await self.mapper.flush()

        if field_data is None:
            field_data = await self._get_field_data(template.id)
        self._validate_field_data(field_data)

        return_field = None
        for item in field_data:
            new_field = self._build_field_from_data(new_template.id, item)
            await self.mapper.insert(new_field)
            if item.get("_return_marker"):
                return_field = new_field

        await self.mapper.flush()
        return new_template, return_field

    def _get_root_template_id(self, template: AdvancedTemplate) -> int:
        return template.root_template_id or template.id

    async def _next_version_no(self, root_template_id: int) -> int:
        max_version = await self.mapper.query_one(
            select(func.max(AdvancedTemplate.version)).where(AdvancedTemplate.root_template_id == root_template_id)
        )
        return (max_version or 0) + 1

    async def _get_template_model(self, template_id: int) -> AdvancedTemplate:
        template = await self.mapper.query_one(
            select(AdvancedTemplate).where(AdvancedTemplate.id == template_id)
        )
        if not template:
            raise HTTPException(status_code=404, detail="高级模板不存在")
        return template

    async def _get_field_model(self, template_id: int, field_id: int) -> AdvancedTemplateField:
        field = await self.mapper.query_one(
            select(AdvancedTemplateField).where(
                AdvancedTemplateField.id == field_id,
                AdvancedTemplateField.template_id == template_id,
            )
        )
        if not field:
            raise HTTPException(status_code=404, detail="模板字段不存在")
        return field

    async def _get_fields(self, template_id: int) -> list[AdvancedTemplateField]:
        return await self.mapper.query(
            select(AdvancedTemplateField)
            .where(AdvancedTemplateField.template_id == template_id)
            .order_by(AdvancedTemplateField.sort_order.asc(), AdvancedTemplateField.id.asc())
        )

    async def _get_field_data(self, template_id: int) -> list[dict]:
        return [self._field_model_to_data(field) for field in await self._get_fields(template_id)]

    def _field_model_to_data(self, field: AdvancedTemplateField) -> dict:
        return {
            "_source_id": field.id,
            "field_name": field.field_name,
            "category": field.category,
            "description": field.description,
            "field_type": field.field_type,
            "enum_options": field.enum_options,
            "default_value": field.default_value,
            "sort_order": field.sort_order,
            "required": field.required,
            "enabled": field.enabled,
            "created_id": field.created_id,
            "created_by": field.created_by,
        }

    def _field_payload_to_data(
        self,
        payload: AdvancedTemplateFieldCreate,
        current_user: JwtUserInfo,
        *,
        return_marker: bool = False,
    ) -> dict:
        self._validate_default_value(payload.field_type, payload.default_value, payload.enum_options)
        return {
            "field_name": payload.field_name,
            "category": payload.category,
            "description": payload.description,
            "field_type": payload.field_type,
            "enum_options": payload.enum_options if payload.field_type == "enum" else None,
            "default_value": payload.default_value,
            "sort_order": payload.sort_order,
            "required": payload.required,
            "enabled": payload.enabled,
            "created_id": current_user.userId,
            "created_by": current_user.username,
            "_return_marker": return_marker,
        }

    def _build_field_from_data(self, template_id: int, item: dict) -> AdvancedTemplateField:
        return AdvancedTemplateField(
            template_id=template_id,
            field_name=item["field_name"],
            category=item.get("category"),
            description=item.get("description"),
            field_type=item["field_type"],
            enum_options=item.get("enum_options") if item["field_type"] == "enum" else None,
            default_value=item.get("default_value"),
            sort_order=item.get("sort_order", 0),
            required=item.get("required", False),
            enabled=item.get("enabled", True),
            created_id=item.get("created_id"),
            created_by=item.get("created_by"),
        )

    def _validate_field_data(self, fields: Iterable[dict]) -> None:
        seen = set()
        for field in fields:
            field_name = field["field_name"]
            if field_name in seen:
                raise HTTPException(status_code=400, detail=f"字段名重复: {field_name}")
            seen.add(field_name)
            self._validate_default_value(field["field_type"], field.get("default_value"), field.get("enum_options"))

    async def _merge_yaml_field_data(
        self,
        template_id: int,
        fields: list[AdvancedTemplateFieldCreate],
        current_user: JwtUserInfo,
        disable_missing_fields: bool,
    ) -> list[dict]:
        self._validate_fields(fields)
        existing_field_data = await self._get_field_data(template_id)
        existing_by_name = {field["field_name"]: field for field in existing_field_data}
        incoming_names = {field.field_name for field in fields}

        for field_payload in fields:
            incoming = self._field_payload_to_data(field_payload, current_user)
            existing = existing_by_name.get(field_payload.field_name)
            if existing:
                existing.update(
                    {
                        "category": incoming["category"],
                        "description": incoming["description"],
                        "field_type": incoming["field_type"],
                        "enum_options": incoming["enum_options"],
                        "default_value": incoming["default_value"],
                        "sort_order": incoming["sort_order"],
                        "required": incoming["required"],
                        "enabled": incoming["enabled"],
                    }
                )
            else:
                existing_field_data.append(incoming)

        if disable_missing_fields:
            for field in existing_field_data:
                if field["field_name"] not in incoming_names:
                    field["enabled"] = False

        return existing_field_data

    async def _to_template_response(self, template: AdvancedTemplate) -> AdvancedTemplateResponse:
        fields = await self._get_fields(template.id)
        response = AdvancedTemplateResponse.model_validate(template)
        response.fields = self._group_fields_by_category(fields)
        return response

    def _group_fields_by_category(
        self,
        fields: Iterable[AdvancedTemplateField],
    ) -> list[AdvancedTemplateFieldGroupResponse]:
        groups: dict[Optional[str], list[AdvancedTemplateFieldResponse]] = {}
        for field in fields:
            field_response = AdvancedTemplateFieldResponse.model_validate(field)
            category = field_response.category or None
            groups.setdefault(category, []).append(field_response)
        return [
            AdvancedTemplateFieldGroupResponse(category=category, fields=group_fields)
            for category, group_fields in groups.items()
        ]

    def _group_parsed_fields_by_category(
        self,
        fields: Iterable[AdvancedTemplateFieldCreate],
    ) -> list[AdvancedTemplateParsedFieldGroupResponse]:
        groups: dict[Optional[str], list[AdvancedTemplateParsedFieldResponse]] = {}
        for field in fields:
            field_response = AdvancedTemplateParsedFieldResponse.model_validate(field.model_dump())
            category = field_response.category or None
            groups.setdefault(category, []).append(field_response)
        return [
            AdvancedTemplateParsedFieldGroupResponse(category=category, fields=group_fields)
            for category, group_fields in groups.items()
        ]

    async def _ensure_template_name_available(
        self,
        name: str,
        domain: str,
        template_type: str,
        exclude_root_template_id: Optional[int] = None,
    ) -> None:
        query = select(AdvancedTemplate).where(
            AdvancedTemplate.name == name,
            AdvancedTemplate.domain == domain,
            AdvancedTemplate.template_type == template_type,
            AdvancedTemplate.is_current == True,
        )
        if exclude_root_template_id is not None:
            query = query.where(AdvancedTemplate.root_template_id != exclude_root_template_id)

        existing = await self.mapper.query_one(query)
        if existing:
            raise HTTPException(status_code=400, detail="同领域同类型下已存在同名模板")

    async def _ensure_field_name_available(
        self,
        template_id: int,
        field_name: str,
        exclude_id: Optional[int] = None,
    ) -> None:
        query = select(AdvancedTemplateField).where(
            AdvancedTemplateField.template_id == template_id,
            AdvancedTemplateField.field_name == field_name,
        )
        if exclude_id is not None:
            query = query.where(AdvancedTemplateField.id != exclude_id)

        existing = await self.mapper.query_one(query)
        if existing:
            raise HTTPException(status_code=400, detail="模板下已存在同名字段")

    def _build_field(
        self,
        template_id: int,
        payload: AdvancedTemplateFieldCreate,
        current_user: JwtUserInfo,
    ) -> AdvancedTemplateField:
        self._validate_default_value(payload.field_type, payload.default_value, payload.enum_options)
        return AdvancedTemplateField(
            template_id=template_id,
            field_name=payload.field_name,
            category=payload.category,
            description=payload.description,
            field_type=payload.field_type,
            enum_options=payload.enum_options if payload.field_type == "enum" else None,
            default_value=payload.default_value,
            sort_order=payload.sort_order,
            required=payload.required,
            enabled=payload.enabled,
            created_id=current_user.userId,
            created_by=current_user.username,
        )

    def _validate_fields(self, fields: Iterable[AdvancedTemplateFieldCreate]) -> None:
        seen = set()
        for field in fields:
            if field.field_name in seen:
                raise HTTPException(status_code=400, detail=f"字段名重复: {field.field_name}")
            seen.add(field.field_name)
            self._validate_default_value(field.field_type, field.default_value, field.enum_options)

    async def _sync_fields_from_yaml(
        self,
        template_id: int,
        fields: list[AdvancedTemplateFieldCreate],
        current_user: JwtUserInfo,
        disable_missing_fields: bool,
    ) -> None:
        self._validate_fields(fields)
        existing_fields = await self._get_fields(template_id)
        existing_by_name = {field.field_name: field for field in existing_fields}
        incoming_names = {field.field_name for field in fields}

        for field_payload in fields:
            existing = existing_by_name.get(field_payload.field_name)
            if existing:
                existing.category = field_payload.category
                existing.description = field_payload.description
                existing.field_type = field_payload.field_type
                existing.enum_options = field_payload.enum_options if field_payload.field_type == "enum" else None
                existing.default_value = field_payload.default_value
                existing.sort_order = field_payload.sort_order
                existing.required = field_payload.required
                existing.enabled = field_payload.enabled
            else:
                await self.mapper.insert(self._build_field(template_id, field_payload, current_user))

        if disable_missing_fields:
            for field in existing_fields:
                if field.field_name not in incoming_names:
                    field.enabled = False

    def _parse_yaml_fields(self, yaml_content: str) -> list[AdvancedTemplateFieldCreate]:
        try:
            yaml.safe_load(yaml_content) or {}
        except yaml.YAMLError as exc:
            raise HTTPException(status_code=400, detail=f"YAML 格式错误: {exc}")

        fields: list[AdvancedTemplateFieldCreate] = []
        pending_comments: list[str] = []
        stack: list[tuple[int, str]] = []
        sort_order = 10

        for raw_line in yaml_content.splitlines():
            line = raw_line.rstrip()
            stripped = line.strip()

            if not stripped:
                pending_comments = []
                continue
            if stripped.startswith("#"):
                pending_comments.append(stripped[1:].strip())
                continue
            if stripped.startswith("-"):
                pending_comments = []
                continue

            parsed_line = self._parse_yaml_key_line(line)
            if not parsed_line:
                pending_comments = []
                continue

            indent, key, raw_value, inline_comment = parsed_line
            while stack and stack[-1][0] >= indent:
                stack.pop()

            path_parts = [item[1] for item in stack] + [key]
            field_name = ".".join(path_parts)
            comments = list(pending_comments)
            if inline_comment:
                comments.append(inline_comment.strip())
            pending_comments = []

            if raw_value == "":
                stack.append((indent, key))
                continue

            metadata = self._parse_template_comment_metadata(comments)
            default_value = metadata.get("default")
            if default_value is None:
                default_value = self._yaml_value_to_default(raw_value)

            field_type = metadata.get("field_type") or self._infer_field_type(default_value)
            description = metadata.get("description") or self._build_description_from_comments(comments)
            category = metadata.get("category") or field_name.split(".", 1)[0]

            try:
                field = AdvancedTemplateFieldCreate(
                    field_name=field_name,
                    category=category,
                    description=description,
                    field_type=field_type,
                    enum_options=metadata.get("enum_options"),
                    default_value=default_value,
                    sort_order=int(metadata.get("sort_order") or sort_order),
                    required=self._parse_bool_metadata(metadata.get("required"), False),
                    enabled=self._parse_bool_metadata(metadata.get("enabled"), True),
                )
            except (ValueError, ValidationError) as exc:
                raise HTTPException(status_code=400, detail=f"模板注释参数错误: {exc}")
            fields.append(field)
            sort_order += 10

        if not fields:
            raise HTTPException(status_code=400, detail="YAML 中未解析到可生成模板字段的标量参数")

        self._validate_fields(fields)
        return fields

    def _parse_yaml_key_line(self, line: str) -> Optional[tuple[int, str, str, Optional[str]]]:
        match = re.match(r"^(\s*)([^:#\s][^:#]*?)\s*:\s*(.*)$", line)
        if not match:
            return None

        indent = len(match.group(1).replace("\t", "    "))
        key = match.group(2).strip().strip("\"'")
        value_with_comment = match.group(3).strip()
        raw_value, inline_comment = self._split_inline_comment(value_with_comment)
        return indent, key, raw_value.strip(), inline_comment

    def _split_inline_comment(self, value: str) -> tuple[str, Optional[str]]:
        in_single_quote = False
        in_double_quote = False
        for index, char in enumerate(value):
            if char == "'" and not in_double_quote:
                in_single_quote = not in_single_quote
            elif char == '"' and not in_single_quote:
                in_double_quote = not in_double_quote
            elif char == "#" and not in_single_quote and not in_double_quote:
                return value[:index], value[index + 1 :]
        return value, None

    def _parse_template_comment_metadata(self, comments: list[str]) -> dict[str, object]:
        metadata: dict[str, object] = {}
        for comment in comments:
            if "@template" not in comment:
                continue
            template_comment = comment.split("@template", 1)[1].strip()
            try:
                tokens = shlex.split(template_comment)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=f"模板注释格式错误: {exc}")
            plain_description = []
            for token in tokens:
                if "=" not in token:
                    plain_description.append(token)
                    continue
                key, value = token.split("=", 1)
                normalized_key = key.strip().lower()
                if normalized_key in {"type", "field_type"}:
                    metadata["field_type"] = value
                elif normalized_key in {"desc", "description"}:
                    metadata["description"] = value
                elif normalized_key in {"order", "sort_order"}:
                    metadata["sort_order"] = value
                elif normalized_key == "enum_options":
                    metadata["enum_options"] = self._parse_enum_options_metadata(value)
                elif normalized_key in {"default", "required", "enabled", "category"}:
                    metadata[normalized_key] = value
            if plain_description and "description" not in metadata:
                metadata["description"] = " ".join(plain_description)
        return metadata

    def _parse_enum_options_metadata(self, value: str) -> list[str]:
        try:
            parsed = yaml.safe_load(value)
        except yaml.YAMLError:
            parsed = value
        if isinstance(parsed, list):
            items = parsed
        else:
            items = str(parsed).split(",")
        options: list[str] = []
        for item in items:
            option = str(item).strip().strip("\"'")
            if option and option not in options:
                options.append(option)
        return options

    def _build_description_from_comments(self, comments: list[str]) -> Optional[str]:
        description_lines = [comment for comment in comments if "@template" not in comment]
        if not description_lines:
            return None
        return " ".join(description_lines)[:1000]

    def _yaml_value_to_default(self, raw_value: str) -> Optional[str]:
        if raw_value == "":
            return None
        try:
            value = yaml.safe_load(raw_value)
        except yaml.YAMLError:
            value = raw_value
        if value is None:
            return None
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return str(value)

    def _infer_field_type(self, default_value: Optional[str]) -> str:
        if default_value is None or default_value == "":
            return "string"
        lowered = default_value.lower()
        if lowered in {"true", "false"}:
            return "bool"
        try:
            int(default_value)
            return "int"
        except ValueError:
            pass
        try:
            float(default_value)
            return "float"
        except ValueError:
            pass
        try:
            parsed = json.loads(default_value)
            if isinstance(parsed, (dict, list)):
                return "json"
        except ValueError:
            pass
        return "string"

    def _parse_bool_metadata(self, value: Optional[str], default: bool) -> bool:
        if value is None:
            return default
        return str(value).lower() in {"true", "1", "yes", "y"}

    def _validate_default_value(
        self,
        field_type: str,
        default_value: Optional[str],
        enum_options: Optional[Iterable[str]] = None,
    ) -> None:
        normalized_enum_options = [str(option) for option in enum_options or [] if str(option).strip()]
        if field_type == "enum" and not normalized_enum_options:
            raise HTTPException(status_code=400, detail="enum 字段必须配置 enum_options")
        if default_value is None or default_value == "":
            return
        try:
            if field_type == "int":
                int(default_value)
            elif field_type == "float":
                float(default_value)
            elif field_type == "bool":
                if str(default_value).lower() not in {"true", "false", "1", "0"}:
                    raise ValueError("bool value must be true/false/1/0")
            elif field_type == "json":
                json.loads(default_value)
            elif field_type == "enum":
                if default_value not in normalized_enum_options:
                    raise ValueError(f"enum default_value must be one of {normalized_enum_options}")
            elif field_type == "string":
                return
            else:
                raise ValueError(f"unsupported field type: {field_type}")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"default_value 与 field_type 不匹配: {exc}")
