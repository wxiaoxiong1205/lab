from datetime import datetime, timezone
import pytz
import os

# 默认时区(上海时区UTC+8)
DEFAULT_TIMEZONE = 'Asia/Shanghai'
# 从环境变量获取时区设置，默认为上海时区
# 直接使用os.environ而非dotenv，避免依赖问题
TIMEZONE = os.environ.get('APP_TIMEZONE', DEFAULT_TIMEZONE)

# 时区对象
TIMEZONE_OBJ = pytz.timezone(TIMEZONE)
UTC_TZ = pytz.UTC


def to_local_tz(dt: datetime) -> datetime:
    """
    将datetime转换为指定时区(默认上海时区UTC+8)的时间
    
    处理逻辑：
    - 如果输入有时区信息：转换为上海时区
    - 如果输入没有时区信息：假设已经是上海时区，直接添加上海时区信息
    
    Args:
        dt: datetime对象，可以是带时区或不带时区的
        
    Returns:
        转换为指定时区的datetime对象
    """
    # 如果时间没有时区信息，假设已经是上海时区，直接添加上海时区
    if dt.tzinfo is None:
        # 使用 localize 方法为 naive datetime 添加 pytz 时区（这是正确的方式）
        return TIMEZONE_OBJ.localize(dt)
    
    # 如果已经有时区信息，转换为上海时区
    return dt.astimezone(TIMEZONE_OBJ)


def format_datetime(dt: datetime, include_seconds: bool = True) -> str:
    """
    格式化datetime为易读的字符串格式
    
    Args:
        dt: datetime对象
        include_seconds: 是否包含秒数
        
    Returns:
        格式化后的时间字符串
    """
    local_time = to_local_tz(dt)
    fmt = "%Y-%m-%d %H:%M:%S" if include_seconds else "%Y-%m-%d %H:%M"
    return local_time.strftime(fmt)


def get_current_shanghai_time() -> datetime:
    """
    获取当前上海时区（东八区）的 naive datetime
    用于数据库字段的默认值（timezone=False）
    
    Returns:
        当前上海时区的 naive datetime 对象
    """
    # 获取当前 UTC 时间（带时区）
    utc_now = datetime.now(timezone.utc)
    # 转换为上海时区，然后去掉时区信息
    return utc_now.astimezone(TIMEZONE_OBJ).replace(tzinfo=None)


def get_current_shanghai_time_with_tz() -> datetime:
    """
    获取当前上海时区（东八区）的带时区 datetime
    用于数据库字段的默认值（timezone=True）
    
    Returns:
        当前上海时区的带时区 datetime 对象
    """
    # 获取当前 UTC 时间（带时区）
    utc_now = datetime.now(timezone.utc)
    # 转换为上海时区（保持时区信息）
    return utc_now.astimezone(TIMEZONE_OBJ)


def convert_to_naive_datetime(dt: datetime) -> datetime:
    """
    将带时区的 datetime 转换为时区无关的 datetime（naive datetime）
    因为数据库字段 created_at 定义为 DateTime(timezone=False)
    数据库存储的是上海时区（东八区）的时间（但字段类型是 timezone=False）
    
    处理逻辑：
    - 如果输入有时区信息：转换为上海时区（Asia/Shanghai），然后去掉时区信息
    - 如果输入没有时区信息：假设已经是上海时区，直接返回
    
    Args:
        dt: datetime对象，可以是带时区或不带时区的
        
    Returns:
        时区无关的 datetime 对象（naive datetime），代表上海时区（东八区）时间
    """
    if dt is None:
        return dt
    if dt.tzinfo is not None:
        # 如果有时区信息，先转换为上海时区（东八区），然后去掉时区信息
        return dt.astimezone(TIMEZONE_OBJ).replace(tzinfo=None)
    else:
        # 如果没有时区信息，假设已经是上海时区，直接返回
        return dt
