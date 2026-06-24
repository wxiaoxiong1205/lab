"""
在线基准评估任务K8s封装类
"""
import json
import os
from typing import Dict, Optional, Any

import juicefs
from kubernetes.client import V1Affinity
from sqlalchemy import select

from app.tasks.service.benchmark.base_benchmark_task import BaseBenchmarkTaskK8s, _extra_body_dict_to_python
from app.models.benchmark_task_manager import (
    BenchmarkTask,
    BenchmarkTaskModelRelation,
    BenchmarkTaskDatasetRelation,
)
from app.models.models import InferenceService
from app.utils.storage_enum import StoragePath
from app.schemas.repository_image import CardType
from app.core.logging import logger


class OnlineBenchmarkTaskK8s(BaseBenchmarkTaskK8s):
    """在线基准评估任务K8s封装类"""

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

    async def _build_and_upload_opencompass_config(self) -> None:
        """生成 OpenCompass 配置文件：read_base 导入内置数据集，models 使用 OpenAIHTTP（API 评测）；按模型设置 enable_thinking。"""
        config_path = StoragePath.BENCHMARK_CONFIG.format_storage_path(
            namespace=self.namespace,
            task_id=self.task_id,
        )
        remote_dir = os.path.dirname(config_path)
        if remote_dir:
            self.jfs.makedirs(remote_dir, exist_ok=True)

        inference_service = await self._get_inference_service()
        model_name = inference_service.model_name if inference_service else (self.model_relations[0].model_name if self.model_relations else "api_model")
        model_provider = getattr(self.benchmark_task, "model_provider", None)
        thinking_extra = self._get_thinking_extra_body(model_name, model_provider)
        extra_body_line = ("        extra_body=" + _extra_body_dict_to_python(thinking_extra) + ",\n") if thinking_extra else ""

        datasets_block = self._dataset_import_block()
        _env = "__import__('os').environ"
        config_content = f'''# 使用相对导入 .datasets.* ，需在 OpenCompass configs 目录下执行（或将 opencompass/configs/datasets 复制到本配置同目录下 datasets/）
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
{extra_body_line}        rpm_verbose=True, # 是否打印请求速率
        run_cfg=dict(num_gpus=0, num_procs=1),
        verbose=True,
    )
]
'''

        with self.jfs.open(config_path, 'w', encoding='utf-8') as f:
            f.write(config_content.strip())
        logger.info(f"基准评估 OpenCompass 配置已写入: {config_path}, extra_body={thinking_extra}")

    async def _get_inference_service(self) -> Optional[InferenceService]:
        """根据 model_relations 查询在线推理服务（InferenceService）。"""
        if not self.model_relations:
            return None
        model_relation = self.model_relations[0]
        session = await self.db.get_session()
        stmt = select(InferenceService).where(
            InferenceService.id == model_relation.model_id,
            InferenceService.project_id == self.benchmark_task.project_id,
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def build_env(self) -> Dict[str, str]:
        """构建环境变量：基类字段 + 在线服务 API（base_url/api_key/model_name）+ 推理参数。"""
        env_vars = await super().build_env()
        inference_service = await self._get_inference_service()
        if inference_service:
            env_vars["OPENAI_API_BASE"] = inference_service.base_url
            env_vars["OPENAI_API_KEY"] = inference_service.api_key
            env_vars["MODEL_NAME"] = inference_service.model_name
        # 推理参数（与效果评估一致，供 OpenCompass/容器内使用）
        inference_params = getattr(self.benchmark_task, "inference_params", None)
        if inference_params and isinstance(inference_params, dict):
            env_vars["INFERENCE_PARAMS"] = json.dumps(
                {k.value if hasattr(k, "value") else k: v for k, v in inference_params.items()}
            )
        return env_vars

    async def build_image(self) -> str:
        """OpenCompass 镜像与离线一致；在线评估用 CPU，无需自行部署模型。"""
        return await self._get_benchmark_image(
            card_category=CardType.CPU.value,
            card_model=None,
        )

    async def build_run_resource(self) -> Dict[str, Any]:
        """在线评估通常不需要 GPU。"""
        return {
            "cpu_limit": "4",
            "memory_limit": "8Gi",
            "cpu_request": "2",
            "memory_request": "4Gi",
            "gpu_type": None,
            "gpu_count": 0,
        }

    async def build_node_affinity(self) -> Optional[V1Affinity]:
        """在线评估无需 GPU，不配置节点亲和性。"""
        return None
