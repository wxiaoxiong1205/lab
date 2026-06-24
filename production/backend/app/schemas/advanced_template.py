from typing import Any, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.base import BaseSchema


ALLOWED_TEMPLATE_STATUSES = {"draft", "enabled", "disabled"}
ALLOWED_VISIBILITIES = {"system", "project", "private"}
ALLOWED_FIELD_TYPES = {"int", "float", "string", "bool", "enum", "json"}


def _normalize_enum_options(value: Any) -> Optional[List[str]]:
    if value is None:
        return None
    if isinstance(value, str):
        items = value.split(",")
    else:
        items = value
    normalized: List[str] = []
    if not isinstance(items, list):
        try:
            items = list(items)
        except TypeError:
            items = [items]
    for item in items:
        option = str(item).strip()
        if option and option not in normalized:
            normalized.append(option)
    return normalized or None


class AdvancedTemplateFieldCreate(BaseModel):
    field_name: str = Field(..., min_length=1, max_length=100, description="字段名")
    category: Optional[str] = Field(None, max_length=100, description="一级分类")
    description: Optional[str] = Field(None, max_length=1000, description="字段描述")
    field_type: str = Field(..., description="字段类型")
    enum_options: Optional[List[str]] = Field(None, description="枚举选项，仅 field_type=enum 时使用")
    default_value: Optional[str] = Field(None, description="默认值")
    sort_order: int = Field(0, description="排序")
    required: bool = Field(False, description="是否必填")
    enabled: bool = Field(True, description="是否启用")

    @field_validator("field_type")
    @classmethod
    def validate_field_type(cls, value: str) -> str:
        if value not in ALLOWED_FIELD_TYPES:
            raise ValueError(f"field_type must be one of {sorted(ALLOWED_FIELD_TYPES)}")
        return value

    @field_validator("enum_options", mode="before")
    @classmethod
    def validate_enum_options(cls, value: Any) -> Optional[List[str]]:
        return _normalize_enum_options(value)

    @model_validator(mode="after")
    def validate_enum_field_options(self):
        if self.field_type == "enum" and not self.enum_options:
            raise ValueError("enum_options is required when field_type is enum")
        return self


class AdvancedTemplateFieldUpdate(BaseModel):
    field_name: Optional[str] = Field(None, min_length=1, max_length=100, description="字段名")
    category: Optional[str] = Field(None, max_length=100, description="一级分类")
    description: Optional[str] = Field(None, max_length=1000, description="字段描述")
    field_type: Optional[str] = Field(None, description="字段类型")
    enum_options: Optional[List[str]] = Field(None, description="枚举选项，仅 field_type=enum 时使用")
    default_value: Optional[str] = Field(None, description="默认值")
    sort_order: Optional[int] = Field(None, description="排序")
    required: Optional[bool] = Field(None, description="是否必填")
    enabled: Optional[bool] = Field(None, description="是否启用")

    @field_validator("field_type")
    @classmethod
    def validate_field_type(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in ALLOWED_FIELD_TYPES:
            raise ValueError(f"field_type must be one of {sorted(ALLOWED_FIELD_TYPES)}")
        return value

    @field_validator("enum_options", mode="before")
    @classmethod
    def validate_enum_options(cls, value: Any) -> Optional[List[str]]:
        return _normalize_enum_options(value)


class AdvancedTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="模板名称")
    description: Optional[str] = Field(None, max_length=1000, description="模板描述")
    domain: str = Field(..., min_length=1, max_length=50, description="使用领域")
    template_type: str = Field(..., min_length=1, max_length=50, description="模板类型")
    status: str = Field("draft", description="状态")
    visibility: str = Field("system", description="可见性")
    yaml_content: Optional[str] = Field(None, description="YAML 内容字符串")
    fields: List[AdvancedTemplateFieldCreate] = Field(default_factory=list, description="模板字段")

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in ALLOWED_TEMPLATE_STATUSES:
            raise ValueError(f"status must be one of {sorted(ALLOWED_TEMPLATE_STATUSES)}")
        return value

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, value: str) -> str:
        if value not in ALLOWED_VISIBILITIES:
            raise ValueError(f"visibility must be one of {sorted(ALLOWED_VISIBILITIES)}")
        return value


class AdvancedTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="模板名称")
    description: Optional[str] = Field(None, max_length=1000, description="模板描述")
    domain: Optional[str] = Field(None, min_length=1, max_length=50, description="使用领域")
    template_type: Optional[str] = Field(None, min_length=1, max_length=50, description="模板类型")
    status: Optional[str] = Field(None, description="状态")
    visibility: Optional[str] = Field(None, description="可见性")

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in ALLOWED_TEMPLATE_STATUSES:
            raise ValueError(f"status must be one of {sorted(ALLOWED_TEMPLATE_STATUSES)}")
        return value

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in ALLOWED_VISIBILITIES:
            raise ValueError(f"visibility must be one of {sorted(ALLOWED_VISIBILITIES)}")
        return value


class AdvancedTemplateYamlCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="模板名称")
    description: Optional[str] = Field(None, max_length=1000, description="模板描述")
    domain: str = Field(..., min_length=1, max_length=50, description="使用领域")
    template_type: str = Field(..., min_length=1, max_length=50, description="模板类型")
    status: str = Field("draft", description="状态")
    visibility: str = Field("system", description="可见性")
    yaml_content: str = Field(..., min_length=1, description="YAML 内容字符串")

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in ALLOWED_TEMPLATE_STATUSES:
            raise ValueError(f"status must be one of {sorted(ALLOWED_TEMPLATE_STATUSES)}")
        return value

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, value: str) -> str:
        if value not in ALLOWED_VISIBILITIES:
            raise ValueError(f"visibility must be one of {sorted(ALLOWED_VISIBILITIES)}")
        return value


class AdvancedTemplateYamlUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="模板名称")
    description: Optional[str] = Field(None, max_length=1000, description="模板描述")
    domain: Optional[str] = Field(None, min_length=1, max_length=50, description="使用领域")
    template_type: Optional[str] = Field(None, min_length=1, max_length=50, description="模板类型")
    status: Optional[str] = Field(None, description="状态")
    visibility: Optional[str] = Field(None, description="可见性")
    yaml_content: str = Field(..., min_length=1, description="YAML 内容字符串")
    disable_missing_fields: bool = Field(True, description="是否停用 YAML 中不存在的旧字段")

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in ALLOWED_TEMPLATE_STATUSES:
            raise ValueError(f"status must be one of {sorted(ALLOWED_TEMPLATE_STATUSES)}")
        return value

    @field_validator("visibility")
    @classmethod
    def validate_visibility(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in ALLOWED_VISIBILITIES:
            raise ValueError(f"visibility must be one of {sorted(ALLOWED_VISIBILITIES)}")
        return value


class AdvancedTemplateYamlToJsonRequest(BaseModel):
    yaml_content: str = Field(..., min_length=1, description="YAML 内容字符串")


class AdvancedTemplateFieldReorderItem(BaseModel):
    field_id: int = Field(..., description="字段ID")
    sort_order: int = Field(..., description="排序")


class AdvancedTemplateFieldReorderRequest(BaseModel):
    items: List[AdvancedTemplateFieldReorderItem] = Field(..., min_length=1, description="字段排序列表")


class AdvancedTemplateFieldResponse(BaseSchema):
    template_id: int
    field_name: str
    category: Optional[str] = None
    description: Optional[str] = None
    field_type: str
    enum_options: Optional[List[str]] = None
    default_value: Optional[str] = None
    sort_order: int
    required: bool
    enabled: bool

    class Config:
        from_attributes = True


class AdvancedTemplateFieldGroupResponse(BaseModel):
    category: Optional[str] = Field(None, description="一级分类")
    fields: List[AdvancedTemplateFieldResponse] = Field(default_factory=list, description="分组字段")


class AdvancedTemplateParsedFieldResponse(BaseModel):
    field_name: str
    category: Optional[str] = None
    description: Optional[str] = None
    field_type: str
    enum_options: Optional[List[str]] = None
    default_value: Optional[str] = None
    sort_order: int
    required: bool
    enabled: bool


class AdvancedTemplateParsedFieldGroupResponse(BaseModel):
    category: Optional[str] = Field(None, description="一级分类")
    fields: List[AdvancedTemplateParsedFieldResponse] = Field(default_factory=list, description="分组字段")


class AdvancedTemplateYamlToJsonResponse(BaseModel):
    yaml_content: str = Field(..., description="YAML 内容字符串")
    fields: List[AdvancedTemplateParsedFieldGroupResponse] = Field(default_factory=list, description="按 category 分组后的模板字段")


class AdvancedTemplateResponse(BaseSchema):
    name: str
    description: Optional[str] = None
    domain: str
    template_type: str
    status: str
    visibility: str
    yaml_content: Optional[str] = Field(None, description="YAML 内容字符串")
    version: int = Field(1, description="版本号")
    is_current: bool = Field(True, description="是否当前版本")
    fields: List[AdvancedTemplateFieldGroupResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True
