from app.models.models import Dataset
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status


async def get_dataset(db: AsyncSession, dataset_id: int) -> Dataset:
    """Get dataset by ID without caching"""
    # 直接从数据库获取
    query = select(Dataset).where(Dataset.id == dataset_id)
    result = await db.execute(query)
    dataset = result.scalar_one_or_none()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset with ID {dataset_id} not found"
        )
    
    return dataset