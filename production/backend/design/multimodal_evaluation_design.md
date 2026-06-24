# 多模态评估设计文档（多轮对话和图片理解支持）

## 一、JFS 上的文件存储格式

### 1.1 存储路径结构

**StoragePath 枚举定义：**

```python
# 推理结果集存储路径
REAL_INFERENCE_DATASETS = PathConfig(
    mount_path="/data/inference_datasets/",
    storage_path="/{namespace}/inference/task/task_{task_id}/datasets/"
)

# 评估结果存储路径
REAL_EVALUATION = PathConfig(
    mount_path="/data/evaluation/",
    storage_path="/{namespace}/evaluation/task/task_{task_id}/datasets/"
)
```

### 1.2 目录结构示例

**推理结果集目录结构：**
```
/{namespace}/inference/task/task_{task_id}/datasets/
├── data.jsonl                    # 推理结果 JSONL 文件
└── images/                       # 图片目录
    └── mllm_demo_data/
        └── 1.jpg
```

**评估结果目录结构：**
```
/{namespace}/evaluation/task/task_{task_id}/datasets/
├── referee/                                         # 裁判员评估结果（如果存在）
│   ├── inference_dataset_{dataset_id}_{dataset_name}/    # 推理结果集1的评估结果
│   │   ├── result.jsonl
│   │   └── images/
│   │       └── mllm_demo_data/
│   │           └── 1.jpg
│   ├── inference_dataset_{dataset_id2}_{dataset_name2}/  # 推理结果集2的评估结果
│   │   ├── result.jsonl
│   │   └── images/
│   └── ...                                          # 其他推理结果集的评估结果
├── basic_metric/                                    # 基础指标评估结果（如果存在）
│   ├── inference_dataset_{dataset_id}_{dataset_name}/
│   │   ├── result.jsonl
│   │   └── images/
│   │       └── mllm_demo_data/
│   │           └── 1.jpg
│   ├── inference_dataset_{dataset_id2}_{dataset_name2}/
│   │   ├── result.jsonl
│   │   └── images/
│   └── ...
└── manual/                                          # 人工评估结果（如果存在）
    ├── inference_dataset_{dataset_id}_{dataset_name}/
    │   ├── result.jsonl
    │   └── images/
    │       └── mllm_demo_data/
    │           └── 1.jpg
    ├── inference_dataset_{dataset_id2}_{dataset_name2}/
    │   ├── result.jsonl
    │   └── images/
    └── ...
```

**目录命名规则：**
- 格式：`inference_dataset_{dataset_id}_{dataset_name}`
- `dataset_id`：推理结果集ID
- `dataset_name`：推理结果集名称（需要做文件名安全处理，如去除特殊字符、空格替换为下划线等）
- 示例：`inference_dataset_123_my_dataset` 或 `inference_dataset_456_test_data_v1`

### 1.3 路径规则

- **存储路径（storage_path）**：JFS 上的实际存储路径，包含命名空间和任务ID
- **挂载路径（mount_path）**：容器内的挂载点路径
- **相对路径**：JSONL 中的 `images` 字段使用相对路径（如 `mllm_demo_data/1.jpg`），相对于 `images/` 目录

## 二、数据流转处理

### 2.1 数据流转流程

```
训练数据集（多文件）
    ↓ [推理任务]
推理结果集（多文件：JSONL + images/）
    ↓ [评估任务]
评估结果集（多文件：JSONL + images/）
```

### 2.2 数据流转说明

1. **训练数据集 → 推理结果集**
   - 输入：训练数据集（JSONL + images/）
   - 输出：推理结果集（JSONL + images/）
   - 处理：推理脚本读取训练数据，生成推理结果，同时复制图片文件到推理结果集的 `images/` 目录

2. **推理结果集 → 评估结果集**
   - 输入：推理结果集（JSONL + images/）
   - 输出：评估结果集（JSONL + images/）
   - 处理：评估脚本读取推理结果集，生成评估结果，同时复制图片文件到评估结果集的 `images/` 目录

3. **数据独立性**
   - 推理结果集和评估结果集都存储独立的数据副本，避免过度依赖原始数据
   - 每个阶段的数据都是完整的，包含 JSONL 文件和对应的图片文件

## 三、K8s 容器挂载路径映射

### 3.1 挂载路径设计原则

**原先设计（单文件挂载）：**
- 推理结果集：单文件挂载，使用 `sub_path` 指向单个 JSONL 文件
- 挂载方式：文件对文件（file-to-file）

**新设计（文件夹挂载）：**
- 推理结果集：文件夹挂载，包含 JSONL 文件和 `images/` 目录
- 评估任务：需要挂载推理结果集的整个文件夹，同时挂载评估结果输出目录

### 3.2 推理任务挂载路径映射

#### 3.2.1 输入数据集挂载（源数据集）

**StoragePath：** `SOURCE_TRAINING_DATASETS` / `SOURCE_VALIDATION_DATASETS` / `SOURCE_TEST_DATASETS`

**挂载配置：**
```python
# 文件夹级别挂载（无 sub_path）
mount_path: "/data/datasets/"
storage_path: "/{namespace}/training/datasets/"  # 或 validation/test
```

**容器内访问：**
- JSONL 文件：`/data/datasets/{dataset_name}/data.jsonl`
- 图片文件：`/data/datasets/{dataset_name}/images/mllm_demo_data/1.jpg`

#### 3.2.2 输出数据集挂载（推理结果集）

**StoragePath：** `REAL_INFERENCE_DATASETS`

**挂载配置：**
```python
# 文件夹级别挂载（无 sub_path）
mount_path: "/data/inference_datasets/"
storage_path: "/{namespace}/inference/task/task_{task_id}/datasets/"
```

**容器内访问：**
- JSONL 文件：`/data/inference_datasets/data.jsonl`
- 图片文件：`/data/inference_datasets/images/mllm_demo_data/1.jpg`

**关键变化：**
- **原先**：单文件挂载，`mount_path = /data/inference_datasets/{filename}`，`sub_path = inference/task/task_{task_id}/datasets/{filename}`
- **现在**：文件夹挂载，`mount_path = /data/inference_datasets/`，无 `sub_path`，直接挂载整个目录

### 3.3 评估任务挂载路径映射

#### 3.3.1 输入数据集挂载（推理结果集）

**StoragePath：** `REAL_INFERENCE_DATASETS`

**挂载配置：**
```python
# 为每个推理结果集创建文件夹级别挂载
# 如果有多个推理结果集，需要为每个创建独立的挂载点
mount_path: "/data/inference_datasets_{dataset_id}/"
storage_path: "/{namespace}/inference/task/task_{dataset_id}/datasets/"
```

**容器内访问：**
- JSONL 文件：`/data/inference_datasets_{dataset_id}/data.jsonl`
- 图片文件：`/data/inference_datasets_{dataset_id}/images/mllm_demo_data/1.jpg`

**关键设计：**
- 每个推理结果集使用独立的挂载点，避免路径冲突
- 挂载整个文件夹，包含 JSONL 文件和 `images/` 目录
- 支持多个推理结果集同时挂载（多评估场景）

#### 3.3.2 输出数据集挂载（评估结果集）

**StoragePath：** `REAL_EVALUATION`

**挂载配置：**
```python
# 评估结果输出目录（文件夹级别挂载）
mount_path: "/data/evaluation/"
storage_path: "/{namespace}/evaluation/task/task_{task_id}/datasets/"
```

**容器内访问：**
- 推理结果集1的裁判员评估：`/data/evaluation/referee/inference_dataset_{dataset_id1}_{dataset_name1}/result.jsonl` 和 `/data/evaluation/referee/inference_dataset_{dataset_id1}_{dataset_name1}/images/`
- 推理结果集1的基础指标评估：`/data/evaluation/basic_metric/inference_dataset_{dataset_id1}_{dataset_name1}/result.jsonl` 和 `/data/evaluation/basic_metric/inference_dataset_{dataset_id1}_{dataset_name1}/images/`
- 推理结果集1的人工评估：`/data/evaluation/manual/inference_dataset_{dataset_id1}_{dataset_name1}/result.jsonl` 和 `/data/evaluation/manual/inference_dataset_{dataset_id1}_{dataset_name1}/images/`
- 推理结果集2的评估结果：`/data/evaluation/{evaluation_method}/inference_dataset_{dataset_id2}_{dataset_name2}/...`

**关键设计：**
- 评估结果先按评估方法分类（referee、basic_metric、manual），再按推理结果集分类（`inference_dataset_{dataset_id}_{dataset_name}/`）
- 每个评估方法的每个推理结果集都有独立的 JSONL 文件和 `images/` 目录
- 支持同时进行多种评估方法（如 `evaluation_method = "all"`）
- 支持多个推理结果集同时评估，每个推理结果集的评估结果独立存储

### 3.4 挂载路径映射表

| 任务类型 | 挂载类型 | StoragePath | Mount Path | Storage Path | Sub Path |
|---------|---------|-------------|------------|--------------|----------|
| **推理任务** | | | | | |
| 输入数据集 | 文件夹 | `SOURCE_*_DATASETS` | `/data/datasets/` | `/{namespace}/{type}/datasets/` | 无 |
| 输出数据集 | 文件夹 | `REAL_INFERENCE_DATASETS` | `/data/inference_datasets/` | `/{namespace}/inference/task/task_{task_id}/datasets/` | 无 |
| **评估任务** | | | | | |
| 输入数据集（推理结果集） | 文件夹 | `REAL_INFERENCE_DATASETS` | `/data/inference_datasets_{dataset_id}/` | `/{namespace}/inference/task/task_{dataset_id}/datasets/` | 无 |
| 输出数据集（评估结果） | 文件夹 | `REAL_EVALUATION` | `/data/evaluation/` | `/{namespace}/evaluation/task/task_{task_id}/datasets/` | 无 |

### 3.5 多评估场景的挂载策略

**场景：** 评估任务同时进行裁判员评估和基础指标评估（`evaluation_method = "all"`）

**挂载配置：**
```python
# 1. 挂载所有关联的推理结果集（每个使用独立挂载点）
for dataset_id in unique_dataset_ids:
    mount_path = f"/data/inference_datasets_{dataset_id}/"
    storage_path = f"/{namespace}/inference/task/task_{dataset_id}/datasets/"
    # 创建文件夹级别挂载

# 2. 挂载评估结果输出目录（所有评估方法共享）
mount_path = "/data/evaluation/"
storage_path = f"/{namespace}/evaluation/task/task_{task_id}/datasets/"
# 创建文件夹级别挂载

# 3. 评估脚本根据评估方法和推理结果集写入不同的子目录
# - 推理结果集1的裁判员评估：/data/evaluation/referee/inference_dataset_{dataset_id1}_{dataset_name1}/result.jsonl
# - 推理结果集1的基础指标评估：/data/evaluation/basic_metric/inference_dataset_{dataset_id1}_{dataset_name1}/result.jsonl
# - 推理结果集2的裁判员评估：/data/evaluation/referee/inference_dataset_{dataset_id2}_{dataset_name2}/result.jsonl
```

**关键点：**
- 推理结果集：每个数据集独立挂载，避免路径冲突
- 评估结果集：共享挂载点，先按评估方法分类存储（referee、basic_metric、manual），再按推理结果集分类（`inference_dataset_{dataset_id}_{dataset_name}/`）
- 图片文件：随 JSONL 文件一起挂载，保持相对路径一致性

### 3.6 路径扩展说明

**在原先设计基础上的扩展：**

1. **从单文件到文件夹**
   - 原先：`sub_path = inference/task/task_{task_id}/datasets/{filename}`
   - 现在：无 `sub_path`，直接挂载整个 `datasets/` 目录

2. **从单一挂载点到多挂载点**
   - 原先：评估任务只挂载一个推理结果集文件
   - 现在：评估任务可以挂载多个推理结果集文件夹（每个使用独立挂载点）

3. **从单一输出到多层级分类输出**
   - 原先：评估结果统一输出
   - 现在：评估结果先按评估方法分类存储（referee、basic_metric、manual），再按推理结果集分类（`inference_dataset_{dataset_id}_{dataset_name}/`）

## 四、返回 Items 内容增加图片 URL 前缀

### 4.1 图片 URL 前缀规则

**前缀格式：** `{jfs_base_url}/{resource_type}/{resource_id}/images/`

**资源类型：**
- 推理结果集：`inference-result/{dataset_id}/images/`
- 模型评估：`evaluation-task/{task_id}/datasets/referee/inference_dataset_{dataset_id}_{dataset_name}/images/` 或 `evaluation-task/{task_id}/datasets/basic_metric/inference_dataset_{dataset_id}_{dataset_name}/images/`
- 人工评估：`evaluation-task/{task_id}/datasets/manual/inference_dataset_{dataset_id}_{dataset_name}/images/`

**说明：**
- 评估结果的图片URL前缀需要包含评估方法和推理结果集的ID和名称，以支持多评估场景
- 格式：`evaluation-task/{task_id}/datasets/{evaluation_method}/inference_dataset_{dataset_id}_{dataset_name}/images/`

### 4.2 API 响应格式

**响应示例：**
```json
{
  "items": [
    {
      "messages": [...],
      "images": [
        "https://jfs.example.com/inference-result/123/images/mllm_demo_data/1.jpg",
        "https://jfs.example.com/inference-result/123/images/mllm_demo_data/1.jpg"
      ],
      "system": "",
      "prompt": "...",
      "response": "...",
      "model_response": "..."
    }
  ]
}
```
```

**处理逻辑：**
- 读取 JSONL 中的 `images` 字段（相对路径）
- 拼接前缀：`{jfs_base_url}/evaluation-task/{task_id}/datasets/manual/inference_dataset_{dataset_id}_{dataset_name}/images/`
- 生成完整 URL

**注意：** 需要根据评估方法和评估项所属的推理结果集ID和名称来构建正确的URL前缀

### 4.3 前端渲染方式

前端接收到响应后，可以直接使用 `images` 字段中的完整 URL 进行图片渲染：

```javascript
// 前端示例
item.images.forEach(imageUrl => {
  // 直接使用完整 URL
  <img src={imageUrl} alt="评估图片" />
});
```

## 五、推理和模型评估脚本实现说明

### 4.1 K8s 运行环境

**容器配置：**
- 脚本在 K8s Pod 中运行
- JFS 通过 Volume 挂载到容器路径（如 `/mnt/jfs`）
- 数据文件（JSONL 和图片）通过 JFS 挂载访问

### 5.2 推理脚本实现

#### 5.2.1 脚本输入

**环境变量：**
- `SOURCE_DATASET_PATH`: 训练数据路径（容器内挂载路径，如 `/data/datasets/{dataset_name}/data.jsonl`）
- `OUTPUT_DATASET_PATH`: 推理结果集输出路径（容器内挂载路径，如 `/data/inference_datasets/data.jsonl`）
- `MODEL_ID`: 模型ID
- `INFERENCE_PARAMS`: 推理参数（JSON 字符串）

**容器内路径结构：**
```
/data/datasets/                    # 输入数据集挂载点
└── {dataset_name}/
    ├── data.jsonl
    └── images/
        └── mllm_demo_data/
            └── 1.jpg

/data/inference_datasets/          # 输出数据集挂载点
├── data.jsonl                     # 推理结果 JSONL（脚本生成）
└── images/                        # 图片目录（脚本复制）
    └── mllm_demo_data/
        └── 1.jpg
```

#### 5.2.2 脚本处理流程

```python
# 伪代码示例
import json
import shutil
import os

# 1. 读取输入数据集
input_jsonl = "/data/datasets/{dataset_name}/data.jsonl"
input_images_dir = "/data/datasets/{dataset_name}/images/"

# 2. 准备输出目录
output_jsonl = "/data/inference_datasets/data.jsonl"
output_images_dir = "/data/inference_datasets/images/"
os.makedirs(output_images_dir, exist_ok=True)

# 3. 处理每条数据
with open(input_jsonl, 'r', encoding='utf-8') as f_in, \
     open(output_jsonl, 'w', encoding='utf-8') as f_out:
    for line in f_in:
        item = json.loads(line)
        
        # 复制图片文件
        for image_path in item.get('images', []):
            src_image = os.path.join(input_images_dir, image_path)
            dst_image = os.path.join(output_images_dir, image_path)
            os.makedirs(os.path.dirname(dst_image), exist_ok=True)
            shutil.copy2(src_image, dst_image)
        
        # 执行推理，生成 model_response
        item['model_response'] = inference_model(item)
        
        # 写入输出 JSONL
        f_out.write(json.dumps(item, ensure_ascii=False) + '\n')
```

### 5.3 评估脚本实现

#### 5.3.1 脚本输入

**环境变量：**
- `INFERENCE_DATASET_INFO`: 推理结果集信息列表（JSON格式，包含dataset_id、dataset_name和挂载路径，如 `[{"id": 1, "name": "dataset1", "path": "/data/inference_datasets_1/"}, {"id": 2, "name": "dataset2", "path": "/data/inference_datasets_2/"}]`）
- `OUTPUT_EVALUATION_PATH`: 评估结果输出路径（容器内挂载路径，如 `/data/evaluation/`）
- `EVALUATION_METHOD`: 评估方法（referee/basic_metric/all）
- `EVALUATION_CONFIG`: 评估配置（JSON 字符串）

**容器内路径结构：**
```
/data/inference_datasets_1/        # 推理结果集1挂载点
├── data.jsonl
└── images/
    └── mllm_demo_data/
        └── 1.jpg

/data/inference_datasets_2/        # 推理结果集2挂载点（如果存在多个）
├── data.jsonl
└── images/
    └── mllm_demo_data/
        └── 2.jpg

/data/evaluation/                  # 评估结果输出挂载点
├── referee/                       # 裁判员评估结果（如果存在）
│   ├── inference_dataset_1_dataset1/  # 推理结果集1的评估结果
│   │   ├── result.jsonl
│   │   └── images/
│   │       └── mllm_demo_data/
│   │           └── 1.jpg
│   ├── inference_dataset_2_dataset2/  # 推理结果集2的评估结果
│   │   ├── result.jsonl
│   │   └── images/
│   └── ...
├── basic_metric/                  # 基础指标评估结果（如果存在）
│   ├── inference_dataset_1_dataset1/
│   │   ├── result.jsonl
│   │   └── images/
│   │       └── mllm_demo_data/
│   │           └── 1.jpg
│   ├── inference_dataset_2_dataset2/
│   │   ├── result.jsonl
│   │   └── images/
│   └── ...
└── manual/                        # 人工评估结果（如果存在）
    ├── inference_dataset_1_dataset1/
    │   ├── result.jsonl
    │   └── images/
    │       └── mllm_demo_data/
    │           └── 1.jpg
    ├── inference_dataset_2_dataset2/
    │   ├── result.jsonl
    │   └── images/
    └── ...
```

#### 5.3.2 脚本处理流程

```python
# 伪代码示例
import json
import shutil
import os
import re

def sanitize_filename(name):
    """文件名安全处理：去除特殊字符，空格替换为下划线"""
    # 去除特殊字符，只保留字母、数字、下划线、连字符
    name = re.sub(r'[^\w\-]', '_', name)
    # 去除连续的下划线
    name = re.sub(r'_+', '_', name)
    # 去除首尾的下划线和连字符
    name = name.strip('_-')
    return name

# 1. 解析推理结果集信息列表
dataset_infos = json.loads(os.environ['INFERENCE_DATASET_INFO'])
evaluation_method = os.environ['EVALUATION_METHOD']
output_base = "/data/evaluation/"

# 2. 根据评估方法确定输出目录
if evaluation_method == "referee" or evaluation_method == "all":
    method_dirs = ["referee"]
elif evaluation_method == "basic_metric" or evaluation_method == "all":
    method_dirs = ["basic_metric"]
else:
    method_dirs = ["manual"]

if evaluation_method == "all":
    method_dirs = ["referee", "basic_metric"]

# 3. 为每个评估方法处理数据
for method_dir in method_dirs:
    method_output_dir = os.path.join(output_base, method_dir)
    
    # 4. 处理每个推理结果集
    for dataset_info in dataset_infos:
        dataset_id = dataset_info['id']
        dataset_name = dataset_info['name']
        inference_path = dataset_info['path']
        
        # 构建推理结果集对应的评估结果目录（在评估方法目录下）
        safe_name = sanitize_filename(dataset_name)
        dataset_output_dir = os.path.join(
            method_output_dir,
            f"inference_dataset_{dataset_id}_{safe_name}"
        )
        os.makedirs(dataset_output_dir, exist_ok=True)
        
        output_jsonl = os.path.join(dataset_output_dir, "result.jsonl")
        output_images_dir = os.path.join(dataset_output_dir, "images/")
        os.makedirs(output_images_dir, exist_ok=True)
        
        # 读取推理结果集
        inference_jsonl = os.path.join(inference_path, "data.jsonl")
        inference_images_dir = os.path.join(inference_path, "images/")
        
        with open(inference_jsonl, 'r', encoding='utf-8') as f_in, \
             open(output_jsonl, 'w', encoding='utf-8') as f_out:
            for line in f_in:
                item = json.loads(line)
                
                # 复制图片文件
                for image_path in item.get('images', []):
                    src_image = os.path.join(inference_images_dir, image_path)
                    dst_image = os.path.join(output_images_dir, image_path)
                    os.makedirs(os.path.dirname(dst_image), exist_ok=True)
                    shutil.copy2(src_image, dst_image)
                
                # 执行评估，生成 evaluations
                item['evaluations'] = evaluate_item(item, method_dir)
                
                # 写入输出 JSONL
                f_out.write(json.dumps(item, ensure_ascii=False) + '\n')
```

### 5.4 路径处理说明

**重要：** 脚本中使用容器内挂载路径，不包含 JFS 存储路径前缀

- **输入路径**：环境变量中的路径为容器内挂载路径（如 `/data/datasets/{dataset_name}/data.jsonl`）
- **输出路径**：容器内挂载路径（如 `/data/inference_datasets/data.jsonl`）
- **图片路径**：JSONL 中的 `images` 字段使用相对路径（如 `mllm_demo_data/1.jpg`），相对于 `images/` 目录
- **文件操作**：所有文件操作基于容器内挂载路径进行，K8s Volume 会自动同步到 JFS

## 六、生成数据后的文件格式说明

### 6.1 推理结果集文件格式

**文件路径：** `inference_result_dataset_{id}/data.jsonl`

**每行 JSON 格式：**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "<image>Who are they?"
    },
    {
      "role": "assistant",
      "content": "They're Kane and Gretzka from Bayern Munich."
    },
    {
      "role": "user",
      "content": "What are they doing?<image>"
    }
  ],
  "images": [
    "mllm_demo_data/1.jpg",
    "mllm_demo_data/1.jpg"
  ],
  "system": "",
  "prompt": "User: <image>Who are they?\nAssistant: They're Kane and Gretzka from Bayern Munich.\nUser: What are they doing?<image>",
  "response": "They are celebrating on the soccer field.",
  "model_response": "They are celebrating on the soccer field after winning the match."
}
```

**字段说明：**
- `messages`: 原始多轮对话消息列表（保留完整数据）
- `images`: 图片相对路径列表（相对于 `images/` 目录）
- `system`: System 指令（如果有）
- `prompt`: 聚合的提示词（前 N-1 轮对话，排除最后一条 assistant 消息）
- `response`: 标准回答（最后一条 assistant 消息的内容）
- `model_response`: 模型推理输出的内容

### 6.2 模型评估结果文件格式

**文件路径：** `evaluation_task_{task_id}/datasets/referee/inference_dataset_{dataset_id}_{dataset_name}/result.jsonl` 或 `evaluation_task_{task_id}/datasets/basic_metric/inference_dataset_{dataset_id}_{dataset_name}/result.jsonl`

**每行 JSON 格式：**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "<image>Who are they?"
    },
    {
      "role": "assistant",
      "content": "They're Kane and Gretzka from Bayern Munich."
    },
    {
      "role": "user",
      "content": "What are they doing?<image>"
    }
  ],
  "images": [
    "mllm_demo_data/1.jpg",
    "mllm_demo_data/1.jpg"
  ],
  "system": "",
  "prompt": "User: <image>Who are they?\nAssistant: They're Kane and Gretzka from Bayern Munich.\nUser: What are they doing?<image>",
  "response": "They are celebrating on the soccer field.",
  "model_response": "They are celebrating on the soccer field after winning the match.",
  "evaluations": [
    {
      "metric_name": "多评分区间测试",
      "description": "测试",
      "score_min": 0,
      "score_max": 10,
      "score": 6,
      "reason": "虽然摘要涵盖了关键信息，但过于冗长，缺乏精炼度。",
      "error": false,
      "raw_response": "{\n  \"多评分区间测试\": {\n    \"score\": 6,\n    \"reason\": \"虽然摘要涵盖了关键信息，但过于冗长，缺乏精炼度。\"\n  }\n}"
    }
  ]
}
```

**字段说明：**
- 包含推理结果集的所有字段
- `evaluations`: 评估结果列表
  - `metric_name`: 指标名称
  - `description`: 指标描述
  - `score_min`: 分数最小值
  - `score_max`: 分数最大值
  - `score`: 评估分数
  - `reason`: 评分理由
  - `error`: 是否有错误
  - `raw_response`: 原始评估响应

### 6.3 人工评估结果文件格式

**文件路径：** `evaluation_task_{task_id}/datasets/manual/inference_dataset_{dataset_id}_{dataset_name}/result.jsonl`

**每行 JSON 格式：**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "<image>Who are they?"
    },
    {
      "role": "assistant",
      "content": "They're Kane and Gretzka from Bayern Munich."
    },
    {
      "role": "user",
      "content": "What are they doing?<image>"
    }
  ],
  "images": [
    "mllm_demo_data/1.jpg",
    "mllm_demo_data/1.jpg"
  ],
  "system": "",
  "prompt": "User: <image>Who are they?\nAssistant: They're Kane and Gretzka from Bayern Munich.\nUser: What are they doing?<image>",
  "response": "They are celebrating on the soccer field.",
  "model_response": "They are celebrating on the soccer field after winning the match.",
  "evaluations": [
    {
      "metric_name": "准确性",
      "description": "评估回答的准确性",
      "score_min": 0,
      "score_max": 10,
      "score": 8,
      "reason": "回答准确，正确识别了人物和场景",
      "error": false,
      "raw_response": "..."
    }
  ]
}
```

**字段说明：** 与模型评估结果格式相同

### 6.4 图片文件存储

**存储位置：** 与 JSONL 文件同目录下的 `images/` 子目录

**目录结构示例：**
```
/{namespace}/inference/task/task_{task_id}/datasets/
├── data.jsonl
└── images/
    └── mllm_demo_data/
        └── 1.jpg

/{namespace}/evaluation/task/task_{task_id}/datasets/
├── referee/
│   ├── inference_dataset_{dataset_id1}_{dataset_name1}/
│   │   ├── result.jsonl
│   │   └── images/
│   │       └── mllm_demo_data/
│   │           └── 1.jpg
│   ├── inference_dataset_{dataset_id2}_{dataset_name2}/
│   │   ├── result.jsonl
│   │   └── images/
│   └── ...
├── basic_metric/
│   ├── inference_dataset_{dataset_id1}_{dataset_name1}/
│   │   ├── result.jsonl
│   │   └── images/
│   │       └── mllm_demo_data/
│   │           └── 1.jpg
│   ├── inference_dataset_{dataset_id2}_{dataset_name2}/
│   │   ├── result.jsonl
│   │   └── images/
│   └── ...
└── manual/
    ├── inference_dataset_{dataset_id1}_{dataset_name1}/
    │   ├── result.jsonl
    │   └── images/
    │       └── mllm_demo_data/
    │           └── 1.jpg
    ├── inference_dataset_{dataset_id2}_{dataset_name2}/
    │   ├── result.jsonl
    │   └── images/
    └── ...
```

**路径规则：**
- JSONL 中的 `images` 字段使用相对路径：`mllm_demo_data/1.jpg`
- 实际文件位置：`{jsonl_dir}/images/mllm_demo_data/1.jpg`
- 完整访问路径：
  - 推理结果集：`{jfs_base_url}/inference-result/{dataset_id}/images/mllm_demo_data/1.jpg`
  - 评估结果：`{jfs_base_url}/evaluation-task/{task_id}/datasets/{evaluation_method}/inference_dataset_{dataset_id}_{dataset_name}/images/mllm_demo_data/1.jpg`

## 七、总结

本设计文档说明了多模态评估（多轮对话和图片理解）的核心实现要点：

1. **JFS 存储格式**：清晰的目录结构和相对路径规则
2. **数据流转**：从训练数据到推理结果集再到评估结果的完整流程
3. **K8s 容器挂载路径映射**：从单文件挂载扩展到文件夹挂载，支持多文件和多评估场景
4. **图片 URL 前缀**：API 返回时自动添加前缀，前端可直接使用
5. **脚本实现**：K8s 环境下的脚本处理逻辑和路径处理方式
6. **文件格式**：生成后的 JSONL 文件格式规范

通过以上设计，系统可以完整支持多模态场景下的推理和评估流程，特别是：
- 支持多文件数据集（JSONL + images/）
- 支持文件夹级别的挂载（而非单文件挂载）
- 支持多评估方法同时进行（referee、basic_metric、manual）
- 支持多个推理结果集同时挂载到评估容器
