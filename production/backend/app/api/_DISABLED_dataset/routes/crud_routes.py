from typing import Dict, List, Optional, Tuple
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Path, status
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import paginate, apaginate

from app.database.base import get_db
from app.models.models import Dataset, DatasetDirectory, User, JwtUserInfo
from app.schemas.dataset import DatasetCreate, DatasetResponse, DatasetUpdate, DatasetBatchDelete

from app.utils.dependencies import get_db_and_user  # 导入组合依赖函数
from app.utils.error_messages import data_not_found_error

router = APIRouter()

@router.post("/by-project/{project_id}/directory/{directory_id}", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def create_dataset(
    project_id: int = Path(..., description="项目ID"),
    directory_id: int = Path(..., description="目录ID，数据集将在此目录下创建"),
    dataset: DatasetCreate = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Dataset:
    """在指定项目的指定目录中创建新的数据集
    
    Args:
        project_id: 项目ID
        directory_id: 目录ID，数据集将在此目录下创建
        dataset: 数据集数据
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        Dataset: 创建的数据集
        
    Raises:
        HTTPException: 如果项目或目录不存在，或者目录不属于指定项目
    """
    db, current_user = deps  # 解包依赖
    
    # 直接验证目录是否存在且属于指定项目（优化：减少一次项目验证查询）
    directory_result = await db.execute(
        select(DatasetDirectory)
        .where(
            DatasetDirectory.id == directory_id,
            DatasetDirectory.project_id == project_id
        )
    )
    directory = directory_result.scalars().first()
    if not directory:
        raise HTTPException(
            status_code=500, 
            detail=data_not_found_error()
        )
    
    # 转换Tool对象为字典，使其可序列化
    serializable_expected_tools = None
    if dataset.expected_tools:
        serializable_expected_tools = [tool.model_dump() for tool in dataset.expected_tools]

    # 创建数据集，确保project_id和directory_id与路径参数一致
    db_dataset = Dataset(
        question=dataset.question,
        meta_info=Dataset.validate_meta_info(dataset.meta_info),
        ground_truth=dataset.ground_truth,
        context=dataset.context,
        retrieval_context=dataset.retrieval_context,
        expected_tools=serializable_expected_tools,  # 使用转换后的可序列化字典
        project_id=project_id,  # 使用路径参数中的project_id
        directory_id=directory_id  # 使用路径参数中的directory_id
    )
    
    db.add(db_dataset)
    await db.commit()
    await db.refresh(db_dataset)
    
    # 更新目录的数据集计数
    directory.dataset_count += 1
    await db.commit()
    
    return db_dataset

@router.get("/by-project/{project_id}/directory/{directory_id}/dataset/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    project_id: int = Path(..., description="项目ID"),
    directory_id: int = Path(..., description="目录ID"),
    dataset_id: int = Path(..., description="数据集ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Dataset:
    """根据ID获取指定目录下的数据集
    
    Args:
        project_id: 项目ID
        directory_id: 目录ID
        dataset_id: 数据集ID
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        Dataset: 数据集对象
        
    Raises:
        HTTPException: 如果项目、目录或数据集不存在，或者不属于指定层级关系
    """
    db, current_user = deps  # 解包依赖
    
    # 直接验证数据集是否存在且属于指定目录和项目（优化：减少一次目录验证查询）
    result = await db.execute(
        select(Dataset)
        .where(
            Dataset.id == dataset_id,
            Dataset.directory_id == directory_id,
            Dataset.project_id == project_id
        )
    )
    
    db_dataset = result.scalars().first()
    if not db_dataset:
        raise HTTPException(
            status_code=500, 
            detail=data_not_found_error()
        )
    
    return db_dataset

@router.get("/by-project/{project_id}/directory/{directory_id}/list", response_model=Page[DatasetResponse])
async def list_datasets(
    project_id: int = Path(..., description="项目ID"),
    directory_id: int = Path(..., description="目录ID"),
    question: Optional[str] = Query(None, description="按问题字段模糊搜索"),
    sort_by: str = Query(default="created_at", enum=["created_at", "updated_at", "question"], description="排序字段"),
    sort_order: str = Query(default="desc", enum=["asc", "desc"], description="排序方向"),
    created_after: Optional[datetime] = Query(None, description="筛选此时间之后创建的数据集"),
    created_before: Optional[datetime] = Query(None, description="筛选此时间之前创建的数据集"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Page[DatasetResponse]:
    """获取指定目录中的数据集列表，支持搜索和排序 - 使用 fastapi-pagination 进行分页
    
    Args:
        project_id: 项目ID（路径参数）
        directory_id: 目录ID（路径参数）
        question: 可选，按问题字段模糊搜索
        sort_by: 排序字段，支持 created_at、updated_at、question
        sort_order: 排序方向，支持 asc、desc
        created_after: 可选，筛选此时间之后创建的数据集
        created_before: 可选，筛选此时间之前创建的数据集
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        Page[DatasetResponse]: 分页的数据集列表
        
    Raises:
        HTTPException: 如果项目或目录不存在，或者目录不属于指定项目
    """
    db, current_user = deps  # 解包依赖
    
    # 直接验证目录是否存在且属于指定项目（优化：减少一次项目验证查询）
    directory_result = await db.execute(
        select(DatasetDirectory)
        .where(
            DatasetDirectory.id == directory_id,
            DatasetDirectory.project_id == project_id
        )
    )
    directory = directory_result.scalars().first()
    if not directory:
        raise HTTPException(
            status_code=500, 
            detail=data_not_found_error()
        )
    
    # 构建基础查询条件（项目ID和目录ID必选）
    query = select(Dataset).filter(
        Dataset.project_id == project_id,
        Dataset.directory_id == directory_id
    )
    
    # 添加可选的搜索条件
    if question:
        query = query.filter(Dataset.question.ilike(f"%{question}%"))
    
    # 添加日期范围过滤条件
    if created_after:
        query = query.filter(Dataset.created_at >= created_after)
    if created_before:
        query = query.filter(Dataset.created_at <= created_before)
    
    # 添加动态排序
    if sort_by == "question":
        if sort_order == "asc":
            query = query.order_by(Dataset.question.asc())
        else:
            query = query.order_by(Dataset.question.desc())
    elif sort_by == "updated_at":
        if sort_order == "asc":
            query = query.order_by(Dataset.updated_at.asc())
        else:
            query = query.order_by(Dataset.updated_at.desc())
    else:  # default to created_at
        if sort_order == "asc":
            query = query.order_by(Dataset.created_at.asc())
        else:
            query = query.order_by(Dataset.created_at.desc())
    
    # 使用 fastapi-pagination 进行分页
    return await apaginate(db, query)

@router.put("/by-project/{project_id}/directory/{directory_id}/dataset/{dataset_id}", response_model=DatasetResponse, status_code=status.HTTP_200_OK)
async def update_dataset(
    project_id: int = Path(..., description="项目ID"),
    directory_id: int = Path(..., description="目录ID"),
    dataset_id: int = Path(..., description="数据集ID"),
    dataset: DatasetCreate = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Dataset:
    """更新指定目录下的数据集
    
    Args:
        project_id: 项目ID
        directory_id: 目录ID
        dataset_id: 数据集ID
        dataset: 更新的数据集数据
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        Dataset: 更新后的数据集
        
    Raises:
        HTTPException: 如果项目、目录或数据集不存在，或者不属于指定层级关系
    """
    db, current_user = deps  # 解包依赖
    
    # 直接验证数据集是否存在且属于指定目录和项目（优化：减少一次目录验证查询）
    result = await db.execute(
        select(Dataset)
        .where(
            Dataset.id == dataset_id,
            Dataset.directory_id == directory_id,
            Dataset.project_id == project_id
        )
    )
    
    db_dataset = result.scalars().first()
    if not db_dataset:
        raise HTTPException(
            status_code=500, 
            detail=data_not_found_error()
        )
    
    # 转换Tool对象为字典，使其可序列化
    serializable_expected_tools = None
    if dataset.expected_tools:
        serializable_expected_tools = [tool.model_dump() for tool in dataset.expected_tools]
    
    # 更新数据集字段，directory_id保持为路径参数值
    db_dataset.question = dataset.question
    db_dataset.meta_info = Dataset.validate_meta_info(dataset.meta_info)
    db_dataset.ground_truth = dataset.ground_truth
    db_dataset.context = dataset.context
    db_dataset.retrieval_context = dataset.retrieval_context
    db_dataset.expected_tools = serializable_expected_tools  # 使用转换后的可序列化字典
    # directory_id 不允许在更新时改变，必须保持与路径参数一致
    db_dataset.directory_id = directory_id
    
    await db.commit()
    await db.refresh(db_dataset)
    
    return db_dataset

@router.patch("/by-project/{project_id}/directory/{directory_id}/dataset/{dataset_id}", response_model=DatasetResponse, status_code=status.HTTP_200_OK)
async def partial_update_dataset(
    project_id: int = Path(..., description="项目ID"),
    directory_id: int = Path(..., description="目录ID"),
    dataset_id: int = Path(..., description="数据集ID"),
    dataset: DatasetUpdate = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Dataset:
    """部分更新指定目录下的数据集
    
    Args:
        project_id: 项目ID
        directory_id: 目录ID
        dataset_id: 数据集ID
        dataset: 更新的数据集数据（部分字段）
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        Dataset: 更新后的数据集
        
    Raises:
        HTTPException: 如果项目、目录或数据集不存在，或者不属于指定层级关系
    """
    db, current_user = deps  # 解包依赖
    
    result = await db.execute(
        select(Dataset)
        .where(
            Dataset.id == dataset_id,
            Dataset.directory_id == directory_id,
            Dataset.project_id == project_id
        )
    )
    
    db_dataset = result.scalars().first()
    if not db_dataset:
        raise HTTPException(
            status_code=500, 
            detail=data_not_found_error()
        )
    
    # 只更新提供的字段
    if dataset.question is not None:
        db_dataset.question = dataset.question
        
    if dataset.meta_info is not None:
        db_dataset.meta_info = dataset.meta_info
        
    if dataset.ground_truth is not None:
        db_dataset.ground_truth = dataset.ground_truth
        
    if dataset.context is not None:
        db_dataset.context = dataset.context
        
    if dataset.comments is not None:
        db_dataset.comments = dataset.comments
        
    if dataset.retrieval_context is not None:
        db_dataset.retrieval_context = dataset.retrieval_context
        
    if dataset.expected_tools is not None:
        # 转换Tool对象为字典，使其可序列化
        serializable_expected_tools = [tool.model_dump() for tool in dataset.expected_tools]
        db_dataset.expected_tools = serializable_expected_tools
        
    # directory_id 不允许在更新时改变，必须保持与路径参数一致
    db_dataset.directory_id = directory_id
    
    await db.commit()
    await db.refresh(db_dataset)
    
    return db_dataset

@router.delete("/by-project/{project_id}/directory/{directory_id}/dataset/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    project_id: int = Path(..., description="项目ID"),
    directory_id: int = Path(..., description="目录ID"),
    dataset_id: int = Path(..., description="数据集ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> None:
    """删除指定目录下的数据集
    
    Args:
        project_id: 项目ID
        directory_id: 目录ID
        dataset_id: 数据集ID
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        None: 删除成功返回204状态码
        
    Raises:
        HTTPException: 如果项目、目录或数据集不存在，或者不属于指定层级关系
    """
    db, current_user = deps  # 解包依赖
    
    # 直接验证数据集是否存在且属于指定目录和项目（优化：减少一次目录验证查询）
    result = await db.execute(
        select(Dataset)
        .where(
            Dataset.id == dataset_id,
            Dataset.directory_id == directory_id,
            Dataset.project_id == project_id
        )
    )
    
    db_dataset = result.scalars().first()
    if not db_dataset:
        raise HTTPException(
            status_code=500, 
            detail=data_not_found_error()
        )
    
    # 删除数据集
    await db.delete(db_dataset)
    
    # 更新目录的数据集计数
    directory_result = await db.execute(
        select(DatasetDirectory)
        .where(DatasetDirectory.id == directory_id)
    )
    directory = directory_result.scalars().first()
    if directory:
        directory.dataset_count = max(0, directory.dataset_count - 1)
    
    await db.commit()
    return None

@router.delete("/by-project/{project_id}/directory/{directory_id}/batch-delete", status_code=status.HTTP_204_NO_CONTENT)
async def batch_delete_datasets(
    project_id: int = Path(..., description="项目ID"),
    directory_id: int = Path(..., description="目录ID"),
    delete_request: DatasetBatchDelete = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> None:
    """批量删除指定目录下的数据集
    
    Args:
        project_id: 项目ID
        directory_id: 目录ID
        delete_request: 批量删除请求（包含数据集ID列表）
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        None: 删除成功返回204状态码
        
    Raises:
        HTTPException: 如果项目或目录不存在，或者某些数据集不存在或不属于指定目录
    """
    db, current_user = deps  # 解包依赖
    
    # 直接验证目录是否存在且属于指定项目（优化：减少一次项目验证查询）
    directory_result = await db.execute(
        select(DatasetDirectory)
        .where(
            DatasetDirectory.id == directory_id,
            DatasetDirectory.project_id == project_id
        )
    )
    directory = directory_result.scalars().first()
    if not directory:
        raise HTTPException(
            status_code=500, 
            detail=data_not_found_error()
        )
    
    # 获取指定目录下的数据集
    result = await db.execute(
        select(Dataset).filter(
            Dataset.id.in_(delete_request.dataset_ids),
            Dataset.project_id == project_id,
            Dataset.directory_id == directory_id
        )
    )
    datasets = result.scalars().all()
    
    # 检查是否所有数据集都存在
    found_ids = {ds.id for ds in datasets}
    missing_ids = set(delete_request.dataset_ids) - found_ids
    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail=f"以下数据集不存在或不属于指定目录: {list(missing_ids)}"
        )
    
    # 更新目录的数据集计数
    directory.dataset_count = max(0, directory.dataset_count - len(datasets))
    
    # 删除数据集
    for dataset in datasets:
        await db.delete(dataset)
    
    await db.commit()
    return None 