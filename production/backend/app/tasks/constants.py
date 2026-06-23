"""
常量定义模块
统一管理任务状态常量，确保项目中所有地方使用相同的状态值
"""

class TaskStatus:
    """
    任务状态常量
    符合task_management.md文档规范
    """
    # 任务状态常量
    CREATED = 'CREATED'      # 已创建
    PENDING = 'PENDING'      # 等待中（已提交到Celery队列）
    RUNNING = 'RUNNING'      # 运行中
    SUCCESS = 'SUCCESS'      # 成功
    FAILED = 'FAILED'        # 失败
    CANCELLED = 'CANCELLED'  # 已取消
    
    # 所有有效状态
    ALL_STATUSES = [CREATED, PENDING, RUNNING, SUCCESS, FAILED, CANCELLED]
    
    # 终态状态（不可再流转）
    FINAL_STATUSES = [SUCCESS, FAILED, CANCELLED]
    
    # 中间状态（可以继续流转）
    INTERMEDIATE_STATUSES = [CREATED, PENDING, RUNNING]
    
    # 状态流转规则（符合task_management.md文档）
    VALID_TRANSITIONS = {
        CREATED: [PENDING, CANCELLED],           # 已创建 -> 等待中、已取消
        PENDING: [RUNNING, CANCELLED],           # 等待中 -> 运行中、已取消
        RUNNING: [SUCCESS, FAILED, CANCELLED],   # 运行中 -> 成功、失败、已取消
        SUCCESS: [],   # 终态
        FAILED: [],    # 终态
        CANCELLED: []  # 终态
    }
    
    # 状态中文描述
    STATUS_DESCRIPTIONS = {
        CREATED: "已创建，等待启动",
        PENDING: "已提交到队列，等待执行",
        RUNNING: "正在执行中",
        SUCCESS: "执行成功",
        FAILED: "执行失败",
        CANCELLED: "已取消",
    }
    
    # 可编辑的状态
    EDITABLE_STATUSES = [CREATED]
    
    # 可取消的状态
    CANCELLABLE_STATUSES = [CREATED, PENDING, RUNNING]
    
    # 可删除的状态（只有终态可删除）
    DELETABLE_STATUSES = FINAL_STATUSES


class TaskType:
    """
    任务类型常量
    """
    TRAINING_TASK = 'training-task'
    # 注意：已禁用的任务类型已移除
    # ANSWER_GENERATION = 'answer-generation'
    
    # 所有支持的任务类型
    ALL_TYPES = [TRAINING_TASK]
    
    # 任务类型描述
    TYPE_DESCRIPTIONS = {
        TRAINING_TASK: "模型训练任务 - 执行SFT、DPO等训练方法"
        # ANSWER_GENERATION: "答案生成任务 - 使用LLM为数据集生成答案"
    }
