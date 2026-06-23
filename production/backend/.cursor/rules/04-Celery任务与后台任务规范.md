---
description: "Celery/后台任务规范：任务边界、幂等、重试、数据库会话与资源管理"
globs:
  - "app/tasks/**"
  - "celery_worker.py"
  - "unified_manager.py"
alwaysApply: false
---


## 任务设计（强制）

- **幂等性**：同一任务被重复投递/重试时，结果必须可预测（避免重复写数据/重复创建资源）。
- **可观测性**：关键步骤必须有结构化日志（不含敏感信息），能定位任务输入、阶段与错误原因。
- **资源边界**：任务里避免长时间占用连接/锁；外部调用必须设置超时与重试策略。

## 数据库会话（强制）

- 任务/脚本场景优先使用 `app/database/base.py:get_db_session()` 提供的会话封装，避免事件循环冲突。
- 禁止在任务里混用“异步引擎连接对象”与 `asyncio.run()`。

### Celery 任务的 async 调用方式（允许但有约束）

本项目存在“Celery task 必须是同步函数 → 内部用 `asyncio.run()` 执行异步实现”的写法（见 `app/tasks/**`）。规则补充：

- **允许**：在 Celery worker 里使用 `asyncio.run()` 启动单次异步流程（通常 worker 进程没有常驻事件循环）
- **强制**：只要出现 `asyncio.run()`，DB 会话必须来自 `app.database.base.get_db_session()`（同步引擎 + `AsyncCompatibleSession`），不要使用 `AsyncSessionLocal()` 直接创建异步会话
- **强制**：同一任务内不要混用两套 DB 会话来源（详见 `03-数据库与多租户规范.md`）

## Celery 配置约束

- Celery app 位于 `app/tasks/celery_app.py`，包含的任务模块需在该文件 `include` 中维护。
- 新增任务文件后：
  - 确保任务模块可被 import（避免循环依赖）
  - 必要时把模块加入 `include`

## 失败处理

- **明确失败语义**：哪些错误应重试、哪些应快速失败并报警。
- **回滚/补偿**：涉及多步外部资源创建（K8s/存储/镜像仓库等）时，要么事务化，要么提供补偿逻辑。


