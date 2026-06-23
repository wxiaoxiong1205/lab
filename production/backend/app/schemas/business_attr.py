
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.schemas.base import BaseSchema


class BusinessAttrInputType(str, Enum):
    """属性输入类型"""
    DROPDOWN = "下拉选择"
    MANUAL_INPUT = "手动输入"


class BusinessAttrBusinessType(str, Enum):
    """业务属性的业务类型"""

    INFERENCE_SERVICE = "inference_service", "在线推理服务"
    TRAINING_MANAGEMENT = "training_management", "训练数据管理"
    BUSINESS_TEST = "business_test", "业务测试数据集"
    BUSINESS_TRAINING = "business_training", "业务训练数据集"
    BUSINESS_INFERENCE = "business_inference", "业务推理结果集"
    TEST_MANAGEMENT = "test_management", "测试数据管理"
    INFERENCE_RESULT = "inference_result", "推理结果集"
    API_SERVICE = "api_service", "API服务"

    def __new__(cls, value: str, description: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj._description = description
        return obj

    @property
    def description(self) -> str:
        """前端展示用提示文案"""
        return self._description


class BusinessAttrOptionInput(BaseModel):
    option_value: str = Field(description="选项值", min_length=2, max_length=64)
    option_order: Optional[int] = Field(0, description="选项排序")

    @field_validator("option_value")
    @classmethod
    def validate_option_value(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("选项值不能为空或纯空白符")
        return v


class BusinessAttrCreateRequest(BaseModel):
    name: str = Field(description="属性名称", min_length=2, max_length=64)
    description: Optional[str] = Field(None, description="属性描述")
    attr_order: Optional[int] = Field(0, description="属性排序")
    input_type: BusinessAttrInputType = Field(description="输入类型")
    data_type: str = Field(None, description="数据类型", max_length=64)
    required_tag: int = Field(..., description="是否必填标签")
    multi_select: Optional[int] = Field(0, description="是否多选")
    business_type: BusinessAttrBusinessType = Field(description="业务类型")
    group: Optional[str] = Field(None, description="分组", max_length=64)
    options: Optional[List[BusinessAttrOptionInput]] = Field(None, description="选项列表")

    @model_validator(mode="after")
    def validate_dropdown_input(self) -> "BusinessAttrCreateRequest":
        if self.input_type == BusinessAttrInputType.DROPDOWN:
            if self.multi_select is None:
                raise ValueError("是否多选必填")
            if not self.options:
                raise ValueError("请配置下拉选项")
        return self


class BusinessAttrQueryParams(BaseModel):
    name: Optional[str] = Field(None, description="属性名称（模糊查询）", max_length=64)
    business_type: Optional[BusinessAttrBusinessType] = Field(None, description="业务类型")


class BusinessAttrDeleteRequest(BaseModel):
    ids: list[int] = Field(description="需要删除的属性ID列表")


class BusinessAttrUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, description="属性名称", min_length=2, max_length=64)
    description: Optional[str] = Field(None, description="属性描述")
    attr_order: Optional[int] = Field(0, description="属性排序")
    input_type: Optional[BusinessAttrInputType] = Field(None, description="输入类型")
    data_type: Optional[str] = Field(None, description="数据类型", max_length=64)
    required_tag: Optional[int] = Field(None, description="是否必填标签")
    multi_select: Optional[int] = Field(None, description="是否多选")
    business_type: Optional[BusinessAttrBusinessType] = Field(None, description="业务类型")
    group: Optional[str] = Field(None, description="分组", max_length=64)
    options: Optional[List[BusinessAttrOptionInput]] = Field(None, description="选项列表")

    @model_validator(mode="after")
    def validate_dropdown_input(self) -> "BusinessAttrUpdateRequest":
        if self.input_type == BusinessAttrInputType.DROPDOWN:
            if self.multi_select is None:
                raise ValueError("是否多选必填")
            if not self.options:
                raise ValueError("请配置下拉选项")
        return self


class BusinessAttrOptionResponse(BaseModel):
    """支持从ORM对象转换"""
    option_value: str = Field(description="选项值")
    option_order: Optional[int] = Field(0, description="选项排序")

    model_config = ConfigDict(from_attributes=True)


class BusinessAttrResponse(BaseSchema):
    name: str = Field(description="属性名称")
    description: Optional[str] = Field(None, description="属性描述")
    attr_order: Optional[int] = Field(0, description="属性排序")
    input_type: str = Field(description="输入类型")
    data_type: str = Field(description="数据类型")
    required_tag: int = Field(description="是否必填标签")
    multi_select: int = Field(description="是否多选")
    business_type: Optional[str] = Field(None, description="业务类型")
    group: Optional[str] = Field(None, description="分组", max_length=64)
    options: List[BusinessAttrOptionResponse] = Field(default_factory=list, description="选项列表")


class GroupedBusinessAttrItem(BaseModel):
    """按 group 分组后的单个分组项"""
    group: Optional[str] = Field(None, description="分组名")
    items: List[BusinessAttrResponse] = Field(default_factory=list, description="该分组下的属性列表")
