# 编辑机器学习数据集基础信息

## 接口详情

- 方法路径：`PUT /openapi/lab/v1/machine-learning-datasets/dataset/{project_id}/{dataset_id}/basic-info`
- Operation ID：`openapi_v1_machine_learning_datasets_update_machine_learning_dataset_basic_info`
- 简述：编辑机器学习数据集名称或描述。

## 接口说明

- 通过 `project_id` 和 `dataset_id` 定位数据集。
- 修改 `dataset_name` 时，会同步修改同名数据集的所有版本。
- 修改 `description` 时，仅修改 `dataset_id` 对应版本。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | 大于: `0` | 项目 ID。 |
| `dataset_id` | path | 是 | integer | - | 大于: `0` | 数据集 ID。 |

## 请求体

| 字段 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `dataset_name` | 否 | string | - | 最小长度: `1`；最大长度: `100` | 新的数据集名称；会同步修改同名数据集的所有版本。 |
| `description` | 否 | string | - | 最大长度: `1000` | 新的数据集描述；仅修改 `dataset_id` 对应版本。 |

> `dataset_name` 和 `description` 至少需要传一个。

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_bool_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 请求示例

```json
{
  "dataset_name": "ml_text_dataset_new",
  "description": "新的机器学习数据集描述"
}
```

## 返回示例

```json
{
  "success": true,
  "data": true,
  "request_id": "req-202606030004"
}
```
