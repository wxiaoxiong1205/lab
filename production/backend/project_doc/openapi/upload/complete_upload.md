# 完成分片上传

## 接口详情

- 方法路径：`POST /openapi/lab/v1/uploads/{upload_id}/complete`
- Operation ID：`openapi_v1_uploads_complete_upload`
- 简述：校验并合并指定上传会话中的所有分片，生成最终文件。

## 接口说明

- 所有分片上传完成后调用，用于校验并合并最终文件。
- `usage` 默认为 `public`；非公共用途时通常需要传入 `project_id`。
- 合并成功后响应中返回文件地址、大小、分片数量和处理时间。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `upload_id` | path | 是 | string | - | - | 上传会话 ID。 |
| `usage` | query | 否 | `ChunkUploadFileUsage`<br>可选值：`public`、`file-management` | `public` | - | 文件用途。 |
| `project_id` | query | 否 | integer | - | - | 项目 ID。非公共用途时必填。 |

## 请求体

- Content-Type：`application/json`；必填：是；Schema：`OpenChunkUploadCompleteRequest`
| 字段 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- |
| `file_hash` | 是 | string | - | - | 文件 SHA-256 哈希值。 |
| `file_name` | 是 | string | - | - | 文件名。 |
| `total_chunks` | 是 | integer | - | 大于: `0.0` | 总分片数。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | `application/json`：`OpenApiResponse_OpenChunkUploadCompleteResponse_` |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 返回示例

```json
{
  "success": true,
  "data": {
    "file_name": "customer_service_sft.jsonl",
    "file_size": 10485760,
    "upload_id": "upl_202605190001",
    "chunk_size": 5242880,
    "total_chunks": 2,
    "success": true,
    "file_url": "s3://bucket/uploads/customer_service_sft.jsonl",
    "start_time": "2026-05-19T09:00:00+08:00",
    "end_time": "2026-05-19T09:01:00+08:00"
  },
  "request_id": "req-202605190013"
}
```
