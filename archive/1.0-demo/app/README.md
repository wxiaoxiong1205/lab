# fastdata-llm-training

当前仓库中的主应用工程。

## 当前定位

该工程已经不再处于“按生产环境逐模块复刻”的第一阶段，而是进入第二阶段持续迭代开发模式：

- 当前代码作为新的实现基线
- 后续功能和页面调整以用户最新需求、截图、原型为主
- 继续保持前端、数据层、接口边界和部署能力的一体化演进

## 开发前必须先看

请先阅读：

- `../AGENTS.md`
- `../docs/ai/phase2-operating-guide.md`
- `../docs/ai/production-review-template.md`
- `../docs/ai/module-delivery-template.md`
- `../docs/ai/page-design-doc-template.md`

## 第二阶段默认规则

- 不再默认先核对生产环境
- 不再默认先做全站差异盘点
- 当前用户需求高于第一阶段历史结论
- 截图与交互参考优先于历史拆解文档
- 页面变更后必须同步检查右侧需求文档侧板

## 技术栈

- React
- TypeScript
- Ant Design
- React Router
- Vite

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```
