from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, field_validator, model_validator
from fastapi import Form, Body, UploadFile

from app.common.status import TaskStatus
from app.schemas.common import BaseModelWithTimezone
from enum import Enum

from app.schemas.repository_image import CardType, CardModel
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.schemas.inference_param import InferenceParamType
from app.schemas.training_task import TrainingTypeCategory
from app.schemas.training_dataset import DatasetFormat, CountByValueItem, AttrOptionGroupItem
from app.schemas.business_attr_value import BusinessAttrValueResponse


# 推理方式枚举
class InferenceMethod(str, Enum):
    """推理方式枚举"""
    OFFLINE = "offline"  # 离线推理
    ONLINE = "online"  # 在线推理
    IMPORT = "import"  # 导入推理结果集
    THIRD_API = "third_api" # 第三方api推理方式

# 推理数据集用途枚举
# todo 添加了推理数据集用途枚举，用于划分推理结果数据集的用途
class InferenceDatasetUsage(str, Enum):
    # (值, 描述)
    BUSINESS_INFERENCE = "business-inference", "业务推理结果集"
    DEFAULT_INFERENCE = "default-inference", "默认推理结果集"

    def __new__(cls, value, description):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj._description = description
        return obj

    @property
    def description(self) -> str:
        return self._description


# 上传方式枚举
class UploadMethod(str, Enum):
    """上传方式枚举"""
    LOCAL = "local"  # 本地上传
    URL = "url"  # URL获取


# 推理结果数据集导入格式枚举
class InferenceResultDatasetUploadType(str, Enum):
    """推理结果数据集上传格式枚举"""
    JSONL_TYPE = "jsonl"
    JSON_TYPE = "json"
    XLSX_TYPE = "xlsx"
    CSV_TYPE = "csv"
    ZIP_TYPE = "zip"


# 推理结果集导出格式枚举
class InferenceResultDatasetExportType(str, Enum):
    """推理结果数据集下载格式枚举"""
    JSONL_TYPE = "jsonl"
    JSON_TYPE = "json"
    XLSX_TYPE = "xlsx"
    ZIP_TYPE = "zip"


# ==================== 请求模型 ====================

class InferenceResultDatasetCreate(BaseModel):
    """创建推理结果数据集请求模型（用于 Form 表单数据）"""
    name: str = Form(..., max_length=150, description="数据集名称")
    description: Optional[str] = Form(None, max_length=1000, description="数据集描述")
    inference_method: InferenceMethod = Form(...,
                                             description="推理方式：offline离线推理, online在线推理, import导入推理结果集")
    schedule_at: Optional[datetime] = Form(None, description="计划执行时间")

    # 离线推理字段
    model_source: Optional[str] = Form("base_model",
                                     description="模型来源：base_model基础模型, trained_model训练模型（离线推理使用，默认base_model）")
    model_id: Optional[int] = Form(None, description="待推理模型ID（base_models.id 或 trained_models.id）")
    model_name: Optional[str] = Form(None,
                                    description="待推理模型名称及版本（离线推理为对应的模型名，在线服务为对应服务的模型名，导入推理结果集需要用户单独设置）")

    # 在线推理字段
    online_service_id: Optional[int] = Form(None, description="待推理服务ID（在线推理使用）")
    online_service_name: Optional[str] = Form(None, description="待推理服务名称及版本（在线推理使用）")

    # 待推理数据（离线推理和在线推理使用）
    source_dataset_id: Optional[int] = Form(None, description="待推理数据ID（训练数据集ID）")
    source_dataset_name: Optional[str] = Form(None, description="待推理数据名称")

    # 待推理模型参数（离线推理和在线推理使用）
    inference_params: Optional[dict[InferenceParamType, Any]] = Field(None,
                                                                      description="待推理模型参数（字典格式，键为推理参数类型枚举，值为参数值，可选键：temperature, top_p, max_tokens, presence_penalty）")

    # 推理资源配置
    graphics_card_resource: GraphicsCardResourceConfig = Field(
        default_factory=lambda: GraphicsCardResourceConfig(
            card_type=CardType.GPU,
            card_model=CardModel.A800,
            count=1,
            card_memory="80GB",
            k8s_resource_type="nvidia.com/gpu"
        ),
        description="GPU/NPU 资源配置"
    ),

    # 导入推理结果集字段
    upload_method: Optional[UploadMethod] = Form(None,
                                                 description="上传方式：local本地上传, url_url获取（导入推理结果集使用）")
    file_url: Optional[str] = Form(None, description="文件URL（导入推理结果集，URL获取方式使用）")
    # 注意：files 字段不能直接在 Pydantic 模型中定义，需要在接口层单独处理
    # files: Optional[List[UploadFile]] - 在接口层通过 File() 参数传递
    upload_ids: Optional[List[str]] = Form(None, description="文件upload id列表")

    # 数据集类型和格式（仅导入推理结果集时需要前端传递，离线/在线推理会从source_dataset_id对应的训练数据集中自动获取）
    dataset_type: Optional[TrainingTypeCategory] = Form(None,
                                                        description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态（仅导入推理结果集时需要）")
    dataset_format: Optional[DatasetFormat] = Form(None,
                                                   description="数据格式：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式（仅导入推理结果集时需要）")

    # 数据集用途
    usage: Optional[InferenceDatasetUsage] = Form(None, description="数据集用途：default-inference默认用途，business-inference业务用途")

    @field_validator('upload_method', mode='before')
    @classmethod
    def validate_upload_method(cls, v):
        """将字符串转换为 UploadMethod 枚举"""
        if v is None:
            return None
        if isinstance(v, UploadMethod):
            return v
        if isinstance(v, str):
            return UploadMethod(v)
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "name": "推理结果集_2025_08_26_10_01_26",
                "description": "用于生成技术领域的问答对话推理结果",
                "inference_method": "offline",
                "model_id": 1,
                "model_name": "Qwen3-7B-sft-20step",
                "source_dataset_id": 1,
                "source_dataset_name": "问答测试集",
                "graphics_card_resource": {
                    "card_type": "GPU",
                    "card_model": "A800",
                    "count": 1,
                    "card_memory": "80GB",
                    "k8s_resource_type": "nvidia.com/gpu"
                }
            }
        }


class InferenceResultDatasetBasicInfoUpdate(BaseModel):
    """推理结果集基础信息编辑请求模型"""
    name: Optional[str] = Field(None, max_length=150, description="新的推理结果集名称")
    description: Optional[str] = Field(None, max_length=1000, description="新的推理结果集描述；传 null 表示删除描述")

    @model_validator(mode="after")
    def validate_update_fields(self):
        if "name" not in self.model_fields_set and "description" not in self.model_fields_set:
            raise ValueError("name 和 description 至少需要传一个")
        return self


class InferenceResultDatasetItemCreate(BaseModel):
    """批量创建中单个推理结果数据集的请求模型"""
    name: str = Field(..., max_length=150, description="数据集名称")
    description: Optional[str] = Field(None, max_length=1000, description="数据集描述")
    # 离线推理字段（每个数据集可以有不同的模型）
    model_source: Optional[str] = Field("base_model", description="模型来源：base_model基础模型, trained_model训练模型（离线推理使用）")
    model_id: Optional[int] = Field(None, description="待推理模型ID（base_models.id 或 trained_models.id）")
    model_name: Optional[str] = Field(None, description="待推理模型名称及版本（离线推理使用）")
    # 在线推理字段（每个数据集可以有不同的服务）
    online_service_id: Optional[int] = Field(None, description="待推理服务ID（在线推理使用）")
    online_service_name: Optional[str] = Field(None, description="待推理服务名称及版本（在线推理使用）")

    # 数据集类型和格式（仅导入推理结果集时需要前端传递，离线/在线推理会从source_dataset_id对应的训练数据集中自动获取）
    dataset_type: Optional[TrainingTypeCategory] = Field(None,
                                                         description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态（仅导入推理结果集时需要）")
    dataset_format: Optional[DatasetFormat] = Field(None,
                                                    description="数据格式：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式（仅导入推理结果集时需要）")


class InferenceResultDatasetBatchCreate(BaseModel):
    """批量创建推理结果数据集请求模型（共用字段在外侧）"""
    # 共用字段：推理方式
    inference_method: InferenceMethod = Field(...,
                                              description="推理方式：offline离线推理, online在线推理, import导入推理结果集")

    # 共用字段：待推理数据（离线推理和在线推理使用）
    source_dataset_id: Optional[int] = Field(None, description="待推理数据ID（训练数据集ID）")
    source_dataset_name: Optional[str] = Field(None, description="待推理数据名称")

    # 共用字段：待推理模型参数（离线推理和在线推理使用）
    inference_params: Optional[dict[InferenceParamType, Any]] = Field(None,
                                                                      description="待推理模型参数（字典格式，键为推理参数类型枚举，值为参数值，可选键：temperature, top_p, max_tokens, presence_penalty）")

    # 共用字段：显卡资源配置（离线推理使用）
    graphics_card_resource: Optional[GraphicsCardResourceConfig] = Field(
        default_factory=lambda: GraphicsCardResourceConfig(
            card_type=CardType.GPU,
            card_model=CardModel.A800,
            count=1,
            card_memory="80GB",
            k8s_resource_type="nvidia.com/gpu"
        ),
        description="GPU/NPU 资源配置"
    )

    # 共用字段：导入推理结果集
    upload_method: Optional[UploadMethod] = Field(None,
                                                  description="上传方式：local本地上传, url_url获取（导入推理结果集使用）")
    # 导入推理结果集字段
    file_url: Optional[str] = Field(None, description="文件URL（导入推理结果集，URL获取方式使用）")

    # 共用字段：数据集类型和格式（仅导入推理结果集时需要前端传递，离线/在线推理会从source_dataset_id对应的训练数据集中自动获取）
    dataset_type: Optional[TrainingTypeCategory] = Field(None,
                                                         description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态（仅导入推理结果集时需要，所有数据集共用）")
    dataset_format: Optional[DatasetFormat] = Field(None,
                                                    description="数据格式：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式（仅导入推理结果集时需要，所有数据集共用）")

    # 共用字段：数据集用途
    usage: Optional[InferenceDatasetUsage] = Field(None, description="数据集用途：default-inference默认用途，business-inference业务用途")

    # 数据集列表（每个数据集有自己的名称、描述、模型/服务等）
    datasets: List[InferenceResultDatasetItemCreate] = (
        Field(..., min_length=1, max_length=100, description="推理结果数据集列表"))

    class Config:
        json_schema_extra = {
            "example": {
                "inference_method": "offline",
                "graphics_card_resource": {
                    "card_type": "GPU",
                    "card_model": "A800",
                    "count": 1,
                    "card_memory": "80GB",
                    "k8s_resource_type": "nvidia.com/gpu"
                },
                "source_dataset_id": 1,
                "source_dataset_name": "问答测试集",
                "datasets": [
                    {
                        "name": "推理结果集_1",
                        "description": "第一个推理结果集",
                        "model_id": 1,
                        "model_name": "Qwen3-7B-sft-20step"
                    },
                    {
                        "name": "推理结果集_2",
                        "description": "第二个推理结果集",
                        "model_id": 2,
                        "model_name": "Qwen3-7B-sft-30step"
                    }
                ]
            }
        }


# ==================== 响应模型 ====================

class InferenceResultDatasetResponse(BaseModelWithTimezone):
    """推理结果数据集响应模型"""
    id: int = Field(..., description="数据集ID")
    name: str = Field(..., description="数据集名称")
    description: Optional[str] = Field(None, description="数据集描述")
    project_id: int = Field(..., description="关联项目ID")
    inference_method: InferenceMethod = Field(..., description="推理方式")
    model_source: Optional[str] = Field("base_model", description="模型来源：base_model基础模型, trained_model训练模型")
    model_id: Optional[int] = Field(None, description="待推理模型ID")
    model_name: Optional[str] = Field(None, description="待推理模型名称及版本")
    model_version: Optional[str] = Field(None, description="模型版本，当 model_source 为 trained_model 时返回训练模型版本")
    online_service_id: Optional[int] = Field(None, description="待推理服务ID")
    online_service_name: Optional[str] = Field(None, description="待推理服务名称及版本")
    source_dataset_id: Optional[int] = Field(None, description="待推理数据ID")
    source_dataset_name: Optional[str] = Field(None, description="待推理数据名称")
    # 待推理模型参数
    inference_params: Optional[dict[InferenceParamType, Any]] = Field(None,
                                                                      description="待推理模型参数配置（字典格式，键为推理参数类型枚举，值为参数值）")
    # 显卡资源配置
    graphics_card_resource: Optional[GraphicsCardResourceConfig] = Field(None, description="GPU/NPU 资源配置")
    file_path: Optional[str] = Field(None, description="文件路径")
    file_size: Optional[float] = Field(None, description="文件大小(MB)")
    upload_method: Optional[UploadMethod] = Field(None, description="上传方式")
    # 数据集类型和格式（参考训练数据集的格式处理）
    dataset_type: Optional[TrainingTypeCategory] = Field(None,
                                                         description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态")
    dataset_format: Optional[DatasetFormat] = Field(None,
                                                    description="数据格式：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式")
    total_items: Optional[int] = Field(None, description="总数据量")
    status: TaskStatus = Field(..., description="状态")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    progress: int = Field(..., description="进度(0-100)")
    started_at: Optional[datetime] = Field(None, description="开始时间")
    finished_at: Optional[datetime] = Field(None, description="完成时间")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    created_by: Optional[str] = Field(None, description="创建人")
    processing_error: Optional[str] = Field(None, description="处理失败时的错误信息")
    attr_values: Optional[List[BusinessAttrValueResponse]] = Field(
        default_factory=list,
        description="关联业务属性值及已选选项列表（business_type=inference_result）",
    )

    @model_validator(mode='before')
    @classmethod
    def convert_graphics_card_resource(cls, data):
        """将数据库中的 graphics_card_resource 和 inference_params 字典转换为相应对象"""
        if isinstance(data, dict):
            if 'graphics_card_resource' in data and isinstance(data['graphics_card_resource'], dict):
                data['graphics_card_resource'] = GraphicsCardResourceConfig(**data['graphics_card_resource'])
            # 将数据库中的 inference_params 字典的键转换为 InferenceParamType 枚举
            if 'inference_params' in data and isinstance(data['inference_params'], dict):
                # 将字符串键转换为枚举键
                converted_params = {}
                for key, value in data['inference_params'].items():
                    try:
                        param_enum = InferenceParamType(key)
                        converted_params[param_enum] = value
                    except ValueError:
                        # 如果键不是有效的枚举值，保持原样
                        converted_params[key] = value
                data['inference_params'] = converted_params
        return data

    class Config:
        from_attributes = True


class InferenceResultDatasetBatchResponse(BaseModel):
    """批量创建推理结果数据集响应模型"""
    total: int = Field(..., description="总数量")
    success: int = Field(..., description="成功数量")
    failed: int = Field(..., description="失败数量")
    results: List[InferenceResultDatasetResponse] = Field(default_factory=list, description="成功创建的数据集列表")
    errors: List[Dict[str, Any]] = Field(default_factory=list, description="失败信息列表，包含数据集名称和错误信息")

    class Config:
        json_schema_extra = {
            "example": {
                "total": 2,
                "success": 2,
                "failed": 0,
                "results": [],
                "errors": []
            }
        }


class InferenceResultDatasetSummaryResponse(BaseModel):
    """推理结果数据集汇总响应模型（列表使用）"""
    id: int = Field(..., description="数据集ID")
    name: str = Field(..., description="数据集名称")
    description: Optional[str] = Field(None, description="数据集描述")
    inference_method: InferenceMethod = Field(..., description="推理方式")

    # 模型/服务信息（根据推理方式显示不同字段）
    model_name: Optional[str] = Field(None, description="待推理模型名称（离线推理使用）")
    online_service_name: Optional[str] = Field(None, description="待推理服务名称（在线推理使用）")

    # 数据集信息
    source_dataset_name: Optional[str] = Field(None, description="待推理数据名称")

    # 数据集类型和格式（参考训练数据集的格式处理）
    dataset_type: Optional[TrainingTypeCategory] = Field(None,
                                                         description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态")
    dataset_format: Optional[DatasetFormat] = Field(None,
                                                    description="数据格式：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式")

    total_items: Optional[int] = Field(None, description="总数据量")
    status: TaskStatus = Field(..., description="状态")
    progress: int = Field(..., description="进度(0-100)")
    started_at: Optional[datetime] = Field(None, description="开始时间")
    finished_at: Optional[datetime] = Field(None, description="完成时间")
    created_at: datetime = Field(..., description="创建时间")
    created_by: Optional[str] = Field(None, description="创建人")
    processing_error: Optional[str] = Field(None, description="处理失败时的错误信息")
    manual_trigger_required: Optional[bool] = Field(None, description="是否需要手动启动")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")

    class Config:
        from_attributes = True


class InferenceResultItemResponse(BaseModel):
    """推理结果数据项响应模型（数据从文件读取）"""
    id: int = Field(..., description="数据项ID（行号）")
    dataset_id: int = Field(..., description="关联数据集ID")
    sequence: int = Field(..., description="序号（行号）")
    system: Optional[str] = Field(None, description="System")
    prompt: Optional[str] = Field(None, description="Prompt")
    standard_response: Optional[str] = Field(None, description="标准回答")
    model_response: Optional[str] = Field(None, description="模型回答")
    messages: Optional[List[Dict[str, str]]] = Field(None, description="多轮对话的消息内容")
    images: Optional[List[str]] = Field(None, description="图片理解用到的图片材料相对路劲")
    error: Optional[bool] = Field(None, description="是否报错")
    error_message: Optional[str] = Field(None, description="报错信息")

    class Config:
        from_attributes = True


class InferenceResultItemFlexibleResponse(BaseModel):
    """推理结果数据项响应模型（宽松格式，用于业务推理结果集，直接返回原始JSON对象）"""
    id: int = Field(..., description="数据项ID（行号）")
    dataset_id: int = Field(..., description="关联数据集ID")
    sequence: int = Field(..., description="序号（行号）")
    data: Dict[str, Any] = Field(..., description="原始数据对象（包含JSONL文件中的所有字段）")

    class Config:
        from_attributes = True


class InferenceResultItemResponsePage(BaseModel):
    items: List[InferenceResultItemResponse] = Field(..., description="当前页的样本列表（默认格式）")
    total: int = Field(..., description="总记录数")
    page: int = Field(..., description="当前页码（从1开始）")
    size: int = Field(..., description="每页显示条数")
    pages: int = Field(..., description="总页数")
    base_url: Optional[str] = Field(None, description="基础路径-用于拼接图片路径（仅图像理解数据集）")


class InferenceResultItemFlexibleResponsePage(BaseModel):
    """推理结果数据项响应模型（宽松格式，用于业务推理结果集）"""
    items: List[InferenceResultItemFlexibleResponse] = Field(..., description="当前页的样本列表（宽松格式）")
    total: int = Field(..., description="总记录数")
    page: int = Field(..., description="当前页码（从1开始）")
    size: int = Field(..., description="每页显示条数")
    pages: int = Field(..., description="总页数")
    base_url: Optional[str] = Field(None, description="基础路径-用于拼接图片路径（仅图像理解数据集）")


class InferenceResultDetailResponse(BaseModel):
    """推理结果数据集详情响应模型（包含基本信息和数据预览）"""
    # 基本信息
    id: int = Field(..., description="数据集ID")
    name: str = Field(..., description="数据集名称")
    description: Optional[str] = Field(None, description="数据集描述")
    inference_method: InferenceMethod = Field(..., description="推理方式")
    model_name: Optional[str] = Field(None, description="待推理模型/服务名称")
    source_dataset_name: Optional[str] = Field(None, description="待推理数据名称")
    # 数据集类型和格式（参考训练数据集的格式处理）
    dataset_type: Optional[TrainingTypeCategory] = Field(None,
                                                         description="数据集类型：text-generation文本生成, image-generation图像生成, image-understanding图像理解, multimodal多模态")
    dataset_format: Optional[DatasetFormat] = Field(None,
                                                    description="数据格式：prompt-response提示词+回复格式, role-based基于角色的对话格式, prefix-suffix-middle前缀+后缀+中间格式")
    total_items: Optional[int] = Field(None, description="总数据量")
    created_at: datetime = Field(..., description="创建时间")
    created_by: Optional[str] = Field(None, description="创建人")
    status: TaskStatus = Field(..., description="状态")
    progress: int = Field(..., description="进度(0-100)")
    started_at: Optional[datetime] = Field(None, description="开始时间")
    finished_at: Optional[datetime] = Field(None, description="完成时间")

    # 数据预览（分页）
    items: List[Union[InferenceResultItemResponse, InferenceResultItemFlexibleResponse]] = Field(
        default_factory=list, 
        description="推理结果数据项列表（根据数据集的 usage 字段，可能是固定格式或宽松格式）"
    )

    class Config:
        from_attributes = True


class InferenceResultAggregationResponse(BaseModel):
    """推理结果数据集聚合统计：按 dataset_format、dataset_type、属性选项统计数据集条数（不按 usage 出维度；须传非空 usage 才聚合）。"""
    dataset_format: Optional[List[CountByValueItem]] = Field(None, description="按 dataset_format 统计的数据量")
    dataset_type: Optional[List[CountByValueItem]] = Field(None, description="按 dataset_type 统计的数据量")
    attr_option: Optional[List[AttrOptionGroupItem]] = Field(
        None, description="按属性 name 分组统计各 option 对应的数据集条数（未同时传 attr_name+option_value 时返回）"
    )


class TaskLogResponse(BaseModel):
    """任务日志响应模型"""
    archived: bool = Field(..., description="是否为归档日志（从MinIO获取）")
    logs: List[str] = Field(..., description="日志内容列表")
