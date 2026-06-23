"""
数据清洗种子数据管理器
"""

import copy
import json
from typing import Any, Dict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_cleaning_manager import DataCleaningTemplate
from app.utils.timezone_utils import get_current_shanghai_time
from .data import get_data_cleaning_data


SYSTEM_TENANT_ID = "0"


def _steps_json_signature(steps: Any) -> str:
    """稳定序列化算子流程，用于判断种子与库内数据是否一致。"""
    if steps is None:
        payload: Any = []
    else:
        payload = steps
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class DataCleaningSeeder:
    """数据清洗种子数据管理器"""
    
    name = "data_cleaning"
    
    async def seed(self, session: AsyncSession) -> Dict[str, Any]:
        """
        执行数据清洗数据初始化
        
        Args:
            session: 数据库会话
            
        Returns:
            Dict[str, Any]: 执行结果，包含 created, updated, skipped, errors 字段
        """
        print(f"开始初始化 {self.name} 数据...")
        
        # 获取种子数据
        seed_data = get_data_cleaning_data()
        if not seed_data:
            print(f"没有 {self.name} 数据需要初始化")
            return {"created": 0, "updated": 0, "deleted": 0, "skipped": 0, "errors": 0}
        
        created = 0
        updated = 0
        deleted = 0
        skipped = 0
        errors = 0
        error_messages = []
        
        for template_data in seed_data:
            try:
                # 检查是否已存在全局内置模板。tenant_id 必须显式指定，避免被全局租户拦截器追加当前租户条件。
                stmt = select(DataCleaningTemplate).where(
                    DataCleaningTemplate.project_id == template_data["project_id"],
                    DataCleaningTemplate.is_builtin == template_data["is_builtin"],
                    DataCleaningTemplate.tenant_id == SYSTEM_TENANT_ID
                ).order_by(DataCleaningTemplate.id.asc())
                result = await session.execute(stmt)
                existing_templates = result.scalars().all()
                existing_template = existing_templates[0] if existing_templates else None

                for duplicate_template in existing_templates[1:]:
                    await session.delete(duplicate_template)
                    deleted += 1
                    print(
                        f"删除重复内置模板 (id={duplicate_template.id}, "
                        f"project_id={template_data['project_id']})"
                    )
                
                if existing_template:
                    seed_steps = template_data.get("steps_json") or []
                    db_sig = _steps_json_signature(existing_template.steps_json)
                    seed_sig = _steps_json_signature(seed_steps)
                    if db_sig != seed_sig:
                        now = get_current_shanghai_time()
                        existing_template.steps_json = copy.deepcopy(seed_steps)
                        existing_template.updated_at = now
                        updated += 1
                        print(
                            f"内置模板已更新 (project_id={template_data['project_id']})："
                            f"steps_json 与种子数据不一致，已同步"
                        )
                    else:
                        print(f"内置模板已存在且与种子一致 (project_id={template_data['project_id']})，跳过")
                        skipped += 1
                    continue
                
                # 创建新模板
                now = get_current_shanghai_time()
                new_template = DataCleaningTemplate(
                    project_id=template_data["project_id"],
                    is_builtin=template_data["is_builtin"],
                    steps_json=copy.deepcopy(template_data.get("steps_json") or []),
                    created_id=0,
                    created_by="system",
                    created_at=now,
                    updated_at=now,
                    tenant_id=SYSTEM_TENANT_ID
                )
                session.add(new_template)
                created += 1
                print(f"成功创建内置模板 (project_id={template_data['project_id']})")
                
            except Exception as e:
                error_message = f"创建模板失败 (project_id={template_data.get('project_id')}): {str(e)}"
                print(error_message)
                error_messages.append(error_message)
                errors += 1
        
        print(
            f"✅ {self.name} 初始化完成 - "
            f"创建: {created}, 更新: {updated}, 删除重复: {deleted}, 跳过: {skipped}, 错误: {errors}"
        )
        result = {"created": created, "updated": updated, "deleted": deleted, "skipped": skipped, "errors": errors}
        if error_messages:
            result["error_messages"] = error_messages
        return result
