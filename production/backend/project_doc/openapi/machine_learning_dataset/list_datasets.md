# 分页查询机器学习数据集

## 接口详情

- 方法路径：`GET /openapi/lab/v1/machine-learning-datasets/dataset/{project_id}/page`
- Operation ID：`openapi_v1_machine_learning_datasets_list_machine_learning_datasets`
- 简述：分页查询项目下机器学习数据集。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | 大于: `0` | 项目 ID。 |
| `dataset_name` | query | 否 | string | - | 最大长度: `100` | 数据集名称模糊匹配。 |
| `task_type` | query | 否 | `MachineLearningDatasetTaskType`<br>可选值：`text_classification`、`text_entity_recognition`、`image_classification`、`object_detection`、`image_segmentation` | - | - | 任务类型过滤。 |
| `template_type` | query | 否 | `MachineLearningDatasetTemplateType`<br>可选值：`text_classification_single_label`、`text_classification_multi_label`、`entity_recognition`、`image_classification_single_label`、`image_classification_multi_label`、`object_detection_bbox`、`image_segmentation_instance`、`semantic_segmentation` | - | - | 标注模板筛选。 |
| `is_annotated` | query | 否 | boolean | - | - | 是否已标注。 |
| `page` | query | 否 | integer | `1` | 最小值: `1` | 页码。 |
| `size` | query | 否 | integer | `50` | 最小值: `1`；最大值: `1000` | 每页数量。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenApiPageData_OpenMachineLearningDataset__` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "items": [],
    "page": 1,
    "size": 50,
    "total": 0,
    "pages": 0
  },
  "request_id": "req-202606030003"
}
```
