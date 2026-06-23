# 更新文件夹

## 接口详情

- 方法路径：`PUT /openapi/lab/v1/file-management/folders/{folder_id}`
- Operation ID：`openapi_v1_file_management_update_folder`
- 简述：更新文件夹名称和描述。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `folder_id` | path | 是 | integer | - | - | 文件夹 ID。 |

## 请求体

- Content-Type：`application/json`；必填：是；Schema：`OpenFileFolderUpdate`

| 字段 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `folder_name` | 否 | string | - | 最小长度: `1`；最大长度: `100` | 文件夹名称。 |
| `description` | 否 | string | - | 最大长度: `1000` | 文件夹描述，最多 1000 个字符。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenFileFolder_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 请求示例

```json
{
  "folder_name": "training-files-v2",
  "description": "更新后的文件夹描述"
}
```

## 返回示例

```json
{
  "success": true,
  "data": {
    "id": 10,
    "folder_name": "training-files-v2",
    "description": "更新后的文件夹描述",
    "project_id": 35,
    "created_at": "2026-06-01T10:00:00+08:00",
    "updated_at": "2026-06-01T10:10:00+08:00",
    "created_by": "admin",
    "file_count": 3
  },
  "request_id": "req-202606010004"
}
```
