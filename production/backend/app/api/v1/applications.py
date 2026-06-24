import os
from typing import Dict, Any, Tuple

import httpx
from fastapi import APIRouter,Depends
from dependency_injector.wiring import inject, Provide
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import KubernetesResource, JwtUserInfo
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/api/v1/config", tags=["applications"])

@router.get("", response_model=Dict[str, Any])
# @inject
async def get_application_config():
    """
    工程默认配置
    """

    config = {
        'PROVIDER_TYPE': os.getenv('PROVIDER_TYPE', 'default')  # 工程实现
    }
    # DGI SERVICE
    DGI_SERVICE_HEALTH_URL = get_env('DGI_SERVICE_HEALTH_URL')
    DGI_SERVICE_HEALTH_STATUS = False
    if DGI_SERVICE_HEALTH_URL:
        try:
            async with httpx.AsyncClient(timeout=1.0) as c:
                r = await c.get(DGI_SERVICE_HEALTH_URL)
                if r.status_code == 200 and r.json()['status'] == 'healthy':
                    DGI_SERVICE_HEALTH_STATUS = True
        except Exception as e:
            DGI_SERVICE_HEALTH_STATUS = False

    config.update({
        'DGI_SERVICE_HEALTH_URL': DGI_SERVICE_HEALTH_URL,
        'DGI_SERVICE_HEALTH_STATUS': DGI_SERVICE_HEALTH_STATUS,
    })

    # ==================== 全局配置notebook内部端口数量设置 ====================
    NOTEBOOK_MAX_OPEN_PORTS = os.getenv("NOTEBOOK_MAX_OPEN_PORTS", 5)
    config.update({
        'NOTEBOOK_MAX_OPEN_PORTS': NOTEBOOK_MAX_OPEN_PORTS,
    })

    # ==================== minio文件下载接口地址 ====================
    LAB_EXPORT_PATH = get_env('LAB_EXPORT_PATH')    
    if LAB_EXPORT_PATH:
        MINIO_DOWNLOAD_URL = f"/{LAB_EXPORT_PATH}/api/v1/storage/download-file"
    else:
        MINIO_DOWNLOAD_URL = "/api/v1/storage/download-file"
    config.update({
        'MINIO_DOWNLOAD_URL': MINIO_DOWNLOAD_URL,
    })

    return {
        "code": 0,
        "data": config,
        "msg": "成功",
    }

def get_env(name: str) -> str | None:
    v = os.getenv(name)
    return v.strip() if v and v.strip() else None