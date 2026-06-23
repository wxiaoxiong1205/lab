import json
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, HTTPException, Query, Path, status, Form, Body
from fastapi.responses import FileResponse
# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import JwtUserInfo
from app.schemas.business_attr_value import BusinessAttrValueInput, DATASET_USAGE_TO_BUSINESS_TYPE
from app.schemas.training_dataset import (
    TrainingDatasetResponse,
    TrainingDatasetSummaryResponse,
    DatasetSamplePageResponse,
    DatasetFormat,
    DatasetUsage, TrainingDatasetUploadTypeCategory,
    DatasetInUseResponse,
    DatasetProcessingStatus, TrainingDatasetExportTypeCategory,
    TrainingDatasetAggregationResponse,
    TrainingDatasetBasicInfoUpdate,
)
from app.schemas.training_task import TrainingTypeCategory, TrainingMethodType
from app.services.training_dataset.interface import TrainingDatasetService
from app.utils.dependencies import get_db_and_user
from app.utils.dataset_metadata_repair_status import (
    REPAIR_KIND_TRAINING_DATASET,
    get_metadata_fields_repair_status,
    mark_metadata_fields_repair_failed,
    mark_metadata_fields_repair_submitted,
)
from app.utils.validators import (
    validate_dataset_type_category,
    validate_training_method_type,
    validate_dataset_usage,
    validate_dataset_usage_for_filtered,
    validate_dataset_processing_status,
    validate_dataset_format,
    query_dataset_in_use,
    validate_dataset_export_type,
)

router = APIRouter(prefix="/api/v1/training-datasets", tags=["training-datasets"])


def parse_attr_values_from_form(
    attr_values: Optional[str],
    usage: DatasetUsage,
) -> List[BusinessAttrValueInput]:
    """解析并校验 attr_values JSON，根据 usage 映射 business_type"""
    if not attr_values:
        return []
    try:
        raw_list = json.loads(attr_values)
        if not isinstance(raw_list, list):
            raise HTTPException(status_code=400, detail="attr_values 必须是 JSON 数组格式")
        business_type_enum = DATASET_USAGE_TO_BUSINESS_TYPE.get(usage.value)
        if business_type_enum is None:
            raise HTTPException(status_code=400, detail=f"当前 usage={usage.value} 不支持属性值关联")
        result: List[BusinessAttrValueInput] = []
        for item in raw_list:
            if isinstance(item, dict):
                item = {**item, "business_type": business_type_enum}
            result.append(BusinessAttrValueInput.model_validate(item))
        return result
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"attr_values JSON 格式错误: {e}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"attr_values 校验失败: {e}")


@router.get("/project/{project_id}/sample/download", response_class=FileResponse)
@inject
async def download_sample_dataset(
    project_id: int = Path(..., description="项目ID"),
    dataset_type: TrainingTypeCategory = Query(..., description="数据集类型"),
    training_method_type: TrainingMethodType = Query(TrainingMethodType.BUSINESS, description="训练方法类型"), # 添加业务默认值，兼容业务测试数据集
    dataset_format: DatasetFormat = Query(DatasetFormat.BUSINESS, description="数据格式"), # 添加业务默认值，兼容业务测试数据集
    file_type: TrainingDatasetUploadTypeCategory = Query(..., description="样例文件类型"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service])
) -> FileResponse:
    """下载样例数据集
    
    ## 功能说明
    根据指定的数据集类型、训练方法类型、数据格式以及文件类型，下载对应的样例数据集文件。
    用户可以参考这些样例数据集的格式来准备自己的训练数据。
    
    ## 当前支持的样例
    - **SFT (Supervised Fine-Tuning)**: 支持所有数据格式
      - 使用同一个样例文件：`text_generation_qa_prompt_response.jsonl`
      - 包含约800条对话样本
      - 格式：每行一个JSON数组，包含system、prompt、response字段

    ## 当前支持的样例文件类型
    - **jsonl**
    - **xlsx**
    - **csv**
    
    ## 样例请求
    ```
    GET /api/v1/training-datasets/project/1/sample/download?dataset_type=text_generation&training_method_type=sft&dataset_format=role-based
    ```
    
    ## Args:
    project_id: 项目ID
    dataset_type: 数据集类型
    training_method_type: 训练方法类型
    dataset_format: 数据格式
    file_type: 文件类型
    deps: 组合依赖
        
    ## Returns:
    FileResponse:

    ```
    - jsonl样例数据集文件下载
    Content-Type: application/jsonl
    Content-Disposition: attachment; filename=text_generation_qa_prompt_response.jsonl
    - 文件内容: JSONL格式的训练样本数据
    ```

    ```
    - xlsx样例数据集文件下载
    Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    Content-Disposition: attachment; filename=text_generation_qa_prompt_response.xlsx
    - 文件内容: xlsx格式的训练样本数据
    ```
        
    ## Raises:
    HTTPException: 如果项目不存在、样例文件不存在或参数组合不支持
    """
    _, current_user = deps

    return await (training_dataset_service.download_sample_dataset(
        current_user, project_id, dataset_type, training_method_type, dataset_format, file_type))
    


@router.get("/project/{project_id}/dataset/{dataset_name}/version/{version}/download")
@inject
@OperatorLogsAnnotation(function_name=FunctionType.DATA_MANAGER_TRAINING_DATASET, table_name="training_dataset",
                        operator_type=OperatorType.DOWNLOAD, operator_content_key=["dataset_name（version）"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def download_dataset(
    project_id: int = Path(..., description="项目ID"),
    dataset_name: str = Path(..., description="数据集名称"),
    version: str = Path(..., description="数据集版本"),
    usage: DatasetUsage = Depends(validate_dataset_usage),
    file_type: TrainingDatasetExportTypeCategory =  Depends(validate_dataset_export_type),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service])
):
    """下载指定版本的数据集文件
    
    ## 功能说明
    根据项目ID、数据集名称和版本号，下载对应的数据集JSONL文件。
    用户可以直接下载已上传的训练数据集文件。
    
    ## 请求示例
    ```
    GET /api/v1/training-datasets/project/1/dataset/对话数据集/version/v1/download
    ```
    
    Args:
        project_id: 项目ID
        dataset_name: 数据集名称
        version: 数据集版本
        usage: 数据集用途
        file_type: 数据集导出格式（jsonl、json、xlsx）
        deps: 组合依赖
        training_dataset_service: 数据集业务类

    Returns:
        FileResponse: 数据集文件下载
        - Content-Type: application/jsonl
        - Content-Disposition: attachment; filename=dataset_name_version.jsonl
        - 文件内容: JSONL格式的训练数据
        
    Raises:
        HTTPException: 如果项目不存在、数据集不存在或文件不存在
    """
    _, current_user = deps

    return await training_dataset_service.download_dataset(current_user, project_id, dataset_name, version, usage, file_type)
    


@router.get("/project/{project_id}", response_model=Page[TrainingDatasetSummaryResponse])
@inject
async def list_training_datasets(
    project_id: int = Path(..., description="项目ID"),
    name: Optional[str] = Query(None, description="按数据集名称搜索"),
    dataset_type: Optional[TrainingTypeCategory] = Depends(validate_dataset_type_category),
    training_method_type: Optional[TrainingMethodType] = Depends(validate_training_method_type),
    page: Optional[int] = None,
    size: Optional[int] = None,
    usage: DatasetUsage = Depends(validate_dataset_usage),
    processing_status: Optional[DatasetProcessingStatus] = Depends(validate_dataset_processing_status),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service])
) -> Page[TrainingDatasetSummaryResponse]:
    """获取项目下的训练数据集汇总列表，支持按数据集类型筛选
    
    Args:
        project_id: 项目ID
        name: 按数据集名称搜索
        dataset_type: 数据集类型筛选（可选）
        training_method_type: 训练方法类型筛选（可选）
        usage: 数据集用途筛选（可选，training训练数据集，validation验证数据集，test测试数据集）
        processing_status: 数据集处理状态筛选（可选，pending处理中，completed处理完成，failed处理失败）
        deps: 组合依赖
        training_dataset_service: 数据集业务类

    Returns:
        分页的训练数据集汇总列表，每个数据集名称只返回一条汇总记录
    """
    db, current_user = deps

    return await training_dataset_service.list_training_datasets(project_id, name, dataset_type, training_method_type,
                                                                  usage, page, size, processing_status)
    


@router.get("/project/{project_id}/dataset/{dataset_name}", response_model=List[TrainingDatasetResponse])
@inject
async def get_training_dataset_versions(
    project_id: int = Path(..., description="项目ID"),
    dataset_name: str = Path(..., description="数据集名称"),
    usage: DatasetUsage = Depends(validate_dataset_usage),
    processing_status: Optional[DatasetProcessingStatus] = Depends(validate_dataset_processing_status),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service])
) -> List[TrainingDatasetResponse]:
    """根据数据集名称获取该数据集的所有版本
    
    Args:
        project_id: 项目ID
        dataset_name: 数据集名称
        usage: 数据集用途
        processing_status: 数据集处理状态筛选（可选，pending处理中，completed处理完成，failed处理失败）
        deps: 组合依赖
        
    Returns:
        该数据集名称下的所有版本列表，按版本号降序排序
        
    Raises:
        HTTPException: 如果项目不存在或数据集不存在
    """
    db, current_user = deps

    return await training_dataset_service.get_training_dataset_versions(project_id, dataset_name, usage, processing_status)


@router.patch("/project/{project_id}/dataset/{dataset_name}/basic-info", response_model=bool)
@inject
async def update_training_dataset_basic_info(
    project_id: int = Path(..., description="项目ID"),
    dataset_name: str = Path(..., description="当前数据集名称，用于定位需要改名的数据集组"),
    usage: DatasetUsage = Depends(validate_dataset_usage),
    update_data: TrainingDatasetBasicInfoUpdate = Body(..., description="数据集基础信息编辑请求"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service])
) -> bool:
    """编辑数据集名称和描述

    通过 project_id、dataset_name、usage 定位数据集组；name 同步修改该组所有版本，
    description 仅修改请求体 dataset_id 对应的数据集描述，并同步标注/推理结果集冗余信息。
    """
    db, current_user = deps
    return await training_dataset_service.update_training_dataset_basic_info(
        project_id, dataset_name, usage, update_data
    )


@router.get("/project/{project_id}/dataset/{dataset_name}/version/{version}/in-use", response_model=DatasetInUseResponse)
# @inject
async def check_dataset_in_use_status(
    project_id: int = Path(..., description="项目ID"),
    dataset_name: str = Path(..., description="数据集名称"),
    version: str = Path(..., description="数据集版本"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)
) -> DatasetInUseResponse:
    """查询数据集是否正在被标注或清洗任务使用
    
    ## 功能说明
    检查指定版本的数据集是否正在被进行中的标注任务或清洗任务使用。
    
    ## 返回说明
    - `in_use`: 是否被使用
    - `task_type`: 任务类型 (label: 标注任务, cleaning: 清洗任务)
    - `task_id`: 使用中的任务ID
    - `task_name`: 使用中的任务名称
    
    ## 使用场景
    前端在删除数据集或创建新任务前，可先调用此接口检查数据集是否被占用。
    
    ## 请求示例
    ```
    GET /api/v1/training-datasets/project/1/dataset/对话数据集/version/v1/in-use
    ```
    
    Args:
        project_id: 项目ID
        dataset_name: 数据集名称
        version: 数据集版本
        deps: 组合依赖
        
    Returns:
        DatasetInUseResponse: 数据集使用状态信息
    """
    db, current_user = deps
    
    result = await query_dataset_in_use(db, dataset_name, project_id, version)
    
    return DatasetInUseResponse(**result)
    


@router.get("/project/{project_id}/dataset/{name}/version/{version}/preview", response_model=DatasetSamplePageResponse)
@inject
async def preview_dataset_data(
    project_id: int = Path(..., description="项目ID"),
    name: str = Path(..., description="数据集名称"),
    version: str = Path(..., description="数据集版本"),
    usage: DatasetUsage = Depends(validate_dataset_usage),
    page: int = Query(1, description="页码", ge=1),
    size: int = Query(20, description="每页数量", ge=1, le=100),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service])
) -> DatasetSamplePageResponse:
    """预览数据集内容，分页展示JSONL文件中的每个JSON对象
    
    Args:
        project_id: 项目ID
        name: 数据集名称
        version: 数据集版本
        usage: 数据集用途
        page: 页码
        size: 每页数量
        deps: 组合依赖
        
    Returns:
        分页的数据集样本列表，每个样本包含行号和JSON数据
        
    Raises:
        HTTPException: 如果项目不存在、数据集不存在或文件读取失败
    """
    db, current_user = deps
    return await training_dataset_service.preview_dataset_data_optimized(project_id, name, version, page, size, usage)
    


@router.get("/project/{project_id}/dataset/{dataset_id}/metadata-fields", response_model=List[str])
@inject
async def get_metadata_fields(
    project_id: int = Path(..., description="项目ID"),
    dataset_id: int = Path(..., description="训练数据集ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service])
) -> List[str]:
    """获取训练数据集的元数据字段列表

    通过读取数据集对应 JSONL 文件，分析少量数据项字段，返回评估场景需要的字段名称列表；
    在解析得到的字段基础上追加虚拟字段 `model_response`（若尚未存在）。

    - 最多读取 2 条有效数据用于分析
    - 嵌套字段使用点号分隔，如：`metadata.prompt_length`
    - 若文件不存在则返回 404
    """
    db, current_user = deps
    return await training_dataset_service.get_metadata_fields(project_id, dataset_id)


@router.post("/metadata-fields/repair", response_model=Dict[str, Any])
@inject
async def repair_metadata_fields() -> Dict[str, Any]:
    """提交或查询历史训练数据集 metadata_fields 异步回填任务。"""
    from app.tasks.dataset_processing_tasks import repair_training_dataset_metadata_fields

    tenant_id: Optional[str] = None
    existing_status = await get_metadata_fields_repair_status(
        REPAIR_KIND_TRAINING_DATASET,
        tenant_id,
    )
    if existing_status:
        return existing_status

    celery_task_id = str(uuid4())
    claimed = await mark_metadata_fields_repair_submitted(
        REPAIR_KIND_TRAINING_DATASET,
        tenant_id,
        celery_task_id,
        nx=True,
    )
    if not claimed:
        existing_status = await get_metadata_fields_repair_status(
            REPAIR_KIND_TRAINING_DATASET,
            tenant_id,
        )
        if existing_status:
            return existing_status

    try:
        repair_training_dataset_metadata_fields.apply_async(
            kwargs={"tenant_id": tenant_id},
            task_id=celery_task_id,
        )
    except Exception as exc:
        await mark_metadata_fields_repair_failed(
            REPAIR_KIND_TRAINING_DATASET,
            tenant_id,
            celery_task_id,
            exc,
        )
        raise HTTPException(status_code=500, detail=f"提交训练数据集 metadata_fields 修复任务失败: {exc}") from exc

    return await get_metadata_fields_repair_status(
        REPAIR_KIND_TRAINING_DATASET,
        tenant_id,
    ) or {
        "success": True,
        "status": "submitted",
        "celery_task_id": celery_task_id,
        "message": "训练数据集 metadata_fields 修复任务已提交",
    }


@router.post("/upload", response_model=TrainingDatasetResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.DATA_MANAGER_TRAINING_DATASET, table_name="training_dataset",
                        operator_type=OperatorType.ADD, operator_content_key=["name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def create_training_dataset_with_file(
    # 必需字段
    name: str = Form(..., description="数据集名称", min_length=1, max_length=100),
    project_id: int = Form(..., description="关联项目ID", gt=0),
    dataset_type: TrainingTypeCategory = Query(..., description="数据集类型"),
    training_method_type: TrainingMethodType = Query(TrainingMethodType.BUSINESS, description="训练方法类型"), # 添加业务默认值，兼容业务测试数据集
    dataset_format: DatasetFormat = Query(DatasetFormat.BUSINESS, description="数据格式"), # 添加业务默认值，兼容业务测试数据集
    usage: DatasetUsage = Depends(validate_dataset_usage),
    chunk_upload_ids: Optional[str] = Form(..., description="分片上传ID列表（多文件上传，支持合并，多个ID用英文逗号分隔）"),
    
    # 可选字段
    version: str = Form("V1", description="数据集版本号", max_length=50),
    description: Optional[str] = Form(None, description="数据集描述", max_length=1000),
    dataset_config: Optional[str] = Form(None, description="数据集配置信息(JSON格式)", example='{"max_length": 2048, "separator": "\\n"}'),
    attr_values: Optional[str] = Form(None, description="关联属性值和选项(JSON数组格式)"),

    # 依赖注入
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service])
) -> TrainingDatasetResponse:
    """创建新的训练数据集（文件上传接口）
    
    ## 请求格式
    使用 multipart/form-data + query parameters 格式：
    
    ### Query参数（枚举类型，Swagger UI显示下拉框）：
    - `dataset_type`: 数据集类型
    - `training_method_type`: 训练方法类型  
    - `dataset_format`: 数据格式
    - `usage`: 数据集用途 (training训练数据集, validation验证数据集, test训练数据集)
    
    ### Form字段：
    - `name`: 数据集名称 (1-100字符)
    - `project_id`: 关联项目ID (必须大于0)
    - `chunk_upload_ids`: 分片上传ID列表 (.jsonl格式 / .xlsx格式 / .json格式 / .csv格式 / .zip格式)（可选，多文件上传，支持合并）
    - `version`: 数据集版本号 (可选，默认为"v1"，最多50字符)
    - `description`: 数据集描述 (可选，最多1000字符)
    - `dataset_config`: 配置信息 (可选，JSON字符串)
    - `attr_values`: 关联属性值和选项 (可选，JSON数组)

    ## 示例请求
    ```bash
    curl -X POST "/api/v1/training-datasets/upload?dataset_type=text-generation&training_method_type=sft&dataset_format=role-based&usage=training" \\
      -F 'name=对话数据集' \\
      -F 'project_id=1' \\
      -F 'version=v1' \\
      -F 'description=用于训练中文对话模型' \\
      -F 'file=@dataset.jsonl'
    ```
    """
    db, current_user = deps

    attr_values_list = parse_attr_values_from_form(attr_values, usage)

    return await training_dataset_service.create_training_dataset_with_file(
        current_user,
        name, project_id, dataset_type, training_method_type,
        dataset_format, usage, chunk_upload_ids, version, description, dataset_config, attr_values_list)
    


@router.post("/upload-version", response_model=TrainingDatasetResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.DATA_MANAGER_TRAINING_DATASET, table_name="training_dataset",
                        operator_type=OperatorType.ADD, operator_content_key=["name（new_version）"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def create_dataset_version(
    # 必需字段
    name: str = Form(..., description="数据集名称", min_length=1, max_length=100),
    project_id: int = Form(..., description="关联项目ID", gt=0),
    new_version: str = Form(..., description="新版本号", max_length=50),
    
    # 版本继承相关字段
    inherit_from_version: bool = Form(False, description="是否继承现有版本的数据"),
    source_version: Optional[str] = Form(None, description="继承的源版本号（仅继承模式需要）"),
    usage: DatasetUsage = Form(...,  description="数据用途"),

    # 文件上传（当不继承时必需）
    chunk_upload_ids: Optional[str] = Form(None, description="分片上传ID列表（多文件上传，支持合并，多个ID用英文逗号分隔）"),
    
    # 可选字段
    description: Optional[str] = Form(None, description="数据集描述", max_length=1000),
    dataset_config: Optional[str] = Form(None, description="数据集配置信息(JSON格式)", example='{"max_length": 2048, "separator": "\\n"}'),
    attr_values: Optional[str] = Form(None, description="业务属性值列表(JSON数组格式)，与 usage 对应"),

    # 依赖注入
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service])
) -> TrainingDatasetResponse:
    """基于现有数据集创建新版本
    
    ## 功能说明
    允许用户在现有数据集的基础上创建新版本，支持两种模式：
    1. **继承模式**：继承现有版本的数据文件，可只继承，也可继续上传新文件并与旧文件合并
    2. **上传模式**：上传新的数据文件，创建全新版本
    
    ## 请求格式
    使用 multipart/form-data 格式：
    
    ### Form字段：
    - `name`: 数据集名称 (必需)
    - `project_id`: 关联项目ID (必需)
    - `new_version`: 新版本号 (必需)
    - `inherit_from_version`: 是否继承现有版本 (默认false)
    - `source_version`: 源版本号 (仅继承模式需要，非继承模式会自动选择最早版本)
    - `chunk_upload_ids`: 分片上传ID列表 (上传模式时必需；继承模式可选，传入时会与源版本数据合并)
    - `description`: 描述 (可选)
    - `dataset_config`: 配置信息 (可选)
    - `attr_values`: 业务属性值列表 JSON 数组（可选）

    ## 重要说明
    - 新版本会自动继承源版本的类型信息（dataset_type、training_method_type、dataset_format、usage）
    - 继承模式：必须指定source_version参数
    - 继承模式传入 chunk_upload_ids 时，新上传文件会与 source_version 旧文件合并
    - 图像理解数据集合并时，如新旧图片同名但内容不同，会返回具体冲突图片名
    - 非继承模式：系统会自动选择最早版本获取类型信息，无需指定source_version
    
    ## 使用场景
    
    ### 场景1：继承现有版本数据
    ```bash
    curl -X POST "/api/v1/training-datasets/upload-version" \\
      -F 'name=对话数据集' \\
      -F 'project_id=1' \\
      -F 'new_version=v2.0' \\
      -F 'inherit_from_version=true' \\
      -F 'source_version=v1.0' \\
      -F 'usage=training' \\
      -F 'description=基于v1.0版本的改进版'
    ```

    ### 场景2：继承现有版本并追加新文件
    ```bash
    curl -X POST "/api/v1/training-datasets/upload-version" \
      -F 'name=图像理解数据集' \
      -F 'project_id=1' \
      -F 'new_version=v2.0' \
      -F 'inherit_from_version=true' \
      -F 'source_version=v1.0' \
      -F 'usage=training' \
      -F 'chunk_upload_ids=upload_id_1,upload_id_2' \
      -F 'description=继承v1.0并追加新数据'
    ```
    
    ### 场景3：上传新数据文件
    ```bash
    curl -X POST "/api/v1/training-datasets/upload-version" \\
      -F 'name=对话数据集' \\
      -F 'project_id=1' \\
      -F 'new_version=v2.0' \\
      -F 'inherit_from_version=false' \\
      -F 'usage=training' \\
      -F 'description=全新的v2.0数据' \\
      -F 'file=@new_dataset_v2.jsonl'
    ```
    """
    db, current_user = deps

    attr_values_list = parse_attr_values_from_form(attr_values, usage)

    # 将upload_ids字符串转化为list
    if chunk_upload_ids is not None and chunk_upload_ids != "":
        # 解析逗号分隔的字符串为整数列表
        chunk_upload_ids_list = [str(cuid.strip()) for cuid in chunk_upload_ids.split(',') if cuid.strip()]
    else:
        chunk_upload_ids_list = None

    return await training_dataset_service.create_dataset_version(
        current_user=current_user,
        name=name,
        project_id=project_id,
        new_version=new_version,
        inherit_from_version=inherit_from_version,
        source_version=source_version,
        chunk_upload_ids=chunk_upload_ids_list,
        description=description,
        dataset_config=dataset_config,
        usage=usage,
        attr_values=attr_values_list,
    )

@router.delete("/project/{project_id}/dataset/{dataset_name}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.DATA_MANAGER_TRAINING_DATASET, table_name="training_dataset",
                        operator_type=OperatorType.DELETE, operator_content_key=["dataset_name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def delete_dataset_all_versions(
    project_id: int = Path(..., description="项目ID"),
    dataset_name: str = Path(..., description="数据集名称"),
    usage: DatasetUsage = Depends(validate_dataset_usage),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service])
) -> None:
    """删除指定数据集名下的所有版本
    
    Args:
        project_id: 项目ID
        dataset_name: 数据集名称
        deps: 组合依赖
        usage: 数据集用途

    Raises:
        HTTPException: 如果项目不存在或数据集不存在
    """
    db, current_user = deps
    return await training_dataset_service.delete_dataset_all_versions(project_id, dataset_name, usage)
    


@router.delete("/project/{project_id}/dataset/{dataset_name}/{version}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.DATA_MANAGER_TRAINING_DATASET, table_name="training_dataset",
                        operator_type=OperatorType.DELETE, operator_content_key=["dataset_name（new_version）"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def delete_single_dataset(
    project_id: int = Path(..., description="项目ID"),
    dataset_name: str = Path(..., description="数据集名称"),
    version: str = Path(..., description="数据集版本"),
    usage: DatasetUsage = Depends(validate_dataset_usage),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service])
) -> None:
    """删除单个数据集版本
    
    Args:
        project_id: 项目ID
        dataset_name: 数据集名称
        usage: 数据集用途
        version: 数据集版本
        deps: 组合依赖
        
    Raises:
        HTTPException: 如果项目不存在或数据集不存在
    """
    db, current_user = deps
    return await training_dataset_service.delete_single_dataset(project_id, dataset_name, version, usage)


@router.get(
    "/project/{project_id}/stats",
    response_model=TrainingDatasetAggregationResponse,
    response_model_exclude_none=True,
)
@inject
async def get_training_dataset_aggregation_stats(
    project_id: int = Path(..., description="项目ID"),
    processing_status: DatasetProcessingStatus = Query(DatasetProcessingStatus.COMPLETED, description="数据集处理状态"),
    usage: Optional[List[DatasetUsage]] = Query(None, description="数据集用途，可多选；不传或空列表时统计结果为空"),
    dataset_type: Optional[List[TrainingTypeCategory]] = Query(None, description="数据集类型，可多选"),
    training_method_type: Optional[List[TrainingMethodType]] = Query(None, description="训练方法类型，可多选"),
    dataset_format: Optional[List[DatasetFormat]] = Query(None, description="数据集格式，可多选"),
    attr_name: Optional[str] = Query(None, description="按属性 name 筛选（需与 option_value 同时传入）"),
    option_value: Optional[str] = Query(None, description="按该属性下 option 值筛选（需与 attr_name 同时传入）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> TrainingDatasetAggregationResponse:
    """训练数据集聚合统计。
    Args:
        project_id: 项目ID
        processing_status: 数据集处理状态
        usage: 数据集用途，可多选；不传或空列表时直接返回空统计
        dataset_type: 数据集类型，可多选
        training_method_type: 训练方法类型，可多选
        dataset_format: 数据集格式，可多选
        attr_name: 按属性 name 筛选（需与 option_value 同时传入）
        option_value: 按该属性下 option 值筛选（需与 attr_name 同时传入）
    Returns:
        TrainingDatasetAggregationResponse: 训练数据集聚合统计响应
    """
    if attr_name and not option_value:
        raise HTTPException(status_code=400, detail="传入 attr_name 时，option_value 也必须同时传入")
    db, current_user = deps
    return await training_dataset_service.get_aggregation_stats(
        project_id,
        processing_status,
        attr_name=attr_name,
        option_value=option_value,
        usage=usage,
        dataset_type=dataset_type,
        training_method_type=training_method_type,
        dataset_format=dataset_format,
    )


@router.get("/project/{project_id}/filtered", response_model=Page[TrainingDatasetSummaryResponse])
@inject
async def list_training_datasets_by_filters(
    project_id: int = Path(..., description="项目ID"),
    name: Optional[str] = Query(None, description="按数据集名称搜索"),
    dataset_type: Optional[TrainingTypeCategory] = Depends(validate_dataset_type_category),
    training_method_type: Optional[TrainingMethodType] = Depends(validate_training_method_type),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=100, description="每页数量"),
    usage: Optional[DatasetUsage] = Depends(validate_dataset_usage_for_filtered),
    processing_status: DatasetProcessingStatus = Query(DatasetProcessingStatus.COMPLETED, description="按处理状态筛选，默认仅统计已完成的数据集"),
    dataset_format: Optional[DatasetFormat] = Depends(validate_dataset_format),
    attr_name: Optional[str] = Query(None, description="按属性 name 筛选（需与 option_value 同时传入）"),
    option_value: Optional[str] = Query(None, description="按该属性下 option 值筛选（需与 attr_name 同时传入）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    training_dataset_service: TrainingDatasetService = Depends(Provide[AutoContainer.training_dataset_service]),
) -> Page[TrainingDatasetSummaryResponse]:
    """按聚合结果过滤的分页列表：支持 usage、dataset_format、dataset_type、属性 option 等筛选。

    **dataset_type**：不传则不过滤数据集类型；传入则只筛该类型。
    **usage**：不传或空字符串时返回空列表（须传具体用途才查询）；传入则只筛该用途。
    **dataset_format**：不传则不过滤数据格式；传入则只筛该格式。
    可按多维度组合过滤；聚合总览见 GET .../project/{project_id}/stats。
    每条为按名称聚合的摘要（含 version_count、latest_version 及最新版本处理状态等），单次 SQL 分页。
    需展开某数据集全部版本时：GET /api/v1/training-datasets/project/{project_id}/dataset/{dataset_name}（get_training_dataset_versions）。
    列表排序：按最新版本号降序，同版本号内按最后更新时间降序。
    """
    if attr_name and not option_value:
        raise HTTPException(status_code=400, detail="传入 attr_name 时，option_value 也必须同时传入")
    db, current_user = deps
    return await training_dataset_service.list_training_datasets_by_filters(
        project_id, name, dataset_type, training_method_type,
        usage, page, size, processing_status,
        dataset_format=dataset_format,
        attr_name=attr_name,
        option_value=option_value,
    )
