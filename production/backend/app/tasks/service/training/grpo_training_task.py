"""GRPO 训练任务 KubeRay RayJob 封装。"""
import json
import os
import random
import re
import shlex
import tempfile
from typing import Any, Dict, List, Optional, Tuple

import juicefs
import pyarrow as pa
import pyarrow.parquet as pq
import yaml
from kubernetes import client
from kubernetes.client import V1Affinity, V1Volume, V1VolumeMount
from sqlalchemy import select

from app.common import k8s_labels
from app.core.config import settings
from app.core.logging import logger
from app.models.models import ChunkUploadSession
from app.models.training_task_manager import TrainingTask
from app.schemas.repository_image import ImageType
from app.schemas.training_task import RayResourceConfig
from app.tasks.image_utils import find_image_with_fallback
from app.tasks.service.base.base_k8s_task import BaseK8sTask
from app.utils.jfs_utils import JFSUtils
from app.utils.storage_enum import PvcName, StoragePath


class GrpoTrainingTaskK8s(BaseK8sTask):
    """GRPO 训练任务，使用 verl + KubeRay RayJob。"""

    HYDRA_RAW_STRING_PATTERN = re.compile(r"^[A-Za-z0-9_./:${},+-]+$")

    FORCE_OVERRIDE_KEYS = {
        "algorithm.adv_estimator",
        "actor_rollout_ref.model.path",
        "data.train_files",
        "data.val_files",
        "reward.custom_reward_function.path",
        "trainer.default_local_dir",
        "trainer.experiment_name",
        "trainer.logger",
        "trainer.nnodes",
        "trainer.n_gpus_per_node",
        "trainer.project_name",
        "trainer.resume_mode",
        "trainer.save_freq",
    }

    def __init__(
        self,
        project_id: int,
        namespace: str,
        k8s_uuid: str,
        launcher,
        db,
        task_id: int,
        training_task: TrainingTask,
        task_data: Dict[str, Any],
        jfs: juicefs.Client,
        project_name: str,
        tenant_id: Optional[str] = None,
    ):
        super().__init__(project_id, namespace, k8s_uuid, launcher, db)
        self.task_id = task_id
        self.training_task = training_task
        self.task_data = task_data
        self.jfs = jfs
        self.project_name = project_name
        self.tenant_id = tenant_id or getattr(training_task, "tenant_id", None)
        self._train_parquet_path: Optional[str] = None
        self._eval_parquet_path: Optional[str] = None
        self._reward_function_path: Optional[str] = None
        self._hydra_overrides: Optional[Dict[str, Any]] = None
        self._train_record_count: int = 0

    def _get_jfs_client(self) -> Optional[juicefs.Client]:
        return self.jfs

    def _get_task_id(self) -> Optional[int]:
        return self.task_id

    async def build_volume_and_mount(self) -> Tuple[List[V1VolumeMount], List[V1Volume]]:
        training_records = self._load_grpo_records(
            dataset_items=self.task_data.get("dataset_items") or [],
            dataset_label="训练",
        )
        eval_dataset_items = self.task_data.get("eval_dataset_items") or []
        eval_config = self.task_data.get("evaluation") or {}
        eval_use_split = bool(eval_config.get("eval_use_split")) and not eval_dataset_items

        if eval_use_split:
            training_records, eval_records = self._split_records_for_eval(
                records=training_records,
                eval_split_ratio=eval_config.get("eval_split_ratio", 0.1),
            )
            if eval_records:
                self._eval_parquet_path = self._write_records_to_parquet(
                    records=eval_records,
                    output_filename="test.parquet",
                    dataset_label="验证",
                )
            else:
                logger.warning("GRPO训练数据不足2条，跳过按比例切分验证集: task_id=%s", self.task_id)

        self._train_parquet_path = self._write_records_to_parquet(
            records=training_records,
            output_filename="train.parquet",
            dataset_label="训练",
        )
        self._train_record_count = len(training_records)

        if eval_dataset_items:
            self._eval_parquet_path = self._convert_jsonl_items_to_parquet(
                dataset_items=eval_dataset_items,
                output_filename="test.parquet",
                dataset_label="验证",
            )

        self._reward_function_path = await self._prepare_reward_function()
        self._hydra_overrides = self.build_hydra_overrides()
        self._write_config_summary()

        storage_items = [
            {"name": PvcName.PUBLIC_PVC.value, "enum": StoragePath.BASE_MODELS},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.REAL_TRAINING_DATASETS},
            {"name": PvcName.LLM_TRAINING_PVC.value, "enum": StoragePath.UNREGISTERED_TRAINED_MODELS},
            {
                "name": PvcName.LLM_TRAINING_PVC.value,
                "custom_sub_path": self._build_task_config_sub_path(),
                "custom_mount_path": "/data/configs",
            },
        ]
        return await self.launcher.build_storage_volumes(
            storage_items,
            namespace=self.namespace,
            task_id=self.task_id,
        )

    async def build_env(self) -> Dict[str, str]:
        env_vars = {
            "TASK_ID": str(self.task_id),
            "TRAINING_METHOD_TYPE": "grpo",
            "PROJECT_ID": str(self.project_id),
            "MLFLOW_TRACKING_URI": settings.MLFLOW_TRACKING_URI,
            "MLFLOW_EXPERIMENT_NAME": self._build_mlflow_experiment_name(),
            "MLFLOW_RUN_NAME": self._build_mlflow_run_name(),
        }
        env_vars.update(self._extract_ray_runtime_env_vars(self.task_data.get("additional_params") or {}))
        return env_vars

    def _extract_ray_runtime_env_vars(self, params: Dict[str, Any]) -> Dict[str, str]:
        env_prefix = "ray_kwargs.ray_init.runtime_env.env_vars."
        env_vars: Dict[str, str] = {}
        for key, value in params.items():
            normalized_key = str(key).lstrip("+")
            if not normalized_key.startswith(env_prefix):
                continue
            env_name = normalized_key[len(env_prefix):]
            if not env_name:
                continue
            env_vars[env_name] = "" if value is None else str(value)
        return env_vars

    async def build_cmd_and_args(self) -> List[Tuple[List[str], List[str]]]:
        return []

    @staticmethod
    def _resource_value(value: Any) -> Any:
        return getattr(value, "value", value)

    async def build_image(self) -> str:
        fallback_image = os.getenv("VERL_RAY_IMAGE", "lab-cn-guangzhou.cr.volces.com/fs/verl:v0.8.0-vllm")
        ray_resource = self._get_ray_resource_config()
        worker = ray_resource.worker_graphics_card_resource
        card_category = self._resource_value(worker.card_type)
        card_model = self._resource_value(worker.card_model)
        try:
            return await find_image_with_fallback(
                project_id=self.project_id,
                image_type=ImageType.TEXT_GENERATION_GRPO.value,
                card_category=card_category,
                card_model=card_model,
                error_message_prefix="未找到匹配的GRPO训练镜像",
            )
        except RuntimeError as exc:
            logger.warning("使用默认GRPO训练镜像: %s, reason=%s", fallback_image, exc)
            return fallback_image

    async def build_run_resource(self) -> Dict[str, Any]:
        ray_resource = self._get_ray_resource_config()
        worker = ray_resource.worker_graphics_card_resource
        return {
            "worker_replicas": ray_resource.worker_replicas,
            "worker_gpu_type": worker.k8s_resource_type,
            "worker_gpu_count": str(worker.count),
        }

    async def build_node_affinity(self) -> Optional[V1Affinity]:
        return None

    async def build_working_dir(self) -> str:
        return os.getenv("VERL_WORKING_DIR", "/workspace/verl")

    async def build_service_type(self) -> str:
        return "training"

    async def build_job_name(self) -> str:
        return f"training-grpo-{self.task_id}"

    async def submit(self) -> str:
        volume_mounts, volumes = await self.build_volume_and_mount()
        image = await self.build_image()
        env_vars = await self.build_env()
        working_dir = await self.build_working_dir()
        job_name = await self.build_job_name()
        ray_job_body = self.build_ray_job_body(
            job_name=job_name,
            image=image,
            working_dir=working_dir,
            env_vars=env_vars,
            volume_mounts=volume_mounts,
            volumes=volumes,
        )

        logger.info(
            "提交GRPO RayJob: task_id=%s, job_name=%s, overrides=%s",
            self.task_id,
            job_name,
            self._hydra_overrides,
        )
        await self.launcher.create_ray_job(
            namespace=self.namespace,
            ray_job_name=job_name,
            body=ray_job_body,
        )
        return job_name

    def build_hydra_overrides(self) -> Dict[str, Any]:
        if not self._train_parquet_path:
            raise RuntimeError("训练 Parquet 文件尚未生成")

        additional_params = dict(self.task_data.get("additional_params") or {})
        ray_resource = self._get_ray_resource_config()

        overrides = additional_params
        overrides.update({
            "algorithm.adv_estimator": "grpo",
            "actor_rollout_ref.model.path": self._build_model_mount_path(),
            "data.train_files": self._to_dataset_mount_path(self._train_parquet_path),
            "trainer.default_local_dir": StoragePath.UNREGISTERED_TRAINED_MODELS.mount_path.rstrip("/"),
            "trainer.nnodes": ray_resource.worker_replicas,
            "trainer.n_gpus_per_node": ray_resource.worker_graphics_card_resource.count,
            "trainer.project_name": self._build_mlflow_experiment_name(),
            "trainer.experiment_name": self._build_mlflow_run_name(),
            "trainer.logger": os.getenv("VERL_TRAINER_LOGGER", "[console,mlflow]"),
            "trainer.save_freq": 1,
            "trainer.resume_mode": "disable",
        })
        if self._eval_parquet_path:
            overrides["data.val_files"] = self._to_dataset_mount_path(self._eval_parquet_path)
        else:
            overrides["data.val_files"] = overrides["data.train_files"]
            overrides["trainer.val_before_train"] = False
            overrides["trainer.test_freq"] = -1
        if self._reward_function_path:
            overrides["reward.custom_reward_function.path"] = self._to_config_mount_path(self._reward_function_path)
            overrides.setdefault("reward.custom_reward_function.name", "compute_score")

        self._normalize_train_batch_overrides(overrides)
        return overrides

    def _normalize_train_batch_overrides(self, overrides: Dict[str, Any]) -> None:
        """避免 verl 在 drop_last=True 且样本数小于 batch size 时创建空 dataloader。"""
        if self._train_record_count <= 0:
            return

        ray_resource = self._get_ray_resource_config()
        n_gpus = ray_resource.worker_replicas * ray_resource.worker_graphics_card_resource.count
        rollout_n = self._get_int_override(overrides, "actor_rollout_ref.rollout.n", 1) or 1
        configured_train_batch_size = self._get_int_override(overrides, "data.train_batch_size", 128) or 128
        safe_train_batch_size = min(configured_train_batch_size, self._train_record_count)
        valid_train_batch_size = self._largest_valid_train_batch_size(
            max_batch_size=safe_train_batch_size,
            rollout_n=rollout_n,
            n_gpus=n_gpus,
        )
        if valid_train_batch_size is None:
            raise ValueError(
                "GRPO训练样本数不足，无法生成有效的data.train_batch_size: "
                f"样本数={self._train_record_count}, rollout.n={rollout_n}, GPU数={n_gpus}"
            )
        safe_train_batch_size = valid_train_batch_size

        if safe_train_batch_size != configured_train_batch_size:
            logger.warning(
                "GRPO训练样本数小于data.train_batch_size，自动调整batch参数: task_id=%s, "
                "record_count=%s, train_batch_size=%s -> %s",
                self.task_id,
                self._train_record_count,
                configured_train_batch_size,
                safe_train_batch_size,
            )
        overrides["data.train_batch_size"] = safe_train_batch_size

        if "data.gen_batch_size" in overrides:
            configured_gen_batch_size = self._get_int_override(overrides, "data.gen_batch_size", safe_train_batch_size)
            if configured_gen_batch_size and configured_gen_batch_size > self._train_record_count:
                overrides["data.gen_batch_size"] = safe_train_batch_size

        configured_mini_batch_size = self._get_int_override(
            overrides,
            "actor_rollout_ref.actor.ppo_mini_batch_size",
            min(64, safe_train_batch_size),
        ) or safe_train_batch_size
        if configured_mini_batch_size > safe_train_batch_size:
            overrides["actor_rollout_ref.actor.ppo_mini_batch_size"] = safe_train_batch_size
        elif "actor_rollout_ref.actor.ppo_mini_batch_size" not in overrides:
            overrides["actor_rollout_ref.actor.ppo_mini_batch_size"] = configured_mini_batch_size

        mini_batch_size = self._get_int_override(
            overrides,
            "actor_rollout_ref.actor.ppo_mini_batch_size",
            safe_train_batch_size,
        ) or safe_train_batch_size
        micro_key = "actor_rollout_ref.actor.ppo_micro_batch_size_per_gpu"
        configured_micro_batch_size = self._get_int_override(overrides, micro_key, 1) or 1
        if configured_micro_batch_size > mini_batch_size:
            overrides[micro_key] = mini_batch_size
        elif micro_key not in overrides:
            overrides[micro_key] = configured_micro_batch_size

    @staticmethod
    def _get_int_override(overrides: Dict[str, Any], key: str, default: int) -> Optional[int]:
        value = overrides.get(key, default)
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _largest_valid_train_batch_size(*, max_batch_size: int, rollout_n: int, n_gpus: int) -> Optional[int]:
        max_batch_size = max(int(max_batch_size), 1)
        rollout_n = max(int(rollout_n), 1)
        n_gpus = max(int(n_gpus), 1)
        for batch_size in range(max_batch_size, 0, -1):
            if (batch_size * rollout_n) % n_gpus == 0:
                return batch_size
        return None

    def build_ray_job_body(
        self,
        *,
        job_name: str,
        image: str,
        working_dir: str,
        env_vars: Dict[str, str],
        volume_mounts: List[V1VolumeMount],
        volumes: List[V1Volume],
    ) -> Dict[str, Any]:
        ray_resource = self._get_ray_resource_config()
        submit = ray_resource.submit_graphics_card_resource
        head = ray_resource.head_graphics_card_resource
        worker = ray_resource.worker_graphics_card_resource
        labels = k8s_labels.get_service_labels(self.k8s_uuid, "training")
        labels.update({
            "app": job_name,
            "service": "training",
        })

        queue_name = os.getenv("KUEUE_QUEUE_NAME", "user-queue")
        if queue_name:
            labels["kueue.x-k8s.io/queue-name"] = queue_name

        serialized_mounts = [client.ApiClient().sanitize_for_serialization(item) for item in volume_mounts]
        serialized_volumes = [client.ApiClient().sanitize_for_serialization(item) for item in volumes]
        entrypoint = self._build_entrypoint(working_dir)

        submit_resources = self._build_resource_requirements(submit, include_gpu=False)
        head_resources = self._build_resource_requirements(head, include_gpu=False)
        worker_resources = self._build_resource_requirements(worker, include_gpu=True)
        image_pull_secrets = [{"name": "dp-pull-secret"}]
        serialized_env = self._serialize_env_vars(env_vars)

        return {
            "apiVersion": "ray.io/v1",
            "kind": "RayJob",
            "metadata": {
                "name": job_name,
                "namespace": self.namespace,
                "labels": labels,
            },
            "spec": {
                "shutdownAfterJobFinishes": True,
                "ttlSecondsAfterFinished": int(os.getenv("RAY_JOB_TTL_SECONDS_AFTER_FINISHED", "300")),
                "entrypoint": entrypoint,
                "submitterPodTemplate": {
                    "metadata": {"labels": labels},
                    "spec": {
                        "imagePullSecrets": image_pull_secrets,
                        "restartPolicy": "Never",
                        "containers": [{
                            "name": "ray-job-submitter",
                            "image": image,
                            "env": serialized_env,
                            "resources": submit_resources,
                        }],
                    },
                },
                "rayClusterSpec": {
                    "rayVersion": os.getenv("RAY_VERSION", "2.41.0"),
                    "headGroupSpec": {
                        "rayStartParams": {
                            "dashboard-host": "0.0.0.0",
                            "num-gpus": str(head.count),
                        },
                        "template": {
                            "metadata": {"labels": labels},
                            "spec": {
                                "imagePullSecrets": image_pull_secrets,
                                "containers": [{
                                    "name": "ray-head",
                                    "image": image,
                                    "env": serialized_env,
                                    "volumeMounts": serialized_mounts,
                                    "resources": head_resources,
                                }],
                                "volumes": serialized_volumes,
                            },
                        },
                    },
                    "workerGroupSpecs": [{
                        "groupName": "gpu-workers",
                        "replicas": ray_resource.worker_replicas,
                        "minReplicas": ray_resource.worker_replicas,
                        "maxReplicas": ray_resource.worker_replicas,
                        "rayStartParams": {},
                        "template": {
                            "metadata": {"labels": labels},
                            "spec": {
                                "imagePullSecrets": image_pull_secrets,
                                "containers": [{
                                    "name": "ray-worker",
                                    "image": image,
                                    "env": serialized_env,
                                    "volumeMounts": serialized_mounts,
                                    "resources": worker_resources,
                                }],
                                "volumes": serialized_volumes,
                            },
                        },
                    }],
                },
            },
        }

    def _convert_jsonl_items_to_parquet(
        self,
        *,
        dataset_items: List[Dict[str, Any]],
        output_filename: str,
        dataset_label: str,
    ) -> str:
        records = self._load_grpo_records(dataset_items=dataset_items, dataset_label=dataset_label)
        return self._write_records_to_parquet(
            records=records,
            output_filename=output_filename,
            dataset_label=dataset_label,
        )

    def _load_grpo_records(
        self,
        *,
        dataset_items: List[Dict[str, Any]],
        dataset_label: str,
    ) -> List[Dict[str, Any]]:
        if not dataset_items:
            raise ValueError(f"{dataset_label}数据集不能为空")

        records: List[Dict[str, Any]] = []
        for item in dataset_items:
            dataset_path = item.get("dataset_path")
            if not dataset_path:
                raise ValueError(f"{dataset_label}数据集缺少 dataset_path: {item.get('name')}")
            if not self.jfs.exists(dataset_path):
                raise FileNotFoundError(f"{dataset_label}数据集文件不存在: {dataset_path}")

            dataset_records: List[Dict[str, Any]] = []
            with self.jfs.open(dataset_path, "r", encoding="utf-8") as f:
                for line_no, line in enumerate(f, start=1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        record = json.loads(line)
                    except json.JSONDecodeError as e:
                        raise ValueError(f"{dataset_label}数据集JSONL解析失败: {dataset_path}:{line_no}, {e}") from e
                    self._validate_grpo_record(record, dataset_path, line_no)
                    dataset_records.append(record)

            sampled_records = self._apply_sampling_rate(
                records=dataset_records,
                sampling_rate=item.get("sampling_rate", 1.0),
            )
            logger.info(
                "GRPO%s数据集采样完成: name=%s, path=%s, 原始样本数=%s, sampling_rate=%s, 采样后样本数=%s",
                dataset_label,
                item.get("name"),
                dataset_path,
                len(dataset_records),
                item.get("sampling_rate", 1.0),
                len(sampled_records),
            )
            records.extend(sampled_records)

        if not records:
            raise ValueError(f"{dataset_label}数据集没有有效样本")
        return records

    @staticmethod
    def _apply_sampling_rate(
        *,
        records: List[Dict[str, Any]],
        sampling_rate: Any,
    ) -> List[Dict[str, Any]]:
        if not records:
            return records

        try:
            rate = float(sampling_rate)
        except (TypeError, ValueError):
            rate = 1.0

        if rate == 1.0:
            return records

        target_count = int(len(records) * rate)
        if target_count <= 0:
            return []
        if target_count > len(records):
            sampled_records: List[Dict[str, Any]] = []
            while len(sampled_records) < target_count:
                sampled_records.extend(
                    random.sample(records, min(len(records), target_count - len(sampled_records)))
                )
            return sampled_records[:target_count]
        return random.sample(records, target_count)

    def _write_records_to_parquet(
        self,
        *,
        records: List[Dict[str, Any]],
        output_filename: str,
        dataset_label: str,
    ) -> str:
        if not records:
            raise ValueError(f"{dataset_label}数据集没有有效样本")

        output_dir = StoragePath.REAL_TRAINING_DATASETS.format_storage_path(
            namespace=self.namespace,
            task_id=self.task_id,
        )
        self.jfs.makedirs(output_dir, exist_ok=True)
        output_path = f"{output_dir.rstrip('/')}/{output_filename}"
        table = pa.Table.from_pylist(records)

        tmp_path = ""
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".parquet") as tmp_file:
                tmp_path = tmp_file.name
            pq.write_table(table, tmp_path)
            JFSUtils.upload_local_file(self.jfs, tmp_path, output_path)
        finally:
            if tmp_path:
                try:
                    os.remove(tmp_path)
                except FileNotFoundError:
                    pass
        logger.info("%s数据集已转换为Parquet: %s, 样本数=%s", dataset_label, output_path, len(records))
        return output_path

    @staticmethod
    def _split_records_for_eval(
        *,
        records: List[Dict[str, Any]],
        eval_split_ratio: Any,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        if len(records) < 2:
            return records, []

        try:
            ratio = float(eval_split_ratio)
        except (TypeError, ValueError):
            ratio = 0.1
        ratio = min(max(ratio, 0.0), 1.0)
        raw_eval_count = len(records) * ratio
        eval_count = int(raw_eval_count) if raw_eval_count % 1 < 0.5 else int(raw_eval_count) + 1
        eval_count = min(max(eval_count, 1), len(records) - 1)
        split_index = len(records) - eval_count
        return records[:split_index], records[split_index:]

    def _validate_grpo_record(self, record: Any, dataset_path: str, line_no: int) -> None:
        if not isinstance(record, dict):
            raise ValueError(f"GRPO样本必须是JSON对象: {dataset_path}:{line_no}")
        required_keys = ["data_source", "prompt", "reward_model"]
        for key in required_keys:
            if key not in record:
                raise ValueError(f"GRPO样本缺少字段 {key}: {dataset_path}:{line_no}")
        if not isinstance(record["prompt"], list) or not record["prompt"]:
            raise ValueError(f"GRPO样本 prompt 必须是非空数组: {dataset_path}:{line_no}")
        reward_model = record["reward_model"]
        if not isinstance(reward_model, dict):
            raise ValueError(f"GRPO样本 reward_model 必须是对象: {dataset_path}:{line_no}")
        for key in ["style", "ground_truth"]:
            if key not in reward_model:
                raise ValueError(f"GRPO样本 reward_model 缺少字段 {key}: {dataset_path}:{line_no}")

    def _write_config_summary(self) -> None:
        config_path = StoragePath.TRAINING_CONFIGS.format_storage_path(
            namespace=self.namespace,
            task_id=self.task_id,
        )
        config_dir = os.path.dirname(config_path)
        if config_dir:
            self.jfs.makedirs(config_dir, exist_ok=True)
        content = {
            "engine": "verl",
            "executor": "rayjob",
            "training_method_type": "grpo",
            "additional_params": self.task_data.get("additional_params") or {},
            "hydra_overrides": self._hydra_overrides or {},
            "train_parquet_path": self._train_parquet_path,
            "eval_parquet_path": self._eval_parquet_path,
            "reward_function_upload_id": self.task_data.get("reward_function_upload_id"),
            "reward_function_path": self._reward_function_path,
            "mlflow_experiment_name": self._build_mlflow_experiment_name(),
            "mlflow_run_name": self._build_mlflow_run_name(),
            "ray_resource_config": self.task_data.get("ray_resource_config"),
        }
        with self.jfs.open(config_path, "w", encoding="utf-8") as f:
            f.write(yaml.safe_dump(content, allow_unicode=True, sort_keys=False))
        logger.info("GRPO配置摘要已写入: %s", config_path)

    def _build_entrypoint(self, working_dir: str) -> str:
        overrides = self._hydra_overrides or {}
        override_args = " ".join(
            shlex.quote(f"{key}={self._format_hydra_value(key, value)}")
            for key, value in overrides.items()
        )
        script = (
            "set -e; "
            f"{self._build_working_dir_script(working_dir)}; "
            f"python -c {shlex.quote('import verl; print(verl.__file__)')}; "
            f"python -m verl.trainer.main_ppo {override_args}"
        )
        return f"bash -lc {shlex.quote(script)}"

    def _build_mlflow_experiment_name(self) -> str:
        return settings.get_mlflow_experiment_name(
            self.project_name,
            self.training_task.name,
            self.tenant_id,
        )

    def _build_mlflow_run_name(self) -> str:
        return settings.get_mlflow_run_name(
            self.training_task.name,
            self.training_task.version,
            self.task_id,
        )

    @staticmethod
    def _serialize_env_vars(env_vars: Dict[str, str]) -> List[Dict[str, str]]:
        return [
            {"name": str(key), "value": "" if value is None else str(value)}
            for key, value in env_vars.items()
        ]

    def _format_hydra_value(self, key: str, value: Any) -> str:
        if self._is_ray_runtime_env_var_key(key):
            return json.dumps("" if value is None else str(value), ensure_ascii=False)
        if isinstance(value, bool):
            return "True" if value else "False"
        if value is None:
            return "null"
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith(("[", "{")) and stripped.endswith(("]", "}")):
                return value
            if self.HYDRA_RAW_STRING_PATTERN.fullmatch(value):
                return value
            return json.dumps(value, ensure_ascii=False)
        return str(value)

    @staticmethod
    def _is_ray_runtime_env_var_key(key: str) -> bool:
        normalized_key = key.lstrip("+")
        return normalized_key.startswith("ray_kwargs.ray_init.runtime_env.env_vars.")

    @staticmethod
    def _build_working_dir_script(working_dir: str) -> str:
        candidates: List[str] = []
        for candidate in (working_dir, "/workspace/verl", "/home/ray/verl"):
            if candidate and candidate not in candidates:
                candidates.append(candidate)

        parts = []
        for index, candidate in enumerate(candidates):
            prefix = "if" if index == 0 else "elif"
            quoted = shlex.quote(candidate)
            parts.append(f"{prefix} [ -d {quoted} ]; then cd {quoted};")
        parts.append(f"else cd {shlex.quote(candidates[0])}; fi")
        return " ".join(parts)

    def _get_ray_resource_config(self) -> RayResourceConfig:
        data = self.task_data.get("ray_resource_config") or self.training_task.ray_resource_config
        if not data:
            raise ValueError("GRPO训练必须提供 ray_resource_config")
        return RayResourceConfig.model_validate(data)

    def _build_model_mount_path(self) -> str:
        base_model = self.task_data.get("base_model") or {}
        provider = base_model.get("model_provider")
        name = base_model.get("base_model_name")
        if not provider or not name:
            raise ValueError("GRPO训练必须提供 base_model.model_provider 和 base_model.base_model_name")
        return f"{StoragePath.BASE_MODELS.mount_path}{provider}/{name}"

    def _to_dataset_mount_path(self, jfs_path: str) -> str:
        dataset_root = StoragePath.REAL_TRAINING_DATASETS.format_storage_path(
            namespace=self.namespace,
            task_id=self.task_id,
        ).rstrip("/")
        if not jfs_path.startswith(dataset_root):
            raise ValueError(f"Parquet路径不在任务数据集目录下: {jfs_path}")
        suffix = jfs_path[len(dataset_root):].lstrip("/")
        return f"{StoragePath.REAL_TRAINING_DATASETS.mount_path.rstrip('/')}/{suffix}"

    async def _prepare_reward_function(self) -> Optional[str]:
        upload_id = (
            self.task_data.get("reward_function_upload_id")
            or self.training_task.reward_function_upload_id
            or ""
        ).strip()
        if not upload_id:
            return None

        conditions = [ChunkUploadSession.upload_id == upload_id]
        tenant_id = getattr(self.training_task, "tenant_id", None)
        if tenant_id:
            conditions.append(ChunkUploadSession.tenant_id == tenant_id)
        result = await self.db.execute(select(ChunkUploadSession).where(*conditions))
        session = result.scalar_one_or_none()
        if not session or not session.is_complete:
            raise ValueError(f"奖励函数上传会话不存在或尚未合并完成: {upload_id}")

        source_path = (session.file_url or "").strip()
        if not source_path or not self.jfs.exists(source_path):
            raise FileNotFoundError(f"奖励函数源文件不存在: {upload_id}")

        file_name = os.path.basename((session.file_name or "").strip()).lower()
        if not file_name.endswith(".py"):
            raise ValueError("GRPO奖励函数文件必须是Python文件(.py)")

        source_stat = self.jfs.stat(source_path)
        if (source_stat.st_mode & 0o40000) != 0:
            raise ValueError("GRPO奖励函数上传源必须是单个Python文件")

        target_dir = self._build_task_config_storage_dir()
        self.jfs.makedirs(target_dir, exist_ok=True)
        target_path = f"{target_dir.rstrip('/')}/reward_function.py"
        with self.jfs.open(source_path, "rb") as src, self.jfs.open(target_path, "wb") as dst:
            while True:
                chunk = src.read(1024 * 1024)
                if not chunk:
                    break
                dst.write(chunk)

        logger.info("GRPO奖励函数已复制到任务目录: upload_id=%s, path=%s", upload_id, target_path)
        return target_path

    def _build_task_config_storage_dir(self) -> str:
        config_path = StoragePath.TRAINING_CONFIGS.format_storage_path(
            namespace=self.namespace,
            task_id=self.task_id,
        )
        return os.path.dirname(config_path).rstrip("/")

    def _build_task_config_sub_path(self) -> str:
        return f"training/task/task_{self.task_id}/config"

    def _to_config_mount_path(self, jfs_path: str) -> str:
        config_root = self._build_task_config_storage_dir()
        if not jfs_path.startswith(config_root):
            raise ValueError(f"配置文件路径不在任务配置目录下: {jfs_path}")
        suffix = jfs_path[len(config_root):].lstrip("/")
        return f"/data/configs/{suffix}"

    def _build_resource_requirements(self, resource, *, include_gpu: bool) -> Dict[str, Dict[str, str]]:
        requests = {
            "cpu": self._format_cpu(resource.cpu_request, "0.5"),
            "memory": self._format_memory(resource.memory_request, "0.5Gi"),
        }
        limits = {
            "cpu": self._format_cpu(resource.cpu_limit, "16"),
            "memory": self._format_memory(resource.memory_limit, "16Gi"),
        }
        if include_gpu and resource.count > 0 and resource.k8s_resource_type:
            requests[resource.k8s_resource_type] = str(resource.count)
            limits[resource.k8s_resource_type] = str(resource.count)
        return {"requests": requests, "limits": limits}

    def _format_cpu(self, value: Any, default: str) -> str:
        if value is None or value == 0:
            return default
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return str(value)

    def _format_memory(self, value: Any, default: str) -> str:
        if value is None or value == 0:
            return default
        if isinstance(value, str):
            return value if value.lower().endswith(("mi", "gi")) else f"{value}Gi"
        if isinstance(value, float) and value.is_integer():
            return f"{int(value)}Gi"
        return f"{value}Gi"
