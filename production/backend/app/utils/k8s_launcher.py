import os
import asyncio
import re
import time

from fastapi import HTTPException
from kubernetes import client, watch
from typing import Dict, List, Optional, Any, Union, Coroutine
from app.common.status import TaskStatus
from app.core.logging import logger
import yaml

from app.common import k8s_labels
from app.utils.k8s_call import get_k8s_api, k8s_call


def _service_port_target_int(sp: client.V1ServicePort) -> int:
    """从 V1ServicePort 解析容器目标端口，用于追加 V1ContainerPort。"""
    if sp is None or sp.port is None:
        raise ValueError("extra_node_port 中每项须设置 port")
    if sp.target_port is None:
        return int(sp.port)
    tp = sp.target_port
    if isinstance(tp, int):
        return tp
    val = getattr(tp, "value", tp)
    if isinstance(val, int):
        return val
    if isinstance(val, str) and val.isdigit():
        return int(val)
    return int(sp.port)


def _container_port_name_from_service_port(sp: client.V1ServicePort, index: int) -> str:
    """容器端口名须符合 DNS 标签子集，最长 15。"""
    raw = (sp.name or f"extra-{index}").lower()
    raw = re.sub(r"[^a-z0-9-]+", "-", raw).strip("-") or f"e{index}"
    return raw[:15]


class K8sLauncher:
    """Kubernetes应用启动器"""

    def __init__(self, config_str: str):
        """
        初始化启动器

        Args:
            config_file: kubeconfig文件路径
        """
        # 解析kubeconfig
        config_dict = yaml.safe_load(config_str)
        # 创建 API 客户端
        self.v1 = get_k8s_api(config_dict, client.CoreV1Api)
        self.apps_v1 = get_k8s_api(config_dict, client.AppsV1Api)
        self.batch_v1 = get_k8s_api(config_dict, client.BatchV1Api)
        self.custom_objects = get_k8s_api(config_dict, client.CustomObjectsApi)

    async def create_app(self,
                         namespace: str,
                         app_name: str,
                         image: str,
                         service_type: str,
                         container_port: int,
                         k8s_uuid: str,
                         node_port: int = None,
                         cpu_limit: str = "16",
                         memory_limit: str = "16Gi",
                         cpu_request: str = "0.5",
                         memory_request: str = "0.5Gi",
                         gpu_type: Optional[str] = None,
                         gpu_count: str = "1",
                         env_vars: Optional[Dict[str, str]] = None,
                         volume_mounts: Optional[List[client.V1VolumeMount]] = None,
                         volumes: Optional[List[client.V1Volume]] = None,
                         config_maps: Optional[Dict[str, Dict[str, str]]] = None,
                         working_dir: Optional[str] = None,
                         security_context: Optional[client.V1PodSecurityContext] = None,
                         automount_service_account_token: bool = True,
                         command: Optional[List[str]] = None,
                         args: Optional[List[str]] = None,
                         is_ssh: Optional[bool] = False,
                         pod_annotations: Optional[dict] = None,
                         affinity: Optional[Union[dict, client.V1Affinity]] = None,
                         manufacturer: Optional[str] = None,
                         replicas: int = 1,
                         extra_node_port: Optional[List[client.V1ServicePort]] = None,
                         probe_url: Optional[str] = None) -> Dict[str, Any]:
        """
        部署应用（创建所有资源并启动）

        Args:
            namespace: 命名空间
            app_name: 应用名称
            image: 容器镜像
            service_type: 服务类型（如notebook等等，用于pod的label service做监听）
            container_port: 容器端口
            node_port: 节点端口（如果为None则自动分配）
            cpu_limit: CPU限制
            memory_limit: 内存限制
            cpu_request: CPU请求
            memory_request: 内存请求
            gpu_type: GPU类型 (nvidia.com/gpu 或 huawei.com/npu)
            gpu_count: GPU数量
            env_vars: 环境变量
            volume_mounts: 卷挂载
            volumes: 卷
            config_maps: ConfigMap配置 {config_map_name: {file_name: content}}
            working_dir: 工作目录
            security_context: Pod安全上下文
            automount_service_account_token: 是否自动挂载服务账户令牌
            command:pod的command
            args:pod的args
            is_ssh:是否开启ssh
            pod_annotations:pod的注解
            affinity:亲和配置
            manufacturer:厂商
            extra_node_port: 额外 NodePort 端口列表（每项为 V1ServicePort）。
                须设置 name、port；target_port 缺省则与 port 相同。未设置 node_port 时与主端口在同一批池中自动分配，避免冲突。
                火山云（LoadBalancer）下 node_port 会被置为 None，由集群分配。
                会同步追加 Pod containerPort，便于流量转发到容器监听端口。
            probe_url:探针地址
        Returns:
            Dict: 创建的资源信息
        """
        try:
            extra_list: List[client.V1ServicePort] = list(extra_node_port) if extra_node_port else []
            for idx, ep in enumerate(extra_list):
                if not ep.name:
                    raise ValueError(f"extra_node_port[{idx}] 须设置 name（Service 端口名在集群内唯一）")
                if ep.port is None:
                    raise ValueError(f"extra_node_port[{idx}] 须设置 port")

            # 火山弹性云资源不允许使用NodePort，得用LoadBalancer
            service_spec_type = None
            if manufacturer == "火山云":
                service_spec_type = "LoadBalancer"
                node_port = None
                ssh_port = None
                for e in extra_list:
                    e.node_port = None
            else:
                # 自动分配 NodePort：主端口、ssh 与 extra 在同一次池中分配，避免两次查询拿到重复端口
                ssh_port = None
                n_extra_auto = sum(1 for e in extra_list if e.node_port is None)
                if node_port is None:
                    n_main = 2 if is_ssh else 1
                    total_need = n_main + n_extra_auto
                    if total_need > 0:
                        pool = await self.get_available_ports(namespace, total_need)
                        if len(pool) < total_need:
                            raise RuntimeError("未找到足够的可用 NodePort")
                        i = 0
                        if is_ssh:
                            node_port, ssh_port = pool[i], pool[i + 1]
                            i += 2
                        else:
                            node_port = pool[i]
                            i += 1
                        for e in extra_list:
                            if e.node_port is None:
                                e.node_port = pool[i]
                                i += 1
                    logger.info(f"自动分配端口: node_port={node_port}, ssh_port={ssh_port}, extra={[e.node_port for e in extra_list]}")
                elif n_extra_auto > 0:
                    pool = await self.get_available_ports(namespace, n_extra_auto)
                    if len(pool) < n_extra_auto:
                        raise RuntimeError("未找到足够的可用 NodePort（额外端口）")
                    j = 0
                    for e in extra_list:
                        if e.node_port is None:
                            e.node_port = pool[j]
                            j += 1
                    logger.info(f"主端口已指定，额外分配 NodePort: {[e.node_port for e in extra_list]}")

            created_resources = {}

            # 1. 创建 ConfigMaps (如果有)
            if config_maps:
                for config_map_name, config_data in config_maps.items():
                    config_map = await self._create_config_map(namespace, config_map_name, config_data)
                    created_resources[f"config_map_{config_map_name}"] = config_map

            # 2. 创建 Deployment
            deployment_name = f"{app_name}-deployment"
            deployment = await self._create_deployment(
                namespace, deployment_name, app_name, image, container_port,
                cpu_limit, memory_limit, cpu_request, memory_request,
                gpu_type, gpu_count, env_vars, volume_mounts, volumes,
                working_dir, security_context, automount_service_account_token,
                service_type, k8s_uuid, command, args, is_ssh, pod_annotations,affinity, replicas, probe_url,
                extra_service_ports=extra_list or None,
            )
            created_resources["deployment"] = deployment

            # 3. 创建 Service
            service_name = f"{app_name}-service"
            service = await self._create_service(
                namespace, service_name, app_name, container_port, node_port, service_type, is_ssh, ssh_port,service_spec_type,
                extra_ports=extra_list or None,
            )

            if manufacturer and "火山云" in manufacturer:
                lb_ip, ports = await self.wait_loadbalancer_ip(namespace, service_name)
                created_resources["service_ip"] = lb_ip
                created_resources["service_ports"] = ports

            created_resources["service"] = service

            return {
                **created_resources,
                "namespace": namespace,
                "app_name": app_name,
                "node_port": node_port,
                "ssh_port": ssh_port,
                "extra_node_port": extra_node_port
            }

        except Exception as e:
            logger.error(f"创建应用 {app_name} 失败: {e}")
            # 回滚
            await self._rollback_resources(namespace, app_name, config_maps)
            raise

    async def stop_app(self, namespace: str, app_name: str) -> bool:
        """
        停止应用（将副本数设为0）

        Args:
            namespace: 命名空间
            app_name: 应用名称

        Returns:
            bool: 是否成功停止
        """
        try:
            deployment_name = f"{app_name}-deployment"

            # 获取当前的Deployment
            deployment = await k8s_call(self.apps_v1.read_namespaced_deployment,
                name=deployment_name,
                namespace=namespace
            )

            # 将副本数设为0
            deployment.spec.replicas = 0

            # 更新Deployment
            await k8s_call(self.apps_v1.replace_namespaced_deployment,
                name=deployment_name,
                namespace=namespace,
                body=deployment
            )

            logger.info(f"应用 {app_name} 已停止（副本数设为0）")
            return True

        except client.exceptions.ApiException as e:
            if e.status == 404:
                logger.error(f"Deployment {deployment_name} 不存在")
                raise HTTPException(status_code=404, detail=f"停止失败:Deployment {deployment_name} 不存在")
                return False
            else:
                logger.error(f"停止应用 {app_name} 失败: {e}")
                raise HTTPException(status_code=500, detail=f"停止应用 {app_name} 失败: {e}")
                return False
        except Exception as e:
            logger.error(f"停止应用 {app_name} 时发生错误: {e}")
            raise HTTPException(status_code=500, detail=f"停止应用 {app_name} 时发生错误: {e}")
            return False

    async def start_app(self, namespace: str, app_name: str, replicas: int = 1, pod_annotations: Optional[dict] = None) -> bool:
        """
        启动应用（将副本数设为指定数量）

        Args:
            namespace: 命名空间
            app_name: 应用名称
            replicas: 副本数量，默认为1
            pod_annotations: pod注解

        Returns:
            bool: 是否成功启动
        """
        try:
            deployment_name = f"{app_name}-deployment"

            # 获取当前的Deployment
            deployment = await k8s_call(self.apps_v1.read_namespaced_deployment,
                name=deployment_name,
                namespace=namespace
            )

            # 将副本数设为指定数量
            deployment.spec.replicas = replicas

            if pod_annotations:
                # 启动时写 annotation
                if replicas > 0:
                    deployment.spec.template.metadata.annotations = pod_annotations
            # 更新Deployment
            await k8s_call(self.apps_v1.replace_namespaced_deployment,
                name=deployment_name,
                namespace=namespace,
                body=deployment
            )

            logger.info(f"应用 {app_name} 已启动（副本数设为{replicas}）")
            return True

        except client.exceptions.ApiException as e:
            if e.status == 404:
                logger.error(f"Deployment {deployment_name} 不存在")
                raise HTTPException(status_code=404, detail=f"启动失败:Deployment {deployment_name} 不存在")
                return False
            else:
                logger.error(f"启动应用 {app_name} 失败: {e}")
                raise HTTPException(status_code=500, detail=f"启动应用 {app_name} 失败: {e}")
                return False
        except Exception as e:
            logger.error(f"启动应用 {app_name} 时发生错误: {e}")
            raise HTTPException(status_code=500, detail=f"{e}")
            return False

    async def stop_patch_app_image_only(
            self,
            namespace: str,
            app_name: str,
            image: str,
    ) -> bool:
        """
        仅更新 Deployment 使用的镜像，不启动 Pod
        （replicas 不做任何修改）
        """
        try:
            deployment_name = f"{app_name}-deployment"

            # 获取当前的Deployment
            deployment = await k8s_call(self.apps_v1.read_namespaced_deployment,
                                        name=deployment_name,
                                        namespace=namespace
                                        )

            # 将副本数设为0
            deployment.spec.replicas = 0

            # 更新Deployment
            await k8s_call(self.apps_v1.replace_namespaced_deployment,
                           name=deployment_name,
                           namespace=namespace,
                           body=deployment
                           )

            logger.info(f"应用 {app_name} 已停止（副本数设为0）")

            patch_body = {
                "spec": {
                    "template": {
                        "spec": {
                            "containers": [
                                {
                                    "name": app_name,
                                    "image": image
                                }
                            ]
                        }
                    }
                }
            }

            await k8s_call(
                self.apps_v1.patch_namespaced_deployment,
                name=deployment_name,
                namespace=namespace,
                body=patch_body,
            )

            logger.info(f"应用 {app_name} 镜像已更新为 {image}（未启动）")
            return True

        except client.exceptions.ApiException as e:
            if e.status == 404:
                raise HTTPException(
                    status_code=404,
                    detail=f"Deployment {deployment_name} 不存在"
                )
            raise HTTPException(
                status_code=500,
                detail=f"更新镜像失败: {e}"
            )

    async def patch_app_config(
        self,
        namespace: str,
        app_name: str,
        image: Optional[str] = None,
        cpu_request: Optional[str] = None,
        cpu_limit: Optional[str] = None,
        memory_request: Optional[str] = None,
        memory_limit: Optional[str] = None,
        gpu_type: Optional[str] = None,
        gpu_count: Optional[int] = None,
        clear_gpu: bool = False,
        pod_annotations: Optional[Dict[str, str]] = None,
        affinity: Optional[Union[dict, client.V1Affinity]] = None,
        clear_affinity: bool = False,
        volume_mounts: Optional[List[client.V1VolumeMount]] = None,
        volumes: Optional[List[client.V1Volume]] = None,
        env_vars: Optional[Dict[str, str]] = None,
    ) -> bool:
        """更新 Deployment 的 image / 资源 / GPU / annotations / affinity / 卷挂载 / 环境变量。

        - replicas 不修改：RUNNING 中会触发滚动更新；TERMINATED 不会拉起 Pod，
          下次 ``start_app`` 时即生效。
        - 仅在传入非 None 的字段才会被覆盖；``clear_gpu``/``clear_affinity``
          用于显式清空对应字段。
        - 不会修改 Service 等非本方法范畴的字段；ConfigMap 内容请走单独的
          ``replace_config_map``。

        Args:
            namespace: 命名空间
            app_name: 应用名称（与 ``create_app`` 保持一致，最终 deployment 名为
                ``{app_name}-deployment``）
            image: 容器镜像
            cpu_request: CPU 请求
            cpu_limit: CPU 限制
            memory_request: 内存请求
            memory_limit: 内存限制（变更后会同步重写 shm 卷的 ``size_limit``）
            gpu_type: GPU/NPU 资源 key（如 ``nvidia.com/gpu``）。
                变更前会先清掉所有 ``*gpu*``/``*npu*`` key，避免遗留旧厂商资源。
            gpu_count: GPU/NPU 数量。``gpu_count=0`` 视为不申请 GPU。
            clear_gpu: 显式置空 GPU 资源（不传 gpu_type/gpu_count 时使用）
            pod_annotations: 整体替换 Pod template annotations（保留 K8s 系统注解）
            affinity: 亲和性配置（V1Affinity 或 dict），覆盖原配置
            clear_affinity: 显式清空亲和性配置
            volume_mounts: 整体替换容器卷挂载列表（``shm`` 由本方法自动保留，
                调用方无需自带）
            volumes: 整体替换 Pod 卷列表（``shm`` 由本方法自动保留，调用方无需自带）
            env_vars: 整体替换容器 env（与 ``create_app`` 的 env_vars 同构 dict）。
                传 ``{}`` 表示清空；传 ``None`` 表示不动 env。
        Returns:
            bool: ``True`` 表示已下发 patch；``False`` 表示 deployment 不存在跳过。
        """
        deployment_name = f"{app_name}-deployment"
        try:
            deployment = await k8s_call(
                self.apps_v1.read_namespaced_deployment,
                name=deployment_name,
                namespace=namespace,
            )
        except client.exceptions.ApiException as e:
            if e.status == 404:
                logger.warning(f"Deployment {deployment_name} 不存在，跳过 K8s 同步")
                return False
            logger.error(f"读取 Deployment {deployment_name} 失败: {e}")
            raise HTTPException(status_code=502, detail=f"读取 Deployment 失败: {e.reason}")

        try:
            template = deployment.spec.template
            pod_spec = template.spec
            if not pod_spec.containers:
                raise HTTPException(status_code=500, detail=f"Deployment {deployment_name} 缺少容器定义")
            container = pod_spec.containers[0]

            if image is not None:
                container.image = image

            if container.resources is None:
                container.resources = client.V1ResourceRequirements(limits={}, requests={})
            limits = dict(container.resources.limits or {})
            requests = dict(container.resources.requests or {})

            if cpu_request is not None:
                requests["cpu"] = str(cpu_request)
            if cpu_limit is not None:
                limits["cpu"] = str(cpu_limit)
            if memory_request is not None:
                requests["memory"] = str(memory_request)
            if memory_limit is not None:
                limits["memory"] = str(memory_limit)

            # GPU/NPU：先清掉所有可能的 GPU 资源 key，避免在不同厂商之间切换时残留
            if clear_gpu or gpu_type is not None or gpu_count is not None:
                for k in list(limits.keys()):
                    if "gpu" in k.lower() or "npu" in k.lower():
                        limits.pop(k, None)
                for k in list(requests.keys()):
                    if "gpu" in k.lower() or "npu" in k.lower():
                        requests.pop(k, None)
                if not clear_gpu and gpu_type and gpu_count and int(gpu_count) > 0:
                    limits[gpu_type] = str(gpu_count)
                    requests[gpu_type] = str(gpu_count)

            container.resources.limits = limits or None
            container.resources.requests = requests or None

            # 卷挂载/卷整体替换（shm 由本方法保底）
            if volume_mounts is not None or volumes is not None:
                existing_mounts = list(container.volume_mounts or [])
                existing_vols = list(pod_spec.volumes or [])

                shm_mount = next((vm for vm in existing_mounts if getattr(vm, "name", None) == "shm"), None)
                shm_vol = next((v for v in existing_vols if getattr(v, "name", None) == "shm"), None)

                if volume_mounts is not None:
                    new_mounts = [vm for vm in volume_mounts if getattr(vm, "name", None) != "shm"]
                    if shm_mount is not None:
                        new_mounts.append(shm_mount)
                    container.volume_mounts = new_mounts or None

                if volumes is not None:
                    new_vols = [v for v in volumes if getattr(v, "name", None) != "shm"]
                    if shm_vol is not None:
                        new_vols.append(shm_vol)
                    pod_spec.volumes = new_vols or None

            # 内存上限变更后同步 shm 卷大小，避免容器内 /dev/shm 与新内存上限不匹配
            if memory_limit is not None:
                cur_volumes = pod_spec.volumes or []
                for vol in cur_volumes:
                    if getattr(vol, "name", None) == "shm" and getattr(vol, "empty_dir", None):
                        vol.empty_dir.size_limit = str(memory_limit)

            if pod_annotations is not None:
                if template.metadata is None:
                    template.metadata = client.V1ObjectMeta()
                existing = template.metadata.annotations or {}
                merged: Dict[str, str] = {}
                for k, v in existing.items():
                    if k.startswith("kubectl.kubernetes.io/") or k.startswith("deployment.kubernetes.io/"):
                        merged[k] = v
                merged.update({k: str(v) for k, v in pod_annotations.items()})
                template.metadata.annotations = merged

            if clear_affinity:
                pod_spec.affinity = None
            elif affinity is not None:
                pod_spec.affinity = affinity

            if env_vars is not None:
                # 整体替换容器 env：``create_app`` 流程下容器 env 完全由 env_vars dict 构造，
                # 没有 K8s 注入项，整体覆盖是安全的。
                new_env = [
                    client.V1EnvVar(name=str(k), value=str(v))
                    for k, v in env_vars.items()
                ]
                container.env = new_env or None

            await k8s_call(
                self.apps_v1.replace_namespaced_deployment,
                name=deployment_name,
                namespace=namespace,
                body=deployment,
            )
            logger.info(f"应用 {app_name} Deployment 配置已同步更新")
            return True
        except HTTPException:
            raise
        except client.exceptions.ApiException as e:
            logger.error(f"更新 Deployment {deployment_name} 失败: {e}")
            raise HTTPException(status_code=502, detail=f"更新 Deployment 失败: {e.reason}")
        except Exception as e:
            logger.error(f"更新 Deployment {deployment_name} 异常: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"更新 Deployment 异常: {e}")

    async def replace_config_map(self, namespace: str, name: str, data: Dict[str, str]) -> bool:
        """整体替换已有 ConfigMap 的 ``data``。

        - ConfigMap 不存在时返回 ``False`` 而不抛错，方便编辑流程的幂等处理；
        - 保留原 ConfigMap 的 metadata（labels / annotations 等），只重写 ``data``。

        Args:
            namespace: 命名空间
            name: ConfigMap 名称（如 ``jupyter-config-notebook-123``）
            data: 新的 ConfigMap data，整体替换旧内容
        Returns:
            bool: ``True`` 已下发更新；``False`` 表示目标 ConfigMap 不存在。
        """
        try:
            existing = await k8s_call(self.v1.read_namespaced_config_map, name=name, namespace=namespace)
        except client.exceptions.ApiException as e:
            if e.status == 404:
                logger.warning(f"ConfigMap {name} 不存在，跳过 K8s 同步")
                return False
            logger.error(f"读取 ConfigMap {name} 失败: {e}")
            raise HTTPException(status_code=502, detail=f"读取 ConfigMap 失败: {e.reason}")

        existing.data = dict(data or {})
        try:
            await k8s_call(
                self.v1.replace_namespaced_config_map,
                name=name,
                namespace=namespace,
                body=existing,
            )
            logger.info(f"ConfigMap {name} 数据已同步更新")
            return True
        except client.exceptions.ApiException as e:
            logger.error(f"更新 ConfigMap {name} 失败: {e}")
            raise HTTPException(status_code=502, detail=f"更新 ConfigMap 失败: {e.reason}")
        except Exception as e:
            logger.error(f"更新 ConfigMap {name} 异常: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"更新 ConfigMap 异常: {e}")

    async def _create_config_map(self, namespace: str, name: str, data: Dict[str, str]) -> client.V1ConfigMap:
        """创建ConfigMap"""
        config_map = client.V1ConfigMap(
            metadata=client.V1ObjectMeta(name=name, namespace=namespace),
            data=data
        )

        try:
            result = await k8s_call(self.v1.create_namespaced_config_map, namespace=namespace, body=config_map)
            logger.info(f"ConfigMap {name} 创建成功")
            return result
        except client.exceptions.ApiException as e:
            if e.status == 409:
                logger.error(f"ConfigMap {name} 已存在")
                return await k8s_call(self.v1.read_namespaced_config_map, name=name, namespace=namespace)
            else:
                raise

    def _load_script_from_project(self, script_path: str) -> str:
        """
        从项目根目录读取脚本文件内容
        
        Args:
            script_path: 脚本文件的项目相对路径（如 "app/scripts/inference.py"）
            
        Returns:
            脚本文件内容（字符串）
            
        Raises:
            FileNotFoundError: 如果脚本文件不存在
            IOError: 如果读取文件失败
        """
        # 获取项目根目录（当前文件所在目录的父目录的父目录）
        current_file_dir = os.path.dirname(os.path.abspath(__file__))
        # app/utils -> app -> 项目根目录
        project_root = os.path.dirname(os.path.dirname(current_file_dir))
        
        # 构建完整的脚本文件路径
        full_script_path = os.path.join(project_root, script_path)
        full_script_path = os.path.normpath(full_script_path)
        
        # 安全检查：确保路径在项目根目录内（防止路径遍历攻击）
        project_root_abs = os.path.abspath(project_root)
        script_path_abs = os.path.abspath(full_script_path)
        if not script_path_abs.startswith(project_root_abs):
            raise ValueError(f"脚本路径不安全，不允许访问项目根目录之外的文件: {script_path}")
        
        # 检查文件是否存在
        if not os.path.exists(full_script_path):
            raise FileNotFoundError(f"脚本文件不存在: {full_script_path} (项目相对路径: {script_path})")
        
        # 读取文件内容
        try:
            with open(full_script_path, 'r', encoding='utf-8') as f:
                content = f.read()
            logger.info(f"成功读取脚本文件: {script_path} (完整路径: {full_script_path})")
            return content
        except Exception as e:
            raise IOError(f"读取脚本文件失败: {script_path}, 错误: {str(e)}")

    async def _create_deployment(self,
                                 namespace: str,
                                 name: str,
                                 app_name: str,
                                 image: str,
                                 container_port: int,
                                 cpu_limit: str,
                                 memory_limit: str,
                                 cpu_request: str,
                                 memory_request: str,
                                 gpu_type: Optional[str],
                                 gpu_count: str,
                                 env_vars: Optional[Dict[str, str]],
                                 volume_mounts: Optional[List[client.V1VolumeMount]],
                                 volumes: Optional[List[client.V1Volume]],
                                 working_dir: Optional[str],
                                 security_context: Optional[client.V1PodSecurityContext],
                                 automount_service_account_token: bool,
                                 service_type: str,
                                 k8s_uuid: str,
                                 command: Optional[List[str]] = None,
                                 args: Optional[List[str]] = None,
                                 is_ssh: Optional[bool] = False,
                                 annotations: Optional[dict] = None,
                                 affinity: Optional[Union[dict, client.V1Affinity]] = None,
                                 replicas: int = 1,
                                 probe_url: Optional[str] = None,
                                 extra_service_ports: Optional[List[client.V1ServicePort]] = None) -> client.V1Deployment:
        """创建Deployment"""

        # 构建资源限制
        limits = {}
        requests = {}

        # 只有当参数不为None时才添加资源限制
        if cpu_limit is not None:
            limits["cpu"] = cpu_limit
        if memory_limit is not None:
            limits["memory"] = memory_limit
            # 统一设置共享内存为内存限制值
            volume_mounts, volumes = add_shm_if_missing(volume_mounts=volume_mounts, volumes=volumes,
                                                        size_gb=memory_limit)
        if cpu_request is not None:
            requests["cpu"] = cpu_request
        if memory_request is not None:
            requests["memory"] = memory_request

        if gpu_type:
            limits[gpu_type] = gpu_count
            requests[gpu_type] = gpu_count

        # 构建环境变量
        env_list = []
        if env_vars:
            for key, value in env_vars.items():
                env_list.append(client.V1EnvVar(name=key, value=value))

        # 处理容器端口
        ports = [client.V1ContainerPort(container_port=container_port, name="http-port", protocol="TCP")]
        if is_ssh:
            ports.append(client.V1ContainerPort(container_port=22, name="ssh-port", protocol="TCP"))
        if extra_service_ports:
            for i, sp in enumerate(extra_service_ports):
                tgt = _service_port_target_int(sp)
                nm = _container_port_name_from_service_port(sp, i)
                ports.append(client.V1ContainerPort(container_port=tgt, name=nm, protocol=getattr(sp, "protocol", None) or "TCP"))

        # 构建容器
        # 镜像拉取策略：可通过环境变量控制
        image_pull_policy = os.getenv("K8S_IMAGE_PULL_POLICY", "IfNotPresent")

        container = client.V1Container(
            name=app_name,
            image=image,
            image_pull_policy=image_pull_policy,
            ports=ports,
            resources=client.V1ResourceRequirements(
                limits=limits,
                requests=requests
            )
        )

        # 设置启动命令和参数
        if command:
            container.command = command
        if args:
            container.args = args

        if env_list:
            container.env = env_list
        if volume_mounts:
            container.volume_mounts = volume_mounts
        if working_dir:
            container.working_dir = working_dir
        if probe_url:
            container.startup_probe = client.V1Probe(
                http_get=client.V1HTTPGetAction(
                    path=probe_url,
                    port=container_port
                ),
                initial_delay_seconds=30,
                period_seconds=5,
                timeout_seconds=10,
                failure_threshold=900,
                success_threshold=1
                )
            container.readiness_probe = client.V1Probe(
                http_get=client.V1HTTPGetAction(
                    path=probe_url,
                    port=container_port
                ),
                initial_delay_seconds=10,
                period_seconds=10,
                timeout_seconds=20,
                failure_threshold=3,
                success_threshold=1
                )
            container.liveness_probe = client.V1Probe(
                http_get=client.V1HTTPGetAction(
                    path=probe_url,
                    port=container_port
                ),
                initial_delay_seconds=30,
                period_seconds=90,
                timeout_seconds=60,
                failure_threshold=3,
                success_threshold=1
                )
                    
        image_pull_secrets = client.V1LocalObjectReference(name="dp-pull-secret")
        
        # DNS策略：可通过环境变量控制（可选值：ClusterFirst, ClusterFirstWithHostNet, Default, None）
        # 如果不设置环境变量，则使用Kubernetes默认值（ClusterFirst）
        dns_policy = os.getenv("K8S_DNS_POLICY")
        
        # 主机网络：可通过环境变量控制（true/false 或 1/0）
        # 默认为False，表示不使用主机网络
        host_network_str = os.getenv("K8S_HOST_NETWORK", "false").lower()
        host_network = host_network_str in ("true", "1", "yes")
        
        # 构建Pod规格
        pod_spec_kwargs = {
            "containers": [container],
            "image_pull_secrets": [image_pull_secrets],
            "automount_service_account_token": automount_service_account_token,
            "affinity": affinity,
            "host_network": host_network
        }
        # 只有当环境变量设置了dns_policy时才添加该参数，否则使用K8s默认值
        if dns_policy:
            pod_spec_kwargs["dns_policy"] = dns_policy
        
        pod_spec = client.V1PodSpec(**pod_spec_kwargs)

        if volumes:
            pod_spec.volumes = volumes
        if security_context:
            pod_spec.security_context = security_context

        base_labels = k8s_labels.get_service_labels(k8s_uuid, service_type)
        base_labels.update({"app": app_name, "service": service_type})

        deployment = client.V1Deployment(
            metadata=client.V1ObjectMeta(name=name, namespace=namespace,
                                         labels=base_labels),
            spec=client.V1DeploymentSpec(
                replicas=replicas,
                selector=client.V1LabelSelector(match_labels=base_labels),
                template=client.V1PodTemplateSpec(
                    metadata=client.V1ObjectMeta(labels=base_labels, annotations=annotations or {}),
                    spec=pod_spec
                )
            )
        )

        result = await k8s_call(self.apps_v1.create_namespaced_deployment, namespace=namespace, body=deployment)
        logger.info(f"Deployment {name} 创建成功")
        return result

    async def _create_service(self,
                              namespace: str,
                              name: str,
                              app_name: str,
                              container_port: int,
                              node_port: int,
                              service_type: str,
                              is_ssh: Optional[bool] = False,
                              ssh_port: Optional[int] = None,
                              service_spec_type: Optional[str] = "NodePort",
                              extra_ports: Optional[List[client.V1ServicePort]] = None) -> client.V1Service:

        service_spec_type = service_spec_type or "NodePort"
        """创建Service"""
        # 处理Service端口
        service_ports = [client.V1ServicePort(
            name="http",
            protocol="TCP",
            port=container_port,
            target_port=container_port,
            node_port=node_port
        )]

        # SSH
        if is_ssh:
            service_ports.append(client.V1ServicePort(
                        name="ssh",
                        protocol="TCP",
                        port=22,
                        target_port=22,
                        node_port=ssh_port
                    ))

        if extra_ports:
            service_ports.extend(extra_ports)

        service = client.V1Service(
            metadata=client.V1ObjectMeta(name=name, namespace=namespace),
            spec=client.V1ServiceSpec(
                selector={"app": app_name, "service": service_type},
                ports=service_ports,
                type=service_spec_type
            )
        )

        try:
            result = await k8s_call(self.v1.create_namespaced_service, namespace=namespace, body=service)
            logger.info(f"Service {name} 创建成功")
            return result
        except client.exceptions.ApiException as e:
            if e.status == 409:
                logger.error(f"Service {name} 已存在")
                return await k8s_call(self.v1.read_namespaced_service, name=name, namespace=namespace)
            else:
                raise

    async def patch_service_port(
        self,
        name: str,
        namespace: str,
        op: str,
        port_name: str,
        protocol: Optional[str] = None,
        port: Optional[int] = None,
        target_port: Optional[int] = None,
        node_port: Optional[int] = None,
    ) -> client.V1Service:
        """按端口名 patch Service ports 字段。"""
        svc = await k8s_call(self.v1.read_namespaced_service, name=name, namespace=namespace)
        ports = getattr(svc.spec, "ports", None) or []
        index = next((i for i, item in enumerate(ports) if getattr(item, "name", None) == port_name), None)

        if not node_port:
            allocated_ports = await self.get_available_ports(namespace)
            if not allocated_ports:
                raise RuntimeError("未找到可用 NodePort")
            node_port = allocated_ports[0]

        if op == "add":
            if port is None:
                raise ValueError("add 操作必须提供 port")
            value = {
                "name": port_name,
                "protocol": protocol or "TCP",
                "port": port,
                "targetPort": target_port if target_port is not None else port,
            }
            if node_port is not None:
                value["nodePort"] = node_port
            body = [{
                "op": "add",
                "path": "/spec/ports/-",
                "value": value,
            }]
        elif op == "replace":
            if index is None:
                raise ValueError(f"未找到端口: {port_name}")
            if port is None:
                raise ValueError("replace 操作必须提供 port")
            replace_values = {
                "protocol": protocol or "TCP",
                "port": port,
                "targetPort": target_port if target_port is not None else port,
            }
            body = [
                {
                    "op": "replace",
                    "path": f"/spec/ports/{index}/protocol",
                    "value": replace_values["protocol"],
                },
                {
                    "op": "replace",
                    "path": f"/spec/ports/{index}/port",
                    "value": replace_values["port"],
                },
                {
                    "op": "replace",
                    "path": f"/spec/ports/{index}/targetPort",
                    "value": replace_values["targetPort"],
                },
            ]
        elif op == "remove":
            if index is None:
                raise ValueError(f"未找到端口: {port_name}")
            body = [{
                "op": "remove",
                "path": f"/spec/ports/{index}",
            }]
        else:
            raise ValueError("invalid op")

        return await k8s_call(
            self.v1.api_client.call_api,
            resource_path='/api/v1/namespaces/{namespace}/services/{name}',
            method='PATCH',
            path_params={
                'namespace': namespace,
                'name': name
            },
            header_params={
                'Content-Type': 'application/json-patch+json'
            },
            body=body,
            response_type='object',
        )

    async def wait_loadbalancer_ip(self, namespace, name, timeout=60):
        for _ in range(timeout):
            try:
                svc = await k8s_call(self.v1.read_namespaced_service , name=name, namespace=namespace)
                ingress = svc.status.load_balancer.ingress
                if ingress:
                    lb_ip = ingress[0].ip or ingress[0].hostname
                    ports = {}
                    for p in svc.spec.ports:
                        # 按 port 名存
                        ports[p.name] = p.port
                    return lb_ip, ports
            except client.exceptions.ApiException:
                pass
            await asyncio.sleep(1)
        raise TimeoutError(f"LoadBalancer IP for service {name} not ready")

    async def _rollback_resources(self, namespace: str, app_name: str,
                                  config_maps: Optional[Dict[str, Dict[str, str]]]):
        """回滚资源"""
        logger.info(f"开始回滚应用 {app_name} 的资源...")
        try:
            # 删除Service
            try:
                await k8s_call(self.v1.delete_namespaced_service,
                    namespace=namespace,
                    name=f"{app_name}-service"
                )
                logger.info(f"Service {app_name}-service 删除成功")
            except:
                pass

            # 删除Deployment
            try:
                await k8s_call(self.apps_v1.delete_namespaced_deployment,
                    namespace=namespace,
                    name=f"{app_name}-deployment"
                )
                logger.info(f"Deployment {app_name}-deployment 删除成功")
            except:
                pass

            # 删除ConfigMaps
            if config_maps:
                for config_map_name in config_maps.keys():
                    try:
                        await k8s_call(self.v1.delete_namespaced_config_map,
                            namespace=namespace,
                            name=config_map_name
                        )
                        logger.info(f"ConfigMap {config_map_name} 删除成功")
                    except:
                        pass

            logger.info("回滚完成")
        except Exception as e:
            logger.error(f"回滚过程中出现错误: {e}")

    async def delete_app(self, namespace: str, app_name: str, config_maps: Optional[List[str]] = None):
        """删除应用"""
        await self._rollback_resources(namespace, app_name,
                                       {name: {} for name in (config_maps or [])})

    async def delete_job(self, namespace: str, job_name: str, config_maps: Optional[List[str]] = None) -> bool:
        """
        删除 Job 并清理相关的 ConfigMap
        
        Args:
            namespace: 命名空间
            job_name: Job 名称
            config_maps: 要清理的 ConfigMap 名称列表（可选，如果不提供则从 Job annotations 中读取）
        
        Returns:
            bool: 是否成功删除
        """
        try:
            # 1. 尝试从 Job annotations 中获取 ConfigMap 列表
            if config_maps is None:
                try:
                    job = await k8s_call(
                        self.batch_v1.read_namespaced_job,
                        name=job_name,
                        namespace=namespace
                    )
                    if job.metadata.annotations:
                        script_configmaps = job.metadata.annotations.get("script-configmaps")
                        if script_configmaps:
                            config_maps = [name.strip() for name in script_configmaps.split(",") if name.strip()]
                except client.exceptions.ApiException as e:
                    if e.status == 404:
                        logger.warning(f"Job {job_name} 不存在，可能已被删除")
                    else:
                        logger.warning(f"读取 Job {job_name} 失败: {e}")

            # 2. 删除 Job
            try:
                await k8s_call(
                    self.batch_v1.delete_namespaced_job,
                    name=job_name,
                    namespace=namespace,
                    propagation_policy="Background"  # 后台删除，包括 Pod
                )
                logger.info(f"Job {job_name} 删除成功")
            except client.exceptions.ApiException as e:
                if e.status == 404:
                    logger.warning(f"Job {job_name} 不存在，可能已被删除")
                else:
                    logger.error(f"删除 Job {job_name} 失败: {e}")
                    raise

            # 3. 清理相关的 ConfigMap
            if config_maps:
                for config_map_name in config_maps:
                    try:
                        await k8s_call(
                            self.v1.delete_namespaced_config_map,
                            name=config_map_name,
                            namespace=namespace
                        )
                        logger.info(f"ConfigMap {config_map_name} 删除成功")
                    except client.exceptions.ApiException as e:
                        if e.status == 404:
                            logger.debug(f"ConfigMap {config_map_name} 不存在，可能已被删除")
                        else:
                            logger.warning(f"删除 ConfigMap {config_map_name} 失败: {e}")
                    except Exception as e:
                        logger.warning(f"删除 ConfigMap {config_map_name} 时发生异常: {e}")

            return True

        except Exception as e:
            logger.error(f"删除 Job {job_name} 时发生错误: {e}", exc_info=True)
            return False

    async def create_ray_job(self, namespace: str, ray_job_name: str, body: Dict[str, Any]) -> Dict[str, Any]:
        """创建 KubeRay RayJob CRD。"""
        await self._delete_ray_job_if_exists(namespace=namespace, ray_job_name=ray_job_name)
        result = await k8s_call(
            self.custom_objects.create_namespaced_custom_object,
            group="ray.io",
            version="v1",
            namespace=namespace,
            plural="rayjobs",
            body=body
        )
        logger.info(f"RayJob {ray_job_name} 创建成功")
        return result

    async def delete_ray_job(self, namespace: str, ray_job_name: str) -> bool:
        """删除 KubeRay RayJob CRD。"""
        try:
            await k8s_call(
                self.custom_objects.delete_namespaced_custom_object,
                group="ray.io",
                version="v1",
                namespace=namespace,
                plural="rayjobs",
                name=ray_job_name,
                propagation_policy="Background"
            )
            logger.info(f"RayJob {ray_job_name} 删除成功")
            return True
        except client.exceptions.ApiException as e:
            if e.status == 404:
                logger.warning(f"RayJob {ray_job_name} 不存在，可能已被删除")
                return True
            logger.error(f"删除 RayJob {ray_job_name} 失败: {e}")
            return False
        except Exception as e:
            logger.error(f"删除 RayJob {ray_job_name} 时发生错误: {e}", exc_info=True)
            return False

    async def _delete_ray_job_if_exists(self, namespace: str, ray_job_name: str) -> None:
        try:
            await k8s_call(
                self.custom_objects.get_namespaced_custom_object,
                group="ray.io",
                version="v1",
                namespace=namespace,
                plural="rayjobs",
                name=ray_job_name
            )
        except client.exceptions.ApiException as e:
            if e.status == 404:
                return
            raise

        await k8s_call(
            self.custom_objects.delete_namespaced_custom_object,
            group="ray.io",
            version="v1",
            namespace=namespace,
            plural="rayjobs",
            name=ray_job_name,
            propagation_policy="Background"
        )
        logger.info(f"命名空间 {namespace} 下已存在 RayJob {ray_job_name}，已先删除")
        for _ in range(30):
            try:
                await k8s_call(
                    self.custom_objects.get_namespaced_custom_object,
                    group="ray.io",
                    version="v1",
                    namespace=namespace,
                    plural="rayjobs",
                    name=ray_job_name
                )
            except client.exceptions.ApiException as e:
                if e.status == 404:
                    return
                raise
            await asyncio.sleep(1)
        logger.warning(f"等待 RayJob {ray_job_name} 删除超时，仍尝试继续创建")

    async def _delete_job_if_exists(self, namespace: str, job_name: str) -> None:
        """
        若该 namespace 下已存在同名 Job，则先删除再返回（便于提交前保证同名 Job 不存在）。
        删除后会轮询等待 Job 资源消失，避免紧接着 create 时仍冲突。
        """
        try:
            await k8s_call(
                self.batch_v1.read_namespaced_job,
                name=job_name,
                namespace=namespace
            )
        except client.exceptions.ApiException as e:
            if e.status == 404:
                return
            raise

        try:
            await k8s_call(
                self.batch_v1.delete_namespaced_job,
                name=job_name,
                namespace=namespace,
                propagation_policy="Background"
            )
            logger.info(f"命名空间 {namespace} 下已存在 Job {job_name}，已先删除")
        except client.exceptions.ApiException as e:
            if e.status == 404:
                return
            raise

        # 等待 Job 从 API 消失后再返回，避免紧接着 create 报已存在
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                await k8s_call(
                    self.batch_v1.read_namespaced_job,
                    name=job_name,
                    namespace=namespace
                )
            except client.exceptions.ApiException as e:
                if e.status == 404:
                    return
                raise
            await asyncio.sleep(1)

        logger.warning(f"等待 Job {job_name} 删除超时，仍尝试继续创建")

    async def build_storage_volumes(self, storage_items: List[Dict], **kwargs):
        volume_mounts = []
        volumes_dict = {}

        for item in storage_items:
            volume_name = item["name"]

            # 支持自定义挂载（用于 ML 模型等）：直接提供 sub_path 与 mount_path，不依赖 enum
            if item.get("custom_sub_path") is not None and item.get("custom_mount_path") is not None:
                sub_path = item["custom_sub_path"].strip("/")
                mount_path = item["custom_mount_path"]
                volume_mounts.append(
                    client.V1VolumeMount(
                        name=volume_name,
                        mount_path=mount_path,
                        sub_path=sub_path
                    )
                )
                if volume_name not in volumes_dict:
                    volumes_dict[volume_name] = client.V1Volume(
                        name=volume_name,
                        persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                            claim_name=volume_name
                        )
                    )
                continue

            sp_enum = item["enum"]
            # 获取 sub_path：如果 sp_enum 有 get_sub_path 方法则调用，否则从 PathConfig.storage_path 中提取
            if hasattr(sp_enum, 'get_sub_path'):
                sub_path = sp_enum.get_sub_path(**kwargs)
            else:
                # PathConfig 对象：从 storage_path 中提取子路径（去除第一级路径，即命名空间）
                storage_path = sp_enum.storage_path
                # 移除开头的斜杠
                if storage_path.startswith('/'):
                    storage_path = storage_path[1:]
                # 分割路径
                path_parts = storage_path.split('/')
                # 如果路径只有一级或为空，返回空字符串
                if len(path_parts) <= 1:
                    sub_path = ""
                else:
                    # 返回除第一级外的所有路径
                    sub_path = '/'.join(path_parts[1:])

            # 组装volume_mounts
            volume_mounts.append(
                client.V1VolumeMount(
                    name=volume_name,
                    mount_path=sp_enum.mount_path,
                    sub_path=sub_path
                )
            )
            # 组装volume
            if volume_name not in volumes_dict:
                volumes_dict[volume_name] = client.V1Volume(
                    name=volume_name,
                    persistent_volume_claim=client.V1PersistentVolumeClaimVolumeSource(
                        claim_name=volume_name
                    )
                )

        return volume_mounts, list(volumes_dict.values())

    async def get_available_ports(self, namespace: str, count: int = 1) -> list[int]:
        start_port = int(os.getenv('START_PORT', 30000))
        end_port = int(os.getenv('END_PORT', 31000))
        """获取可用的NodePort端口"""
        try:
            # 获取整个集群中所有Service（NodePort是全局的）
            services = await k8s_call(self.v1.list_service_for_all_namespaces)

            # 收集已使用的端口
            used_ports = set()
            for service in services.items:
                if service.spec.ports and service.spec.type == "NodePort":
                    for port in service.spec.ports:
                        if port.node_port:
                            used_ports.add(port.node_port)

            # 查找可用端口
            available_ports = []
            for port in range(start_port, end_port + 1):
                if port not in used_ports:
                    available_ports.append(port)
                    if len(available_ports) >= count:
                        logger.info(f"找到可用端口: {available_ports}")
                        return available_ports

            # 没找到足够的端口
            raise RuntimeError(f"在端口范围 {start_port}-{end_port} 内没有找到 {count} 个可用端口")

        except Exception as e:
            logger.error(f"获取可用端口失败: {e}")
            return []

    async def create_job(self,
                         namespace: str,
                         job_name: str,
                         image: str,
                         service_type: str,
                         command: Optional[List[str]] = None,
                         args: Optional[List[str]] = None,
                         cpu_limit: Optional[str] = "16",
                         memory_limit: Optional[str] = "16Gi",
                         cpu_request: Optional[str] = "0.5",
                         memory_request: Optional[str] = "0.5Gi",
                         gpu_type: Optional[str] = None,
                         gpu_count: str = "1",
                         env_vars: Optional[Dict[str, str]] = None,
                         volume_mounts: Optional[List[client.V1VolumeMount]] = None,
                         volumes: Optional[List[client.V1Volume]] = None,
                         working_dir: Optional[str] = None,
                         security_context: Optional[client.V1PodSecurityContext] = None,
                         automount_service_account_token: bool = False,
                         backoff_limit: int = 0,
                         active_deadline_seconds: Optional[int] = None,
                         ttl_seconds_after_finished: Optional[int] = 43200,  # 12小时
                         k8s_uuid: str = None,
                         affinity: Optional[Union[dict, client.V1Affinity]] = None,
                         script_configs: Optional[Dict[str, Dict[str, str]]] = None) -> client.V1Job:
        """
        创建一次性训练任务的 Job
        
        Args:
            namespace: 命名空间
            job_name: Job名称
            image: 容器镜像
            service_type: 服务类型
            command: 容器启动命令
            args: 容器启动参数
            cpu_limit: CPU限制
            memory_limit: 内存限制
            cpu_request: CPU请求
            memory_request: 内存请求
            gpu_type: GPU类型
            gpu_count: GPU数量
            env_vars: 环境变量
            volume_mounts: 卷挂载列表
            volumes: 卷列表
            working_dir: 工作目录
            security_context: Pod安全上下文
            automount_service_account_token: 是否自动挂载服务账户令牌
            backoff_limit: 重试次数
            active_deadline_seconds: 任务超时时间（秒）
            ttl_seconds_after_finished: 任务完成后保留时间（秒）
            k8s_uuid: K8s UUID
            affinity: 节点亲和性配置
            script_configs: 脚本挂载配置，格式：
                {
                    "config_map_name": {
                        "script_path": "app/scripts/inference.py",  # 项目相对路径
                        "mount_path": "/scripts",  # 容器内挂载目录
                        "file_name": "inference.py"  # 挂载后的文件名
                    }
                }
        
        Returns:
            client.V1Job: 创建的Job对象
        """
        # 构建资源限制
        limits = {}
        requests = {}

        # 只有当参数不为None时才添加资源限制
        requests["cpu"] = cpu_request or "0.5"
        limits["cpu"] = cpu_limit or "16"
        requests["memory"] = normalize_memory(memory_request, "0.5Gi")
        limits["memory"] = normalize_memory(memory_limit, "16Gi")

        # 统一设置共享内存为内存限制值
        volume_mounts, volumes = add_shm_if_missing(volume_mounts=volume_mounts, volumes=volumes,
                                                    size_gb=limits["memory"])

        if gpu_type:
            limits[gpu_type] = gpu_count

        # 处理脚本挂载配置
        script_volume_mounts = []
        script_volumes = []
        created_config_maps = []
        
        if script_configs:
            try:
                for config_map_name, script_config in script_configs.items():
                    script_path = script_config.get("script_path")
                    mount_path = script_config.get("mount_path")
                    file_name = script_config.get("file_name")
                    
                    if not script_path or not mount_path or not file_name:
                        raise ValueError(
                            f"脚本配置不完整: {config_map_name}, "
                            f"需要 script_path, mount_path, file_name"
                        )
                    
                    # 读取脚本文件内容
                    script_content = self._load_script_from_project(script_path)
                    
                    # 创建 ConfigMap
                    config_map_data = {file_name: script_content}
                    config_map = await self._create_config_map(
                        namespace=namespace,
                        name=config_map_name,
                        data=config_map_data
                    )
                    created_config_maps.append(config_map_name)
                    logger.info(
                        f"为Job {job_name} 创建脚本ConfigMap: {config_map_name}, "
                        f"脚本路径: {script_path}, 挂载路径: {mount_path}/{file_name}"
                    )
                    
                    # 创建 VolumeMount
                    volume_mount = client.V1VolumeMount(
                        name=config_map_name,
                        mount_path=mount_path,
                        read_only=True  # 脚本文件通常只读
                    )
                    script_volume_mounts.append(volume_mount)
                    
                    # 创建 Volume
                    volume = client.V1Volume(
                        name=config_map_name,
                        config_map=client.V1ConfigMapVolumeSource(name=config_map_name)
                    )
                    script_volumes.append(volume)
                    
            except Exception as e:
                logger.error(f"处理脚本挂载配置失败: {e}", exc_info=True)
                # 清理已创建的 ConfigMap
                for cm_name in created_config_maps:
                    try:
                        await k8s_call(
                            self.v1.delete_namespaced_config_map,
                            name=cm_name,
                            namespace=namespace
                        )
                        logger.info(f"已清理ConfigMap: {cm_name}")
                    except Exception as cleanup_e:
                        logger.warning(f"清理ConfigMap失败: {cm_name}, {cleanup_e}")
                raise

        # 合并卷挂载和卷（脚本挂载 + 用户提供的）
        final_volume_mounts = (volume_mounts or []) + script_volume_mounts
        final_volumes = (volumes or []) + script_volumes

        # 环境变量
        env_list = []
        if env_vars:
            for key, value in env_vars.items():
                env_list.append(client.V1EnvVar(name=key, value=value))

        # 镜像拉取策略：可通过环境变量控制
        image_pull_policy = os.getenv("K8S_IMAGE_PULL_POLICY", "Always")

        container = client.V1Container(
            name=job_name,
            image=image,
            image_pull_policy=image_pull_policy
        )

        # 只有当limits或requests不为空时才设置资源限制
        if limits or requests:
            container.resources = client.V1ResourceRequirements(limits=limits, requests=requests)
        if command:
            container.command = command
        if args:
            container.args = args
        if env_list:
            container.env = env_list
        if final_volume_mounts:
            container.volume_mounts = final_volume_mounts
        if working_dir:
            container.working_dir = working_dir

        image_pull_secrets = client.V1LocalObjectReference(name="dp-pull-secret")
        
        # DNS策略：可通过环境变量控制（可选值：ClusterFirst, ClusterFirstWithHostNet, Default, None）
        # 如果不设置环境变量，则使用Kubernetes默认值（ClusterFirst）
        dns_policy = os.getenv("K8S_DNS_POLICY")
        
        # 主机网络：可通过环境变量控制（true/false 或 1/0）
        # 默认为False，表示不使用主机网络
        host_network_str = os.getenv("K8S_HOST_NETWORK", "false").lower()
        host_network = host_network_str in ("true", "1", "yes")
        
        # 构建Pod规格
        pod_spec_kwargs = {
            "containers": [container],
            "image_pull_secrets": [image_pull_secrets],
            "restart_policy": "Never",  # Job使用Never重启策略
            "volumes": final_volumes if final_volumes else None,
            "security_context": security_context,
            "automount_service_account_token": automount_service_account_token,
            "affinity": affinity,
            "host_network": host_network
        }
        # 只有当环境变量设置了dns_policy时才添加该参数，否则使用K8s默认值
        if dns_policy:
            pod_spec_kwargs["dns_policy"] = dns_policy
        
        pod_spec = client.V1PodSpec(**pod_spec_kwargs)
        base_labels = k8s_labels.get_service_labels(k8s_uuid, service_type)
        base_labels.update({"app": job_name, "service": service_type})

        template = client.V1PodTemplateSpec(
            metadata=client.V1ObjectMeta(labels=base_labels),
            spec=pod_spec
        )

        job_spec = client.V1JobSpec(
            template=template,
            backoff_limit=backoff_limit
        )
        if active_deadline_seconds is not None:
            job_spec.active_deadline_seconds = active_deadline_seconds
        if ttl_seconds_after_finished is not None:
            job_spec.ttl_seconds_after_finished = ttl_seconds_after_finished

        # 构建 Job metadata，包含脚本 ConfigMap 信息（用于后续清理）
        job_annotations = {}
        if script_configs:
            # 将 ConfigMap 名称列表保存到 annotations 中，用于后续清理
            config_map_names = list(script_configs.keys())
            job_annotations["script-configmaps"] = ",".join(config_map_names)
        
        job = client.V1Job(
            metadata=client.V1ObjectMeta(
                name=job_name,
                namespace=namespace,
                annotations=job_annotations if job_annotations else None
            ),
            spec=job_spec
        )

        await self._delete_job_if_exists(namespace=namespace, job_name=job_name)
        result = self.batch_v1.create_namespaced_job(namespace=namespace, body=job)
        logger.info(f"Job {job_name} 创建成功")
        return result

    async def create_multi_container_job(self,
                                         namespace: str,
                                         job_name: str,
                                         containers_config: List[Dict[str, Any]],
                                         service_type: str,
                                         volume_mounts: Optional[List[client.V1VolumeMount]] = None,
                                         volumes: Optional[List[client.V1Volume]] = None,
                                         security_context: Optional[client.V1PodSecurityContext] = None,
                                         automount_service_account_token: bool = False,
                                         backoff_limit: int = 0,
                                         active_deadline_seconds: Optional[int] = None,
                                         ttl_seconds_after_finished: Optional[int] = 43200,
                                         k8s_uuid: str = None,
                                         affinity: Optional[Union[dict, client.V1Affinity]] = None) -> client.V1Job:
        """
        创建包含多个容器的 Job（用于并行执行多个任务）
        
        Args:
            namespace: 命名空间
            job_name: Job名称
            containers_config: 容器配置列表，每个元素包含：
                - name: 容器名称
                - image: 容器镜像
                - command: 容器启动命令（可选）
                - args: 容器启动参数（可选）
                - env_vars: 环境变量字典（可选）
                - cpu_limit: CPU限制（可选）
                - memory_limit: 内存限制（可选）
                - cpu_request: CPU请求（可选）
                - memory_request: 内存请求（可选）
                - gpu_type: GPU类型（可选）
                - gpu_count: GPU数量（可选，默认"1"）
                - working_dir: 工作目录（可选）
            service_type: 服务类型
            volume_mounts: 卷挂载列表（所有容器共享）
            volumes: 卷列表（所有容器共享）
            security_context: Pod安全上下文
            automount_service_account_token: 是否自动挂载服务账户令牌
            backoff_limit: 重试次数
            active_deadline_seconds: 任务超时时间（秒）
            ttl_seconds_after_finished: 任务完成后保留时间（秒）
            k8s_uuid: K8s UUID
            affinity: 节点亲和性配置
        
        Returns:
            client.V1Job: 创建的Job对象
        """
        if not containers_config or len(containers_config) == 0:
            raise ValueError("至少需要提供一个容器配置")
        
        # 镜像拉取策略
        image_pull_policy = os.getenv("K8S_IMAGE_PULL_POLICY", "Always")
        
        # 构建容器列表
        container_list = []
        for container_config in containers_config:
            container_name = container_config.get("name")
            image = container_config.get("image")
            command = container_config.get("command")
            args = container_config.get("args")
            env_vars = container_config.get("env_vars", {})
            cpu_limit = container_config.get("cpu_limit", "16")
            memory_limit = normalize_memory(container_config.get("memory_limit"), "16Gi")
            cpu_request = container_config.get("cpu_request", "0.5")
            memory_request = normalize_memory(container_config.get("memory_request"), "0.5Gi")
            gpu_type = container_config.get("gpu_type")
            gpu_count = container_config.get("gpu_count", "1")
            working_dir = container_config.get("working_dir")
            
            if not container_name or not image:
                raise ValueError(f"容器配置必须包含 name 和 image: {container_config}")
            
            # 构建资源限制
            limits = {}
            requests = {}
            if cpu_limit is not None:
                limits["cpu"] = cpu_limit
            if memory_limit is not None:
                limits["memory"] = memory_limit

                # 统一设置共享内存为内存限制值
                volume_mounts, volumes = add_shm_if_missing(volume_mounts=volume_mounts, volumes=volumes, size_gb=limits["memory"])
            if cpu_request is not None:
                requests["cpu"] = cpu_request
            if memory_request is not None:
                requests["memory"] = memory_request
            if gpu_type:
                limits[gpu_type] = gpu_count
            
            # 构建环境变量
            env_list = []
            if env_vars:
                for key, value in env_vars.items():
                    env_list.append(client.V1EnvVar(name=key, value=value))
            
            # 创建容器
            container = client.V1Container(
                name=container_name,
                image=image,
                image_pull_policy=image_pull_policy
            )
            
            if limits or requests:
                container.resources = client.V1ResourceRequirements(limits=limits, requests=requests)
            if command:
                container.command = command
            if args:
                container.args = args
            if env_list:
                container.env = env_list
            if volume_mounts:
                container.volume_mounts = volume_mounts
            if working_dir:
                container.working_dir = working_dir
            
            container_list.append(container)
        
        # 构建 Pod Spec
        image_pull_secrets = client.V1LocalObjectReference(name="dp-pull-secret")
        
        # DNS策略：可通过环境变量控制（可选值：ClusterFirst, ClusterFirstWithHostNet, Default, None）
        # 如果不设置环境变量，则使用Kubernetes默认值（ClusterFirst）
        dns_policy = os.getenv("K8S_DNS_POLICY")
        
        # 主机网络：可通过环境变量控制（true/false 或 1/0）
        # 默认为False，表示不使用主机网络
        host_network_str = os.getenv("K8S_HOST_NETWORK", "false").lower()
        host_network = host_network_str in ("true", "1", "yes")
        
        # 构建Pod规格
        pod_spec_kwargs = {
            "containers": container_list,
            "image_pull_secrets": [image_pull_secrets],
            "restart_policy": "Never",
            "volumes": volumes if volumes else None,
            "security_context": security_context,
            "automount_service_account_token": automount_service_account_token,
            "affinity": affinity,
            "host_network": host_network
        }
        # 只有当环境变量设置了dns_policy时才添加该参数，否则使用K8s默认值
        if dns_policy:
            pod_spec_kwargs["dns_policy"] = dns_policy
        
        pod_spec = client.V1PodSpec(**pod_spec_kwargs)
        
        # 构建标签
        base_labels = k8s_labels.get_service_labels(k8s_uuid, service_type)
        base_labels.update({"app": job_name, "service": service_type})
        
        template = client.V1PodTemplateSpec(
            metadata=client.V1ObjectMeta(labels=base_labels),
            spec=pod_spec
        )
        
        job_spec = client.V1JobSpec(
            template=template,
            backoff_limit=backoff_limit
        )
        if active_deadline_seconds is not None:
            job_spec.active_deadline_seconds = active_deadline_seconds
        if ttl_seconds_after_finished is not None:
            job_spec.ttl_seconds_after_finished = ttl_seconds_after_finished
        
        job = client.V1Job(
            metadata=client.V1ObjectMeta(
                name=job_name,
                namespace=namespace
            ),
            spec=job_spec
        )

        await self._delete_job_if_exists(namespace=namespace, job_name=job_name)
        result = self.batch_v1.create_namespaced_job(namespace=namespace, body=job)
        logger.info(f"多容器Job {job_name} 创建成功，包含 {len(container_list)} 个容器")
        return result

    async def create_job_with_init_container(
        self,
        namespace: str,
        job_name: str,
        init_container_config: Dict[str, Any],
        main_container_config: Dict[str, Any],
        service_type: str,
        volume_mounts: Optional[List[client.V1VolumeMount]] = None,
        volumes: Optional[List[client.V1Volume]] = None,
        service_account_name: Optional[str] = None,
        security_context: Optional[client.V1PodSecurityContext] = None,
        automount_service_account_token: bool = True,
        backoff_limit: int = 0,
        active_deadline_seconds: Optional[int] = None,
        ttl_seconds_after_finished: Optional[int] = 43200,
        k8s_uuid: str = None,
        affinity: Optional[Union[dict, client.V1Affinity]] = None,
        config_maps: Optional[Dict[str, Dict[str, str]]] = None
    ) -> client.V1Job:
        """
        创建包含 init container 和 main container 的 Job
        
        Args:
            namespace: 命名空间
            job_name: Job名称
            init_container_config: Init container 配置字典，包含：
                - name: 容器名称（必需）
                - image: 容器镜像（必需）
                - command: 容器启动命令（可选，List[str]）
                - args: 容器启动参数（可选，List[str]）
                - env_vars: 环境变量字典（可选）
                - volume_mounts: 卷挂载列表（可选）
                - cpu_limit: CPU限制（可选）
                - memory_limit: 内存限制（可选）
                - cpu_request: CPU请求（可选）
                - memory_request: 内存请求（可选）
                - working_dir: 工作目录（可选）
                - security_context: 安全上下文（可选）
            main_container_config: Main container 配置字典，包含：
                - name: 容器名称（必需）
                - image: 容器镜像（必需）
                - command: 容器启动命令（可选，List[str]）
                - args: 容器启动参数（可选，List[str]）
                - env_vars: 环境变量字典（可选）
                - volume_mounts: 卷挂载列表（可选）
                - cpu_limit: CPU限制（可选）
                - memory_limit: 内存限制（可选）
                - cpu_request: CPU请求（可选）
                - memory_request: 内存请求（可选）
                - gpu_type: GPU类型（可选）
                - gpu_count: GPU数量（可选，默认"1"）
                - working_dir: 工作目录（可选）
                - security_context: 安全上下文（可选）
            service_type: 服务类型
            volume_mounts: 卷挂载列表（如果容器配置中没有指定，会使用这个）
            volumes: 卷列表
            service_account_name: 服务账户名称
            security_context: Pod安全上下文
            automount_service_account_token: 是否自动挂载服务账户令牌
            backoff_limit: 重试次数
            active_deadline_seconds: 任务超时时间（秒）
            ttl_seconds_after_finished: 任务完成后保留时间（秒）
            k8s_uuid: K8s UUID
            affinity: 节点亲和性配置
            config_maps：配置configmap

        Returns:
            client.V1Job: 创建的Job对象
        """
        image_pull_policy = os.getenv("K8S_IMAGE_PULL_POLICY", "Always")

        # 创建 ConfigMaps (如果有)
        if config_maps:
            for config_map_name, config_data in config_maps.items():
                config_map = await self._create_config_map(namespace, config_map_name, config_data)

        # 构建 init container
        init_name = init_container_config.get("name")
        init_image = init_container_config.get("image")
        if not init_name or not init_image:
            raise ValueError("init_container_config 必须包含 name 和 image")
        
        # Init container 资源限制
        init_limits = {}
        init_requests = {}

        init_requests["cpu"] = init_container_config.get("cpu_request", "0.5")
        init_limits["cpu"] = init_container_config.get("cpu_limit", "16")
        init_requests["memory"] = normalize_memory(init_container_config.get("memory_request"), "0.5Gi")
        init_limits["memory"] = normalize_memory(init_container_config.get("memory_limit"), "16Gi")

        # Init container 环境变量
        init_env_list = []
        if init_container_config.get("env_vars"):
            for key, value in init_container_config["env_vars"].items():
                init_env_list.append(client.V1EnvVar(name=key, value=value))
        
        # Init container volume mounts（优先使用配置中的，否则使用传入的）
        init_volume_mounts = init_container_config.get("volume_mounts") or volume_mounts or []
        
        init_container = client.V1Container(
            name=init_name,
            image=init_image,
            image_pull_policy=image_pull_policy
        )
        
        if init_container_config.get("command"):
            init_container.command = init_container_config["command"]
        if init_container_config.get("args"):
            init_container.args = init_container_config["args"]
        if init_env_list:
            init_container.env = init_env_list
        if init_volume_mounts:
            init_container.volume_mounts = init_volume_mounts
        if init_container_config.get("working_dir"):
            init_container.working_dir = init_container_config["working_dir"]
        if init_limits or init_requests:
            init_container.resources = client.V1ResourceRequirements(
                limits=init_limits if init_limits else None,
                requests=init_requests if init_requests else None
            )
        if init_container_config.get("security_context"):
            init_container.security_context = init_container_config["security_context"]
        
        # 构建 main container
        main_name = main_container_config.get("name")
        main_image = main_container_config.get("image")
        if not main_name or not main_image:
            raise ValueError("main_container_config 必须包含 name 和 image")
        
        # Main container 资源限制
        main_limits = {}
        main_requests = {}

        main_limits["memory"] = main_container_config.get("memory_limit")
        main_limits["cpu"] = main_container_config.get("cpu_limit", )
        main_requests["cpu"] = main_container_config.get("cpu_request")
        main_requests["memory"] = main_container_config.get("memory_request")
        if main_container_config.get("gpu_type"):
            main_limits[main_container_config["gpu_type"]] = main_container_config.get("gpu_count", "1")
        
        # Main container 环境变量
        main_env_list = []
        if main_container_config.get("env_vars"):
            for key, value in main_container_config["env_vars"].items():
                main_env_list.append(client.V1EnvVar(name=key, value=value))
        
        # Main container volume mounts（优先使用配置中的，否则使用传入的）
        main_volume_mounts = main_container_config.get("volume_mounts") or volume_mounts or []
        
        main_container = client.V1Container(
            name=main_name,
            image=main_image,
            image_pull_policy=image_pull_policy
        )
        
        if main_container_config.get("command"):
            main_container.command = main_container_config["command"]
        if main_container_config.get("args"):
            main_container.args = main_container_config["args"]
        if main_env_list:
            main_container.env = main_env_list
        if main_volume_mounts:
            main_container.volume_mounts = main_volume_mounts
        if main_container_config.get("working_dir"):
            main_container.working_dir = main_container_config["working_dir"]
        if main_limits or main_requests:
            main_container.resources = client.V1ResourceRequirements(
                limits=main_limits if main_limits else None,
                requests=main_requests if main_requests else None
            )
        if main_container_config.get("security_context"):
            main_container.security_context = main_container_config["security_context"]

        # 构建 PodSpec
        image_pull_secrets = client.V1LocalObjectReference(name="dp-pull-secret")
        pod_spec = client.V1PodSpec(
            init_containers=[init_container],
            containers=[main_container],
            volumes=volumes if volumes else None,
            restart_policy="Never",
            image_pull_secrets=[image_pull_secrets],
            security_context=security_context,
            automount_service_account_token=automount_service_account_token,
            affinity=affinity
        )
        
        if service_account_name:
            pod_spec.service_account_name = service_account_name
        
        # 构建标签
        base_labels = k8s_labels.get_service_labels(k8s_uuid, service_type)
        base_labels.update({"app": job_name, "service": service_type})
        template = client.V1PodTemplateSpec(
            metadata=client.V1ObjectMeta(labels=base_labels),
            spec=pod_spec
        )
        
        job_spec = client.V1JobSpec(
            template=template,
            backoff_limit=backoff_limit
        )
        if active_deadline_seconds is not None:
            job_spec.active_deadline_seconds = active_deadline_seconds
        if ttl_seconds_after_finished is not None:
            job_spec.ttl_seconds_after_finished = ttl_seconds_after_finished
        
        job = client.V1Job(
            metadata=client.V1ObjectMeta(
                name=job_name,
                namespace=namespace,
                labels=base_labels
            ),
            spec=job_spec
        )
        
        result = await k8s_call(self.batch_v1.create_namespaced_job, namespace=namespace, body=job)
        logger.info(f"带 Init Container 的 Job {job_name} 创建成功")
        return result

    async def list_deployment_pods(self, namespace: str, app_name: str) -> List[Dict]:
        """
        根据 Deployment 的 selector 查询 Pod 副本列表
        """
        # 读取 Deployment
        deployment_name = f"{app_name}-deployment"
        try:
            deployment = await k8s_call(
                self.apps_v1.read_namespaced_deployment,
                name=deployment_name,
                namespace=namespace
            )
        except client.exceptions.ApiException as e:
            raise RuntimeError(f"Deployment 不存在: {e.reason}")

        # 组装 labelSelector
        selector = deployment.spec.selector.match_labels or {}
        if not selector:
            return []

        label_selector = ",".join(f"{k}={v}" for k, v in selector.items())

        # 查询 Pod
        pod_list = await k8s_call(
            self.v1.list_namespaced_pod,
            namespace=namespace,
            label_selector=label_selector
        )

        # 组织返回结构（Replica View）
        result = []
        # 初始状态启动中
        pod_status = TaskStatus.PREPARING.value
        for pod in pod_list.items:
            # 是否已有容器状态（≈ 是否已经有日志）
            container_statuses = pod.status.container_statuses or []
            if not container_statuses:
                # 连容器都没起，不认为是“有日志的状态”
                continue

            # 1. Running + Pod Ready + 所有容器 Ready => RUNNING
            if pod.status.phase == 'Running':
                conditions = pod.status.conditions or []
                pod_ready = any(
                    c.type == "Ready" and c.status == "True"
                    for c in conditions
                )

                if pod_ready and all(cs.ready for cs in container_statuses):
                    pod_status = TaskStatus.RUNNING.value

            if any(cs.state.waiting and cs.state.waiting.reason in (
                    "CrashLoopBackOff", "Error", "ImagePullBackOff"
            ) for cs in container_statuses):
                pod_status = TaskStatus.FAILED.value
                
            result.append({
                "pod_name": pod.metadata.name,
                "phase": pod_status,
                "node_name": pod.spec.node_name,
                "start_time": pod.status.start_time,
                "containers": [
                    {
                        "name": c.name,
                        "ready": cs.ready if cs else False,
                        "restart_count": cs.restart_count if cs else 0
                    }
                    for c, cs in zip(
                        pod.spec.containers,
                        pod.status.container_statuses or []
                    )
                ]
            })

        return result

    async def read_namespaced_deployment_replicas(self, namespace: str, app_name: str) -> int:
        """
        获取 deployment 副本数

        Args:
            namespace: 命名空间
            app_name: 应用名称

        Returns:
            int: 副本数

        Raises:
            HTTPException: 404 或其他错误
        """
        deployment_name = f"{app_name}-deployment"

        try:
            deployment = await k8s_call(
                self.apps_v1.read_namespaced_deployment,
                name=deployment_name,
                namespace=namespace
            )
            return deployment.spec.replicas

        except client.exceptions.ApiException as e:
            if e.status == 404:
                logger.warning(f"Deployment {deployment_name} 不存在")
                raise HTTPException(status_code=404, detail=f"Deployment {deployment_name} 不存在")
            # 其他 ApiException 统一处理
            logger.error(f"K8s API 错误 [{e.status}]: {e.reason}")
            raise HTTPException(status_code=502, detail=f"K8s API 错误: {e.reason}")

        except Exception as e:
            logger.error(f"获取应用 {app_name} 副本数失败: {e}")
            raise HTTPException(status_code=500, detail=f"获取副本数失败: {str(e)}")


def normalize_memory(value: Optional[Union[str, int, float]], default_value: str) -> str:
    """
    自动为内存值添加单位
    - 纯数字 -> 默认加 Gi
    - 已有单位的保持不变
    - None -> None
    """
    if value is None:
        return default_value

    # 统一转成字符串
    value = str(value).strip()

    if not value:  # 空字符串
        return default_value

    # 如果已经包含非数字字符（除了小数点），认为已有单位
    if re.match(r'^[0-9]+(\.[0-9]+)?\s*[a-zA-Z]+$', value.strip()):
        return value  # 已有单位，保持不变

    # 纯数字，默认添加 Gi
    try:
        float(value)  # 验证是有效数字
        return f"{value}Gi"
    except ValueError:
        # 不是有效数字，返回默认值
        return default_value


def add_shm_if_missing(volume_mounts, volumes, size_gb: str):
    volume_mounts = volume_mounts or []
    volumes = volumes or []
    """如果没有 shm，则添加"""
    has_shm_mount = any(getattr(vm, 'name', None) == 'shm' for vm in volume_mounts)
    has_shm_vol = any(getattr(v, 'name', None) == 'shm' for v in volumes)

    if not has_shm_mount:
        volume_mounts = list(volume_mounts)  # 复制避免修改原列表
        volume_mounts.append(client.V1VolumeMount(name="shm", mount_path="/dev/shm"))

    if not has_shm_vol:
        volumes = list(volumes)
        volumes.append(client.V1Volume(
            name="shm",
            empty_dir=client.V1EmptyDirVolumeSource(medium="Memory", size_limit=f"{size_gb}")
        ))

    return volume_mounts, volumes
