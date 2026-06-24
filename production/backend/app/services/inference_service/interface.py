from abc import ABC, abstractmethod
from typing import List, Optional

from fastapi_pagination import Page

from app.models.models import JwtUserInfo
from app.schemas.inference_service import InferenceServiceCreateRequest, \
    InferenceServiceUpdateRequest, InferenceServiceTestRequest, InferenceServiceListItemResponse, \
    InferenceServiceDetailResponse
from app.schemas.workbench_page import WorkbenchPagePayload


class InferenceServiceService(ABC):
    @abstractmethod
    async def create(self, project_id: int,
                     current_user: JwtUserInfo,
                     request: InferenceServiceCreateRequest) -> bool:
        pass

    @abstractmethod
    async def list_services(self, project_id: int,
                            current_user: JwtUserInfo,
                            page_num: int,
                            page_size: int,
                            name: Optional[str] = None,
                            status: Optional[str] = None,
                            model_type: Optional[str] = None) -> Page[InferenceServiceListItemResponse]:
        pass

    @abstractmethod
    async def get_service_detail(self, project_id: int,
                                 current_user: JwtUserInfo,
                                 service_id: int) -> InferenceServiceDetailResponse:
        pass

    @abstractmethod
    async def delete(self,project_id: int,
                     ids: List[int]) -> None:
        pass

    @abstractmethod
    async def update(self, project_id: int,
                     current_user: JwtUserInfo,
                     request: InferenceServiceUpdateRequest) -> bool:
        pass

    @abstractmethod
    async def test_connectivity(self, project_id: int,
                                current_user: JwtUserInfo,
                                request: InferenceServiceTestRequest) -> bool:
        pass

    @abstractmethod
    async def get_by_id(self, id_field_value):
        pass


