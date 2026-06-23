#!/bin/bash

# ============================================================================
# 构建 vllm-service 镜像脚本
# ============================================================================
# 
# 功能说明：
#   构建 vllm-service:v0.11.2 镜像，用于 vLLM 推理服务
#   该镜像基于 Dockerfile.vllm 构建，用于启动 OpenAI 兼容的 API 服务
#   或直接使用 vllm.LLM 进行推理评估
#
# 使用方法：
#   ./build_vllm_service.sh [docker build 额外参数]
#   
#   示例：
#   ./build_vllm_service.sh                      # 普通构建
#   ./build_vllm_service.sh --no-cache           # 不使用缓存构建
#   ./build_vllm_service.sh --pull               # 构建前拉取最新基础镜像
#
# ============================================================================

set -e  # 遇到错误立即退出

# 获取脚本所在目录的绝对路径（即项目根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 项目根目录就是脚本所在目录
PROJECT_ROOT="${SCRIPT_DIR}"

# Dockerfile 路径（相对于项目根目录）
DOCKERFILE_PATH="scripts/inference/docker/Dockerfile.vllm"

# 镜像名称和标签
IMAGE_NAME="lab-cn-guangzhou.cr.volces.com/fs/vllm-service"
IMAGE_TAG="v0.11.2"
FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"

echo "=========================================="
echo "开始构建 ${FULL_IMAGE_NAME} 镜像"
echo "=========================================="
echo "项目根目录: ${PROJECT_ROOT}"
echo "Dockerfile: ${DOCKERFILE_PATH}"
echo "镜像名称: ${FULL_IMAGE_NAME}"
echo "=========================================="

# 切换到项目根目录执行构建
cd "${PROJECT_ROOT}"

# 执行 docker build 命令
# $@ 用于传递所有额外的构建参数（如 --no-cache, --pull 等）
docker build \
    -f "${DOCKERFILE_PATH}" \
    -t "${FULL_IMAGE_NAME}" \
    "$@" \
    .

# 检查构建结果
if [ $? -eq 0 ]; then
    echo "=========================================="
    echo "✅ 镜像构建成功: ${FULL_IMAGE_NAME}"
    echo "=========================================="
    echo "可以使用以下命令查看镜像："
    echo "  docker images ${IMAGE_NAME}"
    echo ""
    echo "可以使用以下命令运行容器："
    echo "  docker run --rm --gpus all ${FULL_IMAGE_NAME}"
    echo "=========================================="
else
    echo "=========================================="
    echo "❌ 镜像构建失败"
    echo "=========================================="
    exit 1
fi

