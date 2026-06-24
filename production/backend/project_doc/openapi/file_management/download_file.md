# 下载文件

## 接口详情

- 方法路径：`GET /openapi/lab/v1/file-management/files/download`
- Operation ID：`openapi_v1_file_management_download_file`
- 简述：下载单个文件或批量下载多个文件。

## 接口说明

- 单个下载：传 `file_id`。
- 批量下载：传 `file_ids`，多个 ID 使用英文逗号分隔；响应为 zip 文件流。
- `file_id` 和 `file_ids` 至少需要传一个。

## 参数

| 名称 | 位置 | 必填 | 类型 | 默认值 | 约束 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| `file_id` | query | 否 | integer | - | - | 单个文件 ID。 |
| `file_ids` | query | 否 | string | - | - | 文件 ID 字符串，多个 ID 使用英文逗号分隔。 |

## 响应

| 状态码 | 说明 | 响应体 |
| --- | --- | --- |
| `200` | Successful Response | 文件流；批量下载时为 zip 文件流 |
| `422` | Validation Error | `application/json`：`HTTPValidationError` |

## 请求示例

```bash
curl -L "https://api.example.com/openapi/lab/v1/file-management/files/download?file_id=101" \
  -H "Authorization: Bearer <token>" \
  -o customer_service_sft.jsonl
```
