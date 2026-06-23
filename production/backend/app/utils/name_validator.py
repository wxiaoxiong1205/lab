"""
名称验证工具模块
提供通用的名称格式验证功能，独立模块避免循环导入
"""

import re


def validate_name_format(name: str, field_name: str = "名称") -> None:
    """验证名称格式是否合法（通用函数）
    
    规则：
    - 支持中英文、数字、下划线、中划线、点号
    - 不能以下划线或中划线开头
    - 不能为空
    
    Args:
        name: 要验证的名称
        field_name: 字段名称（用于错误提示，默认为"名称"）
        
    Raises:
        ValueError: 如果名称格式不合法
    """
    if not name:
        raise ValueError(f"{field_name}不能为空")
    
    # 检查是否以下划线或中划线开头
    if name[0] in ('_', '-'):
        raise ValueError(f"{field_name}不能以下划线或中划线开头")
    
    # 允许中英文、数字、下划线、中划线、点号
    # 使用正则表达式验证：中文字符(\u4e00-\u9fff) + 英文字母 + 数字 + 下划线 + 中划线 + 点号
    pattern = r'^[\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9_.\-]+$'
    if not re.match(pattern, name):
        raise ValueError(f"{field_name}只能包含中英文、数字、下划线、中划线和点号，不能包含空格或其他特殊字符")


def validate_llm_inference_server_name(name: str, field_name: str = "推理服务名称") -> None:
    """大模型类推理任务（base_model / trained_model）服务名：仅 ASCII，不支持中文等非拉丁字符。

    规则：
    - 仅英文字母、数字、下划线、中划线、点号
    - 不能以下划线或中划线开头
    - 不能为空
    """
    if not name:
        raise ValueError(f"{field_name}不能为空")
    if name[0] in ("_", "-"):
        raise ValueError(f"{field_name}不能以下划线或中划线开头")
    pattern = r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$"
    if not re.match(pattern, name):
        raise ValueError(
            f"{field_name}在大模型部署下仅支持英文、数字、下划线、中划线和点号，不支持中文及其他非 ASCII 字符"
        )

