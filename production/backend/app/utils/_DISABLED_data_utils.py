"""
数据处理工具模块 - 提供数据转换相关的功能函数
"""
from typing import Dict, Any
from app.utils.json_utils import make_json_serializable


def model_to_dict(model) -> Dict[str, Any]:
    """
    将SQLAlchemy模型对象转换为可JSON序列化的字典
    
    Args:
        model: SQLAlchemy模型对象
        
    Returns:
        可JSON序列化的字典
    """
    if not model:
        return {}
        
    # 使用__dict__自动获取所有属性
    result = model.__dict__.copy()
    
    # 移除SQLAlchemy内部使用的属性
    if '_sa_instance_state' in result:
        result.pop('_sa_instance_state')
    
    # 处理日期时间类型
    if 'created_at' in result and result['created_at']:
        result['created_at'] = result['created_at'].isoformat()
    if 'updated_at' in result and result['updated_at']:
        result['updated_at'] = result['updated_at'].isoformat()
    
    # 确保所有值都是可JSON序列化的
    return make_json_serializable(result)


def dataset_to_dict(dataset) -> Dict[str, Any]:
    """
    将Dataset对象转换为可JSON序列化的字典
    
    Args:
        dataset: Dataset对象
        
    Returns:
        可JSON序列化的字典
    """
    return model_to_dict(dataset)


def llm_config_to_dict(llm_config) -> Dict[str, Any]:
    """
    将LLMConfig对象转换为可JSON序列化的字典
    
    Args:
        llm_config: LLMConfig对象
        
    Returns:
        可JSON序列化的字典
    """
    return model_to_dict(llm_config)


def prompt_to_dict(prompt) -> Dict[str, Any]:
    """
    将Prompt对象转换为可JSON序列化的字典
    
    Args:
        prompt: Prompt对象
        
    Returns:
        可JSON序列化的字典
    """
    return model_to_dict(prompt) 