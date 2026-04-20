# Project Space

## 当前定位

项目空间是第二阶段新的默认入口层。

## 负责内容

- 登录后展示用户可访问项目
- 点击项目卡片建立当前项目上下文
- 将用户引导到项目概览与项目内业务菜单

## 相关页面

- [ProjectSpace.tsx](../../fastdata-llm-training/src/pages/ProjectSpace.tsx)
- [Home.tsx](../../fastdata-llm-training/src/pages/Home.tsx)
- [AppLayout.tsx](../../fastdata-llm-training/src/components/Layout/AppLayout.tsx)

## 当前约束

- 项目空间不是系统管理
- 项目空间不是业务列表页
- 未进入项目时，不展示项目业务菜单

## 当前关键决策

### 登录后不自动进入项目

当前实现中，登录或切换身份后不会自动跳入某个项目，而是回到项目空间页，由用户点击项目卡片显式进入项目。

### 点击项目卡片后建立上下文

项目空间页不只是“查看项目列表”，而是承担建立当前项目上下文的职责。

进入项目后：

- `currentProjectId` 被写入权限状态层
- 项目内业务菜单开始显示
- 项目概览页成为项目内默认页

### 项目空间和项目管理不是同一页

- `项目空间`
  用户入口层，偏使用态
- `项目管理`
  系统管理域的一部分，偏治理态

## 待补充

- 卡片字段规范
- 默认排序和搜索规则
- 项目进入后的跳转策略
