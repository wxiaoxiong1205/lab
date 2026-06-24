# PyTorch Instance Segmentation Demo

这是一个基于 PyTorch 的实例分割（标准）示例，重点在于实现 `model.py` 中的模型输入处理和输出处理逻辑。

## 需要关注的文件

- `model.py`：你需要实现的主要文件。
- `model_handle.py`：定义了 `ModelHandle` 接口、`ModelInput` 输入结构，以及 `PredictionResult` 的返回格式。
- `model_demo.py`：提供了一个可直接参考的实例分割（标准）实现示例。
- `custom_predict.py`：提供固定推理骨架，负责模型加载、任务解析和结果组装。

实际使用时，重点关注 `model.py` 即可。

## 实现说明

`model.py` 主要需要实现两个方法：`pre_handle` 和 `post_handle`。

### 前置处理：`pre_handle(image_path)`

输入是图片路径，输出应为 `ModelInput` 对象。

其中：

- `image_tensor`：可直接送入模型前向的输入张量。
- `postprocess_context`：供 `post_handle` 使用的透传上下文。如果后处理需要额外信息，可写入该字典；不需要时可返回空字典。

常见处理流程：

- 读取图片并检查是否成功。
- 按模型要求调整输入尺寸，例如固定到 `640 x 640`。
- 按等比例缩放并补边，例如使用 `letterbox` 方式保留原图比例。
- 将图片从 `BGR` 转为 `RGB`。
- 将图片从 `HWC` 转为 `CHW`，并补上 batch 维度。
- 将像素值转为浮点数并归一化到 `0 ~ 1`。
- 将后处理需要的辅助信息写入 `postprocess_context`，例如原图尺寸、缩放比例和 padding。

前置处理的目标是把原始图片转换为模型输入，并保留实例分割结果还原到原图坐标系所需的信息。

### 后处理：`post_handle(model_output, model_input)`

输入是模型原始输出和本次推理对应的 `ModelInput` 对象，输出应为 `PredictionResult` 列表。每个结果通常包含以下字段：

- `class_id`：稳定类别 ID，需要和标签配置中的类别索引对齐。
- `score`：当前实例的预测置信度，范围为 `0.0 ~ 1.0`。
- `points`：实例 polygon 点集，使用原图像素坐标系，每个点为 `[x, y]`。

常见处理流程：

- 兼容不同 TorchScript 输出格式，例如 `tuple`、`list` 或 `dict`。
- 从模型输出中提取实例分割检测分支和 `proto` 分支。
- 将原始输出统一整理为可解码的实例候选格式。
- 根据置信度阈值过滤低质量候选。
- 按类别执行 NMS，去除重复实例。
- 利用 mask 系数和 `proto` 特征图解码实例 mask。
- 根据 `model_input.postprocess_context` 中保存的缩放比例和 padding，将结果还原到原图坐标系。
- 将实例 mask 转换为 polygon 点集。
- 将最终结果整理为 `PredictionResult` 列表返回。

后处理的目标是把模型原始输出整理成统一的实例分割中间结果，供平台进一步编码为 Label Studio `polygonlabels`。


## 你只需要实现的内容

在 `model.py` 中，你只需要负责：

- 将图片处理为模型输入。
- 将模型输出转换为实例分割结果列表。
- 保证返回的每个实例都包含合法的 `class_id`、`score` 和 polygon `points`。


## 启动服务

```bash
export LOG_LEVEL=DEBUG
gunicorn --bind :9090 --workers 1 --threads 1 --timeout 120 _wsgi:app
```
