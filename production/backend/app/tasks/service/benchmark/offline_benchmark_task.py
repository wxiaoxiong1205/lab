"""
离线基准评估任务K8s封装类

与在线任务一致：OpenCompass 的镜像、运行资源配置均为 CPU。
差异仅在于：离线需自行部署模型（GPU 由模型服务使用），可参考 app.tasks.service.evaluation.offline_evaluation_task 的模型部署与多容器编排。
"""
import json
import os
from typing import Dict, Any, Optional

import juicefs
import yaml
from kubernetes import client
from sqlalchemy import select

from app.core.logging import logger
from app.models.benchmark_task_manager import (
    BenchmarkTask,
)
from app.models.model_manager import BaseModel, TrainedModel
from app.schemas.repository_image import CardType, CardModel, ImageType
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.tasks.image_utils import find_image_with_fallback
from app.tasks.service.benchmark.base_benchmark_task import BaseBenchmarkTaskK8s, _extra_body_dict_to_python
from app.utils.storage_enum import StoragePath, PvcName


class OfflineBenchmarkTaskK8s(BaseBenchmarkTaskK8s):
    """离线基准评估任务K8s封装类。OpenCompass 配置与运行与在线一致（CPU）；模型需自行部署（参考 evaluation）。"""

    def __init__(
        self,
        project_id: int,
        namespace: str,
        k8s_uuid: str,
        launcher,
        db,
        task_id: int,
        benchmark_task: BenchmarkTask,
        model_relations: list,
        dataset_relations: list,
        jfs: juicefs.Client,
    ):
        super().__init__(
            project_id=project_id,
            namespace=namespace,
            k8s_uuid=k8s_uuid,
            launcher=launcher,
            db=db,
            task_id=task_id,
            benchmark_task=benchmark_task,
            model_relations=model_relations,
            dataset_relations=dataset_relations,
            jfs=jfs,
        )
        self._vllm_config_mount_path = "/data/benchmark/config/vllm_server.yaml"

    async def _get_offline_model_provider(self) -> Optional[str]:
        """离线任务：根据 model_relations 查询基础模型的 model_provider（仅 model 类型有）。"""
        if not self.model_relations:
            return None
        model_rel = self.model_relations[0]
        if getattr(model_rel, "model_type", None) != "model":
            return None
        base = await self.db.query_one(select(BaseModel).where(BaseModel.id == model_rel.model_id))
        return getattr(base, "model_provider", None) if base else None

    async def _build_and_upload_opencompass_config(self) -> None:
        """生成 OpenCompass 配置文件：与在线一致，使用 OpenAIHTTP；按模型设置 enable_thinking。"""
        config_path = StoragePath.BENCHMARK_CONFIG.format_storage_path(
            namespace=self.namespace,
            task_id=self.task_id,
        )
        remote_dir = os.path.dirname(config_path)
        if remote_dir:
            self.jfs.makedirs(remote_dir, exist_ok=True)

        model_name = self.model_relations[0].model_name if self.model_relations else "api_model"
        model_provider = await self._get_offline_model_provider()
        thinking_extra = self._get_thinking_extra_body(model_name, model_provider)
        extra_body_line = ("        extra_body=" + _extra_body_dict_to_python(thinking_extra) + ",\n") if thinking_extra else ""

        datasets_block = self._dataset_import_block()
        _env = "__import__('os').environ"
        config_content = f'''# Auto-generated OpenCompass config for offline benchmark (task_id={self.task_id})
# 与在线一致：OpenAIHTTP + 环境变量；离线时 OPENAI_API_BASE 指向自部署模型（如 vLLM）服务地址
from mmengine.config import read_base
from opencompass.models import OpenAIHTTP

api_meta_template = dict(
    round=[
        dict(role='HUMAN', api_role='HUMAN'),
        dict(role='BOT', api_role='BOT', generate=True),
    ],
    reserved_roles=[dict(role='SYSTEM', api_role='SYSTEM')],
)

{datasets_block}

model_name = {_env}.get('MODEL_NAME', 'api_model')
models = [
    dict(
        abbr=model_name,
        type=OpenAIHTTP,
        key={_env}.get('OPENAI_API_KEY', ''),
        openai_api_base={_env}.get('OPENAI_API_BASE', ''),
        path=model_name,
        meta_template=api_meta_template,
        batch_size=4,
        query_per_second=2,
        max_seq_len=16384,
        max_out_len=2048,
        retry=3,
        tokenizer_path=__import__("os").path.join(__import__("os").getcwd(), model_name),
{extra_body_line}        rpm_verbose=True,
        run_cfg=dict(num_gpus=0, num_procs=1),
        verbose=True,
    )
]
'''

        with self.jfs.open(config_path, 'w', encoding='utf-8') as f:
            f.write(config_content.strip())
        logger.info(f"基准评估 OpenCompass 配置已写入: {config_path}, extra_body={thinking_extra}")

    async def _resolve_model_path_for_vllm(self) -> str:
        """根据任务模型关系解析模型路径，并映射为容器内可访问路径。"""
        if not self.model_relations:
            raise RuntimeError("离线基准评估缺少模型关联")
        model_id = self.model_relations[0].model_id

        trained = await self.db.query_one(
            select(TrainedModel).where(
                TrainedModel.id == model_id,
                TrainedModel.project_id == self.project_id,
            )
        )
        model_path = None
        if trained and trained.model_path:
            model_path = trained.model_path
        else:
            base = await self.db.query_one(select(BaseModel).where(BaseModel.id == model_id))
            if base and base.model_path:
                model_path = base.model_path

        if not model_path:
            raise RuntimeError(f"离线基准评估无法解析模型路径: model_id={model_id}")

        # /public/models/* -> /data/models/base_models/*
        if model_path.startswith("/public/models/"):
            return StoragePath.BASE_MODELS.mount_path + model_path.replace("/public/models/", "")
        if model_path.startswith("public/models/"):
            return StoragePath.BASE_MODELS.mount_path + model_path.replace("public/models/", "")
        # /{namespace}/training/finetuned_models/* -> /data/models/*（容器内挂载了 INFEERENCE_TRAINED_MODELS）
        prefix = f"/{self.namespace}/training/finetuned_models/"
        if model_path.startswith(prefix):
            rel = model_path[len(prefix) :].strip("/")
            return (StoragePath.INFEERENCE_TRAINED_MODELS.mount_path or "/data/models").rstrip("/") + "/" + rel
        # 兜底返回原路径（若镜像内已有对应挂载）
        return model_path

    async def _build_and_upload_vllm_config(self) -> None:
        """生成并上传 vLLM 启动配置，供模型容器使用。"""
        model_path_mount = await self._resolve_model_path_for_vllm()
        model_name = self.model_relations[0].model_name if self.model_relations else "api_model"

        graphics_card_resource = self.benchmark_task.graphics_card_resource or {}
        tp = int(graphics_card_resource.get("count", 1) or 1)

        def _positive_int_config(key: str, env_key: str, default: int, legacy_env_key: Optional[str] = None) -> int:
            raw = graphics_card_resource.get(key)
            if raw is None:
                raw = os.getenv(env_key)
            if raw is None and legacy_env_key:
                raw = os.getenv(legacy_env_key)
            try:
                value = int(raw)
                return value if value > 0 else default
            except (TypeError, ValueError):
                return default

        def _gpu_memory_utilization_config(default: float) -> float:
            raw = graphics_card_resource.get("gpu_memory_utilization")
            if raw is None:
                raw = os.getenv("VLLM_GPU_MEMORY_UTILIZATION")
            try:
                value = float(raw)
                return value if 0 < value <= 1 else default
            except (TypeError, ValueError):
                return default

        gpu_mem = _gpu_memory_utilization_config(0.9)
        max_model_len = _positive_int_config("max_model_len", "VLLM_MAX_MODEL_LEN", 8192)
        max_num_batched_tokens = _positive_int_config(
            "max_num_batched_tokens",
            "VLLM_MAX_NUM_BATCHED_TOKENS",
            1024,
        )
        max_num_seqs = _positive_int_config(
            "max_num_seqs",
            "VLLM_MAX_NUM_SEQS",
            4,
            legacy_env_key="MAX_TOKENS_SEQS",
        )

        vllm_cfg: Dict[str, Any] = {
            "model_path": model_path_mount,
            "tensor_parallel_size": tp,
            "gpu_memory_utilization": gpu_mem,
            "max_model_len": max_model_len,
            "max_num_batched_tokens": max_num_batched_tokens,
            "max_num_seqs": max_num_seqs,
        }

        config = {
            "vllm": vllm_cfg,
            "openai": {
                "model": model_name,
            },
        }
        cfg_storage_path = (
            StoragePath.BENCHMARK_TASK_ROOT.format_storage_path(
                namespace=self.namespace,
                task_id=self.task_id,
            ).rstrip("/")
            + "/config/vllm_server.yaml"
        )
        remote_dir = os.path.dirname(cfg_storage_path)
        if remote_dir:
            self.jfs.makedirs(remote_dir, exist_ok=True)
        with self.jfs.open(cfg_storage_path, "w", encoding="utf-8") as f:
            f.write(yaml.dump(config, default_flow_style=False, allow_unicode=True, sort_keys=False))
        logger.info(f"离线基准评估 vLLM 配置已写入: {cfg_storage_path}")

    async def build_volume_and_mount(self):
        """在基类挂载基础上，挂载基础模型与训练模型目录并生成 vLLM 配置。"""
        volume_mounts, volumes = await super().build_volume_and_mount()
        await self._build_and_upload_vllm_config()

        # 基础模型（public）与训练模型（finetuned_models）均挂载，vLLM 配置中会按路径前缀映射为容器内路径
        model_storage_items = [
            {"name": "public-pvc", "enum": StoragePath.BASE_MODELS},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.INFEERENCE_TRAINED_MODELS},
        ]
        m_mounts, m_vols = await self.launcher.build_storage_volumes(
            model_storage_items,
            namespace=self.namespace,
            task_id=self.task_id,
        )
        volume_mounts.extend(m_mounts)
        # volumes.extend(m_vols)
        return volume_mounts, volumes

    async def build_env(self) -> Dict[str, str]:
        """构建环境变量：OpenCompass 统一走同 Pod 内本地 vLLM API；含推理参数。"""
        env_vars = await super().build_env()
        api_base = "http://127.0.0.1:8000/v1/chat/completions"
        env_vars["OPENAI_API_BASE"] = api_base
        env_vars["OPENAI_BASE_URL"] = api_base
        env_vars["OPENAI_API_KEY"] = os.getenv("OFFLINE_BENCHMARK_OPENAI_API_KEY", "")
        inference_params = getattr(self.benchmark_task, "inference_params", None)
        if inference_params and isinstance(inference_params, dict):
            env_vars["INFERENCE_PARAMS"] = json.dumps(
                {k.value if hasattr(k, "value") else k: v for k, v in inference_params.items()}
            )
        return env_vars

    async def build_image(self) -> str:
        """OpenCompass 镜像与在线一致（CPU）。"""
        return await self._get_benchmark_image(
            card_category=CardType.CPU.value,
            card_model=None,
        )

    async def build_run_resource(self) -> Dict[str, Any]:
        """与在线一致：OpenCompass 跑在 CPU，不需 GPU；GPU 仅模型部署时使用（参考 evaluation）。"""
        return {
            "cpu_limit": "4",
            "memory_limit": "8Gi",
            "cpu_request": "2",
            "memory_request": "4Gi",
            "gpu_type": None,
            "gpu_count": 0,
        }

    async def build_node_affinity(self):
        """OpenCompass 无需 GPU，不配置节点亲和性。"""
        return None

    async def _build_model_image(self) -> str:
        """离线模型服务容器镜像：使用 INFERENCE_IMAGE，按 GPU 卡型匹配。"""
        graphics_card_resource = self.benchmark_task.graphics_card_resource or {}
        card_type = graphics_card_resource.get("card_type", CardType.GPU.value)
        card_model = graphics_card_resource.get("card_model")
        return await find_image_with_fallback(
            project_id=self.project_id,
            image_type=ImageType.INFERENCE_IMAGE.value,
            card_category=card_type,
            card_model=card_model,
            error_message_prefix="未找到匹配的离线模型服务镜像（INFERENCE_IMAGE）",
        )

    async def _build_model_run_resource(self) -> Dict[str, Any]:
        """离线模型服务容器资源：使用任务中的 GPU 配置。"""
        raw = self.benchmark_task.graphics_card_resource
        if raw:
            cfg = GraphicsCardResourceConfig(**raw)
        else:
            # 与离线评估默认值保持一致
            cfg = GraphicsCardResourceConfig(
                card_type=CardType.GPU,
                card_model=CardModel.A800,
                count=1,
                card_memory="80GB",
                k8s_resource_type=os.getenv("TRAINING_GPU_TYPE", "nvidia.com/gpu"),
            )
        gpu_type = cfg.get_k8s_gpu_type()
        gpu_count = cfg.get_k8s_gpu_count()

        def _cpu(val):
            if not val:
                return None
            return str(int(val)) if val == int(val) else str(val)

        def _mem(val):
            return f"{val}Gi" if val else None

        return {
            "cpu_limit": _cpu(cfg.cpu_limit),
            "memory_limit": _mem(cfg.memory_limit),
            "cpu_request": _cpu(cfg.cpu_request),
            "memory_request": _mem(cfg.memory_request),
            "gpu_type": gpu_type,
            "gpu_count": gpu_count,
        }

    async def submit(self) -> str:
        """离线基准评估：同 Pod 双容器（vLLM + OpenCompass）。"""
        volume_mounts, volumes = await self.build_volume_and_mount()
        env_vars = await self.build_env()
        cmd_and_args_list = await self.build_cmd_and_args()
        if len(cmd_and_args_list) != 1:
            raise ValueError(f"基准评估任务需要1个命令配置，但得到 {len(cmd_and_args_list)} 个")

        # 用 emptyDir 存放信号文件，与 JFS 无关，Pod 内读写必然可靠
        signal_volume_name = "benchmark-signal"
        signal_mount_path = "/tmp/benchmark-signal"
        signal_file = f"{signal_mount_path}/.done"
        model_failed_file = f"{signal_mount_path}/.model_failed"  # model 容器写，opencompass 检测后立即退出
        volumes = list(volumes or []) + [
            client.V1Volume(
                name=signal_volume_name,
                empty_dir=client.V1EmptyDirVolumeSource(),
            )
        ]
        volume_mounts = list(volume_mounts or []) + [
            client.V1VolumeMount(
                name=signal_volume_name,
                mount_path=signal_mount_path,
            )
        ]

        # 若模型配置了 memory_limit，为模型容器挂载 /dev/shm（Memory-backed emptyDir）
        _raw_gcr = self.benchmark_task.graphics_card_resource or {}
        _shm_size = int(_raw_gcr.get("memory_limit") or 0)
        if _shm_size > 0:
            volumes.append(
                client.V1Volume(
                    name="shm",
                    empty_dir=client.V1EmptyDirVolumeSource(
                        medium="Memory",
                        size_limit=f"{_shm_size}Gi",
                    ),
                )
            )
            volume_mounts.append(
                client.V1VolumeMount(
                    name="shm",
                    mount_path="/dev/shm",
                )
            )

        # OpenCompass 容器命令：等待模型服务启动后再执行，并在结束时发出停止模型容器信号
        oc_command, oc_args = cmd_and_args_list[0]
        if len(oc_command) >= 3 and oc_command[0] == "sh" and oc_command[1] == "-c":
            base_cmd = oc_command[2]
        else:
            base_cmd = " ".join(oc_command + (oc_args or []))
            oc_args = []

        readiness_and_run_cmd = f"""rm -f {signal_file} {model_failed_file} && \
python3 - <<'PY'
import time, urllib.request, sys, os
url = "http://127.0.0.1:8000/v1/models"
model_failed_file = "{model_failed_file}"
deadline = time.time() + 300
while time.time() < deadline:
    if os.path.exists(model_failed_file):
        print("检测到模型启动失败信号，立即退出。", file=sys.stderr)
        sys.exit(1)
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            if 200 <= resp.status < 500:
                print("vLLM 就绪，开始执行 OpenCompass ...")
                sys.exit(0)
    except Exception:
        pass
    time.sleep(5)
print("vLLM 在 300 秒内未就绪，退出。", file=sys.stderr)
sys.exit(1)
PY
status=$?
if [ $status -ne 0 ]; then
  touch {signal_file}
  exit $status
fi
{base_cmd}
status=$?
touch {signal_file}
exit $status
"""
        oc_command = ["sh", "-c", readiness_and_run_cmd]
        oc_args = []

        benchmark_image = await self.build_image()
        benchmark_res = await self.build_run_resource()
        model_image = await self._build_model_image()
        model_res = await self._build_model_run_resource()
        working_dir = await self.build_working_dir()
        security_context = await self.build_security_context()
        service_type = await self.build_service_type()
        job_name = await self.build_job_name()
        affinity = await self.build_node_affinity()

        # 模型容器：后台启动 vLLM，检测到 OpenCompass 结束信号后主动退出，避免 Job 卡住
        # 若 vLLM 异常退出，写 model_failed_file 让 opencompass 立即感知并退出，不等 300 秒超时
        model_command = ["sh", "-c"]
        model_args = [f"""rm -f {signal_file} {model_failed_file}; \
python3 -m scripts.inference.start_vllm_server --config-file {self._vllm_config_mount_path} & \
VLLM_PID=$!; \
while true; do \
  if [ -f {signal_file} ]; then \
    echo "检测到 benchmark 完成信号，停止 vLLM ..."; \
    kill $VLLM_PID 2>/dev/null || true; \
    wait $VLLM_PID 2>/dev/null || true; \
    exit 0; \
  fi; \
  if ! kill -0 $VLLM_PID 2>/dev/null; then \
    echo "vLLM 进程异常退出，通知 opencompass 退出"; \
    touch {model_failed_file}; \
    exit 1; \
  fi; \
  sleep 5; \
done"""]

        containers_config = [
            {
                "name": f"{job_name}-model",
                "image": model_image,
                "command": model_command,
                "args": model_args,
                "env_vars": env_vars,
                "cpu_limit": model_res["cpu_limit"],
                "memory_limit": model_res["memory_limit"],
                "cpu_request": model_res["cpu_request"],
                "memory_request": model_res["memory_request"],
                "gpu_type": model_res["gpu_type"],
                "gpu_count": model_res["gpu_count"],
                "working_dir": working_dir,
            },
            {
                "name": f"{job_name}-opencompass",
                "image": benchmark_image,
                "command": oc_command,
                "args": oc_args,
                "env_vars": env_vars,
                "cpu_limit": benchmark_res["cpu_limit"],
                "memory_limit": benchmark_res["memory_limit"],
                "cpu_request": benchmark_res["cpu_request"],
                "memory_request": benchmark_res["memory_request"],
                "gpu_type": benchmark_res["gpu_type"],
                "gpu_count": benchmark_res["gpu_count"],
                "working_dir": working_dir,
            },
        ]

        logger.info(f"创建离线基准评估多容器Job: {job_name}（model + opencompass）")
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
            ttl_seconds_after_finished=600,
        )
        return job_name
