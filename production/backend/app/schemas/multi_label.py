from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List, Union

from pydantic import BaseModel, Field, model_validator

from app.schemas.base import BaseSchema
from app.schemas.label import (
    LabelDatasetType,
    LabelDatasetFormat,
    LabelTaskBizType,
    LabelDatasetResponse,
    LabelMachineLearningDatasetResponse,
)
from app.schemas.training_task import TrainingMethodType


# 枚举定义
class MemberRole(str, Enum):
    """成员角色枚举"""
    ANNOTATOR = "annotator"  # 标注员
    AUDITOR = "auditor"  # 审核员


class AuditResult(str, Enum):
    """审核结果枚举"""
    PASSED = "passed"  # 通过
    FAILED = "failed"  # 未通过


class AuditStatusFilter(str, Enum):
    """审核状态筛选：未审核、审核通过、审核不通过"""
    UNAUDITED = "unaudited"
    PASSED = "passed"
    FAILED = "failed"


class MultiLabelTaskStatus(str, Enum):
    """多人标注任务状态枚举"""
    CREATING = "creating"                # 创建中（异步拷贝数据）
    CREATED = "created"                  # 已创建，未开始
    ANNOTATING = "annotating"            # 标注进行中
    ANNOTATION_DONE = "annotation_done"  # 标注完成（所有标注员都提交了）
    AUDITING = "auditing"                # 审核进行中
    REWORK = "rework"                    # 重标中（有审核不通过的数据）
    REAUDITING = "reauditing"            # 重审进行中（返工数据已重新提交，进入新一轮审核）
    AUDIT_PASSED = "audit_passed"        # 审核全部通过，待发布
    PUBLISHED = "published"              # 已发布


class AnnotationItemStatus(str, Enum):
    """标注数据项状态枚举"""
    PENDING = "pending"              # 待标注 - 可编辑
    SAVED = "saved"                  # 已暂存 - 可编辑
    SUBMITTED = "submitted"          # 已提交 - 锁定，待审核
    AUDIT_PASSED = "audit_passed"    # 审核通过 - 锁定
    AUDIT_FAILED = "audit_failed"    # 审核不通过 - 可编辑（需重标）
    RESUBMITTED = "resubmitted"      # 已重新提交 - 锁定，待重审


# 任务管理相关Schema
class MultiLabelTaskCreate(BaseModel):
    """创建多人标注任务请求"""
    biz_type: LabelTaskBizType = Field(LabelTaskBizType.LLM, description="任务业务类型：llm/machine_learning")
    task_name: str = Field(..., description="标注任务名称", min_length=1, max_length=100)
    description: Optional[str] = Field(None, description="任务描述", max_length=1000)
    dataset_description: Optional[str] = Field(None, description="标注数据集描述", max_length=1000)
    source: str = Field(..., description="数据来源：existed_dataset（已有数据集）/ upload（本地上传）")
    source_dataset_id: Optional[int] = Field(None, description="来源数据集ID（当source=existed_dataset时必需）")
    dataset_type: Optional[LabelDatasetType] = Field(None, description="标注类型（LLM任务必填）")
    dataset_format: Optional[str] = Field(None, description="数据格式（LLM任务必填）")
    override: bool = Field(False, description="是否覆盖原版本")
    annotators: List['AnnotatorAssignRequest'] = Field(..., description="标注员分配列表")
    auditors: List['AuditorAssignRequest'] = Field(..., description="审核员分配列表")
    audit_sampling_ratio: int = Field(100, description="审核抽检比例（1-100，默认100%）", ge=1, le=100)

    @model_validator(mode='after')
    def validate_fields(self):
        if self.source == "existed_dataset" and self.source_dataset_id is None:
            raise ValueError("从已有数据集创建时，必须指定 source_dataset_id")
        if self.biz_type == LabelTaskBizType.LLM:
            if self.dataset_type is None:
                raise ValueError("LLM 多人标注任务必须指定 dataset_type")
            if self.dataset_format is None:
                raise ValueError("LLM 多人标注任务必须指定 dataset_format")
            valid_formats = {item.value for item in LabelDatasetFormat}
            if self.dataset_format not in valid_formats:
                raise ValueError(
                    f"LLM dataset_format 只支持: {', '.join(sorted(valid_formats))}"
                )
        return self


class MultiLabelTaskAssignRequest(BaseModel):
    """分配任务成员请求"""
    annotators: List['AnnotatorAssignRequest'] = Field(..., description="标注员分配列表")
    auditors: List['AuditorAssignRequest'] = Field(..., description="审核员分配列表")
    audit_sampling_ratio: int = Field(100, description="审核抽检比例（1-100，默认100%）", ge=1, le=100)


class AnnotatorAssignRequest(BaseModel):
    """标注员分配请求"""
    user_id: int = Field(..., description="用户ID", gt=0)
    assign_count: int = Field(..., description="分配样本数量", gt=0)
    deadline: Optional[datetime] = Field(None, description="标注截止时间")


class AuditorAssignRequest(BaseModel):
    """审核员分配请求"""
    user_id: int = Field(..., description="用户ID", gt=0)
    assign_count: int = Field(..., description="分配审核样本数量", gt=0)
    deadline: Optional[datetime] = Field(None, description="审核截止时间")


class MultiLabelTaskResponse(BaseSchema):
    """多人标注任务响应（列表展示 - 通用基类）"""
    id: int = Field(..., description="任务ID")
    biz_type: LabelTaskBizType = Field(LabelTaskBizType.LLM, description="任务业务类型：llm/machine_learning")
    task_type: str = Field(..., description="任务类型")
    task_name: str = Field(..., description="任务名称")
    description: Optional[str] = Field(None, description="任务描述")
    status: str = Field(..., description="任务状态")
    total_samples: Optional[int] = Field(None, description="总样本数")
    assigned_count: int = Field(0, description="分配样本数")
    saved_count: int = Field(0, description="暂存样本数")
    source_dataset_name: Optional[str] = Field(None, description="来源数据集名称")
    submit_dataset_name: Optional[str] = Field(None, description="提交数据集名称")
    
    class Config:
        from_attributes = True


class TaskOverviewResponse(BaseSchema):
    """任务总览响应（管理员视图）- 展示标注进度和审核进度"""
    id: int = Field(..., description="任务ID")
    biz_type: LabelTaskBizType = Field(LabelTaskBizType.LLM, description="任务业务类型：llm/machine_learning")
    dataset_type: Optional[str] = Field(None, description="数据集类型")
    task_name: str = Field(..., description="任务名称")
    description: Optional[str] = Field(None, description="任务描述")
    status: str = Field(..., description="任务状态")
    total_samples: Optional[int] = Field(None, description="总样本数")
    source_dataset_name: Optional[str] = Field(None, description="来源数据集名称")
    submit_dataset_name: Optional[str] = Field(None, description="提交数据集名称")
    # 标注进度
    annotation_assigned_count: int = Field(0, description="标注分配总数")
    annotation_saved_count: int = Field(0, description="标注完成数")
    annotation_progress: float = Field(0, description="标注进度百分比")
    # 审核进度
    audit_total_count: int = Field(0, description="待审核总数")
    audit_passed_count: int = Field(0, description="审核通过数")
    audit_failed_count: int = Field(0, description="审核不通过数")
    audit_progress: float = Field(0, description="审核进度百分比")
    
    class Config:
        from_attributes = True


class MultiLabelProjectAdminAccessResponse(BaseModel):
    """
    当前用户在指定项目下是否具备「多人标注管理员」权限。

    与任务总览、管理员数据总览等接口的后台校验一致，供前端统一控制菜单、路由与按钮。
    """

    can_access: bool = Field(
        ...,
        description="租户管理员、平台管理员或本项目项目管理员时为 true",
    )


class AnnotationTaskResponse(BaseSchema):
    """在线任务响应（标注人员视图）- 只展示当前用户的标注进度"""
    id: int = Field(..., description="任务ID")
    biz_type: LabelTaskBizType = Field(LabelTaskBizType.LLM, description="任务业务类型：llm/machine_learning")
    dataset_type: Optional[str] = Field(None, description="数据集类型")
    task_name: str = Field(..., description="任务名称")
    description: Optional[str] = Field(None, description="任务描述")
    status: str = Field(..., description="任务状态")
    source_dataset_id: Optional[int] = Field(None, description="来源数据集ID")
    submit_dataset_id: Optional[int] = Field(None, description="提交数据集ID")
    source_dataset_name: Optional[str] = Field(None, description="来源数据集名称")
    submit_dataset_name: Optional[str] = Field(None, description="标注后/发布后数据集名称（任务已发布时有值）")
    # 当前用户的标注进度
    my_assigned_count: int = Field(0, description="我的分配数")
    my_saved_count: int = Field(0, description="我的完成数")
    my_progress: float = Field(0, description="我的标注进度百分比")
    deadline: Optional[datetime] = Field(None, description="截止时间")
    
    class Config:
        from_attributes = True


class AuditTaskResponse(BaseSchema):
    """审核任务响应（审核人员视图）- 只展示当前用户的审核进度"""
    id: int = Field(..., description="任务ID")
    biz_type: LabelTaskBizType = Field(LabelTaskBizType.LLM, description="任务业务类型：llm/machine_learning")
    dataset_type: Optional[str] = Field(None, description="数据集类型")
    task_name: str = Field(..., description="任务名称")
    description: Optional[str] = Field(None, description="任务描述")
    status: str = Field(..., description="任务状态")
    source_dataset_name: Optional[str] = Field(None, description="来源数据集名称")
    # 当前用户的审核进度
    my_audit_total: int = Field(0, description="我的待审核总数")
    my_audit_passed: int = Field(0, description="我的审核通过数")
    my_audit_failed: int = Field(0, description="我的审核不通过数")
    my_audit_progress: float = Field(0, description="我的审核进度百分比")
    deadline: Optional[datetime] = Field(None, description="截止时间")
    
    class Config:
        from_attributes = True


class MultiLabelTaskDetailResponse(MultiLabelTaskResponse):
    """多人标注任务详情响应"""
    training_method_type: Optional[TrainingMethodType] = Field(None, description="训练方法类型（如 sft/dpo）")
    dataset: Optional[Union[LabelDatasetResponse, LabelMachineLearningDatasetResponse]] = Field(
        None, description="关联的数据集信息（LLM/机器学习）"
    )
    progress: Optional[Dict[str, Any]] = Field(None, description="标注进度")
    audit_sampling_ratio: int = Field(100, description="审核抽检比例")
    # 成员信息
    annotators: Optional[List['AnnotatorMemberItem']] = Field(None, description="标注员列表")
    auditors: Optional[List['AuditorMemberItem']] = Field(None, description="审核员列表")


class MultiLabelTaskPublishResponse(BaseModel):
    """发布任务响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="提示信息")
    submit_dataset_id: Optional[int] = Field(None, description="提交数据集ID")
    submit_dataset_name: Optional[str] = Field(None, description="提交数据集名称")


# 标注相关Schema
class MultiLabelDataResponse(BaseModel):
    """多人标注数据响应（分页）"""
    items: List['MultiLabelDataItem'] = Field(..., description="数据项列表")
    total: int = Field(..., description="分配给当前用户的总样本数")
    page: int = Field(..., description="当前页码")
    size: int = Field(..., description="每页数量")
    total_pages: int = Field(..., description="总页数")
    training_method_type: Optional[TrainingMethodType] = Field(None, description="训练方法类型（如 sft/dpo）")
    dataset_format: Optional[str] = Field(None, description="数据集格式（如 prompt-response/role-based/alpaca）")
    task_status: str = Field(
        ...,
        description=(
            "任务整体状态，与 MultiLabelTaskStatus 取值一致，用于判断当前流程阶段："
            "creating/created/annotating/annotation_done/auditing/rework/reauditing/audit_passed/published"
        ),
    )
    base_url: Optional[str] = Field(None, description="基础路径-用于拼接图片路径（仅图像理解数据集）")
    ml_task_template_type: Optional[str] = Field(None, description="机器学习标注任务模版")
    ml_task_annotation_type: Optional[str] = Field(
        None, description="数据集对应的 MachineLearningDatasetAnnotationType 值"
    )


class MultiLabelDataItem(BaseModel):
    """多人标注数据项"""
    item_id: str = Field(..., description="数据项ID")
    row_number: int = Field(..., description="行号")
    raw_data: Dict[str, Any] = Field(..., description="原始数据")
    annotation: Optional[Union[Dict[str, Any], List[Any], None]] = Field(None, description="标注内容（如果有）")
    is_annotated: bool = Field(..., description="是否已标注")
    # 状态相关字段
    status: AnnotationItemStatus = Field(..., description="数据项状态")
    is_editable: bool = Field(..., description="是否可编辑")
    audit_result: Optional[str] = Field(None, description="审核结果（passed/failed）")
    audit_reason: Optional[str] = Field(None, description="审核不通过原因")


class MultiLabelAnnotationSaveRequest(BaseModel):
    """保存多人标注请求（暂存单条数据）"""
    task_id: int = Field(..., description="任务ID", gt=0)
    row_number: int = Field(..., description="行号（从1开始）", ge=1)
    annotation: Union[Dict[str, Any], List[Any], None] = Field(..., description="标注内容（JSON格式）")


class MultiLabelAnnotationSaveResponse(BaseModel):
    """保存多人标注响应"""
    success: bool = Field(..., description="是否成功")
    message: Optional[str] = Field(None, description="提示信息")


class MultiLabelSubmitAllRequest(BaseModel):
    """提交全部标注请求"""
    task_id: int = Field(..., description="任务ID", gt=0)


class MultiLabelSubmitAllResponse(BaseModel):
    """提交全部标注响应"""
    success: bool = Field(..., description="是否成功")
    message: Optional[str] = Field(None, description="提示信息")
    submitted_count: int = Field(..., description="已提交的样本数")
    total_assigned: int = Field(..., description="分配给当前用户的总样本数")


class MultiLabelCompletionStatusResponse(BaseModel):
    """标注完成状态响应"""
    task_id: int = Field(..., description="任务ID")
    is_completed: bool = Field(..., description="是否完成标注（所有分配的数据都已暂存）")
    is_submitted: bool = Field(..., description="是否已提交")
    saved_count: int = Field(..., description="暂存数")
    total_samples: int = Field(..., description="总条数")
    training_method_type: Optional[TrainingMethodType] = Field(None, description="训练方法类型（如 sft/dpo）")
    dataset_format: Optional[str] = Field(None, description="数据集格式（如 prompt-response/role-based/alpaca）")


# 审核相关Schema
class MultiLabelAuditDataResponse(BaseModel):
    """待审核数据响应（分页）"""
    items: List['MultiLabelAuditDataItem'] = Field(..., description="数据项列表")
    total: int = Field(..., description="分配给当前审核员的总样本数")
    page: int = Field(..., description="当前页码")
    size: int = Field(..., description="每页数量")
    total_pages: int = Field(..., description="总页数")
    training_method_type: Optional[TrainingMethodType] = Field(None, description="训练方法类型（如 sft/dpo）")
    dataset_format: Optional[str] = Field(None, description="数据集格式（如 prompt-response/role-based/alpaca）")
    task_status: str = Field(
        ...,
        description=(
            "任务整体状态，与 MultiLabelTaskStatus 取值一致，用于判断当前流程阶段："
            "creating/created/annotating/annotation_done/auditing/rework/reauditing/audit_passed/published"
        ),
    )
    is_reaudit_round: bool = Field(False, description="当前审核轮次是否为重审")
    base_url: Optional[str] = Field(None, description="基础路径-用于拼接图片路径（仅图像理解数据集）")
    ml_task_template_type: Optional[str] = Field(None, description="机器学习标注任务模版")
    ml_task_annotation_type: Optional[str] = Field(
        None, description="数据集对应的 MachineLearningDatasetAnnotationType 值"
    )


class MultiLabelAuditDataItem(BaseModel):
    """待审核数据项"""
    item_id: str = Field(..., description="数据项ID")
    row_number: int = Field(..., description="行号")
    raw_data: Dict[str, Any] = Field(..., description="原始数据")
    annotation: Union[Dict[str, Any], List[Any], None] = Field(..., description="标注内容")
    audit_result: Optional[str] = Field(None, description="审核结果（已审核时显示）")
    audit_reason: Optional[str] = Field(None, description="未通过原因（未通过时显示）")
    is_reaudit: bool = Field(False, description="是否为重审")


class AdminDataResponse(BaseModel):
    """管理员数据总览响应（分页）"""
    items: List['AdminDataItem'] = Field(..., description="数据项列表")
    total: int = Field(..., description="总样本数")
    page: int = Field(..., description="当前页码")
    size: int = Field(..., description="每页数量")
    total_pages: int = Field(..., description="总页数")
    training_method_type: Optional[TrainingMethodType] = Field(None, description="训练方法类型（如 sft/dpo）")
    dataset_format: Optional[str] = Field(None, description="数据集格式（如 prompt-response/role-based/alpaca）")
    base_url: Optional[str] = Field(None, description="基础路径-用于拼接图片路径（仅图像理解数据集）")
    ml_task_template_type: Optional[str] = Field(None, description="机器学习标注任务模版")
    ml_task_annotation_type: Optional[str] = Field(
        None, description="数据集对应的 MachineLearningDatasetAnnotationType 值"
    )


class AdminDataItem(BaseModel):
    """管理员数据项（包含标注进度和审核结果）"""
    item_id: str = Field(..., description="数据项ID")
    row_number: int = Field(..., description="行号")
    raw_data: Dict[str, Any] = Field(..., description="原始数据")
    # 标注信息
    is_annotated: bool = Field(False, description="是否已标注")
    annotator_id: Optional[int] = Field(None, description="标注员ID")
    annotator_name: Optional[str] = Field(None, description="标注员名称")
    annotation: Optional[Union[Dict[str, Any], List[Any], None]] = Field(None, description="标注内容")
    # 审核信息
    is_audited: bool = Field(False, description="是否已审核")
    auditor_id: Optional[int] = Field(None, description="审核员ID")
    auditor_name: Optional[str] = Field(None, description="审核员名称")
    audit_result: Optional[str] = Field(None, description="审核结果：passed/failed")
    audit_reason: Optional[str] = Field(None, description="未通过原因")


class MultiLabelAuditSubmitRequest(BaseModel):
    """提交审核结果请求"""
    task_id: int = Field(..., description="任务ID", gt=0)
    row_number: int = Field(..., description="行号（从1开始）", ge=1)
    audit_result: AuditResult = Field(..., description="审核结果：passed（通过）/ failed（未通过）")
    reason: Optional[str] = Field(None, description="未通过原因（failed时必填）")
    
    @model_validator(mode='after')
    def validate_reason(self):
        """未通过时reason必填"""
        if self.audit_result == AuditResult.FAILED and not self.reason:
            raise ValueError("审核结果为未通过时，reason必填")
        return self


class MultiLabelAuditSubmitResponse(BaseModel):
    """提交审核结果响应"""
    success: bool = Field(..., description="是否成功")
    message: Optional[str] = Field(None, description="提示信息")


class MultiLabelAuditCompletionStatusResponse(BaseModel):
    """审核完成状态响应（当前审核员）
    - is_completed：是否已审完分配数量（可展示/启用「审核提交」按钮，与通过/不通过数量无关）。
    - is_submitted：为 true 时不允许审核员修改或提交。包括：审核通过、已发布、返工中（返工中需等标注员提交后状态变为 AUDITING，审核员才能继续审核）。
    """
    task_id: int = Field(..., description="任务ID")
    total_assigned: int = Field(..., description="分配给当前审核员的总数")
    audited_count: int = Field(..., description="已审核数量（通过+不通过）")
    is_completed: bool = Field(..., description="是否全部审核完成（≥分配数即完成时可点提交，与通过/不通过数量无关）")
    is_submitted: bool = Field(..., description="为 true 时不允许修改或提交（审核通过/已发布/返工中）；返工中需等标注员提交后变为 AUDITING 才能继续审")
    passed_count: int = Field(..., description="审核通过数量")
    failed_count: int = Field(..., description="审核不通过数量")
    progress_percent: float = Field(0, description="审核进度百分比，溢出时按100%")


class MultiLabelAuditProgressResponse(BaseModel):
    """审核进度响应"""
    task_id: int = Field(..., description="任务ID")
    total_samples: int = Field(..., description="总样本数")
    sampling_count: int = Field(..., description="抽检数量")
    reviewed_count: int = Field(..., description="已审核数量")
    passed_count: int = Field(..., description="通过数量")
    failed_count: int = Field(..., description="未通过数量")
    progress: float = Field(..., description="审核进度百分比")
    auditors: List['AuditorProgressItem'] = Field(..., description="审核员进度列表")


class AuditorProgressItem(BaseModel):
    """审核员进度项"""
    auditor_id: int = Field(..., description="审核员ID")
    auditor_name: str = Field(..., description="审核员名称")
    assigned_count: int = Field(..., description="分配数量")
    reviewed_passed_count: int = Field(..., description="审核通过数量")
    reviewed_failed_count: int = Field(..., description="审核未通过数量")
    progress: float = Field(..., description="审核进度百分比")


# 成员管理相关Schema
class MultiLabelTaskMembersResponse(BaseModel):
    """任务成员列表响应"""
    annotators: List['AnnotatorMemberItem'] = Field(..., description="标注员列表")
    auditors: List['AuditorMemberItem'] = Field(..., description="审核员列表")


class AnnotatorMemberItem(BaseModel):
    """标注员成员项"""
    user_id: int = Field(..., description="用户ID")
    user_name: str = Field(..., description="用户名称")
    assign_count: int = Field(..., description="分配样本数量")
    saved_count: int = Field(..., description="暂存样本数")
    final_count: int = Field(..., description="最终提交样本数")
    deadline: Optional[datetime] = Field(None, description="标注截止时间")


class AuditorMemberItem(BaseModel):
    """审核员成员项"""
    user_id: int = Field(..., description="用户ID")
    user_name: str = Field(..., description="用户名称")
    assigned_count: int = Field(..., description="分配审核样本数")
    reviewed_passed_count: int = Field(..., description="审核通过样本数")
    reviewed_failed_count: int = Field(..., description="审核不通过样本数")
    deadline: Optional[datetime] = Field(None, description="审核截止时间")


class MultiLabelMemberReplaceRequest(BaseModel):
    """管理员将任务中某一成员替换为另一用户（同步库表、分配规则与缓存、Redis、落盘审核/标注记录中的人员字段）"""

    role: MemberRole = Field(..., description="被替换成员角色：annotator / auditor")
    from_user_id: int = Field(..., description="原成员用户ID", gt=0)
    to_user_id: int = Field(..., description="新成员用户ID", gt=0)


class MultiLabelMemberReplaceResponse(BaseModel):
    """成员替换结果"""

    success: bool = Field(True, description="是否成功")
    message: str = Field("成员已替换", description="提示信息")
