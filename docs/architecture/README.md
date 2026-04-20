# Architecture

本目录用于记录当前项目的实现结构，而不是历史阶段的目标结构。

## 当前建议优先补充的主题

- `app-shell.md`
  顶部双 Tab、项目空间、系统管理、侧栏切换逻辑
- `routing.md`
  路由入口、默认页、项目上下文建立方式
- `state-and-services.md`
  `permissionStore`、`dataServiceStore`、本地后端与 API 边界
- `design-doc-panel.md`
  页面右侧需求文档侧板的运行方式与约束
- `frontend-conventions.md`
  当前前端技术约定、组织方式、页面开发边界
- `api-boundaries.md`
  本地服务层、最小后端和接口契约边界

## 写作原则

- 记录“现在代码是怎么工作的”
- 不写已经失效的第一阶段假设
- 如果某项结构正在迭代中，要明确写“当前实现”和“计划方向”
- 避免把源码逐行翻译成文档，优先解释结构决策和边界
