import io
from typing import Optional, List

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query, Path, status, Body
from fastapi_pagination import Page
from fastapi.responses import StreamingResponse

from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.benchmark_task import (
    BenchmarkTaskCreate,
    BenchmarkTaskUpdate,
    BenchmarkTaskSummaryResponse,
    BenchmarkTaskDetailResponse,
    BenchmarkDatasetResponse,
    BenchmarkLeaderboardItemResponse,
    BenchmarkTaskCompareRequest,
    BenchmarkTaskCompareResponse,
    BenchmarkTaskLogResponse,
    BenchmarkTaskReportResponse,
)
from app.services.benchmark_task.interface import BenchmarkTaskService
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/v1/benchmark", tags=["benchmark"])


# ==================== 数据集管理 ====================

@router.get("/datasets", response_model=List[BenchmarkDatasetResponse])
@inject
async def list_datasets(
    category: Optional[str] = Query(None, description="数据集分类筛选"),
    model_type: Optional[str] = Query(None, description="模型类型筛选：text-generation/image-generation/image-understanding/multimodal"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
) -> List[BenchmarkDatasetResponse]:
    """获取基准评估数据集列表（按分类、模型类型组织）；含全局 + 当前租户数据集"""
    return await benchmark_task_service.list_datasets(category, model_type, current_user.tenantId)


# ==================== 任务管理 ====================

@router.post("/project/{project_id}/tasks", response_model=BenchmarkTaskDetailResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_task(
    project_id: int = Path(..., description="项目ID"),
    task: BenchmarkTaskCreate = Body(..., description="创建基准评估任务请求"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
) -> BenchmarkTaskDetailResponse:
    """创建基准评估任务"""
    return await benchmark_task_service.create_task(current_user, project_id, task)


@router.get("/project/{project_id}/tasks", response_model=Page[BenchmarkTaskSummaryResponse])
@inject
async def list_tasks(
    project_id: int = Path(..., description="项目ID"),
    name: Optional[str] = Query(None, description="任务名称（支持模糊搜索）"),
    status: Optional[str] = Query(None, description="任务状态筛选"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
) -> Page[BenchmarkTaskSummaryResponse]:
    """获取项目下的基准评估任务列表（分页）"""
    return await benchmark_task_service.list_tasks(project_id, name, status, page, size)


@router.get("/project/{project_id}/tasks/{id}", response_model=BenchmarkTaskDetailResponse)
@inject
async def get_task(
    project_id: int = Path(..., description="项目ID"),
    id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
) -> BenchmarkTaskDetailResponse:
    """获取指定基准评估任务详情"""
    return await benchmark_task_service.get_task(project_id, id)


@router.put("/project/{project_id}/tasks/{id}", response_model=BenchmarkTaskDetailResponse)
@inject
async def update_task(
    project_id: int = Path(..., description="项目ID"),
    id: int = Path(..., description="任务ID"),
    task: BenchmarkTaskUpdate = Body(..., description="更新基准评估任务请求"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
) -> BenchmarkTaskDetailResponse:
    """编辑任务配置"""
    return await benchmark_task_service.update_task(current_user, project_id, id, task)


@router.delete("/project/{project_id}/tasks/{id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_task(
    project_id: int = Path(..., description="项目ID"),
    id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
):
    """删除任务（运行中需先终止）"""
    await benchmark_task_service.delete_task(project_id, id)


@router.post("/project/{project_id}/tasks/{id}/start", status_code=status.HTTP_200_OK)
@inject
async def start_task(
    project_id: int = Path(..., description="项目ID"),
    id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
):
    """启动任务"""
    await benchmark_task_service.start_task(project_id, id)


@router.post("/project/{project_id}/tasks/{id}/cancel", status_code=status.HTTP_200_OK)
@inject
async def cancel_task(
    project_id: int = Path(..., description="项目ID"),
    id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
):
    """终止基准评估任务"""
    await benchmark_task_service.cancel_task(project_id, id)


@router.post("/project/{project_id}/tasks/{id}/resubmit", status_code=status.HTTP_200_OK)
@inject
async def resubmit_task(
    project_id: int = Path(..., description="项目ID"),
    id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
):
    """重新提交任务（失败/已取消状态）"""
    await benchmark_task_service.resubmit_task(project_id, id)


@router.post("/project/{project_id}/tasks/{id}/clone", response_model=BenchmarkTaskDetailResponse, status_code=status.HTTP_201_CREATED)
@inject
async def clone_task(
    project_id: int = Path(..., description="项目ID"),
    id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
) -> BenchmarkTaskDetailResponse:
    """克隆任务"""
    return await benchmark_task_service.clone_task(current_user, project_id, id)


@router.post("/project/{project_id}/tasks/compare", response_model=BenchmarkTaskCompareResponse)
@inject
async def compare_tasks(
    project_id: int = Path(..., description="项目ID"),
    request: BenchmarkTaskCompareRequest = Body(..., description="对比评估请求"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
) -> BenchmarkTaskCompareResponse:
    """对比评估（传入任务ID列表，2-5个，返回对比数据）"""
    return await benchmark_task_service.compare_tasks(project_id, request)


@router.post("/project/{project_id}/tasks/compare/download-docx")
@inject
async def download_benchmark_compare_report_docx(
    project_id: int = Path(..., description="项目ID"),
    request: BenchmarkTaskCompareRequest = Body(..., description="对比评估请求，与 compare 接口一致（task_ids 列表 2-5 个）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
):
    """下载对比评估报告 DOCX。请求体与 compare 接口相同，返回包含雷达图、评估指标明细表、评分对比柱状图的 Word 文档。"""
    return await benchmark_task_service.download_benchmark_compare_report_docx(project_id, request)


# ==================== 评估报告和日志 ====================

@router.get("/project/{project_id}/tasks/{id}/report", response_model=BenchmarkTaskReportResponse)
@inject
async def get_task_report(
    project_id: int = Path(..., description="项目ID"),
    id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
) -> BenchmarkTaskReportResponse:
    """获取评估报告"""
    return await benchmark_task_service.get_task_report(project_id, id)


@router.get("/project/{project_id}/tasks/{id}/report/download-docx")
@inject
async def download_benchmark_report_docx(
    project_id: int = Path(..., description="项目ID"),
    id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
):
    """下载基准评估报告 DOCX 文件。包含任务基本信息、评估结果与图表（雷达图、明细表、柱状图）。"""
    return await benchmark_task_service.download_benchmark_report_docx(project_id, id)


@router.get("/project/{project_id}/tasks/{id}/download-result")
@inject
async def download_task_result_file(
    project_id: int = Path(..., description="项目ID"),
    id: int = Path(..., description="任务ID"),
    dataset_code: str = Query(..., description="数据集代码（如 humaneval）"),
    model_id: Optional[int] = Query(None, description="模型ID，不传则使用该任务下第一个模型"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
):
    """下载基准评估结果 JSON 文件（JFS 上 predictions/{model_name}/{dataset}.json）"""
    content = await benchmark_task_service.download_task_result_file(
        project_id, id, dataset_code=dataset_code, model_id=model_id
    )
    filename = f"openai_{dataset_code}.json" if dataset_code else "result.json"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/project/{project_id}/tasks/{id}/logs", response_model=BenchmarkTaskLogResponse)
@inject
async def get_task_logs(
    project_id: int = Path(..., description="项目ID"),
    id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
) -> BenchmarkTaskLogResponse:
    """获取基准评估任务日志

    - 优先返回归档日志（MinIO）
    - 如果没有归档，则从 Loki 获取实时日志
    """
    return await benchmark_task_service.get_task_logs(project_id, id)


@router.get("/project/{project_id}/tasks/download/log/{id}")
@inject
async def download_task_log(
    project_id: int = Path(..., description="项目ID"),
    id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
):
    """下载基准评估任务日志文件（优先归档日志，其次 Loki 实时日志）"""
    content = await benchmark_task_service.download_task_log(project_id, id)
    filename = f"benchmark_task_log_{id}.log"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ==================== 榜单管理 ====================

@router.get("/project/{project_id}/leaderboard", response_model=Page[BenchmarkLeaderboardItemResponse])
@inject
async def get_leaderboard(
    project_id: int = Path(..., description="项目ID"),
    sort_by: str = Query("average_score", description="排序字段：average_score（平均分）或数据集代码（如cmmlu、mmlu等）"),
    sort_order: str = Query("desc", description="排序方向：asc（升序）或desc（降序）"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
) -> Page[BenchmarkLeaderboardItemResponse]:
    """获取榜单列表（分页、支持按平均分或指定数据集得分排序）"""
    return await benchmark_task_service.get_leaderboard(project_id, sort_by, sort_order, page, size)


@router.get("/project/{project_id}/leaderboard/radar-chart", response_model=BenchmarkTaskReportResponse)
@inject
async def get_radar_chart(
    project_id: int = Path(..., description="项目ID"),
    model_ids: List[int] = Query(..., description="模型ID列表（1-10个）", min_length=1, max_length=10),
    current_user: JwtUserInfo = Depends(get_current_user),
    benchmark_task_service: BenchmarkTaskService = Depends(Provide[AutoContainer.benchmark_task_service])
) -> BenchmarkTaskReportResponse:
    """获取雷达图数据

    ## 查询参数
    - `model_ids`: 模型ID列表，支持1-10个模型进行对比
    """
    return await benchmark_task_service.get_radar_chart(project_id, model_ids)
