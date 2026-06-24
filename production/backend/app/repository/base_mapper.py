from abc import ABC
from contextlib import AbstractContextManager
from typing import TypeVar, Generic, List, Optional, Callable, Type, Set

from dependency_injector.wiring import inject
from fastapi_pagination import Params
from fastapi_pagination.ext.sqlalchemy import apaginate
from sqlalchemy import text, Delete, select, BooleanClauseList, ColumnElement, Table, Insert, insert, update, Integer, Boolean, \
    String
from sqlalchemy import text, Delete, select
from sqlalchemy.sql.elements import BinaryExpression
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Query
from sqlalchemy.orm.util import _ORMJoin
from sqlalchemy.sql.selectable import and_, Subquery, Select

from app.database.database_depends import Database
from app.models.models import Project, baseModel
from app.utils import app_runtime_context
from app.utils.db_session_context import get_db_session, set_db_session
from app.core.logging import logger

# 定义泛型类型变量
T = TypeVar('T')


class BaseMapper(Generic[T], ABC):
    # @inject
    def __init__(self, db: Database):
        self.session_factory: Callable[..., AbstractContextManager[AsyncSession]] = db.session
        self._db = db  # 保存 Database 实例引用
        self.session = None

    async def get_session(self) -> AsyncSession:
        """
        获取数据库会话

        优先从请求上下文获取（通过 Depends(get_db) 设置），
        如果上下文中没有，则创建新的 session 并存储在实例中。

        注意：非请求上下文创建的 session 需要手动调用 commit()/rollback() 管理事务。
        """
        # 优先从上下文获取（请求场景）
        ctx_session = get_db_session()
        if ctx_session is not None:
            return ctx_session

        # 非请求场景：为当前协程上下文创建独立 session，避免并发共享同一 session
        if hasattr(self._db, '_session_factory') and not self._db._is_dm:
            # PostgreSQL/MySQL 异步模式
            session = self._db._session_factory()
        else:
            # 达梦或其他模式
            from app.database.base import AsyncCompatibleSession
            from sqlalchemy.orm import Session
            sync_sess = Session(self._db._sync_engine)
            session = AsyncCompatibleSession(sync_sess)

        set_db_session(session)
        return session

    async def insert(self, obj: T) -> T:
        session = await self.get_session()
        obj.tenant_id = app_runtime_context.get_tenant_id()
        session.add(obj)
        # await session.flush()
        # await session.commit()
        return obj

    async def delete(self, obj: T):
        session = await self.get_session()
        await session.delete(obj)

    async def delete_condition(self, delete_condition: Delete):
        session = await self.get_session()
        await session.execute(delete_condition)

    async def update_by_id(self, id: int, obj: T):
        """
            根据ID直接执行UPDATE操作更新对象

            :param id: 要更新的对象ID
            :param obj: 包含更新数据的对象（ORM对象或字典）
            """
        # 1. 从obj获取模型类
        model_cls = type(obj)

        # 2. 如果是ORM对象，转换为字典
        if hasattr(obj, '__table__'):
            # 是SQLAlchemy ORM对象
            update_data = {}
            for column in model_cls.__table__.columns:
                value = getattr(obj, column.name, None)
                if value is not None:
                    update_data[column.name] = value
        elif isinstance(obj, dict):
            # 已经是字典
            update_data = obj
        else:
            # 其他类型，尝试转换
            raise ValueError(f"update_by_id 不支持的对象类型: {type(obj)}")

        # 3. 构建UPDATE语句
        stmt = update(model_cls).where(
            model_cls.id == id
        ).values(update_data)

        # 4. 执行UPDATE
        await self.execute(stmt)


    async def query_page(self, query: Query, page: Optional[int], page_size: Optional[int],
                         unique: Optional[bool] = True):
        session = await self.get_session()
        query = await self.append_tenant_id(query)
        if page is not None and page_size is not None:
            from app.common.custom_params import CustomParams
            params: CustomParams = CustomParams(page=page, size=page_size)
            return await apaginate(session, query, params, unique = unique)
        return await apaginate(session, query, unique = unique)

    async def query(self, query: Query) -> List[T]:
        session = await self.get_session()
        query = await self.append_tenant_id(query)
        result = await session.execute(query)
        objs: List[T] = result.scalars().all()
        return objs
        pass

    async def query_one(self, query) -> T:
        session = await self.get_session()
        query = await self.append_tenant_id(query)
        result = await session.execute(query)
        return result.scalar_one_or_none()
        pass

    async def query_by_id(self, query: Query) -> T:
        session = await self.get_session()
        result = await session.execute(query)
        objs: T = result.scalar_one_or_none()
        return objs
        pass

    async def execute(self, param):
        if isinstance(param, Query):
            param = await self.append_tenant_id(param)
        if isinstance(param, Insert):
            param = await self.append_tenant_id_insert(param)
        session = await self.get_session()
        return await session.execute(param)

    async def commit(self, ):
        session = await self.get_session()
        await session.flush()
        await session.commit()

    async def flush(self, ):
        """刷新会话，将挂起的更改写入数据库但不提交事务"""
        session = await self.get_session()
        await session.flush()

    async def close(self):
        """关闭数据库会话，安全处理已回滚的事务"""
        session = get_db_session()
        if session is None:
            return
        try:
            # 尝试提交，如果事务已回滚会失败
            await session.commit()
        except Exception:
            # 如果 commit 失败（如事务已回滚），尝试 rollback
            try:
                await session.rollback()
            except Exception:
                pass
        finally:
            try:
                await session.close()
            except Exception:
                pass
            set_db_session(None)

    async def rollback(self, ):
        session = await self.get_session()
        await session.rollback()

    async def refresh(self, db_project):
        session = await self.get_session()
        await session.refresh(db_project)

    async def append_tenant_id(self, query: Query):
        """
           为查询自动添加租户条件，支持：
           - 单表查询
           - JOIN关联查询（含多表关联）
           - 子查询（嵌套子查询）
           - 别名表查询
           """
        current_tenant = app_runtime_context.get_tenant_id()
        if not current_tenant:
            return query  # 租户ID为空时不添加条件

        # 1. 递归获取查询中所有继承自baseModel的模型
        target_models: Set[Type[baseModel]] = set()
        # 标记：如果查询的 FROM 是子查询且子查询已有 tenant_id 条件，则跳过添加
        subquery_has_tenant = False

        async def _collect_models(element):
            nonlocal subquery_has_tenant
            # 处理子查询
            if isinstance(element, Subquery):
                # 检查子查询是否已包含 tenant_id 条件
                subquery_select = element.element if hasattr(element, 'element') else getattr(element, 'select', None)
                if subquery_select is not None:
                    whereclause = getattr(subquery_select, '_whereclause', None)
                    if whereclause is not None and 'tenant_id' in str(whereclause):
                        subquery_has_tenant = True
                        return  # 子查询已有租户条件，不需要再处理
                # 递归解析子查询的Select对象
                await _collect_models(subquery_select)
                return

            # 处理Select对象（Query的底层对象）
            if isinstance(element, Select):
                # 遍历查询的所有FROM子句（包括JOIN的表）
                for from_obj in element.get_final_froms():
                    # 检查 FROM 是否是子查询
                    if isinstance(from_obj, Subquery):
                        # 检查子查询是否已包含 tenant_id 条件
                        subquery_select = from_obj.element if hasattr(from_obj, 'element') else getattr(from_obj, 'select', None)
                        if subquery_select is not None:
                            whereclause = getattr(subquery_select, '_whereclause', None)
                            if whereclause is not None and 'tenant_id' in str(whereclause):
                                subquery_has_tenant = True
                                return  # 子查询已有租户条件，不需要再处理
                    
                    # 提取模型类（支持别名表）
                    # 这里会遇到join操作，直接找一个主表添加租户id
                    if isinstance(from_obj, _ORMJoin):
                        def found_table(sql_join_or_table):
                            if isinstance(sql_join_or_table, Table):
                                return sql_join_or_table
                            if isinstance(sql_join_or_table, _ORMJoin):
                                return found_table(sql_join_or_table.left)
                        table = found_table(from_obj)
                        model_cls = await self._get_model_class(table)
                    else:
                        model_cls = await self._get_model_class(from_obj)
                    if model_cls and issubclass(model_cls, baseModel):
                        target_models.add(model_cls)
                return

        # 从Query中提取底层Select对象并递归解析
        if isinstance(query, Query):
            # ORM Query 对象：通过 statement 获取底层 Select
            select_stmt = query.statement
        else:
            # 核心 Select 对象：直接使用
            select_stmt = query
        
        # 先检查 FROM 子句中是否有子查询且子查询已有 tenant_id 条件
        if isinstance(select_stmt, Select):
            for from_obj in select_stmt.get_final_froms():
                if isinstance(from_obj, Subquery):
                    # 检查子查询的 WHERE 子句
                    try:
                        subquery_str = str(from_obj)
                        if 'tenant_id' in subquery_str:
                            logger.debug(f"跳过添加租户条件：子查询已包含 tenant_id")
                            return query
                    except Exception:
                        pass
        
        await _collect_models(select_stmt)

        # 如果子查询已包含租户条件，则直接返回原查询
        if subquery_has_tenant:
            return query

        # 2. 为每个目标模型添加租户条件
        new_query = query
        for model in target_models:
            # 构建当前模型的租户条件（使用模型的tenant_id字段）
            tenant_condition = model.tenant_id == current_tenant

            # 检查是否已存在相同条件（避免重复添加）
            if not await self._has_tenant_condition(new_query, model, current_tenant):
                # 直接追加租户条件（where() 会自动用 AND 连接）
                new_query = new_query.where(tenant_condition)

        return new_query

    async def append_tenant_id_insert(self, stmt: Insert) -> Insert:
        """
        为 Core Insert 语句自动注入 tenant_id（当目标表包含该列时）。
        - 若当前上下文未设置租户，抛出异常阻止写入。
        - 支持单值格式和多值格式（列表）的 Insert 语句
        """
        try:
            table = getattr(stmt, 'table', None)
            if table is None or not hasattr(table, 'c') or 'tenant_id' not in table.c:
                return stmt
            current_tenant = app_runtime_context.get_tenant_id()
            if not current_tenant:
                raise RuntimeError("提交数据前未设置租户ID，租户隔离校验失败")
            
            # 检查是否是多值格式（列表格式）
            # SQLAlchemy 的 Insert 语句在传入列表时会设置 _multi_values 属性
            _multi_values = getattr(stmt, '_multi_values', None)
            if _multi_values is not None and len(_multi_values) > 0 and isinstance(_multi_values[0], list):
                # 多值格式：更新列表中的每个字典，添加 tenant_id
                updated_values = []
                for value_dict in _multi_values[0]:
                    if isinstance(value_dict, dict):
                        # 如果字典中还没有 tenant_id，则添加
                        if 'tenant_id' not in value_dict:
                            updated_dict = dict(value_dict)
                            updated_dict['tenant_id'] = current_tenant
                            updated_values.append(updated_dict)
                        else:
                            # 如果已有 tenant_id，保持不变
                            updated_values.append(value_dict)
                    else:
                        # 如果不是字典，保持原样
                        updated_values.append(value_dict)
                # 重新创建 Insert 语句，使用更新后的值列表
                return stmt.table.insert().values(updated_values)
            else:
                # 单值格式或未设置值：检查是否已经包含 tenant_id
                # 获取现有的值（如果有）
                _values = getattr(stmt, '_values', None)
                if _values is not None and hasattr(_values, 'items'):
                    # 将 _values 转换为字典
                    existing_values = dict(_values)
                    # 如果已经有值且不包含 tenant_id，则添加
                    if 'tenant_id' not in existing_values:
                        existing_values['tenant_id'] = current_tenant
                        return stmt.values(tenant_id=current_tenant)
                    else:
                        # 如果已经有 tenant_id，直接返回
                        return stmt
                else:
                    # 没有设置值，直接添加 tenant_id
                    return stmt.values(tenant_id=current_tenant)
        except Exception as e:
            logger.error(f"添加租户ID到Insert语句失败: {e}")
            # 出现异常则原样返回，避免影响其他无关插入
            return stmt

    # 辅助方法：从查询元素中提取模型类（支持别名、表对象）
    async def _get_model_class(self, from_obj) -> Type[baseModel] | None:
        # 处理别名表（aliased(Model)）
        if hasattr(from_obj, 'entity'):
            return from_obj.entity  # 别名对象的实体模型
        # 处理ORM模型（直接查询模型时）
        if hasattr(from_obj, '__table__') and hasattr(from_obj, '__mapper__'):
            return from_obj  # ORM模型类
        # 处理表对象（Table）- 尝试反向映射到模型
        if hasattr(from_obj, 'name'):
            for cls in baseModel.__subclasses__():
                if cls.__tablename__ == from_obj.name:
                    return cls
        return None

    # 辅助方法：检查模型是否已包含租户条件
    async def _has_tenant_condition(self, query: Query, model: Type[baseModel], tenant_id) -> bool:
        whereclause = query._whereclause
        if whereclause is None:
            return False
        
        return self._check_clause_for_tenant(whereclause, model, tenant_id)
    
    def _check_clause_for_tenant(self, clause, model: Type[baseModel], tenant_id) -> bool:
        """递归检查子句中是否包含租户条件（只要有 tenant_id 条件就返回 True）"""
        try:
            # 处理嵌套的 AND/OR 条件（BooleanClauseList 或有 clauses 属性的对象）
            if hasattr(clause, 'clauses'):
                for sub_clause in clause.clauses:
                    if self._check_clause_for_tenant(sub_clause, model, tenant_id):
                        return True
                return False
            
            # 处理二元表达式（column == value）
            if isinstance(clause, BinaryExpression):
                # 检查左侧是否是 tenant_id 列
                left = getattr(clause, 'left', None)
                if left is not None:
                    # 尝试多种方式获取列名
                    key = getattr(left, 'key', None) or getattr(left, 'name', None)
                    if key == 'tenant_id':
                        return True
            
            # 处理 Grouping（括号包裹的表达式）
            if hasattr(clause, 'element'):
                return self._check_clause_for_tenant(clause.element, model, tenant_id)
                
        except Exception:
            # 安全处理任何属性访问错误
            pass
        
        return False

    async def query_condition(self, base_query: Query, params, cls, page: Optional[int], page_size: Optional[int]):
        # 3. 动态添加非 None 条件
        if params is None:
            return await self.query_page(base_query, page, page_size)
        base_query = self.filter_by_params(cls, base_query, dict(params))
        return await self.query_page(base_query, page, page_size)

    def filter_by_params(self, cls, query, params):
        """
        基于模型的全部字段和非空参数构建查询过滤条件

        :param cls: 模型类
        :param query: 初始查询对象
        :param params: 包含过滤条件的字典
        :return: 过滤后的查询对象
        """

        # 获取模型的所有字段名
        all_field_names = [field.name for field in cls.__table__.columns]

        for field_name in all_field_names:
            # 检查参数中是否存在该字段且值不为None
            if field_name in params and params[field_name] is not None:
                # 动态获取模型字段
                field = getattr(cls, field_name)
                # 添加过滤条件
                query = query.filter(field == params[field_name])

        return query

    # TODO  由于暂时写死注入bass_mapper，所以将update_list方法暂时写在base_mapper中，修改注入逻辑后使用log_mapper中的update_list方法
    async def update_list(self, objs: List[T]) -> None:
        """
        批量更新对象列表。
        SQLAlchemy ORM 会自动跟踪已加载并被修改的对象。
        此方法确保对象被 session 管理，并在需要时刷新更改。

        :param objs: 需要更新的对象列表
        """
        if not objs:
            return

        session = await self.get_session()

        # 将修改过的对象刷新到数据库
        # ORM会自动跟踪这些对象的变更
        await session.flush()

    async def query_condition_fuzzy(self, base_query: Query, params, cls, page: Optional[int],
                                    page_size: Optional[int]):
        """
        基于模糊匹配条件进行查询分页

        :param base_query: 基础查询对象
        :param params: 过滤参数
        :param cls: 模型类
        :param page: 页码
        :param page_size: 每页大小
        :return: 分页结果
        """
        if params is None:
            return await self.query_page(base_query, page, page_size)

        # 使用模糊查询过滤器替代默认的精确匹配过滤器
        base_query = self.filter_by_params_fuzzy(cls, base_query, dict(params))
        return await self.query_page(base_query, page, page_size)

    def filter_by_params_fuzzy(self, cls, query, params):
        """
        基于模型字段和非空参数构建模糊查询过滤条件，根据字段类型选择精确或模糊匹配
        """
        all_field_names = [field.name for field in cls.__table__.columns]

        for field_name in all_field_names:
            if field_name in params and params[field_name] is not None:
                field = getattr(cls, field_name)

                # 根据SQLAlchemy列类型判断
                if isinstance(field.type, (Integer,)):
                    query = query.filter(field == params[field_name])
                elif isinstance(field.type, Boolean):
                    query = query.filter(field == params[field_name])
                elif isinstance(field.type, String):
                    query = query.filter(field.ilike(f"%{params[field_name]}%"))
                else:
                    query = query.filter(field == params[field_name])

        return query

    async def query_first(self, query):
        """有多个结果，取第一条"""
        session = await self.get_session()
        query = await self.append_tenant_id(query)
        result = await session.execute(query)
        return result.first()

    async def query_raw(self, query: Query):
        """非租户场景，原始查询"""
        session = await self.get_session()
        result = await session.execute(query)
        return result.scalars().all()
    
    async def query_one_or_none_raw(self, query):
        """非租户场景，原始查询"""
        session = await self.get_session()
        result = await session.execute(query)
        return result.scalar_one_or_none()
    
    async def query_first_raw(self, query):
        """非租户场景，原始查询"""
        session = await self.get_session()
        result = await session.execute(query)
        return result.first()
    
    async def execute_raw(self, query):
        """非租户场景，原始执行"""
        session = await self.get_session()
        return await session.execute(query)
    
    async def query_page_raw(self, query: Query, page: Optional[int], page_size: Optional[int],
                                   unique: Optional[bool] = True):
        """非租户场景，原始查询"""
        session = await self.get_session()
        if page is not None and page_size is not None:
            from app.common.custom_params import CustomParams
            params: CustomParams = CustomParams(page=page, size=page_size)
            return await apaginate(session, query, params, unique = unique)
        return await apaginate(session, query, unique = unique)
