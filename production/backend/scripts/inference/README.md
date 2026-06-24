# 模型推理脚本

包含两个脚本：**推理生成脚本**和**评估脚本**，支持批量数据处理、Prompt生成、推理请求和结果处理。

## 脚本说明

### 1. inference_script.py - 推理生成脚本
用于生成推理结果集，是评估的前置步骤。
- **功能**：根据提示词模板生成模型回答
- **特点**：每条数据生成一个 prompt，输出格式简单
- **输出**：原始数据 + `generated_text` 字段

### 2. evaluate_script.py - 评估脚本
用于多指标评估推理结果。
- **功能**：对推理结果进行多指标评估
- **特点**：每条数据为每个指标生成一个 prompt，输出包含 `evaluations` 列表
- **输出**：原始数据 + `evaluations` 列表（每个指标一个评估结果）

## 功能特性

- **批量处理**：默认每批处理5000条数据，支持流式处理
- **双客户端支持**：支持OpenAI API和vLLM两种推理方式
- **实时保存**：每个批次处理完立即保存，避免数据丢失
- **错误处理**：完善的错误处理机制，单条失败不影响其他数据

## 使用方法

### 推理生成脚本（inference_script.py）

```bash
# 使用OpenAI客户端生成推理结果
python -m scripts.inference.inference_script \
    --input_file /data/input.jsonl \
    --output_file /data/output.jsonl \
    --config_file /data/configs/config.yaml \
    --client_type openai \
    --log_level INFO

# 使用vLLM客户端
python -m scripts.inference.inference_script \
    --input_file /data/input.jsonl \
    --output_file /data/output.jsonl \
    --config_file /data/configs/config.yaml \
    --client_type vllm \
    --log_level INFO
```

### 评估脚本（evaluate_script.py）

```bash
# 使用OpenAI客户端进行多指标评估
python -m scripts.inference.evaluate_script \
    --input_file /data/input.jsonl \
    --output_file /data/output.jsonl \
    --config_file /data/configs/config.yaml \
    --client_type openai \
    --log_level INFO

# 处理多个文件
python -m scripts.inference.evaluate_script \
    --input_file /data/input1.jsonl /data/input2.jsonl \
    --output_file /data/output1.jsonl /data/output2.jsonl \
    --config_file /data/configs/config.yaml \
    --client_type openai
```

### 命令行参数

**必需参数**：
- `--input_file`: 输入JSONL文件路径（可指定多个，用空格分隔）
- `--output_file`: 输出JSONL文件路径（可指定多个，数量需与输入文件一致）
- `--config_file`: 配置文件路径（YAML格式）
- `--client_type`: 推理客户端类型（`openai` 或 `vllm`）

**可选参数**：
- `--log_level`: 日志级别（DEBUG/INFO/WARNING/ERROR），默认INFO

## 配置文件

配置文件示例：
- 评估脚本：`scripts/inference/config/config.evaluate.example.yaml`
- 生成脚本：`scripts/inference/config/config.generate.example.yaml`

### 配置结构

```yaml
# 推理参数
inference:
  temperature: 0.7
  max_tokens: 2048
  top_p: 1.0
  presence_penalty: 0.0

# OpenAI客户端配置
openai:
  api_key: "your_api_key"  # 必需
  base_url: "https://api.example.com/v1"  # 必需
  model: "gpt-4"  # 必需
  timeout: 120
  max_retries: 3
  max_concurrent: 10

# vLLM客户端配置
vllm:
  model_path: "/path/to/model"  # 必需
  tensor_parallel_size: 1
  gpu_memory_utilization: 0.9

# Prompt配置
prompt:
  template_path: "/data/configs/prompt_template.j2"  # 必需

# 评估指标配置（仅评估脚本需要）
metrics:
  - name: "指标名称"
    description: "指标说明"
    score_min: 0
    score_max: 10
    score_definitions: "评分含义说明"
    field_mapping:
      input_content: "question"  # JSONL字段映射到模板变量
      actual_output: "answer"

# 数据处理配置
data:
  batch_size: 5000
  skip_errors: true
```

### 关键配置说明

**推理生成脚本（inference_script.py）**：
- 只需要 `prompt.template_path`，不需要 `metrics` 配置
- 模板直接使用 JSONL 数据中的字段

**评估脚本（evaluate_script.py）**：
- 需要 `prompt.template_path` 和 `metrics` 配置
- `metrics` 配置（必需）：
  - 每个metric包含：`name`、`description`、`score_min`、`score_max`、`score_definitions`、`field_mapping`
  - `field_mapping`：将JSONL数据中的字段名映射到模板变量名
  - 如果`field_mapping`配置的字段在数据中不存在，脚本会立即报错退出

**field_mapping示例**：
```yaml
field_mapping:
  input_content: "question"      # JSONL中的"question" → 模板变量"input_content"
  actual_output: "answer"        # JSONL中的"answer" → 模板变量"actual_output"
  expected_output: "expected"     # JSONL中的"expected" → 模板变量"expected_output"
  retrieval_context: "context"    # JSONL中的"context" → 模板变量"retrieval_context"
```

## 数据格式

### 输入JSONL格式

每行一个JSON对象，包含所需的数据字段：

```jsonl
{"question": "什么是AI？", "context": "..."}
{"question": "如何学习？", "context": "..."}
```

### 输出格式

#### 推理生成脚本（inference_script.py）输出

```jsonl
{
  "question": "什么是AI？",
  "context": "...",
  "generated_text": "AI是人工智能的缩写...",
  "error": false
}
```

**字段说明**：
- `generated_text`: 模型生成的文本
- `error`: 是否推理失败（布尔值）
- `error_message`: 仅在失败时存在

#### 评估脚本（evaluate_script.py）输出

```jsonl
{
  "question": "什么是AI？",
  "answer": "AI是...",
  "context": "...",
  "evaluations": [
    {
      "metric_name": "上下文相关性",
      "description": "评估检索到的上下文与用户问题的相关程度。",
      "score_min": 0,
      "score_max": 10,
      "raw_response": "{\"上下文相关性\": {\"score\": \"8\", \"reason\": \"...\"}}",
      "error": false
    },
    {
      "metric_name": "答案相关性",
      "description": "评估生成答案与用户问题的相关程度。",
      "score_min": 0,
      "score_max": 10,
      "raw_response": "{\"答案相关性\": {\"score\": \"7\", \"reason\": \"...\"}}",
      "error": false
    }
  ]
}
```

**evaluations字段说明**：
- `metric_name`: 指标名称
- `description`: 指标说明
- `score_min`/`score_max`: 评分区间
- `raw_response`: 模型原始输出（JSON字符串，需外部解析）
- `error`: 是否推理失败
- `error_message`: 仅在失败时存在

## 工作流程

### 推理生成脚本（inference_script.py）
1. **数据读取**：从JSONL文件批量读取（默认5000条/批）
2. **Prompt生成**：为每条数据生成一个prompt
3. **批量推理**：一次性传入所有prompt进行推理
4. **结果合并**：将推理结果添加到原始数据中
5. **实时保存**：每个批次处理完立即保存

### 评估脚本（evaluate_script.py）
1. **数据读取**：从JSONL文件批量读取（默认5000条/批）
2. **Prompt生成**：为每条数据的每个metric生成一个prompt
3. **批量推理**：一次性传入所有prompt进行推理
4. **结果聚合**：将推理结果按原始数据聚合，生成`evaluations`列表
5. **实时保存**：每个批次处理完立即保存

## 注意事项

### 推理生成脚本（inference_script.py）
1. **不需要metrics配置**：只需要 `prompt.template_path`
2. **批次保存**：每个批次处理完立即保存，第一批次覆盖文件，后续批次追加
3. **输出格式**：每条数据包含 `generated_text` 字段

### 评估脚本（evaluate_script.py）
1. **metrics配置必需**：必须在配置文件中定义`metrics`，否则脚本会报错退出
2. **字段映射验证**：如果`field_mapping`配置的字段在数据中不存在，脚本会立即报错退出
3. **批次保存**：每个批次处理完立即保存，第一批次覆盖文件，后续批次追加
4. **输出格式**：每条数据包含`evaluations`列表，顺序与`metrics`配置顺序一致
5. **错误处理**：单条推理失败会标记在对应metric的`evaluations`中，不影响其他数据

## 性能优化

- **批量处理**：默认每批5000条，可通过`data.batch_size`调整
- **并发控制**：OpenAI通过`max_concurrent`控制并发数
- **连续批处理**：vLLM充分利用连续批处理优化
- **内存友好**：每批处理完立即保存，不累积所有结果

## 依赖项

- `openai`: OpenAI客户端（使用OpenAI时）
- `vllm`: vLLM推理引擎（使用vLLM时）
- `jinja2`: 模板引擎
- `loguru`: 日志库
- `pyyaml`: YAML解析
