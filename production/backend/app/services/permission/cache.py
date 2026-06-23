"""
权限缓存服务

使用内存缓存优化权限检查性能，避免每次请求都查询数据库。
缓存使用纯数据结构（dict），避免 ORM 实例脱离 Session 后的 DetachedInstanceError。
"""
import re
import logging
from types import SimpleNamespace
from typing import Optional, Dict, List, Tuple, Any
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_

from app.models.models import Permission, RolePermission, UserDataRole
from app.utils import app_runtime_context
from app.common.permission_constants import GLOBAL_TENANT_ID

logger = logging.getLogger("app.services.permission.cache")


class PermissionCache:
    """权限缓存管理器"""
    
    def __init__(self):
        # 权限配置缓存：key = (tenant_id, http_method), value = List[dict]（纯数据，避免 ORM 脱离 Session）
        self._permission_cache: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
        
        # 角色权限关联缓存：key = (tenant_id, permission_code), value = List[RolePermission]
        self._role_permission_cache: Dict[Tuple[str, str], List[RolePermission]] = {}
        
        # 用户角色缓存：key = (tenant_id, user_id), value = List[UserDataRole]
        self._user_role_cache: Dict[Tuple[str, int], List[UserDataRole]] = {}
        
        # 缓存时间戳：key = cache_key, value = datetime
        self._cache_timestamps: Dict[Tuple, datetime] = {}
        
        # 缓存过期时间（秒），默认5分钟
        self._cache_ttl = 300
        
        # 是否已加载全量权限配置
        self._permissions_loaded = False
    
    async def get_permission_by_url(
        self,
        db: AsyncSession,
        url: str,
        method: str
    ) -> Optional[Any]:
        """
        根据URL和HTTP方法查询权限配置（带缓存）
        返回具有 permission_code、permission_value 等属性的对象，供调用方使用，不返回 ORM 实例以避免 DetachedInstanceError。
        """
        tenant_id = app_runtime_context.get_tenant_id()
        cache_key = (tenant_id, method)
        
        permissions = self._permission_cache.get(cache_key)
        if permissions is None or self._is_cache_expired(cache_key):
            permissions = await self._load_permissions(db, tenant_id, method)
            if permissions is not None:
                self._permission_cache[cache_key] = permissions
                self._cache_timestamps[cache_key] = datetime.now()
        
        if not permissions:
            return None
        
        normalized_url = url.rstrip('/')
        for data in permissions:
            pattern = data["permission_value"]
            pattern = re.escape(pattern)
            pattern = pattern.replace(r'\{project_id\}', r'\d+')
            pattern = pattern.replace(r'\{cluster_id\}', r'\d+')
            pattern = pattern.replace(r'\{storage_id\}', r'\d+')
            pattern = pattern.replace(r'\{image_id\}', r'\d+')
            pattern = pattern.replace(r'\{repository_id\}', r'\d+')
            pattern = pattern.replace(r'\{tag_class_id\}', r'\d+')
            pattern = pattern.replace(r'\{tag_element_id\}', r'\d+')
            pattern = pattern.replace(r'\{id\}', r'\d+')
            pattern = pattern.replace(r'\*', r'.*')
            pattern = f'^{pattern}$'
            if re.match(pattern, normalized_url):
                return SimpleNamespace(**data)
        return None
    
    async def get_role_permissions(
        self,
        db: AsyncSession,
        permission_code: str
    ) -> List[RolePermission]:
        """
        获取权限对应的角色类型（带缓存）
        
        Args:
            db: 数据库会话
            permission_code: 权限代码
            
        Returns:
            角色权限关联列表
        """
        tenant_id = app_runtime_context.get_tenant_id()
        cache_key = (tenant_id, permission_code)
        
        # 尝试从缓存获取
        role_permissions = self._role_permission_cache.get(cache_key)
        
        # 如果缓存不存在或已过期，从数据库加载
        if role_permissions is None or self._is_cache_expired(cache_key):
            role_permissions = await self._load_role_permissions(db, tenant_id, permission_code)
            self._role_permission_cache[cache_key] = role_permissions
            self._cache_timestamps[cache_key] = datetime.now()
        
        return role_permissions
    
    async def get_user_data_roles(
        self,
        db: AsyncSession,
        user_id: int
    ) -> List[UserDataRole]:
        """
        获取用户的数据权限角色列表（带缓存）
        
        Args:
            db: 数据库会话
            user_id: 用户ID
            
        Returns:
            用户数据权限角色列表
        """
        tenant_id = app_runtime_context.get_tenant_id()
        cache_key = (tenant_id, user_id)
        
        # 尝试从缓存获取
        user_roles = self._user_role_cache.get(cache_key)
        
        # 如果缓存不存在或已过期，从数据库加载
        if user_roles is None or self._is_cache_expired(cache_key):
            user_roles = await self._load_user_roles(db, tenant_id, user_id)
            self._user_role_cache[cache_key] = user_roles
            self._cache_timestamps[cache_key] = datetime.now()
        
        return user_roles
    
    async def _load_permissions(
        self,
        db: AsyncSession,
        tenant_id: str,
        method: str
    ) -> List[Dict[str, Any]]:
        """从数据库加载权限配置，转为纯 dict 列表缓存，避免 ORM 脱离 Session 后 DetachedInstanceError"""
        try:
            stmt = select(Permission).where(
                and_(
                    Permission.http_method == method,
                    or_(
                        Permission.tenant_id == tenant_id,
                        Permission.tenant_id == GLOBAL_TENANT_ID  # 全局权限
                    )
                )
            )
            result = await db.execute(stmt)
            rows = result.scalars().all()
            return [
                {
                    "permission_value": p.permission_value,
                    "permission_code": p.permission_code,
                    "http_method": p.http_method,
                    "tenant_id": p.tenant_id,
                }
                for p in rows
            ]
        except Exception as e:
            logger.error(f"加载权限配置失败: {e}", exc_info=True)
            return []
    
    async def _load_role_permissions(
        self,
        db: AsyncSession,
        tenant_id: str,
        permission_code: str
    ) -> List[RolePermission]:
        """从数据库加载角色权限关联"""
        try:
            stmt = select(RolePermission).where(
                and_(
                    RolePermission.permission_code == permission_code,
                    or_(
                        RolePermission.tenant_id == tenant_id,
                        RolePermission.tenant_id == GLOBAL_TENANT_ID  # 全局配置
                    )
                )
            )
            result = await db.execute(stmt)
            role_permissions = list(result.scalars().all())
            for rp in role_permissions:
                _ = rp.role_type
                _ = rp.permission_code
                _ = rp.tenant_id
                db.expunge(rp)
            return role_permissions
        except Exception as e:
            logger.error(f"加载角色权限关联失败: {e}", exc_info=True)
            return []
    
    async def _load_user_roles(
        self,
        db: AsyncSession,
        tenant_id: str,
        user_id: int
    ) -> List[UserDataRole]:
        """从数据库加载用户角色"""
        try:
            stmt = select(UserDataRole).where(
                and_(
                    UserDataRole.user_id == user_id,
                    UserDataRole.tenant_id == tenant_id
                )
            )
            result = await db.execute(stmt)
            user_roles = list(result.scalars().all())
            for ur in user_roles:
                _ = ur.role_type
                _ = ur.scope_type
                _ = ur.scope_id
                _ = ur.user_id
                _ = ur.tenant_id
                db.expunge(ur)
            return user_roles
        except Exception as e:
            logger.error(f"加载用户角色失败: {e}", exc_info=True)
            return []
    
    def _is_cache_expired(self, cache_key: Tuple) -> bool:
        """检查缓存是否过期"""
        timestamp = self._cache_timestamps.get(cache_key)
        if timestamp is None:
            return True
        return (datetime.now() - timestamp).total_seconds() > self._cache_ttl
    
    def invalidate_user_role_cache(self, tenant_id: str, user_id: int):
        """使指定用户的角色缓存失效"""
        cache_key = (tenant_id, user_id)
        if cache_key in self._user_role_cache:
            del self._user_role_cache[cache_key]
        if cache_key in self._cache_timestamps:
            del self._cache_timestamps[cache_key]
        logger.debug(f"已清除用户角色缓存: tenant_id={tenant_id}, user_id={user_id}")
    
    def invalidate_permission_cache(self, tenant_id: str, method: Optional[str] = None):
        """使权限配置缓存失效"""
        if method:
            cache_key = (tenant_id, method)
            if cache_key in self._permission_cache:
                del self._permission_cache[cache_key]
            if cache_key in self._cache_timestamps:
                del self._cache_timestamps[cache_key]
        else:
            # 清除该租户的所有权限配置缓存
            keys_to_remove = [k for k in self._permission_cache.keys() if k[0] == tenant_id]
            for key in keys_to_remove:
                del self._permission_cache[key]
                if key in self._cache_timestamps:
                    del self._cache_timestamps[key]
        logger.debug(f"已清除权限配置缓存: tenant_id={tenant_id}, method={method}")
    
    def invalidate_role_permission_cache(self, tenant_id: str, permission_code: Optional[str] = None):
        """使角色权限关联缓存失效"""
        if permission_code:
            cache_key = (tenant_id, permission_code)
            if cache_key in self._role_permission_cache:
                del self._role_permission_cache[cache_key]
            if cache_key in self._cache_timestamps:
                del self._cache_timestamps[cache_key]
        else:
            # 清除该租户的所有角色权限关联缓存
            keys_to_remove = [k for k in self._role_permission_cache.keys() if k[0] == tenant_id]
            for key in keys_to_remove:
                del self._role_permission_cache[key]
                if key in self._cache_timestamps:
                    del self._cache_timestamps[key]
        logger.debug(f"已清除角色权限关联缓存: tenant_id={tenant_id}, permission_code={permission_code}")
    
    def clear_all_cache(self):
        """清除所有缓存"""
        self._permission_cache.clear()
        self._role_permission_cache.clear()
        self._user_role_cache.clear()
        self._cache_timestamps.clear()
        logger.info("已清除所有权限缓存")


# 全局权限缓存实例
_permission_cache_instance: Optional[PermissionCache] = None


def get_permission_cache() -> PermissionCache:
    """获取全局权限缓存实例（单例模式）"""
    global _permission_cache_instance
    if _permission_cache_instance is None:
        _permission_cache_instance = PermissionCache()
    return _permission_cache_instance
