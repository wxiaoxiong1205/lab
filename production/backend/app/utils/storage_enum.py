from enum import Enum
from dataclasses import dataclass
from typing import Optional

from app.schemas.notebook import NOTEBOOK_WORK_PATH


class PvcName(Enum):
    """pvc名称"""
    PUBLIC_PVC = "public-pvc"
    NOTEBOOK_PVC = "notebook-pvc"
    LLM_TRAINING_PVC = "llm-training-pvc" # 训练任务pvc
    PROJECT_READ_ONLY_PVC = "project-read-only-pvc"  # 项目对应jfs只读pvc
    # 这里先保留原来的枚举值，如后面的迭代需要修改，直接修改枚举值即可
    # LLM_INFERENCE_PVC = "llm-training-pvc" # 推理任务pvc
    # LLM_EVALUATION_PVC = "llm-training-pvc" # 评估任务pvc

@dataclass
class PathConfig:
    """路径配置数据类"""
    mount_path: str
    storage_path: str

    def __str__(self):
        return f"Mount: {self.mount_path}, Storage: {self.storage_path}"


class StoragePath(Enum):
    """存储路径枚举"""

    # Notebook相关路径
    NOTEBOOK_WORK = PathConfig(
        mount_path=f"{NOTEBOOK_WORK_PATH}",
        storage_path="/{project_name}/notebook/{instance_name}/asset"
    )

    NOTEBOOK_BUILTIN_MODELS = PathConfig(
        mount_path=f"{NOTEBOOK_WORK_PATH}/models",
        storage_path="/public/models/"
    )

    INFEERENCE_BASE_MODELS = PathConfig(
        mount_path="/data/models",
        storage_path="/public/models/"
    )

    INFEERENCE_TRAINED_MODELS = PathConfig(
        mount_path="/data/models",
        storage_path="/{namespace}/training/finetuned_models/"
    )

    NOTEBOOK_BUILTIN_DATASETS = PathConfig(
        mount_path=f"{NOTEBOOK_WORK_PATH}/datasets",
        storage_path="/public/datasets/"
    )

    # 模型相关路径
    BASE_MODELS = PathConfig(
        mount_path="/data/models/base_models/",
        storage_path="/public/models/"
    )

    REGISTERED_TRAINED_MODELS = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/training/finetuned_models/"
    )

    # 训练任务根目录
    TRAINING_TASK_ROOT = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/training/task/task_{task_id}/"
    )

    UNREGISTERED_TRAINED_MODELS = PathConfig(
        mount_path="/data/models/finetuned_models/",
        storage_path="/{namespace}/training/task/task_{task_id}/finetuned_models/"
    )

    REGISTERED_TRAINED_DATASETS = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/training/datasets/"
    )

    # 测试数据集存储路径配置
    REGISTERED_TEST_DATASETS = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/test/datasets/"
    )

    # 验证数据集存储路径配置
    REGISTERED_VALIDATION_DATASETS = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/validation/datasets/"
    )

    # 业务训练数据集
    REGISTERED_BUSINESS_TRAINING_DATASETS = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/business_training/datasets/"
    )

    # 业务测试数据集
    REGISTERED_BUSINESS_TEST_DATASETS = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/business_test/datasets/"
    )
    # ==================== 标注任务相关路径 ====================
    # 单人标注数据集
    REGISTERED_LABEL_DATASETS = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/label/datasets/"
    )

    # 单人标注机器学习数据集
    REGISTERED_LABEL_ML_DATASETS = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/label/ml-datasets/"
    )

    REGISTERED_MACHINE_LEARNING_DATASETS = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/machine_learning/datasets/dataset_{dataset_id}/"
    )

    # 多人标注数据集
    REGISTERED_MULTI_LABEL_DATASETS = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/multi_label/datasets/"
    )

    # 多人标注机器学习数据集
    REGISTERED_MULTI_LABEL_ML_DATASETS = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/multi_label/ml-datasets/"
    )

    # 数据清洗数据集
    REGISTERED_DATA_CLEANING_DATASETS = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/data_cleaning/datasets/"
    )

    REAL_TRAINING_DATASETS = PathConfig(
        mount_path="/data/datasets/",
        storage_path="/{namespace}/training/task/task_{task_id}/datasets/"
    )

    SOURCE_TRAINING_DATASETS = PathConfig(
        mount_path="/data/datasets/",
        storage_path="/{namespace}/training/datasets/"
    )

    SOURCE_IMAGE_UNDERSTAND_TRAINING_DATASETS = PathConfig(
        mount_path="/data/datasets/imageUnderstanding/",
        storage_path="/{namespace}/training/datasets/imageUnderstanding/"
    )

    SOURCE_VALIDATION_DATASETS = PathConfig(
        mount_path="/data/datasets/",
        storage_path="/{namespace}/validation/datasets/"
    )

    SOURCE_IMAGE_UNDERSTAND_VALIDATION_DATASETS = PathConfig(
        mount_path="/data/datasets/imageUnderstanding/",
        storage_path="/{namespace}/validation/datasets/imageUnderstanding/"
    )

    SOURCE_BUSINESS_TRAINING_DATASETS = PathConfig(
        mount_path = "/data/datasets/",
        storage_path = "/{namespace}/business_training/datasets/"
    )

    SOURCE_BUSINESS_TEST_DATASETS = PathConfig(
        mount_path = "/data/datasets/",
        storage_path = "/{namespace}/business_test/datasets/"
    )

    SOURCE_TEST_DATASETS = PathConfig(
        mount_path="/data/datasets/",
        storage_path="/{namespace}/test/datasets/"
    )

    SOURCE_IMAGE_UNDERSTAND_TEST_DATASETS = PathConfig(
        mount_path="/data/datasets/imageUnderstanding/",
        storage_path="/{namespace}/test/datasets/imageUnderstanding/"
    )

    REAL_INFERENCE_DATASETS = PathConfig(
        mount_path="/data/inference_datasets/",
        storage_path="/{namespace}/inference/task/task_{task_id}/datasets/"
    )

    REAL_EVALUATION = PathConfig(
        mount_path="/data/evaluation/",
        storage_path="/{namespace}/evaluation/task/task_{task_id}/datasets/"
    )

    # ==================== 基准评估任务相关路径 ====================
    # 基准评估任务根目录
    BENCHMARK_TASK_ROOT = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/benchmark/task/task_{task_id}/"
    )
    # 基准评估数据集目录：挂载到 /app/data
    BENCHMARK_DATASETS = PathConfig(
        mount_path="/app/data/",
        storage_path="/public/benchmark/datasets/data/"
    )
    # 基准评估 OpenCompass 配置文件（由任务在 submit 前生成并写入此处）
    BENCHMARK_CONFIG = PathConfig(
        mount_path="/data/benchmark/config/opencompass_config.py",
        storage_path="/{namespace}/benchmark/task/task_{task_id}/config/opencompass_config.py"
    )

    TRAINING_CONFIGS = PathConfig(
        mount_path="/data/configs/training_config.yaml",
        storage_path="/{namespace}/training/task/task_{task_id}/config/training_config.yaml"
    )

    TRAINING_MERGE_CONFIGS = PathConfig(
        mount_path="/data/configs/merge_config.yaml",
        storage_path="/{namespace}/training/merge_task/task_{task_id}/config/merge_config.yaml"
    )

    MERGE_TRAINED_MODELS = PathConfig(
        mount_path="/data/models/merge_models/",
        storage_path="/{namespace}/training/finetuned_models/"
    )

    # ==================== 数据清洗任务相关路径 ====================
    # 数据清洗任务根目录
    DATA_CLEANING_TASK_ROOT = PathConfig(
        mount_path=None,
        storage_path="/{namespace}/data_cleaning/task/task_{task_id}/"
    )

    # 数据清洗任务输入数据集（挂载，映射到 /app/clean_data）
    DATA_CLEANING_INPUT_DATASET = PathConfig(
        mount_path="/app/clean_data",
        storage_path="/{namespace}/data_cleaning/datasets/"
    )

    # 数据清洗任务输出数据集（挂载，映射到 /app/output）
    DATA_CLEANING_OUTPUT_DATASET = PathConfig(
        mount_path="/app/output",
        storage_path="/{namespace}/data_cleaning/task/task_{task_id}/output/"
    )

    # 数据清洗任务配置文件（挂载）
    DATA_CLEANING_CONFIG = PathConfig(
        mount_path="/app/deepexi_config/config.yaml",
        storage_path="/{namespace}/data_cleaning/task/task_{task_id}/config/config.yaml"
    )

    # 数据清洗任务 deepexi_plugins 目录（挂载，公共目录，所有任务共享）
    DATA_CLEANING_DEEPEXI_PLUGINS = PathConfig(
        mount_path="/app/deepexi_plugins",
        storage_path="/public/data_cleaning/deepexi_plugins/"
    )

    INFERENCE_CONFIGS = PathConfig(
        mount_path="/data/configs/inference_config.yaml",
        storage_path="/{namespace}/inference/task/task_{task_id}/config/inference_config.yaml"
    )

    INFERENCE_PROMPT_CONFIGS = PathConfig(
        mount_path="/data/configs/inference_prompt_config.j2",
        storage_path="/{namespace}/inference/task/task_{task_id}/config/inference_prompt_config.j2"
    )

    EVALUATION_CONFIGS = PathConfig(
        mount_path="/data/configs/evaluation_config.yaml",
        storage_path="/{namespace}/evaluation/task/task_{task_id}/config/evaluation_config.yaml"
    )

    EVALUATION_PROMPT_CONFIGS = PathConfig(
        mount_path="/data/configs/evaluation_prompt_config.j2",
        storage_path="/{namespace}/evaluation/task/task_{task_id}/config/evaluation_prompt_config.j2"
    )

    INFERENCE_PROCESS_RES = PathConfig(
        mount_path="/data/configs/process.jsonl",
        storage_path="/{namespace}/inference/task/task_{task_id}/config/process.jsonl"
    )

    INFERENCE_STATISTICS_RES = PathConfig(
        mount_path="/data/configs/statistics.jsonl",
        storage_path="/{namespace}/inference/task/task_{task_id}/config/statistics.jsonl"
    )

    EVALUATION_PROCESS_RES = PathConfig(
        mount_path="/data/configs/process.jsonl",
        storage_path="/{namespace}/evaluation/task/task_{task_id}/config/process.jsonl"
    )

    # 基础指标评估进度文件
    EVALUATION_BASIC_METRIC_PROCESS_RES = PathConfig(
        mount_path="/data/configs/basic-metric-process.jsonl",
        storage_path="/{namespace}/evaluation/task/task_{task_id}/config/basic-metric-process.jsonl"
    )

    # 裁判员评估进度文件
    EVALUATION_REFEREE_PROCESS_RES = PathConfig(
        mount_path="/data/configs/referee-process.jsonl",
        storage_path="/{namespace}/evaluation/task/task_{task_id}/config/referee-process.jsonl"
    )

    EVALUATION_STATISTICS_RES = PathConfig(
        mount_path="/data/configs/statistics.jsonl",
        storage_path="/{namespace}/evaluation/task/task_{task_id}/config/statistics.jsonl"
    )

    EVALUATION_STOP_WORD = PathConfig(
        mount_path="/data/evaluation/stop_word.txt",
        storage_path="/{namespace}/evaluation/task/task_{task_id}/datasets/"
    )

    # 在时效性和存储资源有效性，综合考虑，还是改为项目空间级别的
    SCRIPTS = PathConfig(
        mount_path="/app/scripts/",
        storage_path="/{namespace}/scripts/"
    )

    # Notebook环境快照相关路径
    NOTEBOOK_WORK_ENV_SNAPSHOT = PathConfig(
        mount_path="/context",
        storage_path="/{project_name}/notebook/{instance_name}/asset/.snapshot/{snapshot_id}"
    )

    # Notebook案例相关路径
    NOTEBOOK_EXAMPLE = PathConfig(
        mount_path=None,
        storage_path="/public/notebook-example/example-{example_id}/"
    )

    # Notebook案例描述图片相关路径
    NOTEBOOK_EXAMPLE_IMAGE = PathConfig(
        mount_path=None,
        storage_path="/public/notebook-example/images/example-{example_id}/{file_name}"
    )

    # 分片上传临时目录（存储分片文件）
    CHUNK_UPLOAD_TEMP = PathConfig(
        mount_path=None,
        storage_path="/public/chunk_upload/temp/{upload_id}/"
    )

    # 分片上传最终文件目录（按文件哈希组织）
    CHUNK_UPLOAD_FILES = PathConfig(
        mount_path=None,
        storage_path="/public/chunk_upload/files/"
    )

    ML_MODEL = PathConfig(
        mount_path="/data/models/",
        storage_path="/{namespace}/ml/model_{model_id}/"
    )

    # MlTaskType
    ML_MODEL_DEMO = PathConfig(
        mount_path="/workspace/ml_backend/",
        storage_path="/{namespace}/scripts/{ml_task_type}/"
    )

    ML_MODEL_HANDLE_IMP_PY_FILE = PathConfig(
        mount_path="/workspace/ml_backend/model.py",
        storage_path="/{namespace}/ml/model_{model_id}/model_handle/model.py"
    )

    NOTEBOOK_ML_MODEL_HANDLE_IMP_PY_FILE = PathConfig(
        mount_path=f"{NOTEBOOK_WORK_PATH}/model.py",
        storage_path="/{namespace}/ml/model_{model_id}/model_handle/model.py"
    )

    def __init__(self, path_config: PathConfig):
        self._value_ = path_config
        self.mount_path = path_config.mount_path
        self.storage_path = path_config.storage_path

    @classmethod
    def get_by_name(cls, name: str) -> Optional['StoragePath']:
        """根据名称获取存储路径"""
        try:
            return cls[name.upper()]
        except KeyError:
            return None

    def format_storage_path(self, **kwargs) -> str:
        """格式化存储路径，替换占位符"""
        path = self.storage_path
        for key, value in kwargs.items():
            placeholder = f"{{{key}}}"
            if placeholder in path:
                path = path.replace(placeholder, str(value))
        return path

    def format_mount_path(self, **kwargs) -> str:
        """格式化挂载路径，替换占位符"""
        path = self.mount_path
        for key, value in kwargs.items():
            placeholder = f"{{{key}}}"
            if placeholder in path:
                path = path.replace(placeholder, str(value))
        return path

    def get_sub_path(self, **kwargs) -> str:
        """获取子路径，提取storage_path除了第一级路径的子路径，并替换占位符"""
        # 先格式化存储路径
        full_path = self.format_storage_path(**kwargs)

        # 移除开头的斜杠
        if full_path.startswith('/'):
            full_path = full_path[1:]

        # 分割路径
        path_parts = full_path.split('/')

        # 如果路径只有一级或为空，返回空字符串
        if len(path_parts) <= 1:
            return ""

        # 返回除第一级外的所有路径
        sub_path = '/'.join(path_parts[1:])
        return sub_path


class TrainingDatasetMountArtifact(str, Enum):
    """LLaMA Factory 训练任务在单一 media_dir 下使用的物理数据集文件和图片目录。"""

    TRAIN_DATASET_FILE = "custom_dataset.jsonl"
    EVAL_DATASET_FILE = "custom_eval_dataset.jsonl"
    TRAIN_IMAGES_DIR = "train_images"
    EVAL_IMAGES_DIR = "val_images"
    TRAIN_SOURCE_DATASETS_DIR = "train_sources"
    EVAL_SOURCE_DATASETS_DIR = "val_sources"


class LlamaFactoryDatasetName(str, Enum):
    """LLaMA Factory dataset_info.json 中暴露给训练配置使用的逻辑数据集名。"""

    TRAIN = "custom_dataset"
    EVAL = "custom_eval_dataset"


def ml_artifact_basename_is_model_pt(artifact_uri: str) -> bool:
    """产物 JFS 路径的文件名是否为 model.pt（忽略大小写）。

    不可用 ``artifact_uri.endswith("model.pt")``：``best_model.pt``、``foo_model.pt``
    也会以 ``model.pt`` 结尾，会被误判为标准命名，从而跳过「挂到 /data/models/model.pt」的挂载。
    """
    p = (artifact_uri or "").strip().replace("\\", "/")
    if not p:
        return False
    basename = p.rsplit("/", 1)[-1]
    return basename.lower() == "model.pt"
