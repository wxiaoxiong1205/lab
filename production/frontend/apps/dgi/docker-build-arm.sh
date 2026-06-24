#!/bin/sh

set -e

# 提示输入 tag
echo "请输入标签名 (tag),例如 v1.0.0:"
read tag

echo "标签名: ${tag}"

docker login deploy.deepexi.com -u deepexiai -p 2G2qR7ZC0Xq

docker buildx build -f Dockerfile . -t "deploy.deepexi.com/deepexi-ai/deepexi-console-frontend:${tag}" --platform linux/arm64 --push
