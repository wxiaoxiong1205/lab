from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel, Field

from app.core.logging import get_request_id

T = TypeVar("T")


class OpenApiResponse(BaseModel, Generic[T]):
    success: bool = Field(True, description="Whether the request succeeded.")
    data: Optional[T] = Field(None, description="Response payload.")
    request_id: Optional[str] = Field(None, description="Request trace ID.")


class OpenApiPageData(BaseModel, Generic[T]):
    items: List[T] = Field(default_factory=list, description="Current page items.")
    page: int = Field(..., description="Current page number, starting from 1.")
    size: int = Field(..., description="Number of items per page.")
    total: int = Field(..., description="Total number of items.")
    pages: int = Field(..., description="Total number of pages.")


def openapi_success(data: Optional[T] = None, request_id: Optional[str] = None) -> OpenApiResponse[T]:
    if request_id is None:
        request_id = get_request_id() or None
    return OpenApiResponse(data=data, request_id=request_id)
