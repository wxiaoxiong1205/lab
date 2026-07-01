# Production Baseline Readiness

本文用于说明 `lab-coding` 生产代码替换阶段的当前收口状态，以及后续 DeepexiLab 2.0 开发从哪里继续。

## Current Baseline

- Production frontend: `production/frontend`
  - Main app: `production/frontend/apps/lab`
  - Source recorded in `docs/migration/production-source-inventory.md`
  - Nested production `.git` metadata has been removed; root `lab-coding` Git is the only repository boundary.
- Production backend: `production/backend`
  - Main app: `production/backend/app`
  - Source recorded in `docs/migration/production-source-inventory.md`
  - Local-only keys and environment files are ignored and are not tracked by Git.
- 1.0 Demo archive: `archive/1.0-demo`
  - Used only as V1.14 behavior reference and historical context.
  - Demo localStorage stores, mock APIs, and local permission models are not production baselines.
- DeepexiLab 2.0 planning: `planning/2.0`
  - Used as the next-stage product input after production baseline work.
  - 2.0 work must start from `production/frontend` and `production/backend`.

## V1.14 Migration Status

The authoritative V1.14 tracking artifact is `docs/migration/v1.14-coverage-matrix.md`.

Completed production-aligned migrations include:

- Dataset version merge for training, validation, test, and machine-learning datasets.
- Dataset deletion reference protection through production backend checks and frontend pre-checks.
- Large-model training detail now treats training method as a version-scoped field and shows it per task version.
- GRPO / RFT-GRPO training method, parameters, templates, reward function upload, template snapshots, and staged Hand/Work/Submit resources.
- Inference import usage split for SFT, DPO, RFT-GRPO, and image understanding.
- Inference import samples for DPO alpaca, DPO role-based, and RFT-GRPO completion-reward.
- Model and online inference service deletion reference protection through backend hard guards.
- Right-bottom `需求文档 / 需求评审` carried into the production frontend shell and page docs.
- Large-model and system-management coverage review, including production baseline evidence for training, model management, inference services, API services, system settings, project/user/member management, storage, cluster, registry, and permission middleware.

## Remaining Boundary

The only current migration candidate in the coverage matrix is system-management permission resource scope.

Current conclusion:

- Production already supports tenant-admin bypass, platform admin, project admin, menu visibility, URL/API permission matching, project scope checks, and unified 403 responses.
- The V1.14 Demo had a local dynamic role model with operation trees, personal/all resource scopes, and creator-based checks.
- That Demo model must not be copied into production because it is localStorage/mock driven and not backed by production IAM or resource-owner contracts.
- If personal/all resource scope becomes a hard V1.14 acceptance item, it should be implemented as a formal production IAM/resource-owner feature with backend enforcement, API contracts, frontend operation states, and migration tests.

This is a product/backend design dependency, not an implementation item that can be safely completed by moving Demo code.

## Local Preview Menu Boundary

Production Lab does not keep the full tenant menu tree as static frontend code. In production, the backend `production/backend/app/api/v1/menu.py` reads the application menu from the external console/IAM endpoint `/v1/menu/{app_id}/appMenu`, then the frontend renders project-space, system-management, large-model, and machine-learning navigation from that response.

The local preview environment has no real console/IAM token or tenant menu data, so `production/frontend/apps/lab/src/services/api.ts` falls back to `production/frontend/apps/lab/src/mock/mockMenuData.ts` when `/menu` is unavailable or malformed. That fallback menu must mirror the production route structure closely enough for local preview. If it is incomplete, modules can appear missing locally even when production frontend routes and backend APIs are present.

Current local fallback coverage has been aligned to the user-provided `菜单数据 (3).xlsx` export and includes:

- `首页`
- `大模型`: task overview, data services, data management, data processing, Notebook, large-model training, model management, model evaluation, and model services.
- `机器学习`: task overview, data management, data annotation, model management, model deployment, Notebook, and online annotation service.
- `系统管理`: projects, Kubernetes, storage, registry, model repository, and system settings.

This fixes local preview navigation only. It does not replace the production IAM menu source, and it should not be treated as the authoritative production menu.

## Development Rules From Here

- Treat `production/frontend` and `production/backend` as the only active application baselines.
- Use `archive/1.0-demo` only to understand V1.14 gaps or historical UX intent.
- Before starting a 2.0 task, check:
  - `AGENTS.md`
  - `docs/migration/v1.14-coverage-matrix.md`
  - `docs/migration/production-baseline-readiness.md`
  - the relevant `planning/2.0` PRD/prototype files
- Any future V1.14 gap must be:
  - recorded in the coverage matrix,
  - adapted to production architecture,
  - reflected in right-bottom page docs when it changes user-facing behavior,
  - committed independently.

## Verification Snapshot

Recent verification completed during the migration:

- `git status --short --branch` shows a clean branch after the latest migration commit.
- `git -c core.whitespace=cr-at-eol diff --check` passed for recent migration changes.
- Frontend TypeScript checks passed for changes touching `production/frontend/apps/lab`.
- Backend `py_compile` checks passed for changed backend modules.
- Inference sample assets were structurally validated for JSON, JSONL, ZIP, and XLSX packaging.

Known environment limitation:

- A full backend parser import smoke test could not run in the local Python environment because `pytz` is not installed locally. Backend syntax compilation still passed, and sample file structure was validated without installing dependencies.
