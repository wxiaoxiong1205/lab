from typing import Dict, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Response, status
from sqlalchemy import select, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError

from app.database.base import get_db
from app.models.models import Dataset, DatasetDirectory
from app.api.v1 import (
    build_search_query,
    apply_sorting,
    parse_excel_file,
    create_excel_template,
    create_export_workbook
)
# 导入统一错误消息工具模块
from app.utils.error_messages import data_not_found_error
from app.utils.timezone_utils import get_current_shanghai_time

router = APIRouter()

@router.post("/by-project/{project_id}/directory/{directory_id}/import-xlsx", status_code=status.HTTP_201_CREATED)
async def import_datasets_xlsx(
    project_id: int,
    directory_id: int,
    file: UploadFile = File(...),
    batch_size: int = Query(default=1000, ge=100, le=5000, description="每批处理的数据量"),
    db: AsyncSession = Depends(get_db)
):
    """从Excel文件导入数据集到指定项目的指定目录
    
    Args:
        project_id: 项目ID（路径参数）
        directory_id: 目录ID（路径参数），数据集将被归类到该目录下
        file: Excel文件
        batch_size: 每批处理的数据量
        db: 数据库会话
        
    Returns:
        Dict: 导入结果
    """
    # 直接验证目录是否存在且属于指定项目（优化：减少一次项目验证查询）
    directory_result = await db.execute(
        select(DatasetDirectory).where(
            DatasetDirectory.id == directory_id,
            DatasetDirectory.project_id == project_id
        )
    )
    directory = directory_result.scalar_one_or_none()
    if not directory:
        raise HTTPException(
            status_code=500,
            detail=data_not_found_error()
        )
    
    # 解析Excel文件
    all_rows = await parse_excel_file(file)
    
    if not all_rows:
        return {
            "message": "No valid data found in the Excel file",
            "datasets_created": 0,
            "errors": []
        }
    
    # Track statistics
    datasets_created = 0
    errors = []
    
    try:
        # Process datasets in batches with efficient bulk operations
        for i in range(0, len(all_rows), batch_size):
            batch_rows = all_rows[i:i+batch_size]
            datasets_to_create = []
            
            for row_data in batch_rows:
                try:
                    # 验证question字段不能为空
                    if not row_data.get("question"):
                        errors.append(f"Error processing row: question field cannot be empty")
                        continue
                    
                    # 确保所有字段类型正确
                    question = str(row_data["question"])
                    ground_truth = str(row_data["ground_truth"]) if row_data["ground_truth"] else ""
                    
                    # 处理context字段，将其转换为数组类型
                    context_value = row_data.get("context")
                    retrieval_context_value = row_data.get("retrieval_context")
                    tools_value = row_data.get("tools")
                    expected_tools_value = row_data.get("expected_tools")
                    
                    # Create dataset object
                    dataset_dict = {
                        "project_id": project_id,
                        "question": question,
                        "ground_truth": ground_truth,
                        "context": context_value,
                        "retrieval_context": retrieval_context_value,
                        "tools": tools_value,
                        "expected_tools": expected_tools_value,
                        "directory_id": directory_id,
                        "created_at": get_current_shanghai_time(),
                        "updated_at": get_current_shanghai_time()
                    }
                    datasets_to_create.append(dataset_dict)
                except Exception as e:
                    errors.append(f"Error processing row: {str(e)}")
            
            # Batch insert datasets if any exist
            if datasets_to_create:
                try:
                    # Use bulk insert for better performance
                    stmt = insert(Dataset).values(datasets_to_create)
                    await db.execute(stmt)
                    await db.commit()
                    datasets_created += len(datasets_to_create)
                except Exception as e:
                    # Log the error and continue with next batch
                    errors.append(f"Error inserting batch: {str(e)}")
                    await db.rollback()
        
        # 更新目录的数据集数量
        if datasets_created > 0:
            # 获取目录
            directory_result = await db.execute(
                select(DatasetDirectory)
                .where(DatasetDirectory.id == directory_id)
            )
            directory = directory_result.scalars().first()
            if directory:
                # 更新数据集数量
                directory.dataset_count += datasets_created
                await db.commit()
        
        return {
            "message": f"Successfully imported {datasets_created} datasets",
            "datasets_created": datasets_created,
            "errors": errors
        }
    except SQLAlchemyError as e:
        await db.rollback()
        errors.append(f"Database error: {str(e)}")
        return {
            "message": "Error during import process",
            "datasets_created": datasets_created,
            "errors": errors
        }
    except Exception as e:
        await db.rollback()
        errors.append(f"Unexpected error: {str(e)}")
        return {
            "message": "Error during import process",
            "datasets_created": datasets_created,
            "errors": errors
        }

@router.get("/xlsx-template")
async def get_xlsx_template():
    """Get Excel template for dataset import
    
    Returns:
        Response: Excel file
    """
    # Create template
    output = create_excel_template()
    
    # Return as downloadable file
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=dataset_template.xlsx"
        }
    )

@router.get("/by-project/{project_id}/directory/{directory_id}/export-xlsx")
async def export_datasets_xlsx(
    project_id: int,
    directory_id: int,
    question: Optional[str] = None,
    # 标签功能已废弃，移除tag_ids和tag_match_type参数
    sort_by: str = Query(default="created_at", enum=["created_at", "updated_at", "question"]),
    sort_order: str = Query(default="desc", enum=["asc", "desc"]),
    created_after: Optional[datetime] = None,
    created_before: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
) -> Response:
    """导出指定项目指定目录的数据集为Excel文件
    
    Args:
        project_id: 项目ID（路径参数）
        directory_id: 目录ID（路径参数）
        question: 可选，按问题字段搜索
        sort_by: 排序字段
        sort_order: 排序方向（"asc" 或 "desc"）
        created_after: 可选，筛选此时间之后创建的数据集
        created_before: 可选，筛选此时间之前创建的数据集
        db: 数据库会话
        
    Returns:
        Response: Excel文件
    """
    # 直接验证目录是否存在且属于指定项目（优化：减少一次项目验证查询）
    directory_result = await db.execute(
        select(DatasetDirectory).where(
            DatasetDirectory.id == directory_id,
            DatasetDirectory.project_id == project_id
        )
    )
    directory = directory_result.scalar_one_or_none()
    if not directory:
        raise HTTPException(
            status_code=500,
            detail=data_not_found_error()
        )
    
    # 构建搜索查询（标签功能已废弃，移除tag相关参数）
    query = build_search_query(
        project_id=project_id,
        question=question,
        created_after=created_after,
        created_before=created_before,
        directory_id=directory_id
    )
    
    # Apply sorting
    query = apply_sorting(query, sort_by, sort_order)
    
    # Execute query (no pagination for export)
    result = await db.execute(query)
    datasets = result.scalars().all()
    
    # 标签功能已废弃，无需获取标签信息
    
    # Format for export
    export_data = [
        {
            "dataset": dataset,
            "tags": []  # 标签功能已废弃，返回空标签列表
        }
        for dataset in datasets
    ]
    
    # Create workbook
    output = create_export_workbook(export_data)
    
    # Return as downloadable file
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=datasets_export_{project_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        }
    ) 