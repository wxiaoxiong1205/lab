# GRPO Runtime Env 同步到 RayJob 容器

## 基本信息

- 时间：2026-06-18 16:55
- 分支：conflict/dev-grpo
- 类型：Bug 修复

## 行为改动摘要

GRPO 训练任务现在会识别 `additional_params` 中的 Ray runtime env 参数：

```text
+ray_kwargs.ray_init.runtime_env.env_vars.<ENV_NAME>
```

这些参数会继续作为 Hydra override 传给 verl，同时后端会提取 `<ENV_NAME>` 并注入 RayJob submitter、head、worker 容器的 `env`。

示例：

```json
{
  "+ray_kwargs.ray_init.runtime_env.env_vars.VLLM_ATTENTION_BACKEND": "XFORMERS",
  "+ray_kwargs.ray_init.runtime_env.env_vars.VLLM_USE_V1": "1"
}
```

会生成容器环境变量：

```text
VLLM_ATTENTION_BACKEND=XFORMERS
VLLM_USE_V1=1
```

## 根因和修复说明

此前这类参数只进入 Hydra overrides，Ray init 可以看到，但 vLLM server actor 未必能在进程环境中读取到，导致 `VLLM_ATTENTION_BACKEND=XFORMERS` 没有稳定作用到 vLLMHttpServer。

修复点：

- `app/tasks/service/training/grpo_training_task.py`
  - `build_env` 从 `additional_params` 中提取 `ray_kwargs.ray_init.runtime_env.env_vars.*`。
  - 提取到的变量值统一转成字符串后合并到 RayJob 容器环境变量。
  - 原 Hydra override 保持不变。
- `tests/unit/test_training_task_template_support.py`
  - 增加 RayJob submitter/head/worker env 注入断言。
  - 保留 runtime env value 字符串转义回归覆盖。

## 架构影响

不改变 RayJob 结构，只扩展 GRPO RayJob 容器环境变量来源。普通训练任务不受影响。

## 验证

- `python -m py_compile app\tasks\service\training\grpo_training_task.py`
- `python -m pytest -q tests\unit\test_training_task_template_support.py -k "grpo_entrypoint or grpo_training_task_aligns"`

测试通过；输出中仍有项目已有的 Pydantic deprecation warnings。

## 人工审查清单

- 创建 GRPO 任务并传入 `+ray_kwargs.ray_init.runtime_env.env_vars.VLLM_ATTENTION_BACKEND=XFORMERS`。
- 确认 RayJob submitter、head、worker 容器 env 都包含 `VLLM_ATTENTION_BACKEND=XFORMERS`。
- 确认 RayJob entrypoint 中仍保留对应 Hydra override。
