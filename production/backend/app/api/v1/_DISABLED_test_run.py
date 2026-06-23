import logging
from typing import List, Dict, Any, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from sqlalchemy.ext.asyncio import AsyncSession
import json
import uuid
from datetime import datetime
from sqlalchemy import select, delete, func, and_, desc
from sqlalchemy.orm import selectinload

from app.database.base import get_db
from app.models.models import DatasetLog, User, TestRun, Project, TestCase, DatasetDirectory, JwtUserInfo
from app.schemas.test_run import TestRunList, TestRunDetail, TestRunCreate
from app.schemas.task_log import TaskLogsResponse
from app.tasks.constants import TaskStatus
from app.utils.dependencies import get_db_and_user
from app.utils.redis_log_reader import get_task_logs, load_archived_logs_to_redis, redis_log_reader

from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import apaginate
from app.utils.error_messages import data_not_found_error

router = APIRouter(prefix="/api/v1/test_runs", tags=["test-runs"])
logger = logging.getLogger(__name__)


@router.post("/by-project/{project_id}", response_model=TestRunDetail, status_code=status.HTTP_201_CREATED)
async def create(
    project_id: int = Path(..., description="项目ID"),
    test_run_data: TestRunCreate = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)
) -> TestRun:
    """在指定项目下创建新的测试运行"""
    db, current_user = deps
    
    try:
        # 1. 验证项目是否存在
        project_result = await db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=data_not_found_error()
            )
        # 构建hyperparameters参数
        hyperparameters = {}
        model = None
        dataset_name = None

        try:
            logs_query = (
                select(DatasetLog)
                .where(
                    (DatasetLog.task_id == test_run_data.evaluate_id) &
                    (DatasetLog.log_type == "job")  
                )
                .order_by(DatasetLog.created_at)
                .limit(1)
            )
            logs_result = await db.execute(logs_query)
            dataset_log = logs_result.scalar_one_or_none()
            
            if not dataset_log:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=data_not_found_error()
                )
       
            # 获取配置信息
            model_config = getattr(dataset_log, "llm_config_content", {}) or {}
            prompt_config = getattr(dataset_log, "prompt_messages", {}) or {}
            dataset_content = getattr(dataset_log, "dataset_content", {}) or {}
            
            if model_config:
                hyperparameters.update({
                    "model": model_config.get("model", "Unknown Model"),
                    "prompt template": str(prompt_config.get("messages", "Unknown Prompt Template")),
                    "max_tokens": model_config.get("max_tokens"),
                    "temperature": model_config.get("temperature"),
                    "top_p": model_config.get("top_p"),
                    "frequency_penalty": model_config.get("frequency_penalty"),
                    "presence_penalty": model_config.get("presence_penalty"),
                    "base_url": model_config.get("base_url"),
                })
            
            # 获取模型信息
            model = model_config.get("model")
            project_id_from_log = dataset_content.get("project_id")
            directory_id = dataset_content.get("directory_id")
            
            directory_result = await db.execute(
                select(DatasetDirectory).where(
                    DatasetDirectory.id == directory_id,
                    DatasetDirectory.project_id == project_id_from_log
                )
            )
            directory = directory_result.scalar_one_or_none()
            dataset_name = directory.name if directory else "Unknown Dataset"

        except Exception as e:
            logger.warning(f"构建hyperparameters时出错: {str(e)}")
        
        
        #  创建TestRun实例
        test_run = TestRun(
            run_id=f"run_{uuid.uuid4().hex[:12]}",
            project_id=project_id,
            name=test_run_data.name,
            model=model,
            dataset=dataset_name,
            evaluate_id=test_run_data.evaluate_id,
            metrics=test_run_data.metrics,
            evaluate_model=test_run_data.evaluate_model,
            hyperparameters=hyperparameters,
            status=TaskStatus.CREATED,
            remark=test_run_data.remark,
        )
        
        #  保存到数据库
        db.add(test_run)
        await db.flush()  # 先刷新到数据库获取ID
        await db.commit()  # 提交事务
        
        return test_run
        
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        logger.error(f"Error creating test run in project {project_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error creating test run: {str(e)}"
        )

@router.get("/by-project/{project_id}/list", response_model=Page[TestRunList])
async def lists(
    project_id: int = Path(..., description="项目ID"),
    model: Optional[str] = Query(None, description="模型名称筛选"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)
) -> Page[TestRunList]:
    """获取指定项目下的测试运行列表"""
    db, current_user = deps
    
    try:
        project_result = await db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=data_not_found_error()
            )
        
        conditions = [TestRun.project_id == project_id]
        
        if model:
            conditions.append(TestRun.evaluate_model.like(f"%{model}%"))
            
        query = select(TestRun).where(and_(*conditions))
        query = query.order_by(TestRun.created_at.desc())
        
        return await apaginate(db, query)
        
    except Exception as e:
        logger.error(f"Error fetching test runs in project {project_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error fetching test runs: {str(e)}"
        )

@router.get("/by-project/{project_id}/test-run/{test_run_id}", response_model=TestRunDetail)
async def get(
    project_id: int = Path(..., description="项目ID"),
    test_run_id: int = Path(..., description="测试运行ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)
) -> Dict[str, Any]:
    """获取指定项目下测试运行的详细信息"""
    db, current_user = deps
    
    try:
        # 1 构建查询：根据test_run_id和project_id查找测试运行
        query = select(TestRun).where(
            TestRun.id == test_run_id,
            TestRun.project_id == project_id
        )  
        # 2. 执行查询
        result = await db.execute(query)
        test_run = result.scalar_one_or_none()
        
        # 3. 检查测试运行是否存在
        if not test_run:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=data_not_found_error()
            )       
        # 4. 查询test_cases
        test_case_query=select(TestCase).where(
            TestCase.test_run_id == test_run_id
        )
        test_cases = await db.execute(test_case_query)
        test_cases_result = [test_case for test_case, in test_cases.fetchall()]
        
        # 5. 构造包含test_cases的响应数据
        test_run_dict = {
            "id": test_run.id,
            "run_id": test_run.run_id,
            "project_id": test_run.project_id,
            "name": test_run.name,
            "model": test_run.model,
            "dataset": test_run.dataset,
            "evaluate_id": test_run.evaluate_id,
            "metrics": test_run.metrics,
            "evaluate_model": test_run.evaluate_model,
            "hyperparameters": test_run.hyperparameters,
            "status": test_run.status,
            "remark": test_run.remark,
            "total_test_cases": test_run.total_test_cases,
            "successful_test_cases": test_run.successful_test_cases,
            "testPassed": test_run.testPassed,
            "testFailed": test_run.testFailed,
            "run_duration": test_run.run_duration,
            "metrics_scores": test_run.metrics_scores,
            "avg_metric_scores": test_run.avg_metric_scores,
            "created_at": test_run.created_at,
            "started_at": test_run.started_at,
            "test_cases": test_cases_result
        }
        
        return test_run_dict
        
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        logger.error(f"Error retrieving test run {test_run_id} in project {project_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error retrieving test run: {str(e)}"
        )

@router.delete("/by-project/{project_id}/test-run/{test_run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test_run(
    project_id: int = Path(..., description="项目ID"),
    test_run_id: int = Path(..., description="测试运行ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)
) -> None:
    """删除指定项目下的测试运行及其所有测试用例"""
    db, current_user = deps
    
    try:
        # 查找要删除的测试运行
        query = select(TestRun).where(
            TestRun.id == test_run_id,
            TestRun.project_id == project_id
        )
        
        result = await db.execute(query)
        test_run = result.scalar_one_or_none()
        
        # 3. 检查测试运行是否存在
        if not test_run:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=data_not_found_error()
            )
        
        # 4. 批量删除相关的所有 TestCase
        delete_test_cases_query = delete(TestCase).where(TestCase.test_run_id == test_run_id)
        await db.execute(delete_test_cases_query)
        
        # 5. 删除 TestRun
        await db.delete(test_run)
        await db.commit()
            
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        logger.error(f"Error deleting test run {test_run_id} in project {project_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error deleting test run: {str(e)}"
        )

@router.post("/by-project/{project_id}/test-run/{test_run_id}/start", response_model=TestRunDetail)
async def start(
    project_id: int = Path(..., description="项目ID"),
    test_run_id: int = Path(..., description="测试运行ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)
) -> TestRun:
    """启动指定项目下的测试任务"""
    db, current_user = deps

    # 查找test_run并验证状态
    test_run_query = select(TestRun).where(
        and_(TestRun.id == test_run_id, TestRun.project_id == project_id)
    ) 
    result = await db.execute(test_run_query)
    test_run = result.scalar_one_or_none()
    
    if not test_run:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=data_not_found_error()
        )
        
    # 3. 验证test_run状态
    if test_run.status != TaskStatus.CREATED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot start test run with status: {test_run.status}. Only {TaskStatus.CREATED} status can be started."
        )
    
    # 4. 更新状态为running
    test_run.status = TaskStatus.PENDING
    test_run.started_at = datetime.utcnow()
    
    # 5. 先保存状态变更并确保提交
    await db.flush()
    await db.commit()
    
    # 7. 提交celery任务 - 所有业务逻辑由worker处理
    from app.tasks.test_run_evaluation import test_run_evaluation_task
    
    celery_result = test_run_evaluation_task.apply_async(
        args=(test_run_id, project_id),
        countdown=1  # 减少延迟时间，因为数据已经确认提交
    )
    
    # 8. 保存celery_task_id
    test_run.celery_task_id = celery_result.id
    await db.flush()
    await db.commit()
    logger.info(f"Started test run {test_run_id} with Celery task {celery_result.id}")
    
    # 直接返回test_run对象
    return test_run 

@router.post("/by-project/{project_id}/test-run/{test_run_id}/cancel", response_model=TestRunDetail)
async def cancel(
    project_id: int = Path(..., description="项目ID"),
    test_run_id: int = Path(..., description="测试运行ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)
) -> TestRun:
    """取消指定项目下的测试任务"""
    db, current_user = deps
    
    try:
        # 1. 查找测试运行
        test_run_query = select(TestRun).where(
            and_(TestRun.id == test_run_id, TestRun.project_id == project_id)
        )
        result = await db.execute(test_run_query)
        test_run = result.scalar_one_or_none()
        
        if not test_run:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=data_not_found_error()
            )
        
        # 3. 检查任务状态是否可以取消
        if test_run.status not in [TaskStatus.RUNNING, TaskStatus.CREATED]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel test run with status: {test_run.status}"
            )
        
        # 4. 如果有celery任务，尝试撤销
        if test_run.celery_task_id:
            try:
                from app.tasks.celery_app import celery_app
                celery_app.control.revoke(test_run.celery_task_id, terminate=True)
                logger.info(f"Successfully revoked Celery task {test_run.celery_task_id}")
            except Exception as e:
                logger.warning(f"Failed to revoke Celery task {test_run.celery_task_id}: {e}")
                # 即使撤销失败，也要更新数据库状态
        
        # 5. 更新TestRun状态
        test_run.status = TaskStatus.CANCELLED
        test_run.finished_at = datetime.utcnow()
        test_run.error_message = "Test run cancelled by user"
        await db.commit()
        logger.info(f"Test run {test_run_id} cancelled successfully")
        return test_run
        
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        logger.error(f"Error cancelling test run {test_run_id} in project {project_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error cancelling test run: {str(e)}"
        )

@router.get("/by-project/{project_id}/test-run/{test_run_id}/logs", response_model=TaskLogsResponse)
async def get_logs(
    project_id: int = Path(..., description="项目ID"),
    test_run_id: int = Path(..., description="测试运行ID"),
    start: int = Query(0, ge=0, description="起始位置（从0开始）"),
    limit: int = Query(20, ge=1, le=100, description="限制条数（1-100）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)
) -> TaskLogsResponse:
    """
    获取指定项目下测试运行的日志
    
    Args:
        project_id: 项目ID（路径参数）
        test_run_id: 测试运行ID（路径参数）
        start: 起始位置（查询参数，默认0）
        limit: 限制条数（1-100）
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        TaskLogsResponse: 测试运行日志数据
        
    Raises:
        HTTPException: 测试运行不存在或不属于指定项目时抛出异常
    """
    db, current_user = deps
    
    try:
        #  验证测试运行是否存在且属于指定项目
        test_run_query = select(TestRun).where(
            and_(TestRun.id == test_run_id, TestRun.project_id == project_id)
        )
        result = await db.execute(test_run_query)
        test_run = result.scalar_one_or_none()
        
        if not test_run:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=data_not_found_error()
            )
        key_prefix_str="test_run"
        # 3. 检查Redis中是否存在日志（使用test_run特定的key格式）
        log_key = f"{key_prefix_str}:{test_run_id}"
        redis_has_logs = redis_log_reader.key_exists(log_key)
        
        # 4. 如果Redis中没有日志，且测试运行有log_path，尝试从MinIO恢复日志
        if not redis_has_logs and hasattr(test_run, 'log_path') and test_run.log_path:
            logger.info(f"Redis中无测试运行{test_run_id}日志，尝试从MinIO恢复: {test_run.log_path}")
            try:
                # 使用支持自定义key格式的函数
                load_archived_logs_to_redis(test_run_id, test_run.log_path, key_prefix=key_prefix_str)
                logger.info(f"成功从MinIO恢复测试运行{test_run_id}日志到Redis")
            except Exception as log_e:
                # 日志恢复失败不影响查看功能，只记录警告
                logger.warning(f"从MinIO恢复测试运行{test_run_id}日志失败: {str(log_e)}")
        
        # 5. 从Redis获取测试运行日志
        try:
            log_data = get_task_logs(test_run_id, start, limit, key_prefix=key_prefix_str)
        except Exception as e:
            logger.warning(f"获取测试运行{test_run_id}日志失败，返回空日志: {e}")
            log_data = {"logs": [], "start": -1}
        
        # 6. 构建响应数据
        return TaskLogsResponse(
            logs=log_data.get("logs", []),
            start=log_data.get("start")
        )
        
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        logger.error(f"Error getting logs for test run {test_run_id} in project {project_id}: {str(e)}")
        # 返回空日志而不是抛出异常，确保前端能正常处理
        return TaskLogsResponse(
            logs=[],
            start=-1
        ) 