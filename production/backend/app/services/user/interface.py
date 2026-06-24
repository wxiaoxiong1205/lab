from abc import abstractmethod, ABC
from typing import List

from app.schemas.user import UserItem
from app.schemas.user_page_payload import UserPagePayload, UserBasePagePayload


class UserService(ABC):
    @abstractmethod
    async def is_main(self) -> bool:
        pass

    @abstractmethod
    async def refresh_main(self):
        pass

    @abstractmethod
    async def user_infos(self, ids: List[int], username: str, page: int, page_size: int) -> UserPagePayload:
        pass

    @abstractmethod
    async def iam_ignore_user_infos(self, ids: List[int],
                                    username: str,
                                    page: int,
                                    page_size: int) -> UserBasePagePayload:
        pass

    @abstractmethod
    async def user_list(self, size: int, page: int, username: str, scope: str) -> UserPagePayload:
        pass

    @abstractmethod
    async def user_id(self, user_id: int) -> UserItem:
        pass
