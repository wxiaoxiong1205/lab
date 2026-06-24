#!/bin/bash

# 前端开发环境构建脚本

# 定义镜像名称和标签
IMAGE_NAME="dataset-demo-frontend"
IMAGE_TAG="dev"
CONTAINER_NAME="dataset-demo-frontend-dev"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 显示帮助信息
show_help() {
    echo -e "${BLUE}前端开发环境构建脚本${NC}"
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  build     构建前端开发镜像"
    echo "  run       运行前端开发容器"
    echo "  stop      停止运行的容器"
    echo "  restart   重启容器"
    echo "  clean     清理镜像和容器"
    echo "  logs      查看容器日志"
    echo "  help      显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 build     # 构建镜像"
    echo "  $0 run       # 运行容器"
    echo "  $0 logs      # 查看日志"
}

# 构建镜像
build_image() {
    echo -e "${BLUE}开始构建前端开发环境镜像...${NC}"
    
    # 检查Dockerfile是否存在
    if [ ! -f "frontend.dev.Dockerfile" ]; then
        echo -e "${RED}错误: frontend.dev.Dockerfile 文件不存在${NC}"
        exit 1
    fi
    
    # 构建镜像
    docker build -f frontend.dev.Dockerfile -t ${IMAGE_NAME}:${IMAGE_TAG} .
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ 镜像构建成功: ${IMAGE_NAME}:${IMAGE_TAG}${NC}"
    else
        echo -e "${RED}✗ 镜像构建失败${NC}"
        exit 1
    fi
}

# 运行容器
run_container() {
    echo -e "${BLUE}启动前端开发容器...${NC}"
    
    # 检查容器是否已存在
    if [ "$(docker ps -a -q -f name=${CONTAINER_NAME})" ]; then
        echo -e "${YELLOW}容器 ${CONTAINER_NAME} 已存在，正在停止并删除...${NC}"
        docker stop ${CONTAINER_NAME} > /dev/null 2>&1
        docker rm ${CONTAINER_NAME} > /dev/null 2>&1
    fi
    
    # 运行容器
    docker run -d \
        --name ${CONTAINER_NAME} \
        -p 5177:5177 \
        -v $(pwd)/frontend:/app \
        -v /app/node_modules \
        ${IMAGE_NAME}:${IMAGE_TAG}
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ 容器启动成功${NC}"
        echo -e "${BLUE}访问地址: http://localhost:5177${NC}"
        echo -e "${BLUE}容器名称: ${CONTAINER_NAME}${NC}"
    else
        echo -e "${RED}✗ 容器启动失败${NC}"
        exit 1
    fi
}

# 停止容器
stop_container() {
    echo -e "${BLUE}停止前端开发容器...${NC}"
    
    if [ "$(docker ps -q -f name=${CONTAINER_NAME})" ]; then
        docker stop ${CONTAINER_NAME}
        echo -e "${GREEN}✓ 容器已停止${NC}"
    else
        echo -e "${YELLOW}容器 ${CONTAINER_NAME} 未运行${NC}"
    fi
}

# 重启容器
restart_container() {
    echo -e "${BLUE}重启前端开发容器...${NC}"
    stop_container
    sleep 2
    run_container
}

# 清理镜像和容器
clean_up() {
    echo -e "${BLUE}清理镜像和容器...${NC}"
    
    # 停止并删除容器
    if [ "$(docker ps -a -q -f name=${CONTAINER_NAME})" ]; then
        docker stop ${CONTAINER_NAME} > /dev/null 2>&1
        docker rm ${CONTAINER_NAME} > /dev/null 2>&1
        echo -e "${GREEN}✓ 容器已清理${NC}"
    fi
    
    # 删除镜像
    if [ "$(docker images -q ${IMAGE_NAME}:${IMAGE_TAG})" ]; then
        docker rmi ${IMAGE_NAME}:${IMAGE_TAG}
        echo -e "${GREEN}✓ 镜像已清理${NC}"
    fi
}

# 查看日志
view_logs() {
    echo -e "${BLUE}查看容器日志...${NC}"
    
    if [ "$(docker ps -q -f name=${CONTAINER_NAME})" ]; then
        docker logs -f ${CONTAINER_NAME}
    else
        echo -e "${YELLOW}容器 ${CONTAINER_NAME} 未运行${NC}"
    fi
}

# 主函数
main() {
    case "${1:-help}" in
        build)
            build_image
            ;;
        run)
            run_container
            ;;
        stop)
            stop_container
            ;;
        restart)
            restart_container
            ;;
        clean)
            clean_up
            ;;
        logs)
            view_logs
            ;;
        help|*)
            show_help
            ;;
    esac
}

# 运行主函数
main "$@" 