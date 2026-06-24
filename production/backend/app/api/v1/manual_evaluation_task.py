from typing import Optional, List
from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query, Path, status, Body, HTTPException
from fastapi_pagination import Page

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import JwtUserInfo
from app.schemas.evaluation_task import (
    EvaluationTaskCreate,
    EvaluationTaskDetailResponse,
    EvaluationTaskSummaryResponse,
    ManualEvaluationItemResponse,
    ManualEvaluationItemPageResponse,
    ManualEvaluationItemBatchUpdate,
    ManualEvaluationAnnotationStatsResponse,
    EvaluationMethod
)
from app.services.evaluation_task.interface import EvaluationTaskService
from app.utils.auth import get_current_user
from app.common.status import TaskStatus

router = APIRouter(prefix="/api/v1/manual-evaluation-tasks", tags=["manual-evaluation-tasks"])


# ==================== 人工评估任务CRUD接口 ====================

@router.post("/project/{project_id}/create", response_model=EvaluationTaskDetailResponse)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.DATA_MANAGER_EVALUATION_TASK,
    table_name="evaluation_tasks",
    operator_type=OperatorType.ADD,
    operator_content_key=["name"],
    self_service_field_mapping=None,
    scope_service_field_mapping={
        "service_name": "project_service",
        "field_name": "project_id",
        "tag_field_name": "name"
    }
)
async def create_manual_evaluation_task(
    project_id: int = Path(..., description="项目ID"),
    task: EvaluationTaskCreate = Body(..., description="创建人工评估任务请求"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> EvaluationTaskDetailResponse:
    """创建人工评估任务
    
    ## 功能说明
    创建新的人工评估任务，支持文本评估和图像理解评估，支持单个评估和对比评估。
    
    ## 评估类型
    - **single（单个评估）**：评估单个模型的表现
    - **comparison（对比评估）**：对比多个模型的表现
    
    ## 评估类别
    - **text（文本评估）**：评估文本生成模型的表现
    - **image（图像理解评估）**：评估图像理解模型的表现（图像描述、图像问答等）
    
    ## 数据来源
    - **existing（已有推理结果集）**：使用已创建的推理结果集
    - **new（新建推理结果集）**：需要先创建推理结果集，然后再创建评估任务
    
    ## 数据格式
    - **dataset_format（可选）**：评估数据的数据格式
      - `prompt-response`：提示词+回复格式
      - `role-based`：基于角色的对话格式
      - `prefix-suffix-middle`：前缀+后缀+中间格式
    - 如果不提供，系统将根据推理结果集的数据格式自动识别
    
    ## 数据采样
    - `sampling_rate`：数据采样率（0-100），NULL表示不采样
    - 如果设置了采样率，会从推理结果集中随机采样指定比例的数据
    
    ## 评估指标配置
    - `evaluation_prompt_config.metrics`：评估指标列表，每个指标包含：
      - `name`：指标名称
      - `description`：指标说明
      - `score_min`：指标分值最小值
      - `score_max`：指标分值最大值
      - `score_definitions`：指标分值定义（描述分值的含义和说明）
    
    ## 注意事项
    - 创建任务时，系统会自动设置 `evaluation_method=manual`（即使请求中提供了其他值也会被覆盖）
    - 任务创建后，会从推理结果集读取数据，应用采样（如果设置了采样率），生成JSONL文件
    - JSONL文件包含原始数据和空的 `annotation` 字段，等待人工标注
    
    ## 请求示例
    
    **注意：** 所有请求示例中的 `evaluation_method` 字段都会被自动设置为 `"manual"`，无需在请求中显式提供。
    
    ### 示例1：文本评估 - 单个评估 - 已有推理结果集
    ```json
    {
      "name": "文本模型人工评估_20250115",
      "description": "评估文本生成模型的表现",
      "evaluation_type": "single",
      "dataset_type": "text-generation",
      "evaluation_method": "manual",
      "data_source": "existing",
      "dataset_format": "prompt-response",
      "dataset_model_relations": [
        {
          "inference_result_dataset_id": 1,
          "evaluated_model_id": 101,
          "evaluated_model_name": "qwen3-0.6B-sft1-V1",
          "sort_order": 0
        }
      ],
      "sampling_rate": 50.0,
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "准确性",
            "description": "评估模型回答的准确性，判断回答是否正确回答了问题",
            "system_metric_id": null,
            "metrics_mapping": null,
            "score_min": 0,
            "score_max": 10,
            "score_definitions": "0-3分：回答不准确或错误；4-6分：回答部分准确；7-10分：回答完全准确"
          },
          {
            "name": "丰富度",
            "description": "评估模型回答的内容丰富度，判断回答是否信息充分、细节完整",
            "system_metric_id": null,
            "metrics_mapping": null,
            "score_min": 0,
            "score_max": 10,
            "score_definitions": "0-3分：内容简单，信息量少；4-6分：内容一般，信息量中等；7-10分：内容丰富，信息量充足"
          }
        ]
      }
    }
    ```
    
    ### 示例2：图像理解评估 - 单个评估 - 已有推理结果集
    ```json
    {
      "name": "图像理解模型人工评估_20250115",
      "description": "评估图像理解模型的表现",
      "evaluation_type": "single",
      "dataset_type": "image-understanding",
      "evaluation_method": "manual",
      "data_source": "existing",
      "dataset_format": "prompt-response",
      "dataset_model_relations": [
        {
          "inference_result_dataset_id": 2,
          "evaluated_model_id": 102,
          "evaluated_model_name": "image-model-v1",
          "sort_order": 0
        }
      ],
      "sampling_rate": 30.0,
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "指令遵循性",
            "description": "评估生成的图片是否按照要求生成，是否满足用户指令",
            "system_metric_id": null,
            "metrics_mapping": null,
            "score_min": 0,
            "score_max": 15,
            "score_definitions": "0-5分：完全不遵循指令；6-10分：部分遵循指令；11-15分：完全遵循指令"
          },
          {
            "name": "风格一致性",
            "description": "评估生成图片与要求的风格是否一致",
            "system_metric_id": null,
            "metrics_mapping": null,
            "score_min": 0,
            "score_max": 3,
            "score_definitions": "0分：风格不一致；1分：风格部分一致；2分：风格基本一致；3分：风格完全一致"
          }
        ]
      }
    }
    ```
    
    ### 示例3：文本评估 - 对比评估 - 已有推理结果集
    ```json
    {
      "name": "文本模型对比评估_20250115",
      "description": "对比多个文本模型的表现",
      "evaluation_type": "comparison",
      "dataset_type": "text-generation",
      "evaluation_method": "manual",
      "data_source": "existing",
      "dataset_format": "prompt-response",
      "dataset_model_relations": [
        {
          "inference_result_dataset_id": 1,
          "evaluated_model_id": 101,
          "evaluated_model_name": "qwen3-0.6B-sft1-V1",
          "sort_order": 0
        },
        {
          "inference_result_dataset_id": 2,
          "evaluated_model_id": 102,
          "evaluated_model_name": "qwen3-0.6B-sft1-V2",
          "sort_order": 1
        }
      ],
      "sampling_rate": 50.0,
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "准确性",
            "description": "评估模型回答的准确性",
            "system_metric_id": null,
            "metrics_mapping": null,
            "score_min": 0,
            "score_max": 10,
            "score_definitions": "0-3分：不准确；4-6分：部分准确；7-10分：完全准确"
          },
          {
            "name": "丰富度",
            "description": "评估模型回答的内容丰富度",
            "system_metric_id": null,
            "metrics_mapping": null,
            "score_min": 0,
            "score_max": 10,
            "score_definitions": "0-3分：内容简单；4-6分：内容一般；7-10分：内容丰富"
          }
        ]
      }
    }
    ```
    
    ### 示例4：文本评估 - 单个评估 - 不采样（sampling_rate为null）
    ```json
    {
      "name": "文本模型人工评估_全量数据_20250115",
      "description": "评估文本生成模型的表现（使用全量数据）",
      "evaluation_type": "single",
      "dataset_type": "text-generation",
      "evaluation_method": "manual",
      "data_source": "existing",
      "dataset_format": "prompt-response",
      "dataset_model_relations": [
        {
          "inference_result_dataset_id": 1,
          "evaluated_model_id": 101,
          "evaluated_model_name": "qwen3-0.6B-sft1-V1",
          "sort_order": 0
        }
      ],
      "sampling_rate": null,
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "准确性",
            "description": "评估模型回答的准确性",
            "system_metric_id": null,
            "metrics_mapping": null,
            "score_min": 0,
            "score_max": 10,
            "score_definitions": "0-3分：不准确；4-6分：部分准确；7-10分：完全准确"
          }
        ]
      }
    }
    ```
    
    ### 示例5：文本评估 - 单个评估 - 新建推理结果集
    ```json
    {
      "name": "文本模型人工评估_新建推理集_20250115",
      "description": "评估文本生成模型的表现（先新建推理结果集）",
      "evaluation_type": "single",
      "dataset_type": "text-generation",
      "evaluation_method": "manual",
      "data_source": "new",
      "dataset_format": "prompt-response",
      "dataset_model_relations": [
        {
          "sort_order": 0,
          "inference_method": "offline",
          "model_id": 101,
          "model_name": "qwen3-0.6B-sft1-V1",
          "inference_params": {
            "temperature": 0.80,
            "top_p": 0.8,
            "max_tokens": 2048,
            "presence_penalty": 1.0
          },
          "dataset_description": "用于人工评估的推理结果集",
          "source_dataset_id": 1,
          "source_dataset_name": "问答测试集",
          "graphics_card_resource": {
            "card_type": "GPU",
            "card_model": "A100",
            "count": 1,
            "card_memory": "80GB",
            "k8s_resource_type": "nvidia.com/gpu"
          }
        }
      ],
      "sampling_rate": 50.0,
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "准确性",
            "description": "评估模型回答的准确性，判断回答是否正确回答了问题",
            "system_metric_id": null,
            "metrics_mapping": null,
            "score_min": 0,
            "score_max": 10,
            "score_definitions": "0-3分：回答不准确或错误；4-6分：回答部分准确；7-10分：回答完全准确"
          },
          {
            "name": "丰富度",
            "description": "评估模型回答的内容丰富度，判断回答是否信息充分、细节完整",
            "system_metric_id": null,
            "metrics_mapping": null,
            "score_min": 0,
            "score_max": 10,
            "score_definitions": "0-3分：内容简单，信息量少；4-6分：内容一般，信息量中等；7-10分：内容丰富，信息量充足"
          }
        ]
      }
    }
    ```
    
    ### 示例6：文本评估 - 对比评估 - 新建推理结果集
    ```json
    {
      "name": "文本模型对比评估_新建推理集_20250115",
      "description": "对比多个文本模型的表现（先新建两个推理结果集）",
      "evaluation_type": "comparison",
      "dataset_type": "text-generation",
      "evaluation_method": "manual",
      "data_source": "new",
      "dataset_format": "prompt-response",
      "dataset_model_relations": [
        {
          "sort_order": 0,
          "inference_method": "offline",
          "model_id": 101,
          "model_name": "qwen3-0.6B-sft1-V1",
          "inference_params": {
            "temperature": 0.80,
            "top_p": 0.8,
            "max_tokens": 2048,
            "presence_penalty": 1.0
          },
          "dataset_description": "用于对比评估的推理结果集",
          "source_dataset_id": 1,
          "source_dataset_name": "问答测试集",
          "graphics_card_resource": {
            "card_type": "GPU",
            "card_model": "A100",
            "count": 1,
            "card_memory": "80GB",
            "k8s_resource_type": "nvidia.com/gpu"
          }
        },
        {
          "sort_order": 1,
          "inference_method": "offline",
          "model_id": 102,
          "model_name": "qwen3-0.6B-sft1-V2",
          "inference_params": {
            "temperature": 0.80,
            "top_p": 0.8,
            "max_tokens": 2048,
            "presence_penalty": 1.0
          },
          "dataset_description": "用于对比评估的推理结果集",
          "source_dataset_id": 1,
          "source_dataset_name": "问答测试集",
          "graphics_card_resource": {
            "card_type": "GPU",
            "card_model": "A100",
            "count": 1,
            "card_memory": "80GB",
            "k8s_resource_type": "nvidia.com/gpu"
          }
        }
      ],
      "sampling_rate": 50.0,
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "准确性",
            "description": "评估模型回答的准确性",
            "system_metric_id": null,
            "metrics_mapping": null,
            "score_min": 0,
            "score_max": 10,
            "score_definitions": "0-3分：不准确；4-6分：部分准确；7-10分：完全准确"
          },
          {
            "name": "丰富度",
            "description": "评估模型回答的内容丰富度",
            "system_metric_id": null,
            "metrics_mapping": null,
            "score_min": 0,
            "score_max": 10,
            "score_definitions": "0-3分：内容简单；4-6分：内容一般；7-10分：内容丰富"
          }
        ]
      }
    }
    ```
    
    ### data_source=new 时 dataset_model_relations 字段说明（人工评估）
    - **data_source=existing**：每项需提供 `inference_result_dataset_id`、`evaluated_model_id`、`sort_order`（可选）。
    - **data_source=new**：不提供 `inference_result_dataset_id`，需提供创建推理结果集所需参数：
      - **离线推理**：`model_id`（必填）、`model_name`（可选）、`inference_params`（可选）、`graphics_card_resource`（可选，有默认值）、`dataset_name`（可选）、`dataset_description`（可选）、`source_dataset_id`（必填）、`source_dataset_name`（可选）
      - **在线推理**：`online_service_id`（必填）、`online_service_name`（可选），以及上述数据集与推理参数
      - 推理参数键可通过 `/api/v1/enums/inference-params` 查询
    
    ## 响应示例
    ```json
    {
      "id": 1,
      "name": "文本模型人工评估_20250115",
      "description": "评估文本生成模型的表现",
      "project_id": 1,
      "version": "v1",
      "parent_task_id": null,
      "evaluation_type": "single",
      "data_source": "existing",
      "dataset_format": "prompt-response",
      "evaluation_method": "manual",
      "dataset_model_relations": [
        {
          "inference_result_dataset_id": 1,
          "inference_result_dataset_name": "问答推理结果",
          "evaluated_model_id": 101,
          "evaluated_model_name": "qwen3-0.6B-sft1-V1",
          "sort_order": 0
        }
      ],
      "referee_model_id": null,
      "referee_model_name": null,
      "referee_type": null,
      "referee_inference_params": null,
      "graphics_card_resource": null,
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "准确性",
            "description": "评估模型回答的准确性",
            "system_metric_id": null,
            "metrics_mapping": null,
            "score_min": 0,
            "score_max": 10,
            "score_definitions": "0-3分：不准确；4-6分：部分准确；7-10分：完全准确"
          }
        ],
        "prompt_template": null
      },
      "basic_metric_config": null,
      "dataset_type": "text-generation",
      "sampling_rate": 50.0,
      "total_items": 100,
      "completed_items": 0,
      "status": "created",
      "progress": 0,
      "started_at": null,
      "finished_at": null,
      "created_by": "user1",
      "created_at": "2025-01-15T10:00:00"
    }
    ```
    """
    # 强制设置evaluation_method为manual
    task.evaluation_method = EvaluationMethod.MANUAL
    
    # 验证dataset_type必填
    if not task.dataset_type:
        raise HTTPException(
            status_code=400,
            detail="人工评估任务必须提供dataset_type（text-generation或image-understanding）"
        )
    
    return await evaluation_task_service.create_evaluation_task(
        current_user=current_user,
        project_id=project_id,
        task=task
    )


@router.get("/project/{project_id}/list", response_model=Page[EvaluationTaskSummaryResponse])
@inject
async def list_manual_evaluation_tasks(
    project_id: int = Path(..., description="项目ID"),
    name: Optional[str] = Query(None, description="任务名称筛选（模糊匹配）"),
    status: Optional[TaskStatus] = Query(None, description="状态筛选"),
    evaluation_type: Optional[str] = Query(None, description="评估类型筛选（single/comparison）"),
    dataset_format: Optional[str] = Query(None, description="数据格式筛选：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式"),
    dataset_type: Optional[str] = Query(None, description="数据集类型筛选：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态"),
    page: int = Query(1, ge=1, description="页码（默认1）"),
    size: int = Query(10, ge=1, le=10, description="每页数量（默认10，最大10）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> Page[EvaluationTaskSummaryResponse]:
    """查询人工评估任务列表
    
    ## 功能说明
    分页查询人工评估任务列表，支持按任务名称、状态、评估类型、数据格式、数据集类型筛选。
    
    ## 查询参数
    - `name`：任务名称筛选（模糊匹配）
    - `status`：状态筛选
    - `evaluation_type`：评估类型筛选（single/comparison）
    - `dataset_format`：数据格式筛选（prompt-response/role-based/prefix-suffix-middle）
    - `dataset_type`：数据集类型筛选（text-generation/image-generation/image-understanding/multimodal）
    - `page`：页码（默认1）
    - `size`：每页数量（默认10，最大10）
    
    ## 响应说明
    - 只返回 `evaluation_method=manual` 的任务
    - 返回分页的任务列表，包含任务基本信息、状态、进度等
    """
    return await evaluation_task_service.list_evaluation_tasks(
        project_id=project_id,
        name=name,
        status=status,
        evaluation_type=evaluation_type,
        evaluation_method=EvaluationMethod.MANUAL,  # 只查询人工评估任务
        dataset_format=dataset_format,
        dataset_type=dataset_type,
        page=page,
        size=size
    )


@router.get("/project/{project_id}/task/{task_id}", response_model=EvaluationTaskDetailResponse)
@inject
async def get_manual_evaluation_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> EvaluationTaskDetailResponse:
    """查询人工评估任务详情
    
    ## 功能说明
    查询指定人工评估任务的详细信息，包括任务配置、评估指标、进度等。
    
    ## 响应说明
    - 返回任务的完整信息
    - 如果任务不是人工评估任务（evaluation_method != manual），返回404
    """
    task_detail = await evaluation_task_service.get_evaluation_task(
        project_id=project_id,
        task_id=task_id
    )
    
    # 验证是否为人工评估任务
    if task_detail.evaluation_method != EvaluationMethod.MANUAL:
        raise HTTPException(
            status_code=404,
            detail=f"任务 {task_id} 不是人工评估任务"
        )
    
    return task_detail


@router.get("/project/{project_id}/name/{task_name}", response_model=List[EvaluationTaskSummaryResponse])
@inject
async def get_manual_evaluation_task_versions(
    project_id: int = Path(..., description="项目ID"),
    task_name: str = Path(..., description="任务名称"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> List[EvaluationTaskSummaryResponse]:
    """查询人工评估任务版本列表
    
    ## 功能说明
    根据任务名称查询所有版本的人工评估任务列表，按版本号降序排列。
    
    ## 响应说明
    - 返回所有版本的任务列表（按版本号降序）
    - 只返回 `evaluation_method=manual` 的任务
    """
    versions = await evaluation_task_service.get_evaluation_task_versions(
        project_id=project_id,
        task_name=task_name
    )
    
    # 过滤出人工评估任务
    manual_versions = [v for v in versions if v.evaluation_method == EvaluationMethod.MANUAL]
    
    return manual_versions


@router.delete("/project/{project_id}/task/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.DATA_MANAGER_EVALUATION_TASK,
    table_name="evaluation_tasks",
    operator_type=OperatorType.DELETE,
    operator_content_key=["name"],
    self_service_field_mapping=None,
    scope_service_field_mapping={
        "service_name": "project_service",
        "field_name": "project_id",
        "tag_field_name": "name"
    }
)
async def delete_manual_evaluation_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
):
    """删除人工评估任务
    
    ## 功能说明
    删除指定的人工评估任务，同时删除相关的关联关系和评估报告。
    
    ## 删除逻辑
    1. 验证任务是否存在且属于指定项目
    2. 验证是否为人工评估任务
    3. 删除关联关系（evaluation_task_dataset_model_relation）
    4. 删除评估报告（evaluation_reports）
    5. 删除任务记录（evaluation_tasks）
    6. 可选：删除JuiceFS中的JSONL文件（根据业务需求决定）
    
    ## 注意事项
    - 只有任务创建者或管理员可以删除任务
    - 删除操作不可恢复，请谨慎操作
    """
    # 先验证任务是否为人工评估任务
    task = await evaluation_task_service.get_evaluation_task(
        project_id=project_id,
        task_id=task_id
    )
    
    if task.evaluation_method != EvaluationMethod.MANUAL:
        raise HTTPException(
            status_code=400,
            detail=f"任务 {task_id} 不是人工评估任务，无法删除"
        )
    
    await evaluation_task_service.delete_evaluation_task(
        project_id=project_id,
        task_id=task_id
    )


# ==================== 人工评估项操作接口 ====================

@router.get("/project/{project_id}/task/{task_id}/items", response_model=ManualEvaluationItemPageResponse)
@inject
async def get_manual_evaluation_items(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    status: Optional[str] = Query("all", description="状态筛选（未标注/标注中/标注完成/all，默认all）"),
    page: int = Query(1, ge=1, description="页码（默认1）"),
    size: int = Query(10, ge=1, le=10, description="每页数量（默认10，最大10）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> ManualEvaluationItemPageResponse:
    """分页查询人工评估项列表
    
    ## 功能说明
    从JSONL文件中分页读取评估项列表，用于人工标注界面展示。支持按状态筛选和分页。
    
    ## 查询参数
    - `status`: 状态筛选（枚举值或"all"，默认all）
      - "未评估": 未评估
      - "已完成": 已完成
      - "all": 返回所有状态的项
    - `page`: 页码（默认1）
    - `size`: 每页数量（默认10，最大10）
    
    ## 响应说明
    - 返回分页的评估项列表，每个评估项包含原始数据和标注信息
    - 单个评估时，`model_response` 不为空，`model_responses` 为空
    - 对比评估时，`model_responses` 不为空，`model_response` 为空
    - 评估项的默认状态为"未标注"
    """
    return await evaluation_task_service.get_manual_evaluation_items(
        project_id=project_id,
        task_id=task_id,
        status=status,
        page=page,
        size=size
    )


@router.put("/project/{project_id}/task/{task_id}/items/batch-update", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def batch_update_manual_evaluation_items(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    batch_update: ManualEvaluationItemBatchUpdate = Body(..., description="批量更新请求"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
):
    """批量更新人工评估项评分
    
    ## 功能说明
    批量更新评估项的评分，支持单个评估和对比评估两种场景。
    使用列表格式，统一单个评估和对比评估的数据结构。
    
    ## 请求体格式说明
    - `items`: 评估项更新列表，每个项包含：
      - `item_index`：评估项序号（从1开始）
      - `model_metrics`：模型指标列表，每个元素对应一个模型（按照创建task时关联的推理结果集的顺序）
        - **单个评估**：列表只有一个元素（一个模型）
        - **对比评估**：列表有多个元素（多个模型）
        - 每个 `MetricInfos` 包含该模型的多个指标（`metrics: List[ModelMetricCreate]`）
    
    ## 数据结构说明
    - `MetricInfos`：模型指标信息
      - `metrics`：指标列表，包含该模型的多个指标
    - `ModelMetricCreate`：指标创建对象
      - `metric_name`：指标名称（如：准确性、丰富度）
      - `score`：指标分数
      - `score_min`：指标分数最小值（可选）
      - `score_max`：指标分数最大值（可选）
      - `reason`：打分原因（可选）
    
    ## 更新逻辑
    1. 验证请求格式和分数范围
    2. 验证 `model_metrics` 列表长度与任务关联关系数量一致
    3. 按照列表顺序处理每个模型的指标（顺序对应创建task时关联的推理结果集顺序）
    4. 将 `ModelMetricCreate` 转换为 `ModelMetricScores` 格式并存储到 Redis
    5. 存储到 Redis（标注数据），状态自动设置为"标注完成"
    6. 如果同一个模型的多个指标，会自动合并到同一个 annotation 中
    7. 更新任务进度（completed_items/total_items）
    8. 如果所有项都已完成，更新任务状态为 `completed` 并触发报告生成
    
    ## 状态说明
    - 评估项的默认状态为"未标注"
    - 更新评分后，状态自动设置为"标注完成"
    
    ## 请求示例
    
    ### 示例1：单个评估 - 单个指标
    ```json
    {
      "items": [
        {
          "item_index": 1,
          "model_metrics": [
            {
              "metrics": [
                {
                  "metric_name": "准确性",
                  "score": 8.5,
                  "reason": "回答准确，能够正确理解问题并给出合理的答案"
                }
              ]
            }
          ]
        }
      ]
    }
    ```
    
    ### 示例2：单个评估 - 多个指标
    ```json
    {
      "items": [
        {
          "item_index": 1,
          "model_metrics": [
            {
              "metrics": [
                {
                  "metric_name": "准确性",
                  "score": 8.5,
                  "reason": "回答准确，能够正确理解问题并给出合理的答案"
                },
                {
                  "metric_name": "丰富度",
                  "score": 7.0,
                  "reason": "内容较为丰富，但还可以更详细"
                }
              ]
            }
          ]
        }
      ]
    }
    ```
    
    ### 示例3：对比评估 - 两个模型，每个模型一个指标
    ```json
    {
      "items": [
        {
          "item_index": 1,
          "model_metrics": [
            {
              "metrics": [
                {
                  "metric_name": "准确性",
                  "score": 8.5,
                  "reason": "回答准确，能够正确理解问题并给出合理的答案"
                }
              ]
            },
            {
              "metrics": [
                {
                  "metric_name": "准确性",
                  "score": 9.0,
                  "reason": "回答非常准确，理解问题深入"
                }
              ]
            }
          ]
        }
      ]
    }
    ```
    
    ### 示例4：对比评估 - 两个模型，每个模型多个指标
    ```json
    {
      "items": [
        {
          "item_index": 1,
          "model_metrics": [
            {
              "metrics": [
                {
                  "metric_name": "准确性",
                  "score": 8.5,
                  "reason": "回答准确"
                },
                {
                  "metric_name": "丰富度",
                  "score": 7.0,
                  "reason": "内容较为丰富"
                }
              ]
            },
            {
              "metrics": [
                {
                  "metric_name": "准确性",
                  "score": 9.0,
                  "reason": "回答非常准确"
                },
                {
                  "metric_name": "丰富度",
                  "score": 8.5,
                  "reason": "内容非常丰富"
                }
              ]
            }
          ]
        }
      ]
    }
    ```
    
    ### 示例5：批量更新多个评估项
    ```json
    {
      "items": [
        {
          "item_index": 1,
          "model_metrics": [
            {
              "metrics": [
                {
                  "metric_name": "准确性",
                  "score": 8.5,
                  "reason": "回答准确"
                }
              ]
            }
          ]
        },
        {
          "item_index": 2,
          "model_metrics": [
            {
              "metrics": [
                {
                  "metric_name": "准确性",
                  "score": 9.0,
                  "reason": "回答非常准确"
                }
              ]
            }
          ]
        }
      ]
    }
    ```
    
    ### 示例6：评分理由为空（可选）
    ```json
    {
      "items": [
        {
          "item_index": 1,
          "model_metrics": [
            {
              "metrics": [
                {
                  "metric_name": "准确性",
                  "score": 8.5,
                  "reason": null
                }
              ]
            }
          ]
        }
      ]
    }
    ```
    
    ## 注意事项
    - 更新操作会直接修改JSONL文件，使用临时文件确保数据一致性
    - 支持批量更新，减少文件读写次数
    - 使用文件锁机制，避免并发更新冲突
    """
    await evaluation_task_service.batch_update_manual_evaluation_items(
        project_id=project_id,
        task_id=task_id,
        batch_update=batch_update,
        current_user=current_user
    )


@router.post("/project/{project_id}/task/{task_id}/submit", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def submit_manual_evaluation_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> None:
    """提交人工评估任务，触发标注结果写入JSONL"""
    await evaluation_task_service.submit_manual_evaluation_task(
        project_id=project_id,
        task_id=task_id,
        current_user=current_user
    )

# ==================== 评估详情接口 ====================


@router.get("/project/{project_id}/task/{task_id}/annotation-stats", response_model=ManualEvaluationAnnotationStatsResponse)
@inject
async def get_manual_evaluation_annotation_stats(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> ManualEvaluationAnnotationStatsResponse:
    """获取人工评估标注统计信息
    
    ## 功能说明
    返回人工评估任务的标注统计信息，包括总任务数、标注完成数、标注中数、未标注数。
    
    ## 响应说明
    - `total_tasks`: 总任务数（评估项总数）
    - `completed_count`: 标注完成数（状态为"标注完成"的项数）
    - `annotating_count`: 标注中数（状态为"标注中"的项数）
    - `unannotated_count`: 未标注数（状态为"未标注"的项数）
    
    ## 响应示例
    ```json
    {
      "total_tasks": 100,
      "completed_count": 50,
      "annotating_count": 10,
      "unannotated_count": 40
    }
    ```
    """
    return await evaluation_task_service.get_manual_evaluation_annotation_stats(
        project_id=project_id,
        task_id=task_id
    )


@router.get("/project/{project_id}/task/{task_id}/download")
@inject
async def download_manual_evaluation_results(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    format: str = Query("jsonl", description="下载格式（jsonl/json/xlsx/csv，默认 jsonl）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
):
    """下载人工评估结果
    
    ## 功能说明
    从 JFS 读取该任务对应的 JSONL 结果文件，按指定格式转换后下载。单文件时直接返回该文件，多文件时打包为 zip。
    
    ## 查询参数
    - `format`: 下载格式，支持 jsonl、json、xlsx、csv，默认 jsonl
    
    ## 响应说明
    - 单文件：返回对应格式文件（.jsonl/.json/.xlsx/.csv）
    - 多文件：返回 .zip，包内为按所选格式转换后的文件
    """
    return await evaluation_task_service.download_manual_evaluation_results(
        project_id=project_id,
        task_id=task_id,
        format=format
    )

