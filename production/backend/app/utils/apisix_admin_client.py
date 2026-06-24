import os
from typing import Any, Dict

import httpx
from fastapi import HTTPException
from starlette import status

from app.core.logging import logger
from app.models.models import JWTPayLoad


class APISIXAdminClient:
    """APISIX Admin API 客户端"""

    def __init__(self) -> None:
        self.consumers_url = os.getenv(
            "APISIX_ADMIN_HOST",
            "http://127.0.0.1:9180",
        ).rstrip("/") + "/apisix/admin/consumers"
        self.api_key = os.getenv("APISIX_ADMIN_API_KEY", "")
        self.timeout = float(os.getenv("APISIX_ADMIN_TIMEOUT", "10"))
        self.clock_skew = int(os.getenv("APISIX_HMAC_AUTH_CLOCK_SKEW", "300"))

    async def upsert_consumer(
        self,
        key_id: str,
        secret_key: str,
        jwt_payload: JWTPayLoad,
        description: str | None = None,
    ) -> None:
        payload = {
            "username": key_id,
            "desc": description or "",
            "plugins": self.build_consumer_plugins(key_id, secret_key, jwt_payload),
        }
        await self._request("PUT", self.consumers_url, json=payload)

    async def delete_consumer(self, key_id: str) -> None:
        await self._request("DELETE", f"{self.consumers_url}/{key_id}", ignore_not_found=True)

    async def _request(self, method: str, url: str, ignore_not_found: bool = False, **kwargs) -> None:
        if not self.api_key:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="APISIX_ADMIN_API_KEY 未配置")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                logger.error(f"url: {url}")
                response = await client.request(
                    method,
                    url,
                    headers={"X-API-KEY": self.api_key},
                    **kwargs,
                )
                if ignore_not_found and response.status_code == status.HTTP_404_NOT_FOUND:
                    return
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.exception("APISIX 请求失败: %s", exc.response.text)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"APISIX 请求失败：{exc.response.text}",
            ) from exc
        except httpx.HTTPError as exc:
            logger.exception("APISIX 请求异常")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"APISIX 请求异常：{str(exc)}",
            ) from exc

    def build_consumer_plugins(
        self,
        key_id: str,
        secret_key: str,
        jwt_payload: JWTPayLoad,
    ) -> Dict[str, Any]:
        user_info = jwt_payload.model_dump(mode="json")

        return {
            "iam-token": {
                "user_info": user_info,
            },
            "hmac-auth": {
                "key_id": key_id,
                "secret_key": secret_key,
                "clock_skew": self.clock_skew,
            },
        }
