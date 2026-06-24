import json
from datetime import datetime
from enum import Enum
from typing import Optional, List

from sqlalchemy import select

from app.common.status import TaskStatus
from app.core.logging import logger

from fastapi import HTTPException

from app.database.base import get_db_session
from app.models import TrainingTask, TrainedModel
from app.repository.training_task_mapper import TrainingTaskMapper
from app.schemas.training_task import TrainingTaskLogResponse, CheckpointInfo
from app.services.storage.interface import StorageService
from app.services.training_task.training_task import DefaultTrainingTaskService
from app.utils.belle_model_storage_utils import BelleFileType
from app.utils.belle_util import BelleUtil

class BelleTrainingTaskStatus(str,Enum):
    PENDING = "PENDING" # 待定
    QUEUED = "QUEUED" # 队列中
    WAITING = "WAITING" # 等待中
    BLOCKED = "BLOCKED" # 阻塞中
    RUNNING = "RUNNING" # 运行中
    COMPLETED = "COMPLETED" # 成功
    FAILED = "FAILED" # 失败
    CANCELED = "CANCELED" # 取消

# 百丽 → 本系统
BELLE_TO_LOCAL: dict[BelleTrainingTaskStatus, TaskStatus] = {
    BelleTrainingTaskStatus.PENDING:  TaskStatus.PENDING,
    BelleTrainingTaskStatus.QUEUED:   TaskStatus.PENDING,
    BelleTrainingTaskStatus.WAITING:  TaskStatus.PREPARING,
    BelleTrainingTaskStatus.BLOCKED:  TaskStatus.PENDING,
    BelleTrainingTaskStatus.RUNNING:  TaskStatus.RUNNING,
    BelleTrainingTaskStatus.COMPLETED:TaskStatus.COMPLETED,
    BelleTrainingTaskStatus.FAILED:   TaskStatus.FAILED,
    BelleTrainingTaskStatus.CANCELED: TaskStatus.TERMINATED,
}


class BelleTrainingTaskService(DefaultTrainingTaskService):
    """训练任务服务实现类"""

    def __init__(self, mapper: TrainingTaskMapper, storage: StorageService) -> None:
        self.mapper = mapper
        self.storage = storage

    async def get_training_task_logs(
            self, project_id: int, task_id: int, end_time: datetime, days: Optional[int] = 30
    ) -> TrainingTaskLogResponse:

        training_task = await self.mapper.query_by_id(select(TrainingTask).filter(TrainingTask.id == task_id))
        if not training_task:
            raise HTTPException(status_code=404, detail="TrainingTask not found")

        #校验belle任务id
        verification_belle_task_id(training_task.lab_k8s_uuid)

        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()
        result = await belle_client.get_train_task_logs(int(training_task.lab_k8s_uuid))
        # 使用传入的结束时间和天数参数

        logs = []
        if result:
            logs.append(result[0].get('logs',None))
        return TrainingTaskLogResponse(archived=False, logs=logs)


    async def get_training_task_checkpoints(
            self, project_id: int, task_id: int
    ) -> List[CheckpointInfo]:
        """获取训练任务的checkpoints信息"""
        # 验证项目存在
        await self.validate_project(project_id)

        # 查询该任务名称下的所有版本
        task = await self.mapper.query_one(
            select(TrainingTask).where(
                TrainingTask.project_id == project_id,
                TrainingTask.id == task_id
            ).order_by(TrainingTask.id.desc())  # 按id降序排列
        )

        if not task:
            raise HTTPException(
                status_code=404,
                detail=f"训练任务不存在"
            )

        # 校验belle任务id
        verification_belle_task_id(task.lab_k8s_uuid)
        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()
        result = await belle_client.get_train_task_output(int(task.lab_k8s_uuid))
        checkpoints = await self.get_belle_training_checkpoints(result,int(task.lab_k8s_uuid),belle_client)
        return checkpoints

    async def get_belle_training_checkpoints(self, items: List[str], belle_task_id:int , belle_client: BelleUtil) -> List[CheckpointInfo]:
        """
        belle-从扁平化文件列表中提取 checkpoint 信息

        Args:
            items: 扁平文件名列表，例如:
                [
                    "checkpoint-1000/trainer_state.json",
                    "checkpoint-1020/model.safetensors",
                    "config.json"
                ]
            belle_client: belle客户端
        Returns:
            CheckpointInfo 列表（train_loss / eval_loss 无法读取 → 置 None）
        """
        if not items:
            return []

        try:

            checkpoints = set()

            # -------------------------------------------------
            # 1. 扁平化文件中提取 checkpoint-xxx 目录名
            # -------------------------------------------------
            for f in items:
                # 找到 "checkpoint-xxxx/xxx"
                if f.startswith("checkpoint-") and "/" in f:
                    ckpt = f.split("/", 1)[0]
                    checkpoints.add(ckpt)

            results = []

            # -------------------------------------------------
            # 2. 解析 step 并构造 CheckpointInfo（不读取 json）
            # -------------------------------------------------
            for ckpt in checkpoints:
                try:
                    step = int(ckpt.split("-")[1])
                except Exception:
                    continue

                # 读取 trainer_state.json 获取 loss 信息
                trainer_state_path = f"{ckpt}/trainer_state.json"
                epoch = None
                train_loss = None
                eval_loss = None

                try:
                    output = await belle_client.get_train_task_output_content(belle_task_id,trainer_state_path)
                    content = output.get("content","")
                    if content:
                        # 读取文件内容
                        safe_content = (
                            content.replace("NaN", "null")
                            .replace("Infinity", "null")
                            .replace("-Infinity", "null")
                        )
                        trainer_state = json.loads(safe_content)

                        # 提取信息
                        epoch = trainer_state.get('epoch')

                        # 从 log_history 中找到对应步数的 loss
                        # 注意：同一个 step 可能有多条记录（训练loss和评估loss分开记录）
                        log_history = trainer_state.get('log_history', [])
                        for log_entry in reversed(log_history):
                            if log_entry.get('step') == step:
                                # 找到训练 loss（直接赋值，不需要判断 is None）
                                if 'loss' in log_entry:
                                    train_loss = log_entry['loss']
                                # 找到评估 loss
                                if 'eval_loss' in log_entry:
                                    eval_loss = log_entry['eval_loss']
                                # 如果两个都找到了，可以提前退出
                                if train_loss is not None and eval_loss is not None:
                                    break
                except Exception as e:
                    logger.warning(f"读取检查点 {ckpt} 的 trainer_state.json 失败: {e}")
                results.append(
                    # 创建 CheckpointInfo 对象
                    CheckpointInfo(
                        name=ckpt,
                        step=step,
                        epoch=epoch,
                        train_loss=train_loss,
                        eval_loss=eval_loss
                    )
                )

            # 按 step 排序
            return sorted(results, key=lambda x: x.step)
        except Exception as e:
            logger.error(f"检查训练检查点时出错: {e}")
            return []

async def sync_belle_training_task():
    """同步训练任务状态"""
    # 获取训练任务状态信息
    async with get_db_session() as db:  # 获取 AsyncSession
        # 已完成、失败、终止的数据无需再同步
        not_sync_status=[TaskStatus.CREATED.value,TaskStatus.SCHEDULED_PENDING.value,
                         TaskStatus.COMPLETED.value,TaskStatus.FAILED.value,TaskStatus.TERMINATED.value]

        query = await db.execute(select(TrainingTask).filter(TrainingTask.status.notin_(not_sync_status)))

        training_task = query.scalars().all()

        if not training_task:
            return
        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()
        dirty = False  # 是否有字段变更

        for task in training_task:
            try:
                # 校验belle任务id
                verification_belle_task_id(task.lab_k8s_uuid)
                remote = await belle_client.get_train_task_status(task.lab_k8s_uuid)
                if not remote:
                    continue
                belle_enum = BelleTrainingTaskStatus(remote.get("task_status"))
                new_status = BELLE_TO_LOCAL[belle_enum].value

                if task.status == new_status and belle_enum != BelleTrainingTaskStatus.WAITING.value:  # 无变化跳过
                    continue

                # 等待中的任务发起训练
                if belle_enum.value == BelleTrainingTaskStatus.WAITING.value:
                    # 启动训练
                    await belle_client.start_train_task(task.lab_k8s_uuid)

                logger.info(f"Sync {task.lab_k8s_uuid}: {task.status} -> {new_status}")

                if remote.get("start_time"):
                    task.started_at = parse_dt(remote.get("start_time"))
                if remote.get("end_time"):
                    task.finished_at = parse_dt(remote.get("end_time"))
                    task.estimated_duration = calc_duration_seconds(task.started_at, task.finished_at)
                    task.status = new_status
                else:
                    # 如果 new_status 是 COMPLETED 但没有 end_time，说明调用方延迟
                    # 不更新状态，保持现状
                    if new_status != TaskStatus.COMPLETED.value:
                        task.status = new_status
                dirty = True

            except Exception as e:
                logger.error(f"Sync skip {task.lab_k8s_uuid}: {e}")
                # 继续下一条，不中断
        # 统一提交事物
        if dirty:
            await db.commit()

async def sync_belle_trained_models_task():
    """同步训练合并任务状态"""
    # 获取训练合并任务状态信息
    async with get_db_session() as db:  # 获取 AsyncSession
        # 已完成、失败、终止、停止的数据无需再同步，已创建，定时代启动
        not_sync_status=[TaskStatus.CREATED.value,TaskStatus.SCHEDULED_PENDING.value,
                         TaskStatus.COMPLETED.value,TaskStatus.FAILED.value,TaskStatus.TERMINATED.value]

        query = await db.execute(select(TrainedModel).filter(TrainedModel.status.notin_(not_sync_status)))

        trained_model_tasks = query.scalars().all()

        if not trained_model_tasks:
            return
        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()
        dirty = False  # 是否有字段变更

        for task in trained_model_tasks:
            try:
                # 校验belle任务id
                verification_belle_task_id(task.lab_k8s_uuid)
                remote = await belle_client.get_train_task_status(task.lab_k8s_uuid)
                if not remote:
                    continue
                belle_enum = BelleTrainingTaskStatus(remote.get("task_status"))
                new_status = BELLE_TO_LOCAL[belle_enum].value

                if task.status == new_status and belle_enum != BelleTrainingTaskStatus.WAITING.value:  # 无变化跳过且不是等待中的任务
                    continue

                # 等待中的任务发起训练
                if belle_enum.value == BelleTrainingTaskStatus.WAITING.value:
                    # 启动训练
                    await belle_client.start_train_task(task.lab_k8s_uuid)

                logger.info(f"Sync {task.lab_k8s_uuid}: {task.status} -> {new_status}")


                if remote.get("start_time"):
                    task.started_at = parse_dt(remote.get("start_time"))
                if remote.get("end_time"):
                    task.finished_at = parse_dt(remote.get("end_time"))
                    task.estimated_duration = calc_duration_seconds(task.started_at, task.finished_at)
                    task.status = new_status
                else:
                    # 如果 new_status 是 COMPLETED 但没有 end_time，说明调用方延迟
                    # 不更新状态，保持现状
                    if new_status != TaskStatus.COMPLETED.value:
                        task.status = new_status

                if task.status == TaskStatus.COMPLETED.value:
                    # 合并训练的模型是name+version
                    folder_name = f'{task.name}_{task.model_version}'
                    result = await belle_client.get_train_task_output_url(task.lab_k8s_uuid, folder_name,
                                                                          BelleFileType.FOLDER.value)
                    if result:
                        task.model_path = result.get("minio_url").rstrip("/")
                dirty = True

            except Exception as e:
                logger.error(f"Sync skip {task.lab_k8s_uuid}: {e}")
                # 继续下一条，不中断
        # 统一提交事物
        if dirty:
            await db.commit()

def parse_dt(value):
    if isinstance(value, str):
        return datetime.fromisoformat(value)
    return value

def calc_duration_seconds(s:datetime, f:datetime) -> int | None:
    """
    计算运行秒数（finished_at - started_at）
    任一为空或无法解析 → 返回 None
    """
    if not s or not f:
        return None

    delta = f - s
    return int(delta.total_seconds())

def verification_belle_task_id(lab_k8s_uuid):
    """
    校验belle任务id
    """
    try:
        int(lab_k8s_uuid)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"task_id:{lab_k8s_uuid} is not a valid task_id")