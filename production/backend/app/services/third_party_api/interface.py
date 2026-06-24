from abc import ABC, abstractmethod
from typing import Optional, List

from fastapi_pagination import Page

from app.models.models import JwtUserInfo, ThirdPartyApiServiceModel
from app.schemas.third_party_api import ThirdPartyApiCreate, ThirdPartyApiListResponse, \
    ThirdPartyApiDetailResponse, ThirdPartyApiUpdateRequest, ThirdPartyApiVerifyConnectResponse, \
    ThirdPartyApiVerifyConnectRequest, ThirdPartyApiBindingFileds
from app.services.training_dataset.interface import TrainingDatasetService


class ThirdPartyApiService(ABC):
    @abstractmethod
    async def create(self, project_id: int,
                     current_user: JwtUserInfo,
                     request: ThirdPartyApiCreate) -> bool:
        pass




    @abstractmethod
    async def list_api(self, project_id: int,
                            current_user: JwtUserInfo,
                            page_num: int,
                            page_size: int,
                            name: Optional[str] = None,
                            status: Optional[str] = None
                       ) -> Page[ThirdPartyApiListResponse]:
        pass

    @abstractmethod
    async def get_api_detail(self, project_id: int,
                                 current_user: JwtUserInfo,
                                 api_id: int) -> ThirdPartyApiDetailResponse:
        pass

    @abstractmethod
    async def delete(self,project_id: int,
                     ids: List[int]) -> None:
        pass

    @abstractmethod
    async def update(self, project_id: int,
                     current_user: JwtUserInfo,
                     request: ThirdPartyApiUpdateRequest,

                     ) -> bool:
        pass

    @abstractmethod
    async  def verify_connect(self,project_id:int,
                              current_user:JwtUserInfo
                              ,request :ThirdPartyApiVerifyConnectRequest)->ThirdPartyApiVerifyConnectResponse:
        pass


    @abstractmethod
    async def get_api_binding_field_info(self, project_id: int, current_user: JwtUserInfo,id :int
                                         ) -> ThirdPartyApiBindingFileds:
        pass

    async def business_dataset_matedata(self, project_id:int, current_user:JwtUserInfo, dataset_id :int, training_dataset_service:TrainingDatasetService )->ThirdPartyApiBindingFileds:
        pass
