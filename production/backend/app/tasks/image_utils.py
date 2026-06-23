"""
Celery 任务公共镜像查询工具

注意：Celery 任务中不能使用 AutoContainer 的共享服务，
因为这会导致多个并发任务共享同一个数据库连接，引发 InterfaceError。
这个模块提供了独立的镜像查询函数，使用 get_db_session 创建独立的数据库会话。
"""
from typing import Optional

from sqlalchemy import select, func

from app.core import settings
from app.database.base import get_db_session
from app.models.models import RepositoryImages, RepositoryResource, KubernetesRepositoryRelation, \
    ProjectKubernetesRelation
from app.core.logging import logger


async def find_image_by_project(
        project_id: int,
        image_type: int,
        card_category: Optional[str] = None,
        card_model: Optional[str] = None,
        is_card_model_null: bool = False
) -> Optional[str]:
    """
    根据项目ID和配置查询镜像地址
    
    适用于 Celery 任务中的镜像查询，使用 get_db_session 创建独立的数据库会话，
    避免使用共享的 AutoContainer 服务导致的并发问题。
    
    Args:
        project_id: 项目ID
        image_type: 镜像类型（ImageType 枚举的 value）
        card_category: 显卡类型（如 'GPU', 'CPU'），可选
        card_model: 显卡型号（如 'A800'），可选
        is_card_model_null: 是否查询 card_model 为 NULL 的镜像（默认镜像）
    
    Returns:
        Optional[str]: 镜像地址，如果未找到返回 None
    """
    PROVIDER_TYPE = settings.PROVIDER_TYPE
    if PROVIDER_TYPE == 'belle':
        from app.core.depend_manager import AutoContainer
        from app.schemas.repository_image import ImageType
        repository_image_service = AutoContainer.repository_image_service()

        # 根据 card_type 和 card_model 查找匹配的镜像
        # 先尝试查找指定 card_model 的镜像
        image_list = await repository_image_service.find_image_list_by_project_id(
            project_id=project_id,
            type=ImageType(image_type),
            card_category=card_category,
            card_model=card_model,
            is_card_model_null=is_card_model_null,
        )
        if image_list:
            latest_image = max(image_list, key=lambda image: getattr(image, "id", 0) or 0)
            return latest_image.image_address
        return None
    else:
        async with get_db_session() as db:
            # 构建查询：只选择 image_address 字段，避免查询不存在的列（如 sub_type）
            query = (
                select(
                    func.concat(
                        func.concat(
                            func.replace(
                                func.replace(RepositoryResource.repository_address, "https://", ""),
                                "http://", ""
                            ),
                            "/", RepositoryImages.namespace
                        ),
                        "/", RepositoryImages.image
                    ).label("image_address")
                )
                .join(RepositoryResource, RepositoryResource.id == RepositoryImages.repository_id)
                .join(KubernetesRepositoryRelation, KubernetesRepositoryRelation.repository_id == RepositoryImages.repository_id)
                .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesRepositoryRelation.k8s_id)
                .where(ProjectKubernetesRelation.project_id == project_id)
                .where(RepositoryImages.type == image_type)
                .order_by(RepositoryImages.created_at.desc())
            )

            if card_category:
                query = query.where(RepositoryImages.card_category == card_category)

            if is_card_model_null:
                query = query.where(RepositoryImages.card_model.is_(None))
            elif card_model:
                query = query.where(RepositoryImages.card_model == card_model)

            result = await db.execute(query)
            row = result.first()

            if row:
                return row[0]
            return None


async def find_image_with_fallback(
        project_id: int,
        image_type: int,
        card_category: Optional[str] = None,
        card_model: Optional[str] = None,
        error_message_prefix: str = "未找到匹配的镜像"
) -> str:
    """
    根据项目ID和配置查询镜像地址，带回退逻辑
    
    首先尝试精确匹配 card_model，如果未找到则回退到查询 card_model 为 NULL 的默认镜像。
    
    Args:
        project_id: 项目ID
        image_type: 镜像类型（ImageType 枚举的 value）
        card_category: 显卡类型（如 'GPU', 'CPU'），可选
        card_model: 显卡型号（如 'A800'），可选
        error_message_prefix: 错误消息前缀
    
    Returns:
        str: 镜像地址
    
    Raises:
        RuntimeError: 如果未找到匹配的镜像
    """
    # 先尝试精确匹配
    image_address = await find_image_by_project(
        project_id=project_id,
        image_type=image_type,
        card_category=card_category,
        card_model=card_model
    )
    
    # 如果未找到，尝试查找 card_model 为 NULL 的默认镜像
    if not image_address:
        logger.info(
            f"未找到 card_model={card_model} 的精确匹配镜像，尝试使用默认镜像: "
            f"project_id={project_id}, card_category={card_category}"
        )
        image_address = await find_image_by_project(
            project_id=project_id,
            image_type=image_type,
            card_category=card_category,
            is_card_model_null=True
        )
    
    if not image_address:
        raise RuntimeError(
            f"{error_message_prefix}: project_id={project_id}, "
            f"card_category={card_category}, card_model={card_model}"
        )
    
    return image_address

