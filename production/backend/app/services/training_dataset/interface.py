from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any

from fastapi_pagination import Page
from starlette.responses import FileResponse, StreamingResponse

from app.models import TrainingDataset
from app.models.models import JwtUserInfo
from app.repository.training_dataset_mapper import TrainingDatasetMapper
from app.schemas.training_dataset import (
    TrainingDatasetResponse, TrainingDatasetSummaryResponse,
    DatasetSamplePageResponse, DatasetFormat, DatasetUsage, TrainingDatasetUploadTypeCategory,
    DatasetProcessingStatus, TrainingDatasetExportTypeCategory, TrainingDatasetAggregationResponse,
    TrainingDatasetBasicInfoUpdate, DatasetVersionMergeRequest
)
from app.schemas.training_task import TrainingTypeCategory, TrainingMethodType
from app.services.chunk_upload.interface import ChunkUploadService
from app.services.storage.interface import StorageService


class TrainingDatasetService(ABC):
    """训练数据集服务抽象接口类"""
    def __init__(self, training_dataset_mapper: TrainingDatasetMapper, storage: StorageService, chunk_upload_service: ChunkUploadService) -> None:
        self.training_dataset_mapper = training_dataset_mapper
        self.storage = storage
        self.chunk_upload_service = chunk_upload_service

    @abstractmethod
    def get_sample_dataset_path(
        self,
        dataset_type: TrainingTypeCategory,
        training_method_type: TrainingMethodType,
        dataset_format: DatasetFormat,
        file_type: TrainingDatasetUploadTypeCategory
    ) -> str:
        """获取样例数据集的本地文件路径"""
        pass

    # ------------------------------ 接口核心方法 ------------------------------
    @abstractmethod
    async def download_sample_dataset(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        dataset_type: TrainingTypeCategory,
        training_method_type: TrainingMethodType,
        dataset_format: DatasetFormat,
        file_type: TrainingDatasetUploadTypeCategory
    ) -> FileResponse:
        """下载样例数据集（返回文件路径和下载文件名）"""
        pass

    @abstractmethod
    async def download_dataset(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        dataset_name: str,
        version: str,
        usage: DatasetUsage,
        file_type: TrainingDatasetExportTypeCategory,
    ):
        """下载指定版本的数据集（返回JuiceFS路径和下载文件名）"""
        pass

    @abstractmethod
    async def download_image_dataset(
            self,
            jfs: Any,
            dataset: TrainingDataset,
            project_id: int,
            dataset_name: str,
            version: str,
            export_file_type: TrainingDatasetExportTypeCategory
    ) -> StreamingResponse:
        """下载图像理解数据集为zip文件

                zip文件结构：
                - data.jsonl
                - images/
                  - image1.jpg
                  - image2.jpg
                  - ...
                """
        pass

    @abstractmethod
    async def download_text_dataset(
            self,
            dataset: TrainingDataset,
            project_id: int,
            dataset_name: str,
            version: str,
            export_file_type: TrainingDatasetExportTypeCategory
    ) -> StreamingResponse:
        """下载文本生成数据集文件，支持多格式导出（jsonl、json、xlsx）"""
        pass

    @abstractmethod
    async def list_training_datasets(
        self,
        project_id: int,
        name: Optional[str] = None,
        dataset_type: Optional[TrainingTypeCategory] = None,
        training_method_type: Optional[TrainingMethodType] = None,
        usage: Optional[DatasetUsage] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        processing_status: Optional[DatasetProcessingStatus] = None,
    ) -> Page[TrainingDatasetSummaryResponse]:
        """获取项目下的训练数据集汇总列表（分页）"""
        pass

    @abstractmethod
    async def get_training_dataset_versions(
        self,
        project_id: int,
        dataset_name: str,
        usage: DatasetUsage,
        processing_status: Optional[DatasetProcessingStatus] = None,
    ) -> List[TrainingDatasetResponse]:
        """根据数据集名称获取所有版本列表"""
        pass

    @abstractmethod
    async def update_training_dataset_basic_info(
        self,
        project_id: int,
        dataset_name: str,
        usage: DatasetUsage,
        update_data: TrainingDatasetBasicInfoUpdate,
    ) -> bool:
        """编辑数据集名称和描述，并同步使用该数据集的标注、清洗、推理结果集冗余信息"""
        pass

    @abstractmethod
    async def preview_dataset_data(
        self,
        project_id: int,
        name: str,
        version: str,
        page: int,
        size: int
    ) -> DatasetSamplePageResponse:
        """预览数据集内容（分页展示JSONL样本）"""
        pass

    @abstractmethod
    async def preview_dataset_data_optimized(
            self,
            project_id: int,
            name: str,
            version: str,
            page: int,
            size: int,
            usage: DatasetUsage,
    ) -> DatasetSamplePageResponse:
        """预览数据集内容（分页展示JSONL样本）"""
        pass

    @abstractmethod
    async def get_metadata_fields(
        self,
        project_id: int,
        dataset_id: int,
    ) -> List[str]:
        """获取训练数据集字段元数据列表（读取 metadata_fields 并追加格式逻辑字段）"""
        pass

    @abstractmethod
    async def repair_metadata_fields(
        self,
    ) -> Dict[str, Any]:
        """从历史 dataset JSONL 文件回填空的 metadata_fields。"""
        pass

    @abstractmethod
    async def create_training_dataset_with_file(
        self,
        current_user: JwtUserInfo,
        name: str,
        project_id: int,
        dataset_type: TrainingTypeCategory,
        training_method_type: TrainingMethodType,
        dataset_format: DatasetFormat,
        usage: DatasetUsage,
        chunk_upload_ids: str,
        version: str = "v1",
        description: Optional[str] = None,
        dataset_config: Optional[str] = None,
        attr_values: Optional[List[Any]] = None,
    ) -> TrainingDatasetResponse:
        """上传文件创建新的训练数据集（支持单文件或多文件分片上传）"""
        pass

    @abstractmethod
    async def create_dataset_version(
        self,
        current_user: JwtUserInfo,
        name: str,
        project_id: int,
        new_version: str,
        inherit_from_version: bool,
        source_version: Optional[str] = None,
        chunk_upload_ids: Optional[List[str]] = None,
        description: Optional[str] = None,
        dataset_config: Optional[str] = None,
        usage: DatasetUsage = None,
        attr_values: Optional[List[Any]] = None,
    ) -> TrainingDatasetResponse:
        """基于现有数据集创建新版本（继承/上传模式，支持单文件直接上传或多文件分片上传）"""
        pass

    @abstractmethod
    async def merge_dataset_versions(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        dataset_name: str,
        usage: DatasetUsage,
        request: DatasetVersionMergeRequest,
    ) -> TrainingDatasetResponse:
        """合并同一数据集下多个已完成版本，生成新版本"""
        pass

    @abstractmethod
    async def delete_dataset_all_versions(
        self,
        project_id: int,
        dataset_name: str,
        usage: DatasetUsage,
    ):
        """删除指定数据集名下的所有版本"""
        pass

    @abstractmethod
    async def delete_single_dataset(
        self,
        project_id: int,
        dataset_name: str,
        version: str,
        usage: DatasetUsage,
    ) -> None:
        """删除单个数据集版本"""
        pass

    # ------------------------------ 内部辅助方法 ------------------------------
    @abstractmethod
    async def _get_juicefs_client(self) -> Any:
        """获取JuiceFS客户端（内部复用）"""
        pass

    @abstractmethod
    async def _delete_dataset_file(self, dataset_path: str) -> None:
        """删除JuiceFS中的数据集文件（内部复用）"""
        pass

    @abstractmethod
    async def get_by_id(self, id_field_value):
        pass

    @abstractmethod
    async def _build_base_url(self, project_id: int, dataset: TrainingDataset) -> str:
        """构建图片基础url（用于前端访问图片查询接口）（内部复用）"""
        pass

    @abstractmethod
    async def get_datasets_by_ids_and_usage(
        self,
        ids: List[int],
        usage: DatasetUsage,
        project_id:int
    ) -> List[TrainingDatasetResponse]:
        """通过 IDs、 usage、project_id 查询数据集列表"""
        pass

    @abstractmethod
    async def get_aggregation_stats(
        self,
        project_id: int,
        processing_status: Optional[DatasetProcessingStatus] = None,
        attr_name: Optional[str] = None,
        option_value: Optional[str] = None,
        usage: Optional[List[DatasetUsage]] = None,
        dataset_type: Optional[List[TrainingTypeCategory]] = None,
        training_method_type: Optional[List[TrainingMethodType]] = None,
        dataset_format: Optional[List[DatasetFormat]] = None,
    ) -> TrainingDatasetAggregationResponse:
        """聚合统计：按 usage、dataset_format、dataset_type、attr option 分别统计数据量；支持 processing_status、attr、可选多选 usage / dataset_type / training_method_type / dataset_format（usage 未传或为空列表则返回 None、不查库；须传非空 usage 才聚合）"""
        pass

    @abstractmethod
    async def list_training_datasets_by_filters(
        self,
        project_id: int,
        name: Optional[str] = None,
        dataset_type: Optional[TrainingTypeCategory] = None,
        training_method_type: Optional[TrainingMethodType] = None,
        usage: Optional[DatasetUsage] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        processing_status: Optional[DatasetProcessingStatus] = None,
        dataset_format: Optional[DatasetFormat] = None,
        attr_name: Optional[str] = None,
        option_value: Optional[str] = None,
    ) -> Page[TrainingDatasetSummaryResponse]:
        """按聚合维度过滤的分页列表：仅按 name 聚合摘要，全量版本见 get_training_dataset_versions。
        usage 未传或空则返回空分页、不查库；须传 usage 后，未传 dataset_type / dataset_format 则不过滤对应维度。"""
        pass
