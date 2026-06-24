from enum import Enum
from datetime import datetime
from typing import Any, Dict, Optional, TypedDict

from kubernetes.client.models import V1Job, V1JobStatus, V1Namespace, V1Deployment, V1DeploymentStatus
from kubernetes_asyncio import client

from app.common.status import TaskStatus
from app.core.logging import logger


# =============== Pod状态检查器 ===============
async def check_job_pods_status(core_v1: client.CoreV1Api, namespace: str, job_name: str) -> str:
    """
    检查Job管理的Pod的实际运行状态
    
    Args:
        core_v1: Kubernetes CoreV1Api客户端
        namespace: 命名空间
        job_name: Job名称
        
    Returns:
        str: Pod状态摘要 - "running", "pending", "failed", "unknown"
    """
    try:
        # 通过标签选择器获取Job管理的Pod
        label_selector = f"job-name={job_name}"
        pods = await core_v1.list_namespaced_pod(
            namespace=namespace,
            label_selector=label_selector
        )
        
        if not pods.items:
            logger.warning(f"Job {job_name} 没有找到关联的Pod")
            return "unknown"
        
        # 分析Pod状态
        running_count = 0
        pending_count = 0
        failed_count = 0
        succeeded_count = 0
        not_ready_count = 0

        for pod in pods.items:
            pod_phase = pod.status.phase
            logger.info(f"检查Pod {pod.metadata.name} 状态: phase={pod_phase}")
            
            # 优先检查 init 容器状态（如果存在）
            init_container_statuses = pod.status.init_container_statuses or []
            if init_container_statuses:
                init_failed = False
                init_running_or_waiting = False
                
                for init_status in init_container_statuses:
                    # 检查 init 容器是否失败
                    if init_status.state.terminated:
                        if init_status.state.terminated.exit_code != 0:
                            init_failed = True
                            logger.warning(f"Pod {pod.metadata.name} 的 init 容器 {init_status.name} 失败: exit_code={init_status.state.terminated.exit_code}")
                            break
                    elif init_status.state.running or init_status.state.waiting:
                        # init 容器还在运行或等待中
                        init_running_or_waiting = True
                        logger.info(f"Pod {pod.metadata.name} 的 init 容器 {init_status.name} 还在运行或等待中")
                
                # 如果 init 容器失败，Pod 失败
                if init_failed:
                    failed_count += 1
                    logger.info(f"Pod {pod.metadata.name} init 容器失败，Pod 状态: FAILED")
                    continue
                
                # 如果 init 容器还在运行或等待，Pod 还在运行中
                if init_running_or_waiting:
                    pending_count += 1
                    logger.info(f"Pod {pod.metadata.name} init 容器未完成，Pod 状态: RUNNING")
                    continue
                # init 容器已完成，继续检查主容器状态
            
            if pod_phase == "Running":
                # 进一步检查容器状态，确保容器真正在运行
                if pod.status.container_statuses:
                    all_running = True
                    any_container_failed = False
                    for container_status in pod.status.container_statuses:
                        # 检查是否有容器已终止且退出码非 0（多容器 Pod 中部分容器失败场景）
                        if (container_status.state.terminated and
                                container_status.state.terminated.exit_code != 0):
                            any_container_failed = True
                            logger.warning(
                                f"Pod {pod.metadata.name} 容器 {container_status.name} 已失败: "
                                f"exit_code={container_status.state.terminated.exit_code}"
                            )
                            break
                        if not container_status.ready or not container_status.state.running:
                            all_running = False
                            logger.info(f"容器 {container_status.name} 未就绪: ready={container_status.ready}, state={container_status.state}")
                    if any_container_failed:
                        failed_count += 1
                        logger.info(f"Pod {pod.metadata.name} 有容器失败，视为 FAILED")
                    elif all_running:
                        running_count += 1
                        logger.info(f"Pod {pod.metadata.name} 所有容器运行正常")
                    else:
                        pending_count += 1  # 容器还在启动过程中
                else:
                    pending_count += 1  # 容器状态信息不可用
            elif pod_phase == "Succeeded":
                # Pod成功完成，这是Job完成后的正常状态
                succeeded_count += 1
                logger.info(f"Pod {pod.metadata.name} 已成功完成")
            elif pod_phase in ["Pending", "ContainerCreating"]:
                pending_count += 1
            elif pod_phase in ["Failed", "Error"]:
                failed_count += 1
            elif pod_phase == "NotReady":
                not_ready_count += 1
                logger.info(f"Pod内多容器 {pod.metadata.name} 未就绪计数")
            else:
                logger.debug(f"Pod {pod.metadata.name} 处于未知状态: {pod_phase}")
        
        # 根据Pod状态确定整体状态（优先级：failed > succeeded > running > pending > unknown）
        if failed_count > 0:
            logger.info(f"Job {job_name} 有 {failed_count} 个失败的Pod")
            return "failed"
        elif succeeded_count > 0:
            logger.info(f"Job {job_name} 有 {succeeded_count} 个已完成的Pod")
            return "succeeded"
        elif running_count > 0:
            logger.info(f"Job {job_name} 有 {running_count} 个运行中的Pod")
            return "running"
        elif pending_count > 0:
            logger.info(f"Job {job_name} 有 {pending_count} 个待启动的Pod")
            return "pending"
        elif not_ready_count > 0:
            logger.info(f"Job {job_name} 有 {not_ready_count} 个未就绪计数容器")
            return "running"
        else:
            return "unknown"
            
    except Exception as e:
        logger.error(f"检查Job {job_name} 的Pod状态失败: {e}")
        return "unknown"


# =============== 状态映射器 ===============
def map_job_terminal_status(k8s_status: Optional[V1JobStatus]) -> Optional[TaskStatus]:
    """映射 Job 终态；非终态返回 None。"""
    if not k8s_status:
        return None
    if k8s_status.succeeded and k8s_status.succeeded > 0:
        return TaskStatus.COMPLETED
    if k8s_status.failed and k8s_status.failed > 0:
        return TaskStatus.FAILED
    if k8s_status.conditions:
        for condition in k8s_status.conditions:
            if condition.status != "True":
                continue
            if condition.type == "Complete":
                return TaskStatus.COMPLETED
            if condition.type == "Failed":
                return TaskStatus.FAILED
    return None


async def map_job_status_async(
    k8s_status: V1JobStatus, 
    core_v1: client.CoreV1Api,
    namespace: str,
    job_name: str,
    current_status: Optional[TaskStatus] = None
) -> TaskStatus:
    """
    映射 Job 的 Kubernetes 状态到业务状态（异步版本，检查Pod实际状态，包括init容器）
    
    根据 Kubernetes 官方文档，Job 状态判断基于：
    1. 数值字段：active, succeeded, failed
    2. 条件字段：Complete, Failed 条件
    3. Pod实际运行状态检查（包括init容器状态）
    
    Init容器状态处理（如果存在）：
    - 如果init容器失败，Job立即标记为FAILED
    - 如果init容器还在运行或等待，Job保持RUNNING状态
    - 只有当所有init容器成功完成后，才检查主容器状态
    
    Job状态转换规则：
    - PREPARING → RUNNING：所有init容器完成（如有）且主容器真正进入Running状态
    - RUNNING → COMPLETED：Job成功完成（succeeded > 0 或 Complete=True）
    - RUNNING → FAILED：Job执行失败（failed > 0 或 Failed=True）
    - PREPARING → FAILED：Init容器失败（如有init容器）
    - **严格禁止**：从RUNNING回退到PREPARING（单向状态转换）
    """
    
    # 1. 优先检查明确的终态状态（数值字段）
    terminal_status = map_job_terminal_status(k8s_status)
    if terminal_status == TaskStatus.COMPLETED:
        logger.info(f"Job {job_name} 成功完成，状态: COMPLETED")
        return terminal_status
    if terminal_status == TaskStatus.FAILED:
        logger.info(f"Job {job_name} 执行失败，状态: FAILED")
        return terminal_status
    
    # 3. 严格的状态转换控制：防止从RUNNING回退到PREPARING
    if current_status == TaskStatus.RUNNING:
        # 如果当前是RUNNING状态，只允许转换到终态状态（COMPLETED/FAILED）
        # 不允许回退到PREPARING状态，即使Pod状态发生变化
        logger.info(f"Job {job_name} 当前为RUNNING状态，保持不变等待终态状态")
        return TaskStatus.RUNNING
    
    # 4. 检查是否有活跃的Pod，如果有则进一步检查Pod实际状态
    if k8s_status.active and k8s_status.active > 0:
        # 检查Pod的实际运行状态
        pod_status = await check_job_pods_status(core_v1, namespace, job_name)
        
        if pod_status == "running":
            # 只有Pod真正运行时才返回RUNNING状态
            logger.info(f"Job {job_name} Pod真正运行中，状态: RUNNING")
            return TaskStatus.RUNNING
        elif pod_status == "failed":
            # Pod失败了，但Job状态可能还未更新
            logger.info(f"Job {job_name} Pod已失败，状态: FAILED")
            return TaskStatus.FAILED
        elif pod_status == "succeeded":
            # Pod已成功完成，但Job状态可能还未更新
            logger.info(f"Job {job_name} Pod已成功完成，状态: COMPLETED")
            return TaskStatus.COMPLETED
        else:
            # Pod还在pending/creating状态，仍然是启动中
            logger.info(f"Job {job_name} Pod还在启动中，状态: PENDING")
            return TaskStatus.PENDING
    
    # 5. 对于没有活跃Pod的情况，也要检查Pod状态
    # 因为Job完成后，active字段可能变为0，但Pod仍然存在且状态为Succeeded
    else:
        # 检查Pod的实际状态，即使没有活跃Pod
        pod_status = await check_job_pods_status(core_v1, namespace, job_name)
        
        if pod_status == "succeeded":
            # Pod已成功完成，这是Job完成的明确标识
            logger.info(f"Job {job_name} Pod已成功完成（无活跃Pod），状态: COMPLETED")
            return TaskStatus.COMPLETED
        elif pod_status == "failed":
            # Pod失败了
            logger.info(f"Job {job_name} Pod已失败（无活跃Pod），状态: FAILED")
            return TaskStatus.FAILED
    
    
    # 如果当前状态是终态状态，保持不变
    if current_status in [TaskStatus.COMPLETED, TaskStatus.FAILED]:
        logger.info(f"Job {job_name} 保持终态状态: {current_status}")
        return current_status
    
    # 7. 默认返回PENDING状态（仅适用于初始状态或未知情况）
    logger.info(f"Job {job_name} 默认状态: PENDING")
    return TaskStatus.PENDING

def map_deployment_status(
    k8s_status: V1DeploymentStatus,
    event_type: str,
    current_status: Optional[TaskStatus] = None,
    spec_replicas: Optional[int] = None,
) -> tuple[TaskStatus, Optional[int]]:
    """
    映射 Deployment 的 Kubernetes 状态到业务状态
    
    业务状态定义：
    - 启动中：Deployment创建中或从暂停状态恢复中，副本数还未达到期望值
    - 运行中：副本数达到期望值且可用
    - 暂停：副本数为0
    
    状态转换规则：
    - 启动中 → 运行中
    - 运行中 → 暂停 
    - 暂停 → 启动中
    """
    
    # 获取关键指标 - 保持None值，不要转换为0
    available_replicas = k8s_status.available_replicas
    ready_replicas = k8s_status.ready_replicas
    replicas = k8s_status.replicas
    
    # spec.replicas 是期望副本数，status.replicas 是实际被控制器观测到的副本数。
    # 刚创建/启动时常见 spec=1,status=0/None，此时应保持排队中；只有 spec=0 才表示业务上的已终止。
    if spec_replicas == 0:
        return TaskStatus.TERMINATED, available_replicas

    expected_replicas = spec_replicas if spec_replicas is not None else replicas

    # 运行中状态：期望副本数大于0，且实际/可用/就绪副本均达到期望值
    if (
        expected_replicas
        and expected_replicas > 0
        and replicas == expected_replicas
        and available_replicas is not None
        and available_replicas >= expected_replicas
        and ready_replicas is not None
        and ready_replicas >= expected_replicas
    ):
        return TaskStatus.RUNNING, available_replicas
    
    # 已终止状态下，K8s 状态事件可能只有 status 而没有 spec，保持已终止，避免回退到排队中。
    if spec_replicas is None and current_status == TaskStatus.TERMINATED:
        return TaskStatus.TERMINATED, available_replicas
    elif (current_status == TaskStatus.RUNNING and 
          spec_replicas is None and replicas is None and available_replicas is None and
          event_type == 'MODIFIED'):
        return TaskStatus.TERMINATED, available_replicas
    
    # 排队中状态：其他所有情况都是排队中
    # 1. 刚创建时，所有字段都是None (ADDED事件)
    # 2. 副本数设置为1但还没有可用副本 (创建过程中)
    # 3. 从暂停恢复，期望副本数为1但可用副本数还是None/0
    # 4. 有不可用副本存在
    # 5. 创建过程中的中间状态（replicas=None但不是从运行状态转换）
    return TaskStatus.PENDING, available_replicas


def map_ray_job_status(ray_job_status: Optional[Dict[str, Any]], current_status: Optional[TaskStatus] = None) -> Optional[TaskStatus]:
    """映射 KubeRay RayJob CRD status 到业务状态。"""
    if not ray_job_status:
        return TaskStatus.PENDING if current_status != TaskStatus.RUNNING else TaskStatus.RUNNING

    failed_count = ray_job_status.get("failed")
    try:
        if failed_count and int(failed_count) > 0:
            return TaskStatus.FAILED
    except (TypeError, ValueError):
        logger.warning(f"RayJob failed 字段无法解析: {failed_count}")

    deployment_status_text = str(
        ray_job_status.get("jobDeploymentStatus")
        or ray_job_status.get("deploymentStatus")
        or ray_job_status.get("status")
        or ""
    ).strip().lower()
    if deployment_status_text in {"failed", "fail", "error"}:
        return TaskStatus.FAILED

    status_text = str(ray_job_status.get("jobStatus") or deployment_status_text or "").strip().lower()

    if status_text in {"succeeded", "success", "completed", "complete"}:
        return TaskStatus.COMPLETED
    if status_text in {"failed", "fail", "error"}:
        return TaskStatus.FAILED
    if status_text in {"running", "started"}:
        return TaskStatus.RUNNING
    if status_text in {"stopped", "suspended", "terminating", "terminated"}:
        return TaskStatus.TERMINATED
    if status_text in {"pending", "initializing", "submitted", "waiting"}:
        if current_status == TaskStatus.RUNNING:
            return TaskStatus.RUNNING
        return TaskStatus.PENDING

    conditions = ray_job_status.get("conditions") or []
    if isinstance(conditions, list):
        for condition in conditions:
            if not isinstance(condition, dict):
                continue
            condition_status = str(condition.get("status") or "").lower()
            condition_type = str(condition.get("type") or "").lower()
            reason = str(condition.get("reason") or "").lower()
            message = str(condition.get("message") or "").lower()
            if condition_status not in {"true", "1"}:
                continue
            if any(token in condition_type or token in reason or token in message for token in ("failed", "error")):
                return TaskStatus.FAILED
            if any(token in condition_type or token in reason or token in message for token in ("complete", "succeed", "success")):
                return TaskStatus.COMPLETED
            if any(token in condition_type or token in reason or token in message for token in ("running", "ready")):
                return TaskStatus.RUNNING
            if any(token in condition_type or token in reason or token in message for token in ("stopped", "suspended", "terminat")):
                return TaskStatus.TERMINATED

    if current_status == TaskStatus.RUNNING:
        return TaskStatus.RUNNING
    return TaskStatus.PENDING
