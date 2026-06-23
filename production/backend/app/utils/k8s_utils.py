import base64
import os

import yaml
from kubernetes import client, config
import json
from typing import Optional, Union, Any

from kubernetes.client import ApiException

from app.core.logging import logger
from app.models.models import StorageResource
import ipaddress
from app.utils.k8s_call import get_k8s_api, k8s_call


async def create_harbor_secret(
    harbor_url: str,
    harbor_user_name: str,
    harbor_password: str,
    namespace: str,
    secret_name: str,
    kubeconfig_str: str
) -> bool:
    """
    创建Harbor镜像仓库的Docker registry secret
    
    参数:
        harbor_url: Harbor仓库地址
        harbor_user_name: Harbor用户名
        harbor_password: Harbor密码
        namespace: Kubernetes命名空间
        secret_name: Secret名称
        kubeconfig_str: kubeconfig字符串
        
    返回:
        bool: 创建成功返回True，失败返回False
    """
    try:
        # config.load_kube_config_from_dict(yaml.safe_load(kubeconfig_str))
        config_dict = yaml.safe_load(kubeconfig_str)
        # Create auth string (base64 encoded username:password)
        auth_string = f"{harbor_user_name}:{harbor_password}"
        auth_encoded = base64.b64encode(auth_string.encode()).decode()
        
        # Create Docker config.json format
        docker_config = {
            "auths": {
                harbor_url: {
                    "username": harbor_user_name,
                    "password": harbor_password,
                    "auth": auth_encoded
                }
            }
        }
        
        # Base64 encode the entire config
        docker_config_json = json.dumps(docker_config)
        docker_config_encoded = base64.b64encode(docker_config_json.encode()).decode()

        # v1 = client.CoreV1Api()
        v1 = get_k8s_api(config_dict, client.CoreV1Api)
        # Check if namespace exists
        try:
            await k8s_call(v1.read_namespace,name=namespace)
        except client.exceptions.ApiException as e:
            if e.status == 404:
                await k8s_call(v1.create_namespace,body=client.V1Namespace(metadata=client.V1ObjectMeta(name=namespace,
                                         labels={"app": os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')})))
            else:
                raise e
        
        # Check if secret exists
        secret = client.V1Secret(
            metadata=client.V1ObjectMeta(name=secret_name, namespace=namespace),
            type="kubernetes.io/dockerconfigjson",
            data={".dockerconfigjson": docker_config_encoded}
        )
        
        try:
            await k8s_call(v1.read_namespaced_secret,name=secret_name, namespace=namespace)
            # Secret exists, update it
            await k8s_call(v1.replace_namespaced_secret,name=secret_name, namespace=namespace, body=secret)
            logger.info(f"成功更新Harbor secret '{secret_name}' 在命名空间 '{namespace}'")
        except client.exceptions.ApiException as e:
            if e.status == 404:
                # Secret doesn't exist, create it
                await k8s_call(v1.create_namespaced_secret,namespace=namespace, body=secret)
                logger.info(f"成功创建Harbor secret '{secret_name}' 在命名空间 '{namespace}'")
            else:
                raise e
        return True
        
    except Exception as e:
        logger.error(f"Error creating harbor secret: {e}")
        return False
    
async def create_storage_secret(
    kubeconfig_str: str, 
    namespace: str, 
    metaurl: str, 
    storage: StorageResource,
    secret_name: str = "juicefs-secret"
) -> bool:
    """
    创建JuiceFS存储的Kubernetes Secret
    
    参数:
        kubeconfig_str: kubeconfig字符串
        namespace: Kubernetes命名空间
        metaurl: MySQL元数据库连接地址
        storage: 存储资源对象
        secret_name: Secret名称，默认为"juicefs-secret"
        
    返回:
        bool: 创建成功返回True，失败返回False
    """
    try:
        config.load_kube_config_from_dict(yaml.safe_load(kubeconfig_str))
        v1 = client.CoreV1Api()
        
        # Check if namespace exists
        try:
            v1.read_namespace(name=namespace)
        except client.exceptions.ApiException as e:
            if e.status == 404:
                v1.create_namespace(body=client.V1Namespace(metadata=client.V1ObjectMeta(name=namespace)))
            else:
                raise e
        
        # Extract configuration from storage resource
        config_data = storage.config or {}

        if storage.type in ("MINIO", "TOS", "EOS"):
            # Validate required configuration fields
            required_fields = ['access_key', 'secret_key', 'endpoint', 'bucket']
            for field in required_fields:
                if field not in config_data or not config_data[field]:
                    logger.error(f"Missing required configuration field: {field}")
                    return False
        elif storage.type == "NFS":
            # Validate required configuration fields
            required_fields = ['endpoint', 'remote_path']
            for field in required_fields:
                if field not in config_data or not config_data[field]:
                    logger.error(f"Missing required configuration field: {field}")
                    return False
        elif storage.type == "OBS":
            # Validate required configuration fields
            required_fields = ['access_key', 'secret_key', 'region', 'bucket']
            for field in required_fields:
                if field not in config_data or not config_data[field]:
                    logger.error(f"Missing required configuration field: {field}")
                    return False

        if storage.type == "MINIO":
            endpoint = await build_url_with_protocol(config_data["endpoint"])
            bucket = endpoint + '/' + config_data["bucket"]
        elif storage.type == "TOS":
            bucket = config_data["bucket"] + '.' + config_data["endpoint"]
        elif storage.type == "EOS":
            bucket = await build_url_with_protocol(f'{config_data["bucket"]}.{config_data["endpoint"]}')
        elif storage.type == "NFS":
            bucket = config_data["endpoint"] + ':' + config_data["remote_path"]
        elif storage.type == "OBS":
            bucket = f'https://{config_data["bucket"]}.obs.{config_data["region"]}.myhuaweicloud.com'
        else:
            bucket = config_data["endpoint"]
        # Build secret string data
        secret_string_data = {
            "name": "juicefs-vol",  # 固定值
            # "access-key": config_data["access_key"],
            # "secret-key": config_data["secret_key"],
            "metaurl": metaurl,
            "storage": storage.type.lower(),  # 转换为小写
            "bucket": bucket
        }
        # 对象存储需要写入访问凭证（MINIO/TOS/OBS）
        if storage.type in ("MINIO", "TOS", "OBS", "EOS"):
            secret_string_data['access-key'] = config_data["access_key"]
            secret_string_data['secret-key'] = config_data["secret_key"]

        
        # Check if secret exists
        secret = client.V1Secret(
            metadata=client.V1ObjectMeta(name=secret_name, namespace=namespace),
            type="Opaque",
            string_data=secret_string_data
        )
        
        try:
            v1.read_namespaced_secret(name=secret_name, namespace=namespace)
            # Secret exists, update it
            v1.replace_namespaced_secret(name=secret_name, namespace=namespace, body=secret)
            logger.info(f"成功更新JuiceFS secret '{secret_name}' 在命名空间 '{namespace}'")
        except client.exceptions.ApiException as e:
            if e.status == 404:
                # Secret doesn't exist, create it
                v1.create_namespaced_secret(namespace=namespace, body=secret)
                logger.info(f"成功创建JuiceFS secret '{secret_name}' 在命名空间 '{namespace}'")
            else:
                raise e
        
        return True
        
    except Exception as e:
        logger.error(f"Error creating JuiceFS secret: {e}")
        return False


async def create_storageclass(
    kubeconfig_str: str, 
    namespace: str, 
) -> bool:
    """
    创建JuiceFS的Kubernetes StorageClass
    
    参数:
        kubeconfig_str: kubeconfig字符串
        namespace: Kubernetes命名空间
        metaurl: MySQL元数据库连接地址 (用于保持接口一致性)
        storage: 存储资源对象 (用于保持接口一致性)
        
    返回:
        bool: 创建成功返回True，失败返回False
    """
    try:
        config.load_kube_config_from_dict(yaml.safe_load(kubeconfig_str))
        storage_v1 = client.StorageV1Api()
        storageclass_name = "juicefs-sc"
        # 检查StorageClass是否已存在
        try:
            storage_v1.read_storage_class(name=storageclass_name)
            logger.info(f"StorageClass '{storageclass_name}' already exists")
            return True
        except client.exceptions.ApiException as e:
            if e.status != 404:
                raise e
        
        # 创建StorageClass配置
        # pathPattern是必须的，否则动态挂载时只读模式会报错
        storageclass = client.V1StorageClass(
            metadata=client.V1ObjectMeta(name=storageclass_name),
            provisioner="csi.juicefs.com",
            parameters={
                "csi.storage.k8s.io/provisioner-secret-name": "juicefs-secret",
                "csi.storage.k8s.io/provisioner-secret-namespace": namespace,
                "csi.storage.k8s.io/node-publish-secret-name": "juicefs-secret",
                "csi.storage.k8s.io/node-publish-secret-namespace": namespace,
                "pathPattern": "${.PVC.labels.path}"
            },
            reclaim_policy="Retain"
        )
        
        # 创建StorageClass
        storage_v1.create_storage_class(body=storageclass)
        logger.info(f"Successfully created StorageClass '{storageclass_name}' with namespace '{namespace}'")
        
        return True
        
    except Exception as e:
        logger.error(f"Error creating StorageClass: {e}")
        return False

def build_node_affinity(
    card_model: Optional[Union[str, Any]] = None,
    card_memory: Optional[str] = None,
    category: Optional[str] = None
) -> Optional[client.V1Affinity]:
    """
    构建 K8s 节点亲和性配置
    
    根据显卡型号和显存大小构建节点选择器，确保 Pod 调度到匹配的节点上。
    
    参数:
        card_model: 显卡型号（字符串或枚举值，如 "A800" 或 CardModel.A800）
        card_memory: 显存大小（字符串，如 "80GB"、"32GB"）
        category: 卡类型（字符串，如 "GPU"、"NPU"）

    返回:
        client.V1Affinity: 如果没有任何亲和规则则返回 None，否则返回 V1Affinity 对象
    
    示例:
        >>> # 使用字符串
        >>> affinity = build_node_affinity(card_model="A800", card_memory="80GB", card_category="GPU"))
        >>> 
        >>> # 使用枚举值
        >>> from app.schemas.repository_image import CardModel
        >>> affinity = build_node_affinity(card_model=CardModel.A800, card_memory="80GB")
        >>> 
        >>> # 使用 GraphicsCardResourceConfig
        >>> from app.schemas.resource_config import GraphicsCardResourceConfig
        >>> config = GraphicsCardResourceConfig(...)
        >>> affinity = build_node_affinity(
        ...     card_model=config.card_model.value if config.card_model else None,
        ...     card_memory=config.card_memory
        ... )
    """
    node_selector_terms = []
    
    # 处理 card_model
    if card_model:
        # 如果是枚举值，获取其 value 属性
        model_value = card_model.value if hasattr(card_model, 'value') else str(card_model)
        if model_value:
            node_selector_terms.append(client.V1NodeSelectorTerm(
                match_expressions=[client.V1NodeSelectorRequirement(
                    key="dp_graphics_card_model",  # 型号
                    operator="In",
                    values=[model_value]
                )]
            ))
    
    # 处理 card_memory
    if card_memory:
        node_selector_terms.append(client.V1NodeSelectorTerm(
            match_expressions=[client.V1NodeSelectorRequirement(
                key="dp_graphics_card_memory",  # 显存
                operator="In",
                values=[card_memory]
            )]
        ))

    if category:
        node_selector_terms.append(client.V1NodeSelectorTerm(
            match_expressions=[client.V1NodeSelectorRequirement(
                key="dp_graphics_card_category",  #卡类型
                operator="In",
                values=[category]
            )]
        ))
    
    # 如果没有任何亲和规则，直接返回 None
    if not node_selector_terms:
        return None
    
    affinity = client.V1Affinity(
        node_affinity=client.V1NodeAffinity(
            required_during_scheduling_ignored_during_execution=client.V1NodeSelector(
                node_selector_terms=node_selector_terms
            )
        )
    )
    return affinity


async def build_url_with_protocol(endpoint: str) -> str:
    # 拆分主机与端口
    host, *port = endpoint.rsplit(':', 1)
    port = f':{port[0]}' if port else ''

    try:
        # 判断主机部分是 IPv4 还是 IPv6 还是域名
        ipaddress.ip_address(host.strip('[]'))  # [] 去掉 IPv6 的括号
        scheme = 'http'
    except ValueError:
        scheme = 'https'

    return f"{scheme}://{endpoint}"

async def uninstall_secret_and_storageclass(kubeconfig_str: str, namespace: str, secret_name: str, storageclass_name: str):
    """
    幂等卸载 Secret 和 StorageClass
    - Secret 不存在就跳过
    - StorageClass 不存在就跳过
    - 返回卸载结果字典
    """
    result = {"secret_deleted": False, "storageclass_deleted": False}

    try:
        # 加载 kubeconfig
        config.load_kube_config_from_dict(yaml.safe_load(kubeconfig_str))

        v1 = client.CoreV1Api()
        storage_v1 = client.StorageV1Api()

        # 删除 Secret
        try:
            v1.delete_namespaced_secret(name=secret_name, namespace=namespace)
            logger.info(f"已删除 Secret {secret_name} (namespace={namespace})")
            result["secret_deleted"] = True
        except client.exceptions.ApiException as e:
            if e.status == 404:
                logger.warning(f"Secret {secret_name} 不存在 (namespace={namespace})，跳过")
            else:
                logger.error(f"删除 Secret {secret_name} 失败: {e}")
                raise e

        # 删除 StorageClass
        try:
            storage_v1.delete_storage_class(name=storageclass_name)
            logger.info(f"已删除 StorageClass {storageclass_name}")
            result["storageclass_deleted"] = True
        except client.exceptions.ApiException as e:
            if e.status == 404:
                logger.warning(f"StorageClass {storageclass_name} 不存在，跳过")
            else:
                logger.error(f"删除 StorageClass {storageclass_name} 失败: {e}")
                raise e

        return result
    except Exception as e:
        logger.exception(f"卸载过程中发生异常: {e}")
        return result

async def create_service_account(api_instance,namespace,name):
    sa = client.V1ServiceAccount(
        metadata=client.V1ObjectMeta(
            name=name,
            namespace=namespace
        )
    )
    try:
        await k8s_call(api_instance.create_namespaced_service_account,
            namespace=namespace,
            body=sa
        )
        logger.info("ServiceAccount 创建成功")
    except ApiException as e:
        if e.status == 409:
            logger.warning("ServiceAccount 已存在")
        else:
            raise


async def create_role(rbac_v1, namespace, name):
    role = client.V1Role(
        metadata=client.V1ObjectMeta(
            name=name,
            namespace=namespace
        ),
        rules=[
            client.V1PolicyRule(
                api_groups=[""],
                resources=["pods", "pods/log"],
                verbs=["get", "list", "watch"]
            ),
            client.V1PolicyRule(
                api_groups=[""],
                resources=["pods/exec"],
                verbs=["create"]
            )
        ]
    )

    try:
        await k8s_call(rbac_v1.create_namespaced_role,
            namespace=namespace,
            body=role
        )
        logger.info("Role 创建成功")
    except ApiException as e:
        if e.status == 409:
            logger.warning("Role 已存在")
        else:
            raise


async def create_role_binding(rbac_v1,namespace,name):
    rb = client.V1RoleBinding(
        metadata=client.V1ObjectMeta(
            name=name,
            namespace=namespace
        ),
        subjects=[
            client.RbacV1Subject(
                kind="ServiceAccount",
                name=name,
                namespace=namespace
            )
        ],
        role_ref=client.V1RoleRef(
            api_group="rbac.authorization.k8s.io",
            kind="Role",
            name=name
        )
    )

    try:
        await k8s_call(rbac_v1.create_namespaced_role_binding,
            namespace=namespace,
            body=rb
        )
        logger.info("RoleBinding 创建成功")
    except ApiException as e:
        if e.status == 409:
            logger.warning("RoleBinding 已存在")
        else:
            raise
