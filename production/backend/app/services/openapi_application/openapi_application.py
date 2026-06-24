import copy
import secrets
import uuid
from typing import List, Optional

from fastapi import HTTPException
from fastapi_pagination import Page
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from starlette import status

from app.models.models import OpenAPIApplicationModel
from app.repository.base_mapper import BaseMapper
from app.schemas.openapi_application import (
    OpenAPIApplicationCreateRequest,
    OpenAPIApplicationResponse,
    OpenAPIApplicationUpdateRequest,
)
from app.services.openapi_application.interface import OpenAPIApplicationService
from app.utils.apisix_admin_client import APISIXAdminClient
from app.utils.openapi_secret_crypto import decrypt_openapi_secret, encrypt_openapi_secret
from app.utils.user_info_context import get_current_jwt_payload


class DefaultOpenAPIApplicationService(OpenAPIApplicationService):

    def __init__(self, mapper: BaseMapper) -> None:
        self.mapper = mapper
        self.apisix_client = APISIXAdminClient()

    async def create(self, request: OpenAPIApplicationCreateRequest) -> bool:
        jwt_payload = self._get_current_jwt_payload()
        current_user = jwt_payload.userInfo
        key_id = str(uuid.uuid4())
        secret_key = secrets.token_urlsafe(32)
        plugins = self.apisix_client.build_consumer_plugins(key_id, secret_key, jwt_payload)
        encrypted_secret_key = encrypt_openapi_secret(secret_key)
        instance = OpenAPIApplicationModel(
            **request.model_dump(),
            key_id=key_id,
            secret_key=encrypted_secret_key,
            plugins=self._encrypt_plugins_secret_key(plugins),
            created_id=current_user.userId,
            created_by=current_user.username,
            tenant_id=current_user.tenantId,
        )
        try:
            await self.mapper.insert(instance)
            await self.mapper.flush()
            await self.apisix_client.upsert_consumer(
                key_id=instance.key_id,
                secret_key=secret_key,
                jwt_payload=jwt_payload,
                description=instance.description,
            )
            await self.mapper.commit()
            return True
        except IntegrityError as exc:
            await self.mapper.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="key_id 生成重复，请重试") from exc
        except Exception:
            await self.mapper.rollback()
            raise

    async def update(
        self,
        application_id: int,
        request: OpenAPIApplicationUpdateRequest,
    ) -> bool:
        jwt_payload = self._get_current_jwt_payload()
        instance = await self._get_application(application_id)
        secret_key = decrypt_openapi_secret(instance.secret_key)
        update_data = request.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(instance, key, value)

        plugins = self.apisix_client.build_consumer_plugins(instance.key_id, secret_key, jwt_payload)
        instance.plugins = self._encrypt_plugins_secret_key(plugins)

        try:
            await self.apisix_client.upsert_consumer(
                key_id=instance.key_id,
                secret_key=secret_key,
                jwt_payload=jwt_payload,
                description=instance.description,
            )
            await self.mapper.commit()
            return True
        except IntegrityError as exc:
            await self.mapper.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="OpenAPI 应用数据已存在") from exc
        except Exception:
            await self.mapper.rollback()
            raise

    async def list_applications(
        self,
        page_num: Optional[int],
        page_size: Optional[int],
        name: Optional[str] = None,
        group_id: Optional[str] = None,
        key_id: Optional[str] = None,
    ) -> Page[OpenAPIApplicationResponse]:
        query = select(OpenAPIApplicationModel).order_by(OpenAPIApplicationModel.created_at.desc())
        if name:
            query = query.where(OpenAPIApplicationModel.name.ilike(f"%{name}%"))
        if group_id:
            query = query.where(OpenAPIApplicationModel.group_id == group_id)
        if key_id:
            query = query.where(OpenAPIApplicationModel.key_id == key_id)
        data = await self.mapper.query_page(query, page_num, page_size)
        data.items = [self._build_decrypted_response(item) for item in data.items]
        return data

    async def detail(self, application_id: int) -> OpenAPIApplicationResponse:
        instance = await self._get_application(application_id)
        return self._build_decrypted_response(instance)

    async def delete(self, ids: List[int]) -> None:
        if not ids:
            return None

        instances = await self.mapper.query(
            select(OpenAPIApplicationModel).where(OpenAPIApplicationModel.id.in_(ids))
        )
        if not instances:
            return None

        try:
            for instance in instances:
                await self.apisix_client.delete_consumer(instance.key_id)
            await self.mapper.delete_condition(delete(OpenAPIApplicationModel).where(OpenAPIApplicationModel.id.in_(ids)))
            await self.mapper.commit()
            return None
        except Exception:
            await self.mapper.rollback()
            raise

    async def _get_application(self, application_id: int) -> OpenAPIApplicationModel:
        instance = await self.mapper.query_one(
            select(OpenAPIApplicationModel).where(OpenAPIApplicationModel.id == application_id)
        )
        if not instance:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OpenAPI 应用不存在")
        return instance

    def _get_current_jwt_payload(self):
        jwt_payload = get_current_jwt_payload()
        if not jwt_payload:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未获取到当前登录用户信息")
        return jwt_payload

    def _encrypt_plugins_secret_key(self, plugins: dict) -> dict:
        encrypted_plugins = copy.deepcopy(plugins or {})
        hmac_auth = encrypted_plugins.get("hmac-auth") or {}
        if hmac_auth.get("secret_key"):
            hmac_auth["secret_key"] = encrypt_openapi_secret(hmac_auth["secret_key"])
        encrypted_plugins["hmac-auth"] = hmac_auth
        return encrypted_plugins

    def _decrypt_plugins_secret_key(self, plugins: dict) -> dict:
        decrypted_plugins = copy.deepcopy(plugins or {})
        hmac_auth = decrypted_plugins.get("hmac-auth") or {}
        if hmac_auth.get("secret_key"):
            hmac_auth["secret_key"] = decrypt_openapi_secret(hmac_auth["secret_key"])
        decrypted_plugins["hmac-auth"] = hmac_auth
        return decrypted_plugins

    def _build_decrypted_response(self, instance: OpenAPIApplicationModel) -> OpenAPIApplicationResponse:
        response = OpenAPIApplicationResponse.model_validate(instance)
        response.secret_key = decrypt_openapi_secret(response.secret_key)
        response.plugins = self._decrypt_plugins_secret_key(response.plugins)
        return response
