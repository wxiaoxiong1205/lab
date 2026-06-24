from cryptography.fernet import Fernet
import os

# 系统初始化时生成一次，存到配置文件或 KMS，不要硬编码
# key = Fernet.generate_key()
# print(key)

key = os.getenv('SSH_AES_KEY','Q5v26YNkMS2MHQfYfvYr6NONZZMI0k-WbeS5YfwzQ9w=')
if not key:
    raise ValueError("SSH_AES_KEY not set in environment")
cipher = Fernet(key)


def encrypt_password(password: str) -> str:
    return cipher.encrypt(password.encode()).decode()


def decrypt_password(token: str) -> str:
    return cipher.decrypt(token.encode()).decode()

# 使用示例
# plain_pw = "MyRand0mP@ss!"
# encrypted_pw = encrypt_password(plain_pw)   # 存数据库
# print(encrypted_pw)
# decrypted_pw = decrypt_password(encrypted_pw)  # 取出来时解密
# print(decrypted_pw)
