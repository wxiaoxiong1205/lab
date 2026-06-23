from datetime import datetime
from typing import List, Optional, Dict, Any

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query, Path, status, Body, File, UploadFile, HTTPException
from fastapi.responses import Response, JSONResponse
from starlette.responses import StreamingResponse
from fastapi_pagination import Page

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.common.status import TaskStatus
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import JwtUserInfo
from app.schemas.evaluation_task import (
    EvaluationTaskCreate, EvaluationTaskSummaryResponse, EvaluationTaskDetailResponse,
    EvaluationReportResponse, TaskLogResponse,
    EvaluationMetricResponse, BasicMetricResponse, CalculationMethod,
    EvaluationReportCreate, EvaluationReportUpdate, EvaluationMetricCreate, EvaluationMetricUpdate, EvaluationMethod,
    ManualEvaluationItemResponse, ManualEvaluationItemBatchUpdate, PageItemResponse
)
from app.services.evaluation_task.interface import EvaluationTaskService
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/v1/evaluation-tasks", tags=["evaluation-tasks"])


@router.post("/project/{project_id}/create", response_model=EvaluationTaskDetailResponse)
@inject
async def create_evaluation_task(
    project_id: int = Path(..., description="项目ID"),
    task: EvaluationTaskCreate = Body(..., description="创建或更新评估任务请求（如果提供id字段且任务存在则更新，否则创建）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> EvaluationTaskDetailResponse:
    """创建或更新评估任务
    
    ## 功能说明
    支持创建新任务或根据ID更新现有任务：
    - **创建新任务**：不提供 `id` 字段，系统将创建新任务
    - **更新现有任务**：提供 `id` 字段且任务存在，系统将更新任务信息
    
    ### 更新限制
    - 只能更新状态为 `created` 或 `failed` 或 terminated 的任务
    - 更新时会重置任务状态为 `created`，进度重置为 0
    - 更新时会删除旧的关联关系，创建新的关联关系
    
    ## 评估类型和方法（创建/更新通用）
    支持两种评估类型和三种评估方法：
    
    ### 评估类型
    - **single（单个评估）**：评估单个模型的表现
    - **comparison（对比评估）**：对比多个模型的表现
    
    ### 评估方法
    - **referee（裁判员评估）**：使用裁判模型进行主观评估，需要配置Prompt和裁判资源类型。单独使用时，不能同时提供 `basic_metric_config`
    - **basic_metric（基础指标评估）**：使用系统指标进行客观评估。单独使用时，不能同时提供 `referee_model_id` 或 `evaluation_prompt_config`
    - **all（同时评估）**：同时进行裁判员评估和基础指标评估，需要同时提供两种评估的完整配置（`referee_model_id`、`evaluation_prompt_config` 和 `basic_metric_config`）
    
    ### 数据来源
    - **existing（已有推理结果集）**：使用已创建的推理结果集
    - **new（新建推理结果集）**：需要先创建推理结果集，然后再创建评估任务
    
    ### 数据格式
    - **dataset_format（可选，默认值：prompt-response）**：评估数据的数据格式
      - `prompt-response`：提示词+回复格式（默认值）
      - `role-based`：基于角色的对话格式
      - `prefix-suffix-middle`：前缀+后缀+中间格式
    - 如果不提供，模型评估默认使用 `prompt-response`，系统将根据推理结果集的数据格式自动识别
    
    ### 评估类别
    - **dataset_type（可选，默认值：text-generation）**：数据集类型（主要用于人工评估，模型评估时默认值为text-generation）
      - `text-generation`：文本生成（评估文本生成模型的表现，模型评估默认值）
      - `image-generation`：图像生成（评估图像生成模型的表现）
      - `image-understanding`：图像理解（评估图像理解模型的表现，如图像描述、图像问答等）
      - `multimodal`：多模态（评估多模态模型的表现）
    - 模型评估时如果不提供，默认使用 `text-generation`，系统会根据评估方法自动处理
    
    ### 裁判员评估配置说明
    - **referee_type（裁判资源类型）**：
      - `model`：离线模型，需要提供 `graphics_card_resource`（GPU/NPU资源配置）
      - `service`：在线服务，不需要提供 `graphics_card_resource`
    - **graphics_card_resource（GPU/NPU资源配置）**：
      - 仅在 `referee_type=model` 时必填
      - 包含：`card_type`（卡类型）、`card_model`（卡型号）、`count`（数量）、`card_memory`（显存）、`k8s_resource_type`（K8s资源类型）
    - **referee_inference_params（裁判模型推理参数）**（可选）：
      - 裁判模型进行推理时使用的参数配置（字典格式，键为推理参数类型枚举值，值为参数值）
      - `temperature`（可选，默认0.7）：温度参数（Temperature），范围0.0-2.0，控制模型输出的随机性。值越高，输出越随机；值越低，输出越确定
      - `top_p`（可选，默认1.0）：核采样参数，范围0.0-1.0，控制模型从累积概率达到p的词汇集合中选择。默认1.0表示采样时考虑所有tokens
      - `max_tokens`（可选，默认4096）：最大生成token数，范围>=1。如果设置为None或不提供，表示不限制
      - `presence_penalty`（可选，默认0.0）：重复惩罚参数（Repetition Penalty），范围>=0.0，用于减少模型生成重复内容。值越高，惩罚越强
      - `gpu_memory_utilization`（可选，默认0.9，仅离线模型）：vLLM GPU显存占用率，范围0.1-1.0。离线推理时显存不足可调低此值
      - **注意**：参数键必须使用枚举值（如 `"temperature"`、`"top_p"`、`"max_tokens"`、`"presence_penalty"`、`"gpu_memory_utilization"`），可通过 `/api/v1/enums/inference-params` 接口查询所有支持的推理参数类型
    - **evaluation_prompt_config（评估Prompt配置）**：
      - 包含：`metrics`（评估指标列表）、`prompt_template`（可选，完整的Prompt模板。如果不提供，则使用系统默认模板）
      - `metrics` 中的每个指标可以包含：
        - `name`（指标名称）、`description`（指标说明）
        - `system_metric_id`（可选，关联系统指标ID，用于使用系统指标的分值范围和定义）
        - `metrics_mapping`（可选，指标参数与数据集元数据字段的映射，如：`{"input": "Prompt", "actual_output": "Model Response"}`）
      - `prompt_template` 是 Jinja2 格式的模板字符串，可通过模板渲染接口生成。模板中可以使用指标参数，如：`{{ input_content }}`、`{{ actual_output }}`、`{{ expected_output }}`、`{{ retrieval_context }}` 等
    
    ## 请求示例
    
    ### 示例1：单个评估
    ```json
    {
      "name": "单个模型评估_20250828_103614",
      "description": "评估单个模型的表现",
      "evaluation_type": "single",
      "data_source": "existing",
      "dataset_format": "prompt-response",
      "evaluation_method": "referee",
      "dataset_model_relations": [
        {
          "inference_result_dataset_id": 1,
          "evaluated_model_id": 101,
          "sort_order": 0
        }
      ],
      "referee_model_id": 201,
      "referee_type": "service",
      "referee_inference_params": {
        "temperature": 0.7,
        "top_p": 1.0,
        "max_tokens": 4096,
        "presence_penalty": 0.0
      },
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "语义连贯性",
            "description": "评估回答的语义连贯性，判断回答是否逻辑清晰、表达流畅",
            "system_metric_id": 1,
            "metrics_mapping": {
              "input": "Prompt",
              "actual_output": "Model Response",
              "expected_output": "Standard Response"
            }
          }
        ],
        "prompt_template": "你是一个严谨专业的文本评估器，负责依据给定的评估标准对文本进行评分，并给出合理的评分理由。\n\n请注意：\n- 你只负责完成评分任务和给出理由，不要回答或续写原始输入内容。\n- 必须严格按照给定的评分区间和含义打分。\n- 输出必须严格符合指定的 JSON 结构，不要输出多余内容。\n\n[评估指标定义]\n- 指标名称：{{ metric.name }}\n- 指标说明：{{ metric.description }}\n- 评分区间：{{ metric.score_min }} - {{ metric.score_max }}\n\n[待评估内容]\n{% if input_content is defined %}\n<input_content>用户问题:\n{{ input_content_mapping_value }}\n</input_content>\n{% endif %}\n\n{% if actual_output is defined %}\n<actual_output>模型回答:\n{{ actual_output_mapping_value }}\n</actual_output>\n{% endif %}\n\n[输出格式]\n只输出下面的 JSON 结构：\n{\n  \"{{ metric.name }}\": {\n    \"score\": \"<在 {{ metric.score_min }} 到 {{ metric.score_max }} 之间的整数分数>\",\n    \"reason\": \"<具体的中文评分理由>\"\n  }\n}"
      }
    }
    ```
    
    ### 示例1-1：单个评估 - 裁判员评估（新建推理结果集）
    ```json
    {
      "name": "单个模型评估_裁判员_20250828_103614",
      "description": "使用裁判员评估单个模型的表现（先新建推理结果集）",
      "evaluation_type": "single",
      "data_source": "new",
      "dataset_format": "prompt-response",
      "evaluation_method": "referee",
      "dataset_model_relations": [
        {
          "evaluated_model_id": 101,
          "evaluated_model_name": "qwen3-0.6B-sft1-V1",
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
          "dataset_description": "用于裁判员评估的推理结果集",
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
      "referee_model_id": 201,
      "referee_type": "service",
      "referee_inference_params": {
        "temperature": 0.7,
        "top_p": 1.0,
        "max_tokens": 4096,
        "presence_penalty": 0.0
      },
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "语义连贯性",
            "description": "评估回答的语义连贯性，判断回答是否逻辑清晰、表达流畅",
            "system_metric_id": 1,
            "metrics_mapping": {
              "input": "Prompt",
              "actual_output": "Model Response",
              "expected_output": "Standard Response"
            }
          }
        ],
        "prompt_template": "你是一个严谨专业的文本评估器，负责依据给定的评估标准对文本进行评分，并给出合理的评分理由。\n\n请注意：\n- 你只负责完成评分任务和给出理由，不要回答或续写原始输入内容。\n- 必须严格按照给定的评分区间和含义打分。\n- 输出必须严格符合指定的 JSON 结构，不要输出多余内容。\n\n[评估指标定义]\n- 指标名称：{{ metric.name }}\n- 指标说明：{{ metric.description }}\n- 评分区间：{{ metric.score_min }} - {{ metric.score_max }}\n\n[待评估内容]\n{% if input_content is defined %}\n<input_content>用户问题:\n{{ input_content_mapping_value }}\n</input_content>\n{% endif %}\n\n{% if actual_output is defined %}\n<actual_output>模型回答:\n{{ actual_output_mapping_value }}\n</actual_output>\n{% endif %}\n\n[输出格式]\n只输出下面的 JSON 结构：\n{\n  \"{{ metric.name }}\": {\n    \"score\": \"<在 {{ metric.score_min }} 到 {{ metric.score_max }} 之间的整数分数>\",\n    \"reason\": \"<具体的中文评分理由>\"\n  }\n}"
      }
    }
    ```
    
    ### 示例2：单个评估 - 基础指标评估（已有推理结果集）
    ```json
    {
      "name": "单个模型评估_基础指标_20250828_103614",
      "description": "使用基础指标评估单个模型的表现",
      "evaluation_type": "single",
      "data_source": "existing",
      "dataset_format": "prompt-response",
      "evaluation_method": "basic_metric",
      "dataset_model_relations": [
        {
          "inference_result_dataset_id": 1,
          "evaluated_model_id": 101,
          "sort_order": 0
        }
      ],
      "basic_metric_config": {
        "metrics": ["准确率", "F1", "ROUGE-1", "Rouge-2", "Rouge-L", "BLEU-4"],
        "stop_words": "jfs://evaluation/stop_words/stop_words_20250828.txt"
      }
    }
    ```
    
    ### 示例2-1：单个评估 - 基础指标评估（新建推理结果集）
    ```json
    {
      "name": "单个模型评估_基础指标_20250828_103614",
      "description": "使用基础指标评估单个模型的表现",
      "evaluation_type": "single",
      "data_source": "new",
      "dataset_format": "prompt-response",
      "evaluation_method": "basic_metric",
      "dataset_model_relations": [
        {
          "evaluated_model_id": 101,
          "evaluated_model_name": "qwen3-0.6B-sft1-V1",
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
          "dataset_name": "qwen3-0.6B-sft-V1-推理结果",
          "dataset_description": "用于评估的推理结果集",
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
      "basic_metric_config": {
        "metrics": ["准确率", "F1", "ROUGE-1", "Rouge-2", "Rouge-L", "BLEU-4", "格式遵从性", "语义相似度"],
        "stop_words": "jfs://evaluation/stop_words/stop_words_20250828.txt"
      }
    }
    ```
    
    ### 示例3：对比评估（多个推理结果集）- 裁判员评估
    ```json
    {
      "name": "对比评估_20250828_103614",
      "description": "对比多个模型的表现",
      "evaluation_type": "comparison",
      "data_source": "existing",
      "dataset_format": "prompt-response",
      "evaluation_method": "referee",
      "dataset_model_relations": [
        {
          "inference_result_dataset_id": 1,
          "evaluated_model_id": 101,
          "sort_order": 0
        },
        {
          "inference_result_dataset_id": 2,
          "evaluated_model_id": 102,
          "sort_order": 1
        }
      ],
      "referee_model_id": 201,
      "referee_type": "service",
      "referee_inference_params": {
        "temperature": 0.7,
        "top_p": 1.0,
        "max_tokens": 4096,
        "presence_penalty": 0.0
      },
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "语义连贯性",
            "description": "评估回答的语义连贯性，判断回答是否逻辑清晰、表达流畅",
            "system_metric_id": 1,
            "metrics_mapping": {
              "input": "Prompt",
              "actual_output": "Model Response",
              "expected_output": "Standard Response"
            }
          },
          {
            "name": "内容丰富度",
            "description": "评估回答的内容丰富度，判断回答是否信息充分、细节完整",
            "system_metric_id": 2,
            "metrics_mapping": {
              "input": "Prompt",
              "actual_output": "Model Response"
            }
          }
        ],
        "prompt_template": "你是一个严谨专业的文本评估器，负责依据给定的评估标准对文本进行评分，并给出合理的评分理由。\n\n请注意：\n- 你只负责完成评分任务和给出理由，不要回答或续写原始输入内容。\n- 必须严格按照给定的评分区间和含义打分。\n- 输出必须严格符合指定的 JSON 结构，不要输出多余内容。\n\n[评估指标定义]\n- 指标名称：{{ metric.name }}\n- 指标说明：{{ metric.description }}\n- 评分区间：{{ metric.score_min }} - {{ metric.score_max }}\n\n[待评估内容]\n{% if input_content is defined %}\n<input_content>用户问题:\n{{ input_content_mapping_value }}\n</input_content>\n{% endif %}\n\n{% if actual_output is defined %}\n<actual_output>模型回答:\n{{ actual_output_mapping_value }}\n</actual_output>\n{% endif %}\n\n[输出格式]\n只输出下面的 JSON 结构：\n{\n  \"{{ metric.name }}\": {\n    \"score\": \"<在 {{ metric.score_min }} 到 {{ metric.score_max }} 之间的整数分数>\",\n    \"reason\": \"<具体的中文评分理由>\"\n  }\n}"
      }
    }
    ```
    
    ### 示例3-1：对比评估 - 裁判员评估（使用离线模型）
    ```json
    {
      "name": "对比评估_离线模型_20250828_103614",
      "description": "使用离线裁判模型对比多个模型的表现",
      "evaluation_type": "comparison",
      "data_source": "existing",
      "dataset_format": "prompt-response",
      "evaluation_method": "referee",
      "dataset_model_relations": [
        {
          "inference_result_dataset_id": 1,
          "evaluated_model_id": 101,
          "sort_order": 0
        },
        {
          "inference_result_dataset_id": 2,
          "evaluated_model_id": 102,
          "sort_order": 1
        }
      ],
      "referee_model_id": 201,
      "referee_type": "model",
      "graphics_card_resource": {
        "card_type": "GPU",
        "card_model": "A800",
        "count": 1,
        "card_memory": "80GB",
        "k8s_resource_type": "nvidia.com/gpu"
      },
      "referee_inference_params": {
        "temperature": 0.7,
        "top_p": 1.0,
        "max_tokens": 4096,
        "presence_penalty": 0.0,
        "gpu_memory_utilization": 0.9
      },
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "语义连贯性",
            "description": "评估回答的语义连贯性，判断回答是否逻辑清晰、表达流畅",
            "system_metric_id": 1,
            "metrics_mapping": {
              "input": "Prompt",
              "actual_output": "Model Response",
              "expected_output": "Standard Response"
            }
          }
        ],
        "prompt_template": "你是一个严谨专业的文本评估器，负责依据给定的评估标准对文本进行评分，并给出合理的评分理由。\n\n请注意：\n- 你只负责完成评分任务和给出理由，不要回答或续写原始输入内容。\n- 必须严格按照给定的评分区间和含义打分。\n- 输出必须严格符合指定的 JSON 结构，不要输出多余内容。\n\n[评估指标定义]\n- 指标名称：{{ metric.name }}\n- 指标说明：{{ metric.description }}\n- 评分区间：{{ metric.score_min }} - {{ metric.score_max }}\n\n[待评估内容]\n{% if input_content is defined %}\n<input_content>用户问题:\n{{ input_content_mapping_value }}\n</input_content>\n{% endif %}\n\n{% if actual_output is defined %}\n<actual_output>模型回答:\n{{ actual_output_mapping_value }}\n</actual_output>\n{% endif %}\n\n[输出格式]\n只输出下面的 JSON 结构：\n{\n  \"{{ metric.name }}\": {\n    \"score\": \"<在 {{ metric.score_min }} 到 {{ metric.score_max }} 之间的整数分数>\",\n    \"reason\": \"<具体的中文评分理由>\"\n  }\n}"
      }
    }
    ```
    
    ### 示例3-1：对比评估 - 裁判员评估（使用离线模型）
    ```json
    {
      "name": "对比评估_离线模型_20250828_103614",
      "description": "使用离线裁判模型对比多个模型的表现",
      "evaluation_type": "comparison",
      "data_source": "existing",
      "dataset_format": "prompt-response",
      "evaluation_method": "referee",
      "dataset_model_relations": [
        {
          "inference_result_dataset_id": 1,
          "evaluated_model_id": 101,
          "sort_order": 0
        },
        {
          "inference_result_dataset_id": 2,
          "evaluated_model_id": 102,
          "sort_order": 1
        }
      ],
      "referee_model_id": 201,
      "referee_type": "model",
      "graphics_card_resource": {
        "card_type": "GPU",
        "card_model": "A800",
        "count": 1,
        "card_memory": "80GB",
        "k8s_resource_type": "nvidia.com/gpu"
      },
      "referee_inference_params": {
        "temperature": 0.7,
        "top_p": 1.0,
        "max_tokens": 4096,
        "presence_penalty": 0.0,
        "gpu_memory_utilization": 0.9
      },
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "语义连贯性",
            "description": "评估回答的语义连贯性，判断回答是否逻辑清晰、表达流畅",
            "system_metric_id": 1,
            "metrics_mapping": {
              "input": "Prompt",
              "actual_output": "Model Response",
              "expected_output": "Standard Response"
            }
          },
          {
            "name": "内容丰富度",
            "description": "评估回答的内容丰富度，判断回答是否信息充分、细节完整",
            "system_metric_id": 2,
            "metrics_mapping": {
              "input": "Prompt",
              "actual_output": "Model Response"
            }
          }
        ],
        "prompt_template": "你是一个严谨专业的文本评估器，负责依据给定的评估标准对文本进行评分，并给出合理的评分理由。\n\n请注意：\n- 你只负责完成评分任务和给出理由，不要回答或续写原始输入内容。\n- 必须严格按照给定的评分区间和含义打分。\n- 输出必须严格符合指定的 JSON 结构，不要输出多余内容。\n\n[评估指标定义]\n- 指标名称：{{ metric.name }}\n- 指标说明：{{ metric.description }}\n- 评分区间：{{ metric.score_min }} - {{ metric.score_max }}\n\n[待评估内容]\n{% if input_content is defined %}\n<input_content>用户问题:\n{{ input_content_mapping_value }}\n</input_content>\n{% endif %}\n\n{% if actual_output is defined %}\n<actual_output>模型回答:\n{{ actual_output_mapping_value }}\n</actual_output>\n{% endif %}\n\n[输出格式]\n只输出下面的 JSON 结构：\n{\n  \"{{ metric.name }}\": {\n    \"score\": \"<在 {{ metric.score_min }} 到 {{ metric.score_max }} 之间的整数分数>\",\n    \"reason\": \"<具体的中文评分理由>\"\n  }\n}"
      }
    }
    ```
    
    ### 示例4：对比评估 - 基础指标评估（已有推理结果集）
    ```json
    {
      "name": "对比评估_基础指标_20250828_103614",
      "description": "使用基础指标对比多个模型的表现",
      "evaluation_type": "comparison",
      "data_source": "existing",
      "dataset_format": "prompt-response",
      "evaluation_method": "basic_metric",
      "dataset_model_relations": [
        {
          "inference_result_dataset_id": 1,
          "evaluated_model_id": 101,
          "sort_order": 0
        },
        {
          "inference_result_dataset_id": 2,
          "evaluated_model_id": 102,
          "sort_order": 1
        }
      ],
      "basic_metric_config": {
        "metrics": ["准确率", "F1", "ROUGE-1", "Rouge-2", "Rouge-L", "BLEU-4", "格式遵从性", "语义相似度"],
        "stop_words": "jfs://evaluation/stop_words/stop_words_20250828.txt"
      }
    }
    ```
    
    ### 示例5：同时进行两种评估（all）
    ```json
    {
      "name": "同时评估_20250828_103614",
      "description": "同时进行裁判员评估和基础指标评估",
      "evaluation_type": "single",
      "data_source": "existing",
      "dataset_format": "prompt-response",
      "evaluation_method": "all",
      "dataset_model_relations": [
        {
          "inference_result_dataset_id": 1,
          "evaluated_model_id": 101,
          "sort_order": 0
        }
      ],
      "referee_model_id": 201,
      "referee_type": "model",
      "graphics_card_resource": {
        "card_type": "GPU",
        "card_model": "A800",
        "count": 1,
        "card_memory": "80GB",
        "k8s_resource_type": "nvidia.com/gpu"
      },
      "referee_inference_params": {
        "temperature": 0.7,
        "top_p": 1.0,
        "max_tokens": 4096,
        "presence_penalty": 0.0,
        "gpu_memory_utilization": 0.9
      },
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "语义连贯性",
            "description": "评估回答的语义连贯性，判断回答是否逻辑清晰、表达流畅",
            "system_metric_id": 1,
            "metrics_mapping": {
              "input": "Prompt",
              "actual_output": "Model Response",
              "expected_output": "Standard Response"
            }
          }
        ],
        "prompt_template": "你是一个严谨专业的文本评估器，负责依据给定的评估标准对文本进行评分，并给出合理的评分理由。\n\n请注意：\n- 你只负责完成评分任务和给出理由，不要回答或续写原始输入内容。\n- 必须严格按照给定的评分区间和含义打分。\n- 输出必须严格符合指定的 JSON 结构，不要输出多余内容。\n\n[评估指标定义]\n- 指标名称：{{ metric.name }}\n- 指标说明：{{ metric.description }}\n- 评分区间：{{ metric.score_min }} - {{ metric.score_max }}\n\n[待评估内容]\n{% if input_content is defined %}\n<input_content>用户问题:\n{{ input_content_mapping_value }}\n</input_content>\n{% endif %}\n\n{% if actual_output is defined %}\n<actual_output>模型回答:\n{{ actual_output_mapping_value }}\n</actual_output>\n{% endif %}\n\n[输出格式]\n只输出下面的 JSON 结构：\n{\n  \"{{ metric.name }}\": {\n    \"score\": \"<在 {{ metric.score_min }} 到 {{ metric.score_max }} 之间的整数分数>\",\n    \"reason\": \"<具体的中文评分理由>\"\n  }\n}"
      },
      "basic_metric_config": {
        "metrics": ["准确率", "F1", "ROUGE-1", "Rouge-2", "Rouge-L", "BLEU-4"],
        "stop_words": "jfs://evaluation/stop_words/stop_words_20250828.txt"
      }
    }
    ```
    
    ### 示例4-1：对比评估 - 基础指标评估（新建推理结果集）
    ```json
    {
      "name": "对比评估_基础指标_20250828_103614",
      "description": "使用基础指标对比多个模型的表现",
      "evaluation_type": "comparison",
      "data_source": "new",
      "evaluation_method": "basic_metric",
      "dataset_model_relations": [
        {
          "evaluated_model_id": 101,
          "evaluated_model_name": "qwen3-0.6B-sft1-V1",
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
          "dataset_name": "qwen3-0.6B-sft-V1-推理结果",
          "dataset_description": "用于评估的推理结果集",
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
          "evaluated_model_id": 102,
          "evaluated_model_name": "qwen3-0.6B-sft1-V2",
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
          "dataset_name": "qwen3-0.6B-sft-V2-推理结果",
          "dataset_description": "用于评估的推理结果集",
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
      "basic_metric_config": {
        "metrics": ["准确率", "F1", "ROUGE-1", "Rouge-2", "Rouge-L", "BLEU-4", "格式遵从性", "语义相似度"],
        "stop_words": "jfs://evaluation/stop_words/stop_words_20250828.txt"
      }
    }
    ```
    
    ### 示例3-2：对比评估 - 裁判员评估（新建推理结果集）
    ```json
    {
      "name": "对比评估_裁判员_新建推理集_20250828_103614",
      "description": "使用裁判员对比多个模型的表现（先新建两个推理结果集）",
      "evaluation_type": "comparison",
      "data_source": "new",
      "dataset_format": "prompt-response",
      "evaluation_method": "referee",
      "dataset_model_relations": [
        {
          "evaluated_model_id": 101,
          "evaluated_model_name": "qwen3-0.6B-sft1-V1",
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
          "evaluated_model_id": 102,
          "evaluated_model_name": "qwen3-0.6B-sft1-V2",
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
      "referee_model_id": 201,
      "referee_type": "service",
      "referee_inference_params": {
        "temperature": 0.7,
        "top_p": 1.0,
        "max_tokens": 4096,
        "presence_penalty": 0.0
      },
      "evaluation_prompt_config": {
        "metrics": [
          {
            "name": "语义连贯性",
            "description": "评估回答的语义连贯性，判断回答是否逻辑清晰、表达流畅",
            "system_metric_id": 1,
            "metrics_mapping": {
              "input": "Prompt",
              "actual_output": "Model Response",
              "expected_output": "Standard Response"
            }
          }
        ],
        "prompt_template": "你是一个严谨专业的文本评估器，负责依据给定的评估标准对文本进行评分，并给出合理的评分理由。\n\n请注意：\n- 你只负责完成评分任务和给出理由，不要回答或续写原始输入内容。\n- 必须严格按照给定的评分区间和含义打分。\n- 输出必须严格符合指定的 JSON 结构，不要输出多余内容。\n\n[评估指标定义]\n- 指标名称：{{ metric.name }}\n- 指标说明：{{ metric.description }}\n- 评分区间：{{ metric.score_min }} - {{ metric.score_max }}\n\n[待评估内容]\n{% if input_content is defined %}\n<input_content>用户问题:\n{{ input_content_mapping_value }}\n</input_content>\n{% endif %}\n\n{% if actual_output is defined %}\n<actual_output>模型回答:\n{{ actual_output_mapping_value }}\n</actual_output>\n{% endif %}\n\n[输出格式]\n只输出下面的 JSON 结构：\n{\n  \"{{ metric.name }}\": {\n    \"score\": \"<在 {{ metric.score_min }} 到 {{ metric.score_max }} 之间的整数分数>\",\n    \"reason\": \"<具体的中文评分理由>\"\n  }\n}"
      }
    }
    ```
    
    ## 重要说明
    
    ### data_source 字段说明
    - **existing（已有推理结果集）**：
      - 需要提供 `inference_result_dataset_id`（推理结果集ID）
      - 系统直接使用已存在的推理结果集进行评估
    - **new（新建推理结果集）**：
      - 不需要提供 `inference_result_dataset_id`
      - 需要提供创建推理结果集所需的所有参数（见下方详细说明）
      - 系统会先创建推理结果集，然后再创建评估任务
    
    ### dataset_model_relations 字段说明
    
    #### 当 data_source=existing 时：
    - 每个元素需要包含：
      - `inference_result_dataset_id`（必填）：已有推理结果集ID
      - `evaluated_model_id`（必填）：待评估模型/服务ID
      - `sort_order`（可选）：排序顺序，默认0
    
    #### 当 data_source=new 时：
    - 每个元素需要包含：
      - `evaluated_model_id`：待评估模型/服务ID
      - `evaluated_model_name`（可选）：待评估模型/服务名称
      - `sort_order`（可选）：排序顺序，默认0
      - **推理方式相关参数**：
        - `inference_method`（必填）：推理方式，`offline`（离线推理）或 `online`（在线推理）
        - **离线推理**需要：
          - `model_id`（必填）：待推理模型ID
          - `model_name`（可选）：待推理模型名称及版本
          - `graphics_card_resource`（可选，有默认值）：GPU/NPU 资源配置
            - `card_type`（必填）：卡类型，如"GPU"、"NPU"
            - `card_model`（必填）：卡型号，如"A100"、"A800"、"H100"
            - `count`（可选，默认1）：GPU/NPU 数量，范围>=1
            - `card_memory`（可选）：显存大小，如"80GB"、"40GB"
            - `k8s_resource_type`（必填）：K8s 资源类型，如"nvidia.com/gpu"、"huawei.com/npu"
            - 默认值：`{"card_type": "GPU", "card_model": "A800", "count": 1, "card_memory": "80GB", "k8s_resource_type": "nvidia.com/gpu"}`
        - **在线推理**需要：
          - `online_service_id`（必填）：待推理服务ID
          - `online_service_name`（可选）：待推理服务名称及版本
      - **推理参数**：
        - `inference_params`（可选）：推理模型参数配置（字典格式，键为推理参数类型枚举值，值为参数值）
          - `temperature`（可选，默认0.7）：温度参数（Temperature），范围0.0-2.0，控制模型输出的随机性。值越高，输出越随机；值越低，输出越确定
          - `top_p`（可选，默认1.0）：核采样参数，范围0.0-1.0，控制模型从累积概率达到p的词汇集合中选择。默认1.0表示采样时考虑所有tokens
          - `max_tokens`（可选，默认4096）：最大生成token数，范围>=1。如果设置为None或不提供，表示不限制
          - `presence_penalty`（可选，默认0.0）：重复惩罚参数（Repetition Penalty），范围>=0.0，用于减少模型生成重复内容。值越高，惩罚越强
          - `gpu_memory_utilization`（可选，默认0.9，仅离线推理）：vLLM GPU显存占用率，范围0.1-1.0。离线推理时显存不足可调低此值
          - **注意**：参数键必须使用枚举值（如 `"temperature"`、`"top_p"`、`"max_tokens"`、`"presence_penalty"`、`"gpu_memory_utilization"`），可通过 `/api/v1/enums/inference-params` 接口查询所有支持的推理参数类型
      - **数据集信息**：
        - `dataset_name`（可选）：数据集名称，如果不提供则自动生成（格式：模型名称-推理结果）
        - `dataset_description`（可选）：数据集描述
      - **待推理数据**：
        - `source_dataset_id`（必填）：待推理数据ID（训练数据集ID）
        - `source_dataset_name`（可选）：待推理数据名称
    
    ### 评估类型说明
    - **单个评估（single）**：`dataset_model_relations` 至少需要1个元素
    - **对比评估（comparison）**：`dataset_model_relations` 至少需要2个元素，每个元素对应一个"推理结果集-待评估模型"的对应关系
    - **推理结果集不能重复**：对比评估时，同一个推理结果集ID不能出现在多个关联关系中（仅适用于existing）
    - **模型不能重复**：对比评估时，同一个待评估模型ID不能对应多个推理结果集
    - **sort_order**：用于确定对比评估时的显示顺序（0表示第一个，1表示第二个，以此类推）
    
    ### 评估方法说明
    
    #### referee（裁判员评估）
    - **使用场景**：使用裁判模型进行主观评估，适合需要人工判断的场景
    - **必填字段**：
      - `referee_model_id`：裁判模型/服务ID
      - `evaluation_prompt_config`：评估Prompt配置
        - `metrics`：评估指标列表（每个指标包含名称、说明、分值范围等）
        - `prompt_template`（可选）：完整的Prompt模板。如果不提供，则使用系统默认模板
    - **不能提供**：`basic_metric_config`
    
    #### basic_metric（基础指标评估）
    - **使用场景**：使用系统指标进行客观评估，适合需要标准化评估的场景
    - **必填字段**：
      - `basic_metric_config`：基础指标配置
        - `metrics`（必填，至少选择一个）：指标列表，支持以下指标：
          - **准确率 (Accuracy)**：用于评估模型正确执行给定任务的能力，模型预测结果与评估集完全一致的样本占比，反映整体预测的正确性
          - **F1**：综合考虑模型精准率与召回率的调和平均值，衡量模型在生成内容时的平衡性能，越高表示模型越稳健
          - **ROUGE-1**：基于单个词(unigram)的匹配程度，计算模型生成文本与参考答案之间的词汇覆盖率，用于评估关键信息是否被提及
          - **Rouge-2**：基于两个连续词(bigram)的匹配程度，衡量模型生成文本在短语级别的连贯性与准确性，反映语言的自然度
          - **Rouge-L**：通过计算模型输出与参考答案之间的最长公共子序列(LCS)，评估语序与结构的相似性，适用于衡量整体语义结构一致性
          - **BLEU-4**：综合评估模型生成文本与参考文本在1至4元语法(n-gram)层面上的匹配程度，反映语言流畅性与表达准确性，常用于机器翻译与文本生成任务
          - **格式遵从性 (Format Compliance)**：检测模型输出是否严格遵循JSON格式规范，确保结果具备程序可读性与系统集成友好性
          - **语义相似度 (Semantic Similarity)**：综合Exact Match(完全匹配)与MAUVE(基于Embedding的语义分布相似度)两个维度，衡量模型输出与参考答案在字面与语义层面的一致性。MAUVE值越接近1，表示语义越接近人类表达
        - `stop_words`（可选）：停用词文件在 JuiceFS 中的地址（jfs:// 格式），用于某些指标计算时过滤停用词，提高评估准确性。由于停用词列表可能很大，因此使用 JuiceFS 存储，文件格式为每行一个停用词
    - **不能提供**：`referee_model_id` 或 `evaluation_prompt_config`
    
    #### all（同时评估）
    - **使用场景**：同时进行裁判员评估和基础指标评估，获得更全面的评估结果
    - **必填字段**：
      - `referee_model_id`：裁判模型/服务ID（与 referee 方法相同）
      - `evaluation_prompt_config`：评估Prompt配置（与 referee 方法相同）
      - `basic_metric_config`：基础指标配置（与 basic_metric 方法相同）
    - **执行方式**：系统会并行执行两种评估方法，分别生成评估结果和报告
    
    **注意**：
    - `referee` 和 `basic_metric` 单独使用时是互斥的，只能选择其中一种评估方法
    - `all` 类型可以同时运行裁判员评估和基础指标评估，需要同时提供两种评估的完整配置
    
    ### 创建流程说明
    1. **data_source=existing**：直接使用已有推理结果集，创建评估任务
    2. **data_source=new**：
       - 系统会先为每个 `dataset_model_relations` 元素创建推理结果集
       - 推理结果集创建成功后，使用其ID创建评估任务和关联关系
       - 如果推理结果集创建失败，整个评估任务创建也会失败
    """
    # 模型评估时设置默认值
    if task.evaluation_method != "manual":
        # 设置 dataset_type 默认值为 text-generation
        if task.dataset_type is None:
            task.dataset_type = "text-generation"
        # 设置 dataset_format 默认值为 prompt-response
        if task.dataset_format is None:
            task.dataset_format = "prompt-response"
    
    result = await evaluation_task_service.create_evaluation_task(current_user, project_id, task)
    # 如果是更新操作，返回200状态码；如果是创建操作，返回201状态码
    if task.id:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=result.model_dump(mode='json')
        )
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=result.model_dump(mode='json')
    )


@router.get("/project/{project_id}", response_model=Page[EvaluationTaskSummaryResponse])
@inject
async def list_evaluation_tasks(
    project_id: int = Path(..., description="项目ID"),
    name: Optional[str] = Query(None, description="按任务名称搜索"),
    status: Optional[TaskStatus] = Query(None, description="状态筛选"),
    evaluation_type: Optional[str] = Query(None, description="评估类型筛选（single/comparison）"),
    evaluation_method: Optional[str] = Query(None, description="评估方法筛选（referee/basic_metric/all）"),
    dataset_format: Optional[str] = Query(None, description="数据格式筛选：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式"),
    dataset_type: Optional[str] = Query(None, description="数据集类型筛选：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态"),
    page: Optional[int] = Query(1, ge=1, description="页码"),
    size: Optional[int] = Query(10, ge=1, le=100, description="每页数量"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> Page[EvaluationTaskSummaryResponse]:
    """查询评估任务列表
    
    ## 功能说明
    支持按任务名称、状态、评估类型、评估方法、数据格式、评估类别进行筛选，支持分页查询。
    
    ## 评估方法说明
    - 默认只返回模型评估任务（排除人工评估）
    - 模型评估方法包括：referee（裁判员评估）、basic_metric（基础指标评估）、all（同时进行两种评估）
    - 如果指定了evaluation_method参数，则按指定方法筛选
    
    ## 查询参数
    - `name`: 任务名称（可选，模糊搜索）
    - `status`: 状态筛选（可选）
    - `evaluation_type`: 评估类型筛选（可选，single/comparison）
    - `evaluation_method`: 评估方法筛选（可选，referee/basic_metric/all）
    - `dataset_format`: 数据格式筛选（可选，prompt-response/role-based/prefix-suffix-middle）
    - `dataset_type`: 数据集类型筛选（可选，text-generation/image-generation/image-understanding/multimodal）
    - `page`: 页码（默认1）
    - `size`: 每页数量（默认10，最大100）
    """
    return await evaluation_task_service.list_evaluation_tasks(
        project_id, name, status, evaluation_type, evaluation_method, dataset_format, dataset_type, page, size
    )


@router.get("/project/{project_id}/task/{task_id}", response_model=EvaluationTaskDetailResponse)
@inject
async def get_evaluation_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="评估任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> EvaluationTaskDetailResponse:
    """查询评估任务详情
    
    ## 功能说明
    获取指定评估任务的详细信息，包括配置、关联关系、状态等。
    """
    return await evaluation_task_service.get_evaluation_task(project_id, task_id)


@router.get("/project/{project_id}/name/{task_name}", response_model=List[EvaluationTaskSummaryResponse])
@inject
async def get_evaluation_task_versions(
    project_id: int = Path(..., description="项目ID"),
    task_name: str = Path(..., description="评估任务名称"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> List[EvaluationTaskSummaryResponse]:
    """查询评估任务版本列表
    
    ## 功能说明
    根据任务名称查询该任务的所有版本，返回结果按版本号降序排列（最新版本在前）。
    可以用于查看评估历史，追溯重新评估的记录。
    """
    return await evaluation_task_service.get_evaluation_task_versions(project_id, task_name)


@router.post("/project/{project_id}/task/{task_id}/clone", response_model=EvaluationTaskDetailResponse,
             status_code=status.HTTP_201_CREATED)
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
async def clone_evaluation_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="评估任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> EvaluationTaskDetailResponse:
    """克隆评估任务
    
    ## 功能说明
    克隆评估任务会创建一个新任务（新任务名称，版本为v1），复制原始任务的所有配置和关联关系。
    """
    return await evaluation_task_service.clone_evaluation_task(current_user, project_id, task_id)


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
async def delete_evaluation_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="评估任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
):
    """删除评估任务
    
    ## 功能说明
    删除评估任务及其关联的关联关系和报告数据。
    """
    await evaluation_task_service.delete_evaluation_task(project_id, task_id)


@router.get("/project/{project_id}/task/{task_id}/results", response_model=PageItemResponse)
@inject
async def get_evaluation_results(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="评估任务ID"),
    dataset_id: int = Query(..., description="推理结果集ID"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(10, ge=1, le=10, description="每页数量（预览接口，最大10）"),
    evaluation_method: str = Query("referee", description="评估方法筛选（referee/basic_metric），默认为referee"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> PageItemResponse:
    """查询评估详情（明细数据）
    
    ## 功能说明
    从JuiceFS读取评估结果明细文件，支持分页。
    注意：这是预览接口，每页数量最大为10。
    
    ## 评估方法筛选
    - `referee`: 裁判员评估结果（默认）
    - `basic_metric`: 基础指标评估结果
    - 当评估任务的evaluation_method为all时，可通过此参数筛选不同的评估结果
    """
    return await evaluation_task_service.get_evaluation_results(
        project_id, task_id, dataset_id, page, size, evaluation_method
    )


@router.get("/project/{project_id}/task/{task_id}/results/download")
@inject
async def download_evaluation_results(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="评估任务ID"),
    format: str = Query("jsonl", description="下载格式（xlsx/csv/json/jsonl）"),
    dataset_id: Optional[int] = Query(None, description="数据集ID筛选"),
    evaluation_method: str = Query("referee", description="评估方法筛选（referee/basic_metric），默认为referee"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
):
    """下载评估结果
    
    ## 功能说明
    从JuiceFS读取评估结果明细文件，转换为指定格式后返回。
    支持excel、csv、json、jsonl四种格式。
    
    ## 评估方法筛选
    - `referee`: 裁判员评估结果（默认）
    - `basic_metric`: 基础指标评估结果
    - 当评估任务的evaluation_method为all时，可通过此参数筛选不同的评估结果
    """
    return await evaluation_task_service.download_evaluation_results(
        project_id, task_id, format, dataset_id, evaluation_method
    )


@router.get("/project/{project_id}/task/{task_id}/report", response_model=EvaluationReportResponse)
@inject
async def get_evaluation_report(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="评估任务ID"),
    evaluation_method: Optional[EvaluationMethod] = Query(None, description="评估方法筛选（referee/basic_metric），如果提供则只返回该评估方法的报告"),
    calculation_method: Optional[CalculationMethod] = Query(None, description="计算方式筛选（average/max/min），如果提供则只返回该计算方式的结果"),
    model_id: Optional[int] = Query(None, description="模型ID筛选（对比评估时使用）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> EvaluationReportResponse:
    """查询评估报告
    
    ## 功能说明
    获取评估任务的汇总统计信息，包括各指标的汇总分数和对比数据（对比评估时）。
    每个模型的报告包含多个聚合指标（aggregative_metrics），支持不同的计算方式（average、max、min）。
    
    ## 查询参数
    - `evaluation_method`: 评估方法筛选（referee/basic_metric），如果提供则只返回该评估方法的报告
    - `calculation_method`: 计算方式筛选（average/max/min），如果提供则只返回该计算方式的结果
    - `model_id`: 模型ID筛选（对比评估时使用）
    
    ## 注意
    - 报告数据从数据库直接查询，如果报告不存在则返回 404
    - 如果任务类型是 `all`，可能会返回多条报告（referee 和 basic_metric 各一条），可以通过 `evaluation_method` 参数筛选
    """
    report = await evaluation_task_service.get_evaluation_report(
        project_id, task_id, evaluation_method, calculation_method, model_id
    )
    
    if report is None:
        raise HTTPException(
            status_code=404,
            detail=f"评估任务 {task_id} 没有找到评估报告数据"
        )
    
    return report


@router.get("/project/{project_id}/task/{task_id}/report/download-docx")
@inject
async def download_evaluation_report_docx(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="评估任务ID"),
    evaluation_method: Optional[EvaluationMethod] = Query(None, description="评估方法筛选（referee/basic_metric），如果提供则只导出该评估方法的报告。如果不提供且任务使用了all方法，则导出所有评估方法的结果。"),
    calculation_method: Optional[CalculationMethod] = Query(CalculationMethod.AVERAGE, description="计算方式（average/max/min），默认使用average"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
):
    """下载评估报告DOCX文件
    
    ## 功能说明
    生成并下载评估报告的DOCX格式文件，包含任务基本信息、评估配置、各模型的指标对比结果和图表。
    
    ## 查询参数
    - `evaluation_method`: 评估方法筛选（referee/basic_metric），如果提供则只导出该评估方法的报告。如果不提供且任务使用了all方法，则导出所有评估方法的结果。
    - `calculation_method`: 计算方式（average/max/min），默认使用average。
    
    ## 返回
    - DOCX文件流，文件名格式：`评估报告_{任务名称}_{时间戳}.docx`
    """
    return await evaluation_task_service.download_evaluation_report_docx(
        project_id, task_id, evaluation_method, calculation_method
    )


@router.get("/project/{project_id}/task/{task_id}/logs", response_model=TaskLogResponse)
@inject
async def get_task_logs(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="评估任务ID"),
    end_time: datetime = Query(..., description="结束时间（ISO格式），用于指定Loki查询的结束时间点"),
    days: Optional[int] = Query(30, description="如果没有归档日志，从结束时间往前查询N天的日志"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> TaskLogResponse:
    """查询任务日志
    
    ## 功能说明
    获取评估任务的执行日志。
    - 如果有归档日志（存储在MinIO），返回归档日志
    - 如果没有归档日志，从Loki获取实时日志
    """
    return await evaluation_task_service.get_task_logs(project_id, task_id, end_time, days)


@router.get("/project/{project_id}/task/{task_id}/logs/download")
@inject
async def download_task_logs(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="评估任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
):
    """下载任务日志文件
    
    ## 功能说明
    下载评估任务的归档日志文件（从MinIO下载）。
    
    ## 路径参数
    - `project_id`: 项目ID
    - `task_id`: 评估任务ID
    
    ## 返回
    日志文件流（text/plain格式）
    
    ## 注意事项
    - 只有已归档的日志才能下载（任务完成后自动归档）
    - 如果任务没有归档日志，将返回 404 错误
    - 文件名为日志在MinIO中的原始文件名
    """
    return await evaluation_task_service.download_task_logs(project_id, task_id)


@router.post("/project/{project_id}/task/{task_id}/stop", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.DATA_MANAGER_EVALUATION_TASK,
    table_name="evaluation_tasks",
    operator_type=OperatorType.EDIT,
    operator_content_key=["name"],
    self_service_field_mapping=None,
    scope_service_field_mapping={
        "service_name": "project_service",
        "field_name": "project_id",
        "tag_field_name": "name"
    }
)
async def stop_evaluation_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="评估任务ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
):
    """停止评估任务
    
    ## 功能说明
    停止正在运行的评估任务，包括：
    1. 更新任务状态为"终止"
    2. 在K8s上删除对应的Jobs
    
    ## 路径参数
    - `project_id`: 项目ID
    - `task_id`: 评估任务ID
    
    ## 注意事项
             - 只有状态为"运行中"或"排队中"的任务才能停止
             - 停止操作会删除K8s上的相关Job
             - 如果任务使用了"all"评估方法，会删除一个包含两个容器的Job；否则删除一个单容器Job
    """
    await evaluation_task_service.stop_evaluation_task(project_id, task_id)


@router.get("/metrics/basic", response_model=List[BasicMetricResponse])
@inject
async def get_basic_metrics(
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> List[BasicMetricResponse]:
    """查询基础评估指标列表
    
    ## 功能说明
    获取系统预定义的基础评估指标列表（只读）。
    
    支持的基础指标包括：
    - 准确率 (Accuracy)
    - F1
    - ROUGE-1
    - Rouge-2
    - Rouge-L
    - BLEU-4
    - 格式遵从性 (Format Compliance)
    - 语义相似度 (Semantic Similarity)
    """
    return await evaluation_task_service.get_basic_metrics()


@router.get("/project/{project_id}/metrics", response_model=Page[EvaluationMetricResponse])
@inject
async def get_evaluation_metrics(
    project_id: int = Path(..., description="项目ID"),
    name: Optional[str] = Query(None, description="指标名称（支持模糊匹配）"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(10, ge=1, le=100, description="每页数量"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> Page[EvaluationMetricResponse]:
    """查询裁判员评估系统指标列表
    
    ## 功能说明
    获取指定项目下的裁判员评估系统指标列表，支持按指标名称模糊匹配筛选。
    """
    return await evaluation_task_service.get_evaluation_metrics(project_id, name, page, size)


@router.get("/project/{project_id}/metrics/{metric_id}", response_model=EvaluationMetricResponse)
@inject
async def get_evaluation_metric(
    project_id: int = Path(..., description="项目ID"),
    metric_id: int = Path(..., description="指标ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> EvaluationMetricResponse:
    """查询裁判员评估系统指标详情
    
    ## 功能说明
    根据项目ID和指标ID获取裁判员评估系统指标的详细信息。
    """
    return await evaluation_task_service.get_evaluation_metric(project_id, metric_id)


@router.post("/project/{project_id}/metrics", response_model=EvaluationMetricResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.DATA_MANAGER_EVALUATION_TASK,
    table_name="evaluation_metrics",
    operator_type=OperatorType.ADD,
    operator_content_key=["name"],
    self_service_field_mapping=None,
    scope_service_field_mapping=None
)
async def create_system_metric(
    project_id: int = Path(..., description="项目ID"),
    metric: EvaluationMetricCreate = Body(..., description="创建裁判员评估系统指标请求"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> EvaluationMetricResponse:
    """创建裁判员评估系统指标
    
    ## 功能说明
    创建新的裁判员评估系统指标，用于裁判员评估任务中。
    支持绑定评估任务的元数据字段，实现指标与数据集的关联。
    支持定义多个分值范围（score_scope），每个范围包含最小值、最大值和分值定义。
    
    ## 请求参数
    - `name`: 指标名称（必填）
    - `description`: 指标说明（可选）
    - `score_scope`: 指标分值范围列表（可选），每个范围包含：
      - `score_min`: 分值最小值
      - `score_max`: 分值最大值
      - `score_definitions`: 分值定义（普通字符串，描述分值的含义和说明）
    - `evaluation_task_id`: 评估任务ID（可选，如果提供则绑定元数据字段）
    - `metrics_param`: 指标参数列表（可选，如：["input", "actual_output"]）
    - `metrics_mapping`: 指标参数与元数据字段的映射（可选）
    - `sample_data`: 示例数据（可选，用于模板预览）
    
    ## 请求示例
    
    ### 基础创建（不绑定元数据字段）
    ```json
    {
      "name": "语义连贯性",
      "description": "评估回答的语义连贯性",
      "score_scope": [
        {
          "score_min": 0,
          "score_max": 10,
          "score_definitions": "0分表示完全不符合，1分表示基本不符合，5分表示部分符合，8分表示基本符合，10分表示完全符合"
        }
      ],
      "metrics_param": ["input", "actual_output"]
    }
    ```
    
    ### 创建多个分值范围
    ```json
    {
      "name": "综合评估",
      "description": "综合评估指标",
      "score_scope": [
        {
          "score_min": 0,
          "score_max": 5,
          "score_definitions": "0分表示很差，3分表示一般，5分表示良好"
        },
        {
          "score_min": 6,
          "score_max": 10,
          "score_definitions": "6分表示较好，8分表示很好，10分表示优秀"
        }
      ]
    }
    ```
    """
    return await evaluation_task_service.create_evaluation_metric(project_id, current_user, metric)


@router.put("/project/{project_id}/metrics/{metric_id}", response_model=EvaluationMetricResponse)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.DATA_MANAGER_EVALUATION_TASK,
    table_name="evaluation_metrics",
    operator_type=OperatorType.EDIT,
    operator_content_key=["name"],
    self_service_field_mapping=None,
    scope_service_field_mapping=None
)
async def update_evaluation_metric(
    project_id: int = Path(..., description="项目ID"),
    metric_id: int = Path(..., description="指标ID"),
    metric: EvaluationMetricUpdate = Body(..., description="更新裁判员评估系统指标请求"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> EvaluationMetricResponse:
    """更新裁判员评估系统指标
    
    ## 功能说明
    更新已存在的裁判员评估系统指标信息。
    
    ## 请求参数
    - `name`: 指标名称（可选）
    - `description`: 指标说明（可选）
    - `score_scope`: 指标分值范围列表（可选），每个范围包含：
      - `score_min`: 分值最小值
      - `score_max`: 分值最大值
      - `score_definitions`: 分值定义（普通字符串，描述分值的含义和说明）
    - `metrics_param`: 指标参数列表（可选）
    
    ## 请求示例
    ```json
    {
      "name": "语义连贯性（更新）",
      "description": "更新后的指标说明",
      "score_scope": [
        {
          "score_min": 0,
          "score_max": 10,
          "score_definitions": "0分表示完全不符合，5分表示部分符合，10分表示完全符合"
        }
      ]
    }
    ```
    
    注意：所有字段都是可选的，只更新提供的字段。
    """
    return await evaluation_task_service.update_evaluation_metric(project_id, metric_id, metric)


@router.delete("/project/{project_id}/metrics/{metric_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.DATA_MANAGER_EVALUATION_TASK,
    table_name="evaluation_metrics",
    operator_type=OperatorType.DELETE,
    operator_content_key=["name"],
    self_service_field_mapping=None,
    scope_service_field_mapping=None
)
async def delete_system_metric(
    project_id: int = Path(..., description="项目ID"),
    metric_id: int = Path(..., description="指标ID"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
):
    """删除裁判员评估系统指标
    
    ## 功能说明
    删除指定项目下的裁判员评估系统指标。
    
    ## 注意事项
    - 如果指标正在被评估任务使用，将无法删除
    - 删除操作不可恢复
    """
    await evaluation_task_service.delete_evaluation_metric(project_id, metric_id)


@router.patch("/project/{project_id}/task/{task_id}/status", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def update_task_status(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="评估任务ID"),
    status: TaskStatus = Body(..., description="任务状态"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
):
    """更新任务状态
    
    ## 功能说明
    允许其他服务通过REST API修改评估任务的状态。
    """
    await evaluation_task_service.update_task_status(task_id, status)


@router.post("/template/render")
@inject
async def render_evaluation_template(
    metric: EvaluationMetricCreate = Body(..., description="指标内容"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> Response:
    """渲染评估模板
    
    ## 功能说明
    根据评估指标和数据集元数据字段，渲染Prompt模板。
    模板从数据库的 common_config 表中获取（key为 prompt_template），使用 Jinja2 引擎渲染。
    系统会从 `score_scope` 中取第一个范围作为主要分值范围，并合并所有范围的分值定义。
    
    ## 请求参数
    - `metric`: 评估指标信息，包含：
      - `name`: 指标名称
      - `description`: 指标说明
      - `score_scope`: 指标分值范围列表，每个范围包含：
        - `score_min`: 分值最小值
        - `score_max`: 分值最大值
        - `score_definitions`: 分值定义（普通字符串，描述分值的含义和说明）
      - `metrics_mapping`: 指标参数与元数据字段的映射（如：{"input": "Prompt", "actual_output": "Model Response"}）
      - `sample_data`: 示例数据（可选，用于预览）
    
    ## 返回说明
    返回渲染后的模板内容（字符串），可以直接用于评估任务的Prompt配置。
    模板中会使用第一个分值范围的 `score_min` 和 `score_max`，以及所有范围合并后的 `score_definitions`。
    
    ## 请求示例
    ```json
    {
      "name": "语义连贯性",
      "description": "评估回答的语义连贯性",
      "score_scope": [
        {
          "score_min": 0,
          "score_max": 10,
          "score_definitions": "0分表示完全不符合，5分表示部分符合，10分表示完全符合"
        }
      ],
      "metrics_mapping": {
        "input": "Prompt",
        "actual_output": "Model Response"
      },
      "sample_data": {
        "Prompt": "这是一个测试问题",
        "Model Response": "这是模型的回答"
      }
    }
    ```
    """
    template = await evaluation_task_service.render_evaluation_template(
        metric=metric
    )
    return Response(content=template, media_type="text/plain; charset=utf-8")


@router.post("/reports/create-or-update", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def create_or_update_evaluation_report(
    report: EvaluationReportCreate = Body(..., description="创建或更新评估报告请求"),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
):
    """创建或更新评估报告（跨服务调用）
    
    ## 功能说明
    用于其他服务创建或更新评估报告的总览平均评估指标。
    
    - 如果报告已存在（根据evaluation_task_id、evaluated_model_id和evaluation_method），则更新
    - 如果不存在，则创建新报告
    - 注意：同一个任务和模型可以有多条报告记录（不同evaluation_method），task和report是一对多关系
    
    ## 请求示例
    ```json
    {
      "evaluation_task_id": 1,
      "evaluated_model_id": 101,
      "evaluated_model_name": "qwen3-06B-sft1-V1",
      "evaluation_method": "referee",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "语义连贯性": 95.04,
            "内容丰富度": 99.83,
            "内容相关性": 98.21
          }
        }
      ],
      "comparison_data": {
        "win_count": 9,
        "loss_count": 1,
        "tie_count": 5,
        "win_rate": 0.9,
        "loss_rate": 0.1,
        "tie_rate": 0.3333,
        "total_rounds": 15
      }
    }
    ```
    
    ## 注意
    - 此接口为跨服务调用接口，不需要用户认证
    - `evaluation_method` 字段必填，用于区分不同类型的评估报告（referee 或 basic_metric）
    - `aggregative_metrics` 格式：数组，每个元素包含 `calculation_method` 和 `metric_summary`
    - `comparison_data` 仅在对比评估时使用
    - 同一个任务和模型可以有多条报告记录（不同 evaluation_method），task 和 report 是一对多关系
    """
    await evaluation_task_service.create_or_update_evaluation_report(report)


@router.patch("/reports/task/{evaluation_task_id}/model/{evaluated_model_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def update_evaluation_report(
    evaluation_task_id: int = Path(..., description="评估任务ID"),
    evaluated_model_id: int = Path(..., description="待评估模型/服务ID"),
    evaluation_method: EvaluationMethod = Query(..., description="评估方法（用于区分不同类型的报告）"),
    report_update: EvaluationReportUpdate = Body(..., description="更新评估报告请求"),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
):
    """更新评估报告（跨服务调用）
    
    ## 功能说明
    用于其他服务更新已存在的评估报告的总览平均评估指标。
    
    仅更新 metric_summary 和 comparison_data 字段，其他字段保持不变。
    
    ## 路径参数
    - `evaluation_task_id`: 评估任务ID
    - `evaluated_model_id`: 待评估模型/服务ID
    
    ## 查询参数
    - `evaluation_method`: 评估方法（referee 或 basic_metric），用于区分不同类型的报告
    
    ## 请求示例
    ```json
    {
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "语义连贯性": 96.5,
            "内容丰富度": 99.9
          }
        }
      ],
      "comparison_data": {
        "win_count": 10,
        "loss_count": 1,
        "tie_count": 4,
        "win_rate": 0.909,
        "loss_rate": 0.091,
        "tie_rate": 0.267,
        "total_rounds": 15
      }
    }
    ```
    
    ## 注意
    - 此接口为跨服务调用接口，不需要用户认证
    - 如果报告不存在，将返回404错误
    - `evaluation_method` 查询参数必填，用于区分不同类型的报告
    - 可以只更新 metric_summary 或 comparison_data 中的一个
    """
    await evaluation_task_service.update_evaluation_report(
        evaluation_task_id, evaluated_model_id, evaluation_method, report_update
    )


@router.post("/project/{project_id}/stopwords/upload")
@inject
async def upload_stopwords_file(
    project_id: int = Path(..., description="项目ID"),
    file: UploadFile = File(..., description="停用词文件（文本格式，每行一个停用词）"),
    current_user: JwtUserInfo = Depends(get_current_user),
    evaluation_task_service: EvaluationTaskService = Depends(Provide[AutoContainer.evaluation_task_service])
) -> dict:
    """上传停用词文件到JuiceFS
    
    ## 功能说明
    上传停用词文件到JuiceFS存储，文件存储在项目级别的目录下，供该项目的所有评估任务共享使用。
    
    ## 请求参数
    - `project_id`: 项目ID（路径参数）
    - `file`: 停用词文件（multipart/form-data格式）
      - 支持的文件格式：`.txt`、
      - 文件内容：每行一个停用词
    
    ## 返回数据
    返回上传后的JuiceFS存储路径（URL），格式：
    ```json
    {
      "file_path": "/deepexilab-2/evaluation/stopwords/stopwords_20251204_183000.txt",
      "filename": "stopwords_20251204_183000.txt"
    }
    ```
    
    ## 使用说明
    1. 上传停用词文件后，在创建评估任务时，可以在 `basic_metric_config.stopwords_file` 字段中指定该文件路径
    2. 停用词文件用于基础指标评估时过滤停用词，提高评估准确性
    3. 同一项目下的多个评估任务可以共享同一个停用词文件
    
    ## 示例请求
    ```bash
    curl -X POST "http://localhost:8000/api/v1/evaluation-tasks/project/2/stopwords/upload" \
      -H "Authorization: Bearer <token>" \
      -F "file=@stopwords.txt"
    ```
    
    ## 注意事项
    - 文件大小限制：建议不超过 1MB
    - 文件编码：建议使用 UTF-8 编码
    - 文件路径：存储在项目级别的目录下，格式为 `/{namespace}/evaluation/stopwords/{filename}`
    - 如果上传同名文件，会覆盖原有文件
    """
    from app.core.logging import logger
    import os
    
    # 验证文件
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")
    
    # 读取文件内容
    try:
        file_content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"读取文件失败: {str(e)}")
    
    # 验证文件大小（限制为 1MB）
    max_size = 1 * 1024 * 1024  # 1MB
    if len(file_content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小超过限制（最大 1MB），当前文件大小: {len(file_content)} 字节"
        )
    
    # 调用服务层上传文件
    try:
        storage_path = await evaluation_task_service.upload_stopwords_file(
            project_id=project_id,
            file=file_content,
            filename=file.filename
        )
        
        # 提取文件名
        filename = os.path.basename(storage_path)
        
        return {
            "file_path": storage_path,
            "filename": filename
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"上传停用词文件失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"上传停用词文件失败: {str(e)}"
        )


