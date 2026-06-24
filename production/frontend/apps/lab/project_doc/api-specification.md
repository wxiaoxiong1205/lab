# API端点规范文档

## 概述

本文档详细描述了数据集管理系统的所有API端点，包括RESTful设计规范、项目层级关系和端点分类。

## RESTful设计原则

系统遵循RESTful API设计原则，所有端点都按照以下格式组织：

### 基础URL格式
```
/api/v1/{resource}/{path_parameters}
```

### 项目级别资源隔离
大部分资源都通过项目ID进行隔离，格式为：
```
/api/v1/{resource}/by-project/{project_id}/{sub_resource}
```

### 目录层级资源
部分资源还支持目录层级，格式为：
```
/api/v1/{resource}/by-project/{project_id}/directory/{directory_id}/{sub_resource}
```

### HTTP状态码规范
系统严格遵循RESTful HTTP状态码规范：
- **200 OK**: 成功处理GET、PUT、PATCH请求，以及操作类POST请求
- **201 Created**: 成功创建新资源的POST请求
- **204 No Content**: 成功处理DELETE请求
- **400 Bad Request**: 客户端请求错误
- **404 Not Found**: 资源不存在
- **409 Conflict**: 资源冲突（如重名）
- **500 Internal Server Error**: 服务器内部错误

## API端点分类

### 1. 用户管理 (Users)
**前缀**: `/api/v1/users`
**标签**: `user`

| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| POST | `/register` | 用户注册 | 公开 |
| POST | `/login` | 用户登录 | 公开 |
| GET | `/me` | 获取当前用户信息 | 用户认证 |
| GET | `/list` | 获取用户列表（分页） | 管理员 |
| GET | `/{user_id}` | 获取指定用户信息 | 用户认证 |
| PUT | `/{user_id}` | 更新用户信息 | 用户认证 |
| DELETE | `/{user_id}` | 删除用户 | 管理员 |

### 2. 项目管理 (Projects)
**前缀**: `/api/v1/projects`
**标签**: `projects`

| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| GET | `/list` | 获取项目列表（分页） | 用户认证 |
| POST | `` | 创建项目 | 用户认证 |
| GET | `/{project_id}` | 获取项目详情 | 用户认证 |
| PUT | `/{project_id}` | 更新项目 | 用户认证 |
| DELETE | `/{project_id}` | 删除项目 | 用户认证 |

### 3. 数据集管理 (Datasets)
**前缀**: `/api/v1/datasets`
**标签**: `datasets`

#### 3.1 数据集CRUD操作
| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| POST | `/by-project/{project_id}/directory/{directory_id}` | 创建数据集 | 用户认证 |
| GET | `/by-project/{project_id}/directory/{directory_id}/dataset/{dataset_id}` | 获取数据集详情 | 用户认证 |
| GET | `/by-project/{project_id}/directory/{directory_id}/list` | 获取数据集列表（分页、搜索、排序） | 用户认证 |
| PUT | `/by-project/{project_id}/directory/{directory_id}/dataset/{dataset_id}` | 更新数据集 | 用户认证 |
| PATCH | `/by-project/{project_id}/directory/{directory_id}/dataset/{dataset_id}` | 部分更新数据集 | 用户认证 |
| DELETE | `/by-project/{project_id}/directory/{directory_id}/dataset/{dataset_id}` | 删除数据集 | 用户认证 |
| DELETE | `/by-project/{project_id}/directory/{directory_id}/batch-delete` | 批量删除数据集 | 用户认证 |

#### 3.2 数据集导入导出
| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| POST | `/by-project/{project_id}/directory/{directory_id}/import-xlsx` | 从Excel导入数据集 | 用户认证 |
| GET | `/by-project/{project_id}/directory/{directory_id}/export-xlsx` | 导出数据集为Excel | 用户认证 |
| GET | `/xlsx-template` | 下载Excel模板 | 用户认证 |

### 4. 数据集目录管理 (Dataset Directories)
**前缀**: `/api/v1/dataset_directories`
**标签**: `dataset-directories`

| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| POST | `/project/{project_id}` | 创建数据集目录 | 用户认证 |
| GET | `/project/{project_id}` | 获取数据集目录列表（分页） | 用户认证 |
| GET | `/project/{project_id}/directory/{directory_id}` | 获取目录详情 | 用户认证 |
| PUT | `/project/{project_id}/directory/{directory_id}` | 更新目录 | 用户认证 |
| DELETE | `/project/{project_id}/directory/{directory_id}` | 删除目录 | 用户认证 |

### 5. 提示词管理 (Prompts)
**前缀**: `/api/v1/prompts`
**标签**: `prompts`

#### 5.1 提示词CRUD操作
| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| GET | `/by-project/{project_id}/directory/{directory_id}/prompts` | 获取提示词列表（分页、搜索、排序） | 用户认证 |
| POST | `/by-project/{project_id}/directory/{directory_id}/prompts` | 创建提示词 | 用户认证 |
| GET | `/by-project/{project_id}/directory/{directory_id}/prompts/{prompt_id}` | 获取提示词详情 | 用户认证 |
| PUT | `/by-project/{project_id}/directory/{directory_id}/prompts/{prompt_id}` | 更新提示词 | 用户认证 |
| DELETE | `/by-project/{project_id}/directory/{directory_id}/prompts/{prompt_id}` | 删除提示词 | 用户认证 |

#### 5.2 提示词导入导出
| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| GET | `/by-project/{project_id}/directory/{directory_id}/prompts/export-xlsx` | 导出提示词为Excel | 用户认证 |
| POST | `/by-project/{project_id}/directory/{directory_id}/prompts/import-xlsx` | 从Excel导入提示词 | 用户认证 |
| GET | `/xlsx-template` | 下载Excel模板 | 用户认证 |

### 6. 提示词目录管理 (Prompt Directories)
**前缀**: `/api/v1/prompt_directories`
**标签**: `prompt-directories`

| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| POST | `/project/{project_id}` | 创建提示词目录 | 用户认证 |
| GET | `/project/{project_id}` | 获取提示词目录列表（分页） | 用户认证 |
| GET | `/project/{project_id}/directory/{directory_id}` | 获取目录详情 | 用户认证 |
| PUT | `/project/{project_id}/directory/{directory_id}` | 更新目录 | 用户认证 |
| DELETE | `/project/{project_id}/directory/{directory_id}` | 删除目录 | 用户认证 |

### 7. 评估指标管理 (Metrics)
**前缀**: `/api/v1/metrics`
**标签**: `metrics`

#### 7.1 指标CRUD操作
| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| POST | `/by-project/{project_id}/directory/{directory_id}/metrics` | 创建评估指标 | 用户认证 |
| GET | `/by-project/{project_id}/directory/{directory_id}/metric/{metric_id}` | 获取指标详情 | 用户认证 |
| PUT | `/by-project/{project_id}/directory/{directory_id}/metric/{metric_id}` | 更新指标 | 用户认证 |
| DELETE | `/by-project/{project_id}/directory/{directory_id}/metric/{metric_id}` | 删除指标 | 用户认证 |
| GET | `/by-project/{project_id}/directory/{directory_id}/list` | 获取指标列表（分页、搜索、排序） | 用户认证 |
| POST | `/by-project/{project_id}/directory/{directory_id}/batch-delete` | 批量删除指标 | 用户认证 |

#### 7.2 指标工具
| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| POST | `/generate-evaluation-steps` | 生成评估步骤 | 用户认证 |
| GET | `/builtin` | 获取内置指标列表（分页） | 用户认证 |

### 8. 指标目录管理 (Metric Directories)
**前缀**: `/api/v1/metric_directories`
**标签**: `metric-directories`

| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| POST | `/project/{project_id}` | 创建指标目录 | 用户认证 |
| GET | `/project/{project_id}` | 获取指标目录列表（分页） | 用户认证 |
| GET | `/project/{project_id}/directory/{directory_id}` | 获取目录详情 | 用户认证 |
| PUT | `/project/{project_id}/directory/{directory_id}` | 更新目录 | 用户认证 |
| DELETE | `/project/{project_id}/directory/{directory_id}` | 删除目录 | 用户认证 |

### 9. LLM配置管理 (LLM Configurations)
**前缀**: `/api/v1/llm_configs`
**标签**: `LLM Configurations`

#### 9.1 LLM配置CRUD操作
| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| POST | `/by-project/{project_id}` | 创建LLM配置 | 用户认证 |
| GET | `/by-project/{project_id}/list` | 获取LLM配置列表（分页、搜索、排序） | 用户认证 |
| GET | `/by-project/{project_id}/config/{config_id}` | 获取LLM配置详情 | 用户认证 |
| PUT | `/by-project/{project_id}/config/{config_id}` | 更新LLM配置 | 用户认证 |
| DELETE | `/by-project/{project_id}/config/{config_id}` | 删除LLM配置 | 用户认证 |
| GET | `/by-project/{project_id}/default` | 获取默认LLM配置 | 用户认证 |

#### 9.2 LLM配置导入导出
| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| GET | `/by-project/{project_id}/export-xlsx` | 导出LLM配置为Excel | 用户认证 |
| POST | `/by-project/{project_id}/import-xlsx` | 从Excel导入LLM配置 | 用户认证 |
| GET | `/xlsx-template` | 下载Excel模板 | 用户认证 |

### 10. 任务管理 (Tasks)
**前缀**: `/api/v1/tasks`
**标签**: `tasks`

| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| POST | `/by-project/{project_id}` | 创建任务 | 用户认证 |
| GET | `/by-project/{project_id}/list` | 获取任务列表（分页、筛选） | 用户认证 |
| GET | `/by-project/{project_id}/task/{task_id}` | 获取任务详情 | 用户认证 |
| PATCH | `/by-project/{project_id}/task/{task_id}` | 更新任务 | 用户认证 |
| POST | `/by-project/{project_id}/task/{task_id}/status` | 更新任务状态 | 用户认证 |
| POST | `/by-project/{project_id}/task/{task_id}/retry-error` | 重试失败的任务 | 用户认证 |
| DELETE | `/by-project/{project_id}/task/{task_id}` | 删除任务 | 用户认证 |
| GET | `/by-project/{project_id}/task/{task_id}/logs` | 获取任务日志 | 用户认证 |

### 11. 测试运行管理 (Test Runs)
**前缀**: `/api/v1/test_runs`
**标签**: `test-runs`

| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| POST | `/by-project/{project_id}` | 创建测试运行 | 用户认证 |
| GET | `/by-project/{project_id}/list` | 获取测试运行列表（分页、筛选） | 用户认证 |
| GET | `/by-project/{project_id}/test-run/{test_run_id}` | 获取测试运行详情 | 用户认证 |
| DELETE | `/by-project/{project_id}/test-run/{test_run_id}` | 删除测试运行 | 用户认证 |
| POST | `/by-project/{project_id}/test-run/{test_run_id}/start` | 启动测试运行 | 用户认证 |
| POST | `/by-project/{project_id}/test-run/{test_run_id}/cancel` | 取消测试运行 | 用户认证 |

### 12. 链测试 (Chain Test)
**前缀**: `/api/v1/chain_test`
**标签**: `chain-test`

| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| POST | `/by-project/{project_id}/invoke` | 执行链测试 | 用户认证 |

### 13. 数据集日志 (Dataset Logs)
**前缀**: `/api/v1/dataset_logs`
**标签**: `dataset-logs`

| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| GET | `/project/{project_id}` | 获取项目日志列表（分页） | 用户认证 |
| GET | `/project/{project_id}/dataset/{dataset_id}` | 获取数据集相关日志（分页） | 用户认证 |
| GET | `/project/{project_id}/log/{log_id}` | 获取日志详情 | 用户认证 |
| GET | `/project/{project_id}/simple` | 获取简化日志列表（分页） | 用户认证 |
| DELETE | `/project/{project_id}/log/{log_id}` | 删除日志 | 用户认证 |
| DELETE | `/project/{project_id}/batch` | 批量删除日志（查询参数） | 用户认证 |
| POST | `/project/{project_id}/batch-delete` | 批量删除日志（请求体） | 用户认证 |

## 端点设计规范

### 1. 路径参数优先原则
- 资源标识符（如 `project_id`、`directory_id`、`resource_id`）都通过路径参数传递
- 避免在查询参数中传递资源标识符

### 2. 项目级别隔离
- 除了用户管理和项目管理外，所有资源都通过 `project_id` 进行隔离
- 确保用户只能访问所属项目的资源

### 3. 目录层级结构
- 数据集、提示词、指标都支持目录层级管理
- 目录管理和资源管理分别有独立的端点

### 4. 统一的响应格式
- 列表接口统一使用 `fastapi-pagination` 进行分页
- 创建接口返回 201 状态码，包含创建的资源
- 获取详情接口返回 200 状态码，包含对应的响应模型
- **更新操作（PUT/PATCH）统一返回 200 状态码，包含更新后的完整资源**（2024年修复：确保所有更新接口格式一致）
- **删除操作统一返回 204 状态码，无响应体内容**（2024年修复：确保所有删除接口格式一致）

### 5. 查询参数规范
- 搜索参数：支持模糊搜索的字段通过查询参数传递
- 排序参数：`sort_by` 和 `sort_order`
- 筛选参数：时间范围、状态等筛选条件
- 分页参数：由 `fastapi-pagination` 自动处理

### 6. HTTP方法语义
- `GET`：获取资源（返回200状态码）
- `POST`：创建资源（返回201状态码）
- `PUT`：完整更新资源（统一返回200状态码，包含更新后的资源）
- `PATCH`：部分更新资源（统一返回200状态码，包含更新后的资源）
- `DELETE`：删除资源（统一返回204状态码，无响应体）

## 认证与授权

### 认证级别
1. **公开接口**：用户注册、登录
2. **用户认证**：需要有效的JWT令牌
3. **管理员权限**：需要管理员角色的JWT令牌

### 权限控制
- 项目级别：用户只能访问自己有权限的项目资源
- 目录级别：确保目录属于指定项目
- 资源级别：确保资源属于指定目录和项目

## 错误处理

### 标准HTTP状态码
- `200`：成功
- `201`：创建成功
- `204`：删除成功（无内容）
- `400`：请求参数错误
- `401`：未认证
- `403`：无权限
- `404`：资源不存在
- `409`：资源冲突
- `500`：服务器内部错误

### 错误响应格式
所有错误都返回标准的错误格式：
```json
{
  "detail": "错误描述信息"
}
```

## 数据格式

### 请求格式
- 内容类型：`application/json`
- 文件上传：`multipart/form-data`
- 流式响应：`text/event-stream`

### 响应格式
- 标准响应：`application/json`
- 文件下载：`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- 流式响应：`text/event-stream`

## 版本控制

当前API版本：`v1`
- 所有端点都使用 `/api/v1/` 前缀
- 未来版本更新时将使用 `/api/v2/` 等新前缀
- 保持向后兼容性原则

### 14. Kubernetes集群管理 (Kubernetes)
**前缀**: `/api/v1/k8s`
**标签**: `kubernetes`

| 方法 | 端点 | 描述 | 认证要求 |
|------|------|------|----------|
| GET | `/clusters` | 获取集群列表（分页） | 用户认证 |
| POST | `/clusters` | 创建/导入K8S集群 | 用户认证 |
| GET | `/clusters/{cluster_id}` | 获取集群详情 | 用户认证 |
| PUT | `/clusters/{cluster_id}` | 更新集群信息 | 用户认证 |

#### 更新集群接口详情
**PUT** `/clusters/{cluster_id}`
- **参数**: `cluster_id` (integer, required) - 集群ID
- **请求体格式**:
  ```json
  {
    "name": "string",
    "config": "string",
    "desc": "string"
  }
  ```
- **响应**: 更新后的集群信息
| DELETE | `/clusters/{cluster_id}` | 删除集群 | 用户认证 |
| POST | `/clusters/{cluster_id}/test-connectivity` | 测试集群连接 | 用户认证 |
| POST | `/clusters/validate` | 验证kubeconfig配置 | 用户认证 |
| GET | `/clusters/{cluster_id}/health` | 获取集群健康状态 | 用户认证 |

#### 查询参数
- `page`: 页码（默认：1）
- `size`: 每页数量（默认：50）

#### 测试连接接口详情
**POST** `/clusters/{cluster_id}/test-connectivity`
- **参数**: `cluster_id` (integer, required) - 集群ID
- **请求体**: 空 (`{}`)
- **响应格式**:
  ```json
  {
    "cluster_id": number,
    "is_connected": boolean
  }
  ```
- **示例调用**:
  ```bash
  curl -X POST '/api/v1/k8s/clusters/1/test-connectivity' \
    -H 'accept: application/json' \
    -d ''
  ```

## 总结

本API设计遵循RESTful原则，通过统一的端点格式、清晰的资源层级关系和完善的权限控制，为数据集管理系统提供了完整、安全、易用的API接口。所有端点都支持现代Web应用的需求，包括分页、搜索、排序、导入导出等功能。

## 更新日志

### 2024年12月21日 - API规范实现修复
**修复内容**：
1. **Schema层面修复**：
   - 从所有创建和更新的请求体Schema中移除了`project_id`和`directory_id`字段
   - 涉及文件：`dataset.py`、`llm_config.py`、`prompt.py`、`metric.py`、`task.py`、`log.py`、`test_run.py`

2. **路由层面修复**：
   - 移除了路由中对请求体`project_id`和`directory_id`的验证逻辑
   - 修改创建接口直接使用路径参数中的`project_id`和`directory_id`
   - 涉及文件：`llm_config.py`、`task.py`、`test_run.py`、`metric_directory.py`

3. **新增接口**：
   - 补充了LLM配置的默认配置获取接口：`GET /by-project/{project_id}/default`

**修复原则**：
- **路径参数优先**：所有增加、修改接口涉及的`project_id`、`directory_id`等资源标识符统一从路径参数获取
- **请求体简化**：请求体中不再包含可从路径参数获得的资源标识符，避免数据冗余和不一致问题
- **最小化修改**：仅修复不符合规范的部分，保持其他功能不变
- **安全性保证**：通过路径参数约束确保资源访问的安全性

**影响范围**：
- 所有创建和更新接口的请求体格式发生变化
- 前端调用这些接口时需要移除请求体中的`project_id`和`directory_id`字段
- 路由验证逻辑得到简化，提高了代码的一致性和可维护性

这次修复确保了所有API接口都严格按照"路径参数优先原则"实现，提高了API的一致性和安全性。

### 2024年12月21日 - Kubernetes集群管理API对接
**更新内容**：
1. **新增Kubernetes集群管理API规范**：
   - 添加了完整的K8s集群管理API端点规范
   - 包含集群CRUD操作、连接测试、健康检查等功能
   - 支持分页查询参数（page、size）

2. **前端API服务更新**：
   - 修改kubernetesService.ts对接真实后端API
   - API端点从`/admin/kubernetes/*`改为`/k8s/*`
   - 添加分页参数支持
   - 关闭Mock数据，启用真实API调用
   - 更新API基础地址为`http://139.9.225.88:31077/api/v1`

3. **接口映射**：
   - `GET /k8s/clusters` - 获取集群列表（支持分页）
   - `POST /k8s/clusters` - 创建/导入集群
   - `GET /k8s/clusters/{id}` - 获取集群详情
   - `PUT /k8s/clusters/{id}` - 更新集群信息
   - `DELETE /k8s/clusters/{id}` - 删除集群
   - `POST /k8s/clusters/{id}/test-connectivity` - 测试连接
   - `POST /k8s/clusters/validate` - 验证kubeconfig
   - `GET /k8s/clusters/{id}/health` - 健康状态检查

**技术改进**：
- 统一了分页参数格式
- 增强了类型安全性
- 支持灵活的响应格式适配
- 保持了向后兼容性

### 2024年12月21日 - API字段名修复
**修复内容**：
1. **KubeconfigImportRequest接口修复**：
   - 将`content`字段改为`config`字段，匹配后端API规范
   - 修复了创建K8s集群时的"Field required"错误

2. **API调用修复**：
   - kubernetesService.ts中validateKubeconfig函数：`{ content }` → `{ config: content }`
   - KubernetesManagement.tsx中handleImport函数：`content: kubeconfigContent` → `config: kubeconfigContent`

3. **错误解决**：
   - 解决了"missing field 'config'"错误
   - 确保前后端API字段名一致性
   - 提高了API调用的成功率

**影响范围**：
- kubeconfig导入功能现在可以正常工作
- kubeconfig验证功能API字段名已修正
- 类型定义与后端API保持一致

### 2024年12月21日 - 集群连接测试接口优化
**实现内容**：
1. **API参数类型修复**：
   - 前端自动将string类型的clusterId转换为integer类型
   - 添加了clusterId的有效性验证（NaN检查）
   - 确保请求体为空对象，符合后端API规范

2. **前端集成优化**：
   - 表格操作列中的测试连接按钮正确传递集群ID
   - 支持根据API响应的success字段显示不同消息
   - 测试完成后自动刷新集群列表状态

3. **错误处理增强**：
   - 无效clusterId的客户端验证
   - API调用失败的统一错误提示
   - 网络异常的友好错误处理

**技术细节**：
- 请求路径：`POST /api/v1/k8s/clusters/{cluster_id}/test-connectivity`
- 参数类型：cluster_id为integer（前端自动转换）
- 响应格式：`{ cluster_id: number, is_connected: boolean }`
- 调用流程：前端String(record.id) → parseInt() → API调用

### 2024年12月21日 - 集群连接测试接口修复
**修复内容**：
1. **API响应格式修复**：
   - 更新响应类型：`{success, message}` → `{cluster_id, is_connected}`
   - 新增ClusterConnectivityResponse接口定义
   - 修复前端消息显示逻辑，根据is_connected字段判断成功/失败

2. **Loading状态管理优化**：
   - 添加testingClusters状态管理每个集群的独立loading状态
   - 修复了"所有按钮都显示loading"的问题
   - 每个测试连接按钮现在只显示自己的loading状态

3. **用户体验改进**：
   - 测试成功/失败的消息更明确，包含集群ID信息
   - 按钮loading状态精确控制，不影响其他集群的按钮
   - 测试完成后自动清除对应的loading状态

**实际API响应示例**：
```json
{
  "cluster_id": 2,
  "is_connected": true
}
```

### 2024年12月21日 - 集群编辑功能修复和API对接
**修复内容**：
1. **编辑数据回显修复**：
   - 修复点击编辑按钮时数据无法回显的问题
   - 编辑时通过getKubernetesCluster API获取完整集群信息
   - 正确设置表单字段的初始值

2. **编辑表单字段调整**：
   - 添加集群描述字段（desc）
   - 将配置字段名从configmap改为config，匹配后端API
   - 表单布局优化，先描述后配置

3. **API接口对接优化**：
   - 新增ClusterUpdateRequest接口定义
   - 修复updateKubernetesCluster函数的请求格式
   - 确保cluster_id参数类型转换（string → integer）
   - 请求体字段完全匹配后端API规范

4. **类型安全增强**：
   - 更新所有相关的TypeScript类型定义
   - 修复类型不匹配的编译错误
   - 确保前后端数据格式一致性

**技术细节**：
- 请求路径：`PUT /api/v1/k8s/clusters/{cluster_id}`
- 请求体：`{name: string, config?: string, desc?: string}`
- 编辑流程：点击编辑 → 获取详情 → 回显数据 → 用户修改 → 提交更新
- 数据转换：前端clusterId(string) → parseInt() → 后端cluster_id(integer)

## 11. 镜像仓库管理 (Repository)
**前缀**: `/api/v1/repository`
**标签**: `repository`

| 方法 | 端点 | 描述 | 状态 |
|------|------|------|------|
| GET | `/` | 获取镜像仓库配置列表 | ✅ 已实现 |
| POST | `/` | 创建镜像仓库配置 | 📋 待实现 |
| GET | `/{repository_id}` | 获取指定镜像仓库配置 | 📋 待实现 |
| PUT | `/{repository_id}` | 更新镜像仓库配置 | 📋 待实现 |
| DELETE | `/{repository_id}` | 删除镜像仓库配置 | 📋 待实现 |
| POST | `/{repository_id}/test-connectivity` | 测试仓库连接 | ✅ 已修复 |
| GET | `/available-clusters` | 获取可用集群列表 | ✅ 已实现 |
| POST | `/{repository_id}/bind-clusters` | 绑定集群到仓库 | ✅ 已实现 |
| DELETE | `/{repository_id}/unbind-clusters` | 解绑集群 | 📋 待实现 |
| GET | `/{repository_id}/clusters` | 获取仓库绑定的集群 | 📋 待实现 |
| GET | `/occupied-clusters/{repository_id}` | 获取已占用的集群列表 | ✅ 新增 |
| GET | `/{repository_id}/images` | 获取仓库镜像列表 | 📋 待实现 |
| GET | `/{repository_id}/repositories` | 获取仓库子仓库列表 | 📋 待实现 |

### 11.1 获取镜像仓库配置列表

**端点**: `GET /api/v1/repository/`

**查询参数**:
- `page` (integer): 页码，默认1
- `size` (integer): 每页数量，默认10，最大50
- `search` (string): 搜索关键字，匹配仓库名称或描述
- `registry_type` (string): 仓库类型过滤 ['dockerhub', 'harbor', 'private', 'aliyun', 'tencent', 'huawei']
- `auth_type` (string): 认证方式过滤 ['none', 'username_password', 'token']

**响应数据结构**:
```json
{
  "items": [
    {
      "id": 4,
      "name": "Harbor主仓库",
      "repository_address": "https://harbor.example.com",
      "auth_type": "username_password",
      "auth_config": {
        "username": "admin",
        "password": "password123"
      },
      "manager_address": "https://harbor.example.com",
      "cluster_number": 2,
      "status": "连接正常",
      "created_at": "2024-01-10T09:00:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "created_id": 6,
      "created_by": "admin"
    }
  ],
  "total": 100,
  "page": 1,
  "size": 10,
  "pages": 10
}
```

**字段说明**:
- `repository_address`: 镜像仓库地址
- `manager_address`: 管理界面地址  
- `auth_type`: 认证类型，枚举值为 `username_password|token|none`
- `status`: 连接状态，中文描述如"连接正常"、"未测试"、"连接失败"等

**统一字段标准**:
所有前端代码已统一使用后端字段标准，无需额外映射转换：

| 字段名 | 类型 | 说明 |
|-------|------|------|
| `repository_address` | string | 镜像仓库地址 |
| `manager_address` | string | 管理界面地址 |
| `auth_type` | enum | 认证方式: `'none'`, `'username_password'`, `'token'` |
| `status` | string | 连接状态: "连接正常"、"未测试"、"连接失败"等 |

> **注意**: 前端已完全采用后端字段标准，前后端保持一致

**前端集成状态**: ✅ 已完成
- 服务文件: `src/services/registryService.ts`
- 页面组件: `src/pages/RegistryConfigList.tsx`
- 已删除: `src/mock/mockRegistryService.ts`
- ✅ **统一字段标准**: 前端已完全采用后端字段标准
  - 字段名统一: `repository_address`, `manager_address`
  - 枚举值统一: `auth_type: 'username_password'`
  - 类型定义: 更新了 `RegistryConfig` 和 `RegistryConfigCreateUpdate` 接口
- ✅ **API路径修复**: 解决307重定向和401认证错误
  - 路径统一: 所有API路径去除末尾斜杠，避免重定向
  - 测试指南: 创建了 `REGISTRY_API_TESTING.md` 详细说明测试方法
  - 认证说明: 提供了完整的curl命令示例和token获取方法

### 11.2 测试镜像仓库连通性

**端点**: `POST /api/v1/repository/{repository_id}/test-connectivity`

**路径参数**:
- `repository_id` (integer): 镜像仓库ID

**请求体**: 空（可传空对象 `{}`）

**响应数据结构**:
```json
{
  "repository_id": 1,
  "is_connected": true
}
```

**响应字段说明**:
- `repository_id` (integer): 测试的镜像仓库ID
- `is_connected` (boolean): 连接状态，true表示连接成功，false表示连接失败

**前端处理**:
- 成功时显示: "镜像仓库连接测试成功"
- 失败时显示: "镜像仓库连接测试失败"

### 11.3 获取可用集群列表

**端点**: `GET /api/v1/repository/available-clusters`

**查询参数**:
- `name` (string, 必需): 仓库名称
- `page` (integer): 页码，默认1
- `size` (integer): 每页数量，默认50，最大100

**响应数据结构**:
```json
{
  "items": [
    {
      "id": 1,
      "name": "主集群",
      "api_server": "https://k8s-api.example.com:6443",
      "status": "online",
      "version": "v1.26.0",
      "node_number": 5,
      "description": "生产环境主集群",
      "created_at": "2024-01-10T09:00:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "created_by": "admin"
    }
  ],
  "total": 10,
  "page": 1,
  "size": 50
}
```

**响应字段说明**:
- `id` (integer): 集群ID
- `name` (string): 集群名称
- `api_server` (string): Kubernetes API服务器地址
- `status` (string): 集群状态 ['online', 'offline', 'error']
- `version` (string): Kubernetes版本
- `node_number` (integer): 节点数量
- `description` (string): 集群描述
- `created_at` (string): 创建时间
- `updated_at` (string): 更新时间
- `created_by` (string): 创建者

**前端处理**:
- 仅显示状态为 'online' 的集群作为可选项
- 'offline' 和 'error' 状态的集群显示为禁用状态

### 11.4 绑定集群到镜像仓库

**端点**: `POST /api/v1/repository/{repository_id}/bind-clusters`

**路径参数**:
- `repository_id` (integer): 镜像仓库ID

**请求体**:
```json
{
  "cluster_ids": [0]
}
```

**请求字段说明**:
- `cluster_ids` (number[]): 要绑定的集群ID数组

**响应**: 成功时返回空响应体（HTTP 200）

**前端处理**:
- 成功时显示: "成功更新集群绑定，共绑定 N 个集群"
- 失败时显示: "保存集群绑定失败"

### 11.5 获取已占用的集群列表 **【新增】**

**端点**: `GET /api/v1/repository/occupied-clusters/{repository_id}`

**路径参数**:
- `repository_id` (integer): 镜像仓库ID

**响应数据结构**:
```json
{
  "items": [
    {
      "id": 1,
      "name": "主集群",
      "api_server": "https://k8s-api.example.com:6443",
      "status": "连接正常",
      "version": "v1.28.1",
      "bound_at": "2024-01-10T09:00:00Z",
      "is_active": true
    },
    {
      "id": 2,
      "name": "测试集群",
      "api_server": "https://k8s-test.example.com:6443",
      "status": "离线",
      "version": "v1.27.5",
      "bound_at": "2024-01-12T14:30:00Z",
      "is_active": false
    }
  ],
  "total": 2,
  "page": 1,
  "size": 50,
  "pages": 1
}
```

**响应字段说明**:
- `id` (integer): 集群ID（前端映射为cluster_id）
- `name` (string): 集群名称（前端映射为cluster_name）
- `api_server` (string, 可选): Kubernetes API服务器地址
- `status` (string, 可选): 集群状态，如"连接正常"、"离线"等中文状态
- `version` (string, 可选): Kubernetes版本
- `bound_at` (string, 可选): 绑定时间（ISO 8601格式）
- `is_active` (boolean, 可选): 是否处于激活状态

**前端处理**:
- 用于 `RegistryClusterBindingModal` 组件显示已绑定的集群
- 支持在镜像仓库配置列表页面查看已绑定集群详情
- 提供测试工具 `testOccupiedClustersAPI` 用于调试和验证

**使用场景**:
1. **集群绑定管理**: 在Transfer组件中显示已绑定的集群（右侧列表）
2. **绑定状态展示**: 在仓库列表页面显示已绑定集群的详细信息
3. **数据一致性验证**: 与现有的 `getRegistryClusterBindings` API进行对比验证

**技术实现**:
- 服务文件: `src/services/registryService.ts`
- 类型定义: `src/types/index.ts` 中的 `OccupiedCluster` 接口
- 测试工具: `src/utils/testOccupiedClustersAPI.ts`

### 11.6 数据类型定义

**RegistryConfig**:
```typescript
interface RegistryConfig {
  id: number;
  name: string;
  repository_address: string;
  auth_type: 'none' | 'username_password' | 'token';
  auth_config: {
    username?: string;
    password?: string;
    token?: string;
  };
  manager_address?: string;
  cluster_number: number; // 绑定的集群数量
  status: string; // 连接状态："连接正常"、"未测试"、"连接失败"等
  created_at: string;
  updated_at: string;
  created_id: number;
  created_by: string;
}

interface RegistryConfigCreateUpdate {
  name: string;
  repository_address: string;
  auth_type: 'none' | 'username_password' | 'token';
  auth_config: {
    username?: string;
    password?: string;
    token?: string;
  };
  manager_address?: string;
}

interface AvailableCluster {
  id: number;
  name: string;
  api_server: string;
  status: 'online' | 'offline' | 'error';
  version?: string;
  node_number?: number;
  description?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

interface AvailableClustersQueryParams {
  name: string; // 仓库名称
  page?: number;
  size?: number;
}

// 已占用集群信息（新增）
interface OccupiedCluster {
  cluster_id: number;
  cluster_name: string;
  api_server?: string;
  status?: string;
  bound_at?: string;
  is_active?: boolean;
}
``` 