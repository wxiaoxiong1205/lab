from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from fastapi.params import Depends
from fastapi_pagination import Params, Page

from app.models.models import JwtUserInfo
from app.repository.machine_learning_dataset_mapper import MachineLearningDatasetMapper
from app.schemas.machine_learning_dataset import (
    MachineLearningDatasetAnnotationType,
    MachineLearningDatasetBasicInfoUpdate,
    MachineLearningDatasetCreateResponse,
    MachineLearningDatasetDataSource,
    DatasetPublishStatus,
    MachineLearningDatasetDetailResponse,
    MachineLearningDatasetDataType,
    MachineLearningDatasetResponse,
    MachineLearningDatasetSampleFileType,
    MachineLearningDatasetTaskType,
    MachineLearningDatasetTemplateType, ExportFormat,
)
from app.services.chunk_upload.interface import ChunkUploadService
from app.services.storage.interface import StorageService


class MachineLearningDatasetService(ABC):
    def __init__(
        self,
        machine_learning_dataset_mapper: MachineLearningDatasetMapper,
        storage: StorageService,
        chunk_upload_service: ChunkUploadService,
    ) -> None:
        self.machine_learning_dataset_mapper = machine_learning_dataset_mapper
        self.storage = storage
        self.chunk_upload_service = chunk_upload_service

    @abstractmethod
    async def create_dataset_with_file(
        self,
        current_user: JwtUserInfo,
        name: str,
        project_id: int,
        chunk_upload_ids: Optional[str],
        data_type: Optional["MachineLearningDatasetDataType"],
        annotation_type: Optional["MachineLearningDatasetAnnotationType"],
        template_type: Optional["MachineLearningDatasetTemplateType"],
        is_annotated: bool = True,
        version: str = "V1",
        inherit_from_version: bool = False,
        source_version: Optional[str] = None,
        description: Optional[str] = None,
        data_source: Optional["MachineLearningDatasetDataSource"] = None,
        notebook_id: Optional[int] = None,
        notebook_name: Optional[str] = None,
        notebook_path: Optional[str] = None,
    ) -> MachineLearningDatasetCreateResponse:
        pass

    @abstractmethod
    async def list_datasets(
        self,
        project_id: int,
        params: Params = Depends(),
        name: Optional[str] = None,
        task_type: Optional[MachineLearningDatasetTaskType] = None,
        template_type: Optional[MachineLearningDatasetTemplateType] = None,
        is_annotated: Optional[bool] = None,
        publish: Optional[DatasetPublishStatus] = None
    ) -> Page[MachineLearningDatasetResponse]:
        pass

    @abstractmethod
    async def update_dataset_basic_info(
        self,
        project_id: int,
        dataset_id: int,
        update_data: MachineLearningDatasetBasicInfoUpdate,
    ) -> bool:
        """编辑机器学习数据集名称和描述。"""
        pass

    @abstractmethod
    async def update_dataset_publish_status(
        self,
        project_id: int,
        dataset_id: int,
        publish: DatasetPublishStatus,
    ) -> bool:
        """修改机器学习数据集发布状态：仅允许处理完成且未发布的数据集改为已发布。"""
        pass

    @abstractmethod
    async def delete_dataset_rows(
        self,
        project_id: int,
        dataset_id: int,
        row_numbers: List[int],
    ) -> bool:
        """同步删除机器学习数据集文件中的指定行"""
        pass

    @abstractmethod
    async def get_dataset_versions(
        self,
        project_id: int,
        dataset_id: int,
        is_annotated: Optional[bool] = None,
        publish: Optional[DatasetPublishStatus] = None
    ) -> List[MachineLearningDatasetResponse]:
        """根据数据集 id 获取该数据集（同名）下的所有版本列表。"""
        pass

    @abstractmethod
    async def get_dataset_detail(
        self,
        project_id: int,
        dataset_id: int,
        page: int = 1,
        size: int = 20,
    ) -> MachineLearningDatasetDetailResponse:
        pass

    @abstractmethod
    async def get_metadata_fields(
        self,
        project_id: int,
        dataset_id: int,
    ) -> List[str]:
        """获取机器学习数据集字段元数据列表。"""
        pass

    @abstractmethod
    async def repair_metadata_fields(
        self,
        force: bool = False,
    ) -> Dict[str, Any]:
        """从历史 dataset.jsonl 回填空的 metadata_fields。"""
        pass

    @abstractmethod
    async def download_sample_dataset(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        data_type: MachineLearningDatasetDataType,
        template_type: MachineLearningDatasetTemplateType,
        file_type: MachineLearningDatasetSampleFileType,
        is_annotated: bool = True,
    ):
        """下载机器学习样例数据集文件。"""
        pass

    @abstractmethod
    async def download_dataset(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        dataset_id: int,
        export_format: ExportFormat
    ):
        """下载已创建的机器学习数据集（打包 dataset.jsonl、assets、classname.json 为 zip）。"""
        pass

    @abstractmethod
    async def delete_dataset(self, project_id: int, dataset_id: int) -> None:
        """根据数据集 id 删除单条记录及其 JFS 上的文件。"""
        pass

    @abstractmethod
    async def delete_dataset_all_versions(self, project_id: int, dataset_id: int) -> None:
        """根据数据集 id 查到同名所有版本，依次删除每条记录及对应 JFS 文件。"""
        pass
