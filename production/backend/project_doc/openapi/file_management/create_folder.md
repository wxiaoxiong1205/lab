# 创建文件夹

## 接口详情

- 方法路径：`POST /openapi/lab/v1/file-management/folders`
- Operation ID：`openapi_v1_file_management_create_folder`
- 简述：在指定项目下创建文件夹。

## 接口说明

- 用于在项目内组织文件。
- 同一项目下文件夹名称不能重复。
- `description` 最多 1000 个字符。

## 请求体

- Content-Type：`application/json`；必填：是；Schema：`OpenFileFolderCreate`

| 字段 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `folder_name` | 是 | string | - | 最小长度: `1`；最大长度: `100` | 文件夹名称。 |
| `description` | 否 | string | - | 最大长度: `1000` | 文件夹描述，最多 1000 个字符。 |
| `project_id` | 是 | integer | - | - | 项目 ID。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `201` | Successful Response | `application/json`：`OpenApiResponse_OpenFileFolder_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 请求示例

```json
{
  "folder_name": "training-files",
  "description": "训练相关文件",
  "project_id": 35
}
```

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
    "file_count": 0
  },
  "request_id": "req-202606010001"
}
```
