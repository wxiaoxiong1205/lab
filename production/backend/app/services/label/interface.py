from typing import Optional, Dict, TYPE_CHECKING
from abc import ABC, abstractmethod
from fastapi import UploadFile
from fastapi_pagination import Page

from app.models.label_manager import LabelDataset, LabelMachineLearningDataset
from app.models.models import JwtUserInfo

if TYPE_CHECKING:
    from app.schemas.training_task import TrainingTypeCategory
from app.repository.label_dataset_mapper import LabelDatasetMapper
from app.repository.label_auto_model_mapper import LabelAutoModelMapper
from app.repository.label_task_mapper import LabelTaskMapper
from app.repository.label_progress_mapper import LabelProgressMapper
from app.repository.training_dataset_mapper import TrainingDatasetMapper
from app.schemas.label import (
    LabelTaskCreate, LabelTaskResponse, LabelTaskDetailResponse,
    AnnotationSaveRequest, AnnotationSaveResponse,
    AnnotationDataResponse,
    LabelAutoModelCreate, LabelAutoModelResponse,
    AIAnnotationRequest,
    AnnotationCompletionStatusResponse, LabelTaskBizType,
    LabelTagCreateRequest, LabelTagListResponse,
    LabelTagCreateResponse, LabelTagUpdateRequest, LabelTagUpdateResponse,
)
from app.services.storage.interface import StorageService


class LabelService(ABC):
    """标注服务抽象接口类"""
    def __init__(
        self,
        dataset_mapper: LabelDatasetMapper,
        training_dataset_mapper: TrainingDatasetMapper,
        task_mapper: LabelTaskMapper,
        progress_mapper: LabelProgressMapper,
        auto_model_mapper: LabelAutoModelMapper,
        storage: StorageService
    ) -> None:
        self.dataset_mapper = dataset_mapper
        self.training_dataset_mapper = training_dataset_mapper
        self.task_mapper = task_mapper
        self.progress_mapper = progress_mapper
        self.auto_model_mapper = auto_model_mapper
        self.storage = storage

    # ------------------------------ 标注任务接口 ------------------------------
    @abstractmethod
    async def create_label_task(
        self,
        current_user: JwtUserInfo,
        task_create: LabelTaskCreate,
        file: Optional[UploadFile] = None
    ) -> Dict[str, int]:
        """
        创建标注任务（在线/多人），在创建任务时自动创建数据集
        
        返回: {"id": 任务ID}
        """
        pass

    @abstractmethod
    async def get_label_task(
        self,
        task_id: int
    ) -> LabelTaskDetailResponse:
        """获取标注任务详情（包含数据集信息和进度）"""
        pass

    @abstractmethod
    async def get_label_task_data(
        self,
        task_id: int,
        page: Optional[int] = None,
        size: Optional[int] = None,
        is_annotated: Optional[bool] = None
    ) -> AnnotationDataResponse:
        """
        获取标注任务中的单条数据，返回数据项、总条数和分页信息
        
        Args:
            task_id: 任务ID
            page: 页码（从1开始），用于前端分页显示，表示过滤后数据的页码位置
            size: 每页数量，与page配合使用
            is_annotated: 标注状态过滤（True=已标注，False=未标注，None=不过滤）
        
        Returns:
            AnnotationDataResponse: 包含数据项（包含row_number字段，供前端保存标注时使用）、总条数和分页信息
        """
        pass

    @abstractmethod
    async def list_label_tasks(
        self,
        project_id: int,
        task_type: Optional[str] = None,
        task_name: Optional[str] = None,
        dataset_type: Optional["TrainingTypeCategory"] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        biz_type: Optional[LabelTaskBizType] = LabelTaskBizType.LLM
    ) -> Page[LabelTaskResponse]:
        """获取项目下的标注任务列表"""
        pass

    @abstractmethod
    async def delete_label_task(
        self,
        task_id: int
    ) -> None:
        """删除标注任务（已完成/已发布任务也支持删除）"""
        pass

    @abstractmethod
    async def check_annotation_completion(
        self,
        task_id: int
    ) -> "AnnotationCompletionStatusResponse":
        """
        查询是否完成标注（暂存数=总条数）
        
        Args:
            task_id: 任务ID
        
        Returns:
            AnnotationCompletionStatusResponse: 包含是否完成标注的状态信息
        """
        pass

    @abstractmethod
    async def add_label_tag(
        self,
        task_id: int,
        request: LabelTagCreateRequest
    ) -> LabelTagCreateResponse:
        """新增标注标签（机器学习任务）"""
        pass

    @abstractmethod
    async def update_label_tag(
        self,
        task_id: int,
        class_id: int,
        request: LabelTagUpdateRequest
    ) -> LabelTagUpdateResponse:
        """编辑标注标签（机器学习任务）"""
        pass

    @abstractmethod
    async def list_label_tags(
        self,
        task_id: int
    ) -> LabelTagListResponse:
        """查询标注标签列表（机器学习任务）"""
        pass

    @abstractmethod
    async def delete_label_tag(
        self,
        task_id: int,
        class_id: int
    ) -> None:
        """删除标注标签（机器学习任务）"""
        pass

    # ------------------------------ 标注数据接口 ------------------------------
    @abstractmethod
    async def save_annotations(
        self,
        current_user: JwtUserInfo,
        request: AnnotationSaveRequest
    ) -> AnnotationSaveResponse:
        """保存标注（暂存/最终提交）"""
        pass

    # ------------------------------ 自动标注配置接口 ------------------------------
    @abstractmethod
    async def save_auto_model_config(
        self,
        current_user: JwtUserInfo,
        config: LabelAutoModelCreate
    ) -> LabelAutoModelResponse:
        """保存自动标注配置（创建或更新）"""
        pass

    @abstractmethod
    async def get_auto_model_config(
        self,
        task_id: int
    ) -> Optional[LabelAutoModelResponse]:
        """获取项目的自动标注配置"""
        pass

    # ------------------------------ AI自动标注接口 ------------------------------
    @abstractmethod
    async def ai_annotate_stream(
        self,
        current_user: JwtUserInfo,
        request: AIAnnotationRequest
    ):
        """
        AI自动标注接口（流式输出版本，SSE）
        
        将用户传入的数据发送给模型进行标注，实时流式返回结果。
        是否保存由用户自行调用 save_annotations 接口决定。
        
        Args:
            current_user: 当前用户信息
            request: AI标注请求
                - task_id: 任务ID（获取模型配置）
                - input_data: 需要标注的输入数据
            
        Yields:
            SSE格式的流式数据
            
        Notes:
            - 根据task_id获取label_auto_models配置
            - 根据model_id从inference_service获取模型信息
            - 根据label_datasets.dataset_format确定输入输出格式
            - 支持prompt-response/role-based/prefix-suffix-middle格式
        """
        pass

    # ------------------------------ 复用能力（多人标注发布等） ------------------------------
    @abstractmethod
    async def generate_training_dataset_from_label_dataset(
        self,
        current_user: JwtUserInfo,
        dataset: LabelDataset
    ) -> Optional[int]:
        """
        由标注数据集生成训练数据集新版本（读取标注文件、合并原始数据、创建新版本）。
        不更新 task 或 progress，仅返回新训练数据集 ID，供多人标注发布等场景复用。
        Returns:
            新版本训练数据集 ID，不满足条件时返回 None
        """
        pass

    @abstractmethod
    async def generate_machine_learning_dataset_from_label_dataset(
        self,
        current_user: JwtUserInfo,
        dataset: LabelMachineLearningDataset,
    ) -> Optional[int]:
        """
        由机器学习标注数据集生成注册的机器学习数据集新版本（合并标注、落盘、建库）。
        不更新 task、progress 或 label 侧 submit_dataset_id，仅返回新机器学习数据集 ID，
        供多人标注发布等场景复用。
        """
        pass
