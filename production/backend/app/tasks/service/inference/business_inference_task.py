"""
业务推理任务K8s封装类
"""
import json
import os
import yaml
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
import jsonpath_ng
import juicefs
from kubernetes.client import V1VolumeMount, V1Volume, V1Affinity
from sqlalchemy import select

from app.models import TrainingDataset
from app.models.models import ThirdPartyApiServiceModel
from app.schemas import DatasetFormat
from app.tasks.service.base.base_k8s_task import BaseK8sTask
from app.models.inference_result_manager import InferenceResultDataset
from app.tasks.third_api_batch_request_tasks import generate_template
from app.utils.storage_enum import StoragePath, PvcName
from app.schemas.repository_image import CardType, ImageType
from app.tasks.service.inference.adapters.adapter_factory import AdapterFactory
from app.tasks.service.inference.adapters.base_adapter import BaseDataFormatAdapter
from app.core.logging import logger


class BusinessInferenceTaskK8s(BaseK8sTask):
    """业务推理任务K8s封装类（参照在线推理逻辑）"""
    
    def __init__(
        self,
        project_id: int,
        namespace: str,
        k8s_uuid: str,
        launcher,
        db,
        dataset_id: int,
        dataset: InferenceResultDataset,
        jfs: juicefs.Client,
    ):
        """
        初始化业务推理任务
        
        Args:
            project_id: 项目ID
            namespace: K8s命名空间
            k8s_uuid: K8s UUID
            launcher: K8s启动器实例
            db: 数据库会话
            dataset_id: 推理结果数据集ID
            dataset: 推理结果数据集对象
            jfs: JuiceFS客户端
        """
        super().__init__(project_id, namespace, k8s_uuid, launcher, db)
        self.dataset_id = dataset_id
        self.dataset = dataset
        self.jfs = jfs
        # 创建数据格式适配器
        self.adapter: BaseDataFormatAdapter = AdapterFactory.create_adapter(dataset)
    
    def _get_jfs_client(self) -> Optional[juicefs.Client]:
        """获取 JuiceFS 客户端"""
        return self.jfs
    
    def _get_task_id(self) -> Optional[int]:
        """获取任务ID（推理任务使用 dataset_id）"""
        return self.dataset_id
    
    async def build_volume_and_mount(self) -> Tuple[List[V1VolumeMount], List[V1Volume]]:
        """
        构建存储卷和挂载配置
        
        Returns:
            Tuple[List[V1VolumeMount], List[V1Volume]]: 卷挂载列表和卷列表
        """

        # 构建prompt配置并上传到jfs
        await self.build_prompt_config()

        # 将process_file和statistics_file上传到jfs,作为null文件，仅创建文件即可
        await self.build_process_and_statistics()

        # 构建参数config，并上传到jfs
        await self.build_config()

        # 将脚本上传到jfs
        await self.build_script_configs()

        # 挂载原数据集（根据数据集类型选择对应的存储路径）
        # 查询源数据集的 usage 字段，确定数据集类型（training/validation/test）
        source_dataset_usage = "training"  # 默认值
        if self.dataset.source_dataset_id:
            try:
                source_dataset = await self.db.query_one(
                    select(TrainingDataset).filter(TrainingDataset.id == self.dataset.source_dataset_id)
                )
                if source_dataset:
                    source_dataset_usage = source_dataset.usage or "training"
            except Exception as e:
                logger.warning(f"查询源数据集类型失败: {e}，使用默认值 training")
        
        # 业务推理通过第三方API去调用，不需要挂载模型

        # 添加格式特定的存储项
        source_format_specific_items = self.adapter.get_source_storage_items(source_dataset_usage)

        source_storage_items = [
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.INFERENCE_CONFIGS},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.INFERENCE_PROMPT_CONFIGS},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.INFERENCE_PROCESS_RES},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.INFERENCE_STATISTICS_RES},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.SCRIPTS},
        ]

        source_storage_items.extend(source_format_specific_items)
        
        # 添加格式特定的存储项（get_storage_items 是 property，不需要括号）
        format_specific_items = self.adapter.get_storage_items
        source_storage_items.extend(format_specific_items)
        
        volume_mounts, volumes = await self.launcher.build_storage_volumes(
            source_storage_items,
            namespace=self.namespace,
            task_id=self.dataset.id,
        )

        return volume_mounts, volumes
    
    async def build_env(self) -> Dict[str, str]:
        """
        构建环境变量
        
        Returns:
            Dict[str, str]: 环境变量字典
        """

        env_vars = {
            # debug参数
            "SOURCE_DATASET_ID": str(self.dataset.source_dataset_id),
            "SOURCE_DATASET_NAME": self.dataset.source_dataset_name,
            "INFERENCE_DATASET_ID": str(self.dataset_id),
            "INFERENCE_DATASET_NAME": self.dataset.name,
            "PROJECT_ID": str(self.project_id),
            "ONLINE_SERVICE_ID": str(self.dataset.online_service_id) if self.dataset.online_service_id else "",
            "ONLINE_SERVICE_NAME": self.dataset.online_service_name or "",

            # 实际会用到的参数
            # 推理参数
            "INFERENCE_PARA": str(self.dataset.inference_params),
            "INFERENCE_DATASET_URL": self.dataset.file_path,
            "BASE_URL": "",
            "OPEN_API_KEY": "",
            "MODEL_NAME": ""
        }
        
        return env_vars
    
    async def build_cmd_and_args(self) -> List[Tuple[List[str], List[str]]]:
        """
        构建命令和参数（业务推理使用专门的脚本）
        
        Returns:
            List[Tuple[List[str], List[str]]]: 命令和参数列表，推理任务只返回单个元组（包装成列表）
        """
        command = ["python3"]
        # 业务推理使用专门的 business_inference_script
        args = ["-m", "scripts.inference.business_inference_script",
                "--config_file",
                StoragePath.INFERENCE_CONFIGS.mount_path
                ]
        
        return [(command, args)]
    
    async def build_image(self) -> str:
        """
        获取容器镜像地址
        
        使用基类的 find_image_address_by_project 方法，避免使用共享的 AutoContainer 服务
        
        Returns:
            str: 镜像地址
        """
        # 先尝试查找 CPU 类型的镜像
        image_address = await self.find_image_address_by_project(
            project_id=self.project_id,
            image_type=ImageType.INFERENCE_IMAGE.value,
            card_category=CardType.CPU.value
        )
        
        # 如果未找到，尝试查找 card_model 为 NULL 的默认镜像
        if not image_address:
            logger.info(f"未找到 CPU 类型镜像，尝试查找默认镜像: project_id={self.project_id}")
            image_address = await self.find_image_address_by_project(
                project_id=self.project_id,
                image_type=ImageType.INFERENCE_IMAGE.value,
                card_category=CardType.CPU.value,
                is_card_model_null=True
            )
        
        if not image_address:
            raise RuntimeError(
                f"未找到匹配的业务推理镜像: project_id={self.project_id}"
            )
        
        return image_address
    
    async def build_run_resource(self) -> Dict[str, Any]:
        """
        构建运行资源（CPU、内存、GPU等）
        
        Returns:
            Dict[str, Any]: 资源配置字典
        """
        return {
            "cpu_limit": "1",
            "memory_limit": "2Gi",
            "cpu_request": "1",
            "memory_request": "2Gi",
            "gpu_type": None,
            "gpu_count": "0",
        }
    
    async def build_node_affinity(self) -> Optional[V1Affinity]:
        """
        构建节点亲和性配置（业务推理不需要）
        
        Returns:
            Optional[V1Affinity]: 返回None
        """
        return None
    
    async def build_service_type(self) -> str:
        """
        构建服务类型标识
        
        Returns:
            str: 服务类型
        """
        return "inference_result_datasets"
    
    async def build_job_name(self) -> str:
        """
        构建Job名称
        
        Returns:
            str: Job名称
        """
        return f"business-inference-{self.dataset_id}"
    
    # build_script_configs 方法已由 BaseK8sTask 提供默认实现，自动扫描 scripts 目录
    
    async def submit(self) -> str:
        """
        提交任务到K8s
        
        Returns:
            str: Job名称
        """
        # 构建所有配置
        volume_mounts, volumes = await self.build_volume_and_mount()
        env_vars = await self.build_env()
        cmd_and_args_list = await self.build_cmd_and_args()
        # 推理任务只有一个命令和参数
        command, args = cmd_and_args_list[0]
        image = await self.build_image()
        resources = await self.build_run_resource()
        working_dir = await self.build_working_dir()
        security_context = await self.build_security_context()
        service_type = await self.build_service_type()
        job_name = await self.build_job_name()
        affinity = await self.build_node_affinity()
        
        # 打印关键配置信息
        logger.info(f"业务推理任务配置 - dataset_id: {self.dataset_id}, job_name: {job_name}")
        logger.info(f"使用镜像: {image}")
        logger.info(f"CPU配置: type={resources['gpu_type']}, count={resources['gpu_count']}")
        
        # 创建Job
        await self.launcher.create_job(
            namespace=self.namespace,
            job_name=job_name,
            image=image,
            service_type=service_type,
            command=command,
            args=args,
            cpu_limit=resources["cpu_limit"],
            memory_limit=resources["memory_limit"],
            cpu_request=resources["cpu_request"],
            memory_request=resources["memory_request"],
            gpu_type=resources["gpu_type"],
            gpu_count=resources["gpu_count"],
            env_vars=env_vars,
            volume_mounts=volume_mounts,
            volumes=volumes,
            working_dir=working_dir,
            security_context=security_context,
            automount_service_account_token=True,
            k8s_uuid=self.k8s_uuid,
            affinity=affinity,
        )
        
        return job_name

    async def build_prompt_config(self):
        """
        构建Prompt配置并上传到JuiceFS
        
        从 inference_params 中提取 prompt_template，如果没有则使用本地默认的 inference_prompt.j2
        """
        try:
            # 1. 尝试从 inference_params 获取自定义 template
            template_content = None
            source_path = ''
            if self.dataset.inference_params:
                template_content = self.dataset.inference_params.get("prompt_template")
            
            # 2. 如果没有自定义 template，则加载本地默认模版
            if not template_content:
                # 获取项目根目录 (app/tasks/service/inference/business_inference_task.py -> 4 levels up)
                project_root = Path(__file__).parent.parent.parent.parent.parent
                default_template_path = project_root / "app/tasks/service/inference/inference_prompt.j2"
                
                if not default_template_path.exists():
                    logger.warning(f"本地默认 prompt 模板文件不存在: {default_template_path}，跳过上传")
                    return
                
                with open(default_template_path, 'r', encoding='utf-8') as f:
                    template_content = f.read()
                source_path = default_template_path

                logger.info(f"推理任务 {self.dataset_id} 使用默认 prompt 模板")
            else:
                logger.info(f"推理任务 {self.dataset_id} 使用自定义 prompt 模板")
            
            # 构建目标路径（JuiceFS中的路径）
            dest_path = StoragePath.INFERENCE_PROMPT_CONFIGS.format_storage_path(
                namespace=self.namespace,
                task_id=self.dataset_id
            )


            
            # 确保目录存在
            remote_dir = os.path.dirname(dest_path)
            if remote_dir:
                self.jfs.makedirs(remote_dir, exist_ok=True)

            # 将文件内容写入到 JuiceFS
            with self.jfs.open(dest_path, 'w', encoding='utf-8') as f:
                f.write(template_content)
            
            logger.info(f"Prompt模板已成功上传到JuiceFS: {source_path} -> {dest_path}")
        except Exception as e:
            logger.error(f"构建Prompt配置失败: {e}")
            raise RuntimeError(f"构建Prompt配置失败: {str(e)}")

    async def build_config(self):
        """
        构建推理配置文件并上传到JuiceFS
        
        从inference_params构建YAML配置文件，包含业务API配置（RESTful API）
        """

        training_dataset: TrainingDataset = await self.db.query_one(
            select(TrainingDataset).filter(TrainingDataset.id == self.dataset.source_dataset_id))


        logger.info(F"SHUJUJU:{training_dataset}")
        # 使用适配器获取输入文件路径（适配器会根据格式处理路径）
        input_file = self.adapter.get_input_file_path(training_dataset.dataset_path)

        # 使用适配器获取输出文件路径（适配器会根据格式处理路径）
        output_file = self.adapter.get_output_file_path(self.dataset.file_path)

        # 查询第三方API配置
        third_party_api: ThirdPartyApiServiceModel = await self.db.query_one(
            select(ThirdPartyApiServiceModel).filter(ThirdPartyApiServiceModel.id == self.dataset.online_service_id))

        if third_party_api is None:
            raise RuntimeError(f"第三方API不存在， id: {self.dataset.online_service_id}")

        try:
            # 从第三方API配置中提取 headers（整个 header 字典）
            headers = third_party_api.header if third_party_api.header else []

            # 请求头
            header_tmp = {}
            if headers is not None:
                for e in headers:
                    header_tmp.setdefault(e.get("name"), e.get("value"))


            request_params = third_party_api.request_param if third_party_api.request_param else []

            response_param=third_party_api.response_param if third_party_api.response_param else []
            request_params_tmp=generate_template(request_params)



            
            # 从 inference_params 中提取 request_map 和 response_map
            request_map = []
            response_map = []
            if self.dataset.inference_params:
                request_map = self.dataset.inference_params.get("request_map", [])
                response_map = self.dataset.inference_params.get("response_map", [])
            # 构建配置字典（业务推理使用 RESTful API）
            config = {
                "business_api": {
                    "base_url": third_party_api.base_url,  # API 基础 URL
                    "headers": header_tmp,  # 请求头（包含认证信息等）
                    "request_params_tmp": request_params_tmp,
                    "request_params_binding": extract_binding_fields(request_params,"binding"),
                    "response_params_inference": extract_binding_fields(response_param,"inference"),
                    "request_params_inference": extract_binding_fields(request_params, "inference"),
                    "request_map": request_map,  # 请求字段映射
                    "response_map": response_map,  # 响应字段映射
                    "timeout": 120,  # 超时时间（秒）
                    "max_concurrent": 4,  # 最大并发数
                },
                "runtime": {
                    "log_level": "INFO",  # 日志级别
                    "input_file": [input_file],  # 输入文件路径
                    "output_file": [output_file],  # 输出文件路径
                    "progress_file": StoragePath.INFERENCE_PROCESS_RES.mount_path,  # 进度文件
                },
                "data": {
                    "batch_size": 100,  # 批次大小（业务推理建议较小的批次）
                    "skip_errors": True,  # 跳过错误数据
                },
            }
            # 构建配置文件路径
            config_path = StoragePath.INFERENCE_CONFIGS.format_storage_path(
                namespace=self.namespace,
                task_id=self.dataset_id
            )
            
            # 确保目录存在
            remote_dir = os.path.dirname(config_path)
            if remote_dir:
                self.jfs.makedirs(remote_dir, exist_ok=True)
            
            # 写入配置文件
            yaml_content = yaml.dump(config, default_flow_style=False, allow_unicode=True, sort_keys=False)
            logger.info(f"业务推理配置文件内容:\n{yaml_content}")
            with self.jfs.open(config_path, 'w', encoding='utf-8') as f:
                f.write(yaml_content)
            
            logger.info(f"业务推理配置已保存到: {config_path}")
        except Exception as e:
            logger.error(f"构建业务推理配置失败: {e}")
            raise RuntimeError(f"构建业务推理配置失败: {str(e)}")



    def generate_template(data)->Dict[str,Any]:
        """
        递归生成模板（根据 data_type 自动适配类型：array 生成数组，其他生成字典/基础值）
        :param data: 原始 JSON 解析后的列表/字典
        :return: 目标模板字典
        """
        template = {}
        for item in data:
            # 1. 生成键：id 转大写 ID，其余保持原名称
            key = item["name"]

            # 2. 生成基础值：优先取 default_value（转数字），无则设为 None
            if "default_value" in item and item["default_value"] is not None:
                    # 尝试将 default_value 转为数字（如 "1" → 1）
                    value = item["default_value"]
                    # 根据 data_type 进行类型转换
                    data_type = item.get("data_type", "")
                    if data_type == "number":
                        # 尝试将值转为数字
                        if isinstance(value, str):
                            try:
                                value = int(value)
                            except ValueError:
                                try:
                                    value = float(value)
                                except ValueError:
                                    pass
                        elif not isinstance(value, (int, float)):
                            try:
                                value = float(value)
                            except ValueError:
                                pass
                    elif data_type == "boolean":
                        # 尝试将值转为布尔类型
                        if isinstance(value, str):
                            value = value.lower() in ["true", "1", "yes", "y"]
                        else:
                            value = bool(value)
            else:
                value = None
            # 3. 处理子节点（核心：根据 data_type 决定生成数组/字典）
            if item.get("child") and isinstance(item["child"], list):
                # 递归生成子模板（字典格式）
                child_template = generate_template(item["child"])

                # 如果当前字段是 array 类型，生成数组（集合）模板；否则生成字典模板
                if item["data_type"] == "array":
                    # array 类型 → 数组包裹子模板（集合类型）
                    value = [child_template]
                else:
                    # 非 array 类型 → 直接用子字典
                    value = child_template
            # 4. 将键值对加入最终模板
            template[key] = value
        return template


def extract_binding_fields(fields,field_name:str, parent_path="", result=None):
        """
        递归提取所有binding=True的字段，生成desc和jsonpath
        :param fields: 字段配置列表（原始数据）
        :param parent_path: 父级JSONPath路径（递归用）
        :param result: 存储结果的列表（递归用）
        :return: 提取后的结果列表
        """
        # 初始化结果列表（首次调用时）
        if result is None:
            result = []

        for field in fields:
            # 1. 拼接当前字段的JSONPath路径
            if parent_path:
                # 父级路径存在时，拼接子字段路径
                current_path = f"{parent_path}.{field['name']}"
            else:
                # 根级字段，路径以$.开头
                current_path = f"$.{field['name']}"

            # 2. 判断当前字段是否binding=True，若是则加入结果
            if field.get(field_name, False) is True:
                result.append({
                    "desc": field.get("desc", ""),  # 无desc时默认空字符串
                    "jsonpath": current_path,
                    "name":field.get("name", "")
                })

            # 3. 处理嵌套的child字段（数组类型）
            child_fields = field.get("child")
            if child_fields and isinstance(child_fields, list):
                # 数组类型的子字段，JSONPath需要加[*]（匹配数组所有元素）
                child_parent_path = f"{current_path}[*]"
                # 递归处理子字段
                extract_binding_fields(child_fields,field_name, child_parent_path, result)

        return result