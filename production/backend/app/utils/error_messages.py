"""
统一的错误消息工具模块
用于提供标准化的错误消息格式，确保整个应用的错误回复格式一致性
"""

# 统一的错误消息常量
DATA_NOT_FOUND = "资源不存在"


def data_exists_error(name: str) -> str:
    """
    生成数据已存在的标准错误消息
    
    Args:
        name: 数据名称
        
    Returns:
        格式化的错误消息: '{名称}' 已存在
    """
    return f"'{name}' 已存在"


def data_not_found_error() -> str:
    """
    生成数据不存在的标准错误消息
    
    Returns:
        标准错误消息: 数据异常
    """
    return DATA_NOT_FOUND


def data_is_associated_and_cannot_be_deleted() -> str:
    """
    数据存在关联无法删除
    Returns:
        标准错误消息: 数据存在关联
    """
    return "数据存在关联无法删除"

def data_not_found_error_by_name(name: str) -> str:
    """
    生成数据不存在的标准错误消息

    Returns:
        标准错误消息: 数据异常
    """
    return f"'{name}' {DATA_NOT_FOUND}"
