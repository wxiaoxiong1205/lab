# 下载数据集版本

## 接口详情

- 方法路径：`GET /openapi/lab/v1/training-datasets/project/{project_id}/dataset/{dataset_name}/version/{version}/download`
- Operation ID：`openapi_v1_training_datasets_download_dataset`
- 简述：下载指定项目、数据集名称和版本对应的数据集文件。

## 接口说明

- 用于下载指定项目下某个数据集版本的导出文件。
- 如果导出文件已经准备好，接口直接返回文件流，不包裹 `OpenApiResponse`。
- 如果导出文件尚未准备好，接口会返回 `202` JSON 响应；响应体使用开放平台统一响应结构，`data` 中包含导出任务状态。首次请求会提交异步导出任务，后续任务处理中会提示稍后重试下载。
- 可通过 `usage` 和 `export_type` 控制导出的用途和文件格式。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | - | 项目 ID。 |
| `dataset_name` | path | 是 | string | - | - | 数据集名称。 |
| `version` | path | 是 | string | - | - | 数据集版本号。 |
| `usage` | query | 否 | `DatasetUsage`<br>可选值：`training`、`validation`、`test`、`business_training`、`business_test` | - | - | 数据集用途。 |
| `export_type` | query | 否 | `TrainingDatasetExportTypeCategory`<br>可选值：`jsonl`、`xlsx`、`json`、`zip` | - | - | 验证数据集导出格式参数，如果未传入则默认为JSONL |

## 请求体

无。

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | 导出文件已准备好，直接下载 | 文件流（`application/octet-stream`，实际 `Content-Type` 以服务端返回为准） |
| `202` | 导出文件未准备好，已提交或正在处理异步导出任务 | `application/json`：`OpenApiResponse<OpenTrainingDatasetExportTaskResponse>` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

### 直接下载示例

```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="customer_service_sft_V1.jsonl"

<文件二进制内容>
```

### 首次请求触发异步导出示例

```json
{
  "success": true,
  "data": {
    "status": "processing",
    "task_id": "6f2d8d2e-1111-4a22-9c7d-123456789abc",
    "dataset_id": 1001,
    "export_format": "jsonl",
    "message": "已提交异步导出任务，请稍后重试下载"
  },
  "request_id": "req_202606050001"
}
```

### 导出任务处理中示例

```json
{
  "success": true,
  "data": {
    "status": "processing",
    "task_id": "6f2d8d2e-1111-4a22-9c7d-123456789abc",
    "dataset_id": 1001,
    "export_format": "jsonl",
    "message": "导出任务处理中，请稍后重试下载"
  },
  "request_id": "req_202606050002"
}
```
