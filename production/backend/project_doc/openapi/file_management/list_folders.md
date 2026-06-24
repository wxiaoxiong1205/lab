# 查询文件夹列表

## 接口详情

- 方法路径：`GET /openapi/lab/v1/file-management/folders`
- Operation ID：`openapi_v1_file_management_list_folders`
- 简述：查询指定项目下的文件夹列表。

## 接口说明

- 支持按文件夹名称模糊搜索。
- 返回分页数据。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `project_id` | query | 是 | integer | - | - | 项目 ID。 |
| `folder_name` | query | 否 | string | - | - | 文件夹名称模糊搜索。 |
| `page` | query | 否 | integer | `1` | 最小值: `1` | 页码。 |
| `size` | query | 否 | integer | `10` | 最小值: `1`；最大值: `100` | 每页数量。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenApiPageData_OpenFileFolder__` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 10,
        "folder_name": "training-files",
        "description": "训练相关文件",
        "project_id": 35,
        "created_at": "2026-06-01T10:00:00+08:00",
        "updated_at": "2026-06-01T10:00:00+08:00",
        "created_by": "admin",
        "file_count": 3
      }
    ],
    "page": 1,
    "size": 10,
    "total": 1,
    "pages": 1
  },
  "request_id": "req-202606010002"
}
```
