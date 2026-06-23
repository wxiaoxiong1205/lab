export type BuiltinNotebookCase = {
  id: string
  name: string
  summary: string
  description: string
  category: '机器学习' | '大模型'
  taskType: string
  datasetName: string
  runtime: string
  tags: string[]
  creatorAccount: string
  creator: string
  createdAt: string
}

const dedent = (value: string) =>
  (() => {
    const lines = value.replace(/^\n/, '').replace(/\n\s+$/g, '\n').split('\n')
    const indents = lines
      .filter(line => line.trim())
      .map(line => line.match(/^ */)?.[0].length ?? 0)
    const minIndent = indents.length ? Math.min(...indents) : 0
    return lines.map(line => line.slice(minIndent)).join('\n').trim()
  })()

const mlCreator = {
  creatorAccount: 'zhangsan',
  creator: '平台',
  createdAt: '2026/05/28 10:20:00',
}

const llmCreator = {
  creatorAccount: 'zhangsan',
  creator: '平台',
  createdAt: '2026/05/28 10:30:00',
}

export const machineLearningNotebookCases: BuiltinNotebookCase[] = [
  {
    id: 'ml-case-yolo-object-detection',
    name: 'YOLO目标检测案例',
    summary: '生产环境机器学习 Notebook 广场原始 YOLO 目标检测案例，串起训练、导出、单图验证、服务部署和 predict 请求。',
    category: '机器学习',
    taskType: '物体检测',
    datasetName: '/lab/work/train/datasets/coco128',
    runtime: 'JupyterLab / NPU 或 CPU / YOLO11n / TorchScript',
    tags: ['YOLO11n', 'COCO128', 'TorchScript', 'Label Studio'],
    ...mlCreator,
    description: dedent(`
      # YOLO目标检测案例

      ## 1. 简介

      在目标检测任务中，我们的目标是在图像中定位并识别出多个目标对象，预测每个对象的类别和边界框位置。本案例以 COCO128 数据集为例，演示如何进行 YOLO 目标检测模型的训练和预测。

      目标检测是计算机视觉中的核心任务之一，广泛应用于自动驾驶、智能监控、工业质检等场景。与图像分类只需预测整张图片的类别不同，目标检测需要同时完成三个任务：

      - 目标定位：确定目标在图像中的位置（边界框坐标）
      - 目标分类：识别每个目标的类别
      - 多目标处理：在一张图像中检测出多个不同类别的目标

      本案例使用 YOLO11n 作为基础模型，这是 YOLO 系列的较新版本，具有以下特点：

      - 实时检测：推理速度快，适合实时应用场景
      - 高精度：在速度和精度之间取得良好平衡
      - 易于部署：支持导出为 TorchScript 格式，便于生产环境部署

      整个训练流程包括：

      - 数据格式转换
      - 数据集自动划分（训练集/验证集）
      - 模型加载和微调
      - 训练过程监控（Loss 曲线、mAP 指标）
      - 模型评估和单图推理

      相比于从零训练，本案例采用迁移学习策略，加载 YOLO11n 预训练权重，能够：

      - 大幅减少训练时间
      - 降低过拟合风险
      - 在小数据集上也能获得良好效果

      本文档基于当前仓库的真实实现，串起一条完整链路：

      - 在 train/ 中准备数据并训练 YOLO 检测模型
      - 导出可部署的 TorchScript 模型
      - 做一次本地单图推理验证
      - 在 service/ 中加载模型并启动推理服务

      如果你对训练命令、推理命令或部署步骤不熟，建议同时参考以下资料。其中 train/examples/npu_train_eval_demo.ipynb 就是本文案例对应的 notebook 版本，并保留了一次真实运行输出，便于先建立预期。

      ![YOLO11n 目标检测示例](/notebook-cases/yolo-object-detection-overview.svg)

      ## 2. 适用范围

      这个案例适用于当前仓库提供的 YOLO 检测训练与服务一体化样例，默认能力如下：

      - 训练侧只支持 NPU 和 CPU
      - 推理侧只加载 TorchScript 模型
      - 服务侧按 Label Studio ML Backend 协议返回检测结果

      需要注意，当前训练脚本虽然可以处理接近 COCO 结构的数据集，但对 annotations.json 中 bbox 的解释是：

      ~~~text
      [x1, y1, x2, y2]
      ~~~

      不是官方 COCO 常见的：

      ~~~text
      [x, y, width, height]
      ~~~

      因此，如果你使用的是官方原始 COCO128 标注文件，不能直接套用当前脚本，需要先转换成当前仓库约定的格式。

      ## 3. 目录与文件

      本案例主要涉及以下目录：

      ~~~text
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
      ~~~

      训练完成后，本案例最关心的产物是：

      - 训练日志目录：/lab/work/train/runs/detect/yolo_train/
      - 部署模型文件：/lab/work/train/models/best_det_model.pt

      ## 5. 数据准备

      ### 5.1 数据目录

      本案例以 COCO128 命名的数据目录位置在：

      ~~~text
      /lab/work/train/datasets/coco128/
      ├── annotations.json
      └── images/
      ~~~

      训练时通过 --data_root datasets/coco128 指定即可。

      ### 5.2 数据格式要求

      当前训练脚本运行时会自动生成以下训练产物：

      - labels/
      - train.txt
      - val.txt
      - data.yaml

      训练前只要求数据根目录下至少存在：

      - annotations.json
      - images/

      如果你当前手上的数据不是当前仓库要求的 bbox=[x1, y1, x2, y2] 格式，需要先完成转换，再执行训练。

      ## 6. 模型训练

      如果你想先照着现成样例跑一遍，可优先看：

      - train/examples/npu_train_eval_demo.ipynb

      这个 notebook 使用的就是本文同一条链路。

      ### 6.1 NPU 训练

      ~~~bash
      cd /lab/work/train
      python train.py \\
        --data_root datasets/coco128 \\
        --pretrained_weights assets/yolo11n.pt \\
        --save_path models/best_det_model.pt \\
        --device npu:0
      ~~~

      ### 6.2 常用训练参数

      | 参数 | 默认值 | 说明 |
      | --- | --- | --- |
      | --data_root | datasets/物体检测-1_V2_coco | 数据集根目录 |
      | --pretrained_weights | assets/yolo11n.pt | 预训练权重路径 |
      | --save_path | models/best_det_model.pt | TorchScript 导出目标路径 |
      | --device | npu:0 | 支持 npu / npu:0 / 0 / cpu |
      | --epochs | 50 | 训练轮数 |
      | --batch_size | 16 | 训练 batch size |
      | --lr | 0.01 | 初始学习率 |
      | --imgsz | 640 | 输入分辨率 |
      | --early_stop | 12 | 早停 patience |
      | --split_ratio | 0.8 | 训练集占比 |
      | --seed | 42 | 训练随机种子 |

      ### 6.3 训练输出

      训练完成后，重点关注两个输出：

      - models/best_det_model.pt
      - runs/detect/yolo_train/

      其中：

      - models/best_det_model.pt 是后续部署到服务的核心模型文件
      - runs/detect/yolo_train/ 可用于查看训练日志和 TensorBoard 曲线

      当前是 JupyterLab 环境，直接把下面这个目录导入 TensorBoard 插件即可：

      ~~~text
      /lab/work/train/runs/detect/yolo_train
      ~~~

      train/examples/npu_train_eval_demo.ipynb 中保存过一次真实运行输出，你大致会看到类似结果：

      ~~~text
      运行设备: npu:0 | 训练/验证比例: 0.8:0.2 | 固定种子: 42
      📌 扫描完毕！过滤空类别后，实际参与训练的类别共 71 个
      🌟 数据集转换及重新划分完成：有效训练集 100 张，验证集 26 张
      ~~~

      按 train/README.md 里的说明，训练启动后终端一般还会直接打印 TensorBoard 日志目录提示，例如：

      ~~~text
      TensorBoard: Start with 'tensorboard --logdir /lab/work/train/runs/detect/yolo_train'
      ~~~

      ### 6.4 训练过程图表

      如果你希望在案例里顺手看训练过程图表，可以直接参考 train/examples/npu_train_eval_demo.ipynb，它已经把两种常见查看方式都放进去了：

      - 读取 runs/detect/yolo_train/results.csv，用 pandas + matplotlib 直接画训练/验证指标图
      - 把 runs/detect/yolo_train/ 作为 TensorBoard 日志目录导入查看曲线

      notebook 中对应的 results.csv 绘图单元会生成一张 2 x 2 的训练图表。图表会包含训练损失、验证损失以及精度相关指标，适合在 notebook 里快速确认训练是否正常收敛。

      ![训练流程概览与评估指标示例](/notebook-cases/yolo-training-workflow.svg)

      当前是 JupyterLab 环境，TensorBoard 这条链路不需要额外改路径，直接把下面目录导入插件页面即可：

      ~~~text
      /lab/work/train/runs/detect/yolo_train
      ~~~

      这个案例里关于训练过程的可视化，既可以看 notebook 里基于 results.csv 的静态图，也可以看 TensorBoard 里的完整训练曲线。

      ## 7. 本地推理验证

      在把模型接入服务前，建议先做一次单图验证，确认导出的 TorchScript 模型能正常工作。

      ### 7.1 NPU 推理

      ~~~bash
      cd /lab/work/train
      python evaluate.py \\
        --weights models/best_det_model.pt \\
        --source datasets/coco128/images/0.jpg \\
        --data_root datasets/coco128 \\
        --device npu:0 \\
        --conf 0.25 \\
        --iou 0.45 \\
        --imgsz 640
      ~~~

      推理完成后，结果图会输出到：

      ~~~text
      /lab/work/train/runs/eval/
      ~~~

      参考的是 notebook 里的单图推理示例，它使用的是 datasets/coco128/images/4.jpg，一次真实运行输出类似：

      ~~~text
      运行设备: npu:0 | 使用的 NPU: [卡号: 0] Ascend910B2
      正在读取并预处理图片: datasets/coco128/images/4.jpg
      正在执行前向计算...
      ✅ 检测到 1 个目标:
        - 类别: person (置信度: 0.3120)
      🚀 可视化结果已保存至: runs/eval/jit_4.jpg
      ~~~

      如果没有检测到目标，可以先把 --conf 调低一些排查。

      ## 8. 模型部署到服务

      ### 8.1 复制模型到指定路径

      ~~~bash
      mkdir -p /data/models
      cp /lab/work/train/models/best_det_model.pt /data/models/model.pt
      ~~~

      ### 8.2 启动服务

      用 gunicorn 启动：

      ~~~bash
      cd /lab/work/service
      gunicorn --bind :9090 --workers 1 --threads 1 --timeout 120 _wsgi:app
      ~~~

      ### 8.3 启动后测试

      当前 label_studio_ml 应用同时暴露了两个健康检查入口：

      - GET /
      - GET /health

      正常情况下，两者都会返回 200 OK，响应体类似：

      ~~~json
      {"status":"UP","model_class":"PlatformLabelStudio"}
      ~~~

      ## 9. 请求示例

      平台会把 notebook 监听的服务端口暴露成一个外部地址，所以可以直接从外部请求这个服务。验证下面这种最小 curl 是可用的：

      ~~~bash
      curl --location --request POST '<notebook映射的外部地址>/predict' \\
        --header 'Content-Type: application/json' \\
        --data-raw '{
          "tasks": [
            {
              "id": 1,
              "data": {
                "image": "<图片地址>"
              }
            }
          ],
          "label_config": "<View><Image name=\\"image\\" value=\\"$image\\"/><RectangleLabels name=\\"label\\" toName=\\"image\\"><Label value=\\"person\\" index=\\"0\\"/><Label value=\\"bicycle\\" index=\\"1\\"/><Label value=\\"car\\" index=\\"2\\"/><Label value=\\"motorcycle\\" index=\\"3\\"/><Label value=\\"airplane\\" index=\\"4\\"/><Label value=\\"bus\\" index=\\"5\\"/><Label value=\\"train\\" index=\\"6\\"/></RectangleLabels></View>",
          "project": "1.1"
        }'
      ~~~

      需要注意：

      - 这个 label_config 是缩短过的 mock 数据，目的是快速验证预测接口可用，不是为了完整覆盖全部 COCO 类别。
      - tasks[].data.image 使用的是外部可访问的图片下载地址，因此服务侧能够正常拉取图片并推理。
      - /predict 的请求体里有两个字段是跟数据集绑定的，换数据集必须跟着改，不能直接套模板用。
      - label_config 必须和训练用的 data.yaml 里 names 字段完全对上，不然预测结果会乱。
      - tasks[].data.image 是送去推理的测试图片地址，换数据集就得换图片。

      如果换数据集比如 物体检测-1_V2_coco，可以手动改请求体，直接跑一下 gen_curl.py：

      ~~~bash
      cd /lab/work/service
      python gen_curl.py \\
        ../train/datasets/物体检测-1_V2_coco/data.yaml \\
        --image-url <图片地址> \\
        --server <notebook映射的外部地址>
      ~~~

      脚本会读新的 data.yaml，自动把这两个字段更新好，输出一条能直接执行的 curl 命令。

      ## 10. 推荐跑通流程

      如果你只是想先完整跑通一次，可以直接按下面顺序执行：

      ~~~bash
      cd /lab/work/train
      pip install -r requirement.txt
      python train.py --data_root datasets/coco128 --save_path models/best_det_model.pt --device npu:0
      python evaluate.py --weights models/best_det_model.pt --source datasets/coco128/images/0.jpg --data_root datasets/coco128 --device npu:0

      mkdir -p /data/models
      cp /lab/work/train/models/best_det_model.pt /data/models/model.pt

      cd /lab/work/service
      gunicorn --bind :9090 --workers 1 --threads 1 --timeout 120 _wsgi:app
      ~~~
    `),
  },
  {
    id: 'ml-case-text-classification',
    name: '文本分类案例',
    summary: '生成客服短文本分类数据，使用 TF-IDF + 线性分类器完成训练、评估和单条预测。',
    category: '机器学习',
    taskType: '文本分类',
    datasetName: 'notebook-data/text_classification/customer_intent.csv',
    runtime: 'Python 3.9+，CPU 即可运行',
    tags: ['文本分类', 'TF-IDF', 'sklearn', '内置数据'],
    ...mlCreator,
    description: dedent(`
      # 文本分类案例

      本案例模拟客服意图识别任务，包含数据生成、训练集/测试集切分、模型训练、评估和推理。

      ## 1. 安装依赖

      ~~~bash
      pip install -U pandas scikit-learn joblib
      ~~~

      ## 2. 生成样本数据

      ~~~python
      from pathlib import Path
      import pandas as pd

      root = Path("notebook-data/text_classification")
      root.mkdir(parents=True, exist_ok=True)
      rows = [
          ("我想查询一下订单到哪里了", "物流查询"),
          ("包裹今天还没到，帮我看下物流", "物流查询"),
          ("这个商品可以开发票吗", "发票咨询"),
          ("麻烦补开一下电子发票", "发票咨询"),
          ("收到货有破损，需要申请退款", "退款售后"),
          ("我买错型号了，想退货", "退款售后"),
          ("优惠券为什么不能用", "优惠活动"),
          ("满减活动什么时候结束", "优惠活动"),
      ] * 8
      df = pd.DataFrame(rows, columns=["text", "label"])
      df.to_csv(root / "customer_intent.csv", index=False)
      df.head()
      ~~~

      ## 3. 训练与评估

      ~~~python
      import pandas as pd
      import joblib
      from sklearn.model_selection import train_test_split
      from sklearn.pipeline import Pipeline
      from sklearn.feature_extraction.text import TfidfVectorizer
      from sklearn.linear_model import LogisticRegression
      from sklearn.metrics import classification_report

      df = pd.read_csv("notebook-data/text_classification/customer_intent.csv")
      train_x, test_x, train_y, test_y = train_test_split(
          df["text"], df["label"], test_size=0.25, random_state=42, stratify=df["label"]
      )
      model = Pipeline([
          ("tfidf", TfidfVectorizer(analyzer="char", ngram_range=(2, 4))),
          ("clf", LogisticRegression(max_iter=500)),
      ])
      model.fit(train_x, train_y)
      pred = model.predict(test_x)
      print(classification_report(test_y, pred))
      joblib.dump(model, "notebook-data/text_classification/text_classifier.joblib")
      ~~~

      ## 4. 单条推理

      ~~~python
      import joblib
      model = joblib.load("notebook-data/text_classification/text_classifier.joblib")
      for text in ["我想退掉这个订单", "帮我查一下快递"]:
          print(text, "=>", model.predict([text])[0])
      ~~~
    `),
  },
  {
    id: 'ml-case-ner',
    name: '实体识别案例',
    summary: '内置中文业务句子与 BIO 标签，提供可直接运行的数据检查、字典增强和评估示例。',
    category: '机器学习',
    taskType: '实体识别',
    datasetName: 'notebook-data/ner/order_ner.jsonl',
    runtime: 'Python 3.9+，CPU 即可运行',
    tags: ['实体识别', 'BIO', 'JSONL', '内置数据'],
    ...mlCreator,
    description: dedent(`
      # 实体识别案例

      本案例生成订单、商品、时间等实体的 BIO 标注数据，并实现一个可运行的字典增强基线，便于验证标注数据格式和端到端推理链路。

      ## 1. 生成 JSONL 标注数据

      ~~~python
      from pathlib import Path
      import json

      root = Path("notebook-data/ner")
      root.mkdir(parents=True, exist_ok=True)
      samples = [
          {"text": "订单A1024昨天发往广州", "entities": [{"start": 2, "end": 7, "label": "ORDER_ID"}, {"start": 7, "end": 9, "label": "DATE"}, {"start": 11, "end": 13, "label": "CITY"}]},
          {"text": "请查询B7788的运动鞋物流", "entities": [{"start": 3, "end": 8, "label": "ORDER_ID"}, {"start": 9, "end": 12, "label": "PRODUCT"}]},
          {"text": "上海用户咨询C9001退款", "entities": [{"start": 0, "end": 2, "label": "CITY"}, {"start": 6, "end": 11, "label": "ORDER_ID"}]},
      ] * 10
      path = root / "order_ner.jsonl"
      with path.open("w", encoding="utf-8") as f:
          for row in samples:
              f.write(json.dumps(row, ensure_ascii=False) + "\\n")
      print(path)
      ~~~

      ## 2. 转换 BIO 标签

      ~~~python
      import json
      from pathlib import Path

      def to_bio(text, entities):
          tags = ["O"] * len(text)
          for entity in entities:
              start, end, label = entity["start"], entity["end"], entity["label"]
              tags[start] = f"B-{label}"
              for idx in range(start + 1, end):
                  tags[idx] = f"I-{label}"
          return list(text), tags

      rows = [json.loads(line) for line in Path("notebook-data/ner/order_ner.jsonl").read_text(encoding="utf-8").splitlines()]
      tokens, tags = to_bio(rows[0]["text"], rows[0]["entities"])
      print(list(zip(tokens, tags)))
      ~~~

      ## 3. 可运行基线推理

      ~~~python
      import re

      patterns = {
          "ORDER_ID": r"[A-Z][0-9]{4}",
          "CITY": r"广州|上海|北京|深圳",
          "PRODUCT": r"运动鞋|手机|耳机",
          "DATE": r"今天|昨天|明天",
      }

      def predict_entities(text):
          results = []
          for label, pattern in patterns.items():
              for match in re.finditer(pattern, text):
                  results.append({"start": match.start(), "end": match.end(), "label": label, "text": match.group()})
          return sorted(results, key=lambda item: item["start"])

      print(predict_entities("请帮我查询A1024昨天发往广州的运动鞋"))
      ~~~
    `),
  },
  {
    id: 'ml-case-image-classification',
    name: '图像分类案例',
    summary: '生成几何图形图片，提取颜色和形状统计特征，训练轻量图像分类器。',
    category: '机器学习',
    taskType: '图像分类',
    datasetName: 'notebook-data/image_classification',
    runtime: 'Python 3.9+，CPU 即可运行',
    tags: ['图像分类', 'Pillow', 'sklearn', '内置数据'],
    ...mlCreator,
    description: dedent(`
      # 图像分类案例

      本案例使用合成图像构建分类数据集，训练一个轻量分类器识别矩形、圆形和三角形。

      ## 1. 安装依赖

      ~~~bash
      pip install -U pillow numpy scikit-learn
      ~~~

      ## 2. 生成图片数据

      ~~~python
      from pathlib import Path
      from PIL import Image, ImageDraw
      import random

      random.seed(11)
      root = Path("notebook-data/image_classification")
      labels = ["rectangle", "circle", "triangle"]
      for label in labels:
          (root / label).mkdir(parents=True, exist_ok=True)

      for i in range(90):
          label = labels[i % 3]
          img = Image.new("RGB", (96, 96), "white")
          draw = ImageDraw.Draw(img)
          color = {"rectangle": "#2563eb", "circle": "#16a34a", "triangle": "#f97316"}[label]
          if label == "rectangle":
              draw.rectangle([24, 28, 72, 68], fill=color)
          elif label == "circle":
              draw.ellipse([24, 24, 72, 72], fill=color)
          else:
              draw.polygon([(48, 18), (20, 76), (76, 76)], fill=color)
          img.save(root / label / f"{label}_{i:03d}.png")
      print(root)
      ~~~

      ## 3. 提取特征并训练

      ~~~python
      from pathlib import Path
      from PIL import Image
      import numpy as np
      from sklearn.model_selection import train_test_split
      from sklearn.ensemble import RandomForestClassifier
      from sklearn.metrics import classification_report

      root = Path("notebook-data/image_classification")
      x, y = [], []
      for label_dir in root.iterdir():
          for path in label_dir.glob("*.png"):
              arr = np.asarray(Image.open(path).convert("RGB")) / 255.0
              mask = (arr.mean(axis=2) < 0.98).astype(float)
              features = np.concatenate([arr.mean(axis=(0, 1)), arr.std(axis=(0, 1)), [mask.mean()]])
              x.append(features)
              y.append(label_dir.name)

      train_x, test_x, train_y, test_y = train_test_split(x, y, test_size=0.25, random_state=42, stratify=y)
      clf = RandomForestClassifier(n_estimators=80, random_state=42)
      clf.fit(train_x, train_y)
      pred = clf.predict(test_x)
      print(classification_report(test_y, pred))
      ~~~
    `),
  },
  {
    id: 'ml-case-basic-object-detection',
    name: '物体检测案例',
    summary: '不依赖深度学习框架，生成图片和框标注，并用颜色阈值完成检测框回归演示。',
    category: '机器学习',
    taskType: '物体检测',
    datasetName: 'notebook-data/object_detection',
    runtime: 'Python 3.9+，CPU 即可运行',
    tags: ['物体检测', 'BBox', 'Pillow', '内置数据'],
    ...mlCreator,
    description: dedent(`
      # 物体检测案例

      本案例用于理解物体检测数据结构和评估闭环：生成图片、写入标注框、通过颜色阈值获得预测框，并计算 IoU。

      ## 1. 安装依赖

      ~~~bash
      pip install -U pillow numpy pandas
      ~~~

      ## 2. 生成图片和标注框

      ~~~python
      from pathlib import Path
      from PIL import Image, ImageDraw
      import pandas as pd
      import random

      root = Path("notebook-data/object_detection")
      (root / "images").mkdir(parents=True, exist_ok=True)
      rows = []
      random.seed(23)
      for i in range(30):
          img = Image.new("RGB", (160, 120), "#f8fafc")
          draw = ImageDraw.Draw(img)
          x1, y1 = random.randint(20, 70), random.randint(15, 55)
          x2, y2 = x1 + random.randint(30, 55), y1 + random.randint(24, 45)
          draw.rectangle([x1, y1, x2, y2], fill="#dc2626")
          name = f"det_{i:03d}.png"
          img.save(root / "images" / name)
          rows.append({"image": name, "label": "defect", "x1": x1, "y1": y1, "x2": x2, "y2": y2})
      pd.DataFrame(rows).to_csv(root / "annotations.csv", index=False)
      print(root / "annotations.csv")
      ~~~

      ## 3. 检测红色目标并计算 IoU

      ~~~python
      from pathlib import Path
      from PIL import Image
      import pandas as pd
      import numpy as np

      root = Path("notebook-data/object_detection")
      ann = pd.read_csv(root / "annotations.csv")

      def detect_red_box(path):
          arr = np.asarray(Image.open(path).convert("RGB"))
          mask = (arr[:, :, 0] > 180) & (arr[:, :, 1] < 80) & (arr[:, :, 2] < 80)
          ys, xs = np.where(mask)
          return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]

      def iou(a, b):
          ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
          ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
          inter = max(0, ix2 - ix1 + 1) * max(0, iy2 - iy1 + 1)
          area_a = (a[2] - a[0] + 1) * (a[3] - a[1] + 1)
          area_b = (b[2] - b[0] + 1) * (b[3] - b[1] + 1)
          return inter / (area_a + area_b - inter)

      scores = []
      for _, row in ann.iterrows():
          pred = detect_red_box(root / "images" / row["image"])
          truth = [row.x1, row.y1, row.x2, row.y2]
          scores.append(iou(pred, truth))
      print("mean IoU:", round(float(np.mean(scores)), 4))
      ~~~
    `),
  },
  {
    id: 'ml-case-image-segmentation',
    name: '图像分割案例',
    summary: '生成图片与像素级 mask，训练/推理前先完成分割数据格式、mask 可视化和 IoU 评估闭环。',
    category: '机器学习',
    taskType: '图像分割',
    datasetName: 'notebook-data/image_segmentation',
    runtime: 'Python 3.9+，CPU 即可运行',
    tags: ['图像分割', 'Mask', 'IoU', '内置数据'],
    ...mlCreator,
    description: dedent(`
      # 图像分割案例

      本案例生成简单缺陷区域图片和对应 mask，使用颜色阈值做可运行的分割基线，并计算像素级 IoU。

      ## 1. 安装依赖

      ~~~bash
      pip install -U pillow numpy
      ~~~

      ## 2. 生成图片与 mask

      ~~~python
      from pathlib import Path
      from PIL import Image, ImageDraw
      import random

      root = Path("notebook-data/image_segmentation")
      (root / "images").mkdir(parents=True, exist_ok=True)
      (root / "masks").mkdir(parents=True, exist_ok=True)
      random.seed(31)
      for i in range(32):
          image = Image.new("RGB", (128, 128), "#f8fafc")
          mask = Image.new("L", (128, 128), 0)
          draw_img = ImageDraw.Draw(image)
          draw_mask = ImageDraw.Draw(mask)
          points = [(random.randint(28, 54), random.randint(28, 54)), (random.randint(74, 102), random.randint(34, 60)), (random.randint(58, 92), random.randint(78, 106))]
          draw_img.polygon(points, fill="#14b8a6")
          draw_mask.polygon(points, fill=1)
          image.save(root / "images" / f"seg_{i:03d}.png")
          mask.save(root / "masks" / f"seg_{i:03d}.png")
      print(root)
      ~~~

      ## 3. 分割推理与评估

      ~~~python
      from pathlib import Path
      from PIL import Image
      import numpy as np

      root = Path("notebook-data/image_segmentation")

      def predict_mask(image_path):
          arr = np.asarray(Image.open(image_path).convert("RGB"))
          return ((arr[:, :, 1] > 120) & (arr[:, :, 2] > 120) & (arr[:, :, 0] < 80)).astype("uint8")

      def load_mask(mask_path):
          return (np.asarray(Image.open(mask_path).convert("L")) > 0).astype("uint8")

      scores = []
      for image_path in sorted((root / "images").glob("*.png")):
          truth = load_mask(root / "masks" / image_path.name)
          pred = predict_mask(image_path)
          inter = np.logical_and(pred, truth).sum()
          union = np.logical_or(pred, truth).sum()
          scores.append(inter / union)
      print("mean mask IoU:", round(float(np.mean(scores)), 4))
      ~~~
    `),
  },
]

export const llmNotebookCases: BuiltinNotebookCase[] = [
  {
    id: 'llm-case-data-processing',
    name: '数据处理Notebook案例',
    summary: '内置 SFT/DPO 样本，演示清洗、去重、格式校验、训练/验证切分和 JSONL 导出。',
    category: '大模型',
    taskType: '数据处理',
    datasetName: 'notebook-data/llm_data_processing',
    runtime: 'Python 3.9+，CPU 即可运行',
    tags: ['数据处理', 'SFT', 'DPO', 'JSONL'],
    ...llmCreator,
    description: dedent(`
      # 数据处理 Notebook 案例

      本案例演示大模型训练前的数据准备：生成混合 SFT/DPO 原始样本、去重、过滤空内容、统一字段格式，并导出训练集和验证集 JSONL。

      ## 1. 生成原始数据

      ~~~python
      from pathlib import Path
      import json
      import random

      root = Path("notebook-data/llm_data_processing")
      root.mkdir(parents=True, exist_ok=True)
      raw_rows = [
          {"type": "sft", "instruction": "解释什么是机器学习", "input": "", "output": "机器学习是让模型从数据中学习规律并完成预测或生成任务的方法。"},
          {"type": "sft", "instruction": "把句子改写得更礼貌", "input": "快点处理这个问题", "output": "麻烦您尽快协助处理这个问题，谢谢。"},
          {"type": "dpo", "prompt": "用户想退款，客服应该如何回复？", "chosen": "请提供订单号，我会帮您核实退款条件。", "rejected": "不清楚，你自己看规则。"},
          {"type": "dpo", "prompt": "客户询问发票", "chosen": "可以的，请在订单详情中申请电子发票。", "rejected": ""},
      ] * 6
      random.shuffle(raw_rows)
      with (root / "raw_mix.jsonl").open("w", encoding="utf-8") as f:
          for row in raw_rows:
              f.write(json.dumps(row, ensure_ascii=False) + "\\n")
      print(root / "raw_mix.jsonl")
      ~~~

      ## 2. 清洗、校验与切分

      ~~~python
      from pathlib import Path
      import json
      import random

      root = Path("notebook-data/llm_data_processing")
      rows = [json.loads(line) for line in (root / "raw_mix.jsonl").read_text(encoding="utf-8").splitlines()]

      def normalize(row):
          if row["type"] == "sft":
              if not row.get("instruction") or not row.get("output"):
                  return None
              return {
                  "messages": [
                      {"role": "user", "content": (row["instruction"] + "\\n" + row.get("input", "")).strip()},
                      {"role": "assistant", "content": row["output"].strip()},
                  ]
              }
          if row["type"] == "dpo":
              if not row.get("prompt") or not row.get("chosen") or not row.get("rejected"):
                  return None
              return {"prompt": row["prompt"].strip(), "chosen": row["chosen"].strip(), "rejected": row["rejected"].strip()}

      cleaned = []
      seen = set()
      for row in rows:
          item = normalize(row)
          if not item:
              continue
          key = json.dumps(item, ensure_ascii=False, sort_keys=True)
          if key in seen:
              continue
          seen.add(key)
          cleaned.append(item)

      random.seed(42)
      random.shuffle(cleaned)
      split = max(1, int(len(cleaned) * 0.8))
      train, valid = cleaned[:split], cleaned[split:]
      for name, part in [("train.jsonl", train), ("valid.jsonl", valid)]:
          with (root / name).open("w", encoding="utf-8") as f:
              for item in part:
                  f.write(json.dumps(item, ensure_ascii=False) + "\\n")
      print({"train": len(train), "valid": len(valid)})
      ~~~
    `),
  },
  {
    id: 'llm-case-training',
    name: '大模型训练Notebook案例',
    summary: '使用内置短文本语料训练一个极小字符级语言模型，覆盖数据、训练、保存和生成推理。',
    category: '大模型',
    taskType: '大模型训练',
    datasetName: 'notebook-data/llm_tiny_train/tiny_corpus.txt',
    runtime: 'Python 3.10+，默认 torch 环境；CPU 可运行',
    tags: ['大模型训练', 'Torch', 'Toy LM', '可训练'],
    ...llmCreator,
    description: dedent(`
      # 大模型训练 Notebook 案例

      本案例提供一个不依赖外部模型下载的最小训练闭环：生成短文本语料，构建字符级语言模型，完成训练、保存和生成推理。真实业务接入时，可把该结构替换为 Transformers/PEFT 训练脚本。

      ## 1. 准备语料

      ~~~python
      from pathlib import Path

      root = Path("notebook-data/llm_tiny_train")
      root.mkdir(parents=True, exist_ok=True)
      corpus = """
      用户：请解释什么是大模型。
      助手：大模型是在大规模数据上训练的深度学习模型，能够理解和生成自然语言。
      用户：如何提高训练数据质量？
      助手：需要进行去重、格式校验、敏感内容过滤和人工抽检。
      用户：Notebook 适合做什么？
      助手：Notebook 适合交互式数据处理、模型调试和训练脚本验证。
      """ * 80
      (root / "tiny_corpus.txt").write_text(corpus.strip(), encoding="utf-8")
      print(root / "tiny_corpus.txt")
      ~~~

      ## 2. 训练极小语言模型

      ~~~python
      from pathlib import Path
      import torch
      import torch.nn as nn

      root = Path("notebook-data/llm_tiny_train")
      text = (root / "tiny_corpus.txt").read_text(encoding="utf-8")
      vocab = sorted(set(text))
      stoi = {ch: i for i, ch in enumerate(vocab)}
      itos = {i: ch for ch, i in stoi.items()}
      data = torch.tensor([stoi[ch] for ch in text], dtype=torch.long)

      class TinyLM(nn.Module):
          def __init__(self, vocab_size, hidden=96):
              super().__init__()
              self.embed = nn.Embedding(vocab_size, hidden)
              self.rnn = nn.GRU(hidden, hidden, batch_first=True)
              self.head = nn.Linear(hidden, vocab_size)

          def forward(self, x, hidden_state=None):
              emb = self.embed(x)
              out, hidden_state = self.rnn(emb, hidden_state)
              return self.head(out), hidden_state

      def batchify(block_size=48, batch_size=16):
          starts = torch.randint(0, len(data) - block_size - 1, (batch_size,))
          x = torch.stack([data[s:s + block_size] for s in starts])
          y = torch.stack([data[s + 1:s + block_size + 1] for s in starts])
          return x, y

      model = TinyLM(len(vocab))
      optimizer = torch.optim.AdamW(model.parameters(), lr=3e-3)
      loss_fn = nn.CrossEntropyLoss()

      for step in range(120):
          x, y = batchify()
          logits, _ = model(x)
          loss = loss_fn(logits.reshape(-1, len(vocab)), y.reshape(-1))
          optimizer.zero_grad()
          loss.backward()
          optimizer.step()
          if step % 30 == 0:
              print(step, round(float(loss), 4))

      torch.save({"model": model.state_dict(), "vocab": vocab}, root / "tiny_lm.pt")
      print(root / "tiny_lm.pt")
      ~~~

      ## 3. 加载模型并生成

      ~~~python
      import torch

      checkpoint = torch.load("notebook-data/llm_tiny_train/tiny_lm.pt", map_location="cpu")
      vocab = checkpoint["vocab"]
      stoi = {ch: i for i, ch in enumerate(vocab)}
      itos = {i: ch for i, ch in enumerate(vocab)}
      model = TinyLM(len(vocab))
      model.load_state_dict(checkpoint["model"])
      model.eval()

      prompt = "用户：Notebook"
      ids = torch.tensor([[stoi.get(ch, 0) for ch in prompt]], dtype=torch.long)
      for _ in range(80):
          logits, _ = model(ids[:, -48:])
          probs = torch.softmax(logits[:, -1, :] / 0.8, dim=-1)
          next_id = torch.multinomial(probs, num_samples=1)
          ids = torch.cat([ids, next_id], dim=1)
      print("".join(itos[int(i)] for i in ids[0]))
      ~~~
    `),
  },
]
