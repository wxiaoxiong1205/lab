from typing import TypeVar, List, Generic

from pydantic import BaseModel, Field

# 定义泛型类型变量
T = TypeVar('T')


# 这里是控制台的分页参数和lab本身的有所区别，要是控制台需要的接口可以返回这个类型
class WorkbenchPagePayload(BaseModel, Generic[T]):
    """用户分页查询的 payload 模型"""
    total: int = Field(description="总记录数")
    rows: List[T] = Field(description="当前页的用户列表")
    number: int = Field(description="当前页码（从 1 开始）")
    size: int = Field(description="每页显示条数")
    totalPages: int = Field(description="总页数")
