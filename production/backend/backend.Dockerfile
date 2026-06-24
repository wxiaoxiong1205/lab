# FROM python:3.10.16-slim

# WORKDIR /app

# # Install PostgreSQL development libraries needed for psycopg2
# RUN apt-get update && \
#     apt-get install -y libpq-dev gcc && \
#     apt-get clean && rm -rf /var/lib/apt/lists/*

# COPY requirements.txt .
# RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ && \
#     pip install -r requirements.txt

# COPY ./app ./app

# CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# FROM deploy.deepexi.com/applife/deep-dataset-distillation-backend:base 

# WORKDIR /app

# COPY requirements.txt .
# RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ && \
#     pip install -r requirements.txt

# # 安装juicefs依赖
# RUN apt-get update && \
#     apt-get install -y curl fuse && \
#     rm -rf /var/lib/apt/lists/*

# # 下载并安装 JuiceFS CLI（社区版）
# RUN curl -sSL https://d.juicefs.com/install | sh -

# # 验证
# RUN juicefs --version

# COPY ./app ./app
# COPY celery_worker.py .
# COPY init_db.py .
# COPY status_manager.py .
# COPY alembic.ini .
# COPY migrations ./migrations
# COPY entrypoint.sh .
# COPY helm-v3.18.4-linux-amd64.tar.gz .
# RUN tar -zxvf helm-v3.18.4-linux-amd64.tar.gz && \
#     mv linux-amd64/helm /usr/local/bin/ && \
#     rm -rf helm-v3.18.4-linux-amd64.tar.gz
   
# # 设置启动脚本权限
# RUN chmod +x /app/entrypoint.sh

# CMD ["/app/entrypoint.sh"]


# FROM deploy.deepexi.com/applife/deep-dataset-distillation-backend:base-20250918 
# WORKDIR /app
# COPY ./libcrypto.so /app/
# COPY ./libssl1.1_1.1.1w-0+deb11u4_amd64.deb /tmp/
# RUN set -eux; \
#     apt-get update; \
#     apt-get install -y --no-install-recommends /tmp/libssl1.1_1.1.1w-0+deb11u4_amd64.deb;
# ENV LD_LIBRARY_PATH="/app:${LD_LIBRARY_PATH}"
# #时区处理
# RUN rm /etc/localtime
# RUN ln -s /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# COPY requirements.txt .
# RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple && \
# pip install -r requirements.txt

# COPY ./app ./app
# COPY celery_worker.py .
# COPY unified_manager.py .
# COPY entrypoint.sh .
# COPY helm-v3.18.4-linux-amd64.tar.gz .
# RUN tar -zxvf helm-v3.18.4-linux-amd64.tar.gz && \
#     mv linux-amd64/helm /usr/local/bin/ && \
#     rm -rf helm-v3.18.4-linux-amd64.tar.gz
# COPY ssh_host_key.pub .
# COPY ssh_host_key .

# # 设置启动脚本权限
# RUN chmod +x /app/entrypoint.sh

# CMD ["/app/entrypoint.sh"]


ARG TARGETARCH

# ==========================================
# 阶段 1: AMD64 专属预处理
# ==========================================
FROM deploy.deepexi.com/applife/deep-dataset-distillation-backend:base-20250918 AS build-amd64
WORKDIR /app

# 1. 处理 libcrypto
COPY libcrypto.so /app/libcrypto.so

# 2. 处理 libssl
COPY libssl1.1_1.1.1w-0+deb11u4_amd64.deb /tmp/
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends /tmp/libssl1.1_1.1.1w-0+deb11u4_amd64.deb; \
    rm -rf /var/lib/apt/lists/* /tmp/*.deb

# 3. 处理 Helm
COPY helm-v3.18.4-linux-amd64.tar.gz /tmp/
RUN tar -zxvf /tmp/helm-v3.18.4-linux-amd64.tar.gz -C /tmp && \
    mv /tmp/linux-amd64/helm /usr/local/bin/ && \
    rm -rf /tmp/helm-v3.18.4-linux-amd64.tar.gz /tmp/linux-amd64

# 4. 设置 AMD64 专属环境变量
ENV LD_LIBRARY_PATH="/app:${LD_LIBRARY_PATH}"


# ==========================================
# 阶段 2: ARM64 专属预处理
# ==========================================
#FROM deploy.deepexi.com/applife/deep-dataset-distillation-backend:base-20251115-arm AS build-arm64 update python 3.10-->3.12
FROM deploy.deepexi.com/applife/deep-dataset-distillation-backend:base-20251211-arm AS build-arm64
WORKDIR /app
# ARM 环境不需要做上述特殊的 COPY 和安装，保持干净即可


# ==========================================
# 阶段 3: 最终合并与公共步骤
# ==========================================
# 这一步非常关键：Docker 会根据 TARGETARCH 自动继承上面对应的阶段
FROM build-${TARGETARCH} AS final

# --- 下面是所有架构通用的步骤 ---

# 时区处理
RUN rm -f /etc/localtime && \
    ln -s /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# Python 依赖
COPY requirements.txt .
RUN pip uninstall -y juicefs
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple && \
    pip install -r requirements.txt

# 应用代码
COPY ./app ./app
COPY ./scripts ./scripts
COPY celery_worker.py .
COPY unified_manager.py .
COPY entrypoint.sh .
COPY entrypoint_proxy.sh .

# SSH 密钥
COPY ssh_host_key.pub .
COPY ssh_host_key .

# 设置启动脚本权限
RUN chmod +x /app/entrypoint.sh /app/entrypoint_proxy.sh
CMD ["/app/entrypoint.sh"]
