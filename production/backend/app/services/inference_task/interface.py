from abc import ABC, abstractmethod
from typing import List, Optional, Tuple

from fastapi_pagination import Page

from app.common.status import TaskStatus
from app.repository.inference_task_mapper import InferenceTaskMapper
from app.schemas.model import MlTaskType
from app.services.model.interface import ModelService
from app.services.storage.interface import StorageService
from app.models.models import JwtUserInfo
from app.schemas.inference_task import (
    BackendEnum,
    InferenceTaskCreate,
    InferenceTaskCreatedResponse,
    InferenceTaskRedeploy,
    InferenceTaskResponse,
    InferenceTaskScale,
    InferenceTaskSummaryResponse,
    InferenceTaskUpdate,
    InferenceTaskUpdateResponse,
    ModelSourceEnum,
)



class InferenceTaskService(ABC):
    """推理任务服务抽象接口类"""
    def __init__(
        self,
        mapper: InferenceTaskMapper,
        storage: StorageService,
        model_service: ModelService,
    ) -> None:
        self.mapper = mapper
        self.storage = storage
        self.model_service = model_service

    # ------------------------------ 核心业务方法实现 ------------------------------
    @abstractmethod
    async def create_inference_task(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            task: InferenceTaskCreate,
            pin_node_port: Optional[int] = None,
    ) -> InferenceTaskCreatedResponse:
        """
        创建推理任务。ML 部署通过 ml_handle_upload_id（upload）或 notebook 工作区拷贝 model.py；
        与在线开发一致支持 notebook 来源，且 Notebook 注册模型可在未传 uploadId 时按 source_ref 推断 model.py。
        异步部署挂载前会再次从 Notebook 同步句柄文件。pin_node_port：重新部署时传入原 NodePort。
        """
        pass

    @abstractmethod
    async def copy_ml_model_handle_script_for_notebook(
        self, project_id: int, ml_model_id: int, upload_id: str
    ) -> Tuple[str, str]:
        """将分片上传的 model.py 写入 JuiceFS（与创建 ML 推理任务相同路径），供 Notebook 在线开发挂载。"""
        pass

    @abstractmethod
    async def copy_ml_model_handle_from_notebook_for_dev(
        self,
        project_id: int,
        ml_model_id: int,
        notebook_id: int,
        handle_source_ref: str,
    ) -> str:
        """从 Notebook 工作区拷贝 model.py 至统一 handle 路径，供在线开发挂载。"""
        pass
    
    @abstractmethod
    async def list_inference_tasks(
            self, project_id: int, 
            server_name: Optional[str] = None, model_name: Optional[str] = None,
            model_source: Optional[List[ModelSourceEnum]] = None,
            status: Optional[TaskStatus] = None,
            inference_engine_type: Optional[List[BackendEnum]] = None,
            usage: Optional[MlTaskType] = None,
            page: Optional[int] = None, size: Optional[int] = None
    ) -> Page[InferenceTaskSummaryResponse]:
        """获取项目下的推理任务汇总列表"""
        pass
    
    @abstractmethod
    async def get_inference_task(
            self, project_id: int, inference_task_id: int
    ) -> InferenceTaskResponse:
        """根据推理任务ID获取该任务的信息"""
        pass
    
    @abstractmethod
    async def redeploy_inference_task(
            self, current_user: JwtUserInfo, project_id: int, inference_task_id: int, inference_task_redeploy: InferenceTaskRedeploy
    ) -> InferenceTaskUpdateResponse:
        """重新部署推理任务"""
        pass
    
    @abstractmethod
    async def update_inference_task(
            self, project_id: int, inference_task_id: int, inference_task_update: InferenceTaskUpdate
    ) -> InferenceTaskUpdateResponse:
        """启动/停止推理任务"""
        pass
    
    @abstractmethod
    async def delete_inference_task(
            self, project_id: int, inference_task_id: int
    ) -> None:
        """删除推理任务"""
        pass
    
    @abstractmethod
    async def scale_inference_task(
            self, project_id: int, inference_task_id: int, inference_task_scale: InferenceTaskScale
    ) -> None:
        """扩缩容推理任务"""
        pass
