# State And Services

## 当前状态层

### 权限与项目上下文

- 文件：
  - [permissionCatalog.ts](../../fastdata-llm-training/src/services/permissionCatalog.ts)
  - [permissionStore.ts](../../fastdata-llm-training/src/services/permissionStore.ts)
- 负责：
  - 当前用户
  - 当前项目
  - 菜单权限
  - 操作权限
  - 项目数据权限

### 数据服务共享数据层

- 文件：
  - [dataServiceStore.ts](../../fastdata-llm-training/src/services/dataServiceStore.ts)
  - [dataServiceApi.ts](../../fastdata-llm-training/src/services/dataServiceApi.ts)
  - [dataServiceServer.mjs](../../fastdata-llm-training/server/dataServiceServer.mjs)
- 负责：
  - 训练数据 / 测试数据 / 推理结果集等本地共享数据
  - 最小本地后端接口

### 通用任务状态流转

- 文件：
  - [taskLifecycle.ts](../../fastdata-llm-training/src/services/taskLifecycle.ts)
- 负责：
  - 统一任务状态标签
  - 操作可执行性判断

## 当前原则

- 页面不应绕开共享状态层直接硬编码业务上下文
- 如果需求涉及项目、权限、任务状态或跨页数据联动，优先先看 `src/services/`
