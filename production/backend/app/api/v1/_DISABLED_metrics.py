import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_, and_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import JSONB

# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import apaginate

from app.database.base import get_db
from app.models.models import Metric, MetricDirectory, Project, User, LLMConfig
from app.schemas.metric import (
    MetricCreate, MetricResponse, MetricUpdate, MetricSearch, MetricBatchDelete,
    GenerateEvaluationStepsRequest, GenerateEvaluationStepsResponse, MetricType
)
from datetime import datetime
from app.utils.auth import get_current_user
from pydantic import BaseModel, Field
from app.utils.custom_llm import CustomLLM
import json
import re
from app.utils.dependencies import get_db_and_user
from app.utils.error_messages import data_exists_error, data_not_found_error

router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])
logger = logging.getLogger(__name__)


async def validate_project(db: AsyncSession, project_id: int) -> Project:
    """验证项目是否存在"""
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=500,
            detail=data_not_found_error()
        )
    return project


async def validate_directory(db: AsyncSession, project_id: int, directory_id: int) -> MetricDirectory:
    """验证目录是否存在且属于指定项目
    
    Args:
        db: 数据库会话
        project_id: 项目ID
        directory_id: 目录ID
        
    Returns:
        MetricDirectory: 验证通过的目录
        
    Raises:
        HTTPException: 如果目录不存在或不属于指定项目
    """
    if directory_id is None:
        raise HTTPException(
            status_code=400, 
            detail="Directory ID is required"
        )
        
    result = await db.execute(
        select(MetricDirectory)
        .where(
            MetricDirectory.id == directory_id,
            MetricDirectory.project_id == project_id
        )
    )
    
    directory = result.scalars().first()
    if not directory:
        raise HTTPException(
            status_code=500, 
            detail=data_not_found_error()
        )
    
    return directory


# 指标相关API
@router.post("/by-project/{project_id}/directory/{directory_id}/metrics", response_model=MetricResponse, status_code=status.HTTP_201_CREATED)
async def create_metric(
    project_id: int,
    directory_id: int,
    metric_data: MetricCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Metric:
    """在指定项目的指定目录中创建新的指标
    
    Args:
        project_id: 项目ID（路径参数）
        directory_id: 目录ID（路径参数），指标将在此目录下创建
        metric_data: 指标数据
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        Metric: 创建的指标
        
    Raises:
        HTTPException: 如果项目或目录不存在，或者目录不属于指定项目
    """
    try:
        # 直接验证目录是否存在且属于指定项目（优化：减少一次项目验证查询）
        directory_result = await db.execute(
            select(MetricDirectory)
            .where(
                MetricDirectory.id == directory_id,
                MetricDirectory.project_id == project_id
            )
        )
        directory = directory_result.scalar_one_or_none()
        if not directory:
            raise HTTPException(
                status_code=500, 
                detail=data_not_found_error()
            )
        
        # 检查同一项目下同一目录下是否已存在同名指标
        query = select(Metric).where(
            Metric.name == metric_data.name,
            Metric.project_id == project_id,
            Metric.directory_id == directory_id
        )
            
        existing_metric = await db.execute(query)
        if existing_metric.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=data_exists_error(metric_data.name)
            )
        
        # 创建新指标，强制设置directory_id为路径参数值
        new_metric = Metric(
            name=metric_data.name,
            description=metric_data.description,
            type=metric_data.type,
            is_builtin=metric_data.is_builtin,
            metric_type=metric_data.metric_type,
            required_params=metric_data.required_params,
            params_content=metric_data.params_content,
            project_id=project_id,  # 强制使用路径参数的project_id
            directory_id=directory_id,  # 强制使用路径参数的directory_id
        )
        
        db.add(new_metric)
        await db.commit()
        await db.refresh(new_metric)
        
        # 更新目录的指标计数
        directory.metric_count += 1
        await db.commit()
        
        return new_metric
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"创建指标失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"创建指标失败: {str(e)}"
        )


@router.get("/by-project/{project_id}/directory/{directory_id}/metric/{metric_id}", response_model=MetricResponse)
async def get_metric(
    project_id: int,
    directory_id: int,
    metric_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Metric:
    """获取指定目录下的指标详情
    
    Args:
        project_id: 项目ID（路径参数）
        directory_id: 目录ID（路径参数）
        metric_id: 指标ID（路径参数）
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        Metric: 指标对象
        
    Raises:
        HTTPException: 如果项目、目录或指标不存在，或者不属于指定层级关系
    """
    result = await db.execute(
        select(Metric)
        .where(
            Metric.id == metric_id,
            Metric.directory_id == directory_id,
            Metric.project_id == project_id
        )
    )
    
    metric = result.scalars().first()
    if not metric:
        raise HTTPException(
            status_code=500, 
            detail=data_not_found_error()
        )
    
    return metric


@router.put("/by-project/{project_id}/directory/{directory_id}/metric/{metric_id}", response_model=MetricResponse, status_code=status.HTTP_200_OK)
async def update_metric(
    project_id: int,
    directory_id: int,
    metric_id: int,
    metric_data: MetricUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Metric:
    """更新指定目录下的指标内容
    
    注意：此API仅用于更新指标的内容属性（名称、描述、类型等），不支持目录迁移。
    如需移动指标到其他目录，请使用专门的移动API或通过删除+重建实现。
    
    Args:
        project_id: 项目ID（路径参数）
        directory_id: 目录ID（路径参数），指标必须属于此目录
        metric_id: 指标ID（路径参数）
        metric_data: 更新的指标数据（仅内容属性）
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        Metric: 更新后的指标
        
    Raises:
        HTTPException: 如果项目、目录或指标不存在，或者不属于指定层级关系
    """
    try:
        # 验证指标是否存在且属于指定目录和项目
        result = await db.execute(
            select(Metric)
            .where(
                Metric.id == metric_id,
                Metric.directory_id == directory_id,
                Metric.project_id == project_id
            )
        )
        
        metric = result.scalars().first()
        if not metric:
            raise HTTPException(
                status_code=500, 
                detail=data_not_found_error()
            )
        
        # 如果更新名称，检查当前目录下是否与现有指标冲突
        if metric_data.name is not None and metric_data.name != metric.name:
            # 在当前目录下检查名称冲突（排除当前指标）
            query = select(Metric).where(
                Metric.name == metric_data.name,
                Metric.project_id == project_id,
                Metric.directory_id == directory_id,  # 仅在当前目录下检查
                Metric.id != metric_id  # 排除当前指标
            )
                
            existing_metric = await db.execute(query)
            if existing_metric.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=data_exists_error(metric_data.name)
                )
            # 更新名称
            metric.name = metric_data.name
        
        # 更新其他内容属性
        if metric_data.description is not None:
            metric.description = metric_data.description
        if metric_data.type is not None:
            metric.type = metric_data.type
        if metric_data.is_builtin is not None:
            metric.is_builtin = metric_data.is_builtin
        if metric_data.metric_type is not None:
            metric.metric_type = metric_data.metric_type
        if metric_data.required_params is not None:
            metric.required_params = metric_data.required_params
        if metric_data.params_content is not None:
            metric.params_content = metric_data.params_content
        
        metric.directory_id = directory_id
        
        # 提交更改
        await db.commit()
        await db.refresh(metric)
        
        return metric
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"更新指标失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新指标失败: {str(e)}"
        )


@router.delete("/by-project/{project_id}/directory/{directory_id}/metric/{metric_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_metric(
    project_id: int,
    directory_id: int,
    metric_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> None:
    """删除指定目录下的指标
    
    Args:
        project_id: 项目ID（路径参数）
        directory_id: 目录ID（路径参数）
        metric_id: 指标ID（路径参数）
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        None: 删除成功返回204状态码
        
    Raises:
        HTTPException: 如果项目、目录或指标不存在，或者不属于指定层级关系
    """
    try:
        result = await db.execute(
            select(Metric)
            .where(
                Metric.id == metric_id,
                Metric.directory_id == directory_id,
                Metric.project_id == project_id
            )
        )
        
        metric = result.scalars().first()
        if not metric:
            raise HTTPException(
                status_code=500, 
                detail=data_not_found_error()
            )
        
        # 删除指标
        await db.delete(metric)
        
        # 更新目录的指标计数
        directory_result = await db.execute(
            select(MetricDirectory).where(
                MetricDirectory.id == directory_id
            )
        )
        directory = directory_result.scalar_one_or_none()
        if directory:
            directory.metric_count = max(0, directory.metric_count - 1)
        
        await db.commit()
        return None
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"删除指标失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"删除指标失败: {str(e)}"
        )


@router.post("/by-project/{project_id}/directory/{directory_id}/batch-delete", status_code=status.HTTP_204_NO_CONTENT)
async def batch_delete_metrics(
    project_id: int,
    directory_id: int,
    batch_delete: MetricBatchDelete,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> None:
    """批量删除指定目录下的指标
    
    Args:
        project_id: 项目ID（路径参数）
        directory_id: 目录ID（路径参数）
        batch_delete: 批量删除数据
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        None: 删除成功返回204状态码
        
    Raises:
        HTTPException: 如果项目或目录不存在，或者目录不属于指定项目
    """
    try:
        # 直接验证目录是否存在且属于指定项目（优化：减少一次项目验证查询）
        directory_result = await db.execute(
            select(MetricDirectory)
            .where(
                MetricDirectory.id == directory_id,
                MetricDirectory.project_id == project_id
            )
        )
        directory = directory_result.scalar_one_or_none()
        if not directory:
            raise HTTPException(
                status_code=500, 
                detail=data_not_found_error()
            )
        
        # 验证指标是否都存在且属于指定目录
        if batch_delete.metric_ids:
            metrics_query = select(Metric).where(
                Metric.id.in_(batch_delete.metric_ids),
                Metric.directory_id == directory_id,
                Metric.project_id == project_id
            )
            
            metrics_result = await db.execute(metrics_query)
            metrics = metrics_result.scalars().all()
            
            found_metric_ids = {metric.id for metric in metrics}
            missing_metric_ids = set(batch_delete.metric_ids) - found_metric_ids
            
            if missing_metric_ids:
                raise HTTPException(
                    status_code=404,
                    detail=f"以下指标不存在或不属于指定目录: {list(missing_metric_ids)}"
                )
            
            # 批量删除
            delete_count = len(metrics)
            for metric in metrics:
                await db.delete(metric)
            
            # 更新目录的指标计数
            directory.metric_count = max(0, directory.metric_count - delete_count)
        
        await db.commit()
        return None
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"批量删除指标失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"批量删除指标失败: {str(e)}"
        )


@router.get("/by-project/{project_id}/directory/{directory_id}/list", response_model=Page[MetricResponse])
async def list_metrics(
    project_id: int,
    directory_id: int,
    name: Optional[str] = Query(None, description="按名称模糊搜索"),
    type: Optional[str] = Query(None, description="按类型模糊搜索"),
    is_builtin: Optional[bool] = Query(None, description="按是否内置过滤"),
    metric_type: Optional[str] = Query(None, description="按指标类型过滤"),
    sort_by: str = Query(default="created_at", enum=["created_at", "updated_at", "name"], description="排序字段"),
    sort_order: str = Query(default="desc", enum=["asc", "desc"], description="排序方向"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Page[MetricResponse]:
    """获取指定目录下的指标列表
    
    Args:
        project_id: 项目ID（路径参数）
        directory_id: 目录ID（路径参数）
        name: 按名称模糊搜索（可选）
        type: 按类型模糊搜索（可选）
        is_builtin: 按是否内置过滤（可选）
        metric_type: 按指标类型过滤（可选）
        sort_by: 排序字段
        sort_order: 排序方向
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        Page[MetricResponse]: 分页的指标列表
        
    Raises:
        HTTPException: 如果项目或目录不存在，或者目录不属于指定项目
    """
    # 直接验证目录是否存在且属于指定项目（优化：减少一次项目验证查询）
    directory_result = await db.execute(
        select(MetricDirectory)
        .where(
            MetricDirectory.id == directory_id,
            MetricDirectory.project_id == project_id
        )
    )
    directory = directory_result.scalar_one_or_none()
    if not directory:
        raise HTTPException(
            status_code=500, 
            detail=data_not_found_error()
        )
    
    # 构建基础查询
    query = select(Metric).where(
        Metric.project_id == project_id,
        Metric.directory_id == directory_id
    )
    
    # 添加搜索条件
    if name:
        query = query.where(Metric.name.ilike(f"%{name}%"))
    if type:
        query = query.where(Metric.type.ilike(f"%{type}%"))
    if is_builtin is not None:
        query = query.where(Metric.is_builtin == is_builtin)
    if metric_type:
        query = query.where(Metric.metric_type.ilike(f"%{metric_type}%"))
    
    # 添加排序
    if sort_by == "name":
        if sort_order == "asc":
            query = query.order_by(Metric.name.asc())
        else:
            query = query.order_by(Metric.name.desc())
    elif sort_by == "updated_at":
        if sort_order == "asc":
            query = query.order_by(Metric.updated_at.asc())
        else:
            query = query.order_by(Metric.updated_at.desc())
    else:  # default to created_at
        if sort_order == "asc":
            query = query.order_by(Metric.created_at.asc())
        else:
            query = query.order_by(Metric.created_at.desc())
    
    # 使用 fastapi-pagination 进行分页
    return await apaginate(db, query)


@router.post("/generate-evaluation-steps", response_model=GenerateEvaluationStepsResponse)
async def generate_evaluation_steps(
    request: GenerateEvaluationStepsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, List[str]]:
    """
    使用大模型生成评估步骤
    
    Args:
        request: 请求参数，包含项目ID、大模型ID、参数列表和评估标准
        db: 数据库会话
        current_user: 当前用户
        
    Returns:
        包含评估步骤的响应
    """
    try:
        
        # 获取大模型配置
        llm_config_query = select(LLMConfig).where(LLMConfig.id == request.llm_config_id)
        result = await db.execute(llm_config_query)
        llm_config = result.scalar_one_or_none()
        
        if not llm_config:
            # 统一错误格式：数据不存在
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=data_not_found_error()
            )
        
        # 构建大模型配置
        model_config = {
            "model_name": llm_config.model,
            "api_key": llm_config.api_key,
            "base_url": llm_config.base_url,
            "temperature": llm_config.temperature or 0.7,
            "max_tokens": llm_config.max_tokens or 1000,
            "frequency_penalty": llm_config.frequency_penalty or 0,
            "presence_penalty": llm_config.presence_penalty or 0,
            "top_p": llm_config.top_p or 1.0,
        }
        
        # 初始化自定义LLM
        custom_llm = CustomLLM(model_config)
        
        # 使用提供的函数逻辑构建参数字符串
        parameters = request.parameters
        if len(parameters) == 1:
            parameters_str = parameters[0]
        elif len(parameters) == 2:
            parameters_str = " and ".join(parameters)
        else:
            parameters_str = ", ".join(parameters[:-1]) + ", and " + parameters[-1]
        
        # 构建prompt
        prompt = f"""Given an evaluation criteria which outlines how you should judge the {parameters_str}, generate 3-4 concise evaluation steps based on the criteria below. You MUST make it clear how to evaluate {parameters_str} in relation to one another.

Evaluation Criteria:

{request.criteria}

**

IMPORTANT: Please make sure to only return in JSON format, with the "steps" key as a list of strings. No words or explanation is needed.

Example JSON:

{{
    "steps": <list_of_strings>
}}

**

JSON:"""
        
        # 定义响应schema
        class StepsResponse(BaseModel):
            steps: List[str]
        
        # 调用模型生成评估步骤
        response = await custom_llm.a_generate(prompt, StepsResponse)
        
        # 确保返回格式正确
        if not hasattr(response, 'steps'):
            # 尝试从响应中提取JSON
            try:
                # 尝试找到JSON格式的内容
                json_match = re.search(r'(\{.*\})', str(response), re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group(1))
                    if 'steps' in data:
                        return {"steps": data['steps']}
                
                # 如果无法提取，返回错误
                raise ValueError("无法从模型响应中提取评估步骤")
            except Exception as e:
                logger.error(f"从模型响应中提取JSON失败: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"生成评估步骤失败: {str(e)}"
                )
        
        return {"steps": response.steps}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"生成评估步骤失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"生成评估步骤失败: {str(e)}"
        )

@router.get("/builtin", response_model=Page[MetricResponse])
async def list_builtin_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Page[MetricResponse]:
    """获取所有内置指标 - 使用 fastapi-pagination 进行分页
    
    返回系统中所有内置指标（is_builtin=True），不需要任何参数
    
    Returns:
        Page[MetricResponse]: 分页的内置指标列表
    """
    # 查询所有内置指标
    query = select(Metric).filter(Metric.is_builtin == True).order_by(Metric.name)
    
    # 使用 fastapi-pagination 进行分页
    return await apaginate(db, query) 