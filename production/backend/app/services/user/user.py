import logging
from abc import ABC
from typing import List
import math

from fastapi import HTTPException, status

from app.core import settings
from app.schemas.menu import MenuItem
from app.schemas.role import RoleItem
from app.schemas.user import UserVoResponse, UserItem
from app.schemas.user_batch_query import UserBatchQuery, IAMAccountQuery
from app.schemas.user_page_payload import UserPageResponse, UserPagePayload, UserBasePagePayload, \
    UserBasePageResponse
from app.services.role import get_roles, get_admin_role, set_admin_role
from app.services.user.interface import UserService
from app.utils.http_util import get_api_client
from app.utils.user_info_context import get_current_user_info

logger = logging.getLogger(__name__)


class DefaultUserService(UserService):

    def __init__(self):
        pass

    # 此时默认上下文包含了token，非web场景报错不考虑
    async def is_main(self) -> bool:
        info = get_current_user_info()
        is_admin_role = await get_admin_role(info.accountId)
        if is_admin_role is None:
            roles = await get_roles(info.accountId)
            admin_role_name = settings.ADMIN_ROLE_NAME
            is_admin = (contain_admin_role(roles=roles,
                                           admin_role_name=admin_role_name)
                        or info.username == info.enterpriseCode)
            await set_admin_role(info.accountId, is_admin)
            # 主账号的判断精简，主账号由于在控制台上无法配置角色，需要在iam上配置，比较麻烦这里直接精简处理
            return is_admin
        else:
            return is_admin_role

    async def refresh_main(self):
        info = get_current_user_info()
        roles = await get_roles(info.accountId)
        admin_role_name = settings.ADMIN_ROLE_NAME
        is_admin = (contain_admin_role(roles=roles,
                                       admin_role_name=admin_role_name)
                    or info.username == info.enterpriseCode)
        await set_admin_role(info.accountId, is_admin)
        pass

    # 获取user列表，通过userName和userId过滤
    async def user_infos(self, ids: List[int], username: str, page: int, page_size: int) -> UserPagePayload:
        client = get_api_client()
        info = get_current_user_info()
        query: UserBatchQuery = UserBatchQuery()
        query.tenantId = info.tenantId
        query.userIds = ','.join(str(num) for num in ids)
        query.username = username
        query.pageSize = page_size
        query.pageNum = page
        res = await client.post(path=f"/_internal/user/queryUser", data=query.__dict__)
        obj = UserPageResponse.parse_obj(res)
        if obj.code == 0:
            user_list: UserPagePayload = obj.payload
            return user_list
        else:
            logger.error(f"调用用户接口报错 url = /_internal/user/queryUser data = {obj}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"调用用户接口报错, {obj.msg}"
            )

    async def iam_ignore_user_infos(self, ids: List[int], username: str, page: int,
                                    page_size: int) -> UserBasePagePayload:
        client = get_api_client()
        info = get_current_user_info()
        iamQuery: IAMAccountQuery = IAMAccountQuery()
        iamQuery.tenantId = info.tenantId
        # 反向查询忽略的userIds
        iamQuery.extend2 = 'not in'
        iamQuery.userIds = ','.join(str(num) for num in ids)
        iamQuery.name = username
        iamQuery.status = 0
        iamQuery.size = page_size
        iamQuery.page = page
        res = await client.post(path=f"/deepexi-client-iam-openapi/api/v1.0/user", data=iamQuery.__dict__)
        obj = UserBasePageResponse.parse_obj(res)
        if obj.code == 0:
            # 分页对象转换
            user_list: UserBasePagePayload = obj.payload
            return user_list
        else:
            logger.error(
                f"调用iam用户接口报错，忽略userIds url = /deepexi-client-iam-openapi/api/v1.0/user data = {obj}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"调用iam用户接口报错, {obj.msg}"
            )

    async def user_list(self, size: int, page: int, username: str, scope: str) -> UserPagePayload:
        para = {
            "pageSize": size,
            "pageNum": page,
            "username": username,
            "status": 0 # 启用状态
        }
        client = get_api_client()
        res = await client.get(path="/v1/user", params=para)
        obj = UserPageResponse.parse_obj(res)
        if obj.code == 0:
            payload = obj.payload
            
            # 当 scope="create_project" 时，排除租户管理员
            if scope == "create_project":
                payload = await self._filter_admins_from_user_list(payload)
            
            return payload
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=obj.msg
            )
    
    async def _filter_admins_from_user_list(self, payload: UserPagePayload) -> UserPagePayload:
        """
        从用户列表中过滤掉租户管理员账号
        
        租户管理员：账号 = 租户code（username == enterpriseCode）
        
        Args:
            payload: 用户分页数据
            
        Returns:
            过滤后的用户分页数据
        """
        current_user = get_current_user_info()
        if current_user is None:
            logger.warning("无法获取当前用户信息，跳过管理员过滤")
            return payload
        
        # 过滤用户列表
        filtered_rows = []
        for user in payload.rows:
            # 检查是否是租户管理员（通过 username 判断：账号 = 租户code）
            if user.username == current_user.enterpriseCode:
                continue
            
            # 不是管理员，保留
            filtered_rows.append(user)
        
        filtered_count = len(filtered_rows)
        filtered_total = max(0, payload.total - (len(payload.rows) - filtered_count))
        filtered_total_pages = math.ceil(filtered_total / payload.size) if payload.size > 0 else 0
        
        # 创建新的 payload 对象
        filtered_payload = UserPagePayload(
            total=filtered_total,
            rows=filtered_rows,
            number=payload.number,
            size=payload.size,
            totalPages=filtered_total_pages
        )
        
        return filtered_payload

    async def user_id(self, user_id: int) -> UserItem:
        client = get_api_client()
        res = await client.get(path=f"/v1/user/{user_id}/user-id")
        obj = UserVoResponse.parse_obj(res)
        if obj.code == 0:
            return obj.payload
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=obj.msg
            )


def contain_menu(menus: List[MenuItem]):
    if menus is not None:
        for menu in menus:
            if menu.code == "admin":
                return True
            else:
                contain_menu(menu.children)


def contain_admin_role(roles: List[RoleItem], admin_role_name: str):
    if roles is not None and len(roles) > 0:
        for role in roles:
            if role is not None and role.name == admin_role_name:
                return True

    return False
