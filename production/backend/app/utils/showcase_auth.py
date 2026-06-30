"""Showcase preview authentication helpers.

This module is intentionally inert unless explicitly enabled by environment
variables. It lets the committed demo seed be exercised through production API
paths without relaxing normal production authentication.
"""

from __future__ import annotations

import os
import time
from typing import Any

from fastapi import Request


SHOWCASE_PREVIEW_TOKEN = "local-preview-lab-tenant-admin-token"
SHOWCASE_TENANT_ID = "lab"
SHOWCASE_USERNAME = "showcase_admin"
SHOWCASE_ENTERPRISE_CODE = "showcase_preview"
SHOWCASE_READ_METHODS = {"GET", "HEAD"}


def _showcase_preview_user_id() -> int:
    raw = os.getenv("SHOWCASE_PREVIEW_USER_ID", "0").strip()
    return int(raw) if raw.isdigit() else 0


def is_showcase_preview_auth_enabled() -> bool:
    return os.getenv("SHOWCASE_PREVIEW_AUTH", "").lower() in {"1", "true", "yes", "on"}


def is_showcase_preview_token(token: str | None) -> bool:
    return is_showcase_preview_auth_enabled() and token == SHOWCASE_PREVIEW_TOKEN


def is_showcase_preview_request(request: Request, token: str | None) -> bool:
    return is_showcase_preview_token(token) and request.method in SHOWCASE_READ_METHODS


def build_showcase_preview_payload() -> dict[str, Any]:
    now = int(time.time())
    user_id = _showcase_preview_user_id()
    return {
        "iamType": "showcase-preview",
        "isSanYuan": False,
        "user_name": SHOWCASE_USERNAME,
        "scope": ["showcase_read"],
        "iam_client_identifier": "showcase-preview",
        "exp": now + 7 * 24 * 60 * 60,
        "needResetPassword": False,
        "jti": "showcase-preview-token",
        "client_id": "showcase-preview",
        "userInfo": {
            "accountId": user_id,
            "userId": user_id,
            "username": SHOWCASE_USERNAME,
            "tenantId": SHOWCASE_TENANT_ID,
            "enterpriseCode": SHOWCASE_ENTERPRISE_CODE,
        },
    }
