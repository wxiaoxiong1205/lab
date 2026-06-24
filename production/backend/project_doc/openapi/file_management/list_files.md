# 查询文件列表

## 接口详情

- 方法路径：`GET /openapi/lab/v1/file-management/files`
- Operation ID：`openapi_v1_file_management_list_files`
- 简述：查询指定项目下的文件列表。

## 接口说明

- 支持按文件夹、文件名、文件后缀筛选。
- `suffix` 不需要包含点号，例如 `jsonl`、`jpg`。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | query | 是 | integer | - | - | 项目 ID。 |
| `folder_id` | query | 否 | integer | - | - | 文件夹 ID，为空时查询所有文件。 |
| `file_name` | query | 否 | string | - | - | 文件名模糊搜索。 |
| `suffix` | query | 否 | string | - | - | 文件后缀搜索，如 jsonl、jpg。 |
| `page` | query | 否 | integer | `1` | 最小值: `1` | 页码。 |
| `size` | query | 否 | integer | `10` | 最小值: `1`；最大值: `100` | 每页数量。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenApiPageData_OpenFileManagementFile__` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "items": [
      {
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
      }
    ],
    "page": 1,
    "size": 10,
    "total": 1,
    "pages": 1
  },
  "request_id": "req-202606010006"
}
```
