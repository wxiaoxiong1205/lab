"""
权限数据种子管理器
"""
from typing import Dict, Any
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Permission, RolePermission
from app.utils.timezone_utils import get_current_shanghai_time
from .data import get_permission_data, get_role_permission_data


class PermissionSeeder:
    """权限数据种子管理器"""
    
    name = "permission"
    
    async def seed(self, session: AsyncSession) -> Dict[str, Any]:
        """执行权限数据初始化"""
        print(f"开始初始化 {self.name} 数据...")
        
        created_permissions = 0
        skipped_permissions = 0
        created_role_permissions = 0
        skipped_role_permissions = 0
        
        # 1. 初始化权限配置
        permission_data = get_permission_data()
        for perm_data in permission_data:
            # 检查权限是否已存在（根据permission_code和tenant_id）
            stmt = select(Permission).where(
                and_(
                    Permission.permission_code == perm_data["permission_code"],
                    Permission.tenant_id == perm_data["tenant_id"]
                )
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            
            if existing:
                print(f"权限配置已存在，跳过: {perm_data['permission_code']}")
                skipped_permissions += 1
                continue
            
            # 创建权限配置
            now = get_current_shanghai_time()
            new_permission = Permission(
                permission_code=perm_data["permission_code"],
                permission_name=perm_data["permission_name"],
                permission_value=perm_data["permission_value"],
                http_method=perm_data["http_method"],
                description=perm_data.get("description"),
                tenant_id=perm_data["tenant_id"],
                created_id=0,
                created_by='system',
                created_at=now,
                updated_at=now
            )
            session.add(new_permission)
            created_permissions += 1
        
        # 提交权限配置
        if created_permissions > 0:
            await session.commit()
            print(f"成功创建 {created_permissions} 个权限配置")
        
        # 2. 初始化角色权限关联
        role_permission_data = get_role_permission_data()
        for rp_data in role_permission_data:
            # 检查角色权限关联是否已存在
            stmt = select(RolePermission).where(
                and_(
                    RolePermission.role_type == rp_data["role_type"],
                    RolePermission.permission_code == rp_data["permission_code"],
                    RolePermission.tenant_id == rp_data["tenant_id"]
                )
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            
            if existing:
                print(f"角色权限关联已存在，跳过: {rp_data['role_type']} - {rp_data['permission_code']}")
                skipped_role_permissions += 1
                continue
            
            # 创建角色权限关联
            now = get_current_shanghai_time()
            new_rp = RolePermission(
                role_type=rp_data["role_type"],
                permission_code=rp_data["permission_code"],
                tenant_id=rp_data["tenant_id"],
                created_at=now,
                updated_at=now
            )
            session.add(new_rp)
            created_role_permissions += 1
        
        # 提交角色权限关联
        if created_role_permissions > 0:
            await session.commit()
            print(f"成功创建 {created_role_permissions} 个角色权限关联")
        
        total_created = created_permissions + created_role_permissions
        total_skipped = skipped_permissions + skipped_role_permissions
        
        print(f"✅ {self.name} 初始化完成 - 创建: {total_created}, 跳过: {total_skipped}")
        return {
            "created": total_created,
            "skipped": total_skipped,
            "errors": 0,
            "details": {
                "permissions": {"created": created_permissions, "skipped": skipped_permissions},
                "role_permissions": {"created": created_role_permissions, "skipped": skipped_role_permissions}
            }
        }
