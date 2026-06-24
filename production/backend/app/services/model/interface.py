from pathlib import Path
from typing import List, Optional, Tuple
from abc import ABC, abstractmethod
from fastapi_pagination import Page

from sqlalchemy.ext.asyncio import AsyncSession

from datetime import datetime

from app.common.status import TaskStatus
from app.models.model_manager import BaseModel, TrainedModel, MLModel
from app.models.models import JwtUserInfo, Project
from app.repository.base_mapper import BaseMapper
from app.schemas.model import (
    BaseModelCreate, BaseModelResponse, TrainedModelCreate, TrainedModelResponse,
    TrainedModelSummaryResponse, ModelType, ModelProvider,
    BaseModelUpdate, TrainedModelLogResponse, ModelTags,
    MlModelCreate, MlModelVersionCreate, MlModelUpdate, MlModelResponse, MlModelSummaryResponse,
)
from app.services.storage.interface import StorageService


class ModelService(ABC):
    """模型服务抽象接口类（含基础模型+训练模型）"""

    def __init__(self, mapper: BaseMapper, storage: StorageService) -> None:
        self.mapper = mapper
        self.storage = storage

    # ------------------------------ 基础工具接口 ------------------------------
    @abstractmethod
    def generate_base_model_path(self, model_name: str, model_provider: ModelProvider) -> str:
        """生成基础模型在存储中的路径"""
        pass

    @abstractmethod
    def ensure_ml_task_scripts_present_http(
        self, ml_task_type: Optional[str], *, required: bool = False
    ) -> Optional[Path]:
        """本机 ``scripts/{ml_task_type}/`` 存在且非空时返回根路径；否则按规则抛 ``HTTPException``（见实现类）。"""
        pass

    # ------------------------------ 基础模型接口 ------------------------------
    @abstractmethod
    async def list_base_models(
            self, model_type: Optional[ModelType] = None,
            model_provider: Optional[ModelProvider] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
            is_available: Optional[bool] = None,
            model_tags: Optional[List[ModelTags]] = None
    ) -> Page[BaseModelResponse]:
        """获取基础模型列表（支持按类型、提供商筛选）"""
        pass

    @abstractmethod
    async def create_base_model(
            self, current_user: JwtUserInfo, base_model: BaseModelCreate
    ) -> BaseModelResponse:
        """创建新的基础模型"""
        pass

    @abstractmethod
    async def update_base_model(
            self, current_user: JwtUserInfo, base_model: BaseModelUpdate
    ) -> BaseModelResponse:
        """修改基础模型"""
        pass


    @abstractmethod
    async def delete_base_model(
            self, current_user: JwtUserInfo, base_model_id: int
    ) -> None:
        """删除基础模型"""
        pass

    # ------------------------------ 训练模型接口 ------------------------------
    @abstractmethod
    async def list_trained_models(
            self, project_id: int, name: Optional[str] = None,
            model_type: Optional[ModelType] = None,
            status: Optional[TaskStatus] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[TrainedModelSummaryResponse]:
        """获取项目下训练模型汇总列表（按名称分组）"""
        pass

    @abstractmethod
    async def get_trained_model_versions(
            self, project_id: int, model_name: str,
            status: Optional[TaskStatus] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> List[TrainedModelResponse]:
        """根据模型名称获取所有版本列表"""
        pass

    @abstractmethod
    async def create_trained_model(
            self, current_user: JwtUserInfo, trained_model: TrainedModelCreate
    ) -> TrainedModel:
        """创建新的训练模型（含存储注册）"""
        pass

    @abstractmethod
    async def update_trained_model(
            self, current_user: JwtUserInfo, trained_model_id: int, trained_model: TrainedModelCreate
    ) -> TrainedModel:
        """编辑训练模型，并同步更新执行器定时任务数据"""
        pass

    @abstractmethod
    async def delete_trained_model_all_versions(
            self, project_id: int, model_name: str
    ) -> None:
        """删除训练模型的所有版本（含存储清理）"""
        pass

    @abstractmethod
    async def delete_single_trained_model(
            self, project_id: int, model_name: str, version: str
    ) -> None:
        """删除训练模型的单个版本（含存储清理）"""
        pass

    @abstractmethod
    async def stop_trained_model_task(
            self, project_id: int, task_id: int
    ) -> None:
        """终止训练模型任务并删除对应 K8s Job 资源"""
        pass

    # ------------------------------ 内部辅助接口 ------------------------------
    @abstractmethod
    async def _validate_project(self, project_id: int) -> Project:
        """验证项目存在（内部复用）"""
        pass

    @abstractmethod
    async def _register_trained_model_storage(
            self, project: Project, trained_model: TrainedModelCreate
    ) -> str:
        """注册训练模型到存储（内部复用，返回注册路径）"""
        pass

    @abstractmethod
    async def _unregister_trained_model_storage(self, model_path: str) -> bool:
        """从存储中注销训练模型（内部复用，返回是否成功）"""
        pass

    @abstractmethod
    async def get_by_id(self, id_field_value):
        """根据 ID 获取训练模型"""
        pass

    @abstractmethod
    async def get_base_model_by_id(self, base_model_id: int):
        """根据 ID 获取基础模型，不存在返回 None"""
        pass

    @abstractmethod
    async def get_trained_model_logs(
            self, project_id: int, task_id: int, end_time: datetime, days: Optional[int] = 30
    ) -> TrainedModelLogResponse:
        """获取合并训练任务日志（优先归档日志，其次Loki实时日志）"""
        pass

    @abstractmethod
    async def get_trained_model_logs_by_time_range(
            self, project_id: int, task_id: int, start_time: datetime, end_time: datetime
    ) -> TrainedModelLogResponse:
        """获取指定时间范围的合并训练任务日志（从Loki查询）"""
        pass

    @abstractmethod
    async def public_model_list(
            self,
            model_provider: ModelProvider,
            name: Optional[str]
    ) -> List[str]:
        """获取租户下未添加的基础模型，支持按模型类型筛选"""
        pass

    @abstractmethod
    async def get_base_model_download_logs(
            self, task_id: int, end_time: datetime, days: Optional[int] = 30
    ) -> TrainedModelLogResponse:
        """获取模型下载任务日志（优先归档日志，其次Loki实时日志）"""
        pass

    @abstractmethod
    async def get_base_model_download_logs_by_time_range(
            self, task_id: int, start_time: datetime, end_time: datetime
    ) -> TrainedModelLogResponse:
        """获取指定时间范围的模型下载任务日志（从Loki查询）"""
        pass

    # ------------------------------ 机器学习模型接口 ------------------------------
    @abstractmethod
    async def list_ml_models(
            self, project_id: int, name: Optional[str] = None,
            status: Optional[TaskStatus] = None,
            page: Optional[int] = None, size: Optional[int] = None,
    ) -> Page[MlModelSummaryResponse]:
        """获取项目下机器学习模型汇总列表（按名称分组），可按版本状态筛选"""
        pass

    @abstractmethod
    async def get_ml_model_versions(
            self, project_id: int, model_name: str,
            status: Optional[TaskStatus] = None,
            page: Optional[int] = None, size: Optional[int] = None,
    ) -> List[MlModelResponse]:
        """根据模型名称获取所有版本列表，可按状态筛选"""
        pass

    @abstractmethod
    async def get_ml_model_by_name_and_version(
            self, project_id: int, model_name: str, model_version: str,
    ) -> MlModelResponse:
        """根据模型名称与版本号获取单个机器学习模型版本"""
        pass

    @abstractmethod
    async def create_ml_model(
            self, current_user: JwtUserInfo, project_id: int, body: MlModelCreate
    ) -> MlModelResponse:
        """创建机器学习模型（首版 V1），调用 Notebook 接口补全 JFS 路径后落库"""
        pass

    @abstractmethod
    async def add_ml_model_version(
            self, current_user: JwtUserInfo, project_id: int, model_name: str, body: MlModelVersionCreate
    ) -> MlModelResponse:
        """新增机器学习模型版本（生成下一版本号）"""
        pass

    @abstractmethod
    async def update_ml_model_version(
            self, current_user: JwtUserInfo, ml_model_id: int, body: MlModelUpdate
    ) -> MlModelResponse:
        """更新机器学习模型版本；仅失败状态允许编辑。"""
        pass

    @abstractmethod
    async def delete_ml_model(
            self, project_id: int, model_name: str, model_version: Optional[str] = None
    ) -> None:
        """删除机器学习模型：model_version 有值时仅删该版本，否则删除该名称下全部版本"""
        pass

    @abstractmethod
    async def get_ml_model_by_id(self, ml_model_id: int) -> Optional[MLModel]:
        """根据 ID 获取 ML 模型，不存在返回 None"""
        pass

    @abstractmethod
    async def download_ml_demo_sample_zip(
        self, project_id: int, ml_task_type: str
    ) -> Tuple[bytes, str]:
        """
        从本机代码仓库 scripts/{ml_task_type}/ 打包 demo 为 zip。
        返回 (zip 二进制, 建议下载文件名)。
        """
        pass

    @abstractmethod
    async def stop_base_model_download_task(self, task_id: int) -> None:
        """终止基础模型下载任务并删除对应 K8s Job 资源"""
        pass