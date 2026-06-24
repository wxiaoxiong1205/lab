#!/bin/bash

# 快速启动前端开发环境脚本

echo "🚀 启动前端开发环境..."

# 配置变量
REMOTE_REGISTRY="deploy.deepexi.com/applife"
IMAGE_NAME="dataset-demo-frontend"
LOCAL_TAG="${IMAGE_NAME}:dev"
REMOTE_TAG="${REMOTE_REGISTRY}/${IMAGE_NAME}:dev"
REMOTE_X86_TAG="${REMOTE_REGISTRY}/${IMAGE_NAME}:dev-x86"

# 检查是否需要推送到远端
PUSH_TO_REMOTE=false
if [ "$1" == "--push" ] || [ "$1" == "-p" ]; then
    PUSH_TO_REMOTE=true
    echo "🔄 将构建镜像并推送到远端..."
fi

# 构建本地开发镜像
echo "📦 构建本地开发镜像..."
docker build -f frontend.dev.Dockerfile -t $LOCAL_TAG . --no-cache

if [ $? -ne 0 ]; then
    echo "❌ 本地镜像构建失败"
    exit 1
fi

echo "✅ 本地镜像构建成功"

# 如果需要推送到远端，则构建x86镜像
if [ "$PUSH_TO_REMOTE" == true ]; then
    echo "🔧 设置Docker buildx环境..."
    
    # 确保buildx可用
    if ! docker buildx version > /dev/null 2>&1; then
        echo "❌ Docker buildx 不可用，请升级Docker版本"
        exit 1
    fi
    
    # 创建并使用buildx构建器
    docker buildx create --name mybuilder --use > /dev/null 2>&1 || true
    
    echo "🏗️  构建x86平台镜像..."
    docker buildx build \
        --platform linux/amd64 \
        -f frontend.dev.Dockerfile \
        -t $REMOTE_TAG \
        -t $REMOTE_X86_TAG \
        --push \
        .
    
    if [ $? -eq 0 ]; then
        echo "✅ x86镜像构建并推送成功！"
        echo "🌐 远端镜像地址: $REMOTE_TAG"
        echo "🌐 x86镜像地址: $REMOTE_X86_TAG"
    else
        echo "❌ x86镜像构建或推送失败"
        echo "💡 请检查Docker登录状态: docker login $REMOTE_REGISTRY"
        # 继续执行本地容器启动
    fi
else
    echo "💡 仅构建本地开发镜像，如需推送到远端请使用: $0 --push"
fi

# 停止并删除已存在的容器
echo "🔄 清理现有容器..."
docker stop dataset-demo-frontend-dev > /dev/null 2>&1
docker rm dataset-demo-frontend-dev > /dev/null 2>&1

# 运行新容器
echo "🎯 启动开发容器..."
docker run -d \
    --name dataset-demo-frontend-dev \
    -p 8078:5177 \
    -v $(pwd)/frontend:/app \
    -v /app/node_modules \
    $LOCAL_TAG

if [ $? -eq 0 ]; then
    echo "✅ 前端开发环境启动成功！"
    echo "🌐 访问地址: http://localhost:8078"
    echo "📋 查看日志: docker logs -f dataset-demo-frontend-dev"
    echo "🛑 停止容器: docker stop dataset-demo-frontend-dev"
    
    if [ "$PUSH_TO_REMOTE" == true ]; then
        echo ""
        echo "🔗 远端镜像信息:"
        echo "   通用镜像: $REMOTE_TAG"
        echo "   x86镜像: $REMOTE_X86_TAG"
        echo "📝 使用说明: docker pull $REMOTE_TAG"
    fi
else
    echo "❌ 容器启动失败"
    exit 1
fi 