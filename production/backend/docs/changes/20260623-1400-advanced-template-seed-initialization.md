# 高级模板种子初始化改动审查

- 时间戳：20260623-1400
- 分支：conflict/dev-grpo-2
- 任务类型：新需求

## 行为改动摘要

新增高级模板种子初始化能力。系统初始化默认数据时，会按租户读取内置 YAML 文件，并通过高级模板 Service 生成 `GRPO 默认低资源lora模版`，用于前端渲染 GRPO `additional_params` 表单。

初始化具备幂等性：同一租户下已存在当前版本的同名 `training/grpo` 模板时跳过，不覆盖用户后续编辑生成的模板版本。

## 改动文件及原因

- `design/advanced_template_seed_architecture.md`：补齐本次范围的架构树、依赖关系和文件索引。
- `design/advanced_template_seed_initialization_design.md`：记录种子初始化设计、数据流、幂等策略和测试计划。
- `app/init_db/modules/advanced_templates/`：新增高级模板种子模块、元数据加载和 GRPO 默认 YAML。
- `app/init_db/modules/__init__.py`：注册 `AdvancedTemplateSeeder`。
- `app/init_db/init.py`、`app/init_db/__init__.py`：新增 `init_advanced_templates()` 和命令行入口。
- `app/init_db/manager.py`：修复单模块初始化时未向 Seeder 传入 session 的问题。
- `app/init_db/README.md`：补充高级模板初始化命令和模块说明。
- `app/services/advanced_template/advanced_template.py`：高级模板 Seeder 复用现有 YAML 创建逻辑，不扩展 Service 抽象接口。
- `tests/unit/init_db/test_advanced_template_seeder.py`：新增高级模板 Seeder 的聚焦单元测试。

## 架构影响

- 新增种子初始化层到高级模板 Service 的依赖：`AdvancedTemplateSeeder -> DefaultAdvancedTemplateService`。
- 高级模板业务规则仍集中在 `DefaultAdvancedTemplateService`，Seeder 只负责读取 YAML、枚举租户、幂等判断和调用时机。
- 模块文件索引已更新到 `design/advanced_template_seed_architecture.md`。

## 设计文档

- `design/advanced_template_seed_initialization_design.md`

## 根因和修复说明

本任务为新需求，不涉及 bug 根因。实现中让 `AdvancedTemplateSeeder.seed()` 兼容有 session 和无 session 两种调用方式，以贴合现有 `SeedManager.run_all(session)` 与 `run_single()` 结构。

## 已执行验证

```bash
python -m pytest -q tests\unit\services\test_advanced_template_service_helpers.py tests\unit\schemas\test_advanced_template_schema.py tests\unit\init_db\test_advanced_template_seeder.py
```

结果：13 passed。测试输出包含项目已有 Pydantic/DI deprecation warnings。

## 测试缺口

- 未连接真实数据库执行 `python -m app.init_db.init advanced_templates`。
- 未运行全量测试。
- 整体测试流程尚未定义。

## 人工审查清单

- 确认 GRPO 默认 YAML 字段是否覆盖当前前端需要展示的高级参数。
- 确认 `AdvancedTemplateSeeder` 在 `SEEDERS` 中的位置符合初始化顺序预期。
- 确认低资源 LoRA 默认参数符合当前 GRPO T4 场景预期。
