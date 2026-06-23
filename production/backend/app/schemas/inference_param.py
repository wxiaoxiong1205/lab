"""推理参数相关 schema，独立模块避免与 evaluation_task / inference_result 循环依赖。"""
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field


class InferenceParamType(str, Enum):
    """推理参数类型枚举"""

    def __new__(cls, value: str, name_cn: str, value_scope: str, default_value: Any, description: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.name_cn = name_cn
        obj.value_scope = value_scope
        obj.default_value = default_value
        obj.description = description
        return obj

    TEMPERATURE = (
        "temperature",
        "温度参数",
        "0.0-2.0",
        0.7,
        "温度参数（Temperature），控制模型输出的随机性。值越高，输出越随机；值越低，输出越确定。"
    )

    MAX_TOKENS = (
        "max_tokens",
        "max_tokens",
        "",
        4096,
        "最大生成token数，None表示不限制"
    )

    REPETITION_PENALTY = (
        "presence_penalty",
        "重复惩罚参数",
        ">=0.0",
        0.0,
        "重复惩罚参数（Repetition Penalty），用于减少模型生成重复内容。值越高，惩罚越强。"
    )

    TOP_P = (
        "top_p",
        "核采样",
        "0.0-1.0",
        1.0,
        "核采样，范围0-1，默认1.0（采样时考虑所有tokens）"
    )

    GPU_MEMORY_UTILIZATION = (
        "gpu_memory_utilization",
        "GPU显存占用率",
        "0.1-1.0",
        0.8,
        "vLLM 显存占用率，范围 0.1-1.0。离线推理时显存不足可调低此值。"
    )

    @classmethod
    def get_all_params(cls) -> List[Dict[str, Any]]:
        """获取所有推理参数的详细信息"""
        return [
            {
                "name": param.value,
                "name_cn": param.name_cn,
                "value_scope": param.value_scope,
                "default_value": param.default_value,
                "description": param.description
            }
            for param in cls
        ]


class InferenceModelParams(BaseModel):
    """推理模型参数配置（已废弃，请使用 dict[InferenceParamType, Any]）"""
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0, description="温度参数（Temperature），范围0.0-2.0")
    top_p: Optional[float] = Field(None, ge=0.0, le=1.0, description="核采样参数，范围0.0-1.0")
    max_tokens: Optional[int] = Field(None, ge=1, description="最大生成token数，None表示不限制")
    presence_penalty: Optional[float] = Field(None, ge=0.0, description="重复惩罚参数（Repetition Penalty），范围>=0.0")
