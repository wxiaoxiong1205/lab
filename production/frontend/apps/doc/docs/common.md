# 开放平台接口公共说明

## 基础信息

- 基础路径：`/openapi/lab/v1`
- 默认语言：`zh-CN`
- 成功响应：业务接口通常返回 `OpenApiResponse`，其中 `success = true` 表示成功，`data` 为业务数据。
- 文件下载接口返回文件流；上传分片接口使用 `multipart/form-data`。

## 公共响应结构

### `OpenApiResponse`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | boolean | 请求是否成功，成功时为 `true`。 |
| `data` | T | 业务响应数据，具体结构见各接口响应体和返回示例。 |
| `request_id` | string | 请求追踪 ID。 |

### `OpenApiPageData`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `items` | array&lt;T&gt; | 当前页数据。 |
| `page` | integer | 当前页码，从 1 开始。 |
| `size` | integer | 每页数量。 |
| `total` | integer | 总记录数。 |
| `pages` | integer | 总页数。 |
