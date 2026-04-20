# App Shell

## 当前定位

当前应用壳层已经切换到第二阶段的信息架构：

- 登录后默认进入 `项目空间`
- 顶部主导航只保留：
  - `项目空间`
  - `系统管理`
- 用户点击项目卡片后，才进入项目内业务域
- 系统管理与项目业务菜单已经拆成两套导航域

## 当前关键文件

- [App.tsx](../../fastdata-llm-training/src/App.tsx)
- [AppLayout.tsx](../../fastdata-llm-training/src/components/Layout/AppLayout.tsx)
- [ProjectSpace.tsx](../../fastdata-llm-training/src/pages/ProjectSpace.tsx)
- [Home.tsx](../../fastdata-llm-training/src/pages/Home.tsx)

## 当前已知结构

- `项目空间`
  用作项目入口页，负责展示当前账号可访问项目
- `项目概览`
  在点击项目后建立上下文，作为项目内默认页
- `系统管理`
  作为平台级菜单域，不和项目业务菜单混排

## 当前待持续演进点

- 项目空间页视觉和交互还会继续根据截图迭代
- 项目内业务路由当前仍是扁平路径，后续可能继续演化
- 系统管理页的视觉风格仍需要进一步统一
