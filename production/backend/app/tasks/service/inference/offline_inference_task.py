"""
离线推理任务K8s封装类
"""
import os
import yaml
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any

import juicefs
from kubernetes.client import V1VolumeMount, V1Volume, V1Affinity
from sqlalchemy import select

from app.models import TrainingDataset, BaseModel
from app.models.model_manager import TrainedModel
from app.schemas import DatasetFormat
from app.tasks.service.base.base_k8s_task import BaseK8sTask
from app.models.inference_result_manager import InferenceResultDataset
from app.utils.storage_enum import StoragePath, PvcName
from app.schemas.evaluation_task import InferenceParamType
from app.utils.storage_enum import StoragePath
from app.schemas.repository_image import CardType, CardModel, ImageType
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.utils.k8s_utils import build_node_affinity
from app.tasks.service.inference.adapters.adapter_factory import AdapterFactory
from app.tasks.service.inference.adapters.base_adapter import BaseDataFormatAdapter
from app.core.logging import logger


class OfflineInferenceTaskK8s(BaseK8sTask):
    """离线推理任务K8s封装类"""

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
        初始化离线推理任务
        
        Args:
            project_id: 项目ID
            namespace: K8s命名空间
            k8s_uuid: K8s UUID
            launcher: K8s启动器实例
            db: 数据库会话
            dataset_id: 推理结果数据集ID
            dataset: 推理结果数据集对象
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

        # 添加格式特定的存储项
        source_format_specific_items = self.adapter.get_source_storage_items(source_dataset_usage)
        source_volume_mounts, source_volumes = await self.launcher.build_storage_volumes(
            source_format_specific_items,
            namespace=self.namespace,
            task_id=self.dataset.source_dataset_id,
        )

        # 推理结果集的挂载，方便数据写入
        # 根据 model_source 选择模型存储：base_model 用 BASE_MODELS，trained_model 用 INFEERENCE_TRAINED_MODELS
        model_source = (self.dataset.model_source or "base_model").lower()
        if model_source == "trained_model":
            model_storage = {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.INFEERENCE_TRAINED_MODELS}
        else:
            model_storage = {"name": "public-pvc", "enum": StoragePath.BASE_MODELS}
        tag_storage_items = [
            model_storage,
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.INFERENCE_CONFIGS},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.INFERENCE_PROMPT_CONFIGS},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.INFERENCE_PROCESS_RES},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.INFERENCE_STATISTICS_RES},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.SCRIPTS},
        ]
        
        # 添加格式特定的存储项（get_storage_items 是 property，不需要括号）
        format_specific_items = self.adapter.get_storage_items
        tag_storage_items.extend(format_specific_items)
        
        tag_volume_mounts, tag_volumes = await self.launcher.build_storage_volumes(
            tag_storage_items,
            namespace=self.namespace,
            task_id=self.dataset_id,
        )

        volume_mounts = source_volume_mounts + tag_volume_mounts

        # 合并 volumes 并去重（Kubernetes 不允许重复的 volume 名称）
        volumes_dict = {}
        for volume in source_volumes + tag_volumes:
            if volume.name not in volumes_dict:
                volumes_dict[volume.name] = volume
        volumes = list(volumes_dict.values())
        # volumes = source_volumes + tag_volumes

        return volume_mounts, volumes

    async def build_env(self) -> Dict[str, str]:
        """
        构建环境变量
        
        Returns:
            Dict[str, str]: 环境变量字典
        """
        model_source = (self.dataset.model_source or "base_model").lower()
        if model_source == "trained_model":
            model_url = StoragePath.INFEERENCE_TRAINED_MODELS.mount_path.rstrip("/") + "/filename"
        else:
            model_url = StoragePath.BASE_MODELS.mount_path + "filename"

        env_vars = {
            # 打印日志需要用到参数
            "SOURCE_DATASET_ID": str(self.dataset.source_dataset_id),
            "SOURCE_DATASET_NAME": self.dataset.source_dataset_name,
            "INFERENCE_DATASET_ID": str(self.dataset_id),
            "INFERENCE_DATASET_NAME": self.dataset.name,
            "PROJECT_ID": str(self.project_id),

            # 实际需要用到的参数
            "INFERENCE_PARA": str(self.dataset.inference_params),
            "INFERENCE_DATASET_URL": self.dataset.file_path,
            # "MODEL_URL": StoragePath.BASE_MODELS.mount_path + "filename",
            "MODEL_URL": model_url,
        }

        return env_vars

    async def build_cmd_and_args(self) -> List[Tuple[List[str], List[str]]]:
        """
        构建命令和参数
        
        Returns:
            List[Tuple[List[str], List[str]]]: 命令和参数列表，推理任务只返回单个元组（包装成列表）
        """
        command = ["python3"]
        args = ["-m", "scripts.inference.inference_script",
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
        # 从数据库读取 graphics_card_resource
        if self.dataset.graphics_card_resource:
            graphics_card_resource = GraphicsCardResourceConfig(**self.dataset.graphics_card_resource)
        else:
            # 如果没有配置，使用默认值
            graphics_card_resource = GraphicsCardResourceConfig(
                card_type=CardType.GPU,
                card_model=CardModel.A800,
                count=1,
                card_memory="80GB",
                k8s_resource_type=os.getenv("TRAINING_GPU_TYPE", "nvidia.com/gpu")
            )

        # 获取显卡类型和型号
        card_category = graphics_card_resource.card_type.value if hasattr(graphics_card_resource.card_type, 'value') else str(graphics_card_resource.card_type)
        card_model = graphics_card_resource.card_model.value if hasattr(graphics_card_resource.card_model, 'value') else str(graphics_card_resource.card_model) if graphics_card_resource.card_model else None

        # 根据 graphics_card_resource 查找匹配的镜像
        image_address = await self.find_image_address_by_project(
            project_id=self.project_id,
            image_type=ImageType.INFERENCE_IMAGE.value,
            card_category=card_category,
            card_model=card_model
        )

        # 如果未找到指定 card_model 的镜像，则查找默认镜像
        if not image_address:
            logger.info(
                f"未找到 {card_model} 的精确匹配镜像，尝试使用默认镜像: project_id={self.project_id}, "
                f"card_type={card_category}"
            )
            image_address = await self.find_image_address_by_project(
                project_id=self.project_id,
                image_type=ImageType.INFERENCE_IMAGE.value,
                card_category=card_category,
                is_card_model_null=True
            )

        if not image_address:
            raise RuntimeError(
                f"未找到匹配的离线推理镜像: project_id={self.project_id}, graphics_card_resource={graphics_card_resource}"
            )

        return image_address

    async def build_run_resource(self) -> Dict[str, Any]:
        """
        构建运行资源（CPU、内存、GPU等）
        
        Returns:
            Dict[str, Any]: 资源配置字典
        """
        # 从数据库读取 graphics_card_resource
        if self.dataset.graphics_card_resource:
            graphics_card_resource = GraphicsCardResourceConfig(**self.dataset.graphics_card_resource)
        else:
            # 如果没有配置，使用默认值
            graphics_card_resource = GraphicsCardResourceConfig(
                card_type=CardType.GPU,
                card_model=CardModel.A800,
                count=1,
                card_memory="80GB",
                k8s_resource_type=os.getenv("TRAINING_GPU_TYPE", "nvidia.com/gpu")
            )

        # GPU设置（使用新的资源配置模型）
        gpu_type_final = graphics_card_resource.get_k8s_gpu_type()
        gpu_count_str = graphics_card_resource.get_k8s_gpu_count()

        return {
            "cpu_limit": None,
            "memory_limit": None,
            "cpu_request": None,
            "memory_request": None,
            "gpu_type": gpu_type_final,
            "gpu_count": gpu_count_str,
        }

    async def build_node_affinity(self) -> Optional[V1Affinity]:
        """
        构建节点亲和性配置
        
        Returns:
            Optional[V1Affinity]: 节点亲和性配置
        """
        # 从数据库读取 graphics_card_resource
        if self.dataset.graphics_card_resource:
            graphics_card_resource = GraphicsCardResourceConfig(**self.dataset.graphics_card_resource)
        else:
            # 如果没有配置，使用默认值
            graphics_card_resource = GraphicsCardResourceConfig(
                card_type=CardType.GPU,
                card_model=CardModel.A800,
                count=1,
                card_memory="80GB",
                k8s_resource_type=os.getenv("TRAINING_GPU_TYPE", "nvidia.com/gpu")
            )

        # 构建节点亲和性
        affinity = None
        # affinity = build_node_affinity(
        #     card_model=graphics_card_resource.card_model,
        #     card_memory=graphics_card_resource.card_memory
        # )

        return affinity

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
        return f"offline-inference-{self.dataset_id}"

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
        logger.info(f"离线推理任务配置 - dataset_id: {self.dataset_id}, job_name: {job_name}")
        logger.info(f"使用镜像: {image}")
        logger.info(f"GPU配置: type={resources['gpu_type']}, count={resources['gpu_count']}")

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
            if self.dataset.inference_params:
                template_content = self.dataset.inference_params.get("prompt_template")
            
            # 2. 如果没有自定义 template，则加载本地默认模版
            if not template_content:
                # 获取项目根目录 (app/tasks/service/inference/offline_inference_task.py -> 4 levels up)
                project_root = Path(__file__).parent.parent.parent.parent.parent
                default_template_path = project_root / "app/tasks/service/inference/inference_prompt.j2"
                
                if not default_template_path.exists():
                    logger.warning(f"本地默认 prompt 模板文件不存在: {default_template_path}，跳过上传")
                    return
                
                with open(default_template_path, 'r', encoding='utf-8') as f:
                    template_content = f.read()
                
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

            logger.info(f"Prompt模板已成功上传到JuiceFS: -> {dest_path}")
        except Exception as e:
            logger.error(f"构建Prompt配置失败: {e}")
            raise RuntimeError(f"构建Prompt配置失败: {str(e)}")

    async def build_config(self):
        """
        构建推理配置文件并上传到JuiceFS
        
        从inference_params构建YAML配置文件，包含推理参数和vLLM客户端配置
        支持 base_model（基本模型）和 trained_model（训练后模型）两种来源
        """
        try:
            model_source = (self.dataset.model_source or "base_model").lower()
            if model_source == "trained_model":
                trained_model: TrainedModel = await self.db.query_one(
                    select(TrainedModel).filter(TrainedModel.id == self.dataset.model_id)
                )
                if not trained_model or not trained_model.model_path:
                    raise RuntimeError(f"未找到训练模型或模型路径为空: {self.dataset.model_id}")
                registered_base = StoragePath.INFEERENCE_TRAINED_MODELS.format_storage_path(
                    namespace=self.namespace
                )
                relative_path = trained_model.model_path.replace(registered_base, "").lstrip("/")
                model_path = StoragePath.INFEERENCE_TRAINED_MODELS.mount_path.rstrip("/") + "/" + relative_path
                model_name = trained_model.name
            else:
                base_model: BaseModel = await self.db.query_one(
                    select(BaseModel).filter(BaseModel.id == self.dataset.model_id)
                )
                if not base_model:
                    raise RuntimeError(f"未找到推理模型: {self.dataset.model_id}")
                model_path = StoragePath.BASE_MODELS.mount_path + base_model.model_path.replace("/public/models/", "")
                model_name = base_model.name

            training_dataset: TrainingDataset = await self.db.query_one(
                select(TrainingDataset).filter(TrainingDataset.id == self.dataset.source_dataset_id))

            # 使用适配器获取输入文件路径（适配器会根据格式处理路径）
            input_file = self.adapter.get_input_file_path(training_dataset.dataset_path)

            # 使用适配器获取输出文件路径（适配器会根据格式处理路径）
            output_file = self.adapter.get_output_file_path(self.dataset.file_path)

            # 构建配置字典
            config = {
                "inference": {
                    InferenceParamType.TEMPERATURE.value: InferenceParamType.TEMPERATURE.default_value,
                    InferenceParamType.MAX_TOKENS.value: InferenceParamType.MAX_TOKENS.default_value,
                    InferenceParamType.TOP_P.value: InferenceParamType.TOP_P.default_value,
                    InferenceParamType.REPETITION_PENALTY.value: InferenceParamType.REPETITION_PENALTY.default_value,
                },
                "vllm": {
                    "model_path": model_path,
                    "tensor_parallel_size": 1,
                    "max_model_len": None,
                    "gpu_memory_utilization": InferenceParamType.GPU_MEMORY_UTILIZATION.default_value,
                    "max_num_batched_tokens": None,
                    "max_num_seqs": 32,
                },
                "prompt": {
                    "template_path": StoragePath.INFERENCE_PROMPT_CONFIGS.mount_path,
                },
                "runtime": {
                    "client_type": "vllm",  # 推理客户端类型，可选值: "openai", "vllm"
                    "log_level": "INFO",  # 日志级别，可选值: "DEBUG", "INFO", "WARNING", "ERROR"
                    # 输入文件路径（可以是单个文件或文件列表）
                    "input_file": [input_file],
                    # 输出文件路径（可以是单个文件或文件列表，数量需与输入文件一致）
                    "output_file": [output_file],
                    # 进度文件路径（用于记录实时进度信息，JSONL格式，可选）
                    # 如果未指定，则不写入进度文件
                    "progress_file": StoragePath.INFERENCE_PROCESS_RES.mount_path,
                    # 统计文件路径（用于记录统计信息，JSONL格式，可选）
                    # 如果未指定，则不写入统计文件
                    "statistics_file": StoragePath.INFERENCE_STATISTICS_RES.mount_path
                },
                "data": {
                    "batch_size": self.get_batch_size_by_count(self.dataset.total_items),
                    "format": self.dataset.dataset_format,
                    "skip_errors": True,
                },
                "output": {
                    "format": "jsonl",
                }
            }

            # 如果有推理参数配置，更新配置
            if self.dataset.inference_params:
                # 复制一份参数，避免修改原始数据
                inf_params = self.dataset.inference_params.copy()

                # 提取 vLLM 特有参数：gpu_memory_utilization
                if InferenceParamType.GPU_MEMORY_UTILIZATION.value in inf_params:
                    config["vllm"]["gpu_memory_utilization"] = inf_params.pop(
                        InferenceParamType.GPU_MEMORY_UTILIZATION.value
                    )

                # 更新通用推理参数（此时已剔除 vLLM 特有参数）
                config["inference"].update(inf_params)

            # 根据graphics_card_resource设置tensor_parallel_size（必须与GPU数量一致）
            if self.dataset.graphics_card_resource:
                graphics_card_resource = GraphicsCardResourceConfig(**self.dataset.graphics_card_resource)
            else:
                # 如果没有配置，使用默认值（与build_run_resource保持一致）
                graphics_card_resource = GraphicsCardResourceConfig(
                    card_type=CardType.GPU,
                    card_model=CardModel.A800,
                    count=1,
                    card_memory="80GB",
                    k8s_resource_type=os.getenv("TRAINING_GPU_TYPE", "nvidia.com/gpu")
                )
            
            # 设置tensor_parallel_size为GPU数量
            config["vllm"]["tensor_parallel_size"] = graphics_card_resource.count
            
            # 记录vLLM配置信息
            logger.info(
                f"vLLM配置 - dataset_id: {self.dataset_id}, "
                f"model: {model_name}, "
                f"tensor_parallel_size: {graphics_card_resource.count}, "
                f"gpu_memory_utilization: {config['vllm']['gpu_memory_utilization']}"
            )
            logger.warning(
                f"注意：模型的注意力头数量必须能被 tensor_parallel_size ({graphics_card_resource.count}) 整除，"
                f"否则 vLLM 会报错。小模型（如 Qwen2.5-0.5B）建议使用 1-2 个 GPU。"
            )

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
            logger.info(f"推理结果集 {self.dataset_id} 配置文件内容:\n{yaml_content}")
            with self.jfs.open(config_path, 'w', encoding='utf-8') as f:
                f.write(yaml_content)

            logger.info(f"推理配置已保存到: {config_path}")
        except Exception as e:
            logger.error(f"构建推理配置失败: {e}")
            raise RuntimeError(f"构建推理配置失败: {str(e)}")
