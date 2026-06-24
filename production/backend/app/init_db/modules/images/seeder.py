"""
镜像数据种子管理器
"""

from typing import Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import RepositoryImages, RepositoryResource
from app.schemas.repository_image import ImageType, ImageSource
from app.utils.timezone_utils import get_current_shanghai_time
from .data import get_image_data


class ImageSeeder:
    """镜像数据种子管理器"""
    
    name = "images"
    
    async def seed(self, session:AsyncSession) -> Dict[str, Any]:
        """执行镜像数据初始化"""
        print(f"开始初始化 {self.name} 数据...")
        
        # 获取种子数据
        seed_data = get_image_data()
        if not seed_data:
            print(f"没有 {self.name} 数据需要初始化")
            return {"created": 0, "skipped": 0, "errors": 0}
        
        # async with get_db_session() as session:
        # 查询已经存在的仓库
        repository_result = await session.execute(select(RepositoryResource))
        existing_repository = repository_result.scalars().all()

        if not existing_repository:
            print("没有找到仓库资源，跳过镜像初始化")
            return {"created": 0, "skipped": 0, "errors": 0}

        # 检查已存在的镜像
        names = [image["image"] for image in seed_data]
        created = 0
        updated = 0
        skipped = 0

        for repository in existing_repository:
            stmt = select(RepositoryImages).where(RepositoryImages.image.in_(names),
                                                  RepositoryImages.tenant_id == repository.tenant_id,
                                                  RepositoryImages.repository_id == repository.id,
                                                  RepositoryImages.image_source == ImageSource.BUILT_IN.value)
            result = await session.execute(stmt)
            existing_images = result.scalars().all()

            # 先迁移历史 type=0（原 NOTEBOOK）到 LLM_NOTEBOOK
            for image in existing_images:
                if image.type == 0:
                    image.type = ImageType.LLM_NOTEBOOK.value
                    image.updated_at = get_current_shanghai_time()
                    updated += 1

            # 构建索引：(image, type) -> image
            existing_image_map = {
                (image.image, image.type): image for image in existing_images
            }

            for image_data in seed_data:
                target_type = int(image_data.get("type"))

                key = (image_data.get("image"), target_type)
                existing_image = existing_image_map.get(key)

                if existing_image:
                    changed = False
                    compare_fields = {
                        "sub_type": image_data.get("sub_type"),
                        "describe": image_data.get("describe"),
                        "namespace": repository.namespace,
                        "card_category": image_data.get("card_category"),
                        "card_model": image_data.get("card_model"),
                        "cuda_version": image_data.get("cuda_version"),
                        "python_version": image_data.get("python_version"),
                        "image_source": ImageSource.BUILT_IN.value,
                    }
                    for field, expected in compare_fields.items():
                        if getattr(existing_image, field) != expected:
                            setattr(existing_image, field, expected)
                            changed = True
                    if changed:
                        existing_image.updated_at = get_current_shanghai_time()
                        updated += 1
                    else:
                        print(f"镜像已存在且无变化，跳过: {image_data['image']} (type={target_type})")
                        skipped += 1
                    continue

                # 不存在则新增
                now = get_current_shanghai_time()
                new_image = RepositoryImages(
                    image=image_data.get("image"),
                    type=target_type,
                    sub_type=image_data.get("sub_type"),
                    repository_id=repository.id,
                    describe=image_data.get("describe"),
                    namespace=repository.namespace,
                    card_category=image_data.get("card_category"),
                    card_model=image_data.get("card_model"),
                    cuda_version=image_data.get("cuda_version"),
                    python_version=image_data.get("python_version"),
                    image_source=ImageSource.BUILT_IN.value,
                    created_id=0,
                    created_by='system',
                    created_at=now,
                    updated_at=now,
                    tenant_id=repository.tenant_id,
                )
                session.add(new_image)
                existing_image_map[key] = new_image
                created += 1

        if created or updated:
            print(f"镜像初始化完成：新增 {created}，更新 {updated}，跳过 {skipped}")
        else:
            print("所有镜像都已存在且无变更")

        print(f"✅ {self.name} 初始化完成 - 创建: {created}, 更新: {updated}, 跳过: {skipped}")
        return {"created": created, "updated": updated, "skipped": skipped, "errors": 0}
