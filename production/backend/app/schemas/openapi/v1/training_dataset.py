from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.training_dataset import DatasetFormat, DatasetProcessingStatus, DatasetUsage
from app.schemas.training_task import TrainingMethodType, TrainingTypeCategory


class OpenTrainingDataset(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int = Field(..., description="Dataset ID.")
    dataset_name: str = Field(..., validation_alias="name", description="Dataset name.")
    description: Optional[str] = Field(None, description="Dataset description.")
    project_id: int = Field(..., description="Project ID.")
    version: str = Field(..., description="Dataset version.")
    dataset_type: TrainingTypeCategory = Field(..., description="Dataset type.")
    training_method_type: TrainingMethodType = Field(..., description="Training method type.")
    dataset_format: DatasetFormat = Field(..., description="Dataset format.")
    usage: DatasetUsage = Field(..., description="Dataset usage.")
    dataset_config: Optional[Dict[str, Any]] = Field(None, description="Dataset configuration.")
    total_samples: Optional[int] = Field(None, description="Total sample count.")
    total_characters: Optional[int] = Field(None, description="Total character count.")
    file_size: Optional[float] = Field(None, description="File size in MB.")
    file_size_display: Optional[str] = Field(None, description="Formatted file size.")
    dataset_path: str = Field(..., description="Dataset storage path.")
    processing_status: DatasetProcessingStatus = Field(..., description="Processing status.")
    processing_status_display: Optional[str] = Field(None, description="Processing status display text.")
    processing_error: Optional[str] = Field(None, description="Processing error message.")
    created_at: datetime = Field(..., description="Creation time.")
    updated_at: datetime = Field(..., description="Last update time.")
    created_by: Optional[str] = Field(None, description="Creator.")
    attr_values: Optional[List[Any]] = Field(default_factory=list, description="Related attribute values.")


class OpenTrainingDatasetCreateResult(BaseModel):
    id: int = Field(..., description="Dataset ID.")


class OpenTrainingDatasetExportTaskResponse(BaseModel):
    status: str = Field(..., description="Export task status.")
    task_id: Optional[str] = Field(None, description="Async export task ID.")
    dataset_id: int = Field(..., description="Dataset ID.")
    export_format: str = Field(..., description="Export file format.")
    message: str = Field(..., description="User-facing retry message.")


class OpenTrainingDatasetSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Dataset ID.")
    dataset_name: str = Field(..., description="Dataset name.")
    version_count: int = Field(..., description="Version count.")
    dataset_type: TrainingTypeCategory = Field(..., description="Dataset type.")
    training_method_type: TrainingMethodType = Field(..., description="Training method type.")
    dataset_format: DatasetFormat = Field(..., description="Dataset format.")
    usage: DatasetUsage = Field(..., description="Dataset usage.")
    project_id: int = Field(..., description="Project ID.")
    latest_version: str = Field(..., description="Latest version.")
    earliest_version: str = Field(..., description="Earliest version.")
    processing_status: Optional[DatasetProcessingStatus] = Field(None, description="Latest version processing status.")
    processing_status_display: Optional[str] = Field(None, description="Processing status display text.")
    processing_error: Optional[str] = Field(None, description="Processing error message.")
    created_at: datetime = Field(..., description="First creation time.")
    updated_at: datetime = Field(..., description="Last update time.")
    created_by: Optional[str] = Field(None, description="Creator.")


class OpenDatasetSample(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    row_number: int = Field(..., description="Row number, starting from 1.")
    sample_data: Any = Field(..., description="Sample data.")


class OpenDatasetSamplePage(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: List[OpenDatasetSample] = Field(default_factory=list, description="Current page samples.")
    total: int = Field(..., description="Total sample count.")
    page: int = Field(..., description="Current page number.")
    size: int = Field(..., description="Number of samples per page.")
    pages: int = Field(..., description="Total pages.")
    base_url: Optional[str] = Field(None, description="Base path for image assets. Only returned for image understanding datasets.")


class OpenDatasetInUse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    in_use: bool = Field(..., description="Whether the dataset is currently in use.")
    task_type: Optional[str] = Field(None, description="Task type using this dataset.")
    task_id: Optional[int] = Field(None, description="Task ID using this dataset.")
    task_name: Optional[str] = Field(None, description="Task name using this dataset.")
    version: Optional[str] = Field(None, description="Dataset version.")


class OpenCountByValue(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    value: str = Field(..., description="Dimension value.")
    count: int = Field(..., description="Item count for the dimension value.")


class OpenAttrOptionGroup(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str = Field(..., description="Attribute name.")
    options: List[OpenCountByValue] = Field(default_factory=list, description="Option values and counts.")


class OpenTrainingDatasetAggregation(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    usage: Optional[List[OpenCountByValue]] = Field(None, description="Counts grouped by usage.")
    dataset_format: Optional[List[OpenCountByValue]] = Field(None, description="Counts grouped by dataset format.")
    dataset_type: Optional[List[OpenCountByValue]] = Field(None, description="Counts grouped by dataset type.")
    attr_option: Optional[List[OpenAttrOptionGroup]] = Field(None, description="Counts grouped by attribute option.")
