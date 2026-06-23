import json
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database.base import get_db
from app.models.models import User, JWTPayLoad, JwtUserInfo
from app.schemas.user import TokenData
from app.core.config import settings
from app.utils import app_runtime_context
from app.utils.user_info_context import get_current_jwt_payload as get_context_jwt_payload, set_current_user_info

# Security utilities
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generate a password hash."""
    return pwd_context.hash(password)


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    return encoded_jwt


def decode_token(token: str) -> Dict[str, Any]:
    """Decode a JWT token and return the payload."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return {}


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    """Get a user by username."""
    result = await db.execute(select(User).where(User.username == username))
    return result.scalars().first()


async def authenticate_user(db: AsyncSession, username: str, password: str) -> Optional[User]:
    """Authenticate a user."""
    user = await get_user_by_username(db, username)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)
) -> JwtUserInfo:
    """Get the current authenticated user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # 从credentials中提取token
        token = credentials.credentials
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        obj = JWTPayLoad.model_validate(payload)
        # 设置tenantId到当前上下文，给后边使用
        info = obj.userInfo
        app_runtime_context.set_tenant_id(info.tenantId)
        app_runtime_context.set_san_yuan_tag(obj.isSanYuan)
        set_current_user_info(info)
        return info
    except JWTError:
        raise credentials_exception


async def get_current_user_from_token(token: str) -> JwtUserInfo:
    """从 token 字符串获取当前用户信息（用于从 Cookie 等非标准来源获取 token 的场景）
    
    Args:
        token: JWT token 字符串
        
    Returns:
        JwtUserInfo: 用户信息
        
    Raises:
        HTTPException: token 无效时抛出 401 异常
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        obj = JWTPayLoad.model_validate(payload)
        # 设置tenantId到当前上下文，给后边使用
        info = obj.userInfo
        app_runtime_context.set_tenant_id(info.tenantId)
        app_runtime_context.set_san_yuan_tag(obj.isSanYuan)
        set_current_user_info(info)
        return info
    except JWTError:
        raise credentials_exception


async def get_current_jwt_payload(
) -> JWTPayLoad:
    """从认证中间件上下文获取当前登录用户完整 JWT payload。"""
    payload = get_context_jwt_payload()
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """Get the current active user."""
    return current_user


async def get_current_admin_user(current_user: JwtUserInfo = Depends(get_current_user)) -> JwtUserInfo:
    """Get the current admin user."""
    return current_user
