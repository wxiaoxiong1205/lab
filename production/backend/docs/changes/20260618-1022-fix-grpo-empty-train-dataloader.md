# GRPO 空训练 Dataloader 修复

## 基本信息

- 时间：2026-06-18 10:22
- 分支：conflict/dev-grpo
- 类型：Bug 修复

## 行为改动摘要

GRPO 训练任务在生成 Parquet 后会记录训练样本数，并在合成 verl Hydra overrides 时对小样本场景做 batch 参数兜底：

- `data.train_batch_size` 不再允许大于训练样本数。
- 如果存在 `data.gen_batch_size` 且大于训练样本数，也会同步收缩。
- `actor_rollout_ref.actor.ppo_mini_batch_size` 和 `actor_rollout_ref.actor.ppo_micro_batch_size_per_gpu` 会随安全训练 batch 收缩。
- 收缩后的 `data.train_batch_size * actor_rollout_ref.rollout.n` 必须能被 worker 总 GPU 数整除；无法得到有效值时提前返回中文错误。

## 根因和修复说明

verl 的 `RayPPOTrainer` 创建训练 dataloader 时使用 `data.gen_batch_size` 或 `data.train_batch_size`，且 `drop_last=True`。当过滤后的训练数据只有 1 条，而模板里仍使用 `data.train_batch_size=128` 或 `64` 时，dataloader 长度会变成 0，触发：

```text
AssertionError: Train dataloader is empty!
```

修复点：

- `app/tasks/service/training/grpo_training_task.py`
  - 记录 `_train_record_count`。
  - 新增 `_normalize_train_batch_overrides`，在提交 RayJob 前修正小样本 batch 参数。
  - 新增整除校验，避免继续触发 verl 的 batch/GPU 数约束错误。
- `tests/unit/test_training_task_template_support.py`
  - 增加 1 条训练样本、模板大 batch 参数的回归覆盖。
- `design/grpo_training_design.md`
  - 补充 GRPO batch 参数兜底规则。

## 架构影响

不改变 GRPO RayJob 结构，只在 GRPO 训练参数合成阶段增加数据量相关的内部兜底逻辑。

## 验证

- `python -m py_compile app\tasks\service\training\grpo_training_task.py`
- `python -m pytest -q tests\unit\test_training_task_template_support.py -k "grpo_training_task_aligns or grpo_split_records"`

测试通过；输出中仍有项目已有的 Pydantic deprecation warnings。

## 人工审查清单

- 使用 1 条 GRPO demo 数据创建训练任务，确认 entrypoint 中 `data.train_batch_size=1`。
- 确认同一任务中 `actor_rollout_ref.actor.ppo_mini_batch_size=1`、`actor_rollout_ref.actor.ppo_micro_batch_size_per_gpu=1`。
- 使用正常大数据集创建训练任务，确认用户配置的 batch 未被无故收缩。
