# DeepexiLab 1.0 Demo Archive

本目录保存生产代码替换前的 1.0 Demo 实现。

## Contents

- `app`：原 `fastdata-llm-training`，包含前端 Demo、本地 mock 后端和 V1.14 阶段页面内需求文档能力。
- `notes`：Demo 阶段的需求、权限、排查和实现记录。

## Usage

本目录不再作为主开发入口。后续只用于：

- 盘点 V1.14 需求中生产代码未覆盖的能力。
- 迁移右下角“需求评审 / 需求文档”能力。
- 回看 1.0 Demo 的交互、mock 数据和历史验收口径。

迁移时必须按 `production/frontend` 和 `production/backend` 的生产代码规范重写或适配，不允许整段照搬 Demo 架构。
