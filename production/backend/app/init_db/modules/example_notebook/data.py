"""
内置 Notebook 案例种子数据
"""

from typing import Any, Dict, List


def get_example_notebook_data() -> List[Dict[str, Any]]:
    """获取内置 Notebook 案例种子数据"""
    return [
        {
            "name": "YOLO目标检测案例",
            "describe": """# YOLO目标检测案例

## 1\. 简介

在目标检测任务中，我们的目标是在图像中定位并识别出多个目标对象，预测每个对象的类别和边界框位置。本案例以 COCO128 数据集为例，演示如何进行 YOLO 目标检测模型的训练和预测。

目标检测是计算机视觉中的核心任务之一，广泛应用于自动驾驶、智能监控、工业质检等场景。与图像分类只需预测整张图片的类别不同，目标检测需要同时完成三个任务：

* **目标定位**：确定目标在图像中的位置（边界框坐标）
* **目标分类**：识别每个目标的类别
* **多目标处理**：在一张图像中检测出多个不同类别的目标

本案例使用 **YOLO11n** 作为基础模型，这是 YOLO 系列的较新版本，具有以下特点：

* **实时检测**：推理速度快，适合实时应用场景
* **高精度**：在速度和精度之间取得良好平衡
* **易于部署**：支持导出为 TorchScript 格式，便于生产环境部署

整个训练流程包括：

* 数据格式转换
* 数据集自动划分（训练集/验证集）
* 模型加载和微调
* 训练过程监控（Loss 曲线、mAP 指标）
* 模型评估和单图推理

相比于从零训练，本案例采用 **迁移学习** 策略，加载 YOLO11n 预训练权重，能够：

* 大幅减少训练时间
* 降低过拟合风险
* 在小数据集上也能获得良好效果

本文档基于当前仓库的真实实现，串起一条完整链路：

* 在 `train/` 中准备数据并训练 YOLO 检测模型
* 导出可部署的 TorchScript 模型
* 做一次本地单图推理验证
* 在 `service/` 中加载模型并启动推理服务

如果你对训练命令、推理命令或部署步骤不熟，建议同时参考以下资料。其中 `train/examples/npu_train_eval_demo.ipynb` 就是本文案例对应的 notebook 版本，并保留了一次真实运行输出，便于先建立预期。

![图片描述]({lab_export_path}/api/v1/storage/download-file/ml_example_notebook/images/20260429/e2b92174a94c44c0aacf3cf799c5b9b8.png)

## 2\. 适用范围

这个案例适用于当前仓库提供的 YOLO 检测训练与服务一体化样例，默认能力如下：

* 训练侧只支持 `NPU` 和 `CPU`
* 推理侧只加载 `TorchScript` 模型
* 服务侧按 Label Studio ML Backend 协议返回检测结果

需要注意，当前训练脚本虽然可以处理接近 COCO 结构的数据集，但对 `annotations.json` 中 `bbox` 的解释是：

```
[x1, y1, x2, y2]
```

不是官方 COCO 常见的：

```
[x, y, width, height]
```

因此，如果你使用的是官方原始 COCO128 标注文件，不能直接套用当前脚本，需要先转换成当前仓库约定的格式。

## 3\. 目录与文件

本案例主要涉及以下目录：

```
/lab/work
├── train/
│   ├── train.py
│   ├── evaluate.py
│   ├── requirement.txt
│   ├── examples/
│   │   └── npu_train_eval_demo.ipynb
│   └── models/
└── service/
    ├── _wsgi.py
    ├── custom_predict.py
    ├── model.py
    ├── requirements-base.txt
    └── requirements.txt
```

训练完成后，本案例最关心的产物是：

* 训练日志目录：`/lab/work/train/runs/detect/yolo_train/`
* 部署模型文件：`/lab/work/train/models/best_det_model.pt`

## 5\. 数据准备

### 5.1 数据目录

本案例以 `COCO128` 命名的数据目录位置在：

```
/lab/work/train/datasets/coco128/
├── annotations.json
└── images/
```

训练时通过 `--data_root datasets/coco128` 指定即可。

### 5.2 数据格式要求

当前训练脚本运行时会自动生成以下训练产物：

* `labels/`
* `train.txt`
* `val.txt`
* `data.yaml`

训练前只要求数据根目录下至少存在：

* `annotations.json`
* `images/`

如果你当前手上的数据不是当前仓库要求的 `bbox=[x1, y1, x2, y2]` 格式，需要先完成转换，再执行训练。

## 6\. 模型训练

如果你想先照着现成样例跑一遍，可优先看：

* `train/examples/npu_train_eval_demo.ipynb`

这个 notebook 使用的就是本文同一条链路。

### 6.1 NPU 训练

```
cd /lab/work/train
python train.py \
    --data_root datasets/coco128 \
    --pretrained_weights assets/yolo11n.pt \
    --save_path models/best_det_model.pt \
    --device npu:0
```

### 6.2 常用训练参数

| 参数                   | 默认值                        | 说明                               |
| ---------------------- | ----------------------------- | ---------------------------------- |
| `--data_root`          | `datasets/物体检测-1_V2_coco` | 数据集根目录                       |
| `--pretrained_weights` | `assets/yolo11n.pt`           | 预训练权重路径                     |
| `--save_path`          | `models/best_det_model.pt`    | TorchScript 导出目标路径           |
| `--device`             | `npu:0`                       | 支持 `npu` / `npu:0` / `0` / `cpu` |
| `--epochs`             | `50`                          | 训练轮数                           |
| `--batch_size`         | `16`                          | 训练 batch size                    |
| `--lr`                 | `0.01`                        | 初始学习率                         |
| `--imgsz`              | `640`                         | 输入分辨率                         |
| `--early_stop`         | `12`                          | 早停 patience                      |
| `--split_ratio`        | `0.8`                         | 训练集占比                         |
| `--seed`               | `42`                          | 训练随机种子                       |

### 6.3 训练输出

训练完成后，重点关注两个输出：

* `models/best_det_model.pt`
* `runs/detect/yolo_train/`

其中：

* `models/best_det_model.pt` 是后续部署到服务的核心模型文件
* `runs/detect/yolo_train/` 可用于查看训练日志和 TensorBoard 曲线

当前是 JupyterLab 环境，直接把下面这个目录导入 TensorBoard 插件即可：

```
/lab/work/train/runs/detect/yolo_train
```

`train/examples/npu_train_eval_demo.ipynb` 中保存过一次真实运行输出，你大致会看到类似结果：

```
运行设备: npu:0 | 训练/验证比例: 0.8:0.2 | 固定种子: 42
📌 扫描完毕！过滤空类别后，实际参与训练的类别共 71 个
🌟 数据集转换及重新划分完成：有效训练集 100 张，验证集 26 张
```

按 `train/README.md` 里的说明，训练启动后终端一般还会直接打印 TensorBoard 日志目录提示，例如：

```
TensorBoard: Start with 'tensorboard --logdir /lab/work/train/runs/detect/yolo_train'
```

### 6.4 训练过程图表

如果你希望在案例里顺手看训练过程图表，可以直接参考 `train/examples/npu_train_eval_demo.ipynb`，它已经把两种常见查看方式都放进去了：

* 读取 `runs/detect/yolo_train/results.csv`，用 `pandas + matplotlib` 直接画训练/验证指标图
* 把 `runs/detect/yolo_train/` 作为 TensorBoard 日志目录导入查看曲线

notebook 中对应的 `results.csv` 绘图单元会生成一张 `2 x 2` 的训练图表，输出类似：

![图片描述]({lab_export_path}/api/v1/storage/download-file/ml_example_notebook/images/20260429/8a157d3ea8294b289c9469682720a7fe.png)

图表会包含训练损失、验证损失以及精度相关指标，适合在 notebook 里快速确认训练是否正常收敛。

当前是 JupyterLab 环境，TensorBoard 这条链路不需要额外改路径，直接把下面目录导入插件页面即可：

```
/lab/work/train/runs/detect/yolo_train
```

![图片描述]({lab_export_path}/api/v1/storage/download-file/ml_example_notebook/images/20260429/7f78cfded6dd4bd9af517ebf33ae77e1.png)

这个案例里关于训练过程的可视化，既可以看 notebook 里基于 `results.csv` 的静态图，也可以看 TensorBoard 里的完整训练曲线。

## 7\. 本地推理验证

在把模型接入服务前，建议先做一次单图验证，确认导出的 TorchScript 模型能正常工作。

### 7.1 NPU 推理

```
cd /lab/work/train
python evaluate.py \
    --weights models/best_det_model.pt \
    --source datasets/coco128/images/0.jpg \
    --data_root datasets/coco128 \
    --device npu:0 \
    --conf 0.25 \
    --iou 0.45 \
    --imgsz 640
```

推理完成后，结果图会输出到：

```
/lab/work/train/runs/eval/
```

参考的是 notebook 里的单图推理示例，它使用的是 `datasets/coco128/images/4.jpg`，一次真实运行输出类似：

```
运行设备: npu:0 | 使用的 NPU: [卡号: 0] Ascend910B2
正在读取并预处理图片: datasets/coco128/images/4.jpg
正在执行前向计算...
✅ 检测到 1 个目标:
  - 类别: person (置信度: 0.3120)
🚀 可视化结果已保存至: runs/eval/jit_4.jpg
```

如果没有检测到目标，可以先把 `--conf` 调低一些排查。

## 8\. 模型部署到服务

### 8.1 复制模型到指定路径

```
mkdir -p /data/models
cp /lab/work/train/models/best_det_model.pt /data/models/model.pt
```

### 8.2 启动服务

用 gunicorn启动：

```
cd /lab/work/service
gunicorn --bind :9090 --workers 1 --threads 1 --timeout 120 _wsgi:app
```

### 8.3 启动后测试

当前 `label_studio_ml` 应用同时暴露了两个健康检查入口：

* `GET /`
* `GET /health`

正常情况下，两者都会返回 `200 OK`，响应体类似：

```
{"status":"UP","model_class":"PlatformLabelStudio"}
```

## 9\. 请求示例

平台会把 notebook 监听的服务端口暴露成一个外部地址，所以可以直接从外部请求这个服务。

验证下面这种最小 `curl` 是可用的：

```
curl --location --request POST '<notebook映射的外部地址>/predict' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "tasks": [
      {
        "id": 1,
        "data": {
          "image":<图片地址>
        }
      }
    ],
    "label_config": "<View>\n  <Image name=\"image\" value=\"$image\"/>\n  <RectangleLabels name=\"label\" toName=\"image\">\n    <Label value=\"person\" index=\"0\"/>\n    <Label value=\"bicycle\" index=\"1\"/>\n    <Label value=\"car\" index=\"2\"/>\n    <Label value=\"motorcycle\" index=\"3\"/>\n    <Label value=\"airplane\" index=\"4\"/>\n    <Label value=\"bus\" index=\"5\"/>\n    <Label value=\"train\" index=\"6\"/>\n  </RectangleLabels>\n</View>",
    "project": "1.1"
  }'
```

需要注意：

* 这个 `label_config` 是缩短过的 mock 数据，目的是快速验证预测接口可用，不是为了完整覆盖全部 COCO 类别。
* `tasks[].data.image` 使用的是外部可访问的图片下载地址，因此服务侧能够正常拉取图片并推理。

`/predict` 的请求体里有两个字段是跟数据集绑定的，换数据集必须跟着改，不能直接套模板用。

**`label_config`** — 必须和训练用的 `data.yaml` 里 `names` 字段完全对上，不然预测结果会乱。

**`tasks[].data.image`** — 送去推理的测试图片地址，换数据集就得换图片。

如果换数据集比如 `物体检测-1_V2_coco`，可以手动改请求体，直接跑一下 `gen_curl.py`：

bash

```
cd /lab/work/service
python gen_curl.py \
  ../train/datasets/物体检测-1_V2_coco/data.yaml \
  --image-url <图片地址>
  --server <notebook映射的外部地址>
```

脚本会读新的 `data.yaml`，自动把这两个字段更新好，输出一条能直接执行的 `curl` 命令。

## 10\. 推荐跑通流程

如果你只是想先完整跑通一次，可以直接按下面顺序执行：

```
cd /lab/work/train
pip install -r requirement.txt
python train.py --data_root datasets/coco128 --save_path models/best_det_model.pt --device npu:0
python evaluate.py --weights models/best_det_model.pt --source datasets/coco128/images/0.jpg --data_root datasets/coco128 --device npu:0

mkdir -p /data/models
cp /lab/work/train/models/best_det_model.pt /data/models/model.pt

cd /lab/work/service
gunicorn --bind :9090 --workers 1 --threads 1 --timeout 120 _wsgi:app
```""",
            "is_available": True,
            "built_in_address": "ml_example_notebook/NPU-YOLO",
            "biz_type": "machine_learning",
            "tenant_id": "0",
        },
    ]
