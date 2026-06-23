from enum import Enum
# =============== 状态定义 ===============
class K8sLabels(Enum):
    DEEPEXI_K8S_UUID = "deepexilab_k8s_uuid"  # 状态更新唯一标志,str字段
    DEEPEXI_STATUS_UPDATE_RELEVANT_TABLE = "deepexilab_status_update_relevant_table" # 状态更新相关表
    DEEPEXI_LOG_RECORD = "deepexilab_log_record" # 是否记录日志 true/false
    DEEPEXI_STATUS_AUTO_UPDATE = "deepexilab_status_auto_update" # 是否自动更新状态 true/false

# =============== 服务类型定义（固定组合） ===============
class ServiceLabels(Enum):
    NOTEBOOK = {
        K8sLabels.DEEPEXI_STATUS_AUTO_UPDATE.value: "true",
        K8sLabels.DEEPEXI_STATUS_UPDATE_RELEVANT_TABLE.value: "notebooks",
        K8sLabels.DEEPEXI_LOG_RECORD.value: "false",
    }
    
    TRAINING = {
        K8sLabels.DEEPEXI_STATUS_AUTO_UPDATE.value: "true",
        K8sLabels.DEEPEXI_STATUS_UPDATE_RELEVANT_TABLE.value: "training_tasks",
        K8sLabels.DEEPEXI_LOG_RECORD.value: "true",
    }

    LORA_MERGE = {
        K8sLabels.DEEPEXI_STATUS_AUTO_UPDATE.value: "true",
        K8sLabels.DEEPEXI_STATUS_UPDATE_RELEVANT_TABLE.value: "trained_models",
        K8sLabels.DEEPEXI_LOG_RECORD.value: "true",
    }

    INFERENCE = {
        K8sLabels.DEEPEXI_STATUS_AUTO_UPDATE.value: "true",
        K8sLabels.DEEPEXI_STATUS_UPDATE_RELEVANT_TABLE.value: "inference_tasks",
        K8sLabels.DEEPEXI_LOG_RECORD.value: "true",
    }

    INFERENCE_RESULT_DATASETS = {
        K8sLabels.DEEPEXI_STATUS_AUTO_UPDATE.value: "true",
        K8sLabels.DEEPEXI_STATUS_UPDATE_RELEVANT_TABLE.value: "inference_result_datasets",
        K8sLabels.DEEPEXI_LOG_RECORD.value: "true",
    }

    EVALUATION = {
        K8sLabels.DEEPEXI_STATUS_AUTO_UPDATE.value: "true",
        K8sLabels.DEEPEXI_STATUS_UPDATE_RELEVANT_TABLE.value: "evaluation_tasks",
        K8sLabels.DEEPEXI_LOG_RECORD.value: "true",
    }

    BENCHMARK = {
        K8sLabels.DEEPEXI_STATUS_AUTO_UPDATE.value: "true",
        K8sLabels.DEEPEXI_STATUS_UPDATE_RELEVANT_TABLE.value: "benchmark_tasks",
        K8sLabels.DEEPEXI_LOG_RECORD.value: "true",
    }

    DATA_CLEANING = {
        K8sLabels.DEEPEXI_STATUS_AUTO_UPDATE.value: "true",
        K8sLabels.DEEPEXI_STATUS_UPDATE_RELEVANT_TABLE.value: "data_cleaning_tasks",
        K8sLabels.DEEPEXI_LOG_RECORD.value: "true",
    }

    MODEL_DOWNLOAD = {
        K8sLabels.DEEPEXI_STATUS_AUTO_UPDATE.value: "true",
        K8sLabels.DEEPEXI_STATUS_UPDATE_RELEVANT_TABLE.value: "base_models",
        K8sLabels.DEEPEXI_LOG_RECORD.value: "true",
    }

    BUILD_NOTEBOOK_IMAGE = {
        K8sLabels.DEEPEXI_STATUS_AUTO_UPDATE.value: "true",
        K8sLabels.DEEPEXI_STATUS_UPDATE_RELEVANT_TABLE.value: "image_build_log",
        K8sLabels.DEEPEXI_LOG_RECORD.value: "true",
    }


# 定义服务字符串映射关系，例子server_type = notebook
SERVER_TYPE_MAPPING = {
    "notebook": ServiceLabels.NOTEBOOK,
    "training": ServiceLabels.TRAINING,
    "loramerge": ServiceLabels.LORA_MERGE,
    "data_cleaning": ServiceLabels.DATA_CLEANING,
    # 这个给模型推理引擎使用
    "inference": ServiceLabels.INFERENCE,
    # 这个给推理结果集使用
    "inference_result_datasets": ServiceLabels.INFERENCE_RESULT_DATASETS,
    "evaluation": ServiceLabels.EVALUATION,
    "benchmark": ServiceLabels.BENCHMARK,
    "model-download": ServiceLabels.MODEL_DOWNLOAD,
    "build-notebook-image":ServiceLabels.BUILD_NOTEBOOK_IMAGE
}

# =============== 使用方法 ===============
def get_service_labels(uuid: str, server_type: str) -> dict:
    """
    根据 uuid 和字符串 server_type 返回完整的 k8s labels
    """
    try:
        service_enum = SERVER_TYPE_MAPPING[server_type]
    except KeyError:
        raise ValueError(f"Unsupported server_type: {server_type}")

    base = {
        K8sLabels.DEEPEXI_K8S_UUID.value: uuid,
    }
    return {**base, **service_enum.value}


if __name__ == "__main__":
    labels = get_service_labels("11111", "notebook")
    print(labels)