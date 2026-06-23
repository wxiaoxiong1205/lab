# Large Model And System Management Coverage Review

This document records the production-code review for the V1.14 production-baseline transition. It focuses on the areas the user called out after the dataset and machine-learning migration work: large-model capabilities and system management.

## Review Scope

- Production frontend: `production/frontend/apps/lab`.
- Production backend: `production/backend/app`.
- Demo reference only when a V1.14 gap is found: `archive/1.0-demo/app`.
- Coverage matrix: `docs/migration/v1.14-coverage-matrix.md`.

## Large Model Production Map

Status: `production-covered` for the main chain, with V1.14 gap checks still required for GRPO and resource reference protection.

Production frontend evidence:

- Training:
  - `production/frontend/apps/lab/src/pages/SimpleFinetuneTraining.tsx`
  - `production/frontend/apps/lab/src/pages/CreateFinetuneRun.tsx`
  - `production/frontend/apps/lab/src/pages/CreateFinetuneTask.tsx`
  - `production/frontend/apps/lab/src/pages/FinetuneTaskDetail.tsx`
  - `production/frontend/apps/lab/src/pages/trainingTaskDetail.tsx`
  - `production/frontend/apps/lab/src/services/FinetuneTrainingServices.ts`
  - `production/frontend/apps/lab/src/services/trainingApi.ts`
- Base model and trained model management:
  - `production/frontend/apps/lab/src/pages/baseModel/index.tsx`
  - `production/frontend/apps/lab/src/pages/BaseModelLogsPage.tsx`
  - `production/frontend/apps/lab/src/pages/ModelList.tsx`
  - `production/frontend/apps/lab/src/pages/ModelDetail.tsx`
  - `production/frontend/apps/lab/src/pages/modalCreateVersion.tsx`
  - `production/frontend/apps/lab/src/pages/ModelLogsPage.tsx`
  - `production/frontend/apps/lab/src/components/models/CreateModelPage.tsx`
  - `production/frontend/apps/lab/src/services/modelsApi.ts`
  - `production/frontend/apps/lab/src/services/baseModelLogsapi.ts`
- Inference result dataset and model/service selection:
  - `production/frontend/apps/lab/src/pages/inference/CreateInferenceResultSetPage.tsx`
  - `production/frontend/apps/lab/src/components/inference/*`
  - `production/frontend/apps/lab/src/services/inferenceApi.ts`
  - `production/frontend/apps/lab/src/services/inferenceDatasets.ts`
- Online inference and API service:
  - `production/frontend/apps/lab/src/pages/service/LLMService.tsx`
  - `production/frontend/apps/lab/src/pages/service/LLMInferenceService.tsx`
  - `production/frontend/apps/lab/src/pages/service/DeployServicePage.tsx`
  - `production/frontend/apps/lab/src/pages/service/InferenceServiceDetail.tsx`
  - `production/frontend/apps/lab/src/pages/apiService/index.tsx`
  - `production/frontend/apps/lab/src/pages/apiService/CreateApiService.tsx`
  - `production/frontend/apps/lab/src/pages/OpenApiAccessKey/index.tsx`
  - `production/frontend/apps/lab/src/services/apiService.ts`
  - `production/frontend/apps/lab/src/services/openapiApplicationService.ts`

Production backend evidence:

- Training task API, schema, service, model, task, executor:
  - `production/backend/app/api/v1/training_task.py`
  - `production/backend/app/schemas/training_task.py`
  - `production/backend/app/services/training_task/*`
  - `production/backend/app/models/training_task_manager.py`
  - `production/backend/app/tasks/training_tasks.py`
  - `production/backend/app/executors/training_task_executor.py`
- Model management:
  - `production/backend/app/api/v1/model.py`
  - `production/backend/app/schemas/model.py`
  - `production/backend/app/services/model/*`
  - `production/backend/app/models/model_manager.py`
  - `production/backend/app/tasks/model_storage_tasks.py`
  - `production/backend/app/executors/model_executor.py`
- Inference, evaluation, benchmark, and API service:
  - `production/backend/app/api/v1/inference_task.py`
  - `production/backend/app/api/v1/inference_result.py`
  - `production/backend/app/api/v1/business_inference_result_dataset.py`
  - `production/backend/app/api/v1/online_inference_service.py`
  - `production/backend/app/api/v1/openapi_application.py`
  - `production/backend/app/api/v1/evaluation_task.py`
  - `production/backend/app/api/v1/benchmark_task.py`
  - `production/backend/app/services/inference_task/*`
  - `production/backend/app/services/inference_result/*`
  - `production/backend/app/services/business_inference_result_dataset/*`
  - `production/backend/app/services/openapi_application/*`
  - `production/backend/app/tasks/service/inference/*`
  - `production/backend/app/tasks/service/evaluation/*`
  - `production/backend/app/tasks/service/benchmark/*`

Main route evidence:

- Project routes include training, finetune task detail, service/inference, API service, and API access key in `production/frontend/apps/lab/src/routes/index.tsx`.
- Backend routers are included in `production/backend/app/main.py`.

V1.14 checks:

- `partial-conflict`: GRPO / RFT-GRPO data purpose, parameters, template management, reward function upload, and version-detail YAML display.
- `partial-conflict`: inference data selection split by SFT, DPO, RFT-GRPO, image understanding, and business inference scenarios.
- `partial-conflict`: model/service reference protection before deletion has been migrated into production backend guards. `DefaultModelService` blocks deletion of base models, trained models, and machine-learning models when referenced by training tasks, trained-model outputs, deployment tasks, inference result datasets, evaluation tasks, evaluation reports, or benchmark tasks. `DefaultInferenceServiceService.delete` blocks online inference service deletion when referenced by inference result datasets, evaluation tasks, evaluation reports, benchmark tasks, or automatic annotation configuration. The Demo localStorage reference table was not migrated.

## System Management Production Map

Status: `production-covered` for the main management chain, with V1.14 gap checks still required for dynamic data scope and rejection feedback.

Production frontend evidence:

- Platform and user management:
  - `production/frontend/apps/lab/src/pages/platformManagement/index.tsx`
  - `production/frontend/apps/lab/src/pages/platformManagement/components/AddPlatformAdminModal.tsx`
  - `production/frontend/apps/lab/src/pages/AdminProjectList.tsx`
  - `production/frontend/apps/lab/src/pages/AdminUserList.tsx`
  - `production/frontend/apps/lab/src/pages/AdminProjectMemberManagement.tsx`
  - `production/frontend/apps/lab/src/pages/ProjectMemberManagement.tsx`
  - `production/frontend/apps/lab/src/components/ProjectMemberManagerComponent.tsx`
  - `production/frontend/apps/lab/src/components/project/ProjectFormModal.tsx`
- Resource configuration:
  - `production/frontend/apps/lab/src/pages/KubernetesManagement.tsx`
  - `production/frontend/apps/lab/src/pages/StorageConfigList.tsx`
  - `production/frontend/apps/lab/src/pages/RegistryConfigList.tsx`
  - `production/frontend/apps/lab/src/pages/RegistryConfigForm.tsx`
  - `production/frontend/apps/lab/src/pages/RegistryMirrorList.tsx`
  - `production/frontend/apps/lab/src/pages/RegistryMirrorForm.tsx`
  - `production/frontend/apps/lab/src/components/storage/StorageClusterBindingModal.tsx`
  - `production/frontend/apps/lab/src/components/storage/StorageClusterMappingManager.tsx`
  - `production/frontend/apps/lab/src/components/registry/RegistryClusterBindingModal.tsx`
- System settings:
  - `production/frontend/apps/lab/src/pages/systemManage/systemSetting/AdminSystemSettings.tsx`
  - `production/frontend/apps/lab/src/pages/systemManage/systemSetting/AttributeSetting.tsx`
  - `production/frontend/apps/lab/src/pages/systemManage/systemSetting/TagsSetting.tsx`
  - `production/frontend/apps/lab/src/hooks/system/systemSetting.ts`
  - `production/frontend/apps/lab/src/services/tagsServie.ts`

Production backend evidence:

- Admin, user, menu, project, and permission:
  - `production/backend/app/api/v1/admin_permissions.py`
  - `production/backend/app/api/v1/user.py`
  - `production/backend/app/api/v1/menu.py`
  - `production/backend/app/api/v1/project.py`
  - `production/backend/app/schemas/permission.py`
  - `production/backend/app/schemas/role.py`
  - `production/backend/app/schemas/user.py`
  - `production/backend/app/services/permission/*`
  - `production/backend/app/services/user/*`
  - `production/backend/app/services/project/*`
  - `production/backend/app/middleware/permission_middleware.py`
- Resource configuration:
  - `production/backend/app/api/v1/k8s.py`
  - `production/backend/app/api/v1/storage.py`
  - `production/backend/app/api/v1/repository.py`
  - `production/backend/app/api/v1/repository_image.py`
  - `production/backend/app/services/k8s/*`
  - `production/backend/app/services/storage/*`
  - `production/backend/app/services/repository/*`
  - `production/backend/app/services/repository_image/*`
  - `production/backend/app/managers/k8s_status_manager.py`
  - `production/backend/app/tasks/sync_k8s_labels.py`
- Attributes and tags:
  - `production/backend/app/api/v1/business_attr.py`
  - `production/backend/app/api/v1/tag.py`
  - `production/backend/app/schemas/business_attr.py`
  - `production/backend/app/schemas/tag.py`
  - `production/backend/app/services/business_attr/*`
  - `production/backend/app/services/tag/*`

Main route evidence:

- Admin routes for projects, users, members, storage, Kubernetes, registry, platform administrators, base model, and settings are registered in `production/frontend/apps/lab/src/routes/index.tsx`.
- Backend routers for user, menu, project, k8s, repository, storage, repository image, admin permissions, business attributes, and tags are included in `production/backend/app/main.py`.

Open V1.14 checks:

- `partial-conflict`: production supports platform admin, project admin, menu visibility, URL permission matching, and project scope checks, but Demo had a local dynamic role/data-scope model. Do not copy the Demo model; check only whether V1.14 acceptance explicitly requires dynamic role configuration beyond production IAM.
- `partial-conflict`: permission rejection UX and resource-scope hints need route-level smoke checks.
- `partial-conflict`: the GRPO template-management tab now belongs under production system settings and has been adapted to the production `training_parameter_templates` backend instead of the Demo localStorage template center.

## Current Handling Decision

- Large-model and system-management production code is present and should remain the baseline.
- Machine-learning work received more early migration activity because concrete V1.14 gaps were found there first; large-model and system-management gaps are now being migrated module by module on the same branch.
- Completed V1.14 large-model/system-management migrations include GRPO training parameter templates under system settings, inference import usage split, and model/service deletion reference guards.
- Remaining migration work should focus on permission resource scope against production IAM and only migrate missing V1.14 behavior.
