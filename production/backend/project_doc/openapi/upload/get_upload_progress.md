# 查询分片上传进度

## 接口详情

- 方法路径：`GET /openapi/lab/v1/uploads/{upload_id}`
- Operation ID：`openapi_v1_uploads_get_upload`
- 简述：查询指定上传会话已上传的分片索引和完成状态。

## 接口说明

- 查询指定上传会话的上传进度。
- 响应 `uploaded_chunks` 表示已成功上传的分片索引。
- 可用于断点续传或上传失败后的重试判断。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `upload_id` | path | 是 | string | - | - | 上传会话 ID。 |

## 请求体

无。

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenChunkUploadProgressResponse_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "uploaded_chunks": [
      0,
      1
    ],
    "is_complete": false
  },
  "request_id": "req-202605190014"
}
```
