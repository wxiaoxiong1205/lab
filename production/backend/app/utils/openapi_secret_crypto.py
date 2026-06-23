import os

from cryptography.fernet import Fernet


_key = os.getenv("OPENAPI_SECRET_AES_KEY", "JLq5BKeysGt6EQH8qsletp_t44d0L59wseMm1drcRyI=")
if not _key:
    raise ValueError("OPENAPI_SECRET_AES_KEY not set in environment")

_cipher = Fernet(_key)


def encrypt_openapi_secret(secret_key: str) -> str:
    return _cipher.encrypt(secret_key.encode()).decode()


def decrypt_openapi_secret(encrypted_secret_key: str) -> str:
    return _cipher.decrypt(encrypted_secret_key.encode()).decode()
