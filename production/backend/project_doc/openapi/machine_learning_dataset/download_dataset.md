# 下载机器学习数据集

## 接口详情

- 方法路径：`GET /openapi/lab/v1/machine-learning-datasets/dataset/{project_id}/{dataset_id}/download`
- Operation ID：`openapi_v1_machine_learning_datasets_download_machine_learning_dataset`
- 简述：下载指定机器学习数据集版本。

## 接口说明

- 支持通过 `export_format` 指定导出格式。
- 如果导出文件已经准备好，接口直接返回文件流，不包裹 `OpenApiResponse`。
- 如果导出文件尚未准备好，接口会返回 `202` JSON 响应；响应体使用开放平台统一响应结构，`data` 中包含导出任务状态。首次请求会提交异步导出任务，后续任务处理中会提示稍后重试下载。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | 大于: `0` | 项目 ID。 |
| `dataset_id` | path | 是 | integer | - | 大于: `0` | 数据集 ID。 |
| `export_format` | query | 否 | `ExportFormat`<br>可选值：`platform`、`jsonl`、`coco`、`mask_image`、`image_folder` | `platform` | - | 导出格式。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | 导出文件已准备好，直接下载 | 文件流 |
| `202` | 导出文件未准备好，已提交或正在处理异步导出任务 | `application/json`：`OpenApiResponse<OpenMachineLearningDatasetExportTaskResponse>` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

### 直接下载示例

```http
HTTP/1.1 200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="ml_text_dataset_V1_platform.zip"

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
    "export_format": "platform",
    "message": "已提交异步导出任务，请稍后重试下载"
  },
  "request_id": "req_202606050003"
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
    "export_format": "platform",
    "message": "导出任务处理中，请稍后重试下载"
  },
  "request_id": "req_202606050004"
}
```
