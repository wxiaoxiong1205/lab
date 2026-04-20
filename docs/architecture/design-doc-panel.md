# Design Doc Panel

## 当前定位

页面右侧需求文档侧板是当前项目的正式结构，不是临时辅助层。

它的作用不是展示静态仓库文档，而是：

- 让页面效果与需求说明并行出现
- 支持产品和开发在运行态快速记录需求
- 让当前页面的结构、字段、状态和变更有可见说明

## 当前关键实现

### 入口组件

- [DesignDocFab.tsx](../../fastdata-llm-training/src/components/DesignDoc/DesignDocFab.tsx)
- [DesignDocPanel.tsx](../../fastdata-llm-training/src/components/DesignDoc/DesignDocPanel.tsx)

### 路由文档映射

- [pageDocs.ts](../../fastdata-llm-training/src/docs/pageDocs.ts)

### 壳层集成点

- [AppLayout.tsx](../../fastdata-llm-training/src/components/Layout/AppLayout.tsx)

## 当前运行方式

- 右下角浮动按钮负责展开 / 收起
- 展开时优先推挤主内容区，而不是完全遮挡
- 面板的展开状态保存在浏览器本地
- 页面文档内容来自 `pageDocs.ts` 的默认定义
- 运行态编辑内容保存在浏览器本地，不自动回写仓库文件

## 当前协作约定

### 1. 页面改动必须同步侧板

只要页面发生以下变化，就要同步更新侧板：

- 布局
- 字段
- 状态
- 操作
- 路由
- 交互
- 信息架构

### 2. `pageDocs.ts` 是默认文档基线

它不是运行态存储，但它决定：

- 新页面首次打开时的默认文档内容
- 当前页面对应的基础说明

### 3. 仓库文档和运行态文档不是强同步关系

运行态侧板优先服务使用过程中的记录行为，仓库文档优先服务 AI 和长期知识沉淀。

## 当前建议

- 如果页面结构大改，优先先更新 `pageDocs.ts`
- 如果需求是截图驱动的改版，文档里要明确记录“旧结构 -> 新结构”
- 如果后续侧板字段继续增多，可以再考虑把文档定义从单文件映射拆成按页面分文件管理
