# GRPO 训练能力设计文档

## 一、目标

新增 `training_method_type=grpo` 训练能力。GRPO 固定使用 `verl` 框架，通过 KubeRay `RayJob` 执行，不复用 LlamaFactory 训练执行链路。

相关边界：

1. 高级模板是平台通用模块，GRPO 只是 `domain=training`、`template_type=grpo` 的一种模板类型。
2. 模板管理详见 [高级模板管理模块设计文档](./advanced_template_module_design.md)，训练任务记录 `advanced_template_id` 指向具体模板版本行，用于前端回显和表单渲染；训练执行不依赖模板定义。
3. GRPO 文本数据集上传支持 JSON、JSONL、XLSX，平台内部统一归一化为 JSONL，训练前转换为 Parquet。
4. Ray submitter、head 和 worker 资源必须分开配置。
5. CPU、内存、GPU、worker 副本数属于资源配置，不属于模板参数。
6. GRPO 奖励函数通过平台已有分片上传能力接入，训练任务只保存上传 ID。

---

## 二、与现有训练链路差异

| 维度 | SFT/DPO | GRPO |
|------|---------|------|
| 训练框架 | LlamaFactory | verl |
| K8s 资源 | Kubernetes Job | KubeRay RayJob |
| 启动命令 | `llamafactory-cli train` | `python -m verl.trainer.main_ppo` |
| 配置形式 | YAML | Hydra overrides |
| 分布式 | 单 Job Pod 或 torchrun | Ray head + Ray worker |
| 数据源 | 平台混合数据集 | JSON/JSONL/XLSX 归一化为 JSONL 后转 Parquet |

GRPO 不进入 LlamaFactory 配置转换器，避免被错误映射为 LlamaFactory `stage`。

---

## 三、创建任务参数

创建 GRPO 任务可以继续使用现有训练任务创建/编辑接口，但不能直接沿用 LlamaFactory 路线的必填参数校验。GRPO 自定义训练参数使用现有 `additional_params` 字段承载，结构为简单 key/value map。

现有链路确认：

1. `training_tasks.additional_params` 是 JSON 列，会在创建任务时写入数据库。
2. 编辑任务时会全量覆盖 `training_task.additional_params`。
3. `TaskExecution.kwargs.task_payload` 使用 `task.model_dump(mode='json')`，会带上同一份 `additional_params`。
4. 任务详情/版本列表通过 `TrainingTaskResponse` 返回 `additional_params`，保持 map 结构。
5. 创建/编辑接口的响应模型是精简响应，只返回任务元信息，不返回完整训练参数。
6. `training_tasks.reward_function_upload_id` 保存 GRPO 奖励函数上传 ID，不放入 `additional_params`。
7. `training_tasks.advanced_template_id` 保存本次创建/编辑使用的高级模板版本 ID，用于详情回显时前端按该版本字段定义渲染 `additional_params`。
8. `advanced_template_task_references` 记录任务与模板版本的引用关系，便于模板模块判断旧版本是否已被任务使用。

实现处理：

1. `TrainingMethodType` 新增 `grpo`。
2. `TrainingTaskCreate` 对 GRPO 放开 `data_processing`、`basic`、`advanced`、`evaluation`、`save`、`monitor` 等 LlamaFactory 专用字段。
3. 创建/编辑 service 按 GRPO 分流，LlamaFactory 字段使用空对象/空列表占位，资源配置写入 `ray_resource_config`。
4. Celery 旧链路在入口处按 `train_method_type=grpo` 分流，GRPO 跳过 LlamaFactory 数据集、YAML 和 Kubernetes Job。

因此 GRPO 接入需要在 API schema、service 创建/编辑、Celery 执行三层按 `train_method_type=grpo` 分流。GRPO 不传 LlamaFactory 专用字段时不应报错；非 GRPO 训练仍保持现有必填校验。

### 3.1 完整 GRPO 创建任务请求样例

接口：

```http
POST /api/v1/training_tasks/project/1001
Content-Type: application/json
```

请求体：

```json
{
  "name": "qwen2.5-0.5b-grpo-gsm8k",
  "description": "使用 verl + KubeRay 执行 GRPO 训练",
  "project_id": 1001,
  "version": "v1",
  "advanced_template_id": 5001,
  "base_model": {
    "base_model_id": 2001,
    "base_model_name": "Qwen2.5-0.5B-Instruct",
    "model_provider": "Qwen",
    "template": "qwen"
  },
  "training_type": {
    "train_type_category": "text-generation",
    "train_method_type": "grpo",
    "fine_tuning_type": "full"
  },
  "dataset_items": [
    {
      "dataset_id": 3001,
      "name": "gsm8k-grpo-train",
      "version": "v1",
      "dataset_path": "/deepexilab-1001/training/datasets/gsm8k_grpo_train.jsonl",
      "character_count": 1200000,
      "sample_count": 8000,
      "sampling_rate": 1.0,
      "weight_in_total": 100.0
    }
  ],
  "eval_dataset_items": [
    {
      "dataset_id": 3002,
      "name": "gsm8k-grpo-val",
      "version": "v1",
      "dataset_path": "/deepexilab-1001/training/datasets/gsm8k_grpo_val.jsonl",
      "character_count": 120000,
      "sample_count": 800,
      "sampling_rate": 1.0,
      "weight_in_total": 100.0
    }
  ],
  "additional_params": {
    "algorithm.adv_estimator": "grpo",
    "actor_rollout_ref.rollout.name": "vllm",
    "actor_rollout_ref.rollout.n": 4,
    "actor_rollout_ref.rollout.tensor_model_parallel_size": 1,
    "actor_rollout_ref.rollout.gpu_memory_utilization": 0.6,
    "actor_rollout_ref.rollout.log_prob_micro_batch_size_per_gpu": 4,
    "actor_rollout_ref.actor.ppo_mini_batch_size": 64,
    "actor_rollout_ref.actor.ppo_micro_batch_size_per_gpu": 4,
    "actor_rollout_ref.actor.use_kl_loss": true,
    "actor_rollout_ref.actor.kl_loss_coef": 0.001,
    "actor_rollout_ref.ref.log_prob_micro_batch_size_per_gpu": 4,
    "trainer.val_before_train": false,
    "trainer.total_epochs": 1,
    "trainer.save_freq": 1,
    "trainer.test_freq": -1,
    "data.train_batch_size": 64,
    "data.max_prompt_length": 1024,
    "data.max_response_length": 1024
  },
  "reward_function_upload_id": "upload_grpo_reward_20260609_0001",
  "ray_resource_config": {
    "submit_graphics_card_resource": {
      "card_type": "CPU",
      "card_model": "CPU",
      "count": 0,
      "card_memory": null,
      "k8s_resource_type": null,
      "cpu_request": 1,
      "cpu_limit": 2,
      "memory_request": 2,
      "memory_limit": 4
    },
    "head_graphics_card_resource": {
      "card_type": "CPU",
      "card_model": "CPU",
      "count": 0,
      "card_memory": null,
      "k8s_resource_type": null,
      "cpu_request": 2,
      "cpu_limit": 4,
      "memory_request": 16,
      "memory_limit": 16
    },
    "worker_replicas": 1,
    "worker_graphics_card_resource": {
      "card_type": "GPU",
      "card_model": "A800",
      "count": 2,
      "card_memory": "80GB",
      "k8s_resource_type": "nvidia.com/gpu",
      "cpu_request": 2,
      "cpu_limit": 4,
      "memory_request": 16,
      "memory_limit": 512
    }
  }
}
```

上面的请求是 GRPO 的最小完整业务形态：

1. 不传 `basic`、`advanced`、`lora_config`、`dpo_config`、`evaluation`、`save`、`monitor`、`deepspeed`，这些属于 LlamaFactory 路线。
2. `advanced_template_id` 只用于回显和前端按模板字段定义渲染表单；该 ID 指向具体模板版本，后端不根据模板反推训练参数。
3. `dataset_items` 和 `eval_dataset_items` 传平台训练数据集信息；后端会把 GRPO JSONL 转成 Parquet 后再注入 verl。
4. `eval_dataset_items` 可为空；当 `evaluation.eval_use_split=true` 时，后端会按 `evaluation.eval_split_ratio` 从训练数据中切分验证样本并生成 `test.parquet`；当没有独立验证集且不启用切分时，后端会将 `data.val_files` 覆盖为训练集路径兜底，并强制注入 `trainer.val_before_train=false`、`trainer.test_freq=-1`，避免模板默认校验集路径残留和 verl `None` 路径报错。
5. `reward_function_upload_id` 可为空；为空时不注入自定义奖励函数路径。
6. `ray_resource_config` 是资源配置，不能放进模板，也不能放进 `additional_params`，其中 submitter/head/worker 资源需要分开传入。

### 3.2 additional_params 与平台强制覆盖参数

前端按模板渲染后，提交给后端的 GRPO 训练参数只是一层 key/value map：

```json
{
  "additional_params": {
    "algorithm.adv_estimator": "grpo",
    "actor_rollout_ref.rollout.name": "vllm",
    "actor_rollout_ref.rollout.n": 4,
    "actor_rollout_ref.rollout.gpu_memory_utilization": 0.6,
    "actor_rollout_ref.actor.kl_loss_coef": 0.001,
    "trainer.total_epochs": 1
  }
}
```

说明：

1. 前端可以根据高级模板渲染表单，但提交到训练任务接口时只提交 `additional_params` 扁平 map。
2. 后端保存具体模板版本的 `advanced_template_id`，不保存模板字段快照；模板编辑会生成新的模板行和字段行，旧任务继续用旧 `template_id` 查询旧字段。
3. 后端不在训练任务创建/编辑阶段根据模板生成或校验 `additional_params`。
4. `additional_params` 的 key 使用 verl Hydra override 名称，例如 `trainer.total_epochs`。
5. `additional_params` 的 value 保持 JSON 原始类型，例如 string、number、boolean。
6. `ray_resource_config` 不进入模板模型，也不进入 `additional_params`。
7. `submit_graphics_card_resource` 表示 RayJob submitter Pod 资源，submitter 负责提交作业，也会占用集群 CPU/内存。
8. `worker_replicas` 表示 Ray worker Pod 数量。
9. `worker_graphics_card_resource.count` 表示每个 worker Pod 的 GPU 数量。
10. `reward_function_upload_id` 是 GRPO 专用字段，来源于分片上传合并后的 `upload_id`。

---

## 四、资源推导规则

Ray submitter、head 和 worker 资源分开：

| 项 | 来源 | 说明 |
|----|------|------|
| submitter CPU/内存 | `submit_graphics_card_resource` | RayJob 提交 Pod，负责提交入口命令 |
| submitter GPU | `submit_graphics_card_resource.count` | 默认 `0` |
| head CPU/内存 | `head_graphics_card_resource` | Ray 控制面和 driver |
| head GPU | `head_graphics_card_resource.count` | 默认 `0` |
| worker 副本数 | `ray_resource_config.worker_replicas` | 多机数量 |
| worker GPU 数 | `worker_graphics_card_resource.count` | 每个 worker Pod 的 GPU 数 |
| worker GPU key | `worker_graphics_card_resource.k8s_resource_type` | 例如 `nvidia.com/gpu` |

内部推导：

| 内部字段 | 计算方式 |
|----------|----------|
| `__worker_replicas` | `ray_resource_config.worker_replicas` |
| `__worker_gpus_per_node` | `worker_graphics_card_resource.count` |
| `__total_worker_gpus` | `__worker_replicas * __worker_gpus_per_node` |
| `__trainer_nnodes` | `__worker_replicas` |
| `__trainer_n_gpus_per_node` | `__worker_gpus_per_node` |

写入 verl Hydra overrides：

```text
trainer.nnodes=<worker_replicas>
trainer.n_gpus_per_node=<worker_graphics_card_resource.count>
```

---

## 五、GRPO 数据集

### 5.1 源格式

GRPO 文本数据集上传支持 JSON、JSONL、XLSX。进入训练链路前，平台统一归一化为 JSONL。JSONL 每行是一条样本：

```json
{
  "data_source": "openai/gsm8k",
  "prompt": [
    {
      "role": "user",
      "content": "Natalia sold clips to 48 of her friends in April..."
    }
  ],
  "ability": "math",
  "reward_model": {
    "style": "rule",
    "ground_truth": "72"
  },
  "extra_info": {
    "split": "train",
    "index": 0
  }
}
```

必填字段：

1. `data_source`
2. `prompt`
3. `reward_model`
4. `reward_model.style`
5. `reward_model.ground_truth`

### 5.2 转换规则

训练前由 Celery 将 JSONL 转为 Parquet：

```text
custom_dataset.jsonl -> train.parquet
custom_eval_dataset.jsonl -> test.parquet
```

规则：

1. 一行 JSONL 转为 Parquet 一行。
2. `prompt` 保持 messages 数组，不拼接字符串。
3. `reward_model`、`extra_info` 保持结构对象。
4. 转换前逐行校验 JSON，错误需返回行号。
5. `data.train_files` 由平台强制覆盖为转换后的训练 Parquet 路径；`data.val_files` 有独立验证集或按比例切分验证集时覆盖为验证 Parquet 路径，没有验证集时覆盖为训练 Parquet 路径兜底，并关闭验证触发。

---

## 六、参数合成结果

GRPO 启动前，后端根据 `additional_params`、Ray 资源和平台路径生成 verl Hydra overrides。任务记录中的 `advanced_template_id` 指向具体模板版本，只用于前端回显和表单渲染，不参与后端参数合成。

核心输出：

```json
{
  "domain": "training",
  "template_type": "grpo",
  "engine": "verl",
  "executor": "rayjob",
  "internal": {
    "__worker_replicas": 2,
    "__worker_gpus_per_node": 2,
    "__total_worker_gpus": 4
  },
  "runtime": {
    "ray_version": "2.41.0",
    "working_dir": "/workspace/verl",
    "image": "lab-cn-guangzhou.cr.volces.com/fs/verl:v0.8.0-vllm"
  },
  "additional_params": {
    "algorithm.adv_estimator": "grpo",
    "actor_rollout_ref.rollout.name": "vllm",
    "actor_rollout_ref.rollout.n": 4,
    "trainer.total_epochs": 1
  },
  "outputs": {
    "hydra_overrides": {
      "algorithm.adv_estimator": "grpo",
      "data.train_files": "/data/datasets/train.parquet",
      "data.val_files": "/data/datasets/test.parquet",
      "reward.custom_reward_function.path": "/data/configs/reward_function.py",
      "reward.custom_reward_function.name": "compute_score",
      "trainer.nnodes": 2,
      "trainer.n_gpus_per_node": 2
    }
  }
}
```

平台强制覆盖字段：

1. `actor_rollout_ref.model.path`
2. `data.train_files`
3. `data.val_files`
4. `trainer.default_local_dir`
5. `trainer.nnodes`
6. `trainer.n_gpus_per_node`
7. `algorithm.adv_estimator`
8. `reward.custom_reward_function.path`

当 `additional_params` 中包含上述字段时，以平台推导值为准。

批大小兜底规则：

1. verl 的训练 dataloader 使用 `data.gen_batch_size` 或 `data.train_batch_size` 作为 batch size，并且 `drop_last=true`。
2. 当过滤后的训练样本数小于 batch size 时，verl 会得到空 dataloader 并报 `Train dataloader is empty!`。
3. GRPO 任务生成 Parquet 后，后端记录训练样本数，并在 Hydra overrides 合成阶段将 `data.train_batch_size` 收缩到不大于训练样本数的最大可用值。
4. 收缩后的 `data.train_batch_size * actor_rollout_ref.rollout.n` 必须能被 worker 总 GPU 数整除；如果无法得到有效值，后端提前返回中文错误。
5. 若 `data.gen_batch_size` 大于训练样本数，也同步收缩到安全值。
6. 若 `actor_rollout_ref.actor.ppo_mini_batch_size` 大于安全训练 batch，也同步收缩；`actor_rollout_ref.actor.ppo_micro_batch_size_per_gpu` 大于 mini batch 时同步收缩。

生成 entrypoint 时需要同时处理 shell 转义和 Hydra 字符串转义。包含中文、空格等 Hydra 非安全字符的字符串值必须转成带引号的 Hydra 字符串，例如 `trainer.project_name="中文实验名"`；`[console,mlflow]` 这类 Hydra 列表表达式保持原样。

`additional_params` 中以 `+ray_kwargs.ray_init.runtime_env.env_vars.` 开头的 key 表示 Ray runtime env 环境变量。后端需要保留该 Hydra override，并同步提取变量名和值注入 RayJob submitter、head、worker 容器的 `env`。例如 `+ray_kwargs.ray_init.runtime_env.env_vars.VLLM_ATTENTION_BACKEND="XFORMERS"` 会额外生成容器环境变量 `VLLM_ATTENTION_BACKEND=XFORMERS`，保证 vLLM server actor 也能读取。

---

## 七、奖励函数

GRPO 支持自定义奖励函数。前端先使用平台已有分片上传接口上传 Python 文件，合并完成后将 `upload_id` 作为 `reward_function_upload_id` 传入训练任务。

### 7.1 文件要求

奖励函数文件要求：

1. 文件后缀为 `.py`。
2. 文件使用 UTF-8 编码。
3. 顶层定义 `compute_score` 函数。
4. `compute_score` 至少能接收 `solution_str` 或兼容命名 `model_output`。
5. `compute_score` 至少能接收 `ground_truth`。
6. 建议支持 `data_source`、`extra_info` 和 `**kwargs`，便于多数据源和外部配置扩展。

样例文件路径：

```text
scripts/grpo/reward/reward_function.py
```

样例主题为外部请求评分：`compute_score` 从模型输出中提取答案，请求外部 URL 获取响应；外部服务可以直接返回 `score`，也可以返回 `answer`/`expected_answer` 后由奖励函数对比得到分数。请求报错需打印日志并返回 `0.0`。

### 7.2 辅助接口

奖励函数辅助接口：

| 接口 | 说明 |
|------|------|
| `POST /api/v1/training_tasks/grpo/reward-function/validate` | 通过 `upload_id` 校验奖励函数文件 |
| `GET /api/v1/training_tasks/grpo/reward-function/sample` | 下载奖励函数样例 |

校验接口只做静态校验，不执行用户上传代码。校验内容包括上传会话是否完成、文件是否存在、后缀、编码、Python AST 语法、`compute_score` 函数和参数兼容性。

### 7.3 运行时处理

训练提交前，后端根据 `reward_function_upload_id` 查询 `chunk_upload_sessions.file_url`，校验源文件后复制到任务配置目录：

```text
/{namespace}/training/task/task_{task_id}/config/reward_function.py
```

RayJob 将任务配置目录挂载到容器：

```text
/data/configs
```

并强制注入 verl Hydra overrides：

```text
reward.custom_reward_function.path=/data/configs/reward_function.py
reward.custom_reward_function.name=compute_score
```

未传 `reward_function_upload_id` 时，不注入自定义奖励函数路径，保持 verl 默认奖励逻辑。

---

## 八、RayJob 生成

RayJob 由平台生成，不允许用户直接提交完整 YAML。

关键模板：

```yaml
apiVersion: ray.io/v1
kind: RayJob
metadata:
  name: training-grpo-<task_id>
  namespace: <namespace>
  labels:
    deepexilab_k8s_uuid: <uuid>
    deepexilab_log_record: "true"
    kueue.x-k8s.io/queue-name: <queue>
spec:
  shutdownAfterJobFinishes: true
  ttlSecondsAfterFinished: 300
  entrypoint: <generated-entrypoint>
  rayClusterSpec:
    rayVersion: "2.41.0"
    headGroupSpec:
      rayStartParams:
        dashboard-host: "0.0.0.0"
        num-gpus: "0"
      template:
        spec:
          containers:
            - name: ray-head
              image: <verl-image>
              resources:
                requests:
                  cpu: "<head.cpu_request>"
                  memory: "<head.memory_request>Gi"
                limits:
                  cpu: "<head.cpu_limit>"
                  memory: "<head.memory_limit>Gi"
    workerGroupSpecs:
      - groupName: gpu-workers
        replicas: <worker_replicas>
        minReplicas: <worker_replicas>
        maxReplicas: <worker_replicas>
        template:
          spec:
            containers:
              - name: ray-worker
                image: <verl-image>
                resources:
                  requests:
                    cpu: "<worker.cpu_request>"
                    memory: "<worker.memory_request>Gi"
                    <gpu_resource_key>: "<worker_gpu_count>"
                  limits:
                    cpu: "<worker.cpu_limit>"
                    memory: "<worker.memory_limit>Gi"
                    <gpu_resource_key>: "<worker_gpu_count>"
```

entrypoint：

```bash
bash -lc "
cd ${working_dir};
python -c 'import verl; print(verl.__file__)';
python -m verl.trainer.main_ppo ${hydra_overrides}
"
```

默认 verl 工作目录为 `/workspace/verl`，并保留 `/home/ray/verl` fallback，以兼容不同 GRPO 镜像目录结构。

---

## 九、存储与输出

| 用途 | 容器路径 |
|------|----------|
| 基础模型 | `/data/models/base_models/...` |
| 训练数据 | `/data/datasets/train.parquet` |
| 验证数据 | `/data/datasets/test.parquet` |
| 输出目录 | `/data/models/finetuned_models/...` |
| 配置摘要 | `/data/configs/training_config.yaml` |
| 奖励函数 | `/data/configs/reward_function.py` |

verl checkpoint 通常为：

```text
global_step_1/
latest_checkpointed_iteration.txt
```

检查点接口需要支持 `global_step_*`。

---

## 十、状态与日志

第一阶段：

1. RayJob、head pod、worker pod 都写入平台统一 label。
2. 日志通过 `deepexilab_k8s_uuid` 聚合。
3. 状态同步 manager 监听 `rayjobs.ray.io`，根据 RayJob `status.jobStatus` 和 `conditions` 映射平台状态。
4. 终止 GRPO 训练任务时删除 `training-grpo-<task_id>` RayJob CRD；普通训练任务仍删除 `training-<task_id>` Kubernetes Job。
5. RayJob submitter、head、worker 容器都注入 `MLFLOW_TRACKING_URI`、`MLFLOW_EXPERIMENT_NAME`、`MLFLOW_RUN_NAME`。
6. 后端强制覆盖 verl 的 `trainer.project_name`、`trainer.experiment_name`、`trainer.logger`，使 GRPO 指标与现有训练指标接口使用同一套 MLflow 命名规则。
7. GRPO checkpoint 指标回填只从 MLflow run 中保留 `actor/ppo_kl` 和 `critic/rewards/mean`。`val/test_score` 不作为 checkpoint 展示指标；旧口径 `reward/mean` 统一使用 verl/critic 侧的 `critic/rewards/mean`。

RayJob 状态映射：

| RayJob 状态 | 平台状态 |
| --- | --- |
| `PENDING` / `SUBMITTED` / `INITIALIZING` | `排队中` |
| `RUNNING` / `STARTED` | `运行中` |
| `SUCCEEDED` / `COMPLETED` | `已完成` |
| `FAILED` / `ERROR` | `失败` |
| `STOPPED` / `SUSPENDED` / `TERMINATED` | `已终止` |

如果集群未安装 KubeRay CRD，或当前账号无权限访问 RayJob CRD，RayJob watcher 会降噪等待重试，不影响普通 Job/Deployment 状态同步。

---

## 十一、校验规则

当 `training_type.train_method_type=grpo`：

1. `train_type_category` 第一阶段仅支持 `text-generation`。
2. `fine_tuning_type` 第一阶段建议限定为 `full`。
3. `additional_params` 必须是扁平 map，key 为非空字符串。
4. `additional_params` 不接收资源配置；CPU、内存、GPU、worker 副本数使用 `ray_resource_config`。
5. `additional_params` 不接收平台日志/指标保留字段；`trainer.project_name`、`trainer.experiment_name`、`trainer.logger` 由后端强制生成。
6. 必须提供 `ray_resource_config.submit_graphics_card_resource`，未传时后端使用 CPU-only 默认值。
7. 必须提供 `ray_resource_config.head_graphics_card_resource`。
8. 必须提供 `ray_resource_config.worker_graphics_card_resource`。
9. `ray_resource_config.worker_replicas > 0`。
10. `submit_graphics_card_resource.count` 必须为 `0`，submitter 不申请 GPU/NPU。
11. `worker_graphics_card_resource.count > 0`。
12. `worker_graphics_card_resource.k8s_resource_type` 必须非空。
13. `trainer.nnodes` 必须等于 `worker_replicas`。
14. `trainer.n_gpus_per_node` 必须等于 `worker_graphics_card_resource.count`。
15. 无验证集时需设置 `trainer.val_before_train=False` 或 `trainer.test_freq=-1`。
16. 如传 `reward_function_upload_id`，上传会话必须存在且已合并完成。
17. 奖励函数文件必须通过 `.py`、UTF-8、AST 语法和 `compute_score` 签名静态校验。

---

## 十二、SQL 变更

GRPO 训练复用现有 `training_tasks.additional_params` 保存扁平 key/value 训练参数，需要在 `training_tasks` 增加 Ray 资源、奖励函数上传 ID 和模板版本 ID 字段。

模板主表、模板字段表和模板任务引用表属于通用高级模板模块，全量 SQL 见 [高级模板管理模块设计文档](./advanced_template_module_design.md)。GRPO 训练任务创建/编辑时会写入 `advanced_template_task_references(task_type='training', task_id, template_id)`。

```sql
ALTER TABLE training_tasks
    ADD COLUMN IF NOT EXISTS ray_resource_config JSON NULL;

COMMENT ON COLUMN training_tasks.ray_resource_config
    IS 'RayJob 资源配置（包含 submit_graphics_card_resource, head_graphics_card_resource, worker_graphics_card_resource, worker_replicas）';

ALTER TABLE training_tasks
    ADD COLUMN IF NOT EXISTS reward_function_upload_id VARCHAR(100) NULL;

COMMENT ON COLUMN training_tasks.reward_function_upload_id
    IS 'GRPO奖励函数分片上传会话ID';

ALTER TABLE training_tasks
    ADD COLUMN IF NOT EXISTS advanced_template_id INTEGER NULL;

COMMENT ON COLUMN training_tasks.advanced_template_id
    IS '高级模板版本ID，用于前端根据模板字段定义回显和渲染 additional_params';

CREATE INDEX IF NOT EXISTS idx_training_tasks_advanced_template
    ON training_tasks (advanced_template_id);
```

字段说明：

| 字段 | 说明 |
|------|------|
| `ray_resource_config` | 保存 Ray submitter、head、worker、worker 副本数等资源配置，不进入模板和 `additional_params` |
| `reward_function_upload_id` | 保存奖励函数上传会话 ID，训练提交前复制为 `/data/configs/reward_function.py` |
| `advanced_template_id` | 保存创建/编辑任务时使用的具体模板版本 ID，用于前端回显 |

---

## 十三、实施范围

最小闭环：

1. 新增 `TrainingMethodType.GRPO`。
2. 调整创建/编辑入参校验：非 GRPO 保持现有 LlamaFactory 必填字段，GRPO 允许不传 LlamaFactory 专用字段。
3. 创建/编辑 service 按 GRPO 分流，GRPO 持久化必要公共字段、资源字段、`advanced_template_id` 和 `additional_params`，LlamaFactory 字段使用空对象/空列表占位满足现有非空列。
4. 复用 `additional_params` 保存和返回 GRPO 自定义参数，复用 `advanced_template_id` 回显前端所用模板版本。
5. 生成任务级 JSONL 数据集。
6. JSONL 转 Parquet。
7. 合成 verl Hydra overrides。
8. 生成 GRPO 配置摘要。
9. 生成 RayJob body。
10. 新增 `K8sLauncher.create_ray_job`。
11. Celery 启动阶段按 `grpo` 分流，跳过 LlamaFactory YAML 和 Kubernetes Job 旧链路。
12. 检查点接口支持 `global_step_*`。
13. 新增奖励函数上传 ID 持久化字段。
14. 新增 `training_tasks.advanced_template_id` 持久化字段，创建/编辑写入具体模板版本 ID，详情接口回传。
15. 新增奖励函数校验接口和样例下载接口。
16. 训练提交前复制奖励函数文件并注入 verl 自定义奖励函数参数。
17. GRPO RayJob 注入 MLflow 环境变量，并强制生成 verl 的 `trainer.project_name`、`trainer.experiment_name`、`trainer.logger`。
18. 状态同步 manager 新增 RayJob watcher，按 RayJob CRD status 更新 GRPO 训练任务状态。

---

## 十四、验收标准

1. 可以创建 `training_method_type=grpo` 的训练任务。
2. 创建任务时 `additional_params` 使用扁平 key/value map，并能在详情接口原样返回。
3. 训练任务创建/编辑保存具体模板版本的 `advanced_template_id`，详情回传后前端可据此拉取该版本字段并渲染 `additional_params`。
4. CPU、内存、GPU、worker 副本数不进入模板和 `additional_params`。
5. Ray submitter、head 与 worker 使用分离资源配置。
6. 多机多卡推导正确：
   - `trainer.nnodes=worker_replicas`
   - `trainer.n_gpus_per_node=worker_graphics_card_resource.count`
7. Celery 能将 JSONL 转为 Parquet。
8. RayJob 能提交到 KubeRay 集群。
9. verl 能读取平台模型和 Parquet 数据。
10. 日志可通过任务日志接口查询。
11. MLflow 指标可通过现有训练指标接口查询，experiment/run 命名与普通训练一致；checkpoint 回填指标限定为 `actor/ppo_kl` 和 `critic/rewards/mean`。
12. RayJob `RUNNING/SUCCEEDED/FAILED` 状态能同步为平台 `运行中/已完成/失败`。
13. 输出目录中的 `global_step_*` checkpoint 可被识别。
14. 奖励函数样例可以下载。
15. 奖励函数上传后可以通过 upload id 静态校验。
16. 传入 `reward_function_upload_id` 后，RayJob entrypoint 包含 `reward.custom_reward_function.path` 和 `reward.custom_reward_function.name`。
