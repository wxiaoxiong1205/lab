# PyTorch Multi-label Text Classification Demo

这是一个基于 PyTorch 的多标签文本分类示例，重点在于实现 `model.py` 中的模型输出处理逻辑。

## 需要关注的文件

- `model.py`：你需要实现的主要文件。
- `model_handle.py`：定义了 `ModelHandle` 接口，以及 `PredictionResult` 的返回格式。
- `model_demo.py`：提供了一个可直接参考的实现示例。

实际使用时，重点关注 `model.py` 即可。

## 实现说明

`model.py` 主要需要实现的方法是 `post_handle`。

### 后处理：`post_handle(model_output, threshold)`

输入是模型原始输出和多标签筛选阈值，输出应为 `PredictionResult`，其中包含：

- `labels`：所有命中标签的集合。
- 每个标签元素都包含 `class_id` 和 `score` 两个字段。

常见处理流程：

- 兼容不同输出格式，例如 `tensor`、`list`、`tuple` 或 `dict`。
- 提取分类 logits，并确认输出形状符合常见格式 `[B, C]`。
- 对 logits 做 `sigmoid`，得到各类别独立概率。
- 使用 `threshold` 筛选所有满足条件的类别，而不是只取 top1。
- 将每个命中类别整理成 `PredictedLabel(class_id, score)`。
- 返回包含多个标签结果的 `PredictionResult(labels=...)`。

后处理的目标是把模型原始输出整理成统一的多标签分类结果。

## 你只需要实现的内容

在 `model.py` 中，你只需要负责：

- 将模型输出和阈值转换为多标签结果。


## 启动服务

```bash
export LOG_LEVEL=DEBUG
gunicorn --bind :9090 --workers 1 --threads 1 --timeout 120 _wsgi:app
```
