# 训练数据 JSONL 改动范围对比

## 总览对比图

| 维度 | 改动前 | 改动后 | 影响范围 |
| --- | --- | --- | --- |
| 训练集文件名 | `custom_dataset.json` | `custom_dataset.jsonl` | 文本生成、图片理解、多模态训练任务 |
| 验证集文件名 | `custom_eval_dataset.json` | `custom_eval_dataset.jsonl` | 使用独立验证集的训练任务 |
| 训练集内容格式 | JSON 数组 | JSONL，一行一个样本 | 所有通过训练任务生成链路输出的训练集 |
| 验证集内容格式 | JSON 数组 | JSONL，一行一个样本 | 所有通过训练任务生成链路输出的验证集 |
| `dataset_info.json` | `file_name` 指向 `.json` | `file_name` 指向 `.jsonl` | LlamaFactory 数据集加载入口 |
| LlamaFactory 逻辑名 | `custom_dataset` / `custom_eval_dataset` | 不变 | 训练 YAML 配置不需要改逻辑名 |
| 文本生成列映射 | 按原数据格式映射 | 不变 | prompt-response、alpaca、role-based 等不变 |
| 图片理解图片目录 | 可能使用统一 `images/` | 使用 `train_images/`、`val_images/` 区分来源 | 图片理解、含图片 role-based 数据 |
| 图片理解源数据代理 | 无统一代理目录 | 构建期间使用 `train_sources/`、`val_sources/` 生成代理 `.jsonl`，混合完成后清理 | 多数据集混合、图片路径改写 |
| 历史任务目录 | 只存在 `.json` 产物 | 构建训练 dataset 目录时先清理 `datasets/`，再重新生成 `.jsonl` | 创建和编辑训练任务统一处理 |

## 文件产物变化

改动后的标准训练任务数据目录产物如下：

```text
/{namespace}/training/task/task_{task_id}/datasets/
  dataset_info.json
  custom_dataset.jsonl
  custom_eval_dataset.jsonl
  train_images/
  val_images/
```

其中：

| 文件或目录 | 说明 |
| --- | --- |
| `dataset_info.json` | LlamaFactory 数据集索引文件，仍然是 JSON |
| `custom_dataset.jsonl` | 训练集混合结果 |
| `custom_eval_dataset.jsonl` | 验证集混合结果 |
| `train_images/` | 训练集图片资源目录 |
| `val_images/` | 验证集图片资源目录 |

构建期间可能短暂出现以下中间目录，混合完成后会清理：

| 中间目录 | 说明 |
| --- | --- |
| `train_sources/` | 训练集源数据代理文件目录，仅供混合阶段读取 |
| `val_sources/` | 验证集源数据代理文件目录，仅供混合阶段读取 |

## 内容格式变化

改动前，混合数据文件通常是 JSON 数组：

```json
[
  {
    "messages": [],
    "images": []
  }
]
```

改动后，落盘文件统一为 JSONL：

```jsonl
{"messages":[],"images":[]}
{"messages":[],"images":[]}
```

当前生成链路中，混合逻辑可能先生成 JSON 数组内容，但训练任务外层会立即调用正规化逻辑，将目标 `.jsonl` 文件重写为一行一个 JSON 样本。因此正常成功跑完后，文件名和内容格式是一致的。

## 文本生成影响

文本生成受到的是统一文件产物命名和内容格式的影响：

| 项目 | 改动情况 |
| --- | --- |
| 文件名 | 从 `.json` 改为 `.jsonl` |
| 文件内容 | 从 JSON 数组改为 JSONL |
| 逻辑数据集名 | 不变，仍是 `custom_dataset` / `custom_eval_dataset` |
| 数据列映射 | 不变 |
| 训练 YAML | 逻辑名不变，通过 `dataset_info.json` 找到 `.jsonl` 文件 |

也就是说，文本生成的语义格式不变，但物理文件名和落盘内容格式变了。

## 图片理解影响

图片理解除了 `.jsonl` 文件名和内容格式变化，还增加了图片资源分目录处理：

| 项目 | 改动情况 |
| --- | --- |
| 训练集图片 | 从源数据集 `images/` 复制到任务目录 `train_images/{source_key}/` |
| 验证集图片 | 从源数据集 `images/` 复制到任务目录 `val_images/{source_key}/` |
| 样本 `images` 字段 | 改写为指向 `train_images/` 或 `val_images/` 下的相对路径 |
| 多数据集图片冲突 | 通过 `{source_key}` 隔离不同来源数据集 |
| 源数据代理 | 在 `train_sources/`、`val_sources/` 下生成代理 `.jsonl`，混合完成后删除 |

这部分主要解决图片理解多数据集混合时图片文件名冲突、训练集和验证集图片资源混用的问题。

## 中间产物清理

混合逻辑产生的文件和目录分为两类：

| 类型 | 产物 | 是否可清理 | 原因 |
| --- | --- | --- | --- |
| 最终数据文件 | `custom_dataset.jsonl`、`custom_eval_dataset.jsonl` | 不可清理 | LlamaFactory 通过 `dataset_info.json` 读取 |
| 数据集索引 | `dataset_info.json` | 不可清理 | LlamaFactory 数据集入口 |
| 图片资源 | `train_images/`、`val_images/` | 不可清理 | 最终 JSONL 的 `images` 字段会引用这些路径 |
| 源数据代理 | `train_sources/`、`val_sources/` | 可清理 | 只用于混合阶段，最终 JSONL 已生成后不再需要 |

当前清理策略：

1. 构建训练 dataset 目录前，先清理当前任务历史 `datasets/` 目录。
2. 训练集混合完成并正规化为 JSONL 后，清理 `train_sources/`。
3. 验证集混合完成并正规化为 JSONL 后，清理 `val_sources/`。
4. 保留 `train_images/` 和 `val_images/`，供训练运行期读取图片。

## 配置影响

`dataset_info.json` 的 `file_name` 会同步指向新的 `.jsonl` 文件：

```json
{
  "custom_dataset": {
    "file_name": "custom_dataset.jsonl"
  },
  "custom_eval_dataset": {
    "file_name": "custom_eval_dataset.jsonl"
  }
}
```

训练 YAML 中的逻辑数据集名不变：

```yaml
dataset: custom_dataset
eval_dataset: custom_eval_dataset
```

LlamaFactory 实际读取哪个物理文件，以 `dataset_info.json` 中的 `file_name` 为准。

## 历史文件共存说明

训练数据生成时，系统会使用当前 `task_id` 对应的数据目录：

```text
/{namespace}/training/task/task_{task_id}/datasets/
```

构建训练 dataset 目录时会先清理当前任务的 `datasets/` 目录，再写入新的 `.jsonl` 文件。创建和编辑都走同一套处理逻辑，新任务目录为空时清理操作等价于 no-op。未经过该生成链路的历史目录中，仍可能同时出现：

```text
custom_dataset.json
custom_dataset.jsonl
custom_eval_dataset.json
custom_eval_dataset.jsonl
```

这种共存通常表示目录里保留了清理逻辑上线前的历史产物，或生成流程没有经过编辑启动入口，不代表当前一次训练同时使用两套数据。实际使用文件应以当前 `dataset_info.json` 为准。

## 异常场景

正常成功跑完生成链路后，不会出现 `.jsonl` 文件内容仍是 JSON 数组的问题。可能出现不一致的场景主要有：

| 场景 | 结果 |
| --- | --- |
| 混合写入后、正规化前任务中断 | `.jsonl` 文件可能短暂保留 JSON 数组内容 |
| 其他代码直接调用 `create_mixed_dataset` 写 `.jsonl` | 可能绕过正规化 |
| 历史任务目录残留旧文件 | 同时看到 `.json` 和 `.jsonl` |

排查时优先看：

1. `dataset_info.json` 中的 `file_name`
2. `custom_dataset.jsonl` / `custom_eval_dataset.jsonl` 的更新时间
3. 文件内容是否为一行一个 JSON 样本
4. 训练 YAML 中的 `dataset` 和 `eval_dataset`

## 大数据量内存风险评估

本次 `.jsonl` 改动没有从根本上改变混合逻辑的内存模型。当前混合链路仍然存在明显的大数据量内存风险。

| 环节 | 当前处理方式 | 内存风险 |
| --- | --- | --- |
| 读取源数据集 | 单个源文件通过 `f.read()` 一次性读入内存 | 源文件越大，占用越高 |
| 解析源数据集 | 将 JSONL 全部解析为 Python 对象列表 | Python 对象开销通常明显高于原始文本 |
| 多数据集合并 | 所有采样后的样本追加到 `all_samples` | 训练集和验证集都会按最终样本量累计 |
| 打乱样本 | 对 `all_samples` 全量 `random.shuffle` | 必须保留完整样本列表 |
| 写混合结果 | 先构造 `processed_samples`，再 `json.dumps` 成完整字符串 | 可能同时持有对象列表和完整输出字符串 |
| JSONL 正规化 | 再次读取整个混合文件并解析为 `records` | 对输出文件又产生一次全量内存占用 |
| 图片理解代理文件 | role-based 源文件先全量读入并解析，再写代理 `.jsonl` | 图片理解训练集、验证集都会触发 |
| 采样率大于 1 | 通过重复采样扩展样本列表 | 输出样本量和内存占用随采样率放大 |

风险判断：

- 小中规模数据集问题不明显。
- 百 MB 级数据集开始需要关注 worker 内存。
- GB 级或多数据集叠加时，当前实现有较高 OOM 风险。
- 验证集如果也很大，会和训练集走同一套全量混合与正规化逻辑，同样存在风险。

粗略估算上，峰值内存不是最终 `.jsonl` 文件大小的 1 倍，而可能达到数倍甚至更高。原因是同一阶段可能同时存在原始文本、Python 对象列表、采样后列表、输出 JSON 字符串、正规化解析结果等多份数据。

建议后续优化方向：

| 优化方向 | 说明 |
| --- | --- |
| 流式读取 JSONL | 按行读取源文件，避免 `f.read()` 全量读入 |
| 流式写出 JSONL | 直接一行一行写目标文件，避免先生成 JSON 数组字符串 |
| 避免二次正规化 | 混合阶段直接输出 JSONL，去掉后置全量正规化 |
| 大数据随机采样优化 | 使用蓄水池采样、索引采样或分块采样，避免全量载入后再采样 |
| 大数据打乱优化 | 使用外部 shuffle、分桶 shuffle 或可接受的局部 shuffle |
| 图片理解代理流式化 | 代理文件生成时按行解析、按行改写、按行写出 |

短期结论：当前实现可以满足一般规模数据，但不适合无上限的大训练集/验证集混合。若需要支持大数据量训练，混合器应改成流式 JSONL 处理，并让输出阶段天然生成 JSONL。
