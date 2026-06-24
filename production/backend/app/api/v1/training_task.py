from datetime import datetime
from typing import List, Optional, Tuple

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Query, Path, status
from fastapi.responses import FileResponse
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession
from app.common.status import TaskStatus

from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.training_task import (
    TrainingTaskCreate,
    TrainingTaskResponse,
    TrainingTaskSummaryResponse,
    TrainingMethodType,
    TrainingTypeCategory,
    TrainingTaskCreatedResponse,
    MLflowTaskResponse,
    TrainingTaskLogResponse, CheckpointInfo,
    GrpoRewardFunctionValidateRequest,
    GrpoRewardFunctionValidateResponse
)
from app.services.training_task.interface import TrainingTaskService
from app.utils.dependencies import get_db_and_user
from app.utils.validators import validate_training_type_category, validate_training_method_type

router = APIRouter(prefix="/api/v1/training_tasks", tags=["training-tasks"])


@router.post("/grpo/reward-function/validate", response_model=GrpoRewardFunctionValidateResponse)
@inject
async def validate_grpo_reward_function(
    request: GrpoRewardFunctionValidateRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
) -> GrpoRewardFunctionValidateResponse:
    """校验GRPO奖励函数上传文件"""
    db, current_user = deps
    return await training_task_service.validate_grpo_reward_function(current_user, request)


@router.get("/grpo/reward-function/sample")
@inject
async def download_grpo_reward_function_sample(
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
) -> FileResponse:
    """下载GRPO奖励函数样例"""
    db, current_user = deps
    return await training_task_service.download_grpo_reward_function_sample()


@router.post("/project/{project_id}", response_model=TrainingTaskCreatedResponse, status_code=status.HTTP_202_ACCEPTED)
@inject
async def create_training_task(
    project_id: int = Path(..., description="项目ID"),
    task: TrainingTaskCreate = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
) -> TrainingTaskCreatedResponse:
    """创建训练任务（异步）
    
    Args:
        project_id: 项目ID
        task: 训练任务数据
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        创建的训练任务（状态为PENDING）
        
    Raises:
        HTTPException: 如果项目不存在或任务名称已存在
    """
    db, current_user = deps

    return await training_task_service.create_training_task(current_user, project_id, task)


@router.put("/project/{project_id}/task/{task_id}", response_model=TrainingTaskCreatedResponse, status_code=status.HTTP_200_OK)
@inject
async def update_training_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="训练任务ID"),
    task: TrainingTaskCreate = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
) -> TrainingTaskCreatedResponse:
    """编辑训练任务（参数与创建一致）"""
    db, current_user = deps
    return await training_task_service.update_training_task(current_user, project_id, task_id, task)


@router.post("/project/{project_id}/task/{task_id}/stop", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def stop_training_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="训练任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
):
    """终止训练任务，并按 Job 名删除 K8s 资源"""
    db, current_user = deps
    await training_task_service.stop_training_task(project_id, task_id)



@router.get("/project/{project_id}", response_model=Page[TrainingTaskSummaryResponse])
@inject
async def list_training_tasks(
    project_id: int = Path(..., description="项目ID"),
    name: Optional[str] = Query(None, description="按任务名称搜索"),
    train_type_category: Optional[TrainingTypeCategory] = Depends(validate_training_type_category),
    train_method_type: Optional[TrainingMethodType] = Depends(validate_training_method_type),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
) -> Page[TrainingTaskSummaryResponse]:
    """获取项目下的训练任务汇总列表，支持按训练类型筛选
    
    Args:
        project_id: 项目ID
        name: 按任务名称搜索
        train_type_category: 训练类型分类筛选（可选）
        train_method_type: 训练方法类型筛选（可选）
        deps: 组合依赖
        
    Returns:
        分页的训练任务汇总列表，每个任务名称只返回一条汇总记录
    """
    db, current_user = deps

    return await training_task_service.list_training_tasks(project_id, name, train_type_category, train_method_type)
    



@router.get("/project/{project_id}/task/{task_name}", response_model=List[TrainingTaskResponse])
@inject
async def get_training_task_versions(
    project_id: int = Path(..., description="项目ID"),
    task_name: str = Path(..., description="训练任务名称"),
    status: Optional[TaskStatus] = Query(None, description="训练任务状态"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
) -> List[TrainingTaskResponse]:
    """根据任务名称获取该任务的所有版本
    
    Args:
        project_id: 项目ID
        task_name: 训练任务名称
        status: 训练任务状态-可选
        deps: 组合依赖
        
    Returns:
        该任务名称下的所有版本列表，按版本号排序
        
    Raises:
        HTTPException: 如果项目不存在或任务不存在
    """
    db, current_user = deps

    return await training_task_service.get_training_task_versions(project_id, task_name, status)
    



@router.delete("/project/{project_id}/task/{task_name}/version/{version}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_training_task_version(
    project_id: int = Path(..., description="项目ID"),
    task_name: str = Path(..., description="训练任务名称"),
    version: str = Path(..., description="任务版本号"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
) -> None:
    """删除指定版本的训练任务
    
    Args:
        project_id: 项目ID
        task_name: 训练任务名称
        version: 任务版本号
        deps: 组合依赖
        
    Raises:
        HTTPException: 如果任务不存在或状态不允许删除
    """
    db, current_user = deps

    return await training_task_service.delete_training_task_version(project_id, task_name, version)
    



@router.delete("/project/{project_id}/task/{task_name}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_all_training_task_versions(
    project_id: int = Path(..., description="项目ID"),
    task_name: str = Path(..., description="训练任务名称"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
) -> None:
    """删除指定任务名称下的所有版本
    
    Args:
        project_id: 项目ID
        task_name: 训练任务名称
        deps: 组合依赖
        
    Raises:
        HTTPException: 如果任务不存在或存在运行中的版本
    """
    db, current_user = deps
    return await training_task_service.delete_all_training_task_versions(project_id, task_name)
    


@router.get("/project/{project_id}/task/{task_name}/version/{version}/download-config")
@inject
async def download_llama_factory_config(
    project_id: int = Path(..., description="项目ID"),
    task_name: str = Path(..., description="训练任务名称"),
    version: str = Path(..., description="训练任务版本"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
):
    """下载训练任务的LlamaFactory配置文件
    
    Args:
        project_id: 项目ID
        task_name: 训练任务名称
        version: 训练任务版本
        deps: 组合依赖
        
    Returns:
        YAML配置文件下载响应
        
    Raises:
        HTTPException: 如果任务不存在
    """
    
    db, current_user = deps
    return await training_task_service.download_llama_factory_config(project_id, task_name, version)


@router.get("/project/{project_id}/task/{task_id}/logs", response_model=TrainingTaskLogResponse)
@inject
async def get_training_task_logs(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="训练任务ID"),
    end_time: datetime = Query(..., description="结束时间（ISO格式），用于指定Loki查询的结束时间点"),
    days: Optional[int] = Query(30, description="如果没有归档日志，从结束时间往前查询N天的日志"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
) -> TrainingTaskLogResponse:
    """获取训练任务日志
    
    Args:
        project_id: 项目ID
        task_id: 训练任务ID
        end_time: 结束时间（可选），用于指定Loki查询的结束时间点
        days: 如果没有归档日志，从结束时间往前查询N天的日志（可选）
        deps: 组合依赖
        
    Returns:
        训练任务日志响应，包含是否归档和日志内容
    """
    db, current_user = deps
    return await training_task_service.get_training_task_logs(project_id, task_id, end_time, days)


@router.get("/project/{project_id}/task/{task_id}/logs/range", response_model=TrainingTaskLogResponse)
@inject
async def get_training_task_logs_by_time_range(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="训练任务ID"),
    start_time: datetime = Query(..., description="开始时间（ISO格式）"),
    end_time: datetime = Query(..., description="结束时间（ISO格式）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
) -> TrainingTaskLogResponse:
    """获取指定时间范围的训练任务日志"""
    db, current_user = deps
    return await training_task_service.get_training_task_logs_by_time_range(project_id, task_id, start_time, end_time)
    



@router.get("/project/{project_id}/task/{task_name}/version/{version}/mlflow", response_model=MLflowTaskResponse)
@inject
async def get_training_task_mlflow_info(
    project_id: int = Path(..., description="项目ID"),
    task_name: str = Path(..., description="训练任务名称"),
    version: str = Path(..., description="任务版本"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
) -> MLflowTaskResponse:
    """获取训练任务版本的 MLflow 信息
    
    Args:
        project_id: 项目ID
        task_name: 训练任务名称
        version: 任务版本
        deps: 数据库和用户依赖
        
    Returns:
        MLflowTaskResponse: 包含 MLflow 运行信息的响应
    """
    db, current_user = deps
    return await training_task_service.get_training_task_mlflow_info(project_id, task_name, version)


@router.get("/project/{project_id}/task/{task_id}/checkpoints", response_model=List[CheckpointInfo])
@inject
async def get_training_task_checkpoints(
        project_id: int = Path(..., description="项目ID"),
        task_id: int = Path(..., description="训练任务id"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        training_task_service: TrainingTaskService = Depends(Provide[AutoContainer.training_task_service])
) -> List[CheckpointInfo]:
    """获取训练任务的checkpoints信息

    Args:
        project_id: 项目ID
        task_id: 训练任务id
        deps: 数据库和用户依赖

    Returns:
        List[CheckpointInfo]: 包含训练后checkpoints信息的响应
    """
    db, current_user = deps
    return await training_task_service.get_training_task_checkpoints(project_id, task_id)
