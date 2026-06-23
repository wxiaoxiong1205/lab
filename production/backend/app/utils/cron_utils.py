"""Cron表达式转换工具函数"""
from datetime import date, time
from typing import Optional, Tuple


def datetime_to_cron(schedule_date: date, schedule_time: time) -> str:
    """将日期和时间转换为cron表达式
    
    格式：每天在指定时间执行
    cron格式：分钟 小时 * * *
    
    Args:
        schedule_date: 执行日期（用于验证，实际cron中不包含日期，每天执行）
        schedule_time: 执行时间
        
    Returns:
        cron表达式字符串，例如："30 14 * * *" 表示每天14:30执行
    """
    minute = schedule_time.minute
    hour = schedule_time.hour
    return f"{minute} {hour} * * *"


def cron_to_datetime(cron_expression: Optional[str]) -> Tuple[Optional[date], Optional[time]]:
    """将cron表达式转换为日期和时间
    
    注意：cron表达式不包含日期信息，所以日期返回None
    时间从cron表达式中提取（格式：分钟 小时 * * *）
    
    Args:
        cron_expression: cron表达式，例如："30 14 * * *"
        
    Returns:
        (date, time) 元组，date为None（因为cron不包含日期），time为提取的时间
        如果cron表达式无效或为空，返回 (None, None)
    """
    if not cron_expression:
        return None, None
    
    try:
        # 解析cron表达式：分钟 小时 * * *
        parts = cron_expression.strip().split()
        if len(parts) >= 2:
            minute = int(parts[0])
            hour = int(parts[1])
            # 验证时间范围
            if 0 <= minute <= 59 and 0 <= hour <= 23:
                return None, time(hour=hour, minute=minute)
    except (ValueError, IndexError):
        pass
    
    return None, None
