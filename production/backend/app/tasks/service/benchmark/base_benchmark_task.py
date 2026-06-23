"""
基准评估任务 K8s 基类：在线/离线共用逻辑（卷挂载、数据集配置生成、环境变量、命令、submit 流程等）。
在线/离线使用同一套 OpenCompass 镜像获取逻辑（find_image_with_fallback），仅 card_category/card_model 不同。
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Tuple, Any

import juicefs
from kubernetes.client import (
    V1VolumeMount,
    V1Volume,
    V1Affinity,
    V1PersistentVolumeClaimVolumeSource,
)

from app.tasks.service.base.base_k8s_task import BaseK8sTask
from app.models.benchmark_task_manager import (
    BenchmarkTask,
    BenchmarkTaskModelRelation,
    BenchmarkTaskDatasetRelation,
)
from app.utils.storage_enum import StoragePath, PvcName
from app.schemas.repository_image import ImageType
from app.tasks.image_utils import find_image_with_fallback
from app.core.logging import logger


# 推理/thinking 类模型名子串（用于判断是否开启推理；其余模型传「关闭」避免默认开启导致报错）
THINKING_MODEL_NAME_SUBSTRINGS = ("r1", "deepseek-v3", "deepseek-r1", "reasoning", "thinking", "k2-thinking")
# 仅以下提供商不传 extra_body（传了会 400 或无此参数）：openai / kimi
# 其余提供商一律传 extra_body：推理模型传「开启」，非推理模型传「关闭」（以官方文档为准，避免默认开启报错）
PROVIDERS_NO_EXTRA_BODY = frozenset({"openai", "kimi"})
# 各提供商官方格式（开启/关闭）：
# - deepseek: thinking.type "enabled"|"disabled" https://api-docs.deepseek.com/guides/thinking_mode
# - zhipu: thinking.type "enabled"|"disabled" https://docs.z.ai/thinking-mode（GLM-5/4.7 默认开启）
# - qwen: enable_thinking true|false
# - minimax: reasoning_split true|false
# - gemini: reasoning_effort "high"|"none" https://ai.google.dev/gemini-api/docs/thinking
def _extra_body_dict_to_python(d: dict) -> str:
    """将 extra_body 转为 Python 源码中的 dict(...) 字符串。"""
    parts = []
    for k, v in d.items():
        if isinstance(v, dict):
            inner = ", ".join(f"{k2}={repr(v2)}" for k2, v2 in v.items())
            parts.append(f"{k}=dict({inner})")
        else:
            parts.append(f"{k}={repr(v)}")
    return "dict(" + ", ".join(parts) + ")"


class BaseBenchmarkTaskK8s(BaseK8sTask, ABC):
    """基准评估任务 K8s 基类，在线/离线共用。"""

    def __init__(
        self,
        project_id: int,
        namespace: str,
        k8s_uuid: str,
        launcher,
        db,
        task_id: int,
        benchmark_task: BenchmarkTask,
        model_relations: List[BenchmarkTaskModelRelation],
        dataset_relations: List[BenchmarkTaskDatasetRelation],
        jfs: juicefs.Client,
    ):
        super().__init__(project_id, namespace, k8s_uuid, launcher, db)
        self.task_id = task_id
        self.benchmark_task = benchmark_task
        self.model_relations = model_relations
        self.dataset_relations = dataset_relations
        self.jfs = jfs

    def _get_jfs_client(self) -> Optional[juicefs.Client]:
        """获取 JuiceFS 客户端"""
        return self.jfs

    def _get_task_id(self) -> Optional[int]:
        """获取任务ID"""
        return self.task_id
    
    def _dataset_import_block(self) -> str:
        """生成 read_base() 内的数据集导入，并使用 datasets += 的方式组合，避免 LazyObject 展开问题。"""
        imports = []
        dataset_vars = []

        for r in self.dataset_relations:
            base = getattr(r, "invoke_name", None) or (r.dataset_code + "_gen")
            mod = f".datasets.{r.dataset_code}.{base}"

            normalized_var = f"{r.dataset_code}_datasets"
            actual_var = getattr(r, "export_var", None) or normalized_var

            # import 行
            if actual_var != normalized_var:
                imports.append(f"    from {mod} import {actual_var} as {normalized_var}")
            else:
                imports.append(f"    from {mod} import {normalized_var}")

            dataset_vars.append(normalized_var)

        if not imports:
            return "datasets = []"

        # 构建 read_base import block
        import_block = "with read_base():\n" + "\n".join(imports)

        # datasets 初始化
        datasets_init = "datasets = []"

        # 使用 += 合并，兼容 LazyObject/list/dict
        append_lines = []
        for var in dataset_vars:
            append_lines.append(
                f"datasets += ({var} if isinstance({var}, list) else [{var}])"
            )

        datasets_append = "\n".join(append_lines)

        return f"{datasets_init}\n\n{import_block}\n\n{datasets_append}"

    def _get_thinking_extra_body(self, model_name: str, model_provider: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """按官方文档返回 extra_body：OpenAI/Kimi 不传（None）；已知提供商一律传开启/关闭，未知提供商仅推理时传。"""
        provider = (model_provider or "").strip().lower()
        if provider in PROVIDERS_NO_EXTRA_BODY:
            return None
        is_reasoning = bool(
            model_name
            and any(sub in (model_name or "").lower() for sub in THINKING_MODEL_NAME_SUBSTRINGS)
        )
        if provider == "deepseek":
            return {"thinking": {"type": "enabled" if is_reasoning else "disabled"}}
        if provider == "zhipu":
            return {"thinking": {"type": "enabled" if is_reasoning else "disabled"}}
        if provider == "qwen":
            return {"enable_thinking": is_reasoning}
        if provider == "minimax":
            return {"reasoning_split": is_reasoning}
        if provider == "gemini":
            return {"reasoning_effort": "high" if is_reasoning else "none"}
        if is_reasoning:
            return {"thinking": {"type": "enabled"}}
        # 兼容旧数据没有提供商类型，默认关闭推理
        return {"enable_thinking": False}

    @abstractmethod
    async def _build_and_upload_opencompass_config(self) -> None:
        """生成并上传 OpenCompass 配置到 JFS，由在线/离线子类实现不同内容。"""
        pass

    async def build_volume_and_mount(self) -> Tuple[List[V1VolumeMount], List[V1Volume]]:
        """构建存储卷和挂载配置：先生成并上传配置，再挂载任务根目录与数据集目录。"""
        await self._build_and_upload_opencompass_config()

        volume_mounts = []
        volumes = []

        sub_path = StoragePath.BENCHMARK_TASK_ROOT.get_sub_path(
            namespace=self.namespace,
            task_id=self.task_id,
        )
        pvc_name = PvcName.LLM_TRAINING_PVC.value
        volume_mounts.append(V1VolumeMount(
            name=pvc_name,
            mount_path="/data/benchmark",
            sub_path=sub_path,
        ))
        volumes.append(V1Volume(
            name=pvc_name,
            persistent_volume_claim=V1PersistentVolumeClaimVolumeSource(claim_name=pvc_name),
        ))
        # 使用完整 JFS 子路径 public/benchmark/datasets，确保挂载到正确目录
        datasets_sub_path = (
            StoragePath.BENCHMARK_DATASETS.format_storage_path().split("/", 2)[-1]
        )
        PUBLIC_PVC = PvcName.PUBLIC_PVC.value
        volume_mounts.append(V1VolumeMount(
            name=PUBLIC_PVC,
            mount_path=StoragePath.BENCHMARK_DATASETS.mount_path,
            sub_path=datasets_sub_path,
        ))
        volumes.append(V1Volume(
            name=PUBLIC_PVC,
            persistent_volume_claim=V1PersistentVolumeClaimVolumeSource(claim_name=PUBLIC_PVC),
        ))
        return volume_mounts, volumes

    async def build_env(self) -> Dict[str, str]:
        """构建环境变量：任务信息、模型 ID/名称、数据集 code 列表。子类可扩展（如在线加 API key）。"""
        # OpenCompass 内置配置用相对路径 data/gsm8k，拼在 COMPASS_DATA_CACHE 上得到 COMPASS_DATA_CACHE/data/gsm8k。
        # JFS 上 public/benchmark/datasets/data/gsm8k/ 等已存在数据，挂载到 /app/data，故 COMPASS_DATA_CACHE=/app 时
        # data/gsm8k -> /app/data/gsm8k 直接命中挂载数据，应无需下载；若仍触发下载且解压报 FileExistsError，多为路径 /app/./data/gsm8k 存在性检查或目录结构不符。
        env_vars = {
            "TASK_ID": str(self.task_id),
            "NAMESPACE": self.namespace,
            "COMPASS_DATA_CACHE": "/app",
        }
        if self.model_relations:
            model_relation = self.model_relations[0]
            env_vars["MODEL_ID"] = str(model_relation.model_id)
            env_vars["MODEL_NAME"] = model_relation.model_name
        if self.dataset_relations:
            env_vars["DATASET_CODES"] = ",".join(r.dataset_code for r in self.dataset_relations)
        return env_vars

    async def build_cmd_and_args(self) -> List[Tuple[List[str], List[str]]]:
        """构建 OpenCompass 运行命令：复制配置并执行。数据路径由 COMPASS_DATA_CACHE=/app 解析为 /app/data/{code}（挂载点）。"""
        # 使用简单命令避免引号/循环在 K8s args 中传参时被截断导致启动即失败。若遇 FileExistsError 请保证挂载下对应数据集目录非空或不存在。
        cmd_str = (
            "mkdir -p /app/opencompass/configs && "
            "cp /data/benchmark/config/opencompass_config.py /app/opencompass/configs/benchmark_eval.py && "
            "opencompass /app/opencompass/configs/benchmark_eval.py --work-dir /data/benchmark/results"
        )
        return [(["sh", "-c", cmd_str], [])]

    async def build_job_name(self) -> str:
        """构建 Job 名称。"""
        return self.k8s_uuid or f"benchmark-task-{self.task_id}"

    async def build_service_type(self) -> str:
        """构建服务类型"""
        return "benchmark"

    async def _get_benchmark_image(
        self,
        card_category: Optional[str] = None,
        card_model: Optional[str] = None,
    ) -> str:
        """统一从项目仓库按 BENCHMARK_IMAGE 类型查找 OpenCompass 镜像（在线/离线共用）。"""
        return await find_image_with_fallback(
            project_id=self.project_id,
            image_type=ImageType.BENCHMARK_IMAGE.value,
            card_category=card_category,
            card_model=card_model,
            error_message_prefix="未找到匹配的基准评估（OpenCompass）镜像",
        )

    @abstractmethod
    async def build_image(self) -> str:
        """构建镜像地址，由在线/离线子类实现（均通过 _get_benchmark_image 获取，仅参数不同）。"""
        pass

    @abstractmethod
    async def build_run_resource(self) -> Dict[str, Any]:
        """构建运行资源需求，由在线/离线子类实现。"""
        pass

    async def build_node_affinity(self) -> Optional[V1Affinity]:
        """节点亲和性，子类可覆盖。"""
        return None

    def _submit_extra_log(self, resources: Dict[str, Any]) -> None:
        """submit 时额外日志，子类可覆盖（如离线打印 GPU 配置）。"""
        pass

    async def submit(self) -> str:
        """提交任务到 K8s。"""
        volume_mounts, volumes = await self.build_volume_and_mount()
        env_vars = await self.build_env()
        cmd_and_args_list = await self.build_cmd_and_args()
        image = await self.build_image()
        resources = await self.build_run_resource()
        working_dir = await self.build_working_dir()
        security_context = await self.build_security_context()
        service_type = await self.build_service_type()
        job_name = await self.build_job_name()
        affinity = await self.build_node_affinity()

        logger.info(f"基准评估任务配置 - task_id: {self.task_id}")
        logger.info(f"使用镜像: {image}")
        self._submit_extra_log(resources)

        if len(cmd_and_args_list) != 1:
            raise ValueError(f"基准评估任务需要1个命令配置，但得到 {len(cmd_and_args_list)} 个")

        command, args = cmd_and_args_list[0]
        logger.info(f"创建Job: {job_name}")

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
            ttl_seconds_after_finished=600, 
        )
        return job_name
