from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi_pagination import Page

from app.models.benchmark_task_manager import BenchmarkTask
from app.models.models import JwtUserInfo
from app.repository.benchmark_task_mapper import (
    BenchmarkTaskMapper,
    BenchmarkTaskModelRelationMapper,
    BenchmarkTaskDatasetRelationMapper,
    BenchmarkDatasetMapper,
    BenchmarkResultMapper,
    BenchmarkLeaderboardMapper
)
from app.schemas.benchmark_task import (
    BenchmarkTaskCreate,
    BenchmarkTaskUpdate,
    BenchmarkTaskSummaryResponse,
    BenchmarkTaskDetailResponse,
    BenchmarkDatasetResponse,
    BenchmarkLeaderboardItemResponse,
    BenchmarkTaskCompareRequest,
    BenchmarkTaskCompareResponse,
    BenchmarkTaskLogResponse,
    BenchmarkTaskReportResponse,
)
from app.services.project.interface import ProjectService
from app.services.model.interface import ModelService
from app.services.inference_service.interface import InferenceServiceService


class BenchmarkTaskService(ABC):
    """基准评估任务服务抽象接口类"""
    
    def __init__(
        self,
        task_mapper: BenchmarkTaskMapper,
        model_relation_mapper: BenchmarkTaskModelRelationMapper,
        dataset_relation_mapper: BenchmarkTaskDatasetRelationMapper,
        dataset_mapper: BenchmarkDatasetMapper,
        result_mapper: BenchmarkResultMapper,
        leaderboard_mapper: BenchmarkLeaderboardMapper,
        project_service: ProjectService,
        model_service: ModelService,
        inference_service_service: InferenceServiceService
    ) -> None:
        self.task_mapper = task_mapper
        self.model_relation_mapper = model_relation_mapper
        self.dataset_relation_mapper = dataset_relation_mapper
        self.dataset_mapper = dataset_mapper
        self.result_mapper = result_mapper
        self.leaderboard_mapper = leaderboard_mapper
        self.project_service = project_service
        self.model_service = model_service
        self.inference_service_service = inference_service_service

    # ------------------------------ 基础验证方法 ------------------------------

    @abstractmethod
    async def validate_task(self, task_id: int, project_id: int) -> BenchmarkTask:
        """验证基准评估任务是否存在且属于指定项目，不存在则抛出404异常"""
        pass

    # ------------------------------ 数据集管理 ------------------------------

    @abstractmethod
    async def list_datasets(
        self,
        category: Optional[str] = None,
        model_type: Optional[str] = None,
        tenant_id: Optional[str] = None
    ) -> List[BenchmarkDatasetResponse]:
        """获取基准评估数据集列表（按分类、模型类型组织）；支持全局 + 当前租户数据集"""
        pass

    # ------------------------------ 任务管理 ------------------------------

    @abstractmethod
    async def create_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task: BenchmarkTaskCreate
    ) -> BenchmarkTaskDetailResponse:
        """创建基准评估任务"""
        pass

    @abstractmethod
    async def list_tasks(
        self,
        project_id: int,
        name: Optional[str] = None,
        status: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
    ) -> Page[BenchmarkTaskSummaryResponse]:
        """获取项目下的基准评估任务列表（分页）"""
        pass

    @abstractmethod
    async def get_task(
        self,
        project_id: int,
        task_id: int
    ) -> BenchmarkTaskDetailResponse:
        """获取指定基准评估任务详情"""
        pass

    @abstractmethod
    async def get_benchmark_task_dataset_totals(
            self, task_id: int, tenant_id: Optional[str] = None
    ) -> Dict[str, int]:
        pass


    @abstractmethod
    async def update_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int,
        task: BenchmarkTaskUpdate
    ) -> BenchmarkTaskDetailResponse:
        """编辑任务配置"""
        pass

    @abstractmethod
    async def delete_task(
        self,
        project_id: int,
        task_id: int
    ) -> None:
        """删除任务（运行中需先终止）"""
        pass

    @abstractmethod
    async def start_task(
        self,
        project_id: int,
        task_id: int
    ) -> None:
        """启动任务"""
        pass

    @abstractmethod
    async def cancel_task(
        self,
        project_id: int,
        task_id: int
    ) -> None:
        """终止任务"""
        pass

    @abstractmethod
    async def resubmit_task(
        self,
        project_id: int,
        task_id: int
    ) -> None:
        """重新提交任务（失败/已取消状态）"""
        pass

    @abstractmethod
    async def clone_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> BenchmarkTaskDetailResponse:
        """克隆任务"""
        pass

    @abstractmethod
    async def compare_tasks(
        self,
        project_id: int,
        request: BenchmarkTaskCompareRequest
    ) -> BenchmarkTaskCompareResponse:
        """对比评估（传入任务ID列表，2-5个，返回对比数据）"""
        pass

    # ------------------------------ 评估报告和日志 ------------------------------

    @abstractmethod
    async def get_task_report(
        self,
        project_id: int,
        task_id: int
    ) -> BenchmarkTaskReportResponse:
        """获取评估报告"""
        pass

    @abstractmethod
    async def download_benchmark_report_docx(
        self,
        project_id: int,
        task_id: int
    ):
        """下载基准评估报告 DOCX 文件。返回 StreamingResponse。"""
        pass

    @abstractmethod
    async def download_benchmark_compare_report_docx(
        self,
        project_id: int,
        request: BenchmarkTaskCompareRequest
    ):
        """下载对比评估报告 DOCX 文件。请求体与 compare_tasks 一致（task_ids），返回 StreamingResponse。"""
        pass

    @abstractmethod
    async def download_task_result_file(
        self,
        project_id: int,
        task_id: int,
        dataset_code: str,
        model_id: Optional[int] = None,
    ) -> bytes:
        """下载基准评估结果 JSON 文件（JFS：result_path/predictions/{model_name}/{dataset}.json）"""
        pass

    @abstractmethod
    async def get_task_logs(
        self,
        project_id: int,
        task_id: int,
    ) -> BenchmarkTaskLogResponse:
        """获取任务日志（优先归档日志，其次 Loki 实时日志）"""
        pass

    @abstractmethod
    async def download_task_log(self, project_id: int, task_id: int) -> bytes:
        """下载任务日志文件（优先归档日志，其次 Loki 实时日志）"""
        pass

    # ------------------------------ 榜单管理 ------------------------------

    @abstractmethod
    async def get_leaderboard(
        self,
        project_id: int,
        sort_by: str = "average_score",
        sort_order: str = "desc",
        page: Optional[int] = None,
        size: Optional[int] = None,
    ) -> Page[BenchmarkLeaderboardItemResponse]:
        """获取榜单列表（分页、支持按平均分或指定数据集得分排序）"""
        pass

    @abstractmethod
    async def get_radar_chart(
        self,
        project_id: int,
        model_ids: List[int]
    ) -> BenchmarkTaskReportResponse:
        """获取雷达图数据
        
        Args:
            project_id: 项目ID
            model_ids: 模型ID列表（1-10个）
        """
        pass
