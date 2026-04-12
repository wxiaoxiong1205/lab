# DeepexiLab 平台完整模块探索报告

## 平台信息
- **URL**: https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/136/
- **平台名称**: LAB (Deepexi大模型开发平台)
- **探索时间**: 2026-03-27
- **截图目录**: /Users/daxiong/Desktop/test/screenshots/

---

## 一、侧边栏完整菜单结构

### 1. 首页
- **URL**: `/home`
- **功能**: 欢迎使用Deepexi大模型开发平台首页，快速开始指南

### 2. 数据服务
- **URL**: `/data-management`
- **子菜单**:
  - 业务测试数据集 `/business-test`
  - 业务推理结果集 `/business-inference`
  - 训练数据管理 `/datasets`
  - 测试数据管理 `/measurement`
  - 文件管理 `/file-management`
  - 推理结果集 `/Inference`

### 3. 数据处理
- **URL**: `/data-processing`

### 4. 模型训练
- **子菜单**:
  - 在线Notebook `/finetune/notebooks`
  - 大模型训练 `/training`
  - 模型管理 `/model`

### 5. 模型评估
- **子菜单**:
  - 效果评估 `/effect-evaluation`
  - 业务效果评估 `/business-effect-evaluation`
  - 评估指标 `/evaluation-indicator`

### 6. 模型服务
- **子菜单**:
  - 模型部署 `/service/inference/hosted`
  - 在线推理服务 `/service/inference/external`
  - API服务 `/service/api`

### 7. 机器学习
- **子菜单**:
  - 数据管理 `/machine-data-management`
  - 机器学习标注 `/machine-annotation`

### 8. 系统管理
- **子菜单**:
  - 项目管理 `/admin/projects`
  - 集群管理 `/admin/kubernetes`
  - 存储配置 `/admin/storage`
  - 镜像管理
    - 镜像列表 `/admin/registry/list`
    - 镜像仓库 `/admin/registry`
  - 基础模型管理 `/admin/base-model`
  - 系统配置 `/admin/settings`
  - 平台管理员 `/admin/platform-management`

---

## 二、系统管理模块详细说明

### 2.1 项目管理
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/admin/projects`
- **功能**: 管理平台项目，支持项目创建、成员管理、SSH配置
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 项目名称 | 项目标识 |
  | 项目描述 | 项目说明 |
  | 绑定集群 | 关联的Kubernetes集群 |
  | 创建时间 | 创建时间戳 |
  | 操作 | 编辑、SSH配置、成员管理 |
- **按钮**: 新建项目、成员管理、编辑、SSH配置

### 2.2 集群管理
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/admin/kubernetes`
- **功能**: Kubernetes集群管理，支持集群导入、连接测试、存储和仓库绑定
- **页面标题**: Kubernetes集群管理
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 集群名称 | K8s集群标识 |
  | API Server | API服务端点 |
  | 标签 | 集群标签 |
  | 节点数 | 节点数量 |
  | 连接状态 | 连接健康状态 |
  | 挂载状态 | 存储挂载状态 |
  | 存储配置 | 关联存储配置 |
  | 镜像仓库 | 关联镜像仓库 |
  | 创建时间 | 创建时间戳 |
  | 操作 | 测试连接、绑定存储配置、绑定仓库配置、编辑、删除 |
- **按钮**: 导入集群、刷新、测试连接、绑定存储配置、绑定仓库配置

### 2.3 存储配置
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/admin/storage`
- **功能**: 存储配置管理，支持NFS等存储类型配置
- **页面标题**: 存储配置管理
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 存储名称 | 存储配置名称 |
  | 描述 | 配置说明 |
  | 存储类型 | 存储类型(NFS等) |
  | 集群数量 | 绑定集群数量 |
  | 连接状态 | 连接状态 |
  | 最后测试时间 | 最后测试时间 |
  | 操作 | 测试连接、查看详情、文件系统格式化 |
- **搜索表单**:
  - 输入框: 搜索配置名称或描述
- **按钮**: 搜索、重置、新建配置、刷新

### 2.4 镜像管理

#### 2.4.1 镜像列表
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/admin/registry/list`
- **功能**: 平台镜像列表管理
- **页面标题**: 镜像列表
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 镜像名称 | 镜像标识 |
  | 镜像描述 | 镜像说明 |
  | 镜像分类 | 分类标签 |
  | 镜像仓库 | 所属仓库 |
  | 命名空间 | K8s命名空间 |
  | 添加时间 | 添加时间戳 |
- **搜索表单**:
  - 输入框: 请输入镜像服务名称
- **按钮**: 搜索、重置

#### 2.4.2 镜像仓库
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/admin/registry`
- **功能**: 镜像仓库配置管理
- **页面标题**: 镜像仓库配置
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 仓库名称 | 仓库标识 |
  | 命名空间 | 仓库命名空间 |
  | 仓库地址 | 仓库URL |
  | 认证方式 | 认证类型 |
  | 管理地址 | 管理控制台地址 |
  | 绑定集群 | 绑定集群数量 |
  | 状态 | 仓库状态 |
  | 操作 | 测试连接、查看详情、删除 |
- **搜索表单**:
  - 输入框: 搜索仓库名称或描述
- **按钮**: 搜索、重置、新建配置、刷新

### 2.5 基础模型管理
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/admin/base-model`
- **功能**: 基础模型管理，支持模型启动、编辑、删除、日志查看
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 模型Code | 模型唯一标识 |
  | 描述 | 模型说明 |
  | 模型类型 | 模型分类 |
  | 模型提供商 | 提供商 |
  | 支持能力 | 能力标签 |
  | 状态 | 运行状态(启动/停止) |
  | 创建时间 | 创建时间戳 |
  | 操作 | 启动、编辑、删除、日志、终止 |
- **按钮**: 刷新、新增模型

### 2.6 系统配置
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/admin/settings`
- **功能**: 系统属性配置管理
- **页面标题**: 系统配置
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 属性名称 | 配置项名称 |
  | 属性描述 | 配置说明 |
  | 输入方式 | 输入类型 |
  | 属性值 | 当前值 |
  | 属性分组 | 所属分组 |
  | 是否必填 | 必填标识 |
  | 操作 | 删除 |
- **搜索表单**:
  - 输入框: 请输入属性名称
- **按钮**: 添加属性

### 2.7 平台管理员
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/admin/platform-management`
- **功能**: 平台管理员成员管理
- **页面标题**: 平台管理员共1名成员
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 账号 | 用户账号 |
  | 用户名 | 显示名称 |
  | 邮箱 | 邮箱地址 |
  | 加入时间 | 加入时间戳 |
  | 操作 | 删除 |
- **搜索表单**:
  - 输入框: 搜索账号
- **按钮**: 添加成员

---

## 三、数据服务模块详细说明

### 3.1 业务测试数据集
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/136/business-test`
- **功能**: 管理业务测试数据集
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 数据集名称 | 数据集标识 |
  | 最新版本状态 | 版本状态 |
  | 最新版本 | 版本号 |
  | 创建人 | 创建者 |
  | 创建时间 | 创建时间戳 |
  | 操作 | - |
- **搜索表单**:
  - 输入框: 请输入数据集名称
- **按钮**: 搜索、重置、创建数据集、刷新

### 3.2 业务推理结果集
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/136/business-inference`
- **功能**: 管理业务推理结果
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 数据集名称 | 数据集标识 |
  | 推理进度 | 推理完成百分比 |
  | 推理模型 | 使用模型 |
  | 数据量 | 数据条数 |
  | 创建时间 | 创建时间戳 |
  | 操作 | - |
- **搜索表单**:
  - 输入框: 搜索数据集名称
- **按钮**: 搜索、重置、创建数据集、刷新

### 3.3 训练数据管理
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/136/datasets`
- **功能**: 管理训练数据集，支持多种数据格式
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 数据集名称 | 数据集标识 |
  | 最新版本状态 | 版本状态 |
  | 最新版本 | 版本号 |
  | 数据用途 | 用途(训练) |
  | 数据格式 | 格式(jsonl/xlsx等) |
  | 操作 | 查看详情、删除 |
- **搜索表单**:
  - 输入框: 请输入数据集名称
- **按钮**: 搜索、重置、创建数据集、刷新

### 3.4 测试数据管理
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/136/measurement`
- **功能**: 管理测试数据集
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 数据集名称 | 数据集标识 |
  | 最新版本状态 | 版本状态 |
  | 最新版本 | 版本号 |
  | 数据用途 | 用途(测试) |
  | 数据格式 | 格式 |
  | 操作 | 查看详情、删除 |
- **搜索表单**:
  - 输入框: 请输入数据集名称
- **按钮**: 搜索、重置、创建数据集、刷新

### 3.5 文件管理
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/136/file-management`
- **功能**: 管理数据文件夹
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 文件夹名称 | 文件夹标识 |
  | 文件夹描述 | 文件夹说明 |
  | 创建人 | 创建者 |
  | 创建时间 | 创建时间戳 |
  | 操作 | - |
- **搜索表单**:
  - 输入框: 搜索文件夹名称
- **按钮**: 搜索、重置、创建文件夹

### 3.6 推理结果集
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/136/Inference`
- **功能**: 管理推理结果，支持离线推理任务
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 数据集名称 | 数据集标识 |
  | 推理进度 | 完成百分比 |
  | 数据用途 | 用途类型 |
  | 待推理数据 | 输入数据 |
  | 待推理模型/服务 | 模型或服务 |
  | 数据量 | 数据条数 |
  | 创建时间 | 创建时间戳 |
  | 操作 | 启动、编辑、删除 |
- **搜索表单**:
  - 输入框: 搜索数据集名称
- **按钮**: 搜索、重置、创建数据集、刷新

---

## 四、机器学习模块详细说明

### 4.1 数据管理
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/136/machine-data-management`
- **功能**: 机器学习数据集管理，支持多种标注类型
- **数据表格结构**:
  | 列名 | 说明 |
  |------|------|
  | 数据集名称 | 数据集标识 |
  | 最新版本 | 版本号 |
  | 数据类型 | 数据类型 |
  | 标注类型 | 标注方式 |
  | 标注模板 | 使用模板 |
  | 操作 | 查看详情、删除 |
- **搜索表单**:
  - 输入框: 搜索数据集名称
- **按钮**: 搜索、重置、创建数据集

### 4.2 机器学习标注
- **URL**: `https://deepexilab-test.deepexi.com/t_deepexilab/LAB/project/136/machine-annotation`
- **功能**: 机器学习数据标注（页面返回404，需进一步探索）

---

## 五、截图文件清单

### 系统管理模块
| 文件名 | 说明 |
|--------|------|
| system-management-projects.png | 项目管理 |
| system-management-kubernetes.png | 集群管理 |
| system-management-storage.png | 存储配置 |
| system-management-image-list.png | 镜像列表 |
| system-management-registry.png | 镜像仓库 |
| system-management-base-model.png | 基础模型管理 |
| system-management-settings.png | 系统配置 |
| system-management-platform-admin.png | 平台管理员 |

### 数据服务模块
| 文件名 | 说明 |
|--------|------|
| data-business-test.png | 业务测试数据集 |
| data-business-inference.png | 业务推理结果集 |
| data-training-management.png | 训练数据管理 |
| data-test-management.png | 测试数据管理 |
| data-file-management.png | 文件管理 |
| data-inference-result.png | 推理结果集 |

### 机器学习模块
| 文件名 | 说明 |
|--------|------|
| machine-learning-data-management.png | 机器学习数据管理 |
| machine-learning-data-mgmt.png | 机器学习数据管理(完整) |
| machine-learning-annotation.png | 机器学习标注 |

### 其他
| 文件名 | 说明 |
|--------|------|
| complete-menu-structure.png | 完整菜单结构 |
| full-sidebar-menu.png | 完整侧边栏 |

---

## 六、模块URL汇总表

| 模块 | URL |
|------|-----|
| 首页 | `/home` |
| 业务测试数据集 | `/business-test` |
| 业务推理结果集 | `/business-inference` |
| 训练数据管理 | `/datasets` |
| 测试数据管理 | `/measurement` |
| 文件管理 | `/file-management` |
| 推理结果集 | `/Inference` |
| 在线Notebook | `/finetune/notebooks` |
| 大模型训练 | `/training` |
| 模型管理 | `/model` |
| 效果评估 | `/effect-evaluation` |
| 业务效果评估 | `/business-effect-evaluation` |
| 评估指标 | `/evaluation-indicator` |
| 模型部署 | `/service/inference/hosted` |
| 在线推理服务 | `/service/inference/external` |
| API服务 | `/service/api` |
| 机器学习数据管理 | `/machine-data-management` |
| 机器学习标注 | `/machine-annotation` |
| 项目管理 | `/admin/projects` |
| 集群管理 | `/admin/kubernetes` |
| 存储配置 | `/admin/storage` |
| 镜像列表 | `/admin/registry/list` |
| 镜像仓库 | `/admin/registry` |
| 基础模型管理 | `/admin/base-model` |
| 系统配置 | `/admin/settings` |
| 平台管理员 | `/admin/platform-management` |
