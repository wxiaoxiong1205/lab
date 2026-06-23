from typing import Any

from sqlalchemy import select

from app.common.status import TaskStatus
from app.core.logging import logger
from app.executors.base import BaseExecutor
from app.models.inference_result_manager import InferenceResultDataset
from app.utils.timezone_utils import get_current_shanghai_time


class InferenceResultDatasetExecutor(BaseExecutor):
    """推理结果集执行器：负责触发离线/在线推理 Celery 任务"""

    async def start(self, business_id: int, **kwargs: Any) -> None:
        from app.core.depend_manager import AutoContainer

        inference_service = AutoContainer.inference_result_dataset_service()
        dataset_query = await inference_service.dataset_mapper.execute(
            select(InferenceResultDataset).where(InferenceResultDataset.id == business_id)
        )
        dataset = dataset_query.scalar_one_or_none()
        if not dataset:
            raise ValueError(f"推理结果数据集不存在: {business_id}")

        try:
            celery_task_id = await inference_service.run_create_inference_result_dataset_post_process(
                dataset_id=business_id,
                namespace=kwargs["namespace"],
                dataset_payload=kwargs["dataset_payload"],
                tenant_id=kwargs["tenant_id"]
            )
            dataset.celery_task_id = celery_task_id
            dataset.status = TaskStatus.PREPARING.value
            dataset.updated_at = get_current_shanghai_time()
            await inference_service.dataset_mapper.commit()
        except Exception as e:
            dataset.status = TaskStatus.FAILED.value
            dataset.updated_at = get_current_shanghai_time()
            await inference_service.dataset_mapper.commit()
            logger.error(f"推理结果数据集执行失败: {business_id}, err={e}", exc_info=True)
            raise
