import json
import os
from typing import List, Optional, Any, Dict, Tuple
from datetime import datetime

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query, Path, status, File, UploadFile, Form, Body, HTTPException
from fastapi.responses import FileResponse
from fastapi_pagination import Page
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.common.status import TaskStatus
from app.core.depend_manager import AutoContainer
from app.core.logging import logger
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import JwtUserInfo
from app.schemas.inference_result import (
    InferenceResultDatasetCreate, InferenceResultDatasetResponse,
    InferenceResultDatasetSummaryResponse, InferenceResultItemResponse,
    InferenceResultDetailResponse, InferenceResultDatasetBatchCreate,
    InferenceResultDatasetBatchResponse, InferenceMethod,
    UploadMethod, InferenceResultDatasetItemCreate, InferenceResultDatasetUploadType, TaskLogResponse,
    InferenceResultItemResponsePage, InferenceResultItemFlexibleResponsePage, InferenceDatasetUsage, InferenceResultDatasetExportType,
    InferenceResultAggregationResponse, InferenceResultDatasetBasicInfoUpdate
)
from app.schemas.training_dataset import DatasetFormat
from app.schemas.training_task import TrainingTypeCategory
from app.schemas.repository_image import CardType, CardModel
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.schemas.evaluation_task import InferenceParamType
from app.services.inference_result.interface import InferenceResultDatasetService
from app.utils.auth import get_current_user
from app.utils.dependencies import get_db_and_user
from app.utils.validators import (
    validate_inference_result_export_type,
    validate_dataset_type_category,
    validate_dataset_format,
    validate_inference_dataset_usage,
)

router = APIRouter(prefix="/api/v1/inference-result-datasets", tags=["inference-result-datasets"])


@router.get("/sample/download", response_class=FileResponse)
@inject
async def download_sample_inference_result_dataset(
    current_user: JwtUserInfo = Depends(get_current_user),
    file_type: InferenceResultDatasetUploadType = Query(..., description="样例文件类型（jsonl/json/xlsx/csv/zip，其中 zip 仅用于 image-understanding+role-based）"),
    dataset_type: TrainingTypeCategory = Query(..., description="数据集类型"),
    dataset_format: DatasetFormat = Query(..., description="数据格式，与 dataset_type 组合决定样例文件路径与下载名，见样例下载说明"),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
) -> FileResponse:
    """下载推理结果样例数据集

    根据 dataset_type、dataset_format、file_type 通过枚举配置动态解析样例文件路径与下载文件名，
    逻辑与 training-datasets 的 download_sample_dataset 一致。

    ## 支持的组合（详见样例下载说明）
    - **business** + **business**：jsonl/json/xlsx/csv → 业务数据集对话样例(business).{ext}
    - **text-generation** + **prompt-response**：jsonl/json/xlsx/csv → 文本生成对话样例(prompt-response).{ext}
    - **text-generation** + **role-based**：jsonl/json/xlsx（zip）→ 文本生成对话样例{type}(role-based).zip
    - **image-understanding** + **role-based**：zip → 图像理解对话样例(role-based).zip

    ## 样例请求
    ```
    GET /api/v1/inference-result-datasets/sample/download?file_type=jsonl&dataset_type=text-generation&dataset_format=prompt-response
    ```

    Returns:
        FileResponse: 推理结果样例文件下载

    Raises:
        HTTPException: 不支持的 type/format 组合或样例文件不存在
    """
    return await inference_result_service.download_sample_dataset(current_user, file_type, dataset_type, dataset_format)



@router.get("/project/{project_id}/datasets/{dataset_id}/metadata-fields", response_model=List[str])
@inject
async def get_metadata_fields(
    project_id: int = Path(..., description="项目ID"),
    dataset_id: int = Path(..., description="推理结果数据集ID"),
    usage: Optional[InferenceDatasetUsage] = Query(None, description="推理结果集的类型"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
) -> List[str]:
    """获取推理结果数据集的元数据字段列表
    
    通过读取数据集文件，分析所有数据项的字段，返回所有字段名称列表。
    最多读取100条数据来分析字段结构。
    
    ## 返回说明
    - 返回所有字段名称的列表（去重并排序）
    - 嵌套字段使用点号分隔，如：`metadata.prompt_length`
    - 如果数据集文件不存在或为空，返回空列表
    """
    return await inference_result_service.get_metadata_fields(project_id, dataset_id, usage)


def get_inference_result_dataset_create(
    name: str = Form(..., max_length=50, description="数据集名称"),
    description: Optional[str] = Form(None, max_length=300, description="数据集描述"),
    inference_method: InferenceMethod = Form(..., description="推理方式：offline离线推理, online在线推理, import导入推理结果集"),
    # 离线推理字段
    model_id: Optional[int] = Form(None, description="待推理模型ID（离线推理使用）"),
    model_name: Optional[str] = Form(None, description="待推理模型名称及版本（离线推理使用）"),
    model_source: Optional[str] = Form("base_model", description="模型来源：base_model基础模型, trained_model训练模型（离线推理使用，默认base_model）"),
    # 在线推理字段
    online_service_id: Optional[int] = Form(None, description="待推理服务ID（在线推理使用）"),
    online_service_name: Optional[str] = Form(None, description="待推理服务名称及版本（在线推理使用）"),
    # 待推理数据
    source_dataset_id: Optional[int] = Form(None, description="待推理数据ID（训练数据集ID）"),
    source_dataset_name: Optional[str] = Form(None, description="待推理数据名称"),
    # 待推理模型参数（JSON字符串格式，字典）
    inference_params: Optional[str] = Form(
        None, 
        description="待推理模型参数（JSON字符串，字典格式，键为推理参数类型枚举，值为参数值，可选键：temperature, top_p, max_tokens, presence_penalty，格式：{\"temperature\": 0.7, \"top_p\": 0.9, \"max_tokens\": 2048, \"presence_penalty\": 1.0}）"
    ),
    # 推理资源配置（JSON字符串格式）
    graphics_card_resource: Optional[str] = Form(
        None, 
        description="GPU/NPU 资源配置（JSON字符串，格式：{\"card_type\":\"GPU\",\"card_model\":\"A800\",\"count\":1,\"card_memory\":\"80GB\",\"k8s_resource_type\":\"nvidia.com/gpu\"}）"
    ),
    # 导入推理结果集字段
    upload_method: Optional[UploadMethod] = Form(None, description="上传方式：local本地上传, url_url获取（导入推理结果集使用）"),
    file_url: Optional[str] = Form(None, description="文件URL（导入推理结果集，URL获取方式使用）"),
    # 数据集类型和格式（仅导入推理结果集时需要前端传递，离线/在线推理会从source_dataset_id对应的训练数据集中自动获取）
    dataset_type: Optional[str] = Form(None, description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态（仅导入推理结果集时需要）"),
    dataset_format: Optional[str] = Form(None, description="数据格式：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式（仅导入推理结果集时需要）"),
    # 推理结果数据集用途，默认default，可选参数，可不传
    usage: Optional[InferenceDatasetUsage] = Form(InferenceDatasetUsage.DEFAULT_INFERENCE, description="数据集用途，默认default-inference，用于判断当前推理结果数据集是业务数据集还是默认数据集"),
    schedule_at: Optional[datetime] = Form(None, description="计划执行时间"),
    # 文件上传（导入推理结果集使用，支持jsonl、csv、xlsx格式；图像理解类型且role-based格式支持zip格式）
    files: Optional[List[UploadFile]] = File(None, description="上传的文件列表（导入推理结果集使用，支持jsonl、csv、xlsx、zip（图像理解）格式）"),
    # 分片uploadId（若不传files，则必须传uploadIds）
    chunk_upload_ids: Optional[List[str]] = Form(None, description="上传的文件分片上传id列表（导入推理结果集使用，支持jsonl、csv、xlsx、zip（图像理解）格式）")
) -> tuple[InferenceResultDatasetCreate, Optional[List[UploadFile]]]:
    """创建推理结果数据集任务请求参数依赖注入函数
    
    用于 FastAPI 依赖注入，方便 Swagger 文档展示所有参数
    """
    # 解析 graphics_card_resource JSON 字符串
    graphics_card_resource_obj = None
    if graphics_card_resource:
        try:
            resource_dict = json.loads(graphics_card_resource)
            graphics_card_resource_obj = GraphicsCardResourceConfig(**resource_dict)
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            raise HTTPException(
                status_code=400,
                detail=f"显卡资源配置 JSON 格式错误: {str(e)}"
            )
    else:
        # 使用默认值
        graphics_card_resource_obj = GraphicsCardResourceConfig(
            card_type=CardType.GPU,
            card_model=CardModel.A800,
            count=1,
            card_memory="80GB",
            k8s_resource_type="nvidia.com/gpu"
        )
    
    # 解析 inference_params JSON 字符串（字典格式）
    inference_params_obj = None
    if inference_params:
        try:
            params_dict = json.loads(inference_params)
            if not isinstance(params_dict, dict):
                raise ValueError("inference_params 必须是字典格式")
            # 验证每个键是否为有效的枚举值，并转换为枚举类型作为键
            inference_params_obj = {}
            for key, value in params_dict.items():
                if not isinstance(key, str):
                    raise ValueError(f"推理参数键必须是字符串枚举值，收到: {type(key)}")
                try:
                    param_enum = InferenceParamType(key)
                    inference_params_obj[param_enum] = value
                except ValueError:
                    raise ValueError(f"无效的推理参数枚举值: {key}，有效值: {[e.value for e in InferenceParamType]}")
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            raise HTTPException(
                status_code=400,
                detail=f"待推理模型参数 JSON 格式错误: {str(e)}"
            )

    # 解析 dataset_type 和 dataset_format（仅导入推理结果集时需要）
    from app.schemas.training_task import TrainingTypeCategory
    from app.schemas.training_dataset import DatasetFormat
    
    dataset_type_obj = None
    if dataset_type:
        try:
            dataset_type_obj = TrainingTypeCategory(dataset_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"无效的数据集类型: {dataset_type}，有效值: {[e.value for e in TrainingTypeCategory]}"
            )
    
    dataset_format_obj = None
    if dataset_format:
        try:
            dataset_format_obj = DatasetFormat(dataset_format)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"无效的数据格式: {dataset_format}，有效值: {[e.value for e in DatasetFormat]}"
            )
    
    # 处理 usage 参数，如果为 None 则使用默认值
    usage_value = usage if usage is not None else InferenceDatasetUsage.DEFAULT_INFERENCE

    dataset_create = InferenceResultDatasetCreate(
        name=name,
        description=description,
        inference_method=inference_method,
        model_id=model_id,
        model_name=model_name,
        model_source=model_source,
        online_service_id=online_service_id,
        online_service_name=online_service_name,
        source_dataset_id=source_dataset_id,
        source_dataset_name=source_dataset_name,
        inference_params={k.value: v for k, v in inference_params_obj.items()} if inference_params_obj else None,
        graphics_card_resource=graphics_card_resource_obj,
        upload_method=upload_method,
        file_url=file_url,
        dataset_type=dataset_type_obj,
        dataset_format=dataset_format_obj,
        usage=usage_value,
        schedule_at=schedule_at,
        upload_ids=chunk_upload_ids
    )
    
    return dataset_create, files


@router.post("/project/{project_id}/create", response_model=InferenceResultDatasetResponse, 
             status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.DATA_MANAGER_INFERENCE_RESULT,
    table_name="inference_result_datasets",
    operator_type=OperatorType.ADD,
    operator_content_key=["name"],
    self_service_field_mapping=None,
    scope_service_field_mapping={
        "service_name": "project_service",
        "field_name": "project_id",
        "tag_field_name": "name"
    }
)
async def create_inference_result_dataset(
    project_id: int = Path(..., description="项目ID"),
    dataset_and_files: tuple[InferenceResultDatasetCreate, Optional[List[UploadFile]]] = Depends(get_inference_result_dataset_create),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
) -> InferenceResultDatasetResponse:
    """创建推理结果数据集任务
    
    ## 功能说明
    支持三种推理方式创建推理结果数据集任务：
    
    ### 1. 离线推理 (offline)
    - 需要提供：模型ID、模型名称、待推理数据ID、显卡配置、模型参数
    - 系统将异步执行推理任务
    
    ### 2. 在线推理 (online)
    - 需要提供：服务ID、服务名称、待推理数据ID、模型参数
    - 系统将调用在线服务进行推理
    
    ### 3. 导入推理结果集 (import)
    - 需要上传文件（支持jsonl、csv、xlsx格式）
    - 支持本地上传或URL获取
    - 系统将解析文件并创建数据项
    
    ## 请求参数
    - `name`: 数据集名称（必填，最大50字符）
    - `description`: 数据集描述（可选，最大300字符）
    - `inference_method`: 推理方式（必填）
    - 其他参数根据推理方式不同而不同
    
    ## 推理模型参数说明（离线/在线推理可选）
    - `inference_params`: 推理模型参数（JSON字符串格式，字典），键为推理参数类型，值为参数值
      - 可选参数键（枚举值）：
        - `temperature`: 温度参数，范围0.0-2.0，控制模型输出的随机性
        - `top_p`: 核采样参数，范围0.0-1.0，控制模型从累积概率达到p的词汇集合中选择
        - `max_tokens`: 最大生成token数，None表示不限制
        - `presence_penalty`: 重复惩罚参数，范围>=0.0，用于减少模型生成重复内容
    - 示例格式（字典）：
      ```json
      {
        "temperature": 0.7,
        "top_p": 0.9,
        "max_tokens": 2048,
        "presence_penalty": 1.0
      }
      ```
      或只设置部分参数：
      ```json
      {
        "temperature": 0.7,
        "top_p": 0.9,
        "max_tokens": 2048
      }
      ```
    
    ## 显卡资源配置说明（仅离线推理需要）
    - `graphics_card_resource`: GPU/NPU 资源配置（JSON字符串格式），示例：
      ```json
      {
        "card_type": "GPU",
        "card_model": "A800",
        "count": 1,
        "card_memory": "80GB",
        "k8s_resource_type": "nvidia.com/gpu"
      }
      ```
      如果不提供，将使用默认值（GPU, A800, 1, 80GB, nvidia.com/gpu）
    
    ## 文件格式要求（仅导入推理结果集需要）
    - JSONL格式：每行一个JSON对象，包含system、prompt、ground_truth、model_response字段
    - CSV格式：每行一个JSON对象，包含system、prompt、ground_truth、model_response字段
    - XLSX格式：每行一个JSON对象，包含system、prompt、ground_truth、model_response字段
    - ZIP格式：仅支持图像理解类型且role-based格式，包含data.jsonl文件和images文件夹
    
    ## 返回
    创建的推理结果数据集信息
    """
    # 解包依赖注入返回的元组
    dataset, files = dataset_and_files
    
    # 调用服务创建数据集
    return await inference_result_service.create_inference_result_dataset(
        current_user=current_user,
        project_id=project_id,
        dataset=dataset,
        files=files,
    )


@router.put("/project/{project_id}/dataset/{dataset_id}", response_model=InferenceResultDatasetResponse,
            status_code=status.HTTP_200_OK)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.DATA_MANAGER_INFERENCE_RESULT,
    table_name="inference_result_datasets",
    operator_type=OperatorType.EDIT,
    operator_content_key=["name"],
    self_service_field_mapping=None,
    scope_service_field_mapping={
        "service_name": "project_service",
        "field_name": "project_id",
        "tag_field_name": "name"
    }
)
async def update_inference_result_dataset(
    project_id: int = Path(..., description="项目ID"),
    dataset_id: int = Path(..., description="推理结果数据集ID"),
    dataset_and_files: tuple[InferenceResultDatasetCreate, Optional[List[UploadFile]]] = Depends(get_inference_result_dataset_create),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
) -> InferenceResultDatasetResponse:
    """编辑推理结果数据集（参数与创建一致，仅新增 dataset_id）"""
    dataset, files = dataset_and_files
    return await inference_result_service.update_inference_result_dataset(
        current_user=current_user,
        project_id=project_id,
        dataset_id=dataset_id,
        dataset=dataset,
        files=files,
    )


@router.patch("/project/{project_id}/dataset/{dataset_id}/basic-info", response_model=bool)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.DATA_MANAGER_INFERENCE_RESULT,
    table_name="inference_result_datasets",
    operator_type=OperatorType.EDIT,
    operator_content_key=["name"],
    self_service_field_mapping=None,
    scope_service_field_mapping={
        "service_name": "project_service",
        "field_name": "project_id",
        "tag_field_name": "name"
    }
)
async def update_inference_result_dataset_basic_info(
    project_id: int = Path(..., description="项目ID"),
    dataset_id: int = Path(..., description="推理结果数据集ID"),
    update_data: InferenceResultDatasetBasicInfoUpdate = Body(..., description="推理结果集基础信息编辑请求"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
) -> bool:
    """仅编辑推理结果集名称和描述，成功返回 true。"""
    return await inference_result_service.update_inference_result_dataset_basic_info(
        project_id=project_id,
        dataset_id=dataset_id,
        update_data=update_data,
    )


@router.post("/project/{project_id}/task/{dataset_id}/stop", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def stop_inference_result_dataset(
    project_id: int = Path(..., description="项目ID"),
    dataset_id: int = Path(..., description="推理结果数据集ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
):
    """终止推理结果数据集任务，并按 Job 名删除 K8s 资源"""
    await inference_result_service.stop_inference_result_dataset(project_id, dataset_id)


def get_inference_result_dataset_item_create(
    name: str = Body(..., max_length=50, description="数据集名称"),
    description: Optional[str] = Body(None, max_length=300, description="数据集描述"),
    model_id: Optional[int] = Body(None, description="待推理模型ID（离线推理使用）"),
    model_name: Optional[str] = Body(None, description="待推理模型名称及版本（离线推理使用）"),
    online_service_id: Optional[int] = Body(None, description="待推理服务ID（在线推理使用）"),
    online_service_name: Optional[str] = Body(None, description="待推理服务名称及版本（在线推理使用）"),
    # 数据集类型和格式（仅导入推理结果集时需要前端传递，离线/在线推理会从source_dataset_id对应的训练数据集中自动获取）
    dataset_type: Optional[str] = Body(None, description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态（仅导入推理结果集时需要）"),
    dataset_format: Optional[str] = Body(None, description="数据格式：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式（仅导入推理结果集时需要）")
) -> InferenceResultDatasetItemCreate:
    """批量创建中单个推理结果数据集任务的请求参数依赖注入函数
    
    用于 FastAPI 依赖注入，方便 Swagger 文档展示所有参数
    """
    # 解析 dataset_type 和 dataset_format（仅导入推理结果集时需要）
    from app.schemas.training_task import TrainingTypeCategory
    from app.schemas.training_dataset import DatasetFormat
    
    dataset_type_obj = None
    if dataset_type:
        try:
            dataset_type_obj = TrainingTypeCategory(dataset_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"无效的数据集类型: {dataset_type}，有效值: {[e.value for e in TrainingTypeCategory]}"
            )
    
    dataset_format_obj = None
    if dataset_format:
        try:
            dataset_format_obj = DatasetFormat(dataset_format)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"无效的数据格式: {dataset_format}，有效值: {[e.value for e in DatasetFormat]}"
            )
    
    return InferenceResultDatasetItemCreate(
        name=name,
        description=description,
        model_id=model_id,
        model_name=model_name,
        online_service_id=online_service_id,
        online_service_name=online_service_name,
        dataset_type=dataset_type_obj,
        dataset_format=dataset_format_obj
    )


def get_inference_result_dataset_batch_create(
    inference_method: InferenceMethod = Body(..., description="推理方式：offline离线推理, online在线推理, import导入推理结果集"),
    source_dataset_id: Optional[int] = Body(None, description="待推理数据ID（训练数据集ID）"),
    source_dataset_name: Optional[str] = Body(None, description="待推理数据名称"),
    inference_params: Optional[dict[InferenceParamType, Any]] = Body(None, description="待推理模型参数（离线/在线推理使用，字典格式，键为推理参数类型枚举，值为参数值）"),
    graphics_card_resource: GraphicsCardResourceConfig = Body(
        default_factory=lambda: GraphicsCardResourceConfig(
            card_type=CardType.GPU,
            card_model=CardModel.A800,
            count=1,
            card_memory="80GB",
            k8s_resource_type="nvidia.com/gpu"
        ),
        description="GPU/NPU 资源配置"
    ),
    upload_method: Optional[UploadMethod] = Body(None, description="上传方式：local本地上传, url_url获取（导入推理结果集使用）"),
    # 导入推理结果集字段
    file_url: Optional[str] = Body(None, description="文件URL（导入推理结果集，URL获取方式使用）"),
    # 共用字段：数据集类型和格式（仅导入推理结果集时需要前端传递，离线/在线推理会从source_dataset_id对应的训练数据集中自动获取）
    dataset_type: Optional[str] = Body(None, description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态（仅导入推理结果集时需要，所有数据集共用）"),
    dataset_format: Optional[str] = Body(None, description="数据格式：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式（仅导入推理结果集时需要，所有数据集共用）"),
    # 共用字段：数据集用途
    usage: Optional[InferenceDatasetUsage] = Body(None, description="数据集用途：default-inference默认用途，business-inference业务用途（所有数据集共用，不传默认default-inference）"),
    datasets: List[InferenceResultDatasetItemCreate] = Body(..., description="推理结果数据集列表")
) -> InferenceResultDatasetBatchCreate:
    """批量创建推理结果数据集请求参数依赖注入函数
    
    用于 FastAPI 依赖注入，方便 Swagger 文档展示所有参数
    """
    # 解析 dataset_type 和 dataset_format（仅导入推理结果集时需要）
    from app.schemas.training_task import TrainingTypeCategory
    from app.schemas.training_dataset import DatasetFormat
    
    dataset_type_obj = None
    if dataset_type:
        try:
            dataset_type_obj = TrainingTypeCategory(dataset_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"无效的数据集类型: {dataset_type}，有效值: {[e.value for e in TrainingTypeCategory]}"
            )
    
    dataset_format_obj = None
    if dataset_format:
        try:
            dataset_format_obj = DatasetFormat(dataset_format)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"无效的数据格式: {dataset_format}，有效值: {[e.value for e in DatasetFormat]}"
            )
    
    # 处理 usage 参数，如果为 None 则使用默认值
    usage_value = usage if usage is not None else InferenceDatasetUsage.DEFAULT_INFERENCE

    return InferenceResultDatasetBatchCreate(
        inference_method=inference_method,
        source_dataset_id=source_dataset_id,
        source_dataset_name=source_dataset_name,
        inference_params=inference_params,
        graphics_card_resource=graphics_card_resource,
        upload_method=upload_method,
        file_url=file_url,
        dataset_type=dataset_type_obj,
        dataset_format=dataset_format_obj,
        usage=usage_value,
        datasets=datasets
    )


@router.post("/project/{project_id}/batch-create", response_model=InferenceResultDatasetBatchResponse,
             status_code=status.HTTP_201_CREATED)
@inject
async def batch_create_inference_result_datasets(
    project_id: int = Path(..., description="项目ID"),
    batch_create: InferenceResultDatasetBatchCreate = Depends(get_inference_result_dataset_batch_create),
    files: Optional[List[UploadFile]] = File(None, description="上传的文件列表（导入推理结果集使用，文件顺序需与datasets列表顺序对应）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
) -> InferenceResultDatasetBatchResponse:
    """批量创建推理结果数据集任务
    
    ## 功能说明
    批量创建多个推理结果数据集任务，支持三种推理方式：
    - **离线推理 (offline)**: 使用离线模型进行批量推理，每个数据集可以使用不同的模型
    - **在线推理 (online)**: 调用在线服务进行批量推理，每个数据集可以使用不同的服务
    - **导入推理结果集 (import)**: 批量导入已有的推理结果文件，每个数据集对应一个或多个文件
    
    共用字段（推理方式、待推理数据、模型参数、显卡配置等）在外侧参数中，每个数据集有自己的名称、描述、模型/服务等信息。
    
    ## 共用字段（外侧参数）
    - `inference_method`: 推理方式（必填，所有数据集共用）
      - `offline`: 离线推理
      - `online`: 在线推理
      - `import`: 导入推理结果集
    - `source_dataset_id`, `source_dataset_name`: 待推理数据（离线/在线推理必填，所有数据集共用）
    - `inference_params`: 推理模型参数（离线/在线推理可选，所有数据集共用），字典格式，键为推理参数类型，值为参数值
      - 可选参数键（枚举值）：
        - `temperature`: 温度参数，范围0.0-2.0，控制模型输出的随机性
        - `top_p`: Top_p参数，范围0.0-1.0，控制模型从累积概率达到p的词汇集合中选择
        - `max_tokens`: 最大生成token数，范围>=1，None表示不限制
        - `repetition_penalty`: 重复惩罚参数，范围>=0.0，用于减少模型生成重复内容
        - `top_k`: Top_k参数，范围>=1，限制模型从概率最高的k个词汇中选择
    - `graphics_card_resource`: GPU/NPU 资源配置（离线推理使用，所有数据集共用）
      - `card_type`: 卡类型（GPU/NPU）
      - `card_model`: 卡型号（如：A800）
      - `count`: 卡数量
      - `card_memory`: 显存大小
      - `k8s_resource_type`: K8s资源类型
    - `upload_method`: 上传方式（导入推理结果集必填）
      - `local`: 本地上传
      - `url`: URL获取
    - `file_url`: 文件URL（导入推理结果集，URL获取方式使用，所有数据集共用）
    
    ## 数据集列表
    - `datasets`: 数据集列表（必填，1-100个），每个数据集包含：
      - `name`: 数据集名称（必填，最大50字符）
      - `description`: 数据集描述（可选，最大300字符）
      - `model_id`, `model_name`: 模型信息（离线推理必填，每个数据集可以不同）
      - `online_service_id`, `online_service_name`: 服务信息（在线推理必填，每个数据集可以不同）
    
    ## 文件上传（仅导入推理结果集）
    - `files`: 文件列表（本地上传方式使用），支持jsonl、csv、xlsx格式
    - 文件顺序需与 `datasets` 列表顺序对应，每个数据集对应一个文件
    - 如果使用URL获取方式，则通过 `file_url` 字段提供URL（所有数据集共用同一个URL）
    
    ## 文件格式要求（仅导入推理结果集）
    - **JSONL格式**: 每行一个JSON对象，包含以下字段：
      - `system`: 系统提示词（可选）
      - `prompt`: 用户问题（必填）
      - `ground_truth`: 标准答案（可选）
      - `model_response`: 模型回答（必填）
    - **CSV格式**: 包含列：System、Prompt、标准回答、模型回答
    - **XLSX格式**: 包含列：System、Prompt、标准回答、模型回答
    
    ## 使用场景
    
    ### 场景1：批量离线推理
    使用同一个训练数据集，批量使用不同模型进行推理：
    ```json
    {
        "inference_method": "offline",
        "source_dataset_id": 1,
        "source_dataset_name": "问答测试集",
        "inference_params": {
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 2048,
            "presence_penalty": 1.0
        },
        "graphics_card_resource": {
            "card_type": "GPU",
            "card_model": "A800",
            "count": 1,
            "card_memory": "80GB",
            "k8s_resource_type": "nvidia.com/gpu"
        },
        "datasets": [
            {
                "name": "推理结果集_模型A",
                "description": "使用模型A推理的结果",
                "model_id": 1,
                "model_name": "Qwen3-7B-sft-20step"
            },
            {
                "name": "推理结果集_模型B",
                "description": "使用模型B推理的结果",
                "model_id": 2,
                "model_name": "Qwen3-7B-sft-30step"
            }
        ]
    }
    ```
    
    ### 场景2：批量在线推理
    使用同一个训练数据集，批量调用不同的在线服务进行推理：
    ```json
    {
        "inference_method": "online",
        "source_dataset_id": 1,
        "source_dataset_name": "问答测试集",
        "inference_params": {
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 2048
        },
        "datasets": [
            {
                "name": "推理结果集_服务A",
                "description": "使用服务A推理的结果",
                "online_service_id": 1,
                "online_service_name": "qwen-service:v1.0"
            },
            {
                "name": "推理结果集_服务B",
                "description": "使用服务B推理的结果",
                "online_service_id": 2,
                "online_service_name": "chatglm-service:v2.0"
            }
        ]
    }
    ```
    
    ### 场景3：批量导入推理结果集（本地上传）
    批量导入多个本地文件，每个文件对应一个数据集：
    ```json
    {
        "inference_method": "import",
        "upload_method": "local",
        "datasets": [
            {
                "name": "推理结果集_1",
                "description": "第一个推理结果集"
            },
            {
                "name": "推理结果集_2",
                "description": "第二个推理结果集"
            }
        ]
    }
    ```
    同时上传文件（multipart/form-data），文件顺序需与 `datasets` 列表顺序对应。
    
    ### 场景4：批量导入推理结果集（URL获取）
    通过URL批量导入推理结果集（所有数据集共用同一个URL）：
    ```json
    {
        "inference_method": "import",
        "upload_method": "url",
        "file_url": "https://example.com/inference_results.jsonl",
        "datasets": [
            {
                "name": "推理结果集_1",
                "description": "第一个推理结果集"
            },
            {
                "name": "推理结果集_2",
                "description": "第二个推理结果集"
            }
        ]
    }
    ```
    
    ## 返回
    批量创建结果，包含：
    - `total`: 总数量
    - `success_count`: 成功数量
    - `failed_count`: 失败数量
    - `results`: 成功创建的数据集列表
    - `errors`: 失败的数据集及错误信息列表
    """
    
    
    # 处理文件映射（如果提供了文件）
    files_map = None
    if files and batch_create.inference_method == InferenceMethod.IMPORT:
        # 将文件按数据集顺序分组
        # 注意：这里假设每个数据集对应一个文件，如果需要多个文件，需要更复杂的映射逻辑
        files_map = {}
        for i, dataset_item in enumerate(batch_create.datasets):
            if i < len(files):
                files_map[dataset_item.name] = [files[i]]
            # 如果文件数量少于数据集数量，后续数据集没有文件
    
    # 调用服务批量创建
    return await inference_result_service.batch_create_inference_result_datasets(
        current_user=current_user,
        project_id=project_id,
        batch_create=batch_create,
        files_map=files_map
    )


@router.get("/project/{project_id}/list", response_model=Page[InferenceResultDatasetSummaryResponse])
@inject
async def list_inference_result_datasets(
    project_id: int = Path(..., description="项目ID"),
    name: Optional[str] = Query(None, description="数据集名称（模糊搜索）"),
    inference_method: Optional[InferenceMethod] = Query(None, description="推理方式筛选"),
    status: Optional[TaskStatus] = Query(None, description="状态筛选"),
    usage: Optional[InferenceDatasetUsage] = Query(None, description="数据集用途筛选（可选，不传默认查询default-inference）"),
    dataset_type: Optional[str] = Query(None, description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态"),
    dataset_format: Optional[str] = Query(None, description="数据格式：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式"),
    source_dataset_id: Optional[int] = Query(None, description="来源数据集ID筛选（训练数据集ID）"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(10, description="每页数量"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
) -> Page[InferenceResultDatasetSummaryResponse]:
    """获取项目下的推理结果数据集任务列表（分页）
    
    ## 功能说明
    获取指定项目下的所有推理结果数据集任务，支持按名称、推理方式、状态、用途筛选、数据集类型、数据格式、来源数据集ID筛选

    ## 查询参数
    - `project_id`: 项目ID（路径参数）
    - `name`: 数据集名称（可选，模糊搜索）
    - `inference_method`: 推理方式筛选（可选）
    - `status`: 状态筛选（可选）
    - `dataset_type`: 数据集类型（可选）：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态
    - `dataset_format`: 数据格式（可选）：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式
    - `source_dataset_id`: 来源数据集ID筛选（可选，数据集ID）
    - `usage`: 数据集用途筛选（可选，不传默认查询default-inference）
    - `page`: 页码（默认1）
    - `size`: 每页数量（默认10，最大100）
    
    ## 返回
    分页的推理结果数据集列表
    """
    # 如果 usage 为 None，使用默认值 DEFAULT_INFERENCE
    usage_filter = usage if usage is not None else InferenceDatasetUsage.DEFAULT_INFERENCE

    return await inference_result_service.list_inference_result_datasets(
        project_id=project_id,
        name=name,
        inference_method=inference_method,
        status=status,
        dataset_type=dataset_type,
        dataset_format=dataset_format,
        source_dataset_id=source_dataset_id,
        usage=usage_filter,
        page=page,
        size=size
    )


@router.get("/project/{project_id}/dataset/{dataset_id}", response_model=InferenceResultDatasetResponse)
@inject
async def get_inference_result_dataset(
    project_id: int = Path(..., description="项目ID"),
    dataset_id: int = Path(..., description="数据集ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
) -> InferenceResultDatasetResponse:
    """获取指定推理结果数据集任务详情
    
    ## 功能说明
    获取指定推理结果数据集任务的详细信息
    
    ## 路径参数
    - `project_id`: 项目ID
    - `dataset_id`: 数据集ID
    
    ## 返回
    推理结果数据集详细信息；`attr_values` 为关联业务属性值及选项（含 `attr_options` 属性定义下拉项）
    """

    return await inference_result_service.get_inference_result_dataset(
        project_id=project_id,
        dataset_id=dataset_id
    )


@router.get("/project/{project_id}/dataset/{dataset_id}/detail", response_model=InferenceResultDetailResponse)
@inject
async def get_inference_result_detail(
    project_id: int = Path(..., description="项目ID"),
    dataset_id: int = Path(..., description="数据集ID"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(10, ge=1, le=10, description="每页数量（预览接口，最大10）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
) -> InferenceResultDetailResponse:
    """获取推理结果数据集任务详情（包含数据预览）
    
    ## 功能说明
    获取推理结果数据集任务的详细信息，包括基本信息和数据预览（分页）
    注意：这是预览接口，每页数量最大为10。
    
    ## 路径参数
    - `project_id`: 项目ID
    - `dataset_id`: 数据集ID
    
    ## 查询参数
    - `page`: 页码（默认1）
    - `size`: 每页数量（默认10，最大10）
    
    ## 返回
    推理结果数据集详情，包含数据预览
    """

    return await inference_result_service.get_inference_result_detail(
        project_id=project_id,
        dataset_id=dataset_id,
        page=page,
        size=size
    )


@router.get("/project/{project_id}/dataset/{dataset_id}/items")
@inject
async def preview_inference_result_items(
    project_id: int = Path(..., description="项目ID"),
    dataset_id: int = Path(..., description="数据集ID"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(10, ge=1, le=10, description="每页数量（预览接口，最大10）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
) -> InferenceResultItemResponsePage | InferenceResultItemFlexibleResponsePage:
    """预览推理结果数据项（分页展示）
    
    ## 功能说明
    分页预览推理结果数据集中的数据项
    注意：这是预览接口，每页数量最大为10。
    
    ## 返回格式说明
    根据数据集的 `usage` 字段，返回格式会有所不同：

    ### 业务推理结果集 (business-inference)
    返回宽松格式，直接返回原始JSON对象的所有字段：
    - `id`: 数据项ID（行号）
    - `dataset_id`: 关联数据集ID
    - `sequence`: 序号（行号）
    - `data`: 原始数据对象（包含JSONL文件中的所有字段）

    ### 默认推理结果集 (default-inference)
    返回固定格式，提取固定字段：
    - `id`: 数据项ID（行号）
    - `dataset_id`: 关联数据集ID
    - `sequence`: 序号（行号）
    - `system`: System提示词
    - `prompt`: Prompt
    - `standard_response`: 标准回答
    - `model_response`: 模型回答
    - `messages`: 多轮对话的消息内容（可选）
    - `images`: 图片理解用到的图片材料相对路径（可选）
    - `error`: 是否报错
    - `error_message`: 报错信息

    ## 路径参数
    - `project_id`: 项目ID
    - `dataset_id`: 数据集ID
    
    ## 查询参数
    - `page`: 页码（默认1）
    - `size`: 每页数量（默认10，最大10）
    
    ## 返回
    分页的推理结果数据项列表（格式根据数据集的 usage 字段自动判断）
    """

    return await inference_result_service.preview_inference_result_items(
        project_id=project_id,
        dataset_id=dataset_id,
        page=page,
        size=size
    )


@router.get("/project/{project_id}/dataset/{dataset_id}/download")
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.DATA_MANAGER_INFERENCE_RESULT,
    table_name="inference_result_datasets",
    operator_type=OperatorType.DOWNLOAD,
    operator_content_key=["name"],
    self_service_field_mapping=None,
    scope_service_field_mapping={
        "service_name": "project_service",
        "field_name": "project_id",
        "tag_field_name": "name"
    }
)
async def download_inference_result_dataset(
    project_id: int = Path(..., description="项目ID"),
    dataset_id: int = Path(..., description="数据集ID"),
    file_type: InferenceResultDatasetExportType = Depends(validate_inference_result_export_type),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
):
    """下载推理结果数据集，支持多格式导出（jsonl、json、xlsx）
    
    ## 功能说明
    将推理结果数据集导出为指定格式的文件下载
    
    ## 路径参数
    - `project_id`: 项目ID
    - `dataset_id`: 数据集ID
    
    ## 查询参数
    - `file_type`: 导出格式（jsonl、json、xlsx），默认 jsonl

    ## 返回
    指定格式的文件下载
    """

    return await inference_result_service.download_inference_result_dataset(
        current_user=current_user,
        project_id=project_id,
        dataset_id=dataset_id,
        file_type=file_type
    )


@router.delete("/project/{project_id}/dataset/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.DATA_MANAGER_INFERENCE_RESULT,
    table_name="inference_result_datasets",
    operator_type=OperatorType.DELETE,
    operator_content_key=["name"],
    self_service_field_mapping=None,
    scope_service_field_mapping={
        "service_name": "project_service",
        "field_name": "project_id",
        "tag_field_name": "name"
    }
)
async def delete_inference_result_dataset(
    project_id: int = Path(..., description="项目ID"),
    dataset_id: int = Path(..., description="数据集ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
):
    """删除推理结果数据集
    
    ## 功能说明
    删除指定的推理结果数据集任务，同时删除关联的数据项和文件
    
    ## 路径参数
    - `project_id`: 项目ID
    - `dataset_id`: 数据集ID
    
    ## 返回
    204 No Content
    """

    await inference_result_service.delete_inference_result_dataset(
        project_id=project_id,
        dataset_id=dataset_id
    )


@router.get("/project/{project_id}/task/{dataset_id}/logs", response_model=TaskLogResponse)
@inject
async def get_task_logs(
        project_id: int = Path(..., description="项目ID"),
        dataset_id: int = Path(..., description="推理结果数据集id"),
        end_time: datetime = Query(..., description="结束时间（ISO格式），用于指定Loki查询的结束时间点"),
        days: Optional[int] = Query(30, description="如果没有归档日志，从结束时间往前查询N天的日志"),
        current_user: JwtUserInfo = Depends(get_current_user),
        inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
) -> TaskLogResponse:
    """查询任务日志

    ## 功能说明
    获取评估任务的执行日志。
    - 如果有归档日志（存储在MinIO），返回归档日志
    - 如果没有归档日志，从Loki获取实时日志
    """
    return await inference_result_service.get_task_logs(project_id, dataset_id, end_time, days)


@router.get("/project/{project_id}/task/{dataset_id}/logs/download")
@inject
async def download_task_logs(
        project_id: int = Path(..., description="项目ID"),
        dataset_id: int = Path(..., description="推理结果数据集id"),
        current_user: JwtUserInfo = Depends(get_current_user),
        inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service])
):
    """下载任务日志文件

    ## 功能说明
    下载评估任务的归档日志文件（从MinIO下载）。

    ## 路径参数
    - `project_id`: 项目ID
    - `dataset_id`: 推理结果数据集id

    ## 返回
    日志文件流（text/plain格式）

    ## 注意事项
    - 只有已归档的日志才能下载（任务完成后自动归档）
    - 如果任务没有归档日志，将返回 404 错误
    - 文件名为日志在MinIO中的原始文件名
    """
    return await inference_result_service.download_task_logs(project_id, dataset_id)


def _validate_attr_name_option_pair(attr_name: Optional[str], option_value: Optional[str]) -> None:
    """业务属性筛选：attr_name 与 option_value 须同时有有效值或同时不传（空字符串视为未传）。"""
    def _present(v: Optional[str]) -> bool:
        return v is not None and v.strip() != ""

    if _present(attr_name) != _present(option_value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="按业务属性筛选时，attr_name 与 option_value 必须同时传入；不需要该筛选时请同时不传或留空。",
        )


@router.get(
    "/project/{project_id}/stats",
    response_model=InferenceResultAggregationResponse,
    response_model_exclude_none=True,
)
@inject
async def get_inference_result_aggregation_stats(
    project_id: int = Path(..., description="项目ID"),
    status: TaskStatus = Query(TaskStatus.COMPLETED, description="数据集任务状态，默认仅统计已完成"),
    usage: Optional[List[InferenceDatasetUsage]] = Query(None, description="按用途筛选统计范围（可多选）；不传或空列表时统计结果为空；响应不含按 usage 分组的统计项"),
    dataset_type: Optional[List[TrainingTypeCategory]] = Query(None, description="数据集类型，可多选"),
    dataset_format: Optional[List[DatasetFormat]] = Query(None, description="数据集格式，可多选"),
    attr_name: Optional[str] = Query(None, description="按属性 name 筛选（需与 option_value 同时传入）"),
    option_value: Optional[str] = Query(None, description="按该属性下 option 值筛选（需与 attr_name 同时传入）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service]),
) -> InferenceResultAggregationResponse:
    """推理结果数据集聚合统计。

    按 dataset_format、dataset_type、业务属性选项统计数据集条数（不按 usage 出维度）；须传非空 ``usage`` 才统计，不传或空列表则返回空统计。
    表为 ``inference_result_datasets``；其余筛选语义对齐训练数据集 ``.../stats``。
    """
    _validate_attr_name_option_pair(attr_name, option_value)
    _db, _current_user = deps
    return await inference_result_service.get_aggregation_stats(
        project_id,
        status,
        attr_name=attr_name,
        option_value=option_value,
        usage=usage,
        dataset_type=dataset_type,
        dataset_format=dataset_format,
    )


@router.get("/project/{project_id}/filtered", response_model=Page[InferenceResultDatasetSummaryResponse])
@inject
async def list_inference_result_datasets_by_filters(
    project_id: int = Path(..., description="项目ID"),
    name: Optional[str] = Query(None, description="按数据集名称搜索"),
    dataset_type: Optional[TrainingTypeCategory] = Depends(validate_dataset_type_category),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(10, ge=1, le=100, description="每页数量，最大100"),
    usage: Optional[InferenceDatasetUsage] = Depends(validate_inference_dataset_usage),
    status: TaskStatus = Query(TaskStatus.COMPLETED, description="按任务状态筛选，默认仅列出已完成的数据集"),
    dataset_format: Optional[DatasetFormat] = Depends(validate_dataset_format),
    attr_name: Optional[str] = Query(None, description="按属性 name 筛选（需与 option_value 同时传入）"),
    option_value: Optional[str] = Query(None, description="按该属性下 option 值筛选（需与 attr_name 同时传入）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    inference_result_service: InferenceResultDatasetService = Depends(Provide[AutoContainer.inference_result_dataset_service]),
) -> Page[InferenceResultDatasetSummaryResponse]:
    """按多条件过滤的分页列表：支持 usage、dataset_format、dataset_type、属性 option 等筛选。

    **dataset_type**：不传则不过滤；传入则只筛该类型。
    **usage**：不传或空字符串时返回空列表（须传具体用途才查询）；传入则只筛该用途（default-inference 时包含历史 usage 为空的记录）。
    **dataset_format**：不传则不过滤；传入则只筛该格式。
    **page** / **size**：分页；``size`` 上限 100。
    推理结果集为单表记录，无训练侧「按名称聚合多版本」；聚合总览见 ``GET .../project/{project_id}/stats``。
    """
    _validate_attr_name_option_pair(attr_name, option_value)
    _db, _current_user = deps
    return await inference_result_service.list_inference_result_datasets_by_filters(
        project_id,
        name,
        dataset_type,
        usage,
        page,
        size,
        status,
        dataset_format=dataset_format,
        attr_name=attr_name,
        option_value=option_value,
    )

