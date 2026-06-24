from typing import Optional, List

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Query, Depends

from app.core.depend_manager import AutoContainer
from app.services.enums.interface import EnumService, EnumListResponse
from app.schemas.evaluation_task import InferenceParamType, InferenceParamInfo, MetricsParam, MetricsParamInfo
from app.schemas.model import (
    MlModelType,
    ML_TASK_TYPES_BY_ML_MODEL_TYPE,
    ML_TASK_TYPE_LABEL_CN,
    MlTaskTypeEnumItem,
    MlTaskTypesByModalityResp,
)

# 导入所有枚举类

router = APIRouter(prefix="/api/v1/enums", tags=["enums"])





@router.get("/list", response_model=EnumListResponse)
@inject
async def list_enums(
    module: Optional[str] = Query(None, description="按模块筛选枚举，支持的值：model、training_dataset、training_task、benchmark。传空字符串或不传则返回所有枚举"),
    enum_service: EnumService = Depends(Provide[AutoContainer.enum_service])
) -> EnumListResponse:
    """获取所有可用的枚举详细信息
    
    获取系统中所有可用的枚举类的详细信息，包括每个枚举的所有选项。
    支持按模块筛选，返回完整的枚举信息而不仅仅是名称列表。
    
    Args:
        module: 可选的模块名称筛选，支持的值：
               - model: 模型相关枚举
               - training_dataset: 训练数据集相关枚举  
               - training_task: 训练任务相关枚举
               - evaluation_task: 评估任务相关枚举
               - 传空字符串或不传: 返回所有枚举
        
    Returns:
        EnumListResponse: 包含所有枚举详细信息的响应，按模块分组
        
    Examples:
        - 获取所有枚举详细信息: GET /api/v1/enums/list
        - 获取模型相关枚举详细信息: GET /api/v1/enums/list?module=model
        - 获取训练任务相关枚举详细信息: GET /api/v1/enums/list?module=training_task
    """
    return enum_service.list_enums(module)


@router.get("/ml-task-types", response_model=MlTaskTypesByModalityResp)
async def get_ml_task_types_by_modality(
    model_type: Optional[MlModelType] = Query(
        None,
        description="按模型大类筛选：text / image；不传则同时返回 text 与 image 两组",
    ),
) -> MlTaskTypesByModalityResp:
    """按模型类型（text / image）返回可选的 MlTaskType 任务子类型枚举。

    与 ``MlModelType`` 联动：选择 ``text`` 时仅应使用 ``text`` 列表中的项，选择 ``image`` 时使用 ``image`` 列表。
    传入 ``model_type`` 时仅填充对应字段，另一侧为空列表。
    """
    def _options(modality: MlModelType) -> List[MlTaskTypeEnumItem]:
        return [
            MlTaskTypeEnumItem(label=ML_TASK_TYPE_LABEL_CN[t], value=t.value)
            for t in ML_TASK_TYPES_BY_ML_MODEL_TYPE[modality]
        ]

    if model_type is None:
        return MlTaskTypesByModalityResp(
            text=_options(MlModelType.TEXT),
            image=_options(MlModelType.IMAGE),
        )
    if model_type == MlModelType.TEXT:
        return MlTaskTypesByModalityResp(text=_options(MlModelType.TEXT), image=[])
    return MlTaskTypesByModalityResp(text=[], image=_options(MlModelType.IMAGE))


@router.get("/inference-params", response_model=List[InferenceParamInfo])
# @inject
async def get_inference_params() -> List[InferenceParamInfo]:
    """获取推理参数列表
    
    ## 功能说明
    返回所有可用的推理参数信息，包括参数名称、中文名称、取值范围和详细描述。
    
    ## 响应说明
    返回推理参数列表，每个参数包含：
    - **name**: 参数名称（英文，如：temperature）
    - **name_cn**: 参数中文名称（如：温度参数）
    - **value_scope**: 参数取值范围（如：0.0-2.0）
    - **description**: 参数详细描述
    
    ## 使用示例
    
    ### 获取所有推理参数
    ```
    GET /api/v1/enums/inference-params
    ```
    
    ### 响应示例
    ```json
    [
      {
        "name": "temperature",
        "name_cn": "温度参数",
        "value_scope": "0.0-2.0",
        "description": "温度参数（Temperature），控制模型输出的随机性。值越高，输出越随机；值越低，输出越确定。"
      },
      {
        "name": "max_tokens",
        "name_cn": "max_tokens",
        "value_scope": "",
        "description": "最大生成token数，None表示不限制"
      },
      {
        "name": "top_p",
        "name_cn": "核采样",
        "value_scope": "0.0-1.0",
        "description": "核采样，范围0-1，默认1.0（采样时考虑所有tokens）"
      },
      {
        "name": "presence_penalty",
        "name_cn": "重复惩罚参数",
        "value_scope": ">=0.0",
        "description": "重复惩罚参数（Repetition Penalty），用于减少模型生成重复内容。值越高，惩罚越强。"
      }
    ]
    ```
    """
    return [
        InferenceParamInfo.from_enum(param_type)
        for param_type in InferenceParamType
    ]


@router.get("/metrics-params", response_model=List[MetricsParamInfo])
# @inject
async def get_metrics_params() -> List[MetricsParamInfo]:
    """获取指标参数列表
    
    ## 功能说明
    返回所有可用的指标参数信息，包括参数名称和中文名称。
    
    ## 响应说明
    返回指标参数列表，每个参数包含：
    - **name**: 参数名称（英文，如：input）
    - **name_cn**: 参数中文名称（如：输入）
    
    ## 使用示例
    
    ### 获取所有指标参数
    ```
    GET /api/v1/enums/metrics-params
    ```
    
    ### 响应示例
    ```json
    [
      {
        "name": "input",
        "name_cn": "输入"
      },
      {
        "name": "actual_output",
        "name_cn": "实际输出"
      },
      {
        "name": "expected_output",
        "name_cn": "期望输出"
      },
      {
        "name": "retrieval_context",
        "name_cn": "检索上下文"
      }
    ]
    ```
    """
    return [
        MetricsParamInfo.from_enum(param_type)
        for param_type in MetricsParam
    ]


