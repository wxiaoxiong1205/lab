from typing import Any, Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.base import get_db_session as create_db_session
from app.models.advanced_template_manager import AdvancedTemplate
from app.models.models import JwtUserInfo, RepositoryResource
from app.schemas.advanced_template import AdvancedTemplateYamlCreate
from app.utils import app_runtime_context
from app.utils.db_session_context import get_db_session, set_db_session
from app.core.depend_manager import AutoContainer

from .data import get_advanced_template_seed_data


class AdvancedTemplateSeeder:
    """高级模板种子管理器。"""

    name = "advanced_templates"

    async def seed(self, session: AsyncSession | None = None) -> Dict[str, Any]:
        if session is None:
            async with create_db_session() as db_session:
                return await self.seed(db_session)

        print(f"开始初始化 {self.name} 数据...")

        seed_data = get_advanced_template_seed_data()
        if not seed_data:
            print(f"没有 {self.name} 数据需要初始化")
            return {"created": 0, "skipped": 0, "errors": 0}

        tenant_ids = await self._get_tenant_ids(session)
        if not tenant_ids:
            print("未找到镜像仓库租户，跳过高级模板初始化")
            return {"created": 0, "skipped": 0, "errors": 0}

        created = 0
        skipped = 0
        errors = 0
        error_messages: list[str] = []

        container = AutoContainer()
        for tenant_id in sorted(tenant_ids):
            previous_tenant_id = app_runtime_context.get_tenant_id()
            previous_session = get_db_session()
            app_runtime_context.set_tenant_id(tenant_id)
            set_db_session(session)
            try:

                service = container.advanced_template_service()

                for template_data in seed_data:
                    try:
                        if await self._template_exists(session, tenant_id, template_data):
                            print(
                                f"高级模板已存在，跳过: {template_data['name']} "
                                f"(租户: {tenant_id})"
                            )
                            skipped += 1
                            continue

                        payload = AdvancedTemplateYamlCreate(**template_data)
                        await service.create_template_from_yaml(
                            payload,
                            self._system_user(tenant_id),
                        )
                        created += 1
                        print(f"成功创建高级模板: {template_data['name']} (租户: {tenant_id})")
                    except Exception as exc:
                        errors += 1
                        message = (
                            f"高级模板初始化失败: {template_data.get('name')} "
                            f"(租户: {tenant_id}): {exc}"
                        )
                        print(message)
                        error_messages.append(message)
            finally:
                app_runtime_context.set_tenant_id(previous_tenant_id)
                set_db_session(previous_session)

        print(f"✅ {self.name} 初始化完成 - 创建: {created}, 跳过: {skipped}, 错误: {errors}")
        result: Dict[str, Any] = {"created": created, "skipped": skipped, "errors": errors}
        if error_messages:
            result["error_messages"] = error_messages
        return result

    async def _get_tenant_ids(self, session: AsyncSession) -> set[str]:
        result = await session.execute(select(RepositoryResource.tenant_id))
        return {item[0] for item in result.all() if item[0]}

    async def _template_exists(
        self,
        session: AsyncSession,
        tenant_id: str,
        template_data: Dict[str, Any],
    ) -> bool:
        result = await session.execute(
            select(AdvancedTemplate).where(
                AdvancedTemplate.name == template_data["name"],
                AdvancedTemplate.domain == template_data["domain"],
                AdvancedTemplate.template_type == template_data["template_type"],
                AdvancedTemplate.tenant_id == tenant_id,
                AdvancedTemplate.is_current == True,
            )
        )
        return result.scalar_one_or_none() is not None

    def _system_user(self, tenant_id: str) -> JwtUserInfo:
        return JwtUserInfo(
            accountId=0,
            userId=0,
            username="system",
            tenantId=tenant_id,
            enterpriseCode=tenant_id,
        )
