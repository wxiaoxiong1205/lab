# 人工评估功能快速参考文档

## 一、文档说明

本文档是人工评估功能的快速参考，详细设计请参考：
- `manual_evaluation_design.md` - 功能设计文档
- `manual_evaluation_api_design.md` - API接口设计文档
- `migrations/manual/2025-01-XX_create_manual_evaluation_tables.sql` - 数据库DDL

## 二、核心概念

### 2.1 评估类别（evaluation_category）

| 值 | 说明 | 适用场景 |
|---|------|---------|
| text | 文本评估 | 评估文本生成模型的表现 |
| image | 图像理解评估 | 评估图像理解模型的表现（图像描述、图像问答等） |

### 2.2 评估类型（evaluation_type）

| 值 | 说明 | 数据要求 |
|---|------|---------|
| single | 单个评估 | 1个推理结果集 + 1个模型 |
| comparison | 对比评估 | 2个或以上推理结果集 + 对应数量的模型 |

### 2.3 任务状态（status）

| 值 | 说明 | 可执行操作 |
|---|------|-----------|
| created | 已创建 | 开始标注、删除 |
| annotating | 标注中 | 继续标注、查看报告、删除 |
| completed | 已完成 | 查看报告、查看详情、下载、克隆、删除 |
| failed | 失败 | 删除、重新创建 |

### 2.4 评估项状态（item status）

| 值 | 说明 |
|---|------|
| pending | 待评估 |
| completed | 已完成 |

## 三、核心接口速查

### 3.1 任务管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/project/{project_id}/create` | POST | 创建人工评估任务 |
| `/project/{project_id}/list` | GET | 查询任务列表 |
| `/project/{project_id}/task/{task_id}` | GET | 查询任务详情 |
| `/project/{project_id}/task/{task_id}` | DELETE | 删除任务 |
| `/project/{project_id}/task/{task_id}/clone` | POST | 克隆任务 |

### 3.2 人工标注

| 接口 | 方法 | 说明 |
|------|------|------|
| `/project/{project_id}/task/{task_id}/items` | GET | 查询评估项列表 |
| `/project/{project_id}/task/{task_id}/item/{item_id}` | PATCH | 更新单个评估项评分 |
| `/project/{project_id}/task/{task_id}/items/batch` | PATCH | 批量更新评估项评分 |

### 3.3 评估报告

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/evaluation-tasks/project/{project_id}/task/{task_id}/report` | GET | 查询评估报告（人工评估和模型评估共用，通过evaluation_method=manual区分） |

### 3.4 评估详情

| 接口 | 方法 | 说明 |
|------|------|------|
| `/project/{project_id}/task/{task_id}/details` | GET | 查询评估详情列表 |
| `/project/{project_id}/task/{task_id}/download` | GET | 下载评估结果 |

## 四、数据模型速查

### 4.1 评估指标配置

```json
{
  "metric_name": "准确性",
  "description": "评估模型回答的准确性",
  "score_min": 0,
  "score_max": 10,
  "score_definitions": "0-3分：不准确；4-6分：部分准确；7-10分：完全准确"
}
```

### 4.2 评估指标配置格式

```json
[
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
```

### 4.3 JSONL文件格式

**单个评估示例：**
```json
{
  "item_index": 1,
  "prompt": "...",
  "model_response": "...",
  "evaluated_model_id": 101,
  "evaluated_model_name": "model-v1",
  "annotation": {
    "status": "completed",
    "metric_scores": {
      "准确性": 8,
      "丰富度": 7
    },
    "annotated_at": "2025-01-15T10:00:00",
    "annotated_by": "user1"
  }
}
```

**对比评估示例：**
```json
{
  "item_index": 1,
  "prompt": "...",
  "model_responses": ["model1 response", "model2 response"],
  "evaluated_model_names": ["model-v1", "model-v2"],
  "annotation": {
    "status": "completed",
    "metric_scores": {
      "model-v1": {
        "准确性": 8,
        "丰富度": 7
      },
      "model-v2": {
        "准确性": 9,
        "丰富度": 8
      }
    },
    "annotated_at": "2025-01-15T10:00:00",
    "annotated_by": "user1"
  }
}
```

## 五、典型使用场景

### 5.1 场景1：文本评估 - 单个评估

**步骤：**
1. 创建任务：选择文本评估、单个评估、已有推理结果集
   - 使用 `dataset_model_relations` 提供推理结果集和模型的关联关系
   - 配置 `evaluation_metrics`（使用 `EvaluationPromptMetricConfig` 结构）
   - 系统自动从推理结果集生成JSONL文件
2. 配置指标：准确性、丰富度等
3. 开始标注：
   - 分页读取JSONL文件中的评估项
   - 逐项进行评分（批量更新到临时文件）
   - 提交审批（将临时文件替换原文件）
4. 查看报告：所有项完成后，查看评估报告
5. 下载结果：从JSONL文件读取数据，下载Excel格式的评估结果

### 5.2 场景2：图像理解评估 - 单个评估

**步骤：**
1. 创建任务：选择图像理解评估、单个评估、已有推理结果集
   - 使用 `dataset_model_relations` 提供推理结果集和模型的关联关系
   - 配置 `evaluation_metrics`（使用 `EvaluationPromptMetricConfig` 结构）
2. 配置指标：指令遵循性、风格一致性等
3. 开始标注：查看图像和文本描述，对模型预测进行评分
4. 查看报告：所有项完成后，查看评估报告
5. 下载结果：下载JSON格式的评估结果

### 5.3 场景3：文本评估 - 对比评估

**步骤：**
1. 创建任务：选择文本评估、对比评估、已有推理结果集
   - 使用 `dataset_model_relations` 提供多个推理结果集和模型的关联关系（至少2个）
   - 配置 `evaluation_metrics`（使用 `EvaluationPromptMetricConfig` 结构）
2. 配置指标：准确性、丰富度等
3. 开始标注：对比多个模型的回答，分别评分
4. 查看报告：查看对比报告，包含各模型的得分和对比数据
5. 下载结果：下载包含对比数据的评估结果

## 六、关键业务规则

### 6.1 数据采样

- 采样率范围：0-100
- NULL表示不采样（使用全部数据）
- 采样在任务创建时执行，结果持久化

### 6.2 评分验证

- 评分必须在 `score_min` 和 `score_max` 范围内
- 支持小数评分
- 对比评估时，需要为每个模型分别评分

### 6.3 进度计算

```
progress = (completed_items / total_items) * 100
```

### 6.4 状态流转

```
created -> annotating -> completed
  ↓          ↓
failed    (可以回退到created重新开始)
```

### 6.5 JSONL文件读写

**读取策略：**
- 使用流式读取，逐行解析JSON
- 支持按状态筛选（检查 `annotation.status` 字段）
- 支持分页（跳过前面的行，读取指定数量的行）
- 可以接受速度较慢

**更新策略：**
- 批量更新：读取原文件，更新指定行的 `annotation` 字段，写入临时文件
- 提交审批：将临时文件原子替换原文件
- 使用文件锁机制，避免并发更新冲突

### 6.5 报告生成时机

- 当任务状态变为 `completed` 时，自动生成报告
- 也可以手动触发报告生成（通过查询报告接口）
- 报告存储在 `evaluation_reports` 表中，`evaluation_method = "manual"`

### 6.6 评估报告接口（共用）

**接口路径：**
```
GET /api/v1/evaluation-tasks/project/{project_id}/task/{task_id}/report
```

**查询参数：**
- `evaluation_method`: 评估方法筛选（referee/basic_metric/manual），人工评估时传入 `manual`
- `calculation_method`: 计算方式筛选（average/max/min）
- `model_id`: 模型ID筛选（对比评估时使用）

**响应格式：**
- 与模型评估报告相同，使用 `EvaluationReportResponse` 结构
- 包含 `aggregative_metrics`（聚合指标数组）和 `comparison_data`（对比数据）

## 七、与现有评估系统的区别

| 特性 | 自动评估（referee/basic_metric） | 人工评估（manual） |
|------|-------------------------------|-------------------|
| 评估方式 | 自动（使用模型或算法） | 人工（手动评分） |
| 评估指标 | 系统预定义或自定义 | 完全自定义 |
| 评估结果 | 自动生成 | 人工标注后生成 |
| 适用场景 | 大规模评估 | 小规模精细评估 |
| 数据采样 | 不支持 | 支持（0-100%） |
| 评估类别 | 仅文本 | 文本 + 图像理解 |
| 数据存储 | 数据库表 + JSONL文件 | 仅JSONL文件（节省数据库空间） |
| 标注数据 | 存储在数据库表 | 存储在JSONL文件的annotation字段 |

## 八、开发优先级建议

### Phase 1：核心功能
1. ✅ 数据库表设计（共用evaluation_tasks表）
2. ✅ 创建人工评估任务（生成JSONL文件）
3. ✅ JSONL文件分页读取接口
4. ✅ 批量更新JSONL文件中的标注信息
5. ✅ 提交审批接口（原子替换文件）
6. ✅ 查询评估报告

### Phase 2：增强功能
1. 评估详情查询（从JSONL文件读取）
2. 下载评估结果（从JSONL文件转换）
3. 任务克隆
4. JSONL文件缓存机制（提升读取性能）

### Phase 3：优化功能
1. 任务状态管理优化
2. 进度实时更新
3. 标注历史记录
4. 多人协作标注

## 九、注意事项

1. **数据采样**：采样结果需要持久化，避免每次查询时重新采样
2. **评分验证**：前端和后端都需要验证评分范围
3. **并发控制**：使用文件锁机制，避免并发更新JSONL文件冲突
4. **图像存储**：图像URL需要支持CDN或对象存储，确保快速访问
5. **报告缓存**：评估报告数据可以缓存，减少重复计算
6. **JSONL文件读写**：
   - 可以接受速度较慢，但需要保证数据准确性
   - 使用临时文件机制，保证数据一致性
   - 支持原子替换，避免数据丢失
   - 考虑实现缓存机制，提升读取性能
7. **文件大小限制**：如果JSONL文件过大，考虑分片存储或压缩

## 十、测试建议

### 10.1 单元测试

- 数据采样算法测试
- 评分验证逻辑测试
- 进度计算逻辑测试
- 报告生成逻辑测试

### 10.2 集成测试

- 创建任务流程测试
- 标注流程测试
- 报告生成流程测试
- 下载功能测试

### 10.3 性能测试

- 大量评估项的查询性能
- 批量更新性能
- 报告生成性能

