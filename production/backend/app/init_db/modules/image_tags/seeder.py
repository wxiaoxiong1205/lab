"""
镜像数据种子管理器
"""

from collections import defaultdict
from typing import Dict, Any, List, Tuple
from sqlalchemy import select

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    RepositoryResource,
    RepositoryImages,
    TagClass,
    TagElement,
    BusinessTagRel,
)
from app.utils.timezone_utils import get_current_shanghai_time
from .data import get_image_tags_data


class ImageTagsSeeder:
    """镜像标签种子管理器"""
    
    name = "images_tags"

    async def seed(self, session: AsyncSession) -> Dict[str, Any]:
        """执行镜像标签初始化（分类、元素、元素与镜像关系）"""
        print(f"开始初始化 {self.name} 数据...")

        seed_data = get_image_tags_data()
        if not seed_data:
            print(f"没有 {self.name} 数据需要初始化")
            return {"created": 0, "skipped": 0, "errors": 0}

        # 按镜像仓库租户初始化标签分类
        repository_result = await session.execute(select(RepositoryResource.tenant_id))
        tenant_ids = {item[0] for item in repository_result.all() if item[0]}

        if not tenant_ids:
            print("未找到镜像仓库租户，跳过标签分类初始化")
            return {"created": 0, "skipped": 0, "errors": 0}

        seeded_images = self._collect_seeded_images(seed_data)
        class_names = [item["name"] for item in seed_data]
        business_types = list({item["business_type"] for item in seed_data})

        created_tag_class = 0
        skipped_tag_class = 0
        created_tag_element = 0
        skipped_tag_element = 0
        created_tag_rel = 0
        updated_tag_rel = 0
        skipped_tag_rel = 0

        for tenant_id in tenant_ids:
            # 该租户下的种子镜像（仅用于绑定关系）
            image_map: Dict[str, List[RepositoryImages]] = defaultdict(list)
            image_map_with_source: Dict[Tuple[str, str], List[RepositoryImages]] = defaultdict(list)
            image_business_ids: List[str] = []
            if seeded_images:
                image_result = await session.execute(
                    select(RepositoryImages).where(
                        RepositoryImages.tenant_id == tenant_id,
                        RepositoryImages.image.in_(seeded_images),
                    )
                )
                tenant_images = image_result.scalars().all()
                for image in tenant_images:
                    image_map[image.image].append(image)
                    image_source = image.image_source or ""
                    image_map_with_source[(image.image, image_source)].append(image)
                    image_business_ids.append(str(image.id))

            # 该租户下已存在的标签分类
            existing_result = await session.execute(
                select(TagClass).where(
                    TagClass.tenant_id == tenant_id,
                    TagClass.name.in_(class_names),
                    TagClass.business_type.in_(business_types),
                )
            )
            existing_classes = existing_result.scalars().all()
            class_map: Dict[Tuple[str, str], TagClass] = {
                (item.business_type, item.name): item for item in existing_classes
            }

            # 该租户下已存在的标签元素
            class_ids = [item.id for item in existing_classes]
            element_map: Dict[Tuple[int, str], TagElement] = {}
            if class_ids:
                existing_element_result = await session.execute(
                    select(TagElement).where(
                        TagElement.tenant_id == tenant_id,
                        TagElement.class_id.in_(class_ids),
                    )
                )
                existing_elements = existing_element_result.scalars().all()
                element_map = {(item.class_id, item.name): item for item in existing_elements}

            # 该租户下已存在的业务标签关系
            rel_map: Dict[Tuple[str, str, int], BusinessTagRel] = {}
            if image_business_ids:
                existing_rel_result = await session.execute(
                    select(BusinessTagRel).where(
                        BusinessTagRel.tenant_id == tenant_id,
                        BusinessTagRel.business_type.in_(business_types),
                        BusinessTagRel.business_id.in_(image_business_ids),
                    )
                )
                existing_rels = existing_rel_result.scalars().all()
                rel_map = {
                    (item.business_type, item.business_id, item.tag_class_id): item
                    for item in existing_rels
                }

            for idx, class_data in enumerate(seed_data):
                key = (class_data["business_type"], class_data["name"])
                tag_class = class_map.get(key)
                if not tag_class:
                    now = get_current_shanghai_time()
                    tag_class = TagClass(
                        name=class_data["name"],
                        business_type=class_data["business_type"],
                        sort_order=idx,
                        created_id=0,
                        created_by="system",
                        created_at=now,
                        updated_at=now,
                        tenant_id=tenant_id,
                    )
                    session.add(tag_class)
                    await session.flush()
                    class_map[key] = tag_class
                    created_tag_class += 1
                else:
                    skipped_tag_class += 1

                for element_idx, element_data in enumerate(class_data.get("element", [])):
                    element_key = (tag_class.id, element_data["name"])
                    tag_element = element_map.get(element_key)
                    if not tag_element:
                        now = get_current_shanghai_time()
                        tag_element = TagElement(
                            class_id=tag_class.id,
                            name=element_data["name"],
                            code=element_data.get("code"),
                            sort_order=element_idx,
                            created_id=0,
                            created_by="system",
                            created_at=now,
                            updated_at=now,
                            tenant_id=tenant_id,
                        )
                        session.add(tag_element)
                        await session.flush()
                        element_map[element_key] = tag_element
                        created_tag_element += 1
                    else:
                        skipped_tag_element += 1

                    for image_data in element_data.get("images", []):
                        source = image_data.get("image_source")
                        source_value = source.value if hasattr(source, "value") else source
                        image_name = image_data.get("image")
                        if source_value:
                            # 同名镜像存在时，优先按 (image, image_source) 精确绑定
                            target_images = image_map_with_source.get((image_name, source_value), [])
                        else:
                            target_images = image_map.get(image_name, [])

                        if not target_images:
                            skipped_tag_rel += 1
                            continue

                        for image in target_images:
                            rel_key = (class_data["business_type"], str(image.id), tag_class.id)
                            existing_rel = rel_map.get(rel_key)
                            if existing_rel:
                                if existing_rel.tag_element_id != tag_element.id:
                                    existing_rel.tag_element_id = tag_element.id
                                    existing_rel.updated_at = get_current_shanghai_time()
                                    updated_tag_rel += 1
                                else:
                                    skipped_tag_rel += 1
                                continue

                            now = get_current_shanghai_time()
                            rel = BusinessTagRel(
                                business_type=class_data["business_type"],
                                business_id=str(image.id),
                                tag_class_id=tag_class.id,
                                tag_element_id=tag_element.id,
                                created_id=0,
                                created_by="system",
                                created_at=now,
                                updated_at=now,
                                tenant_id=tenant_id,
                            )
                            session.add(rel)
                            rel_map[rel_key] = rel
                            created_tag_rel += 1

        created = created_tag_class + created_tag_element + created_tag_rel
        skipped = skipped_tag_class + skipped_tag_element + skipped_tag_rel
        print(
            f"✅ {self.name} 初始化完成 - 创建: {created}, 跳过: {skipped}; "
            f"分类[{created_tag_class}/{skipped_tag_class}] "
            f"元素[{created_tag_element}/{skipped_tag_element}] "
            f"关系[{created_tag_rel}/{updated_tag_rel}/{skipped_tag_rel}]"
        )
        return {
            "created": created,
            "skipped": skipped,
            "errors": 0,
            "details": {
                "tag_class": {"created": created_tag_class, "skipped": skipped_tag_class},
                "tag_element": {"created": created_tag_element, "skipped": skipped_tag_element},
                "tag_rel": {"created": created_tag_rel, "updated": updated_tag_rel, "skipped": skipped_tag_rel},
            },
        }

    @staticmethod
    def _collect_seeded_images(seed_data: List[Dict[str, Any]]) -> List[str]:
        image_set = set()
        for class_data in seed_data:
            for element_data in class_data.get("element", []):
                for image_data in element_data.get("images", []):
                    image = image_data.get("image")
                    if image:
                        image_set.add(image)
        return list(image_set)

