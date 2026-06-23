from datetime import datetime
from typing import Dict, List, Any, Optional, Union, Tuple
import json

def serialize_datetime(obj):
    """
    将对象转换为JSON可序列化的格式
    
    Args:
        obj: 需要序列化的对象
        
    Returns:
        JSON可序列化的对象
    """
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def unicode_to_chinese(text):
    """
    将Unicode编码的字符串转换为中文字符
    
    Args:
        text: 包含Unicode编码的字符串
        
    Returns:
        转换后的中文字符串
    """
    if not isinstance(text, str):
        return text
        
    # 处理形如 \u4f60\u597d 的Unicode编码
    try:
        # 检查是否包含Unicode转义序列
        if '\\u' in text:
            # 将字符串解码为Python字符串（会自动转换Unicode编码）
            decoded_text = json.loads(f'"{text}"')
            return decoded_text
        return text
    except:
        # 如果解码失败，返回原始字符串
        return text

def make_json_serializable(data):
    """
    确保数据是JSON可序列化的，并将Unicode编码转换为中文字符
    
    Args:
        data: 需要处理的数据
        
    Returns:
        处理后的JSON可序列化数据，Unicode编码会被转换为中文字符
    """
    if data is None:
        return None
        
    if isinstance(data, (int, float, bool, type(None))):
        return data
    
    if isinstance(data, str):
        # 处理字符串中的Unicode编码
        return unicode_to_chinese(data)
        
    if isinstance(data, datetime):
        return data.isoformat()
        
    if isinstance(data, dict):
        return {k: make_json_serializable(v) for k, v in data.items()}
        
    if isinstance(data, (list, tuple)):
        return [make_json_serializable(item) for item in data]
        
    # 尝试转换为字符串
    try:
        return unicode_to_chinese(str(data))
    except:
        return None

def json_dumps(data, **kwargs):
    """
    封装json.dumps函数，确保中文字符正确编码
    
    Args:
        data: 要序列化的数据
        **kwargs: 其他传递给json.dumps的参数
        
    Returns:
        JSON字符串，确保中文以中文字符形式存储而非Unicode编码
    """
    # 强制设置ensure_ascii=False，确保中文字符不被转换为Unicode编码
    kwargs['ensure_ascii'] = False
    
    # 处理数据中可能存在的特殊类型
    processed_data = make_json_serializable(data)
    
    # 返回序列化后的JSON字符串
    return json.dumps(processed_data, **kwargs)

# 替换默认的json.dumps和json.loads函数，确保全局一致性
def patch_json():
    """
    替换Python标准库中的json.dumps函数，确保全局默认使用ensure_ascii=False
    
    注意:
    此函数会修改全局json模块的行为，请谨慎使用
    通常只需在应用启动时调用一次即可
    """
    _original_dumps = json.dumps
    
    def patched_dumps(obj, *args, **kwargs):
        if 'ensure_ascii' not in kwargs:
            kwargs['ensure_ascii'] = False
        return _original_dumps(obj, *args, **kwargs)
    
    # 替换全局函数
    json.dumps = patched_dumps

"""
使用说明:

1. 对于直接使用json.dumps的地方:
   直接导入本模块的json_dumps函数替代json.dumps：
   
   from app.utils.json_utils import json_dumps
   
   data_str = json_dumps(data)  # 自动设置ensure_ascii=False

2. 全局替换方案（在应用启动时）:
   在app的startup事件中调用patch_json()函数一次：
   
   from app.utils.json_utils import patch_json
   
   @app.on_event("startup")
   async def startup_event():
       patch_json()  # 替换全局json.dumps默认行为
       
   此后，项目中所有使用json.dumps而未指定ensure_ascii参数的地方都会
   自动使用ensure_ascii=False，确保中文字符正确编码。

3. 对于SQLAlchemy模型:
   已通过自定义ChineseJSON类型和engine配置完成全局处理，无需特殊操作。
""" 
