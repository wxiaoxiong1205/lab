# System Management

## 当前定位

系统管理在第二阶段中已经从项目业务菜单中抽离，作为顶部主导航中的独立域存在。

## 当前菜单范围

- 项目管理
- 集群管理
- 存储管理
- 镜像管理
- 模型仓库
- 系统配置
- 权限配置

## 当前关键页面

- [ProjectManagement.tsx](../../fastdata-llm-training/src/pages/Admin/ProjectManagement.tsx)
- [KubernetesCluster.tsx](../../fastdata-llm-training/src/pages/Admin/KubernetesCluster.tsx)
- [StorageConfig.tsx](../../fastdata-llm-training/src/pages/Admin/StorageConfig.tsx)
- [ImageRegistry.tsx](../../fastdata-llm-training/src/pages/Admin/ImageRegistry.tsx)
- [BaseModelManagement.tsx](../../fastdata-llm-training/src/pages/Admin/BaseModelManagement.tsx)
- [SystemSettings.tsx](../../fastdata-llm-training/src/pages/Admin/SystemSettings.tsx)
- [PermissionConfig.tsx](../../fastdata-llm-training/src/pages/Admin/PermissionConfig.tsx)

## 当前架构角色

系统管理承担的是平台级治理职责，而不是项目使用流程的一部分。

因此当前约定为：

- 系统管理不依赖当前项目上下文展示入口
- 系统管理通过顶部 Tab 独立进入
- 系统管理左侧菜单只显示系统管理菜单项

## 当前建议关注点

- 系统管理各页的视觉风格仍存在差异
- 权限配置与项目管理之间的职责边界已经建立，但仍可继续收紧
- 当前大量系统管理页仍偏本地 mock，需要后续逐步补接口边界

## 待持续演进点

- 统一页面视觉风格
- 收紧菜单与权限的关系
- 补齐更多真实后端边界
