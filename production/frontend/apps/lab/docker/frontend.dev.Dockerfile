FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV NODE_ENV=development
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# 安装pnpm并设置npm镜像源
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g pnpm && \
    pnpm config set registry https://registry.npmmirror.com

# 复制package.json和pnpm-lock.yaml到工作目录
COPY package.json ./package.json
COPY pnpm-lock.yaml ./pnpm-lock.yaml

# 安装依赖
RUN pnpm install

# 复制源代码到工作目录
COPY . .

# 暴露端口
EXPOSE 5177

# 启动开发服务器
CMD ["pnpm", "run", "dev"] 