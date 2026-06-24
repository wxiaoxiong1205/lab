# 下载数据集样例

## 接口详情

- 方法路径：`GET /openapi/lab/v1/training-datasets/project/{project_id}/sample/download`
- Operation ID：`openapi_v1_training_datasets_download_sample_dataset`
- 简述：根据项目、数据集类型、训练方法、数据格式和文件类型下载数据集样例文件。

## 接口说明

- 用于在上传真实数据前下载平台提供的样例模板。
- 返回值为文件流，不包裹 `OpenApiResponse`。
- 请根据 `dataset_type`、`dataset_format` 和 `file_type` 选择匹配的样例文件。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | - | 项目 ID。 |
| `dataset_type` | query | 是 | `TrainingTypeCategory`<br />可选值：`text-generation`、`image-generation`、`image-understanding`、`multimodal`、`business` | - | - | 数据集类型。 |
| `training_method_type` | query | 否 | `TrainingMethodType`<br />可选值：`sft`、`dpo`、`business` | `business` | - | 训练方法类型。 |
| `dataset_format` | query | 否 | `DatasetFormat`<br />可选值：`prompt-response`、`alpaca`、`role-based`、`prefix-suffix-middle`、`business` | `business` | - | 数据格式。 |
| `file_type` | query | 是 | `TrainingDatasetUploadTypeCategory`<br />可选值：`jsonl`、`xlsx`、`json` | - | - | 样例文件类型。 |

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
Content-Disposition: attachment; filename="sample.jsonl"

<文件二进制内容>
```
