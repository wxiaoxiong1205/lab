"""
任务管理模块 - 提供任务管理相关的功能函数

优化说明：
1. 减少重复的数据库查询：每个操作函数直接查询数据库，避免多次调用get_task
2. 合并验证逻辑：将所有验证集中在各自的操作函数中，避免重复验证
3. 减少数据库提交次数：每个操作只进行一次commit，提高性能
4. 简化函数调用链：移除不必要的中间函数，直接执行操作
5. 统一错误处理：使用一致的错误处理模式
"""
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from app.models.models import Task, Dataset, Project, Prompt, LLMConfig
# 移除了对 batch_processor_utils 的依赖
from app.tasks.answer_generation import answer_generation_task
from app.tasks.celery_app import celery_app
from app.tasks.constants import TaskStatus
# 使用答案生成任务处理器
from app.tasks.answer_generation import answer_generation_task, answer_generation_retry_error
from app.tasks.constants import TaskType
from app.core.logging import logger


async def create_task(
    db: AsyncSession,
    name: str,
    project_id: int,
    task_type: str = "answer-generation",
    prompt_messages: Optional[Dict[str, Any]] = None,
    llm_config_content: Optional[Dict[str, Any]] = None,
    directory_id: Optional[int] = None,
    variable_mappings: Optional[Dict[str, str]] = None,
    description: Optional[str] = None,
    prompt_id: Optional[int] = None,
    llm_config_id: Optional[int] = None,
    **kwargs
) -> Task:
    """
    创建任务 - 兼容原有接口
    
    Args:
        db: 数据库会话
        name: 任务名称
        project_id: 项目ID
        task_type: 任务类型
        prompt_messages: 提示词消息内容快照
        llm_config_content: LLM配置内容快照
        directory_id: 数据集目录ID
        variable_mappings: 变量映射
        description: 任务描述
        
    Returns:
        创建的任务对象
    """
    # 判断task_type是否为支持的类型
    from app.tasks.constants import TaskType
    if task_type not in TaskType.ALL_TYPES:
        raise ValueError(f"不支持的任务类型: {task_type}，支持的类型: {TaskType.ALL_TYPES}")
    
    # 验证项目存在
    project_query = select(Project).where(Project.id == project_id)
    result = await db.execute(project_query)
    project = result.scalar_one_or_none()
    if not project:
        raise ValueError(f"项目 {project_id} 不存在")
    
    if task_type == "answer-generation":
        if not directory_id:
            raise ValueError("必填参数不全：必须提供 数据集目录id")
        
    # 如果提供了prompt_messages和llm_config_content，直接使用（快照模式）
    if prompt_messages and llm_config_content:
        # 验证数据集存在，directory_id是必传参数，直接使用
        dataset_query = select(Dataset).where(
            Dataset.project_id == project_id,
            Dataset.directory_id == directory_id
        )
        
        result = await db.execute(dataset_query)
        datasets = result.scalars().all()
        dataset_count = len(datasets)
        
        if dataset_count == 0:
            raise ValueError("未找到匹配的数据集")
    else:
        if prompt_id and llm_config_id:
            # 验证提示词存在
            prompt_query = select(Prompt).where(
                Prompt.id == prompt_id,
                Prompt.project_id == project_id
            )
            result = await db.execute(prompt_query)
            prompt = result.scalar_one_or_none()
            if not prompt:
                raise ValueError(f"提示词 {prompt_id} 不存在或不属于项目 {project_id}")
            
            # 验证LLM配置存在
            llm_config_query = select(LLMConfig).where(
                LLMConfig.id == llm_config_id,
                LLMConfig.project_id == project_id
            )
            result = await db.execute(llm_config_query)
            llm_config = result.scalar_one_or_none()
            if not llm_config:
                raise ValueError(f"LLM配置 {llm_config_id} 不存在或不属于项目 {project_id}")
            
            # 创建配置快照
            prompt_messages = {
                "messages": prompt.messages,
                "input_variables": prompt.input_variables or [],
                "template_format": prompt.template_format,
                "title": prompt.title
            }
            
            llm_config_content = {
                "model": llm_config.model,
                "temperature": llm_config.temperature,
                "max_tokens": llm_config.max_tokens,
                "timeout": llm_config.timeout,
                "max_retries": llm_config.max_retries,
                "frequency_penalty": llm_config.frequency_penalty,
                "presence_penalty": llm_config.presence_penalty,
                "top_p": llm_config.top_p,
                "api_key": llm_config.api_key,
                "base_url": llm_config.base_url,
                "organization": llm_config.organization,
                "additional_params": llm_config.additional_params or {}
            }
            
            # 验证数据集存在，directory_id是必传参数，直接使用
            dataset_query = select(Dataset).where(
                Dataset.project_id == project_id,
                Dataset.directory_id == directory_id
            )
            
            result = await db.execute(dataset_query)
            datasets = result.scalars().all()
            dataset_count = len(datasets)
            
            if dataset_count == 0:
                raise ValueError("未找到匹配的数据集")
        else:
            # 如果没有提供配置信息，直接报错必填参数不全
            raise ValueError("必填参数不全：必须提供 prompt_messages 和 llm_config_content，或者提供 prompt_id 和 llm_config_id")
    
    # 创建任务记录
    task = Task(
        name=name,
        description=description,
        project_id=project_id,
        prompt_messages=prompt_messages,
        llm_config_content=llm_config_content,
        task_type=task_type,
        status=TaskStatus.CREATED,
        directory_id=directory_id,
        variable_mappings=variable_mappings or {},
        total_count=dataset_count,
        created_at=datetime.utcnow()
    )
    
    db.add(task)
    await db.commit()
    await db.refresh(task)
    
    return task

async def list_tasks(
    db: AsyncSession,
    project_id: int,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> List[Task]:
    """列出任务"""
    query = select(Task).where(Task.project_id == project_id)
    if status is not None:
        query = query.where(Task.status == status)
    query = query.order_by(Task.created_at.desc())
    query = query.offset(offset).limit(limit)
    
    result = await db.execute(query)
    return result.scalars().all()

async def start_task(db: AsyncSession, task_id: int) -> Task:

    # 一次性获取任务并进行所有验证
    query = select(Task).where(Task.id == task_id)
    result = await db.execute(query)
    task = result.scalar_one_or_none()
    # 统一验证逻辑
    if not task:
        raise ValueError(f"任务 {task_id} 不存在")
    
    if not task.can_transition_to(TaskStatus.PENDING):
        raise ValueError(f"任务状态 {task.status} 不能启动")
    
    if task.task_type not in TaskType.ALL_TYPES:
        raise ValueError(f"不支持的任务类型: {task.task_type}，支持的类型: {TaskType.ALL_TYPES}")
    
    if task.task_type != TaskType.ANSWER_GENERATION:
        raise ValueError(f"当前只支持答案生成任务类型: {TaskType.ANSWER_GENERATION}")
    
    # 准备任务参数
    task_args = {
        "project_id": task.project_id,
        "directory_id": task.directory_id,
        "prompt_messages": task.prompt_messages,
        "llm_config_content": task.llm_config_content,
        "variable_mappings": task.variable_mappings
    }
    
    # 提交到Celery（在数据库更新之前，避免失败时的状态不一致）
    celery_result = answer_generation_task.apply_async(args=(task_id, task_args), countdown=3)
    
    # 一次性更新所有状态字段
    task.status = TaskStatus.PENDING
    task.celery_task_id = celery_result.id
    task.updated_at = datetime.utcnow()
    
    # 一次性提交所有更改
    await db.commit()
    await db.refresh(task)
    
    return task



async def cancel_task(db: AsyncSession, task_id: int) -> Task:
    """
    取消任务 - 简化版本，主要依赖数据库状态
    """
    # 获取任务并验证
    query = select(Task).where(Task.id == task_id)
    result = await db.execute(query)
    task = result.scalar_one_or_none()
    
    if not task:
        raise ValueError(f"任务 {task_id} 不存在")
    
    if not task.is_cancellable():
        raise ValueError(f"任务状态 {task.status} 不能取消")
    
    # 更新数据库状态为已取消（这是最重要的）
    task.status = TaskStatus.CANCELLED
    task.finished_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(task)
    
    logger.info(f"任务 {task_id} 数据库状态已更新为已取消")
    
    # 如果有Celery任务ID，尝试简单撤销
    if task.celery_task_id:
        try:
            logger.info(f"尝试撤销Celery任务 {task.celery_task_id}")
            celery_app.control.revoke(task.celery_task_id, terminate=True)
            logger.info("Celery任务撤销命令已发送")
        except Exception as e:
            logger.warning(f"撤销Celery任务失败: {str(e)}，但数据库状态已更新")
    
    return task


async def delete_task(db: AsyncSession, task_id: int) -> bool:
    """
    删除任务 - 优化版本，减少重复的数据库操作
    
    Args:
        db: 数据库会话
        task_id: 任务ID
        
    Returns:
        是否成功删除
    """
    # 一次性获取任务并验证
    query = select(Task).where(Task.id == task_id)
    result = await db.execute(query)
    task = result.scalar_one_or_none()
    
    if not task:
        logger.error(f"Task {task_id} not found")
        return False
    
    # 检查任务状态，不允许删除正在运行的任务
    if task.status == TaskStatus.RUNNING:
        raise ValueError(f"Cannot delete task with status {task.status}")
    
    try:
        # 直接删除任务
        delete_stmt = delete(Task).where(Task.id == task_id)
        await db.execute(delete_stmt)
        await db.commit()
        
        logger.info(f"Successfully deleted task {task_id}")
        return True
        
    except IntegrityError as e:
        logger.error(f"IntegrityError deleting task {task_id}: {str(e)}")
        await db.rollback()
        raise  # 重新抛出异常，让上层处理
        
    except Exception as e:
        logger.error(f"Error deleting task {task_id}: {str(e)}")
        await db.rollback()
        return False


async def retry_error_task(db: AsyncSession, task_id: int, project_id: int):
    """
    重试失败的答案生成任务
    
    Args:
        db: 数据库会话
        task_id: 任务ID
        project_id: 项目ID
        
    Returns:
        任务对象
    """
    # 提交重试任务到Celery
    answer_generation_retry_error.apply_async(
        args=(task_id, project_id)
    )
    