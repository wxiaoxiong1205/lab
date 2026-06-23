# 评估任务API接口设计文档

## 一、API接口列表

### 1.1 评估任务管理

#### 1.1.1 创建评估任务
```
POST /api/v1/project/{project_id}/evaluation-tasks
```

**路径参数：**
- `project_id` (int, required): 项目ID

**请求体：** `EvaluationTaskCreate`

**响应：** `EvaluationTaskResponse`

**示例请求（单个评估 - 已有推理结果集）：**
```json
{
  "name": "单个模型评估_20250828_103614",
  "description": "评估单个模型的表现",
  "evaluation_type": "single",
  "data_source": "existing",
  "evaluation_method": "referee",
  "dataset_model_relations": [
    {
      "inference_result_dataset_id": 1,
      "evaluated_model_id": 101,
      "sort_order": 0
    }
  ],
  "referee_model_id": 201,
  "evaluation_prompt_config": {
    "role": "请作为公正的裁判...",
    "metrics": [
      {
        "name": "语义连贯性",
        "description": "评估回答的语义连贯性",
        "score_range": "0-10",
        "is_system_metric": true,
        "system_metric_id": 1
      }
    ],
    "content_fields": ["Standard Response", "Model Response"],
    "prompt_template": "# 角色\n...\n# 评估指标\n..."
  }
}
```

**示例请求（单个评估 - 基础指标评估 - 已有推理结果集）：**
```json
{
  "name": "单个模型评估_基础指标_20250828_103614",
  "description": "使用基础指标评估单个模型的表现",
  "evaluation_type": "single",
  "data_source": "existing",
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

**示例请求（单个评估 - 基础指标评估 - 新建推理结果集）：**
```json
{
  "name": "单个模型评估_基础指标_20250828_103614",
  "description": "使用基础指标评估单个模型的表现",
  "evaluation_type": "single",
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
        "repetition_penalty": 1.0,
        "top_k": 50
      },
      "dataset_name": "qwen3-0.6B-sft-V1-推理结果",
      "dataset_description": "用于评估的推理结果集",
      "source_dataset_id": 1,
      "source_dataset_name": "问答测试集",
      "gpu_type": "NVIDIA",
      "gpu_model": "A100",
      "gpu_count": 1
    }
  ],
  "basic_metric_config": {
    "metrics": ["准确率", "F1", "ROUGE-1", "Rouge-2", "Rouge-L", "BLEU-4", "格式遵从性", "语义相似度"],
    "stop_words": "jfs://evaluation/stop_words/stop_words_20250828.txt"
  }
}
```

**示例请求（单个评估 - 新建推理结果集）：**
```json
{
  "name": "单个模型评估_20250828_103614",
  "description": "评估单个模型的表现",
  "evaluation_type": "single",
  "data_source": "new",
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
        "repetition_penalty": 1.0,
        "top_k": 50
      },
      "dataset_name": "qwen3-0.6B-sft-V1-推理结果",
      "dataset_description": "用于评估的推理结果集",
      "source_dataset_id": 1,
      "source_dataset_name": "问答测试集",
      "gpu_type": "NVIDIA",
      "gpu_model": "A100",
      "gpu_count": 1
    }
  ],
  "referee_model_id": 201,
  "evaluation_prompt_config": {
    "role": "请作为公正的裁判...",
    "metrics": [
      {
        "name": "语义连贯性",
        "description": "评估回答的语义连贯性",
        "score_range": "0-10",
        "is_system_metric": true,
        "system_metric_id": 1
      }
    ],
    "content_fields": ["Standard Response", "Model Response"],
    "prompt_template": "# 角色\n...\n# 评估指标\n..."
  }
}
```

**示例请求（对比评估 - 已有推理结果集）：**
```json
{
  "name": "对比评估_20250828_103614",
  "description": "对比多个模型的表现",
  "evaluation_type": "comparison",
  "data_source": "existing",
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
    },
    {
      "inference_result_dataset_id": 3,
      "evaluated_model_id": 103,
      "sort_order": 2
    }
  ],
  "referee_model_id": 201,
  "evaluation_prompt_config": {
    "role": "请作为公正的裁判...",
    "metrics": [
      {
        "name": "语义连贯性",
        "description": "评估回答的语义连贯性",
        "score_range": "0-10",
        "is_system_metric": true,
        "system_metric_id": 1
      },
      {
        "name": "内容丰富度",
        "description": "评估回答的内容丰富度",
        "score_range": "0-10",
        "is_system_metric": true,
        "system_metric_id": 2
      }
    ],
    "content_fields": ["Standard Response", "Model Response"],
    "prompt_template": "# 角色\n...\n# 评估指标\n..."
  }
}
```

**示例请求（对比评估 - 新建推理结果集）：**
```json
{
  "name": "对比评估_20250828_103614",
  "description": "对比多个模型的表现",
  "evaluation_type": "comparison",
  "data_source": "new",
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
        "repetition_penalty": 1.0,
        "top_k": 50
      },
      "dataset_name": "qwen3-0.6B-sft-V1-推理结果",
      "dataset_description": "用于评估的推理结果集",
      "source_dataset_id": 1,
      "source_dataset_name": "问答测试集",
      "gpu_type": "NVIDIA",
      "gpu_model": "A100",
      "gpu_count": 1
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
        "repetition_penalty": 1.0,
        "top_k": 50
      },
      "dataset_name": "qwen3-0.6B-sft-V2-推理结果",
      "dataset_description": "用于评估的推理结果集",
      "source_dataset_id": 1,
      "source_dataset_name": "问答测试集",
      "gpu_type": "NVIDIA",
      "gpu_model": "A100",
      "gpu_count": 1
    }
  ],
  "referee_model_id": 201,
  "evaluation_prompt_config": {
    "role": "请作为公正的裁判...",
    "metrics": [
      {
        "name": "语义连贯性",
        "description": "评估回答的语义连贯性",
        "score_range": "0-10",
        "is_system_metric": true,
        "system_metric_id": 1
      },
      {
        "name": "内容丰富度",
        "description": "评估回答的内容丰富度",
        "score_range": "0-10",
        "is_system_metric": true,
        "system_metric_id": 2
      }
    ],
    "content_fields": ["Standard Response", "Model Response"],
    "prompt_template": "# 角色\n...\n# 评估指标\n..."
  }
}
```

**重要说明：**

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
  - `evaluated_model_id`（必填）：待评估模型/服务ID
  - `evaluated_model_name`（可选）：待评估模型/服务名称
  - `sort_order`（可选）：排序顺序，默认0
  - **推理方式相关参数**：
    - `inference_method`（必填）：推理方式，`offline`（离线推理）或 `online`（在线推理）
    - **离线推理**需要：
      - `model_id`（必填）：待推理模型ID
      - `model_name`（可选）：待推理模型名称及版本
      - `gpu_type`（必填）：显卡类型，如"NVIDIA"
      - `gpu_model`（必填）：显卡型号，如"A100"
      - `gpu_count`（必填）：显卡数量，范围>=1
    - **在线推理**需要：
      - `online_service_id`（必填）：待推理服务ID
      - `online_service_name`（可选）：待推理服务名称及版本
  - **推理参数**：
    - `inference_params`（可选）：推理模型参数配置
      - `temperature`（可选）：温度参数，范围0.0-2.0
      - `top_p`（可选）：Top_p参数，范围0.0-1.0
      - `repetition_penalty`（可选）：重复惩罚参数，范围>=0.0
      - `top_k`（可选）：Top_k参数，范围>=1
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
    - `role`：裁判模型角色设置
    - `metrics`：评估指标列表（每个指标包含名称、说明、分值范围等）
    - `content_fields`：内容字段列表（如：Standard Response, Model Response）
    - `prompt_template`：完整的Prompt模板
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

**注意**：`referee` 和 `basic_metric` 是互斥的，只能选择其中一种评估方法。

### 创建流程说明
1. **data_source=existing**：直接使用已有推理结果集，创建评估任务
2. **data_source=new**：
   - 系统会先为每个 `dataset_model_relations` 元素创建推理结果集
   - 推理结果集创建成功后，使用其ID创建评估任务和关联关系
   - 如果推理结果集创建失败，整个评估任务创建也会失败

#### 1.1.2 查询评估任务列表
```
GET /api/v1/project/{project_id}/evaluation-tasks
```

**路径参数：**
- `project_id` (int, required): 项目ID

**查询参数：**
- `page_num` (int, default=1): 页码
- `page_size` (int, default=10): 每页数量
- `status` (str, optional): 状态筛选（created, processing, completed, failed）
- `evaluation_type` (str, optional): 评估类型筛选（single, comparison）
- `evaluation_method` (str, optional): 评估方法筛选（referee, basic_metric）

**响应：** `Page[EvaluationTaskSummaryResponse]`

**示例响应：**
```json
{
  "items": [
    {
      "id": 1,
      "name": "自动评估_20250828_103614",
      "version": "v1",
      "status": "completed",
      "evaluation_type": "comparison",
      "evaluation_method": "referee",
      "inference_result_dataset_names": ["问答推理结果-V1", "问答推理结果-V2"],
      "evaluated_model_names": ["qwen3-06B-sft1-V1", "qwen3-06B-sft1-V2"],
      "created_by": "zhangsan",
      "created_at": "2025-08-28T10:36:34"
    }
  ],
  "total": 1,
  "page": 1,
  "size": 10,
  "pages": 1
}
```

#### 1.1.3 查询评估任务详情
```
GET /api/v1/project/{project_id}/evaluation-tasks/{task_id}
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 评估任务ID

**响应：** `EvaluationTaskDetailResponse`

#### 1.1.4 查询评估任务版本列表
```
GET /api/v1/project/{project_id}/evaluation-tasks/name/{task_name}
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_name` (str, required): 评估任务名称

**响应：** `List[EvaluationTaskSummaryResponse]`（按版本号降序排列）

**说明：**
- 根据任务名称查询该任务的所有版本
- 返回结果按版本号降序排列（最新版本在前）
- 可以用于查看评估历史，追溯重新评估的记录

**示例响应：**
```json
[
  {
    "id": 3,
    "name": "自动评估_20250828_103614",
    "version": "v3",
    "parent_task_id": 2,
    "status": "completed",
    "evaluation_type": "comparison",
    "evaluation_method": "referee",
    "inference_result_dataset_names": ["问答推理结果-V1", "问答推理结果-V2"],
    "evaluated_model_names": ["qwen3-06B-sft1-V1", "qwen3-06B-sft1-V2"],
    "created_by": "zhangsan",
    "created_at": "2025-08-28T12:00:00"
  },
  {
    "id": 2,
    "name": "自动评估_20250828_103614",
    "version": "v2",
    "parent_task_id": 1,
    "status": "completed",
    "evaluation_type": "comparison",
    "evaluation_method": "referee",
    "inference_result_dataset_names": ["问答推理结果-V1", "问答推理结果-V2"],
    "evaluated_model_names": ["qwen3-06B-sft1-V1", "qwen3-06B-sft1-V2"],
    "created_by": "zhangsan",
    "created_at": "2025-08-28T11:00:00"
  },
  {
    "id": 1,
    "name": "自动评估_20250828_103614",
    "version": "v1",
    "parent_task_id": null,
    "status": "completed",
    "evaluation_type": "comparison",
    "evaluation_method": "referee",
    "inference_result_dataset_names": ["问答推理结果-V1", "问答推理结果-V2"],
    "evaluated_model_names": ["qwen3-06B-sft1-V1", "qwen3-06B-sft1-V2"],
    "created_by": "zhangsan",
    "created_at": "2025-08-28T10:36:34"
  }
]
```

#### 1.1.5 克隆评估任务
```
POST /api/v1/project/{project_id}/evaluation-tasks/{task_id}/clone
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 评估任务ID

**请求体（可选）：**
```json
{
  "name": "自动评估_20250828_103614_副本"
}
```

**响应：** `EvaluationTaskResponse`

#### 1.1.6 删除评估任务
```
DELETE /api/v1/project/{project_id}/evaluation-tasks/{task_id}
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 评估任务ID

**响应：**
```json
{
  "message": "删除成功"
}
```

### 1.2 评估结果管理

#### 1.2.1 查询评估详情（明细数据）
```
GET /api/v1/project/{project_id}/evaluation-tasks/{task_id}/results
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 评估任务ID

**查询参数：**
- `page_num` (int, default=1): 页码
- `page_size` (int, default=10): 每页数量
- `model_id` (int, optional): 模型ID筛选（对比评估时使用）
- `dataset_id` (int, optional): 数据集ID筛选

**响应：** `Page[EvaluationResultResponse]`

**说明：**
- 评估结果明细存储在JuiceFS中（JSONL格式），文件路径在`evaluation_tasks.result_file_path`字段
- 接口从JuiceFS读取文件内容，支持分页和筛选
- 文件格式：每行一个JSON对象，包含评估结果明细数据

**示例响应：**
```json
{
  "items": [
    {
      "serial_no": 1,
      "evaluation_task_id": 1,
      "inference_result_dataset_id": 1,
      "inference_result_dataset_name": "问答推理结果-V1",
      "evaluated_model_id": 101,
      "evaluated_model_name": "qwen3-06B-sft1-V1",
      "system_prompt": "你是一个专业的新闻摘要撰写助手,擅长使用简洁明了的语言来提炼核心信息。",
      "prompt": "据台湾《旺报》报道,大陆游客赴台自由行第五批城市有望在今年底前宣布并上路。新开放城市预计在10个左右,海...",
      "standard_response": "大陆游客赴台自由行有望新增海口",
      "model_response": "大陆游客赴台自由行有望新增海口,预计10个左右",
      "metrics": [
        {
          "name": "指标1",
          "score": 7,
          "reason": "该回答准确满足要求,对摘要的需求描述理解清晰。"
        },
        {
          "name": "指标2",
          "score": 6,
          "reason": "该回答准确满足要求,对摘要的需求描述理解清晰。"
        }
      ],
      "historical_responses": [
        {
          "round": 1,
          "response": "模型回答内容1"
        },
        {
          "round": 2,
          "response": "模型回答内容2"
        }
      ]
    }
  ],
  "total": 100,
  "page": 1,
  "size": 10,
  "pages": 10
}
```

#### 1.2.2 查询评估报告
```
GET /api/v1/project/{project_id}/evaluation-tasks/{task_id}/report
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 评估任务ID

**查询参数：**
- `calculation_method` (str, optional): 计算方式筛选（average, max, min），如果提供则只返回该计算方式的结果
- `model_id` (int, optional): 模型ID筛选（对比评估时使用）

**响应：** `EvaluationReportResponse`

**示例响应（单个评估 - 裁判员评估）：**
```json
{
  "evaluation_task_id": 1,
  "evaluation_type": "single",
  "model_reports": [
    {
      "model_id": 101,
      "model_name": "qwen3-06B-sft1-V1",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "语义连贯性": 95.04,
            "内容丰富度": 99.83,
            "内容相关性": 98.21,
            "创新表达力": 93.21,
            "语言准确性": 95.21
          }
        },
        {
          "calculation_method": "max",
          "metric_summary": {
            "语义连贯性": 98.5,
            "内容丰富度": 100.0,
            "内容相关性": 99.2,
            "创新表达力": 96.8,
            "语言准确性": 97.3
          }
        },
        {
          "calculation_method": "min",
          "metric_summary": {
            "语义连贯性": 91.2,
            "内容丰富度": 98.5,
            "内容相关性": 96.8,
            "创新表达力": 89.5,
            "语言准确性": 92.1
          }
        }
      ],
      "comparison_data": null
    }
  ]
}
```

**示例响应（单个评估 - 基础指标评估）：**
```json
{
  "evaluation_task_id": 2,
  "evaluation_type": "single",
  "model_reports": [
    {
      "model_id": 101,
      "model_name": "qwen3-06B-sft1-V1",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "准确率": 0.85,
            "F1": 0.82,
            "ROUGE-1": 0.78,
            "Rouge-2": 0.75,
            "Rouge-L": 0.77,
            "BLEU-4": 0.73
          }
        },
        {
          "calculation_method": "max",
          "metric_summary": {
            "准确率": 0.92,
            "F1": 0.89,
            "ROUGE-1": 0.85,
            "Rouge-2": 0.82,
            "Rouge-L": 0.84,
            "BLEU-4": 0.80
          }
        }
      ],
      "comparison_data": null
    }
  ]
}
```

**示例响应（对比评估 - 裁判员评估）：**
```json
{
  "evaluation_task_id": 3,
  "evaluation_type": "comparison",
  "model_reports": [
    {
      "model_id": 101,
      "model_name": "qwen3-06B-sft1-V1",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "语义连贯性": 95.04,
            "内容丰富度": 99.83,
            "内容相关性": 98.21
          }
        },
        {
          "calculation_method": "max",
          "metric_summary": {
            "语义连贯性": 98.5,
            "内容丰富度": 100.0,
            "内容相关性": 99.2
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
    },
    {
      "model_id": 102,
      "model_name": "qwen3-06B-sft1-V2",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "语义连贯性": 94.5,
            "内容丰富度": 98.2,
            "内容相关性": 97.8
          }
        },
        {
          "calculation_method": "max",
          "metric_summary": {
            "语义连贯性": 97.0,
            "内容丰富度": 99.5,
            "内容相关性": 98.8
          }
        }
      ],
      "comparison_data": {
        "win_count": 1,
        "loss_count": 9,
        "tie_count": 5,
        "win_rate": 0.1,
        "loss_rate": 0.9,
        "tie_rate": 0.3333,
        "total_rounds": 15
      }
    },
    {
      "model_id": 103,
      "model_name": "qwen3-06B-sft1-V3",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "语义连贯性": 96.2,
            "内容丰富度": 99.5,
            "内容相关性": 98.8
          }
        },
        {
          "calculation_method": "max",
          "metric_summary": {
            "语义连贯性": 99.0,
            "内容丰富度": 100.0,
            "内容相关性": 99.5
          }
        }
      ],
      "comparison_data": {
        "win_count": 5,
        "loss_count": 1,
        "tie_count": 4,
        "win_rate": 0.5,
        "loss_rate": 0.1,
        "tie_rate": 0.4,
        "total_rounds": 10
      }
    }
  ]
}
```

**示例响应（对比评估 - 基础指标评估）：**
```json
{
  "evaluation_task_id": 4,
  "evaluation_type": "comparison",
  "model_reports": [
    {
      "model_id": 101,
      "model_name": "qwen3-06B-sft1-V1",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "准确率": 0.85,
            "F1": 0.82,
            "ROUGE-1": 0.78,
            "Rouge-2": 0.75,
            "Rouge-L": 0.77,
            "BLEU-4": 0.73
          }
        },
        {
          "calculation_method": "max",
          "metric_summary": {
            "准确率": 0.92,
            "F1": 0.89,
            "ROUGE-1": 0.85,
            "Rouge-2": 0.82,
            "Rouge-L": 0.84,
            "BLEU-4": 0.80
          }
        }
      ],
      "comparison_data": {
        "win_count": 8,
        "loss_count": 2,
        "tie_count": 5,
        "win_rate": 0.533,
        "loss_rate": 0.133,
        "tie_rate": 0.333,
        "total_rounds": 15
      }
    },
    {
      "model_id": 102,
      "model_name": "qwen3-06B-sft1-V2",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "准确率": 0.82,
            "F1": 0.79,
            "ROUGE-1": 0.75,
            "Rouge-2": 0.72,
            "Rouge-L": 0.74,
            "BLEU-4": 0.70
          }
        },
        {
          "calculation_method": "max",
          "metric_summary": {
            "准确率": 0.89,
            "F1": 0.86,
            "ROUGE-1": 0.82,
            "Rouge-2": 0.79,
            "Rouge-L": 0.81,
            "BLEU-4": 0.77
          }
        }
      ],
      "comparison_data": {
        "win_count": 2,
        "loss_count": 8,
        "tie_count": 5,
        "win_rate": 0.133,
        "loss_rate": 0.533,
        "tie_rate": 0.333,
        "total_rounds": 15
      }
    },
    {
      "model_id": 103,
      "model_name": "qwen3-06B-sft1-V3",
      "aggregative_metrics": [
        {
          "calculation_method": "average",
          "metric_summary": {
            "准确率": 0.88,
            "F1": 0.85,
            "ROUGE-1": 0.81,
            "Rouge-2": 0.78,
            "Rouge-L": 0.80,
            "BLEU-4": 0.76
          }
        },
        {
          "calculation_method": "max",
          "metric_summary": {
            "准确率": 0.95,
            "F1": 0.92,
            "ROUGE-1": 0.88,
            "Rouge-2": 0.85,
            "Rouge-L": 0.87,
            "BLEU-4": 0.83
          }
        }
      ],
      "comparison_data": {
        "win_count": 5,
        "loss_count": 2,
        "tie_count": 2,
        "win_rate": 0.556,
        "loss_rate": 0.222,
        "tie_rate": 0.222,
        "total_rounds": 9
      }
    }
  ]
}
```

**重要说明：**
- **响应结构**：每个模型的报告包含 `aggregative_metrics` 数组，支持多个计算方式（average、max、min）
- **对比评估时**：`model_reports` 列表包含多个模型，每个模型都有自己的 `aggregative_metrics`（聚合指标数组）和 `comparison_data`（对比指标）
- **aggregative_metrics**：数组中的每个元素包含一个 `calculation_method`（计算方式）和对应的 `metric_summary`（指标汇总字典）
- **calculation_method 参数**：如果提供了该查询参数，则只返回该计算方式的结果；如果不提供，则返回所有计算方式的结果
- **comparison_data**：
  - `win_count`, `loss_count`, `tie_count`：该模型与所有其他模型的汇总对比结果
  - `win_rate`, `loss_rate`, `tie_rate`：基于汇总结果的胜率、负率、和率
  - `total_rounds`：该模型参与的所有对比轮次总和

#### 1.2.3 下载评估结果
```
GET /api/v1/project/{project_id}/evaluation-tasks/{task_id}/download
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 评估任务ID

**查询参数：**
- `format` (str, optional, default="excel"): 下载格式（excel, csv, json）
- `model_id` (int, optional): 模型ID筛选（对比评估时使用）

**响应：** 文件流（Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet 等）

**说明：**
- 从JuiceFS读取评估结果明细文件，转换为指定格式后返回
- 支持excel、csv、json三种格式

#### 1.2.4 创建或更新评估报告（跨服务调用）
```
POST /api/v1/evaluation-tasks/reports/create-or-update
```

**请求体：** `EvaluationReportCreate`

**说明：**
- 用于其他服务创建或更新评估报告的总览评估指标
- 如果报告已存在（根据evaluation_task_id和evaluated_model_id），则更新
- 如果不存在，则创建新报告
- 此接口为跨服务调用接口，不需要用户认证
- `aggregative_metrics` 数组可以包含多种计算方式的结果（如 average、max、min 等）

**请求示例：**
```json
{
  "evaluation_task_id": 1,
  "evaluated_model_id": 101,
  "evaluated_model_name": "qwen3-06B-sft1-V1",
  "aggregative_metrics": [
    {
      "calculation_method": "average",
      "metric_summary": {
        "语义连贯性": 95.04,
        "内容丰富度": 99.83,
        "内容相关性": 98.21,
        "创新表达力": 93.21,
        "语言准确性": 95.21
      }
    },
    {
      "calculation_method": "max",
      "metric_summary": {
        "语义连贯性": 98.5,
        "内容丰富度": 100.0,
        "内容相关性": 99.2,
        "创新表达力": 96.8,
        "语言准确性": 97.3
      }
    },
    {
      "calculation_method": "min",
      "metric_summary": {
        "语义连贯性": 91.2,
        "内容丰富度": 98.5,
        "内容相关性": 96.8,
        "创新表达力": 89.5,
        "语言准确性": 92.1
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

**响应：** `204 No Content`

#### 1.2.5 更新评估报告（跨服务调用）
```
PATCH /api/v1/evaluation-tasks/reports/task/{evaluation_task_id}/model/{evaluated_model_id}
```

**路径参数：**
- `evaluation_task_id` (int, required): 评估任务ID
- `evaluated_model_id` (int, required): 待评估模型/服务ID

**请求体：** `EvaluationReportUpdate`

**说明：**
- 用于其他服务更新已存在的评估报告的总览评估指标
- 仅更新 aggregative_metrics 和 comparison_data 字段，其他字段保持不变
- 此接口为跨服务调用接口，不需要用户认证
- 如果报告不存在，将返回404错误
- 可以只更新 aggregative_metrics 或 comparison_data 中的一个
- `aggregative_metrics` 数组可以包含多种计算方式的结果（如 average、max、min 等）

**请求示例：**
```json
{
  "aggregative_metrics": [
    {
      "calculation_method": "average",
      "metric_summary": {
        "语义连贯性": 96.5,
        "内容丰富度": 99.9,
        "内容相关性": 98.5,
        "创新表达力": 94.2,
        "语言准确性": 96.1
      }
    },
    {
      "calculation_method": "max",
      "metric_summary": {
        "语义连贯性": 99.0,
        "内容丰富度": 100.0,
        "内容相关性": 99.5,
        "创新表达力": 97.5,
        "语言准确性": 98.2
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

**响应：** `204 No Content`

#### 1.2.6 重新评估
```
POST /api/v1/project/{project_id}/evaluation-tasks/{task_id}/re-evaluate
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 评估任务ID（原始任务ID）

**说明：**
- 重新评估时会创建新版本的任务，不会覆盖原有任务
- 版本号自动递增：如果原始任务是 v1，新任务为 v2；如果原始任务是 v2，新任务为 v3
- 新任务的 `parent_task_id` 指向原始任务ID，用于追溯评估历史
- 新任务会复制原始任务的配置（评估类型、评估方法、推理结果集与模型的对应关系等）
- 新任务的状态为 `created`，需要重新启动执行

**响应：** `EvaluationTaskResponse`（新创建的任务信息）

**示例响应：**
```json
{
  "id": 2,
  "name": "自动评估_20250828_103614",
  "version": "v2",
  "parent_task_id": 1,
  "status": "created",
  "evaluation_type": "comparison",
  "evaluation_method": "referee",
  "dataset_model_relations": [
    {
      "inference_result_dataset_id": 1,
      "evaluated_model_id": 101,
      "sort_order": 0
    }
  ],
  "created_at": "2025-08-28T11:00:00"
}
```

### 1.3 任务日志

#### 1.3.1 查询任务日志
```
GET /api/v1/project/{project_id}/evaluation-tasks/{task_id}/logs
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 评估任务ID

**查询参数：**
- `page_num` (int, default=1): 页码
- `page_size` (int, default=100): 每页数量

**响应：** `Page[TaskLogResponse]`

**示例响应：**
```json
{
  "items": [
    {
      "timestamp": "2025-08-12 10:32:50.576",
      "job_id": "amj-7jpdcery747j",
      "level": "Info",
      "message": "EvalJob.BeforeExec init begin."
    },
    {
      "timestamp": "2025-08-12 10:32:50.727",
      "job_id": "amj-7jpdcery747j",
      "level": "Info",
      "message": "EvalJob.BeforeExec init done."
    },
    {
      "timestamp": "2025-08-12 10:32:50.779",
      "job_id": "amj-7jpdcery747j",
      "level": "Info",
      "message": "EvalJob.Exec write infer config file begin."
    }
  ],
  "total": 100,
  "page": 1,
  "size": 100,
  "pages": 1
}
```

#### 1.3.2 下载任务日志
```
GET /api/v1/project/{project_id}/evaluation-tasks/{task_id}/logs/download
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 评估任务ID

**响应：** 文件流（文本文件）

### 1.4 评估指标管理

#### 1.4.1 查询基础评估指标列表
```
GET /api/v1/evaluation-tasks/metrics/basic
```

**响应：** `List[BasicMetricResponse]`

**示例响应：**
```json
[
  {
    "id": 1,
    "name": "准确率",
    "description": "用于评估模型正确执行给定任务的能力，模型预测结果与评估集完全一致的样本占比，反映整体预测的正确性。",
    "metric_code": "accuracy",
    "sort_order": 1
  },
  {
    "id": 2,
    "name": "F1",
    "description": "综合考虑模型精准率与召回率的调和平均值，衡量模型在生成内容时的平衡性能，越高表示模型越稳健。",
    "metric_code": "f1",
    "sort_order": 2
  },
  {
    "id": 3,
    "name": "ROUGE-1",
    "description": "基于单个词(unigram)的匹配程度，计算模型生成文本与参考答案之间的词汇覆盖率，用于评估关键信息是否被提及。",
    "metric_code": "rouge-1",
    "sort_order": 3
  }
]
```

**说明：**
- 基础评估指标是系统预定义的，只读，不提供增删改接口
- 支持的基础指标包括：准确率、F1、ROUGE-1、Rouge-2、Rouge-L、BLEU-4、格式遵从性、语义相似度
- 返回结果按 `sort_order` 和创建时间排序

### 1.5 裁判员评估系统指标管理

#### 1.5.1 查询系统指标列表
```
GET /api/v1/evaluation-tasks/metrics/system
```

**查询参数：**
- `scenario` (str, optional): 评估场景（如：开放性问题）

**响应：** `List[SystemMetricResponse]`

**示例响应：**
```json
[
  {
    "id": 1,
    "name": "相关性",
    "description": "指标说明",
    "score_range": "0-3分",
    "scenario": "开放性问题",
    "sort_order": 1,
    "is_enabled": true,
    "created_at": "2025-01-15T10:00:00",
    "updated_at": "2025-01-15T10:00:00",
    "created_by": "zhangsan"
  },
  {
    "id": 2,
    "name": "准确性",
    "description": "指标说明",
    "score_range": "0-4分",
    "scenario": "开放性问题",
    "sort_order": 2,
    "is_enabled": true,
    "created_at": "2025-01-15T10:00:00",
    "updated_at": "2025-01-15T10:00:00",
    "created_by": "zhangsan"
  }
]
```

#### 1.5.2 查询系统指标详情
```
GET /api/v1/evaluation-tasks/metrics/system/{metric_id}
```

**路径参数：**
- `metric_id` (int, required): 指标ID

**响应：** `SystemMetricResponse`

**示例响应：**
```json
{
  "id": 1,
  "name": "相关性",
  "description": "指标说明",
  "score_range": "0-3分",
  "scenario": "开放性问题",
  "sort_order": 1,
  "is_enabled": true,
  "created_at": "2025-01-15T10:00:00",
  "updated_at": "2025-01-15T10:00:00",
  "created_by": "zhangsan"
}
```

#### 1.5.3 创建系统指标
```
POST /api/v1/evaluation-tasks/metrics/system
```

**请求体：** `SystemMetricCreate`

**响应：** `SystemMetricResponse`

**示例请求：**
```json
{
  "name": "语义连贯性",
  "description": "评估回答的语义连贯性",
  "score_range": "0-10分",
  "scenario": "开放性问题",
  "sort_order": 1,
  "is_enabled": true
}
```

**示例响应：**
```json
{
  "id": 3,
  "name": "语义连贯性",
  "description": "评估回答的语义连贯性",
  "score_range": "0-10分",
  "scenario": "开放性问题",
  "sort_order": 1,
  "is_enabled": true,
  "created_at": "2025-01-15T11:00:00",
  "updated_at": "2025-01-15T11:00:00",
  "created_by": "zhangsan"
}
```

#### 1.5.4 更新系统指标
```
PUT /api/v1/evaluation-tasks/metrics/system/{metric_id}
```

**路径参数：**
- `metric_id` (int, required): 指标ID

**请求体：** `SystemMetricUpdate`

**响应：** `SystemMetricResponse`

**示例请求：**
```json
{
  "name": "语义连贯性（更新）",
  "description": "更新后的指标说明",
  "score_range": "0-10分",
  "scenario": "开放性问题",
  "sort_order": 2,
  "is_enabled": true
}
```

**说明：**
- 所有字段都是可选的，只更新提供的字段
- 如果更新名称，系统会检查新名称是否与其他指标冲突

#### 1.5.5 删除系统指标
```
DELETE /api/v1/evaluation-tasks/metrics/system/{metric_id}
```

**路径参数：**
- `metric_id` (int, required): 指标ID

**响应：**
```json
{
  "message": "删除成功"
}
```

**说明：**
- 如果指标正在被评估任务使用，将无法删除，返回400错误
- 删除操作不可恢复

## 二、错误码定义

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| EVALUATION_TASK_NOT_FOUND | 404 | 评估任务不存在 |
| EVALUATION_TASK_ALREADY_EXISTS | 409 | 评估任务已存在 |
| INFERENCE_RESULT_DATASET_NOT_FOUND | 404 | 推理结果集不存在 |
| REFEREE_MODEL_NOT_FOUND | 404 | 裁判模型不存在 |
| EVALUATION_TASK_INVALID_STATUS | 400 | 评估任务状态无效 |
| EVALUATION_TASK_ALREADY_RUNNING | 409 | 评估任务正在运行中 |
| EVALUATION_RESULT_NOT_FOUND | 404 | 评估结果不存在 |

## 三、业务规则

1. **创建评估任务**：
   - 如果选择"新建推理结果集"，需要先创建推理结果集，然后再创建评估任务
   - 如果选择"已有推理结果集"，需要验证推理结果集是否存在且属于当前项目
   - **单个评估（single）**：
     - `dataset_model_relations` 至少需要1个元素
     - 验证推理结果集是否存在且属于当前项目
   - **对比评估（comparison）**：
     - `dataset_model_relations` 至少需要2个元素
     - 验证推理结果集不能重复（同一个推理结果集ID不能出现在多个关联关系中）
     - 验证模型不能重复（同一个待评估模型ID不能对应多个推理结果集）
     - 验证所有推理结果集是否存在且属于当前项目
   - **评估方法互斥性验证**：
     - `referee`（裁判员评估）和 `basic_metric`（基础指标评估）是互斥的，只能选择其中一种
     - 裁判员评估时：
       - 必须提供 `referee_model_id` 和 `evaluation_prompt_config`
       - 不能提供 `basic_metric_config`
     - 基础指标评估时：
       - 必须提供 `basic_metric_config`，且至少选择一个指标
       - 不能提供 `referee_model_id` 或 `evaluation_prompt_config`

2. **评估任务状态流转**：
   - `created` -> `processing` -> `completed` / `failed`
   - 只有`created`状态的任务可以删除
   - 只有`completed`或`failed`状态的任务可以重新评估

3. **评估结果生成**：
   - 评估结果明细数据存储在JuiceFS中（JSONL格式）
   - 评估报告汇总数据存储在`evaluation_reports`表中
   - 对比评估时，需要为每个模型生成独立的报告数据

4. **评估报告管理（跨服务调用）**：
   - 提供创建或更新评估报告的接口，方便其他服务调用
   - `POST /api/v1/evaluation-tasks/reports/create-or-update`：创建或更新报告（如果存在则更新，不存在则创建）
   - `PATCH /api/v1/evaluation-tasks/reports/task/{evaluation_task_id}/model/{evaluated_model_id}`：更新已存在的报告
   - 报告的唯一性由`evaluation_task_id` + `evaluated_model_id` + `tenant_id`确定
   - metric_summary格式：键为指标名称（字符串），值为分数（浮点数）
   - comparison_data仅在对比评估时使用，包含胜率、负率、和率等数据
   - 这两个接口为跨服务调用接口，不需要用户认证

5. **任务日志**：
   - 任务日志存储在Redis中（参考training_tasks的实现）
   - 支持实时查询和下载

