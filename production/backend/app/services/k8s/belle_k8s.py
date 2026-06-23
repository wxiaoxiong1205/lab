import os
from typing import List, Any, Dict

from app.core import settings
from app.core.logging import logger
from app.repository.base_mapper import BaseMapper
from app.services.k8s.k8s import DefaultK8sService
from app.utils.belle_util import BelleUtil


class BelleK8sService(DefaultK8sService):
    """K8s集群服务实现类"""

    def __init__(self, mapper: BaseMapper) -> None:
        self.mapper = mapper
        pass

    async def k8s_resource_list(
            self,
            project_id: int
    ) -> List[Dict[str, Any]]:
        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()
        data = await belle_client.get_gpu_brands()
        if data:
            return [
                {"category": item}
                for item in data
            ]
        return []

    async def k8s_graphics_card_model_list(self, project_id: int, resource_type: str) -> List[Dict[str, Any]]:
        """获取集群显卡型号资源"""
        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()
        data = await belle_client.get_gpu_models(resource_type)
        if data:
            key, models = next(iter(data.items()), ("", []))
            return [
                {"type": key, "model": item, "desc": item}
                for item in models
            ]
        return []

    async def allocatable_list(self, project_id: int, resource_type: str, resource_card_model: str) -> Dict[str, Any]:
        """获取集群可分配显卡型号资源"""
        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()
        data = await belle_client.calc_max_resources(resource_type, resource_card_model)
        if data:
            # 由于返回的是机器最大资源，而不是可用资源，所以增加系数配置
            try:
                data['ratio'] = float(settings.BELLE_RESOURCES_RATIO)
            except ValueError as e:
                logger.warning(f"BELLE_RESOURCES_RATIO 配置值格式错误，使用默认值 {settings.BELLE_RESOURCES_RATIO_DEFAULT}: {e}")
                data['ratio'] =  settings.BELLE_RESOURCES_RATIO_DEFAULT
            return data
        return {}