from typing import Any

from sqlalchemy import select, desc

from app.common.status import TaskStatus
from app.common.task_execution import TaskExecutionBusinessType, TaskExecutionStatus
from app.core.logging import logger
from app.executors.base import BaseExecutor
from app.executors.business_inference_result_executor import BusinessInferenceResultDatasetExecutor
from app.models.evaluation_task_manager import EvaluationTask, EvaluationTaskDatasetModelRelation
from app.models.models import TaskExecution
from app.utils.timezone_utils import get_current_shanghai_time


class EvaluationTaskExecutor(BaseExecutor):
    """评估任务创建后处理执行器"""

    async def _start_nested_inference_executions(self, business_id: int) -> None:
        """任务套任务：评估任务启动时，触发其关联推理结果集执行器。"""
        from app.core.depend_manager import AutoContainer
        from app.executors.inference_result_executor import InferenceResultDatasetExecutor

        evaluation_task_service = AutoContainer.evaluation_task_service()
        relations = await evaluation_task_service.relation_mapper.query(
            select(EvaluationTaskDatasetModelRelation).where(
                EvaluationTaskDatasetModelRelation.evaluation_task_id == business_id
            )
        )
        if not relations:
            return

        dataset_ids = list(
            {
                relation.inference_result_dataset_id
                for relation in relations
                if relation.inference_result_dataset_id
            }
        )
        if not dataset_ids:
            return

        inference_executor = InferenceResultDatasetExecutor()

        business_inference_executor = BusinessInferenceResultDatasetExecutor()

        for dataset_id in dataset_ids:
            execution = await evaluation_task_service.task_execution_mapper.query_one(
                select(TaskExecution).where(
                    TaskExecution.business_type == TaskExecutionBusinessType.INFERENCE_RESULT_DATASETS.value,
                    TaskExecution.business_id == dataset_id
                ).order_by(desc(TaskExecution.created_at))
            )
            if not execution:
                continue
            # 仅在 PENDING 状态下才联动触发，避免手动触发后（DONE）被重复执行。
            if execution.status != TaskExecutionStatus.PENDING.value:
                continue
            if not isinstance(execution.kwargs, dict):
                logger.warning(f"推理结果集执行参数无效，跳过触发: dataset_id={dataset_id}")
                continue

            try:
                await inference_executor.start(dataset_id, **execution.kwargs)
                execution.status = TaskExecutionStatus.DONE.value
                execution.last_error = None
            except Exception as e:
                execution.status = TaskExecutionStatus.FAILED.value
                execution.last_error = str(e)
                logger.error(f"联动触发推理结果集执行器失败: dataset_id={dataset_id}, err={e}", exc_info=True)
                raise
            finally:
                execution.updated_at = get_current_shanghai_time()
                execution.locked_at = None
                execution.locked_by = None
                await evaluation_task_service.task_execution_mapper.commit()

        for dataset_id in dataset_ids:
            execution = await evaluation_task_service.task_execution_mapper.query_one(
                select(TaskExecution).where(
                    TaskExecution.business_type == TaskExecutionBusinessType.BUSINESS_INFERENCE_RESULT_DATASETS.value,
                    TaskExecution.business_id == dataset_id
                ).order_by(desc(TaskExecution.created_at))
            )
            if not execution:
                continue
            # 仅在 PENDING 状态下才联动触发，避免手动触发后（DONE）被重复执行。
            if execution.status != TaskExecutionStatus.PENDING.value:
                continue
            if not isinstance(execution.kwargs, dict):
                logger.warning(f"推理结果集执行参数无效，跳过触发: dataset_id={dataset_id}")
                continue

            try:
                await business_inference_executor.start(dataset_id, **execution.kwargs)
                execution.status = TaskExecutionStatus.DONE.value
                execution.last_error = None
            except Exception as e:
                execution.status = TaskExecutionStatus.FAILED.value
                execution.last_error = str(e)
                logger.error(f"联动触发推理结果集执行器失败: dataset_id={dataset_id}, err={e}", exc_info=True)
                raise
            finally:
                execution.updated_at = get_current_shanghai_time()
                execution.locked_at = None
                execution.locked_by = None
                await evaluation_task_service.task_execution_mapper.commit()




    async def start(self, business_id: int, **kwargs: Any) -> None:
        from app.core.depend_manager import AutoContainer

        evaluation_task_service = AutoContainer.evaluation_task_service()
        task_query = await evaluation_task_service.task_mapper.execute(
            select(EvaluationTask).where(EvaluationTask.id == business_id)
        )
        task = task_query.scalar_one_or_none()
        if not task:
            raise ValueError(f"评估任务不存在: {business_id}")

        try:
            if getattr(task, "data_source", None) == "new" and not task.schedule_at:
                await self._start_nested_inference_executions(business_id)
            await evaluation_task_service.run_create_evaluation_task_post_process(
                task_id=business_id,
                namespace=kwargs["namespace"],
                task_payload=kwargs["task_payload"],
                tenant_id=kwargs["tenant_id"]
            )
        except Exception as e:
            task.status = TaskStatus.FAILED.value
            task.updated_at = get_current_shanghai_time()
            await evaluation_task_service.task_mapper.commit()
            logger.error(f"评估任务提交失败: {business_id}, err={e}", exc_info=True)
            raise
