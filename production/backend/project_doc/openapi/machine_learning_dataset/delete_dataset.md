# 删除机器学习数据集版本

## 接口详情

- 方法路径：`DELETE /openapi/lab/v1/machine-learning-datasets/dataset/{project_id}/{dataset_id}`
- Operation ID：`openapi_v1_machine_learning_datasets_delete_machine_learning_dataset`
- 简述：删除指定机器学习数据集版本。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | 大于: `0` | 项目 ID。 |
| `dataset_id` | path | 是 | integer | - | 大于: `0` | 数据集 ID。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_None_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "request_id": "req-202606030006"
}
```
