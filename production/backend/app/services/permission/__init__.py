"""权限管理服务模块"""
from .admin_service import DefaultAdminPermissionService
from .interface import AdminPermissionService

__all__ = ['AdminPermissionService', 'DefaultAdminPermissionService']
