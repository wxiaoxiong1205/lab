# PyTorch Entity Recognition Demo

这是一个基于 PyTorch 的命名实体识别示例，重点在于实现 `model.py` 中的模型输出处理逻辑。

## 需要关注的文件

- `model.py`：你需要实现的主要文件。
- `model_handle.py`：定义了 `ModelHandle` 接口，以及 `PredictionResult` 的返回格式。
- `model_demo.py`：提供了一个可直接参考的实现示例。

实际使用时，重点关注 `model.py` 即可。

## 实现说明

`model.py` 主要需要实现的方法是 `post_handle`。

### 后处理：`post_handle(model_output, text, model_input)`

输入是模型原始输出、本次推理对应的原始文本和输入字典，输出应为 `PredictionResult` 列表，每个结果通常包含以下字段：

- `start`、`end`：实体在原文中的字符区间。
- `class_id`：预测类别索引。
- `score`：实体置信度，范围为 `0.0 ~ 1.0`。

常见处理流程：

- 兼容不同输出格式，例如 `tensor`、`list`、`tuple` 或 `dict`。
- 将模型输出统一整理为可解码的 token classification logits。
- 对每个 token 的 logits 做解码，得到对应的 BIO 标签序列。
- 结合 `attention_mask`、`token_offsets` 和 `special_tokens_mask` 过滤 padding、特殊 token 和非法区间。
- 将连续的 BIO token 合并为实体 span。
- 根据 `BIO_ID_TO_LABEL` 和 `ENTITY_NAME_TO_CLASS_ID`，把实体类型转换为稳定的 `class_id`。
- 将最终结果整理为 `PredictionResult` 列表返回。

后处理的目标是把模型原始输出整理成统一的实体结果。

## 你只需要实现的内容

在 `model.py` 中，你只需要负责：

- 将模型输出转换为实体结果列表。

## 启动服务

```bash
export LOG_LEVEL=DEBUG
gunicorn --bind :9090 --workers 1 --threads 1 --timeout 120 _wsgi:app
```
