import logging
import io
import json
from datetime import datetime
from typing import List, Optional, Dict, Tuple
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select, update, delete, func, and_, or_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import status

# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import apaginate

from app.database.base import get_db
from app.models.models import LLMConfig, User, JwtUserInfo
from app.schemas.llm_config import (
    LLMConfigBase, LLMConfigCreate, LLMConfigUpdate, 
    LLMConfigResponse, LLMConfigSearch
)
from app.utils.auth import get_current_user
from app.utils.dependencies import get_db_and_user  # 导入组合依赖函数
# 导入统一错误消息工具模块
from app.utils.error_messages import data_exists_error, data_not_found_error

router = APIRouter(
    prefix="/api/v1/llm_configs",
    tags=["llm-configs"],
    responses={404: {"description": "Not found"}},
)

logger = logging.getLogger(__name__)

# 常量定义
EXCEL_FIELDS = [
    "name", "description", "model", "temperature", 
    "max_tokens", "timeout_seconds", "max_retries", 
    "api_key", "base_url"
]

REQUIRED_FIELDS = ["name", "model"]

# 工具函数
def build_query_conditions(project_id: int, name: Optional[str] = None, 
                          model: Optional[str] = None, is_default: Optional[bool] = None):
    """构建查询条件"""
    conditions = [LLMConfig.project_id == project_id]
    
    if name is not None:
        conditions.append(LLMConfig.name.ilike(f"%{name}%"))
    if model is not None:
        conditions.append(LLMConfig.model.ilike(f"%{model}%"))
    if is_default is not None:
        conditions.append(LLMConfig.is_default == is_default)
    
    return conditions

def apply_sorting(query, sort_by: str, sort_order: str):
    """应用排序"""
    sort_fields = {
        "name": LLMConfig.name,
        "updated_at": LLMConfig.updated_at,
        "created_at": LLMConfig.created_at
    }
    
    field = sort_fields.get(sort_by, LLMConfig.created_at)
    order_func = asc if sort_order == "asc" else desc
    
    return query.order_by(order_func(field))

def config_to_dict(config: LLMConfig) -> Dict:
    """将配置对象转换为字典"""
    return {
        "name": config.name,
        "description": config.description,
        "model": config.model,
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
        "timeout_seconds": config.timeout,
        "max_retries": config.max_retries,
        "api_key": config.api_key,
        "base_url": config.base_url
    }

def create_excel_response(data: List[Dict], filename_prefix: str) -> Response:
    """创建Excel响应"""
    df = pd.DataFrame(data)
    output = io.BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='LLM配置')
        worksheet = writer.sheets['LLM配置']
        
        # 调整列宽
        for idx, col in enumerate(df.columns):
            max_length = max(
                df[col].astype(str).apply(len).max(),
                len(str(col))
            )
            worksheet.column_dimensions[chr(65 + idx)].width = max_length + 2
    
    excel_data = output.getvalue()
    output.close()
    
    response = Response(content=excel_data)
    response.headers["Content-Disposition"] = f"attachment; filename={filename_prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    response.headers["Content-Type"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    
    return response

def get_safe_value(row: pd.Series, field: str, value_type: type = str, default=None):
    """安全获取行数据值"""
    if field not in row.index or pd.isna(row[field]):
        return default
    
    value = str(row[field]).strip() if value_type == str else row[field]
    
    if value_type == str and not value:
        return default
    
    try:
        return value_type(value) if value_type != str else value
    except (ValueError, TypeError):
        return default

@router.post("/by-project/{project_id}", response_model=LLMConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_llm_config(
    project_id: int,
    llm_config: LLMConfigCreate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
):
    """
    创建新的LLM配置
    """
    db, current_user = deps  # 解包依赖
    
    # 检查名称是否已存在
    query = select(func.count()).where(
        and_(
            LLMConfig.project_id == project_id,
            LLMConfig.name == llm_config.name
        )
    )
    result = await db.execute(query)
    count = result.scalar()
    if count > 0:
        # 统一错误格式：数据已存在
        raise HTTPException(status_code=400, detail=data_exists_error(llm_config.name))
    
    # 如果设置为默认配置，需要将其他配置的默认状态设为False
    if llm_config.is_default:
        update_stmt = update(LLMConfig).where(
            LLMConfig.project_id == project_id
        ).values(is_default=False)
        await db.execute(update_stmt)
    
    # 创建新配置，直接使用路径参数中的project_id
    llm_config_data = llm_config.model_dump()
    llm_config_data['project_id'] = project_id  # 强制使用路径参数的project_id
    
    db_llm_config = LLMConfig(**llm_config_data)
    db.add(db_llm_config)
    await db.commit()
    await db.refresh(db_llm_config)
    
    return db_llm_config

@router.get("/by-project/{project_id}/list", response_model=Page[LLMConfigResponse])
async def list_llm_configs(
    project_id: int,
    name: Optional[str] = Query(None, description="配置名称，支持模糊搜索"),
    model: Optional[str] = Query(None, description="模型名称，支持模糊搜索"),
    is_default: Optional[bool] = Query(None, description="是否为默认配置"),
    sort_by: str = Query(default="created_at", enum=["created_at", "updated_at", "name"], description="排序字段"),
    sort_order: str = Query(default="desc", enum=["asc", "desc"], description="排序方向"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Page[LLMConfigResponse]:
    """
    获取项目下的LLM配置列表，支持搜索和排序 - 使用 fastapi-pagination 进行分页
    
    参数:
    - project_id: 项目ID（必需）
    - name: 配置名称（支持模糊搜索）
    - model: 模型名称（支持模糊搜索）
    - is_default: 是否为默认配置
    - sort_by: 排序字段，支持 created_at、updated_at、name
    - sort_order: 排序方向，支持 asc、desc
    """
    db, current_user = deps  # 解包依赖
    
    # 构建查询
    conditions = build_query_conditions(project_id, name, model, is_default)
    query = select(LLMConfig).where(and_(*conditions))
    query = apply_sorting(query, sort_by, sort_order)
    
    # 使用 fastapi-pagination 进行分页
    return await apaginate(db, query)

@router.get("/by-project/{project_id}/config/{config_id}", response_model=LLMConfigResponse)
async def get_llm_config(
    project_id: int,
    config_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
):
    """
    获取特定的LLM配置
    """
    db, current_user = deps  # 解包依赖
    
    query = select(LLMConfig).where(
        and_(
            LLMConfig.project_id == project_id,
            LLMConfig.id == config_id
        )
    )
    
    result = await db.execute(query)
    llm_config = result.scalars().first()
    
    if not llm_config:
        # 统一错误格式：数据不存在
        raise HTTPException(status_code=500, detail=data_not_found_error())
    
    return llm_config

@router.put("/by-project/{project_id}/config/{config_id}", response_model=LLMConfigResponse, status_code=status.HTTP_200_OK)
async def update_llm_config(
    project_id: int,
    config_id: int,
    llm_config_update: LLMConfigUpdate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
):
    """
    更新LLM配置
    """
    db, current_user = deps  # 解包依赖
    
    # 检查配置是否存在
    query = select(LLMConfig).where(
        and_(
            LLMConfig.project_id == project_id,
            LLMConfig.id == config_id
        )
    )
    
    result = await db.execute(query)
    db_llm_config = result.scalars().first()
    
    if not db_llm_config:
        # 统一错误格式：数据不存在
        raise HTTPException(status_code=500, detail=data_not_found_error())
    
    # 如果更新名称，检查名称是否已存在
    if llm_config_update.name is not None and llm_config_update.name != db_llm_config.name:
        name_query = select(func.count()).where(
            and_(
                LLMConfig.project_id == project_id,
                LLMConfig.name == llm_config_update.name,
                LLMConfig.id != config_id
            )
        )
        name_result = await db.execute(name_query)
        name_count = name_result.scalar()
        if name_count > 0:
            # 统一错误格式：数据已存在
            raise HTTPException(status_code=400, detail=data_exists_error(llm_config_update.name))
    
    # 如果设置为默认配置，需要将其他配置的默认状态设为False
    if llm_config_update.is_default is True:
        update_stmt = update(LLMConfig).where(
            and_(
                LLMConfig.project_id == project_id,
                LLMConfig.id != config_id
            )
        ).values(is_default=False)
        await db.execute(update_stmt)
    
    # 更新配置
    update_data = llm_config_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_llm_config, key, value)
    
    await db.commit()
    await db.refresh(db_llm_config)
    
    return db_llm_config

@router.delete("/by-project/{project_id}/config/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_llm_config(
    project_id: int,
    config_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> None:
    """删除LLM配置
    
    Args:
        project_id: 项目ID
        config_id: 配置ID
        deps: 组合依赖，包含数据库会话和当前用户
        
    Returns:
        None: 统一返回204状态码，无响应体内容
    """
    db, current_user = deps  # 解包依赖
    
    # 检查配置是否存在
    query = select(LLMConfig).where(
        and_(
            LLMConfig.project_id == project_id,
            LLMConfig.id == config_id
        )
    )
    
    result = await db.execute(query)
    db_llm_config = result.scalars().first()
    
    if not db_llm_config:
        # 统一错误格式：数据不存在
        raise HTTPException(status_code=500, detail=data_not_found_error())
    
    # 删除配置
    delete_stmt = delete(LLMConfig).where(
        and_(
            LLMConfig.project_id == project_id,
            LLMConfig.id == config_id
        )
    )
    
    await db.execute(delete_stmt)
    await db.commit()
    
    # 统一返回None，符合RESTful规范 - 删除成功返回204无内容
    return None

@router.get("/by-project/{project_id}/default", response_model=LLMConfigResponse)
async def get_default_llm_config(
    project_id: int,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
):
    """
    获取项目的默认LLM配置
    """
    db, current_user = deps  # 解包依赖
    
    query = select(LLMConfig).where(
        and_(
            LLMConfig.project_id == project_id,
            LLMConfig.is_default == True
        )
    )
    
    result = await db.execute(query)
    llm_config = result.scalars().first()
    
    if not llm_config:
        # 统一错误格式：数据不存在
        raise HTTPException(status_code=500, detail=data_not_found_error())
    
    return llm_config

@router.get("/by-project/{project_id}/export-xlsx")
async def export_llm_configs_xlsx(
    project_id: int,
    name: Optional[str] = Query(None, description="配置名称，支持模糊搜索"),
    model: Optional[str] = Query(None, description="模型名称，支持模糊搜索"),
    is_default: Optional[bool] = Query(None, description="是否为默认配置"),
    sort_by: str = Query(default="created_at", enum=["created_at", "updated_at", "name"], description="排序字段"),
    sort_order: str = Query(default="desc", enum=["asc", "desc"], description="排序方向"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
) -> Response:
    """
    导出LLM配置为Excel格式
    
    使用与list_llm_configs相同的过滤条件，但返回Excel格式的文件
    
    参数:
    - project_id: 项目ID（路径参数）
    - name: 配置名称（支持模糊搜索）
    - model: 模型名称（支持模糊搜索）
    - is_default: 是否为默认配置
    - sort_by: 排序字段
    - sort_order: 排序方向
    """
    db, current_user = deps  # 解包依赖
    
    # 构建查询
    conditions = build_query_conditions(project_id, name, model, is_default)
    query = select(LLMConfig).where(and_(*conditions))
    query = apply_sorting(query, sort_by, sort_order)
    
    # 执行查询
    result = await db.execute(query)
    llm_configs = result.scalars().all()
    
    # 转换为字典列表
    data = [config_to_dict(config) for config in llm_configs]
    
    return create_excel_response(data, "llm_configs_export")

@router.post("/by-project/{project_id}/import-xlsx", status_code=status.HTTP_201_CREATED)
async def import_llm_configs_xlsx(
    project_id: int,
    file: UploadFile = File(...),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
):
    """
    从Excel文件导入LLM配置到指定项目
    
    参数:
    - project_id: 项目ID（路径参数）
    - file: Excel文件
    
    Excel文件应包含以下列：
    - name（必填）
    - description
    - model（必填）
    - temperature
    - max_tokens
    - timeout_seconds
    - max_retries
    - api_key
    - base_url
    """
    db, current_user = deps  # 解包依赖
    if not file.filename.endswith('.xlsx'):
        raise HTTPException(status_code=400, detail="请上传.xlsx格式的文件")
    
    try:
        # 读取Excel文件
        df = pd.read_excel(io.BytesIO(await file.read()))
        
        # 验证必填列是否存在
        required_columns = ["name", "model","base_url","api_key"]
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise HTTPException(
                status_code=400,
                detail=f"Excel文件缺少必填列: {', '.join(missing_columns)}"
            )
        
        # 处理每一行
        configs_created = 0
        errors = []
        
        for index, row in df.iterrows():
            try:
                # 验证必填字段
                name = get_safe_value(row, "name", str)
                model = get_safe_value(row, "model", str)
                base_url = get_safe_value(row, "base_url", str)
                api_key = get_safe_value(row,"api_key",str)
                
                if not name:
                    errors.append(f"行 {index + 2}: name不能为空")
                    continue
                
                if not model:
                    errors.append(f"行 {index + 2}: model不能为空")
                    continue
                
                if not base_url:
                    errors.append(f"行 {index + 2}: base_url不能为空")
                    continue
                
                if not api_key:
                    errors.append(f"行 {index + 2}: api_key不能为空")
                    continue

                # 检查名称是否已存在
                existing_query = select(func.count()).where(
                    and_(LLMConfig.project_id == project_id, LLMConfig.name == name)
                )
                existing_result = await db.execute(existing_query)
                if existing_result.scalar() > 0:
                    errors.append(f"行 {index + 2}: {data_exists_error(name)}")
                    continue
                
                # 创建新配置
                db_llm_config = LLMConfig(
                    project_id=project_id,
                    name=name,
                    description=get_safe_value(row, "description", str),
                    model=model,
                    temperature=get_safe_value(row, "temperature", float),
                    max_tokens=get_safe_value(row, "max_tokens", int),
                    timeout=get_safe_value(row, "timeout_seconds", int),
                    max_retries=get_safe_value(row, "max_retries", int),
                    api_key=get_safe_value(row, "api_key", str),
                    base_url=get_safe_value(row, "base_url", str),
                    organization=None,
                    additional_params={},
                    is_default=False
                )
                
                db.add(db_llm_config)
                configs_created += 1
                
            except Exception as e:
                errors.append(f"行 {index + 2}: {str(e)}")
        
        # 提交事务
        if configs_created > 0:
            await db.commit()
        
        # 返回结果
        return {
            "message": f"成功导入 {configs_created} 个LLM配置",
            "configs_created": configs_created,
            "errors": errors
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"处理Excel文件时出错: {str(e)}")

@router.get("/xlsx-template")
async def get_xlsx_template(
    current_user: User = Depends(get_current_user)
) -> Response:
    """
    获取Excel导入模板
    
    返回一个示例Excel文件，用于导入LLM配置
    """
    # 创建示例数据
    examples = [
        {
            "name": "GPT-4 Configuration Example",
            "description": "GPT-4 configuration for high-quality generation",
            "model": "gpt-4",
            "temperature": 0.7,
            "max_tokens": 2000,
            "timeout_seconds": 60,
            "max_retries": 3,
            "api_key": "your-api-key",
            "base_url": "https://api.openai.com/v1"
        },
        {
            "name": "GPT-3.5 Configuration Example",
            "description": "GPT-3.5 configuration for fast response",
            "model": "gpt-3.5-turbo",
            "temperature": 0.5,
            "max_tokens": 1000,
            "timeout_seconds": 30,
            "max_retries": 2,
            "api_key": "",
            "base_url": ""
        }
    ]
    
    return create_excel_response(examples, "llm_config_template") 