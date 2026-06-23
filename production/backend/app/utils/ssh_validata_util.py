from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
import os
import asyncssh
from sqlalchemy.future import select
from app.database.base import get_db_session
import base64
import re
from app.models.models import Notebook, SshAuthorizedKeys
from app.utils.auth import verify_password
from app.core.logging import logger


async def ssh_authenticate_user(username: str, is_password: bool, password: Optional[str] = None) -> Optional[Notebook]:
    encrypted_identity = extract_encrypted_part(username)
    logger.info(f"SSH 网关原始标识: {encrypted_identity}")
    notebook_identity = simple_decrypt(encrypted_identity, os.getenv("SECRET_KEY_SSH", "deepexilab_key_ssh"))
    logger.info(f"SSH 网关解密后的标识: {notebook_identity}")
    project_id, notebook_id = notebook_identity.split("@")
    ssh_username = username.split("@")[0]
    try:
        """从数据库校验单个 Notebook 的 SSH 用户"""
        async with get_db_session() as db:  # 获取 AsyncSession
            notebook_result = await db.execute(select(Notebook).where(
                Notebook.project_id == int(project_id),
                Notebook.id == int(notebook_id),
                Notebook.ssh_username == ssh_username,
            ))
            notebook = notebook_result.scalars().first()

            if is_password:
                if not notebook or not verify_password(password, notebook.ssh_password):
                    return None

            return notebook
    except Exception:
        return None


def extract_encrypted_part(input_str: str) -> str:
    """从 SSH 网关用户名中提取 Notebook 加密标识（格式：username@ssh-加密内容）。"""
    # 匹配 "ssh-" 后、最后一个 "@" 前的加密内容
    match = re.fullmatch(r'.+@ssh-(.+)', input_str)
    if not match:
        raise ValueError(f"输入格式错误，无法提取加密部分（示例正确格式：username@ssh-加密内容")
    return match.group(1)

def simple_encrypt(content: str, key: str) -> str:
    """第二步：简单加密（Base64+密钥混淆）"""
    # 1. 用密钥和内容拼接（混淆内容，避免直接Base64解码暴露）
    mixed_content = f"{key}:{content}"  # 格式：密钥:内容
    # 2. 转成字节流后做Base64编码（最后转成字符串方便存储/传输）
    return base64.b64encode(mixed_content.encode("utf-8")).decode("utf-8")

def simple_decrypt(encrypted_str: str, key: str) -> str:
    """第三步：对应解密"""
    try:
        # 1. Base64解码
        decrypted_bytes = base64.b64decode(encrypted_str.encode("utf-8"))
        decrypted_str = decrypted_bytes.decode("utf-8")
        # 2. 按密钥分割，还原原始内容（验证密钥是否正确）
        if not decrypted_str.startswith(f"{key}:"):
            raise ValueError("解密失败：密钥错误或加密内容被篡改")
        return decrypted_str.split(f"{key}:", 1)[1]  # 分割后取后半段（原始内容）
    except Exception as e:
        raise ValueError(f"解密失败：{str(e)}")

async def find_key_by_comment(notebook_id: int):
    """根据 Notebook ID 获取 SSH 公钥。"""
    try:
        async with get_db_session() as db:  # 获取 AsyncSession
            result = await db.execute(select(SshAuthorizedKeys.authorized_key).where(SshAuthorizedKeys.notebook_id == notebook_id))
            authorized_key = result.scalars().first()
            if not authorized_key:
                return None

            parts = authorized_key.split()
            if len(parts) < 3:
                return None

            key_type, key_data, comment = parts[0], parts[1], parts[2]
            if comment == f'notebook_{notebook_id}@jump':
                try:
                    return asyncssh.import_public_key(f"{key_type} {key_data}")
                except Exception as e:
                    raise ValueError(f"解析 Notebook 公钥失败: notebook_id={notebook_id}, key={authorized_key}, 错误: {e}")
                    return None
    except Exception as e:
        logger.error(f"解析 Notebook 公钥失败: notebook_id={notebook_id}, key={authorized_key}, 错误: {e}")
        return None
    return None
