# GRPO 校验数据集路径覆盖修复

## 基本信息

- 时间：2026-06-18 09:34
- 分支：conflict/dev-grpo
- 类型：Bug 修复

## 行为改动摘要

GRPO 训练任务现在恢复支持从训练数据集中按比例切分验证集：

- 当 `evaluation.eval_use_split=true` 且没有独立 `eval_dataset_items` 时，后端会按 `evaluation.eval_split_ratio` 从训练样本中切出验证样本，分别生成 `train.parquet` 和 `test.parquet`。
- 当没有独立验证集且不启用切分时，后端会强制将 `data.val_files` 覆盖为训练集路径兜底，并强制关闭训练前验证与周期验证：

- `data.val_files=/data/datasets/train.parquet`
- `trainer.val_before_train=false`
- `trainer.test_freq=-1`

这样不会再把高级模板默认值里的 `~/data/rlhf/gsm8k/test.parquet` 之类路径带入实际 RayJob，也不会向 verl 传入 `null` 导致 `copy_to_local(None)` 报错。

## 根因和修复说明

`data.train_files` 已由后端强制覆盖为平台转换后的 `/data/datasets/train.parquet`，但 `data.val_files` 只有在存在 `_eval_parquet_path` 时才覆盖。GRPO 新链路此前只处理独立验证集，没有实现 `evaluation.eval_use_split` 的按比例切分；无独立验证集时，原逻辑只用 `setdefault` 设置验证相关参数，导致模板中的默认 `data.val_files` 残留。

修复点：

- `app/tasks/service/training/grpo_training_task.py`
  - 无 `_eval_parquet_path` 时强制设置 `data.val_files` 为训练集路径兜底。
  - 无验证集时强制设置 `trainer.val_before_train=False` 和 `trainer.test_freq=-1`。
  - `evaluation.eval_use_split=true` 时从训练 records 中按比例切分验证 records，并写出 `test.parquet`。
- `tests/unit/test_training_task_template_support.py`
  - 增加模板残留 `data.val_files=~/data/rlhf/gsm8k/test.parquet` 的回归覆盖。
  - 增加 GRPO records 按比例切分的回归覆盖。
- `design/grpo_training_design.md`
  - 补充 GRPO 验证集切分与无验证集时 `data.val_files` 使用训练集路径兜底的参数合成规则。

## 架构影响

不改变 GRPO 训练链路和数据转换流程，只修正 Hydra overrides 的平台强制覆盖行为。

## 验证

- `python -m py_compile app\tasks\service\training\grpo_training_task.py`
- `python -m pytest -q tests\unit\test_training_task_template_support.py -k "grpo_training_task_aligns or grpo_split_records"`

测试通过；输出中仍有项目已有的 Pydantic deprecation warnings。

## 人工审查清单

- 创建 `evaluation.eval_use_split=true` 的 GRPO 训练任务，确认生成 `train.parquet` 和 `test.parquet`，且 RayJob entrypoint 中 `data.val_files=/data/datasets/test.parquet`。
- 创建不带验证集且 `evaluation.eval_use_split=false` 的 GRPO 训练任务，确认 RayJob entrypoint 中 `data.val_files=/data/datasets/train.parquet`，且 `trainer.val_before_train=false`、`trainer.test_freq=-1`。
- 确认 `data.train_files=/data/datasets/train.parquet` 不受影响。
- 创建带独立验证集的 GRPO 训练任务，确认 `data.val_files=/data/datasets/test.parquet`。
