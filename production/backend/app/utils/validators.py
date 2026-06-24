"""
通用验证工具模块
封装常用的数据库实体验证逻辑，减少代码重复
"""
import os
from enum import Enum
from typing import Dict, List, Optional
import juicefs
from fastapi import HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Project, User, Notebook
from app.models.model_manager import BaseModel, TrainedModel
from app.models.training_task_manager import TrainingTask
from app.models.training_dataset_manager import TrainingDataset
from app.models.label_manager import LabelDataset, LabelTask
from app.models.data_cleaning_manager import DataCleaningTask
from app.schemas.inference_result import InferenceResultDatasetExportType, InferenceDatasetUsage
from app.schemas.inference_task import BackendEnum, ModelSourceEnum
from app.schemas.model import ModelType, ModelProvider, MlTaskType
from app.schemas.training_task import TrainingTypeCategory, TrainingMethodType
from app.schemas.training_dataset import DatasetFormat, DatasetUsage, DatasetProcessingStatus, TrainingDatasetUploadTypeCategory, \
    TrainingDatasetExportTypeCategory
from app.schemas.chunk_upload import ChunkUploadFileUsage
from app.schemas.label import LabelTaskStatus
from app.common.status import TaskStatus
from app.utils.model_verify_format_utils import ModelRepositoryScanner
from app.utils.storage_enum import StoragePath
from app.utils.storage_utils import StorageUtils


def _format_training_dataset_usage(usage: Optional[str]) -> str:
    """返回数据集用途的中文名称，用于错误提示。"""
    if usage is None:
        return "数据集"
    try:
        return DatasetUsage(usage).description
    except ValueError:
        return f"{usage} 数据集"


async def validate_project_exists(db: AsyncSession, project_id: int) -> Project:
    """验证项目是否存在
    
    Args:
        db: 数据库会话
        project_id: 项目ID
        
    Returns:
        Project: 项目对象
        
    Raises:
        HTTPException: 如果项目不存在则抛出404错误
    """
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail=f"项目不存在：{project_id}")
    
    return project


async def validate_user_exists(db: AsyncSession, user_id: int) -> User:
    """验证用户是否存在
    
    Args:
        db: 数据库会话
        user_id: 用户ID
        
    Returns:
        User: 用户对象
        
    Raises:
        HTTPException: 如果用户不存在则抛出404错误
    """
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail=f"用户不存在：{user_id}")
    
    return user


async def validate_base_model_exists(db: AsyncSession, base_model_id: int) -> BaseModel:
    """验证基础模型是否存在
    
    Args:
        db: 数据库会话
        base_model_id: 基础模型ID
        
    Returns:
        BaseModel: 基础模型对象
        
    Raises:
        HTTPException: 如果基础模型不存在则抛出404错误
    """
    result = await db.execute(select(BaseModel).filter(BaseModel.id == base_model_id))
    base_model = result.scalar_one_or_none()
    
    if not base_model:
        raise HTTPException(status_code=404, detail=f"基础模型不存在：{base_model_id}")
    
    return base_model


async def validate_trained_model_exists(db: AsyncSession, trained_model_id: int) -> TrainedModel:
    """验证训练模型是否存在
    
    Args:
        db: 数据库会话
        trained_model_id: 训练模型ID
        
    Returns:
        TrainedModel: 训练模型对象
        
    Raises:
        HTTPException: 如果训练模型不存在则抛出404错误
    """
    result = await db.execute(select(TrainedModel).filter(TrainedModel.id == trained_model_id))
    trained_model = result.scalar_one_or_none()
    
    if not trained_model:
        raise HTTPException(status_code=404, detail=f"训练模型不存在：{trained_model_id}")
    
    return trained_model


async def validate_training_task_exists(db: AsyncSession, task_id: int) -> TrainingTask:
    """验证训练任务是否存在
    
    Args:
        db: 数据库会话
        task_id: 训练任务ID
        
    Returns:
        TrainingTask: 训练任务对象
        
    Raises:
        HTTPException: 如果训练任务不存在则抛出404错误
    """
    result = await db.execute(select(TrainingTask).filter(TrainingTask.id == task_id))
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(status_code=404, detail=f"训练任务不存在：{task_id}")
    
    return task


async def validate_training_dataset_exists(db: AsyncSession, dataset_id: int) -> TrainingDataset:
    """验证训练数据集是否存在
    
    Args:
        db: 数据库会话
        dataset_id: 训练数据集ID
        
    Returns:
        TrainingDataset: 训练数据集对象
        
    Raises:
        HTTPException: 如果训练数据集不存在则抛出404错误
    """
    result = await db.execute(select(TrainingDataset).filter(TrainingDataset.id == dataset_id))
    dataset = result.scalar_one_or_none()
    
    if not dataset:
        raise HTTPException(status_code=404, detail=f"训练数据集不存在：{dataset_id}")
    
    return dataset


async def validate_project_access(db: AsyncSession, project_id: int, user_id: Optional[int] = None) -> Project:
    """验证项目访问权限（目前只验证项目存在，后续可扩展权限检查）
    
    Args:
        db: 数据库会话
        project_id: 项目ID
        user_id: 用户ID（可选，用于后续权限检查扩展）
        
    Returns:
        Project: 项目对象
        
    Raises:
        HTTPException: 如果项目不存在或无权限访问则抛出相应错误
    """
    project = await validate_project_exists(db, project_id)
    
    # TODO: 后续可以在这里添加项目权限检查逻辑
    # if user_id and not has_project_permission(project, user_id):
    #     raise HTTPException(status_code=403, detail="无权限访问该项目")
    
    return project


async def validate_training_task_by_name_version(
    db: AsyncSession, 
    project_id: int, 
    task_name: str, 
    task_version: str
) -> TrainingTask:
    """根据项目ID、任务名称和版本验证训练任务是否存在
    
    Args:
        db: 数据库会话
        project_id: 项目ID
        task_name: 任务名称
        task_version: 任务版本
        
    Returns:
        TrainingTask: 训练任务对象
        
    Raises:
        HTTPException: 如果训练任务不存在则抛出404错误
    """
    from sqlalchemy import and_
    
    result = await db.execute(
        select(TrainingTask).filter(
            and_(
                TrainingTask.project_id == project_id,
                TrainingTask.name == task_name,
                TrainingTask.version == task_version
            )
        )
    )
    task = result.scalar_one_or_none()
    
    if not task:
        raise HTTPException(
            status_code=404,
            detail=f"训练任务 '{task_name}' 版本 '{task_version}' 在项目 {project_id} 中不存在"
        )
    
    return task


async def validate_training_dataset_by_name_version(
    db: AsyncSession, 
    project_id: int, 
    dataset_name: str, 
    dataset_version: str
) -> TrainingDataset:
    """根据项目ID、数据集名称和版本验证训练数据集是否存在
    
    Args:
        db: 数据库会话
        project_id: 项目ID
        dataset_name: 数据集名称
        dataset_version: 数据集版本
        
    Returns:
        TrainingDataset: 训练数据集对象
        
    Raises:
        HTTPException: 如果训练数据集不存在则抛出404错误
    """
    from sqlalchemy import and_
    
    result = await db.execute(
        select(TrainingDataset).filter(
            and_(
                TrainingDataset.project_id == project_id,
                TrainingDataset.name == dataset_name,
                TrainingDataset.version == dataset_version
            )
        )
    )
    dataset = result.scalar_one_or_none()
    
    if not dataset:
        raise HTTPException(
            status_code=404,
            detail=f"训练数据集 '{dataset_name}' 版本 '{dataset_version}' 在项目 {project_id} 中不存在"
        )
    
    return dataset


async def validate_training_dataset_by_name_version_usage(
        db: AsyncSession,
        project_id: int,
        dataset_name: str,
        dataset_version: str,
        usage: Optional[str] = None
)->TrainingDataset:
    """根据项目ID、数据集名称、版本以及数据集用途验证训练数据集是否存在

    Args:
        db: 数据库会话
        project_id: 项目ID
        dataset_name: 数据集名称
        dataset_version: 数据集版本
        usage: 数据集用途

    Returns:
        TrainingDataset: 训练数据集对象

    Raises:
        HTTPException: 如果训练数据集不存在则抛出404错误
    """
    from sqlalchemy import and_

    # 构建基础查询条件（必填参数）
    query = select(TrainingDataset).filter(
        and_(
            TrainingDataset.project_id == project_id,
            TrainingDataset.name == dataset_name,
            TrainingDataset.version == dataset_version
        )
    )

    # 如果提供了 usage 参数，则添加 usage 筛选条件
    if usage is not None:
        query = query.filter(TrainingDataset.usage == usage)

    result = await db.execute(query)
    dataset = result.scalar_one_or_none()

    if not dataset:
        usage_desc = _format_training_dataset_usage(usage)
        raise HTTPException(
            status_code=404,
            detail=f"{usage_desc} '{dataset_name}' 版本 '{dataset_version}' 在项目 {project_id} 中不存在"
        )

    return dataset


async def validate_training_dataset_by_name_version_usage_not_exists(
        db: AsyncSession,
        project_id: int,
        dataset_name: str,
        dataset_version: str,
        usage: Optional[str] = None
):
    """根据项目ID、数据集名称和版本验证训练数据集是否已经存在

    验证同项目、同名称、同版本的数据集是否已存在。如果提供了 usage 参数，则同时按 usage 进行筛选。
    如果数据集已存在，则抛出异常。

    Args:
        db: 数据库会话（必填）
        project_id: 项目ID（必填）
        dataset_name: 数据集名称（必填）
        dataset_version: 数据集版本（必填）
        usage: 数据集用途（可选），如果提供则作为查询条件

    Returns:
        None: 如果数据集不存在则正常返回

    Raises:
        HTTPException: 如果训练数据集已存在则抛出400错误
    """
    from sqlalchemy import and_

    # 构建基础查询条件（必填参数）
    query = select(TrainingDataset).filter(
        and_(
            TrainingDataset.project_id == project_id,
            TrainingDataset.name == dataset_name,
            TrainingDataset.version == dataset_version
        )
    )

    # 如果提供了 usage 参数，则添加 usage 筛选条件
    if usage is not None:
        query = query.filter(TrainingDataset.usage == usage)

    result = await db.execute(query)
    dataset = result.scalar_one_or_none()

    if dataset:
        usage_desc = _format_training_dataset_usage(dataset.usage)
        raise HTTPException(
            status_code=400,
            detail=f"{usage_desc} '{dataset_name}' 版本 '{dataset_version}' 已存在"
        )


def validate_dataset_upload_file_type(dataset_upload_file_type: str, dataset_type: str):
    """校验数据集文件类型是否合法

    规则：
    - 图像理解：仅支持zip格式
    - 文本生成：支持jsonl、json、xlsx、csv格式
    - 业务数据集: 支持jsonl、json、xlsx、csv格式
    - 不能为空

    Args:
        dataset_upload_file_type: 文件类型（jsonl，json等）
        dataset_type: 训练类型/数据集类型（image-understanding，text-generation等）
    """
    # 文本生成格式校验
    if dataset_type == TrainingTypeCategory.TEXT_GENERATION:
        if dataset_upload_file_type.lower() not in [
            TrainingDatasetUploadTypeCategory.JSONL_TYPE,
            TrainingDatasetUploadTypeCategory.JSON_TYPE,
            TrainingDatasetUploadTypeCategory.XLSX_TYPE,
            TrainingDatasetUploadTypeCategory.CSV_TYPE
        ]:
            raise HTTPException(
                status_code=400,
                detail=f"文件格式错误：当前类型数据集不支持{dataset_upload_file_type}格式"
            )
    # 图像理解格式校验
    elif dataset_type == TrainingTypeCategory.IMAGE_UNDERSTANDING:
        if dataset_upload_file_type.lower() not in [
            TrainingDatasetUploadTypeCategory.ZIP_TYPE
        ]:
            raise HTTPException(
                status_code=400,
                detail=f"文件格式错误：当前类型数据集不支持{dataset_upload_file_type}格式"
            )

    # 业务数据集格式校验
    elif dataset_type == TrainingTypeCategory.BUSINESS:
        if dataset_upload_file_type.lower() not in [
            TrainingDatasetUploadTypeCategory.JSONL_TYPE,
            TrainingDatasetUploadTypeCategory.JSON_TYPE,
            TrainingDatasetUploadTypeCategory.XLSX_TYPE,
            TrainingDatasetUploadTypeCategory.CSV_TYPE
        ]:
            raise HTTPException(
                status_code=400,
                detail=f"文件格式错误：当前类型数据集不支持{dataset_upload_file_type}格式"
            )
# ==================== 枚举验证函数 ====================

def create_enum_validator(enum_class, param_name: str):
    """创建枚举验证函数的工厂函数"""
    def validator(value: Optional[str] = None) -> Optional[enum_class]:
        """验证枚举参数，只允许有效枚举值或空字符串/None"""
        if value is None or value == "":
            return None
        try:
            return enum_class(value)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"无效的{param_name}: {value}。有效值: {[e.value for e in enum_class]}"
            )
    return validator


# 具体的枚举验证函数
def validate_model_type(model_type: Optional[str] = Query(None, description="按模型类型筛选，空字符串表示不筛选", enum=[e.value for e in ModelType] + [""])) -> Optional[ModelType]:
    """验证模型类型参数"""
    return create_enum_validator(ModelType, "模型类型")(model_type)


def validate_model_provider(model_provider: Optional[str] = Query(None, description="按模型提供商筛选，空字符串表示不筛选", enum=[e.value for e in ModelProvider] + [""])) -> Optional[ModelProvider]:
    """验证模型提供商参数"""
    return create_enum_validator(ModelProvider, "模型提供商")(model_provider)


def validate_training_type_category(train_type_category: Optional[str] = Query(None, description="按训练类型分类筛选，空字符串表示不筛选", enum=[e.value for e in TrainingTypeCategory] + [""])) -> Optional[TrainingTypeCategory]:
    """验证训练类型分类参数（用于训练任务）"""
    return create_enum_validator(TrainingTypeCategory, "训练类型分类")(train_type_category)


def validate_dataset_type_category(dataset_type: Optional[str] = Query(None, description="按数据集类型筛选，空字符串表示不筛选", enum=[e.value for e in TrainingTypeCategory] + [""])) -> Optional[TrainingTypeCategory]:
    """验证数据集类型参数（用于训练数据集）"""
    return create_enum_validator(TrainingTypeCategory, "数据集类型")(dataset_type)


def validate_training_method_type(training_method_type: Optional[str] = Query(None, description="按训练方法类型筛选，空字符串表示不筛选", enum=[e.value for e in TrainingMethodType] + [""])) -> Optional[TrainingMethodType]:
    """验证训练方法类型参数"""
    return create_enum_validator(TrainingMethodType, "训练方法类型")(training_method_type)


def validate_training_task_status(status: Optional[str] = Query(None, description="按训练任务状态筛选，空字符串表示不筛选", enum=[e.value for e in TaskStatus] + [""])) -> Optional[TaskStatus]:
    """验证训练任务状态参数"""
    return create_enum_validator(TaskStatus, "训练任务状态")(status)


def validate_dataset_format(dataset_format: Optional[str] = Query(None, description="按数据集格式筛选，空字符串表示不筛选", enum=[e.value for e in DatasetFormat] + [""])) -> Optional[DatasetFormat]:
    """验证数据集格式参数"""
    return create_enum_validator(DatasetFormat, "数据集格式")(dataset_format)


def validate_dataset_usage(usage: Optional[str] = Query(None, description="按数据集用途筛选，空字符串表示不筛选", enum=[e.value for e in DatasetUsage] + [""])) -> Optional[DatasetUsage]:
    """验证数据集用途参数"""
    return create_enum_validator(DatasetUsage, "数据集用途")(usage)


def validate_dataset_usage_for_filtered(
    usage: Optional[str] = Query(
        None,
        description="按数据集用途筛选；不传或空字符串时返回空分页，须传具体用途",
        enum=[e.value for e in DatasetUsage] + [""],
    ),
) -> Optional[DatasetUsage]:
    """训练集 filtered 列表：与 validate_dataset_usage 解析规则相同，文档说明区分于其他必填 usage 的接口。"""
    return create_enum_validator(DatasetUsage, "数据集用途")(usage)


def validate_inference_dataset_usage(usage: Optional[str] = Query(None, description="按推理结果集用途筛选，空字符串表示不筛选", enum=[e.value for e in InferenceDatasetUsage] + [""])) -> Optional[InferenceDatasetUsage]:
    """验证推理结果数据集用途参数"""
    return create_enum_validator(InferenceDatasetUsage, "推理结果集用途")(usage)


def validate_dataset_processing_status(processing_status: Optional[str] = Query(None, description="按数据集处理状态筛选，空字符串表示不筛选", enum=[e.value for e in DatasetProcessingStatus] + [""])) -> Optional[DatasetProcessingStatus]:
    """验证数据集处理状态参数"""
    return create_enum_validator(DatasetProcessingStatus, "数据集处理状态")(processing_status)


def validate_model_source(model_source: Optional[str] = Query(None, description="按模型来源筛选，空字符串表示不筛选", enum=[e.value for e in ModelSourceEnum] + [""])) -> Optional[ModelSourceEnum]:
    """验证模型来源参数"""
    return create_enum_validator(ModelSourceEnum, "模型来源")(model_source)


def validate_model_source_list(
    model_source: Optional[List[str]] = Query(
        None,
        description="按模型来源筛选，可重复传参多选（如 model_source=base_model&model_source=ml_model）；不传则不筛选",
    ),
) -> Optional[List[ModelSourceEnum]]:
    """验证模型来源多选查询参数"""
    if not model_source:
        return None
    out: List[ModelSourceEnum] = []
    for v in model_source:
        if v is None or v == "":
            continue
        try:
            out.append(ModelSourceEnum(v))
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"无效的模型来源: {v}。有效值: {[e.value for e in ModelSourceEnum]}",
            )
    return out or None


def validate_inference_engine_type(
    inference_engine_type: Optional[str] = Query(
        None,
        description="按推理引擎类型筛选，空字符串表示不筛选",
        enum=[e.value for e in BackendEnum] + [""],
    ),
) -> Optional[BackendEnum]:
    """验证单个推理引擎类型筛选参数"""
    return create_enum_validator(BackendEnum, "推理引擎类型")(inference_engine_type)


def validate_inference_engine_type_list(
    inference_engine_type: Optional[List[str]] = Query(
        None,
        description="按推理引擎类型筛选，可重复传参多选（如 inference_engine_type=vLLM&inference_engine_type=ML）；不传则不筛选",
    ),
) -> Optional[List[BackendEnum]]:
    """验证推理引擎类型多选查询参数"""
    if not inference_engine_type:
        return None
    out: List[BackendEnum] = []
    for v in inference_engine_type:
        if v is None or v == "":
            continue
        try:
            out.append(BackendEnum(v))
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"无效的推理引擎类型: {v}。有效值: {[e.value for e in BackendEnum]}",
            )
    return out or None


def validate_ml_backend_usage(
    usage: Optional[str] = Query(
        None,
        description="按 ml_models.task_type（MlTaskType）筛选，仅匹配 model_source=ml_model；含本地上传模型，不要求关联 Notebook",
        enum=[e.value for e in MlTaskType] + [""],
    ),
) -> Optional[MlTaskType]:
    """验证推理任务列表按 ML 模型任务子类型筛选（与 ml_models.task_type 一致）"""
    return create_enum_validator(MlTaskType, "ML 任务子类型")(usage)


def validate_task_status(status: Optional[str] = Query(None, description="按任务状态筛选，空字符串表示不筛选", enum=[e.value for e in TaskStatus] + [""])) -> Optional[TaskStatus]:
    """验证任务状态参数"""
    return create_enum_validator(TaskStatus, "任务状态")(status)


def validate_chunk_upload_usage(usage: Optional[str] = Query(None, description="按分片上传文件用途筛选，空字符串表示公共用途", enum=[e.value for e in ChunkUploadFileUsage] + [""])) -> ChunkUploadFileUsage:
    """验证分片上传文件用途参数，如果未传入则默认为公共用途"""
    result = create_enum_validator(ChunkUploadFileUsage, "分片上传文件用途")(usage)
    # 如果结果为 None（即传入 None 或空字符串），返回 PUBLIC
    return result if result is not None else ChunkUploadFileUsage.PUBLIC


def validate_dataset_export_type(export_type: Optional[str] = Query(None, description="验证数据集导出格式参数，如果未传入则默认为JSONL", enum=[e.value for e in TrainingDatasetExportTypeCategory] + [""])) -> TrainingDatasetExportTypeCategory:
    """验证数据集导出格式参数，如果未传入则默认为JSONL"""
    result = create_enum_validator(TrainingDatasetExportTypeCategory, "数据集导出格式")(export_type)
    # 如果结果为 None（即传入 None 或空字符串），返回 PUBLIC
    return result if result is not None else TrainingDatasetExportTypeCategory.JSONL_TYPE


def validate_inference_result_export_type(export_type: Optional[str] = Query(None, description="验证推理结果集导出格式参数，如果未传入则默认为JSONL", enum=[e.value for e in InferenceResultDatasetExportType] + [""])) -> InferenceResultDatasetExportType:
    """验证推理结果集导出格式参数，如果未传入则默认为JSONL"""
    result = create_enum_validator(InferenceResultDatasetExportType, "数据集导出格式")(export_type)
    # 如果结果为 None（即传入 None 或空字符串），返回 PUBLIC
    return result if result is not None else InferenceResultDatasetExportType.JSONL_TYPE


# ==================== 数据集占用检查 ====================


class DatasetTaskCreationKind(str, Enum):
    """创建任务时数据集互斥检查：标注任务只查清洗占用，清洗任务只查标注占用。"""

    LABEL = "label"
    CLEANING = "cleaning"


# 标注任务进行中的状态
LABEL_TASK_IN_PROGRESS_STATUSES = [
    LabelTaskStatus.CREATED.value,
    LabelTaskStatus.IN_PROGRESS.value
]

# 清洗任务进行中的状态
CLEANING_TASK_IN_PROGRESS_STATUSES = [
    TaskStatus.CREATED.value,
    TaskStatus.PENDING.value,
    TaskStatus.PREPARING.value,
    TaskStatus.RUNNING.value
]


async def query_dataset_in_use(
    db: AsyncSession,
    dataset_name: str,
    project_id: int,
    version: str
) -> dict:
    """查询数据集是否正在被标注或清洗任务使用
    
    此函数会检查指定版本的数据集是否正在被进行中的标注任务或清洗任务使用。
    返回使用中的任务信息，供前端查询使用。
    
    Args:
        db: 数据库会话
        dataset_name: 数据集名称
        project_id: 项目ID
        version: 数据集版本
        
    Returns:
        dict: 包含以下字段
            - in_use: bool, 是否被使用
            - task_type: str | None, 任务类型 (label/cleaning)
            - task_id: int | None, 任务ID
            - task_name: str | None, 任务名称
            - version: str, 数据集版本
    """
    from sqlalchemy import and_
    
    # 查询指定版本的数据集ID
    result = await db.execute(
        select(TrainingDataset.id).filter(
            and_(
                TrainingDataset.project_id == project_id,
                TrainingDataset.name == dataset_name,
                TrainingDataset.version == version
            )
        )
    )
    dataset_id = result.scalar_one_or_none()
    
    if not dataset_id:
        return {"in_use": False, "task_type": None, "task_id": None, "task_name": None, "version": version}
    
    # 检查标注任务
    result = await db.execute(
        select(LabelTask, LabelDataset.name).join(
            LabelDataset,
            LabelTask.label_dataset_id == LabelDataset.id
        ).filter(
            and_(
                LabelDataset.source_dataset_id == dataset_id,
                LabelTask.status.in_(LABEL_TASK_IN_PROGRESS_STATUSES)
            )
        )
    )
    label_result = result.first()
    
    if label_result:
        label_task, label_task_name = label_result
        return {
            "in_use": True,
            "task_type": "label",
            "task_id": label_task.id,
            "task_name": label_task_name,
            "version": version
        }
    
    # 检查清洗任务
    result = await db.execute(
        select(DataCleaningTask).filter(
            and_(
                DataCleaningTask.input_dataset_id == dataset_id,
                DataCleaningTask.status.in_(CLEANING_TASK_IN_PROGRESS_STATUSES)
            )
        )
    )
    cleaning_task = result.scalar_one_or_none()
    
    if cleaning_task:
        return {
            "in_use": True,
            "task_type": "cleaning",
            "task_id": cleaning_task.id,
            "task_name": cleaning_task.name,
            "version": version
        }
    
    return {"in_use": False, "task_type": None, "task_id": None, "task_name": None, "version": version}


async def check_dataset_in_use(
    db: AsyncSession,
    dataset_name: str,
    project_id: int,
    version: str,
    *,
    creating: DatasetTaskCreationKind,
) -> None:
    """创建任务前检查数据集与另一类任务的互斥占用。

    - **创建标注任务**（``DatasetTaskCreationKind.LABEL``）：仅判断该数据集是否被**进行中的清洗任务**作为输入使用。
    - **创建清洗任务**（``DatasetTaskCreationKind.CLEANING``）：仅判断该数据集是否被**进行中的标注任务**作为来源使用。

    不再互相检查「同类任务」占用（例如多个标注任务可共用同一来源数据集的语义由业务另行约束）。

    Args:
        db: 数据库会话
        dataset_name: 数据集名称
        project_id: 项目ID
        version: 数据集版本
        creating: 正在创建的任务类型

    Raises:
        HTTPException: 若存在上述互斥占用则抛出 400
    """
    from sqlalchemy import and_

    # 查询指定版本的数据集ID
    result = await db.execute(
        select(TrainingDataset.id).filter(
            and_(
                TrainingDataset.project_id == project_id,
                TrainingDataset.name == dataset_name,
                TrainingDataset.version == version
            )
        )
    )
    dataset_id = result.scalar_one_or_none()

    if not dataset_id:
        return

    if creating == DatasetTaskCreationKind.LABEL:
        # 标注任务：只拦「被清洗任务占用」
        result = await db.execute(
            select(DataCleaningTask).filter(
                and_(
                    DataCleaningTask.input_dataset_id == dataset_id,
                    DataCleaningTask.status.in_(CLEANING_TASK_IN_PROGRESS_STATUSES),
                )
            )
        )
        cleaning_task = result.scalar_one_or_none()
        if cleaning_task:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"数据集 '{dataset_name}' (版本: {version}) 正在被清洗任务 "
                    f"'{cleaning_task.name}' 使用，无法创建标注任务"
                ),
            )
        return

    # creating == CLEANING：只拦「被标注任务占用」
    result = await db.execute(
        select(LabelTask, LabelDataset.name).join(
            LabelDataset,
            LabelTask.label_dataset_id == LabelDataset.id,
        ).filter(
            and_(
                LabelDataset.source_dataset_id == dataset_id,
                LabelTask.status.in_(LABEL_TASK_IN_PROGRESS_STATUSES),
            )
        )
    )
    label_result = result.first()
    if label_result:
        _label_task, label_task_name = label_result
        raise HTTPException(
            status_code=400,
            detail=(
                f"数据集 '{dataset_name}' (版本: {version}) 正在被标注任务 "
                f"'{label_task_name}' 使用，无法创建清洗任务"
            ),
        )


async def validate_notebook_exists(db: AsyncSession, notebook_id: int) -> Notebook:
    """验证notebook任务是否存在

    Args:
        db: 数据库会话
        notebook_id: notebook任务ID

    Returns:
        BaseModel: notebook info

    Raises:
        HTTPException: 如果notebook不存在则抛出404错误
    """
    result = await db.execute(select(Notebook).filter(Notebook.id == notebook_id))
    notebook = result.scalar_one_or_none()

    if not notebook:
        raise HTTPException(status_code=404, detail=f"notebook任务不存在：{notebook_id}")

    return notebook

async def validate_llm_models_available(db: AsyncSession, jfs: juicefs.Client, notebook_id: int, notebook_path: str) -> Dict:
    """验证notebook文件地址是否可用的llm_models

    Args:
        db: 数据库会话
        notebook_id: notebook任务ID

    Returns:
        Model_info: model info

    Raises:
        HTTPException: 如果notebook不存在则抛出404错误
        HTTPException: 如果文件存在问题则抛出400错误
    """
    try:
        result = await db.execute(select(Notebook).filter(Notebook.id == notebook_id))
        notebook = result.scalar_one_or_none()

        if not notebook:
            raise HTTPException(status_code=404, detail=f"notebook任务不存在：{notebook_id}")

        # 构建源路径（notebook任务输出）
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{notebook.project_id}"
        unregistered_base = StoragePath.NOTEBOOK_WORK.format_storage_path(
            project_name=namespace,
            instance_name=f"notebook-{notebook_id}"
        )
        source_path = f"{unregistered_base}{notebook_path}"
        files = StorageUtils.list_files(jfs=jfs, remote_path=source_path, recursive=False)
        files_names = []
        sizes = {}


        for obj in files:
            name = obj['name'].split("/")[-1]

            files_names.append(name)

            sizes[name] = obj['size']

        def read_file(name: str):

            path = f"{source_path}/{name}"

            with jfs.open(path, "r") as f:
                return f.read()

        scanner = ModelRepositoryScanner(
            files_names,
            sizes,
            read_file
        )
        return scanner.scan_dict()
    except Exception:
        raise HTTPException(status_code=400, detail=f"选择的文件不是可用模型：{notebook_path}")
