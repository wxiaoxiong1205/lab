from typing import List, TypeVar
from app.repository.base_mapper import BaseMapper

T = TypeVar('T')

class LogMapper(BaseMapper[T]):

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
