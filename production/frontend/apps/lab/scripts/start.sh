#!/bin/bash

# DeepExiLab Frontend 统一启动脚本
# 支持本地开发、Docker开发和生产模式

set -e

echo "🚀 DeepExiLab Frontend 启动脚本"
echo "=================================="

# Docker开发模式配置
DOCKER_CONTAINER_NAME="deepexilab-frontend-dev"
DOCKER_IMAGE_NAME="deepexilab-frontend-dev"
DOCKER_PORT="8078"

# 检查Docker是否运行
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo "❌ Docker未运行，请先启动Docker"
        exit 1
    fi
}

# 检查Node.js和pnpm是否安装
check_node_env() {
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js 未安装，请先安装 Node.js 18+"
        exit 1
    fi

    if ! command -v pnpm &> /dev/null; then
        echo "❌ pnpm 未安装，请先安装 pnpm"
        echo "安装命令: npm install -g pnpm"
        exit 1
    fi
}

# Docker开发模式函数
docker_dev_start() {
    echo "🐳 构建开发镜像..."
    docker build -f docker/frontend.dev.Dockerfile -t $DOCKER_IMAGE_NAME .
    
    # 检查容器是否已存在
    if docker ps -a --format "table {{.Names}}" | grep -q "^${DOCKER_CONTAINER_NAME}$"; then
        echo "🔄 停止并删除现有容器..."
        docker stop $DOCKER_CONTAINER_NAME > /dev/null 2>&1 || true
        docker rm $DOCKER_CONTAINER_NAME > /dev/null 2>&1 || true
    fi
    
    echo "🚀 启动开发容器..."
    docker run -d \
        --name $DOCKER_CONTAINER_NAME \
        -p $DOCKER_PORT:5177 \
        -v "$(pwd)/src:/app/src" \
        -v "$(pwd)/public:/app/public" \
        -v "$(pwd)/package.json:/app/package.json" \
        -v "$(pwd)/pnpm-lock.yaml:/app/pnpm-lock.yaml" \
        -v "$(pwd)/vite.config.ts:/app/vite.config.ts" \
        -v "$(pwd)/tsconfig.json:/app/tsconfig.json" \
        -v "$(pwd)/tailwind.config.js:/app/tailwind.config.js" \
        -e NODE_ENV=development \
        --restart unless-stopped \
        $DOCKER_IMAGE_NAME
    
    echo "✅ 开发容器启动完成！"
    echo "访问地址: http://localhost:$DOCKER_PORT"
    echo "支持热重载，代码修改会自动刷新"
}

docker_dev_stop() {
    echo "🛑 停止开发容器..."
    if docker ps --format "table {{.Names}}" | grep -q "^${DOCKER_CONTAINER_NAME}$"; then
        docker stop $DOCKER_CONTAINER_NAME
        docker rm $DOCKER_CONTAINER_NAME
        echo "✅ 容器已停止并删除"
    else
        echo "ℹ️  容器未运行"
    fi
}

docker_dev_logs() {
    echo "📋 查看容器日志..."
    if docker ps --format "table {{.Names}}" | grep -q "^${DOCKER_CONTAINER_NAME}$"; then
        docker logs -f $DOCKER_CONTAINER_NAME
    else
        echo "❌ 容器未运行"
        exit 1
    fi
}

docker_dev_status() {
    echo "📊 容器状态..."
    if docker ps --format "table {{.Names}}" | grep -q "^${DOCKER_CONTAINER_NAME}$"; then
        echo "✅ 容器正在运行"
        docker ps --filter "name=$DOCKER_CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    else
        echo "❌ 容器未运行"
    fi
}

docker_dev_shell() {
    echo "🐚 进入容器shell..."
    if docker ps --format "table {{.Names}}" | grep -q "^${DOCKER_CONTAINER_NAME}$"; then
        docker exec -it $DOCKER_CONTAINER_NAME /bin/sh
    else
        echo "❌ 容器未运行"
        exit 1
    fi
}

docker_dev_clean() {
    echo "🧹 清理开发环境..."
    docker_dev_stop
    echo "🗑️  删除开发镜像..."
    docker rmi $DOCKER_IMAGE_NAME > /dev/null 2>&1 || echo "ℹ️  镜像不存在或已被删除"
    echo "✅ 清理完成"
}

docker_dev_build() {
    echo "🔨 仅构建镜像..."
    docker build -f docker/frontend.dev.Dockerfile -t $DOCKER_IMAGE_NAME .
    echo "✅ 镜像构建完成"
}

# 检查参数
MODE=${1:-dev}

case $MODE in
    "dev"|"development")
        check_node_env
        echo "📦 安装依赖..."
        pnpm install
        
        echo "🔥 启动开发服务器..."
        echo "访问地址: http://localhost:5173"
        pnpm dev
        ;;
        
    "build")
        check_node_env
        echo "📦 安装依赖..."
        pnpm install
        
        echo "🔨 构建生产版本..."
        pnpm build
        
        echo "✅ 构建完成！"
        echo "构建输出目录: dist/"
        ;;
        
    "preview")
        check_node_env
        echo "📦 安装依赖..."
        pnpm install
        
        echo "🔨 构建生产版本..."
        pnpm build
        
        echo "🌐 启动预览服务器..."
        echo "访问地址: http://localhost:4173"
        pnpm preview
        ;;
        
    "docker")
        check_docker
        echo "🐳 构建Docker镜像..."
        docker build -f docker/Dockerfile -t deepexilab-frontend .
        
        echo "🚀 启动Docker容器..."
        # 停止已存在的容器
        docker stop deepexilab-frontend 2>/dev/null || true
        docker rm deepexilab-frontend 2>/dev/null || true
        
        # 启动新容器
        docker run -d \
            --name deepexilab-frontend \
            -p 31191:80 \
            --restart unless-stopped \
            deepexilab-frontend
        
        echo "✅ 容器启动完成！"
        echo "访问地址: http://localhost:31191"
        ;;

    "docker-test")
        check_docker
        echo "🐳 构建Docker镜像..."
        docker build -f docker/Dockerfile -t deepexilab-frontend-test .
        
        echo "🚀 启动Docker容器..."
        # 停止已存在的容器
        docker stop deepexilab-frontend-test 2>/dev/null || true
        docker rm deepexilab-frontend-test 2>/dev/null || true
        
        # 启动新容器
        docker run -d \
            --name deepexilab-frontend-test \
            -p 31023:80 \
             -v /data/scripts/deepexilab-test/deepexilab/config/nginx.conf:/etc/nginx/conf.d/default.conf \
            --restart unless-stopped \
            deepexilab-frontend-test
        
        echo "✅ 容器启动完成！"
        echo "访问地址: http://localhost:31023"
        ;;
        
    "docker-dev"|"docker-dev-start")
        check_docker
        docker_dev_start
        ;;
        
    "docker-dev-stop")
        check_docker
        docker_dev_stop
        ;;
        
    "docker-dev-logs")
        check_docker
        docker_dev_logs
        ;;
        
    "docker-dev-status")
        check_docker
        docker_dev_status
        ;;
        
    "docker-dev-shell")
        check_docker
        docker_dev_shell
        ;;
        
    "docker-dev-clean")
        check_docker
        docker_dev_clean
        ;;
        
    "docker-dev-build")
        check_docker
        docker_dev_build
        ;;
        
    "docker-dev-restart")
        check_docker
        docker_dev_stop
        sleep 2
        docker_dev_start
        ;;
        
    "docker-stop")
        check_docker
        echo "🛑 停止Docker容器..."
        docker stop deepexilab-frontend 2>/dev/null || true
        docker rm deepexilab-frontend 2>/dev/null || true
        echo "✅ 容器已停止"
        ;;
        
    "clean")
        echo "🧹 清理构建文件..."
        rm -rf dist node_modules
        echo "✅ 清理完成"
        ;;
        
    *)
        echo "❌ 未知模式: $MODE"
        echo ""
        echo "可用模式:"
        echo "  dev, development     - 本地开发模式 (默认)"
        echo "  build               - 构建生产版本"
        echo "  preview             - 预览生产版本"
        echo "  docker              - Docker生产部署"
        echo "  docker-test         - Docker测试环境部署"
        echo "  docker-stop         - 停止Docker生产容器"
        echo ""
        echo "Docker开发模式:"
        echo "  docker-dev          - 启动Docker开发容器"
        echo "  docker-dev-stop     - 停止Docker开发容器"
        echo "  docker-dev-logs     - 查看Docker开发容器日志"
        echo "  docker-dev-status   - 查看Docker开发容器状态"
        echo "  docker-dev-shell    - 进入Docker开发容器shell"
        echo "  docker-dev-clean    - 清理Docker开发环境"
        echo "  docker-dev-build    - 仅构建Docker开发镜像"
        echo "  docker-dev-restart  - 重启Docker开发容器"
        echo ""
        echo "其他:"
        echo "  clean               - 清理构建文件"
        echo ""
        echo "使用示例:"
        echo "  ./start.sh dev"
        echo "  ./start.sh docker-dev"
        echo "  ./start.sh docker-dev-logs"
        exit 1
        ;;
esac 