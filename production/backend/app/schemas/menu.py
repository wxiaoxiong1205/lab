from typing import Optional, List

from pydantic import Field, BaseModel

from app.schemas.common import ResModel


class MenuItem(BaseModel):
    """单个菜单/按钮模型（支持递归嵌套，适用于多层菜单结构）"""
    # 基础字段
    id: int = Field(description="菜单/按钮ID")
    code: str = Field(description="菜单/按钮编码（如 'basic_datasource'）")
    name: str = Field(description="菜单/按钮名称（如 'iamMenus.datasource.baseSource.name'）")
    type: int = Field(description="类型：0=菜单，1=按钮，2=分组（根据实际业务定义）")
    sort: int = Field(description="排序序号")
    parentId: int = Field(description="父级ID（0 表示顶级）")
    idPath: str = Field(description="ID路径（如 '/1431461741788928/1431461741797120/'）")

    # 可选字段
    children: Optional[List["MenuItem"]] = Field(default=[], description="子菜单/按钮列表（递归嵌套）")
    description: Optional[str] = Field(default=None, max_length=1000, description="描述信息")
    elementResourceId: Optional[int] = Field(default=None, description="元素资源ID")
    elementStatus: Optional[int] = Field(default=None, description="元素状态（0=正常）")
    highLightIconUrl: Optional[str] = Field(default=None, description="高亮图标URL")
    iconUrl: Optional[str] = Field(default=None, description="图标URL（如 'icon-set-database'）")
    pathUrl: Optional[str] = Field(default=None, description="页面路径（如 'data-source-management'）")
    remark: Optional[str] = Field(default=None, description="备注")
    secretLevel: Optional[int] = Field(default=None, description="保密级别（-1=公开，9999=高保密）")


MenuItem.model_rebuild()


class MenuVoResponse(ResModel[List[MenuItem]]):
    """用户分页列表查询的完整响应模型"""
    pass
