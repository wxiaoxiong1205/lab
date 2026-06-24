from typing import List, Optional, Dict, Any
from abc import ABC, abstractmethod
from fastapi import UploadFile
from fastapi_pagination import Page

from app.models.models import JwtUserInfo
from app.schemas.label import LabelTaskBizType
from app.schemas.multi_label import (
    MultiLabelTaskCreate, MultiLabelTaskDetailResponse,
    MultiLabelTaskPublishResponse,
    MultiLabelDataResponse, MultiLabelAnnotationSaveRequest, MultiLabelAnnotationSaveResponse,
    MultiLabelSubmitAllRequest, MultiLabelSubmitAllResponse,
    MultiLabelCompletionStatusResponse,
    MultiLabelAuditDataResponse, MultiLabelAuditSubmitRequest, MultiLabelAuditSubmitResponse,
    MultiLabelAuditCompletionStatusResponse,
    TaskOverviewResponse, AnnotationTaskResponse, AuditTaskResponse,
    AdminDataResponse,
    MultiLabelMemberReplaceRequest,
    MultiLabelMemberReplaceResponse,
    AuditStatusFilter,
)


class MultiLabelService(ABC):
    """多人标注服务抽象接口类"""
    
    # ------------------------------ 任务管理接口 ------------------------------
    @abstractmethod
    async def create_multi_label_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_create: MultiLabelTaskCreate,
    ) -> Dict[str, int]:
        """
        创建多人标注任务（仅租户/平台/项目管理员）。

        返回: {"id": 任务ID}
        """
        pass
    
    @abstractmethod
    async def list_task_overview(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        biz_type: LabelTaskBizType,
        page: int,
        size: int,
        task_name: Optional[str] = None,
    ) -> Page[TaskOverviewResponse]:
        """任务总览（管理员视图）- 展示标注进度和审核进度；权限同 has_multi_label_project_admin_access，非管理员返回空列表"""
        pass

    @abstractmethod
    async def has_multi_label_project_admin_access(
        self,
        db: Any,
        current_user: JwtUserInfo,
        project_id: int,
    ) -> bool:
        """当前用户在项目下是否具备多人标注管理员权限（任务总览、管理员数据视图等共用）"""
        pass

    @abstractmethod
    async def list_annotation_tasks(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        biz_type: LabelTaskBizType,
        page: int,
        size: int,
        task_name: Optional[str] = None,
    ) -> Page[AnnotationTaskResponse]:
        """在线任务（标注人员视图）- 只展示当前用户的标注进度"""
        pass
    
    @abstractmethod
    async def list_audit_tasks(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        biz_type: LabelTaskBizType,
        page: int,
        size: int,
        task_name: Optional[str] = None,
    ) -> Page[AuditTaskResponse]:
        """审核任务（审核人员视图）- 只展示当前用户的审核进度"""
        pass
    
    @abstractmethod
    async def get_multi_label_task_detail(
        self,
        project_id: int,
        task_id: int
    ) -> MultiLabelTaskDetailResponse:
        """获取多人标注任务详情"""
        pass
    
    @abstractmethod
    async def publish_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> MultiLabelTaskPublishResponse:
        """发布任务（审核完成后）"""
        pass
    
    @abstractmethod
    async def delete_multi_label_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> None:
        """删除多人标注任务（已发布任务也支持删除）"""
        pass
    
    # ------------------------------ 标注功能接口 ------------------------------
    @abstractmethod
    async def get_annotation_data(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int,
        page: Optional[int] = None,
        size: Optional[int] = None,
        is_annotated: Optional[bool] = None,
        status: Optional[str] = None
    ) -> MultiLabelDataResponse:
        """
        获取分配给当前用户的标注数据（分页）
        
        重要说明：
        - 接口会根据当前用户ID和角色，查询分配规则，通过算法计算分配给该用户的样本（row_number）
        - 只返回 row_number 在计算结果中的数据，确保用户每次看到的都是分配给自己的样本
        
        状态筛选（status）：
        - pending: 待标注
        - saved: 已暂存
        - submitted: 已提交
        - audit_passed: 审核通过
        - audit_failed: 审核不通过
        - resubmitted: 已重新提交
        """
        pass
    
    @abstractmethod
    async def save_annotation(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        request: MultiLabelAnnotationSaveRequest
    ) -> MultiLabelAnnotationSaveResponse:
        """暂存单条标注数据"""
        pass
    
    @abstractmethod
    async def submit_all_annotations(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        request: MultiLabelSubmitAllRequest
    ) -> MultiLabelSubmitAllResponse:
        """
        提交全部标注
        
        只有当分配给当前用户的所有数据都已暂存后，才能提交。
        提交后数据将被锁定，不能再编辑。
        """
        pass
    
    @abstractmethod
    async def get_completion_status(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> MultiLabelCompletionStatusResponse:
        """查询标注完成状态"""
        pass
    
    # ------------------------------ 审核功能接口 ------------------------------
    @abstractmethod
    async def get_audit_completion_status(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> MultiLabelAuditCompletionStatusResponse:
        """
        查询当前审核员的完成状态（用于判断是否可以提交）
        
        返回：分配总数、已审核数、是否全部完成、是否还有可提交的审核。
        """
        pass
    
    @abstractmethod
    async def get_audit_data(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int,
        page: Optional[int] = None,
        size: Optional[int] = None,
        audit_status: Optional[AuditStatusFilter] = None,
        is_reaudit: Optional[bool] = None,
    ) -> MultiLabelAuditDataResponse:
        """
        获取分配给当前审核员的待审核数据（分页）
        
        重要说明：
        - 接口会根据当前审核员ID，查询分配规则（role='auditor'），通过算法计算分配给该审核员的样本（row_number）
        - 只返回分配给当前审核员的样本，确保每次看到的都是分配给自己的样本
        """
        pass
    
    # ------------------------------ 管理员视图接口 ------------------------------
    @abstractmethod
    async def get_admin_overview_data(
        self,
        db,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int,
        page: Optional[int] = None,
        size: Optional[int] = None,
        is_annotated: Optional[bool] = None,
        audit_status: Optional[AuditStatusFilter] = None
    ) -> AdminDataResponse:
        """
        管理员数据总览 - 展示所有数据的标注进度和审核结果
        
        仅限管理员访问，展示：
        - 数据本身的字段（raw_data）
        - 标注信息（是否已标注、标注员、标注内容）
        - 审核信息（是否已审核、审核员、审核结果）
        """
        pass
    
    @abstractmethod
    async def save_audit_result(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        request: MultiLabelAuditSubmitRequest
    ) -> MultiLabelAuditSubmitResponse:
        """暂存审核结果（通过/不通过）"""
        pass

    @abstractmethod
    async def submit_audit_result(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> MultiLabelAuditSubmitResponse:
        """提交审核（完成）：校验当前审核员已全部审完分配数（可多审不可少审），通过即可提交"""
        pass

    @abstractmethod
    async def replace_task_member(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int,
        request: MultiLabelMemberReplaceRequest,
    ) -> MultiLabelMemberReplaceResponse:
        """
        替换任务成员（仅多人标注管理员）。

        同步更新：成员表、进度表、分配规则 JSON、本地分配缓存、Redis 按用户维度的 Set，
        以及 audits.overlay.jsonl / .annotations.jsonl 中对应人员的 id、展示名（若有）。
        """
        pass
