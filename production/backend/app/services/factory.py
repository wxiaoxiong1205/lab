from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.base import get_db
from app.repository.project_mapper import ProjectMapper
from app.services.project.interface import ProjectService
from app.services.user.interface import UserService

# from app.core.config import settings
# from app.services.project.interface import IProjectService
# from app.services.project.project import DefaultProjectService
# from app.services.user.interface import IUserService
# from app.services.user.user import DefaultUserService
#
#
# class FactoryService:
#     def __init__(self):
#         self.IUserService = None
#         self.IProjectService = None
#         pass
#
#     def get_service(self, class_type: ABC):
#         match class_type:
#             case IUserService.__class__:
#                 if self.IUserService is None:
#                     self.IUserService = self.get_user_service()
#                 injector.Binder.bind(IUserService, self.IUserService)
#
#             case IProjectService.__class__:
#                 if self.IProjectService is None:
#                     self.IProjectService = self.get_project_service()
#                 return self.IProjectService
#
#     def get_user_service() -> IUserService:
#         provider = settings.PROVIDER_TYPE.lower()
#         if provider == "belle":
#             try:
#                 return DefaultUserService()
#             except ImportError:
#                 pass
#         return DefaultUserService()
#
#     def get_project_service() -> IProjectService:
#         provider = settings.PROVIDER_TYPE.lower()
#         if provider == "belle":
#             try:
#                 return DefaultProjectService()
#             except ImportError:
#                 pass
#         return DefaultProjectService()


# 全局 injector 实例（确保已在启动时初始化并注册依赖）
# 扫描包的配置比较关键
# injector = create_auto_injector(package_names=["app.services", "app.repository"])


# def get_user_service() -> IUserService:
#     """通过 injector 获取 IUserService 实例"""
#     return injector.get(IUserService)
#
#
# def get_project_mapper(db: AsyncSession = Depends(get_db)) -> ProjectMapper:
#     """从 injector 获取 DAO，并注入 AsyncSession"""
#     injector.binder.create_binding(AsyncSession, to=db)
#     return injector.get(ProjectMapper)  # 此时提供者能拿到 db 参数
#
#
# def get_project_service(project_mapper: ProjectMapper = Depends(get_project_mapper)) -> IProjectService:
#     """通过 injector 获取 IUserService 实例"""
#     return injector.get(IProjectService)
