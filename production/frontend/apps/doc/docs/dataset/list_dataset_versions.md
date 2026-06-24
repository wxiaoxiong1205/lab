# 查询数据集版本列表

## 接口详情

- 方法路径：`GET /openapi/lab/v1/training-datasets/project/{project_id}/dataset/{dataset_name}`
- Operation ID：`openapi_v1_training_datasets_get_training_dataset_versions`
- 简述：查询指定项目和数据集名称下的全部数据集版本。

## 接口说明

- 返回指定数据集名称下的版本明细列表。
- 可通过 `usage` 和 `processing_status` 限制返回范围。
- 响应 `data` 是数组，每个元素为一个数据集版本。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | - | 项目 ID。 |
| `dataset_name` | path | 是 | string | - | - | 数据集名称。 |
| `usage` | query | 否 | `DatasetUsage`<br />可选值：`training`、`validation`、`test`、`business_training`、`business_test` | - | - | 数据集用途。 |
| `processing_status` | query | 否 | `DatasetProcessingStatus`<br />可选值：`pending`、`completed`、`failed` | - | - | 数据集处理状态。 |

## 请求体

无。

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_List_OpenTrainingDataset__` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": [
    {
      "id": 1001,
      "name": "customer_service_sft",
      "description": "客服问答数据集",
      "project_id": 35,
      "version": "V1",
      "dataset_type": "business",
      "training_method_type": "business",
      "dataset_format": "business",
      "usage": "training",
      "dataset_config": {
        "format": "jsonl"
      },
      "total_samples": 1200,
      "total_characters": 386000,
      "file_size": 12.5,
      "file_size_display": "12.5 MB",
      "dataset_path": "datasets/35/customer_service_sft/V1/data.jsonl",
      "processing_status": "completed",
      "processing_status_display": "处理完成",
      "processing_error": null,
      "created_at": "2026-05-19T09:00:00+08:00",
      "updated_at": "2026-05-19T09:10:00+08:00",
      "created_by": "admin",
      "attr_values": [
        {
          "attr_name": "行业",
          "option_value": "客服"
        }
      ]
    },
    {
      "id": 1002,
      "name": "customer_service_sft",
      "description": "客服问答数据集",
      "project_id": 35,
      "version": "V2",
      "dataset_type": "business",
      "training_method_type": "business",
      "dataset_format": "business",
      "usage": "training",
      "dataset_config": {
        "format": "jsonl"
      },
      "total_samples": 1200,
      "total_characters": 386000,
      "file_size": 12.5,
      "file_size_display": "12.5 MB",
      "dataset_path": "datasets/35/customer_service_sft/V1/data.jsonl",
      "processing_status": "completed",
      "processing_status_display": "处理完成",
      "processing_error": null,
      "created_at": "2026-05-19T09:00:00+08:00",
      "updated_at": "2026-05-19T09:10:00+08:00",
      "created_by": "admin",
      "attr_values": [
        {
          "attr_name": "行业",
          "option_value": "客服"
        }
      ]
    }
  ],
  "request_id": "req-202605190002"
}
```
