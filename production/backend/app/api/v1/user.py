import logging
from datetime import timedelta
from typing import Optional, Tuple

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, HTTPException, status, Response, Query, Header
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.depend_manager import AutoContainer
from app.database.base import get_db
from app.models.models import User, JwtUserInfo
from app.schemas.user import UserCreate, UserUpdate, User as UserSchema, Token, \
    UserItem
from app.schemas.user_page_payload import UserPagePayload
from app.services.user.interface import UserService
from app.utils.auth import get_current_active_user
from app.utils.auth import (
    get_password_hash,
    verify_password,
    create_access_token
)
from app.utils.dependencies import get_db_and_user, get_db_and_admin
from app.utils.error_messages import data_exists_error, data_not_found_error

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/users",
    tags=["user"],
    responses={404: {"description": "Not found"}},
)


# 公开路由 - 只需要数据库连接，无需用户认证
@router.post("/register", response_model=UserSchema, status_code=status.HTTP_201_CREATED)
async def create_user(
        user: UserCreate,
        db: AsyncSession = Depends(get_db)  # 公开路由，只需要数据库连接
):
    """创建新用户 - 公开接口，无需认证"""
    # Check if username already exists
    result = await db.execute(select(User).where(User.username == user.username))
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=data_exists_error(user.username)
        )

    # Check if email already exists
    result = await db.execute(select(User).where(User.email == user.email))
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=data_exists_error(user.email)
        )

    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        is_active=user.is_active,
        is_admin=user.is_admin
    )

    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    return db_user


@router.post("/login", response_model=Token)
async def login_for_access_token(
        response: Response,
        form_data: OAuth2PasswordRequestForm = Depends(),
        db: AsyncSession = Depends(get_db)  # 公开路由，只需要数据库连接
):
    """用户登录 - 公开接口，无需认证"""
    # Find user by username
    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalars().first()

    # Verify user exists and password is correct
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    # Create access token
    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "id": user.id, "is_admin": user.is_admin},
        expires_delta=access_token_expires
    )
    # 写入 HttpOnly Cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        samesite="lax",  # 根据前端域名可设置 lax 或 strict
        path="/"
    )
    return {"access_token": access_token, "token_type": "bearer"}


# 需要用户认证的路由
@router.get("/me", response_model=JwtUserInfo)
async def read_users_me(
        response: Response,
        authorization: Optional[str] = Header(None),
        current_user: User = Depends(get_current_active_user)  # 保持原有的单一依赖方式
):
    """获取当前用户信息 - 需要用户认证"""
    if authorization is None:
        return {"msg": "未登录"}
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return {"msg": "格式错误"}

    # 写入 HttpOnly Cookie
    response.set_cookie(
        key="lab_access_token",
        value=token,
        httponly=True,
        samesite="lax",  # 根据前端域名可设置 lax 或 strict
        path="/"
    )
    return current_user


# 需要管理员权限的路由
@router.get("/list")
@inject
async def list_users(
        username: Optional[str] = None,
        scope: Optional[str] = None,
        page: int = Query(1, description="页码", ge=1),
        size: int = Query(20, description="每页数量", ge=1, le=100),
        user_service: UserService = Depends(Provide[AutoContainer.user_service])
) -> UserPagePayload:
    return await user_service.user_list(page=page, size=size, username=username, scope=scope)


@router.get("/{user_id}", response_model=UserItem)
@inject
async def read_user(
        user_id: int,
        user_service: UserService = Depends(Provide[AutoContainer.user_service])
) -> UserItem:
    return await user_service.user_id(user_id)

# 废弃
@router.put("/{user_id}", response_model=UserSchema, status_code=status.HTTP_200_OK)
async def update_user(
        user_id: int,
        user_update: UserUpdate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)  # 使用组合依赖
):
    """更新用户信息 - 需要用户认证"""
    db, current_user = deps  # 解包依赖

    # Regular users can only update their own information
    if not current_user.is_admin and current_user.userId != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )

    # Check if user exists
    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalars().first()

    if db_user is None:
        # 统一错误格式：数据不存在
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=data_not_found_error()
        )

    # Prepare update data
    update_data = user_update.model_dump(exclude_unset=True)

    # Hash password if provided
    if "password" in update_data:
        update_data["hashed_password"] = get_password_hash(update_data.pop("password"))

    # Regular users cannot change their admin status
    if not current_user.is_admin and "is_admin" in update_data:
        update_data.pop("is_admin")

    # Update user
    if update_data:
        await db.execute(
            update(User)
            .where(User.id == user_id)
            .values(**update_data)
        )
        await db.commit()

    # Get updated user
    result = await db.execute(select(User).where(User.id == user_id))
    updated_user = result.scalars().first()

    return updated_user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
        user_id: int,
        deps: Tuple[AsyncSession, User] = Depends(get_db_and_admin)  # 使用管理员组合依赖
):
    """删除用户 - 需要管理员权限"""
    db, admin_user = deps  # 解包依赖

    # Check if user exists
    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalars().first()

    if db_user is None:
        # 统一错误格式：数据不存在
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=data_not_found_error()
        )

    # Delete user
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()

    return None
