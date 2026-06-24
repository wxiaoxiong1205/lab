# 预览数据集样本

## 接口详情

- 方法路径：`GET /openapi/lab/v1/training-datasets/project/{project_id}/dataset/{name}/version/{version}/preview`
- Operation ID：`openapi_v1_training_datasets_preview_dataset_data`
- 简述：分页预览指定数据集版本中的样本数据。

## 接口说明

- 分页预览指定数据集版本的样本内容。
- 适合在下载完整文件前快速检查数据格式和样本质量。
- `sample_data` 的结构随数据集格式变化，可能是对象、数组或文本。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | - | 项目 ID。 |
| `name` | path | 是 | string | - | - | 数据集名称或按名称搜索的关键字。 |
| `version` | path | 是 | string | - | - | 数据集版本号。 |
| `page` | query | 否 | integer | `1` | 最小值: `1` | 页码，从 1 开始。 |
| `size` | query | 否 | integer | `20` | 最小值: `1`；最大值: `100` | 每页数量。 |
| `usage` | query | 否 | `DatasetUsage`<br />可选值：`training`、`validation`、`test`、`business_training`、`business_test` | - | - | 数据集用途。 |

## 请求体

无。

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenDatasetSamplePage_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "row_number": 1,
        "sample_data": {
          "prompt": "如何查询订单？",
          "response": "您可以在订单中心输入订单号查询。"
        }
      }
    ],
    "total": 1200,
    "page": 1,
    "size": 20,
    "pages": 60
  },
  "request_id": "req-202605190004"
}
```
