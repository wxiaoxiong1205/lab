import yaml
import base64
import re

BASE64_FIELDS = {
    "certificate-authority-data",
    "client-certificate-data",
    "client-key-data",
}

def validate_kubeconfig_strict(kubeconfig_str: str) -> None:
    """
    严格校验 kubeconfig：
    - YAML 合法
    - 所有 *-data 字段必须是严格 base64（无空格、无换行）
    校验失败直接抛异常
    """
    try:
        cfg = yaml.safe_load(kubeconfig_str)
    except Exception as e:
        raise ValueError(f"kubeconfig YAML 解析失败: {e}")

    if not isinstance(cfg, dict):
        raise ValueError("kubeconfig 不是合法的 YAML mapping")

    users = cfg.get("users", [])
    clusters = cfg.get("clusters", [])

    def check_base64(val: str, field: str):
        if not isinstance(val, str):
            raise ValueError(f"{field} 必须是字符串")

        # 禁止任何空白字符（空格 / 换行 / tab）
        if re.search(r"\s", val):
            raise ValueError(f"{field} 包含空白字符（疑似已被破坏）")

        try:
            base64.b64decode(val, validate=True)
        except Exception as e:
            raise ValueError(f"{field} 非法 base64: {e}")

    for c in clusters:
        cluster = c.get("cluster", {})
        for f in BASE64_FIELDS:
            if f in cluster:
                check_base64(cluster[f], f)

    for u in users:
        user = u.get("user", {})
        for f in BASE64_FIELDS:
            if f in user:
                check_base64(user[f], f)