# Docs 知识库

当前项目已进入第二阶段持续迭代开发，`docs/` 目录用于沉淀长期有效的项目知识，而不是只存放临时任务记录。

## 目录结构

- [docs/ai](./ai)
  AI coding 的规则、模板、阶段指南与历史阶段归档
- [docs/architecture](./architecture)
  当前系统的壳层、路由、状态、数据层等结构性说明
- [docs/modules](./modules)
  各业务域 / 模块的持续维护型知识
- [docs/runbooks](./runbooks)
  开发、构建、部署、回归等操作手册
- [docs/history](./history)
  历史阶段资料的归档说明与索引

## 第二阶段文档使用建议

- 长期规则看 [AGENTS.md](../AGENTS.md)
- 每轮需求拆解看 [docs/ai/production-review-template.md](./ai/production-review-template.md)
- 每轮交付记录看 [docs/ai/module-delivery-template.md](./ai/module-delivery-template.md)
- 页面内嵌设计文档参考看 [docs/ai/page-design-doc-template.md](./ai/page-design-doc-template.md)
- 若需要理解当前应用壳层和项目空间结构，优先看 `docs/architecture/`

## 当前推荐优先阅读

- [docs/architecture/app-shell.md](./architecture/app-shell.md)
- [docs/architecture/routing.md](./architecture/routing.md)
- [docs/architecture/state-and-services.md](./architecture/state-and-services.md)
- [docs/architecture/api-boundaries.md](./architecture/api-boundaries.md)
- [docs/architecture/frontend-conventions.md](./architecture/frontend-conventions.md)
- [docs/modules/project-space.md](./modules/project-space.md)
- [docs/modules/system-management.md](./modules/system-management.md)
- [docs/modules/data-services.md](./modules/data-services.md)

## 当前维护原则

- `docs/ai` 负责 AI 协作流程
- `docs/architecture` 负责项目当前实现结构
- `docs/modules` 负责模块级长期知识
- 第一阶段历史资料默认不作为当前开发基线，只作回溯参考
