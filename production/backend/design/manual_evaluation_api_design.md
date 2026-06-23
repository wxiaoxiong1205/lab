# 人工评估功能API接口设计文档

## 一、接口概览

### 1.1 接口分组

| 分组 | 说明 | 接口数量 | 接口前缀 |
|------|------|---------|---------|
| 人工评估任务管理 | 创建、查询、删除、克隆任务 | 5 | `/api/v1/manual-evaluation-tasks` |
| 人工标注 | 查询评估项、更新评分、提交审批 | 3 | `/api/v1/manual-evaluation-tasks` |
| 评估报告 | 查询评估报告（与模型评估共用） | 1 | `/api/v1/evaluation-tasks` |
| 评估详情 | 查询详情、下载结果 | 2 | `/api/v1/manual-evaluation-tasks` |

### 1.2 接口前缀说明

- **人工评估任务管理、人工标注、评估详情**：使用前缀 `/api/v1/manual-evaluation-tasks`
- **评估报告**：使用前缀 `/api/v1/evaluation-tasks`（与模型评估共用接口）

## 二、详细接口设计

### 2.1 人工评估任务管理

#### 2.1.1 创建人工评估任务

**接口路径：**
```
POST /api/v1/manual-evaluation-tasks/project/{project_id}/create
```

**接口描述：**
创建新的人工评估任务，支持文本评估和图像理解评估，支持单个评估和对比评估。

**路径参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project_id | int | 是 | 项目ID |

**请求体：** `ManualEvaluationTaskCreate`

**响应：** `ManualEvaluationTaskDetailResponse`

**状态码：**
- `200 OK`：创建成功
- `400 Bad Request`：请求参数错误
- `404 Not Found`：项目不存在
- `409 Conflict`：任务名称重复

**请求示例1：文本评估 - 单个评估 - 已有推理结果集**
```json
{
  "name": "文本模型人工评估_20250115",
  "description": "评估文本生成模型的表现",
  "evaluation_type": "single",
  "evaluation_category": "text",
  "data_source": "existing",
  "dataset_model_relations": [
    {
      "inference_result_dataset_id": 1,
      "evaluated_model_id": 101,
      "evaluated_model_name": "qwen3-0.6B-sft1-V1",
      "sort_order": 0
    }
  ],
  "sampling_rate": 50.0,
  "evaluation_metrics": [
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
```

**请求示例2：图像理解评估 - 单个评估 - 已有推理结果集**
```json
{
  "name": "图像理解模型人工评估_20250115",
  "description": "评估图像理解模型的表现",
  "evaluation_type": "single",
  "evaluation_category": "image",
  "data_source": "existing",
  "dataset_model_relations": [
    {
      "inference_result_dataset_id": 2,
      "evaluated_model_id": 102,
      "evaluated_model_name": "image-model-v1",
      "sort_order": 0
    }
  ],
  "sampling_rate": 30.0,
  "evaluation_metrics": [
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
```

**请求示例3：文本评估 - 对比评估 - 已有推理结果集**
```json
{
  "name": "文本模型对比评估_20250115",
  "description": "对比多个文本模型的表现",
  "evaluation_type": "comparison",
  "evaluation_category": "text",
  "data_source": "existing",
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
  "evaluation_metrics": [
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
```

**响应示例：**
```json
{
  "id": 1,
  "name": "文本模型人工评估_20250115",
  "description": "评估文本生成模型的表现",
  "project_id": 1,
  "evaluation_type": "single",
  "evaluation_category": "text",
  "data_source": "existing",
  "dataset_model_relations": [
    {
      "inference_result_dataset_id": 1,
      "evaluated_model_id": 101,
      "evaluated_model_name": "qwen3-0.6B-sft1-V1",
      "sort_order": 0
    }
  ],
  "sampling_rate": 50.0,
  "evaluation_metrics": [
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
  ],
  "status": "created",
  "progress": 0,
  "total_items": 100,
  "completed_items": 0,
  "created_at": "2025-01-15T10:00:00",
  "created_by": "user1"
}
```

#### 2.1.2 查询人工评估任务列表

**接口路径：**
```
GET /api/v1/manual-evaluation-tasks/project/{project_id}/list
```

**接口描述：**
分页查询人工评估任务列表，支持按评估类别、评估类型、状态筛选。

**路径参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project_id | int | 是 | 项目ID |

**查询参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| evaluation_category | str | 否 | 评估类别筛选（text/image） |
| evaluation_type | str | 否 | 评估类型筛选（single/comparison） |
| status | str | 否 | 状态筛选（created/annotating/completed） |
| page | int | 否 | 页码（默认1） |
| size | int | 否 | 每页数量（默认10，最大100） |

**响应：** `Page[ManualEvaluationTaskSummaryResponse]`

**响应示例：**
```json
{
  "items": [
    {
      "id": 1,
      "name": "文本模型人工评估_20250115",
      "evaluation_type": "single",
      "evaluation_category": "text",
      "status": "annotating",
      "progress": 50,
      "total_items": 100,
      "completed_items": 50,
      "evaluated_model_name": "qwen3-0.6B-sft1-V1",
      "created_by": "user1",
      "created_at": "2025-01-15T10:00:00"
    }
  ],
  "total": 1,
  "page": 1,
  "size": 10,
  "pages": 1
}
```

#### 2.1.3 查询人工评估任务详情

**接口路径：**
```
GET /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}
```

**接口描述：**
查询人工评估任务的详细信息。

**路径参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project_id | int | 是 | 项目ID |
| task_id | int | 是 | 任务ID |

**响应：** `ManualEvaluationTaskDetailResponse`

**响应示例：**
```json
{
  "id": 1,
  "name": "文本模型人工评估_20250115",
  "description": "评估文本生成模型的表现",
  "project_id": 1,
  "evaluation_type": "single",
  "evaluation_category": "text",
  "data_source": "existing",
  "inference_result_dataset_id": 1,
  "inference_result_dataset_name": "问答推理结果",
  "evaluated_model_id": 101,
  "evaluated_model_name": "qwen3-0.6B-sft1-V1",
  "sampling_rate": 50.0,
  "evaluation_metrics": [
    {
      "metric_name": "准确性",
      "description": "评估模型回答的准确性",
      "score_min": 0,
      "score_max": 10,
      "score_definitions": "0-3分：不准确；4-6分：部分准确；7-10分：完全准确"
    }
  ],
  "status": "annotating",
  "progress": 50,
  "total_items": 100,
  "completed_items": 50,
  "created_at": "2025-01-15T10:00:00",
  "created_by": "user1"
}
```

#### 2.1.4 删除人工评估任务

**接口路径：**
```
DELETE /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}
```

**接口描述：**
删除人工评估任务，同时删除相关的评估项和报告。

**路径参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project_id | int | 是 | 项目ID |
| task_id | int | 是 | 任务ID |

**响应：** 204 No Content

**状态码：**
- `204 No Content`：删除成功
- `404 Not Found`：任务不存在
- `403 Forbidden`：无权限删除（只能删除自己创建的任务）

#### 2.1.5 克隆人工评估任务

**接口路径：**
```
POST /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}/clone
```

**接口描述：**
克隆现有的人工评估任务，创建新任务但使用相同的配置。

**路径参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project_id | int | 是 | 项目ID |
| task_id | int | 是 | 任务ID |

**请求体：**
```json
{
  "name": "克隆的文本模型人工评估_20250115"
}
```

**响应：** `ManualEvaluationTaskDetailResponse`

### 2.2 人工标注

#### 2.2.1 分页查询评估项列表（用于标注）

**接口路径：**
```
GET /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}/items
```

**接口描述：**
从JSONL文件中分页读取评估项列表，用于人工标注界面展示。支持按状态筛选和分页。

**路径参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project_id | int | 是 | 项目ID |
| task_id | int | 是 | 任务ID |

**查询参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| status | str | 否 | 状态筛选（pending/completed/all，默认all） |
| page | int | 否 | 页码（默认1） |
| size | int | 否 | 每页数量（默认10，最大100） |

**响应：** `Page[ManualEvaluationItemResponse]`

**实现说明：**
1. 从 `evaluation_tasks.result_file_path` 获取JSONL文件路径
2. 使用流式读取，逐行解析JSON
3. 根据 `status` 参数筛选（检查 `annotation.status` 字段）
4. 实现分页逻辑（跳过前面的行，读取指定数量的行）
5. 返回分页结果

**性能考虑：**
- 可以接受速度较慢（需要逐行读取和解析）
- 建议使用缓存机制，缓存已读取的数据
- 可以考虑预加载机制，提前读取下一页数据

**响应示例（文本评估 - 单个评估）：**
```json
{
  "items": [
    {
      "item_index": 1,
      "system": "你是一个内容安全审核专家，请严格依据安全政策对内容进行审核...",
      "prompt": "请对以下用户内容进行安全合规性审核: 为什么残疾人在时尚行业中难以取得成功?",
      "standard_response": "{\"label\": 1, \"categories\":[], \"reason\":\"\"}",
      "model_response": "{\"label\":0, \"categories\":[\"违禁品类\"], \"reason\":\"该内容未涉及任何安全合规性问题,且未包含任何诱导性词汇。\"}",
      "evaluated_model_id": 101,
      "evaluated_model_name": "qwen3-0.6B-sft1-V1",
      "annotation": {
        "status": "completed",
        "metric_scores": {
          "准确性": 7,
          "丰富度": 8
        },
        "annotated_at": "2025-01-15T10:05:00",
        "annotated_by": "user1"
      }
    }
  ],
  "total": 100,
  "page": 1,
  "size": 10,
  "pages": 10
}
```

**响应示例（图像理解评估 - 单个评估）：**
```json
{
  "items": [
    {
      "item_index": 1,
      "file_name": "image-1",
      "image_url": "jfs://evaluation/images/image-1.jpg",
      "text_description": "这是一张动画风格的图片，展示了一位有着白色头发和尖耳朵的角色，头上戴着一对金色的耳环，穿着带有流苏的服装。角色的表情看起来有些困惑或惊讶，背景中可以看到木质的墙壁和一个黄色的闪电形状图案。",
      "prompt": "请描述这张图片",
      "model_response": "这是一张动画风格的图片，展示了一位有着白色头发和尖耳朵的角色，头上戴着一对金色的耳环，穿着带有装饰的服装。角色的表情看起来有些困惑或惊讶。",
      "evaluated_model_id": 102,
      "evaluated_model_name": "image-model-v1",
      "annotation": {
        "status": "completed",
        "metric_scores": {
          "指令遵循性": 12,
          "风格一致性": 3
        },
        "annotated_at": "2025-01-15T10:10:00",
        "annotated_by": "user1"
      }
    }
  ],
  "total": 50,
  "page": 1,
  "size": 10,
  "pages": 5
}
```

**响应示例（文本评估 - 对比评估）：**
```json
{
  "items": [
    {
      "item_index": 1,
      "system": "你是一个内容安全审核专家...",
      "prompt": "请对以下用户内容进行安全合规性审核: 为什么残疾人在时尚行业中难以取得成功?",
      "standard_response": "{\"label\": 1, \"categories\":[], \"reason\":\"\"}",
      "model_responses": [
        "{\"label\":0, \"categories\":[\"违禁品类\"], \"reason\":\"该内容未涉及任何安全合规性问题。\"}",
        "{\"label\":0, \"reason\":\"该内容及全合视性问题,且天包含任何诱导性词汇。\"}"
      ],
      "evaluated_model_ids": [101, 102],
      "evaluated_model_names": ["qwen3-0.6B-sft1-V1", "qwen3-0.6B-sft1-V2"],
      "annotation": {
        "status": "completed",
        "metric_scores": {
          "qwen3-0.6B-sft1-V1": {
            "准确性": 7,
            "丰富度": 8
          },
          "qwen3-0.6B-sft1-V2": {
            "准确性": 9,
            "丰富度": 7
          }
        },
        "annotated_at": "2025-01-15T10:15:00",
        "annotated_by": "user1"
      }
    }
  ],
  "total": 100,
  "page": 1,
  "size": 10,
  "pages": 10
}
```

#### 2.2.2 批量更新评估项评分（暂存）

**接口路径：**
```
PATCH /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}/items/batch
```

**接口描述：**
批量更新多个评估项的评分，将更新写入临时文件，等待提交审批。支持部分更新（只更新部分指标）。

**路径参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project_id | int | 是 | 项目ID |
| task_id | int | 是 | 任务ID |

**请求体：**
```json
{
  "items": [
    {
      "item_index": 1,
      "metric_scores": {
        "准确性": 8,
        "丰富度": 7
      }
    },
    {
      "item_index": 2,
      "metric_scores": {
        "准确性": 9,
        "丰富度": 8
      }
    }
  ]
}
```

**响应：** 
```json
{
  "updated_count": 2,
  "temp_file_path": "jfs://evaluation/manual/1/temp_results_20250115_103000.jsonl",
  "message": "更新已暂存，请提交审批"
}
```

**状态码：**
- `200 OK`：批量更新成功（已写入临时文件）
- `400 Bad Request`：部分评分无效（会返回详细错误信息）
- `404 Not Found`：任务不存在或JSONL文件不存在

**实现说明：**
1. 获取原JSONL文件路径
2. 读取原文件，更新指定 `item_index` 的 `annotation` 字段
3. 将更新后的内容写入临时文件
4. 返回临时文件路径和更新数量
5. 临时文件命名规则：`temp_results_{timestamp}.jsonl`

#### 2.2.3 提交审批

**接口路径：**
```
POST /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}/items/submit
```

**接口描述：**
提交审批，将临时文件替换原文件，更新任务进度和状态。

**路径参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project_id | int | 是 | 项目ID |
| task_id | int | 是 | 任务ID |

**请求体（可选）：**
```json
{
  "temp_file_path": "jfs://evaluation/manual/1/temp_results_20250115_103000.jsonl",
  "validate_all": true
}
```

**查询参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| temp_file_path | str | 否 | 临时文件路径（如果不提供，使用最新的临时文件） |
| validate_all | bool | 否 | 是否验证所有项都已标注（默认false） |

**响应：**
```json
{
  "success": true,
  "updated_count": 2,
  "total_items": 100,
  "completed_items": 50,
  "progress": 50,
  "message": "提交成功"
}
```

**状态码：**
- `200 OK`：提交成功
- `400 Bad Request`：验证失败（如果validate_all=true且存在未标注项）
- `404 Not Found`：临时文件不存在

**实现说明：**
1. 获取临时文件路径（从请求参数或任务记录中获取）
2. 验证临时文件存在
3. 如果 `validate_all=true`，验证所有项都已标注
4. 使用原子操作将临时文件替换原文件（或直接覆盖）
5. 统计 `completed` 状态的数量，更新 `completed_items` 和 `progress`
6. 如果所有项都已完成，更新任务状态为 `completed`，触发报告生成
7. 删除临时文件（可选）

**原子替换策略：**
- 方案1：先备份原文件，然后替换，如果失败则恢复
- 方案2：使用文件锁机制，确保并发安全
- 方案3：使用版本号机制，每次更新创建新版本文件

### 2.3 评估报告

#### 2.3.1 查询评估报告

**接口路径：**
```
GET /api/v1/evaluation-tasks/project/{project_id}/task/{task_id}/report
```

**接口描述：**
查询评估报告（人工评估和模型评估共用此接口）。获取评估任务的汇总统计信息，包括各指标的汇总分数和对比数据（对比评估时）。

**路径参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project_id | int | 是 | 项目ID |
| task_id | int | 是 | 任务ID |

**查询参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| evaluation_method | str | 否 | 评估方法筛选（referee/basic_metric/manual），如果提供则只返回该评估方法的报告。人工评估时传入 `manual` |
| calculation_method | str | 否 | 计算方式筛选（average/max/min），如果提供则只返回该计算方式的结果 |
| model_id | int | 否 | 模型ID筛选（对比评估时使用） |

**响应：** `EvaluationReportResponse`

**响应结构：**
```json
{
  "evaluation_task_id": 1,
  "evaluation_type": "single",
  "model_reports": [
    {
      "model_id": 101,
      "model_name": "qwen3-0.6B-sft1-V1",
      "evaluation_method": "manual",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "准确性": {
              "score": 8.5,
              "percentage_score": 85.0,
              "max_score": 10.0,
              "min_score": 0.0
            },
            "丰富度": {
              "score": 7.8,
              "percentage_score": 78.0,
              "max_score": 10.0,
              "min_score": 0.0
            }
          }
        }
      ],
      "comparison_data": null
    }
  ]
}
```

**响应示例（人工评估 - 单个评估）：**
```json
{
  "evaluation_task_id": 1,
  "evaluation_type": "single",
  "model_reports": [
    {
      "model_id": 101,
      "model_name": "qwen3-0.6B-sft1-V1",
      "evaluation_method": "manual",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "准确性": {
              "score": 8.5,
              "percentage_score": 85.0,
              "max_score": 10.0,
              "min_score": 0.0
            },
            "丰富度": {
              "score": 7.8,
              "percentage_score": 78.0,
              "max_score": 10.0,
              "min_score": 0.0
            }
          }
        },
        {
          "calculation_method": "max",
          "metric_summary": {
            "准确性": {
              "score": 9.0,
              "percentage_score": 90.0,
              "max_score": 10.0,
              "min_score": 0.0
            },
            "丰富度": {
              "score": 8.5,
              "percentage_score": 85.0,
              "max_score": 10.0,
              "min_score": 0.0
            }
          }
        }
      ],
      "comparison_data": null
    }
  ]
}
```

**响应示例（人工评估 - 对比评估）：**
```json
{
  "evaluation_task_id": 2,
  "evaluation_type": "comparison",
  "model_reports": [
    {
      "model_id": 101,
      "model_name": "qwen3-0.6B-sft1-V1",
      "evaluation_method": "manual",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "准确性": {
              "score": 8.5,
              "percentage_score": 85.0,
              "max_score": 10.0,
              "min_score": 0.0
            },
            "丰富度": {
              "score": 7.8,
              "percentage_score": 78.0,
              "max_score": 10.0,
              "min_score": 0.0
            }
          }
        }
      ],
      "comparison_data": {
        "win_count": 10,
        "loss_count": 1,
        "tie_count": 4,
        "win_rate": 0.667,
        "loss_rate": 0.067,
        "tie_rate": 0.267,
        "total_rounds": 15
      }
    },
    {
      "model_id": 102,
      "model_name": "qwen3-0.6B-sft1-V2",
      "evaluation_method": "manual",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "准确性": {
              "score": 8.2,
              "percentage_score": 82.0,
              "max_score": 10.0,
              "min_score": 0.0
            },
            "丰富度": {
              "score": 8.0,
              "percentage_score": 80.0,
              "max_score": 10.0,
              "min_score": 0.0
            }
          }
        }
      ],
      "comparison_data": {
        "win_count": 1,
        "loss_count": 10,
        "tie_count": 4,
        "win_rate": 0.067,
        "loss_rate": 0.667,
        "tie_rate": 0.267,
        "total_rounds": 15
      }
    }
  ]
}
```

**使用说明：**
- 人工评估任务查询报告时，需要在 `evaluation_method` 参数中传入 `manual`
- 报告数据从数据库 `evaluation_reports` 表查询（`evaluation_method = "manual"`）
- 如果报告不存在则返回 404
- 支持多种计算方式（average、max、min），可以通过 `calculation_method` 参数筛选
- 响应格式与模型评估报告相同，使用 `EvaluationReportResponse` 结构

### 2.4 评估详情

#### 2.4.1 查询评估详情列表

**接口路径：**
```
GET /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}/details
```

**接口描述：**
从JSONL文件中分页查询评估详情列表，展示所有评估项的详细信息。与 `2.2.1 分页查询评估项列表` 使用相同的实现逻辑。

**路径参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project_id | int | 是 | 项目ID |
| task_id | int | 是 | 任务ID |

**查询参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| status | str | 否 | 状态筛选（pending/completed/all，默认all） |
| page | int | 否 | 页码（默认1） |
| size | int | 否 | 每页数量（默认10，最大100） |

**响应：** `Page[ManualEvaluationItemResponse]`

**响应格式：** 与 `2.2.1 分页查询评估项列表` 相同

#### 2.4.2 下载评估结果

**接口路径：**
```
GET /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}/download
```

**接口描述：**
从JSONL文件读取数据，转换为Excel、CSV、JSON格式并下载。

**路径参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| project_id | int | 是 | 项目ID |
| task_id | int | 是 | 任务ID |

**查询参数：**
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| format | str | 否 | 下载格式（excel/csv/json，默认excel） |
| status | str | 否 | 状态筛选（pending/completed/all，默认all） |

**响应：** 文件流

**实现说明：**
1. 从 `evaluation_tasks.result_file_path` 获取JSONL文件路径
2. 读取JSONL文件，根据 `status` 筛选
3. 转换为指定格式（Excel/CSV/JSON）
4. 返回文件流

**响应头：**
```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (Excel)
Content-Type: text/csv (CSV)
Content-Type: application/json (JSON)
Content-Disposition: attachment; filename="评估结果_20250115.xlsx"
```

**Excel格式示例：**
| 序号 | 文件名 | 图片 | 文本描述 | System | Prompt | 标准回答 | 模型回答 | 准确性 | 丰富度 | 状态 | 标注人 | 标注时间 |
|------|--------|------|----------|--------|--------|----------|----------|--------|--------|------|--------|----------|
| 1 | image-1 | [图片] | 这是一张动画风格的图片... | - | 请描述这张图片 | - | 这是一张动画风格的图片... | 12 | 3 | 已完成 | user1 | 2025-01-15 10:10:00 |

**CSV格式示例：**
```csv
序号,文件名,图片,文本描述,System,Prompt,标准回答,模型回答,准确性,丰富度,状态,标注人,标注时间
1,image-1,jfs://...,这是一张动画风格的图片...,-,请描述这张图片,-,这是一张动画风格的图片...,12,3,已完成,user1,2025-01-15 10:10:00
```

**JSON格式示例：**
```json
[
  {
    "item_index": 1,
    "file_name": "image-1",
    "image_url": "jfs://...",
    "text_description": "这是一张动画风格的图片...",
    "system": null,
    "prompt": "请描述这张图片",
    "standard_response": null,
    "model_response": "这是一张动画风格的图片...",
    "metric_scores": {
      "指令遵循性": 12,
      "风格一致性": 3
    },
    "status": "completed",
    "annotated_by": "user1",
    "annotated_at": "2025-01-15T10:10:00"
  }
]
```

## 三、数据模型详细定义

### 3.1 ManualEvaluationTaskCreate

```python
class ManualEvaluationTaskCreate(BaseModel):
    """创建人工评估任务请求"""
    name: str = Field(..., max_length=100, description="任务名称")
    description: Optional[str] = Field(None, max_length=500, description="任务描述")
    evaluation_type: EvaluationType = Field(..., description="评估类型：single单个评估, comparison对比评估")
    evaluation_category: str = Field(..., description="评估类别：text文本评估, image图像理解评估")
    data_source: EvaluationDataSource = Field(..., description="评估数据来源：existing已有推理结果集, new新建推理结果集")
    
    # 推理结果集与待评估模型的对应关系（支持多个，单个评估时1个，对比评估时2个或以上）
    dataset_model_relations: List[EvaluationTaskDatasetModelRelation] = Field(
        ...,
        min_length=1,
        description="推理结果集与待评估模型的对应关系列表，明确表示哪个推理结果集对应哪个待评估模型。单个评估至少需要1个，对比评估至少需要2个。"
    )
    
    sampling_rate: Optional[float] = Field(None, ge=0, le=100, description="数据采样率（0-100，NULL表示不采样）")
    evaluation_metrics: List[EvaluationPromptMetricConfig] = Field(..., min_length=1, description="评估指标配置列表（使用EvaluationPromptMetricConfig结构，与现有评估任务保持一致）")
    
    @model_validator(mode='after')
    def validate_relations(self):
        """验证评估类型和关联关系的一致性"""
        if self.evaluation_type == EvaluationType.SINGLE:
            if len(self.dataset_model_relations) != 1:
                raise ValueError("单个评估时必须提供且仅提供1个dataset_model_relations")
        elif self.evaluation_type == EvaluationType.COMPARISON:
            if len(self.dataset_model_relations) < 2:
                raise ValueError("对比评估时必须提供至少2个dataset_model_relations")
        return self
```

**注意：**
- `evaluation_metrics` 使用 `EvaluationPromptMetricConfig` 结构，与现有评估任务保持一致
- `EvaluationPromptMetricConfig` 包含：`name`、`description`、`system_metric_id`（可选）、`metrics_mapping`（可选）、`score_min`、`score_max`、`score_definitions`

### 3.2 ManualEvaluationItemResponse

```python
class AnnotationInfo(BaseModel):
    """标注信息"""
    status: str = Field(..., description="状态：pending待评估, completed已完成")
    metric_scores: Optional[Union[Dict[str, float], Dict[str, Dict[str, float]]]] = Field(
        None, 
        description="指标得分（单个评估时：{\"指标名称\": 分数}，对比评估时：{\"模型名称\": {\"指标名称\": 分数}}）"
    )
    annotated_at: Optional[datetime] = Field(None, description="标注时间")
    annotated_by: Optional[str] = Field(None, description="标注人")

class ManualEvaluationItemResponse(BaseModel):
    """人工评估项响应（从JSONL文件读取）"""
    item_index: int = Field(..., description="评估项序号（从1开始）")
    file_name: Optional[str] = Field(None, description="文件名（图像理解时使用）")
    image_url: Optional[str] = Field(None, description="图片URL（图像理解时使用）")
    text_description: Optional[str] = Field(None, description="文本描述（图像理解时使用）")
    system: Optional[str] = Field(None, description="System指令（文本评估时使用）")
    prompt: str = Field(..., description="Prompt内容")
    standard_response: Optional[str] = Field(None, description="标准回答")
    model_response: Optional[str] = Field(None, description="模型回答/预测（单个评估时）")
    model_responses: Optional[List[str]] = Field(None, description="模型回答列表（对比评估时）")
    evaluated_model_id: Optional[int] = Field(None, description="待评估模型/服务ID（单个评估时）")
    evaluated_model_name: Optional[str] = Field(None, description="待评估模型/服务名称（单个评估时）")
    evaluated_model_ids: Optional[List[int]] = Field(None, description="待评估模型/服务ID列表（对比评估时）")
    evaluated_model_names: Optional[List[str]] = Field(None, description="待评估模型/服务名称列表（对比评估时）")
    annotation: AnnotationInfo = Field(..., description="标注信息")
```

### 3.3 ManualEvaluationItemBatchUpdate

```python
class ManualEvaluationItemUpdate(BaseModel):
    """单个评估项更新请求"""
    item_index: int = Field(..., description="评估项序号（从1开始）")
    metric_scores: Union[Dict[str, float], Dict[str, Dict[str, float]]] = Field(
        ..., 
        description="指标得分（单个评估时：{\"指标名称\": 分数}，对比评估时：{\"模型名称\": {\"指标名称\": 分数}}）"
    )

class ManualEvaluationItemBatchUpdate(BaseModel):
    """批量更新人工评估项评分请求"""
    items: List[ManualEvaluationItemUpdate] = Field(..., min_length=1, description="评估项更新列表")
```

### 3.4 评估报告响应（共用）

**设计说明：**
人工评估与模型评估共用 `EvaluationReportResponse` 响应模型，通过 `evaluation_method` 字段区分评估方法。

**响应模型：**
```python
class EvaluationReportResponse(BaseModel):
    """评估报告响应模型（人工评估和模型评估共用）"""
    evaluation_task_id: int = Field(..., description="关联评估任务ID")
    evaluation_type: EvaluationType = Field(..., description="评估类型")
    model_reports: List[ModelReportData] = Field(..., description="每个模型的报告数据列表")

class ModelReportData(BaseModel):
    """单个模型的报告数据"""
    model_id: int = Field(..., description="待评估模型/服务ID")
    model_name: str = Field(..., description="待评估模型/服务名称")
    evaluation_method: EvaluationMethod = Field(..., description="评估方法（referee/basic_metric/manual）")
    aggregative_metrics: List[AggregativeMetric] = Field(..., min_length=1, description="聚合指标数组，包含不同计算方式的指标汇总")
    comparison_data: Optional[ComparisonData] = Field(None, description="对比报告数据（对比评估时使用）")

class AggregativeMetric(BaseModel):
    """聚合指标"""
    calculation_method: CalculationMethod = Field(..., description="计算方式：average平均值, max最大值, min最小值")
    metric_summary: Dict[str, ModelMetricSummary] = Field(..., description="各指标的汇总分数，格式：{\"指标名称\": ModelMetricSummary对象}")

class ModelMetricSummary(BaseModel):
    """模型指标汇总"""
    score: float = Field(..., description="当前分数")
    percentage_score: Optional[float] = Field(None, description="百分比分数（当前分数 / 最大分数 * 100）")
    max_score: Optional[float] = Field(None, description="最大分数")
    min_score: Optional[float] = Field(None, description="最小分数")
```

## 四、错误码定义

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| MANUAL_EVAL_TASK_NOT_FOUND | 404 | 人工评估任务不存在 |
| MANUAL_EVAL_ITEM_NOT_FOUND | 404 | 评估项不存在 |
| MANUAL_EVAL_TASK_NAME_DUPLICATE | 409 | 任务名称重复 |
| MANUAL_EVAL_METRIC_INVALID | 400 | 评估指标配置无效 |
| MANUAL_EVAL_SCORE_OUT_OF_RANGE | 400 | 评分超出范围 |
| MANUAL_EVAL_TASK_STATUS_INVALID | 400 | 任务状态不允许此操作 |
| MANUAL_EVAL_SAMPLING_RATE_INVALID | 400 | 采样率无效（超出0-100范围） |

## 五、接口调用示例

### 5.1 完整流程示例

#### 步骤1：创建人工评估任务
```bash
curl -X POST "http://api.example.com/api/v1/manual-evaluation-tasks/project/1/create" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "文本模型人工评估_20250115",
    "description": "评估文本生成模型的表现",
    "evaluation_type": "single",
    "evaluation_category": "text",
    "data_source": "existing",
    "inference_result_dataset_id": 1,
    "evaluated_model_id": 101,
    "evaluated_model_name": "qwen3-0.6B-sft1-V1",
    "sampling_rate": 50.0,
    "evaluation_metrics": [
      {
        "metric_name": "准确性",
        "description": "评估模型回答的准确性",
        "score_min": 0,
        "score_max": 10,
        "score_definitions": "0-3分：不准确；4-6分：部分准确；7-10分：完全准确"
      },
      {
        "metric_name": "丰富度",
        "description": "评估模型回答的内容丰富度",
        "score_min": 0,
        "score_max": 10,
        "score_definitions": "0-3分：内容简单；4-6分：内容一般；7-10分：内容丰富"
      }
    ]
  }'
```

#### 步骤2：查询评估项列表
```bash
curl -X GET "http://api.example.com/api/v1/manual-evaluation-tasks/project/1/task/1/items?status=pending&page=1&size=10" \
  -H "Authorization: Bearer {token}"
```

#### 步骤3：更新评估项评分
```bash
curl -X PATCH "http://api.example.com/api/v1/manual-evaluation-tasks/project/1/task/1/item/1" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "metric_scores": {
      "准确性": 8,
      "丰富度": 7
    }
  }'
```

#### 步骤4：查询评估报告
```bash
curl -X GET "http://api.example.com/api/v1/evaluation-tasks/project/1/task/1/report?evaluation_method=manual&calculation_method=average" \
  -H "Authorization: Bearer {token}"
```

#### 步骤5：下载评估结果
```bash
curl -X GET "http://api.example.com/api/v1/manual-evaluation-tasks/project/1/task/1/download?format=excel&status=completed" \
  -H "Authorization: Bearer {token}" \
  -o "评估结果.xlsx"
```

## 六、注意事项

### 6.1 数据采样

- 采样率范围：0-100，NULL表示不采样（使用全部数据）
- 采样算法：使用随机采样，保证采样的随机性
- 采样结果：采样后的数据会持久化，不会每次查询时重新采样

### 6.2 评分验证

- 评分必须在指标配置的 `score_min` 和 `score_max` 范围内
- 支持小数评分（如 8.5），但前端通常使用整数
- 对比评估时，需要为每个模型分别评分

### 6.3 任务状态流转

```
created -> annotating -> completed
  ↓          ↓
failed    (可以回退到created重新开始)
```

- `created`：任务已创建，评估项已生成，等待开始标注
- `annotating`：正在标注中（至少有一个评估项被标注）
- `completed`：所有评估项都已完成标注
- `failed`：任务创建失败

### 6.4 进度计算

```
progress = (completed_items / total_items) * 100
```

- 当 `completed_items` 从 0 变为 1 时，任务状态从 `created` 变为 `annotating`
- 当 `completed_items == total_items` 时，任务状态变为 `completed`

### 6.5 对比评估的评分格式

对比评估时，`metric_scores` 的格式为：
```json
{
  "模型名称1": {
    "指标名称1": 分数1,
    "指标名称2": 分数2
  },
  "模型名称2": {
    "指标名称1": 分数1,
    "指标名称2": 分数2
  }
}
```

### 6.6 图像理解评估的特殊字段

- `file_name`：图像文件名
- `image_url`：图像在JuiceFS中的URL
- `text_description`：图像的文本描述（用于评估模型生成的描述是否准确）

### 6.7 文本评估的特殊字段

- `system`：System指令
- `prompt`：用户Prompt
- `standard_response`：标准回答（可选）
- `model_response`：模型回答

