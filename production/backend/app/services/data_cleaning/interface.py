from abc import ABC, abstractmethod
from typing import Optional, Dict, Any

from fastapi_pagination import Page

from app.models.data_cleaning_manager import DataCleaningTask
from app.models.models import JwtUserInfo
from app.repository.data_cleaning_task_mapper import CleaningTaskMapper
from app.repository.data_cleaning_template_mapper import CleaningTemplateMapper
from app.repository.task_execution_mapper import TaskExecutionMapper
from app.repository.training_dataset_mapper import TrainingDatasetMapper
from app.schemas.data_cleaning import (
    CleaningTaskCreate, CleaningTaskResponse,
    CleaningTaskListResponse, CleaningTaskDetailResponse,
    CleaningTemplateCreate, CleaningTemplateUpdate, CleaningTemplateResponse,
    CleaningPreviewResponse, CleaningLogResponse,
    CleaningRunResponse, OperatorCategoryListResponse,
    CleaningComparisonResponse, DatasetFieldsResponse
)
from app.services.storage.interface import StorageService


class CleaningService(ABC):
    """清洗服务抽象接口类"""
    
    def __init__(
        self,
        task_mapper: CleaningTaskMapper,
        template_mapper: CleaningTemplateMapper,
        training_dataset_mapper: TrainingDatasetMapper,
        storage: StorageService,
        task_execution_mapper: TaskExecutionMapper = None
    ) -> None:
        self.task_mapper = task_mapper
        self.template_mapper = template_mapper
        self.training_dataset_mapper = training_dataset_mapper
        self.storage = storage
        self.task_execution_mapper = task_execution_mapper

    # ------------------------------ 数据清洗任务接口 ------------------------------
    @abstractmethod
    async def create_data_cleaning_task(
        self,
        current_user: JwtUserInfo,
        task_create: CleaningTaskCreate
    ) -> CleaningTaskResponse:
        """创建数据清洗任务（输入/输出及override）"""
        pass

    @abstractmethod
    async def update_data_cleaning_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int,
        task_update: CleaningTaskCreate
    ) -> CleaningTaskResponse:
        """更新数据清洗任务，并同步更新执行器任务数据"""
        pass

    @abstractmethod
    async def get_data_cleaning_task(
        self,
        task_id: int
    ) -> CleaningTaskDetailResponse:
        """获取数据清洗任务详情与结果预览（随机50条）"""
        pass

    @abstractmethod
    async def list_data_cleaning_tasks(
        self,
        project_id: int,
        name: Optional[str] = None,
        status: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None
    ) -> Page[CleaningTaskListResponse]:
        """获取项目下的数据清洗任务列表
        
        Args:
            project_id: 项目ID
            name: 任务名称搜索（模糊匹配）
            status: 任务状态筛选
            page: 页码
            size: 每页数量
        """
        pass

    @abstractmethod
    async def delete_data_cleaning_task(
        self,
        task_id: int
    ) -> None:
        """删除数据清洗任务"""
        pass

    @abstractmethod
    async def run_data_cleaning_task(
        self,
        current_user: JwtUserInfo,
        task_id: int
    ) -> CleaningRunResponse:
        """执行数据清洗任务"""
        pass

    @abstractmethod
    async def stop_data_cleaning_task(
        self,
        project_id: int,
        task_id: int
    ) -> None:
        """终止数据清洗任务并删除对应 K8s Job 资源"""
        pass

    @abstractmethod
    async def get_data_cleaning_task_logs(
        self,
        task_id: int
    ) -> CleaningLogResponse:
        """获取数据清洗任务日志（优先归档日志，其次Loki实时日志）"""
        pass

    @abstractmethod
    async def get_data_cleaning_preview(
        self,
        task_id: int,
        sample_count: int = 50
    ) -> CleaningPreviewResponse:
        """获取数据清洗结果预览（随机N条）"""
        pass

    @abstractmethod
    async def get_data_cleaning_comparison(
        self,
        task_id: int,
        sample_count: int = 50,
    ) -> CleaningComparisonResponse:
        """获取清洗前后数据对比
        
        Args:
            task_id: 数据清洗任务ID
            sample_count: 采样数量（默认50，最多200）

        Returns:
            清洗前后对比响应
        """
        pass

    @abstractmethod
    async def download_data_cleaning_result(
        self,
        task_id: int,
        download_type: str
    ) -> bytes:
        """下载数据清洗结果或日志（日志优先归档，其次Loki实时）"""
        pass

    # ------------------------------ 数据清洗模板接口 ------------------------------
    @abstractmethod
    async def create_data_cleaning_template(
        self,
        current_user: JwtUserInfo,
        template_create: CleaningTemplateCreate
    ) -> CleaningTemplateResponse:
        """保存数据清洗模板"""
        pass

    @abstractmethod
    async def get_data_cleaning_template(
        self,
        template_id: int
    ) -> CleaningTemplateResponse:
        """获取数据清洗模板详情"""
        pass

    @abstractmethod
    async def list_data_cleaning_templates(
        self,
        project_id: int,
        page: Optional[int] = None,
        size: Optional[int] = None,
        created_by: Optional[str] = None,
        operator_type: Optional[str] = None
    ) -> Page[CleaningTemplateResponse]:
        """获取数据清洗模板列表
        
        Args:
            project_id: 项目ID
            page: 页码
            size: 每页数量
            created_by: 创建人搜索（模糊匹配）
            operator_type: 算子类型搜索（在steps_json中搜索）
        """
        pass

    @abstractmethod
    async def update_data_cleaning_template(
        self,
        template_id: int,
        template_update: CleaningTemplateUpdate
    ) -> CleaningTemplateResponse:
        """更新数据清洗模板"""
        pass

    @abstractmethod
    async def delete_data_cleaning_template(
        self,
        template_id: int
    ) -> None:
        """删除数据清洗模板"""
        pass

    # ------------------------------ 算子相关接口 ------------------------------
    @abstractmethod
    async def get_operators_by_category(self) -> OperatorCategoryListResponse:
        """获取按分类组织的清洗算子列表"""
        pass

    # ------------------------------ 数据集字段接口 ------------------------------
    @abstractmethod
    async def get_dataset_fields(
        self,
        dataset_id: int
    ) -> DatasetFieldsResponse:
        """根据训练数据集ID获取数据清洗可选字段列表"""
        pass

    # ------------------------------ 内部辅助方法 ------------------------------
    @abstractmethod
    async def _get_juicefs_client(self) -> Any:
        """获取JuiceFS客户端（内部复用）"""
        pass

    @abstractmethod
    async def _generate_data_juicer_config(
        self,
        task: DataCleaningTask
    ) -> Dict[str, Any]:
        """生成data-juicer配置文件"""
        pass

    @abstractmethod
    async def _create_k8s_job(
        self,
        task: DataCleaningTask,
        config: Dict[str, Any]
    ) -> str:
        """创建K8s Job执行清洗任务"""
        pass

    @abstractmethod
    async def generate_training_dataset_on_completion(
        self,
        task_id: int
    ) -> Optional[int]:
        """数据清洗任务完成时生成训练数据集新版本
        
        根据 override 配置决定是覆盖还是创建新版本：
        - override=True: 覆盖模式（暂未实现，会跳过处理）
        - override=False: 创建新版本的数据集
        
        Args:
            task_id: 数据清洗任务ID
            
        Returns:
            新版本的训练数据集ID，如果不满足条件或覆盖模式则返回 None
        """
        pass
