from typing import Iterable, List, TypeVar

from fastapi_pagination import Page
from pydantic import BaseModel

from app.schemas.openapi.v1.common import OpenApiPageData
from app.schemas.openapi.v1.training_dataset import (
    OpenDatasetInUse,
    OpenDatasetSamplePage,
    OpenTrainingDataset,
    OpenTrainingDatasetAggregation,
    OpenTrainingDatasetSummary,
)

T = TypeVar("T", bound=BaseModel)


def _dump(value):
    return value.model_dump() if isinstance(value, BaseModel) else value


def to_model(model_type: type[T], value) -> T:
    return model_type.model_validate(_dump(value))


def to_model_list(model_type: type[T], values: Iterable) -> List[T]:
    return [to_model(model_type, value) for value in values]


def to_page_data(model_type: type[T], page: Page) -> OpenApiPageData[T]:
    return OpenApiPageData(
        items=to_model_list(model_type, page.items),
        page=page.page,
        size=page.size,
        total=page.total,
        pages=page.pages,
    )


def to_training_dataset(value) -> OpenTrainingDataset:
    return to_model(OpenTrainingDataset, value)


def to_training_dataset_id(value) -> int:
    data = _dump(value)
    return data["id"] if isinstance(data, dict) else data.id


def to_training_dataset_list(values) -> List[OpenTrainingDataset]:
    return to_model_list(OpenTrainingDataset, values)


def to_training_dataset_summary_page(page: Page) -> OpenApiPageData[OpenTrainingDatasetSummary]:
    return to_page_data(OpenTrainingDatasetSummary, page)


def to_dataset_sample_page(value) -> OpenDatasetSamplePage:
    return to_model(OpenDatasetSamplePage, value)


def to_dataset_in_use(value) -> OpenDatasetInUse:
    return to_model(OpenDatasetInUse, value)


def to_training_dataset_aggregation(value) -> OpenTrainingDatasetAggregation:
    return to_model(OpenTrainingDatasetAggregation, value)
