from typing import Dict, Optional, Type

from app.common.task_execution import TaskExecutionExecutor
from app.executors.base import BaseExecutor
from app.executors.benchmark_task_executor import BenchmarkTaskExecutor
from app.executors.data_cleaning_executor import DataCleaningTaskExecutor
from app.executors.evaluation_task_executor import EvaluationTaskExecutor
from app.executors.inference_result_executor import InferenceResultDatasetExecutor
from app.executors.model_executor import TrainedModelExecutor, BaseModelDownloadExecutor
from app.executors.repository_image_executor import NotebookImageExecutor
from app.executors.training_task_executor import TrainingTaskExecutor
from app.executors.business_inference_result_executor import BusinessInferenceResultDatasetExecutor

EXECUTOR_REGISTRY: Dict[str, Type[BaseExecutor]] = {
    TaskExecutionExecutor.NOTEBOOK_IMAGE.value: NotebookImageExecutor,
    TaskExecutionExecutor.TRAINED_MODEL.value: TrainedModelExecutor,
    TaskExecutionExecutor.BASE_MODEL_DOWNLOAD.value: BaseModelDownloadExecutor,
    TaskExecutionExecutor.TRAINING_TASK.value: TrainingTaskExecutor,
    TaskExecutionExecutor.INFERENCE_RESULT_DATASETS.value: InferenceResultDatasetExecutor,
    TaskExecutionExecutor.EVALUATION_TASK.value: EvaluationTaskExecutor,
    TaskExecutionExecutor.DATA_CLEANING.value: DataCleaningTaskExecutor,
    TaskExecutionExecutor.BENCHMARK_TASK.value: BenchmarkTaskExecutor,
    TaskExecutionExecutor.BUSINESS_INFERENCE_RESULT_DATASETS.value: BusinessInferenceResultDatasetExecutor,
}


def create_executor(executor_name: str) -> Optional[BaseExecutor]:
    """按需创建执行器实例，避免全局单例带来的共享状态问题。"""
    executor_cls = EXECUTOR_REGISTRY.get(executor_name)
    if not executor_cls:
        return None
    return executor_cls()
