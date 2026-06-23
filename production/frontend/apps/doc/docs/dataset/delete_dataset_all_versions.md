# 删除数据集全部版本

## 接口详情

- 方法路径：`DELETE /openapi/lab/v1/training-datasets/project/{project_id}/dataset/{dataset_name}`
- Operation ID：`openapi_v1_training_datasets_delete_dataset_all_versions`
- 简述：删除指定项目和数据集名称下的全部数据集版本。

## 接口说明

- 删除指定数据集名称下的全部版本。
- 删除前建议先逐版本调用使用状态查询接口，确认没有任务占用。
- 删除成功时响应只表示操作成功，通常不返回业务数据。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | - | 项目 ID。 |
| `dataset_name` | path | 是 | string | - | - | 数据集名称。 |
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
  "request_id": "req-202605190007"
}
```
