"""
评估任务相关的Celery任务
"""

import logging
import json
import os
import asyncio
from typing import Optional, List

from celery.exceptions import TaskRevokedError
from sqlalchemy import select

from app.common.status import TaskStatus, AnnotationStatus
from app.repository.base_mapper import BaseMapper
from app.schemas.evaluation_task import EvaluationMethod
from app.schemas.repository_image import CardType, CardModel
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.services.storage.interface import StorageService
from app.utils import app_runtime_context

logger = logging.getLogger(__name__)

from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.utils.storage_enum import StoragePath
from app.database.base import SessionLocal
from app.database.database_depends import run_async_in_celery
from app.models.evaluation_task_manager import EvaluationTask
from app.models.models import KubernetesResource, ProjectKubernetesRelation
from app.utils.k8s_launcher import K8sLauncher
from app.services.storage.storage import DefaultStorageService
from app.repository.storage import StorageMapper
from app.database.database_depends import Database


# ========== 模块级辅助函数 ==========

def get_storage_service() -> DefaultStorageService:
    """在 Celery worker 中获取 StorageService 实例"""
    db = Database()
    storage_mapper = StorageMapper(db=db)
    return DefaultStorageService(mapper=storage_mapper)


async def handle_stop_word(task_id: int, source_file_path: str, target_dir_path: str, 
                           storage_service: StorageService, base_mapper: BaseMapper) -> None:
    """
    处理停用词文件：将项目级别的停用词文件复制到任务级别，并更新数据库
    
    Args:
        task_id: 评估任务ID
        source_file_path: 源文件路径（项目级别的停用词文件路径）
        target_dir_path: 目标目录路径（任务级别的目录路径）
        storage_service: 存储服务实例
        base_mapper: 数据库映射器实例
    """
    import os
    
    try:
        # 1. 获取 JuiceFS 客户端
        jfs = await storage_service.JUICEFS_CLIENT(app_runtime_context.get_tenant_id())
        
        # 2. 验证源文件是否存在
        if not jfs.exists(source_file_path) or source_file_path is None or source_file_path == '':
            logger.warning(f"停用词源文件不存在: {source_file_path}，跳过处理")
            return
        
        # 3. 提取文件名
        source_filename = os.path.basename(source_file_path)
        if not source_filename:
            # 如果无法提取文件名，使用默认名称
            source_filename = "stopwords.txt"
        
        # 4. 构建目标文件路径（在目标目录下，使用相同的文件名）
        # 确保目标目录路径以 / 结尾
        target_dir_path = target_dir_path.rstrip("/") + "/"
        target_file_path = f"{target_dir_path}{source_filename}"
        
        # 5. 确保目标目录存在
        try:
            jfs.makedirs(target_dir_path, exist_ok=True)
        except Exception as e:
            logger.warning(f"创建目标目录失败 {target_dir_path}: {e}")
        
        # 6. 复制文件：读取源文件内容，写入目标文件
        try:
            with jfs.open(source_file_path, 'rb') as source_file:
                file_content = source_file.read()
            
            with jfs.open(target_file_path, 'wb') as target_file:
                target_file.write(file_content)
            
            logger.info(f"停用词文件复制成功: {source_file_path} -> {target_file_path}")
        except Exception as e:
            logger.error(f"复制停用词文件失败: {e}")
            raise
        
        # 7. 删除源文件
        try:
            jfs.remove(source_file_path)
            logger.info(f"已删除源停用词文件: {source_file_path}")
        except Exception as e:
            logger.warning(f"删除源停用词文件失败 {source_file_path}: {e}，但不影响任务执行")
        
        # 8. 更新数据库中的 basic_metric_config.stop_words 字段
        try:
            # 查询任务
            evaluation_task = await base_mapper.query_one(
                select(EvaluationTask).filter(EvaluationTask.id == task_id)
            )
            
            if evaluation_task and evaluation_task.basic_metric_config:
                # 更新 basic_metric_config 中的 stop_words 字段
                basic_metric_config = evaluation_task.basic_metric_config.copy()
                basic_metric_config["stop_words"] = target_file_path
                
                # 更新数据库
                evaluation_task.basic_metric_config = basic_metric_config
                await base_mapper.commit()
                
                logger.info(f"已更新评估任务 {task_id} 的停用词文件路径: {target_file_path}")
            else:
                logger.warning(f"评估任务 {task_id} 不存在或没有 basic_metric_config，无法更新")
        except Exception as e:
            logger.error(f"更新数据库失败: {e}")
            # 不抛出异常，因为文件已经复制成功，只是数据库更新失败
            # 可以考虑记录错误，但不影响任务执行
        
    except Exception as e:
        logger.error(f"处理停用词文件失败: {e}", exc_info=True)
        # 抛出异常，让调用者知道处理失败
        raise


def init_task_logger(task: TaskBase) -> None:
    try:
        from app.tasks.logger import TaskLogger
        task.task_logger = TaskLogger(task.task_id, task.task_name)
    except Exception as e:
        task._log_warning(f"初始化任务日志记录器失败: {e}")


def cleanup_task_logger(task: TaskBase) -> None:
    if task.task_logger:
        try:
            task.task_logger.cleanup()
        except Exception as e:
            task._log_warning(f"清理任务日志记录器失败: {e}")


async def update_evaluation_task_status(task: TaskBase, *, task_id: int, status: TaskStatus,
                                        base_mapper: BaseMapper,
                                        error_message: Optional[str] = None) -> None:
    """更新评估任务状态到数据库（可同时更新状态和错误信息）"""
    try:
        evaluation_task = await base_mapper.query_one(select(EvaluationTask).filter(EvaluationTask.id == task_id))
        if evaluation_task:
            evaluation_task.status = status.value
            if error_message is not None:
                evaluation_task.error_message = error_message
            # SQLAlchemy 自动跟踪对象变化，直接 commit 即可
            await base_mapper.commit()
            task._log_info(f"评估任务状态已更新为: {status.value}" + (f", 错误信息已写入" if error_message else ""))
        else:
            task._log_warning(f"未找到评估任务: {task_id}")
    except Exception as e:
        task._log_error(f"更新评估任务状态失败: {str(e)}", error=e)


async def _validate_inference_datasets_exist(self: TaskBase, task_id: int, base_mapper: BaseMapper) -> None:
    """
    验证评估任务关联的推理结果集是否存在且已完成
    
    参数:
        self: TaskBase 实例
        task_id: 评估任务ID
        db: 数据库会话
    """
    from app.models.evaluation_task_manager import EvaluationTaskDatasetModelRelation
    from app.models.inference_result_manager import InferenceResultDataset
    # 查询评估任务关联的推理结果集
    relations = await base_mapper.query(
        select(EvaluationTaskDatasetModelRelation).filter(EvaluationTaskDatasetModelRelation.evaluation_task_id == task_id)
    )
    
    if not relations:
        raise RuntimeError(f"评估任务没有关联的推理结果集: task_id={task_id}")
    
    # 获取所有推理结果集ID
    dataset_ids = [r.inference_result_dataset_id for r in relations]
    unique_dataset_ids = list(set(dataset_ids))
    
    # 查询所有推理结果集
    datasets = await base_mapper.query(
        select(InferenceResultDataset).filter(InferenceResultDataset.id.in_(unique_dataset_ids))
    )
    
    if len(datasets) != len(unique_dataset_ids):
        found_ids = {d.id for d in datasets}
        missing_ids = set(unique_dataset_ids) - found_ids
        raise RuntimeError(f"推理结果集不存在: {missing_ids}")
    
    # 验证所有推理结果集的状态
    for dataset in datasets:
        if dataset.status != TaskStatus.COMPLETED.value:
            raise RuntimeError(
                f"推理结果集 {dataset.id} ({dataset.name}) 状态为 {dataset.status}，"
                f"需要状态为 {TaskStatus.COMPLETED.value} 才能进行评估"
            )
        self._log_info(
            f"推理结果集 {dataset.id} ({dataset.name}): "
            f"文件路径={dataset.file_path}, "
            f"总数据量={dataset.total_items}, "
            f"数据格式={dataset.dataset_format or 'prompt-response'}"
        )
    
    # 验证所有推理结果集的数据格式是否一致（对比评估要求）
    from app.tasks.service.evaluation.adapters.adapter_factory import EvaluationAdapterFactory
    try:
        unified_format = EvaluationAdapterFactory.validate_datasets_format_consistency(datasets)
        self._log_info(f"所有推理结果集数据格式验证通过，统一格式: {unified_format}")
    except ValueError as e:
        raise RuntimeError(f"数据格式验证失败: {str(e)}")


@celery_app.task(base=TaskBase, bind=True)
def create_evaluation_task_async(self: TaskBase, task_id: int, namespace: str, task_data: dict,
                                  tenant_id: str = None):
    """
    异步创建评估任务（Celery 任务必须是同步函数，内部使用 asyncio.run 执行异步操作）
    
    Args:
        task_id: 评估任务ID
        namespace: 项目命名空间
        task_data: 评估任务数据
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
    """
    return run_async_in_celery(
        _create_evaluation_task_async_impl(self, task_id, namespace, task_data, tenant_id)
    )


async def _create_evaluation_task_async_impl(self: TaskBase, task_id: int, namespace: str,
                                              task_data: dict, tenant_id: str = None):
    """
    异步创建评估任务的实现函数
    
    Args:
        task_id: 评估任务ID
        namespace: 项目命名空间
        task_data: 评估任务数据
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
    """
    try:
        # 设置租户ID到上下文（Celery worker 进程需要）
        if tenant_id:
            app_runtime_context.set_tenant_id(tenant_id)
            self._log_info(f"已设置租户ID: {tenant_id}")
        else:
            self._log_warning("未传入租户ID，可能导致存储路径错误")

        # 设置任务信息
        self.task_id = task_id
        # 动态任务名：包含任务名称与任务ID
        task_name = (task_data.get('name') if isinstance(task_data, dict) else None) or str(task_id)
        celery_id = getattr(getattr(self, 'request', None), 'id', None)
        self.task_name = f"create_evaluation_task:{task_name}:{task_id}" + (
            f":{celery_id}" if celery_id else "")
        self.task_type = "evaluation"

        # 初始化任务日志
        init_task_logger(self)

        self._log_start("开始异步创建评估任务")
        self._log_info(f"任务ID: {task_id}, 命名空间: {namespace}, 任务名称: {task_name}")

        from app.core.depend_manager import AutoContainer
        container = AutoContainer()
        base_mapper: BaseMapper = container.base_mapper()
        storage_service: StorageService = container.storage_service()
        evaluation_task: Optional[EvaluationTask] = await base_mapper.query_one(
            select(EvaluationTask).filter(EvaluationTask.id == task_id))

        # celery 拿到任务先更新一下状态
        evaluation_task.status = TaskStatus.PREPARING.value
        await base_mapper.commit()

        if evaluation_task is None:
            raise RuntimeError(f"评估任务不存在: {task_id}")

        data_source = evaluation_task.data_source
        self._log_info(f"评估任务数据来源: {data_source}")

        # 处理停用词，将用户上传的url转换为标准存储，带task_id的
        if (evaluation_task.basic_metric_config is not None and
                evaluation_task.basic_metric_config.get("stop_words") is not None):
            real_stop_word_url: str = StoragePath.EVALUATION_STOP_WORD.format_storage_path(
                namespace=namespace,
                task_id=task_id
            )
            await handle_stop_word(
                task_id=task_id,
                source_file_path=evaluation_task.basic_metric_config.get("stop_words"),
                target_dir_path=real_stop_word_url,
                storage_service=storage_service,
                base_mapper=base_mapper
            )

        if data_source == "new":
            # 新建推理结果集：仅处理停用词后返回，等待与启动逻辑由定时任务 process_new_inference_evaluation_tasks 处理
            self._log_info("数据来源为新建推理结果集，已处理停用词，等待定时任务检查推理结果集完成后启动评估")
            return {
                "status": "success",
                "task_id": task_id,
                "message": "推理结果集创建中，将由定时任务在推理结果集完成后自动启动评估"
            }
        else:
            # 已有推理结果集：直接验证推理结果集是否存在
            self._log_info("数据来源为已有推理结果集，验证推理结果集是否存在...")
            await _validate_inference_datasets_exist(
                self=self,
                task_id=task_id,
                base_mapper=base_mapper
            )
            self._log_info("推理结果集验证通过，准备启动评估任务")

        # 启动评估进程（使用K8s Job）
        self._log_info("准备启动评估进程...")
        job_names = await start_evaluation_impl(
            task_id=task_id,
            base_mapper=base_mapper,
            storage_service=storage_service
        )
        self._log_info(f"评估进程已启动，job_names={job_names}")

        self._log_info("评估任务创建完成")
        return {
            "status": "success",
            "task_id": task_id,
            "job_names": job_names
        }

    except TaskRevokedError:
        self._log_warning("评估任务创建被取消")
        await update_evaluation_task_status(self, task_id=task_id, status=TaskStatus.FAILED,
                                            base_mapper=base_mapper,
                                            error_message="任务已被取消")
        raise

    except Exception as e:
        self._log_error(f"评估任务创建失败: {str(e)}", error=e)
        await update_evaluation_task_status(self, task_id=task_id, status=TaskStatus.FAILED,
                                            base_mapper=base_mapper,
                                            error_message=str(e))
        raise

    finally:
        # 清理资源
        cleanup_task_logger(self)
        if base_mapper is not None:
            await base_mapper.close()


async def generation_sampling_file(
    evaluation_task: EvaluationTask,
    base_mapper: BaseMapper,
    storage_service: StorageService,
    namespace: str
) -> None:
    """
    人工评估：根据采样率生成评估文件
    
    为每个推理结果集生成一个对应的评估文件，保持文件数量一致。
    
    Args:
        evaluation_task: 评估任务对象
        base_mapper: 数据库映射器
        storage_service: 存储服务
        namespace: K8s命名空间
    """
    import random
    
    task_id = evaluation_task.id
    project_id = evaluation_task.project_id
    sampling_rate = evaluation_task.sampling_rate  # 0-100的百分比，None表示不采样
    
    logger.info(f"开始生成人工评估采样文件: task_id={task_id}, sampling_rate={sampling_rate}")
    
    # 1. 获取JuiceFS客户端
    tenant_id = app_runtime_context.get_tenant_id()
    if not tenant_id:
        raise RuntimeError(f"无法获取租户ID: task_id={task_id}")
    
    jfs = await storage_service.JUICEFS_CLIENT(tenant_id)
    
    # 2. 查询评估任务关联的推理结果集
    from app.models.evaluation_task_manager import EvaluationTaskDatasetModelRelation
    from app.models.inference_result_manager import InferenceResultDataset
    
    relations = await base_mapper.query(
        select(EvaluationTaskDatasetModelRelation).filter(
            EvaluationTaskDatasetModelRelation.evaluation_task_id == task_id
        )
    )
    
    if not relations:
        raise RuntimeError(f"评估任务没有关联的推理结果集: task_id={task_id}")
    
    # 3. 构建输出目录
    result_dir = StoragePath.REAL_EVALUATION.format_storage_path(
        namespace=namespace,
        task_id=task_id
    )
    # 确保目录存在
    jfs.makedirs(result_dir, exist_ok=True)
    
    # 4. 为每个推理结果集生成对应的评估文件
    result_file_paths = []
    total_items = 0
    is_first_file = True  # 标记是否为第一个文件，用于统计总数
    
    for relation in relations:
        dataset_id = relation.inference_result_dataset_id
        dataset = await base_mapper.query_one(
            select(InferenceResultDataset).filter(InferenceResultDataset.id == dataset_id)
        )
        
        if not dataset:
            raise RuntimeError(f"推理结果集不存在: dataset_id={dataset_id}")
        
        if not dataset.file_path:
            raise RuntimeError(f"推理结果集文件路径为空: dataset_id={dataset_id}")
        
        # 读取推理结果集JSONL文件
        if not jfs.exists(dataset.file_path):
            raise RuntimeError(f"推理结果集文件不存在: {dataset.file_path}")
        
        logger.info(f"处理推理结果集: dataset_id={dataset_id}, file_path={dataset.file_path}")
        
        # 读取原始数据
        all_items = []
        with jfs.open(dataset.file_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                
                try:
                    item_data = json.loads(line)
                    # 添加推理结果集ID和模型信息到数据项中
                    all_items.append(item_data)
                except json.JSONDecodeError as e:
                    logger.warning(f"跳过无效的JSON行 {line_num} in {dataset.file_path}: {e}")
                    continue
        
        total_items_before_sampling = len(all_items)
        logger.info(f"推理结果集 {dataset_id} 读取完成，数据量: {total_items_before_sampling}")
        
        # 应用采样率
        if sampling_rate is not None and sampling_rate > 0 and sampling_rate < 100:
            # 计算采样数量
            sample_count = int(total_items_before_sampling * sampling_rate / 100)
            if sample_count == 0:
                sample_count = 1  # 至少保留1条数据
            
            # 随机采样（使用相同的随机种子，保证不同数据集采样结果相同）
            random.seed(42)  # 固定随机种子，保证所有数据集采样结果一致且可复现
            sampled_items = random.sample(all_items, min(sample_count, total_items_before_sampling))
            logger.info(f"推理结果集 {dataset_id} 应用采样率 {sampling_rate}%，采样后数据量: {len(sampled_items)}")
        else:
            # 不采样，使用全部数据
            sampled_items = all_items
            logger.info(f"推理结果集 {dataset_id} 未设置采样率或采样率为100%，使用全部数据")
        
        # 生成评估文件（添加空的annotation字段）
        result_items = []
        for item in sampled_items:
            # 创建评估项，保留原始数据，添加空的annotation字段
            evaluation_item = {
                **item,  # 保留原始数据的所有字段
                "annotation": {
                    "status": AnnotationStatus.PENDING.value,  # pending/completed
                    "scores": {},  # 评估分数，格式：{"指标名称": 分数}
                    "comment": None  # 备注
                }
            }
            result_items.append(evaluation_item)
        
        # 构建输出文件路径（每个推理结果集对应一个文件）
        result_file_path = os.path.join(
            result_dir, 
            f"manual_evaluation_result_dataset_{dataset_id}.jsonl"
        ).replace("\\", "/")
        
        # 写入JSONL文件
        logger.info(f"写入评估文件: {result_file_path}, 数据量: {len(result_items)}")
        with jfs.open(result_file_path, 'w', encoding='utf-8') as f:
            for item in result_items:
                json_line = json.dumps(item, ensure_ascii=False)
                f.write(json_line + '\n')
        
        result_file_paths.append(result_file_path)
        
        # 多评估时，由于所有文件的采样率一样，内容一致，只统计第一个文件的数量
        # 单评估时，也只有一个文件，统计第一个文件即可
        if is_first_file:
            total_items = len(result_items)
            is_first_file = False

    # 写入文件后要稍微等一会，确保文件系统同步完成
    await asyncio.sleep(2)  # 等待2秒，确保文件写入完成并同步到存储系统
    logger.info(f"文件写入完成，等待文件系统同步...")
    
    # 5. 更新评估任务
    evaluation_task.result_file_path = result_file_paths  # 存储为列表格式，包含所有生成的文件路径
    evaluation_task.total_items = total_items
    evaluation_task.completed_items = 0
    evaluation_task.status = AnnotationStatus.PENDING.value  # 更新状态为标注中
    evaluation_task.progress = 0
    
    await base_mapper.update_by_id(task_id, evaluation_task)
    await base_mapper.commit()
    
    logger.info(f"人工评估采样文件生成完成: task_id={task_id}, 文件数量: {len(result_file_paths)}, total_items={total_items}, result_file_paths={result_file_paths}")


async def start_evaluation_impl(*, task_id: int, base_mapper: BaseMapper, storage_service: StorageService) -> List[str]:
    """
    启动评估任务，根据评估方法创建相应的K8s Job。
    
    参数:
        task_id: 评估任务ID
    
    返回:
        Job名称列表（可能包含多个Job，如果同时存在裁判员评估和基础指标评估）
    """
    evaluation_task: Optional[EvaluationTask] = await base_mapper.query_one(
        select(EvaluationTask).filter(EvaluationTask.id == task_id))
    if evaluation_task is None:
        raise RuntimeError(f"评估任务不存在: {task_id}")

    project_id = evaluation_task.project_id
    lab_k8s_uuid = evaluation_task.lab_k8s_uuid
    evaluation_method = evaluation_task.evaluation_method

    # 查询集群 kubeconfig 与命名空间
    stmt = (
        select(KubernetesResource.config, ProjectKubernetesRelation.namespace)
        .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
        .where(ProjectKubernetesRelation.project_id == project_id)
    )
    res = await base_mapper.execute(stmt)
    row = res.first()
    if not row:
        raise RuntimeError(f"未绑定K8s集群或命名空间: project_id={project_id}")
    kubeconfig_str, k8s_namespace = row[0], row[1]

    # 判断是否需要裁判员评估和基础指标评估
    # 根据 evaluation_method 字段判断，支持 "referee"、"basic_metric" 或 "all"
    need_referee_evaluation = False
    need_basic_metric_evaluation = False

    if evaluation_method == "all":
        # 同时进行两种评估
        need_referee_evaluation = True
        need_basic_metric_evaluation = True
    elif evaluation_method == "referee":
        # 仅裁判员评估
        need_referee_evaluation = True
        need_basic_metric_evaluation = False
    elif evaluation_method == "basic_metric":
        # 仅基础指标评估
        need_referee_evaluation = False
        need_basic_metric_evaluation = True
    elif evaluation_method == EvaluationMethod.MANUAL.value:
        # 人工评估,根据采样率生成评估文件
        await generation_sampling_file(
            evaluation_task=evaluation_task,
            base_mapper=base_mapper,
            storage_service=storage_service,
            namespace=k8s_namespace
        )
        return []
    else:
        raise RuntimeError(f"未知的评估方法: {evaluation_method}")

    if not need_referee_evaluation and not need_basic_metric_evaluation:
        raise RuntimeError(f"评估任务必须至少包含一种评估方法（裁判员评估或基础指标评估）: task_id={task_id}")

    # 判断是离线评估还是在线评估
    # 根据裁判资源类型（referee_type）判断：model=离线评估, service=在线评估
    # 如果没有裁判员评估（只有基础指标评估），则根据关联的推理结果集的 inference_method 判断
    from app.models.evaluation_task_manager import EvaluationTaskDatasetModelRelation
    from app.models.inference_result_manager import InferenceResultDataset

    relations = await base_mapper.query(
        select(EvaluationTaskDatasetModelRelation).filter(EvaluationTaskDatasetModelRelation.evaluation_task_id == task_id)
    )

    if not relations:
        raise RuntimeError(f"评估任务没有关联的推理结果集: task_id={task_id}")

    # 获取所有推理结果集ID
    dataset_ids = [r.inference_result_dataset_id for r in relations]
    unique_dataset_ids = list(set(dataset_ids))

    # 查询推理结果集
    datasets = await base_mapper.query(
        select(InferenceResultDataset).filter(InferenceResultDataset.id.in_(unique_dataset_ids))
    )

    # 判断评估方式
    if need_referee_evaluation and evaluation_task.referee_type:
        # 有裁判员评估：根据referee_type判断
        if evaluation_task.referee_type == "service":
            is_offline_evaluation = False  # service = 在线服务 = 在线评估
        elif evaluation_task.referee_type == "model":
            is_offline_evaluation = True  # model = 离线模型 = 离线评估
        else:
            raise RuntimeError(f"未知的裁判资源类型: {evaluation_task.referee_type}")
    else:
        # 只有基础指标评估：根据关联的推理结果集的 inference_method 判断
        is_offline_evaluation = True

    # 创建Job列表
    job_names = []

    # 初始化 K8s 启动器
    launcher = K8sLauncher(config_str=kubeconfig_str)

    # 根据评估方式创建相应的Job
    if is_offline_evaluation:
        # 离线评估
        from app.tasks.service.evaluation.offline_evaluation_task import OfflineEvaluationTaskK8s

        offline_task = OfflineEvaluationTaskK8s(
            project_id=project_id,
            namespace=k8s_namespace,
            k8s_uuid=lab_k8s_uuid,
            launcher=launcher,
            db=base_mapper,
            task_id=task_id,
            evaluation_task=evaluation_task,
            relations=relations,
            datasets=datasets,
            jfs=await storage_service.JUICEFS_CLIENT(app_runtime_context.get_tenant_id())
        )
        job_name = await offline_task.submit()
        job_names.append(job_name)
    else:
        # 在线评估
        if need_referee_evaluation:
            from app.tasks.service.evaluation.online_evaluation_task import OnlineEvaluationTaskK8s

            online_task = OnlineEvaluationTaskK8s(
                project_id=project_id,
                namespace=k8s_namespace,
                k8s_uuid=lab_k8s_uuid,
                launcher=launcher,
                db=base_mapper,
                task_id=task_id,
                evaluation_task=evaluation_task,
                relations=relations,
                datasets=datasets,
                jfs=await storage_service.JUICEFS_CLIENT(app_runtime_context.get_tenant_id())
            )
            job_name = await online_task.submit()
            job_names.append(job_name)

    # job提交之后，状态改为排队中
    evaluation_task.status = TaskStatus.PENDING.value
    await base_mapper.commit()
    return job_names

