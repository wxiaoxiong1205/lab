from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.status import TaskStatus
from app.common.task_execution import TaskExecutionBusinessType, TaskExecutionExecutor, TaskExecutionStatus
from app.models.benchmark_task_manager import (
    BenchmarkDataset,
    BenchmarkLeaderboard,
    BenchmarkResult,
    BenchmarkTask,
    BenchmarkTaskDatasetRelation,
    BenchmarkTaskModelRelation,
)
from app.models.data_cleaning_manager import DataCleaningTask
from app.models.data_insight_manager import DataAugmentationTask, DataInsightTask
from app.models.evaluation_task_manager import EvaluationTask, EvaluationTaskDatasetModelRelation
from app.models.inference_result_manager import InferenceResultDataset
from app.models.inference_task_manager import InferenceTask
from app.models.label_manager import LabelDataset, LabelMachineLearningDataset, LabelProgress, LabelTask, LabelTaskMember
from app.models.model_manager import BaseModel as LabBaseModel, MLModel, TrainedModel
from app.models.models import (
    AnnotationServiceModel,
    FileFolder,
    FileManagementFile,
    ImageBuildLog,
    InferenceService,
    KubernetesRepositoryRelation,
    KubernetesResource,
    KubernetesStorageRelation,
    MachineLearningDataset,
    Notebook,
    NotebookPort,
    OpenAPIApplicationModel,
    Project,
    ProjectKubernetesRelation,
    ProjectUser,
    RepositoryImages,
    RepositoryResource,
    StorageResource,
    TaskExecution,
    ThirdPartyApiServiceModel,
    User,
)
from app.models.training_dataset_manager import TrainingDataset
from app.models.training_task_manager import TrainingTask
from app.schemas.notebook import NotebookPortProtocol, NotebookPortUsage
from app.utils.showcase_sample_files import count_showcase_jsonl
from app.utils.timezone_utils import get_current_shanghai_time

from .data import (
    KUBERNETES,
    MACHINE_LEARNING_DATASETS,
    PROJECTS,
    REPOSITORY,
    SHOWCASE_USER,
    STORAGE,
    TENANT_ID,
    TRAINING_DATASETS,
)


class DemoShowcaseSeeder:
    """初始化可提交到仓库的演示数据。"""

    name = "demo_showcase"

    async def seed(self, session: AsyncSession) -> dict[str, Any]:
        now = get_current_shanghai_time()
        counters = {"created": 0, "updated": 0, "skipped": 0, "errors": 0}

        user = await self._ensure_user(session, now, counters)
        projects = await self._ensure_projects(session, user, now, counters)
        k8s = await self._ensure_k8s(session, user, now, counters)
        storage = await self._ensure_storage(session, user, now, counters)
        repository = await self._ensure_repository(session, user, now, counters)
        await self._ensure_relations(session, projects, k8s, storage, repository, now, counters)
        base_models = await self._ensure_base_models(session, k8s, user, now, counters)

        llm_project = projects[0]
        ml_project = projects[1] if len(projects) > 1 else projects[0]
        repository_images = await self._ensure_repository_images(session, repository, user, now, counters)
        online_services = await self._ensure_online_inference_services(session, llm_project, user, now, counters)
        await self._ensure_openapi_applications(session, user, now, counters)
        await self._ensure_third_party_apis(session, llm_project, user, now, counters)
        training_datasets = await self._ensure_training_datasets(session, llm_project, user, now, counters)
        ml_datasets = await self._ensure_machine_learning_datasets(session, ml_project, user, now, counters)
        inference_results = await self._ensure_inference_results(session, llm_project, base_models, training_datasets, user, now, counters)
        notebooks = await self._ensure_notebooks(session, llm_project, ml_project, base_models, online_services, training_datasets, ml_datasets, inference_results, repository_images, k8s, user, now, counters)
        training_tasks = await self._ensure_training_tasks(session, llm_project, base_models, training_datasets, k8s, user, now, counters)
        trained_models = await self._ensure_trained_models(session, llm_project, base_models, training_tasks, user, now, counters)
        ml_models = await self._ensure_ml_models(session, ml_project, ml_datasets, notebooks, user, now, counters)
        inference_tasks = await self._ensure_inference_tasks(session, llm_project, ml_project, base_models, trained_models, ml_models, repository_images, k8s, user, now, counters)
        evaluation_tasks = await self._ensure_evaluation_tasks(session, llm_project, base_models, inference_results, k8s, user, now, counters)
        processing_tasks = await self._ensure_processing_tasks(session, llm_project, training_datasets, k8s, user, now, counters)
        await self._ensure_label_tasks(session, llm_project, training_datasets, user, now, counters)
        await self._ensure_ml_label_tasks(session, ml_project, ml_datasets, user, now, counters)
        await self._ensure_file_management(session, llm_project, ml_project, user, now, counters)
        await self._ensure_annotation_services(session, ml_project, user, now, counters)
        benchmark_tasks = await self._ensure_benchmark_showcase(session, llm_project, base_models, k8s, user, now, counters)
        await self._ensure_image_build_logs(session, llm_project, ml_project, notebooks, repository_images, k8s, user, now, counters)
        await self._ensure_task_executions(session, training_tasks, inference_results, evaluation_tasks, processing_tasks, benchmark_tasks, inference_tasks, user, now, counters)

        return counters

    async def _one(self, session: AsyncSession, model, *filters):
        result = await session.execute(select(model).where(*filters).limit(1))
        return result.scalars().first()

    def _mark_created(self, obj, user: User | None, now):
        obj.tenant_id = TENANT_ID
        obj.created_at = now
        obj.updated_at = now
        if user:
            obj.created_id = user.id
            obj.created_by = user.username
        else:
            obj.created_by = SHOWCASE_USER["username"]

    async def _ensure_user(self, session: AsyncSession, now, counters) -> User:
        user = await self._one(session, User, User.username == SHOWCASE_USER["username"])
        if user:
            counters["skipped"] += 1
            return user
        user = User(**SHOWCASE_USER, is_active=True, is_admin=True)
        self._mark_created(user, None, now)
        session.add(user)
        await session.flush()
        counters["created"] += 1
        return user

    async def _ensure_projects(self, session: AsyncSession, user: User, now, counters) -> list[Project]:
        projects: list[Project] = []
        for item in PROJECTS:
            project = await self._one(
                session,
                Project,
                Project.name == item["name"],
                Project.tenant_id == TENANT_ID,
            )
            if project:
                counters["skipped"] += 1
            else:
                project = Project(**item)
                self._mark_created(project, user, now)
                session.add(project)
                await session.flush()
                counters["created"] += 1
            projects.append(project)
        return projects

    async def _ensure_k8s(self, session: AsyncSession, user: User, now, counters) -> KubernetesResource:
        k8s = await self._one(session, KubernetesResource, KubernetesResource.name == KUBERNETES["name"], KubernetesResource.tenant_id == TENANT_ID)
        if k8s:
            counters["skipped"] += 1
            return k8s
        k8s = KubernetesResource(**KUBERNETES)
        self._mark_created(k8s, user, now)
        session.add(k8s)
        await session.flush()
        counters["created"] += 1
        return k8s

    async def _ensure_storage(self, session: AsyncSession, user: User, now, counters) -> StorageResource:
        storage = await self._one(session, StorageResource, StorageResource.name == STORAGE["name"], StorageResource.tenant_id == TENANT_ID)
        if storage:
            counters["skipped"] += 1
            return storage
        storage = StorageResource(**STORAGE)
        self._mark_created(storage, user, now)
        session.add(storage)
        await session.flush()
        counters["created"] += 1
        return storage

    async def _ensure_repository(self, session: AsyncSession, user: User, now, counters) -> RepositoryResource:
        repository = await self._one(session, RepositoryResource, RepositoryResource.name == REPOSITORY["name"], RepositoryResource.tenant_id == TENANT_ID)
        if repository:
            counters["skipped"] += 1
            return repository
        repository = RepositoryResource(**REPOSITORY)
        self._mark_created(repository, user, now)
        session.add(repository)
        await session.flush()
        counters["created"] += 1
        return repository

    async def _ensure_relations(self, session, projects, k8s, storage, repository, now, counters) -> None:
        relation_specs = [
            (KubernetesStorageRelation, (KubernetesStorageRelation.k8s_id == k8s.id, KubernetesStorageRelation.storage_id == storage.id), {"k8s_id": k8s.id, "storage_id": storage.id, "is_mount": True, "tenant_id": TENANT_ID}),
            (KubernetesRepositoryRelation, (KubernetesRepositoryRelation.k8s_id == k8s.id, KubernetesRepositoryRelation.repository_id == repository.id), {"k8s_id": k8s.id, "repository_id": repository.id, "tenant_id": TENANT_ID}),
        ]
        for project in projects:
            relation_specs.extend([
                (ProjectKubernetesRelation, (ProjectKubernetesRelation.project_id == project.id, ProjectKubernetesRelation.k8s_id == k8s.id), {"project_id": project.id, "k8s_id": k8s.id, "namespace": f"deepexilab-{project.id}-{k8s.id}", "tenant_id": TENANT_ID}),
                (ProjectUser, (ProjectUser.project_id == project.id, ProjectUser.user_id == project.created_id), {"project_id": project.id, "user_id": project.created_id, "tenant_id": TENANT_ID}),
            ])
        for model, filters, values in relation_specs:
            existing = await self._one(session, model, *filters)
            if existing:
                counters["skipped"] += 1
                continue
            obj = model(**values)
            obj.created_at = now
            obj.updated_at = now
            obj.created_by = SHOWCASE_USER["username"]
            session.add(obj)
            counters["created"] += 1
        await session.flush()

    async def _ensure_base_models(self, session, k8s, user, now, counters) -> list[LabBaseModel]:
        specs = [
            ("Qwen2.5-7B-Instruct", "ModelScope", ["text-generation"], "qwen", "已完成", ["training", "inference"]),
            ("Qwen2.5-VL-7B-Instruct", "ModelScope", ["image-understanding"], "qwen", "已完成", ["training", "inference"]),
            ("llama-3.1-8b-instruct", "Local", ["text-generation"], "llama", "已完成", ["inference"]),
        ]
        models: list[LabBaseModel] = []
        for name, source, model_type, provider, status, tags in specs:
            model = await self._one(session, LabBaseModel, LabBaseModel.name == name, LabBaseModel.tenant_id == TENANT_ID)
            if model:
                counters["skipped"] += 1
            else:
                model = LabBaseModel(
                    name=name,
                    description="演示基础模型，用于本地 showcase 前后端联调。",
                    _model_type=",".join(model_type),
                    model_provider=provider,
                    model_path=f"/public/showcase/models/{name}",
                    model_source=source,
                    status=status,
                    k8s_id=k8s.id,
                    lab_k8s_uuid=k8s.name,
                    _model_tags=",".join(tags),
                )
                self._mark_created(model, user, now)
                session.add(model)
                await session.flush()
                counters["created"] += 1
            models.append(model)
        return models

    async def _ensure_repository_images(self, session, repository, user, now, counters) -> list[RepositoryImages]:
        specs = [
            ("harbor-preview.example.local/deepexilab/pytorch:2.3-cuda12.1", 0, "Notebook 和训练任务通用演示镜像"),
            ("harbor-preview.example.local/deepexilab/vllm:0.8.5", 3, "推理服务演示镜像"),
            ("harbor-preview.example.local/deepexilab/data-juicer:1.0", 1, "数据清洗演示镜像"),
        ]
        rows: list[RepositoryImages] = []
        for image, image_type, describe in specs:
            existing = await self._one(
                session,
                RepositoryImages,
                RepositoryImages.image == image,
                RepositoryImages.repository_id == repository.id,
                RepositoryImages.type == image_type,
                RepositoryImages.tenant_id == TENANT_ID,
            )
            if existing:
                counters["skipped"] += 1
                rows.append(existing)
                continue
            row = RepositoryImages(
                image=image,
                type=image_type,
                repository_id=repository.id,
                describe=describe,
                namespace=repository.namespace,
                card_category="NVIDIA",
                card_model="A800",
                cuda_version="12.1",
                python_version="3.11",
                image_source="built-in",
            )
            self._mark_created(row, user, now)
            session.add(row)
            await session.flush()
            counters["created"] += 1
            rows.append(row)
        await session.flush()
        return rows

    async def _ensure_online_inference_services(self, session, project, user, now, counters) -> list[InferenceService]:
        specs = [
            ("showcase-Qwen文本生成服务", ["文本生成"], "测试通过", "qwen2.5-7b-instruct"),
            ("showcase-Qwen-VL图像理解服务", ["图像理解"], "测试通过", "qwen2.5-vl-7b-instruct"),
            ("showcase-备用推理服务待测试", ["文本生成"], "未测试", "backup-chat-model"),
        ]
        rows: list[InferenceService] = []
        for name, model_type, status, model_name in specs:
            existing = await self._one(session, InferenceService, InferenceService.project_id == project.id, InferenceService.name == name, InferenceService.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                rows.append(existing)
                continue
            row = InferenceService(
                name=name,
                description="演示在线推理服务，使用本地占位地址和占位 API Key。",
                api_key="showcase-placeholder-key",
                base_url=f"https://inference-preview.example.local/{model_name}",
                model_name=model_name,
                model_type=model_type,
                status=status,
                project_id=project.id,
            )
            self._mark_created(row, user, now)
            session.add(row)
            await session.flush()
            counters["created"] += 1
            rows.append(row)
        return rows

    async def _ensure_openapi_applications(self, session, user, now, counters) -> None:
        specs = [
            ("showcase-数据集开放接口应用", "dataset-demo", {"scope": "dataset", "showcase": True}),
            ("showcase-推理服务开放接口应用", "inference-demo", {"scope": "inference", "showcase": True}),
        ]
        for name, group_id, labels in specs:
            existing = await self._one(session, OpenAPIApplicationModel, OpenAPIApplicationModel.name == name, OpenAPIApplicationModel.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                continue
            row = OpenAPIApplicationModel(
                name=name,
                group_id=group_id,
                key_id=f"showcase-{group_id}",
                secret_key="showcase-placeholder-secret",
                description="演示 OpenAPI 应用；密钥为占位值，仅用于页面展示。",
                labels=labels,
                plugins={"rate_limit": {"qps": 5}, "ip_allowlist": []},
            )
            self._mark_created(row, user, now)
            session.add(row)
            counters["created"] += 1
        await session.flush()

    async def _ensure_third_party_apis(self, session, project, user, now, counters) -> None:
        specs = [
            ("showcase-外部质检结果回传", "POST", "测试通过"),
            ("showcase-客户工单画像查询", "GET", "未测试"),
            ("showcase-异常件检测接口", "POST", "测试失败"),
        ]
        for name, request_type, status in specs:
            existing = await self._one(session, ThirdPartyApiServiceModel, ThirdPartyApiServiceModel.project_id == project.id, ThirdPartyApiServiceModel.name == name, ThirdPartyApiServiceModel.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                continue
            row = ThirdPartyApiServiceModel(
                name=name,
                description="演示第三方业务接口，用于业务推理结果集字段映射展示。",
                base_url=f"https://third-party-preview.example.local/api/{name.replace('showcase-', '')}",
                header=[{"name": "Authorization", "value": "Bearer showcase-placeholder"}],
                request_param=[{"name": "ticket_id", "type": "string", "required": True}, {"name": "content", "type": "string"}],
                response_param=[{"name": "risk_level", "type": "string"}, {"name": "summary", "type": "string"}],
                request_type=request_type,
                protocol="application/json",
                status=status,
                project_id=project.id,
            )
            self._mark_created(row, user, now)
            session.add(row)
            counters["created"] += 1
        await session.flush()

    async def _ensure_notebooks(self, session, llm_project, ml_project, base_models, online_services, training_datasets, ml_datasets, inference_results, repository_images, k8s, user, now, counters) -> list[Notebook]:
        notebook_image = next((image.image for image in repository_images if image.type == 0), "harbor-preview.example.local/deepexilab/pytorch:2.3-cuda12.1")
        text_service = online_services[0] if online_services else None
        specs = [
            {
                "project": llm_project,
                "instance_name": "showcase-LLM训练Notebook-运行中",
                "status": TaskStatus.RUNNING.value,
                "biz_type": "llm",
                "is_public": True,
                "dataset": {"training": [training_datasets[0].id], "validation": [training_datasets[-3].id], "test": [training_datasets[-2].id], "inference_result": [inference_results[0].id]},
                "models": {"base_models": [base_models[0].id]},
                "model_service_id": text_service.id if text_service else None,
                "usage": None,
            },
            {
                "project": llm_project,
                "instance_name": "showcase-评估分析Notebook-已停止",
                "status": TaskStatus.COMPLETED.value,
                "biz_type": "llm",
                "is_public": False,
                "dataset": {"training": [training_datasets[1].id], "inference_result": [inference_results[-1].id]},
                "models": {"base_models": [base_models[-1].id]},
                "model_service_id": text_service.id if text_service else None,
                "usage": None,
            },
            {
                "project": ml_project,
                "instance_name": "showcase-ML在线开发Notebook",
                "status": TaskStatus.RUNNING.value,
                "biz_type": "machine_learning",
                "is_public": True,
                "dataset": {"machine_learning_dataset": [{"dataset_id": item.id, "format": item.source_type} for item in ml_datasets[:3]]},
                "models": {"base_models": []},
                "model_service_id": None,
                "usage": "image_classification",
            },
        ]
        rows: list[Notebook] = []
        for item in specs:
            project = item["project"]
            existing = await self._one(session, Notebook, Notebook.project_id == project.id, Notebook.instance_name == item["instance_name"], Notebook.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                rows.append(existing)
                continue
            row = Notebook(
                project_id=project.id,
                namespace=f"deepexilab-{project.id}-{k8s.id}",
                instance_name=item["instance_name"],
                image=notebook_image,
                gpu_type="nvidia.com/gpu",
                gpu_count=1 if item["status"] == TaskStatus.RUNNING.value else 0,
                resource_cpu_request=2,
                resource_cpu_limit=4,
                resource_memory_request=8,
                resource_memory_limit=16,
                status=item["status"],
                lab_k8s_uuid=k8s.name,
                real_address=f"http://notebook-{project.id}-{len(rows) + 1}.preview.local",
                access_url=f"/notebook/{project.id}/showcase/{len(rows) + 1}/lab",
                describe="演示 Notebook，覆盖运行中、已停止、公开和私有状态。",
                is_public=item["is_public"],
                secret="showcase-placeholder-secret",
                ssh_username=f"showcase_nb_{len(rows) + 1}",
                ssh_address="ssh-preview.example.local",
                ssh_port=2200 + len(rows),
                max_runtime_minutes=480,
                ext={"category": "GPU", "model": "A800", "memory": "80G", "dataset": item["dataset"], "models": item["models"]},
                biz_type=item["biz_type"],
                model_service_id=item["model_service_id"],
                usage=item["usage"],
            )
            self._mark_created(row, user, now)
            session.add(row)
            await session.flush()
            await self._ensure_notebook_ports(session, row, now, counters)
            counters["created"] += 1
            rows.append(row)
        return rows

    async def _ensure_notebook_ports(self, session, notebook, now, counters) -> None:
        specs = [
            (NotebookPortUsage.JUPYTER.value, 9000, "JupyterLab"),
            (NotebookPortUsage.SSH.value, 22, "SSH 远程访问"),
            (NotebookPortUsage.ML_BACKEND.value, 9090, "ML 在线开发后端"),
        ]
        for usage, container_port, description in specs:
            existing = await self._one(session, NotebookPort, NotebookPort.notebook_id == notebook.id, NotebookPort.port_usage == usage, NotebookPort.container_port == container_port, NotebookPort.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                continue
            port = NotebookPort(
                notebook_id=notebook.id,
                protocol=NotebookPortProtocol.TCP.value,
                port_usage=usage,
                port=30000 + notebook.id + container_port % 100,
                container_port=container_port,
                description=description,
                access_url=f"{notebook.access_url}/ports/{container_port}",
            )
            port.tenant_id = TENANT_ID
            port.created_at = now
            port.updated_at = now
            port.created_by = SHOWCASE_USER["username"]
            session.add(port)
            counters["created"] += 1
        await session.flush()

    async def _ensure_training_datasets(self, session, project, user, now, counters) -> list[TrainingDataset]:
        rows: list[TrainingDataset] = []
        for item in TRAINING_DATASETS:
            existing = await self._one(
                session,
                TrainingDataset,
                TrainingDataset.project_id == project.id,
                TrainingDataset.name == item["name"],
                TrainingDataset.version == item["version"],
                TrainingDataset.usage == item["usage"],
                TrainingDataset.tenant_id == TENANT_ID,
            )
            if existing:
                counters["skipped"] += 1
                rows.append(existing)
                continue
            total_samples = min(item["total_samples"], count_showcase_jsonl(item["path"]))
            row = TrainingDataset(
                name=item["name"],
                description=item["description"],
                project_id=project.id,
                version=item["version"],
                dataset_type=item["dataset_type"],
                training_method_type=item["training_method_type"],
                dataset_format=item["dataset_format"],
                usage=item["usage"],
                dataset_config={"showcase": True},
                metadata_fields=item["metadata_fields"],
                total_samples=total_samples,
                total_characters=0,
                file_size=0.01,
                dataset_path=item["path"],
                processing_status=item["processing_status"],
                processing_error=item.get("processing_error"),
                publish=item["publish"],
            )
            self._mark_created(row, user, now)
            session.add(row)
            await session.flush()
            counters["created"] += 1
            rows.append(row)
        return rows

    async def _ensure_machine_learning_datasets(self, session, project, user, now, counters) -> list[MachineLearningDataset]:
        rows: list[MachineLearningDataset] = []
        for item in MACHINE_LEARNING_DATASETS:
            existing = await self._one(
                session,
                MachineLearningDataset,
                MachineLearningDataset.project_id == project.id,
                MachineLearningDataset.name == item["name"],
                MachineLearningDataset.version == item["version"],
                MachineLearningDataset.tenant_id == TENANT_ID,
            )
            if existing:
                counters["skipped"] += 1
                rows.append(existing)
                continue
            row = MachineLearningDataset(
                name=item["name"],
                description=item["description"],
                project_id=project.id,
                version=item["version"],
                task_type=item["task_type"],
                data_type=item["data_type"],
                data_source="local_upload",
                annotation_type=item["annotation_type"],
                template_type=item["template_type"],
                is_annotated=True,
                source_type=item["source_type"],
                storage_path=f"builtin-sample://showcase/ml/{item['name']}/",
                dataset_path=item["path"],
                metadata_fields=item["metadata_fields"],
                sample_count=min(item["sample_count"], count_showcase_jsonl(item["path"])),
                file_size=0.01,
                processing_status=item["processing_status"],
                publish=item["publish"],
            )
            self._mark_created(row, user, now)
            session.add(row)
            await session.flush()
            counters["created"] += 1
            rows.append(row)
        return rows

    async def _ensure_inference_results(self, session, project, base_models, datasets, user, now, counters) -> list[InferenceResultDataset]:
        source = next((d for d in datasets if d.usage == "test" and d.processing_status == "pending"), datasets[0])
        specs = [
            ("showcase-客服问答推理结果", "completed", 100, "default-inference"),
            ("showcase-推理结果处理中", "processing", 45, "default-inference"),
            ("showcase-业务推理结果集", "completed", 100, "business-inference"),
        ]
        rows: list[InferenceResultDataset] = []
        for name, status, progress, usage in specs:
            existing = await self._one(session, InferenceResultDataset, InferenceResultDataset.project_id == project.id, InferenceResultDataset.name == name, InferenceResultDataset.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                rows.append(existing)
                continue
            row = InferenceResultDataset(
                name=name,
                description="演示推理结果集，来自后端 demo_showcase seed。",
                project_id=project.id,
                inference_method="import",
                model_source="base_model",
                model_id=base_models[0].id,
                model_name=base_models[0].name,
                source_dataset_id=source.id,
                source_dataset_name=f"{source.name}-{source.version}",
                inference_params={"temperature": 0.7, "top_p": 0.8, "max_tokens": 1024},
                graphics_card_resource={"card_type": "GPU", "card_model": "A800", "count": 1, "card_memory": "80GB", "k8s_resource_type": "nvidia.com/gpu"},
                file_path="builtin-sample://showcase/inference_role_based.jsonl",
                file_size=0.01,
                upload_method="local",
                dataset_type="text-generation",
                dataset_format="role-based",
                usage=usage,
                total_items=3,
                status=status,
                progress=progress,
                started_at=now,
                finished_at=now if status == "completed" else None,
                manual_trigger_required=False,
            )
            self._mark_created(row, user, now)
            session.add(row)
            await session.flush()
            counters["created"] += 1
            rows.append(row)
        return rows

    async def _ensure_training_tasks(self, session, project, base_models, datasets, k8s, user, now, counters) -> list[TrainingTask]:
        training_dataset = datasets[0]
        specs = [
            ("showcase-SFT训练已完成", TaskStatus.COMPLETED.value, 100),
            ("showcase-GRPO训练运行中", TaskStatus.RUNNING.value, 62),
            ("showcase-DPO训练失败", TaskStatus.FAILED.value, 100),
        ]
        rows: list[TrainingTask] = []
        for name, status, progress in specs:
            existing = await self._one(session, TrainingTask, TrainingTask.project_id == project.id, TrainingTask.name == name, TrainingTask.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                rows.append(existing)
                continue
            row = TrainingTask(
                name=name,
                description="演示训练任务，覆盖完成、运行中和失败状态。",
                project_id=project.id,
                version="v1",
                base_model={"id": base_models[0].id, "name": base_models[0].name},
                training_type={"train_type_category": "text-generation", "train_method_type": "sft", "fine_tuning_type": "lora"},
                data_processing={},
                dataset_items=[{"id": training_dataset.id, "name": training_dataset.name, "version": training_dataset.version, "usage": training_dataset.usage}],
                basic={"epochs": 3, "learning_rate": "2e-5", "batch_size": 4},
                advanced={},
                evaluation={},
                eval_dataset_items=[],
                save={"output_dir": f"/public/showcase/training/{name}"},
                monitor={},
                additional_params={"showcase": True},
                graphics_card_resource={"card_type": "GPU", "card_model": "A800", "count": 1, "card_memory": "80GB", "k8s_resource_type": "nvidia.com/gpu"},
                gpu_count=1,
                lab_k8s_uuid=k8s.name,
                status=status,
                progress=progress,
                started_at=now,
                finished_at=now if status in (TaskStatus.COMPLETED.value, TaskStatus.FAILED.value) else None,
                model_output_path=f"/public/showcase/models/{name}",
            )
            self._mark_created(row, user, now)
            session.add(row)
            await session.flush()
            counters["created"] += 1
            rows.append(row)
        await session.flush()
        return rows

    async def _ensure_trained_models(self, session, project, base_models, training_tasks, user, now, counters) -> list[TrainedModel]:
        source_task = next((task for task in training_tasks if task.status == TaskStatus.COMPLETED.value), training_tasks[0])
        specs = [
            ("showcase-SFT客服助手模型", "text-generation", "v1", TaskStatus.COMPLETED.value, source_task),
            ("showcase-GRPO推理增强模型", "text-generation", "v1", TaskStatus.RUNNING.value, training_tasks[1] if len(training_tasks) > 1 else source_task),
        ]
        rows: list[TrainedModel] = []
        for name, model_type, version, status, task in specs:
            existing = await self._one(session, TrainedModel, TrainedModel.project_id == project.id, TrainedModel.name == name, TrainedModel.model_version == version, TrainedModel.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                rows.append(existing)
                continue
            row = TrainedModel(
                name=name,
                description="演示训练后模型，来源于 demo_showcase 训练任务。",
                model_type=model_type,
                model_path=f"/public/showcase/trained_models/{name}",
                model_version=version,
                project_id=project.id,
                task_id=task.id,
                task_name=task.name,
                task_version=task.version,
                base_model_id=base_models[0].id,
                base_model_name=base_models[0].name,
                checkpoint="checkpoint-500",
                model_source_type="training",
                schedule_at=None,
                lab_k8s_uuid=task.lab_k8s_uuid,
                status=status,
                started_at=task.started_at,
                finished_at=task.finished_at if status == TaskStatus.COMPLETED.value else None,
                estimated_duration=3600,
                log_path=f"/public/showcase/logs/{name}.log",
                graphics_card_resource=task.graphics_card_resource,
            )
            self._mark_created(row, user, now)
            session.add(row)
            await session.flush()
            counters["created"] += 1
            rows.append(row)
        return rows

    async def _ensure_ml_models(self, session, project, datasets, notebooks, user, now, counters) -> list[MLModel]:
        ml_notebook = next((item for item in notebooks if item.biz_type == "machine_learning"), None)
        specs = [
            ("showcase-图像分类ResNet模型", "V1", "image", "image_classification", "image-classification", TaskStatus.COMPLETED.value, "models/resnet50/model.pt"),
            ("showcase-文本分类BERT模型", "V1", "text", "text_classification", "text-classification", TaskStatus.COMPLETED.value, "models/bert/model.bin"),
            ("showcase-检测模型复制失败", "V1", "image", "object_detection", "object-detection", TaskStatus.FAILED.value, "models/detector/model.pt"),
        ]
        rows: list[MLModel] = []
        for name, version, model_type, annotation_type, task_type, status, source_ref in specs:
            existing = await self._one(session, MLModel, MLModel.project_id == project.id, MLModel.name == name, MLModel.model_version == version, MLModel.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                rows.append(existing)
                continue
            row = MLModel(
                name=name,
                model_version=version,
                description="演示机器学习模型版本，覆盖文本、图像和失败状态。",
                project_id=project.id,
                model_type=model_type,
                annotation_type=annotation_type,
                task_type=task_type,
                source_type="notebook",
                notebook_id=ml_notebook.id if ml_notebook else None,
                source_ref=source_ref,
                tokenizer_source_ref="models/bert/tokenizer.json" if model_type == "text" else None,
                network_structure="ResNet/BERT showcase architecture",
                artifact_uri=f"/public/showcase/ml_models/{name}/{version}/model",
                tokenizer_uri=f"/public/showcase/ml_models/{name}/{version}/tokenizer" if model_type == "text" else None,
                status=status,
            )
            self._mark_created(row, user, now)
            session.add(row)
            await session.flush()
            counters["created"] += 1
            rows.append(row)
        return rows

    async def _ensure_inference_tasks(self, session, llm_project, ml_project, base_models, trained_models, ml_models, repository_images, k8s, user, now, counters) -> list[InferenceTask]:
        inference_image = next((image for image in repository_images if image.type == 3), repository_images[0])
        specs = [
            ("showcase-基础模型在线推理运行中", llm_project, base_models[0].id, "base_model", base_models[0].model_path, base_models[0].name, TaskStatus.RUNNING.value, 1, 1),
            ("showcase-训练模型在线推理已完成", llm_project, trained_models[0].id, "trained_model", trained_models[0].model_path, trained_models[0].name, TaskStatus.COMPLETED.value, 1, 1),
            ("showcase-ML模型部署失败", ml_project, ml_models[-1].id, "ml_model", ml_models[-1].artifact_uri, ml_models[-1].name, TaskStatus.FAILED.value, 1, 0),
        ]
        rows: list[InferenceTask] = []
        for name, project, model_id, model_source, model_path, model_name, status, desired, ready in specs:
            existing = await self._one(session, InferenceTask, InferenceTask.project_id == project.id, InferenceTask.server_name == name, InferenceTask.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                rows.append(existing)
                continue
            row = InferenceTask(
                server_name=name,
                description="演示在线部署推理任务，覆盖基础模型、训练模型和 ML 模型。",
                model_id=model_id,
                model_source=model_source,
                model_path=model_path or f"/public/showcase/models/{model_name}",
                model_name=model_name,
                project_id=project.id,
                desired_replicas=desired,
                ready_replicas=ready,
                status=status,
                inference_engine_type="vllm" if model_source != "ml_model" else "custom",
                image_id=inference_image.id,
                image_name=inference_image.image,
                run_command="python -m showcase.serve --host 0.0.0.0",
                backend_parameters=["--max-model-len", "4096"],
                env_vars={"SHOWCASE_MODE": "true"},
                gpu_count=1,
                gpu_type="nvidia.com/gpu",
                graphics_card_resource={"card_type": "GPU", "card_model": "A800", "count": 1, "card_memory": "80GB", "k8s_resource_type": "nvidia.com/gpu"},
                lab_k8s_uuid=k8s.name,
                namespace=f"deepexilab-{project.id}-{k8s.id}",
                access_url=f"https://inference-preview.example.local/{project.id}/{name}",
                k8s_service_nodeport=f"showcase-{project.id}-{len(rows) + 1}",
                resource_cpu_config={"resource_cpu_request": 2, "resource_cpu_limit": 4, "resource_memory_request": 8, "resource_memory_limit": 16},
            )
            self._mark_created(row, user, now)
            session.add(row)
            await session.flush()
            counters["created"] += 1
            rows.append(row)
        return rows

    async def _ensure_evaluation_tasks(self, session, project, base_models, inference_results, k8s, user, now, counters) -> list[EvaluationTask]:
        specs = [
            ("showcase-自动评估已完成", "single", "all", TaskStatus.COMPLETED.value, 100),
            ("showcase-对比评估运行中", "comparison", "referee", TaskStatus.RUNNING.value, 35),
            ("showcase-人工评估标注中", "single", "manual", "annotating", 50),
        ]
        rows: list[EvaluationTask] = []
        for name, evaluation_type, method, status, progress in specs:
            existing = await self._one(session, EvaluationTask, EvaluationTask.project_id == project.id, EvaluationTask.name == name, EvaluationTask.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                rows.append(existing)
                continue
            row = EvaluationTask(
                name=name,
                description="演示评估任务，覆盖自动、对比和人工评估。",
                project_id=project.id,
                version="v1",
                evaluation_type=evaluation_type,
                data_source="existing",
                dataset_format="role-based",
                evaluation_method=method,
                referee_model_id=base_models[0].id,
                referee_model_name=base_models[0].name,
                referee_model_source="base_model",
                referee_type="model",
                graphics_card_resource={"card_type": "GPU", "card_model": "A800", "count": 1, "card_memory": "80GB", "k8s_resource_type": "nvidia.com/gpu"},
                referee_inference_params={"temperature": 0.1},
                evaluation_prompt_config={"template": "请判断模型回答是否满足标准答案。"},
                basic_metric_config={"metrics": ["accuracy", "rouge"]},
                dataset_type="text-generation",
                total_items=3,
                completed_items=3 if status == TaskStatus.COMPLETED.value else 1,
                status=status,
                progress=progress,
                lab_k8s_uuid=k8s.name,
                result_file_path=["builtin-sample://showcase/inference_role_based.jsonl"],
                started_at=now,
                finished_at=now if status == TaskStatus.COMPLETED.value else None,
            )
            self._mark_created(row, user, now)
            session.add(row)
            await session.flush()
            relation = EvaluationTaskDatasetModelRelation(
                evaluation_task_id=row.id,
                inference_result_dataset_id=inference_results[0].id,
                inference_result_dataset_name=inference_results[0].name,
                evaluated_model_id=base_models[0].id,
                evaluated_model_name=base_models[0].name,
                evaluated_model_source="base_model",
                sort_order=0,
                api_params={"temperature": 0.1},
            )
            self._mark_created(relation, user, now)
            session.add(relation)
            counters["created"] += 2
            rows.append(row)
        await session.flush()
        return rows

    async def _ensure_processing_tasks(self, session, project, datasets, k8s, user, now, counters) -> list[Any]:
        source = datasets[0]
        rows: list[Any] = []
        for model, name, values in [
            (DataCleaningTask, "showcase-客服问答清洗已完成", {"status": TaskStatus.COMPLETED.value, "input_dataset_id": source.id, "output_dataset_id": source.id, "source": "existed_dataset", "override": False, "steps_snapshot": {"operators": ["text_length_filter"]}, "selected_fields": {"fields": ["prompt", "response"]}, "total_samples": 60, "dataset_path": source.dataset_path, "output_path": source.dataset_path, "lab_k8s_uuid": k8s.name, "completed_at": now}),
            (DataAugmentationTask, "showcase-客服问答增强运行中", {"status": TaskStatus.RUNNING.value, "source_dataset_id": source.id, "source_dataset_name": source.name, "source_dataset_version": source.version, "source_dataset_usage": source.usage, "output_dataset_name": "showcase-客服问答增强结果", "output_dataset_version": "V2", "dataset_type": source.dataset_type, "training_method_type": source.training_method_type, "dataset_format": source.dataset_format, "config": {"strategy": "paraphrase"}, "result_summary": {"generated": 128}}),
            (DataInsightTask, "showcase-多轮对话洞察已完成", {"status": TaskStatus.COMPLETED.value, "source_dataset_id": source.id, "source_dataset_name": source.name, "source_dataset_version": source.version, "source_dataset_usage": source.usage, "dataset_type": source.dataset_type, "training_method_type": source.training_method_type, "dataset_format": source.dataset_format, "config": {"dimensions": ["intent", "length"]}, "result_summary": {"intent_count": 6}, "result_samples": {"items": []}, "finished_at": now}),
        ]:
            existing = await self._one(session, model, model.project_id == project.id, model.name == name, model.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                rows.append(existing)
                continue
            base_values = {"name": name, "project_id": project.id, **values}
            if model is not DataCleaningTask:
                base_values["description"] = "演示数据处理任务。"
            row = model(**base_values)
            self._mark_created(row, user, now)
            session.add(row)
            counters["created"] += 1
            rows.append(row)
        await session.flush()
        return rows

    async def _ensure_label_tasks(self, session, project, datasets, user, now, counters) -> None:
        source = datasets[0]
        existing_dataset = await self._one(session, LabelDataset, LabelDataset.project_id == project.id, LabelDataset.name == "showcase-LLM在线标注任务", LabelDataset.tenant_id == TENANT_ID)
        if existing_dataset:
            counters["skipped"] += 1
            label_dataset = existing_dataset
        else:
            label_dataset = LabelDataset(
                name="showcase-LLM在线标注任务",
                description="LLM 在线标注演示任务数据集。",
                project_id=project.id,
                source="existed_dataset",
                source_dataset_id=source.id,
                submit_dataset_id=source.id,
                override=False,
                dataset_type=source.dataset_type,
                dataset_format=source.dataset_format,
                task_type="online",
                total_samples=source.total_samples,
                total_characters=source.total_characters,
                file_size=source.file_size,
                dataset_path=source.dataset_path,
            )
            self._mark_created(label_dataset, user, now)
            session.add(label_dataset)
            await session.flush()
            counters["created"] += 1
        existing_task = await self._one(session, LabelTask, LabelTask.label_dataset_id == label_dataset.id, LabelTask.task_type == "online", LabelTask.tenant_id == TENANT_ID)
        if existing_task:
            counters["skipped"] += 1
        else:
            task = LabelTask(biz_type="llm", task_type="online", description="演示在线标注任务。", label_dataset_id=label_dataset.id, status=TaskStatus.RUNNING.value)
            self._mark_created(task, user, now)
            session.add(task)
            counters["created"] += 1
        await session.flush()

    async def _ensure_ml_label_tasks(self, session, project, datasets, user, now, counters) -> None:
        specs = [
            ("showcase-ML图像分类在线标注", "online", TaskStatus.RUNNING.value, datasets[2] if len(datasets) > 2 else datasets[0]),
            ("showcase-ML检测多人标注", "multi", "标注中", datasets[3] if len(datasets) > 3 else datasets[0]),
        ]
        for name, task_type, status, source in specs:
            existing_dataset = await self._one(session, LabelMachineLearningDataset, LabelMachineLearningDataset.project_id == project.id, LabelMachineLearningDataset.name == name, LabelMachineLearningDataset.tenant_id == TENANT_ID)
            if existing_dataset:
                counters["skipped"] += 1
                label_dataset = existing_dataset
            else:
                label_dataset = LabelMachineLearningDataset(
                    name=name,
                    description="机器学习标注演示任务，覆盖在线和多人标注。",
                    project_id=project.id,
                    source_dataset_id=source.id,
                    submit_dataset_id=source.id,
                    override=False,
                    task_type=task_type,
                    data_type=source.data_type,
                    annotation_type=source.annotation_type,
                    template_type=source.template_type,
                    class_count=3,
                    label_schema_json={"classes": ["合格", "破损", "模糊"]},
                    total_samples=source.sample_count,
                    dataset_path=source.dataset_path,
                )
                self._mark_created(label_dataset, user, now)
                session.add(label_dataset)
                await session.flush()
                counters["created"] += 1
            existing_task = await self._one(session, LabelTask, LabelTask.biz_type == "machine_learning", LabelTask.label_dataset_id == label_dataset.id, LabelTask.task_type == task_type, LabelTask.tenant_id == TENANT_ID)
            if existing_task:
                counters["skipped"] += 1
                continue
            task = LabelTask(
                biz_type="machine_learning",
                task_type=task_type,
                description="演示机器学习标注任务。",
                label_dataset_id=label_dataset.id,
                status=status,
                audit_sampling_ratio=30 if task_type == "multi" else 100,
            )
            self._mark_created(task, user, now)
            session.add(task)
            await session.flush()
            progress = LabelProgress(task_id=task.id, user_id=user.id, assigned_count=source.sample_count, saved_count=1, final_count=1)
            self._mark_created(progress, user, now)
            session.add(progress)
            if task_type == "multi":
                member = LabelTaskMember(task_id=task.id, user_id=user.id, role="annotator", assign_count=source.sample_count, deadline=now)
                self._mark_created(member, user, now)
                session.add(member)
            counters["created"] += 2 if task_type == "online" else 3
        await session.flush()

    async def _ensure_file_management(self, session, llm_project, ml_project, user, now, counters) -> None:
        folder_specs = [
            (llm_project, "showcase-训练样例资产", "训练、评估、推理用演示样例文件。"),
            (ml_project, "showcase-机器学习资产", "机器学习数据、脚本和模型产物演示文件。"),
        ]
        for project, name, description in folder_specs:
            folder = await self._one(session, FileFolder, FileFolder.project_id == project.id, FileFolder.name == name, FileFolder.tenant_id == TENANT_ID)
            if folder:
                counters["skipped"] += 1
            else:
                folder = FileFolder(name=name, description=description, project_id=project.id)
                self._mark_created(folder, user, now)
                session.add(folder)
                await session.flush()
                counters["created"] += 1
            file_specs = [
                ("dataset-preview.jsonl", 2048, "a" * 64, f"builtin-sample://showcase/{project.id}/dataset-preview.jsonl"),
                ("label-schema.json", 1024, "b" * 64, f"builtin-sample://showcase/{project.id}/label-schema.json"),
                ("model-card.md", 512, "c" * 64, f"builtin-sample://showcase/{project.id}/model-card.md"),
            ]
            for file_name, file_size, file_hash, file_path in file_specs:
                existing_file = await self._one(session, FileManagementFile, FileManagementFile.project_id == project.id, FileManagementFile.file_name == file_name, FileManagementFile.folder_id == folder.id, FileManagementFile.tenant_id == TENANT_ID)
                if existing_file:
                    counters["skipped"] += 1
                    continue
                file_row = FileManagementFile(
                    file_name=file_name,
                    file_size=file_size,
                    file_hash=file_hash,
                    file_path=file_path,
                    folder_id=folder.id,
                    project_id=project.id,
                    upload_id=f"showcase-{project.id}-{file_name}",
                )
                self._mark_created(file_row, user, now)
                session.add(file_row)
                counters["created"] += 1
        await session.flush()

    async def _ensure_annotation_services(self, session, project, user, now, counters) -> None:
        specs = [
            ("showcase-文本分类预标注服务", "text", "text_classification", "text_classification_single_label", "测试通过"),
            ("showcase-实体识别预标注服务", "text", "entity_recognition", "entity_recognition", "未测试"),
            ("showcase-图像检测预标注服务", "image", "object_detection", "object_detection_bbox", "测试失败"),
        ]
        for name, data_type, annotation_type, template_type, status in specs:
            existing = await self._one(session, AnnotationServiceModel, AnnotationServiceModel.project_id == project.id, AnnotationServiceModel.name == name, AnnotationServiceModel.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                continue
            row = AnnotationServiceModel(
                name=name,
                description="演示在线标注预标注服务，使用占位 predict 地址。",
                project_id=project.id,
                base_url=f"https://annotation-preview.example.local/{template_type}",
                category="machine_learning",
                data_type=data_type,
                annotation_type=annotation_type,
                template_type=template_type,
                status=status,
            )
            self._mark_created(row, user, now)
            session.add(row)
            counters["created"] += 1
        await session.flush()

    async def _ensure_benchmark_showcase(self, session, project, base_models, k8s, user, now, counters) -> list[BenchmarkTask]:
        dataset_specs = [
            ("showcase-GSM8K数学推理", "showcase_gsm8k", "gsm8k_gen", "gsm8k_datasets", "数学", 120, "math", ["text-generation"]),
            ("showcase-C-Eval中文理解", "showcase_ceval", "ceval_gen", "ceval_datasets", "中文", 180, "knowledge", ["text-generation"]),
            ("showcase-MMBench多模态", "showcase_mmbench", "mmbench_gen", "mmbench_datasets", "多模态", 90, "reasoning", ["image-understanding", "multimodal"]),
        ]
        benchmark_datasets: list[BenchmarkDataset] = []
        for name, code, invoke_name, export_var, language, sample_count, category, model_types in dataset_specs:
            existing_dataset = await self._one(session, BenchmarkDataset, BenchmarkDataset.code == code, BenchmarkDataset.tenant_id == TENANT_ID)
            if existing_dataset:
                counters["skipped"] += 1
                benchmark_datasets.append(existing_dataset)
                continue
            dataset = BenchmarkDataset(
                name=name,
                code=code,
                invoke_name=invoke_name,
                export_var=export_var,
                language=language,
                original_sample_count=sample_count,
                description="演示基准评测数据集。",
                category=category,
                model_types=model_types,
                is_builtin=True,
                sort_order=len(benchmark_datasets) + 100,
            )
            self._mark_created(dataset, user, now)
            session.add(dataset)
            await session.flush()
            counters["created"] += 1
            benchmark_datasets.append(dataset)
        task_specs = [
            ("showcase-基准评测已完成", TaskStatus.COMPLETED.value, 100, base_models[0]),
            ("showcase-基准评测排队中", TaskStatus.PENDING.value, 0, base_models[-1]),
        ]
        tasks: list[BenchmarkTask] = []
        for name, status, progress, model in task_specs:
            existing_task = await self._one(session, BenchmarkTask, BenchmarkTask.project_id == project.id, BenchmarkTask.name == name, BenchmarkTask.tenant_id == TENANT_ID)
            if existing_task:
                counters["skipped"] += 1
                tasks.append(existing_task)
                continue
            task = BenchmarkTask(
                name=name,
                description="演示基准评估任务，覆盖完成和排队状态。",
                project_id=project.id,
                model_type="model",
                inference_params={"temperature": 0.1, "max_tokens": 1024},
                schedule_enabled=False,
                status=status,
                progress=progress,
                lab_k8s_uuid=k8s.name,
                graphics_card_resource={"card_type": "GPU", "card_model": "A800", "count": 1, "card_memory": "80GB", "k8s_resource_type": "nvidia.com/gpu"},
                started_at=now if status != TaskStatus.PENDING.value else None,
                finished_at=now if status == TaskStatus.COMPLETED.value else None,
                result_path="builtin-sample://showcase/benchmark/result.json",
                log_path="builtin-sample://showcase/benchmark/log.txt",
            )
            self._mark_created(task, user, now)
            session.add(task)
            await session.flush()
            model_relation = BenchmarkTaskModelRelation(benchmark_task_id=task.id, model_id=model.id, model_name=model.name, model_version="v1", model_type="model", sort_order=0)
            self._mark_created(model_relation, user, now)
            session.add(model_relation)
            for dataset in benchmark_datasets:
                dataset_relation = BenchmarkTaskDatasetRelation(benchmark_task_id=task.id, dataset_code=dataset.code, invoke_name=dataset.invoke_name, export_var=dataset.export_var)
                self._mark_created(dataset_relation, user, now)
                session.add(dataset_relation)
                if status == TaskStatus.COMPLETED.value:
                    result = BenchmarkResult(benchmark_task_id=task.id, model_id=model.id, model_name=model.name, model_version="v1", dataset_code=dataset.code, score=82.5 - len(tasks))
                    self._mark_created(result, user, now)
                    session.add(result)
            if status == TaskStatus.COMPLETED.value:
                leaderboard = BenchmarkLeaderboard(
                    project_id=project.id,
                    model_id=model.id,
                    model_name=model.name,
                    model_version="v1",
                    average_score=82.0,
                    dataset_scores={dataset.code: 82.0 for dataset in benchmark_datasets},
                    last_task_id=task.id,
                    last_evaluated_at=now,
                )
                self._mark_created(leaderboard, user, now)
                session.add(leaderboard)
            counters["created"] += 2 + len(benchmark_datasets) + (len(benchmark_datasets) + 1 if status == TaskStatus.COMPLETED.value else 0)
            tasks.append(task)
        await session.flush()
        return tasks

    async def _ensure_image_build_logs(self, session, llm_project, ml_project, notebooks, repository_images, k8s, user, now, counters) -> None:
        notebook = notebooks[0] if notebooks else None
        base_image = repository_images[0].image if repository_images else "harbor-preview.example.local/deepexilab/pytorch:2.3-cuda12.1"
        specs = [
            (llm_project, "showcase-Notebook镜像构建成功", TaskStatus.COMPLETED.value, "auto"),
            (ml_project, "showcase-ML Notebook镜像构建中", TaskStatus.RUNNING.value, "manual"),
            (llm_project, "showcase-推理镜像构建失败", TaskStatus.FAILED.value, "manual"),
        ]
        for project, name, status, trigger_type in specs:
            existing = await self._one(session, ImageBuildLog, ImageBuildLog.project_id == project.id, ImageBuildLog.name == name, ImageBuildLog.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                continue
            row = ImageBuildLog(
                name=name,
                project_id=project.id,
                business_id=notebook.id if notebook else 0,
                business_name=notebook.instance_name if notebook else "showcase-notebook",
                base_image=base_image,
                output_image=f"harbor-preview.example.local/deepexilab/{name}:v1",
                output_image_id=repository_images[0].id if repository_images else None,
                image_type=0,
                trigger_type=trigger_type,
                status=status,
                lab_k8s_uuid=k8s.name,
                log_path=f"builtin-sample://showcase/image-build/{name}.log",
                snapshot_id=f"showcase-snapshot-{project.id}",
                describe="演示镜像构建记录。",
            )
            self._mark_created(row, user, now)
            session.add(row)
            counters["created"] += 1
        await session.flush()

    async def _ensure_task_executions(self, session, training_tasks, inference_results, evaluation_tasks, processing_tasks, benchmark_tasks, inference_tasks, user, now, counters) -> None:
        specs: list[tuple[str, int, str, str, str]] = []
        specs.extend((TaskExecutionBusinessType.TRAINING_TASK.value, task.id, task.status, TaskExecutionExecutor.TRAINING_TASK.value, "start") for task in training_tasks)
        specs.extend((TaskExecutionBusinessType.INFERENCE_RESULT_DATASETS.value, item.id, item.status, TaskExecutionExecutor.INFERENCE_RESULT_DATASETS.value, "start") for item in inference_results if item.usage == "default-inference")
        specs.extend((TaskExecutionBusinessType.BUSINESS_INFERENCE_RESULT_DATASETS.value, item.id, item.status, TaskExecutionExecutor.BUSINESS_INFERENCE_RESULT_DATASETS.value, "start") for item in inference_results if item.usage == "business-inference")
        specs.extend((TaskExecutionBusinessType.EVALUATION_TASK.value, task.id, task.status, TaskExecutionExecutor.EVALUATION_TASK.value, "start") for task in evaluation_tasks)
        specs.extend((TaskExecutionBusinessType.DATA_CLEANING_TASK.value, task.id, task.status, TaskExecutionExecutor.DATA_CLEANING.value, "start") for task in processing_tasks if isinstance(task, DataCleaningTask))
        specs.extend((TaskExecutionBusinessType.BENCHMARK_TASK.value, task.id, task.status, TaskExecutionExecutor.BENCHMARK_TASK.value, "start") for task in benchmark_tasks)
        specs.extend(("inference_task", task.id, task.status, "inference_task", "start") for task in inference_tasks)
        for business_type, business_id, business_status, executor, method in specs:
            existing = await self._one(session, TaskExecution, TaskExecution.business_type == business_type, TaskExecution.business_id == business_id, TaskExecution.tenant_id == TENANT_ID)
            if existing:
                counters["skipped"] += 1
                continue
            execution_status = TaskExecutionStatus.PENDING.value
            if business_status in (TaskStatus.RUNNING.value, "processing"):
                execution_status = TaskExecutionStatus.RUNNING.value
            elif business_status == TaskStatus.COMPLETED.value:
                execution_status = TaskExecutionStatus.DONE.value
            elif business_status == TaskStatus.FAILED.value:
                execution_status = TaskExecutionStatus.FAILED.value
            row = TaskExecution(
                business_type=business_type,
                business_id=business_id,
                schedule_at=None,
                status=execution_status,
                executor=executor,
                method=method,
                kwargs={"showcase": True},
                retry_count=1 if execution_status == TaskExecutionStatus.FAILED.value else 0,
                max_retry=3,
                last_error="演示失败任务：等待人工重试。" if execution_status == TaskExecutionStatus.FAILED.value else None,
                locked_at=now if execution_status == TaskExecutionStatus.RUNNING.value else None,
                locked_by="showcase-worker" if execution_status == TaskExecutionStatus.RUNNING.value else None,
            )
            self._mark_created(row, user, now)
            session.add(row)
            counters["created"] += 1
        await session.flush()
