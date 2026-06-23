# PyTorch Semantic Segmentation Demo

这是一个基于 PyTorch 的语义分割示例，重点在于实现 `model.py` 中的模型输入处理和输出处理逻辑。

## 需要关注的文件

- `model.py`：你需要实现的主要文件。
- `model_handle.py`：定义了 `ModelHandle` 接口，可用于确认方法签名和返回值要求。
- `model_demo.py`：提供了一个可直接参考的实现示例。

实际使用时，重点关注 `model.py` 即可。

## 实现说明

`model.py` 主要需要实现两个方法：`pre_handle` 和 `post_handle`。

### 前置处理：`pre_handle(image_path)`

输入是图片路径，输出应为模型可直接推理的 `torch.Tensor`。

常见处理流程：

- 读取图片并检查是否成功。
- 按模型要求调整图片尺寸，例如 `512 x 512`。
- 将像素值转为浮点数并归一化，例如除以 `255.0`。
- 按需要补充颜色空间转换、均值方差标准化等步骤。
- 将图片从 `HWC` 转为 `CHW`，并补上 batch 维度，得到形如 `[1, C, H, W]` 的 tensor。

前置处理的目标是把原始图片转换为模型输入。

### 后处理：`post_handle(model_output)`

输入是模型原始输出，输出应为 `PredictionResult`，包含以下两个字段：

- `mask`：形状为 `[H, W]` 的类别图，每个像素值表示类别 id。
- `confidence_map`：形状为 `[H, W]` 的置信度图，每个像素值表示最终预测类别的概率，范围为 `0.0 ~ 1.0`。

常见处理流程：

- 确认输出维度符合语义分割常见格式 `[B, C, H, W]`。
- 二分类场景下，通常先做 `sigmoid`，再按阈值生成类别结果。
- 多分类场景下，通常先做 `softmax`，再用 `argmax` 获取每个像素的最终类别。
- 根据最终类别提取对应概率，生成 `confidence_map`。

后处理的目标是把模型输出整理成统一的分割结果。

## 你只需要实现的内容

在 `model.py` 中，你只需要负责：

- 将图片处理为模型输入。
- 将模型输出转换为 `mask` 和 `confidence_map`。


## 启动服务

```bash
export LOG_LEVEL=DEBUG
gunicorn --bind :9090 --workers 1 --threads 1 --timeout 120 _wsgi:app
```
