from datetime import datetime
import logging
from typing import Optional, List

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends
from fastapi_pagination import Page
from starlette.responses import StreamingResponse

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo, OperatorLogs
from app.schemas.common import ResModel
from app.schemas.log import OperatorLogsResponse, OperatorLogsRequest, BatchApprovalUpdateRequest
from app.schemas.workbench_page import WorkbenchPagePayload
from app.services.log.interface import OperatorLogsService
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/v1/operator_log", tags=["operator_log"])
logger = logging.getLogger(__name__)


@router.get("/function_type", response_model=ResModel[List[str]], description="返回功能的枚举")
@inject
async def list_operator_logs(
        # 使用组合依赖
        operator_logs_service: OperatorLogsService = Depends(Provide[AutoContainer.operator_logs_service])
) -> ResModel[List[str]]:
    res: ResModel[List[str]] = ResModel(code=0, msg="success")
    function_type_list = await operator_logs_service.get_function_type_enum()
    res.payload = function_type_list
    return res


@router.get("/operator_type", response_model=ResModel[List[str]], description="返回操作类型的枚举")
@inject
async def list_operator_logs(
        # 使用组合依赖
        operator_logs_service: OperatorLogsService = Depends(Provide[AutoContainer.operator_logs_service])
) -> ResModel[List[str]]:
    res: ResModel[List[str]] = ResModel(code=0, msg="success")
    function_type_list = await operator_logs_service.get_operator_type_enum()
    res.payload = function_type_list
    return res


@router.get("/list", response_model=ResModel[WorkbenchPagePayload[OperatorLogsResponse]], description="日志查询接口，支持分页")
@inject
async def list_operator_logs(
        # 使用组合依赖
        page: Optional[int] = None,
        size: Optional[int] = None,
        query: OperatorLogsRequest = Depends(),
        current_user: JwtUserInfo = Depends(get_current_user),
        operator_logs_service: OperatorLogsService = Depends(Provide[AutoContainer.operator_logs_service])
) -> ResModel[WorkbenchPagePayload[OperatorLogsResponse]]:
    res = ResModel(code=0, msg="success")
    page_data = await operator_logs_service.list(current_user=current_user, page_num=page, page_size=size,
                                                 operator_log=query)
    res.payload = page_data
    return res


@router.patch("/approval/batch", response_model=ResModel[bool], description="批量更新日志审计状态")
@inject
async def batch_update_approval_status(
        request_data: BatchApprovalUpdateRequest,
        current_user: JwtUserInfo = Depends(get_current_user),
        operator_logs_service: OperatorLogsService = Depends(Provide[AutoContainer.operator_logs_service])
) -> ResModel[bool]:
    await operator_logs_service.batch_update_approval_status(
        current_user=current_user,
        request=request_data
    )
    res = ResModel(code=0, msg="success", payload=True)
    return res



@router.delete("/clear", description="清理日志")
@inject
async def clear_operator_logs(
        # 使用组合依赖
        ids: Optional[str] = None,
        start_time: datetime = None,
        end_time: datetime = None,
        current_user: JwtUserInfo = Depends(get_current_user),
        operator_logs_service: OperatorLogsService = Depends(Provide[AutoContainer.operator_logs_service])
) -> ResModel:
    ids = [int(id.strip()) for id in ids.split(',') if id.strip()] if ids else None
    await operator_logs_service.delete_list(ids, start_time, end_time)

    res = ResModel(code=0, msg="success")
    return res


@router.get("/excel", description="导出excel")
@inject
async def export_excel(
        # 使用组合依赖
        ids: Optional[str] = None,
        current_user: JwtUserInfo = Depends(get_current_user),
        operator_logs_service: OperatorLogsService = Depends(Provide[AutoContainer.operator_logs_service])
) -> StreamingResponse:
    ids = [int(id.strip()) for id in ids.split(',') if id.strip()] if ids else None
    stram = await operator_logs_service.export_excel(ids)
    return StreamingResponse(
        stram,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=users.xlsx"}
    )


@router.get("/pdf", description="导出PDF")
@inject
async def export_pdf(
        # 使用组合依赖
        ids: Optional[str] = None,
        current_user: JwtUserInfo = Depends(get_current_user),
        operator_logs_service: OperatorLogsService = Depends(Provide[AutoContainer.operator_logs_service])
) -> StreamingResponse:
    ids = [int(id.strip()) for id in ids.split(',') if id.strip()] if ids else None
    stram = await operator_logs_service.export_pdf(ids)
    return StreamingResponse(
        stram,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=users.pdf"}
    )

