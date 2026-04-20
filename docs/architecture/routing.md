# Routing

## 当前路由入口

主路由定义在：

- [App.tsx](../../fastdata-llm-training/src/App.tsx)

当前应用使用 `react-router-dom` 的声明式路由，没有独立的文件系统路由约定。

## 顶层入口决策

### 默认入口改为项目空间

当前默认入口为：

- `/` -> `/workspace`

这是第二阶段的重要壳层决策，目的不是“展示一个更好看的首页”，而是把原来的“先进入平台，再选项目”改成：

1. 登录后先进入项目空间
2. 查看当前账号有权限访问的项目
3. 点击项目后建立当前项目上下文
4. 再进入项目内业务域

### 项目概览与项目空间分离

- `/workspace`
  项目空间列表页
- `/home`
  项目概览页

这两个页面语义不同：

- `项目空间` 负责选项目
- `项目概览` 负责进入项目后的概览和快捷入口

## 当前路由分域

### 项目空间域

- `/workspace`
- `/home`
- 数据服务、模型训练、模型评估、模型服务、机器学习相关业务路由

这些页面都属于“项目内业务域”，虽然目前路径仍是扁平的，但访问控制上已经被视为必须先建立项目上下文。

### 系统管理域

- `/admin/projects`
- `/admin/kubernetes`
- `/admin/storage`
- `/admin/registry`
- `/admin/base-model`
- `/admin/settings`
- `/admin/permissions`

这些路由不依赖项目上下文，作为平台级管理域存在。

### 文档中心域

- `/docs`
- `/docs/usage-guide`

文档中心仍然是应用内辅助域，不属于生产业务菜单的一部分。

## 访问控制规则

当前路由访问规则由：

- [permissionCatalog.ts](../../fastdata-llm-training/src/services/permissionCatalog.ts)
- [permissionStore.ts](../../fastdata-llm-training/src/services/permissionStore.ts)

共同驱动。

### 当前判断逻辑

每条路由会被映射到一个 `menuKey`，并声明是否需要项目上下文：

- `requiresProject: false`
  适用于项目空间、系统管理、文档中心等入口层页面
- `requiresProject: true`
  适用于数据服务、训练、评估、部署、机器学习等项目内页面

当访问需要项目上下文的页面时，如果当前 `currentProjectId` 为空，则统一拦截并返回“请先进入项目空间”。

## 当前结构的优点

- 先分清平台级入口与项目级入口
- 让后续“项目卡片 -> 项目内工作域”的体验可持续演进
- 不需要一次性把所有业务路由都改造成嵌套路径

## 当前限制

- 项目内业务路由仍是扁平路径，而不是 `/workspace/project/:projectId/...`
- 浏览器地址层面还不能直接体现“当前项目”的路径语义
- 后续如果需要更强的项目隔离和分享能力，可能需要引入显式项目路径段

## 后续建议

若未来继续做第二轮壳层升级，推荐优先评估：

1. 是否将项目内业务页迁移到带项目 id 的嵌套路由
2. 是否把系统管理默认页做成独立欢迎页而不是直接落到项目管理
3. 是否把文档中心的返回逻辑统一抽到壳层级别处理
