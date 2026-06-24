# 删除机器学习数据集全部版本

## 接口详情

- 方法路径：`DELETE /openapi/lab/v1/machine-learning-datasets/dataset/{project_id}/{dataset_id}/versions`
- Operation ID：`openapi_v1_machine_learning_datasets_delete_machine_learning_dataset_all_versions`
- 简述：删除指定机器学习数据集的全部同名版本。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | 大于: `0` | 项目 ID。 |
| `dataset_id` | path | 是 | integer | - | 大于: `0` | 数据集 ID，用于定位同名数据集。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_None_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "request_id": "req-202606030007"
}
```
