# 查询数据集使用状态

## 接口详情

- 方法路径：`GET /openapi/lab/v1/training-datasets/project/{project_id}/dataset/{dataset_name}/version/{version}/in-use`
- Operation ID：`openapi_v1_training_datasets_check_dataset_in_use_status`
- 简述：查询指定数据集版本是否正在被任务或其他资源使用。

## 接口说明

- 删除或覆盖数据集版本前可先调用该接口检查占用状态。
- 如果正在被任务使用，响应中会返回任务类型、任务 ID 和任务名称。
- 仅查询使用状态，不会修改数据集。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | - | 项目 ID。 |
| `dataset_name` | path | 是 | string | - | - | 数据集名称。 |
| `version` | path | 是 | string | - | - | 数据集版本号。 |

## 请求体

无。

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenDatasetInUse_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "in_use": true,
    "task_type": "training_task",
    "task_id": 501,
    "task_name": "客服模型训练任务",
    "version": "V1"
  },
  "request_id": "req-202605190003"
}
```
