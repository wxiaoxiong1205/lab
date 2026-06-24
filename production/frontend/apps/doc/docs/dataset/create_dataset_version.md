# 上传数据集新版本

## 接口详情

- 方法路径：`POST /openapi/lab/v1/training-datasets/{dataset_name}/versions`
- Operation ID：`openapi_v1_training_datasets_create_dataset_version`
- 简述：为指定数据集上传一个新版本文件。

## 接口说明

- 在已有数据集名称下新增一个版本。
- 请求体为 `multipart/form-data`，文件来源可使用 `chunk_upload_ids`，也可按参数选择继承已有版本。
- 新版本创建成功后，响应 `data.id` 返回新版本数据集的 ID。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `dataset_name` | path | 是 | string | - | - | 数据集名称。 |

## 请求体

- Content-Type：`application/x-www-form-urlencoded`；必填：是；Schema：`Body_openapi_v1_training_datasets_create_dataset_version`

| 字段 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `project_id` | 是 | integer | - | 大于: `0.0` | 项目 ID。 |
| `new_version` | 是 | string | - | 最大长度: `50` | 新版本号。 |
| `inherit_from_version` | 否 | boolean | `False` | - | 是否继承现有版本的数据。 |
| `source_version` | 否 | string | - | - | 继承的源版本号。 |
| `usage` | 是 | `DatasetUsage`<br />可选值：`training`、`validation`、`test`、`business_training`、`business_test` | - | - | 数据集用途。 |
| `chunk_upload_ids` | 否 | string | - | - | 分片上传 ID 列表，多个 ID 使用英文逗号分隔。 |
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
    "id": 1002
  },
  "request_id": "req-202605190006"
}
```
