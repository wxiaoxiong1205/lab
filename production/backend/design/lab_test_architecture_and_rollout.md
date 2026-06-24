# Lab 测试体系设计与落地方案

## 1. 背景

当前仓库已经具备比较清晰的分层结构：

- API 层：`app/api/v1`
- Service 层：`app/services`
- Repository/Mapper 层：`app/repository`
- Model/Schema 层：`app/models`、`app/schemas`
- Task 层：`app/tasks`
- 装配与依赖注入：`app/main.py`、`app/core/depend_manager.py`
- 多租户与上下文：`app/utils/app_runtime_context.py`、`app/utils/db_session_context.py`

现状问题也比较明确：

- 仓库已有 `pytest`、`pytest-asyncio`、`httpx` 依赖，但缺少统一测试底座
- `tests/` 目录几乎为空，当前只有少量零散测试文件
- 复杂业务规则主要集中在 service 层，外部依赖较多，回归风险高
- 多租户上下文、异步任务、存储/K8s/Notebook 等外部依赖使得“直接写接口测试”成本高且不稳定

因此，测试体系需要优先解决“如何稳定测试”，再逐步扩展覆盖面。

## 2. 目标

### 2.1 总体目标

建立一套贴合当前 Lab 架构的分层测试体系，覆盖以下能力：

- 规则校验：Pydantic schema、参数组合、状态流转、版本号生成
- 业务逻辑：service 层的核心分支、异常处理、外部依赖调用参数
- 路由契约：API 层的请求校验、响应格式、错误格式
- 异步任务：Celery task 的状态回写、异常分支、幂等行为
- 关键集成：多租户过滤、关键查询、分页与唯一约束

### 2.2 设计原则

- 以 service 测试为主，API 测试为辅，避免过度依赖真实外部环境
- 所有外部依赖默认使用 fake/mock/stub 替代，不直接连真实 K8s、JFS、Redis
- 测试目录与生产代码目录尽量镜像，方便维护
- 优先覆盖高复杂度、高频变更、高副作用模块
- 先搭底座，再逐模块复制模式扩展

## 3. 分层测试设计

### 3.1 Unit

适用对象：

- `app/schemas`
- 纯函数工具方法
- Service 内部的无副作用辅助方法

目标：

- 快速验证字段校验、组合规则、版本号生成、路径拼接等
- 作为最高性价比的第一层保护网

典型内容：

- `MlModelCreate` / `MlModelVersionCreate` 的 `source_type` 组合校验
- 版本号 `V9 -> V10 -> V11` 的递增逻辑
- 模型 URI 的租户前缀拼接

### 3.2 Service

适用对象：

- `app/services/*`

目标：

- 覆盖核心业务逻辑与异常分支
- mock mapper、storage、外部 service、Celery enqueue，只验证当前 service 的职责

典型内容：

- 机器学习模型创建/新增版本/失败后更新
- 训练数据集继承、版本冲突、关联校验
- 推理任务、评估任务的参数组合校验与任务创建分支

### 3.3 API

适用对象：

- `app/api/v1/*`

目标：

- 验证路由参数、请求体验证、统一错误响应格式、响应契约
- 不依赖真实鉴权与真实 service 实现

建议做法：

- 将目标路由临时加入 `PUBLIC_PATHS`，绕过真实鉴权/权限中间件
- 用 DI override 替换 `Provide[AutoContainer.xxx_service]`
- 用 `httpx.AsyncClient + ASGITransport` 调用 ASGI app，不触发后台 lifespan

### 3.4 Task

适用对象：

- `app/tasks/*`

目标：

- 验证 task 成功/失败状态回写
- 验证目录创建、复制调用参数、异常抛出
- 避免真正启动 Celery worker

### 3.5 Integration

适用对象：

- `repository` 关键查询
- 多租户过滤
- 聚合/分页/唯一约束

目标：

- 用真实数据库验证关键 SQL 语义
- 不追求全量集成，只覆盖最容易失真的查询

## 4. 推荐目录结构

```text
tests/
  conftest.py
  api/
    v1/
      test_model_api.py
  unit/
    schemas/
      test_ml_model_schema.py
    services/
      test_ml_model_service_helpers.py
  service/
    model/
  task/
  integration/
```

说明：

- 第一阶段不强行一次性铺满所有目录
- 先搭 `conftest.py + api/unit` 模板，后续按模块扩展

## 5. 统一测试底座设计

### 5.1 `pytest.ini`

职责：

- 统一 `asyncio_mode`
- 固定测试发现路径
- 约束文件命名模式

### 5.2 `tests/conftest.py`

职责：

- 提供统一 `mock_user`
- 提供多租户上下文清理
- 提供测试 app / async client
- 提供 DI override 能力
- 提供公开路由豁免，绕过真实鉴权

### 5.3 外部依赖替身策略

- `StorageService`：fake 或 stub `JUICEFS_CLIENT`
- `Celery`：stub `apply_async`
- `Notebook/K8s/ModelScope`：service mock
- `Mapper`：service 测试优先 mock，不接真实 DB

## 6. 优先级与阶段划分

### 第一阶段：测试底座 + ML 模型模板

范围：

- `pytest.ini`
- `tests/conftest.py`
- `tests/unit/schemas/test_ml_model_schema.py`
- `tests/unit/services/test_ml_model_service_helpers.py`
- `tests/api/v1/test_model_api.py`

目标：

- 跑通一套可复用的测试模式
- 先覆盖 ML 模型这条高频变更链路

### 第二阶段：扩展到高风险业务域

范围：

- `training_dataset`
- `inference_task`
- `inference_result`
- `evaluation_task`

目标：

- 把核心业务模块的参数校验与主逻辑补齐

### 第三阶段：任务与关键集成

范围：

- `model_storage_tasks`
- `training_tasks`
- `dataset_processing_tasks`
- 多租户过滤与关键仓储查询

## 7. 首批建议覆盖点

### 7.1 ML 模型 Schema

- notebook 来源缺少 `notebook_id`
- notebook 文本模型缺少 `tokenizer_source_ref`
- local_upload 缺少 `upload_id`
- local_upload 错传 notebook 字段

### 7.2 ML 模型 Service

- 版本号数字递增
- 历史脏数据兜底
- 租户前缀 URI 拼接
- response 构建时优先使用上下文或模型自身 tenant

### 7.3 ML 模型 API

- 创建模型成功
- 请求体校验失败返回统一 `{msg, request_id}`
- 新增版本成功
- 新增版本参数非法时返回 400

## 8. 本次已开始落地的内容

本轮开始落地以下内容：

- 新增测试配置文件 `pytest.ini`
- 新增全局测试底座 `tests/conftest.py`
- 新增 ML 模型 schema 层测试
- 新增 ML 模型 service 辅助方法测试
- 新增 ML 模型 API 契约测试

## 9. 后续执行建议

建议按照以下顺序继续推进：

1. 以 ML 模型测试为样板，沉淀 fixture 和 mock 约定
2. 将同样模式复制到 `training_dataset` 与 `inference_task`
3. 再进入 task 与 integration
4. 最后再考虑覆盖率门槛与 CI 接入

## 10. 风险与约束

- 当前 `app.main` 启动时装配较重，不建议在测试中触发完整 lifespan
- 中间件链较复杂，API 测试应绕开真实鉴权与权限逻辑，只测路由契约
- 多租户上下文若不统一清理，测试极易互相污染
- 现有代码大量依赖全局上下文和外部服务，service 测试必须严格 mock 依赖

## 11. 完成标准

第一阶段完成标准：

- `pytest -q` 可稳定发现并运行新增测试
- ML 模型具备 schema/service/api 三层示例测试
- 后续模块可按现有模板继续扩展，无需重复设计测试底座
