# 分页查询数据集

## 接口详情

- 方法路径：`GET /openapi/lab/v1/training-datasets/project/{project_id}`
- Operation ID：`openapi_v1_training_datasets_list_training_datasets`
- 简述：按项目分页查询数据集摘要，支持名称、数据集类型、训练方法、用途和处理状态等过滤条件。

## 接口说明

- 按项目分页返回数据集摘要，每条记录代表一个数据集名称的汇总信息。
- 支持按名称、数据类型、训练方法、用途和处理状态筛选。
- 响应 `data.items` 中不展开全部版本详情；如需版本列表请调用“查询数据集版本列表”。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | - | 项目 ID。 |
| `dataset_name` | query | 否 | string | - | - | 数据集名称或按名称搜索的关键字。 |
| `page` | query | 否 | integer | `1` | 最小值: `1` | 页码，从 1 开始。 |
| `size` | query | 否 | integer | `50` | 最小值: `1`；最大值: `1000` | 每页数量。 |
| `dataset_type` | query | 否 | `TrainingTypeCategory`<br>可选值：`text-generation`、`image-generation`、`image-understanding`、`multimodal`、`business` | - | - | 数据集类型。 |
| `training_method_type` | query | 否 | `TrainingMethodType`<br>可选值：`sft`、`dpo`、`business` | - | - | 训练方法类型。 |
| `usage` | query | 否 | `DatasetUsage`<br>可选值：`training`、`validation`、`test`、`business_training`、`business_test` | - | - | 数据集用途。 |
| `processing_status` | query | 否 | `DatasetProcessingStatus`<br>可选值：`pending`、`completed`、`failed` | - | - | 数据集处理状态。 |

## 请求体

无。

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenApiPageData_OpenTrainingDatasetSummary__` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1001,
        "dataset_name": "customer_service_sft",
        "version_count": 2,
        "dataset_type": "business",
        "training_method_type": "business",
        "dataset_format": "business",
        "usage": "training",
        "project_id": 35,
        "latest_version": "V2",
        "earliest_version": "V1",
        "processing_status": "completed",
        "processing_status_display": "处理完成",
        "processing_error": null,
        "created_at": "2026-05-19T09:00:00+08:00",
        "updated_at": "2026-05-19T10:00:00+08:00",
        "created_by": "admin"
      }
    ],
    "page": 1,
    "size": 20,
    "total": 1,
    "pages": 1
  },
  "request_id": "req-202605190001"
}
```
