import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

DOCKERFILE_BODY = """\
FROM {base_image}

# 防止 tar 把权限搞乱
ENV DEBIAN_FRONTEND=noninteractive

# 解包环境
# 复制所有 tar（必须保证至少有一个存在）
COPY *.tar.gz /tmp/

RUN set -e; \
    for f in /tmp/*.tar.gz; do \
        [ -e "$f" ] || continue; \
        echo "extracting $f"; \
        tar -xzf "$f" -C / --no-same-owner; \
        rm -f "$f"; \
    done

# 可选：修一下 PATH
ENV PATH=/opt/conda/bin:/usr/local/bin:$PATH

# sanity check
RUN python --version || true
"""


async def generate_dockerfile(
    base_image: str,
    storage_path: str,
    tenant_id: Optional[str] = None
) -> bool:
    """
    生成 Dockerfile 并上传到 JuiceFS 指定路径
    
    Args:
        base_image: 基础镜像名称
        storage_path: JuiceFS 存储路径（完整路径，例如：/{project_name}/notebook/{instance_name}/asset/.snapshot/{snapshot_id}/Dockerfile）
        tenant_id: 租户ID（可选，如果不提供则从上下文获取）
    
    Returns:
        bool: 是否成功
    """
    try:
        # 延迟导入，避免循环依赖
        from app.core.depend_manager import AutoContainer
        from app.services.storage.interface import StorageService
        
        # 1. 获取 StorageService
        storage_service: StorageService = AutoContainer.storage_service()
        
        # 2. 获取 JuiceFS 客户端
        jfs = await storage_service.JUICEFS_CLIENT(tenant_id=tenant_id)
        
        # 3. 生成 Dockerfile 内容
        content = DOCKERFILE_BODY.format(base_image=base_image)
        
        # 4. 确保目录存在
        dir_path = os.path.dirname(storage_path)
        if dir_path:
            try:
                jfs.makedirs(dir_path, exist_ok=True)
            except Exception as e:
                logger.warning(f"创建目录失败 {dir_path}: {e}")
        
        # 5. 写入 Dockerfile 到 JuiceFS
        with jfs.open(storage_path, 'w', encoding='utf-8') as remote_file:
            remote_file.write(content)
        
        logger.info(f"Dockerfile 生成并上传成功: {storage_path}")
        return True
        
    except Exception as e:
        logger.error(f"生成 Dockerfile 失败 {storage_path}: {e}", exc_info=True)
        return False