from datetime import datetime
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field, model_validator, model_serializer, field_validator, computed_field
from app.common.status import TaskStatus
from app.utils.name_validator import validate_name_format
from app.schemas.common import BaseModelWithTimezone, ModelTypeBase
from app.schemas.model import ModelProvider
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.schemas.repository_image import CardType, CardModel
from app.utils.storage_enum import LlamaFactoryDatasetName, StoragePath
from app.core.config import settings
from enum import Enum

# ==================== 训练相关枚举 ====================
class TrainingTypeCategory(str, Enum):
    """训练类型分类枚举"""
    TEXT_GENERATION = "text-generation"
    IMAGE_GENERATION = "image-generation"
    IMAGE_UNDERSTANDING = "image-understanding"
    MULTIMODAL = "multimodal"
    BUSINESS = "business" # 业务训练类型

class TrainingMethodType(str, Enum):
    """训练方法枚举，用于定义不同的训练方法"""
    SFT = "sft"  # Supervised Fine-Tuning
    DPO = "dpo"  # Direct Preference Optimization
    GRPO = "grpo"  # Group Relative Policy Optimization
    # 添加了业务数据集的特殊训练类型business
    BUSINESS = "business" # 业务训练类型
    
    @classmethod
    def get_description(cls, method_type: str) -> str:
        """获取训练方法的描述"""
        descriptions = {
            cls.SFT: "监督微调 - 使用标注数据进行有监督的模型微调",
            cls.DPO: "直接偏好优化 - 基于人类偏好数据进行模型优化",
            cls.GRPO: "组相对策略优化 - 基于 verl 的强化学习训练",
            cls.BUSINESS: "业务数据集训练"
        }
        return descriptions.get(method_type, "未知训练方法")
    
    @classmethod
    def get_all_methods(cls) -> List[str]:
        """获取所有可用的训练方法"""
        return [method.value for method in cls]


class FineTuningType(str, Enum):
    """微调类型枚举，用于定义不同的微调方式"""
    LORA = "lora"  # LoRA 微调
    FULL_PARAMETER = "full"  # 全参微调
    FREEZE = "freeze"  # 冻结微调
    
    @classmethod
    def get_description(cls, fine_tuning_type: str) -> str:
        """获取微调类型的描述"""
        descriptions = {
            cls.LORA: "LoRA 微调 - 使用低秩适配器进行参数高效微调",
            cls.FULL_PARAMETER: "全参微调 - 对所有模型参数进行完整微调",
            cls.FREEZE: "冻结微调 - 冻结部分层进行微调"
        }
        return descriptions.get(fine_tuning_type, "未知微调类型")
    
    @classmethod
    def get_all_types(cls) -> List[str]:
        """获取所有可用的微调类型"""
        return [fine_tuning_type.value for fine_tuning_type in cls]


def infer_grpo_fine_tuning_type(additional_params: Optional[Dict[str, Any]]) -> FineTuningType:
    """根据 verl 高级参数推断 GRPO 微调类型。"""
    params = additional_params or {}
    lora_rank = params.get("actor_rollout_ref.model.lora_rank")
    if lora_rank is None:
        lora_rank = params.get("+actor_rollout_ref.model.lora_rank")
    try:
        rank_value = float(lora_rank)
    except (TypeError, ValueError):
        rank_value = 0
    return FineTuningType.LORA if rank_value > 0 else FineTuningType.FULL_PARAMETER


def normalize_grpo_training_type(training_type: Any, additional_params: Optional[Dict[str, Any]]) -> Any:
    """GRPO 的微调类型以后端高级参数推断结果为准。"""
    if not isinstance(training_type, dict):
        return training_type
    method_type = getattr(training_type.get("train_method_type"), "value", training_type.get("train_method_type"))
    if method_type != TrainingMethodType.GRPO.value:
        return training_type
    normalized = dict(training_type)
    normalized["fine_tuning_type"] = infer_grpo_fine_tuning_type(additional_params).value
    return normalized


# class TrainingTaskStatus(str, Enum):
#     """训练任务状态枚举"""
#     CREATED = "creating"
#     PENDING = "pending"
#     RUNNING = "running"
#     COMPLETED = "completed"
#     FAILED = "failed"
#     CANCELLED = "cancelled"
    
    @classmethod
    def get_description(cls, status: str) -> str:
        """获取状态描述"""
        descriptions = {
            cls.CREATED: "创建中",
            cls.PENDING: "待运行",
            cls.RUNNING: "运行中",
            cls.COMPLETED: "已完成",
            cls.FAILED: "失败",
            cls.CANCELLED: "已取消"
        }
        return descriptions.get(status, "未知状态")
    

class MonitoringTool(str, Enum):
    """训练监控工具枚举"""
    SWANLAB = "swanlab"
    MLFLOW = "mlflow"
    WANDB = "wandb"
    NONE = "none"


class RoPEType(str, Enum):
    """RoPE缩放类型枚举"""
    NONE = "none"
    LINEAR = "linear"
    DYNAMIC = "dynamic"
    YARN = "yarn"
    LLAMA3 = "llama3"


class LRSchedulerType(str, Enum):
    """学习率调度器类型枚举"""
    LINEAR = "linear"
    COSINE = "cosine"
    CONSTANT = "constant"
    CONSTANT_WITH_WARMUP = "constant_with_warmup"
    POLYNOMIAL = "polynomial"
    COSINE_WITH_RESTARTS = "cosine_with_restarts"


class EvalStrategy(str, Enum):
    """评估策略枚举"""
    STEPS = "steps"
    EPOCHS = "epochs"
    NO = "no"


class SaveStrategy(str, Enum):
    """保存策略枚举"""
    STEPS = "steps"
    EPOCHS = "epochs"
    NO = "no"


class ChatTemplate(str, Enum):
    """聊天模板类型枚举"""
    QWEN = "qwen"
    QWEN2_VL = "qwen2_vl"
    QWEN3_VL_NOTHINK = "qwen3_vl_nothink"
    # LLAMA = "llama"


class ModelProviderTemplateMapping:
    """模型提供商与聊天模板的映射关系"""
    
    # 模型提供商到聊天模板的映射
    PROVIDER_TEMPLATE_MAP = {
        ModelProvider.QWEN.value: ChatTemplate.QWEN,
        # ModelProvider.LLAMA.value: ChatTemplate.LLAMA,
        # 可以根据需要添加更多映射
    }
    
    @classmethod
    def get_template_by_provider(cls, provider: str) -> ChatTemplate:
        """
        根据模型提供商获取对应的聊天模板
        
        Args:
            provider: 模型提供商名称
            
        Returns:
            对应的聊天模板，如果未找到则返回默认模板
        """
        return cls.PROVIDER_TEMPLATE_MAP.get(provider, ChatTemplate.QWEN)
    
    @classmethod
    def add_provider_template_mapping(cls, provider: str, template: ChatTemplate) -> None:
        """
        添加新的提供商模板映射
        
        Args:
            provider: 模型提供商名称
            template: 对应的聊天模板
        """
        cls.PROVIDER_TEMPLATE_MAP[provider] = template
    
    @classmethod
    def get_all_mappings(cls) -> Dict[str, ChatTemplate]:
        """获取所有映射关系"""
        return cls.PROVIDER_TEMPLATE_MAP.copy()

# ==================== LlamaFactory 配置模型 ====================

class BaseModelConfig(BaseModel):
    """基础模型配置"""
    model_name_or_path: str = Field(..., description="模型路径或名称")
    template: str = Field(default=ChatTemplate.QWEN.value, description="聊天模板类型")

class BaseModelConfigAPI(BaseModel):
    """基础模型配置"""
    base_model_id: int = Field(..., gt=0, description="基础模型ID")
    base_model_name: str = Field(..., max_length=200, description="基础模型名称")
    model_provider: ModelProvider = Field(..., description="模型提供商")
    template: Optional[str] = Field(None, description="聊天模板类型；若不传则按模型名称自动推断")
    
    class Config:
        from_attributes = True
    
    def to_llama_factory_config(self, model_path: str) -> BaseModelConfig:
        """转换为LlamaFactory配置"""
        template = self.get_effective_template()

        return BaseModelConfig(
            model_name_or_path=model_path,
            template=template
        )

    def to_persist_dict(self) -> Dict[str, Any]:
        """转换为数据库持久化字典，确保补全后的 template 可回显。"""
        data = self.model_dump()
        data["template"] = self.get_effective_template()
        return data

    def get_effective_template(self) -> str:
        """获取最终生效的 template。"""
        return self.template or self._infer_template_from_model_name()
    
    def _infer_template_from_model_name(self) -> str:
        """从模型名称推断聊天模板"""
        model_name_lower = self.base_model_name.lower()
        if "qwen3-vl" in model_name_lower or "qwen3_vl" in model_name_lower or "qwen3vl" in model_name_lower:
            return ChatTemplate.QWEN3_VL_NOTHINK.value
        if "qwen2-vl" in model_name_lower or "qwen2_vl" in model_name_lower or "qwen2vl" in model_name_lower:
            return ChatTemplate.QWEN2_VL.value
        if "qwen" in model_name_lower:
            return ChatTemplate.QWEN.value

        return ChatTemplate.QWEN.value

class TrainingTypeConfig(BaseModel):
    """训练类型配置"""
    stage: TrainingMethodType = Field(..., description="方法类型")
    finetuning_type: FineTuningType = Field(..., description="微调类型")
class TrainingTypeConfigAPI(BaseModel):
    """训练类型配置"""
    train_type_category: TrainingTypeCategory = Field(..., description="类型分类")
    train_method_type: TrainingMethodType = Field(..., description="方法类型")
    fine_tuning_type: FineTuningType = Field(..., description="微调类型")
    
    class Config:
        from_attributes = True
    
    def to_llama_factory_config(self) -> TrainingTypeConfig:
        """转换为LlamaFactory配置"""
        return TrainingTypeConfig(
            stage=self.train_method_type,
            finetuning_type=self.fine_tuning_type
        )

class BasicTrainingConfig(BaseModel):
    """基础训练参数配置"""
    # 基础训练参数
    num_train_epochs: int = Field(default=3, gt=0, description="训练轮数")
    per_device_train_batch_size: int = Field(default=2, gt=0, description="每个设备上的训练batch大小")
    gradient_accumulation_steps: int = Field(default=1, gt=0, description="梯度累积步数")
    learning_rate: float = Field(default=5.00e-5, gt=0.0, description="学习率")
    lr_scheduler_type: LRSchedulerType = Field(default=LRSchedulerType.COSINE, description="学习率调度器类型")
    warmup_ratio: float = Field(default=0.1, ge=0.0, le=1.0, description="预热比例")
    bf16: bool = Field(default=True, description="是否使用bf16精度")

class BasicTrainingConfigAPI(BasicTrainingConfig):
    """基础训练参数配置API版本"""
    
    def to_llama_factory_config(self) -> BasicTrainingConfig:
        """转换为LlamaFactory配置"""
        return self  # 直接返回，因为字段相同

class AdvancedTrainingConfig(BaseModel):
    """高级配置"""
    rope_scaling: RoPEType = Field(default=RoPEType.YARN, description="RoPE缩放类型")
    weight_decay: float = Field(default=0, ge=0.0, description="权重衰减")
    max_grad_norm: float = Field(default=1.0, gt=0.0, description="最大梯度范数")
    gradient_checkpointing: bool = Field(default=False, description="是否启用梯度检查点")
    seed: int = Field(default=42, description="随机种子")


class DeepSpeedConfigOption(str, Enum):
    """DeepSpeed 配置选项"""
    ZERO_0 = "ZeRO-0"
    ZERO_2 = "ZeRO-2"
    ZERO_3 = "ZeRO-3"

    def to_config_path(self) -> str:
        if self == DeepSpeedConfigOption.ZERO_0:
            return "/app/examples/deepspeed/ds_z0_config.json"
        if self == DeepSpeedConfigOption.ZERO_2:
            return "/app/examples/deepspeed/ds_z2_config.json"
        return "/app/examples/deepspeed/ds_z3_config.json"

class AdvancedTrainingConfigAPI(AdvancedTrainingConfig):
    """高级配置API版本"""

    def to_llama_factory_config(self) -> AdvancedTrainingConfig:
        """转换为LlamaFactory配置"""
        return AdvancedTrainingConfig(
            rope_scaling=self.rope_scaling,
            weight_decay=self.weight_decay,
            max_grad_norm=self.max_grad_norm,
            gradient_checkpointing=self.gradient_checkpointing,
            seed=self.seed,
        )

class LoRAConfig(BaseModel):
    """LoRA 配置模型，用于定义和验证 LoRA 训练参数"""
    
    # 核心参数
    lora_rank: int = Field(default=16, ge=1, le=256, description="LoRA 秩，控制适配器的复杂度")
    lora_target: str = Field(default="all", description="LoRA 目标模块，可以是 'all' 或具体的模块名称")
    
    # 可选参数
    lora_alpha: Optional[int] = Field(default=32, ge=1, description="LoRA alpha 参数，通常设置为 lora_rank 的2倍")
    lora_dropout: Optional[float] = Field(default=0.0, ge=0.0, le=1.0, description="LoRA dropout 率")
    
    # 高级参数 - bias参数在LlamaFactory中不被支持，已移除
    
    
    class Config:
        from_attributes = True
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式，用于存储到数据库"""
        return self.model_dump(exclude_none=True)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LoRAConfig":
        """从字典创建 LoRA 配置"""
        return cls(**data)

class LoRAConfigAPI(LoRAConfig):
    """LoRA配置API版本"""
    
    def to_llama_factory_config(self) -> LoRAConfig:
        """转换为LlamaFactory配置"""
        return self  # 直接返回，因为字段相同

class DPOConfig(BaseModel):
    """DPO 配置模型，用于定义和验证 DPO 训练参数"""
    
    # 核心 DPO 参数
    pref_beta: float = Field(default=0.1, gt=0.0, description="DPO beta 参数，控制偏好强度")
    
    # 损失函数配置
    pref_loss: str = Field(default="sigmoid", description="损失函数类型：'sigmoid', 'orpo', 'simpo'")
    dpo_label_smoothing: Optional[float] = Field(default=0.0, ge=0.0, le=1.0, description="标签平滑参数")

    pref_ftx: Optional[float] = Field(default=0.0, description="DPO 训练中的有监督微调损失系数,pref_ftx 越小，越像纯偏好对齐.pref_ftx 越大，越像在DPO上混入更多chosen-SFT")

    pref_bco_weight: Optional[float] = Field(default=0.0, description="DPO 训练中的二分类优化系数,在ORPO/SimPO时无效。在DPO上增加一层二分类的损失，数值越大，越像二分类")


    ref_model: Optional[str] = Field(default=None, description="用于 PPO 或 DPO 训练的参考模型路径。")
    ref_model_adapters: Optional[str] = Field(default=None, description="Path to the adapters of the reference model.")
    ref_model_quantization_bit: Optional[int] = Field(default=None, description="Path to the quantization bits of the reference model.")
    
    class Config:
        from_attributes = True
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式，用于存储到数据库"""
        return self.model_dump(exclude_none=True)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DPOConfig":
        """从字典创建 DPO 配置"""
        return cls(**data)
    
class DPOConfigAPI(DPOConfig):
    """DPO配置API版本"""
    
    def to_llama_factory_config(self) -> DPOConfig:
        """转换为LlamaFactory配置"""
        return self  # 直接返回，因为字段相同


class DPOConfigDO(BaseModel):
    """DPO 配置返回对象，仅返回前端当前需要的字段。"""
    pref_beta: float = Field(..., gt=0.0, description="DPO beta 参数，控制偏好强度")

    class Config:
        from_attributes = True

class SaveConfig(BaseModel):
    """保存配置"""
    save_strategy: SaveStrategy = Field(default=SaveStrategy.STEPS, description="模型保存策略")
    save_steps: int = Field(default=20, gt=0, description="模型保存步数")
    plot_loss: bool = Field(default=True, description="是否绘制损失曲线")
    output_dir: str = Field(..., description="输出目录")
    overwrite_output_dir: bool = Field(default=True, description="是否覆盖输出目录")
    save_total_limit: int = Field(default=3, gt=0, description="保存模型总数限制")


class SaveConfigAPI(BaseModel):
    """保存配置"""
    save_strategy: SaveStrategy = Field(default=SaveStrategy.STEPS, description="模型保存策略")
    save_steps: int = Field(default=20, gt=0, description="模型保存步数")
    save_total_limit: int = Field(default=3, gt=0, description="保存模型总数限制")
    
    class Config:
        from_attributes = True
    
    def to_llama_factory_config(self, output_dir: str) -> SaveConfig:
        """转换为LlamaFactory配置"""
        return SaveConfig(
            save_strategy=self.save_strategy,
            save_steps=self.save_steps,
            save_total_limit=self.save_total_limit,
            plot_loss=True,  # 默认值
            output_dir=output_dir,  # 从外部传入
            overwrite_output_dir=True  # 默认值
        )


class EvaluationConfig(BaseModel):
    """评估配置"""
    # 二选一：使用验证集比例或指定评估数据集
    val_size: Optional[float] = Field(default=None, gt=0.0, lt=1.0, description="验证集比例")
    eval_dataset: Optional[str] = Field(default=None, description="评估数据集名称")
    
    per_device_eval_batch_size: int = Field(default=2, gt=0, description="每个设备上的评估batch大小")
    eval_strategy: EvalStrategy = Field(default=EvalStrategy.STEPS, description="评估策略")
    metric_for_best_model: str = Field(default="loss", description="最佳模型评估指标")
    greater_is_better: bool = Field(default=False, description="是否越大越好")
    eval_steps: int = Field(default=20, gt=0, description="评估步数")
    load_best_model_at_end: bool = Field(default=True, description="是否在训练结束时加载最佳模型")
    
    @model_validator(mode='before')
    @classmethod
    def validate_eval_config(cls, values):
        """验证评估配置：val_size和eval_dataset必须二选一"""
        if isinstance(values, dict):
            val_size = values.get('val_size')
            eval_dataset = values.get('eval_dataset')
            
            if val_size is None and eval_dataset is None:
                raise ValueError("val_size和eval_dataset必须指定其中一个")
            if val_size is not None and eval_dataset is not None:
                raise ValueError("val_size和eval_dataset不能同时指定，请选择其中一种方式")
        
        return values

class EvaluationConfigAPI(BaseModel):
    """评估配置"""
    eval_use_split: bool = Field(default=False, description="是否使用数据集分割")
    eval_split_ratio: float = Field(default=0.1, gt=0.0, lt=1.0, description="评估数据集分割比例")
    per_device_eval_batch_size: int = Field(default=2, gt=0, description="每个设备上的评估batch大小")
    eval_strategy: EvalStrategy = Field(default=EvalStrategy.STEPS, description="评估策略")
    metric_for_best_model: str = Field(default="loss", description="最佳模型评估指标")
    greater_is_better: bool = Field(default=False, description="是否越大越好")
    eval_steps: int = Field(default=20, gt=0, description="评估步数")
    load_best_model_at_end: bool = Field(default=True, description="是否在训练结束时加载最佳模型")
    
    # 评估方式说明：
    # 1. eval_use_split=True: 从训练数据中分割出验证集，使用eval_split_ratio指定分割比例
    # 2. eval_use_split=False: 使用独立的评估数据集，需要在eval_dataset_items中指定
    
    class Config:
        from_attributes = True
    
    @model_serializer
    def serialize_model(self) -> Dict[str, Any]:
        """根据eval_use_split动态序列化字段"""
        data = {
            "eval_use_split": self.eval_use_split,
            "per_device_eval_batch_size": self.per_device_eval_batch_size,
            "eval_strategy": self.eval_strategy,
            "metric_for_best_model": self.metric_for_best_model,
            "greater_is_better": self.greater_is_better,
            "eval_steps": self.eval_steps,
            "load_best_model_at_end": self.load_best_model_at_end
        }
        
        # 只有在使用数据集分割时才返回eval_split_ratio
        if self.eval_use_split:
            data["eval_split_ratio"] = self.eval_split_ratio
            
        return data
    
    def to_llama_factory_config(self, eval_dataset_names: Optional[List[str]] = None) -> EvaluationConfig:
        """转换为LlamaFactory配置"""
        # 根据eval_use_split决定使用val_size还是eval_dataset
        if self.eval_use_split:
            # 使用验证集分割
            val_size = self.eval_split_ratio
            eval_dataset = None
        else:
            # 使用独立评估数据集（此时已通过参数校验，确保有验证数据集）
            val_size = None
            eval_dataset = ",".join(eval_dataset_names) if eval_dataset_names else LlamaFactoryDatasetName.EVAL.value
        
        return EvaluationConfig(
            val_size=val_size,
            eval_dataset=eval_dataset,
            per_device_eval_batch_size=self.per_device_eval_batch_size,
            eval_strategy=self.eval_strategy,
            metric_for_best_model=self.metric_for_best_model,
            greater_is_better=self.greater_is_better,
            eval_steps=self.eval_steps,
            load_best_model_at_end=self.load_best_model_at_end
        )


class MonitoringConfig(BaseModel):
    """监控配置"""
    logging_steps: int = Field(default=5, gt=0, description="日志记录频率")
    report_to: MonitoringTool = Field(default=MonitoringTool.MLFLOW, description="监控组件")
    run_name: str = Field(..., description="监控组件的运行名称")

class MonitoringConfigAPI(BaseModel):
    """监控配置"""
    logging_steps: int = Field(default=5, gt=0, description="日志记录频率")
    
    class Config:
        from_attributes = True
    
    def to_llama_factory_config(self, run_name: str, report_to: MonitoringTool = MonitoringTool.MLFLOW) -> MonitoringConfig:
        """转换为LlamaFactory配置"""
        return MonitoringConfig(
            logging_steps=self.logging_steps,
            report_to=report_to,
            run_name=run_name
        )

class DataProcessingConfig(BaseModel):
    """数据处理配置"""
    dataset: str = Field(default=LlamaFactoryDatasetName.TRAIN.value, description="数据集名称")
    dataset_dir: str = Field(..., description="数据集目录路径")
    overwrite_cache: bool = Field(default=True, description="是否覆盖缓存")
    preprocessing_num_workers: int = Field(default=16, ge=0, description="预处理工作进程数")
    cutoff_len: int = Field(default=4096, gt=0, description="训练样本的最大token长度限制，超过此长度的样本会被截断或跳过，当超过模型原始最大长度时自动启用rope_scaling")
    media_dir: str = Field(..., description="图片和视频存储的根目录")

class DataProcessingConfigAPI(BaseModel):
    """数据处理配置"""
    preprocessing_num_workers: int = Field(default=16, ge=0, description="预处理工作进程数")
    cutoff_len: int = Field(default=4096, gt=0, description="训练样本的最大token长度限制")
    
    class Config:
        from_attributes = True
    
    def to_llama_factory_config(self, custom_dataset_path: str = None) -> DataProcessingConfig:
        """转换为LlamaFactory配置
        
        Args:
            custom_dataset_path: 自定义数据集路径，如果为None则使用默认路径
        """
        # 如果提供了自定义数据集路径，使用它；否则使用默认路径
        dataset_dir = custom_dataset_path if custom_dataset_path else StoragePath.REAL_TRAINING_DATASETS.mount_path
        
        return DataProcessingConfig(
            dataset=LlamaFactoryDatasetName.TRAIN.value,
            dataset_dir=dataset_dir,
            overwrite_cache=True,
            preprocessing_num_workers=self.preprocessing_num_workers,
            cutoff_len=self.cutoff_len,
            media_dir=StoragePath.REAL_TRAINING_DATASETS.mount_path.rstrip("/")
        )
class CheckpointInfo(BaseModel):
    """检查点信息模型"""
    name: str = Field(..., description="检查点文件夹名称，如 checkpoint-50")
    step: int = Field(..., description="训练步数")
    epoch: Optional[float] = Field(None, description="训练轮次")
    train_loss: Optional[float] = Field(None, description="训练损失")
    eval_loss: Optional[float] = Field(None, description="评估损失")
    metrics: Dict[str, float] = Field(default_factory=dict, description="检查点关联指标，GRPO 返回 val/test_score、actor/ppo_kl、reward/mean 等指标")
    
    class Config:
        """Pydantic 配置"""
        json_schema_extra = {
            "example": {
                "name": "checkpoint-50",
                "step": 50,
                "epoch": 0.556,
                "train_loss": 2.4111,
                "eval_loss": 2.6580,
                "metrics": {}
            }
        }
class DatasetItem(BaseModel):
    """单个数据集内容项，用于定义数据集的基本信息"""
    
    # 基本信息
    dataset_id: Optional[int] = Field(None, gt=0, description="训练数据集ID")
    name: str = Field(..., min_length=1, max_length=100, description="数据集名称")
    version: str = Field(..., max_length=50, description="数据集版本号")
    dataset_path: str = Field(..., min_length=1, description="数据集文件路径")
    
    # 数据统计信息
    character_count: int = Field(..., gt=0, description="数据集字符数")
    sample_count: int = Field(..., gt=0, description="数据集样本数")
    
    # 训练配置
    sampling_rate: float = Field(default=1.0, ge=0.01, le=10.0, description="数据集采样率乘数（0.01-10.0），决定实际训练数据量。例如：1.5表示将数据集放大1.5倍，0.8表示将数据集缩小到80%")
    weight_in_total: float = Field(..., ge=0.0, le=100.0, description="在总训练数据中的权重占比(0-100) - 当前版本中权重不参与混合逻辑，仅用于记录")
    
    class Config:
        """Pydantic 配置"""
        json_schema_extra = {
            "example": {
                "dataset_id": 123,
                "name": "对话数据集",
                "version": "v1",
                "dataset_path": "/data/conversations.json",
                "character_count": 1000000,
                "sample_count": 5000,
                "sampling_rate": 1.2,  # 放大1.2倍，实际提供6000个样本
                "weight_in_total": 60.0
            }
        }
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式，用于存储到数据库"""
        return self.model_dump(exclude_none=True)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DatasetItem":
        """从字典创建数据集项"""
        return cls(**data)
    
    @property
    def effective_sample_count(self) -> int:
        """计算有效样本数（考虑采样率）"""
        return int(self.sample_count * self.sampling_rate)
    
    @property
    def effective_character_count(self) -> int:
        """计算有效字符数（考虑采样率）"""
        return int(self.character_count * self.sampling_rate)

class TrainingSwitchConfig(BaseModel):
    """训练开关配置"""
    do_train: bool = Field(default=True, description="是否启用训练")


class RayNodeResourceConfig(BaseModel):
    """Ray 节点资源配置，允许 head 节点 GPU 数为 0。"""
    card_type: Union[CardType, str] = Field(..., description="卡类型（GPU/NPU/CPU）")
    card_model: Union[CardModel, str] = Field(..., description="卡型号")
    count: int = Field(default=0, ge=0, description="GPU/NPU 数量")
    card_memory: Optional[str] = Field(None, max_length=20, description="显存大小")
    k8s_resource_type: Optional[str] = Field(default=None, max_length=64, description="K8s 资源类型")
    cpu_limit: Optional[float] = Field(0, ge=0, description="CPU限制，单位：核")
    cpu_request: Optional[float] = Field(0, ge=0, description="CPU请求，单位：核")
    memory_limit: Optional[float] = Field(0, ge=0, description="内存限制，单位：GiB")
    memory_request: Optional[float] = Field(0, ge=0, description="内存请求，单位：GiB")

    @model_validator(mode="after")
    def validate_resource_limits(self):
        if self.cpu_limit is not None and self.cpu_request is not None and self.cpu_limit < self.cpu_request:
            raise ValueError("cpu 限制数必须大等于 cpu 请求数")
        if self.memory_limit is not None and self.memory_request is not None and self.memory_limit < self.memory_request:
            raise ValueError("内存限制数必须大等于内存请求数")
        return self


def _default_ray_submit_resource_config() -> RayNodeResourceConfig:
    return RayNodeResourceConfig(
        card_type="CPU",
        card_model="CPU",
        count=0,
        cpu_request=1,
        cpu_limit=2,
        memory_request=2,
        memory_limit=4,
    )


class RayResourceConfig(BaseModel):
    """GRPO RayJob 资源配置。"""
    submit_graphics_card_resource: RayNodeResourceConfig = Field(
        default_factory=_default_ray_submit_resource_config,
        description="RayJob submitter 资源配置",
    )
    head_graphics_card_resource: RayNodeResourceConfig = Field(..., description="Ray head 资源配置")
    worker_replicas: int = Field(..., gt=0, description="Ray worker Pod 副本数")
    worker_graphics_card_resource: RayNodeResourceConfig = Field(..., description="Ray worker 资源配置")

    @model_validator(mode="after")
    def validate_worker_resource(self):
        if self.submit_graphics_card_resource.count > 0:
            raise ValueError("submit_graphics_card_resource.count 必须为 0，RayJob submitter 不申请 GPU/NPU")
        if self.worker_graphics_card_resource.count <= 0:
            raise ValueError("worker_graphics_card_resource.count 必须大于 0")
        if not self.worker_graphics_card_resource.k8s_resource_type:
            raise ValueError("worker_graphics_card_resource.k8s_resource_type 必须非空")
        return self


class GrpoRewardFunctionValidateRequest(BaseModel):
    """GRPO 奖励函数校验请求。"""
    upload_id: str = Field(..., min_length=1, max_length=100, description="奖励函数分片上传ID")

    @field_validator("upload_id")
    @classmethod
    def validate_upload_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("upload_id 不能为空")
        return value


class GrpoRewardFunctionValidateResponse(BaseModel):
    """GRPO 奖励函数校验结果。"""
    valid: bool = Field(..., description="是否校验通过")
    upload_id: str = Field(..., description="奖励函数分片上传ID")
    file_name: Optional[str] = Field(None, description="上传文件名")
    function_name: str = Field(default="compute_score", description="奖励函数名称")
    errors: List[str] = Field(default_factory=list, description="错误信息")
    warnings: List[str] = Field(default_factory=list, description="警告信息")


class TrainingConfig(BaseModel):
    """训练配置"""
    # 训练开关配置
    training_switch: TrainingSwitchConfig = Field(default_factory=TrainingSwitchConfig, description="训练开关配置")
    
    # 训练类型配置
    training_type: TrainingTypeConfig = Field(..., description="训练类型配置")
    
    # 基础模型配置
    base_model: BaseModelConfig = Field(..., description="基础模型配置")
    
    # 数据集配置
    data_processing: DataProcessingConfig = Field(..., description="数据集配置")
    
    # 基础训练参数
    basic: BasicTrainingConfig = Field(..., description="基础训练参数")

    # 高级配置
    advanced: AdvancedTrainingConfig = Field(..., description="高级配置")

    # lora配置
    lora_config: Optional[LoRAConfig] = Field(None, description="LoRA训练配置")
    
    # dpo配置
    dpo_config: Optional[DPOConfig] = Field(None, description="DPO训练配置")
    
    # 评估配置
    evaluation: EvaluationConfig = Field(..., description="评估配置")
    
    # 保存配置
    save: SaveConfig = Field(..., description="保存配置")
    
    # 监控配置
    monitor: MonitoringConfig = Field(..., description="监控配置")
    
    # 自定义参数
    additional_params: Optional[Dict[str, Any]] = Field(default_factory=dict, description="额外的训练参数")

    # DeepSpeed 配置
    deepspeed: Optional[str] = Field(
        default=None,
        description="DeepSpeed配置文件路径，choices: [examples/deepspeed/ds_z0_config.json, examples/deepspeed/ds_z2_config.json, examples/deepspeed/ds_z3_config.json]"
    )
    
    def to_yaml(self) -> str:
        """转换为YAML格式字符串，扁平化结构"""
        # 获取分组配置
        grouped_config = self._to_grouped_config()
        
        # 生成YAML内容
        yaml_lines = []
        
        # 直接遍历分组配置
        for group_name, group_data in grouped_config.items():
            if group_data:  # 只添加非空配置
                # 获取分组标题
                group_title = self.model_fields[group_name].description
                yaml_lines.append(f"### {group_title}")
                
                # 添加当前分组的配置
                for key, value in group_data.items():
                    if value is not None:  # 跳过值为None的字段
                        # 值已经在 _to_grouped_config 中处理过了
                        yaml_value = value
                        
                        # 获取字段的描述信息
                        config_obj = getattr(self, group_name)
                        if hasattr(config_obj, 'model_fields') and key in config_obj.model_fields:
                            field_description = config_obj.model_fields[key].description
                            yaml_lines.append(f"# {field_description}")
                            # 确保浮点数在YAML中正确表示
                            if isinstance(yaml_value, float):
                                # 根据数值大小判断是否使用科学计数法
                                if abs(yaml_value) >= 1000 or (abs(yaml_value) < 0.001 and yaml_value != 0):
                                    # 对于很大或很小的数值，使用科学计数法格式
                                    formatted_value = f"{yaml_value:.2e}"
                                else:
                                    # 对于常规范围内的数值，使用普通格式，但确保包含小数点
                                    if yaml_value == int(yaml_value):
                                        formatted_value = f"{int(yaml_value)}.0"
                                    else:
                                        formatted_value = str(yaml_value)
                                yaml_lines.append(f"{key}: {formatted_value}")
                            else:
                                yaml_lines.append(f"{key}: {yaml_value}")
                        else:
                            # 确保浮点数在YAML中正确表示
                            if isinstance(yaml_value, float):
                                # 根据数值大小判断是否使用科学计数法
                                if abs(yaml_value) >= 1000 or (abs(yaml_value) < 0.001 and yaml_value != 0):
                                    # 对于很大或很小的数值，使用科学计数法格式
                                    formatted_value = f"{yaml_value:.2e}"
                                else:
                                    # 对于常规范围内的数值，使用普通格式，但确保包含小数点
                                    if yaml_value == int(yaml_value):
                                        formatted_value = f"{int(yaml_value)}.0"
                                    else:
                                        formatted_value = str(yaml_value)
                                yaml_lines.append(f"{key}: {formatted_value}")
                            else:
                                yaml_lines.append(f"{key}: {yaml_value}")
                yaml_lines.append("")
        
        return "\n".join(yaml_lines)
    
    def _to_grouped_config(self) -> Dict[str, Dict[str, Any]]:
        """将嵌套配置转换为分组字典"""
        grouped_config = {}
        
        # 直接遍历TrainingConfig的所有字段
        for field_name, field_info in self.model_fields.items():
            if hasattr(self, field_name) and getattr(self, field_name):
                config_obj = getattr(self, field_name)
                
                # 如果是嵌套的Pydantic模型，获取其所有字段
                if hasattr(config_obj, 'model_fields'):
                    sub_config = {}
                    for sub_field_name in config_obj.model_fields.keys():
                        if hasattr(config_obj, sub_field_name):
                            field_value = getattr(config_obj, sub_field_name)
                            # 处理枚举类型
                            if hasattr(field_value, 'value'):
                                sub_config[sub_field_name] = field_value.value
                            else:
                                sub_config[sub_field_name] = field_value
                    grouped_config[field_name] = sub_config
                # 如果是字典类型，直接使用
                elif isinstance(config_obj, dict):
                    grouped_config[field_name] = config_obj
                else:
                    if hasattr(config_obj, 'value'):
                        grouped_config[field_name] = {field_name: config_obj.value}
                    else:
                        grouped_config[field_name] = {field_name: config_obj}
        
        return grouped_config

class TrainingConfigConverter:
    """训练配置转换器"""
    
    @staticmethod
    def api_to_llama_factory(api_config: "TrainingTaskCreate", task_id: int) -> TrainingConfig:
        """将API配置转换为LlamaFactory配置"""
        # 构建模型路径，包含模型提供商
        model_path = f"{StoragePath.BASE_MODELS.mount_path}{api_config.base_model.model_provider.value}/{api_config.base_model.base_model_name}"
        
        # 构建输出目录
        output_dir = f"{StoragePath.UNREGISTERED_TRAINED_MODELS.mount_path}"
        
        # 构建运行名称
        run_name = settings.get_mlflow_run_name(api_config.name, api_config.version, task_id)
        
        return TrainingConfig(
            training_switch=TrainingSwitchConfig(do_train=True), # 默认启用训练
            training_type=api_config.training_type.to_llama_factory_config(),
            base_model=api_config.base_model.to_llama_factory_config(model_path),
            data_processing=api_config.data_processing.to_llama_factory_config(),
            basic=api_config.basic.to_llama_factory_config(),
            advanced=api_config.advanced.to_llama_factory_config(),
            lora_config=api_config.lora_config.to_llama_factory_config() if api_config.lora_config else None,
            dpo_config=api_config.dpo_config.to_llama_factory_config() if api_config.dpo_config else None,
            evaluation=api_config.evaluation.to_llama_factory_config(),
            save=api_config.save.to_llama_factory_config(output_dir),
            monitor=api_config.monitor.to_llama_factory_config(run_name),
            additional_params=api_config.additional_params,
            deepspeed=api_config.deepspeed.to_config_path() if api_config.deepspeed else None,
        )

# ==================== 训练任务模型 ====================

class TrainingTaskCreate(BaseModel):
    """创建训练任务的请求模型""" 
    name: str = Field(..., min_length=1, max_length=100, description="训练任务名称")
    description: Optional[str] = Field(None, max_length=1000, description="训练任务描述")
    project_id: int = Field(..., gt=0, description="关联项目ID")
    version: Optional[str] = Field("v1", max_length=50, description="任务版本号，默认为v1")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    
    # 基础模型配置
    base_model: BaseModelConfigAPI = Field(..., description="基础模型配置")

    # 训练类型配置
    training_type: TrainingTypeConfigAPI = Field(..., description="训练类型配置")

    # 数据处理配置
    data_processing: Optional[DataProcessingConfigAPI] = Field(None, description="数据处理配置")

    # 训练数据集列表
    dataset_items: List[DatasetItem] = Field(default_factory=list, description="训练数据集列表")
    
    # 基础训练参数
    basic: Optional[BasicTrainingConfigAPI] = Field(None, description="基础训练参数")

    # 高级配置
    advanced: Optional[AdvancedTrainingConfigAPI] = Field(None, description="高级配置")

    # lora配置
    lora_config: Optional[LoRAConfigAPI] = Field(None, description="LoRA训练配置")
    
    # dpo配置
    dpo_config: Optional[DPOConfigAPI] = Field(None, description="DPO训练配置")
    
    # 评估配置
    evaluation: Optional[EvaluationConfigAPI] = Field(None, description="评估配置")

    # 评估数据集列表
    eval_dataset_items: Optional[List[DatasetItem]] = Field(default_factory=list, description="评估数据集列表")
    
    # 保存配置
    save: Optional[SaveConfigAPI] = Field(None, description="保存配置")
    
    # 监控配置
    monitor: Optional[MonitoringConfigAPI] = Field(None, description="监控配置")
    
    # 自定义参数
    additional_params: Optional[Dict[str, Any]] = Field(default_factory=dict, description="额外的训练参数")

    # 高级模板ID
    advanced_template_id: Optional[int] = Field(
        None,
        gt=0,
        description="高级模板ID，用于前端根据模板字段定义回显和渲染 additional_params"
    )

    # GRPO 奖励函数上传ID
    reward_function_upload_id: Optional[str] = Field(
        None,
        max_length=100,
        description="GRPO奖励函数分片上传ID，上传文件应为包含compute_score函数的Python文件"
    )

    # DeepSpeed 配置
    deepspeed: Optional[DeepSpeedConfigOption] = Field(default=None, description="DeepSpeed配置选项")
    
    # 训练资源配置
    graphics_card_resource: GraphicsCardResourceConfig = Field(
        default_factory=lambda: GraphicsCardResourceConfig(
            card_type=CardType.GPU,
            card_model=CardModel.A800,
            count=1,
            card_memory="80GB",
            k8s_resource_type="nvidia.com/gpu",
            cpu_limit=16,
            cpu_request=0.5,
            memory_limit=128,
            memory_request=0.5
        ),
        description="GPU/NPU 资源配置"
    )

    # Ray 资源配置，仅 GRPO 使用
    ray_resource_config: Optional[RayResourceConfig] = Field(None, description="GRPO RayJob 资源配置")

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """验证训练任务名称格式"""
        try:
            validate_name_format(v, "训练任务名称")
        except ValueError as e:
            raise ValueError(str(e))
        return v
    
    @model_validator(mode='after')
    def validate_evaluation_config(self):
        """验证评估配置的一致性"""
        is_grpo = self.training_type.train_method_type == TrainingMethodType.GRPO
        if is_grpo:
            if self.training_type.train_type_category != TrainingTypeCategory.TEXT_GENERATION:
                raise ValueError("当training_type.train_method_type=grpo时，train_type_category仅支持text-generation")
            if self.ray_resource_config is None:
                raise ValueError("当training_type.train_method_type=grpo时，必须提供ray_resource_config")
            self.training_type.fine_tuning_type = infer_grpo_fine_tuning_type(self.additional_params)
            if self.additional_params is not None:
                for key in self.additional_params.keys():
                    if not isinstance(key, str) or not key.strip():
                        raise ValueError("additional_params 的 key 必须是非空字符串")
            if self.reward_function_upload_id is not None:
                self.reward_function_upload_id = self.reward_function_upload_id.strip() or None
            return self

        required_fields = [
            "data_processing",
            "dataset_items",
            "basic",
            "advanced",
            "evaluation",
            "save",
            "monitor",
        ]
        missing_fields = [
            field_name
            for field_name in required_fields
            if getattr(self, field_name) in (None, [])
        ]
        if missing_fields:
            raise ValueError(f"非GRPO训练必须提供字段: {', '.join(missing_fields)}")

        has_eval_items = self.eval_dataset_items and len(self.eval_dataset_items) > 0
        if self.training_type.train_method_type == TrainingMethodType.DPO and not self.dpo_config:
            raise ValueError("当training_type.train_method_type=dpo时，必须提供dpo_config")
        
        if self.evaluation.eval_use_split:
            # 使用数据集分割时，如果提供了验证数据集项目，给出警告提示
            if has_eval_items:
                raise ValueError(
                    "当evaluation.eval_use_split=True时，不应该提供eval_dataset_items，"
                    "系统将从训练数据中自动分割验证集"
                )
        else:
            # 使用独立验证数据集时，必须提供验证数据集项目
            if not has_eval_items:
                raise ValueError(
                    "当evaluation.eval_use_split=False时，必须在eval_dataset_items中提供至少一个验证数据集"
                )
        
        return self
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "中文对话模型微调任务",
                "description": "使用LoRA方法微调中文对话模型",
                "project_id": 1,
                "base_model": {
                    "base_model_id": 1,
                    "base_model_name": "Qwen2.5-3B-Instruct"
                },
                "training_type": {
                    "train_type_category": "text-generation",
                    "train_method_type": "sft",
                    "fine_tuning_type": "lora"
                },
                "data_processing": {
                    "preprocessing_num_workers": 16,
                    "cutoff_len": 4096
                },
                "dataset_items": [
                    {
                        "dataset_id": 123,
                        "name": "对话数据集",
                        "version": "v1",
                        "dataset_path": "/data/conversations.json",
                        "character_count": 1000000,
                        "sample_count": 5000,
                        "sampling_rate": 0.8,
                        "weight_in_total": 0.6
                    }
                ],
                "basic": {
                    "num_train_epochs": 3,
                    "per_device_train_batch_size": 2,
                    "gradient_accumulation_steps": 1,
                    "learning_rate": 5e-5,
                    "lr_scheduler_type": "cosine",
                    "warmup_ratio": 0.1,
                    "bf16": True
                },
                "advanced": {
                    "rope_scaling": "yarn",
                    "weight_decay": 0,
                    "max_grad_norm": 1.0,
                    "gradient_checkpointing": False,
                    "seed": 42
                },
                "lora_config": {
                    "lora_rank": 16,
                    "lora_alpha": 32,
                    "lora_dropout": 0.0
                },
                "evaluation": {
                    "eval_use_split": True,  # 使用验证集分割
                    "eval_split_ratio": 0.1,  # 当eval_use_split=True时使用
                    "per_device_eval_batch_size": 2,
                    "eval_strategy": "steps",
                    "metric_for_best_model": "loss",
                    "greater_is_better": False,
                    "eval_steps": 20,
                    "load_best_model_at_end": True
                },
                "eval_dataset_items": [],  # 当eval_use_split=True时可以为空
                "save": {
                    "save_strategy": "steps",
                    "save_steps": 20,
                    "save_total_limit": 3
                },
                "monitor": {
                    "logging_steps": 5
                },
                "additional_params": {
                    "dataloader_num_workers": 16
                },
                "deepspeed": "ZeRO-3",
                "graphics_card_resource": {
                    "card_type": "GPU",
                    "card_model": "A800",
                    "count": 1,
                    "card_memory": "80GB",
                    "k8s_resource_type": "nvidia.com/gpu",
                    "cpu_limit": 16,
                    "cpu_request": 0.5,
                    "memory_limit": 128,
                    "memory_request": 0.5
                }
            }
        }
    
    def generate_llama_factory_config(self) -> str:
        """生成LlamaFactory配置文件内容"""
        if self.training_type.train_method_type == TrainingMethodType.GRPO:
            raise ValueError("GRPO训练不生成LlamaFactory配置")
        # 使用转换器将API配置转换为LlamaFactory配置
        llama_factory_config = TrainingConfigConverter.api_to_llama_factory(self)
        
        # 直接转换为YAML
        return llama_factory_config.to_yaml()



class TrainingTaskResponse(BaseModelWithTimezone):
    """训练任务响应模型"""
    id: int = Field(..., description="任务ID")
    name: str = Field(..., min_length=1, max_length=100, description="训练任务名称")
    description: Optional[str] = Field(None, max_length=1000, description="训练任务描述")
    project_id: int = Field(..., gt=0, description="关联项目ID")
    version: str = Field(..., max_length=50, description="任务版本号")
    
    # 基础模型配置
    base_model: BaseModelConfigAPI = Field(..., description="基础模型配置")
    
    # 训练类型配置
    training_type: TrainingTypeConfigAPI = Field(..., description="训练类型配置")
    
    # 数据处理配置
    data_processing: Optional[DataProcessingConfigAPI] = Field(None, description="数据处理配置")
    
    # 训练数据集列表
    dataset_items: List[DatasetItem] = Field(default_factory=list, description="训练数据集列表")
    
    # 基础训练参数
    basic: Optional[BasicTrainingConfigAPI] = Field(None, description="基础训练参数")

    # 高级配置
    advanced: Optional[AdvancedTrainingConfigAPI] = Field(None, description="高级配置")

    # lora配置
    lora_config: Optional[LoRAConfigAPI] = Field(None, description="LoRA训练配置")
    
    # dpo配置
    dpo_config: Optional[DPOConfigDO] = Field(None, description="DPO训练配置")
    
    # 评估配置
    evaluation: Optional[EvaluationConfigAPI] = Field(None, description="评估配置")

    # 评估数据集列表
    eval_dataset_items: Optional[List[DatasetItem]] = Field(default_factory=list, description="评估数据集列表")
    
    # 保存配置
    save: Optional[SaveConfigAPI] = Field(None, description="保存配置")
    
    # 监控配置
    monitor: Optional[MonitoringConfigAPI] = Field(None, description="监控配置")
    
    # 自定义参数
    additional_params: Optional[Dict[str, Any]] = Field(default_factory=dict, description="额外的训练参数")

    # 高级模板ID
    advanced_template_id: Optional[int] = Field(
        None,
        description="高级模板ID，用于前端根据模板字段定义回显和渲染 additional_params"
    )

    # GRPO 奖励函数上传ID
    reward_function_upload_id: Optional[str] = Field(None, description="GRPO奖励函数分片上传ID")

    # DeepSpeed 配置
    deepspeed: Optional[DeepSpeedConfigOption] = Field(default=None, description="DeepSpeed配置选项")
    
    # 训练资源配置
    graphics_card_resource: Optional[GraphicsCardResourceConfig] = Field(
        None,
        description="GPU/NPU 资源配置"
    )

    # Ray 资源配置，仅 GRPO 使用
    ray_resource_config: Optional[RayResourceConfig] = Field(None, description="GRPO RayJob 资源配置")

    @model_validator(mode='before')
    @classmethod
    def enrich_deepspeed_from_advanced(cls, values):
        if isinstance(values, dict):
            values["training_type"] = normalize_grpo_training_type(
                values.get("training_type"),
                values.get("additional_params"),
            )
            if values.get("deepspeed") is None:
                advanced = values.get("advanced")
                if isinstance(advanced, dict):
                    values["deepspeed"] = advanced.get("deepspeed")
            return values

        data = None
        advanced = getattr(values, "advanced", None)
        deepspeed = getattr(values, "deepspeed", None)
        training_type = getattr(values, "training_type", None)
        additional_params = getattr(values, "additional_params", None)
        normalized_training_type = normalize_grpo_training_type(training_type, additional_params)
        if normalized_training_type is not training_type:
            data = {field_name: getattr(values, field_name, None) for field_name in cls.model_fields.keys()}
            data["training_type"] = normalized_training_type
        if deepspeed is None and isinstance(advanced, dict):
            if data is None:
                data = {field_name: getattr(values, field_name, None) for field_name in cls.model_fields.keys()}
            data["deepspeed"] = advanced.get("deepspeed")
            return data
        if data is not None:
            return data
        return values
    
    # 任务状态
    status: TaskStatus = Field(..., description="任务状态")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    # progress: float = Field(..., description="训练进度(0-100)")
    
    lab_k8s_uuid: str = Field(..., description="自定义k8s uuid")
    
    # 执行信息
    started_at: Optional[datetime] = Field(None, description="开始时间")
    finished_at: Optional[datetime] = Field(None, description="完成时间")
    estimated_duration: Optional[int] = Field(None, description="预计持续时间(秒)")
    created_by: Optional[str] = Field(None, description="创建者用户名称")
    created_at: Optional[datetime] = Field(None, description="创建时间")

    
    # 训练监控
    metrics_url: Optional[str] = Field(None, description="监控界面URL")
    
    # 模型输出路径
    model_output_path: Optional[str] = Field(None, description="训练模型在JFS上的实际存储路径")
    
    # 检查点信息
    checkpoints: List[CheckpointInfo] = Field(default_factory=list, description="训练生成的检查点信息列表")

    @field_validator("checkpoints", mode="before")
    @classmethod
    def normalize_checkpoints(cls, value):
        if value is None:
            return []
        return value
    
    # 训练资源配置
    graphics_card_resource: GraphicsCardResourceConfig = Field(
        default_factory=lambda: GraphicsCardResourceConfig(
            card_type=CardType.GPU,
            card_model=CardModel.A800,
            count=1,
            card_memory="80GB",
            k8s_resource_type="nvidia.com/gpu"
        ),
        description="GPU/NPU 资源配置"
    )


    @computed_field
    def effective_evaluation_items(self) -> List[DatasetItem]:
        """评估数据集列表（评估拆分时基于训练集估算）"""
        if self.eval_dataset_items:
            return []
        if not self.dataset_items or not self.evaluation:
            return []

        eval_ratio = self.evaluation.eval_split_ratio
        total_samples = sum(item.sample_count * item.sampling_rate for item in self.dataset_items)
        total_chars = sum(item.character_count * item.sampling_rate for item in self.dataset_items)

        if total_samples <= 0 or total_chars <= 0:
            return []

        # 标准四舍五入, round 是四舍六入五成双
        sample_count = total_samples * eval_ratio
        sample_count = int(sample_count) if sample_count % 1 < 0.5 else int(sample_count) + 1
        character_count = total_chars * eval_ratio
        character_count = int(character_count) if character_count % 1 < 0.5 else int(character_count) + 1
        sample_count = max(sample_count, 1)
        character_count = max(character_count, 1)

        return [
            DatasetItem(
                name="eval_split_dataset",
                version=self.version,
                dataset_path="builded_by_data_splitting",
                character_count=character_count,
                sample_count=sample_count,
                sampling_rate=eval_ratio,
                weight_in_total=0.0
            )
        ]

    class Config:
        from_attributes = True


# ==================== 响应模型 ====================


class TrainingTaskCreatedResponse(BaseModelWithTimezone):
    """创建训练任务后的精简响应模型"""
    id: int = Field(..., description="任务ID")
    name: str = Field(..., description="训练任务名称")
    description: Optional[str] = Field(None, description="训练任务描述")
    project_id: int = Field(..., description="关联项目ID")
    version: str = Field(..., max_length=50, description="任务版本号")
    status: TaskStatus = Field(..., description="任务状态")
    schedule_at: Optional[datetime] = Field(None, description="计划执行时间")
    celery_task_id: Optional[str] = Field(None, description="Celery任务ID")
    message: Optional[str] = Field(None, description="提示信息")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")

    class Config:
        from_attributes = True


class TrainingTaskSummaryResponse(BaseModel):
    """训练任务汇总响应模型"""
    task_name: str = Field(..., description="任务名称")
    version_count: int = Field(..., description="版本数量")
    training_type_category: TrainingTypeCategory = Field(..., description="训练类型分类")
    training_method_type: TrainingMethodType = Field(..., description="训练方法类型")
    project_id: int = Field(..., description="项目ID")
    latest_version: str = Field(..., description="最新版本号")
    earliest_version: str = Field(..., description="最早版本号")
    created_at: datetime = Field(..., description="首次创建时间")
    updated_at: datetime = Field(..., description="最后更新时间")
    
    class Config:
        from_attributes = True


# ==================== MLflow 相关响应模型 ====================

class MLflowMetricDataPoint(BaseModel):
    """MLflow 指标数据点模型"""
    value: float = Field(..., description="指标值")
    timestamp: int = Field(..., description="时间戳")
    step: int = Field(..., description="步骤")


class MLflowMetricResponse(BaseModel):
    """MLflow 指标响应模型（已废弃，保留兼容性）"""
    key: str = Field(..., description="指标名称")
    value: float = Field(..., description="指标值")
    timestamp: int = Field(..., description="时间戳")
    step: int = Field(..., description="步骤")


class MLflowRunInfoResponse(BaseModel):
    """MLflow 运行信息响应模型"""
    run_uuid: str = Field(..., description="运行UUID")
    experiment_id: str = Field(..., description="实验ID")
    name: Optional[str] = Field(None, description="运行名称")
    status: str = Field(..., description="运行状态")
    start_time: Optional[int] = Field(None, description="开始时间")
    end_time: Optional[int] = Field(None, description="结束时间")
    user_id: Optional[str] = Field(None, description="用户ID")
    artifact_uri: Optional[str] = Field(None, description="artifacts URI")
    
    class Config:
        # 允许从数据库返回的整数类型自动转换为字符串
        str_strip_whitespace = True
        
    @model_validator(mode='before')
    @classmethod
    def convert_experiment_id_to_string(cls, values):
        """将 experiment_id 转换为字符串类型"""
        if isinstance(values, dict) and 'experiment_id' in values:
            values['experiment_id'] = str(values['experiment_id'])
        return values


class MLflowTaskResponse(BaseModel):
    """训练任务 MLflow 信息响应模型"""
    task_id: int = Field(..., description="训练任务ID")
    task_name: str = Field(..., description="任务名称")
    version: str = Field(..., description="任务版本")
    project_name: str = Field(..., description="项目名称")
    experiment_name: str = Field(..., description="MLflow 实验名称")
    run_name: str = Field(..., description="MLflow 运行名称")
    
    # MLflow 数据
    run_info: Optional[MLflowRunInfoResponse] = Field(None, description="运行基本信息")
    params: Dict[str, str] = Field(default_factory=dict, description="运行参数")
    metrics: Dict[str, List[MLflowMetricDataPoint]] = Field(default_factory=dict, description="运行指标（按指标名称分组）")
    tags: Dict[str, str] = Field(default_factory=dict, description="运行标签")
    latest_metrics: Dict[str, float] = Field(default_factory=dict, description="最新指标值")
    
    # 状态信息
    mlflow_available: bool = Field(..., description="MLflow 数据是否可用")
    error_message: Optional[str] = Field(None, description="错误信息（如果有）") 

class TrainingTaskLogResponse(BaseModel):
    """训练任务日志响应模型"""
    archived: bool = Field(..., description="是否为归档日志（从MinIO获取）")
    logs: List[str] = Field(..., description="日志内容列表") 
