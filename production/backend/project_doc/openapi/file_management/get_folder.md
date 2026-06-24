# 查询文件夹详情

## 接口详情

- 方法路径：`GET /openapi/lab/v1/file-management/folders/{folder_id}`
- Operation ID：`openapi_v1_file_management_get_folder`
- 简述：查询指定文件夹详情。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `folder_id` | path | 是 | integer | - | - | 文件夹 ID。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenFileFolder_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "id": 10,
    "folder_name": "training-files",
    "description": "训练相关文件",
    "project_id": 35,
    "created_at": "2026-06-01T10:00:00+08:00",
    "updated_at": "2026-06-01T10:00:00+08:00",
    "created_by": "admin",
    "file_count": 3
  },
  "request_id": "req-202606010003"
}
```
