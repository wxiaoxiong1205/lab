# 评估任务功能设计文档

## 一、需求分析

根据原型图，评估任务功能包括：

### 1.1 核心功能
- **创建评估任务**：支持单个评估和对比评估
- **评估数据来源**：已有推理结果集 / 新建推理结果集
- **评估方法**：
  - **裁判员评估**：使用裁判模型进行评估，需要配置Prompt、评估指标、内容字段
  - **基础指标评估**：使用系统指标（准确率、F1、ROUGE-1等）进行评估
- **评估结果展示**：评估报告（雷达图、柱状图、汇总数据）、评估详情（明细数据）、任务日志
- **任务管理**：列表查询、详情查看、克隆、删除、重新评估、下载

### 1.2 数据模型

#### 评估任务（EvaluationTask）
- 基本信息：名称、描述、项目ID
- 评估类型：单个评估 / 对比评估
- 评估数据来源：已有推理结果集 / 新建推理结果集
- 推理结果集ID列表（支持多个，对比评估时使用）
- 待评估模型/服务ID列表（支持多个，对比评估时使用）
- 评估方法：裁判员评估 / 基础指标评估
- 裁判模型/服务ID（裁判员评估时使用）
- 评估Prompt配置（JSON）：角色、评估指标、内容字段、输出格式等
- 基础指标配置（JSON）：指标列表、停用词等
- 状态、进度、K8s UUID、Celery任务ID

#### 评估结果（EvaluationResult）
**注意：评估结果明细存储在JuiceFS中，不存储在数据库表中**
- 文件路径存储在`evaluation_tasks.result_file_path`字段中
- 文件格式：JSONL（每行一个JSON对象）
- 数据结构：
  - 关联评估任务ID
  - 关联推理结果集ID
  - 关联待评估模型/服务ID
  - Prompt、Standard Response、Model Response
  - 各指标的分数和打分原因（JSON）
  - 历史模型回答（JSON，存储多轮回答）

#### 评估报告（EvaluationReport）
- 关联评估任务ID
- 关联待评估模型/服务ID（单个评估时一个，对比评估时多个）
- 计算方式（平均值等）
- 各指标的汇总分数（JSON）
- 对比报告数据（JSON，对比评估时使用：胜次数、负次数、和次数、胜率等）

## 二、数据库表设计

### 2.1 evaluation_tasks（评估任务表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT | 主键ID |
| name | VARCHAR(100) | 任务名称 |
| description | VARCHAR(500) | 任务描述 |
| project_id | INT | 关联项目ID |
| version | VARCHAR(50) | 任务版本号（默认v1，重新评估时自动递增为v2、v3等） |
| parent_task_id | INT | 父任务ID（重新评估时关联原始任务ID，首次创建为NULL） |
| evaluation_type | VARCHAR(20) | 评估类型：single单个评估, comparison对比评估 |
| data_source | VARCHAR(20) | 评估数据来源：existing已有推理结果集, new新建推理结果集 |
| evaluation_method | VARCHAR(20) | 评估方法：referee裁判员评估, basic_metric基础指标评估 |
| referee_model_id | INT | 裁判模型/服务ID（裁判员评估时使用） |
| referee_model_name | VARCHAR(200) | 裁判模型/服务名称 |
| evaluation_prompt_config | JSON | 评估Prompt配置（裁判员评估时使用） |
| basic_metric_config | JSON | 基础指标配置（基础指标评估时使用） |
| status | VARCHAR(50) | 状态：created已创建, processing处理中, completed已完成, failed失败 |
| progress | INT | 进度(0-100) |
| lab_k8s_uuid | VARCHAR(100) | 自定义k8s uuid |
| celery_task_id | VARCHAR(100) | Celery任务ID |
| result_file_path | VARCHAR(500) | 评估结果明细文件路径（存储在JuiceFS中） |
| started_at | DATETIME | 开始时间 |
| finished_at | DATETIME | 完成时间 |
| error_message | TEXT | 错误信息 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| created_id | BIGINT | 创建者用户ID |
| created_by | VARCHAR(100) | 创建者用户名称 |
| tenant_id | VARCHAR(32) | 租户ID |

**索引：**
- idx_evaluation_tasks_project: (project_id)
- idx_evaluation_tasks_status: (status)
- idx_evaluation_tasks_type: (evaluation_type)
- idx_evaluation_tasks_method: (evaluation_method)
- idx_evaluation_tasks_parent: (parent_task_id)
- idx_evaluation_tasks_name_version: (name, version, tenant_id)

**注意：** 
- 推理结果集和待评估模型的对应关系通过关联表 `evaluation_task_dataset_model_relation` 来明确表示，不再使用JSON数组字段。
- 版本管理：首次创建任务时，`version` 默认为 `v1`，`parent_task_id` 为 `NULL`。重新评估时，会创建新版本（v2、v3等），并将原始任务的ID设置为 `parent_task_id`，这样可以追溯评估历史。

### 2.2 evaluation_task_dataset_model_relation（评估任务-推理结果集-待评估模型关联表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT | 主键ID |
| evaluation_task_id | INT | 关联评估任务ID |
| inference_result_dataset_id | INT | 关联推理结果集ID |
| inference_result_dataset_name | VARCHAR(100) | 推理结果集名称（冗余字段，便于查询） |
| evaluated_model_id | INT | 待评估模型/服务ID |
| evaluated_model_name | VARCHAR(200) | 待评估模型/服务名称（冗余字段，便于查询） |
| sort_order | INT | 排序顺序（用于对比评估时确定显示顺序） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| tenant_id | VARCHAR(32) | 租户ID |

**索引：**
- idx_evaluation_task_dataset_model_task: (evaluation_task_id)
- idx_evaluation_task_dataset_model_dataset: (inference_result_dataset_id)
- idx_evaluation_task_dataset_model_model: (evaluated_model_id)
- idx_evaluation_task_dataset_model_task_dataset: (evaluation_task_id, inference_result_dataset_id)
- idx_evaluation_task_dataset_model_task_model: (evaluation_task_id, evaluated_model_id)
- uk_evaluation_task_dataset_model: (evaluation_task_id, inference_result_dataset_id, evaluated_model_id, tenant_id) - 联合唯一约束

**设计说明：**
- 此表用于明确表示评估任务中推理结果集与待评估模型的对应关系
- 支持多对多关系：一个评估任务可以包含多个推理结果集和多个待评估模型的组合
- 在对比评估场景中，可以明确表示：推理结果集1对应模型1，推理结果集2对应模型2
- `sort_order` 字段用于控制对比评估时的显示顺序
- 冗余字段 `inference_result_dataset_name` 和 `evaluated_model_name` 便于查询，避免频繁JOIN操作

**evaluation_prompt_config JSON结构：**
```json
{
  "role": "请作为公正的裁判...",
  "metrics": [
    {
      "name": "语义连贯性",
      "description": "指标说明",
      "score_range": "0-10",
      "is_system_metric": true,
      "system_metric_id": 1
    }
  ],
  "content_fields": ["Standard Response", "Model Response"],
  "prompt_template": "# 角色\n...\n# 评估指标\n...\n# 内容\n...\n# 输出格式\n..."
}
```

**basic_metric_config JSON结构：**
```json
{
  "metrics": ["准确率", "F1", "ROUGE-1", "ROUGE-2", "ROUGE-L", "BLEU-4", "格式遵从性", "语义相似度"],
  "stop_words": "jfs://evaluation/stop_words/stop_words_20250828.txt"
}
```

### 2.3 评估结果明细存储（JuiceFS）

**注意：评估结果明细不存储在数据库表中，而是存储在JuiceFS中**

- **文件路径**：存储在`evaluation_tasks.result_file_path`字段中
- **文件格式**：JSONL（每行一个JSON对象）
- **文件结构示例**：
```jsonl
{"evaluation_task_id": 1, "inference_result_dataset_id": 1, "inference_result_dataset_name": "问答推理结果-V1", "evaluated_model_id": 101, "evaluated_model_name": "qwen3-06B-sft1-V1", "prompt": "你是一名专业裁判...", "standard_response": "标准回答内容", "model_response": "模型回答内容", "metric_scores": {"指标1": {"score": 7, "reason": "打分原因"}, "指标2": {"score": 8, "reason": "打分原因"}}, "historical_responses": [{"round": 1, "response": "模型回答内容1"}]}
{"evaluation_task_id": 1, "inference_result_dataset_id": 1, "evaluated_model_id": 101, "prompt": "...", "standard_response": "...", "model_response": "...", "metric_scores": {...}}
```

**JuiceFS文件中的JSONL格式示例：**
```jsonl
{"evaluation_task_id": 1, "inference_result_dataset_id": 1, "inference_result_dataset_name": "问答推理结果-V1", "evaluated_model_id": 101, "evaluated_model_name": "qwen3-06B-sft1-V1", "system_prompt": "你是一个专业的新闻摘要撰写助手,擅长使用简洁明了的语言来提炼核心信息。", "prompt": "据台湾《旺报》报道,大陆游客赴台自由行第五批城市有望在今年底前宣布并上路。新开放城市预计在10个左右,海...", "standard_response": "大陆游客赴台自由行有望新增海口", "model_response": "大陆游客赴台自由行有望新增海口,预计10个左右", "metrics": [{"name": "指标1", "score": 7, "reason": "该回答准确满足要求,对摘要的需求描述理解清晰。"}, {"name": "指标2", "score": 6, "reason": "该回答准确满足要求,对摘要的需求描述理解清晰。"}], "historical_responses": [{"round": 1, "response": "模型回答内容1"}, {"round": 2, "response": "模型回答内容2"}]}
{"evaluation_task_id": 1, "inference_result_dataset_id": 1, "evaluated_model_id": 101, "system_prompt": "...", "prompt": "...", "standard_response": "...", "model_response": "...", "metrics": [...]}
```

**metrics JSON结构（在JuiceFS文件中）：**
```json
[
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
]
```

**historical_responses JSON结构（在JuiceFS文件中）：**
```json
[
  {
    "round": 1,
    "response": "模型回答内容1"
  },
  {
    "round": 2,
    "response": "模型回答内容2"
  }
]
```

### 2.4 evaluation_reports（评估报告汇总表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT | 主键ID |
| evaluation_task_id | INT | 关联评估任务ID |
| evaluated_model_id | INT | 待评估模型/服务ID |
| evaluated_model_name | VARCHAR(200) | 待评估模型/服务名称 |
| calculation_method | VARCHAR(20) | 计算方式（兼容字段，已废弃，使用metric_summary中的aggregative_metrics） |
| metric_summary | JSON | 聚合指标数组，格式：[{\"calculation_method\": \"average\", \"metric_summary\": {...}}, ...] |
| comparison_data | JSON | 对比报告数据（对比评估时使用） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| tenant_id | VARCHAR(32) | 租户ID |

**索引：**
- idx_evaluation_reports_task: (evaluation_task_id)
- idx_evaluation_reports_model: (evaluated_model_id)

**metric_summary JSON结构（在evaluation_reports表中，聚合指标数组）：**
```json
[
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
]
```

**comparison_data JSON结构（对比评估时使用，在evaluation_reports表中）：**
```json
{
  "win_count": 9,
  "loss_count": 1,
  "tie_count": 5,
  "win_rate": 0.9,
  "loss_rate": 0.1,
  "tie_rate": 0.3333,
  "total_rounds": 15
}
```

**说明：**
- `win_count`, `loss_count`, `tie_count`：该模型与所有其他模型的汇总对比结果
- `win_rate`, `loss_rate`, `tie_rate`：基于汇总结果的胜率、负率、和率
- `total_rounds`：该模型参与的所有对比轮次总和

### 2.5 evaluation_metrics（评估指标表）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INT | 主键ID |
| name | VARCHAR(50) | 指标名称（如：准确率、F1、ROUGE-1等） |
| description | VARCHAR(500) | 指标说明 |
| metric_code | VARCHAR(50) | 指标代码（用于程序识别，如：accuracy、f1、rouge-1等），仅基础评估指标使用，可为NULL |
| metric_type | VARCHAR(20) | 指标类型：basic_metric基础评估指标, referee_system_metric裁判员评估系统指标 |
| score_range | VARCHAR(50) | 分值范围（如：0-10分、0-3分），仅裁判员系统指标使用，可为NULL |
| scenario | VARCHAR(100) | 评估场景（如：开放性问题），仅裁判员系统指标使用，可为NULL |
| sort_order | INT | 排序顺序（用于前端显示顺序） |
| is_enabled | TINYINT | 是否启用（1启用，0禁用） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| created_id | BIGINT | 创建者用户ID |
| created_by | VARCHAR(100) | 创建者用户名称 |
| tenant_id | VARCHAR(32) | 租户ID |

**索引：**
- idx_evaluation_metrics_code: (metric_code)
- idx_evaluation_metrics_enabled: (is_enabled)
- idx_evaluation_metrics_sort: (sort_order)
- idx_evaluation_metrics_type: (metric_type)
- idx_evaluation_metrics_scenario: (scenario)

**说明：**
- 评估指标表用于存储基础评估指标和裁判员评估系统指标
- **基础评估指标（metric_type=basic_metric）**：
  - 数据在系统初始化时预置，不提供增删改接口，只提供查询接口
  - 支持的基础指标包括：准确率、F1、ROUGE-1、Rouge-2、Rouge-L、BLEU-4、格式遵从性、语义相似度
  - 必须提供 `metric_code` 字段
- **裁判员评估系统指标（metric_type=referee_system_metric）**：
  - 支持增删改查接口
  - 必须提供 `score_range` 字段
  - `scenario` 字段可选，用于按场景筛选
  - 删除时会检查是否被评估任务使用，如果正在使用则无法删除
- 通过 `is_enabled` 字段控制指标的启用/禁用状态
- 通过 `sort_order` 字段控制前端显示顺序

## 三、API接口设计

### 3.1 评估任务管理

#### 3.1.1 创建评估任务
- **POST** `/api/v1/project/{project_id}/evaluation-tasks`
- **请求体**：`EvaluationTaskCreate`
- **响应**：`EvaluationTaskResponse`

#### 3.1.2 查询评估任务列表
- **GET** `/api/v1/project/{project_id}/evaluation-tasks`
- **查询参数**：
  - `page_num`: 页码
  - `page_size`: 每页数量
  - `status`: 状态筛选（可选）
  - `evaluation_type`: 评估类型筛选（可选）
  - `evaluation_method`: 评估方法筛选（可选）
- **响应**：`Page[EvaluationTaskSummaryResponse]`

#### 3.1.3 查询评估任务详情
- **GET** `/api/v1/project/{project_id}/evaluation-tasks/{task_id}`
- **响应**：`EvaluationTaskDetailResponse`

#### 3.1.4 查询评估任务版本列表
- **GET** `/api/v1/project/{project_id}/evaluation-tasks/name/{task_name}`
- **查询参数**：
  - `task_name`: 任务名称
- **响应**：`List[EvaluationTaskSummaryResponse]`（按版本号降序排列）

#### 3.1.5 克隆评估任务
- **POST** `/api/v1/project/{project_id}/evaluation-tasks/{task_id}/clone`
- **响应**：`EvaluationTaskResponse`

#### 3.1.6 删除评估任务
- **DELETE** `/api/v1/project/{project_id}/evaluation-tasks/{task_id}`
- **响应**：`{"message": "删除成功"}`

### 3.2 评估结果管理

#### 3.2.1 查询评估详情（明细数据）
- **GET** `/api/v1/project/{project_id}/evaluation-tasks/{task_id}/results`
- **查询参数**：
  - `page_num`: 页码
  - `page_size`: 每页数量
  - `model_id`: 模型ID筛选（可选，对比评估时使用）
  - `dataset_id`: 数据集ID筛选（可选）
- **响应**：`Page[EvaluationResultResponse]`

#### 3.2.2 查询评估报告
- **GET** `/api/v1/project/{project_id}/evaluation-tasks/{task_id}/report`
- **查询参数**：
  - `calculation_method`: 计算方式（可选，默认average）
  - `model_id`: 模型ID筛选（可选，对比评估时使用）
- **响应**：`EvaluationReportResponse`

#### 3.2.3 下载评估结果
- **GET** `/api/v1/project/{project_id}/evaluation-tasks/{task_id}/download`
- **查询参数**：
  - `format`: 下载格式（excel, csv, json）
  - `model_id`: 模型ID筛选（可选）
- **响应**：文件流

#### 3.2.4 重新评估
- **POST** `/api/v1/project/{project_id}/evaluation-tasks/{task_id}/re-evaluate`
- **响应**：`EvaluationTaskDetailResponse`（新创建的任务信息）

#### 3.2.5 创建或更新评估报告（跨服务调用）
- **POST** `/api/v1/evaluation-tasks/reports/create-or-update`
- **请求体**：`EvaluationReportCreate`
- **响应**：`204 No Content`
- **说明**：用于其他服务创建或更新评估报告的总览评估指标。如果报告已存在（根据evaluation_task_id和evaluated_model_id），则更新；如果不存在，则创建新报告。此接口为跨服务调用接口，不需要用户认证。`aggregative_metrics` 数组可以包含多种计算方式的结果（如 average、max、min 等）。

#### 3.2.6 更新评估报告（跨服务调用）
- **PATCH** `/api/v1/evaluation-tasks/reports/task/{evaluation_task_id}/model/{evaluated_model_id}`
- **请求体**：`EvaluationReportUpdate`
- **响应**：`204 No Content`
- **说明**：用于其他服务更新已存在的评估报告的总览评估指标。仅更新aggregative_metrics和comparison_data字段，其他字段保持不变。此接口为跨服务调用接口，不需要用户认证。如果报告不存在，将返回404错误。`aggregative_metrics` 数组可以包含多种计算方式的结果（如 average、max、min 等）。

### 3.3 任务日志

#### 3.3.1 查询任务日志
- **GET** `/api/v1/project/{project_id}/evaluation-tasks/{task_id}/logs`
- **查询参数**：
  - `page_num`: 页码
  - `page_size`: 每页数量
- **响应**：`Page[TaskLogResponse]`

#### 3.3.2 下载任务日志
- **GET** `/api/v1/project/{project_id}/evaluation-tasks/{task_id}/logs/download`
- **响应**：文件流

### 3.4 基础评估指标管理

#### 3.4.1 查询基础评估指标列表
- **GET** `/api/v1/evaluation-tasks/metrics/basic`
- **响应**：`List[BasicMetricResponse]`
- **说明**：基础评估指标是系统预定义的，只读，不提供增删改接口

### 3.5 裁判员评估系统指标管理

#### 3.5.1 查询系统指标列表
- **GET** `/api/v1/evaluation-tasks/metrics/system`
- **查询参数**：
  - `scenario`: 评估场景（可选，如：开放性问题）
- **响应**：`List[SystemMetricResponse]`

#### 3.5.2 查询系统指标详情
- **GET** `/api/v1/evaluation-tasks/metrics/system/{metric_id}`
- **路径参数**：
  - `metric_id`: 指标ID
- **响应**：`SystemMetricResponse`

#### 3.5.3 创建系统指标
- **POST** `/api/v1/evaluation-tasks/metrics/system`
- **请求体**：`SystemMetricCreate`
- **响应**：`SystemMetricResponse`

#### 3.5.4 更新系统指标
- **PUT** `/api/v1/evaluation-tasks/metrics/system/{metric_id}`
- **路径参数**：
  - `metric_id`: 指标ID
- **请求体**：`SystemMetricUpdate`
- **响应**：`SystemMetricResponse`

#### 3.5.5 删除系统指标
- **DELETE** `/api/v1/evaluation-tasks/metrics/system/{metric_id}`
- **路径参数**：
  - `metric_id`: 指标ID
- **响应**：`204 No Content`
- **说明**：如果指标正在被评估任务使用，将无法删除

## 四、Pydantic Schema设计

### 4.1 枚举类型

```python
class EvaluationType(str, Enum):
    SINGLE = "single"  # 单个评估
    COMPARISON = "comparison"  # 对比评估

class EvaluationDataSource(str, Enum):
    EXISTING = "existing"  # 已有推理结果集
    NEW = "new"  # 新建推理结果集

class EvaluationMethod(str, Enum):
    REFEREE = "referee"  # 裁判员评估
    BASIC_METRIC = "basic_metric"  # 基础指标评估

class CalculationMethod(str, Enum):
    AVERAGE = "average"  # 平均值
    MAX = "max"  # 最大值
    MIN = "min"  # 最小值
```

### 4.2 请求模型

```python
class EvaluationPromptMetricConfig(BaseModel):
    """评估Prompt指标配置"""
    name: str = Field(..., description="指标名称")
    description: Optional[str] = Field(None, description="指标说明")
    score_range: str = Field(..., description="指标分值范围（如：0-10）")
    is_system_metric: bool = Field(False, description="是否为系统指标")
    system_metric_id: Optional[int] = Field(None, description="系统指标ID（当is_system_metric为true时，关联evaluation_metrics表中的系统指标ID，用于前端回显）")

class EvaluationPromptConfig(BaseModel):
    """评估Prompt配置"""
    role: str = Field(..., description="裁判模型角色设置")
    metrics: List[EvaluationPromptMetricConfig] = Field(..., description="评估指标列表")
    content_fields: List[str] = Field(..., description="内容字段列表（如：Standard Response, Model Response）")
    prompt_template: str = Field(..., description="完整的Prompt模板")

class BasicMetricConfig(BaseModel):
    """基础指标配置
    
    支持的基础指标包括：
    - 准确率 (Accuracy)：用于评估模型正确执行给定任务的能力
    - F1：综合考虑模型精准率与召回率的调和平均值
    - ROUGE-1：基于单个词(unigram)的匹配程度
    - Rouge-2：基于两个连续词(bigram)的匹配程度
    - Rouge-L：通过计算最长公共子序列(LCS)评估语序与结构的相似性
    - BLEU-4：综合评估模型生成文本与参考文本在1至4元语法(n-gram)层面上的匹配程度
    - 格式遵从性 (Format Compliance)：检测模型输出是否严格遵循JSON格式规范
    - 语义相似度 (Semantic Similarity)：综合Exact Match与MAUVE两个维度，衡量模型输出与参考答案在字面与语义层面的一致性
    """
    metrics: List[str] = Field(..., min_length=1, description="指标列表（如：准确率、F1、ROUGE-1、Rouge-2、Rouge-L、BLEU-4、格式遵从性、语义相似度等），至少需要选择一个指标")
    stop_words: Optional[str] = Field(None, description="停用词文件在 JuiceFS 中的地址（jfs:// 格式），用于某些指标计算时过滤停用词。由于停用词列表可能很大，因此使用 JuiceFS 存储，文件格式为每行一个停用词")

class EvaluationTaskDatasetModelRelation(BaseModel):
    """评估任务-推理结果集-待评估模型关联项
    
    用于明确表示评估任务中推理结果集与待评估模型的对应关系。
    在对比评估场景中，每个元素表示一个"推理结果集-待评估模型"的对应关系。
    """
    inference_result_dataset_id: int = Field(..., description="推理结果集ID")
    evaluated_model_id: int = Field(..., description="待评估模型/服务ID")
    sort_order: int = Field(0, description="排序顺序（用于对比评估时确定显示顺序，0表示第一个，1表示第二个，以此类推）")

class EvaluationTaskCreate(BaseModel):
    """创建评估任务请求模型"""
    name: str = Field(..., max_length=100, description="任务名称")
    description: Optional[str] = Field(None, max_length=500, description="任务描述")
    evaluation_type: EvaluationType = Field(..., description="评估类型：single单个评估, comparison对比评估")
    data_source: EvaluationDataSource = Field(..., description="评估数据来源：existing已有推理结果集, new新建推理结果集")
    evaluation_method: EvaluationMethod = Field(..., description="评估方法：referee裁判员评估, basic_metric基础指标评估")
    
    # 推理结果集与待评估模型的对应关系（支持多个，对比评估时使用）
    dataset_model_relations: List[EvaluationTaskDatasetModelRelation] = Field(
        ..., 
        min_length=1, 
        description="推理结果集与待评估模型的对应关系列表，明确表示哪个推理结果集对应哪个待评估模型。单个评估至少需要1个，对比评估至少需要2个。对比评估时，推理结果集和模型不能重复。"
    )
    
    # 裁判员评估配置
    referee_model_id: Optional[int] = Field(None, description="裁判模型/服务ID（裁判员评估时使用）")
    evaluation_prompt_config: Optional[EvaluationPromptConfig] = Field(None, description="评估Prompt配置（裁判员评估时使用）")
    
    # 基础指标评估配置
    basic_metric_config: Optional[BasicMetricConfig] = Field(None, description="基础指标配置（基础指标评估时使用）")


class AggregativeMetric(BaseModel):
    """聚合指标数据模型"""
    calculation_method: CalculationMethod = Field(..., description="计算方式：average平均值, max最大值, min最小值")
    metric_summary: Dict[str, float] = Field(..., description="各指标的汇总分数，格式：{\"指标名称\": 分数}")

class EvaluationReportCreate(BaseModel):
    """创建评估报告请求模型（跨服务调用）"""
    evaluation_task_id: int = Field(..., description="关联评估任务ID")
    evaluated_model_id: int = Field(..., description="待评估模型/服务ID")
    evaluated_model_name: Optional[str] = Field(None, description="待评估模型/服务名称")
    aggregative_metrics: List[AggregativeMetric] = Field(..., min_length=1, description="聚合指标数组，包含不同计算方式的指标汇总")
    comparison_data: Optional[ComparisonData] = Field(None, description="对比报告数据（对比评估时使用）")


class EvaluationReportUpdate(BaseModel):
    """更新评估报告请求模型（跨服务调用）"""
    aggregative_metrics: Optional[List[AggregativeMetric]] = Field(None, min_length=1, description="聚合指标数组，包含不同计算方式的指标汇总")
    comparison_data: Optional[ComparisonData] = Field(None, description="对比报告数据（对比评估时使用）")
```

### 4.3 响应模型

```python
class EvaluationTaskSummaryResponse(BaseModelWithTimezone):
    """评估任务摘要响应模型"""
    id: int
    name: str
    version: str = Field(..., description="任务版本号（如：v1、v2、v3）")
    status: TaskStatus
    evaluation_type: EvaluationType
    evaluation_method: EvaluationMethod
    # 为了便于列表展示，可以保留这些字段，从关联表中聚合获取
    inference_result_dataset_names: List[str] = Field(..., description="推理结果集名称列表（从关联表聚合）")
    evaluated_model_names: List[str] = Field(..., description="待评估模型/服务名称列表（从关联表聚合）")
    created_by: Optional[str]
    created_at: datetime

class EvaluationTaskDetailResponse(BaseModelWithTimezone):
    """评估任务详情响应模型"""
    id: int
    name: str
    description: Optional[str]
    project_id: int
    version: str = Field(..., description="任务版本号（如：v1、v2、v3）")
    parent_task_id: Optional[int] = Field(None, description="父任务ID（重新评估时关联原始任务ID）")
    evaluation_type: EvaluationType
    data_source: EvaluationDataSource
    evaluation_method: EvaluationMethod
    dataset_model_relations: List[EvaluationTaskDatasetModelRelation] = Field(
        ..., 
        description="推理结果集与待评估模型的对应关系列表"
    )
    referee_model_id: Optional[int]
    referee_model_name: Optional[str]
    evaluation_prompt_config: Optional[EvaluationPromptConfig]
    basic_metric_config: Optional[BasicMetricConfig]
    status: TaskStatus
    progress: int
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    created_by: Optional[str]
    created_at: datetime

class MetricScoreItem(BaseModel):
    """指标分数项"""
    name: str = Field(..., description="指标名称（如：指标1、指标2）")
    score: float = Field(..., description="指标分数")
    reason: str = Field(..., description="打分原因")

class HistoricalResponseItem(BaseModel):
    """历史模型回答项"""
    round: int = Field(..., description="轮次")
    response: str = Field(..., description="模型回答内容")

class EvaluationResultResponse(BaseModel):
    """评估结果响应模型（从JuiceFS读取）"""
    serial_no: int = Field(..., description="序号")
    evaluation_task_id: int = Field(..., description="关联评估任务ID")
    inference_result_dataset_id: int = Field(..., description="关联推理结果集ID")
    inference_result_dataset_name: str = Field(..., description="推理结果集名称")
    evaluated_model_id: int = Field(..., description="待评估模型/服务ID")
    evaluated_model_name: str = Field(..., description="待评估模型/服务名称")
    system_prompt: Optional[str] = Field(None, description="系统提示（System）")
    prompt: str = Field(..., description="输入提示（Prompt）")
    standard_response: Optional[str] = Field(None, description="标准回答（Standard Response）")
    model_response: Optional[str] = Field(None, description="模型回答（Model Response）")
    metrics: List[MetricScoreItem] = Field(..., description="指标列表，每个指标包含名称、分数和打分原因")
    historical_responses: Optional[List[HistoricalResponseItem]] = Field(None, description="历史模型回答列表（多轮回答）")

class ModelMetricSummary(BaseModel):
    """模型指标汇总"""
    metric_name: str = Field(..., description="指标名称（如：语义连贯性、内容丰富度）")
    score: float = Field(..., description="指标分数")

class ComparisonData(BaseModel):
    """对比报告数据（对比评估时使用）"""
    win_count: int = Field(..., description="胜次数")
    loss_count: int = Field(..., description="负次数")
    tie_count: int = Field(..., description="和次数")
    win_rate: float = Field(..., description="胜率（0-1之间的小数）")
    loss_rate: float = Field(..., description="负率（0-1之间的小数）")
    tie_rate: float = Field(..., description="和率（0-1之间的小数）")
    total_rounds: int = Field(..., description="轮次（总对比次数）")

class AggregativeMetric(BaseModel):
    """聚合指标数据模型"""
    calculation_method: CalculationMethod = Field(..., description="计算方式：average平均值, max最大值, min最小值")
    metric_summary: Dict[str, float] = Field(..., description="各指标的汇总分数，格式：{\"指标名称\": 分数}")

class ModelReportData(BaseModel):
    """单个模型的报告数据"""
    model_id: int = Field(..., description="待评估模型/服务ID")
    model_name: str = Field(..., description="待评估模型/服务名称")
    aggregative_metrics: List[AggregativeMetric] = Field(..., min_length=1, description="聚合指标数组，包含不同计算方式的指标汇总")
    comparison_data: Optional[ComparisonData] = Field(None, description="对比报告数据（对比评估时使用）")

class EvaluationReportResponse(BaseModel):
    """评估报告响应模型"""
    evaluation_task_id: int = Field(..., description="关联评估任务ID")
    evaluation_type: EvaluationType = Field(..., description="评估类型")
    model_reports: List[ModelReportData] = Field(..., description="每个模型的报告数据列表")

class TaskLogResponse(BaseModel):
    """任务日志响应模型"""
    timestamp: str = Field(..., description="时间戳（格式：YYYY-MM-DD HH:MM:SS.mmm）")
    job_id: str = Field(..., description="Job ID")
    level: str = Field(..., description="日志级别（如：Info、Warning、Error）")
    message: str = Field(..., description="日志消息内容")

class SystemMetricResponse(BaseModel):
    """系统指标响应模型"""
    name: str = Field(..., description="指标名称")
    description: Optional[str] = Field(None, description="指标说明")
    score_range: str = Field(..., description="指标分值范围（如：0-10分、0-3分）")
    scenario: Optional[str] = Field(None, description="评估场景（如：开放性问题）")
```

## 五、实现要点

1. **评估任务创建流程**：
   - 如果选择"新建推理结果集"，需要先创建推理结果集，然后再创建评估任务
   - 如果选择"已有推理结果集"，直接关联现有的推理结果集
   - 创建评估任务时，`version` 默认为 `v1`，`parent_task_id` 为 `NULL`
   - 创建评估任务后，如果是异步执行，需要启动Celery任务

2. **重新评估流程**：
   - 重新评估时，不会覆盖原有任务，而是创建新版本的任务
   - 版本号自动递增：查询同一任务名称下的最大版本号，然后递增（v1 -> v2 -> v3）
   - 版本号格式：从 "v1" 开始，每次重新评估递增版本号（提取数字部分，加1，再拼接 "v" 前缀）
   - 新任务的 `parent_task_id` 设置为原始任务ID
   - 新任务会复制原始任务的配置（评估类型、评估方法、推理结果集与模型的对应关系、Prompt配置等）
   - 新任务的状态为 `created`，需要重新启动执行
   - 新任务会生成新的 `lab_k8s_uuid` 和 `result_file_path`（JuiceFS路径）

3. **评估结果生成**：
   - 裁判员评估：调用裁判模型API，传入Prompt和待评估数据，获取评估结果
   - 基础指标评估：使用系统指标计算函数，对推理结果进行指标计算
   - 评估结果明细以JSONL格式存储在JuiceFS中，文件路径保存在`evaluation_tasks.result_file_path`字段
   - 查询评估详情时，从JuiceFS读取文件内容，支持分页和筛选

4. **评估报告生成**：
   - 根据评估结果明细，按计算方式（平均值等）汇总各指标的分数
   - 对比评估时，需要计算模型之间的胜率、负率、和率

5. **任务状态管理**：
   - 参考training_tasks的实现，使用K8s StatusManager监听任务状态
   - 支持任务日志记录和查询

6. **评估报告管理（跨服务调用）**：
   - 提供创建或更新评估报告的接口，方便其他服务调用
   - `create_or_update_evaluation_report`：如果报告已存在则更新，不存在则创建
   - `update_evaluation_report`：仅更新已存在报告的aggregative_metrics和comparison_data字段
   - 报告的唯一性由`evaluation_task_id` + `evaluated_model_id` + `tenant_id`确定
   - aggregative_metrics格式：数组，每个元素包含calculation_method和metric_summary，例如：`[{"calculation_method": "average", "metric_summary": {"语义连贯性": 95.04, "内容丰富度": 99.83}}, ...]`
   - comparison_data仅在对比评估时使用，包含胜率、负率、和率等数据

