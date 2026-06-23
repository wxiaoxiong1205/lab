from enum import IntEnum


class AuditStatus(IntEnum):
    UNAUDITED = 0  # 未审计
    APPROVED = 1  # 通过
    REJECTED = 2  # 不通过

    @classmethod
    def to_chinese(cls, value):
        """将数值转换为中文状态"""
        mapping = {
            cls.UNAUDITED: "未审计",
            cls.APPROVED: "通过",
            cls.REJECTED: "不通过"
        }
        return mapping.get(value, "未知状态")
