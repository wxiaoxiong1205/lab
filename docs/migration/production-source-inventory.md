# DeepexiLab Production Source Inventory

本文件记录本次纳入 `lab-coding` 总仓库管理的生产代码来源。生产代码原本带有独立 `.git` 目录；导入总仓库时已移除嵌套 Git 元数据，后续按 `lab-coding` 根仓库统一提交。

## Frontend

- Current path: `production/frontend`
- Original path: `Project/deepexi-lab-web`
- Original repository: `https://gitlab.deepexi.com/modelhub/deepexilab/deepexi-lab-web.git`
- Original branch: `lab/version/v1.14.0`
- Original commit: `1629242bc168a42610173859c0146f77e5277333`
- Main app: `production/frontend/apps/lab`
- Stack: pnpm workspace, Vite, React 18, TypeScript, Ant Design 5, Zustand, React Router.
- Imported large-model modules include training task pages, fine-tune task pages, base model management, LLM model management, hosted/external inference service pages, API service pages, OpenAPI access key pages, Notebook pages, and evaluation pages.
- Imported admin/system modules include platform administrator management, project/user/member management, Kubernetes/storage/registry configuration, base model logs, and system settings for business attributes and tags.

## Backend

- Current path: `production/backend`
- Original path: `Project/lab`
- Original repository: `https://gitlab.deepexi.com/modelhub/deepexilab/lab.git`
- Original branch: `version/v1.14.0`
- Original commit: `e6e548732212b5b61db0f90a58a7244415f09768`
- Main app: `production/backend/app`
- Stack: FastAPI, SQLAlchemy-style model/repository/service layering, Celery tasks, scheduled managers, Kubernetes task executors.
- Imported large-model APIs include `training_task.py`, `model.py`, `inference_task.py`, `online_inference_service.py`, `evaluation_task.py`, `manual_evaluation_task.py`, `benchmark_task.py`, `notebook.py`, `openapi_application.py`, and related schema/service/repository modules.
- Imported admin/system APIs include `admin_permissions.py`, `user.py`, `menu.py`, `project.py`, `storage.py`, `k8s.py`, `repository.py`, `repository_image.py`, `business_attr.py`, `tag.py`, `operator_log.py`, and permission/user/menu service modules.

## Import Notes

- `ssh_host_key`, `ssh_host_key.pub`, `.env`, and `.env.*` remain local-only and are intentionally excluded from the root repository import.
- Production source should be treated as the new implementation baseline for DeepexiLab 1.x continuation and DeepexiLab 2.0 development.
- V1.14 items not covered by production source are tracked separately in `docs/migration/v1.14-coverage-matrix.md`.
