# 人工评估功能设计文档

## 设计说明

**核心设计决策：人工评估与模型评估共用数据表，标注数据存储在JSONL文件中**

人工评估功能与现有的模型评估（裁判员评估、基础指标评估）共用以下表：
- **evaluation_tasks**：评估任务表（共用，通过 `evaluation_method = "manual"` 区分）
- **evaluation_task_dataset_model_relation**：关联表（共用）
- **evaluation_reports**：评估报告表（共用，通过 `evaluation_method = "manual"` 区分）

**标注数据存储：**
- **不创建独立的评估项表**，所有标注数据直接存储在 JSONL 文件中（JuiceFS）
- **原因**：节省数据库存储空间，推理结果集数据量很大，存储在数据库中不合适
- **文件格式**：JSONL，每行包含原始数据和标注信息
- **性能考虑**：可以接受读取速度较慢，但需要提供分页和批量更新接口

**共用表的优势：**
1. **统一管理**：所有评估任务（模型评估、人工评估）在一个表中，便于统一查询和管理
2. **减少表数量**：不需要创建新的任务表和报告表，简化数据库结构
3. **统一接口**：可以统一查询所有类型的评估任务，减少API接口数量
4. **统一业务逻辑**：任务创建、状态管理、进度更新等逻辑可以复用
5. **数据一致性**：使用相同的数据结构和关联关系，保证数据一致性

**需要在现有表上添加的字段：**
- `evaluation_category`：评估类别（text/image）
- `sampling_rate`：数据采样率
- `total_items`：总评估项数
- `completed_items`：已完成评估项数

**需要扩展的枚举值：**
- `evaluation_method`：增加 `manual` 选项
- `status`：增加 `annotating` 状态（标注中）

## 一、需求分析

### 1.1 功能概述

人工评估功能允许评估人员手动对模型输出进行评分和标注，支持文本评估和图像理解评估两种场景。

### 1.2 核心功能

#### 1.2.1 评估任务管理
- **创建人工评估任务**：支持单个评估和对比评估
- **评估类型**：
  - **文本评估**：评估文本生成模型的表现
  - **图像理解评估**：评估图像理解模型的表现（图像描述、图像问答等）
- **评估数据来源**：已有推理结果集 / 新建推理结果集
- **数据采样率**：支持对推理结果集进行随机采样（0-100%）
- **评估指标配置**：自定义评估指标（指标名称、说明、分值范围、含义说明）

#### 1.2.2 人工标注
- **标注界面**：展示待评估数据（System、Prompt、标准回答、模型回答/预测）
- **评分功能**：为每个评估指标进行评分（使用滑块或输入框）
- **状态管理**：待评估、已完成
- **批量操作**：支持批量标注

#### 1.2.3 评估报告
- **评分维度雷达图**：展示各指标的得分情况
- **评分数据明细表**：展示各指标的具体得分
- **评分对比柱状图**：对比评估时展示多个模型的得分对比
- **计算方式**：平均值、最大值、最小值

#### 1.2.4 评估详情
- **明细列表**：展示所有评估项的详细信息
- **筛选功能**：按状态筛选（全部、已完成、待评估）
- **下载功能**：支持下载评估结果（Excel、CSV、JSON）

### 1.3 业务流程

```
1. 创建人工评估任务
   ├── 选择评估类型（文本/图像理解）
   ├── 选择评估类型（单个/对比）
   ├── 选择数据来源（已有/新建推理结果集）
   ├── 配置评估指标
   └── 创建任务

2. 人工标注
   ├── 查看待评估任务列表
   ├── 逐项进行评分
   ├── 保存评分结果
   └── 更新任务进度

3. 生成评估报告
   ├── 计算各指标的平均分
   ├── 生成雷达图、柱状图
   └── 展示评估报告

4. 查看评估详情
   ├── 查看所有评估项的明细
   ├── 筛选和搜索
   └── 下载评估结果
```

## 二、数据库表设计

### 2.1 共用评估任务表（evaluation_tasks）

**设计决策：**
人工评估与模型评估共用 `evaluation_tasks` 表，通过 `evaluation_method` 字段区分评估方法。这样可以：
1. 统一管理所有评估任务
2. 减少表数量，简化数据库结构
3. 统一查询接口，可以同时查询所有类型的评估任务
4. 统一业务逻辑处理，减少代码重复

**设计说明：**
人工评估与模型评估共用 `evaluation_tasks` 表，通过 `evaluation_method` 字段区分评估方法。人工评估时，`evaluation_method = "manual"`。

**需要在现有表中新增的字段：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| evaluation_category | VARCHAR(20) | 评估类别：text文本评估, image图像理解评估（人工评估时使用，模型评估时为NULL） |
| sampling_rate | DECIMAL(5,2) | 数据采样率（0-100，NULL表示不采样，人工评估时使用） |
| total_items | INT | 总评估项数（人工评估时使用，模型评估时为NULL） |
| completed_items | INT | 已完成评估项数（人工评估时使用，模型评估时为NULL） |

**扩展的字段说明：**

1. **evaluation_method** 字段扩展：
   - 现有值：`referee`（裁判员评估）、`basic_metric`（基础指标评估）、`all`（同时进行两种评估）
   - 新增值：`manual`（人工评估）

2. **status** 字段扩展：
   - 现有值：`created`（已创建）、`processing`（处理中）、`completed`（已完成）、`failed`（失败）
   - 新增值：`annotating`（标注中，人工评估时使用）

3. **evaluation_prompt_config** 字段（人工评估时使用）：
   - 人工评估时，使用 `evaluation_prompt_config` 存储评估指标配置
   - 格式与裁判员评估相同，但不需要 `prompt_template` 字段（人工评估不需要Prompt模板）
   - 只使用 `metrics` 字段，存储 `EvaluationPromptMetricConfig` 数组

**人工评估任务的数据特点：**
- `evaluation_method = "manual"`
- `evaluation_category` 不为空（text 或 image）
- `sampling_rate` 可能不为空（0-100）
- `total_items` 和 `completed_items` 不为空
- `referee_model_id`、`referee_type`、`graphics_card_resource`、`referee_inference_params` 为 NULL（人工评估不需要裁判模型）
- `basic_metric_config` 为 NULL（人工评估不使用基础指标）
- `lab_k8s_uuid`、`celery_task_id` 为 NULL（人工评估不需要K8s任务）
- `evaluation_prompt_config` 不为空，但只包含 `metrics` 字段，不包含 `prompt_template`

**评估指标配置（evaluation_prompt_config.metrics）JSON格式：**
```json
{
  "metrics": [
    {
      "name": "指令遵循性",
      "description": "评估生成的图片是否按照要求",
      "system_metric_id": null,
      "metrics_mapping": null,
      "score_min": 0,
      "score_max": 15,
      "score_definitions": "0-5分：完全不遵循；6-10分：部分遵循；11-15分：完全遵循"
    },
    {
      "name": "风格一致性",
      "description": "评估生成图片与要求的风格是否一致",
      "system_metric_id": null,
      "metrics_mapping": null,
      "score_min": 0,
      "score_max": 3,
      "score_definitions": "0分：不一致；1分：部分一致；2分：基本一致；3分：完全一致"
    }
  ]
}
```

**注意：**
- 推理结果集与待评估模型的对应关系通过关联表 `evaluation_task_dataset_model_relation` 来明确表示（共用现有关联表）。
- 单个评估时，关联表中只有1条记录；对比评估时，关联表中有2条或以上记录。

### 2.2 评估结果JSONL文件存储（JuiceFS）

**设计说明：**
人工评估与模型评估共用 `evaluation_reports` 表，通过 `evaluation_method` 字段区分评估方法。人工评估时，`evaluation_method = "manual"`。

**现有表结构已满足需求，无需新增字段。**

**人工评估报告的数据特点：**
- `evaluation_method = "manual"`
- `evaluation_task_id` 关联到 `evaluation_tasks` 表（`evaluation_method = "manual"` 的任务）
- 其他字段与模型评估报告相同

**各指标的汇总分数（metric_summary）JSON格式：**
```json
{
  "指令遵循性": 12.5,
  "风格一致性": 2.8
}
```

**对比报告数据（comparison_data）JSON格式：**
```json
{
  "win_count": 10,
  "loss_count": 1,
  "tie_count": 4,
  "win_rate": 0.667,
  "loss_rate": 0.067,
  "tie_rate": 0.267,
  "total_rounds": 15
}
```

## 三、数据模型设计（Schema）

### 3.1 创建人工评估任务请求

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
    evaluation_metrics: List[EvaluationPromptMetricConfig] = Field(..., min_length=1, description="评估指标配置列表（使用EvaluationPromptMetricConfig结构）")
    
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

**设计说明：**
人工评估任务创建请求可以复用 `EvaluationTaskCreate` 结构，但需要添加人工评估特有的字段。

**推荐方案：扩展 EvaluationTaskCreate**

在 `EvaluationTaskCreate` 中添加人工评估特有字段，通过 `evaluation_method = "manual"` 来标识：

```python
class EvaluationTaskCreate(BaseModel):
    """创建评估任务请求模型（支持模型评估和人工评估）"""
    # ... 现有字段 ...
    
    evaluation_method: EvaluationMethod = Field(..., description="评估方法：referee裁判员评估, basic_metric基础指标评估, all同时进行两种评估, manual人工评估")
    
    # 人工评估特有字段
    evaluation_category: Optional[str] = Field(None, description="评估类别：text文本评估, image图像理解评估（人工评估时必填）")
    sampling_rate: Optional[float] = Field(None, ge=0, le=100, description="数据采样率（0-100，NULL表示不采样，人工评估时使用）")
    
    # ... 其他现有字段 ...
    
    @model_validator(mode='after')
    def validate_evaluation_method(self):
        """验证评估方法的配置是否完整"""
        if self.evaluation_method == EvaluationMethod.MANUAL:
            # 人工评估：必须提供evaluation_category和evaluation_prompt_config（只包含metrics），不能提供referee_model_id和basic_metric_config
            if not self.evaluation_category:
                raise ValueError("人工评估需要提供evaluation_category（text或image）")
            if self.evaluation_category not in ["text", "image"]:
                raise ValueError("evaluation_category必须是text（文本评估）或image（图像理解评估）")
            if not self.evaluation_prompt_config:
                raise ValueError("人工评估需要提供evaluation_prompt_config（包含metrics）")
            if not self.evaluation_prompt_config.metrics or len(self.evaluation_prompt_config.metrics) == 0:
                raise ValueError("人工评估需要至少配置一个评估指标")
            if self.referee_model_id or self.basic_metric_config:
                raise ValueError("人工评估不能提供referee_model_id或basic_metric_config")
        # ... 其他验证逻辑 ...
        return self
```

**注意：**
- `evaluation_metrics` 使用 `EvaluationPromptMetricConfig` 结构，与现有评估任务保持一致
- `EvaluationPromptMetricConfig` 包含：`name`、`description`、`system_metric_id`（可选）、`metrics_mapping`（可选）、`score_min`、`score_max`、`score_definitions`
- 人工评估时，`evaluation_prompt_config` 只包含 `metrics` 字段，不包含 `prompt_template`

### 3.3 人工评估项响应

```python
class ManualEvaluationItemResponse(BaseModel):
    """人工评估项响应"""
    id: int
    task_id: int
    item_index: int
    file_name: Optional[str] = None
    image_url: Optional[str] = None
    text_description: Optional[str] = None
    system: Optional[str] = None
    prompt: str
    standard_response: Optional[str] = None
    model_response: Optional[str] = None
    model_responses: Optional[List[str]] = None  # 对比评估时
    evaluated_model_id: Optional[int] = None
    evaluated_model_name: Optional[str] = None
    evaluated_model_ids: Optional[List[int]] = None  # 对比评估时
    evaluated_model_names: Optional[List[str]] = None  # 对比评估时
    metric_scores: Optional[Dict[str, float]] = None
    status: str
    annotated_at: Optional[datetime] = None
    annotated_by: Optional[str] = None
```

### 3.4 更新评估项评分请求

```python
class ManualEvaluationItemUpdate(BaseModel):
    """更新人工评估项评分请求"""
    metric_scores: Dict[str, float] = Field(..., description="指标得分，格式：{\"指标名称\": 分数}")
```

### 3.5 人工评估报告响应

```python
class ManualEvaluationReportResponse(BaseModel):
    """人工评估报告响应"""
    task_id: int
    task_name: str
    evaluation_type: str
    evaluation_category: str
    calculation_method: str
    metric_summary: Dict[str, float] = Field(..., description="各指标的汇总分数")
    comparison_data: Optional[Dict[str, Any]] = Field(None, description="对比报告数据（对比评估时使用）")
    model_reports: Optional[List[ModelReportData]] = Field(None, description="各模型的报告数据（对比评估时）")
```

## 四、API接口设计

**接口前缀说明：**
- 人工评估任务管理、人工标注、评估详情：使用前缀 `/api/v1/manual-evaluation-tasks`
- 评估报告：使用前缀 `/api/v1/evaluation-tasks`（与模型评估共用接口）

### 4.1 人工评估任务管理

#### 4.1.1 创建人工评估任务
```
POST /api/v1/manual-evaluation-tasks/project/{project_id}/create
```

**路径参数：**
- `project_id` (int, required): 项目ID

**请求体：** `ManualEvaluationTaskCreate`

**响应：** `ManualEvaluationTaskDetailResponse`

**示例请求（文本评估 - 单个评估）：**
```json
{
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
}
```

**示例请求（图像理解评估 - 单个评估）：**
```json
{
  "name": "图像理解模型人工评估_20250115",
  "description": "评估图像理解模型的表现",
  "evaluation_type": "single",
  "evaluation_category": "image",
  "data_source": "existing",
  "inference_result_dataset_id": 2,
  "evaluated_model_id": 102,
  "evaluated_model_name": "image-model-v1",
  "sampling_rate": 30.0,
  "evaluation_metrics": [
    {
      "metric_name": "指令遵循性",
      "description": "评估生成的图片是否按照要求",
      "score_min": 0,
      "score_max": 15,
      "score_definitions": "0-5分：完全不遵循；6-10分：部分遵循；11-15分：完全遵循"
    },
    {
      "metric_name": "风格一致性",
      "description": "评估生成图片与要求的风格是否一致",
      "score_min": 0,
      "score_max": 3,
      "score_definitions": "0分：不一致；1分：部分一致；2分：基本一致；3分：完全一致"
    }
  ]
}
```

**示例请求（文本评估 - 对比评估）：**
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
}
```

#### 4.1.2 查询人工评估任务列表
```
GET /api/v1/manual-evaluation-tasks/project/{project_id}/list
```

**路径参数：**
- `project_id` (int, required): 项目ID

**查询参数：**
- `evaluation_category` (str, optional): 评估类别筛选（text/image）
- `evaluation_type` (str, optional): 评估类型筛选（single/comparison）
- `status` (str, optional): 状态筛选（created/annotating/completed）
- `page` (int, default=1): 页码
- `size` (int, default=10): 每页数量

**响应：** `Page[ManualEvaluationTaskSummaryResponse]`

#### 4.1.3 查询人工评估任务详情
```
GET /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 任务ID

**响应：** `ManualEvaluationTaskDetailResponse`

#### 4.1.4 删除人工评估任务
```
DELETE /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 任务ID

**响应：** 204 No Content

#### 4.1.5 克隆人工评估任务
```
POST /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}/clone
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 任务ID

**请求体：**
```json
{
  "name": "克隆的任务名称"
}
```

**响应：** `ManualEvaluationTaskDetailResponse`

### 4.2 人工标注

#### 4.2.1 查询评估项列表（用于标注）
```
GET /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}/items
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 任务ID

**查询参数：**
- `status` (str, optional): 状态筛选（pending/completed/all，默认all）
- `page` (int, default=1): 页码
- `size` (int, default=10): 每页数量

**响应：** `Page[ManualEvaluationItemResponse]`

#### 4.2.2 更新评估项评分
```
PATCH /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}/item/{item_id}
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 任务ID
- `item_id` (int, required): 评估项ID

**请求体：** `ManualEvaluationItemUpdate`

**响应：** `ManualEvaluationItemResponse`

**示例请求：**
```json
{
  "metric_scores": {
    "准确性": 8,
    "丰富度": 7
  }
}
```

#### 4.2.3 批量更新评估项评分
```
PATCH /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}/items/batch
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 任务ID

**请求体：**
```json
{
  "items": [
    {
      "item_id": 1,
      "metric_scores": {
        "准确性": 8,
        "丰富度": 7
      }
    },
    {
      "item_id": 2,
      "metric_scores": {
        "准确性": 9,
        "丰富度": 8
      }
    }
  ]
}
```

**响应：** 204 No Content

### 4.3 评估报告

#### 4.3.1 查询评估报告（共用接口）

**接口路径：**
```
GET /api/v1/evaluation-tasks/project/{project_id}/task/{task_id}/report
```

**接口描述：**
人工评估与模型评估共用此接口查询评估报告。通过 `evaluation_method` 参数区分评估方法。

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 任务ID

**查询参数：**
- `evaluation_method` (str, optional): 评估方法筛选（referee/basic_metric/manual），人工评估时传入 `manual`
- `calculation_method` (str, optional): 计算方式筛选（average/max/min），如果提供则只返回该计算方式的结果
- `model_id` (int, optional): 模型ID筛选（对比评估时使用）

**响应：** `EvaluationReportResponse`

**使用说明：**
- 人工评估任务查询报告时，需要在 `evaluation_method` 参数中传入 `manual`
- 报告数据从数据库 `evaluation_reports` 表查询（`evaluation_method = "manual"`）
- 响应格式与模型评估报告相同，包含 `aggregative_metrics` 和 `comparison_data`

**示例响应（单个评估）：**
```json
{
  "task_id": 1,
  "task_name": "文本模型人工评估_20250115",
  "evaluation_type": "single",
  "evaluation_category": "text",
  "calculation_method": "average",
  "metric_summary": {
    "准确性": 8.5,
    "丰富度": 7.8
  },
  "comparison_data": null,
  "model_reports": null
}
```

**示例响应（对比评估）：**
```json
{
  "task_id": 2,
  "task_name": "文本模型对比评估_20250115",
  "evaluation_type": "comparison",
  "evaluation_category": "text",
  "calculation_method": "average",
  "metric_summary": null,
  "comparison_data": {
    "win_count": 10,
    "loss_count": 1,
    "tie_count": 4,
    "win_rate": 0.667,
    "loss_rate": 0.067,
    "tie_rate": 0.267,
    "total_rounds": 15
  },
  "model_reports": [
    {
      "model_id": 101,
      "model_name": "qwen3-0.6B-sft1-V1",
      "metric_summary": {
        "准确性": 8.5,
        "丰富度": 7.8
      }
    },
    {
      "model_id": 102,
      "model_name": "qwen3-0.6B-sft1-V2",
      "metric_summary": {
        "准确性": 8.2,
        "丰富度": 8.0
      }
    }
  ]
}
```

### 4.4 评估详情

#### 4.4.1 查询评估详情列表
```
GET /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}/details
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 任务ID

**查询参数：**
- `status` (str, optional): 状态筛选（pending/completed/all，默认all）
- `page` (int, default=1): 页码
- `size` (int, default=10): 每页数量

**响应：** `Page[ManualEvaluationItemResponse]`

#### 4.4.2 下载评估结果
```
GET /api/v1/manual-evaluation-tasks/project/{project_id}/task/{task_id}/download
```

**路径参数：**
- `project_id` (int, required): 项目ID
- `task_id` (int, required): 任务ID

**查询参数：**
- `format` (str, default="excel"): 下载格式（excel/csv/json）
- `status` (str, optional): 状态筛选（pending/completed/all，默认all）

**响应：** 文件流（Excel/CSV/JSON）

## 五、业务逻辑设计

### 5.1 创建人工评估任务流程

```
1. 验证请求参数
   ├── 验证项目存在
   ├── 验证任务名称唯一性（租户+项目+名称）
   ├── 验证评估类型和类别
   └── 验证评估指标配置

2. 处理数据来源
   ├── 如果 data_source=existing
   │   ├── 验证推理结果集存在
   │   ├── 验证模型/服务存在
   │   └── 读取推理结果集数据
   └── 如果 data_source=new
       ├── 创建推理结果集（调用推理结果集服务）
       └── 获取推理结果集ID

3. 数据采样（如果设置了sampling_rate）
   ├── 从推理结果集中随机采样
   └── 生成采样后的数据列表

4. 生成JSONL文件
   ├── 解析推理结果集数据
   ├── 应用数据采样（如果设置了sampling_rate）
   ├── 为每个数据项生成JSON对象（包含原始数据和空的annotation字段）
   ├── 写入JSONL文件到JuiceFS
   └── 保存文件路径到result_file_path字段

5. 创建评估任务记录
   ├── 保存任务基本信息
   ├── 保存评估指标配置
   ├── 保存JSONL文件路径
   ├── 初始化total_items和completed_items
   └── 初始化任务状态为created
```

### 5.2 人工标注流程

```
1. 分页读取JSONL文件
   ├── 根据任务ID获取JSONL文件路径
   ├── 按行读取JSONL文件（支持分页）
   ├── 根据状态筛选（pending/completed/all）
   └── 返回评估项列表

2. 更新评分（批量提交）
   ├── 验证指标名称和分数范围
   ├── 读取JSONL文件
   ├── 更新指定行的annotation字段
   ├── 写入临时文件或直接更新原文件
   ├── 记录标注人和标注时间
   └── 更新任务进度（completed_items/total_items）

3. 提交审批
   ├── 验证所有必填字段
   ├── 将临时文件替换原文件（或直接更新原文件）
   ├── 更新任务状态
   └── 触发报告生成（如果所有项都已完成）

4. 检查任务完成
   ├── 统计JSONL文件中completed状态的数量
   ├── 如果所有项都已完成
   ├── 更新任务状态为completed
   └── 触发报告生成
```

**性能优化考虑：**
- 使用临时文件存储更新，最后一次性替换原文件（减少文件IO）
- 支持批量更新，减少文件读写次数
- 使用文件锁机制，避免并发更新冲突
- 可以接受速度较慢，但需要保证数据一致性

### 5.3 评估报告生成流程

```
1. 从JSONL文件读取所有已完成的评估项
   ├── 读取JSONL文件
   ├── 筛选annotation.status = "completed"的项
   ├── 按模型分组（对比评估时）
   └── 收集各指标的得分

2. 计算汇总分数
   ├── 按计算方式（average/max/min）计算
   ├── 生成metric_summary
   └── 对比评估时计算comparison_data

3. 保存或更新报告
   ├── 检查报告是否存在
   ├── 如果存在则更新
   └── 如果不存在则创建

4. 返回报告数据
   ├── 包含metric_summary
   ├── 包含comparison_data（对比评估时）
   └── 包含model_reports（对比评估时）
```

## 六、数据存储设计

### 6.1 评估结果明细存储

评估结果明细存储在JuiceFS中，文件格式为JSONL。详细格式说明见 **2.2 评估结果JSONL文件存储（JuiceFS）**。

### 6.2 JSONL文件读写策略

**读取策略（分页）：**
1. 使用流式读取，逐行解析JSON
2. 支持按状态筛选（pending/completed/all）
3. 支持分页（page, size）
4. 性能考虑：可以接受速度较慢，但需要保证数据准确性

**更新策略（批量提交）：**
1. **方案1：临时文件 + 原子替换（推荐）**
   - 读取原文件，更新指定行的annotation字段
   - 写入临时文件
   - 提交时，将临时文件原子替换原文件
   - 优点：数据一致性好，支持回滚
   - 缺点：需要额外的临时文件空间

2. **方案2：直接更新原文件**
   - 读取原文件到内存
   - 更新指定行的annotation字段
   - 直接覆盖原文件
   - 优点：简单直接
   - 缺点：如果更新失败，可能丢失数据

3. **方案3：增量更新文件**
   - 维护一个增量更新日志文件
   - 提交时合并到主文件
   - 优点：支持多次更新
   - 缺点：需要定期合并，逻辑复杂

**推荐使用方案1**，保证数据安全性和一致性。

### 6.3 文件锁机制

为了避免并发更新冲突，需要实现文件锁机制：
- 使用分布式锁（Redis）或文件锁
- 更新时获取锁，完成后释放锁
- 超时自动释放锁，避免死锁

## 七、权限设计

### 7.1 权限要求

- **创建任务**：需要项目编辑权限
- **查看任务**：需要项目查看权限
- **标注评分**：需要项目编辑权限
- **查看报告**：需要项目查看权限
- **删除任务**：需要项目编辑权限，且只能删除自己创建的任务或具有管理员权限

## 八、异常处理

### 8.1 常见异常场景

1. **推理结果集不存在**：返回404错误
2. **评估指标配置错误**：返回400错误，提示具体错误信息
3. **采样率超出范围**：返回400错误
4. **评分超出范围**：返回400错误
5. **任务状态不允许操作**：返回400错误（如已完成的任务不允许修改评分）

## 九、性能优化

### 9.1 数据加载优化

- 评估项列表支持分页，避免一次性加载大量数据
- 图片URL使用CDN或对象存储，支持快速访问
- 评估报告数据缓存，减少重复计算

### 9.2 并发控制

- 标注时使用乐观锁，避免并发修改冲突
- 批量更新时使用事务，保证数据一致性

## 十、扩展性考虑

### 10.1 未来可能的功能扩展

1. **多人协作标注**：支持多个标注人员同时标注，需要分配机制
2. **标注质量评估**：评估标注人员的一致性
3. **自动预标注**：使用模型进行预标注，人工进行修正
4. **标注历史记录**：记录评分修改历史
5. **标注模板**：支持保存和复用评估指标配置

