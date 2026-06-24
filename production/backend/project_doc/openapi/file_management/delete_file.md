# 删除文件

## 接口详情

- 方法路径：`DELETE /openapi/lab/v1/file-management/files`
- Operation ID：`openapi_v1_file_management_delete_file`
- 简述：删除指定文件，支持批量删除。

## 接口说明

- `file_ids` 多个 ID 使用英文逗号分隔。
- 删除文件记录，并尝试删除存储中的实际文件及关联上传记录。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `file_ids` | query | 是 | string | - | - | 文件 ID 字符串，多个 ID 使用英文逗号分隔。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_None_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "request_id": "req-202606010008"
}
```
