"""
模型种子数据
"""

from typing import List, Dict, Any


def get_models_data() -> List[Dict[str, Any]]:
    """获取模型种子数据"""
    return [
        {
            "name": "Qwen2.5-0.5B-Instruct",
            "description": "Qwen2.5-0.5B-Instruct 是一个基于 Qwen2.5 架构的 0.5B 参数指令微调模型，适用于对话和指令遵循任务",
            "model_type": "text-generation",
            "model_provider": "Qwen",
            "model_path": "/public/models/qwen/Qwen2.5-0.5B-Instruct"
        }
        # {
        #     "name": "Qwen2.5-7B-Instruct",
        #     "description": "Qwen2.5-7B-Instruct 是一个基于 Qwen2.5 架构的 7B 参数指令微调模型，适用于复杂的对话和指令遵循任务",
        #     "model_type": "text-generation",
        #     "model_provider": "qwen",
        #     "model_path": "/public/models/qwen/Qwen2.5-7B-Instruct",
        #     "created_by": "system"
        # },
        # {
        #     "name": "Qwen2.5-14B-Instruct",
        #     "description": "Qwen2.5-14B-Instruct 是一个基于 Qwen2.5 架构的 14B 参数指令微调模型，适用于高要求的对话和指令遵循任务",
        #     "model_type": "text-generation",
        #     "model_provider": "qwen",
        #     "model_path": "/public/models/qwen/Qwen2.5-14B-Instruct",
        #     "created_by": "system"
        # }
    ]
