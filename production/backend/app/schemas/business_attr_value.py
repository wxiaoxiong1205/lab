
from enum import Enum
from app.core.logging import logger
from app.schemas.base import BaseSchema
from typing import Optional, Any, List
from pydantic import BaseModel, Field, field_validator, model_validator
from app.schemas.business_attr import BusinessAttrOptionInput, BusinessAttrOptionResponse, BusinessAttrInputType


class BusinessAttrValueBusinessType(str, Enum):
    """业务属性值的业务类型"""

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


# business_type 值 -> 前端提示/展示用业务名（与枚举 description 一致）
BUSINESS_TYPE_DISPLAY_NAME = {e.value: e.description for e in BusinessAttrValueBusinessType}


# DatasetUsage.value -> BusinessAttrValueBusinessType
DATASET_USAGE_TO_BUSINESS_TYPE = {
    "training": BusinessAttrValueBusinessType.TRAINING_MANAGEMENT,
    "validation": BusinessAttrValueBusinessType.TRAINING_MANAGEMENT,
    "test": BusinessAttrValueBusinessType.TEST_MANAGEMENT,
    "business_training": BusinessAttrValueBusinessType.TRAINING_MANAGEMENT,
    "business_test": BusinessAttrValueBusinessType.BUSINESS_TEST,
}


# InferenceDatasetUsage.value -> BusinessAttrValueBusinessType
INFERENCE_RESULT_USAGE_TO_BUSINESS_TYPE = {
    "default-inference": BusinessAttrValueBusinessType.INFERENCE_RESULT,
    "business-inference": BusinessAttrValueBusinessType.BUSINESS_INFERENCE,
}

# 训练、测试、验证数据集关联的业务属性都可参与聚合（仅从本枚举引用，供聚合等逻辑使用）
TRAINING_DATASET_RELATED_BUSINESS_TYPES = (
    BusinessAttrValueBusinessType.TRAINING_MANAGEMENT.value,
    BusinessAttrValueBusinessType.BUSINESS_TEST.value,
    BusinessAttrValueBusinessType.TEST_MANAGEMENT.value,
)

# 推理结果集（含业务推理结果集）关联的业务属性，用于聚合统计等
INFERENCE_RESULT_DATASET_RELATED_BUSINESS_TYPES = (
    BusinessAttrValueBusinessType.INFERENCE_RESULT.value,
    BusinessAttrValueBusinessType.BUSINESS_INFERENCE.value,
)


def get_business_type_display_name(business_type: str) -> str:
    """根据 business_type 返回对应业务名，未知则返回原值。"""
    return BUSINESS_TYPE_DISPLAY_NAME.get(business_type, business_type)


class BusinessAttrDataType(str, Enum):
    """属性值数据类型"""
    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"


class BusinessAttrValueInput(BaseModel):
    attr_id: int = Field(description="属性ID")
    name: str = Field(description="属性名称", min_length=2, max_length=64)
    attr_value: Optional[Any] = Field(None, description="属性值", max_length=64)
    input_type: BusinessAttrInputType = Field(description="输入类型")
    value_order: Optional[int] = Field(0, description="属性值排序")
    required_tag: int = Field(description="是否必填标签")
    data_type: BusinessAttrDataType = Field(description="数据类型")
    multi_select: int = Field(0, description="是否多选")
    business_type: BusinessAttrValueBusinessType = Field(description="属性关联业务的类型")
    group: Optional[str] = Field(None, description="分组", max_length=64)
    options: Optional[List[BusinessAttrOptionInput]] = Field(default=None, description="选项列表")

    @field_validator("attr_value")
    @classmethod
    def validate_value_type(cls, value: Any, info):
        if value is None:
            return value
        data_type = info.data.get("data_type")
        if data_type == "string":
            if not isinstance(value, str):
                raise ValueError("属性值类型必须为 string")
            if len(value) > 64:
                raise ValueError("属性值长度不能超过 64")
        elif data_type == "integer" and not isinstance(value, int) or isinstance(value, bool):
            raise ValueError("属性值类型必须为 integer")
        elif data_type == "float" and not isinstance(value, float):
            raise ValueError("属性值类型必须为 float")
        return value

    @model_validator(mode="after")
    def validate_required_value(self) -> "BusinessAttrValueInput":
        if not self.required_tag:
            return self
        if self.input_type == BusinessAttrInputType.MANUAL_INPUT:
            has_value = self.attr_value is not None and (
                not isinstance(self.attr_value, str) or self.attr_value.strip() != ""
            )
            if not has_value:
                raise ValueError("请输入属性值，且不能为纯空白符")
        elif self.input_type == BusinessAttrInputType.DROPDOWN:
            if not self.options:
                raise ValueError("请选择选项")
        return self


class BusinessAttrValueUpdateInput(BaseModel):
    """属性值更新输入，用于部分更新"""
    id: int = Field(description="属性值ID")
    attr_value: Optional[Any] = Field(None, description="属性值", max_length=64)
    group: Optional[str] = Field(None, description="分组", max_length=64)
    data_type: Optional[BusinessAttrDataType] = Field(None, description="数据类型（校验 attr_value 用）")
    input_type: Optional[BusinessAttrInputType] = Field(None, description="输入类型（校验必填用）")
    required_tag: Optional[int] = Field(None, description="是否必填标签（校验必填用）")
    multi_select: Optional[int] = Field(None, description="是否多选")
    options: Optional[List[BusinessAttrOptionInput]] = Field(None, description="选项列表（传入则覆盖原选项）")

    @field_validator("attr_value")
    @classmethod
    def validate_value_type(cls, value: Any, info):
        if value is None:
            return value
        data_type = info.data.get("data_type")
        if data_type == "string":
            if not isinstance(value, str):
                raise ValueError("属性值类型必须为 string")
            if len(value) > 64:
                raise ValueError("属性值长度不能超过 64")
        elif data_type == "integer" and (not isinstance(value, int) or isinstance(value, bool)):
            raise ValueError("属性值类型必须为 integer")
        elif data_type == "float" and not isinstance(value, float):
            raise ValueError("属性值类型必须为 float")
        return value

    @model_validator(mode="after")
    def validate_required_value(self) -> "BusinessAttrValueUpdateInput":
        if not self.required_tag:
            return self
        if self.input_type == BusinessAttrInputType.MANUAL_INPUT:
            has_value = self.attr_value is not None and (
                not isinstance(self.attr_value, str) or self.attr_value.strip() != ""
            )
            if not has_value:
                raise ValueError("请输入属性值，且不能为纯空白符")
        elif self.input_type == BusinessAttrInputType.DROPDOWN:
            if not self.options:
                raise ValueError("请选择选项")
        return self


class BusinessAttrValueResponse(BaseSchema):
    reference_id: int = Field(description="关联业务数据的id")
    attr_id: int = Field(description="属性ID")
    name: str = Field(description="属性名称")
    input_type: str = Field(description="输入类型")
    attr_value: Any = Field(description="属性值")
    data_type: Optional[str] = Field("string", description="数据类型")
    required_tag: int = Field(0, description="是否必填标签")
    multi_select: int = Field(0, description="是否多选")
    business_type: str = Field(None, description="属性关联业务的类型")
    group: Optional[str] = Field(None, description="分组", max_length=64)
    options: Optional[List[BusinessAttrOptionResponse]] = Field(None, description="选项列表")
    attr_options: Optional[List[BusinessAttrOptionResponse]] = Field(None, description="属性原始选项列表")

    @model_validator(mode="after")
    def cast_value_by_data_type(self) -> "BusinessAttrValueResponse":
        data_type = self.data_type
        original_value = self.attr_value
        try:
            if data_type == "string":
                self.attr_value = str(self.attr_value) if self.attr_value is not None else self.attr_value
            elif data_type == "integer":
                self.attr_value = int(self.attr_value) if self.attr_value is not None else self.attr_value
            elif data_type == "float":
                self.attr_value = float(self.attr_value) if self.attr_value is not None else self.attr_value
        except (TypeError, ValueError):
            logger.error(f"数据类型转换失败，数据类型：{data_type}，原始值：{original_value}")
            self.attr_value = str(original_value) if original_value is not None else original_value
        return self
