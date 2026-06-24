# 查询机器学习数据集导出格式

## 接口详情

- 方法路径：`GET /openapi/lab/v1/machine-learning-datasets/dataset/export-formats`
- Operation ID：`openapi_v1_machine_learning_datasets_get_machine_learning_task_export_formats`
- 简述：返回每个机器学习任务模板支持的导出格式。

## 参数

无。

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenMachineLearningTaskExportFormats__` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "text_classification_single_label": ["platform", "jsonl"],
    "text_classification_multi_label": ["platform", "jsonl"]
  },
  "request_id": "req-202606030008"
}
```
