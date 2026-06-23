# 上传文件分片

## 接口详情

- 方法路径：`PUT /openapi/lab/v1/uploads/{upload_id}/chunks/{chunk_index}`
- Operation ID：`openapi_v1_uploads_upload_chunk`
- 简述：上传指定上传会话中的单个文件分片。分片索引从 0 开始。

## 接口说明

- 上传指定上传会话中的单个文件分片。
- `chunk_index` 从 0 开始，文件内容通过 `multipart/form-data` 的 `file` 字段提交。
- 分片上传成功时仅返回 `success` 和 `request_id`，不会返回 `data` 字段。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `upload_id` | path | 是 | string | - | - | 上传会话 ID。 |
| `chunk_index` | path | 是 | integer | - | 最小值: `0` | 分片索引，从 0 开始。 |

## 请求体

- Content-Type：`multipart/form-data`；必填：是；Schema：`Body_openapi_v1_uploads_upload_chunk`

| 字段 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `file` | 是 | string(binary) | - | - | 分片文件。 |
| `file_hash` | 是 | string | - | - | 文件 SHA-256 哈希值。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_NoneType_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "request_id": "req-202605190012"
}
```
