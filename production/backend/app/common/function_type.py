from enum import Enum


class FunctionType(Enum):
    DATA_MANAGER_TRAINING_DATASET = "数据管理-训练数据集",
    DATA_MANAGER_INFERENCE_RESULT = "数据管理-推理结果数据集",
    DATA_MANAGER_EVALUATION_TASK = "数据管理-评估任务",
    DATA_MANAGER_COMMON_CONFIG = "数据管理-通用配置",
    NOTEBOOK = "在线Notebook",
    TRAINING_MODEL = "模型训练",
    INFERENCE_SERVICE = "推理服务",
    MODEL_MANAGER = "模型管理",
    PROJECT_MANAGER = "项目管理",
    MEMBER_MANAGER = "成员管理",
    CLUSTER_MANAGER = "集群管理",
    STORAGE_CONFIG = "存储配置",
    IMAGE_LIST = "镜像列表",
    IMAGE_REPOSITORY = "镜像仓库",
    BASE_MODEL_MANAGER = "基础模型管理",
    ONLINE_INFERENCE_SERVICE = "在线推理服务",
    ONLINE_ANNOTATION_SERVICE = "在线标注服务",
    THIRD_PARTY_INTERFACE = "第三方api接口",
    BUSINESS_INFERENCE_RESULT_DATASET = "业务推理结果集",
    BUSINESS_ATTR = "业务属性",
