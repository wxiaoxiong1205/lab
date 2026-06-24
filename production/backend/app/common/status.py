from enum import Enum


# =============== 状态定义 ===============
class TaskStatus(str, Enum):
    CREATED = "已创建"
    SCHEDULED_PENDING = "定时待启动"
    PREPARING = "启动中"
    PENDING = "排队中"
    RUNNING = "运行中"
    COMPLETED = "已完成"
    FAILED = "失败"
    TERMINATED = "已终止"
    # PAUSED = "停止"
    CREATING="创建中"
    CREATION_FAILED = "创建失败"



class AnnotationStatus(str, Enum):
    """标注状态枚举"""
    PENDING = "未评估"  # 未评估
    ANNOTATING = "评估中"  # 评估中
    REPORT_GENERATION_ING = "报告生成中"  # 报告生成中

