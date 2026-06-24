# 查询机器学习数据集版本列表

## 接口详情

- 方法路径：`GET /openapi/lab/v1/machine-learning-datasets/dataset/{project_id}/{dataset_id}/versions`
- Operation ID：`openapi_v1_machine_learning_datasets_get_machine_learning_dataset_versions`
- 简述：根据数据集 ID 查询同名机器学习数据集的全部版本。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | 大于: `0` | 项目 ID。 |
| `dataset_id` | path | 是 | integer | - | 大于: `0` | 数据集 ID。 |
| `is_annotated` | query | 否 | boolean | - | - | 是否已标注。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_List_OpenMachineLearningDataset__` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": [
    {
      "id": 1001,
      "dataset_name": "ml_text_dataset",
      "description": "文本分类数据集",
      "project_id": 35,
      "version": "V1",
      "dataset_category": "machine_learning",
      "task_type": "text_classification",
      "data_type": "text",
      "data_source": "local_upload",
      "annotation_type": "text_classification",
      "template_type": "text_classification_single_label",
      "is_annotated": true,
      "source_type": "jsonl",
      "sample_count": 120,
      "created_at": "2026-06-03T10:00:00+08:00",
      "updated_at": "2026-06-03T10:00:00+08:00",
      "created_by": "admin"
    }
  ],
  "request_id": "req-202606030002"
}
```
