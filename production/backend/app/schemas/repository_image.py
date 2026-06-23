import re
from datetime import datetime
from enum import IntEnum, Enum
from typing import Optional, List, NamedTuple

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import BaseModelWithTimezone
from app.schemas.tag import BusinessTagInfo


# 业务类型枚举 is_show作为界面list接口展示过滤，无需客户选择镜像的业务类型设置False
class ImageType(IntEnum):
    def __new__(cls, desc: str, value: str, is_show: bool = True):
        obj = int.__new__(cls, value)
        obj._value_ = value
        obj.desc = desc
        obj.is_show = is_show
        return obj
    # NOTEBOOK 拆分为 LLM_NOTEBOOK 和 ML_NOTEBOOK
    # NOTEBOOK = ("在线notebook", 0, True)
    TEXT_GENERATION_SFT = ("text_generation_sft", 1, False)
    INFERENCE = ("模型部署", 3, True)
    DATA_CLEANING = ("data_cleaning", 2, False)
    INFERENCE_IMAGE = ("inference_image", 4, False)
    MODEL_DOWNLOAD = ("基础模型下载", 5, False)
    KUBECTL_IMAGE = ("kubectl命令", 6, False)
    BUILDKIT_IMAGE = ("buildkit镜像构建", 7, False)
    BENCHMARK_IMAGE = ("OpenCompass基准评估", 8, False)
    CUSTOM_LLM_NOTEBOOK = ("自定义-大模型-在线notebook", 9, False)
    CUSTOM_ML_NOTEBOOK = ("机器学习-notebook自定义镜像", 10, False)
    LLM_NOTEBOOK = ("大模型-在线notebook", 11, True)
    ML_NOTEBOOK = ("机器学习-在线notebook", 12, True)


class CardType(str, Enum):
    """卡类型"""
    GPU = "GPU"
    NPU = "NPU"
    CPU = "CPU"


class CardModel(str, Enum):
    """卡型号"""
    A800 = "A800"
    V100 = "V100"
    NPU_910B = "910B"


class CudaVersion(Enum):
    """CUDA / CANN 版本"""
    CUDA_12_6_85 = "12.6.85"
    CANN_8_1_RC1 = "8.1.rc1"


class ImageSource(str, Enum):
    """镜像来源"""
    BUILT_IN = "built-in"
    CUSTOM = "custom"


class ImageBuildTriggerType(str, Enum):
    """触发类型，自动：auto、手动：manual"""
    AUTO = "auto"
    MANUAL = "manual"

class ImageParts(NamedTuple):
    registry: str
    namespace: str
    image: str
    tag: str

class RepositoryImageBase(BaseModel):
    """镜像信息 Pydantic 模型"""
    image: str = Field(..., max_length=255, description="镜像名:tag")
    type: Optional[ImageType] = Field(
        ...,
        ge=0,
        description="镜像分类：1 大模型 / 2 数据清洗 / 3 推理 / 10 机器学习-notebook自定义镜像 / 11 大模型-在线notebook / 12 机器学习-在线notebook",
    )
    describe: Optional[str] = Field(None, max_length=1000, description="描述")
    repository_id: int = Field(..., gt=0, description="仓库id")
    namespace: str = Field(..., max_length=50, description="镜像命名空间/项目")
    card_category: Optional[CardType] = Field(None, description="显卡类型")
    card_model: Optional[CardModel] = Field(None, description="显卡型号")
    cuda_version: Optional[CudaVersion] = Field(None, description="cuda版本")
    python_version: Optional[str] = Field(None, max_length=50, description="python版本")
    image_source: Optional[ImageSource] = Field(ImageSource.BUILT_IN, description="镜像来源：是built-in，还是custom")

class RepositoryImageCreate(RepositoryImageBase):

    @field_validator('image')
    def validate_image(cls, v):
        """验证配置格式"""
        # 严格模式：只允许小写、数字、_-. 且长度 ≤ 128
        IMAGE_NAME_PATTERN = re.compile(
            r'^[a-z0-9_.-]+(?:/[a-z0-9_.-]+)*:[a-zA-Z0-9_.-]+$'
        )

        if not bool(IMAGE_NAME_PATTERN.fullmatch(v.strip())):
            raise ValueError('镜像名格式应为 .../name:tag')
        return v.strip() if v else v

class RepositoryImageDetailResponse(RepositoryImageBase, BaseModelWithTimezone):
    id: int
    created_at: datetime
    updated_at: datetime
    sub_type: Optional[str] = Field(None, description="镜像二级分类")
    repository_name: Optional[str] = None
    image_address: Optional[str] = None
    tags: Optional[List[BusinessTagInfo]] = Field(None, description="关联标签列表")

class RepositoryImageResponse(RepositoryImageBase, BaseModelWithTimezone):
    id: int
    created_at: datetime
    updated_at: datetime
    sub_type: Optional[str] = Field(None, description="镜像二级分类")
    repository_name: Optional[str] = None
    image_address: Optional[str] = None

class RepositoryImageTypeResp(BaseModel):
    label: str
    value: int


class SaveNotebookAsImageRequest(BaseModel):
    """保存 notebook 环境为自定义镜像的请求"""
    trigger_type: ImageBuildTriggerType = Field(ImageBuildTriggerType.AUTO, max_length=50, description="触发类型，自动：auto、手动：manual")
    # namespace: str = Field(..., max_length=255, description="命名空间")
    name: str = Field(..., max_length=255, description="名称")
    describe: Optional[str] = Field(None, max_length=1000, description="描述")
    schedule_at: Optional[datetime] = Field(None, description="定时执行时间（为空则立即执行）")
    include_lab_work: bool = Field(False, description="是否包含工作目录（/lab/work）代码")

    @field_validator('name')
    def validate_name(cls, v):
        """验证配置格式"""
        # 严格模式：只允许小写、数字、_-. 且长度 ≤ 128
        IMAGE_NAME_PATTERN = re.compile(
            r'^[a-z0-9_.-]+(?:/[a-z0-9_.-]+)*:[a-zA-Z0-9_.-]+$'
        )

        if not bool(IMAGE_NAME_PATTERN.fullmatch(v.strip())):
            raise ValueError('镜像名格式应为 .../name:tag')
        return v.strip() if v else v


class SaveNotebookAsImageResponse(BaseModel):
    """保存 notebook 环境为自定义镜像的响应"""
    snapshot_job_name: str = Field(..., description="Snapshot Job 名称")
    build_job_name: str = Field(..., description="Build Job 名称")
    build_log_id: Optional[int] = Field(None, description="构建日志记录ID")
    image_address: str = Field(..., description="完整镜像地址")


class AddImageRequest(BaseModel):
    """添加镜像请求"""
    namespace: str = Field(..., max_length=255, description="镜像命名空间")
    image_name: str = Field(..., max_length=255, description="镜像名称（包含tag）")
    describe: Optional[str] = Field(None, max_length=1000, description="描述")
    task: Optional[str] = Field("-", max_length=255, description="任务名称")
    image_type: ImageType = Field(..., description="镜像类型")

    @field_validator('image_name')
    def validate_image_name(cls, v):
        """验证镜像名称格式"""
        # 允许 name:tag 或 path/name:tag
        image_name_pattern = re.compile(
            r'^[A-Za-z0-9][A-Za-z0-9._/-]*:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$'
        )
        if not bool(image_name_pattern.fullmatch(v.strip())):
            raise ValueError('镜像名格式应为 name:tag 或 path/name:tag')
        return v.strip()

    @field_validator('namespace')
    def validate_namespace(cls, v):
        """命名空间去空格"""
        namespace = v.strip()
        if not namespace:
            raise ValueError('命名空间不能为空')
        return namespace

    @field_validator('image_type')
    def validate_image_type(cls, v):
        """仅允许自定义 notebook 入口类型"""
        if v not in [ImageType.CUSTOM_LLM_NOTEBOOK, ImageType.CUSTOM_ML_NOTEBOOK]:
            raise ValueError("image_type 只支持 9(CUSTOM_LLM_NOTEBOOK) 或 10(CUSTOM_ML_NOTEBOOK)")
        return v


class ImageBuildLogBase(BaseModel):
    """镜像构建日志基础模型"""
    name: str = Field(..., max_length=255, description="名称")
    project_id: int = Field(..., gt=0, description="项目ID")
    business_id: int = Field(..., ge=0, description="业务id（手动上传场景允许为0）")
    business_name: str = Field(..., max_length=255, description="业务名称")
    base_image: str = Field(..., max_length=255, description="基础镜像名称")
    output_image: str = Field(..., max_length=255, description="输出镜像名称")
    output_image_id: Optional[int] = Field(None, description="输出镜像ID（RepositoryImages.id）")
    image_type: int = Field(..., description="镜像类型，与image表的type一致")
    trigger_type: str = Field(..., max_length=50, description="触发类型，自动：auto、手动：manual")
    status: str = Field(..., max_length=50, description="状态")
    lab_k8s_uuid: str = Field(..., max_length=100, description="自定义k8s uuid")
    log_path: Optional[str] = Field(None, max_length=500, description="日志路径")
    describe: Optional[str] = Field(None, max_length=1000, description="描述")


class ImageBuildLogResponse(ImageBuildLogBase, BaseModelWithTimezone):
    """镜像构建日志响应模型"""
    id: int
    created_at: datetime
    updated_at: datetime
    created_id: Optional[int] = Field(None, description="创建者用户ID")
    created_by: Optional[str] = Field(None, description="创建者用户名称")
    tags: Optional[List[BusinessTagInfo]] = Field(None, description="关联标签列表")


class ImageBuildLogLogResponse(BaseModel):
    """镜像构建任务日志响应模型"""
    archived: bool = Field(..., description="是否为归档日志（从MinIO获取）")
    logs: List[str] = Field(..., description="日志内容列表")


class NotebookBuildingResponse(BaseModel):
    """Notebook 构建状态响应模型"""
    is_building: bool = Field(..., description="是否正在构建中")