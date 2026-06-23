from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime
from abc import ABC, abstractmethod
from fastapi import UploadFile
from fastapi.responses import FileResponse
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.status import TaskStatus
from app.models.models import JwtUserInfo, Project
from app.models.inference_result_manager import InferenceResultDataset
from app.repository.inference_result_mapper import InferenceResultDatasetMapper
from app.repository.task_execution_mapper import TaskExecutionMapper
from app.schemas.inference_result import (
    InferenceResultDatasetCreate, InferenceResultDatasetResponse,
    InferenceResultDatasetSummaryResponse, InferenceResultItemResponse,
    InferenceResultDetailResponse, InferenceResultDatasetBatchCreate,
    InferenceResultDatasetBatchResponse, InferenceMethod, InferenceResultDatasetUploadType, TaskLogResponse,
    InferenceResultItemResponsePage, InferenceResultItemFlexibleResponsePage, InferenceDatasetUsage,
    InferenceResultDatasetExportType, InferenceResultAggregationResponse,
    InferenceResultDatasetBasicInfoUpdate
)
from app.schemas.training_dataset import DatasetFormat
from app.schemas.training_task import TrainingTypeCategory
from app.services.project.interface import ProjectService
from app.services.storage.interface import StorageService


class InferenceResultDatasetService(ABC):
    """推理结果数据集服务抽象接口类"""

    def __init__(self, dataset_mapper: InferenceResultDatasetMapper,
                 project_service: ProjectService,
                 task_mapper: TaskExecutionMapper,
                 storage: StorageService) -> None:
        self.dataset_mapper = dataset_mapper
        self.project_service = project_service
        self.task_mapper = task_mapper
        self.storage = storage

    # ------------------------------ 基础验证方法 ------------------------------

    @abstractmethod
    async def validate_dataset(self, dataset_id: int, project_id: int) -> InferenceResultDataset:
        """验证推理结果数据集是否存在且属于指定项目，不存在则抛出404异常"""
        pass

    # ------------------------------ 核心业务接口 ------------------------------
    @abstractmethod
    async def download_sample_dataset(
            self,
            current_user: JwtUserInfo,
            file_type: InferenceResultDatasetUploadType,
            dataset_type: TrainingTypeCategory,
            dataset_format: DatasetFormat
    ) -> FileResponse:
        """下载推理结果样例数据集。根据 dataset_type、dataset_format、file_type 通过枚举配置动态解析路径与下载名。"""
        pass

    @abstractmethod
    async def create_inference_result_dataset(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            dataset: InferenceResultDatasetCreate,
            files: Optional[List[UploadFile]] = None,
            manual_trigger_required: bool = True,
    ) -> InferenceResultDatasetResponse:
        """创建推理结果数据集

        支持三种方式：
        1. 离线推理：需要模型ID、数据ID、显卡配置、模型参数
        2. 在线推理：需要服务ID、数据ID、模型参数
        3. 导入推理结果集：需要上传文件（jsonl/csv/xlsx格式）
        """
        pass

    @abstractmethod
    async def update_inference_result_dataset(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            dataset_id: int,
            dataset: InferenceResultDatasetCreate,
            files: Optional[List[UploadFile]] = None,
    ) -> InferenceResultDatasetResponse:
        """编辑推理结果数据集（参数与创建一致）并同步执行任务信息"""
        pass

    @abstractmethod
    async def update_inference_result_dataset_basic_info(
            self,
            project_id: int,
            dataset_id: int,
            update_data: InferenceResultDatasetBasicInfoUpdate,
    ) -> bool:
        """仅编辑推理结果集名称和描述"""
        pass

    @abstractmethod
    async def list_inference_result_datasets(
            self,
            project_id: int,
            name: Optional[str] = None,
            inference_method: Optional[InferenceMethod] = None,
            status: Optional[TaskStatus] = None,
            dataset_type: Optional[str] = None,
            dataset_format: Optional[str] = None,
            source_dataset_id: Optional[int] = None,
            usage: Optional[InferenceDatasetUsage] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
    ) -> Page[InferenceResultDatasetSummaryResponse]:
        """获取项目下的推理结果数据集列表（分页）"""
        pass

    @abstractmethod
    async def get_inference_result_dataset(
            self,
            project_id: int,
            dataset_id: int
    ) -> InferenceResultDatasetResponse:
        """获取指定推理结果数据集详情"""
        pass

    @abstractmethod
    async def get_inference_result_detail(
            self,
            project_id: int,
            dataset_id: int,
            page: int = 1,
            size: int = 10
    ) -> InferenceResultDetailResponse:
        """获取推理结果数据集详情（包含数据预览）"""
        pass

    @abstractmethod
    async def preview_inference_result_items(
            self,
            project_id: int,
            dataset_id: int,
            page: int = 1,
            size: int = 10
    ) -> InferenceResultItemResponsePage | InferenceResultItemFlexibleResponsePage:
        """预览推理结果数据项（分页展示）

        根据数据集的 usage 字段判断返回格式：
        - business-inference: 返回宽松格式（InferenceResultItemFlexibleResponsePage），直接返回原始JSON对象
        - default-inference: 返回固定格式（InferenceResultItemResponsePage），提取固定字段
        """
        pass

    @abstractmethod
    async def download_inference_result_dataset(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            dataset_id: int,
            file_type: InferenceResultDatasetExportType
    ):
        """下载推理结果数据集，支持多格式导出（jsonl、json、xlsx）"""
        pass

    @abstractmethod
    async def delete_inference_result_dataset(
            self,
            project_id: int,
            dataset_id: int
    ) -> None:
        """删除推理结果数据集（同时删除关联的数据项和文件）"""
        pass

    @abstractmethod
    async def stop_inference_result_dataset(
            self,
            project_id: int,
            dataset_id: int
    ) -> None:
        """终止推理结果数据集任务并删除对应 K8s Job 资源"""
        pass

    @abstractmethod
    async def batch_create_inference_result_datasets(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            batch_create: InferenceResultDatasetBatchCreate,
            files_map: Optional[Dict[str, List[UploadFile]]] = None
    ) -> InferenceResultDatasetBatchResponse:
        """批量创建推理结果数据集

        共用字段（推理方式、模型参数、显卡配置等）在外侧参数中，
        每个数据集有自己的名称、描述、数据源等信息

        Args:
            current_user: 当前用户信息
            project_id: 项目ID
            batch_create: 批量创建请求模型
            files_map: 文件映射，key为数据集名称，value为该数据集的文件列表（仅导入推理结果集使用）

        Returns:
            批量创建结果，包含成功和失败的信息
        """
        pass

    @abstractmethod
    async def update_dataset_status(
            self,
            dataset_id: int,
            status: TaskStatus,
            progress: Optional[int] = None
    ) -> None:
        """更新数据集状态和进度"""
        pass

    @abstractmethod
    async def get_metadata_fields(
            self,
            project_id: int,
            dataset_id: int,
            usage: Optional[InferenceDatasetUsage]
    ) -> List[str]:
        """获取推理结果数据集的元数据字段列表

        通过读取数据集文件，分析所有数据项的字段，返回所有字段名称列表

        Args:
            project_id: 项目ID
            dataset_id: 推理结果数据集ID
            usage: Optional[InferenceDatasetUsage]

        Returns:
            List[str]: 元数据字段名称列表（去重并排序）
        """
        pass

    @abstractmethod
    async def get_task_logs(
            self,
            project_id: int,
            dataset_id: int,
            end_time: datetime,
            days: Optional[int] = 30,
    ) -> TaskLogResponse:
        """获取任务日志（分页）"""
        pass

    @abstractmethod
    async def download_task_logs(
            self,
            project_id: int,
            dataset_id: int
    ):
        """下载任务日志文件

        Args:
            project_id: 项目ID
            dataset_id: 推理结果数据集id

        Returns:
            StreamingResponse: 日志文件流
        """
        pass

    @abstractmethod
    def _build_base_url(self, project_id: int, dataset_id: int, data_format: Optional[str] = None) -> Optional[str]:
        """
        构建图片基础URL路径（仅用于需要图片的数据格式）

        Args:
            project_id: 项目ID
            task_id: 数据集ID
            data_format: 数据格式（role-based, prompt-response, prefix-suffix-middle等）

        Returns:
            图片基础URL路径，如果数据格式不需要图片则返回None
        """
        pass

    @abstractmethod
    async def get_inference_result_datasets_by_ids(
            self,
            ids: List[int],
            project_id: int
    ) -> List[InferenceResultDatasetResponse]:
        """根据 IDs，项目id 获取推理结果数据集列表（包含地址信息）

        Args:
            ids: 推理结果数据集ID列表
            project_id: 项目id

        Returns:
            List[InferenceResultDatasetResponse]: 推理结果数据集列表
        """
        pass

    @abstractmethod
    async def get_aggregation_stats(
        self,
        project_id: int,
        status: Optional[TaskStatus] = None,
        attr_name: Optional[str] = None,
        option_value: Optional[str] = None,
        usage: Optional[List[InferenceDatasetUsage]] = None,
        dataset_type: Optional[List[TrainingTypeCategory]] = None,
        dataset_format: Optional[List[DatasetFormat]] = None,
    ) -> InferenceResultAggregationResponse:
        """按 dataset_format、dataset_type、属性选项聚合统计数据集条数（不按 usage 出统计维度）；usage 未传或为空列表则返回 None、不查库；须传非空 usage 才聚合；未传 dataset_type / dataset_format 时不过滤对应维度。"""
        pass

    @abstractmethod
    async def list_inference_result_datasets_by_filters(
        self,
        project_id: int,
        name: Optional[str] = None,
        dataset_type: Optional[TrainingTypeCategory] = None,
        usage: Optional[InferenceDatasetUsage] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        status: Optional[TaskStatus] = None,
        dataset_format: Optional[DatasetFormat] = None,
        attr_name: Optional[str] = None,
        option_value: Optional[str] = None,
    ) -> Page[InferenceResultDatasetSummaryResponse]:
        """多条件过滤分页列表（对齐训练数据集 filtered）；usage 未传或空则返回空分页、不查库；须传 usage 后，未传 dataset_type / dataset_format 则不过滤对应维度。"""
        pass
