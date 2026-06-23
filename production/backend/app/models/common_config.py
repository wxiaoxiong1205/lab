from typing import Optional
from sqlalchemy import Column, String, Index
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped
from app.models.models import baseModel


class CommonConfig(baseModel):
    """通用配置表
    
    用于存储系统通用配置项，支持键值对形式的配置管理
    """
    __tablename__ = "common_config"
    
    config_key: Mapped[str] = Column(String(200), nullable=False, comment="配置键（唯一标识）")
    config_value: Mapped[str] = Column(String(2000), nullable=False, comment="配置值")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="配置描述")
    
    __table_args__ = (
        Index('idx_common_config_key', 'config_key'),
    )

