---
description: 代码审核检查规范（DeepexiLab 项目）
globs:
alwaysApply: false
---

## 代码审核规范

本文件用于代码评审时的**可执行检查清单**（按本项目真实实现整理），覆盖 `Model / Schema / Repository(Mapper) / Service / API / 配置 / 安全与性能`。

## 0. 本项目关键约束（评审前先对齐）

- **依赖注入（DI）**：
  - 统一使用 `dependency_injector`：`@inject` + `Provide[AutoContainer.xxx_service]`
  - `AutoContainer` 会自动扫描 `app/api/v1` 下模块做 wiring；新增路由文件需位于 `app/api/v1/` 且**不要**以 `_DISABLED` 开头，否则不会被注入
  - Service 支持多实现：注入时会根据 `Settings.PROVIDER_TYPE` 选择实现；找不到则回退到 `Default*Service`
- **多租户（tenant）**：
  - 业务表统一继承 `app/models/models.py` 的 `baseModel`，内置 `tenant_id/created_at/updated_at/...`
  - `BaseMapper` 会在 `insert` 时自动写入 `tenant_id`，并在 `query/query_page/execute` 时尽量自动追加租户条件；评审时仍需关注是否有绕过点
- **配置读取**：
  - 配置入口统一在 `app/core/config.py` 的 `Settings`，业务代码应通过 `from app.core.config import settings` 使用
  - **禁止**在业务代码中直接使用 `os.getenv`
- **Schema 解析**：
  - 对外响应 Schema 推荐继承 `app/schemas/common.py::BaseModelWithTimezone`（其 `from_attributes=True`）

## 1. 问题分级（统一口径）

- **阻塞**：安全漏洞、租户隔离破坏、数据一致性风险、明显错误的事务处理、绕过 DI / 认证、明文敏感信息落日志
- **重要**：违反项目分层规范、可预见的性能问题（N+1/无分页/大数据一次性加载）、不一致的错误码与返回结构、重复造轮子
- **建议**：可读性、命名/注释、结构优化、日志噪音控制
- **可选**：更优实现方式（不影响正确性）

## 2. Model（数据模型层）

**位置**：`app/models/`

### 必须检查项（阻塞/重要）

- **继承与租户字段**（阻塞）：
  - 业务表必须继承 `baseModel`，确保包含 `tenant_id` 并遵守租户隔离
- **字段类型注解**（重要）：
  - 优先使用 `Mapped[类型]` + `Column(...)` 的 SQLAlchemy 2.0 风格
- **字段注释**（重要）：
  - 字段尽量补齐 `comment="中文说明"`（尤其是关键业务字段/枚举含义/状态字段）
- **不使用外键约束**（重要）：
  - 本项目倾向“应用层保证一致性”，表间关系用普通字段 + 代码校验（删除/更新需自行清理）
- **索引与唯一约束**（重要）：
  - 索引写在 `__table_args__`
  - 索引命名建议：`idx_{表名}_{字段}`；唯一约束建议：`uq_{表名}_{字段...}`
  - 多租户唯一性：如需“同租户内唯一”，应把 `tenant_id` 纳入唯一约束
- **字段命名**（重要）：
  - 数据库字段统一 `snake_case`（小写 + 下划线）

### 评审提示（本项目常见坑）

- **绕过 tenant 自动注入**：若直接 `session.execute(text("..."))`、拼接 SQL 或在 service 里自己写复杂查询，可能漏加 tenant 条件（阻塞）
- **联合唯一约束缺 tenant**：业务上要求同租户唯一时，必须把 `tenant_id` 纳入（重要）

## 3. Schema（Pydantic）

**位置**：`app/schemas/`

### 必须检查项（重要）

- **分离定义**：
  - Create / Update / Response 分开（例如 `ProjectCreate`、`ProjectUpdate`、`ProjectResponse`）
- **对外 API 字段校验**：
  - 使用 `Field(...)` 明确校验（长度、范围、枚举等）并补齐 `description`
- **可选字段**：
  - 使用 `Optional[T]` 表示可选，默认值为 `None`
- **响应 from_attributes**：
  - Response 推荐继承 `BaseModelWithTimezone`（其已设置 `from_attributes=True`）
  - 若不继承，则 `model_validate(obj, from_attributes=True)` 必须显式开启
- **校验错误信息中文化**：
  - 校验器/`model_validator` 抛出的 `ValueError` 信息使用中文，便于前端展示

## 4. Repository（Mapper 层）

**位置**：`app/repository/`

### 必须检查项（重要）

- **继承基类**：
  - 统一继承 `BaseMapper[T]`（本项目 Mapper 通常是“空壳”，例如 `class ProjectMapper(BaseMapper[Project]): pass`）
- **优先复用基类方法**：
  - 优先使用 `query / query_one / query_by_id / query_page / insert / delete / execute / commit / rollback / refresh`
  - 只有确实需要时才新增自定义查询方法
- **租户隔离**：
  - 读写尽量经由 `BaseMapper`，避免直接拿 `session` 做复杂操作绕过租户条件
- **事务边界清晰**：
  - Mapper 只负责数据访问；业务校验、跨表事务编排放在 Service

## 5. Service（业务服务层）

**位置**：`app/services/`

### 必须检查项（重要/阻塞）

- **接口与实现分离**（重要）：
  - `app/services/<domain>/interface.py` 定义接口（继承 `ABC`）
  - 默认实现类命名：`Default{Domain}Service`
  - 如有多实现：实现类名以 provider 前缀开头（例如 `BelleProjectService`），并确保能被 `AutoContainer` 选择（看 `Settings.PROVIDER_TYPE`）
- **事务处理**（阻塞）：
  - 写操作必须明确 `commit`
  - 需要返回 ORM 对象时：`commit -> refresh`
  - 异常分支必须 `rollback`（尤其是跨多表/外部调用混合的逻辑）
- **错误处理**（重要）：
  - HTTP 请求链路用 `HTTPException`；错误信息使用中文
  - 错误码需合理（资源不存在建议 404；冲突建议 409；参数错误建议 400/422）
- **多租户一致性**（阻塞）：
  - 不允许手动修改 `tenant_id`
  - 批量插入/裸 `insert` 时要确保 `tenant_id` 被写入（BaseMapper 的 insert 会补齐，但直接 executemany/insert 需手动带上）
- **日志**（重要）：
  - 关键业务动作打印中文日志（创建/删除/批量操作/外部系统调用）
  - 避免记录敏感信息（token、密码、密钥、harbor 密码等）

### 强制反模式（阻塞）

- 在业务代码中直接 `os.getenv(...)`（应改为 `settings.XXX`）
- 拼接 SQL/`text()` 拼接用户输入（SQL 注入风险）
- 循环里查库导致 N+1

## 6. API（路由层）

**位置**：`app/api/v1/`

### 必须检查项（重要/阻塞）

- **依赖注入**（重要）：
  - 必须使用 `@inject`
  - Service 必须通过 `Depends(Provide[AutoContainer.xxx_service])` 注入
- **认证与权限**（阻塞）：
  - 默认使用组合依赖 `Depends(get_db_and_user)`；管理员接口使用 `Depends(get_db_and_admin)`
- **状态码与响应模型**（重要）：
  - POST 创建：201
  - PUT 更新：200
  - DELETE 删除：204
  - 列表：优先分页（本项目使用 `fastapi-pagination`，响应模型通常为 `Page[T]`）
- **参数声明**（建议/重要）：
  - Query 参数用 `Query(...)`，Path 参数建议用 `Path(...)` 补齐描述与校验
- **文档字符串**（建议）：
  - 每个接口写中文 docstring，说明用途/权限要求/关键参数含义

## 7. 配置管理（重要/阻塞）

- **唯一来源**：`app/core/config.py::Settings` + 全局实例 `settings`
- **禁止**：在业务代码中直接使用 `os.getenv`
- **新增配置**：必须先在 `Settings` 中增加字段，再在业务代码引用 `settings.xxx`

## 8. 安全检查（阻塞/重要）

- **SQL 注入**（阻塞）：禁止拼接 SQL；ORM 查询用参数化条件
- **权限校验**（阻塞）：受保护接口必须走认证依赖；管理员能力必须走 `get_db_and_admin`
- **租户隔离**（阻塞）：任何读写都不能跨租户（尤其是 join/子查询/批量操作/原生 SQL）
- **敏感信息**（阻塞）：密码/Token/密钥/证书/harbor 密码等不得写日志、不得回包

## 9. 性能检查（重要）

- **N+1**：避免循环中查库，改为批量查询/Join
- **分页**：列表接口必须分页（或证明数据量恒小）
- **大数据/大文件**：体量大时用流式处理，避免一次性加载到内存
- **异步 IO**：IO 密集应使用 async（HTTP/K8s/文件等）

## 10. 提交前检查清单（建议复制到 PR 描述）

- [ ] 新增/修改的 API 已补齐 `response_model` 与合理状态码
- [ ] 认证接口使用 `get_db_and_user` / 管理员接口使用 `get_db_and_admin`
- [ ] Service 写操作均有 `commit`，异常分支有 `rollback`
- [ ] 返回 ORM 对象的写操作已 `refresh`
- [ ] 未新增 `os.getenv` 到业务代码（配置统一走 `settings`）
- [ ] 多租户相关查询/写入不绕过 `BaseMapper` 的租户机制
- [ ] 无敏感信息日志、无调试代码（print/breakpoint）
- [ ] 列表接口已分页，无明显 N+1
