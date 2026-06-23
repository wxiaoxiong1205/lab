# PyTorch Text Classification Demo

这是一个基于 PyTorch 的单标签文本分类示例，重点在于实现 `model.py` 中的模型输出处理逻辑。

## 需要关注的文件

- `model.py`：你需要实现的主要文件。
- `model_handle.py`：定义了 `ModelHandle` 接口，以及 `PredictionResult` 的返回格式。
- `model_demo.py`：提供了一个可直接参考的实现示例。

实际使用时，重点关注 `model.py` 即可。

## 实现说明

`model.py` 主要需要实现的方法是 `post_handle`。

### 后处理：`post_handle(model_output)`

输入是模型原始输出，输出应为 `PredictionResult`，包含以下两个字段：

- `class_id`：预测类别索引，使用从 `0` 开始的编号。
- `score`：该类别的预测置信度，范围为 `0.0 ~ 1.0`。

常见处理流程：

- 兼容不同输出格式，例如 `tensor`、`list`、`tuple` 或 `dict`。
- 提取分类 logits，并确认输出形状符合常见格式 `[B, C]`。
- 对 logits 做 `softmax`，得到各类别概率。
- 取概率最高的类别作为最终预测结果。
- 返回 top1 的 `class_id` 和对应的 `score`。

后处理的目标是把模型原始输出整理成统一的分类结果。

## 你只需要实现的内容

在 `model.py` 中，你只需要负责：

- 将模型输出转换为 `class_id` 和 `score`。

## 启动服务

```bash
export LOG_LEVEL=DEBUG
gunicorn --bind :9090 --workers 1 --threads 1 --timeout 120 _wsgi:app
```
