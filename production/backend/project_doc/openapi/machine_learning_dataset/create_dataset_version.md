# 上传机器学习数据集新版本

## 接口详情

- 方法路径：`POST /openapi/lab/v1/machine-learning-datasets/dataset/{project_id}/version/upload`
- Operation ID：`openapi_v1_machine_learning_datasets_create_machine_learning_dataset_version`
- 简述：继承已有版本并可追加新文件，创建机器学习数据集新版本。

## 接口说明

- 请求体为 `multipart/form-data`。
- 上传新版本：`inherit_from_version=true` 时，传入 `source_version` 继承源版本数据；也可以传入 `chunk_upload_ids` 追加合并新文件。
- 该接口处理逻辑与“上传机器学习数据集”接口一致，仅作为开放平台中独立的新版本上传入口。
- `description` 最多 1000 个字符。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | path | 是 | integer | - | 大于: `0` | 项目 ID。 |

## 请求体

| 字段 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `dataset_name` | 是 | string | - | 最小长度: `1`；最大长度: `100` | 数据集名称。 |
| `chunk_upload_ids` | 否 | string | - | - | 上传文件 ID 列表，多个用英文逗号分隔；继承模式下可传入新增文件进行合并。 |
| `data_type` | 否 | `MachineLearningDatasetDataType`<br>可选值：`text`、`image` | - | - | 数据类型：`text`、`image`；继承模式下使用源版本类型，可省略。 |
| `annotation_type` | 否 | `MachineLearningDatasetAnnotationType`<br>可选值：`text_classification`、`entity_recognition`、`image_classification`、`object_detection`、`image_segmentation` | - | - | 标注类型；继承模式下使用源版本类型，可省略。 |
| `template_type` | 否 | `MachineLearningDatasetTemplateType`<br>可选值：`text_classification_single_label`、`text_classification_multi_label`、`entity_recognition`、`image_classification_single_label`、`image_classification_multi_label`、`object_detection_bbox`、`image_segmentation_instance`、`semantic_segmentation` | - | - | 标注模板；继承模式下使用源版本模板，可省略。 |
| `is_annotated` | 否 | boolean | `true` | - | 是否有标注数据。 |
| `version` | 否 | string | `V1` | 最大长度: `50` | 新版本号。 |
| `inherit_from_version` | 否 | boolean | `false` | - | 是否从已有版本继承数据；用于上传新版本。 |
| `source_version` | 否 | string | - | - | 被继承的源版本号；继承模式下必填。 |
| `description` | 否 | string | - | 最大长度: `1000` | 描述，最多 1000 个字符。 |
| `data_source` | 否 | `MachineLearningDatasetDataSource`<br>可选值：`local_upload`、`notebook_fetch` | - | - | 数据来源：`local_upload`、`notebook_fetch`。 |
| `notebook_id` | 否 | integer | - | - | Notebook ID。 |
| `notebook_name` | 否 | string | - | - | Notebook 名称。 |
| `notebook_path` | 否 | string | - | - | Notebook 文件来源地址。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `201` | Successful Response | `application/json`：`OpenApiResponse_OpenMachineLearningDatasetCreateResponse_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "id": 1001,
    "dataset_name": "ml_text_dataset",
    "description": "文本分类数据集",
    "project_id": 35,
    "version": "V2",
    "dataset_category": "machine_learning",
    "task_type": "text_classification",
    "data_type": "text",
    "data_source": "local_upload",
    "notebook_id": null,
    "notebook_name": null,
    "notebook_path": null,
    "annotation_type": "text_classification",
    "template_type": "text_classification_single_label",
    "is_annotated": true,
    "source_type": "jsonl",
    "storage_path": "datasets/machine-learning/dataset_1001/",
    "dataset_path": "datasets/machine-learning/dataset_1001/dataset.jsonl",
    "label_schema_path": null,
    "sample_count": 120,
    "file_size": 1.25,
    "created_at": "2026-06-03T10:00:00+08:00",
    "updated_at": "2026-06-03T10:00:00+08:00",
    "created_by": "admin"
  },
  "request_id": "req-202606030001"
}
```
