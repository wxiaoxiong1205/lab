from app.schemas.common import ResModel
from app.schemas.user_extraI import UserExtraItem


class RoleVoResponse(ResModel[UserExtraItem]):
    """用户分页列表查询的完整响应模型"""
    pass
