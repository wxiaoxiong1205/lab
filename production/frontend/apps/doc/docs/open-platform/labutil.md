# labutil 快速入门

`labutil` 是用于调用开放平台 OpenAPI 的命令行工具，支持训练数据集管理、分片上传、接口调试和自动化脚本集成等场景，也可以由 AI 工具或自动化代理调用。

本文介绍如何在 Linux 环境中快速安装、配置并使用 `labutil`。

## 下载二进制文件

根据你的系统和 CPU 架构，选择对应版本下载：

| 系统 | 架构 | tar.gz | zip |
| --- | --- | --- | --- |
| macOS | Intel x86_64 | [labutil-darwin-amd64.tar.gz](https://deepexi-cli.tos-cn-guangzhou.volces.com/v1.0.0/labutil-darwin-amd64.tar.gz) | [labutil-darwin-amd64.zip](https://deepexi-cli.tos-cn-guangzhou.volces.com/v1.0.0/labutil-darwin-amd64.zip) |
| macOS | Apple Silicon arm64 | [labutil-darwin-arm64.tar.gz](https://deepexi-cli.tos-cn-guangzhou.volces.com/v1.0.0/labutil-darwin-arm64.tar.gz) | [labutil-darwin-arm64.zip](https://deepexi-cli.tos-cn-guangzhou.volces.com/v1.0.0/labutil-darwin-arm64.zip) |
| Linux | x86_64 | [labutil-linux-amd64.tar.gz](https://deepexi-cli.tos-cn-guangzhou.volces.com/v1.0.0/labutil-linux-amd64.tar.gz) | [labutil-linux-amd64.zip](https://deepexi-cli.tos-cn-guangzhou.volces.com/v1.0.0/labutil-linux-amd64.zip) |
| Linux | arm64 | [labutil-linux-arm64.tar.gz](https://deepexi-cli.tos-cn-guangzhou.volces.com/v1.0.0/labutil-linux-arm64.tar.gz) | [labutil-linux-arm64.zip](https://deepexi-cli.tos-cn-guangzhou.volces.com/v1.0.0/labutil-linux-arm64.zip) |
| Windows | x86_64 | [labutil-windows-amd64.tar.gz](https://deepexi-cli.tos-cn-guangzhou.volces.com/v1.0.0/labutil-windows-amd64.tar.gz) | [labutil-windows-amd64.zip](https://deepexi-cli.tos-cn-guangzhou.volces.com/v1.0.0/labutil-windows-amd64.zip) |

下载完成后，将其放到当前用户可执行目录，例如 `/usr/local/bin` 或 `~/bin`。

示例：

```bash
mkdir -p ~/bin
cp labutil ~/bin/labutil
chmod +x ~/bin/labutil
```

如果 `~/bin` 尚未加入 `PATH`，可以执行：

```bash
export PATH="$HOME/bin:$PATH"
```

如需长期生效，可将以上配置写入 `~/.bashrc` 或 `~/.zshrc`。

验证安装：

```bash
labutil version
```

查看帮助：

```bash
labutil -h
```

## 配置访问凭据

首次使用前，建议先配置开放平台地址和访问凭据。`--key-id` 和 `--secret-key` 可在 Lab 平台的“API访问密钥”中生成：

```bash
labutil config \
  --host "https://开放平台域名" \
  --key-id "你的 key_id" \
  --secret-key "你的 secret_key"
```

查看当前配置：

```bash
labutil config --show
```

查看配置文件路径：

```bash
labutil config --path
```

默认配置路径为：

```text
~/.config/labutil/config.json
```

也可以通过环境变量指定配置文件路径：

```bash
LABUTIL_CONFIG=/path/to/config.json labutil config --show
```

## 查看命令列表

查看顶层命令：

```bash
labutil -h
```

常用命令组如下：

| 命令 | 说明 |
| --- | --- |
| `config` | 配置开放平台地址和访问凭据。 |
| `dataset` | 调用训练数据集相关 OpenAPI。 |
| `upload` | 调用分片上传相关 OpenAPI。 |
| `version` | 查看当前 CLI 版本。 |

查看训练数据集接口：

```bash
labutil dataset -h
```

查看分片上传接口：

```bash
labutil upload -h
```

查看某个接口的参数说明：

```bash
labutil dataset preview -h
labutil dataset create -h
labutil upload init -h
labutil upload chunk -h
```

## 管理训练数据集

`labutil dataset` 用于调用训练数据集相关接口，支持查询、预览、下载、创建、删除和统计等操作。

| 命令 | 说明 |
| --- | --- |
| `dataset list` | 分页查询训练数据集。 |
| `dataset versions` | 查询训练数据集版本列表。 |
| `dataset preview` | 预览训练数据集样本。 |
| `dataset download` | 下载训练数据集版本。 |
| `dataset download-sample` | 下载训练数据集样例。 |
| `dataset create` | 上传训练数据集。 |
| `dataset create-version` | 上传训练数据集新版本。 |
| `dataset delete` | 删除训练数据集全部版本。 |
| `dataset delete-version` | 删除训练数据集单个版本。 |
| `dataset in-use` | 查询训练数据集使用状态。 |
| `dataset stats` | 查询训练数据集聚合统计。 |
| `dataset filtered` | 按聚合条件过滤训练数据集。 |

### 预览训练数据集

```bash
labutil dataset preview \
  --project_id 35 \
  --name sample_dataset \
  --version V1 \
  --page 1 \
  --size 10 \
  --usage training
```

### 下载训练数据集

```bash
labutil dataset download \
  --project_id 35 \
  --dataset_name sample_dataset \
  --version V1 \
  --usage training \
  --export_type jsonl \
  --output dataset.jsonl
```

### 上传训练数据集

```bash
labutil dataset create \
  --project_id 35 \
  --name sample_dataset \
  --dataset_type text-generation \
  --training_method_type sft \
  --dataset_format prompt-response \
  --usage training \
  --chunk_upload_ids "chunk_id_1,chunk_id_2" \
  --version V1
```

## 使用分片上传

`labutil upload` 用于上传文件。文件大小大于等于 `5242880` 字节时需要分片上传；文件大小小于 `5242880` 字节时不需要分片，可以作为整个文件上传。分片上传的典型流程为：初始化上传、上传分片、完成上传、查询进度。

| 命令 | 说明 |
| --- | --- |
| `upload init` | 初始化分片上传任务。 |
| `upload chunk` | 上传文件分片。 |
| `upload complete` | 完成分片上传任务。 |
| `upload get` | 查询分片上传进度。 |

### 初始化分片上传

```bash
labutil upload init \
  --file_name data.jsonl \
  --file_size 1048576 \
  --chunk_size 5242880 \
  --file_hash "文件 SHA-256"
```

### 上传文件分片

```bash
labutil upload chunk \
  --upload_id "上传会话 ID" \
  --chunk_index 0 \
  --file ./chunk-0 \
  --file_hash "分片 SHA-256"
```

### 完成分片上传

```bash
labutil upload complete \
  --upload_id "上传会话 ID" \
  --file_hash "文件 SHA-256" \
  --file_name data.jsonl \
  --total_chunks 1 \
  --usage public
```

### 查询上传进度

```bash
labutil upload get \
  --upload_id "上传会话 ID"
```

## 调试请求

在正式调用接口前，建议先使用调试参数确认请求是否符合预期。

只打印请求信息，不实际发送请求：

```bash
labutil dataset preview \
  --project_id 35 \
  --name sample_dataset \
  --version V1 \
  --dry-run
```

输出可复现的 `curl` 请求：

```bash
labutil dataset preview \
  --project_id 35 \
  --name sample_dataset \
  --version V1 \
  --curl
```


## 使用 AI 调用 labutil

`labutil` 也可以由 AI 工具或自动化代理调用，用于查询命令帮助、生成请求、调试接口和执行数据集操作。

使用 AI 调用时，建议遵循以下方式：

1. 先让 AI 执行 `labutil -h`，了解顶层命令。
2. 调用接口前，先执行 `labutil dataset -h` 或 `labutil upload -h` 查看接口列表。
3. 调用具体接口前，先执行 `labutil <group> <command> -h` 查看参数说明。
4. 首次调用建议添加 `--dry-run` 或 `--curl`，确认请求内容无误。
5. 确认请求正确后，再去掉调试参数执行真实调用。

示例提示词：

```text
请使用 labutil 查看训练数据集预览接口的参数说明，并先用 --dry-run 生成请求内容，确认无误后再执行正式调用。
```
## 推荐使用流程

建议按以下顺序使用 `labutil`：

1. 执行 `labutil -h` 查看顶层命令。
2. 执行 `labutil config` 保存默认开放平台地址和访问凭据。
3. 执行 `labutil dataset -h` 或 `labutil upload -h` 查看接口列表。
4. 执行 `labutil <group> <command> -h` 查看接口参数。
5. 首次调用接口时添加 `--dry-run` 或 `--curl` 确认请求内容。
6. 确认无误后去掉调试参数，正式调用接口。

## 常见排查方式

如果遇到接口调用失败、参数缺失、权限不足或网络异常等问题，可以按以下方式排查：

- 使用 `labutil -h` 确认命令是否正确。
- 使用 `labutil <group> <command> -h` 确认必填参数。
- 使用 `labutil config --show` 确认配置是否生效。
- 使用 `--dry-run` 检查请求 URL、query、body 和请求头。
- 使用 `--curl` 生成可复现请求，便于定位问题。
