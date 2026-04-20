# Frontend Conventions

## 技术栈

当前前端主栈：

- React 19
- TypeScript
- Ant Design 6
- React Router 7
- Vite 8

定义来源：

- [package.json](../../fastdata-llm-training/package.json)

## 代码组织方式

### 页面层

页面按业务域拆在：

- `src/pages/Training`
- `src/pages/Data`
- `src/pages/Evaluation`
- `src/pages/Service`
- `src/pages/MachineLearning`
- `src/pages/Admin`
- `src/pages/Docs`

当前约定是“按业务域分目录，而不是按组件类型或资源类型分目录”。

### 组件层

共享组件集中在：

- `src/components/Layout`
- `src/components/DesignDoc`
- `src/components/Shared`

特殊业务组件按用途独立存在，例如：

- `DatasetSelectModal`
- `RewardRulesConfig`

### 服务层

跨页面共享状态、接口边界和业务规则放在：

- `src/services`

不要把这类逻辑分散写回页面组件中。

## 当前开发约定

### 1. 壳层优先于页面细节

如果需求是信息架构或全局导航变化，优先先改：

- 路由
- 壳层
- 状态上下文
- 菜单结构

然后再改页面细节。

### 2. 页面改动必须同步侧板文档

凡是页面功能、布局、字段、状态、交互变化，都必须同步更新：

- 页面右侧内嵌设计文档
- 对应的 `pageDocs.ts` 说明

### 3. 共享逻辑不回流到页面

以下逻辑默认不应直接散落在页面内部：

- 权限判断
- 当前项目判断
- 任务状态机规则
- 数据服务共享查询和写操作

这些逻辑已经在服务层形成边界，后续应继续沿用。

### 4. 允许本地后端 + 本地持久化共存

当前项目不是“只有前端 mock”也不是“完全真实后端”：

- 某些模块已有本地 JSON + Node HTTP 最小后端
- 其他模块仍是页面本地数据或共享 store

第二阶段允许这种混合状态，但必须明确边界，不要伪装成真实后端已完成。

## UI 与交互约定

### 顶部壳层

- 顶部双 Tab 控制平台域切换
- 右上角保留语言、通知、文档、账户入口

### 左侧菜单

- 左侧菜单应跟随当前导航域变化
- 项目空间未进入项目时，不展示业务菜单
- 系统管理域只展示系统管理菜单

### 页面主内容

- 优先使用足够留白的 B 端卡片布局
- 列表页通常保留搜索、筛选、主按钮、表格或卡片区

## 当前不建议的做法

- 在页面里硬编码“当前项目”而不走 `permissionStore`
- 在每个页面重复实现一套权限判断
- 把新的阶段规则写进页面逻辑里而不是文档或服务层
- 用孤立 mock 覆盖已有共享状态层
