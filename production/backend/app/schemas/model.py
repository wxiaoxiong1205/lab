import os
from datetime import datetime
from typing import Optional, List, Dict, Mapping
from enum import Enum, StrEnum
from pydantic import BaseModel, Field, field_validator, model_validator

from app.common.status import TaskStatus
from app.core import settings
from app.schemas.common import BaseModelWithTimezone
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.utils.name_validator import validate_name_format


class ModelType(str, Enum):
    """模型类型枚举"""
    TEXT_GENERATION = "text-generation"
    IMAGE_GENERATION = "image-generation"
    IMAGE_UNDERSTANDING = "image-understanding"
    MULTIMODAL = "multimodal"

class BelleModelType(StrEnum):
    # 'text','image','audio','video','multi-modal','model-merge','other'
    TEXT_GENERATION = 'text'
    IMAGE_GENERATION = 'image'
    MULTIMODAL = 'multi-modal'


class ModelProvider(str, Enum):
    # 开源模型提供商
    QWEN = "Qwen"
    # LLAMA = "Llama"   #目前不支持就不要


class ModelStatus(StrEnum):
    def __new__(cls, desc: str, value: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.desc = desc
        return obj

    WAITING = ("等待", "wait")
    RUNNING = ("进行中", "process")
    SUCCESS = ("成功", "success")
    FAILED = ("失败", "fail")

class ModelSource(StrEnum):
    def __new__(cls, desc: str, value: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.desc = desc
        return obj

    LOCAL = ("本地", "Local")
    MODELSCOPE = ("ModelScope", "Modelscope")

class BelleModelSource(StrEnum):
    def __new__(cls, desc: str, value: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.desc = desc
        return obj

    RUNNING = ("ModelScope", "Modelscope")

class ModelTags(StrEnum):
    def __new__(cls, desc: str, value: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.desc = desc
        return obj

    INFERENCE = ("推理", "inference")
    TRAINING = ("训练", "training")

# 模型注册来源类型
class ModelRegisterSourceType(StrEnum):
    def __new__(cls, desc: str, value: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.desc = desc
        return obj

    TRAINING = ("大模型训练", "training")
    NOTEBOOK = ("Notebook", "notebook")

# BaseModel schemas
class BaseModelBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="模型名称")
    description: Optional[str] = Field(None, max_length=1000, description="模型描述")
    model_type: List[ModelType] = Field(..., min_length=1, description="模型类型列表，支持多选")
    model_provider: ModelProvider = Field(..., description="模型提供商")
    status: Optional[str] = Field(None, description="模型状态")
    model_tags: Optional[List[ModelTags]] = Field(None, description="模型标签列表，例如 ['inference', 'training']")
    progress: Optional[str] = Field(None, description="下载进度")
    model_source: Optional[str] = Field(None, description="来源")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    k8s_id: Optional[int] = Field(None, description="用于下载模型的K8s资源ID")

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """验证基础模型名称格式"""
        try:
            validate_name_format(v, "模型Code")
        except ValueError as e:
            raise ValueError(str(e))
        return v


class BaseModelCreate(BaseModelBase):
    pass

class BaseModelUpdate(BaseModel):
    id: int
    model_type: Optional[List[ModelType]] = Field(None, description="模型类型列表，支持多选")
    model_tags: Optional[List[ModelTags]] = Field(None, description="模型标签列表，例如 ['inference', 'training']")
    description: Optional[str] = Field(None, max_length=1000, description="模型描述")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    k8s_id: Optional[int] = Field(None, description="用于下载模型的K8s资源ID")



class BaseModelResponse(BaseModelBase, BaseModelWithTimezone):
    id: int
    created_at: datetime
    updated_at: datetime
    model_path: Optional[str] = Field(None, description="模型路径")


# TrainedModel schemas
class TrainedModelBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=96, description="模型名称")
    description: Optional[str] = Field(None, max_length=1000, description="模型描述")
    model_type: ModelType = Field(..., description="模型类型")
    model_path: str = Field(..., description="模型路径")
    model_version: Optional[str] = Field("v1", max_length=50, description="模型版本，默认为v1")
    project_id: int = Field(..., description="所属项目ID")
    task_id: Optional[int] = Field(None, description="关联的训练任务ID")
    task_name: Optional[str] = Field(None, max_length=255, description="关联的训练任务名称")
    task_version: Optional[str] = Field(None, max_length=50, description="关联的训练任务版本号")
    base_model_id: Optional[int] = Field(None, description="基础模型ID")
    base_model_name: Optional[str] = Field(None, max_length=255, description="基础模型名称")
    checkpoint: Optional[str] = Field(None, max_length=200, description="训练检查点名称，如checkpoint-500")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    status: Optional[TaskStatus] = Field(None, description="任务状态")
    # 执行信息
    started_at: Optional[datetime] = Field(None, description="开始时间")
    finished_at: Optional[datetime] = Field(None, description="完成时间")
    estimated_duration: Optional[int] = Field(None, description="预计持续时间(秒)")
    created_by: Optional[str] = Field(None, description="创建者用户名称")

    graphics_card_resource: Optional[GraphicsCardResourceConfig] = Field(None, description="GPU/NPU 资源配置")

    notebook_id: Optional[int] = Field(None, description="关联的notebook任务ID")
    notebook_name: Optional[str] = Field(None, max_length=50, description="关联的notebook任务名称")
    notebook_path: Optional[str] = Field(None, max_length=500, description="notebook文件来源地址")
    model_source_type: Optional[str] = Field(None, max_length=50, description="模型来源")

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """验证训练模型名称格式"""
        try:
            validate_name_format(v, "训练模型名称")
        except ValueError as e:
            raise ValueError(str(e))
        return v

    @model_validator(mode="after")
    def validate_checkpoint_requirement(self):
        """
        当模型注册来源是 training 时，checkpoint 必须提供
        """
        if self.model_source_type == ModelRegisterSourceType.TRAINING.value and not self.checkpoint:
            raise ValueError("当模型来源为 training 时，checkpoint 为必填字段")
        return self


class TrainedModelCreate(TrainedModelBase):
    model_source_type: str = Field(ModelRegisterSourceType.TRAINING.value, max_length=50, description="模型来源")
    model_provider: Optional[str] = Field(None, description="模型提供商")
    model_path: Optional[str] = Field(None, description="模型路径")

    @model_validator(mode="after")
    def validate_source_required_fields(self):
        if self.model_source_type == ModelRegisterSourceType.TRAINING.value and not self.checkpoint:
            raise ValueError("当模型来源为 training 时，checkpoint 为必填字段")

        if self.model_source_type == ModelRegisterSourceType.TRAINING.value and not self.model_path:
            raise ValueError("当模型来源为 training 时，model_path 为必填字段")

        if self.model_source_type == ModelRegisterSourceType.NOTEBOOK.value:
            if self.notebook_id is None:
                raise ValueError("当模型来源为 notebook 时，notebook_id 为必填字段")
            if not self.notebook_name:
                raise ValueError("当模型来源为 notebook 时，notebook_name 为必填字段")
            if not self.notebook_path:
                raise ValueError("当模型来源为 notebook 时，notebook_path 为必填字段")

        return self


class TrainedModelResponse(TrainedModelBase, BaseModelWithTimezone):
    id: int
    created_at: datetime
    updated_at: datetime
    training_type: Optional[Dict] = Field(default={}, description='训练类型配置示例:{"train_type_category": "text-generation", "train_method_type": "sft", "fine_tuning_type": "lora"}')


class TrainedModelSummaryResponse(BaseModel):
    """训练模型汇总响应模型"""
    id: int = Field(..., description="模型ID")
    model_name: str = Field(..., description="模型名称")
    version_count: int = Field(..., description="版本数量")
    model_type: ModelType = Field(..., description="模型类型")
    project_id: int = Field(..., description="项目ID")
    latest_version: str = Field(..., description="最新版本号")
    earliest_version: str = Field(..., description="最早版本号")
    base_model_name: Optional[str] = Field(None, description="基础模型名称")
    created_at: datetime = Field(..., description="首次创建时间")
    updated_at: datetime = Field(..., description="最后更新时间")
    
    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "model_name": "chinese_chat_model",
                "version_count": 3,
                "model_type": "text-generation",
                "project_id": 1,
                "latest_version": "v3",
                "earliest_version": "v1",
                "base_model_name": "qwen-7b-chat",
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-03T00:00:00Z"
            }
        }

class TrainedModelWithVersionsResponse(BaseModel):
    """训练模型及其版本列表（按 name 去重分页，每个 name 下包含所有版本）"""
    model_name: str = Field(..., description="模型名称")
    versions: List[TrainedModelResponse] = Field(..., description="该模型下的所有版本列表")


class ModelStatusResp(BaseModel):
    label: str
    value: str


class MergeModelConfig(BaseModel):
    model_name_or_path: str = Field(..., description="基座模型路径")
    adapter_name_or_path: str = Field(..., description="LoRA 路径")
    template: Optional[str] = Field(None, description="模板名称")
    finetuning_type: str = Field("lora", description="微调类型，固定为 lora")


class MergeExportConfig(BaseModel):
    export_dir: str = Field(..., description="输出目录")
    export_size: int = Field(2, description="导出模型分片大小（GB）")
    export_device: str = Field("cpu", description="导出设备（一般为CPU）")
    export_legacy_format: bool = Field(False, description="是否使用旧格式")


class MergeConfig(BaseModel):
    model: MergeModelConfig = Field(..., description="模型与LoRA配置")
    export: MergeExportConfig = Field(..., description="导出配置")

    def to_yaml(self) -> str:
        yaml_lines = []

        for group_name, obj in {
            "model": self.model,
            "export": self.export
        }.items():
            title = self.model_fields[group_name].description
            yaml_lines.append(f"### {title}")

            for key, field in obj.model_fields.items():
                value = getattr(obj, key)
                if value is None:
                    continue
                yaml_lines.append(f"# {field.description}")
                yaml_lines.append(f"{key}: {value}")
            yaml_lines.append("")

        return "\n".join(yaml_lines)

class MergeConfigConverter:

    @staticmethod
    def api_to_llama_factory(api_config: "TrainedModelCreate", template: str) -> MergeConfig:
        from app.utils.storage_enum import StoragePath
        """
        将 API 配置转换为 LlamaFactory merge_lora YAML 配置
        """
        # 基座模型路径 = base models 路径 + 模型提供商 + 模型名称
        model_path = f"{StoragePath.BASE_MODELS.mount_path}{api_config.model_provider}/{api_config.base_model_name}"

        # LoRA checkpoint 路径
        adapter_path = f"{StoragePath.UNREGISTERED_TRAINED_MODELS.mount_path}{api_config.checkpoint}"

        #export_dir
        registered_base = StoragePath.MERGE_TRAINED_MODELS.mount_path
        target_filename = f"{api_config.name}_{api_config.model_version}"
        export_dir = f"{registered_base}{target_filename}"
        # 运行名称（监控）
        run_name = settings.get_mlflow_run_name(
            api_config.name, api_config.model_version, api_config.task_id
        )

        export_device = "auto" if api_config.graphics_card_resource.get_k8s_gpu_count() else "cpu"

        return MergeConfig(
            model=MergeModelConfig(
                model_name_or_path=model_path,
                adapter_name_or_path=adapter_path,
                template=template,  # 可选
                finetuning_type="lora",
            ),
            export=MergeExportConfig(
                export_dir=export_dir,
                export_size=2,
                export_device=export_device,
                export_legacy_format=False
            )
        )

    @staticmethod
    def to_llama_factory_config(base_model_name: str, model_provider: str) -> str:
        """转换为LlamaFactory配置"""
        from app.schemas.training_task import ModelProviderTemplateMapping, ChatTemplate

        template = None
        if model_provider:
            template = ModelProviderTemplateMapping.get_template_by_provider(model_provider)

        model_name_lower = base_model_name.lower()
        if "qwen3-vl" in model_name_lower or "qwen3_vl" in model_name_lower or "qwen3vl" in model_name_lower:
            return ChatTemplate.QWEN3_VL_NOTHINK
        if "qwen2-vl" in model_name_lower or "qwen2_vl" in model_name_lower or "qwen2vl" in model_name_lower:
            return ChatTemplate.QWEN2_VL
        if template is not None:
            return template
        if "qwen" in model_name_lower:
            return ChatTemplate.QWEN

        return ChatTemplate.QWEN

class TrainedModelLogResponse(BaseModel):
    """合并训练任务日志响应模型"""
    archived: bool = Field(..., description="是否为归档日志（从MinIO获取）")
    logs: List[str] = Field(..., description="日志内容列表")


class ModelTagsResp(BaseModel):
    label: str
    value: str

class ModelSourceResp(BaseModel):
    label: str
    value: str


# ==================== 机器学习模型 (ML Model) Schemas ====================
class MlModelType(str, Enum):
    """机器学习模型类型（与原型 模型类型 一致）"""
    TEXT = "text"
    IMAGE = "image"


class MLModelAnnotationType(str, Enum):
    """机器模型 和 数据集那边对齐；description 为中文展示文案。"""

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

class MlTaskType(str, Enum):
    """机器学习任务子类型（文本分类、实体识别等）"""
    TEXT_CLASSIFICATION_SINGLE_LABEL = "text_classification_single_label"
    TEXT_CLASSIFICATION_MULTI_LABEL = "text_classification_multi_label"

    ENTITY_RECOGNITION = "entity_recognition"
    SEMANTIC_SEGMENTATION = "semantic_segmentation"

    IMAGE_CLASSIFICATION_SINGLE_LABEL = "image_classification_single_label"

    IMAGE_CLASSIFICATION_MULTI_LABEL = "image_classification_multi_label"

    # 矩形框对象探测
    OBJECT_DETECTION_BBOX = "object_detection_bbox"
    # 实例分割（标准）
    INSTANCE_SEGMENTATION = "image_segmentation_instance"
    # 实例分割（孔洞）
    INSTANCE_SEGMENTATION_MASK = "instance_segmentation_mask"


ML_TASK_TYPE_LABEL_CN: Mapping[MlTaskType, str] = {
    MlTaskType.TEXT_CLASSIFICATION_SINGLE_LABEL: "单标签文本分类",
    MlTaskType.TEXT_CLASSIFICATION_MULTI_LABEL: "多标签文本分类",
    MlTaskType.ENTITY_RECOGNITION: "实体识别",
    MlTaskType.SEMANTIC_SEGMENTATION: "语义分割",
    MlTaskType.IMAGE_CLASSIFICATION_SINGLE_LABEL: "单标签图像分类",
    MlTaskType.IMAGE_CLASSIFICATION_MULTI_LABEL: "多标签图像分类",
    MlTaskType.OBJECT_DETECTION_BBOX: "目标检测",
    MlTaskType.INSTANCE_SEGMENTATION: "实例分割（标准）",
    MlTaskType.INSTANCE_SEGMENTATION_MASK: "实例分割（孔洞）",
}

ML_TASK_TYPES_BY_ML_MODEL_TYPE: Mapping[MlModelType, List[MlTaskType]] = {
    MlModelType.TEXT: [
        MlTaskType.TEXT_CLASSIFICATION_SINGLE_LABEL,
        MlTaskType.TEXT_CLASSIFICATION_MULTI_LABEL,
        MlTaskType.ENTITY_RECOGNITION,
    ],
    MlModelType.IMAGE: [
        MlTaskType.SEMANTIC_SEGMENTATION,
        MlTaskType.IMAGE_CLASSIFICATION_SINGLE_LABEL,
        MlTaskType.IMAGE_CLASSIFICATION_MULTI_LABEL,
        MlTaskType.OBJECT_DETECTION_BBOX,
        MlTaskType.INSTANCE_SEGMENTATION,
        MlTaskType.INSTANCE_SEGMENTATION_MASK,
    ],
}

ML_ANNOTATION_TYPES_BY_ML_MODEL_TYPE: Mapping[MlModelType, List[MLModelAnnotationType]] = {
    MlModelType.TEXT: [
        MLModelAnnotationType.TEXT_CLASSIFICATION,
        MLModelAnnotationType.ENTITY_RECOGNITION,
    ],
    MlModelType.IMAGE: [
        MLModelAnnotationType.IMAGE_CLASSIFICATION,
        MLModelAnnotationType.OBJECT_DETECTION,
        MLModelAnnotationType.IMAGE_SEGMENTATION,
    ],
}


class MlTaskTypeEnumItem(BaseModel):
    """MlTaskType 选项（用于枚举接口）"""
    label: str = Field(..., description="展示名称（中文）")
    value: str = Field(..., description="枚举值，与 MlTaskType 一致")


class MlTaskTypesByModalityResp(BaseModel):
    """按模型大类（文本 / 图像）分组的 MlTaskType 列表"""
    text: List[MlTaskTypeEnumItem] = Field(..., description="model_type=text 时可选的任务子类型")
    image: List[MlTaskTypeEnumItem] = Field(..., description="model_type=image 时可选的任务子类型")


class MlModelCreate(BaseModel):
    """创建机器学习模型"""

    name: str = Field(..., min_length=1, max_length=96, description="模型名称，支持中英文、数字、中划线、下划线")
    description: Optional[str] = Field(None, max_length=1000, description="模型描述")
    model_type: MlModelType = Field(..., description="第一层：text / image")
    annotation_type: MLModelAnnotationType = Field(..., description="第二层：文本分类 / 实体识别 / 图像分类 / 物体检测/图像分割")
    task_type: Optional[MlTaskType] = Field(
        None,
        description="第三层任务子类型（MlTaskType）；若填写则由模型服务校验本仓库 scripts/<task_type>/ 存在且非空",
    )
    source_type: str = Field(
        "notebook",
        description="来源：notebook（从 Notebook 产出注册）或 local_upload（分片上传 merge 后的单个 .pt）",
    )
    notebook_id: Optional[int] = Field(None, gt=0, description="关联 Notebook 主键（source_type=notebook 时必填）")
    source_ref: Optional[str] = Field(None, max_length=500, description="Notebook 侧相对路径或选中的模型标识（source_type=notebook 时必填）")
    tokenizer_source_ref: Optional[str] = Field(
        None,
        max_length=500,
        description="仅 source_type=notebook 且为文本模型时：Notebook 工作区内 tokenizer.json 相对路径（必填）；local_upload 时不要填写",
    )
    upload_id: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
        description="分片上传 merge 后的 uploadId（模型文件名需以 .pt 结尾）；source_type=local_upload 时必填，沿用既有 init/upload/merge 流程",
    )
    tokenizer_upload_id: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
        description="仅 source_type=local_upload 且为文本模型：分片 merge 的 uploadId（文件名须为 tokenizer.json）；与 notebook 来源互斥，勿在 source_type=notebook 时填写",
    )
    notebook_instance_name: Optional[str] = Field(
        None, max_length=200,
        description="可选；若传则须与 Notebook 库中 instance_name 一致，用于校验",
    )
    network_structure: Optional[str] = Field(None, max_length=200, description="网络结构")

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        try:
            validate_name_format(v, "模型名称")
        except ValueError as e:
            raise ValueError(str(e))
        return v

    @model_validator(mode='after')
    def validate_source_fields(self) -> 'MlModelCreate':
        st = (self.source_type or "notebook").strip().lower()
        is_text_model = self.model_type == MlModelType.TEXT
        if st not in ('notebook', 'local_upload'):
            raise ValueError("source_type 须为 notebook 或 local_upload")
        object.__setattr__(self, 'source_type', st)
        if (self.tokenizer_source_ref or '').strip() and (self.tokenizer_upload_id or '').strip():
            raise ValueError("tokenizer_source_ref 与 tokenizer_upload_id 不能同时填写")
        if st == 'notebook':
            if self.notebook_id is None:
                raise ValueError("source_type=notebook 时 notebook_id 必填")
            if not (self.source_ref or '').strip():
                raise ValueError("source_type=notebook 时 source_ref 必填")
            if (self.tokenizer_upload_id or '').strip():
                raise ValueError(
                    "source_type=notebook 时 tokenizer 必须来自 Notebook 工作区，请使用 tokenizer_source_ref，勿填 tokenizer_upload_id"
                )
            if is_text_model and not (self.tokenizer_source_ref or '').strip():
                raise ValueError("文本类型且 source_type=notebook 时 tokenizer_source_ref 必填")
            elif not is_text_model and (self.tokenizer_source_ref or '').strip():
                raise ValueError("非文本模型请勿填写 tokenizer_source_ref")
            if self.upload_id:
                raise ValueError("notebook 来源请勿填写 upload_id")
        else:
            if not (self.upload_id or '').strip():
                raise ValueError("source_type=local_upload 时须填写 upload_id（.pt 模型文件的分片上传 merge ID）")
            if is_text_model and not (self.tokenizer_upload_id or '').strip():
                raise ValueError("source_type=local_upload 时须填写 tokenizer_upload_id（tokenizer.json 的分片上传 merge ID）")
            if self.notebook_id is not None or (self.source_ref or '').strip() or (self.tokenizer_source_ref or '').strip():
                raise ValueError("local_upload 来源请勿填写 notebook_id、source_ref 或 tokenizer_source_ref")
        allowed_ann = ML_ANNOTATION_TYPES_BY_ML_MODEL_TYPE.get(self.model_type)
        if allowed_ann is not None and self.annotation_type not in allowed_ann:
            raise ValueError(
                f"annotation_type 与 model_type 不匹配：model_type={self.model_type.value} 时须为 "
                f"{', '.join(a.value for a in allowed_ann)} 之一"
            )
        return self

    class Config:
        json_schema_extra = {
            "example": {
                "name": "text-clf-demo",
                "description": "Notebook 导出的文本分类基线",
                "model_type": "text",
                "annotation_type": "text_classification",
                "task_type": "text_classification_single_label",
                "source_type": "notebook",
                "notebook_id": 1001,
                "source_ref": "outputs/checkpoints/best",
                "tokenizer_source_ref": "outputs/checkpoints/best/tokenizer.json",
                "notebook_instance_name": "nb-project-001",
                "network_structure": "BERT-base-chinese",
            }
        }


class MlModelVersionCreate(BaseModel):
    """新增模型版本（新增版本弹窗）"""
    description: Optional[str] = Field(None, max_length=1000, description="版本描述")
    source_type: str = Field(
        "notebook",
        description="来源：notebook 或 local_upload（分片 merge 后填 upload_id；文本模型本地上传另需 tokenizer_upload_id）",
    )
    notebook_id: Optional[int] = Field(None, gt=0, description="关联 Notebook 主键（source_type=notebook 时必填）")
    source_ref: Optional[str] = Field(None, max_length=500, description="Notebook 侧路径（source_type=notebook 时必填）")
    tokenizer_source_ref: Optional[str] = Field(
        None,
        max_length=500,
        description="source_type=notebook 且文本模型：Notebook 内 tokenizer.json 相对路径（必填）；勿与 tokenizer_upload_id 同传",
    )
    upload_id: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
        description="分片上传 merge 后的 uploadId（模型文件名需以 .pt 结尾）；source_type=local_upload 时必填",
    )
    tokenizer_upload_id: Optional[str] = Field(
        None,
        min_length=1,
        max_length=100,
        description="source_type=local_upload 且文本模型：tokenizer.json 分片 merge 的 uploadId；notebook 来源勿填",
    )
    notebook_instance_name: Optional[str] = Field(
        None, max_length=200, description="可选；若传则须与 Notebook 库中 instance_name 一致",
    )
    network_structure: Optional[str] = Field(None, max_length=200, description="网络结构")

    @model_validator(mode='after')
    def validate_version_source(self) -> 'MlModelVersionCreate':
        st = (self.source_type or "notebook").strip().lower()
        if st not in ('notebook', 'local_upload'):
            raise ValueError("source_type 须为 notebook 或 local_upload")
        object.__setattr__(self, 'source_type', st)
        if (self.tokenizer_source_ref or '').strip() and (self.tokenizer_upload_id or '').strip():
            raise ValueError("tokenizer_source_ref 与 tokenizer_upload_id 不能同时填写")
        if st == 'notebook':
            if self.notebook_id is None:
                raise ValueError("source_type=notebook 时 notebook_id 必填")
            if not (self.source_ref or '').strip():
                raise ValueError("source_type=notebook 时 source_ref 必填")
            if (self.tokenizer_upload_id or '').strip():
                raise ValueError("notebook 来源请勿填写 tokenizer_upload_id")
            if self.upload_id:
                raise ValueError("notebook 来源请勿填写 upload_id")
        else:
            if not (self.upload_id or '').strip():
                raise ValueError("source_type=local_upload 时须填写 upload_id（.pt 模型文件）")
            if self.notebook_id is not None or (self.source_ref or '').strip() or (self.tokenizer_source_ref or '').strip():
                raise ValueError("local_upload 来源请勿填写 notebook_id、source_ref 或 tokenizer_source_ref")
        return self

    class Config:
        json_schema_extra = {
            "example": {
                "description": "V2 在更大语料上微调",
                "notebook_id": 1001,
                "source_ref": "outputs/checkpoints/v2-best",
                "notebook_instance_name": "nb-project-001",
                "network_structure": "BERT-large-chinese",
            }
        }


class MlModelUpdate(BaseModel):
    """更新机器学习模型版本（描述、网络结构、数据来源与产物路径）

    不变更来源时仅需传 description / network_structure；切换或更新 Notebook/本地上传来源时须传
    `source_type` 与对应字段（规则与新增版本 `MlModelVersionCreate` 一致），或与存量记录合并：
    仅改 `source_ref` / `tokenizer_source_ref` 时可省略 `notebook_id`（沿用当前版本已有关联 Notebook）。
    """
    description: Optional[str] = Field(None, max_length=1000, description="版本描述")
    network_structure: Optional[str] = Field(None, max_length=200, description="网络结构")
    source_type: Optional[str] = Field(
        None,
        description="变更数据来源时填写：notebook 或 local_upload；可与 notebook_id、source_ref、tokenizer_source_ref、upload_id 组合",
    )
    notebook_id: Optional[int] = Field(None, gt=0, description="Notebook 主键（Notebook 来源）")
    source_ref: Optional[str] = Field(None, max_length=500, description="Notebook 工作区相对路径（Notebook 来源）")
    tokenizer_source_ref: Optional[str] = Field(
        None,
        max_length=500,
        description="Notebook 来源下 tokenizer 仅能为工作区相对路径；本地上传来源勿填",
    )
    upload_id: Optional[str] = Field(
        None,
        max_length=100,
        description="分片上传 merge 后的 uploadId（本地上传来源，模型文件名需以 .pt 结尾）",
    )
    tokenizer_upload_id: Optional[str] = Field(
        None,
        max_length=100,
        description="本地上传来源下 tokenizer 仅为分片 merge 的 uploadId；Notebook 来源勿填",
    )
    notebook_instance_name: Optional[str] = Field(
        None,
        max_length=200,
        description="可选；若传则须与 Notebook 库中 instance_name 一致（预留）",
    )

    @model_validator(mode='after')
    def validate_source_not_mixed(self) -> 'MlModelUpdate':
        uid = (self.upload_id or "").strip()
        tokenizer_uid = (self.tokenizer_upload_id or "").strip()
        tsr = (self.tokenizer_source_ref or "").strip()
        if tsr and tokenizer_uid:
            raise ValueError("tokenizer_source_ref 与 tokenizer_upload_id 不能同时指定")
        has_nb_model = self.notebook_id is not None or (self.source_ref or "").strip() != ""
        if uid and has_nb_model:
            raise ValueError("不能同时指定 upload_id 与 Notebook 模型字段（notebook_id / source_ref）")
        if uid and tsr:
            raise ValueError("本地上传 model.pt 时不要同时传 tokenizer_source_ref")
        if self.source_type:
            st = self.source_type.strip().lower()
            if st not in ('notebook', 'local_upload'):
                raise ValueError("source_type 须为 notebook 或 local_upload")
            object.__setattr__(self, 'source_type', st)
            if st == "notebook" and tokenizer_uid:
                raise ValueError("Notebook 来源不能使用 tokenizer_upload_id")
            if st == "local_upload" and tsr:
                raise ValueError("本地上传来源不能使用 tokenizer_source_ref")
        return self


class MlModelResponse(BaseModelWithTimezone):
    """机器学习模型版本详情"""
    id: int
    name: str
    model_version: str
    description: Optional[str] = None
    project_id: int
    model_type: str
    annotation_type: str
    task_type: Optional[str] = None
    source_type: str
    notebook_id: Optional[int] = Field(None, description="关联 Notebook 主键")
    notebook_name: Optional[str] = Field(None, description="关联 Notebook 名称")
    source_ref: Optional[str] = Field(
        None,
        description="Notebook 时为模型产物相对路径或标识；local_upload 时为 model.pt 分片 merge 的 uploadId",
    )
    tokenizer_source_ref: Optional[str] = Field(
        None,
        description=(
            "source_type=notebook 且文本模型：Notebook 工作区 tokenizer.json 相对路径；"
            "source_type=local_upload 且文本模型：tokenizer 分片 merge 的 uploadId（与 source_ref 对称）"
        ),
    )
    network_structure: Optional[str] = None
    artifact_uri: Optional[str] = Field(
        None,
        description="model.pt 在 JFS 上的落盘路径（形如 …/ml_models/{id}/model.pt）",
    )
    tokenizer_uri: Optional[str] = Field(
        None,
        description="tokenizer.json 在 JFS 上的落盘路径（与 model.pt 同目录，形如 …/ml_models/{id}/tokenizer.json）",
    )
    status: str = Field(
        ...,
        description="创建中：产物异步复制中；已完成：复制成功；失败：复制失败（与 TaskStatus 中文枚举值一致）",
    )
    created_id: Optional[int] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 101,
                "name": "text-clf-demo",
                "model_version": "V1",
                "description": "Notebook 导出的文本分类基线",
                "project_id": 1,
                "model_type": "text",
                "annotation_type": "text_classification",
                "task_type": "text_classification_single_label",
                "source_type": "notebook",
                "notebook_id": 1001,
                "notebook_name": "text-clf-dev",
                "source_ref": "outputs/checkpoints/best",
                "tokenizer_source_ref": "outputs/checkpoints/best/tokenizer.json",
                "network_structure": "BERT-base-chinese",
                "artifact_uri": "/jfs/tenant/ml_models/101/model.pt",
                "tokenizer_uri": "/jfs/tenant/ml_models/101/tokenizer.json",
                "status": "已完成",
                "created_id": 1,
                "created_by": "demo_user",
                "created_at": "2026-01-01T10:00:00+08:00",
                "updated_at": "2026-01-01T10:05:00+08:00",
            }
        }


class MlModelSummaryResponse(BaseModel):
    """机器学习模型汇总（按名称分组，含版本数量）"""
    id: int = Field(..., description="取该名称下第一条记录的 id")
    model_name: str = Field(..., description="模型名称")
    version_count: int = Field(..., description="版本数量")
    model_type: str = Field(..., description="模型类型")
    annotation_type: Optional[str] = Field(None, description="第二层标注类型，与数据集对齐")
    task_type: Optional[str] = Field(None, description="任务子类型")

    source_type: str
    source_ref: Optional[str] = Field(
        None,
        description="Notebook 时为模型产物路径或标识；local_upload 时为 model.pt 的 merge uploadId",
    )
    tokenizer_source_ref: Optional[str] = Field(
        None,
        description="Notebook 时为 tokenizer.json 相对路径；local_upload 文本模型时为 tokenizer 的 merge uploadId",
    )
    network_structure: Optional[str] = None
    artifact_uri: Optional[str] = Field(None, description="model.pt 在 JFS 上的路径")
    tokenizer_uri: Optional[str] = Field(
        None,
        description="tokenizer.json 在 JFS 上的路径（与 model.pt 同目录）",
    )
    notebook_id: Optional[int] = Field(None, description="该名称下首条记录的 notebook_id")
    project_id: int = Field(..., description="项目ID")
    latest_version: str = Field(..., description="最新版本号")
    earliest_version: str = Field(..., description="最早版本号")
    created_at: datetime = Field(..., description="首次创建时间")
    updated_at: datetime = Field(..., description="最后更新时间")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 101,
                "model_name": "text-clf-demo",
                "version_count": 2,
                "model_type": "text",
                "annotation_type": "text_classification",
                "task_type": "text_classification_single_label",
                "source_type": "notebook",
                "source_ref": "outputs/checkpoints/best",
                "tokenizer_source_ref": "outputs/checkpoints/best/tokenizer.json",
                "network_structure": "BERT-base-chinese",
                "artifact_uri": "/jfs/tenant/ml_models/101/model.pt",
                "tokenizer_uri": "/jfs/tenant/ml_models/101/tokenizer.json",
                "notebook_id": 1001,
                "project_id": 1,
                "latest_version": "V2",
                "earliest_version": "V1",
                "created_at": "2026-01-01T10:00:00+08:00",
                "updated_at": "2026-01-15T12:00:00+08:00",
            }
        }

