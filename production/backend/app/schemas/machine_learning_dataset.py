from datetime import datetime
from enum import Enum
from typing import Any, List, Optional, Dict

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import BaseModelWithTimezone


class MachineLearningDatasetCategory(str, Enum):
    MACHINE_LEARNING = "machine_learning"


class MachineLearningDatasetSourceType(str, Enum):
    JSON = "json"
    JSONL = "jsonl"
    ZIP = "zip"
    MIXED = "mixed"


class MachineLearningDatasetTaskType(str, Enum):
    TEXT_CLASSIFICATION = "text_classification"
    TEXT_ENTITY_RECOGNITION = "text_entity_recognition"
    IMAGE_CLASSIFICATION = "image_classification"
    OBJECT_DETECTION = "object_detection"
    IMAGE_SEGMENTATION = "image_segmentation"


class MachineLearningDatasetDataType(str, Enum):
    """数据类型；description 为中文展示文案。"""

    TEXT = "text", "文本"
    IMAGE = "image", "图片"

    def __new__(cls, value: str, description: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.description = description
        return obj


class MachineLearningDatasetDataSource(str, Enum):
    LOCAL_UPLOAD = "local_upload"
    NOTEBOOK_FETCH = "notebook_fetch"


class MachineLearningDatasetAnnotationType(str, Enum):
    """标注类型；description 为中文展示文案。"""

    TEXT_CLASSIFICATION = "text_classification", "文本分类"
    ENTITY_RECOGNITION = "entity_recognition", "实体识别"
    IMAGE_CLASSIFICATION = "image_classification", "图像分类"
    OBJECT_DETECTION = "object_detection", "物体检测"
    IMAGE_SEGMENTATION = "image_segmentation", "图像分割"

    def __new__(cls, value: str, description: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.description = description
        return obj


class MachineLearningDatasetTemplateType(str, Enum):
    """标注模板；description 为中文展示文案。"""

    TEXT_CLASSIFICATION_SINGLE_LABEL = "text_classification_single_label", "文本单标签"
    TEXT_CLASSIFICATION_MULTI_LABEL = "text_classification_multi_label", "文本多标签"
    ENTITY_RECOGNITION = "entity_recognition", "文本实体识别"
    IMAGE_CLASSIFICATION_SINGLE_LABEL = "image_classification_single_label", "单图单标签"
    IMAGE_CLASSIFICATION_MULTI_LABEL = "image_classification_multi_label", "单图多标签"
    OBJECT_DETECTION_BBOX = "object_detection_bbox", "矩阵框标注"
    IMAGE_SEGMENTATION_INSTANCE = "image_segmentation_instance", "实例分割（标准）"
    INSTANCE_SEGMENTATION_MASK = "instance_segmentation_mask", "实例分割（孔洞）"
    SEMANTIC_SEGMENTATION = "semantic_segmentation", "语义分割"

    def __new__(cls, value: str, description: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.description = description
        return obj


def machine_learning_enum_display_name(raw: Optional[str], enum_cls: type) -> Optional[str]:
    """将存储的枚举字符串按 enum_cls 解析为成员的展示名称（description）；空值返回 None，未知值保持原样。"""
    if not raw:
        return None
    try:
        member = enum_cls(raw)
    except ValueError:
        return raw
    return getattr(member, "description", raw)


def format_machine_learning_dataset_display_name(
    name: str,
    version: Optional[str],
    annotation_type: Optional[str],
    *,
    task_type: Optional[str] = None,
    data_type: Optional[str] = None,
) -> str:
    """
    列表/总览等场景下的机器学习数据集展示名：「标注类型描述/名称-版本」。
    无标注类型描述时依次用 task_type、data_type 作为前缀（与多人标注侧一致）。
    """
    name_version = f"{name}-{version}" if version else name
    ann_desc = machine_learning_enum_display_name(
        annotation_type, MachineLearningDatasetAnnotationType
    )
    prefix = ann_desc or task_type or data_type
    return f"{prefix}/{name_version}" if prefix else name_version


class ExportFormat(str, Enum):
    """导出格式"""
    PLATFORM = "platform"
    JSONL = "jsonl"
    COCO = "coco"
    MASK_IMAGE = "mask_image"
    IMAGE_FOLDER = "image_folder"


# 任务类型 -> 支持的导出格式列表
TASK_EXPORT_FORMATS: dict[MachineLearningDatasetTemplateType, list[ExportFormat]] = {
    # 文本任务
    MachineLearningDatasetTemplateType.TEXT_CLASSIFICATION_SINGLE_LABEL: [ExportFormat.PLATFORM, ExportFormat.JSONL],
    MachineLearningDatasetTemplateType.TEXT_CLASSIFICATION_MULTI_LABEL: [ExportFormat.PLATFORM, ExportFormat.JSONL],
    MachineLearningDatasetTemplateType.ENTITY_RECOGNITION: [ExportFormat.PLATFORM, ExportFormat.JSONL],

    # 图像分类
    MachineLearningDatasetTemplateType.IMAGE_CLASSIFICATION_SINGLE_LABEL: [ExportFormat.PLATFORM, ExportFormat.IMAGE_FOLDER],
    MachineLearningDatasetTemplateType.IMAGE_CLASSIFICATION_MULTI_LABEL: [ExportFormat.PLATFORM, ExportFormat.COCO],

    # 目标检测
    MachineLearningDatasetTemplateType.OBJECT_DETECTION_BBOX: [ExportFormat.PLATFORM, ExportFormat.COCO],

    # 实例分割（标准）
    MachineLearningDatasetTemplateType.IMAGE_SEGMENTATION_INSTANCE: [ExportFormat.PLATFORM, ExportFormat.COCO],
    # 实例分割（孔洞）
    MachineLearningDatasetTemplateType.INSTANCE_SEGMENTATION_MASK: [ExportFormat.PLATFORM, ExportFormat.COCO],

    # 语义分割
    MachineLearningDatasetTemplateType.SEMANTIC_SEGMENTATION: [ExportFormat.PLATFORM, ExportFormat.MASK_IMAGE],
}


class MachineLearningDatasetSampleFileType(str, Enum):
    """机器学习样例文件格式（与 sample_datasets/machine_learning 下文件一致）"""
    JSONL = "jsonl"
    ZIP = "zip"


class MachineLearningDatasetSampleCategory(str, Enum):
    """机器学习样例配置：template_type 对应文件前缀、下载名、数据类型及该类型支持的样例格式。"""
    # 文本：支持 jsonl / zip
    ENTITY_RECOGNITION = (
        "entity_recognition", "ner_text", "实体识别样例-有标注信息",
        MachineLearningDatasetDataType.TEXT,
        (MachineLearningDatasetSampleFileType.JSONL, MachineLearningDatasetSampleFileType.ZIP),
    )
    # 实体识别样例-无标注信息
    ENTITY_RECOGNITION_NOT_ANNOTATED = (
        "entity_recognition_not_annotated", "text_not_annotated", "实体识别样例-无标注信息",
        MachineLearningDatasetDataType.TEXT,
        (MachineLearningDatasetSampleFileType.JSONL,),
    )
    TEXT_CLASSIFICATION_SINGLE_LABEL = (
        "text_classification_single_label", "text_cls_short_single", "文本分类单标签样例-有标注信息",
        MachineLearningDatasetDataType.TEXT,
        (MachineLearningDatasetSampleFileType.JSONL, MachineLearningDatasetSampleFileType.ZIP),
    )
    TEXT_CLASSIFICATION_SINGLE_LABEL_NOT_ANNOTATED = (
        "text_classification_single_label_not_annotated", "text_not_annotated", "文本分类单标签样例-无标注信息",
        MachineLearningDatasetDataType.TEXT,
        (MachineLearningDatasetSampleFileType.JSONL,),
    )
    TEXT_CLASSIFICATION_MULTI_LABEL = (
        "text_classification_multi_label", "text_cls_short_multi", "文本分类多标签样例-有标注信息",
        MachineLearningDatasetDataType.TEXT,
        (MachineLearningDatasetSampleFileType.JSONL, MachineLearningDatasetSampleFileType.ZIP),
    )
    TEXT_CLASSIFICATION_MULTI_LABEL_NOT_ANNOTATED = (
        "text_classification_multi_label_not_annotated", "text_not_annotated", "文本分类多标签样例-无标注信息",
        MachineLearningDatasetDataType.TEXT,
        (MachineLearningDatasetSampleFileType.JSONL,),
    )
    # 图像：仅支持 zip
    IMAGE_CLASSIFICATION_SINGLE_LABEL = (
        "image_classification_single_label", "image_cls_single", "图像分类单标签样例-有标注信息",
        MachineLearningDatasetDataType.IMAGE,
        (MachineLearningDatasetSampleFileType.ZIP,),
    )
    IMAGE_CLASSIFICATION_SINGLE_LABEL_NOT_ANNOTATED = (
        "image_classification_single_label_not_annotated", "image_cls_single_not_annotated", "图像分类单标签样例-无标注信息",
        MachineLearningDatasetDataType.IMAGE,
        (MachineLearningDatasetSampleFileType.ZIP,),
    )
    IMAGE_CLASSIFICATION_MULTI_LABEL = (
        "image_classification_multi_label", "image_cls_multi", "图像分类多标签样例-有标注信息",
        MachineLearningDatasetDataType.IMAGE,
        (MachineLearningDatasetSampleFileType.ZIP,),
    )
    IMAGE_CLASSIFICATION_MULTI_LABEL_NOT_ANNOTATED = (
        "image_classification_multi_label_not_annotated", "image_cls_multi_not_annotated", "图像分类多标签样例-无标注信息",
        MachineLearningDatasetDataType.IMAGE,
        (MachineLearningDatasetSampleFileType.ZIP,),
    )
    OBJECT_DETECTION_BBOX = (
        "object_detection_bbox", "detection_bbox", "目标检测（矩形框）样例-有标注信息",
        MachineLearningDatasetDataType.IMAGE,
        (MachineLearningDatasetSampleFileType.ZIP,),
    )
    OBJECT_DETECTION_BBOX_NOT_ANNOTATED = (
        "object_detection_bbox_not_annotated", "detection_bbox_not_annotated", "目标检测（矩形框）样例-无标注信息",
        MachineLearningDatasetDataType.IMAGE,
        (MachineLearningDatasetSampleFileType.ZIP,),
    )
    IMAGE_SEGMENTATION_INSTANCE = (
        "image_segmentation_instance", "image_segmentation", "实例分割（标准）样例-有标注信息",
        MachineLearningDatasetDataType.IMAGE,
        (MachineLearningDatasetSampleFileType.ZIP,),
    )
    IMAGE_SEGMENTATION_INSTANCE_NOT_ANNOTATED = (
        "image_segmentation_instance_not_annotated", "image_segmentation_not_annotated", "实例分割（标准）样例-无标注信息",
        MachineLearningDatasetDataType.IMAGE,
        (MachineLearningDatasetSampleFileType.ZIP,),
    )
    INSTANCE_SEGMENTATION_MASK = (
        "instance_segmentation_mask", "instance_segmentation_mask", "实例分割（孔洞）样例-有标注信息",
        MachineLearningDatasetDataType.IMAGE,
        (MachineLearningDatasetSampleFileType.ZIP,),
    )
    INSTANCE_SEGMENTATION_MASK_NOT_ANNOTATED = (
        "instance_segmentation_mask_not_annotated", "instance_segmentation_mask_not_annotated", "实例分割（孔洞）样例-无标注信息",
        MachineLearningDatasetDataType.IMAGE,
        (MachineLearningDatasetSampleFileType.ZIP,),
    )
    SEMANTIC_SEGMENTATION = (
        "semantic_segmentation", "semantic_segmentation", "语义分割样例-有标注信息",
        MachineLearningDatasetDataType.IMAGE,
        (MachineLearningDatasetSampleFileType.ZIP,),
    )
    SEMANTIC_SEGMENTATION_NOT_ANNOTATED = (
        "semantic_segmentation_not_annotated", "semantic_segmentation_not_annotated", "语义分割样例-无标注信息",
        MachineLearningDatasetDataType.IMAGE,
        (MachineLearningDatasetSampleFileType.ZIP,),
    )

    def __new__(
        cls,
        template_value: str,
        file_prefix: str,
        description: str,
        data_type: "MachineLearningDatasetDataType",
        allowed_file_types: tuple,
    ):
        obj = str.__new__(cls, template_value)
        obj._value_ = template_value
        obj._file_prefix = file_prefix
        obj._description = description
        obj._data_type = data_type
        obj._allowed_file_types = allowed_file_types
        return obj

    @property
    def file_prefix(self) -> str:
        return self._file_prefix

    @property
    def description(self) -> str:
        return self._description

    @property
    def data_type(self) -> "MachineLearningDatasetDataType":
        return self._data_type

    @property
    def allowed_file_types(self) -> tuple:
        return self._allowed_file_types

    @classmethod
    def get_by_template_type(cls, template_type_value: str) -> Optional["MachineLearningDatasetSampleCategory"]:
        """根据 template_type 取值获取对应样例配置，不支持则返回 None"""
        try:
            return cls(template_type_value)
        except ValueError:
            return None

    @classmethod
    def get_not_annotated_by_template_type(
        cls, template_type_value: str
    ) -> Optional["MachineLearningDatasetSampleCategory"]:
        """根据有标注模板类型获取对应的无标注样例配置，不支持则返回 None"""
        try:
            return cls(f"{template_type_value}_not_annotated")
        except ValueError:
            return None

    @classmethod
    def get_allowed_file_types(cls, data_type: "MachineLearningDatasetDataType") -> tuple:
        """返回某数据类型支持的样例文件格式列表（由任意该类型的有标注枚举项配置决定）。"""
        for member in cls:
            if member.data_type == data_type and not member.value.endswith("_not_annotated"):
                return member.allowed_file_types
        return ()

    @classmethod
    def is_file_type_supported(
        cls,
        data_type: "MachineLearningDatasetDataType",
        file_type: "MachineLearningDatasetSampleFileType",
    ) -> bool:
        """判断当前数据类型是否支持所请求的样例文件格式（由各枚举项配置的 allowed_file_types 决定）。"""
        return file_type in cls.get_allowed_file_types(data_type)

    @classmethod
    def get_allowed_not_annotated_file_types(
        cls,
        template_type_value: str,
    ) -> tuple:
        """返回某模板类型支持的无标注样例文件格式列表。"""
        member = cls.get_not_annotated_by_template_type(template_type_value)
        return member.allowed_file_types if member else ()

    @classmethod
    def is_not_annotated_file_type_supported(
            cls,
            template_type_value: str,
            file_type: "MachineLearningDatasetSampleFileType",
    ) -> bool:
        """判断当前模板类型是否支持所请求的无标注样例文件格式。"""
        return file_type in cls.get_allowed_not_annotated_file_types(template_type_value)


class MachineLearningDatasetCreateResponse(BaseModelWithTimezone):
    id: int = Field(..., description="数据集ID")
    name: str = Field(..., description="数据集名称")
    description: Optional[str] = Field(None, description="数据集描述")
    project_id: int = Field(..., description="项目ID")
    version: str = Field(..., description="版本号")
    dataset_category: MachineLearningDatasetCategory = Field(..., description="数据集分类")
    task_type: MachineLearningDatasetTaskType = Field(..., description="任务类型")
    data_type: Optional[MachineLearningDatasetDataType] = Field(None, description="数据类型：text/image")
    data_source: Optional[MachineLearningDatasetDataSource] = Field(None, description="数据来源：local_upload/notebook_fetch")
    notebook_id: Optional[int] = Field(None, description="关联的notebook任务ID")
    notebook_name: Optional[str] = Field(None, max_length=50, description="关联的notebook任务名称")
    notebook_path: Optional[str] = Field(None, max_length=500, description="notebook文件来源地址")
    annotation_type: Optional[MachineLearningDatasetAnnotationType] = Field(None, description="标注类型")
    template_type: Optional[MachineLearningDatasetTemplateType] = Field(None, description="标注模板")
    is_annotated: bool = Field(True, description="是否有标注数据")
    source_type: MachineLearningDatasetSourceType = Field(..., description="上传源类型")
    storage_path: str = Field(..., description="对象存储根路径")
    dataset_path: str = Field(..., description="dataset.jsonl 路径")
    label_schema_path: Optional[str] = Field(None, description="classname.json 路径")
    metadata_fields: Optional[List[str]] = Field(None, description="数据集字段元数据，上传解析完成后生成")
    sample_count: int = Field(..., description="样本数")
    file_size: Optional[float] = Field(None, description="dataset.jsonl 大小(MB)")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    created_by: Optional[str] = Field(None, description="创建人")

    class Config:
        from_attributes = True


class MachineLearningDatasetResponse(BaseModelWithTimezone):
    id: int = Field(..., description="数据集ID")
    name: str = Field(..., description="数据集名称")
    description: Optional[str] = Field(None, description="数据集描述")
    project_id: int = Field(..., description="项目ID")
    version: str = Field(..., description="版本号")
    dataset_category: MachineLearningDatasetCategory = Field(..., description="数据集分类")
    task_type: MachineLearningDatasetTaskType = Field(..., description="任务类型")
    data_type: Optional[MachineLearningDatasetDataType] = Field(None, description="数据类型：text/image")
    data_source: Optional[MachineLearningDatasetDataSource] = Field(None, description="数据来源：local_upload/notebook_fetch")
    notebook_id: Optional[int] = Field(None, description="关联的notebook任务ID")
    notebook_name: Optional[str] = Field(None, max_length=50, description="关联的notebook任务名称")
    notebook_path: Optional[str] = Field(None, max_length=500, description="notebook文件来源地址")
    annotation_type: Optional[MachineLearningDatasetAnnotationType] = Field(None, description="标注类型")
    template_type: Optional[MachineLearningDatasetTemplateType] = Field(None, description="标注模板")
    is_annotated: bool = Field(True, description="是否有标注数据")
    source_type: MachineLearningDatasetSourceType = Field(..., description="上传源类型")
    metadata_fields: Optional[List[str]] = Field(None, description="数据集字段元数据，上传解析完成后生成")
    sample_count: int = Field(..., description="样本数")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    created_by: Optional[str] = Field(None, description="创建人")

    class Config:
        from_attributes = True


class MachineLearningDatasetBasicInfoUpdate(BaseModel):
    """机器学习数据集基础信息编辑请求模型"""

    name: Optional[str] = Field(None, min_length=1, max_length=100, description="新的数据集名称；会同步修改同名数据集的所有版本")
    description: Optional[str] = Field(None, max_length=1000, description="新的数据集描述；仅修改 dataset_id 对应版本")

    @model_validator(mode="after")
    def validate_update_fields(self):
        if "name" not in self.model_fields_set and "description" not in self.model_fields_set:
            raise ValueError("name 和 description 至少需要传一个")
        return self



class MachineLearningDatasetSampleResponse(BaseModelWithTimezone):
    row_number: int = Field(..., description="样本行号（从1开始）")
    sample_data: Dict[str, Any] = Field(..., description="样本数据")


class MachineLearningDatasetDetailResponse(MachineLearningDatasetCreateResponse):
    base_url: Optional[str] = Field(
        None,
        description="资源访问基础路径（{tenant_id}/{storage_path}/dataset_{id}/），用于前端拼接存储下载 URL",
    )
    label_schema: Optional[Dict[str, str]] = Field(None, description="类别映射（classname.json 内容）")
    items: List[MachineLearningDatasetSampleResponse] = Field(default_factory=list, description="样本分页数据")
    total: int = Field(..., description="样本总数")
    page: int = Field(..., description="页码")
    size: int = Field(..., description="每页大小")
    pages: int = Field(..., description="总页数")
