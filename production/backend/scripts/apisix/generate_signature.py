import hmac
import base64
import hashlib
from datetime import datetime, timezone

key_id = "6f417058-ba86-49be-a416-9e999e8a4bcd"
secret_key = b"okqeeMRs0bD7gykRhWtizPpTpRGnWHz_sHOtnHN487k"
request_method = "GET"
request_path = "/openapi/lab/v1/training-datasets/project/35/dataset/test_apisix/version/V1/preview?page=1&size=10&usage=training"
algorithm = "hmac-sha256"


def main():

    gmt_time = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")

    signing_string = (
        f"{key_id}\n"
        f"{request_method} {request_path}\n"
        f"date: {gmt_time}\n"
    )
    signature = hmac.new(secret_key, signing_string.encode("utf-8"), hashlib.sha256).digest()

    signature_base64 = base64.b64encode(signature).decode("utf-8")

    headers = {
        "Date": gmt_time,
        "Authorization": (
            f'Signature keyId="{key_id}",algorithm="{algorithm}",'
            f'headers="@request-target date",'
            f'signature="{signature_base64}"'
        ),
    }
    print(headers)


if __name__ == "__main__":
    main()
