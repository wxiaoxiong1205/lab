import abc
from abc import ABC
from typing import List, Dict, Optional, Tuple, Any
from kubernetes.client import V1VolumeMount, V1Volume, V1Affinity, V1PodSecurityContext


class K8sTask(ABC):
    """K8s任务提交接口类"""
    
    def __init__(self):
        pass

    @abc.abstractmethod
    async def submit(self) -> str:
        """
        提交任务到K8s，返回Job名称或资源标识
        
        Returns:
            str: Job名称或资源标识
        """
        pass

    @abc.abstractmethod
    async def build_volume_and_mount(self) -> Tuple[List[V1VolumeMount], List[V1Volume]]:
        """
        构建存储卷和挂载配置
        
        Returns:
            Tuple[List[V1VolumeMount], List[V1Volume]]: 卷挂载列表和卷列表
        """
        pass

    @abc.abstractmethod
    async def build_env(self) -> Dict[str, str]:
        """
        构建环境变量
        
        Returns:
            Dict[str, str]: 环境变量字典
        """
        pass

    @abc.abstractmethod
    async def build_cmd_and_args(self) -> List[Tuple[List[str], List[str]]]:
        """
        构建命令和参数
        
        Returns:
            List[Tuple[List[str], List[str]]]: 命令和参数列表，每个元素是一个 (command, args) 元组
            - 对于评估任务，如果是 all 类型，会返回两个元组（基础指标评估和裁判员评估）
            - 对于推理任务，返回单个元组（包装成列表）
        """
        pass

    @abc.abstractmethod
    async def build_image(self) -> str:
        """
        获取容器镜像地址
        
        Returns:
            str: 镜像地址
        """
        pass

    @abc.abstractmethod
    async def build_run_resource(self) -> Dict[str, Any]:
        """
        构建运行资源（CPU、内存、GPU等）
        
        Returns:
            Dict[str, Any]: 资源配置字典，包含gpu_type, gpu_count等
        """
        pass

    @abc.abstractmethod
    async def build_node_affinity(self) -> Optional[V1Affinity]:
        """
        构建节点亲和性配置
        
        Returns:
            Optional[V1Affinity]: 节点亲和性配置，如果不需要则返回None
        """
        pass

    @abc.abstractmethod
    async def build_working_dir(self) -> str:
        """
        构建工作目录
        
        Returns:
            str: 工作目录路径
        """
        pass

    @abc.abstractmethod
    async def build_security_context(self) -> Optional[V1PodSecurityContext]:
        """
        构建安全上下文
        
        Returns:
            Optional[V1PodSecurityContext]: 安全上下文配置，如果不需要则返回None
        """
        pass

    @abc.abstractmethod
    async def build_service_type(self) -> str:
        """
        构建服务类型标识
        
        Returns:
            str: 服务类型，如 "evaluation", "inference" 等
        """
        pass

    @abc.abstractmethod
    async def build_job_name(self) -> str:
        """
        构建Job名称
        
        Returns:
            str: Job名称
        """
        pass

    async def build_script_configs(self) -> Optional[Dict[str, Dict[str, str]]]:
        """
        构建脚本挂载配置（可选）
        
        默认实现由 BaseK8sTask 提供，自动扫描 scripts 目录下的所有脚本。
        子类可以重写此方法以提供自定义的脚本挂载配置。

        script_configs: 脚本挂载配置，格式：
                {
                    "config_map_name": {
                        "script_path": "scripts/basic_metrics/main.py",  # 项目相对路径
                        "mount_path": "/scripts",  # 容器内挂载目录
                        "file_name": "basic_metrics/main.py"  # 挂载后的文件名（保持相对路径结构）
                    }
                }
        
        Returns:
            Optional[Dict[str, Dict[str, str]]]: 脚本挂载配置，如果不需要则返回None
        """
        pass



