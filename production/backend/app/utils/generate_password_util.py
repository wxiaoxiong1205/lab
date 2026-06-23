import secrets
import string

def generate_password(length: int = 20,
                      use_upper: bool = True,
                      use_lower: bool = True,
                      use_digits: bool = True,
                      use_symbols: bool = True) -> str:
    """
    生成强随机密码。默认 20 位，包含大写/小写/数字/符号。
    """
    categories = []
    if use_upper:
        categories.append(string.ascii_uppercase)
    if use_lower:
        categories.append(string.ascii_lowercase)
    if use_digits:
        categories.append(string.digits)
    if use_symbols:
        # 去掉容易歧义或 shell 特殊的字符，可按需调整
        safe_symbols = "!@#$%&*()-_=+"
        categories.append(safe_symbols)

    if not categories:
        raise ValueError("至少启用一种字符类别")

    # 确保每类至少包含一个字符（提高复杂性）
    password_chars = [secrets.choice(cat) for cat in categories]

    all_chars = "".join(categories)
    remaining = length - len(password_chars)
    password_chars += [secrets.choice(all_chars) for _ in range(remaining)]
    # 打乱顺序
    secrets.SystemRandom().shuffle(password_chars)
    return "".join(password_chars)