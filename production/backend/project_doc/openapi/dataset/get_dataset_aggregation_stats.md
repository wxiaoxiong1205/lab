# 查询数据集聚合统计

## 接口详情

- 方法路径：`GET /openapi/lab/v1/training-datasets/project/{project_id}/stats`
- Operation ID：`openapi_v1_training_datasets_get_training_dataset_aggregation_stats`
- 简述：按项目查询数据集聚合统计，支持用途、数据格式、数据集类型、训练方法类型和属性值过滤。

## 接口说明

- 按用途、数据格式、数据类型和业务属性选项返回聚合统计。
- 适合用于前端筛选面板或数据集概览页。
- 可结合 `usage`、`dataset_type`、`training_method_type`、`dataset_format` 和属性条件限制统计范围。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | - | 项目 ID。 |
| `processing_status` | query | 否 | `DatasetProcessingStatus`<br>可选值：`pending`、`completed`、`failed` | `completed` | - | 数据集处理状态。 |
| `usage` | query | 否 | array<`DatasetUsage`><br>可选值：`training`、`validation`、`test`、`business_training`、`business_test` | - | - | 数据集用途。 |
| `dataset_type` | query | 否 | array<`TrainingTypeCategory`><br>可选值：`text-generation`、`image-generation`、`image-understanding`、`multimodal`、`business` | - | - | 数据集类型。 |
| `training_method_type` | query | 否 | array<`TrainingMethodType`><br>可选值：`sft`、`dpo`、`business` | - | - | 训练方法类型。 |
| `dataset_format` | query | 否 | array<`DatasetFormat`><br>可选值：`prompt-response`、`alpaca`、`role-based`、`prefix-suffix-middle`、`business` | - | - | 数据格式。 |
| `attr_name` | query | 否 | string | - | - | 按属性名称筛选，需与 option_value 同时传入。 |
| `option_value` | query | 否 | string | - | - | 按属性选项值筛选，需与 attr_name 同时传入。 |

## 请求体

无。

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenTrainingDatasetAggregation_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "usage": [
      {
        "value": "training",
        "count": 12
      }
    ],
    "dataset_format": [
      {
        "value": "business",
        "count": 12
      }
    ],
    "dataset_type": [
      {
        "value": "business",
        "count": 12
      }
    ],
    "attr_option": [
      {
        "name": "行业",
        "options": [
          {
            "value": "客服",
            "count": 8
          },
          {
            "value": "金融",
            "count": 4
          }
        ]
      }
    ]
  },
  "request_id": "req-202605190009"
}
```
