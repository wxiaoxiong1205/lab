# 密钥签名生成

## 用途

开放平台接口调用需要使用签名请求头完成身份校验。调用方需要使用平台分配的 `key_id` 和 `secret_key`，按固定规则生成 `Date` 和 `Authorization` 请求头。

签名用于证明请求来源，并确保请求方法、请求路径和请求时间未被篡改。

## 签名参数

| 参数 | 说明 | 示例 |
| --- | --- | --- |
| `key_id` | 平台分配的访问密钥 ID。 | `your-key-id` |
| `secret_key` | 平台分配的访问密钥 Secret，参与 HMAC 计算。 | `your-secret-key` |
| `request_method` | HTTP 请求方法，需与实际调用保持一致。 | `GET`、`POST` |
| `request_path` | 请求路径，包含 query 参数，不包含协议、域名和端口。 | `/openapi/lab/v1/training-datasets/project/35?usage=training` |
| `algorithm` | 签名算法，当前固定为 `hmac-sha256`。 | `hmac-sha256` |

## 签名规则

待签名字符串由三部分组成，使用换行符 `\n` 拼接：

```text
{key_id}
{request_method} {request_path}
date: {GMT 时间}
```

示例：

```text
your-key-id
GET /openapi/lab/v1/training-datasets/project/35?usage=training
date: Thu, 21 May 2026 03:00:00 GMT
```

签名生成流程：

1. 生成当前 UTC 时间，格式为 HTTP GMT 时间。
2. 按签名规则拼接待签名字符串。
3. 使用 `secret_key` 对待签名字符串执行 `HMAC-SHA256`。
4. 将 HMAC 结果做 `Base64` 编码，得到最终 `signature`。
5. 组装 `Date` 和 `Authorization` 请求头。

## Python 示例代码

```python
import base64
import hashlib
import hmac
from datetime import datetime, timezone

key_id = "your-key-id"
secret_key = b"your-secret-key"
request_method = "GET"
request_path = "/openapi/lab/v1/training-datasets/project/35?usage=training"
algorithm = "hmac-sha256"


def generate_signature_headers():
    gmt_time = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")

    signing_string = (
        f"{key_id}\n"
        f"{request_method} {request_path}\n"
        f"date: {gmt_time}\n"
    )

    signature = hmac.new(
        secret_key,
        signing_string.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    signature_base64 = base64.b64encode(signature).decode("utf-8")

    return {
        "Date": gmt_time,
        "Authorization": (
            f'Signature keyId="{key_id}",algorithm="{algorithm}",'
            f'headers="@request-target date",'
            f'signature="{signature_base64}"'
        ),
    }


if __name__ == "__main__":
    headers = generate_signature_headers()
    print(headers)
```

## 输出请求头示例

```json
{
  "Date": "Thu, 21 May 2026 03:00:00 GMT",
  "Authorization": "Signature keyId=\"your-key-id\",algorithm=\"hmac-sha256\",headers=\"@request-target date\",signature=\"base64-signature\""
}
```

## 使用方式

1. 将示例代码中的 `key_id` 和 `secret_key` 替换为平台分配的密钥信息。
2. 将 `request_method` 替换为实际请求方法。
3. 将 `request_path` 替换为实际请求路径和 query 参数。
4. 执行代码生成 `Date` 和 `Authorization`。
5. 调用接口时，把生成的 `Date` 和 `Authorization` 放入请求头。

## 注意事项

- `request_method` 必须与实际请求方法完全一致，建议使用大写。
- `request_path` 必须包含实际请求的 path 和 query string，不包含协议、域名和端口。
- query 参数顺序需要与实际发送请求保持一致。
- `Date` 请求头需要使用代码生成的 GMT 时间，并与签名字符串中的 `date` 保持一致。
- `secret_key` 只用于本地签名计算，不要写入前端代码、日志或公开页面。
- 如果接口请求路径或 query 参数发生变化，需要重新生成签名。
