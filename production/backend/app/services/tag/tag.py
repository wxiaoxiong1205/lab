"""标签管理服务实现"""
import logging
from typing import Optional, List

from fastapi import HTTPException
from fastapi_pagination import Page
from sqlalchemy import select, delete, and_

from app.core.logging import logger
from app.models.models import JwtUserInfo, TagClass, TagElement, BusinessTagRel
from app.repository.tag_class_mapper import TagClassMapper
from app.repository.tag_element_mapper import TagElementMapper
from app.repository.business_tag_rel_mapper import BusinessTagRelMapper
from app.schemas.tag import (
    TagClassCreate, TagClassUpdate, TagClassResponse,
    TagElementCreate, TagElementUpdate, TagElementResponse,
    TagTypeListResponse, TagClassWithElements, TagElementBrief,
    SaveBusinessTagsRequest, SaveBusinessTagsResponse,
    BusinessTagsResponse, BusinessTagInfo
)
from .interface import TagService


class DefaultTagService(TagService):
    """标签管理服务实现类"""

    def __init__(
            self,
            mapper: TagClassMapper,
            tag_element_mapper: TagElementMapper,
            business_tag_rel_mapper: BusinessTagRelMapper
    ) -> None:
        self.mapper = mapper
        self.tag_element_mapper = tag_element_mapper
        self.business_tag_rel_mapper = business_tag_rel_mapper

    # =============== 标签分类管理 ===============
    async def list_tag_classes(
            self,
            business_type: Optional[str] = None,
            name: Optional[str] = None,
            page: Optional[int] = None,
            size: Optional[int] = None
    ) -> Page[TagClassResponse]:
        """获取标签分类列表"""
        try:
            query = select(TagClass)

            if business_type:
                query = query.filter(TagClass.business_type == business_type)
            if name:
                query = query.filter(TagClass.name.ilike(f"%{name}%"))

            query = query.order_by(TagClass.created_at.desc())

            tag_classes = await self.mapper.query_page(query, page, size)

            items = []  # 收集新对象
            for tag_class in tag_classes.items:
                # 查询该分类下的所有元素
                elements = await self.tag_element_mapper.query(
                    select(TagElement)
                    .filter(TagElement.class_id == tag_class.id)
                    .order_by(TagElement.created_at.desc())
                )

                element_list = [
                    TagElementBrief(
                        tag_element_id=elem.id,
                        tag_element_name=elem.name
                    )
                    for elem in elements
                ]

                # copy 创建新对象，并收集
                new_tag_class = tag_class.copy(update={"elements": element_list})
                items.append(new_tag_class)

            return tag_classes.copy(update={"items": items})

        except Exception as e:
            logger.error(f"获取标签分类列表失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"获取标签分类列表失败: {str(e)}")

    async def create_tag_class(
            self,
            tag_class_create: TagClassCreate,
            current_user: JwtUserInfo
    ) -> TagClassResponse:
        """创建标签分类"""
        try:
            # 检查名称是否重复
            existing = await self.mapper.query_one(
                select(TagClass).filter(
                    TagClass.name == tag_class_create.name,
                    TagClass.business_type == tag_class_create.business_type
                )
            )
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail=f"该业务类型下已存在名称为 '{tag_class_create.name}' 的标签分类"
                )

            tag_class = TagClass(
                name=tag_class_create.name,
                business_type=tag_class_create.business_type,
                sort_order=tag_class_create.sort_order,
                created_id=current_user.userId,
                created_by=current_user.username
            )

            await self.mapper.insert(tag_class)
            await self.mapper.commit()
            await self.mapper.refresh(tag_class)

            return TagClassResponse.model_validate(tag_class)

        except HTTPException:
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"创建标签分类失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"创建标签分类失败: {str(e)}")

    async def get_tag_class(self, tag_class_id: int) -> TagClassResponse:
        """获取标签分类详情"""
        tag_class = await self.mapper.query_one(
            select(TagClass).filter(TagClass.id == tag_class_id)
        )
        if not tag_class:
            raise HTTPException(status_code=404, detail="标签分类不存在")
        return TagClassResponse.model_validate(tag_class)

    async def update_tag_class(
            self,
            tag_class_id: int,
            tag_class_update: TagClassUpdate
    ) -> TagClassResponse:
        """更新标签分类"""
        try:
            tag_class = await self.mapper.query_one(
                select(TagClass).filter(TagClass.id == tag_class_id)
            )
            if not tag_class:
                raise HTTPException(status_code=404, detail="标签分类不存在")

            # 检查名称是否重复
            if tag_class_update.name:
                existing = await self.mapper.query_one(
                    select(TagClass).filter(
                        TagClass.name == tag_class_update.name,
                        TagClass.business_type == tag_class.business_type,
                        TagClass.id != tag_class_id
                    )
                )
                if existing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"该业务类型下已存在名称为 '{tag_class_update.name}' 的标签分类"
                    )
                tag_class.name = tag_class_update.name


            if tag_class_update.sort_order is not None:
                tag_class.sort_order = tag_class_update.sort_order

            await self.mapper.commit()
            await self.mapper.refresh(tag_class)

            return TagClassResponse.model_validate(tag_class)

        except HTTPException:
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"更新标签分类失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"更新标签分类失败: {str(e)}")

    async def delete_tag_class(self, tag_class_id: int) -> None:
        """删除标签分类"""
        try:
            tag_class = await self.mapper.query_one(
                select(TagClass).filter(TagClass.id == tag_class_id)
            )
            if not tag_class:
                raise HTTPException(status_code=404, detail="标签分类不存在")

            # 检查是否有关联的标签元素
            elements = await self.tag_element_mapper.query(
                select(TagElement).filter(TagElement.class_id == tag_class_id)
            )
            if elements:
                raise HTTPException(
                    status_code=400,
                    detail="该标签分类下存在标签元素，请先删除所有标签元素"
                )

            await self.mapper.delete(tag_class)
            await self.mapper.commit()

        except HTTPException:
            raise
        except Exception as e:
            await self.mapper.rollback()
            logger.error(f"删除标签分类失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"删除标签分类失败: {str(e)}")

    # =============== 标签元素管理 ===============
    async def list_tag_elements(
            self,
            class_id: Optional[int] = None,
            name: Optional[str] = None,
            page: Optional[int] = None,
            size: Optional[int] = None
    ) -> Page[TagElementResponse]:
        """获取标签元素列表"""
        try:
            query = select(TagElement)

            if class_id:
                query = query.filter(TagElement.class_id == class_id)
            if name:
                query = query.filter(TagElement.name.ilike(f"%{name}%"))

            query = query.order_by(TagElement.created_at.desc())

            return await self.tag_element_mapper.query_page(query, page, size)

        except Exception as e:
            logger.error(f"获取标签元素列表失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"获取标签元素列表失败: {str(e)}")

    async def create_tag_element(
            self,
            tag_element_create: TagElementCreate,
            current_user: JwtUserInfo
    ) -> TagElementResponse:
        """创建标签元素"""
        try:
            # 检查分类是否存在
            tag_class = await self.mapper.query_one(
                select(TagClass).filter(TagClass.id == tag_element_create.class_id)
            )
            if not tag_class:
                raise HTTPException(status_code=404, detail="标签分类不存在")

            # 检查名称是否重复
            existing = await self.tag_element_mapper.query_one(
                select(TagElement).filter(
                    TagElement.class_id == tag_element_create.class_id,
                    TagElement.name == tag_element_create.name
                )
            )
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail=f"该分类下已存在名称为 '{tag_element_create.name}' 的标签元素"
                )

            tag_element = TagElement(
                class_id=tag_element_create.class_id,
                name=tag_element_create.name,
                code=tag_element_create.code,
                sort_order=tag_element_create.sort_order,
                created_id=current_user.userId,
                created_by=current_user.username
            )

            await self.tag_element_mapper.insert(tag_element)
            await self.tag_element_mapper.commit()
            await self.tag_element_mapper.refresh(tag_element)

            return TagElementResponse.model_validate(tag_element)

        except HTTPException:
            raise
        except Exception as e:
            await self.tag_element_mapper.rollback()
            logger.error(f"创建标签元素失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"创建标签元素失败: {str(e)}")

    async def get_tag_element(self, tag_element_id: int) -> TagElementResponse:
        """获取标签元素详情"""
        tag_element = await self.tag_element_mapper.query_one(
            select(TagElement).filter(TagElement.id == tag_element_id)
        )
        if not tag_element:
            raise HTTPException(status_code=404, detail="标签元素不存在")
        return TagElementResponse.model_validate(tag_element)

    async def update_tag_element(
            self,
            tag_element_id: int,
            tag_element_update: TagElementUpdate
    ) -> TagElementResponse:
        """更新标签元素"""
        try:
            tag_element = await self.tag_element_mapper.query_one(
                select(TagElement).filter(TagElement.id == tag_element_id)
            )
            if not tag_element:
                raise HTTPException(status_code=404, detail="标签元素不存在")

            # 检查名称是否重复
            if tag_element_update.name:
                existing = await self.tag_element_mapper.query_one(
                    select(TagElement).filter(
                        TagElement.class_id == tag_element.class_id,
                        TagElement.name == tag_element_update.name,
                        TagElement.id != tag_element_id
                    )
                )
                if existing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"该分类下已存在名称为 '{tag_element_update.name}' 的标签元素"
                    )
                tag_element.name = tag_element_update.name

            if tag_element_update.code is not None:
                tag_element.code = tag_element_update.code
            if tag_element_update.sort_order is not None:
                tag_element.sort_order = tag_element_update.sort_order

            await self.tag_element_mapper.commit()
            await self.tag_element_mapper.refresh(tag_element)

            return TagElementResponse.model_validate(tag_element)

        except HTTPException:
            raise
        except Exception as e:
            await self.tag_element_mapper.rollback()
            logger.error(f"更新标签元素失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"更新标签元素失败: {str(e)}")

    async def delete_tag_element(self, tag_element_id: int) -> None:
        """删除标签元素"""
        try:
            tag_element = await self.tag_element_mapper.query_one(
                select(TagElement).filter(TagElement.id == tag_element_id)
            )
            if not tag_element:
                raise HTTPException(status_code=404, detail="标签元素不存在")

            # 检查是否有业务对象关联
            relations = await self.business_tag_rel_mapper.query(
                select(BusinessTagRel).filter(BusinessTagRel.tag_element_id == tag_element_id)
            )
            if relations:
                raise HTTPException(
                    status_code=400,
                    detail="该标签元素已被业务对象使用，无法删除"
                )

            await self.tag_element_mapper.delete(tag_element)
            await self.tag_element_mapper.commit()

        except HTTPException:
            raise
        except Exception as e:
            await self.tag_element_mapper.rollback()
            logger.error(f"删除标签元素失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"删除标签元素失败: {str(e)}")

    # =============== 标签类型返回接口 ===============
    async def get_tag_types(self, business_type: str) -> TagTypeListResponse:
        """获取标签类型列表（按分类分组返回）"""
        try:
            # 查询该业务类型下的所有分类
            tag_classes = await self.mapper.query(
                select(TagClass)
                .filter(TagClass.business_type == business_type)
                .order_by(TagClass.created_at.desc())
            )

            result = []
            for tag_class in tag_classes:
                # 查询该分类下的所有元素
                elements = await self.tag_element_mapper.query(
                    select(TagElement)
                    .filter(TagElement.class_id == tag_class.id)
                    .order_by(TagElement.created_at.desc())
                )

                element_list = [
                    TagElementBrief(
                        tag_element_id=elem.id,
                        tag_element_name=elem.name
                    )
                    for elem in elements
                ]

                result.append(TagClassWithElements(
                    tag_class_id=tag_class.id,
                    tag_class_name=tag_class.name,
                    elements=element_list
                ))

            return TagTypeListResponse(data=result)

        except Exception as e:
            logger.error(f"获取标签类型列表失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"获取标签类型列表失败: {str(e)}")

    # =============== 业务对象标签管理 ===============
    async def save_business_tags(
            self,
            business_type: str,
            business_id: str,
            request: SaveBusinessTagsRequest,
            current_user: JwtUserInfo
    ) -> SaveBusinessTagsResponse:
        """保存业务对象标签（覆盖式修改）"""
        try:
            # 1. 删除旧标签
            await self.business_tag_rel_mapper.execute(
                delete(BusinessTagRel).where(
                    BusinessTagRel.business_type == business_type,
                    BusinessTagRel.business_id == business_id
                )
            )

            # 2. 批量插入新标签
            if request.tag_element_ids:
                # 查询标签元素及其所属分类
                elements = await self.tag_element_mapper.query(
                    select(TagElement).filter(TagElement.id.in_(request.tag_element_ids))
                )

                if len(elements) != len(request.tag_element_ids):
                    raise HTTPException(status_code=400, detail="部分标签元素ID不存在")

                for elem in elements:
                    rel = BusinessTagRel(
                        business_type=business_type,
                        business_id=business_id,
                        tag_class_id=elem.class_id,
                        tag_element_id=elem.id,
                        created_id=current_user.userId,
                        created_by=current_user.username
                    )
                    await self.business_tag_rel_mapper.insert(rel)

            await self.business_tag_rel_mapper.commit()

            return SaveBusinessTagsResponse(success=True, message="标签保存成功")

        except HTTPException:
            raise
        except Exception as e:
            await self.business_tag_rel_mapper.rollback()
            logger.error(f"保存业务对象标签失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"保存业务对象标签失败: {str(e)}")

    async def get_business_tags(
            self,
            business_type: str,
            business_id: str
    ) -> BusinessTagsResponse:
        """获取业务对象的标签列表"""
        try:
            # 联表查询
            query = (
                select(
                    BusinessTagRel.tag_class_id,
                    TagClass.name.label("tag_class_name"),
                    BusinessTagRel.tag_element_id,
                    TagElement.name.label("tag_element_name")
                )
                .join(TagClass, TagClass.id == BusinessTagRel.tag_class_id)
                .join(TagElement, TagElement.id == BusinessTagRel.tag_element_id)
                .filter(
                    BusinessTagRel.business_type == business_type,
                    BusinessTagRel.business_id == business_id
                )
                .order_by(TagClass.created_at.desc())
            )

            result = await self.business_tag_rel_mapper.execute(query)
            rows = result.all()

            tags = [
                BusinessTagInfo(
                    tag_class_id=row.tag_class_id,
                    tag_class_name=row.tag_class_name,
                    tag_element_id=row.tag_element_id,
                    tag_element_name=row.tag_element_name
                )
                for row in rows
            ]

            return BusinessTagsResponse(
                business_type=business_type,
                business_id=business_id,
                tags=tags
            )

        except Exception as e:
            logger.error(f"获取业务对象标签失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"获取业务对象标签失败: {str(e)}")

    async def get_business_tags_batch(
            self,
            business_type: str,
            business_ids: List[str]
    ) -> dict:
        """批量获取业务对象的标签（仅仅用于展示，如果有过滤需要业务自行关联查询）"""
        try:
            if not business_ids:
                return {}

            # 联表查询
            query = (
                select(
                    BusinessTagRel.business_id,
                    BusinessTagRel.tag_class_id,
                    TagClass.name.label("tag_class_name"),
                    BusinessTagRel.tag_element_id,
                    TagElement.name.label("tag_element_name")
                )
                .join(TagClass, TagClass.id == BusinessTagRel.tag_class_id)
                .join(TagElement, TagElement.id == BusinessTagRel.tag_element_id)
                .filter(
                    BusinessTagRel.business_type == business_type,
                    BusinessTagRel.business_id.in_(business_ids)
                )
                .order_by(TagClass.created_at.desc())
            )

            result = await self.business_tag_rel_mapper.execute(query)
            rows = result.all()

            # 按 business_id 分组
            tags_map = {}
            for row in rows:
                bid = row.business_id
                if bid not in tags_map:
                    tags_map[bid] = []
                tags_map[bid].append(BusinessTagInfo(
                    tag_class_id=row.tag_class_id,
                    tag_class_name=row.tag_class_name,
                    tag_element_id=row.tag_element_id,
                    tag_element_name=row.tag_element_name
                ))

            return tags_map

        except Exception as e:
            logger.error(f"批量获取业务对象标签失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"批量获取业务对象标签失败: {str(e)}")
