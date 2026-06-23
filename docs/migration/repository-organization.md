# Repository Organization

本次整理后，`lab-coding` 按生产代码、历史 Demo、2.0 规划和迁移文档四类管理。

## Production Baseline

- `production/frontend`：生产前端，来源 `Project/deepexi-lab-web`。
- `production/backend`：生产后端，来源 `Project/lab`。

生产代码已移除嵌套 `.git`，后续由 `lab-coding` 根仓库统一提交。

## Archived Demo

- `archive/1.0-demo/app`：原 `fastdata-llm-training`。
- `archive/1.0-demo/notes`：1.0 Demo 阶段的权限和实现记录。

此目录只作为 V1.14 缺口迁移参考，不再作为主应用。

## DeepexiLab 2.0 Planning

- `planning/2.0`：2.0 PRD、原型、调研、设计方案、系统能力规划和产品语言。

2.0 实施必须基于生产代码继续开发。

## Migration Records

- `docs/migration/production-source-inventory.md`：生产代码来源。
- `docs/migration/v1.14-coverage-matrix.md`：V1.14 覆盖盘点。
- `docs/migration/repository-organization.md`：当前目录组织说明。
