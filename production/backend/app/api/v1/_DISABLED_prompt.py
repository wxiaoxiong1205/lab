import logging
from typing import List, Optional, Dict, Any, Set, Union
import re
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from sqlalchemy import select, func, or_, and_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import apaginate
from app.database.base import get_db
from app.models.models import Prompt, Project, Task, PromptDirectory
from app.schemas.prompt import PromptCreate, PromptResponse, PromptUpdate
from app.utils.langchain_utils import PromptTemplateConverter
from fastapi.responses import StreamingResponse, FileResponse
import io
import jsonlines
import json
from datetime import datetime
from fastapi.responses import Response
import pandas as pd
from openpyxl.styles import Font, PatternFill
from sqlalchemy.dialects.postgresql import JSONB
from langchain_core.prompts import ChatPromptTemplate
from app.utils.dependencies import get_db_and_user  # 导入组合依赖函数
from app.utils.error_messages import data_not_found_error  # 导入统一错误消息工具模块
router = APIRouter(prefix="/api/v1/prompts", tags=["prompts"])
logger = logging.getLogger(__name__)


async def validate_project(db: AsyncSession, project_id: int) -> Project:
    """验证项目是否存在"""
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        # 统一错误格式：数据不存在
        raise HTTPException(
            status_code=500,
            detail=data_not_found_error()
        )
    return project

async def validate_directory(db: AsyncSession, project_id: int, directory_id: int) -> PromptDirectory:
    """验证目录是否存在且属于指定项目"""
    result = await db.execute(
        select(PromptDirectory).where(
            PromptDirectory.id == directory_id,
            PromptDirectory.project_id == project_id
        )
    )
    directory = result.scalar_one_or_none()
    if not directory:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=data_not_found_error()
        )
    return directory

def build_sort_query(query, sort_by: str, sort_order: str):
    """构建排序查询"""
    sort_field = getattr(Prompt, sort_by, Prompt.created_at)
    if sort_order == "asc":
        return query.order_by(asc(sort_field))
    else:
        return query.order_by(desc(sort_field))

def create_excel_response(data: List[Dict], filename_prefix: str) -> Response:
    """创建Excel响应"""
    output = io.BytesIO()
    df = pd.DataFrame(data)
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Prompts', index=False)
        worksheet = writer.sheets['Prompts']
        
        # 设置标题行样式
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        
        for cell in worksheet[1]:
            cell.font = header_font
            cell.fill = header_fill
        
        # 自动调整列宽
        for column in worksheet.columns:
            max_length = max(len(str(cell.value)) for cell in column if cell.value is not None)
            adjusted_width = min(max_length + 2, 50)
            worksheet.column_dimensions[column[0].column_letter].width = adjusted_width
    
    output.seek(0)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{filename_prefix}_{timestamp}.xlsx"
    
    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/by-project/{project_id}/directory/{directory_id}/prompts", response_model=Page[PromptResponse])
async def list_project_prompts(
    project_id: int,
    directory_id: int,
    title: Optional[str] = None,
    sort_by: str = Query(default="created_at", enum=["created_at", "updated_at", "title"]),
    sort_order: str = Query(default="desc", enum=["asc", "desc"]),
    db: AsyncSession = Depends(get_db)
) -> Page[PromptResponse]:
    """获取指定项目指定目录中的提示词列表"""
    # 验证目录
    await validate_directory(db, project_id, directory_id)
    
    # 构建查询
    query = select(Prompt).filter(
        Prompt.project_id == project_id,
        Prompt.directory_id == directory_id
    )
    
    # 添加搜索条件
    if title:
        query = query.filter(Prompt.title.ilike(f"%{title}%"))
    
    # 添加排序
    query = build_sort_query(query, sort_by, sort_order)
    
    return await apaginate(db, query)

@router.post("/by-project/{project_id}/directory/{directory_id}/prompts", response_model=PromptResponse, status_code=status.HTTP_201_CREATED)
async def create_prompt(
    project_id: int,
    directory_id: int,
    prompt_data: PromptCreate,
    db: AsyncSession = Depends(get_db)
) -> Prompt:
    """在指定项目的指定目录中创建新的prompt"""
    try:
        # 验证目录
        directory = await validate_directory(db, project_id, directory_id)
                
        if not prompt_data.messages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="请提供messages"
            )
        
        # 验证模板并获取输入变量
        template = ChatPromptTemplate.from_messages(prompt_data.messages, template_format=prompt_data.template_format)
        
        new_prompt = Prompt(
            title=prompt_data.title,
            description=prompt_data.description,
            project_id=project_id,
            messages=prompt_data.messages,
            input_variables=template.input_variables,
            template_format=prompt_data.template_format,
            directory_id=directory_id,
        )
        
        db.add(new_prompt)
        directory.prompt_count += 1
        await db.commit()
        await db.refresh(new_prompt)
        
        return new_prompt
    except Exception as e:
        await db.rollback()
        logger.error(f"创建prompt失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"创建prompt失败: {str(e)}"
        )

@router.get("/by-project/{project_id}/directory/{directory_id}/prompts/export-xlsx")
async def export_prompts_xlsx(
    project_id: int,
    directory_id: int,
    title: Optional[str] = None,
    sort_by: str = Query(default="created_at", enum=["created_at", "updated_at", "title"]),
    sort_order: str = Query(default="desc", enum=["asc", "desc"]),
    created_after: Optional[datetime] = None,
    created_before: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db)
) -> Response:
    """导出指定项目指定目录中的提示词到Excel文件"""
    try:
        # 验证目录
        await validate_directory(db, project_id, directory_id)
        
        # 构建查询条件
        conditions = [Prompt.project_id == project_id, Prompt.directory_id == directory_id]
        
        if title:
            conditions.append(Prompt.title.ilike(f"%{title}%"))
        if created_after:
            conditions.append(Prompt.created_at >= created_after)
        if created_before:
            conditions.append(Prompt.created_at <= created_before)
        
        # 构建并执行查询
        query = select(Prompt).where(and_(*conditions))
        query = build_sort_query(query, sort_by, sort_order)
        result = await db.execute(query)
        prompts = result.scalars().all()
        
        # 准备数据
        data = [
            {
                "title": prompt.title,
                "description": prompt.description or "",
                "messages": json.dumps(prompt.messages, ensure_ascii=False) if prompt.messages else "",
                "template_format": prompt.template_format or "",
            }
            for prompt in prompts
        ]
        
        return create_excel_response(data, "prompts_export")
        
    except Exception as e:
        logger.error(f"导出提示词失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"导出提示词失败: {str(e)}"
        )

@router.post("/by-project/{project_id}/directory/{directory_id}/prompts/import-xlsx", status_code=status.HTTP_201_CREATED)
async def import_prompts_xlsx(
    project_id: int,
    directory_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """从Excel文件导入提示词到指定项目的指定目录"""
    
    def validate_row(row, index: int) -> tuple[Dict, str]:
        """验证单行数据，返回(数据, 错误信息)"""
        # 验证必填字段
        for field in ["title","messages", "template_format"]:
            if pd.isna(row[field]) or str(row[field]).strip() == "":
                return None, f"第{index + 2}行: {field}不能为空"
        
        # 解析消息模板
        try:
            messages = json.loads(row["messages"])
            if not isinstance(messages, list) or len(messages) == 0:
                return None, f"第{index + 2}行: 消息模板必须是非空的JSON数组"
        except json.JSONDecodeError:
            return None, f"第{index + 2}行: 消息模板JSON格式错误"
        
        # 验证模板
        try:
            template = ChatPromptTemplate.from_messages(messages, template_format=row["template_format"].strip())
            input_variables = template.input_variables
        except Exception as e:
            return None, f"第{index + 2}行: 消息模板验证失败: {str(e)}"
        
        # 安全处理可能为nan的字段
        def safe_str(value, default=""):
            """安全转换为字符串，处理nan值"""
            if pd.isna(value):
                return default
            return str(value).strip()
        
        return {
            "title": safe_str(row["title"]),
            "description": safe_str(row.get("description", "")),
            "messages": messages,
            "template_format": safe_str(row["template_format"]),
            "input_variables": input_variables
        }, None
    
    try:
        # 验证目录和文件
        directory = await validate_directory(db, project_id, directory_id)
        
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="文件必须是Excel格式 (.xlsx 或 .xls)"
            )
        
        # 读取和验证Excel
        content = await file.read()
        df = pd.read_excel(io.BytesIO(content))
        
        required_columns = ["title", "messages", "template_format"]
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Excel文件缺少必需的列: {', '.join(missing_columns)}"
            )
        
        # 处理数据
        created_prompts = []
        errors = []
        
        for index, row in df.iterrows():
            data, error = validate_row(row, index)
            if error:
                errors.append(error)
                continue
            
            new_prompt = Prompt(
                title=data["title"],
                description=data["description"],
                project_id=project_id,
                directory_id=directory_id,
                messages=data["messages"],
                input_variables=data["input_variables"],
                template_format=data["template_format"],
            )
            
            db.add(new_prompt)
            created_prompts.append(new_prompt)
        
        # 提交更改
        if created_prompts:
            directory.prompt_count += len(created_prompts)
            await db.commit()
        
        return {
            "message": f"成功导入 {len(created_prompts)} 个提示词",
            "created_count": len(created_prompts),
            "errors": errors
        }
        
    except Exception as e:
        await db.rollback()
        logger.error(f"导入提示词失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"导入提示词失败: {str(e)}"
        )

@router.get("/by-project/{project_id}/directory/{directory_id}/prompts/{prompt_id}", response_model=PromptResponse)
async def get_prompt(
    project_id: int,
    directory_id: int,
    prompt_id: int,
    db: AsyncSession = Depends(get_db)
) -> Prompt:
    """获取指定项目指定目录中的提示词"""
    result = await db.execute(
        select(Prompt).filter(
            Prompt.id == prompt_id,
            Prompt.project_id == project_id,
            Prompt.directory_id == directory_id
        )
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=data_not_found_error()
        )
    return prompt

@router.put("/by-project/{project_id}/directory/{directory_id}/prompts/{prompt_id}", response_model=PromptResponse, status_code=status.HTTP_200_OK)
async def update_prompt(
    project_id: int,
    directory_id: int,
    prompt_id: int,
    prompt_data: PromptUpdate,
    db: AsyncSession = Depends(get_db)
) -> Prompt:
    """更新指定目录下的提示词"""
    try:
        result = await db.execute(
            select(Prompt).filter(
                Prompt.id == prompt_id,
                Prompt.project_id == project_id,
                Prompt.directory_id == directory_id
            )
        )
        prompt = result.scalar_one_or_none()
        if not prompt:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=data_not_found_error()
            )
        
        # 更新字段
        updates = {
            "title": prompt_data.title,
            "description": prompt_data.description,
            "template_format": prompt_data.template_format,
            "messages": prompt_data.messages,
        }
        
        for field, value in updates.items():
            if value is not None:
                setattr(prompt, field, value)
        
        # 处理messages更新
        if prompt_data.messages is not None:
            if prompt_data.template_format is None:
                raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"template_format不能为空"
                ) 
            prompt.messages = prompt_data.messages
            if prompt_data.messages:
                template = ChatPromptTemplate.from_messages(
                    prompt_data.messages, 
                    template_format=prompt_data.template_format
                )
            prompt.input_variables = template.input_variables
        
        await db.commit()
        await db.refresh(prompt)
        return prompt
        
    except Exception as e:
        await db.rollback()
        logger.error(f"更新prompt失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新prompt失败: {str(e)}"
        )

@router.delete("/by-project/{project_id}/directory/{directory_id}/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prompt(
    project_id: int,
    directory_id: int,
    prompt_id: int,
    db: AsyncSession = Depends(get_db)
) -> None:
    """删除指定目录下的提示词"""
    try:
        result = await db.execute(
            select(Prompt).filter(
                Prompt.id == prompt_id,
                Prompt.project_id == project_id,
                Prompt.directory_id == directory_id
            )
        )
        prompt = result.scalar_one_or_none()
        if not prompt:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=data_not_found_error()
            )
        
        await db.delete(prompt)
        
        # 更新目录计数
        directory_result = await db.execute(
            select(PromptDirectory).where(PromptDirectory.id == directory_id)
        )
        directory = directory_result.scalar_one_or_none()
        if directory:
            directory.prompt_count = max(0, directory.prompt_count - 1)
        
        await db.commit()
        
    except Exception as e:
        await db.rollback()
        logger.error(f"删除prompt失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"删除prompt失败: {str(e)}"
        )

@router.get("/xlsx-template")
async def get_xlsx_template():
    """下载提示词导入模板"""
    data = [
        {
            "title": "提示词标题",
            "description": "这是一个示例提示词",
            "messages": '[{"role": "system", "content": "你是一个有用的AI助手。"}, {"role": "user", "content": "{{ question }}"}]',
            "template_format": "jinja2"
        }
    ]
    
    return create_excel_response(data, "prompt_import_template") 