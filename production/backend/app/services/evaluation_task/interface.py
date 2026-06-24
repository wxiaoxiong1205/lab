from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional, Dict, Any, TYPE_CHECKING

from app.repository.task_execution_mapper import TaskExecutionMapper

if TYPE_CHECKING:
    from app.schemas.evaluation_task import ManualEvaluationItemBatchUpdate, ManualEvaluationItemResponse, \
        PageItemResponse

from fastapi_pagination import Page

from app.common.status import TaskStatus
from app.models.evaluation_task_manager import EvaluationTask
from app.models.models import JwtUserInfo
from app.repository.evaluation_task_mapper import (
    EvaluationTaskMapper,
    EvaluationTaskDatasetModelRelationMapper,
    EvaluationReportMapper,
    EvaluationMetricsMapper,
    EvaluationMetricMetadataRelationMapper
)
from app.schemas.evaluation_task import (
    EvaluationTaskCreate, EvaluationTaskSummaryResponse, EvaluationTaskDetailResponse,
    EvaluationReportResponse, TaskLogResponse,
    EvaluationMetricResponse, BasicMetricResponse, CalculationMethod,
    EvaluationReportCreate, EvaluationReportUpdate, EvaluationMetricCreate, EvaluationMetricUpdate, EvaluationMethod,
    EvaluationPromptMetricConfig, EvaluationPromptConfig
)
from app.schemas.inference_result import InferenceResultDatasetResponse
from app.services.common_config.interface import CommonConfigService
from app.services.inference_result.interface import InferenceResultDatasetService
from app.services.project.interface import ProjectService
from app.services.storage.interface import StorageService


class EvaluationTaskService(ABC):
    """评估任务服务抽象接口类"""
    def __init__(self,
                 task_mapper: EvaluationTaskMapper,
                 relation_mapper: EvaluationTaskDatasetModelRelationMapper,
                 report_mapper: EvaluationReportMapper,
                 basic_metric_mapper: EvaluationMetricsMapper,
                 metric_metadata_relation_mapper: EvaluationMetricMetadataRelationMapper,
                 task_execution_mapper: TaskExecutionMapper,
                 common_config_service: CommonConfigService,
                 project_service: ProjectService,
                 storage: StorageService,
                 inference_result_service: InferenceResultDatasetService) -> None:
        self.task_mapper = task_mapper
        self.relation_mapper = relation_mapper
        self.report_mapper = report_mapper
        self.task_execution_mapper = task_execution_mapper
        self.common_config_service = common_config_service
        self.project_service = project_service
        self.storage = storage
        self.inference_result_service = inference_result_service
        self.metric_metadata_relation_mapper = metric_metadata_relation_mapper

    # ------------------------------ 基础验证方法 ------------------------------

    @abstractmethod
    async def validate_task(self, task_id: int, project_id: int) -> EvaluationTask:
        """验证评估任务是否存在且属于指定项目，不存在则抛出404异常"""
        pass

    # ------------------------------ 核心业务接口 ------------------------------

    @abstractmethod
    async def create_evaluation_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task: EvaluationTaskCreate
    ) -> EvaluationTaskDetailResponse:
        """创建评估任务"""
        pass

    @abstractmethod
    async def list_evaluation_tasks(
        self,
        project_id: int,
        name: Optional[str] = None,
        status: Optional[TaskStatus] = None,
        evaluation_type: Optional[str] = None,
        evaluation_method: Optional[str] = None,
        dataset_format: Optional[str] = None,
        dataset_type: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
    ) -> Page[EvaluationTaskSummaryResponse]:
        """获取项目下的评估任务列表（分页）
        
        默认只返回模型评估任务（排除人工评估），如果指定了evaluation_method则按指定方法筛选
        """
        pass

    @abstractmethod
    async def get_evaluation_task(
        self,
        project_id: int,
        task_id: int
    ) -> EvaluationTaskDetailResponse:
        """获取指定评估任务详情"""
        pass

    @abstractmethod
    async def get_evaluation_task_versions(
        self,
        project_id: int,
        task_name: str
    ) -> List[EvaluationTaskSummaryResponse]:
        """根据任务名称获取所有版本列表"""
        pass

    @abstractmethod
    async def clone_evaluation_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> EvaluationTaskDetailResponse:
        """克隆评估任务"""
        pass

    @abstractmethod
    async def delete_evaluation_task(
        self,
        project_id: int,
        task_id: int
    ) -> None:
        """删除评估任务"""
        pass

    @abstractmethod
    async def get_evaluation_results(
        self,
        project_id: int,
        task_id: int,
        dataset_id: int,
        page: int = 1,
        size: int = 10,
        evaluation_method: Optional[str] = "referee"
    ) -> "PageItemResponse":
        """获取评估结果明细（从JuiceFS读取，分页）
        
        Args:
            project_id: 项目ID
            task_id: 评估任务ID
            dataset_id: 推理结果集ID
            page: 页码
            size: 每页数量
            evaluation_method: 评估方法筛选（referee/basic_metric），默认为referee
        """
        pass

    @abstractmethod
    async def download_evaluation_results(
        self,
        project_id: int,
        task_id: int,
        format: str = "jsonl",
        dataset_id: Optional[int] = None,
        evaluation_method: Optional[str] = "referee"
    ):
        """下载评估结果（从JuiceFS读取，支持xlsx/csv/json/jsonl格式）
        
        Args:
            project_id: 项目ID
            task_id: 评估任务ID
            format: 下载格式（xlsx/csv/json/jsonl）
            dataset_id: 数据集ID筛选
            evaluation_method: 评估方法筛选（referee/basic_metric），默认为referee
        """
        pass

    @abstractmethod
    async def get_evaluation_report(
        self,
        project_id: int,
        task_id: int,
        evaluation_method: Optional[EvaluationMethod] = None,
        calculation_method: Optional[CalculationMethod] = None,
        model_id: Optional[int] = None
    ) -> Optional[EvaluationReportResponse]:
        """获取评估报告（汇总统计信息）
        
        Args:
            project_id: 项目ID
            task_id: 评估任务ID
            evaluation_method: 评估方法筛选（referee/basic_metric），如果提供则只返回该评估方法的报告
            calculation_method: 计算方式筛选（average/max/min），如果提供则只返回该计算方式的结果
            model_id: 模型ID筛选（对比评估时使用）
        
        Returns:
            EvaluationReportResponse: 评估报告响应，如果不存在则返回 None
        """
        pass

    @abstractmethod
    async def download_evaluation_report_docx(
        self,
        project_id: int,
        task_id: int,
        evaluation_method: Optional[EvaluationMethod] = None,
        calculation_method: CalculationMethod = CalculationMethod.AVERAGE
    ):
        """下载评估报告DOCX文件
        
        Args:
            project_id: 项目ID
            task_id: 评估任务ID
            evaluation_method: 评估方法筛选（referee/basic_metric），如果提供则只导出该评估方法的报告。如果不提供且任务使用了all方法，则导出所有评估方法的结果。
            calculation_method: 计算方式（average/max/min），默认使用average
        
        Returns:
            StreamingResponse: DOCX文件流
        """
        pass

    @abstractmethod
    async def get_task_logs(
        self,
        project_id: int,
        task_id: int,
        end_time: datetime,
        days: Optional[int] = 30,
    ) -> TaskLogResponse:
        """获取任务日志（分页）"""
        pass

    @abstractmethod
    async def download_task_logs(
        self,
        project_id: int,
        task_id: int
    ):
        """下载任务日志文件
        
        Args:
            project_id: 项目ID
            task_id: 评估任务ID
            
        Returns:
            StreamingResponse: 日志文件流
        """
        pass

    @abstractmethod
    async def stop_evaluation_task(
        self,
        project_id: int,
        task_id: int
    ) -> None:
        """停止评估任务
        
        Args:
            project_id: 项目ID
            task_id: 评估任务ID
            
        功能：
            1. 更新任务状态为终止
            2. 在K8s上删除对应的Jobs
        """
        pass

    @abstractmethod
    async def get_basic_metrics(
        self
    ) -> List[BasicMetricResponse]:
        """获取基础评估指标列表（只读）"""
        pass

    @abstractmethod
    async def get_evaluation_metrics(
        self,
        project_id: int,
        name: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
    ) -> Page[EvaluationMetricResponse]:
        """获取裁判员评估系统指标列表
        :param project_id:
        :param name:
        :param page:
        :param size:
        """
        pass

    @abstractmethod
    async def get_evaluation_metric(
        self,
        project_id: int,
        metric_id: int
    ) -> EvaluationMetricResponse:
        """获取裁判员评估系统指标详情"""
        pass

    @abstractmethod
    async def create_evaluation_metric(
        self,
        project_id: int,
        current_user: JwtUserInfo,
        metric: EvaluationMetricCreate
    ) -> EvaluationMetricResponse:
        """创建裁判员评估系统指标"""
        pass

    @abstractmethod
    async def update_evaluation_metric(
        self,
        project_id: int,
        metric_id: int,
        metric: EvaluationMetricUpdate
    ) -> EvaluationMetricResponse:
        """更新裁判员评估系统指标"""
        pass

    @abstractmethod
    async def delete_evaluation_metric(
        self,
        project_id: int,
        metric_id: int
    ) -> None:
        """删除裁判员评估系统指标"""
        pass

    @abstractmethod
    async def update_task_status(
        self,
        task_id: int,
        status: TaskStatus
    ) -> None:
        """更新任务状态"""
        pass

    @abstractmethod
    async def create_or_update_evaluation_report(
        self,
        report: EvaluationReportCreate
    ) -> None:
        """创建或更新评估报告（跨服务调用）
        
        如果报告已存在（根据evaluation_task_id和evaluated_model_id），则更新；
        如果不存在，则创建。
        """
        pass

    @abstractmethod
    async def update_evaluation_report(
        self,
        evaluation_task_id: int,
        evaluated_model_id: int,
        evaluation_method: EvaluationMethod,
        report_update: EvaluationReportUpdate
    ) -> None:
        """更新评估报告（跨服务调用）
        
        仅更新metric_summary和comparison_data字段。
        
        Args:
            evaluation_task_id: 评估任务ID
            evaluated_model_id: 待评估模型/服务ID
            evaluation_method: 评估方法（用于区分不同类型的报告）
            report_update: 更新数据
        """
        pass

    @abstractmethod
    async def render_evaluation_template(
        self,
        metric: EvaluationMetricCreate,
    ) -> str:
        pass

    @abstractmethod
    async def get_inference_result_datasets_by_task_id(
        self,
        task_id: int
    ) -> List[InferenceResultDatasetResponse]:
        """根据评估任务ID获取所关联的推理结果集列表"""
        pass

    @abstractmethod
    async def upload_stopwords_file(
        self,
        project_id: int,
        file: bytes,
        filename: str
    ) -> str:
        """上传停用词文件到JuiceFS
        
        Args:
            project_id: 项目ID
            file: 文件内容（字节）
            filename: 文件名
        
        Returns:
            str: JuiceFS存储路径（URL）
        """
        pass

    async def append_evaluation_metrics_score(self, evaluation_prompt_config: EvaluationPromptConfig):
        pass

    async def append_evaluation_metric_score(self, evaluation_prompt_metric_config: EvaluationPromptMetricConfig):
        pass

    # ------------------------------ 人工评估相关接口 ------------------------------

    @abstractmethod
    async def get_manual_evaluation_items(
        self,
        project_id: int,
        task_id: int,
        status: Optional[str] = "all",
        page: int = 1,
        size: int = 10
    ) -> "ManualEvaluationItemPageResponse":
        """分页查询人工评估项列表
        
        Args:
            project_id: 项目ID
            task_id: 任务ID
            status: 状态筛选（枚举值或"all"，默认all）
                - "未评估": 未评估
                - "已完成": 已完成
                - "all": 返回所有状态的项
            page: 页码（默认1）
            size: 每页数量（默认10，最大10）
        
        Returns:
            ManualEvaluationItemPageResponse: 分页的评估项列表（包含自定义字段evalution_num）
        """
        pass

    @abstractmethod
    async def get_first_unannotated_item(
        self,
        project_id: int,
        task_id: int
    ) -> Optional["ManualEvaluationItemResponse"]:
        """获取第一个未评估的项
        
        Args:
            project_id: 项目ID
            task_id: 任务ID
        
        Returns:
            Optional[ManualEvaluationItemResponse]: 第一个未评估的项，如果全部已评估则返回None
        """
        pass

    @abstractmethod
    async def batch_update_manual_evaluation_items(
        self,
        project_id: int,
        task_id: int,
        batch_update: "ManualEvaluationItemBatchUpdate",
        current_user: JwtUserInfo
    ) -> None:
        """批量更新人工评估项评分
        
        Args:
            project_id: 项目ID
            task_id: 任务ID
            batch_update: 批量更新请求
            current_user: 当前用户信息
        
        功能：
            1. 读取JSONL文件
            2. 更新指定行的annotation字段，状态自动设置为"标注完成"
            3. 记录标注人和标注时间
            4. 更新任务进度（completed_items/total_items）
            5. 如果任务状态为"已创建"（created），自动更新为"标注中"（annotating）
            6. 如果所有项都已完成，仅更新进度；报告生成由提交接口触发
        """
        pass

    @abstractmethod
    async def submit_manual_evaluation_task(
        self,
        project_id: int,
        task_id: int,
        current_user: JwtUserInfo
    ) -> None:
        """提交人工评估任务，触发标注结果写入JSONL
        
        Args:
            project_id: 项目ID
            task_id: 任务ID
            current_user: 当前用户信息
        """
        pass

    @abstractmethod
    async def get_manual_evaluation_annotation_stats(
        self,
        project_id: int,
        task_id: int
    ) -> "ManualEvaluationAnnotationStatsResponse":
        """获取人工评估标注统计信息
        
        Args:
            project_id: 项目ID
            task_id: 任务ID
        
        Returns:
            ManualEvaluationAnnotationStatsResponse: 标注统计信息，包含总任务数、标注完成数、标注中数、未标注数
        """
        pass

    @abstractmethod
    async def download_manual_evaluation_results(
        self,
        project_id: int,
        task_id: int,
        format: str = "jsonl"
    ):
        """下载人工评估结果（从 JFS 读取 JSONL 文件）
        
        Args:
            project_id: 项目ID
            task_id: 任务ID
            format: 下载格式（目前仅支持 jsonl）
        """
        pass