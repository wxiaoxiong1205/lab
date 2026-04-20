# Training And Models

## 当前范围

本模块知识用于覆盖以下页面和能力：

- 在线 Notebook
- 大模型训练
- 我的模型
- 大模型部署

## 当前实现关系

### 训练链路

大模型训练仍是训练主链路的核心页。

当前路由：

- `/training`
- `/training/create`
- `/training/detail/:id`
- `/training/detail/:id/version/:versionId`

### 模型资产

训练后的模型资产在“我的模型”中承接：

- `/model`
- `/model/create`

这里已经不再使用第一阶段“模型管理”的菜单命名，而以“我的模型”作为当前基线。

### 部署链路

部署页承接模型对外发布能力：

- `/service/inference/hosted`
- `/service/inference/hosted/create`

当前菜单名称为“大模型部署”。

## 当前约定

- 训练主链路和模型资产链路是相邻关系，不是同一个页面
- “我的模型”属于项目内业务域，访问依赖当前项目上下文
- “大模型部署”也属于项目内业务域，访问依赖当前项目上下文

## 待持续演进点

- 模型资产和部署之间的数据联动边界仍可继续收敛
- Notebook 与训练主链路之间的关系仍需要根据后续需求继续澄清
