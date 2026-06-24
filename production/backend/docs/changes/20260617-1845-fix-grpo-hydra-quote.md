# GRPO Hydra 参数转义修复

## 基本信息

- 时间：2026-06-17 18:45
- 分支：conflict/dev-grpo
- 类型：Bug 修复

## 行为改动摘要

GRPO RayJob entrypoint 现在会对包含中文、空格等 Hydra 非安全字符的字符串参数做 Hydra 字符串转义，避免 `trainer.project_name`、`trainer.experiment_name` 等平台生成名称包含中文时触发 `LexerNoViableAltException`。

同时默认 verl 工作目录调整为当前 GRPO 镜像使用的 `/workspace/verl`，并在 entrypoint 中保留 `/home/ray/verl` fallback。

## 根因和修复说明

运行日志中的真正失败点是：

- `cd /home/ray/verl` 不存在，但命令继续执行，实际 `verl` 来自 `/workspace/verl`。
- `trainer.project_name=deepexilab-lab_dev-dev-demo-RFT-GRPO格式训练测试001` 被裸传给 Hydra，中文字符没有按 Hydra 字符串语法加引号，导致 Hydra 词法解析失败。

修复点：

- `app/tasks/service/training/grpo_training_task.py`
  - `_format_hydra_value` 对字符串增加 Hydra 安全字符判断。
  - 中文、空格等非安全字符串使用 JSON 风格双引号输出。
  - `[console,mlflow]` 这类 Hydra 列表表达式保持原样。
  - entrypoint 外层改为 `bash -lc <quoted-script>`，减少嵌套引号风险。
  - 工作目录默认使用 `/workspace/verl`，并 fallback 到 `/home/ray/verl`。
- `tests/unit/test_training_task_template_support.py`
  - 增加中文 `trainer.project_name` 的 entrypoint 构造回归测试。
- `design/grpo_training_design.md`
  - 补充 Hydra 字符串转义和工作目录 fallback 说明。

## 架构影响

不改变 GRPO 训练执行链路，仍由 KubeRay RayJob 调用 verl。改动只收敛在 RayJob entrypoint 参数生成阶段。

## 验证

- `python -m py_compile app\tasks\service\training\grpo_training_task.py`
- `python -m pytest -q tests\unit\test_training_task_template_support.py -k "grpo_entrypoint or grpo_training_task_aligns"`

测试通过；输出中仍有项目已有的 Pydantic deprecation warnings。

## 人工审查清单

- 使用中文任务名创建 GRPO 训练任务，确认 RayJob entrypoint 中 `trainer.project_name` 和 `trainer.experiment_name` 带双引号。
- 确认 `trainer.logger=[console,mlflow]` 仍按 Hydra list 传入。
- 使用 `lab-cn-guangzhou.cr.volces.com/fs/verl:v0.8.0-vllm` 镜像启动，确认工作目录进入 `/workspace/verl`。
