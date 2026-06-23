import re
from datetime import datetime
from typing import Optional, List, Any

from pydantic import BaseModel, EmailStr, Field, validator

from app.schemas.common import BaseModelWithTimezone, ResModel


# 控制台的返回响应内容格式

class UserItem(BaseModel):
    """分页列表中的单个用户详情模型"""
    tenantId: str = Field(description="租户ID")
    accountId: int = Field(description="账号ID")
    userId: int = Field(description="用户ID")
    username: str = Field(description="用户名")
    nickname: str = Field(description="用户昵称")
    phone: str = Field(description="手机号（脱敏显示）")
    email: str = Field(description="邮箱（脱敏显示）")
    status: int = Field(description="用户状态（0=正常，1=禁用等）")
    krb5ConfFileName: Optional[str] = Field(default=None, description="krb5 配置文件名")
    keytabFileName: Optional[str] = Field(default=None, description="keytab 文件名")
    principal: Optional[str] = Field(default=None, description="认证主体（如：test_bur_11@DEEPEXI.COM）")
    isMain: Optional[bool] = Field(description="是否为主账号")
    userAttrValueList: Optional[Any] = Field(default=None, description="用户属性列表，可后续扩展具体模型")
    tokenQuota: Optional[int] = Field(default=None, description="令牌配额")
    isInfinite: Optional[bool] = Field(description="是否无限配额")


class IamUserItem(BaseModel):
    """用户信息模型"""
    tenantId: Optional[str] = None  # 租户id
    id: Optional[int] = None  # ID
    username: Optional[str] = None  # 帐号名
    email: Optional[str] = None  # 邮箱
    phone: Optional[str] = None  # 手机号
    status: Optional[int] = None  # 帐号状态[0-启用,1-禁用]
    nickname: Optional[str] = None  # 姓名
    avatar: Optional[str] = None  # 头像
    gender: Optional[int] = None  # 性别（0：男，1：女）
    accountId: Optional[int] = None  # 账号ID
    isMain: Optional[bool] = None  # 是否主账号
    extend1: Optional[int] = None  # 扩展字段1
    extend2: Optional[str] = None  # 扩展字段2
    extend3: Optional[str] = None  # 扩展字段3
    createdTime: Optional[datetime] = None  # 创建时间[或注册时间]
    groupCount: Optional[int] = None  # 部门数量


class UserVoResponse(ResModel[UserItem]):
    """用户分页列表查询的完整响应模型"""
    pass


class UserBase(BaseModel):
    username: str
    email: EmailStr
    is_active: bool = True
    is_admin: bool = False


class UserCreate(UserBase):
    password: str

    @validator('username')
    def validate_username(cls, v):
        if not v:
            raise ValueError('用户名不能为空')
        if not bool(re.fullmatch(r'[A-Za-z]+', v)):
            raise ValueError('用户名限制为全英文')
        return v

    @validator('password')
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('密码长度不能少于 8 位')

        has_upper = bool(re.search(r'[A-Z]', v))
        has_lower = bool(re.search(r'[a-z]', v))
        has_digit = bool(re.search(r'\d', v))

        # 统计满足几类
        classes = sum([has_upper, has_lower, has_digit])
        if classes < 2:
            raise ValueError('密码必须包含大写字母、小写字母、数字中的至少两类')
        return v


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None

    @validator('username')
    def validate_username(cls, v):
        if not v:
            raise ValueError('用户名不能为空')
        if not bool(re.fullmatch(r'[A-Za-z]+', v)):
            raise ValueError('用户名限制为全英文')
        return v


class UserInDB(UserBase, BaseModelWithTimezone):
    id: int
    created_at: datetime
    updated_at: datetime


class User(UserInDB):
    pass


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: str
    user_id: int
    is_admin: bool


class UserIds(BaseModel):
    user_ids: List[int] = Field(..., min_length=1, description="用户ID列表")

    @validator('user_ids')
    def validate_cluster_ids(cls, v):
        if not v:
            raise ValueError('用户ID列表不能为空')
        if v:
            if len(v) != len(set(v)):
                raise ValueError('用户ID列表不能包含重复的ID')
        return v


class ProjectUserBatchResponse(BaseModel):
    success: bool = Field(..., description="批量处理是否成功")
