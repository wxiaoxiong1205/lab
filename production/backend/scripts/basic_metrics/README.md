# 基础指标评估模块

本模块提供了8种基础评估指标的计算器，用于评估模型生成文本的质量。

## 指标列表

### 1. 准确率 (Accuracy)
- **文件**: `accuracy.py`
- **类**: `AccuracyCalculator`
- **指标代码**: `accuracy`
- **说明**: 用于评估模型正确执行给定任务的能力，模型预测结果与评估集完全一致的样本占比，反映整体预测的正确性。
- **计算方法**: 完全匹配返回1.0，否则返回0.0

### 2. F1 分数
- **文件**: `f1.py`
- **类**: `F1Calculator`
- **指标代码**: `f1`
- **说明**: 综合考虑模型精准率与召回率的调和平均值，衡量模型在生成内容时的平衡性能，越高表示模型越稳健。
- **计算方法**: 基于词级别的精确率和召回率计算F1分数

### 3. ROUGE-1
- **文件**: `rouge_1.py`
- **类**: `Rouge1Calculator`
- **指标代码**: `rouge-1`
- **说明**: 基于单个词(unigram)的匹配程度，计算模型生成文本与参考答案之间的词汇覆盖率，用于评估关键信息是否被提及。
- **计算方法**: 重叠词数 / 参考答案词数

### 4. Rouge-2
- **文件**: `rouge_2.py`
- **类**: `Rouge2Calculator`
- **指标代码**: `rouge-2`
- **说明**: 基于两个连续词(bigram)的匹配程度，衡量模型生成文本在短语级别的连贯性与准确性，反映语言的自然度。
- **计算方法**: 重叠bigram数 / 参考答案bigram数

### 5. Rouge-L
- **文件**: `rouge_l.py`
- **类**: `RougeLCalculator`
- **指标代码**: `rouge-l`
- **说明**: 通过计算模型输出与参考答案之间的最长公共子序列(LCS)，评估语序与结构的相似性，适用于衡量整体语义结构一致性。
- **计算方法**: LCS长度 / 参考答案长度

### 6. BLEU-4
- **文件**: `bleu_4.py`
- **类**: `Bleu4Calculator`
- **指标代码**: `bleu-4`
- **说明**: 综合评估模型生成文本与参考文本在1至4元语法(n-gram)层面上的匹配程度，反映语言流畅性与表达准确性，常用于机器翻译与文本生成任务。
- **计算方法**: 计算1-4 gram的精确度，应用长度惩罚后计算几何平均

### 7. 格式遵从性 (Format Compliance)
- **文件**: `format_compliance.py`
- **类**: `FormatComplianceCalculator`
- **指标代码**: `format_compliance`
- **说明**: 检测模型输出是否严格遵循JSON格式规范，确保结果具备程序可读性与系统集成友好性。
- **计算方法**: 尝试解析JSON，成功返回1.0，失败返回0.0

### 8. 语义相似度 (Semantic Similarity)
- **文件**: `semantic_similarity.py`
- **类**: `SemanticSimilarityCalculator`
- **指标代码**: `semantic_similarity`
- **说明**: 综合Exact Match(完全匹配)与词重叠度两个维度，衡量模型输出与参考答案在字面层面的一致性。不使用模型进行语义相似度计算，仅基于文本层面的相似度。
- **计算方法**: 
  - 完全匹配时返回1.0
  - 否则使用词重叠度（Jaccard相似度）作为语义相似度的近似
  - 不使用任何 embedding 模型，仅基于文本层面的词重叠计算

## 使用方法

### 命令行使用（推荐）

使用 `main.py` 作为入口脚本，通过命令行参数指定指标和输入文件：

```bash
# 基本用法
python -m scripts.basic_metrics.main \
    --input_file data.jsonl \
    --metrics accuracy f1 rouge-1 \
    --output_file results.jsonl

# 使用停用词
python -m scripts.basic_metrics.main \
    --input_file data.jsonl \
    --metrics f1 rouge-1 rouge-2 \
    --stop_words stopwords.txt \
    --output_file results.jsonl

# 计算所有指标
python -m scripts.basic_metrics.main \
    --input_file data.jsonl \
    --metrics accuracy f1 rouge-1 rouge-2 rouge-l bleu-4 format_compliance semantic_similarity \
    --output_file results.jsonl
```

**命令行参数说明**：
- `--input_file`: 输入JSONL文件路径（必需）
- `--metrics`: 要计算的指标列表，可指定多个（必需）
- `--output_file`: 输出JSONL文件路径（可选）
- `--stop_words`: 停用词文件路径（可选）
- `--log_level`: 日志级别，默认INFO（可选）

**输入数据格式（JSONL）**：
每行一个JSON对象，应包含以下字段之一：
- `prediction` / `model_response` / `generated_response`: 模型预测结果
- `reference` / `standard_response` / `answer`: 参考答案

**输出格式**：
- 如果指定了 `--output_file`，会生成两个文件：
  - `{output_file}.jsonl`: 包含每条数据的原始信息和各指标的分数
  - `{output_file}_summary.json`: 包含汇总统计信息

### Python API 使用

```python
from scripts.basic_metrics import get_calculator

# 获取计算器
calculator = get_calculator("accuracy")

# 计算单个样本
score = calculator.calculate(
    prediction="模型生成的文本",
    reference="参考答案"
)

# 批量计算
results = calculator.calculate_batch(
    predictions=["预测1", "预测2", "预测3"],
    references=["参考1", "参考2", "参考3"]
)
print(f"平均分数: {results['average']}")
print(f"各样本分数: {results['scores']}")
```

### 使用停用词

```python
from scripts.basic_metrics import F1Calculator

stop_words = ["的", "了", "在", "是", "我", "有", "和", "就"]
calculator = F1Calculator(stop_words=stop_words)

score = calculator.calculate(
    prediction="这是模型生成的文本",
    reference="这是参考答案"
)
```

### 直接使用计算器类

```python
from scripts.basic_metrics import Rouge1Calculator

calculator = Rouge1Calculator()
score = calculator.calculate("预测文本", "参考文本")
```

## 基类说明

所有计算器都继承自 `BaseMetricCalculator`，提供以下功能：

- `calculate(prediction, reference)`: 计算单个样本的指标值
- `calculate_batch(predictions, references)`: 批量计算指标值
- `_normalize_text(text)`: 文本标准化处理
- `_tokenize(text)`: 文本分词（支持停用词过滤）

## 注意事项

1. **文本处理**: 所有计算器都会对输入文本进行标准化处理（去除首尾空白）
2. **停用词**: 部分指标（如F1、ROUGE、BLEU）支持停用词过滤，可以在初始化时传入
3. **空值处理**: 对于空文本有特殊处理逻辑，确保计算的稳定性
4. **返回值**: 所有指标返回0-1之间的浮点数，1.0表示最佳，0.0表示最差

## 扩展说明

- **语义相似度**: 
  - 不使用任何 embedding 模型，仅基于文本层面的词重叠度（Jaccard相似度）计算
  - 计算方式简单高效，无需额外依赖
  - 适用于需要快速计算的场景
- **分词**: 当前使用简单的空格分词，可以根据需要扩展为更复杂的分词逻辑（如中文分词）

