"""
GPU/NPU 资源配置模型
"""
from typing import Optional, Union
from pydantic import BaseModel, Field, field_validator, model_validator
from app.core.logging import logger
from app.schemas.repository_image import CardType, CardModel


class GraphicsCardResourceConfig(BaseModel):
    """
    GPU/NPU 资源配置模型
    封装了卡类型、卡型号、数量、显存和 K8s 资源类型
    
    注意：card_model 支持枚举值（CardModel）或字符串，以允许扩展新的 GPU 型号。
    建议优先使用 CardModel 枚举中定义的值，未在枚举中的值会记录警告日志。
    """
    card_type: Union[CardType, str] = Field(..., description="卡类型（GPU/NPU/CPU）")
    card_model: Union[CardModel, str] = Field(..., description="卡型号（如 A800/V100/NPU_910B/H100），支持扩展值")
    count: int = Field(default=1, gt=0, description="GPU/NPU 数量")
    card_memory: Optional[str] = Field(None, max_length=20, description="显存大小（如 32GB、16GB）")
    k8s_resource_type: str = Field(..., max_length=64, description="K8s 资源类型（如 nvidia.com/gpu、huawei.com/npu）")

    # 百丽k8s参数cpu，memory限制,队列id
    cpu: Optional[int] = Field(0, ge=0, description="CPU限制，单位：核（G）")
    memory: Optional[int] = Field(0, ge=0, description="内存限制，单位：GiB")
    queue_group_id: Optional[int] = Field(0, ge=0, description="队列id")

    cpu_limit: Optional[float] = Field(0, ge=0, description="CPU限制，单位：核（G）")
    cpu_request: Optional[float] = Field(0, ge=0, description="CPU请求，单位：核（G）")
    memory_limit: Optional[float] = Field(0, ge=0, description="内存限制，单位：GiB")
    memory_request: Optional[float] = Field(0, ge=0, description="内存请求，单位：GiB")

    @model_validator(mode="after")
    def validate_resource_limits(self):
        """验证资源限制是否合理"""
        if self.cpu_limit is not None and self.cpu_request is not None:
            if self.cpu_limit < self.cpu_request:
                raise ValueError("cpu 限制数必须大等于 cpu 请求数")
        if self.memory_limit is not None and self.memory_request is not None:
            if self.memory_limit < self.memory_request:
                raise ValueError("内存限制数必须大等于内存请求数")
        return self

    @field_validator('card_model', mode='before')
    @classmethod
    def validate_card_model(cls, v):
        """
        验证 card_model 字段
        
        支持：
        1. CardModel 枚举值（推荐）
        2. 字符串值（允许扩展新的 GPU 型号）
        
        如果传入字符串且不在枚举中，会记录警告但允许通过。
        """
        # 如果已经是枚举值，直接返回
        if isinstance(v, CardModel):
            return v
        
        # 如果是字符串，检查是否在枚举中
        if isinstance(v, str):
            # 检查是否匹配枚举值
            enum_values = {e.value for e in CardModel}
            if v not in enum_values:
                # 不在枚举中，记录警告但允许使用（支持扩展）
                logger.warning(
                    f"使用了未在 CardModel 枚举中定义的 GPU 型号: {v}。"
                    f"当前支持的型号: {', '.join(enum_values)}。"
                    f"如需添加新型号，请在 app/schemas/repository_image.py 的 CardModel 枚举中添加。"
                )
            return v
        
        # 其他类型，尝试转换为字符串
        return str(v)

    @field_validator('card_type', mode='before')
    @classmethod
    def validate_card_type(cls, v):
        """
        验证 card_type 字段

        支持：
        1. CardType 枚举值（推荐）
        2. 字符串值（允许扩展新的 类型）

        如果传入字符串且不在枚举中，会记录警告但允许通过。
        """
        # 如果已经是枚举值，直接返回
        if isinstance(v, CardModel):
            return v

        # 如果是字符串，检查是否在枚举中
        if isinstance(v, str):
            # 检查是否匹配枚举值
            enum_values = {e.value for e in CardType}
            if v not in enum_values:
                # 不在枚举中，记录警告但允许使用（支持扩展）
                logger.warning(
                    f"使用了未在 CardType 枚举中定义的 显卡类型: {v}。"
                    f"当前支持的型号: {', '.join(enum_values)}。"
                    f"如需添加新型号，请在 app/schemas/repository_image.py 的 CardType 枚举中添加。"
                )
            return v

        # 其他类型，尝试转换为字符串
        return str(v)
    
    def get_card_model_value(self) -> str:
        """
        获取 card_model 的字符串值
        
        用于兼容需要字符串的场景（如 K8s 节点亲和性配置）
        """
        if isinstance(self.card_model, CardModel):
            return self.card_model.value
        return str(self.card_model)

    def get_k8s_gpu_type(self) -> Optional[str]:
        """
        获取用于 K8s 的 GPU 类型
        如果 count 为 0 或 card_type 为 CPU，返回 None
        """
        if self.count == 0 or self.card_type == CardType.CPU:
            return None
        return self.k8s_resource_type

    def get_k8s_gpu_count(self) -> str:
        """
        获取用于 K8s 的 GPU 数量（字符串格式）
        如果 count 为 0，返回 "0"
        """
        return str(self.count) if self.count > 0 else "0"

    class Config:
        json_schema_extra = {
            "example": {
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

