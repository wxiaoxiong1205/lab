import subprocess
import os
import tempfile
from typing import Dict, Tuple
import yaml


def run_helm_with_kubeconfig(
    kubeconfig_str: str,
    release_name: str,
    chart_path: str,
    namespace: str,
    helm_values: Dict
) -> Tuple[int, str, str]:
    """
    执行 Helm 命令，传入 kubeconfig 字符串和 helm values 字典（使用 --values）。

    参数:
        kubeconfig_str: Kubernetes kubeconfig 的字符串内容。
        release_name: Helm release 名称。
        chart_path: Helm chart 路径或包名，例如 ./juicefs-csi-driver-0.29.0.tgz。
        namespace: Kubernetes 命名空间。
        helm_values: Helm values 字典，会写入临时YAML文件并以 --values 方式传入。

    返回:
        (return_code, stdout, stderr)
    """
    # 写入 kubeconfig 到临时文件
    with tempfile.NamedTemporaryFile(mode='w+', delete=False, suffix=".yaml") as tmp_kubeconfig:
        tmp_kubeconfig.write(kubeconfig_str)
        tmp_kubeconfig_path = tmp_kubeconfig.name

    # 写入 helm values 到临时文件
    with tempfile.NamedTemporaryFile(mode='w+', delete=False, suffix=".yaml") as tmp_values:
        yaml.dump(helm_values, tmp_values, default_flow_style=False)
        tmp_values_path = tmp_values.name

    # 构造 Helm 命令
    cmd = f"""helm upgrade --install {release_name} {chart_path} \
      --values {tmp_values_path} \
      -n {namespace} --create-namespace \
      --kubeconfig={tmp_kubeconfig_path}"""

    # 执行命令
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

    # 清理临时文件
    try:
        os.unlink(tmp_kubeconfig_path)
        os.unlink(tmp_values_path)
    except OSError:
        pass

    return result.returncode, result.stdout, result.stderr


def run_uninstall_csi(
    kubeconfig_str: str,
    release_name: str,
    namespace: str,
) -> Tuple[int, str, str]:
    """
    执行 Helm 命令，传入 kubeconfig 字符串

    参数:
        kubeconfig_str: Kubernetes kubeconfig 的字符串内容。
        release_name: Helm release 名称。
        namespace: Kubernetes 命名空间。

    返回:
        (return_code, stdout, stderr)
    """
    # 写入 kubeconfig 到临时文件
    with tempfile.NamedTemporaryFile(mode='w+', delete=False, suffix=".yaml") as tmp_kubeconfig:
        tmp_kubeconfig.write(kubeconfig_str)
        tmp_kubeconfig_path = tmp_kubeconfig.name

    # 构造 Helm 命令
    cmd = f"""helm uninstall {release_name} -n {namespace} \
      --kubeconfig={tmp_kubeconfig_path}"""

    # 执行命令
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)

    # 清理临时文件
    try:
        os.unlink(tmp_kubeconfig_path)
    except OSError:
        pass

    return result.returncode, result.stdout, result.stderr