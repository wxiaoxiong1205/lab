from enum import Enum


class TaskExecutionBusinessType(str, Enum):
    def __new__(cls, desc: str, value: str):
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.desc = desc
        return obj

    IMAGE_BUILD_LOG = ("镜像构建", "image_build_log")
    TRAINED_MODEL = ("模型管理", "trained_model")
    BASE_MODEL = ("基础模型", "base_model")
    TRAINING_TASK = ("大模型训练", "training_task")
    INFERENCE_RESULT_DATASETS = ("推理结果集", "inference_result_datasets")
    EVALUATION_TASK = ("自动评估", "evaluation_task")
    DATA_CLEANING_TASK = ("数据清洗", "data_cleaning_task")
    BENCHMARK_TASK = ("基准评估", "benchmark_task")
    BUSINESS_INFERENCE_RESULT_DATASETS = ("业务推理结果集", "business_inference_result_datasets")

class TaskExecutionStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    DONE = "DONE"
    FAILED = "FAILED"


class TaskExecutionExecutor(str, Enum):
    NOTEBOOK_IMAGE = "notebook_image"
    TRAINED_MODEL = "trained_model"
    BASE_MODEL_DOWNLOAD = "base_model_download"
    TRAINING_TASK = "training_task"
    INFERENCE_RESULT_DATASETS = "inference_result_datasets"
    EVALUATION_TASK = "evaluation_task"
    DATA_CLEANING = "data_cleaning"
    BENCHMARK_TASK = "benchmark_task"
    BUSINESS_INFERENCE_RESULT_DATASETS =  "business_inference_result_datasets"


class TaskExecutionMethod(str, Enum):
    START = "start"
