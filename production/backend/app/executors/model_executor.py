from typing import Any

from sqlalchemy import select

from app.common.status import TaskStatus
from app.executors.base import BaseExecutor
from app.models.model_manager import TrainedModel, BaseModel
from app.utils.timezone_utils import get_current_shanghai_time
from app.core.logging import logger


class TrainedModelExecutor(BaseExecutor):
    """训练模型创建后处理执行器"""

    async def start(self, business_id: int, **kwargs: Any) -> None:
        from app.core.depend_manager import AutoContainer
    
        model_service = AutoContainer.model_service()
        # 查询训练模型
        trained_model_query = await model_service.mapper.execute(
            select(TrainedModel).filter(TrainedModel.id == business_id)
        )
        trained_model = trained_model_query.scalar_one_or_none()
        if not trained_model:
            raise ValueError(f"训练模型不存在: {business_id}")

        try:
            # 从准备到运行中速度太快了，只能先设置为启动中再去进去创建任务
            trained_model.status = TaskStatus.PREPARING.value
            trained_model.updated_at = get_current_shanghai_time()
            await model_service.mapper.commit()

            await model_service.run_create_trained_model_post_process(
                trained_model_id=business_id,
                **kwargs,
            )
        except Exception as e:
            trained_model.status = TaskStatus.FAILED.value
            trained_model.updated_at = get_current_shanghai_time()
            await model_service.mapper.commit()
            logger.error(f"训练模型创建失败: {business_id}, err={e}", exc_info=True)
            raise


class BaseModelDownloadExecutor(BaseExecutor):
    """基础模型下载执行器"""

    async def start(self, business_id: int, **kwargs: Any) -> None:
        from app.core.depend_manager import AutoContainer

        model_service = AutoContainer.model_service()
        base_model_query = await model_service.mapper.execute(
            select(BaseModel).filter(BaseModel.id == business_id)
        )
        base_model = base_model_query.scalar_one_or_none()
        if not base_model:
            raise ValueError(f"基础模型不存在: {business_id}")

        try:
            await model_service.run_create_base_model_post_process(
                base_model_id=business_id,
                **kwargs
            )
        except Exception as e:
            base_model.status = TaskStatus.FAILED.value
            base_model.updated_at = get_current_shanghai_time()
            await model_service.mapper.commit()
            logger.error(f"基础模型下载任务提交失败: {business_id}, err={e}", exc_info=True)
            raise
