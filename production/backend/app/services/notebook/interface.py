from typing import Tuple, Optional, List, Dict, Any, AsyncGenerator
from abc import ABC, abstractmethod
from datetime import datetime
from fastapi import Request, WebSocket, UploadFile, BackgroundTasks
from fastapi.responses import StreamingResponse, HTMLResponse, Response
from fastapi_pagination import Page, Params
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Notebook, JwtUserInfo
from app.repository.notebook_mapper import NotebookMapper
from app.schemas.inference_task import MlDeployDevNotebookCreate, MlDeployDevNotebookResponse
from app.schemas.notebook import (
    NotebookResponse, NotebookCreate, NotebookUpdate, NotebookDetailResponse, NotebookBizType,
    PublishNotebookAsExampleRequest, ExampleNotebookUpdate,
    PublishNotebookAsExampleResponse, ExampleNotebookResponse, ExampleNotebookPermissionResponse, NotebookFilesResponse, UploadExampleImageResponse,
    NotebookPortItemCreate, NotebookPortUpdate, NotebookPortItem, NotebookVisibilityPermissionResponse, NotebookViewMode,
)
from app.common.status import TaskStatus
from app.services.model.interface import ModelService
from app.services.repository_image.interface import RepositoryImageService
from app.services.storage.interface import StorageService
from app.schemas.model import MlTaskType
from app.schemas.notebook import NotebookSSHConfigResponse, NotebookSSHConfigUpdate


class NotebookService(ABC):
    """Notebook服务抽象接口类"""
    def __init__(
        self,
        mapper: NotebookMapper,
        storage: StorageService,
        repository_image_service: RepositoryImageService,
        model_service: ModelService,
    ):
        self.mapper = mapper
        self.storage = storage
        self.repository_image_service = repository_image_service
        self.model_service = model_service
        pass

    # ------------------------------ 基础CRUD接口 ------------------------------
    @abstractmethod
    async def list_notebooks(
            self, project_id: int,
            instance_name: Optional[str] = None, status: Optional[List[TaskStatus]] = None,
            biz_type: NotebookBizType = None,
            usage: Optional[MlTaskType] = None,
            is_ml_debug: Optional[bool] = None,
            view_mode: NotebookViewMode = NotebookViewMode.USE,
            page: Optional[int] = None,
            size: Optional[int] = None,
            current_user: Optional[JwtUserInfo] = None,
            is_public: Optional[List[bool]] = None,
            created_id: Optional[List[int]] = None,
    ) -> Page[NotebookResponse]:
        """获取项目下Notebook列表（分页）"""
        pass

    @abstractmethod
    async def get_notebook_detail(
            self, notebook_id: int
    ) -> NotebookDetailResponse:
        """获取Notebook详情（含SSH信息和运行时长）"""
        pass

    @abstractmethod
    async def get_notebook_visibility_permission(
            self, project_id: int, notebook_id: int, current_user: JwtUserInfo
    ) -> NotebookVisibilityPermissionResponse:
        """获取 Notebook 是否可操作"""
        pass

    @abstractmethod
    async def get_notebook_ssh_config(
            self, project_id: int, notebook_id: int, current_user: JwtUserInfo
    ) -> NotebookSSHConfigResponse:
        """获取单个 Notebook SSH 配置"""
        pass

    @abstractmethod
    async def update_notebook_ssh_config(
            self, project_id: int, notebook_id: int, ssh_config: NotebookSSHConfigUpdate,
            current_user: JwtUserInfo
    ) -> NotebookSSHConfigResponse:
        """更新单个 Notebook SSH 配置"""
        pass

    @abstractmethod
    async def gen_notebook_ssh_key(
            self, current_user: JwtUserInfo, project_id: int, notebook_id: int,
            background_tasks: BackgroundTasks
    ):
        """为单个 Notebook 生成 SSH 密钥"""
        pass

    @abstractmethod
    async def create_notebook(
            self, current_user: JwtUserInfo,
            project_id: int, notebook_create: NotebookCreate
    ) -> NotebookResponse:
        """创建Notebook实例"""
        pass

    async def create_ml_deploy_dev_notebook(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            task: MlDeployDevNotebookCreate,
    ) -> MlDeployDevNotebookResponse:
        """创建机器学习模型在线调试的Notebook实例"""
        pass

    @abstractmethod
    async def update_notebook(
            self, project_id: int, notebook_id: int,
            notebook_update: NotebookUpdate, current_user: Optional[JwtUserInfo] = None
    ) -> NotebookResponse:
        """更新Notebook信息（支持部分字段）"""
        pass

    @abstractmethod
    async def add_notebook_port(
            self, project_id: int, notebook_id: int, port_create: NotebookPortItemCreate,
            current_user: Optional[JwtUserInfo] = None
    ) -> NotebookPortItem:
        """新增 Notebook 端口"""
        pass

    @abstractmethod
    async def update_notebook_port(
            self, project_id: int, notebook_id: int, port_id: int, port_update: NotebookPortUpdate,
            current_user: Optional[JwtUserInfo] = None
    ) -> NotebookPortItem:
        """更新 Notebook 端口"""
        pass

    @abstractmethod
    async def delete_notebook_port(
            self, project_id: int, notebook_id: int, port_id: int,
            current_user: Optional[JwtUserInfo] = None
    ):
        """删除 Notebook 端口"""
        pass

    @abstractmethod
    async def delete_notebook(
            self, project_id: int, notebook_id: int,
            current_user: Optional[JwtUserInfo] = None
    ) -> None:
        """删除Notebook（含K8s资源清理）"""
        pass

    # ------------------------------ 运行控制接口 ------------------------------
    @abstractmethod
    async def start_or_deploy_notebook(
            self, project_id: int, notebook_id: int,
            current_user: Optional[JwtUserInfo] = None
    ) -> NotebookResponse:
        """启动或部署Notebook（根据状态分支处理）"""
        pass

    @abstractmethod
    async def stop_notebook(
            self, project_id: int, notebook_id: int,
            current_user: Optional[JwtUserInfo] = None
    ) -> NotebookResponse:
        """停止Notebook（更新K8s资源与状态）"""
        pass

    @abstractmethod
    async def find_notebook(self, project_id, notebook_id, current_user: Optional[JwtUserInfo] = None):
        pass

    @abstractmethod
    async def batch_stop_release_by_project_id(self, project_id: int):
        pass

    @abstractmethod
    async def publish_notebook_as_example(self,
                                          project_id: int,
                                          notebook_id: int,
                                          publish_request: PublishNotebookAsExampleRequest,
                                          current_user: JwtUserInfo
                                          ) -> PublishNotebookAsExampleResponse:
        pass

    @abstractmethod
    async def example_notebooks_list(
            self,
            example_id: Optional[int] = None,
            name: Optional[str] = None,
            biz_type: NotebookBizType = NotebookBizType.LLM,
            params: Params = None
    ) -> Page[ExampleNotebookResponse]:
        """获取案例广场列表（只查询可用的案例，支持按名称过滤）"""
        pass

    @abstractmethod
    async def example_delete(
            self,
            id: int,
            current_user: JwtUserInfo,
            db: AsyncSession
    ) -> None:
        """删除案例（异步任务）"""
        pass

    @abstractmethod
    async def example_update(
            self,
            id: int,
            update_request: ExampleNotebookUpdate,
            current_user: JwtUserInfo,
            db: AsyncSession
    ) -> ExampleNotebookResponse:
        """编辑案例"""
        pass

    @abstractmethod
    async def has_example_permission(
            self,
            id: int,
            current_user: JwtUserInfo,
            db: AsyncSession
    ) -> ExampleNotebookPermissionResponse:
        """判断当前用户是否具备案例编辑/删除权限"""
        pass

    @abstractmethod
    async def upload_example_image(
            self,
            file: UploadFile,
            current_user: JwtUserInfo
    ) -> UploadExampleImageResponse:
        """上传案例图片到JFS并返回访问地址"""
        pass

    @abstractmethod
    async def list_notebook_files(
            self,
            project_id: int,
            notebook_id: int,
            path: str = "/",
            recursive: bool = False,
            current_user: Optional[JwtUserInfo] = None
    ) -> NotebookFilesResponse:
        pass
