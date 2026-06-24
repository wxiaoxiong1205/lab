"""
多人标注API路由

接口前缀：/api/v1/multi-label
"""
from typing import Optional, Tuple

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query, Path, status
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.label import LabelTaskBizType
from app.schemas.multi_label import (
    MultiLabelTaskCreate, MultiLabelTaskDetailResponse,
    MultiLabelTaskPublishResponse,
    MultiLabelDataResponse, MultiLabelAnnotationSaveRequest, MultiLabelAnnotationSaveResponse,
    MultiLabelSubmitAllRequest, MultiLabelSubmitAllResponse,
    MultiLabelCompletionStatusResponse,
    MultiLabelAuditDataResponse, MultiLabelAuditSubmitRequest, MultiLabelAuditSubmitResponse,
    MultiLabelAuditCompletionStatusResponse,
    AuditStatusFilter,
    TaskOverviewResponse, MultiLabelProjectAdminAccessResponse, AnnotationTaskResponse, AuditTaskResponse,
    AdminDataResponse,
    MultiLabelMemberReplaceRequest, MultiLabelMemberReplaceResponse,
)
from app.services.multi_label.interface import MultiLabelService
from app.utils.auth import get_current_user
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/api/v1/multi-label", tags=["multi-label"])


# ------------------------------ 任务管理接口 ------------------------------
@router.post("/project/{project_id}/tasks", status_code=status.HTTP_201_CREATED)
@inject
async def create_multi_label_task(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_create: MultiLabelTaskCreate = ...,
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> dict:
    """
    创建多人标注任务

    仅租户管理员、平台管理员或项目管理员可操作

    返回: {"id": 任务ID}
    """
    return await multi_label_service.create_multi_label_task(current_user, project_id, task_create)


@router.get(
    "/project/{project_id}/admin-access",
    response_model=MultiLabelProjectAdminAccessResponse,
)
@inject
async def get_multi_label_project_admin_access(
    project_id: int = Path(..., description="项目ID", gt=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service]),
) -> MultiLabelProjectAdminAccessResponse:
    """
    多人标注：当前用户在项目下的管理员访问权限

    `can_access` 为 true 表示具备项目维度多人标注管理员身份（租户/平台/项目管理员），
    与任务总览、管理员数据总览等接口的权限判定一致，供前端统一控制菜单、路由与功能入口。
    """
    db, current_user = deps
    can_access = await multi_label_service.has_multi_label_project_admin_access(
        db, current_user, project_id
    )
    return MultiLabelProjectAdminAccessResponse(can_access=can_access)


@router.get("/project/{project_id}/tasks/overview", response_model=Page[TaskOverviewResponse])
@inject
async def list_task_overview(
    project_id: int = Path(..., description="项目ID", gt=0),
    biz_type: LabelTaskBizType = Query(LabelTaskBizType.LLM, description="任务业务类型枚举"),
    task_name: Optional[str] = Query(None, description="按任务名称模糊搜索"),
    page: int = Query(1, description="页码", ge=1),
    size: int = Query(50, description="每页数量", ge=1, le=100),
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> Page[TaskOverviewResponse]:
    """
    任务总览（管理员视图）

    展示所有任务的标注进度和审核进度。
    权限与 `GET .../admin-access` 的 `can_access` 一致；非管理员返回空列表。
    """
    return await multi_label_service.list_task_overview(
        current_user, project_id, biz_type, page, size, task_name
    )


@router.get("/project/{project_id}/tasks/annotation", response_model=Page[AnnotationTaskResponse])
@inject
async def list_annotation_tasks(
    project_id: int = Path(..., description="项目ID", gt=0),
    biz_type: LabelTaskBizType = Query(LabelTaskBizType.LLM, description="任务业务类型枚举"),
    task_name: Optional[str] = Query(None, description="按任务名称模糊搜索"),
    page: int = Query(1, description="页码", ge=1),
    size: int = Query(50, description="每页数量", ge=1, le=100),
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> Page[AnnotationTaskResponse]:
    """
    在线任务（标注人员视图）
    
    只展示分配给当前用户的任务及其标注进度
    """
    return await multi_label_service.list_annotation_tasks(
        current_user, project_id, biz_type, page, size, task_name
    )


@router.get("/project/{project_id}/tasks/audit-list", response_model=Page[AuditTaskResponse])
@inject
async def list_audit_tasks(
    project_id: int = Path(..., description="项目ID", gt=0),
    biz_type: LabelTaskBizType = Query(LabelTaskBizType.LLM, description="任务业务类型枚举"),
    task_name: Optional[str] = Query(None, description="按任务名称模糊搜索"),
    page: int = Query(1, description="页码", ge=1),
    size: int = Query(50, description="每页数量", ge=1, le=100),
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> Page[AuditTaskResponse]:
    """
    审核任务（审核人员视图）
    
    只展示分配给当前用户的审核任务及其审核进度
    """
    return await multi_label_service.list_audit_tasks(
        current_user, project_id, biz_type, page, size, task_name
    )


@router.get("/project/{project_id}/tasks/{task_id}", response_model=MultiLabelTaskDetailResponse)
@inject
async def get_multi_label_task_detail(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_id: int = Path(..., description="任务ID", gt=0),
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> MultiLabelTaskDetailResponse:
    """
    获取多人标注任务详情（含数据集、进度、成员）
    
    """
    return await multi_label_service.get_multi_label_task_detail(project_id, task_id)


@router.post("/project/{project_id}/tasks/{task_id}/publish", response_model=MultiLabelTaskPublishResponse)
@inject
async def publish_task(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_id: int = Path(..., description="任务ID", gt=0),
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> MultiLabelTaskPublishResponse:
    """
    发布任务（审核全部通过后生成训练数据集）
    
    仅项目管理员、平台管理员或租户管理员可操作。
    """
    return await multi_label_service.publish_task(current_user, project_id, task_id)


@router.delete("/project/{project_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_multi_label_task(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_id: int = Path(..., description="任务ID", gt=0),
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> None:
    """
    删除多人标注任务
    
    已发布任务也支持删除；仅项目管理员、平台管理员、租户管理员或任务创建者可操作。
    """
    await multi_label_service.delete_multi_label_task(current_user, project_id, task_id)


@router.post(
    "/project/{project_id}/tasks/{task_id}/members/replace",
    response_model=MultiLabelMemberReplaceResponse,
)
@inject
async def replace_multi_label_task_member(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_id: int = Path(..., description="任务ID", gt=0),
    body: MultiLabelMemberReplaceRequest = ...,
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service]),
) -> MultiLabelMemberReplaceResponse:
    """
    替换多人标注任务成员（仅管理员，权限同 admin-access / 任务总览）。

    将原成员在各处的用户标识统一为新用户：成员表、进度表、分配规则、本地分配缓存、
    Redis 标注暂存/已标 Set（标注员）、以及落盘审核/标注文件中的人员字段。
    """
    return await multi_label_service.replace_task_member(
        current_user, project_id, task_id, body
    )


# ------------------------------ 标注功能接口 ------------------------------
@router.get("/project/{project_id}/tasks/{task_id}/data", response_model=MultiLabelDataResponse)
@inject
async def get_annotation_data(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_id: int = Path(..., description="任务ID", gt=0),
    page: Optional[int] = Query(1, description="页码（从1开始）", ge=1),
    size: Optional[int] = Query(20, description="每页数量", ge=1, le=100),
    is_annotated: Optional[bool] = Query(None, description="标注状态过滤（true=已标注，false=未标注，不传=不过滤）"),
    status: Optional[str] = Query(None, description="状态筛选（pending/saved/submitted/audit_passed/audit_failed/resubmitted）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> MultiLabelDataResponse:
    """
    获取分配给当前用户的标注数据（分页）
    
    重要说明：
    - 接口会根据当前用户ID和角色，查询分配规则，通过算法计算分配给该用户的样本（row_number）
    - 只返回 row_number 在计算结果中的数据，确保用户每次看到的都是分配给自己的样本
    
    状态说明：
    - pending: 待标注（可编辑）
    - saved: 已暂存（可编辑）
    - submitted: 已提交（锁定，待审核）
    - audit_passed: 审核通过（锁定）
    - audit_failed: 审核不通过（可编辑，需重标）
    - resubmitted: 已重新提交（锁定，待重审）
    """
    return await multi_label_service.get_annotation_data(
        current_user, project_id, task_id, page, size, is_annotated, status
    )


@router.post("/project/{project_id}/annotations/save", response_model=MultiLabelAnnotationSaveResponse)
@inject
async def save_annotation(
    project_id: int = Path(..., description="项目ID", gt=0),
    request: MultiLabelAnnotationSaveRequest = ...,
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> MultiLabelAnnotationSaveResponse:
    """暂存单条标注数据（不提交）"""
    return await multi_label_service.save_annotation(current_user, project_id, request)


@router.post("/project/{project_id}/annotations/submit-all", response_model=MultiLabelSubmitAllResponse)
@inject
async def submit_all_annotations(
    project_id: int = Path(..., description="项目ID", gt=0),
    request: MultiLabelSubmitAllRequest = ...,
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> MultiLabelSubmitAllResponse:
    """
    提交全部标注（一次性提交所有已暂存的标注）
    
    重要说明：
    - 只有当分配给当前用户的所有数据都已暂存后，才能提交
    - 提交后数据将被锁定，不能再编辑
    - 提交后进入审核流程
    """
    return await multi_label_service.submit_all_annotations(current_user, project_id, request)


@router.get("/project/{project_id}/tasks/{task_id}/completion-status", response_model=MultiLabelCompletionStatusResponse)
@inject
async def get_completion_status(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_id: int = Path(..., description="任务ID", gt=0),
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> MultiLabelCompletionStatusResponse:
    """查询标注完成状态"""
    return await multi_label_service.get_completion_status(current_user, project_id, task_id)


# ------------------------------ 审核功能接口 ------------------------------
@router.get("/project/{project_id}/tasks/{task_id}/audit-completion-status", response_model=MultiLabelAuditCompletionStatusResponse)
@inject
async def get_audit_completion_status(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_id: int = Path(..., description="任务ID", gt=0),
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> MultiLabelAuditCompletionStatusResponse:
    """查询当前审核员的完成状态（用于判断是否可以提交）"""
    return await multi_label_service.get_audit_completion_status(current_user, project_id, task_id)


@router.get("/project/{project_id}/tasks/{task_id}/audit", response_model=MultiLabelAuditDataResponse)
@inject
async def get_audit_data(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_id: int = Path(..., description="任务ID", gt=0),
    page: Optional[int] = Query(1, description="页码", ge=1),
    size: Optional[int] = Query(20, description="每页数量", ge=1, le=100),
    audit_status: Optional[AuditStatusFilter] = Query(None, description="审核状态过滤：unaudited/passed/failed"),
    is_reaudit: Optional[bool] = Query(None, description="是否只显示重审数据（true/false）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> MultiLabelAuditDataResponse:
    """
    获取分配给当前审核员的待审核数据（分页）
    
    重要说明：
    - 接口会根据当前审核员ID，查询分配规则（role='auditor'），通过算法计算分配给该审核员的样本（row_number）
    - 只返回分配给当前审核员的样本，确保每次看到的都是分配给自己的样本
    """
    return await multi_label_service.get_audit_data(
        current_user, project_id, task_id, page, size, audit_status, is_reaudit
    )

@router.post("/project/{project_id}/audits/save", response_model=MultiLabelAuditSubmitResponse)
@inject
async def save_audit_result(
    project_id: int = Path(..., description="项目ID", gt=0),
    request: MultiLabelAuditSubmitRequest = ...,
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> MultiLabelAuditSubmitResponse:
    """暂存审核结果（通过/不通过）"""
    return await multi_label_service.save_audit_result(current_user, project_id, request)


@router.post("/project/{project_id}/tasks/{task_id}/audit/submit", response_model=MultiLabelAuditSubmitResponse)
@inject
async def submit_audit_result(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_id: int = Path(..., description="任务ID", gt=0),
    current_user: JwtUserInfo = Depends(get_current_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> MultiLabelAuditSubmitResponse:
    """提交审核（完成）：校验当前审核员已全部审完分配数（可多审不可少审），通过即可提交"""
    return await multi_label_service.submit_audit_result(current_user, project_id, task_id)


# ------------------------------ 管理员视图接口 ------------------------------
@router.get("/project/{project_id}/tasks/{task_id}/overview-data", response_model=AdminDataResponse)
@inject
async def get_admin_overview_data(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_id: int = Path(..., description="任务ID", gt=0),
    page: Optional[int] = Query(1, description="页码", ge=1),
    size: Optional[int] = Query(20, description="每页数量", ge=1, le=100),
    is_annotated: Optional[str] = Query(None, description="是否已标注（true/false/空）"),
    audit_status: Optional[AuditStatusFilter] = Query(None, description="审核状态筛选（unaudited/passed/failed）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    multi_label_service: MultiLabelService = Depends(Provide[AutoContainer.multi_label_service])
) -> AdminDataResponse:
    """
    管理员数据总览（分页）- 仅限管理员访问
    
    展示所有数据的标注进度和审核结果：
    - 数据本身的字段（raw_data）
    - 标注信息（是否已标注、标注员、标注内容）
    - 审核信息（是否已审核、审核员、审核结果）
    """
    db, current_user = deps
    
    # 处理空字符串参数
    is_annotated_bool: Optional[bool] = None
    if is_annotated and is_annotated.strip():
        is_annotated_bool = is_annotated.lower() == 'true'

    return await multi_label_service.get_admin_overview_data(
        db, current_user, project_id, task_id, page, size,
        is_annotated_bool, audit_status
    )
