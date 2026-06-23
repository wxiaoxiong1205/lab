import time
from datetime import datetime
from functools import wraps
from typing import Callable, Optional

from dependency_injector.wiring import Provide
from fastapi import Response

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.core.logging import logger
from app.models.models import OperatorLogs
from app.services.inference_service.inference_service import DefaultInferenceServiceService
from app.services.k8s.interface import K8sService
from app.services.log.interface import OperatorLogsService
from app.services.model.interface import ModelService
from app.services.notebook.interface import NotebookService
from app.services.project.interface import ProjectService
from app.services.repository.interface import RepositoryService
from app.services.repository_image.interface import RepositoryImageService
from app.services.storage.interface import StorageService
from app.services.training_dataset.interface import TrainingDatasetService
from app.services.training_task.interface import TrainingTaskService
from app.utils import app_runtime_context
from app.utils.app_runtime_context import get_ip_addr
from app.utils.user_info_context import get_current_user_info


# 定义自定义注解类
async def handle_self_service(mapping: Optional[dict], args, kwargs) -> str:
    if mapping is None:
        return None
    service_name = mapping["service_name"]
    field_name = mapping["field_name"]
    tag_field_name = mapping["tag_field_name"]

    id_field_value = None

    split = field_name.split(".")

    for index, key in enumerate(split, start=0):
        if index == 0:
            get = kwargs.get(key)
            id_field_value = get
        if index == 1:
            id_field_value = get.__dict__.get(key)

    match service_name:
        case "project_service":
            project_service: ProjectService = AutoContainer.project_service()
            by_id = await project_service.get_by_id(id_field_value)
            if by_id is not None:
                return by_id.__getattribute__(tag_field_name)
            pass
        case "notebook_service":
            notebook_service: NotebookService = AutoContainer.notebook_service()
            by_id = await notebook_service.get_notebook_detail(id_field_value)
            if by_id is not None:
                return by_id.__getattribute__(tag_field_name)
            pass
        case "repository_service":
            repository_service: RepositoryService = AutoContainer.repository_service()
            by_id = await repository_service.get_repository(id_field_value)
            if by_id is not None:
                return by_id.__getattribute__(tag_field_name)
            pass
        case "training_dataset_service":
            training_dataset_service: TrainingDatasetService = AutoContainer.repository_service()
            by_id = await training_dataset_service.get_by_id(id_field_value)
            if by_id is not None:
                return by_id.__getattribute__(tag_field_name)
            pass
        case "model_service":
            model_service: ModelService = AutoContainer.model_service()
            by_id = await model_service.get_by_id(id_field_value)
            if by_id is not None:
                return by_id.__getattribute__(tag_field_name)
            pass
        case "repository_image_service":
            repository_image_service: RepositoryImageService = AutoContainer.repository_image_service()
            by_id = await repository_image_service.get_by_id(id_field_value)
            if by_id is not None:
                return by_id.__getattribute__(tag_field_name)
            pass
        case "k8s_service":
            k8s_service: K8sService = AutoContainer.k8s_service()
            by_id = await k8s_service.get_by_id(id_field_value)
            if by_id is not None:
                return by_id.__getattribute__(tag_field_name)
            pass
        case "training_task_service":
            training_task_service: TrainingTaskService = AutoContainer.training_task_service()
            by_id = await training_task_service.get_by_id(id_field_value)
            if by_id is not None:
                return by_id.__getattribute__(tag_field_name)
            pass
        case "operator_logs_service":
            operator_logs_service: OperatorLogsService = AutoContainer.operator_logs_service()
            by_id = await operator_logs_service.get_by_id(id_field_value)
            if by_id is not None:
                return by_id.__getattribute__(tag_field_name)
            pass
        case "storage_service":
            storage_service: StorageService = AutoContainer.storage_service()
            by_id = await storage_service.get_by_id(id_field_value)
            if by_id is not None:
                return by_id.__getattribute__(tag_field_name)
            pass
        case "inference_service_service":
            online_inference_service_service: DefaultInferenceServiceService = AutoContainer.inference_service_service()
            by_id = await online_inference_service_service.get_by_id(id_field_value)
            if by_id is not None:
                return by_id.__getattribute__(tag_field_name)
            pass
    return None
    pass


class OperatorLogsAnnotation:
    def __init__(self, function_name: FunctionType, table_name: str, operator_type: OperatorType,
                 operator_content_key: [],
                 self_service_field_mapping: Optional[dict],
                 scope_service_field_mapping: Optional[dict]):
        self.function_name = function_name
        self.table_name = table_name
        self.operator_type = operator_type
        self.operator_content_key = operator_content_key
        self.self_service_field_mapping = self_service_field_mapping
        self.scope_service_field_mapping = scope_service_field_mapping

    def __call__(self, func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 记录请求开始时间
            start_time = time.time()
            log_data = OperatorLogs()
            # 先执行原函数，确保业务逻辑只执行一次
            result = await func(*args, **kwargs)
            try:
                # 如果不需要记录三元日志，直接返回结果
                if not app_runtime_context.get_san_yuan_tag():
                    return result

                log_data.tenant_id = app_runtime_context.get_tenant_id()
                log_data.created_at = datetime.now()
                log_data.updated_at = datetime.now()
                log_data.created_id = get_current_user_info().userId
                log_data.created_by = get_current_user_info().username
                log_data.function_name = self.function_name.value[0]
                log_data.operation_type = self.operator_type.value[0]

                log_data.table_name = self.table_name
                log_data.account = get_current_user_info().username
                log_data.ip_addres = get_ip_addr()

                # 按照定义的规格进行返回操作内容  数据集 （版本），项目名
                operator_content = ""
                if self.operator_content_key is not None:
                    operation_content_list = []
                    for item in self.operator_content_key:
                        operation_content = ""
                        contain_tag = False
                        item = str(item)
                        if item.startswith("（") and item.endswith("）"):
                            operation_content = operation_content + "("
                            contain_tag = True
                            item = item[1:-1]

                        split = item.split(".")

                        operation_content_core = None
                        for index, key in enumerate(split, start=0):
                            if index == 0:
                                get = kwargs.get(key)
                                operation_content_core = get
                            if index == 1:
                                operation_content_core = get.__dict__.get(key)

                        if operation_content_core is not None:
                            operation_content = operation_content + operation_content_core
                        if not contain_tag:
                            # 添加中文逗号
                            operation_content = operation_content + "，"
                        if contain_tag:
                            operation_content = operation_content + "）"
                        operation_content_list.append(operation_content)

                    operator_content = "".join(operation_content_list)[0:-1]

                self_operator_logs_value = await handle_self_service(self.self_service_field_mapping, args=args,
                                                                     kwargs=kwargs)
                if self_operator_logs_value is not None:
                    operator_content += self_operator_logs_value

                scope_operator_logs_value = await handle_self_service(self.scope_service_field_mapping, args, kwargs)
                if scope_operator_logs_value is not None:
                    operator_content += "，" + scope_operator_logs_value

                logs_service_: OperatorLogsService = AutoContainer.operator_logs_service()
                if app_runtime_context.get_operator_log_content() is not None and len(operator_content) == 0:
                    log_data.operation_content = app_runtime_context.get_operator_log_content()
                else:
                    log_data.operation_content = operator_content
                await logs_service_.create(log_data)
            except Exception as e:
                # 这里不让日志插入失败影响到正常的业务流程
                logger.exception(f"操作日志逻辑异常, e= {e}")
            finally:
                # 计算执行时间
                logger.info(f"接口执行时间{(time.time() - start_time) * 1000:.2f}ms")
            # 返回原函数的执行结果
            return result
        return wrapper
