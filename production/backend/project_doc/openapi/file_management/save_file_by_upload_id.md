# 保存上传文件信息

## 接口详情

- 方法路径：`POST /openapi/lab/v1/file-management/files/add`
- Operation ID：`openapi_v1_file_management_save_file_by_upload_id`
- 简述：根据上传会话 ID 保存文件信息。

## 接口说明

- 在分片上传完成后调用。
- 根据 `upload_id` 从上传会话中读取文件信息，并保存到文件管理。
- 上传会话必须已完成。
- `folder_id` 可不传，不传时保存到根目录。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `upload_id` | query | 是 | string | - | - | 上传会话 ID。 |
| `project_id` | query | 是 | integer | - | - | 项目 ID。 |
| `folder_id` | query | 否 | integer | - | - | 文件夹 ID，为空表示根目录。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `201` | Successful Response | `application/json`：`OpenApiResponse_OpenFileManagementFile_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "id": 101,
    "file_name": "customer_service_sft.jsonl",
    "file_size": 102400,
    "file_hash": "sha256-example",
    "file_path": "/deepexilab-35/files/customer_service_sft.jsonl",
    "folder_id": 10,
    "folder_name": "training-files",
    "project_id": 35,
    "upload_id": "upload_id_1",
    "created_at": "2026-06-01T10:20:00+08:00",
    "created_by": "admin"
  },
  "request_id": "req-202606010009"
}
```
