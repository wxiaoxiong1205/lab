# lab-coding

DeepexiLab 平台持续迭代开发工作仓库。

## 当前阶段

本仓库已经完成第一阶段“基于生产环境的标准能力补齐与高保真还原”。

当前进入第二阶段，默认工作模式为：

- 以当前仓库已验收结果为新的实现基线
- 以用户每一轮新增需求、截图、原型、草图和交互说明为主要驱动
- 持续进行信息架构调整、功能扩展、交互优化和受控重构
- 保持项目始终可运行、可构建、可部署

## 第二阶段默认原则

- 用户当前明确需求优先于历史阶段结论
- 用户提供的截图、参考图和交互说明优先于第一阶段生产环境基线
- 当前代码是第二阶段默认实现基线
- 第一阶段探索报告、生产环境拆解和历史交付文档只作为背景材料，不再作为默认执行依据
- 页面右侧内嵌需求文档仍然是正式协作结构的一部分

## AI 协作入口

后续 AI coding 请优先阅读：

- [AGENTS.md](./AGENTS.md)
- [docs/ai/phase2-operating-guide.md](./docs/ai/phase2-operating-guide.md)
- [docs/ai/production-review-template.md](./docs/ai/production-review-template.md)
- [docs/ai/module-delivery-template.md](./docs/ai/module-delivery-template.md)
- [docs/ai/page-design-doc-template.md](./docs/ai/page-design-doc-template.md)

说明：

- `production-review-template.md` 在第二阶段中表示“需求拆解 / 迭代规划模板”
- `module-delivery-template.md` 表示“功能实现与交付模板”
- 第一阶段的 `production-review-round1.md`、`module-delivery-data-service-round*.md`、`next-phase-module-plan.md` 都属于历史归档

## 仓库结构

- `fastdata-llm-training/`
  主应用工程
- `docs/ai/`
  AI coding 协作模板与阶段指南
- `screenshots/`
  历史截图与参考资料
- `PRD.md`
  历史产品资料，仅作背景参考

## 当前开发方式

第二阶段默认工作顺序：

1. 先读当前需求
2. 再读相关代码和文档
3. 如果有截图，先拆截图与交互
4. 输出影响范围和方案
5. 再开发
6. 同步页面内嵌需求文档
7. 构建与自检

只有在用户明确要求时，才重新回到“参考生产环境”的模式。

## 本地开发

```bash
cd fastdata-llm-training
npm install
npm run dev
```

## 构建

```bash
cd fastdata-llm-training
npm run build
```
