"""
模型数据种子管理器
"""

from typing import Dict, Any
from sqlalchemy import select
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.model_manager import BaseModel
from app.database.base import get_db_session
from app.models.models import RepositoryResource
from app.utils.timezone_utils import get_current_shanghai_time
from .data import get_models_data


class ModelSeeder:
    """模型数据种子管理器"""
    
    name = "models"
    
    async def seed(self, session:AsyncSession) -> Dict[str, Any]:
        """执行模型数据初始化"""
        print(f"开始初始化 {self.name} 数据...")
        
        # 获取种子数据
        seed_data = get_models_data()
        if not seed_data:
            print(f"没有 {self.name} 数据需要初始化")
            return {"created": 0, "skipped": 0, "errors": 0}
        
        # async with get_db_session() as session:
        # 查询已经存在的仓库
        repository_result = await session.execute(select(RepositoryResource))
        existing_repository = repository_result.scalars().all()

        if not existing_repository:
            print("没有找到仓库资源，跳过模型初始化")
            return {"created": 0, "skipped": 0, "errors": 0}

        # 检查已存在的模型
        model_names = [model["name"] for model in seed_data]
        models_to_create = []
        skipped = 0

        for repository in existing_repository:
            stmt = select(BaseModel).where(BaseModel.name.in_(model_names),
                                           BaseModel.tenant_id == repository.tenant_id)
            result = await session.execute(stmt)
            existing_models = result.scalars().all()

            # 构建已存在的模型名称集合
            existing_model_names = {model.name for model in existing_models}

            for model_data in seed_data:
                if model_data["name"] in existing_model_names:
                    print(f"模型已存在，跳过: {model_data['name']}")
                    skipped += 1
                    continue

                # 创建模型对象
                now = get_current_shanghai_time()
                new_model = BaseModel(
                    name=model_data["name"],
                    description=model_data["description"],
                    model_type=model_data["model_type"],
                    model_provider=model_data["model_provider"],
                    model_path=model_data["model_path"],
                    created_id=0,
                    created_by='system',
                    tenant_id=repository.tenant_id,  # 从仓库资源获取租户ID
                    created_at=now,
                    updated_at=now
                )
                models_to_create.append(new_model)

        # 批量插入新模型
        created = 0
        if models_to_create:
            session.add_all(models_to_create)
            created = len(models_to_create)
            print(f"成功创建 {created} 个模型")
        else:
            print("所有模型都已存在，无需创建")

        print(f"✅ {self.name} 初始化完成 - 创建: {created}, 跳过: {skipped}")
        return {"created": created, "skipped": skipped, "errors": 0}
