from enum import Enum
from typing import Optional, Union, List, TypeVar, Any, Dict

from sqlalchemy import select, func

from app.models.models import RepositoryImages, RepositoryResource, KubernetesRepositoryRelation, \
    ProjectKubernetesRelation
from app.repository.repository_image_mapper import RepositoryImageMapper
from app.schemas.inference_task import BackendEnum
from app.schemas.repository_image import ImageType, CardType, CardModel, CudaVersion, RepositoryImageDetailResponse
from app.services.repository_image.repository_image import DefaultRepositoryImageService
from app.utils.belle_util import BelleUtil
from app.utils.timezone_utils import get_current_shanghai_time


class BelleRepositoryImageService(DefaultRepositoryImageService):
    """镜像仓库镜像服务实现类"""

    def __init__(self, mapper: RepositoryImageMapper) -> None:
        self.mapper = mapper

    async def find_image_list_by_project_id(
        self,
        project_id: int,
        type: ImageType,
        sub_type: Optional[BackendEnum] = None,
        card_category: Optional[Union[CardType, str]] = None,
        card_model: Optional[Union[CardModel, str]] = None,
        cuda_version: Optional[Union[CudaVersion, str]] = None,
        python_version: Optional[str] = None,
        is_card_model_null: Optional[bool] = False
    ) -> List[RepositoryImageDetailResponse]:
        """根据项目ID和类型获取镜像列表"""
        if not card_category:
            return []
        #处理参数转换
        card_category_str = normalize_enum_value(card_category)

        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()

        labels = [f'dipu-{card_category_str}']
        result = await belle_client.get_docker_images(labels)

        if not result:
            return []

        return [
            RepositoryImageDetailResponse.model_validate({
                "id": item.get("tag_id",0),
                "created_at": get_current_shanghai_time(),
                "updated_at": get_current_shanghai_time(),
                "image":item.get("image_name",None),
                "type":1,
                "repository_id":1,
                "namespace":"0",
                "repository_name": "0",
                "image_address": f'{item.get("image_url","")}:{item.get("tag","")}',
            })
            for item in result
        ]

E = TypeVar("E", bound=Enum)

def normalize_enum_value(value: Optional[Union[E, Any]]) -> Optional[Any]:
    """
    通用枚举转值函数：
    - 传入枚举成员 -> 返回其 .value
    - 传入其他任意类型 -> 原样返回
    - 传入 None -> 返回 None
    不校验、不抛异常。
    """
    if value is None:
        return None
    # 只要是枚举成员就取 value，其余一律直通
    return value.value if isinstance(value, Enum) else value

VENDOR_MAP: Dict[str, str] = {
    "nvidia": "GPU",
    "ascend": "NPU"
}

def normalize_card_type(vendor: str) -> str:
    """厂商名 → 通用类型"""
    return VENDOR_MAP.get(vendor.lower(), vendor.upper())