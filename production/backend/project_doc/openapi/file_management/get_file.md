# 查询文件详情

## 接口详情

- 方法路径：`GET /openapi/lab/v1/file-management/files/{file_id}`
- Operation ID：`openapi_v1_file_management_get_file`
- 简述：查询指定文件的详细信息。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `file_id` | path | 是 | integer | - | - | 文件 ID。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenFileManagementFile_` |
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
  "request_id": "req-202606010007"
}
```
