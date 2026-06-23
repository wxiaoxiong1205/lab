from abc import ABC, abstractmethod
from typing import List, Optional

from fastapi_pagination import Page

from app.schemas.openapi_application import (
    OpenAPIApplicationCreateRequest,
    OpenAPIApplicationResponse,
    OpenAPIApplicationUpdateRequest,
)


class OpenAPIApplicationService(ABC):

    @abstractmethod
    async def create(self, request: OpenAPIApplicationCreateRequest) -> bool:
        pass

    @abstractmethod
    async def update(
        self,
        application_id: int,
        request: OpenAPIApplicationUpdateRequest,
    ) -> bool:
        pass

    @abstractmethod
    async def list_applications(
        self,
        page_num: Optional[int],
        page_size: Optional[int],
        name: Optional[str] = None,
        group_id: Optional[str] = None,
        key_id: Optional[str] = None,
    ) -> Page[OpenAPIApplicationResponse]:
        pass

    @abstractmethod
    async def detail(self, application_id: int) -> OpenAPIApplicationResponse:
        pass

    @abstractmethod
    async def delete(self, ids: List[int]) -> None:
        pass
