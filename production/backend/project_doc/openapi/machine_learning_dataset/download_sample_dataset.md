# 下载机器学习数据集样例

## 接口详情

- 方法路径：`GET /openapi/lab/v1/machine-learning-datasets/dataset/{project_id}/sample/download`
- Operation ID：`openapi_v1_machine_learning_datasets_download_machine_learning_sample_dataset`
- 简述：下载机器学习数据集样例文件。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | 大于: `0` | 项目 ID。 |
| `data_type` | query | 是 | `MachineLearningDatasetDataType`<br>可选值：`text`、`image` | - | - | 数据类型。 |
| `template_type` | query | 是 | `MachineLearningDatasetTemplateType`<br>可选值：`text_classification_single_label`、`text_classification_multi_label`、`entity_recognition`、`image_classification_single_label`、`image_classification_multi_label`、`object_detection_bbox`、`image_segmentation_instance`、`semantic_segmentation` | - | - | 标注模板。 |
| `file_type` | query | 是 | `MachineLearningDatasetSampleFileType`<br>可选值：`jsonl`、`zip` | - | - | 样例文件格式。 |
| `is_annotated` | query | 否 | boolean | `true` | - | 是否有标注数据。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | 样例文件流 |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 请求示例

```bash
curl -L "https://api.example.com/openapi/lab/v1/machine-learning-datasets/dataset/35/sample/download?data_type=text&template_type=text_classification_single_label&file_type=jsonl&is_annotated=true" \
  -H "Authorization: Bearer <token>" \
  -o sample.jsonl
```
