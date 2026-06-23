#!/bin/sh

set -e

# 从 package.json 读取 version 字段
package_version=$(node -p "require('./package.json').version")
tag="v${package_version}"

# 生产镜像会使用 release 标签区分
echo "构建生产镜像？(y/n，默认: n):"
read is_production

# 如果输入为空，默认为 n
if [ -z "$is_production" ]; then
  is_production="n"
fi

# 初始化 is_push_to_server 变量
is_push_to_server="n"

# 如果is_production=n,则设置一个参数，是否推送到服务器， 默认为不推送
if [ "$is_production" = "n" ] || [ "$is_production" = "N" ] || [ "$is_production" = "no" ] || [ "$is_production" = "NO" ]; then
  echo "是否推送到服务器？(y/n，默认: n):"
  read is_push_to_server
  # 如果输入为空，默认为 n
  if [ -z "$is_push_to_server" ]; then
    is_push_to_server="n"
  fi
fi

# 获取当前时间并添加到 tag 后面
current_time=$(date +"%Y%m%d%H%M")

# 根据是否生产环境来组成不同的 tag
if [ "$is_production" = "y" ] || [ "$is_production" = "Y" ] || [ "$is_production" = "yes" ] || [ "$is_production" = "YES" ]; then
    tag_with_time="${tag}-release-${current_time}"
    echo "生产环境构建，标签名: ${tag_with_time}"
    platform="linux/amd64,linux/arm64"
else
    tag_with_time="${tag}-${current_time}"
    echo "开发环境构建，标签名: ${tag_with_time}"
    platform="linux/amd64"
fi

docker login deploy.deepexi.com -u deepexiai -p 2G2qR7ZC0Xq

docker buildx build --platform ${platform} -f Dockerfile -t "deploy.deepexi.com/deepexi-ai/deepexi-console-frontend:${tag_with_time}" --push .
#docker push "deploy.deepexi.com/deepexi-ai/deepexi-console-frontend:${tag_with_time}"

if [ "$is_push_to_server" = "y" ] || [ "$is_push_to_server" = "Y" ] || [ "$is_push_to_server" = "yes" ] || [ "$is_push_to_server" = "YES" ]; then
  echo "镜像推送完成，开始连接服务器部署..."

  # SSH 连接服务器并执行部署命令
  ssh -i ~/.ssh/id_rsa root@10.201.0.20 << EOF
      echo "正在服务器上部署 deepexi-console-frontend:${tag_with_time}..."

      # 进入项目目录
      cd /data/scripts/model-stack

      # 执行启动脚本
      sh run_model-stack_front.sh ${tag_with_time}

      echo "部署完成！"
EOF

  echo "部署脚本执行完成！"
fi