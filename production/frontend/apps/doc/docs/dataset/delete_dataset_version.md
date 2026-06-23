# 删除数据集单个版本

## 接口详情

- 方法路径：`DELETE /openapi/lab/v1/training-datasets/project/{project_id}/dataset/{dataset_name}/{version}`
- Operation ID：`openapi_v1_training_datasets_delete_single_dataset`
- 简述：删除指定项目、数据集名称和版本对应的数据集。

## 接口说明

- 删除指定数据集名称和版本。
- 如果该版本正在被任务使用，业务侧可能拒绝删除。
- 删除成功时响应只表示操作成功，通常不返回业务数据。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | - | 项目 ID。 |
| `dataset_name` | path | 是 | string | - | - | 数据集名称。 |
| `version` | path | 是 | string | - | - | 数据集版本号。 |
| `usage` | query | 否 | `DatasetUsage`<br />可选值：`training`、`validation`、`test`、`business_training`、`business_test` | - | - | 数据集用途。 |

## 请求体

无。

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_NoneType_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "request_id": "req-202605190008"
}
```
