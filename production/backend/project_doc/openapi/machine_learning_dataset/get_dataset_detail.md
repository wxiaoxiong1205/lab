# 查询机器学习数据集详情

## 接口详情

- 方法路径：`GET /openapi/lab/v1/machine-learning-datasets/dataset/{project_id}/{dataset_id}`
- Operation ID：`openapi_v1_machine_learning_datasets_get_machine_learning_dataset_detail`
- 简述：查询指定机器学习数据集详情，并分页返回样本数据。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | 大于: `0` | 项目 ID。 |
| `dataset_id` | path | 是 | integer | - | 大于: `0` | 数据集 ID。 |
| `page` | query | 否 | integer | `1` | 最小值: `1` | 样本页码。 |
| `size` | query | 否 | integer | `20` | 最小值: `1`；最大值: `200` | 每页样本数量。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenMachineLearningDatasetDetail_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
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
    "storage_path": "datasets/machine-learning/dataset_1001/",
    "dataset_path": "datasets/machine-learning/dataset_1001/dataset.jsonl",
    "label_schema_path": null,
    "sample_count": 120,
    "file_size": 1.25,
    "created_at": "2026-06-03T10:00:00+08:00",
    "updated_at": "2026-06-03T10:00:00+08:00",
    "created_by": "admin",
    "base_url": null,
    "label_schema": null,
    "items": [],
    "total": 120,
    "page": 1,
    "size": 20,
    "pages": 6
  },
  "request_id": "req-202606030005"
}
```
