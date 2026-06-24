import json
import logging
from typing import List, Optional

import requests
from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Path, status, Query
from fastapi_pagination import Page

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import JwtUserInfo
from app.schemas.business_inference_result_dataset import BusinessInferenceResultDatasetCreate
from app.services.business_inference_result_dataset.interface import BusinessInferenceResultDatasetService
from app.utils.auth import get_current_user
router = APIRouter(prefix="/api/v1/business_inference_result_dataset", tags=["business_inference_result_dataset"])
logger = logging.getLogger(__name__)




@router.post("/project/{project_id}/create", response_model=bool, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.BUSINESS_INFERENCE_RESULT_DATASET, table_name="business_inference_result_dataset",
                        operator_type=OperatorType.ADD, operator_content_key=["request.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def create_business_inference_result_dataset(
    request: BusinessInferenceResultDatasetCreate,
    project_id: int = Path(..., description="项目ID"),
    current_user: JwtUserInfo  = Depends(get_current_user),
    third_party_api_service: BusinessInferenceResultDatasetService = Depends(Provide[AutoContainer.business_inference_result_dataset_service]),
) -> bool:

    api = await third_party_api_service.create(project_id, current_user, request)
    return api
