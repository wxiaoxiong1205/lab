from typing import Optional
from fastapi import HTTPException
from fastapi_pagination import Page
from sqlalchemy import select
from app.core.logging import logger
from app.models.common_config import CommonConfig
from app.services.common_config.interface import CommonConfigService
from app.schemas.common_config import CommonConfigResponse
from app.models.models import JwtUserInfo
from app.utils import app_runtime_context


class DefaultCommonConfigService(CommonConfigService):
    """通用配置服务实现类"""
    
    async def list_configs(
        self,
        key: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
    ) -> Page[CommonConfigResponse]:
        """获取配置列表（分页）"""

        tenant_id = app_runtime_context.get_tenant_id()
        app_runtime_context.set_tenant_id(None)

        query = select(CommonConfig)
        
        # 按键模糊搜索
        if key:
            query = query.filter(CommonConfig.config_key.ilike(f"%{key}%"))
        
        # 按更新时间倒序
        query = query.order_by(CommonConfig.updated_at.desc())
        
        # 分页查询
        result = await self.mapper.query_page(query, page, size)

        app_runtime_context.set_tenant_id(tenant_id)
        
        # 转换为响应模型
        items = [CommonConfigResponse.model_validate(item) for item in result.items]
        
        return Page[CommonConfigResponse](
            items=items,
            total=result.total,
            page=result.page,
            size=result.size,
            pages=result.pages
        )
    
    async def get_config(
        self,
        config_id: int
    ) -> CommonConfigResponse:
        tenant_id = app_runtime_context.get_tenant_id()
        app_runtime_context.set_tenant_id(None)
        """获取配置详情"""
        config = await self.mapper.query_one(
            select(CommonConfig).filter(CommonConfig.id == config_id)
        )
        
        if not config:
            raise HTTPException(
                status_code=404,
                detail=f"配置不存在: {config_id}"
            )

        app_runtime_context.set_tenant_id(tenant_id)
        
        return CommonConfigResponse.model_validate(config)
    
    async def get_config_by_key(
        self,
        key: str
    ) -> Optional[CommonConfigResponse]:
        """根据键获取配置"""
        tenant_id = app_runtime_context.get_tenant_id()
        app_runtime_context.set_tenant_id(None)
        config = await self.mapper.query_one(
            select(CommonConfig).filter(CommonConfig.config_key == key)
        )
        
        if not config:
            return None

        app_runtime_context.set_tenant_id(tenant_id)
        
        return CommonConfigResponse.model_validate(config)
