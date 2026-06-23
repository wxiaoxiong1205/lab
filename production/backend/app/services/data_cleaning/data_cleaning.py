import asyncio
import json
import os
import random
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple

from fastapi import HTTPException
from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import paginate
from sqlalchemy import select, update, desc

from app.common.status import TaskStatus
from app.common.task_execution import (
    TaskExecutionBusinessType,
    TaskExecutionExecutor,
    TaskExecutionMethod,
    TaskExecutionStatus,
)
from app.core.logging import logger
from app.models.data_cleaning_manager import DataCleaningTask, DataCleaningTemplate
from app.models.models import JwtUserInfo, TaskExecution
from app.models.training_dataset_manager import TrainingDataset
from app.repository.data_cleaning_task_mapper import CleaningTaskMapper
from app.repository.data_cleaning_template_mapper import CleaningTemplateMapper
from app.repository.training_dataset_mapper import TrainingDatasetMapper
from app.schemas.data_cleaning import (
    CleaningTaskCreate, CleaningTaskResponse,
    CleaningTaskListResponse, CleaningTaskDetailResponse,
    CleaningTemplateCreate, CleaningTemplateUpdate, CleaningTemplateResponse,
    CleaningPreviewResponse, CleaningLogResponse,
    CleaningRunResponse, OperatorInfo,
    OperatorCategoryInfo, OperatorCategoryListResponse,
    CleaningDownloadType, CleaningDataSource,
    CleaningOperatorCategory, get_category_name, get_category_order,
    CleaningComparisonResponse, DataComparisonItem, DatasetFieldsResponse
)
from app.services.storage.interface import StorageService
from app.utils import app_runtime_context
from app.utils.name_validator import validate_name_format
from app.utils.storage_enum import StoragePath
from app.utils.validators import (
    validate_project_exists,
    check_dataset_in_use,
    DatasetTaskCreationKind,
)
from .interface import CleaningService
from ...repository.task_execution_mapper import TaskExecutionMapper


class DatasetResult:
    """数据集创建结果，用于避免 ORM 对象的 session 问题"""
    __slots__ = ('id', 'version')
    
    def __init__(self, id: int, version: str):
        self.id = id
        self.version = version


async def _create_fresh_session():
    """
    创建一个全新的数据库会话，用于后台任务中的数据库操作。
    使用共享的 Database 实例（通过 AutoContainer 单例），避免每次创建新引擎。
    调用者需要负责在使用完毕后关闭 session。
    
    Returns:
        AsyncSession: 新创建的数据库会话
    """
    from app.core.depend_manager import AutoContainer
    
    # 使用 AutoContainer 中的共享 Database 单例
    db = AutoContainer.db()
    if hasattr(db, '_session_factory') and not db._is_dm:
        return db._session_factory()
    else:
        from app.database.base import AsyncCompatibleSession
        from sqlalchemy.orm import Session as SyncSession
        sync_sess = SyncSession(db._sync_engine)
        return AsyncCompatibleSession(sync_sess)


async def _close_session_safely(session):
    """安全关闭数据库会话"""
    if session:
        try:
            await session.close()
        except Exception:
            pass


def _load_operators_from_config() -> List[OperatorInfo]:
    """
    从配置文件加载算子定义
    
    配置文件路径优先级：
    1. 环境变量 DATA_CLEANING_OPERATORS_CONFIG_PATH（支持 Docker 挂载）
    2. 默认路径：app/config/data_cleaning_operators.json
    
    配置文件是必需的，如果文件不存在或加载失败，将抛出异常。
    
    支持 Docker 挂载示例：
    docker run -v /host/config:/app/config -e DATA_CLEANING_OPERATORS_CONFIG_PATH=/app/config/data_cleaning_operators.json ...
    
    Returns:
        List[OperatorInfo]: 算子信息列表
        
    Raises:
        FileNotFoundError: 配置文件不存在
        json.JSONDecodeError: JSON 解析失败
        Exception: 其他加载错误
    """
    # 优先级1：环境变量指定的路径（支持 Docker 挂载）
    config_path_env = os.getenv("DATA_CLEANING_OPERATORS_CONFIG_PATH")
    if config_path_env:
        config_file = Path(config_path_env)
        logger.info(f"使用环境变量指定的配置文件路径: {config_file}")
    else:
        # 优先级2：默认路径
        # __file__ 是 app/services/data_cleaning/data_cleaning.py
        # 需要向上三级到 app/ 目录，然后进入 config/ 目录
        config_file = Path(__file__).parent.parent.parent / "config" / "data_cleaning_operators.json"
        logger.info(f"使用默认配置文件路径: {config_file}")
    
    if not config_file.exists():
        error_msg = f"算子配置文件不存在: {config_file}，请确保配置文件存在"
        logger.error(error_msg)
        raise FileNotFoundError(error_msg)
    
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            operators_data = json.load(f)
    except json.JSONDecodeError as e:
        error_msg = f"解析算子配置文件失败: {config_file}, 错误: {e}"
        logger.error(error_msg)
        raise
    except Exception as e:
        error_msg = f"加载算子配置文件失败: {config_file}, 错误: {e}"
        logger.error(error_msg)
        raise RuntimeError(error_msg) from e
    
    # 将JSON数据转换为OperatorInfo对象
    operators = []
    category_map = {
        "format_cleaning": CleaningOperatorCategory.FORMAT_CLEANING.value,
        "llm_data_cleaning": CleaningOperatorCategory.LLM_DATA_CLEANING.value,
        "deduplication": CleaningOperatorCategory.DEDUPLICATION.value,
        "sensitive_data_cleaning": CleaningOperatorCategory.SENSITIVE_DATA_CLEANING.value,
    }
    
    for op_data in operators_data:
        category = category_map.get(op_data.get("category"), op_data.get("category"))
        operator = OperatorInfo(
            type=op_data.get("type"),
            name=op_data.get("name"),
            category=category,
            description=op_data.get("description", ""),
            params_schema=op_data.get("params_schema", {})
        )
        operators.append(operator)
    
    logger.info(f"成功从配置文件加载 {len(operators)} 个算子定义")
    return operators


# 清洗算子定义（从配置文件加载，使用 data-juicer v1.4.4 的实际算子名称）
DATA_JUICER_OPERATORS = _load_operators_from_config()


def _normalize_token_num_filter_params(step: Dict[str, Any]) -> None:
    """
    内置模板与部分前端使用 min_tokens/max_tokens，算子 schema 与 data-juicer 使用 min_num/max_num。
    在校验前将别名写入规范字段，并去掉别名，避免落库后执行侧参数不一致。
    """
    if step.get("operator_type") != "token_num_filter":
        return
    params = step.get("params")
    if params is None:
        step["params"] = {}
        params = step["params"]
    if not isinstance(params, dict):
        return
    if "min_num" not in params and "min_tokens" in params:
        params["min_num"] = params["min_tokens"]
    if "max_num" not in params and "max_tokens" in params:
        params["max_num"] = params["max_tokens"]
    params.pop("min_tokens", None)
    params.pop("max_tokens", None)


def _validate_operator_params(steps: List[Dict[str, Any]]) -> None:
    """
    验证算子配置中的必填参数
    
    重要说明：
    - 默认值（default）仅用于前端界面显示建议值，不影响业务验证
    - 如果参数标记为 required: true，无论是否有默认值，都必须由用户在 params 中明确提供
    - 用户可以选择使用默认值、修改默认值，或删除默认值后重新输入
    
    Args:
        steps: 算子配置列表，每个元素包含 operator_type 和 params
        
    Raises:
        HTTPException: 如果必填参数未提供或为空
    """
    operator_map = {op.type: op for op in DATA_JUICER_OPERATORS}
    
    for step in steps:
        _normalize_token_num_filter_params(step)
        operator_type = step.get("operator_type")
        operator_params = step.get("params") or {}
        
        # 查找算子定义
        operator_info = operator_map.get(operator_type)
        if not operator_info:
            raise HTTPException(status_code=400, detail=f"未知的算子类型: {operator_type}")
        
        # 检查必填参数
        params_schema = operator_info.params_schema or {}
        for param_name, param_config in params_schema.items():
            # 只检查标记为 required: true 的参数
            # 注意：即使参数有默认值，如果 required: true，也必须明确提供
            if param_config.get("required", False):
                # 检查参数是否在 params 中明确提供（不依赖默认值）
                if param_name not in operator_params:
                    operator_name = operator_info.name
                    param_description = param_config.get("description", param_name)
                    raise HTTPException(
                        status_code=400,
                        detail=f"算子 '{operator_name}' 的必填参数 '{param_description}' ({param_name}) 未提供"
                    )
                
                # 获取参数值（必须由用户提供，不能依赖默认值）
                param_value = operator_params[param_name]
                
                # 检查参数值是否为 None
                if param_value is None:
                    operator_name = operator_info.name
                    param_description = param_config.get("description", param_name)
                    raise HTTPException(
                        status_code=400,
                        detail=f"算子 '{operator_name}' 的必填参数 '{param_description}' ({param_name}) 不能为空"
                    )
                
                # 对于列表类型，检查是否为空列表
                if param_config.get("type") == "list" and isinstance(param_value, list):
                    if len(param_value) == 0:
                        operator_name = operator_info.name
                        param_description = param_config.get("description", param_name)
                        raise HTTPException(
                            status_code=400,
                            detail=f"算子 '{operator_name}' 的必填参数 '{param_description}' ({param_name}) 不能为空列表"
                        )
                
                # 对于字符串类型，检查是否为空字符串
                if param_config.get("type") == "string" and isinstance(param_value, str):
                    if len(param_value.strip()) == 0:
                        operator_name = operator_info.name
                        param_description = param_config.get("description", param_name)
                        raise HTTPException(
                            status_code=400,
                            detail=f"算子 '{operator_name}' 的必填参数 '{param_description}' ({param_name}) 不能为空字符串"
                        )
        
        # 特殊验证：min/max 范围检查（normalize 后应为 min_num/max_num）
        if operator_type == "token_num_filter":
            min_num = operator_params.get("min_num")
            max_num = operator_params.get("max_num")
            if min_num is not None and max_num is not None:
                if min_num > max_num:
                    raise HTTPException(
                        status_code=400,
                        detail=f"算子 '长度异常文本过滤器' 的参数错误：最小 Token 数 ({min_num}) 不能大于最大 Token 数 ({max_num})"
                    )


class DefaultCleaningService(CleaningService):
    """清洗服务实现类"""
    
    def __init__(
        self,
        task_mapper: CleaningTaskMapper,
        template_mapper: CleaningTemplateMapper,
        training_dataset_mapper: TrainingDatasetMapper,
        storage: StorageService,
        task_execution_mapper: TaskExecutionMapper = None
    ) -> None:
        super().__init__(
            task_mapper,
            template_mapper,
            training_dataset_mapper,
            storage,
            task_execution_mapper,
        )

    # ------------------------------ 内部辅助方法 ------------------------------
    def _format_file_size(self, size_mb: Optional[float]) -> str:
        """格式化文件大小（MB转换为可读格式：B/KB/MB/GB/TB）"""
        if size_mb is None or size_mb == 0:
            return "0 B"
        
        # 将MB转换为字节
        size_bytes = size_mb * 1024 * 1024
        
        units = ['B', 'KB', 'MB', 'GB', 'TB']
        unit_index = 0
        size = float(size_bytes)
        
        while size >= 1024 and unit_index < len(units) - 1:
            size /= 1024
            unit_index += 1
        
        if size >= 100:
            return f"{size:.0f} {units[unit_index]}"
        elif size >= 10:
            return f"{size:.1f} {units[unit_index]}"
        else:
            return f"{size:.2f} {units[unit_index]}"
    
    def _format_dataset_name(self, dataset) -> str:
        """格式化数据集名称（格式：数据集用途/数据集名称-版本号）"""
        from app.schemas.training_dataset import DatasetUsage
        
        # 获取数据集用途描述
        usage_desc = ""
        if dataset.usage:
            try:
                usage_desc = DatasetUsage(dataset.usage).description
            except ValueError:
                usage_desc = dataset.usage
        
        # 格式化名称
        name_version = f"{dataset.name}-{dataset.version}" if dataset.version else dataset.name
        
        if usage_desc:
            return f"{usage_desc}/{name_version}"
        return name_version
    
    async def _get_juicefs_client(self) -> Any:
        """获取JuiceFS客户端（通过注入的StorageService）"""
        from app.utils import app_runtime_context
        tenant_id = app_runtime_context.get_tenant_id()
        return await self.storage.JUICEFS_CLIENT(tenant_id)

    def _generate_dataset_path(self, namespace: str, task_name: str, file_extension: str = 'jsonl', module_prefix: str = 'data_cleaning', task_id: int = None) -> str:
        """生成数据集在JuiceFS中的存储路径
        
        Args:
            namespace: 命名空间
            task_name: 任务名称
            file_extension: 文件扩展名
            module_prefix: 模块前缀，用于区分不同模块的数据集（如 'data_cleaning' 表示数据清洗数据集）
            task_id: 任务ID，用于确保路径唯一性（作为路径的一部分，而不是文件名的一部分）
        """
        base_path = StoragePath.REGISTERED_DATA_CLEANING_DATASETS.format_storage_path(namespace=namespace)
        filename = f"{module_prefix}_{task_name}.{file_extension}"
        if task_id:
            # ID作为路径的一部分：/{namespace}/data_cleaning/datasets/{task_id}/data_cleaning_{task_name}.jsonl
            return f"{base_path}{task_id}/{filename}"
        else:
            return f"{base_path}{filename}"

    def _generate_output_path(self, namespace: str, task_name: str) -> str:
        """生成清洗结果输出路径"""
        base_path = StoragePath.REGISTERED_DATA_CLEANING_DATASETS.format_storage_path(namespace=namespace)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"data_cleaning_{task_name}_{timestamp}.jsonl"
        return f"{base_path}{filename}"

    def _generate_log_path(self, namespace: str, task_name: str) -> str:
        """生成清洗日志路径"""
        base_path = StoragePath.REGISTERED_DATA_CLEANING_DATASETS.format_storage_path(namespace=namespace)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"data_cleaning_{task_name}_{timestamp}.log"
        return f"{base_path}logs/{filename}"

    async def _generate_data_juicer_config(
        self,
        task: DataCleaningTask
    ) -> Dict[str, Any]:
        """生成data-juicer配置文件"""
        # steps_snapshot 统一为数组格式：[{"operator_type": "xxx", ...}, ...]
        operators = task.steps_snapshot or []
        
        # 获取选择的字段，如果未选择则使用默认字段
        text_keys = task.selected_fields if task.selected_fields else [
            "text", "system", "prompt", "response", "instruction", "output", "input", "chosen", "rejected"
        ]
        
        # 构建data-juicer配置
        config = {
            "project_name": f"data_cleaning_task_{task.id}",
            "dataset_path": task.output_path,
            "export_path": task.output_path,
            "np": 1,  # 进程数
            "text_keys": text_keys,  # 使用选择的字段或默认字段
            "process": []
        }
        
        # 添加算子配置
        for op in operators:
            if not op.get("enabled", True):
                continue
            
            op_config = {
                op.get("operator_type"): op.get("params", {})
            }
            config["process"].append(op_config)
        
        return config

    async def _create_k8s_job(
        self,
        task: DataCleaningTask,
        config: Dict[str, Any]
    ) -> str:
        """创建K8s Job执行清洗任务
        
        Returns:
            K8s Job名称
        """
        # TODO: 实现K8s Job创建逻辑
        # 这里需要与K8s服务集成，创建data-juicer容器任务
        job_name = f"data_cleaning-job-{task.id}-{uuid.uuid4().hex[:8]}"
        
        logger.info(f"创建清洗任务K8s Job: {job_name}, task_id={task.id}")
        
        # 实际实现需要：
        # 1. 将配置文件写入存储
        # 2. 创建K8s Job，挂载存储和配置
        # 3. 设置data-juicer镜像和启动命令
        # 4. 返回Job名称
        
        return job_name

    # ------------------------------ 数据清洗任务接口实现 ------------------------------
    async def run_create_data_cleaning_task_post_process(
        self,
        task_id: int,
        namespace: str,
        tenant_id: str
    ) -> Optional[str]:
        """提交清洗任务到 Celery 并回写 celery_task_id"""
        from app.tasks.data_cleaning_tasks import create_data_cleaning_task_async

        celery_result = create_data_cleaning_task_async.apply_async(
            args=[task_id, namespace, tenant_id],
            countdown=1
        )
        if not celery_result.id:
            raise ValueError("Celery任务ID为空，任务可能未成功提交")

        task = await self.task_mapper.query_one(
            select(DataCleaningTask).filter(DataCleaningTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"清洗任务不存在: {task_id}")

        task.celery_task_id = celery_result.id
        await self.task_mapper.commit()
        logger.info(f"清洗任务已提交到 Celery 队列: task_id={task_id}, celery_task_id={celery_result.id}")
        return celery_result.id

    async def create_data_cleaning_task(
        self,
        current_user: JwtUserInfo,
        task_create: CleaningTaskCreate
    ) -> CleaningTaskResponse:
        """创建清洗任务"""
        session = await self.task_mapper.get_session()
        
        # 验证项目存在
        await validate_project_exists(session, task_create.project_id)
        
        # 验证任务名称格式
        try:
            validate_name_format(task_create.name, "清洗任务名称")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # 检查同一项目下是否已存在同名的清洗任务
        existing_tasks = await self.task_mapper.query(
            select(DataCleaningTask).filter(
                DataCleaningTask.project_id == task_create.project_id,
                DataCleaningTask.name == task_create.name
            )
        )
        if existing_tasks:
            raise HTTPException(
                status_code=400,
                detail=f"项目中已存在同名的清洗任务: {task_create.name}"
            )
        
        # 根据数据来源处理
        input_dataset = None
        total_samples = None
        total_characters = None
        file_size = None
        dataset_path = None
        
        if task_create.source == CleaningDataSource.EXISTED_DATASET:
            # 从已有数据集创建
            if not task_create.input_dataset_id:
                raise HTTPException(status_code=400, detail="从已有数据集创建时，必须指定输入数据集ID")
            
            # 验证输入数据集存在
            input_dataset = await self.training_dataset_mapper.query_one(
                select(TrainingDataset).filter(
                    TrainingDataset.id == task_create.input_dataset_id
                )
            )
            
            if not input_dataset:
                raise HTTPException(status_code=404, detail=f"输入数据集不存在: {task_create.input_dataset_id}")
            
            # 验证项目匹配
            if input_dataset.project_id != task_create.project_id:
                raise HTTPException(status_code=400, detail="输入数据集不属于当前项目")
            
            # 创建清洗任务：仅检查是否被进行中的标注任务占用
            await check_dataset_in_use(
                session,
                input_dataset.name,
                task_create.project_id,
                input_dataset.version,
                creating=DatasetTaskCreationKind.CLEANING,
            )
            
            # 获取JuiceFS客户端
            jfs = await self._get_juicefs_client()
            if not jfs.exists(input_dataset.dataset_path):
                raise HTTPException(
                    status_code=404,
                    detail=f"训练数据集文件不存在: {input_dataset.dataset_path}"
                )
            
            # 使用训练数据集的统计信息
            total_samples = input_dataset.total_samples
            total_characters = input_dataset.total_characters
            file_size = input_dataset.file_size if input_dataset.file_size else None
            
            # 校验数据集是否为空
            if not total_samples or total_samples == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"数据集 '{input_dataset.name}' (版本: {input_dataset.version}) 为空，无法创建清洗任务"
                )
        
        elif task_create.source == CleaningDataSource.UPLOAD:
            # 本地上传（暂不支持）
            raise HTTPException(status_code=400, detail="暂不支持本地上传功能")
        else:
            raise HTTPException(status_code=400, detail=f"不支持的数据来源: {task_create.source}")
        
        # 处理算子配置（统一为数组格式，与模板保持一致）
        steps_snapshot = None
        if task_create.steps:
            steps_snapshot = [step.model_dump() for step in task_create.steps]
        
        # 验证算子配置
        if not steps_snapshot or len(steps_snapshot) == 0:
            raise HTTPException(status_code=400, detail="请配置清洗算子流程")
        
        # 验证必填参数
        _validate_operator_params(steps_snapshot)
        
        # 处理选择的字段（如果提供了字段列表，则保存；否则为 None）
        selected_fields = None
        if task_create.selected_fields:
            # 验证字段列表不为空
            if len(task_create.selected_fields) == 0:
                raise HTTPException(status_code=400, detail="选择的字段列表不能为空")
            selected_fields = task_create.selected_fields
        
        # 创建任务（状态为 CREATED，等待 Celery 执行）
        # 先不设置 dataset_path，等获取到任务ID后再生成
        task = DataCleaningTask(
            name=task_create.name,
            project_id=task_create.project_id,
            source=task_create.source.value,
            input_dataset_id=task_create.input_dataset_id,
            override=task_create.override,
            status=TaskStatus.SCHEDULED_PENDING if task_create.schedule_at else TaskStatus.CREATED,
            steps_snapshot=steps_snapshot,
            selected_fields=selected_fields,
            schedule_at=task_create.schedule_at,
            total_samples=total_samples,
            total_characters=total_characters,
            file_size=file_size,
            dataset_path=None,  # 先不设置，等获取到ID后再生成
            created_id=current_user.userId,
            created_by=current_user.username
        )
        
        await self.task_mapper.insert(task)
        await session.commit()
        await session.refresh(task)
        
        # 现在有了任务ID，使用ID生成唯一路径
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{task_create.project_id}"
        dataset_path = self._generate_dataset_path(namespace, task_create.name, task_id=task.id)
        
        # 如果有源数据集，需要复制文件到新路径
        if task_create.source == CleaningDataSource.EXISTED_DATASET:
            jfs = await self._get_juicefs_client()
            # 复制文件到新路径
            remote_dir = os.path.dirname(dataset_path)
            if remote_dir and not jfs.exists(remote_dir):
                jfs.makedirs(remote_dir, exist_ok=True)
            
            with jfs.open(input_dataset.dataset_path, 'rb') as source_file:
                with jfs.open(dataset_path, 'wb') as target_file:
                    shutil.copyfileobj(source_file, target_file)
            
            logger.info(f"从训练数据集复制文件成功: {input_dataset.dataset_path} -> {dataset_path}")
        
        # 更新任务的路径
        task.dataset_path = dataset_path
        await session.commit()
        await session.refresh(task)
        
        logger.info(f"创建清洗任务成功: task_id={task.id}, name={task.name}, source={task.source}")
        
        # 生成项目命名空间（如果上面已经生成过，这里可以复用）
        if 'namespace' not in locals():
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{task_create.project_id}"
        
        # 获取当前租户ID
        from app.utils.app_runtime_context import get_tenant_id
        tenant_id = get_tenant_id()
        if not tenant_id:
            tenant_id = task.tenant_id
        
        # # 创建执行任务（可定时 / 立即执行）
        # if task_create.schedule_at:
        #     execution = TaskExecution(
        #         business_type=TaskExecutionBusinessType.DATA_CLEANING_TASK.value,
        #         business_id=task.id,
        #         schedule_at=task_create.schedule_at,
        #         status=TaskExecutionStatus.PENDING.value,
        #         executor=TaskExecutionExecutor.DATA_CLEANING.value,
        #         method=TaskExecutionMethod.START.value,
        #         kwargs={
        #             "namespace": namespace,
        #             "tenant_id": tenant_id
        #         }
        #     )
        #     await self.task_mapper.insert(execution)
        #     await session.commit()
        #     await session.refresh(task)
        #     logger.info(f"清洗任务已创建并等待定时执行: task_id={task.id}, schedule_at={task_create.schedule_at}")
        # else:
        #     await self.run_create_data_cleaning_task_post_process(
        #         task_id=task.id,
        #         namespace=namespace,
        #         tenant_id=tenant_id
        #     )
        #     await session.refresh(task)
        execution = TaskExecution(
                business_type=TaskExecutionBusinessType.DATA_CLEANING_TASK.value,
                business_id=task.id,
                schedule_at=task_create.schedule_at,
                status=TaskExecutionStatus.PENDING.value,
                executor=TaskExecutionExecutor.DATA_CLEANING.value,
                method=TaskExecutionMethod.START.value,
                kwargs={
                    "namespace": namespace,
                    "tenant_id": tenant_id
                }
            )
        await self.task_execution_mapper.insert(execution)
        await self.task_execution_mapper.commit()
        await self.task_mapper.refresh(task)
        logger.info(f"清洗任务已创建并等待执行: task_id={task.id}, schedule_at={task_create.schedule_at}")
        
        return CleaningTaskResponse.model_validate(task)

    async def update_data_cleaning_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int,
        task_update: CleaningTaskCreate
    ) -> CleaningTaskResponse:
        """更新清洗任务（参数与创建一致），并同步更新执行器任务数据"""
        session = await self.task_mapper.get_session()
        await validate_project_exists(session, project_id)

        task = await self.task_mapper.query_one(
            select(DataCleaningTask).filter(
                DataCleaningTask.id == task_id,
                DataCleaningTask.project_id == project_id
            )
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"清洗任务不存在: {task_id}")
        # 只有已创建/定时待启动/失败/已终止的任务可以进行编辑
        if task.status not in [TaskStatus.CREATED.value, TaskStatus.SCHEDULED_PENDING.value,
                               TaskStatus.TERMINATED.value, TaskStatus.FAILED.value]:
            raise HTTPException(status_code=400, detail=f"当前任务状态为 {task.status}，不允许修改")

        try:
            validate_name_format(task_update.name, "清洗任务名称")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        existing = await self.task_mapper.query_one(
            select(DataCleaningTask).filter(
                DataCleaningTask.project_id == project_id,
                DataCleaningTask.name == task_update.name,
                DataCleaningTask.id != task_id
            )
        )
        if existing:
            raise HTTPException(status_code=400, detail=f"项目中已存在同名的清洗任务: {task_update.name}")

        input_dataset = None
        total_samples = None
        total_characters = None
        file_size = None
        dataset_path = None
        if task_update.source == CleaningDataSource.EXISTED_DATASET:
            if not task_update.input_dataset_id:
                raise HTTPException(status_code=400, detail="从已有数据集创建时，必须指定输入数据集ID")

            input_dataset = await self.training_dataset_mapper.query_one(
                select(TrainingDataset).filter(TrainingDataset.id == task_update.input_dataset_id)
            )
            if not input_dataset:
                raise HTTPException(status_code=404, detail=f"输入数据集不存在: {task_update.input_dataset_id}")
            if input_dataset.project_id != project_id:
                raise HTTPException(status_code=400, detail="输入数据集不属于当前项目")

            await check_dataset_in_use(
                session,
                input_dataset.name,
                project_id,
                input_dataset.version,
                creating=DatasetTaskCreationKind.CLEANING,
            )
            jfs = await self._get_juicefs_client()
            if not jfs.exists(input_dataset.dataset_path):
                raise HTTPException(status_code=404, detail=f"训练数据集文件不存在: {input_dataset.dataset_path}")

            total_samples = input_dataset.total_samples
            total_characters = input_dataset.total_characters
            file_size = input_dataset.file_size if input_dataset.file_size else None
            if not total_samples or total_samples == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"数据集 '{input_dataset.name}' (版本: {input_dataset.version}) 为空，无法创建清洗任务"
                )
        elif task_update.source == CleaningDataSource.UPLOAD:
            raise HTTPException(status_code=400, detail="暂不支持本地上传功能")
        else:
            raise HTTPException(status_code=400, detail=f"不支持的数据来源: {task_update.source}")

        steps_snapshot = [step.model_dump() for step in task_update.steps] if task_update.steps else None
        if not steps_snapshot or len(steps_snapshot) == 0:
            raise HTTPException(status_code=400, detail="请配置清洗算子流程")
        _validate_operator_params(steps_snapshot)

        selected_fields = None
        if task_update.selected_fields:
            if len(task_update.selected_fields) == 0:
                raise HTTPException(status_code=400, detail="选择的字段列表不能为空")
            selected_fields = task_update.selected_fields

        task.name = task_update.name
        task.source = task_update.source.value
        task.input_dataset_id = task_update.input_dataset_id
        task.override = task_update.override
        task.steps_snapshot = steps_snapshot
        task.selected_fields = selected_fields
        task.schedule_at = task_update.schedule_at
        task.total_samples = total_samples
        task.total_characters = total_characters
        task.file_size = file_size
        task.status = TaskStatus.SCHEDULED_PENDING if task_update.schedule_at else TaskStatus.CREATED
        task.celery_task_id = None
        task.error_message = None
        task.started_at = None
        task.completed_at = None

        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        dataset_path = self._generate_dataset_path(namespace, task_update.name, task_id=task.id)
        if task_update.source == CleaningDataSource.EXISTED_DATASET and input_dataset:
            jfs = await self._get_juicefs_client()
            remote_dir = os.path.dirname(dataset_path)
            if remote_dir and not jfs.exists(remote_dir):
                jfs.makedirs(remote_dir, exist_ok=True)
            with jfs.open(input_dataset.dataset_path, 'rb') as source_file:
                with jfs.open(dataset_path, 'wb') as target_file:
                    shutil.copyfileobj(source_file, target_file)
        task.dataset_path = dataset_path

        if not self.task_execution_mapper:
            raise HTTPException(status_code=500, detail="任务执行器数据访问器未初始化")

        execution = await self.task_execution_mapper.query_one(
            select(TaskExecution).filter(
                TaskExecution.business_type == TaskExecutionBusinessType.DATA_CLEANING_TASK.value,
                TaskExecution.business_id == task.id
            ).order_by(desc(TaskExecution.created_at))
        )
        if execution:
            if execution.status in [TaskExecutionStatus.RUNNING.value]:
                raise HTTPException(status_code=400, detail=f"执行任务状态为 {execution.status}，不允许修改")
            execution.schedule_at = task.schedule_at
            execution.business_type = TaskExecutionBusinessType.DATA_CLEANING_TASK.value
            execution.executor = TaskExecutionExecutor.DATA_CLEANING.value
            execution.method = TaskExecutionMethod.START.value
            execution.status = TaskExecutionStatus.PENDING.value
            execution.retry_count = 0
            execution.last_error = None
            execution.locked_at = None
            execution.locked_by = None
            execution.started_at = None
            execution.completed_at = None
            execution.kwargs = {
                "namespace": namespace,
                "tenant_id": task.tenant_id
            }
        else:
            execution = TaskExecution(
                business_type=TaskExecutionBusinessType.DATA_CLEANING_TASK.value,
                business_id=task.id,
                schedule_at=task.schedule_at,
                status=TaskExecutionStatus.PENDING.value,
                executor=TaskExecutionExecutor.DATA_CLEANING.value,
                method=TaskExecutionMethod.START.value,
                kwargs={
                    "namespace": namespace,
                    "tenant_id": task.tenant_id
                }
            )
            await self.task_execution_mapper.insert(execution)

        await self.task_mapper.commit()
        await self.task_mapper.refresh(task)
        return CleaningTaskResponse.model_validate(task)

    async def get_data_cleaning_task(
        self,
        task_id: int
    ) -> CleaningTaskDetailResponse:
        """获取清洗任务详情"""
        task = await self.task_mapper.query_one(
            select(DataCleaningTask).filter(DataCleaningTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"清洗任务不存在: {task_id}")
        
        # 设置租户上下文（从任务中获取）
        from app.utils import app_runtime_context
        if task.tenant_id:
            app_runtime_context.set_tenant_id(task.tenant_id)
        
        # 获取输入数据集名称
        input_dataset = None
        if task.input_dataset_id:
            try:
                input_dataset = await self.training_dataset_mapper.query_one(
                    select(TrainingDataset).filter(TrainingDataset.id == task.input_dataset_id)
                )
            except Exception as e:
                logger.warning(f"查询输入数据集失败: task_id={task_id}, input_dataset_id={task.input_dataset_id}, error={str(e)}")
        
        # 获取输出数据集名称
        output_dataset = None
        if task.output_dataset_id:
            try:
                output_dataset = await self.training_dataset_mapper.query_one(
                    select(TrainingDataset).filter(TrainingDataset.id == task.output_dataset_id)
                )
            except Exception as e:
                logger.warning(f"查询输出数据集失败: task_id={task_id}, output_dataset_id={task.output_dataset_id}, error={str(e)}")
        
        # 获取预览数据（已注释）
        # preview_samples = None
        # if task.status == TaskStatus.COMPLETED and task.dataset_path:
        #     try:
        #         preview_response = await self.get_data_cleaning_preview(task_id, 50)
        #         preview_samples = preview_response.samples
        #     except Exception as e:
        #         logger.warning(f"获取预览数据失败: {str(e)}")
        
        # 确保 file_size 是 MB 单位（数据库中存储的应该已经是 MB）
        file_size_mb = task.file_size
        
        response = CleaningTaskDetailResponse(
            id=task.id,
            name=task.name,
            project_id=task.project_id,
            source=task.source,
            input_dataset_id=task.input_dataset_id,
            output_dataset_id=task.output_dataset_id,
            override=task.override,
            status=task.status,
            schedule_at=task.schedule_at,
            steps_snapshot=task.steps_snapshot,
            total_samples=task.total_samples,
            total_characters=task.total_characters,
            file_size=file_size_mb,  # 返回 MB 单位
            dataset_path=task.dataset_path,
            completed_at=task.completed_at,
            created_at=task.created_at,
            updated_at=task.updated_at,
            created_id=task.created_id,
            created_by=task.created_by,
            tenant_id=task.tenant_id,
            input_dataset_name=self._format_dataset_name(input_dataset) if input_dataset else None,
            output_dataset_name=self._format_dataset_name(output_dataset) if output_dataset else None,
            preview_samples=None,  # 预览数据已注释
            selected_fields=task.selected_fields
        )
        
        return response

    async def list_data_cleaning_tasks(
        self,
        project_id: int,
        name: Optional[str] = None,
        status: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None
    ) -> Page[CleaningTaskListResponse]:
        """获取项目下的清洗任务列表
        
        支持按任务名称（模糊匹配）和状态筛选
        """
        session = await self.task_mapper.get_session()
        
        # 验证项目存在
        await validate_project_exists(session, project_id)
        
        # 构建查询
        query = select(DataCleaningTask).filter(
            DataCleaningTask.project_id == project_id
        )
        
        # 任务名称模糊搜索
        if name:
            query = query.filter(DataCleaningTask.name.ilike(f"%{name}%"))
        
        # 状态筛选
        if status:
            query = query.filter(DataCleaningTask.status == status)
        
        query = query.order_by(DataCleaningTask.created_at.desc())
        
        # 分页查询
        paginated_result = await paginate(session, query)
        
        # 收集所有需要查询的数据集ID
        input_dataset_ids = [task.input_dataset_id for task in paginated_result.items if task.input_dataset_id]
        output_dataset_ids = [task.output_dataset_id for task in paginated_result.items if task.output_dataset_id]
        all_dataset_ids = list(set(input_dataset_ids + output_dataset_ids))
        
        # 批量查询数据集信息
        dataset_map = {}
        if all_dataset_ids:
            try:
                # 设置租户上下文（从第一个任务中获取，所有任务应该属于同一个租户）
                if paginated_result.items:
                    first_task = paginated_result.items[0]
                    if first_task.tenant_id:
                        from app.utils import app_runtime_context
                        app_runtime_context.set_tenant_id(first_task.tenant_id)
                
                datasets = await self.training_dataset_mapper.query(
                    select(TrainingDataset).filter(TrainingDataset.id.in_(all_dataset_ids))
                )
                for ds in datasets:
                    # 格式化名称：数据集用途/数据集名称-版本号
                    dataset_map[ds.id] = self._format_dataset_name(ds)
            except Exception as e:
                logger.warning(f"批量查询数据集失败: project_id={project_id}, dataset_ids={all_dataset_ids}, error={str(e)}")
        
        items = []
        for task in paginated_result.items:
            # 获取格式化的数据集名称
            input_dataset_name = dataset_map.get(task.input_dataset_id) if task.input_dataset_id else None
            output_dataset_name = dataset_map.get(task.output_dataset_id) if task.output_dataset_id else None
            
            items.append(CleaningTaskListResponse(
                id=task.id,
                name=task.name,
                project_id=task.project_id,
                source=task.source,
                input_dataset_id=task.input_dataset_id,
                output_dataset_id=task.output_dataset_id,
                input_dataset_name=input_dataset_name,
                output_dataset_name=output_dataset_name,
                status=task.status,
                schedule_at=task.schedule_at,
                total_samples=task.total_samples,
                completed_at=task.completed_at,
                created_at=task.created_at,
                updated_at=task.updated_at,
                created_id=task.created_id,
                created_by=task.created_by,
                tenant_id=task.tenant_id
            ))
        
        return Page(
            items=items,
            total=paginated_result.total,
            page=paginated_result.page,
            size=paginated_result.size,
            pages=paginated_result.pages
        )


    async def delete_data_cleaning_task(
        self,
        task_id: int
    ) -> None:
        """删除清洗任务"""
        session = await self.task_mapper.get_session()
        
        task = await self.task_mapper.query_one(
            select(DataCleaningTask).filter(DataCleaningTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"清洗任务不存在: {task_id}")
        
        # 只有已创建/定时待启动/已完成/失败/已终止的任务可以进行删除
        if task.status not in [TaskStatus.CREATED.value, TaskStatus.SCHEDULED_PENDING.value,
                               TaskStatus.TERMINATED.value, TaskStatus.FAILED.value, TaskStatus.COMPLETED.value]:
            raise HTTPException(
                status_code=400,
                detail=f"当前任务状态为 {task.status}，不允许删除"
            )

        # 删除任务执行记录
        if self.task_execution_mapper:
            await session.execute(
                TaskExecution.__table__.delete().where(
                    TaskExecution.business_type == TaskExecutionBusinessType.DATA_CLEANING_TASK.value,
                    TaskExecution.business_id == task_id,
                )
            )

        # 删除输入副本、输出文件和日志文件
        try:
            jfs = await self._get_juicefs_client()
            if task.dataset_path and jfs.exists(task.dataset_path):
                jfs.remove(task.dataset_path)
                logger.info(f"删除清洗输入副本文件: {task.dataset_path}")
            if task.output_path and jfs.exists(task.output_path):
                jfs.remove(task.output_path)
                logger.info(f"删除清洗输出文件: {task.output_path}")
            if task.log_path and jfs.exists(task.log_path):
                jfs.remove(task.log_path)
                logger.info(f"删除清洗日志文件: {task.log_path}")
        except Exception as e:
            logger.warning(f"删除清洗文件失败: {str(e)}")
        
        await self.task_mapper.delete(task)
        await session.commit()
        
        logger.info(f"删除清洗任务成功: task_id={task_id}")

    async def run_data_cleaning_task(
        self,
        current_user: JwtUserInfo,
        task_id: int
    ) -> CleaningRunResponse:
        """执行清洗任务"""
        session = await self.task_mapper.get_session()
        
        task = await self.task_mapper.query_one(
            select(DataCleaningTask).filter(DataCleaningTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"清洗任务不存在: {task_id}")
        
        # 只有pending状态的任务可以执行
        if task.status != TaskStatus.PENDING:
            raise HTTPException(
                status_code=400,
                detail=f"只有待执行状态的任务可以执行，当前状态: {task.status}"
            )
        
        # 验证算子配置（steps_snapshot 统一为数组格式）
        if not task.steps_snapshot or len(task.steps_snapshot) == 0:
            raise HTTPException(
                status_code=400,
                detail="请先配置清洗算子流程"
            )
        
        # 生成配置并创建K8s Job
        try:
            config = await self._generate_data_juicer_config(task)
            job_name = await self._create_k8s_job(task, config)
            
            # 更新任务状态
            task.status = TaskStatus.RUNNING
            task.k8s_job_name = job_name
            task.started_at = datetime.now()
            
            await session.commit()
            await session.refresh(task)
            
            logger.info(f"执行清洗任务成功: task_id={task_id}, job_name={job_name}")
            
            return CleaningRunResponse(
                task_id=task_id,
                status=task.status,
                k8s_job_name=job_name,
                message="清洗任务已提交执行"
            )
        except Exception as e:
            logger.error(f"执行清洗任务失败: {str(e)}", exc_info=True)
            task.status = TaskStatus.FAILED
            task.error_message = str(e)
            await session.commit()
            raise HTTPException(status_code=500, detail=f"执行清洗任务失败: {str(e)}")

    async def stop_data_cleaning_task(
        self,
        project_id: int,
        task_id: int
    ) -> None:
        """终止数据清洗任务，并按 job 名删除 K8s 资源"""
        from app.models.models import KubernetesResource, ProjectKubernetesRelation
        from app.utils.k8s_launcher import K8sLauncher

        task = await self.task_mapper.query_one(
            select(DataCleaningTask).filter(
                DataCleaningTask.id == task_id,
                DataCleaningTask.project_id == project_id
            )
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"清洗任务不存在: {task_id}")
        # 只有运行中/排队中可以终止
        if task.status not in [TaskStatus.RUNNING.value, TaskStatus.PENDING.value]:
            raise HTTPException(
                status_code=400,
                detail=f"任务当前状态为 {task.status}，只有运行中、排队中的任务才能终止"
            )

        task.status = TaskStatus.TERMINATED
        task.error_message = "任务已被用户终止"
        task.completed_at = datetime.now()
        if not task.started_at:
            task.started_at = task.created_at

        # 同步执行器状态，避免被后续调度再次拉起
        execution = await self.task_execution_mapper.query_one(
            select(TaskExecution).filter(
                TaskExecution.business_type == TaskExecutionBusinessType.DATA_CLEANING_TASK.value,
                TaskExecution.business_id == task_id
            ).order_by(desc(TaskExecution.created_at))
        )
        if execution and execution.status in [TaskExecutionStatus.PENDING.value, TaskExecutionStatus.RUNNING.value]:
            execution.status = TaskExecutionStatus.FAILED.value
            execution.last_error = "任务已被用户终止"
            execution.locked_at = None
            execution.locked_by = None

        await self.task_mapper.commit()
        logger.info(f"清洗任务状态已更新为终止: task_id={task_id}")

        # 按 job 名删除资源
        try:
            k8s_configs = await self.task_mapper.query(
                select(KubernetesResource.config)
                .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
                .filter(ProjectKubernetesRelation.project_id == project_id)
            )
            if not k8s_configs:
                logger.warning(f"项目 {project_id} 未找到 K8s 配置，跳过 Job 删除")
                return

            launcher = K8sLauncher(config_str=k8s_configs[0])
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
            job_name = f"data-cleaning-{task_id}-{task.lab_k8s_uuid[:8]}"

            try:
                success = await launcher.delete_job(namespace=namespace, job_name=job_name)
                if success:
                    logger.info(f"成功删除清洗任务 Job: {job_name}")
            except Exception as e:
                logger.error(f"删除清洗任务 Job 失败: {job_name}, err={e}")
        except Exception as e:
            logger.error(f"终止清洗任务时删除 K8s Job 失败: task_id={task_id}, err={e}")

    async def get_data_cleaning_task_logs(
        self,
        task_id: int
    ) -> CleaningLogResponse:
        """获取清洗任务日志（优先归档日志，其次Loki实时日志）"""
        from app.utils.log_service import log_service
        
        task = await self.task_mapper.query_one(
            select(DataCleaningTask).filter(DataCleaningTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"清洗任务不存在: {task_id}")
        
        # 判断日志来源
        if task.log_path:
            # 从MinIO获取归档日志
            logs = log_service.get_logs_from_minio(task.log_path)
            return CleaningLogResponse(archived=True, logs=logs)
        else:
            # 从Loki获取实时日志
            if not task.lab_k8s_uuid:
                return CleaningLogResponse(archived=False, logs=[])
            # 使用任务结束时间，如果没有则用当前时间
            end_time = task.completed_at if task.completed_at else datetime.now()
            logs = log_service.get_logs_from_loki(
                task.lab_k8s_uuid,
                end_time=end_time,
                days=30
            )
            return CleaningLogResponse(archived=False, logs=logs)

    async def get_data_cleaning_preview(
        self,
        task_id: int,
        sample_count: int = 50
    ) -> CleaningPreviewResponse:
        """获取清洗结果预览（随机N条）"""
        task = await self.task_mapper.query_one(
            select(DataCleaningTask).filter(DataCleaningTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"清洗任务不存在: {task_id}")
        
        if task.status != TaskStatus.COMPLETED:
            raise HTTPException(status_code=400, detail="任务未完成，无法预览")
        
        if not task.output_path:
            raise HTTPException(status_code=404, detail="输出文件不存在")
        
        # 读取输出文件并随机采样
        try:
            jfs = await self._get_juicefs_client()
            if not jfs.exists(task.output_path):
                raise HTTPException(status_code=404, detail="输出文件不存在")
            
            all_samples = []
            with jfs.open(task.output_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                        all_samples.append(item)
                    except json.JSONDecodeError:
                        continue
            
            # 随机采样
            total_count = len(all_samples)
            if total_count <= sample_count:
                samples = all_samples
            else:
                samples = random.sample(all_samples, sample_count)
            
            return CleaningPreviewResponse(
                task_id=task_id,
                samples=samples,
                total_count=total_count
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"获取清洗预览失败: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"获取预览失败: {str(e)}")

    async def download_data_cleaning_result(
        self,
        task_id: int,
        download_type: str
    ) -> bytes:
        """下载清洗结果或日志"""
        from app.utils.log_service import log_service
        
        task = await self.task_mapper.query_one(
            select(DataCleaningTask).filter(DataCleaningTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"清洗任务不存在: {task_id}")
        
        # 根据下载类型选择文件路径
        if download_type == CleaningDownloadType.RESULT.value:
            file_path = task.output_path
            if not file_path:
                raise HTTPException(status_code=404, detail="输出文件不存在")
            
            # 读取结果文件并移除 _cleaning_id 字段（使用流式处理优化性能）
            try:
                jfs = await self._get_juicefs_client()
                if not jfs.exists(file_path):
                    raise HTTPException(status_code=404, detail="文件不存在")
                
                # 使用 StringIO 进行流式处理，避免一次性加载所有数据到内存
                import io
                output_buffer = io.BytesIO()
                
                with jfs.open(file_path, 'r', encoding='utf-8') as f:
                    first_line = True
                    for line in f:
                        line = line.strip()
                        if not line:
                            if not first_line:
                                output_buffer.write(b'\n')
                            continue
                        
                        try:
                            # 解析JSON行
                            data = json.loads(line)
                            
                            # 如果是字典，移除 _cleaning_id 字段
                            if isinstance(data, dict) and "_cleaning_id" in data:
                                data = {k: v for k, v in data.items() if k != "_cleaning_id"}
                            
                            # 重新编码为JSONL格式并写入缓冲区
                            json_line = json.dumps(data, ensure_ascii=False)
                            if not first_line:
                                output_buffer.write(b'\n')
                            output_buffer.write(json_line.encode('utf-8'))
                            first_line = False
                        except json.JSONDecodeError:
                            # 如果解析失败，保留原行
                            if not first_line:
                                output_buffer.write(b'\n')
                            output_buffer.write(line.encode('utf-8'))
                            first_line = False
                
                # 获取处理后的内容
                content = output_buffer.getvalue()
                output_buffer.close()
                return content
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"下载文件失败: {str(e)}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"下载失败: {str(e)}")
        
        elif download_type == CleaningDownloadType.LOG.value:
            # 日志下载：优先归档日志，其次Loki实时日志
            if task.log_path:
                # 从MinIO获取归档日志
                logs_list = log_service.get_logs_from_minio(task.log_path)
                # 将日志列表转换为字符串，然后编码为字节
                logs_str = '\n'.join(logs_list) if isinstance(logs_list, list) else str(logs_list)
                return logs_str.encode('utf-8')
            else:
                # 从Loki获取实时日志
                if not task.lab_k8s_uuid:
                    raise HTTPException(
                        status_code=400,
                        detail="任务没有关联的K8S UUID，无法获取日志"
                    )
                # 使用任务结束时间，如果没有则用当前时间
                end_time = task.completed_at if task.completed_at else datetime.now()
                logs_list = log_service.get_logs_from_loki(
                    task.lab_k8s_uuid,
                    end_time=end_time,
                    days=30
                )
                # 将日志列表转换为字符串，然后编码为字节
                logs_str = '\n'.join(logs_list) if isinstance(logs_list, list) else str(logs_list)
                return logs_str.encode('utf-8')
        else:
            raise HTTPException(status_code=400, detail=f"不支持的下载类型: {download_type}")

    # ------------------------------ 数据清洗模板接口实现 ------------------------------
    async def create_data_cleaning_template(
        self,
        current_user: JwtUserInfo,
        template_create: CleaningTemplateCreate
    ) -> CleaningTemplateResponse:
        """保存清洗模板"""
        session = await self.template_mapper.get_session()
        
        # 验证项目存在
        await validate_project_exists(session, template_create.project_id)
        
        # 验证算子配置和必填参数
        steps_json = [step.model_dump() for step in template_create.steps_json]
        if not steps_json or len(steps_json) == 0:
            raise HTTPException(status_code=400, detail="请配置清洗算子流程")
        _validate_operator_params(steps_json)
        
        # 创建模板（用户创建的模板 is_builtin=False）
        template = DataCleaningTemplate(
            project_id=template_create.project_id,
            is_builtin=False,
            steps_json=steps_json,
            created_id=current_user.userId,
            created_by=current_user.username
        )
        
        await self.template_mapper.insert(template)
        await session.commit()
        await session.refresh(template)
        
        logger.info(f"创建清洗模板成功: template_id={template.id}")
        return CleaningTemplateResponse.model_validate(template)

    async def get_data_cleaning_template(
        self,
        template_id: int
    ) -> CleaningTemplateResponse:
        """获取清洗模板详情"""
        from sqlalchemy import or_, and_
        from app.utils import app_runtime_context
        
        session = await self.template_mapper.get_session()
        current_tenant = app_runtime_context.get_tenant_id()
        
        # 构建查询：可以查询当前租户的模板或系统内置模板（tenant_id='0'）
        query = select(DataCleaningTemplate).filter(
            and_(
                DataCleaningTemplate.id == template_id,
                or_(
                    # 当前租户的模板
                    DataCleaningTemplate.tenant_id == current_tenant,
                    # 系统内置模板（tenant_id 为 "0"）
                    and_(
                        DataCleaningTemplate.is_builtin == True,
                        DataCleaningTemplate.tenant_id == '0'
                    )
                )
            )
        )
        
        result = await session.execute(query)
        template = result.scalar_one_or_none()
        
        if not template:
            raise HTTPException(status_code=404, detail=f"清洗模板不存在: {template_id}")
        
        return CleaningTemplateResponse.model_validate(template)

    async def list_data_cleaning_templates(
        self,
        project_id: int,
        page: Optional[int] = None,
        size: Optional[int] = None,
        created_by: Optional[str] = None,
        operator_type: Optional[str] = None
    ) -> Page[CleaningTemplateResponse]:
        """获取清洗模板列表（包含当前项目模板 + 全局内置模板）"""
        from sqlalchemy import or_, and_
        from app.utils import app_runtime_context
        
        session = await self.template_mapper.get_session()
        
        # 验证项目存在
        await validate_project_exists(session, project_id)
        
        # 全局内置模板的 project_id 标识
        BUILTIN_TEMPLATE_PROJECT_ID = 0
        current_tenant = app_runtime_context.get_tenant_id()
        
        # 构建查询：当前项目的模板 + 全局内置模板
        query = select(DataCleaningTemplate).filter(
            or_(
                # 当前项目的模板（使用当前租户ID）
                and_(
                    DataCleaningTemplate.project_id == project_id,
                    DataCleaningTemplate.tenant_id == current_tenant
                ),
                # 全局内置模板（tenant_id 为 "0"）
                and_(
                    DataCleaningTemplate.project_id == BUILTIN_TEMPLATE_PROJECT_ID,
                    DataCleaningTemplate.is_builtin == True,
                    DataCleaningTemplate.tenant_id == '0'
                )
            )
        )
        
        # 按创建人搜索（模糊匹配）
        if created_by:
            query = query.filter(DataCleaningTemplate.created_by.ilike(f"%{created_by}%"))
        
        # 按算子类型/名称模糊搜索（在steps_json数组中搜索）
        if operator_type:
            from sqlalchemy import text as sa_text
            query = query.filter(
                sa_text(
                    "EXISTS ("
                    "  SELECT 1 FROM jsonb_array_elements(CAST(steps_json AS JSONB)) AS elem"
                    "  WHERE elem->>'operator_name' ILIKE :op_pattern"
                    ")"
                ).bindparams(op_pattern=f"%{operator_type}%")
            )
        
        # 排序：内置模板优先，然后按创建时间倒序
        query = query.order_by(
            DataCleaningTemplate.is_builtin.desc(),
            DataCleaningTemplate.created_at.desc()
        )
        
        # 分页查询
        paginated_result = await paginate(session, query)
        
        items = []
        for template in paginated_result.items:
            items.append(CleaningTemplateResponse.model_validate(template))
        
        return Page(
            items=items,
            total=paginated_result.total,
            page=paginated_result.page,
            size=paginated_result.size,
            pages=paginated_result.pages
        )

    async def update_data_cleaning_template(
        self,
        template_id: int,
        template_update: CleaningTemplateUpdate
    ) -> CleaningTemplateResponse:
        """更新清洗模板"""
        from sqlalchemy import or_, and_
        from app.utils import app_runtime_context
        
        session = await self.template_mapper.get_session()
        current_tenant = app_runtime_context.get_tenant_id()
        
        # 构建查询：可以查询当前租户的模板或系统内置模板（tenant_id='0'）
        query = select(DataCleaningTemplate).filter(
            and_(
                DataCleaningTemplate.id == template_id,
                or_(
                    # 当前租户的模板
                    DataCleaningTemplate.tenant_id == current_tenant,
                    # 系统内置模板（tenant_id 为 "0"）
                    and_(
                        DataCleaningTemplate.is_builtin == True,
                        DataCleaningTemplate.tenant_id == '0'
                    )
                )
            )
        )
        
        result = await session.execute(query)
        template = result.scalar_one_or_none()
        
        if not template:
            raise HTTPException(status_code=404, detail=f"清洗模板不存在: {template_id}")

        if template.is_builtin:
            raise HTTPException(status_code=400, detail="系统内置模板不允许更新")

        # 更新字段
        if template_update.steps_json is not None:
            steps_json = [step.model_dump() for step in template_update.steps_json]
            if not steps_json or len(steps_json) == 0:
                raise HTTPException(status_code=400, detail="请配置清洗算子流程")
            _validate_operator_params(steps_json)
            template.steps_json = steps_json
        
        await session.commit()
        await session.refresh(template)
        
        logger.info(f"更新清洗模板成功: template_id={template_id}")
        return CleaningTemplateResponse.model_validate(template)

    async def delete_data_cleaning_template(
        self,
        template_id: int
    ) -> None:
        """删除清洗模板"""
        from sqlalchemy import or_, and_
        from app.utils import app_runtime_context
        
        session = await self.template_mapper.get_session()
        current_tenant = app_runtime_context.get_tenant_id()
        
        # 构建查询：可以查询当前租户的模板或系统内置模板（tenant_id='0'）
        query = select(DataCleaningTemplate).filter(
            and_(
                DataCleaningTemplate.id == template_id,
                or_(
                    # 当前租户的模板
                    DataCleaningTemplate.tenant_id == current_tenant,
                    # 系统内置模板（tenant_id 为 "0"）
                    and_(
                        DataCleaningTemplate.is_builtin == True,
                        DataCleaningTemplate.tenant_id == '0'
                    )
                )
            )
        )
        
        result = await session.execute(query)
        template = result.scalar_one_or_none()
        
        if not template:
            raise HTTPException(status_code=404, detail=f"清洗模板不存在: {template_id}")

        if template.is_builtin:
            raise HTTPException(status_code=400, detail="系统内置模板不允许删除")

        await self.template_mapper.delete(template)
        await session.commit()
        
        logger.info(f"删除清洗模板成功: template_id={template_id}")

    # ------------------------------ 算子相关接口实现 ------------------------------
    async def get_operators_by_category(self) -> OperatorCategoryListResponse:
        """获取按分类组织的清洗算子列表"""
        # 按分类组织算子
        category_operators: Dict[str, List[OperatorInfo]] = {}
        for op in DATA_JUICER_OPERATORS:
            if op.category not in category_operators:
                category_operators[op.category] = []
            category_operators[op.category].append(op)
        
        # 构建响应（使用统一维护的分类配置）
        categories = []
        for category_key in get_category_order():
            if category_key in category_operators:
                categories.append(OperatorCategoryInfo(
                    category=category_key,
                    category_name=get_category_name(category_key),
                    operators=category_operators[category_key]
                ))
        
        return OperatorCategoryListResponse(categories=categories)

    async def get_dataset_fields(
        self,
        dataset_id: int
    ) -> DatasetFieldsResponse:
        """根据训练数据集ID获取数据清洗可选字段列表。"""
        dataset = await self.training_dataset_mapper.query_one(
            select(TrainingDataset).filter(TrainingDataset.id == dataset_id)
        )

        if not dataset:
            raise HTTPException(status_code=404, detail=f"训练数据集不存在: {dataset_id}")

        raw_fields = self._get_top_level_metadata_fields(dataset.metadata_fields)
        field_source = "metadata_fields"
        if not raw_fields:
            raw_fields = await self._collect_dataset_fields_from_sample_file(dataset)
            field_source = "sample_file"

        if not raw_fields:
            raise HTTPException(status_code=400, detail="无法从数据集中提取字段，请检查文件格式或先执行 metadata_fields 修复")

        fields = self._format_data_cleaning_dataset_fields(dataset, raw_fields)
        logger.info(
            f"获取数据清洗字段成功: dataset_id={dataset_id}, "
            f"source={field_source}, fields_count={len(fields)}"
        )
        return DatasetFieldsResponse(
            dataset_id=dataset.id,
            dataset_name=dataset.name,
            fields=fields
        )

    @staticmethod
    def _get_top_level_metadata_fields(metadata_fields: Any) -> List[str]:
        """metadata_fields 存的是全量字段路径，数据清洗 text_keys 使用顶层/逻辑字段。"""
        if not isinstance(metadata_fields, list):
            return []

        result: List[str] = []
        seen = set()
        ignored_fields = {"row_number", "key", "id"}
        for field in metadata_fields:
            if not isinstance(field, str):
                continue
            field_name = field.strip()
            if not field_name:
                continue
            top_level_field = field_name.split(".", 1)[0]
            if top_level_field in ignored_fields or top_level_field in seen:
                continue
            seen.add(top_level_field)
            result.append(top_level_field)
        return result

    async def _collect_dataset_fields_from_sample_file(
        self,
        dataset: TrainingDataset,
    ) -> List[str]:
        """历史数据未回填 metadata_fields 时，回退到旧逻辑读取少量有效行。"""
        dataset_path = dataset.dataset_path
        if not dataset_path:
            raise HTTPException(status_code=404, detail="数据集文件路径不存在")

        jfs = await self._get_juicefs_client()
        if not jfs.exists(dataset_path):
            raise HTTPException(status_code=404, detail=f"数据集文件不存在: {dataset_path}")

        fields: List[str] = []
        seen = set()
        sample_count = 0
        max_samples = 2
        ignored_fields = {"row_number", "key", "id"}

        with jfs.open(dataset_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if isinstance(item, dict):
                    to_parse = item
                elif isinstance(item, list) and item and isinstance(item[0], dict):
                    to_parse = item[0]
                else:
                    continue

                for field_name in to_parse.keys():
                    if field_name in ignored_fields or field_name in seen:
                        continue
                    seen.add(field_name)
                    fields.append(field_name)
                sample_count += 1
                if sample_count >= max_samples:
                    break
        return fields

    @staticmethod
    def _format_data_cleaning_dataset_fields(
        dataset: TrainingDataset,
        raw_fields: List[str],
    ) -> List[str]:
        """按数据清洗执行逻辑返回可选字段，不复用评估字段列表。"""
        from app.schemas.training_dataset import DatasetFormat
        from app.schemas.training_task import TrainingMethodType

        raw_field_set = set(raw_fields)
        excluded_fields = {"messages", "conversations", "dialogue"}

        if dataset.dataset_format == DatasetFormat.ROLE_BASED.value:
            ordered_fields = (
                ["messages.system", "messages.user", "messages.assistant", "chosen", "rejected"]
                if dataset.training_method_type == TrainingMethodType.DPO.value
                else ["system", "user", "assistant"]
            )
        elif dataset.dataset_format == DatasetFormat.ALPACA.value:
            ordered_fields = ["instruction", "input", "chosen", "rejected"]
            excluded_fields = set()
        elif dataset.dataset_format == DatasetFormat.PROMPT_RESPONSE.value:
            ordered_fields = (
                ["instruction", "input", "chosen", "rejected"]
                if dataset.training_method_type == TrainingMethodType.DPO.value
                else ["system", "prompt", "response"]
            )
            excluded_fields = set()
        else:
            ordered_fields = []
            excluded_fields = set()

        result: List[str] = []
        for field_name in ordered_fields:
            if field_name not in result:
                result.append(field_name)

        remaining_fields = sorted(
            field_name
            for field_name in raw_field_set
            if field_name not in set(result) and field_name not in excluded_fields
        )
        result.extend(remaining_fields)
        return result

    async def generate_training_dataset_on_completion(
        self,
        task_id: int
    ) -> Optional[int]:
        """
        数据清洗任务完成时生成训练数据集新版本
        
        根据 override 配置决定是覆盖还是创建新版本：
        - override=True: 覆盖模式（暂未实现，会跳过处理）
        - override=False: 创建新版本的数据集
        
        Args:
            task_id: 数据清洗任务ID
            
        Returns:
            新版本的训练数据集ID，如果不满足条件或覆盖模式则返回 None
        """
        logger.info(f"开始生成训练数据集新版本: task_id={task_id}")

        generation_session = None
        try:
            generation_session = await _create_fresh_session()

            # 锁住当前清洗任务，避免同一任务完成事件重复触发时并发生成多个输出数据集。
            cleaning_task_result = await generation_session.execute(
                select(DataCleaningTask)
                .filter(DataCleaningTask.id == task_id)
                .with_for_update()
            )
            cleaning_task = cleaning_task_result.scalar_one_or_none()
            
            if not cleaning_task:
                logger.warning(f"数据清洗任务不存在: {task_id}，跳过版本生成")
                return None

            if cleaning_task.output_dataset_id:
                logger.info(
                    f"数据清洗任务已存在输出数据集，跳过重复生成: "
                    f"task_id={task_id}, output_dataset_id={cleaning_task.output_dataset_id}"
                )
                return cleaning_task.output_dataset_id
            
            logger.info(f"找到数据清洗任务: task_id={task_id}, input_dataset_id={cleaning_task.input_dataset_id}, output_path={cleaning_task.output_path}, override={cleaning_task.override}")
            
            # 检查是否有输入数据集ID和输出路径
            if not cleaning_task.input_dataset_id:
                logger.warning(f"任务 {task_id} 未找到输入数据集ID，跳过版本生成")
                return None
            
            if not cleaning_task.output_path:
                logger.warning(f"任务 {task_id} 未找到输出路径，跳过版本生成")
                return None

            # 设置租户上下文（从任务中获取），后续数据集查询和版本锁都需要租户维度。
            from app.utils import app_runtime_context
            if cleaning_task.tenant_id:
                app_runtime_context.set_tenant_id(cleaning_task.tenant_id)
                logger.info(f"设置租户上下文: task_id={task_id}, tenant_id={cleaning_task.tenant_id}")
            else:
                logger.warning(f"任务 {task_id} 没有租户ID，尝试从运行时上下文获取")
            
            # 锁住源训练数据集，避免多个清洗任务同时基于同一源版本生成相同的新版本号。
            source_dataset_result = await generation_session.execute(
                select(TrainingDataset)
                .filter(TrainingDataset.id == cleaning_task.input_dataset_id)
                .with_for_update()
            )
            source_dataset = source_dataset_result.scalar_one_or_none()
            
            if not source_dataset:
                logger.error(f"源训练数据集不存在: {cleaning_task.input_dataset_id}")
                return None
            
            # 立即从 source_dataset 中提取所有需要的值，避免会话问题
            # 使用 __dict__ 直接访问，避免延迟加载和会话问题
            try:
                dataset_dict = source_dataset.__dict__.copy()
                # 移除 SQLAlchemy 内部状态
                if '_sa_instance_state' in dataset_dict:
                    dataset_dict.pop('_sa_instance_state')
                
                source_dataset_info = {
                    'id': dataset_dict.get('id'),
                    'name': dataset_dict.get('name'),
                    'project_id': dataset_dict.get('project_id'),
                    'version': dataset_dict.get('version'),
                    'dataset_type': dataset_dict.get('dataset_type'),
                    'training_method_type': dataset_dict.get('training_method_type'),
                    'dataset_format': dataset_dict.get('dataset_format'),
                    'usage': dataset_dict.get('usage'),
                    'dataset_config': dataset_dict.get('dataset_config'),
                }
                
                # 验证必要字段
                if not all([source_dataset_info['id'], source_dataset_info['name'], source_dataset_info['project_id']]):
                    raise ValueError("源数据集信息不完整")
                    
                logger.info(f"成功提取源数据集信息: id={source_dataset_info['id']}, name={source_dataset_info['name']}")
            except Exception as e:
                logger.error(f"提取源数据集属性失败: {str(e)}", exc_info=True)
                # 如果 __dict__ 方法失败，尝试直接访问属性
                try:
                    source_dataset_info = {
                        'id': source_dataset.id,
                        'name': source_dataset.name,
                        'project_id': source_dataset.project_id,
                        'version': source_dataset.version,
                        'dataset_type': source_dataset.dataset_type,
                        'training_method_type': source_dataset.training_method_type,
                        'dataset_format': source_dataset.dataset_format,
                        'usage': source_dataset.usage,
                        'dataset_config': getattr(source_dataset, 'dataset_config', None),
                    }
                except Exception as e2:
                    logger.error(f"直接访问属性也失败: {str(e2)}", exc_info=True)
                    return None

            # 锁住同名同用途的数据集版本族，避免不同源版本并发完成时抢到同一个新版本号。
            dataset_family_lock = select(TrainingDataset.id).filter(
                TrainingDataset.project_id == source_dataset_info['project_id'],
                TrainingDataset.name == source_dataset_info['name'],
                TrainingDataset.usage == source_dataset_info['usage']
            )
            current_tenant = app_runtime_context.get_tenant_id()
            if current_tenant:
                dataset_family_lock = dataset_family_lock.filter(TrainingDataset.tenant_id == current_tenant)
            await generation_session.execute(dataset_family_lock.with_for_update())
            
            # 获取JuiceFS客户端
            logger.info(f"获取JuiceFS客户端: task_id={task_id}")
            jfs = await self._get_juicefs_client()
            
            # 检查输出文件是否存在（等待一段时间，避免K8s完成与文件落盘时序问题）
            logger.info(f"检查输出文件是否存在: task_id={task_id}, output_path={cleaning_task.output_path}")
            file_exists = jfs.exists(cleaning_task.output_path)
            if not file_exists:
                max_attempts = 5
                for attempt in range(1, max_attempts + 1):
                    await asyncio.sleep(2)
                    file_exists = jfs.exists(cleaning_task.output_path)
                    if file_exists:
                        logger.info(f"输出文件已出现: task_id={task_id}, attempt={attempt}")
                        break
                    logger.warning(f"输出文件未生成，重试中: task_id={task_id}, attempt={attempt}/{max_attempts}")
            
            if not file_exists:
                logger.error(f"清洗输出文件不存在: {cleaning_task.output_path}")
                return None
            
            # 读取清洗后的数据文件
            logger.info(f"开始读取清洗后的数据文件: task_id={task_id}, output_path={cleaning_task.output_path}")
            cleaned_data = []
            total_samples = 0
            total_characters = 0

            # 内部字段，最终输出时需要去掉
            _internal_keys = {
                "_cleaning_id", "_group", "_role", "_turn_idx", "_other_turns",
                "_segment", "_messages_original", "_chosen_original", "_rejected_original",
                "_total_selected"
            }
            selected_fields = set(cleaning_task.selected_fields or [])
            dataset_format = source_dataset_info.get("dataset_format") or ""

            def _has_nested_field(data: Dict[str, Any], field_path: str) -> bool:
                current: Any = data
                for part in field_path.split("."):
                    if not isinstance(current, dict) or part not in current:
                        return False
                    current = current[part]
                return True

            def _role_logical_field_name(role: str) -> str:
                if role == "assistant":
                    return "response"
                return role

            def _row_has_selected_target(data: Dict[str, Any]) -> bool:
                if not selected_fields:
                    return True

                conversation_specs = (
                    ("messages", "role"),
                    ("conversations", "from"),
                    ("dialogue", "speaker"),
                )
                for conversation_key, role_key in conversation_specs:
                    turns = data.get(conversation_key)
                    if not isinstance(turns, list):
                        continue
                    if conversation_key in selected_fields and turns:
                        return True
                    for turn in turns:
                        if not isinstance(turn, dict):
                            continue
                        role = str(turn.get(role_key, ""))
                        logical_field_name = _role_logical_field_name(role)
                        if (
                            f"{conversation_key}.{role}" in selected_fields
                            or f"{conversation_key}.{logical_field_name}" in selected_fields
                            or logical_field_name in selected_fields
                            or role in selected_fields
                            or (role == "user" and "prompt" in selected_fields)
                        ):
                            return True

                for ranking_field in ("chosen", "rejected"):
                    ranking_item = data.get(ranking_field)
                    if (
                        ranking_field in selected_fields
                        and isinstance(ranking_item, dict)
                        and isinstance(ranking_item.get("content"), str)
                    ):
                        return True

                return any(_has_nested_field(data, field_name) for field_name in selected_fields)

            def _format_cleaned_dataset_line(data: Dict[str, Any]) -> str:
                if dataset_format == "prompt-response":
                    return json.dumps([data], ensure_ascii=False)
                return json.dumps(data, ensure_ascii=False)

            def _format_comparison_line(data: Dict[str, Any], group_id: str) -> str:
                return json.dumps([{**data, "_cleaning_id": group_id}], ensure_ascii=False)

            def _load_original_rows() -> List[Tuple[str, Dict[str, Any]]]:
                original_rows: List[Tuple[str, Dict[str, Any]]] = []
                dataset_path = cleaning_task.dataset_path
                if not dataset_path or not jfs.exists(dataset_path):
                    return original_rows
                with jfs.open(dataset_path, 'r', encoding='utf-8') as original_file:
                    for line_num, line in enumerate(original_file, 1):
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        try:
                            item = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if isinstance(item, list):
                            item = item[0] if item and isinstance(item[0], dict) else None
                        if isinstance(item, dict):
                            original_rows.append((f"row_{line_num}", item))
                return original_rows

            # 先把所有行读进来，检测是否需要按 _group 重组 messages
            raw_rows = []
            with jfs.open(cleaning_task.output_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        if isinstance(data, list):
                            data = data[0] if data else None
                        if isinstance(data, dict):
                            raw_rows.append(data)
                    except json.JSONDecodeError as e:
                        logger.warning(f"跳过无效JSON行: {line}, 错误: {str(e)}")
                    except Exception as e:
                        logger.error(f"处理数据行失败: {str(e)}", exc_info=True)

            # 判断是否为会话拆行模式（有 _group 字段）
            is_grouped = any("_group" in row for row in raw_rows)
            original_rows = _load_original_rows()

            if is_grouped:
                logger.info(f"检测到 _group 字段，开始按会话重组 messages: task_id={task_id}")
                # 按 _group 聚合，保留各消息的 _turn_idx 顺序
                from collections import defaultdict
                groups: dict = defaultdict(list)
                group_order = []  # 保持会话原始顺序
                for row in raw_rows:
                    gid = row.get("_group", "__ungrouped__")
                    if gid not in groups:
                        group_order.append(gid)
                    groups[gid].append(row)

                # output_lines 保留 _cleaning_id，用于回写 output_path 供对比接口使用
                rebuilt_by_group: Dict[str, Tuple[str, str]] = {}
                dropped_groups = 0
                for gid in group_order:
                    rows_in_group = sorted(groups[gid], key=lambda r: r.get("_turn_idx", 0))

                    # 完整性校验：若有任意一轮消息被 data-juicer 过滤删除，丢弃整条会话
                    total_selected = rows_in_group[0].get("_total_selected", len(rows_in_group))
                    if len(rows_in_group) < total_selected:
                        dropped_groups += 1
                        logger.info(
                            f"会话 {gid} 有 {total_selected - len(rows_in_group)} 轮消息被过滤删除，"
                            f"丢弃整条会话（原有 {total_selected} 轮，剩余 {len(rows_in_group)} 轮）"
                        )
                        continue

                    original_messages = []
                    if "_messages_original" in rows_in_group[0]:
                        try:
                            original_messages = json.loads(rows_in_group[0]["_messages_original"])
                        except Exception:
                            original_messages = []

                    cleaned_messages_by_turn = {}
                    cleaned_chosen = None
                    cleaned_rejected = None

                    for row in rows_in_group:
                        segment = row.get("_segment", "message")
                        if segment == "message":
                            cleaned_messages_by_turn[row.get("_turn_idx", 0)] = {
                                "role": row.get("_role", ""),
                                "content": row.get("text", ""),
                            }
                        elif segment == "chosen":
                            cleaned_chosen = {
                                "role": row.get("_role", "assistant"),
                                "content": row.get("text", ""),
                            }
                        elif segment == "rejected":
                            cleaned_rejected = {
                                "role": row.get("_role", "assistant"),
                                "content": row.get("text", ""),
                            }

                    messages = []
                    if original_messages:
                        for idx, original_turn in enumerate(original_messages):
                            if idx in cleaned_messages_by_turn:
                                messages.append(cleaned_messages_by_turn[idx])
                            elif isinstance(original_turn, dict):
                                messages.append({
                                    "role": original_turn.get("role", ""),
                                    "content": original_turn.get("content", ""),
                                })
                    else:
                        ordered_turns = sorted(cleaned_messages_by_turn.items(), key=lambda x: x[0])
                        messages = [item for _, item in ordered_turns]

                    original_chosen = None
                    original_rejected = None
                    if "_chosen_original" in rows_in_group[0]:
                        try:
                            original_chosen = json.loads(rows_in_group[0]["_chosen_original"])
                        except Exception:
                            original_chosen = None
                    if "_rejected_original" in rows_in_group[0]:
                        try:
                            original_rejected = json.loads(rows_in_group[0]["_rejected_original"])
                        except Exception:
                            original_rejected = None

                    rebuilt_item = {"messages": messages}
                    if cleaned_chosen is not None or original_chosen is not None:
                        rebuilt_item["chosen"] = cleaned_chosen if cleaned_chosen is not None else original_chosen
                    if cleaned_rejected is not None or original_rejected is not None:
                        rebuilt_item["rejected"] = cleaned_rejected if cleaned_rejected is not None else original_rejected

                    # 带 _cleaning_id 的版本（回写 output_path，供对比接口按 group_id 匹配）
                    comparison_line = _format_comparison_line(rebuilt_item, gid)
                    # 不含内部字段的版本（写入新数据集版本，JSONL 每行一个对象，不包一层 []）
                    formatted_line = json.dumps(rebuilt_item, ensure_ascii=False)
                    rebuilt_by_group[gid] = (comparison_line, formatted_line)

                output_lines = []
                passthrough_groups = 0
                if original_rows:
                    for gid, original_item in original_rows:
                        if gid in rebuilt_by_group:
                            comparison_line, formatted_line = rebuilt_by_group[gid]
                        elif not _row_has_selected_target(original_item):
                            comparison_line = _format_comparison_line(original_item, gid)
                            formatted_line = _format_cleaned_dataset_line(original_item)
                            passthrough_groups += 1
                        else:
                            continue

                        output_lines.append(comparison_line)
                        cleaned_data.append(formatted_line)
                        total_samples += 1
                        total_characters += len(formatted_line)
                else:
                    for comparison_line, formatted_line in rebuilt_by_group.values():
                        output_lines.append(comparison_line)
                        cleaned_data.append(formatted_line)
                        total_samples += 1
                        total_characters += len(formatted_line)

                logger.info(
                    f"会话重组完成: task_id={task_id}, 保留会话数={total_samples}, "
                    f"未命中清洗字段而原样保留的会话数={passthrough_groups}, "
                    f"因消息被过滤而丢弃的会话数={dropped_groups}"
                )

                # 回写 output_path：用重组后的数据替换 data-juicer 的原始拆行输出，
                # 使对比接口能通过 _cleaning_id（= group_id = "row_N"）正确匹配清洗前后数据
                if cleaning_task.output_path:
                    try:
                        with jfs.open(cleaning_task.output_path, 'w', encoding='utf-8') as _f:
                            for _line in output_lines:
                                _f.write(_line + '\n')
                        logger.info(f"已将重组后的数据回写至 output_path: {cleaning_task.output_path}")
                    except Exception as _e:
                        logger.warning(f"回写 output_path 失败（不影响数据集生成）: {_e}")

            else:
                # 普通平铺格式：保留 _cleaning_id 回写 output_path，同时构建去除内部字段的版本
                # prompt-response 格式每条需用 [] 包装；role-based 不需要
                output_lines = []
                processed_by_id: Dict[str, Dict[str, Any]] = {}
                for row_index, data in enumerate(raw_rows, 1):
                    if "_cleaning_id" not in data:
                        data["_cleaning_id"] = f"row_{row_index}"
                    processed_by_id[str(data.get("_cleaning_id"))] = data

                rows_to_write: List[Tuple[str, Dict[str, Any]]] = []
                if original_rows:
                    for gid, original_item in original_rows:
                        if not _row_has_selected_target(original_item):
                            rows_to_write.append((gid, original_item))
                        elif gid in processed_by_id:
                            rows_to_write.append((gid, processed_by_id[gid]))
                else:
                    rows_to_write = [
                        (str(data.get("_cleaning_id")), data)
                        for data in processed_by_id.values()
                    ]

                for gid, data in rows_to_write:
                    output_lines.append(_format_comparison_line(data, gid))
                    data = {k: v for k, v in data.items() if k not in _internal_keys}
                    if dataset_format == "prompt-response":
                        formatted_line = json.dumps([data], ensure_ascii=False)
                    else:
                        formatted_line = json.dumps(data, ensure_ascii=False)
                    cleaned_data.append(formatted_line)
                    total_samples += 1
                    total_characters += len(formatted_line)

                if cleaning_task.output_path:
                    try:
                        with jfs.open(cleaning_task.output_path, 'w', encoding='utf-8') as _f:
                            for _line in output_lines:
                                _f.write(_line + '\n')
                        logger.info(f"已将规范化后的平铺数据回写至 output_path: {cleaning_task.output_path}")
                    except Exception as _e:
                        logger.warning(f"回写 output_path 失败（不影响数据集生成）: {_e}")

            logger.info(f"读取数据完成: task_id={task_id}, total_samples={total_samples}, total_characters={total_characters}")
            
            # 即使清洗后数据为空，也要生成新版本（记录清洗结果）
            if not cleaned_data:
                logger.info(f"任务 {task_id} 清洗后没有数据，但仍会生成新版本数据集")
            
            # 根据 override 配置决定是覆盖还是创建新版本
            if cleaning_task.override:
                # 覆盖模式暂未实现，记录日志并跳过
                logger.info(f"任务 {task_id} 配置为覆盖模式，但覆盖功能暂未实现，跳过版本生成")
                return None
            else:
                # 新版本模式：创建新版本
                # source_dataset_info 已经在上面提取完成
                # 提取 cleaning_task 的属性，避免会话问题
                cleaning_task_info = {
                    'created_id': cleaning_task.created_id,
                    'created_by': cleaning_task.created_by,
                }
                logger.info(f"开始创建新版本数据集: task_id={task_id}, source_dataset_id={source_dataset_info['id']}")
                new_training_dataset = await self._create_new_training_dataset_version(
                    jfs=jfs,
                    source_dataset_info=source_dataset_info,
                    cleaned_data=cleaned_data,
                    total_samples=total_samples,
                    total_characters=total_characters,
                    training_dataset_mapper=self.training_dataset_mapper,
                    cleaning_task_info=cleaning_task_info,
                    db_session=generation_session
                )
                logger.info(f"新版本数据集创建成功: task_id={task_id}, new_dataset_id={new_training_dataset.id}, version={new_training_dataset.version}")

            cleaning_task.output_dataset_id = new_training_dataset.id
            await generation_session.commit()
            logger.info(
                f"数据清洗任务完成，生成新版本成功: task_id={task_id}, "
                f"new_training_dataset_id={new_training_dataset.id}"
            )
            return new_training_dataset.id
            
        except Exception as e:
            if generation_session:
                try:
                    await generation_session.rollback()
                except Exception:
                    pass
            logger.error(f"生成训练数据集新版本失败: {str(e)}", exc_info=True)
            # 不抛出异常，任务已完成，版本生成失败不影响任务状态
            return None
        finally:
            await _close_session_safely(generation_session)
    
    async def _create_new_training_dataset_version(
        self,
        jfs,
        source_dataset_info: Dict[str, Any],
        cleaned_data: list,
        total_samples: int,
        total_characters: int,
        training_dataset_mapper: TrainingDatasetMapper,
        cleaning_task_info: Dict[str, Any],
        db_session=None
    ) -> TrainingDataset:
        """新版本模式：创建新版本的训练数据集"""
        logger.info(f"开始创建新版本数据集: source_dataset_id={source_dataset_info['id']}, name={source_dataset_info['name']}, version={source_dataset_info['version']}")
        
        try:
            # 获取现有版本，生成新版本号
            logger.info(f"查询现有版本: project_id={source_dataset_info['project_id']}, name={source_dataset_info['name']}, usage={source_dataset_info['usage']}")
            existing_versions_stmt = (
                select(TrainingDataset.version)
                .filter(
                    TrainingDataset.project_id == source_dataset_info['project_id'],
                    TrainingDataset.name == source_dataset_info['name'],
                    TrainingDataset.usage == source_dataset_info['usage']
                )
                .order_by(TrainingDataset.id.desc())
            )
            current_tenant = app_runtime_context.get_tenant_id()
            if current_tenant:
                existing_versions_stmt = existing_versions_stmt.filter(TrainingDataset.tenant_id == current_tenant)
            if db_session is not None:
                existing_versions = await db_session.execute(existing_versions_stmt)
            else:
                existing_versions = await training_dataset_mapper.execute(existing_versions_stmt)
            versions = [row[0] for row in existing_versions.fetchall()]
            logger.info(f"找到现有版本: {versions}")
            
            # 生成新版本号
            new_version = self._generate_next_version(versions)
            logger.info(f"生成新版本号: {new_version}")
            
            # 生成新文件路径
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{source_dataset_info['project_id']}"
            logger.info(f"生成命名空间: {namespace}")
            
            # 使用训练数据集服务的路径生成方法（无需实例化）
            from app.services.training_dataset.training_dataset import DefaultTrainingDatasetService
            from app.schemas.training_task import TrainingTypeCategory
            from app.schemas.training_dataset import DatasetUsage
            
            # 将字符串类型转换为枚举类型
            dataset_type_str = source_dataset_info['dataset_type']
            dataset_type_enum = TrainingTypeCategory(dataset_type_str) if dataset_type_str else None
            usage_str = source_dataset_info['usage']
            usage_enum = DatasetUsage(usage_str) if usage_str else DatasetUsage.TRAINING
            
            new_dataset_path = DefaultTrainingDatasetService.generate_dataset_path(
                namespace, source_dataset_info['name'], new_version, 'jsonl', usage_enum, dataset_type_enum
            )
            logger.info(f"生成新数据集路径: {new_dataset_path}")
            
            # 确保目录存在
            remote_dir = os.path.dirname(new_dataset_path)
            if remote_dir and not jfs.exists(remote_dir):
                logger.info(f"创建目录: {remote_dir}")
                jfs.makedirs(remote_dir, exist_ok=True)
            
            # 写入新文件
            logger.info(f"写入数据文件: path={new_dataset_path}, total_samples={total_samples}")
            content = '\n'.join(cleaned_data) + '\n'
            with jfs.open(new_dataset_path, 'w', encoding='utf-8') as f:
                f.write(content)
            logger.info(f"数据文件写入成功: path={new_dataset_path}, file_size={len(content.encode('utf-8')) / (1024 * 1024):.2f}MB")
            from app.utils.dataset_file_parser import collect_metadata_fields_from_jsonl_iterable
            metadata_fields = collect_metadata_fields_from_jsonl_iterable(cleaned_data) if cleaned_data else []
            
            # 创建新的数据集记录
            logger.info(f"创建数据集记录: name={source_dataset_info['name']}, version={new_version}")
            new_dataset = TrainingDataset(
                name=source_dataset_info['name'],
                description=f"由数据清洗任务生成的新版本（基于 {source_dataset_info['version']}）",
                project_id=source_dataset_info['project_id'],
                version=new_version,
                dataset_type=source_dataset_info['dataset_type'],
                training_method_type=source_dataset_info['training_method_type'],
                dataset_format=source_dataset_info['dataset_format'],
                usage=source_dataset_info['usage'],
                dataset_config=source_dataset_info['dataset_config'],
                total_samples=total_samples,
                total_characters=total_characters,
                file_size=len(content.encode('utf-8')) / (1024 * 1024),
                dataset_path=new_dataset_path,
                metadata_fields=metadata_fields,
                created_id=cleaning_task_info.get('created_id'),
                created_by=cleaning_task_info.get('created_by')
            )
            
            if db_session is not None:
                new_dataset.tenant_id = app_runtime_context.get_tenant_id()
                logger.info(f"准备插入新数据集: name={new_dataset.name}, version={new_version}, tenant_id={new_dataset.tenant_id}")
                db_session.add(new_dataset)
                await db_session.flush()
                logger.info(f"flush 后获取到数据集ID: id={new_dataset.id}")
                if not new_dataset.id:
                    raise Exception(
                        f"无法获取新创建的数据集ID: project_id={source_dataset_info['project_id']}, "
                        f"name={source_dataset_info['name']}, version={new_version}"
                    )
                logger.info(f"创建训练数据集新版本成功: id={new_dataset.id}, version={new_version}, path={new_dataset_path}")
                return DatasetResult(new_dataset.id, new_version)

            # 插入新数据集记录（使用全新的数据库会话，避免复用可能已过期的 mapper session）
            insert_session = None
            try:
                insert_session = await _create_fresh_session()
                
                # 设置 tenant_id
                new_dataset.tenant_id = app_runtime_context.get_tenant_id()
                logger.info(f"准备插入新数据集: name={new_dataset.name}, version={new_version}, tenant_id={new_dataset.tenant_id}")
                
                # 添加到会话并持久化
                insert_session.add(new_dataset)
                await insert_session.flush()
                
                dataset_id = new_dataset.id
                logger.info(f"flush 后获取到数据集ID: id={dataset_id}")
                
                await insert_session.commit()
                logger.info(f"数据集插入事务已提交: id={dataset_id}")
                
                if dataset_id:
                    logger.info(f"创建训练数据集新版本成功: id={dataset_id}, version={new_version}, path={new_dataset_path}")
                    return DatasetResult(dataset_id, new_version)
                
                # flush 后没有 ID，尝试重新查询
                logger.warning("flush 后未获取到ID，尝试重新查询")
                query_session = await _create_fresh_session()
                try:
                    result = await query_session.execute(
                        select(TrainingDataset.id).filter(
                            TrainingDataset.project_id == source_dataset_info['project_id'],
                            TrainingDataset.name == source_dataset_info['name'],
                            TrainingDataset.version == new_version,
                            TrainingDataset.usage == source_dataset_info['usage'],
                            TrainingDataset.tenant_id == new_dataset.tenant_id
                        )
                    )
                    row = result.scalar_one_or_none()
                    if row:
                        logger.info(f"通过重新查询获取到数据集ID: id={row}")
                        return DatasetResult(row, new_version)
                    raise Exception(f"无法获取新创建的数据集ID: project_id={source_dataset_info['project_id']}, name={source_dataset_info['name']}, version={new_version}")
                finally:
                    await _close_session_safely(query_session)
            finally:
                await _close_session_safely(insert_session)
        except Exception as e:
            logger.error(f"创建新版本数据集失败: source_dataset_id={source_dataset_info.get('id', 'unknown')}, error={str(e)}", exc_info=True)
            raise
    
    def _generate_next_version(self, existing_versions: list) -> str:
        """根据现有版本号生成下一个版本号"""
        if not existing_versions:
            return "V2"  # 如果没有版本记录，从V2开始（假设原始是V1）
        
        # 解析版本号，找到最大的版本号
        max_version = 1
        for version in existing_versions:
            if version and version.startswith('V'):
                try:
                    version_num = int(version[1:])
                    max_version = max(max_version, version_num)
                except ValueError:
                    pass
        
        return f"V{max_version + 1}"

    async def _record_task_error(self, task_id: int, error_message: str) -> None:
        """记录任务错误信息到数据库"""
        error_session = None
        try:
            error_session = await _create_fresh_session()
            await error_session.execute(
                update(DataCleaningTask)
                .where(DataCleaningTask.id == task_id)
                .values(error_message=error_message)
            )
            await error_session.commit()
        except Exception as e:
            logger.warning(f"更新清洗任务错误信息失败: task_id={task_id}, error={str(e)}")
        finally:
            await _close_session_safely(error_session)

    async def get_data_cleaning_comparison(
        self,
        task_id: int,
        sample_count: int = 50,
    ) -> CleaningComparisonResponse:
        """获取清洗前后数据对比（随机采样）"""
        import random
        
        task = await self.task_mapper.query_one(
            select(DataCleaningTask).filter(DataCleaningTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"清洗任务不存在: {task_id}")
        
        if task.status != TaskStatus.COMPLETED:
            return CleaningComparisonResponse(
                task_id=task_id,
                comparisons=[]
            )
        
        if not task.dataset_path or not task.output_path:
            raise HTTPException(status_code=404, detail="输入或输出文件不存在")
        
        # 设置租户上下文
        from app.utils import app_runtime_context
        if task.tenant_id:
            app_runtime_context.set_tenant_id(task.tenant_id)
        
        # 限制采样数量
        sample_count = min(max(sample_count, 1), 200)
        
        try:
            jfs = await self._get_juicefs_client()
            IDENTIFIER_FIELD = "_cleaning_id"
            
            # 读取清洗前数据（行号从1开始，与清洗任务保持一致）
            before_data_list = []
            if not jfs.exists(task.dataset_path):
                raise HTTPException(status_code=404, detail="输入文件不存在")
            
            with jfs.open(task.dataset_path, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):  # 从1开始，与清洗任务保持一致
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        if isinstance(data, list) and len(data) > 0:
                            data = data[0]
                        if isinstance(data, dict):
                            # 确保有_cleaning_id字段（用于匹配，格式与清洗任务一致）
                            if IDENTIFIER_FIELD not in data:
                                data[IDENTIFIER_FIELD] = f"row_{line_num}"
                            before_data_list.append((line_num, data))
                    except json.JSONDecodeError:
                        continue
            
            # 读取清洗后数据（行号从1开始，与before_data保持一致）
            after_data_map = {}  # identifier -> (line_num, data)
            after_data_list = []
            
            if not jfs.exists(task.output_path):
                raise HTTPException(status_code=404, detail="输出文件不存在")
            
            with jfs.open(task.output_path, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):  # 从1开始，与before_data保持一致
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        # 与读取清洗前数据一致：支持列表格式 [{}] 和对象格式 {}
                        if isinstance(data, list) and len(data) > 0:
                            data = data[0]
                        if isinstance(data, dict):
                            after_data_list.append((line_num, data))
                            identifier = data.get(IDENTIFIER_FIELD)
                            if identifier:
                                after_data_map[identifier] = (line_num, data)
                    except json.JSONDecodeError:
                        continue

            before_identifiers = {
                data.get(IDENTIFIER_FIELD)
                for _, data in before_data_list
                if data.get(IDENTIFIER_FIELD)
            }
            has_matched_output = any(identifier in after_data_map for identifier in before_identifiers)
            if before_data_list and task.output_dataset_id and not has_matched_output:
                output_dataset = await self.training_dataset_mapper.query_one(
                    select(TrainingDataset).filter(TrainingDataset.id == task.output_dataset_id)
                )
                output_dataset_rows = []
                if output_dataset and output_dataset.dataset_path and jfs.exists(output_dataset.dataset_path):
                    with jfs.open(output_dataset.dataset_path, 'r', encoding='utf-8') as f:
                        for line in f:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                data = json.loads(line)
                                if isinstance(data, list) and len(data) > 0:
                                    data = data[0]
                                if isinstance(data, dict):
                                    output_dataset_rows.append(data)
                            except json.JSONDecodeError:
                                continue

                # 只在输出数据集与输入行数一致时按行号兜底，避免把真实过滤后的结果错配。
                if output_dataset_rows and len(output_dataset_rows) == len(before_data_list):
                    after_data_map = {}
                    after_data_list = []
                    for line_num, data in enumerate(output_dataset_rows, 1):
                        mapped_data = data.copy()
                        mapped_data[IDENTIFIER_FIELD] = f"row_{line_num}"
                        after_data_list.append((line_num, mapped_data))
                        after_data_map[mapped_data[IDENTIFIER_FIELD]] = (line_num, mapped_data)
                    logger.info(
                        f"清洗对比使用输出数据集按行号兜底匹配: "
                        f"task_id={task_id}, output_dataset_id={task.output_dataset_id}, rows={len(output_dataset_rows)}"
                    )
            
            # 随机采样before_data并匹配after_data
            comparisons = []
            if before_data_list:
                sampled_before = random.sample(before_data_list, min(sample_count, len(before_data_list)))
                
                for before_index, before_data in sampled_before:
                    after_data = None
                    after_index = None
                    status = "filtered"
                    changes = None
                    filter_reason = None
                    
                    # 尝试通过identifier匹配
                    identifier = before_data.get(IDENTIFIER_FIELD)
                    if identifier and identifier in after_data_map:
                        after_index, after_data = after_data_map[identifier]
                        changes = self._compare_fields(before_data, after_data, IDENTIFIER_FIELD)
                        status = "modified" if changes else "kept"
                    else:
                        # 如果没有匹配到，说明被过滤了
                        filter_reason = "数据在清洗过程中被过滤"
                    
                    # 移除标识字段
                    before_data_clean = {k: v for k, v in before_data.items() if k != IDENTIFIER_FIELD}
                    after_data_clean = {k: v for k, v in after_data.items() if k != IDENTIFIER_FIELD} if after_data else None
                    
                    comparisons.append(DataComparisonItem(
                        mapping_key=identifier if identifier else before_index,
                        before_data=before_data_clean,
                        before_index=before_index,
                        after_data=after_data_clean,
                        after_index=after_index,
                        status=status,
                        changes=changes,
                        filter_reason=filter_reason
                    ))
            
            return CleaningComparisonResponse(
                task_id=task_id,
                comparisons=comparisons
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"获取数据对比失败: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"获取数据对比失败: {str(e)}")
    
    def _compare_fields(
        self,
        before: Dict[str, Any],
        after: Dict[str, Any],
        identifier_field: str = "_cleaning_id"
    ) -> Optional[Dict[str, Any]]:
        """对比两个数据对象的字段变化（排除标识字段）"""
        changes = {}
        
        # 获取所有字段的并集（排除标识字段）
        all_fields = set(before.keys()) | set(after.keys())
        all_fields.discard(identifier_field)
        
        for field in all_fields:
            before_value = before.get(field)
            after_value = after.get(field)
            
            if field not in before:
                # 新增字段
                changes[field] = {
                    "before": None,
                    "after": after_value,
                    "change_type": "added"
                }
            elif field not in after:
                # 删除字段
                changes[field] = {
                    "before": before_value,
                    "after": None,
                    "change_type": "deleted"
                }
            elif before_value != after_value:
                # 修改字段
                changes[field] = {
                    "before": before_value,
                    "after": after_value,
                    "change_type": "modified"
                }
        
        return changes if changes else None
