---
description: "FastAPI 接口开发规范：路由组织、校验、返回、分页与中间件"
globs:
  - "app/main.py"
  - "app/api/v1/**"
  - "app/schemas/**"
alwaysApply: false
---

## 路由与依赖

- **路由文件位置**：优先放在 `app/api/v1/`，并在 `app/main.py` 中 `include_router` 注册。
- **依赖注入**：
  - 优先用组合依赖（例如 DB + 当前用户），避免在路由中手写重复逻辑
  - 使用依赖注入容器注入 Service（项目使用 `AutoContainer` + `dependency-injector` 的模式）
- **路由层只做编排**：参数校验、权限检查、调用 service、组装返回；复杂业务逻辑进 `services`。

## 数据库会话（请求链路必读）


- **公开路由（如 `/api/v1/users/login/register` 等）**：
  - 由于会绕过 `auth_middleware`，必须使用 `db: AsyncSession = Depends(get_db)`（或使用 `get_db_and_user` 的变体，如后续新增公开但需要用户信息时）
- **需要认证的常规路由（推荐新代码）**：
  - 优先使用组合依赖 `deps = Depends(get_db_and_user)`（见 `app/utils/dependencies.py`），并把 `db` 显式下传到 service/repo
- **遗留兼容（不鼓励新增）**：
  - 如果某条调用链依赖 `BaseMapper` 从上下文获取 session（`app/utils/db_session_context.py`），则路由层不要再额外创建第二个 `db` 并混用
- **强制**：同一个接口实现里，避免同时出现“`Depends(get_db)` 注入的 db”与“仓储从 ContextVar 取的 db”交叉读写；确需混用必须在 PR 中说明理由与事务一致性证明（详见 `03-数据库与多租户规范.md`）

## 参数校验与错误返回

- **Pydantic v2**：请求/响应结构统一用 `app/schemas/` 定义。
- **校验错误一致性**：不要自定义“另一套”校验错误格式；参考 `app/main.py` 的 `validation_exception_handler` 行为保持一致。
- **异常处理**：业务异常建议在 service 层抛出明确异常（可包含错误码/可读信息），由路由层或统一处理器转成 HTTP 响应。
- **提示文案**：面向用户的错误信息使用中文，且不要暴露系统敏感细节。

## 分页与返回结构

- 项目已启用 `fastapi-pagination`（见 `app/main.py:add_pagination`）。
- **新增列表接口**时，优先采用分页返回（避免一次返回全量数据）。
- **返回值稳定**：字段命名与类型要向后兼容；新增字段尽量可选或提供默认值。

## HTTP 状态码（强制）

- **POST**：`201 Created`
- **DELETE**：`204 No Content`
- **GET/PUT/PATCH**：`200 OK`
- **资源不存在**：`404`
- **资源冲突（如名称重复）**：`409`

## 中间件与请求上下文

- 项目存在认证/透传 token / 请求日志中间件链（见 `app/main.py`）。
- **禁止**在路由里手动解析 token 并绕过中间件；需要上下文信息优先从既有工具/依赖获取。
- **日志**：避免记录敏感信息（token、密码、密钥、用户隐私数据）。


