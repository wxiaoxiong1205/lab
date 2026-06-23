from typing import Dict, List
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Project, Dataset

async def validate_project(db: AsyncSession, project_id: int) -> Project:
    """Validate that a project exists
    
    Args:
        db: Database session
        project_id: Project ID to validate
        
    Returns:
        Project: The validated project
        
    Raises:
        HTTPException: If project not found
    """
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=500,
            detail="资源不存在"
        )
    return project



async def get_dataset_in_project(db: AsyncSession, dataset_id: int, project_id: int) -> Dataset:
    """Get a dataset that belongs to a specific project
    
    Args:
        db: Database session
        dataset_id: Dataset ID
        project_id: Project ID
        
    Returns:
        Dataset: The dataset if found
        
    Raises:
        HTTPException: If dataset not found or doesn't belong to the project
    """
    result = await db.execute(
        select(Dataset).filter(
            Dataset.id == dataset_id,
            Dataset.project_id == project_id
        )
    )
    dataset = result.scalar_one_or_none()
    
    if not dataset:
        raise HTTPException(
            status_code=500,
            detail="资源不存在"
        )
        
    return dataset 