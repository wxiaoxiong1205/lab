"""
内置 Notebook 案例种子数据管理器
"""
import os
from typing import Any, Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import ExampleNotebook
from app.utils.timezone_utils import get_current_shanghai_time
from .data import get_example_notebook_data


class ExampleNotebookSeeder:
    """内置 Notebook 案例种子数据管理器"""

    name = "example_notebook"

    async def seed(self, session: AsyncSession) -> Dict[str, Any]:
        """执行内置 Notebook 案例初始化"""
        print(f"开始初始化 {self.name} 数据...")

        seed_data = get_example_notebook_data()
        if not seed_data:
            print(f"没有 {self.name} 数据需要初始化")
            return {"created": 0, "updated": 0, "skipped": 0, "errors": 0}

        created = 0
        updated = 0
        skipped = 0
        errors = 0
        error_messages = []

        for example_data in seed_data:
            try:
                stmt = select(ExampleNotebook).where(
                    ExampleNotebook.name == example_data["name"],
                    ExampleNotebook.tenant_id == example_data.get("tenant_id", "0"),
                )
                result = await session.execute(stmt)
                existing_example = result.scalar_one_or_none()

                if existing_example:
                    changed = False
                    compare_fields = {
                        "describe": example_data.get("describe"),
                        "is_available": example_data.get("is_available", True),
                        "built_in_address": example_data.get("built_in_address"),
                        "biz_type": example_data.get("biz_type", "llm"),
                    }
                    for field, expected in compare_fields.items():
                        if getattr(existing_example, field) != expected:
                            setattr(existing_example, field, expected)
                            changed = True

                    if changed:
                        existing_example.updated_at = get_current_shanghai_time()
                        updated += 1
                        print(f"内置 Notebook 案例已更新: {example_data['name']}")
                    else:
                        skipped += 1
                        print(f"内置 Notebook 案例已存在且无变化，跳过: {example_data['name']}")
                    continue

                now = get_current_shanghai_time()
                new_example = ExampleNotebook(
                    name=example_data["name"],
                    describe=example_data.get("describe"),
                    is_available=example_data.get("is_available", True),
                    built_in_address=example_data.get("built_in_address"),
                    biz_type=example_data.get("biz_type", "llm"),
                    created_id=0,
                    created_by="system",
                    created_at=now,
                    updated_at=now,
                    tenant_id=example_data.get("tenant_id", "0"),
                )
                session.add(new_example)
                created += 1
                print(f"成功创建内置 Notebook 案例: {example_data['name']}")

            except Exception as e:
                error_message = f"初始化内置 Notebook 案例失败 {example_data.get('name', '')}: {str(e)}"
                print(error_message)
                error_messages.append(error_message)
                errors += 1

        print(
            f"✅ {self.name} 初始化完成 - "
            f"创建: {created}, 更新: {updated}, 跳过: {skipped}, 错误: {errors}"
        )
        result = {"created": created, "updated": updated, "skipped": skipped, "errors": errors}
        if error_messages:
            result["error_messages"] = error_messages
        return result
