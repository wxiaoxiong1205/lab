"""
通用配置数据种子管理器
"""

from typing import Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common_config import CommonConfig
from app.models.models import RepositoryResource
from app.utils.timezone_utils import get_current_shanghai_time
from .data import get_common_config_data


class CommonConfigSeeder:
    """通用配置数据种子管理器"""
    
    name = "common_config"
    
    async def seed(self, session: AsyncSession) -> Dict[str, Any]:
        """执行通用配置数据初始化"""
        print(f"开始初始化 {self.name} 数据...")
        
        # 获取种子数据
        seed_data = get_common_config_data()
        if not seed_data:
            print(f"没有 {self.name} 数据需要初始化")
            return {"created": 0, "skipped": 0, "errors": 0}
        
        # 查询已经存在的仓库（用于获取租户ID）
        repository_result = await session.execute(select(RepositoryResource))
        existing_repository = repository_result.scalars().all()
        
        if not existing_repository:
            print("没有找到仓库资源，跳过通用配置初始化")
            return {"created": 0, "skipped": 0, "errors": 0}
        
        # 检查已存在的配置
        config_keys = [config["config_key"] for config in seed_data]
        configs_to_create = []
        skipped = 0
        
        for repository in existing_repository:
            # 查询该租户下已存在的配置
            stmt = select(CommonConfig).where(
                CommonConfig.config_key.in_(config_keys),
                CommonConfig.tenant_id == repository.tenant_id
            )
            result = await session.execute(stmt)
            existing_configs = result.scalars().all()
            
            # 构建已存在的配置键集合
            existing_config_keys = {config.config_key for config in existing_configs}
            
            for config_data in seed_data:
                if config_data["config_key"] in existing_config_keys:
                    print(f"通用配置已存在，跳过: {config_data['config_key']} (租户: {repository.tenant_id})")
                    skipped += 1
                    continue
                
                # 创建通用配置对象
                now = get_current_shanghai_time()
                new_config = CommonConfig(
                    config_key=config_data["config_key"],
                    config_value=config_data["config_value"],
                    description=config_data.get("description"),
                    created_id=0,
                    created_by='system',
                    tenant_id=repository.tenant_id,
                    created_at=now,
                    updated_at=now
                )
                configs_to_create.append(new_config)
        
        # 批量插入新配置
        created = 0
        if configs_to_create:
            session.add_all(configs_to_create)
            created = len(configs_to_create)
            print(f"成功创建 {created} 个通用配置")
        else:
            print("所有通用配置都已存在，无需创建")
        
        print(f"✅ {self.name} 初始化完成 - 创建: {created}, 跳过: {skipped}")
        return {"created": created, "skipped": skipped, "errors": 0}

