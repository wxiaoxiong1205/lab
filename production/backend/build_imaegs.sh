#!/bin/bash
set -e

# 默认环境
ENV=${1:-dev}

# 校验参数
if [[ "$ENV" != "dev" && "$ENV" != "test" ]]; then
    echo "Usage: $0 [dev|test]"
    exit 1
fi

# 固定版本号
TAG=0619

IMAGE_NAME=deepexilab
REGISTRY=deploy.deepexi.com/applife

# 根据环境生成最终镜像名
if [[ "$ENV" == "dev" ]]; then
    FULL_IMAGE=${REGISTRY}/${IMAGE_NAME}-backend:${TAG}
else
    FULL_IMAGE=${REGISTRY}/${IMAGE_NAME}-backend:${TAG}-${ENV}
fi

docker build -t "${FULL_IMAGE}" -f ./backend.Dockerfile .

# 如需推送，取消下一行注释
# echo ">>> Pushing ${FULL_IMAGE}"
# docker push "${FULL_IMAGE}"
