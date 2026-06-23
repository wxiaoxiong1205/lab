from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime
from abc import ABC, abstractmethod
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.status import TaskStatus
from app.models.models import Project, JwtUserInfo
from app.models.training_task_manager import TrainingTask
from app.repository.training_task_mapper import TrainingTaskMapper
from app.services.storage.interface import StorageService
from app.schemas.training_task import (
    TrainingTaskCreate, TrainingTaskResponse, TrainingTaskSummaryResponse,
    TrainingTaskCreatedResponse, MLflowTaskResponse, TrainingTaskLogResponse,
    TrainingTypeCategory, TrainingMethodType, CheckpointInfo
)


class TrainingTaskService(ABC):
    """训练任务服务抽象接口类"""
    def __init__(self, mapper: TrainingTaskMapper, storage: StorageService) -> None:
        self.mapper = mapper
        self.storage = storage

    # ------------------------------ 基础验证方法 ------------------------------
    @abstractmethod
    async def validate_project(self, project_id: int) -> Project:
        """验证项目是否存在，不存在则抛出404异常"""
        pass

    @abstractmethod
    async def validate_training_task(
            self, task_id: int, project_id: int
    ) -> TrainingTask:
        """验证训练任务是否存在且属于指定项目，不存在则抛出404异常"""
        pass

    # ------------------------------ 核心业务接口 ------------------------------
    @abstractmethod
    async def create_training_task(
            self, current_user: JwtUserInfo, project_id: int, task: TrainingTaskCreate
    ) -> TrainingTaskCreatedResponse:
        """创建训练任务（异步提交到Celery）"""
        pass

    @abstractmethod
    async def update_training_task(
            self, current_user: JwtUserInfo, project_id: int, task_id: int, task: TrainingTaskCreate
    ) -> TrainingTaskCreatedResponse:
        """编辑训练任务（参数与创建一致）并同步执行器任务数据"""
        pass

    @abstractmethod
    async def stop_training_task(
            self, project_id: int, task_id: int
    ) -> None:
        """终止训练任务并删除对应 K8s Job 资源"""
        pass

    @abstractmethod
    async def list_training_tasks(
            self, project_id: int, name: Optional[str] = None,
            train_type_category: Optional[TrainingTypeCategory] = None,
            train_method_type: Optional[TrainingMethodType] = None
    ) -> Page[TrainingTaskSummaryResponse]:
        """获取项目下训练任务汇总列表（按名称分组）"""
        pass

    @abstractmethod
    async def get_training_task_versions(
            self, project_id: int, task_name: str, status: Optional[TaskStatus] = None
    ) -> List[TrainingTaskResponse]:
        """根据任务名称获取所有版本列表（含检查点信息）"""
        pass

    @abstractmethod
    async def delete_training_task_version(
            self, project_id: int, task_name: str, version: str
    ) -> None:
        """删除指定版本的训练任务（含存储和MLflow清理）"""
        pass

    @abstractmethod
    async def delete_all_training_task_versions(
            self, project_id: int, task_name: str
    ) -> None:
        """删除任务名称下的所有版本（含存储和MLflow清理）"""
        pass

    @abstractmethod
    async def download_llama_factory_config(
            self, project_id: int, task_name: str, version: str
    ) -> str:
        """生成并返回LlamaFactory配置文件内容（YAML格式）"""
        pass

    @abstractmethod
    async def get_training_task_logs(
            self, project_id: int, task_id: int, end_time: datetime, days: Optional[int] = 30
    ) -> TrainingTaskLogResponse:
        """获取训练任务日志（优先归档日志，其次Loki实时日志）"""
        pass

    @abstractmethod
    async def get_training_task_logs_by_time_range(
            self, project_id: int, task_id: int, start_time: datetime, end_time: datetime
    ) -> TrainingTaskLogResponse:
        """获取指定时间范围的训练任务日志（从Loki查询）"""
        pass

    @abstractmethod
    async def get_training_task_mlflow_info(
            self, project_id: int, task_name: str, version: str
    ) -> MLflowTaskResponse:
        """获取训练任务版本的MLflow运行信息（实验、参数、指标等）"""
        pass

    # ------------------------------ 内部辅助接口 ------------------------------
    @abstractmethod
    async def _delete_mlflow_data(self, project: Project, task: TrainingTask) -> None:
        """删除训练任务对应的MLflow数据（实验+运行）"""
        pass

    @abstractmethod
    async def _delete_training_task_with_cleanup(
            self, task: TrainingTask, project: Project
    ) -> None:
        """删除训练任务并清理关联存储（模型文件、检查点）"""
        pass

    @abstractmethod
    async def get_training_checkpoints(self, model_output_path: str) -> List[CheckpointInfo]:
        """获取模型输出路径下的检查点文件夹列表（checkpoint-开头）"""
        pass

    @abstractmethod
    async def get_by_id(self, id_field_value):
        pass

    @abstractmethod
    async def get_training_task_checkpoints(
            self, project_id: int, task_id: int
    ) -> List[CheckpointInfo]:
        """获取训练任务的checkpoints信息"""
        pass