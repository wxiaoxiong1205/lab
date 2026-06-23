# 上传数据集

## 接口详情

- 方法路径：`POST /openapi/lab/v1/training-datasets`
- Operation ID：`openapi_v1_training_datasets_create_training_dataset`
- 简述：上传数据集文件并创建数据集记录。当前开放平台接口复用平台原有上传处理、校验和鉴权逻辑。

## 接口说明

- 创建新的数据集并绑定已完成的分片上传文件。
- 请求体为 `multipart/form-data`，`chunk_upload_ids` 支持多个上传会话 ID，以英文逗号分隔。
- 创建成功后，响应 `data.id` 返回新建数据集的 ID。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `dataset_type` | query | 是 | `TrainingTypeCategory`<br />可选值：`text-generation`、`image-generation`、`image-understanding`、`multimodal`、`business` | - | - | 数据集类型。 |
| `training_method_type` | query | 否 | `TrainingMethodType`<br />可选值：`sft`、`dpo`、`business` | `business` | - | 训练方法类型。 |
| `dataset_format` | query | 否 | `DatasetFormat`<br />可选值：`prompt-response`、`alpaca`、`role-based`、`prefix-suffix-middle`、`business` | `business` | - | 数据格式。 |
| `usage` | query | 否 | `DatasetUsage`<br />可选值：`training`、`validation`、`test`、`business_training`、`business_test` | - | - | 数据集用途。 |

## 请求体

- Content-Type：`application/x-www-form-urlencoded`；必填：是；Schema：`Body_openapi_v1_training_datasets_create_training_dataset`

| 字段 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `name` | 是 | string | - | 最小长度: `1`；最大长度: `100` | 数据集名称或按名称搜索的关键字。 |
| `project_id` | 是 | integer | - | 大于: `0.0` | 项目 ID。 |
| `chunk_upload_ids` | 是 | string | - | - | 分片上传 ID 列表，多个 ID 使用英文逗号分隔。 |
| `version` | 否 | string | `V1` | 最大长度: `50` | 数据集版本号。 |
| `description` | 否 | string | - | - | 数据集描述。 |
| `dataset_config` | 否 | string | - | - | 数据集配置，JSON 字符串。 |
| `attr_values` | 否 | string | - | - | 关联属性值和选项，JSON 数组字符串。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `201` | Successful Response | `application/json`：`OpenApiResponse_OpenTrainingDatasetCreateResult_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "id": 1001
  },
  "request_id": "req-202605190005"
}
```
