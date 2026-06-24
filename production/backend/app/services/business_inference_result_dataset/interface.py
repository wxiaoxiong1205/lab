from abc import ABC, abstractmethod
from typing import Optional, List

from fastapi_pagination import Page
from app.repository.inference_result_mapper import InferenceResultDatasetMapper
from app.repository.training_dataset_mapper import TrainingDatasetMapper
from app.services.storage.interface import StorageService
from app.repository.third_party_api_mapper import ThirdPartyApiMapper
from app.repository.task_execution_mapper import TaskExecutionMapper
from app.models import InferenceResultDataset
from app.models.models import JwtUserInfo, ThirdPartyApiServiceModel
from app.schemas.business_inference_result_dataset import BusinessInferenceResultDatasetCreate
from app.schemas.third_party_api import ThirdPartyApiCreate, ThirdPartyApiListResponse, \
    ThirdPartyApiDetailResponse, ThirdPartyApiUpdateRequest, ThirdPartyApiVerifyConnectResponse, \
    ThirdPartyApiVerifyConnectRequest, ThirdPartyApiBindingFileds


class BusinessInferenceResultDatasetService(ABC):
    def __init__(self, mapper: InferenceResultDatasetMapper
                 ,trainDataMapper: TrainingDatasetMapper
                 , storage: StorageService
                 ,third_party_api_mapper: ThirdPartyApiMapper
                 ,task_mapper: TaskExecutionMapper
                 ) -> None:
        self.api_server = None
        self.mapper = mapper
        self.trainDataMapper=  trainDataMapper
        self.storage= storage
        self.third_party_api_mapper=third_party_api_mapper
        self.task_mapper=task_mapper


    @abstractmethod
    async def create(self, project_id: int,
                     current_user: JwtUserInfo,
                     request: BusinessInferenceResultDatasetCreate
                     ,manual_trigger_required: bool) -> bool:
        pass


    @abstractmethod
    async def create_by_em(self, project_id: int,
                     current_user: JwtUserInfo,
                     request: BusinessInferenceResultDatasetCreate
                    , manul_trigger_required: bool
                           ) -> InferenceResultDataset:
        pass
