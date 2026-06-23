# 初始化分片上传

## 接口详情

- 方法路径：`POST /openapi/lab/v1/uploads/init`
- Operation ID：`openapi_v1_uploads_create_upload`
- 简述：创建文件分片上传会话，返回后续上传分片和完成上传所需的上传会话 ID。

## 接口说明

- 分片上传的第一步，用于创建上传会话。
- 服务端会根据文件名、文件大小、分片大小和文件哈希初始化上传状态。
- 返回的 `upload_id` 用于后续上传分片、合并和查询进度。

## 参数

无。

## 请求体

- Content-Type：`application/json`；必填：是；Schema：`OpenChunkUploadInitRequest`

| 字段 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `file_name` | 是 | string | - | - | 文件名。 |
| `file_size` | 是 | integer | - | 大于: `0.0` | 文件大小，单位字节。 |
| `chunk_size` | 是 | integer | - | 大于: `0.0` | 分片大小，单位字节。 |
| `file_hash` | 是 | string | - | - | 文件 SHA-256 哈希值。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `201` | Successful Response | `application/json`：`OpenApiResponse_OpenChunkUploadInitResult_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "upload_id": "upl_202605190001",
    "exists": false
  },
  "request_id": "req-202605190011"
}
```
