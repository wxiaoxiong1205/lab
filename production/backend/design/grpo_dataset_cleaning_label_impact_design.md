# GRPO 对数据集、清洗、标注模块影响范围设计

## 一、目标与边界

GRPO 接入后，训练执行链路由 `verl` + KubeRay RayJob 负责，训练数据集仍通过平台数据集模块进入系统。本文只记录 GRPO 对以下模块的改动范围：

1. 训练数据集模块。
2. 数据清洗模块。
3. 数据标注模块。

不在本文展开的内容：

1. GRPO 训练任务创建、RayJob 生成、奖励函数挂载，见 `grpo_training_design.md`。
2. 高级模板管理，见 `advanced_template_module_design.md`。
3. 前端模板引用逻辑。

---

## 二、GRPO 数据格式

GRPO 文本数据集上传支持 JSON、JSONL、XLSX，平台内部统一归一化为 JSONL。文本训练样例：

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

图片理解 GRPO 仍使用 JSONL 记录训练样本，同时携带图片引用。压缩包建议结构：

```text
dataset.zip
  data.jsonl
  images/
    000001.png
```

图片理解样本要求：

1. `prompt` 中保留 `<image>` 占位符。
2. `images` 字段记录当前样本引用的图片相对路径。
3. `reward_model.ground_truth` 记录规则奖励或外部奖励函数需要对齐的参考答案。

---

## 三、训练数据集模块

### 3.1 数据模型影响

`training_datasets` 不新增表和字段，复用现有字段承载 GRPO：

| 字段 | GRPO 取值 | 说明 |
|------|-----------|------|
| `training_method_type` | `grpo` | 表示该数据集用于 GRPO 训练 |
| `dataset_format` | `grpo` | 表示数据内容为 GRPO JSONL 结构 |
| `dataset_type` | `text-generation` / `image-understanding` | 区分文本生成和图片理解 |
| `dataset_path` | 文件保存路径 | 文本为 JSONL，图片理解为 ZIP 解压后的目录或原始 ZIP 处理路径 |

需要同步扩展枚举和接口校验：

1. `TrainingMethodType` 增加 `grpo`。
2. `DatasetFormat` 增加 `grpo`。
3. 允许以下组合：

| dataset_type | training_method_type | dataset_format | 上传文件 |
|--------------|----------------------|----------------|----------|
| `text-generation` | `grpo` | `grpo` | `json` / `jsonl` / `xlsx` |
| `image-understanding` | `grpo` | `grpo` | `zip` |

### 3.2 解析与校验影响

训练数据集解析器需要增加 GRPO 分支：

1. 文本 GRPO JSON/JSONL 校验 `prompt`、`reward_model`。
2. 文本 GRPO XLSX 使用列承载字段，复杂字段如 `prompt`、`reward_model`、`extra_info` 使用 JSON 字符串。
3. `prompt` 必须是消息数组，消息项至少包含 `role`、`content`。
4. `reward_model` 至少包含 `style`、`ground_truth`。
5. `data_source`、`ability`、`extra_info` 为可选业务字段，解析时保留。
6. 图片理解 GRPO ZIP 校验 `data.jsonl` 和图片引用关系。
7. 图片理解样本的 `images` 相对路径必须能在压缩包内找到。

解析后的预览、统计和元数据不需要拆成 SFT/DPO 字段，只需要能返回原始 GRPO 记录和基础数量统计。

### 3.3 样例与导出影响

需要增加 GRPO 样例下载：

| 场景 | 样例 |
|------|------|
| 文本生成 GRPO | `app/sample_datasets/grpo/qa/text_generation_qa_grpo.json` / `app/sample_datasets/grpo/qa/text_generation_qa_grpo.jsonl` / `app/sample_datasets/grpo/qa/text_generation_qa_grpo.xlsx` |
| 图片理解 GRPO | `app/sample_datasets/grpo/qa/image_understand_qa_grpo.zip` |

导出规则：

1. JSONL 导出保留 GRPO 原始结构。
2. JSON 导出返回记录数组。
3. XLSX 导出使用 JSON 字符串保存 `prompt`、`reward_model`、`extra_info` 等复杂字段。

---

## 四、数据清洗模块

### 4.1 数据模型影响

`data_cleaning_tasks` 不新增表和字段。数据清洗任务通过以下字段关联输入和输出数据集：

| 字段 | 说明 |
|------|------|
| `input_dataset_id` | 源训练数据集 ID |
| `output_dataset_id` | 清洗完成后生成的数据集 ID |
| `selected_fields` | 需要参与清洗的字段 |
| `dataset_path` | 输入文件路径 |
| `output_path` | 清洗输出路径 |

GRPO 的训练方法和数据格式从 `input_dataset_id` 对应的 `TrainingDataset` 读取，不在清洗任务表重复存储。

### 4.2 服务影响

数据清洗需要识别并保留 GRPO 数据结构：

1. 字段探测支持嵌套字段，例如 `prompt`、`prompt.content`、`reward_model.ground_truth`、`extra_info.*`。
2. 清洗过程如果只处理部分字段，输出记录必须保留未处理字段。
3. 输出数据集用于 GRPO 训练时，需要继承源数据集的 `training_method_type=grpo` 和 `dataset_format=grpo`。
4. 图片理解 GRPO 清洗时必须保留 `images` 字段和图片文件关系。
5. 不按 SFT 的 `messages` 或 DPO 的 `chosen/rejected` 结构解释 GRPO 数据。

### 4.3 限制

1. GRPO 清洗结果内部仍统一落 JSONL，XLSX 只作为上传和导出交换格式。
2. 文本重写类清洗算子如果修改 `prompt`，需要保持消息数组结构不变。
3. 图片理解 GRPO 不做图片文件重命名，除非同步更新 JSONL 中的 `images` 引用。

---

## 五、数据标注模块

### 5.1 数据模型影响

`label_datasets` 不新增表和字段，复用现有字段：

| 字段 | GRPO 处理 |
|------|-----------|
| `source_dataset_id` | 关联源训练数据集 |
| `submit_dataset_id` | 关联标注提交后生成的数据集 |
| `dataset_type` | 继承源训练数据集 |
| `dataset_format` | 支持保存 `grpo` |
| `dataset_path` | 标注数据文件路径 |

`LabelDataset` 不单独保存 `training_method_type`。需要训练方法时，通过 `source_dataset_id` 或 `submit_dataset_id` 关联的 `TrainingDataset` 获取。

### 5.2 标注服务影响

标注模块对 GRPO 的处理重点是输入展示和输出结构保持：

1. 从训练数据集创建标注数据集时，`dataset_format` 继承 `grpo`。
2. 标注详情返回时，`prompt` 作为输入消息展示。
3. `reward_model.ground_truth` 作为参考答案或目标答案展示、编辑。
4. 标注提交后，如果生成新的训练数据集，需要输出 GRPO JSONL。
5. 图片理解 GRPO 需要返回 `images` 和图片访问地址，保持 `<image>` 与图片顺序一致。
6. 多人标注中按源训练数据集解析 `training_method_type` 的逻辑，需要允许返回 `grpo`。

### 5.3 兼容要求

当前标注逻辑中按 `prompt-response`、`role-based`、`alpaca` 分支处理的地方，需要增加 GRPO 分支或明确拒绝：

| 场景 | 要求 |
|------|------|
| 创建标注任务 | 允许从 GRPO 训练数据集创建，或返回明确不支持提示 |
| 获取标注样本 | 支持 GRPO 原始结构转展示结构 |
| 提交标注结果 | 支持回写 `reward_model.ground_truth` |
| 生成提交数据集 | 支持生成 `dataset_format=grpo` 的训练数据集 |
| 图片理解标注 | 保留图片引用和可访问地址 |

如果阶段一只支持 GRPO 数据集上传、预览和训练，标注接口应对 GRPO 给出明确错误，不能按 SFT/DPO 格式静默处理。

---

## 六、接口改动范围

### 6.1 训练数据集接口

需要覆盖：

1. 样例下载接口支持 GRPO 文本和图片理解样例。
2. 上传接口支持 `training_method_type=grpo`、`dataset_format=grpo`。
3. 详情和预览接口返回 GRPO 原始记录。
4. 聚合和筛选接口能按 `grpo` 统计。
5. 下载和导出接口支持 JSONL/JSON/XLSX。

### 6.2 数据清洗接口

需要覆盖：

1. 获取字段接口能返回 GRPO 嵌套字段。
2. 创建清洗任务时允许选择 GRPO 字段。
3. 清洗完成生成训练数据集时继承 GRPO 元数据。
4. 图片理解 GRPO 清洗结果保留图片引用。

### 6.3 数据标注接口

需要覆盖：

1. 从训练数据集创建标注数据集时继承 `dataset_format=grpo`。
2. 标注任务详情返回 `training_method_type=grpo`。
3. 标注样本读取支持 GRPO 文本和图片理解结构。
4. 标注提交后能生成 GRPO JSONL，或在未支持时明确拒绝。

---

## 七、验收标准

1. 文本生成 GRPO JSON/JSONL/XLSX 可以上传、预览、统计、下载。
2. 图片理解 GRPO ZIP 可以上传，图片引用校验正确。
3. GRPO 数据集参与清洗后，输出 JSONL 仍能用于 GRPO 训练。
4. 清洗输出数据集继承 `training_method_type=grpo`、`dataset_format=grpo`。
5. 标注模块不会把 GRPO 数据误按 SFT/DPO 格式处理。
6. 如果标注阶段支持 GRPO，提交结果可以生成合法 GRPO JSONL。
7. 如果标注阶段暂不支持 GRPO，接口返回明确错误信息。
