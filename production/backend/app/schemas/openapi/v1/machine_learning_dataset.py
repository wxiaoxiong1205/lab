from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, RootModel, model_validator

from app.schemas.machine_learning_dataset import (
    ExportFormat,
    MachineLearningDatasetAnnotationType,
    MachineLearningDatasetCategory,
    MachineLearningDatasetDataSource,
    MachineLearningDatasetDataType,
    MachineLearningDatasetSourceType,
    MachineLearningDatasetTaskType,
    MachineLearningDatasetTemplateType,
)


class OpenMachineLearningDatasetBase(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int = Field(..., description="Dataset ID.")
    dataset_name: str = Field(..., validation_alias="name", description="Dataset name.")
    description: Optional[str] = Field(None, description="Dataset description.")
    project_id: int = Field(..., description="Project ID.")
    version: str = Field(..., description="Dataset version.")
    dataset_category: MachineLearningDatasetCategory = Field(..., description="Dataset category.")
    task_type: MachineLearningDatasetTaskType = Field(..., description="Task type.")
    data_type: Optional[MachineLearningDatasetDataType] = Field(None, description="Data type.")
    data_source: Optional[MachineLearningDatasetDataSource] = Field(None, description="Data source.")
    notebook_id: Optional[int] = Field(None, description="Notebook ID.")
    notebook_name: Optional[str] = Field(None, description="Notebook name.")
    notebook_path: Optional[str] = Field(None, description="Notebook file source path.")
    annotation_type: Optional[MachineLearningDatasetAnnotationType] = Field(None, description="Annotation type.")
    template_type: Optional[MachineLearningDatasetTemplateType] = Field(None, description="Template type.")
    is_annotated: bool = Field(True, description="Whether annotated data is included.")
    source_type: MachineLearningDatasetSourceType = Field(..., description="Upload source type.")
    sample_count: int = Field(..., description="Sample count.")
    created_at: datetime = Field(..., description="Creation time.")
    updated_at: datetime = Field(..., description="Last update time.")
    created_by: Optional[str] = Field(None, description="Creator.")


class OpenMachineLearningDatasetCreateResponse(OpenMachineLearningDatasetBase):
    storage_path: str = Field(..., description="Object storage root path.")
    dataset_path: str = Field(..., description="Dataset JSONL file path.")
    label_schema_path: Optional[str] = Field(None, description="Label schema file path.")
    file_size: Optional[float] = Field(None, description="Dataset file size in MB.")


class OpenMachineLearningDataset(OpenMachineLearningDatasetBase):
    pass


class OpenMachineLearningDatasetExportTaskResponse(BaseModel):
    status: str = Field(..., description="Export task status.")
    task_id: Optional[str] = Field(None, description="Async export task ID.")
    dataset_id: int = Field(..., description="Dataset ID.")
    export_format: str = Field(..., description="Export file format.")
    message: str = Field(..., description="User-facing retry message.")


class OpenMachineLearningDatasetBasicInfoUpdate(BaseModel):
    dataset_name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
        description="New dataset name. Renaming syncs all versions with the same name.",
    )
    description: Optional[str] = Field(
        None,
        max_length=1000,
        description="New dataset description. Only updates the specified dataset version.",
    )

    @model_validator(mode="after")
    def validate_update_fields(self):
        if "dataset_name" not in self.model_fields_set and "description" not in self.model_fields_set:
            raise ValueError("dataset_name 和 description 至少需要传一个")
        return self

    @property
    def name(self) -> Optional[str]:
        return self.dataset_name


class OpenMachineLearningDatasetSample(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    row_number: int = Field(..., description="Row number, starting from 1.")
    sample_data: Dict[str, Any] = Field(..., description="Sample data.")


class OpenMachineLearningDatasetDetail(OpenMachineLearningDatasetCreateResponse):
    base_url: Optional[str] = Field(None, description="Base URL for dataset assets.")
    label_schema: Optional[Dict[str, str]] = Field(None, description="Label schema content.")
    items: List[OpenMachineLearningDatasetSample] = Field(default_factory=list, description="Current page samples.")
    total: int = Field(..., description="Total sample count.")
    page: int = Field(..., description="Current page number.")
    size: int = Field(..., description="Number of samples per page.")
    pages: int = Field(..., description="Total pages.")


class OpenMachineLearningTaskExportFormats(RootModel[Dict[MachineLearningDatasetTemplateType, List[ExportFormat]]]):
    root: Dict[MachineLearningDatasetTemplateType, List[ExportFormat]] = Field(
        ...,
        description="Supported export formats grouped by machine learning template type.",
    )
