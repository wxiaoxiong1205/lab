# 下载数据集版本

## 接口详情

- 方法路径：`GET /openapi/lab/v1/training-datasets/project/{project_id}/dataset/{dataset_name}/version/{version}/download`
- Operation ID：`openapi_v1_training_datasets_download_dataset`
- 简述：下载指定项目、数据集名称和版本对应的数据集文件。

## 接口说明

- 用于导出指定项目下某个数据集版本的文件内容。
- 返回值为文件流，不包裹 `OpenApiResponse`。
- 可通过 `usage` 和 `file_type` 控制导出的用途和文件格式。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | - | 项目 ID。 |
| `dataset_name` | path | 是 | string | - | - | 数据集名称。 |
| `version` | path | 是 | string | - | - | 数据集版本号。 |
| `usage` | query | 否 | `DatasetUsage`<br />可选值：`training`、`validation`、`test`、`business_training`、`business_test` | - | - | 数据集用途。 |
| `export_type` | query | 否 | `TrainingDatasetExportTypeCategory`<br />可选值：`jsonl`、`xlsx`、`json`、`zip` | - | - | 验证数据集导出格式参数，如果未传入则默认为JSONL |

## 请求体

无。

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | 文件流（`application/octet-stream`，实际 `Content-Type` 以服务端返回为准） |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="customer_service_sft_V1.jsonl"

<文件二进制内容>
```
