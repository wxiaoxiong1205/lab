"""
在线评估任务K8s封装类
"""
import json
import os
import yaml
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any

import juicefs
from kubernetes.client import V1VolumeMount, V1Volume, V1Affinity
from sqlalchemy import select

from app.models.models import InferenceService
from app.tasks.service.base.base_k8s_task import BaseK8sTask
from app.models.evaluation_task_manager import EvaluationTask
from app.utils import app_runtime_context
from app.utils.storage_enum import StoragePath, PvcName
from app.schemas.evaluation_task import InferenceParamType
from app.utils.storage_enum import StoragePath
from app.schemas.repository_image import CardType, ImageType
from app.core.logging import logger
from app.tasks.service.evaluation.adapters.adapter_factory import EvaluationAdapterFactory


class OnlineEvaluationTaskK8s(BaseK8sTask):
    """在线评估任务K8s封装类"""
    
    def __init__(
        self,
        project_id: int,
        namespace: str,
        k8s_uuid: str,
        launcher,
        db,
        task_id: int,
        evaluation_task: EvaluationTask,
        relations: List,
        datasets: List,
        jfs: juicefs.Client,
    ):
        """
        初始化在线评估任务
        
        Args:
            project_id: 项目ID
            namespace: K8s命名空间
            k8s_uuid: K8s UUID
            launcher: K8s启动器实例
            db: 数据库会话
            task_id: 评估任务ID
            evaluation_task: 评估任务对象
            relations: 评估任务关联的推理结果集关系列表
            datasets: 推理结果集对象列表
        """
        super().__init__(project_id, namespace, k8s_uuid, launcher, db)
        self.task_id = task_id
        self.evaluation_task = evaluation_task
        self.relations = relations
        self.datasets = datasets
        self._inference_dataset_info: Optional[Dict] = None
        self.jfs = jfs
        
        # 验证数据格式一致性并创建统一的适配器
        self.adapter = EvaluationAdapterFactory.create_adapter(datasets)
        unified_format = self.adapter.data_format
        logger.info(f"评估任务 {task_id} 使用统一的数据格式适配器: {unified_format}")
    
    def _get_jfs_client(self) -> Optional[juicefs.Client]:
        """获取 JuiceFS 客户端"""
        return self.jfs
    
    def _get_task_id(self) -> Optional[int]:
        """获取任务ID"""
        return self.task_id
    
    async def build_volume_and_mount(self) -> Tuple[List[V1VolumeMount], List[V1Volume]]:
        """
        构建存储卷和挂载配置
        
        Returns:
            Tuple[List[V1VolumeMount], List[V1Volume]]: 卷挂载列表和卷列表
        """
        # 1. 预先提取推理结果集信息（供后续 build_config 使用）
        # 获取所有推理结果集ID
        dataset_ids = [r.inference_result_dataset_id for r in self.relations]
        unique_dataset_ids = list(set(dataset_ids))
        
        # 构建数据集ID到数据集对象的映射
        dataset_map = {d.id: d for d in self.datasets}
        inference_dataset_info = {}
        
        for dataset_id in unique_dataset_ids:
            dataset = dataset_map.get(dataset_id)
            if not dataset:
                continue
            
            # 记录推理结果集信息
            inference_dataset_info[dataset_id] = {
                "id": dataset_id,
                "name": dataset.name,
                "file_path": dataset.file_path,
                "total_items": dataset.total_items,
                "inference_method": dataset.inference_method,
            }
        self._inference_dataset_info = inference_dataset_info

        # 2. 构建配置并上传到jfs
        # 构建prompt配置并上传到jfs
        await self.build_prompt_config()

        # 将process_file和statistics_file上传到jfs,作为null文件，仅创建文件即可
        # 评估任务需要根据 evaluation_method 创建不同的进度文件
        await self.build_evaluation_process_and_statistics()

        # 构建参数config，并上传到jfs
        await self.build_config()

        # 将脚本上传到jfs
        await self.build_script_configs()

        # 3. 构建卷挂载（根据数据格式决定文件级或文件夹级挂载）
        volume_mounts = []
        volumes = []
        
        # 收集推理结果集的JFS路径列表
        inference_result_datasets_jfs = [
            dataset.file_path 
            for dataset_id, dataset in dataset_map.items() 
            if dataset and dataset.file_path
        ]
        
        # 获取评估结果的JFS路径列表
        evaluation_jfs = self.evaluation_task.result_file_path or []
        
        # 获取适配器需要的存储路径列表
        storage_paths_items = self.adapter.get_storage_paths(
            inference_result_datasets_jfs=inference_result_datasets_jfs,
            evaluation_jfs=evaluation_jfs
        )
        
        # 挂载评估结果 config prompt输出路径
        evaluation_storage_items = [
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.EVALUATION_CONFIGS},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.EVALUATION_PROMPT_CONFIGS},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.REAL_EVALUATION},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.EVALUATION_BASIC_METRIC_PROCESS_RES},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.EVALUATION_REFEREE_PROCESS_RES},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.EVALUATION_STATISTICS_RES},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.SCRIPTS},
        ]
        evaluation_storage_items.extend(storage_paths_items)
        evaluation_volume_mounts, evaluation_volumes = await self.launcher.build_storage_volumes(
            evaluation_storage_items,
            namespace=self.namespace,
            task_id=self.task_id,
        )
        volume_mounts.extend(evaluation_volume_mounts)
        volumes.extend(evaluation_volumes)
        
        return volume_mounts, volumes
    
    async def build_env(self) -> Dict[str, str]:
        """
        构建环境变量
        
        Returns:
            Dict[str, str]: 环境变量字典
        """
        env_vars = {
            "EVALUATION_TASK_ID": str(self.task_id),
            "EVALUATION_TASK_NAME": self.evaluation_task.name,
            "PROJECT_ID": str(self.project_id),
            "EVALUATION_METHOD": self.evaluation_task.evaluation_method,
            "EVALUATION_TYPE": self.evaluation_task.evaluation_type,
            "NAMESPACE": self.namespace,
            "EVALUATION_MODE": "online",

            "EVALUATION_PROMPT_CONFIG": json.dumps(self.evaluation_task.evaluation_prompt_config),
            "BASIC_METRIC_CONFIG": json.dumps(self.evaluation_task.basic_metric_config),
            # 注意这里是复合json，因为可能是多个推理结果集
            "INFERENCE_DATASET_INFO": json.dumps(self._inference_dataset_info or {}),
            "EVALUATION_RESULT_PATH": json.dumps(self.evaluation_task.result_file_path or []),

        }
        
        if self.evaluation_task.evaluation_method == "referee" and self.evaluation_task.referee_model_id:
            env_vars["REFEREE_MODEL_ID"] = str(self.evaluation_task.referee_model_id)
        
        return env_vars
    
    async def build_cmd_and_args(self) -> List[Tuple[List[str], List[str]]]:
        """
        构建命令和参数
        
        Returns:
            List[Tuple[List[str], List[str]]]: 命令和参数列表，每个元素是一个 (command, args) 元组
            - referee: 返回单个元组（裁判员评估）
            - basic_metric: 返回单个元组（基础指标评估）
            - all: 返回两个元组（基础指标评估和裁判员评估）
        """
        evaluation_method = self.evaluation_task.evaluation_method
        result = []

        # 构建基础指标评估的命令和参数（用于 basic_metric 和 all）
        def build_basic_metric_cmd_args():
            # 从 basic_metric_config 中提取指标列表
            metrics_list = []
            stopwords_file = None
            if self.evaluation_task.basic_metric_config:
                metrics_list = self.evaluation_task.basic_metric_config.get("metrics", [])
                stopwords_file = self.evaluation_task.basic_metric_config.get("stop_words")

            if not metrics_list:
                raise ValueError("基础指标评估需要至少选择一个指标")

            # 将指标名称转换为指标代码（映射中文名称到代码）
            metric_name_to_code = {
                "准确率": "accuracy",
                "F1": "f1",
                "ROUGE-1": "rouge-1",
                "Rouge-2": "rouge-2",
                "Rouge-L": "rouge-l",
                "rouge-l": "rouge-l",  # 兼容小写
                "BLEU-4": "bleu-4",
                "格式遵从性": "format_compliance",
                "语义相似度": "semantic_similarity"
            }

            metric_codes = []
            for metric_name in metrics_list:
                # 如果已经是代码格式，直接使用；否则尝试映射
                if metric_name in ["accuracy", "f1", "rouge-1", "rouge-2", "rouge-l", "bleu-4", "format_compliance",
                                   "semantic_similarity"]:
                    metric_codes.append(metric_name)
                elif metric_name in metric_name_to_code:
                    metric_codes.append(metric_name_to_code[metric_name])
                else:
                    logger.warning(f"未知的指标名称: {metric_name}，跳过")

            if not metric_codes:
                raise ValueError("没有有效的指标代码")

            # 根据evaluation_method过滤输出文件路径
            # 当evaluation_method=all时，result_file_path包含两套文件路径（基础指标评估和裁判员评估）
            # 这里只需要基础指标评估的输出文件路径
            basic_metric_result_file_path = self._filter_basic_metric_output_files(self.evaluation_task.result_file_path)
            
            # 使用适配器方法提取输入和输出文件路径
            file_list_mount, output_files_mount = self._get_input_and_output_files_with_adapter(
                inference_dataset_info=self._inference_dataset_info or {},
                result_file_path=basic_metric_result_file_path
            )

            command = ["python3"]
            args = ["-m", "scripts.basic_metrics.main",
                    "--input_file", *file_list_mount,
                    "--output_file", *output_files_mount,
                    "--metrics", *metric_codes,
                    "--progress_file", StoragePath.EVALUATION_BASIC_METRIC_PROCESS_RES.mount_path
                    ]

            # 如果有停用词文件，添加到参数中
            if stopwords_file:
                # 将 JuiceFS 路径转换为容器中的挂载路径
                stopwords_mount_path = self.get_mount_path_from_jfs_path(
                    stopwords_file,
                    mount_prefix=StoragePath.REAL_EVALUATION.mount_path
                )
                if stopwords_mount_path:
                    args.extend(["--stop_words", stopwords_mount_path])
                else:
                    logger.warning(f"无法将停用词文件路径转换为挂载路径: {stopwords_file}，将跳过停用词参数")
            
            return command, args

        # 构建裁判员评估的命令和参数（用于 referee 和 all）
        def build_referee_cmd_args():
            command = ["python3"]
            args = ["-m", "scripts.inference.evaluate_script",
                    "--config_file",
                    StoragePath.EVALUATION_CONFIGS.mount_path
                    ]
            return command, args

        if evaluation_method == "referee":
            # 只返回裁判员评估
            result.append(build_referee_cmd_args())
        elif evaluation_method == "basic_metric":
            # 只返回基础指标评估
            result.append(build_basic_metric_cmd_args())
        elif evaluation_method == "all":
            # 返回两个：基础指标评估和裁判员评估
            result.append(build_basic_metric_cmd_args())
            result.append(build_referee_cmd_args())
        else:
            raise ValueError(f"不支持的评估方法: {evaluation_method}")
        
        return result
    
    async def build_image(self) -> str:
        """
        获取容器镜像地址
        
        使用基类的 find_image_address_by_project 方法，避免使用共享的 AutoContainer 服务
        
        Returns:
            str: 镜像地址
        """
        # 在线评估使用 CPU 镜像
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
                f"未找到匹配的在线评估镜像: project_id={self.project_id}"
            )
        return image_address
    
    async def build_run_resource(self) -> Dict[str, Any]:
        """
        构建运行资源（CPU、内存、GPU等）
        
        Returns:
            Dict[str, Any]: 资源配置字典
        """
        # 在线评估使用 CPU 资源
        return {
            "cpu_limit": None,
            "memory_limit": None,
            "cpu_request": None,
            "memory_request": None,
            "gpu_type": None,
            "gpu_count": "0",
        }
    
    async def build_node_affinity(self) -> Optional[V1Affinity]:
        """
        构建节点亲和性配置（在线评估不需要）
        
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
        return "evaluation"
    
    async def build_job_name(self) -> str:
        """
        构建Job名称
        
        Returns:
            str: Job名称
        """
        return f"online-evaluation-{self.task_id}"
    
    # build_script_configs 方法已由 BaseK8sTask 提供默认实现，自动扫描 scripts 目录
    
    async def submit(self) -> str:
        """
        提交任务到K8s
        
        Returns:
            str: Job名称
            - referee/basic_metric: 返回单容器Job名称
            - all: 返回多容器Job名称（包含基础指标评估和裁判员评估两个容器）
        """
        # 构建所有配置
        volume_mounts, volumes = await self.build_volume_and_mount()
        env_vars = await self.build_env()
        cmd_and_args_list = await self.build_cmd_and_args()
        image = await self.build_image()
        resources = await self.build_run_resource()
        working_dir = await self.build_working_dir()
        security_context = await self.build_security_context()
        service_type = await self.build_service_type()
        base_job_name = await self.build_job_name()
        affinity = await self.build_node_affinity()
        
        # 打印关键配置信息
        logger.info(f"在线评估任务配置 - task_id: {self.task_id}, 评估方法: {self.evaluation_task.evaluation_method}")
        logger.info(f"使用镜像: {image}")
        logger.info(f"CPU配置: type={resources['gpu_type']}, count={resources['gpu_count']}")

        evaluation_method = self.evaluation_task.evaluation_method
        
        # 如果是 all 类型，创建一个包含两个容器的 Job
        if evaluation_method == "all":
            if len(cmd_and_args_list) != 2:
                raise ValueError(f"all 评估方法需要两个命令配置，但得到 {len(cmd_and_args_list)} 个")
            
            # Job 名称拼接 all 字样
            job_name = f"{base_job_name}-all"
            
            # 构建两个容器的配置
            containers_config = []
            
            # 第一个容器：基础指标评估
            basic_metric_command, basic_metric_args = cmd_and_args_list[0]
            containers_config.append({
                "name": f"{job_name}-basic-metric",
                "image": image,
                "command": basic_metric_command,
                "args": basic_metric_args,
                "env_vars": env_vars,
                "cpu_limit": resources["cpu_limit"],
                "memory_limit": resources["memory_limit"],
                "cpu_request": resources["cpu_request"],
                "memory_request": resources["memory_request"],
                "gpu_type": resources["gpu_type"],
                "gpu_count": resources["gpu_count"],
                "working_dir": working_dir
            })
            
            # 第二个容器：裁判员评估
            referee_command, referee_args = cmd_and_args_list[1]
            containers_config.append({
                "name": f"{job_name}-referee",
                "image": image,
                "command": referee_command,
                "args": referee_args,
                "env_vars": env_vars,
                "cpu_limit": resources["cpu_limit"],
                "memory_limit": resources["memory_limit"],
                "cpu_request": resources["cpu_request"],
                "memory_request": resources["memory_request"],
                "gpu_type": resources["gpu_type"],
                "gpu_count": resources["gpu_count"],
                "working_dir": working_dir
            })
            
            logger.info(f"创建多容器Job: {job_name}，包含基础指标评估和裁判员评估两个容器")
            
            # 创建多容器 Job
            await self.launcher.create_multi_container_job(
                namespace=self.namespace,
                job_name=job_name,
                containers_config=containers_config,
                service_type=service_type,
                volume_mounts=volume_mounts,
                volumes=volumes,
                security_context=security_context,
                automount_service_account_token=True,
                k8s_uuid=self.k8s_uuid,
                affinity=affinity,
            )
            
            return job_name
        else:
            # 单个评估方法：创建一个单容器 Job
            if len(cmd_and_args_list) != 1:
                raise ValueError(f"单个评估方法需要1个命令配置，但得到 {len(cmd_and_args_list)} 个")
            
            command, args = cmd_and_args_list[0]
            logger.info(f"创建单容器Job: {base_job_name}")
            
            await self.launcher.create_job(
                namespace=self.namespace,
                job_name=base_job_name,
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
            
            return base_job_name

    async def build_evaluation_process_and_statistics(self) -> None:
        """
        创建评估任务的进度文件和统计文件到 JuiceFS（空文件）
        
        根据 evaluation_method 创建不同的进度文件：
        - referee: 创建 referee-process.jsonl
        - basic_metric: 创建 basic-metric-process.jsonl
        - all: 创建两个进度文件（basic-metric-process.jsonl 和 referee-process.jsonl）
        """
        jfs = self._get_jfs_client()
        task_id = self._get_task_id()
        
        if not jfs or not task_id:
            logger.warning("JuiceFS 客户端或任务ID不可用，跳过创建进度和统计文件")
            return
        
        evaluation_method = self.evaluation_task.evaluation_method
        statistics_path = StoragePath.EVALUATION_STATISTICS_RES.format_storage_path(
            namespace=self.namespace,
            task_id=task_id
        )
        
        # 确定需要创建的进度文件列表（使用新枚举）
        progress_files = []
        if evaluation_method in ["basic_metric", "all"]:
            # 基础指标评估的进度文件
            basic_metric_path = StoragePath.EVALUATION_BASIC_METRIC_PROCESS_RES.format_storage_path(
                namespace=self.namespace,
                task_id=task_id
            )
            progress_files.append(basic_metric_path)
        
        if evaluation_method in ["referee", "all"]:
            # 裁判员评估的进度文件
            referee_path = StoragePath.EVALUATION_REFEREE_PROCESS_RES.format_storage_path(
                namespace=self.namespace,
                task_id=task_id
            )
            progress_files.append(referee_path)
        
        # 创建进度文件
        for progress_file in progress_files:
            try:
                # 确保目录存在
                process_dir = os.path.dirname(progress_file)
                if process_dir:
                    jfs.makedirs(process_dir, exist_ok=True)
                
                # 如果文件已存在，跳过
                if jfs.exists(progress_file):
                    logger.debug(f"进度文件已存在，跳过创建: {progress_file}")
                else:
                    # 创建空文件
                    with jfs.open(progress_file, 'w', encoding='utf-8') as f:
                        f.write('')
                    logger.info(f"已创建进度文件: {progress_file}")
            except Exception as e:
                logger.error(f"创建进度文件失败 {progress_file}: {e}")
                # 不抛出异常，继续创建其他文件
        
        # 创建统计文件
        try:
            # 确保目录存在
            statistics_dir = os.path.dirname(statistics_path)
            if statistics_dir:
                jfs.makedirs(statistics_dir, exist_ok=True)
            
            # 如果文件已存在，跳过
            if jfs.exists(statistics_path):
                logger.debug(f"统计文件已存在，跳过创建: {statistics_path}")
            else:
                # 创建空文件
                with jfs.open(statistics_path, 'w', encoding='utf-8') as f:
                    f.write('')
                logger.info(f"已创建统计文件: {statistics_path}")
        except Exception as e:
            logger.error(f"创建统计文件失败 {statistics_path}: {e}")
            # 不抛出异常，允许任务继续执行

    async def build_prompt_config(self):
        """
        构建Prompt配置并上传到JuiceFS
        
        从evaluation_prompt_config中提取prompt_template，保存为.j2文件
        """
        # 如果没有配置 prompt_template，则使用默认模版
        prompt_template = None
        if self.evaluation_task.evaluation_prompt_config:
            prompt_template = self.evaluation_task.evaluation_prompt_config.get("prompt_template")
        
        if not prompt_template:
            # 只有裁判员评估需要 prompt_template
            if self.evaluation_task.evaluation_method not in ["referee", "all"]:
                return
                
            logger.info(f"评估任务 {self.task_id} 没有配置 prompt_template，使用默认模版")
            try:
                # 获取项目根目录 (app/tasks/service/evaluation/online_evaluation_task.py -> 5 levels up)
                project_root = Path(__file__).parent.parent.parent.parent.parent
                default_template_path = project_root / "scripts/inference/config/prompt_template.evaluate.example.j2"
                with open(default_template_path, 'r', encoding='utf-8') as f:
                    prompt_template = f.read()
            except Exception as e:
                logger.error(f"加载默认 prompt 模板失败，这个模版很重要，没有这个后续的任务会跑失败，这个是关键信息，jfs上的挂载文件会变成目录: {e}")
                return
        
        try:
            # 构建prompt模板文件路径
            prompt_template_path = StoragePath.EVALUATION_PROMPT_CONFIGS.format_storage_path(
                namespace=self.namespace,
                task_id=self.task_id
            )
            
            # 确保目录存在
            remote_dir = os.path.dirname(prompt_template_path)
            if remote_dir:
                self.jfs.makedirs(remote_dir, exist_ok=True)
            
            # 写入prompt模板文件
            with self.jfs.open(prompt_template_path, 'w', encoding='utf-8') as f:
                f.write(prompt_template)
            
            logger.info(f"Prompt模板已保存到: {prompt_template_path}")
        except Exception as e:
            logger.error(f"构建Prompt配置失败: {e}")
            raise RuntimeError(f"构建Prompt配置失败: {str(e)}")

    async def build_config(self):
        """
        构建推理配置文件并上传到JuiceFS
        
        为裁判员评估任务构建推理配置文件，包含推理参数和OpenAI客户端配置
        """
        if self.evaluation_task.evaluation_method not in ["referee", "all"]:
            # 只有裁判员评估需要推理配置
            return

        inference_service: InferenceService = await self.db.query_one(
            select(InferenceService).filter(InferenceService.id == self.evaluation_task.referee_model_id))

        if inference_service is None:
            raise RuntimeError(f"在线推理服务不存在， id: {self.evaluation_task.referee_model_id}")
        
        try:
            # 根据evaluation_method过滤输出文件路径
            # 当evaluation_method=all时，result_file_path包含两套文件路径（基础指标评估和裁判员评估）
            # 这里只需要裁判员评估的输出文件路径
            referee_result_file_path = self._filter_referee_output_files(self.evaluation_task.result_file_path)
            
            # 使用适配器方法提取输入和输出文件路径
            file_list_mount, output_files_mount = self._get_input_and_output_files_with_adapter(
                inference_dataset_info=self._inference_dataset_info or {},
                result_file_path=referee_result_file_path
            )

            # 从 evaluation_prompt_config 中提取 metrics 配置
            metrics_config = await self._build_metrics_config()

            # 获取推理结果集的总数
            total_items = None
            for dataset in self.datasets:
                total_items = dataset.total_items
            
            # 构建配置字典（在线评估使用OpenAI客户端）
            config = {
                "inference": {
                    InferenceParamType.TEMPERATURE.value: InferenceParamType.TEMPERATURE.default_value,
                    InferenceParamType.MAX_TOKENS.value: InferenceParamType.MAX_TOKENS.default_value,
                    InferenceParamType.TOP_P.value: InferenceParamType.TOP_P.default_value,
                    InferenceParamType.REPETITION_PENALTY.value: InferenceParamType.REPETITION_PENALTY.default_value,
                },
                "openai": {
                    "api_key": inference_service.api_key,  # 从环境变量或配置中获取
                    "base_url": inference_service.base_url,  # 从环境变量或配置中获取
                    "model": inference_service.model_name,  # 从环境变量或配置中获取
                    "timeout": 120,
                    "max_retries": 3,
                    "max_concurrent": 4,
                },
                "prompt": {
                    "template_path": StoragePath.EVALUATION_PROMPT_CONFIGS.mount_path,
                },
                "runtime": {
                    "client_type": "openai",
                    "log_level": "INFO",
                    "input_file": file_list_mount,
                    "output_file": output_files_mount,
                    "progress_file": StoragePath.EVALUATION_REFEREE_PROCESS_RES.mount_path,
                    "statistics_file": StoragePath.EVALUATION_STATISTICS_RES.mount_path,
                    # 推理结果数据集ID列表（用于在统计文件中标识数据集）
                    "inference_result_dataset_id": list(self._inference_dataset_info.keys()) if self._inference_dataset_info else []
                },
                "data": {
                    "batch_size": self.get_batch_size_by_count(total_items),
                    "skip_errors": True,
                },
                "output": {
                    "format": "jsonl",
                }
            }
            
            # 添加 metrics 配置（评估任务必需）
            if metrics_config:
                config["metrics"] = metrics_config
            
            # 如果有推理参数配置，更新inference部分
            if self.evaluation_task.referee_inference_params:
                config["inference"].update(self.evaluation_task.referee_inference_params)
            
            # 构建配置文件路径
            config_path = StoragePath.EVALUATION_CONFIGS.format_storage_path(
                namespace=self.namespace,
                task_id=self.task_id
            )
            
            # 确保目录存在
            remote_dir = os.path.dirname(config_path)
            if remote_dir:
                self.jfs.makedirs(remote_dir, exist_ok=True)
            
            # 写入配置文件
            yaml_content = yaml.dump(config, default_flow_style=False, allow_unicode=True, sort_keys=False)
            logger.info(f"评估任务 {self.task_id} 配置文件内容:\n{yaml_content}")
            with self.jfs.open(config_path, 'w', encoding='utf-8') as f:
                f.write(yaml_content)
            
            logger.info(f"推理配置已保存到: {config_path}")
        except Exception as e:
            logger.error(f"构建推理配置失败: {e}")
            raise RuntimeError(f"构建推理配置失败: {str(e)}")
    
    def _filter_referee_output_files(self, result_file_path: Optional[List[str]]) -> Optional[List[str]]:
        """
        过滤出裁判员评估的输出文件路径
        
        当evaluation_method=all时，result_file_path包含两套文件路径（基础指标评估和裁判员评估）
        此方法用于过滤出只包含裁判员评估的输出文件路径
        
        使用特殊标识符 __REFEREE_T{task_id}__ 来匹配，该标识符位于 source_{dataset_id} 和 timestamp 之间
        标识符中包含任务ID，确保唯一性和准确性
        
        Args:
            result_file_path: 完整的输出文件路径列表
        
        Returns:
            Optional[List[str]]: 只包含裁判员评估的输出文件路径列表
        """
        if not result_file_path:
            return None
        
        # 如果evaluation_method不是all，直接返回原列表
        if self.evaluation_task.evaluation_method != "all":
            return result_file_path
        
        # 使用正则表达式匹配，确保匹配的是完整的标识符（位于 source_{数字} 之后）
        # 匹配模式：source_{数字}__REFEREE_T{task_id}__
        import re
        task_id = self.task_id
        referee_pattern = re.compile(rf'source_\d+__REFEREE_T{task_id}__')
        
        referee_files = [path for path in result_file_path if referee_pattern.search(path)]
        
        return referee_files if referee_files else None
    
    def _filter_basic_metric_output_files(self, result_file_path: Optional[List[str]]) -> Optional[List[str]]:
        """
        过滤出基础指标评估的输出文件路径
        
        当evaluation_method=all时，result_file_path包含两套文件路径（基础指标评估和裁判员评估）
        此方法用于过滤出只包含基础指标评估的输出文件路径
        
        使用特殊标识符 __BASIC_METRIC_T{task_id}__ 来匹配，该标识符位于 source_{dataset_id} 和 timestamp 之间
        标识符中包含任务ID，确保唯一性和准确性
        
        Args:
            result_file_path: 完整的输出文件路径列表
        
        Returns:
            Optional[List[str]]: 只包含基础指标评估的输出文件路径列表
        """
        if not result_file_path:
            return None
        
        # 如果evaluation_method不是all，直接返回原列表
        if self.evaluation_task.evaluation_method != "all":
            return result_file_path
        
        # 使用正则表达式匹配，确保匹配的是完整的标识符（位于 source_{数字} 之后）
        # 匹配模式：source_{数字}__BASIC_METRIC_T{task_id}__
        import re
        task_id = self.task_id
        basic_metric_pattern = re.compile(rf'source_\d+__BASIC_METRIC_T{task_id}__')
        
        basic_metric_files = [path for path in result_file_path if basic_metric_pattern.search(path)]
        
        return basic_metric_files if basic_metric_files else None
    
    async def _build_metrics_config(self) -> Optional[List[Dict[str, Any]]]:
        """
        从 evaluation_prompt_config 中提取并构建 metrics 配置
        
        如果 metric 中有 system_metric_id，会从数据库查询对应的分值范围信息
        
        Returns:
            Optional[List[Dict[str, Any]]]: metrics 配置列表，如果没有则返回 None
        """
        if not self.evaluation_task.evaluation_prompt_config:
            return None
        
        metrics = self.evaluation_task.evaluation_prompt_config.get("metrics")
        if not metrics or not isinstance(metrics, list):
            logger.warning(f"评估任务 {self.task_id} 的 evaluation_prompt_config 中没有有效的 metrics 配置")
            return None
        
        metrics_config = []
        for metric in metrics:
            if not isinstance(metric, dict):
                logger.warning(f"跳过无效的指标配置: {metric}")
                continue
            
            # 构建单个指标的配置
            metric_config = {
                "name": metric.get("name", ""),
                "description": metric.get("description", ""),
            }
            
            # 处理分值范围

            system_metric_id = metric.get("system_metric_id")
            if system_metric_id:
                try:
                    from app.models.basic_metric_manager import EvaluationMetrics
                    tenant_id = app_runtime_context.get_tenant_id()
                    app_runtime_context.set_tenant_id(None)
                    system_metric = await self.db.query_one(
                        select(EvaluationMetrics).filter(EvaluationMetrics.id == system_metric_id)
                    )
                    app_runtime_context.set_tenant_id(tenant_id)
                    if system_metric and system_metric.score_scope and len(system_metric.score_scope) > 0:
                        # score_scope 是一个列表，需要转换
                        score_scopes = system_metric.score_scope

                        # 获取所有 score_min 和 score_max
                        score_mins = [scope.get("score_min") for scope in score_scopes if scope.get("score_min") is not None]
                        score_maxs = [scope.get("score_max") for scope in score_scopes if scope.get("score_max") is not None]

                        # score_min 取最小值，score_max 取最大值
                        if score_mins and score_maxs:
                            metric_config["score_min"] = min(score_mins)
                            metric_config["score_max"] = max(score_maxs)

                            # 直接使用数据库中的 score_definitions 内容，仅进行换行拼接
                            score_definitions_list = [
                                scope.get("score_definitions", "")
                                for scope in score_scopes
                                if scope.get("score_definitions")
                            ]
                            # 合并为字符串，方便 Jinja2 直接引用
                            metric_config["score_definitions"] = "\n".join(score_definitions_list) if score_definitions_list else ""
                        else:
                            logger.warning(f"系统指标 {system_metric_id} 的分值范围配置无效")
                    else:
                        logger.warning(f"系统指标 {system_metric_id} 没有分值范围配置")
                except Exception as e:
                    logger.error(f"查询系统指标 {system_metric_id} 失败: {e}")
            else:
                logger.warning(f"指标 {metric.get('name')} 缺少分值范围配置")
            
            # 处理字段映射（metrics_mapping）
            metrics_mapping = metric.get("metrics_mapping")
            if metrics_mapping and isinstance(metrics_mapping, dict):
                metric_config["field_mapping"] = metrics_mapping
            
            metrics_config.append(metric_config)
        
        if not metrics_config:
            logger.warning(f"评估任务 {self.task_id} 没有有效的指标配置")
            return None
        
        logger.info(f"构建了 {len(metrics_config)} 个评估指标配置")
        return metrics_config
    
    def _get_input_and_output_files_with_adapter(
        self,
        inference_dataset_info: Dict[str, Dict[str, Any]],
        result_file_path: Optional[List[str]]
    ) -> Tuple[List[str], List[str]]:
        """
        使用适配器提取输入和输出文件的挂载路径（评估任务专用）
        
        Args:
            inference_dataset_info: 推理数据集信息字典，格式为 {dataset_id: {"file_path": "...", ...}}
            result_file_path: 评估结果文件路径列表
            
        Returns:
            Tuple[List[str], List[str]]: (输入文件挂载路径列表, 输出文件挂载路径列表)
        """
        # 构建数据集ID到数据集对象的映射
        dataset_map = {d.id: d for d in self.datasets}
        
        # 收集所有输入路径
        input_jfs_paths = []
        for dataset_id, dataset_info in inference_dataset_info.items():
            dataset = dataset_map.get(dataset_id)
            if not dataset or not dataset.file_path:
                continue
            input_jfs_paths.append(dataset.file_path)
        
        # 使用统一的适配器获取输入文件路径（传入列表，返回列表）
        file_list_mount = self.adapter.get_input_file_path(input_jfs_paths)
        
        # 使用统一的适配器获取输出文件路径
        output_files_mount = []
        if result_file_path:
            output_files_mount = self.adapter.get_output_path(result_file_path)
        
        return file_list_mount, output_files_mount

