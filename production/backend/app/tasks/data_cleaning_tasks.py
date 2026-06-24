"""
清洗任务相关的Celery任务
"""

import os
import json
import uuid
import yaml
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Set
from sqlalchemy import select

logger = logging.getLogger(__name__)

from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.database.base import SessionLocal
from app.models.data_cleaning_manager import DataCleaningTask
from app.models.models import KubernetesResource, ProjectKubernetesRelation, Project
from app.common.status import TaskStatus
from app.services.storage.storage import DefaultStorageService
from app.repository.storage import StorageMapper
from app.database.database_depends import Database, run_async_in_celery
from app.utils.storage_enum import StoragePath
from app.utils.k8s_launcher import K8sLauncher
from app.core.config import settings
from app.utils.json_path import iter_json_path_values


def get_storage_service() -> DefaultStorageService:
    """在 Celery worker 中获取 StorageService 实例"""
    db = Database()
    storage_mapper = StorageMapper(db=db)
    return DefaultStorageService(mapper=storage_mapper)


def _looks_like_grpo_record(data: Dict[str, Any]) -> bool:
    """GRPO samples keep prompt/reward metadata in nested JSON fields."""
    return isinstance(data.get("prompt"), list) and isinstance(data.get("reward_model"), dict)


def _selected_json_paths(data: Dict[str, Any], selected_fields: Set[str]) -> List[str]:
    if selected_fields:
        paths: List[str] = []
        for field in sorted(selected_fields):
            if field == "prompt" and isinstance(data.get("prompt"), list):
                paths.append("prompt.content")
            elif field == "reward_model" and isinstance(data.get("reward_model"), dict):
                paths.append("reward_model.ground_truth")
            else:
                paths.append(field)
        return paths

    if _looks_like_grpo_record(data):
        return ["prompt.content", "reward_model.ground_truth"]
    return []


def _build_json_field_rows(
    data: Dict[str, Any],
    group_id: str,
    selected_fields: Set[str],
) -> List[Dict[str, Any]]:
    """Flatten selected nested JSON scalar fields into text rows for data-juicer."""
    paths = _selected_json_paths(data, selected_fields)
    if not paths:
        return []

    has_nested_selection = any("." in path for path in paths)
    if not has_nested_selection and not _looks_like_grpo_record(data):
        return []

    rows: List[Dict[str, Any]] = []
    original_item = json.dumps(data, ensure_ascii=False)
    for path in paths:
        for concrete_path, value in iter_json_path_values(data, path):
            if isinstance(value, (dict, list)) or value is None:
                continue
            rows.append({
                "text": str(value),
                "_group": group_id,
                "_segment": "field",
                "_field_path": concrete_path,
                "_turn_idx": len(rows),
                "_cleaning_id": f"{group_id}_{concrete_path.replace('.', '_')}",
                "_original_item": original_item,
            })

    total_selected = len(rows)
    for row in rows:
        row["_total_selected"] = total_selected
    return rows


@celery_app.task(
    bind=True,
    base=TaskBase,
)
def create_data_cleaning_task_async(
    self,
    task_id: int,
    namespace: str,
    tenant_id: str
) -> dict:
    """
    异步执行数据清洗任务
    
    Args:
        task_id: 数据清洗任务ID
        namespace: 项目命名空间
        tenant_id: 租户ID
    
    Returns:
        执行结果字典
    """
    return run_async_in_celery(
        _execute_data_cleaning_task(self, task_id, namespace, tenant_id)
    )


async def update_data_cleaning_task_status(task: TaskBase, *, task_id: int, status: TaskStatus) -> None:
    """更新数据清洗任务状态到数据库（仅更新状态）"""
    from app.database.base import get_db_session
    try:
        async with get_db_session() as db:
            # 使用异步查询
            result = await db.execute(
                select(DataCleaningTask).filter(DataCleaningTask.id == task_id)
            )
            cleaning_task = result.scalar_one_or_none()
            
            if cleaning_task:
                cleaning_task.status = status
                await db.commit()
                task._log_info(f"数据清洗任务状态已更新为: {status}")
            else:
                task._log_warning(f"未找到数据清洗任务: {task_id}")
    except Exception as e:
        task._log_error(f"更新数据清洗任务状态失败: {str(e)}", error=e)


def _extract_jsonl_object(line: str) -> Optional[dict[str, Any]]:
    """读取项目数据集兼容的 JSONL 行：支持对象或单元素对象数组。"""
    parsed = json.loads(line)
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
        return parsed[0]
    return None


async def _execute_data_cleaning_task(
    task: TaskBase,
    task_id: int,
    namespace: str,
    tenant_id: str
) -> dict:
    """执行清洗任务的异步实现"""
    
    try:
        # 设置租户上下文
        from app.utils.app_runtime_context import set_tenant_id
        if tenant_id:
            set_tenant_id(tenant_id)
            task._log_info(f"已设置租户ID: {tenant_id}")
        else:
            task._log_warning("未传入租户ID，可能导致存储路径错误")
        
        # 设置任务信息
        task.task_id = task_id
        celery_id = getattr(getattr(task, 'request', None), 'id', None)
        task.task_name = f"create_data_cleaning_task:{task_id}" + (f":{celery_id}" if celery_id else "")
        task.task_type = "data_cleaning"
        
        # 初始化任务日志（如果需要）
        try:
            from app.tasks.training_tasks import init_task_logger
            init_task_logger(task)
        except Exception as e:
            task._log_warning(f"初始化任务日志记录器失败: {e}")
        
        task._log_start("开始异步执行数据清洗任务")
        task._log_info(f"任务ID: {task_id}, 命名空间: {namespace}")
        
        session = SessionLocal()
        
        # 1. 先查询数据清洗任务是否存在
        result = session.execute(
            select(DataCleaningTask).where(DataCleaningTask.id == task_id)
        )
        cleaning_task = result.scalars().first()
        
        if not cleaning_task:
            task._log_error(f"数据清洗任务不存在: {task_id}")
            session.close()
            return {"success": False, "error": "数据清洗任务不存在"}
        
        # 2. 任务存在后，更新状态为排队中
        await update_data_cleaning_task_status(task, task_id=task_id, status=TaskStatus.PENDING)
        task._log_info("数据清洗任务状态已更新为PENDING")
        
        project_id = cleaning_task.project_id
        
        # 获取存储服务
        storage_service = get_storage_service()
        jfs = await storage_service.JUICEFS_CLIENT(tenant_id)
        
        # 生成输出路径和配置路径（日志通过 Loki 收集，不需要单独挂载）
        output_path = StoragePath.DATA_CLEANING_OUTPUT_DATASET.format_storage_path(
            namespace=namespace,
            task_id=task_id
        )
        config_path = StoragePath.DATA_CLEANING_CONFIG.format_storage_path(
            namespace=namespace,
            task_id=task_id
        )
        
        # 生成输入数据集挂载路径（用于 K8s 容器内访问）
        input_mount_storage_path = StoragePath.DATA_CLEANING_INPUT_DATASET.format_storage_path(
            namespace=namespace,
            task_id=task_id
        )
        
        output_filename = f"data_cleaning_result_{task_id}.jsonl"
        output_file = f"{output_path}{output_filename}"  # JuiceFS 完整存储路径（用于数据库记录）
        config_file = config_path
        
        # 确保目录存在
        output_dir = os.path.dirname(output_file)
        config_dir = os.path.dirname(config_file)
        input_mount_dir = input_mount_storage_path
        
        for dir_path in [output_dir, config_dir, input_mount_dir]:
            if dir_path and not jfs.exists(dir_path):
                jfs.makedirs(dir_path, exist_ok=True)
        
        # 将输入数据集文件复制到挂载路径下（确保容器内能访问到）
        if not cleaning_task.dataset_path:
            raise ValueError(f"数据清洗任务 {task_id} 的输入数据集路径为空")
        
        # 验证源文件是否存在
        if not jfs.exists(cleaning_task.dataset_path):
            raise FileNotFoundError(f"输入数据集文件不存在: {cleaning_task.dataset_path}")
        
        source_input_filename = os.path.basename(cleaning_task.dataset_path)
        input_filename = f"data_cleaning_task_{task_id}_{source_input_filename}"
        input_mount_file = f"{input_mount_storage_path}{input_filename}"
        
        # 每次执行都重新生成任务级规范化输入文件，避免复用旧的原始 messages/chosen/rejected 文件。
        if not jfs.exists(input_mount_file) or cleaning_task.dataset_path != input_mount_file:
            task._log_info(f"生成规范化输入数据集文件: {cleaning_task.dataset_path} -> {input_mount_file}")
            
            # 验证源文件大小
            try:
                source_stat = jfs.stat(cleaning_task.dataset_path)
                source_size = source_stat.st_size if hasattr(source_stat, 'st_size') else 0
                task._log_info(f"源文件大小: {source_size} 字节")
                
                if source_size == 0:
                    raise ValueError(f"输入数据集文件为空: {cleaning_task.dataset_path}")
            except Exception as e:
                task._log_warning(f"无法获取源文件统计信息: {e}")
            
            # 复制并转换文件格式（从数组格式转换为标准 JSONL 格式，并处理多轮会话数据）
            try:
                task._log_info("开始转换文件格式：从数组格式 [{}] 转换为标准 JSONL 格式 {}，并处理多轮会话数据")
                converted_lines = 0
                skipped_lines = 0
                valid_source_lines = 0
                unmatched_selected_field_lines = 0
                flattened_conversations = 0
                flattened_json_fields = 0

                # 用户选择的字段（用于按角色提取）
                _selected_fields = set(cleaning_task.selected_fields) if cleaning_task.selected_fields else set()

                def _extract_rows(data: dict, group_id: str) -> list:
                    """
                    将一条原始数据转换为可供 data-juicer 处理的行列表。

                    对于会话格式（messages / conversations / dialogue）：
                      - 每条消息拆成独立一行，包含：
                          text        : 消息内容（供 data-juicer 清洗）
                          _group      : 同一个会话共享同一 group_id，清洗后可按此重组
                          _role       : 角色名（role / from / speaker）
                          _turn_idx   : 消息在会话中的原始顺序
                          _cleaning_id: 唯一行标识
                      - 若指定了 selected_fields，只拆出选中角色的消息行；其余角色保留在
                        _other_turns 字段中（供重组时还原完整 messages）。
                    对于普通平铺格式（无会话字段）：
                      - 直接返回原始数据行（不拆分）。

                    支持格式：
                    - messages: [{"role": "...", "content": "..."}]  （OpenAI 格式）
                    - conversations: [{"from": "...", "value": "..."}]  （Qwen 格式）
                    - dialogue: [{"speaker": "...", "text": "..."}]
                    """

                    def _has_nested_field(item: dict, field_path: str) -> bool:
                        current = item
                        for part in field_path.split("."):
                            if not isinstance(current, dict) or part not in current:
                                return False
                            current = current[part]
                        return True

                    def _build_rows(turns: list, role_key: str, content_key: str) -> list:
                        """通用拆行逻辑"""
                        rows = []
                        selected_turns = []   # 需要清洗的消息（按 turn_idx 保留）
                        original_turns = []

                        def _logical_field_name(role: str) -> str:
                            if role == "assistant":
                                return "response"
                            return role

                        for idx, turn in enumerate(turns):
                            if not isinstance(turn, dict):
                                continue
                            role = turn.get(role_key, "")
                            content = turn.get(content_key, "")
                            entry = {"role": role, "content": content, "turn_idx": idx}
                            original_turns.append(entry)
                            logical_field_name = _logical_field_name(role)
                            if (
                                not _selected_fields
                                or "messages" in _selected_fields
                                or f"messages.{role}" in _selected_fields
                                or f"messages.{logical_field_name}" in _selected_fields
                                or logical_field_name in _selected_fields
                                or role in _selected_fields
                                or (role == "user" and "prompt" in _selected_fields)
                            ):
                                selected_turns.append(entry)

                        for entry in selected_turns:
                            row = {
                                "text": entry["content"],
                                "_group": group_id,
                                "_segment": "message",
                                "_role": entry["role"],
                                "_turn_idx": entry["turn_idx"],
                                "_cleaning_id": f"{group_id}_t{entry['turn_idx']}",
                                "_messages_original": json.dumps(original_turns, ensure_ascii=False),
                            }
                            if isinstance(data.get("chosen"), dict):
                                row["_chosen_original"] = json.dumps(data.get("chosen"), ensure_ascii=False)
                            if isinstance(data.get("rejected"), dict):
                                row["_rejected_original"] = json.dumps(data.get("rejected"), ensure_ascii=False)
                            rows.append(row)

                        for ranking_field in ("chosen", "rejected"):
                            ranking_item = data.get(ranking_field)
                            if not isinstance(ranking_item, dict):
                                continue
                            if _selected_fields and ranking_field not in _selected_fields:
                                continue
                            ranking_content = ranking_item.get("content", "")
                            if not isinstance(ranking_content, str):
                                continue
                            row = {
                                "text": ranking_content,
                                "_group": group_id,
                                "_segment": ranking_field,
                                "_role": ranking_item.get("role", "assistant"),
                                "_turn_idx": 10_000 if ranking_field == "chosen" else 10_001,
                                "_cleaning_id": f"{group_id}_{ranking_field}",
                                "_messages_original": json.dumps(original_turns, ensure_ascii=False),
                            }
                            if isinstance(data.get("chosen"), dict):
                                row["_chosen_original"] = json.dumps(data.get("chosen"), ensure_ascii=False)
                            if isinstance(data.get("rejected"), dict):
                                row["_rejected_original"] = json.dumps(data.get("rejected"), ensure_ascii=False)
                            rows.append(row)

                        total_selected = len(rows)
                        for row in rows:
                            # 记录本会话应有多少条被清洗的消息/排序候选，重组时用于完整性校验
                            row["_total_selected"] = total_selected
                        return rows

                    # messages 格式（OpenAI）
                    if "messages" in data and isinstance(data["messages"], list):
                        return _build_rows(data["messages"], role_key="role", content_key="content")

                    # conversations 格式（Qwen）
                    if "conversations" in data and isinstance(data["conversations"], list):
                        return _build_rows(data["conversations"], role_key="from", content_key="value")

                    # dialogue 格式
                    if "dialogue" in data and isinstance(data["dialogue"], list):
                        return _build_rows(data["dialogue"], role_key="speaker", content_key="text")

                    # GRPO/复杂 JSON 字段：把选中的点路径字段拆成 text 行，清洗后按 _field_path 回写。
                    field_rows = _build_json_field_rows(data, group_id, _selected_fields)
                    if field_rows:
                        return field_rows

                    # 普通平铺格式，直接返回原数据行
                    if _selected_fields and not any(_has_nested_field(data, field_name) for field_name in _selected_fields):
                        return []
                    item = data.copy()
                    if "_cleaning_id" not in item:
                        item["_cleaning_id"] = group_id
                    return [item]

                with jfs.open(cleaning_task.dataset_path, 'r', encoding='utf-8') as source_file:
                    with jfs.open(input_mount_file, 'w', encoding='utf-8') as target_file:
                        for line_num, line in enumerate(source_file, 1):
                            line = line.strip()
                            if not line or line.startswith("#"):
                                continue

                            try:
                                item = _extract_jsonl_object(line)
                                group_id = f"row_{line_num}"

                                if item is None:
                                    task._log_warning(f"第 {line_num} 行：不是对象或单元素对象数组，跳过")
                                    skipped_lines += 1
                                    continue
                                valid_source_lines += 1

                                rows = _extract_rows(item, group_id)
                                is_conversation = (
                                    "messages" in item or "conversations" in item or "dialogue" in item
                                )
                                if is_conversation and rows and "_group" in rows[0]:
                                    flattened_conversations += 1
                                elif rows and rows[0].get("_segment") == "field":
                                    flattened_json_fields += 1
                                if not rows:
                                    unmatched_selected_field_lines += 1
                                    continue

                                for row in rows:
                                    target_file.write(json.dumps(row, ensure_ascii=False) + '\n')
                                converted_lines += len(rows)

                            except json.JSONDecodeError as e:
                                task._log_warning(f"第 {line_num} 行：JSON 解析失败: {e}，跳过")
                                skipped_lines += 1
                            except Exception as e:
                                task._log_warning(f"第 {line_num} 行：处理失败: {e}，跳过")
                                skipped_lines += 1

                task._log_info(
                    f"文件格式转换完成：有效源数据 {valid_source_lines} 行，转换 {converted_lines} 行，"
                    f"未命中选中字段 {unmatched_selected_field_lines} 行，跳过无效行 {skipped_lines} 行"
                )
                if flattened_conversations > 0:
                    task._log_info(f"已按消息拆行的会话数: {flattened_conversations} 条（清洗完成后将按 _group 重组为 messages 格式）")
                if flattened_json_fields > 0:
                    task._log_info(f"已按字段路径拆行的复杂 JSON 样本数: {flattened_json_fields} 条（清洗完成后将按 _field_path 回写原结构）")

                if converted_lines == 0:
                    if valid_source_lines == 0:
                        raise ValueError(f"文件格式转换失败：没有成功转换任何行，请检查文件格式")
                    raise ValueError(
                        f"选中清洗字段未命中任何有效数据行，请检查字段元数据或重新执行 metadata_fields 修复: "
                        f"selected_fields={cleaning_task.selected_fields}"
                    )
                
                # 验证目标文件是否存在且不为空
                if not jfs.exists(input_mount_file):
                    raise FileNotFoundError(f"文件复制失败，目标文件不存在: {input_mount_file}")
                
                try:
                    target_stat = jfs.stat(input_mount_file)
                    target_size = target_stat.st_size if hasattr(target_stat, 'st_size') else 0
                    task._log_info(f"目标文件大小: {target_size} 字节")
                    
                    if target_size == 0:
                        raise ValueError(f"转换后的文件为空: {input_mount_file}")
                    
                    # 注意：由于格式转换（从 [{}] 转换为 {}），文件大小可能会变化，这是正常的
                    if source_size > 0:
                        size_diff = abs(target_size - source_size)
                        size_diff_percent = (size_diff / source_size) * 100 if source_size > 0 else 0
                        if size_diff_percent > 50:  # 如果差异超过 50%，记录警告
                            task._log_warning(f"文件大小差异较大: 源文件 {source_size} 字节, 目标文件 {target_size} 字节 (差异 {size_diff_percent:.1f}%)")
                        else:
                            task._log_info(f"文件大小变化正常（格式转换导致）: 源文件 {source_size} 字节, 目标文件 {target_size} 字节")
                except Exception as e:
                    task._log_warning(f"无法验证目标文件: {e}")
                
                # 验证文件格式（读取前几行检查，确保是标准 JSONL 格式）
                try:
                    with jfs.open(input_mount_file, 'r', encoding='utf-8') as f:
                        first_line = f.readline()
                        if first_line:
                            first_line = first_line.strip()
                            if first_line:
                                # 尝试解析 JSON（应该是对象格式 {}）
                                try:
                                    parsed = json.loads(first_line)
                                    if isinstance(parsed, dict):
                                        task._log_info(f"文件格式验证通过（标准 JSONL），首行示例: {first_line[:100]}...")
                                    else:
                                        task._log_warning(f"文件首行不是对象格式，而是 {type(parsed).__name__}")
                                        task._log_warning(f"首行内容: {first_line[:200]}")
                                except json.JSONDecodeError as e:
                                    task._log_warning(f"文件首行 JSON 格式可能有问题: {e}")
                                    task._log_warning(f"首行内容: {first_line[:200]}")
                        else:
                            task._log_warning("文件首行为空")
                except Exception as e:
                    task._log_warning(f"文件格式验证失败: {e}")
                
                task._log_info(f"输入数据集文件复制完成: {input_mount_file}")
            except Exception as e:
                task._log_error(f"复制输入数据集文件失败: {str(e)}", error=e)
                raise
        else:
            task._log_info(f"输入数据集文件已在挂载路径: {input_mount_file}")
        
        task._log_info(f"输出路径: {output_file}")
        task._log_info(f"配置路径: {config_file}")
        
        # 读取转换后文件的实际字段，用于 text_keys 校正
        actual_dataset_fields: list = []
        try:
            actual_dataset_field_set = set()
            with jfs.open(input_mount_file, 'r', encoding='utf-8') as _f:
                for _line in _f:
                    _line = _line.strip()
                    if _line:
                        _parsed = json.loads(_line)
                        if isinstance(_parsed, dict):
                            for _field in _parsed.keys():
                                if _field not in actual_dataset_field_set:
                                    actual_dataset_field_set.add(_field)
                                    actual_dataset_fields.append(_field)
            task._log_info(f"转换后数据集实际字段: {actual_dataset_fields}")
        except Exception as e:
            task._log_warning(f"无法读取转换后数据集字段: {e}")
        
        # 更新任务的输出路径（日志路径由定时任务归档后更新）
        cleaning_task.output_path = output_file
        session.commit()
        session.refresh(cleaning_task)
        
        # 生成 K8s UUID（如果没有）
        if not cleaning_task.lab_k8s_uuid:
            cleaning_task.lab_k8s_uuid = str(uuid.uuid4())
            session.commit()
            session.refresh(cleaning_task)
        
        k8s_uuid = cleaning_task.lab_k8s_uuid
        task._log_info(f"K8s UUID: {k8s_uuid}")
        
        # 生成 data-juicer 配置（使用容器内挂载路径）
        config = _generate_data_juicer_config(
            cleaning_task,
            output_filename,
            actual_dataset_fields=actual_dataset_fields,
            input_filename=input_filename,
        )
        
        # 将配置写入存储
        config_yaml = yaml.dump(config, allow_unicode=True, default_flow_style=False)
        with jfs.open(config_file, 'w', encoding='utf-8') as f:
            f.write(config_yaml)
        task._log_info(f"数据清洗配置已写入: {config_file}")
        
        # 查询集群 kubeconfig 与命名空间
        stmt = (
            select(KubernetesResource.config, ProjectKubernetesRelation.namespace)
            .join(ProjectKubernetesRelation, ProjectKubernetesRelation.k8s_id == KubernetesResource.id)
            .where(ProjectKubernetesRelation.project_id == project_id)
        )
        row = session.execute(stmt).first()
        if not row:
            raise RuntimeError(f"未绑定K8s集群或命名空间: project_id={project_id}")
        kubeconfig_str, k8s_namespace = row[0], row[1]
        
        # 创建 K8s Job
        job_name = await _create_k8s_job(
            task=task,
            cleaning_task=cleaning_task,
            kubeconfig_str=kubeconfig_str,
            k8s_namespace=k8s_namespace,
            namespace=namespace,
            k8s_uuid=k8s_uuid
        )
        
        task._log_info(f"K8s Job 已创建: {job_name}, uuid: {k8s_uuid}")
        
        # 注意：RUNNING 状态由 K8s 状态管理器自动更新，不需要在这里手动设置
        # K8s 状态管理器会监听 Job 状态，当 Pod 真正运行时自动更新为 RUNNING
        
        task._log_info("数据清洗任务创建完成，等待 K8s Job 启动")
        
        return {
            "success": True,
            "task_id": task_id,
            "job_name": job_name,
            "output_path": output_file
        }
        
    except Exception as e:
        task._log_error(f"数据清洗任务执行失败: {str(e)}", error=e)
        
        # 更新任务状态为失败
        await update_data_cleaning_task_status(task, task_id=task_id, status=TaskStatus.FAILED)
        
        # 尝试更新错误信息
        try:
            if session:
                result = session.execute(
                    select(DataCleaningTask).where(DataCleaningTask.id == task_id)
                )
                cleaning_task = result.scalars().first()
                if cleaning_task:
                    cleaning_task.error_message = str(e)
                    session.commit()
        except Exception as update_error:
            task._log_error(f"更新任务错误信息失败: {str(update_error)}")
        
        return {"success": False, "error": str(e)}
    finally:
        if session:
            session.close()


def _generate_data_juicer_config(
    task: DataCleaningTask,
    output_filename: str,
    actual_dataset_fields: list = None,
    input_filename: Optional[str] = None,
) -> dict:
    """
    生成 data-juicer 配置
    
    路径说明（使用容器内的 JuiceFS 挂载路径，符合 DeepexiDataLab Factory 文档）：
    - 输入数据集挂载到: /app/clean_data/
    - 输出数据集挂载到: /app/output/
    
    actual_dataset_fields: 转换后数据集的实际字段列表，用于校正 text_keys（避免引用不存在的字段）
    """
    # steps_snapshot 统一为数组格式：[{"operator_type": "xxx", ...}, ...]
    operators = task.steps_snapshot or []
    
    # 获取输入数据集文件名
    input_filename = input_filename or (os.path.basename(task.dataset_path) if task.dataset_path else "input.jsonl")
    
    # 容器内的 JuiceFS 挂载路径（符合 DeepexiDataLab Factory 文档要求）
    input_mount_path = StoragePath.DATA_CLEANING_INPUT_DATASET.mount_path  # /app/clean_data
    output_mount_path = StoragePath.DATA_CLEANING_OUTPUT_DATASET.mount_path  # /app/output
    
    # 内部特殊字段，不作为 text_keys
    _internal_fields = {
        "_cleaning_id", "_group", "_role", "_turn_idx", "_other_turns",
        "_segment", "_messages_original", "_chosen_original", "_rejected_original",
        "_total_selected", "_field_path", "_original_item",
    }
    
    # 获取选择的字段，如果未选择则使用默认字段
    # 注意：多轮会话数据会被展平为 text 字段，所以默认包含 text
    if task.selected_fields:
        text_keys = list(task.selected_fields)
    else:
        # 默认字段包含 text（用于多轮会话展平后的数据）和其他常见字段
        text_keys = ["text", "system", "prompt", "response", "instruction", "output", "input", "chosen", "rejected"]
    
    is_flattened_conversation = (
        bool(actual_dataset_fields)
        and "text" in actual_dataset_fields
        and any(field in actual_dataset_fields for field in ("_group", "_segment", "_messages_original", "_field_path"))
    )

    # role-based 会话和 GRPO/复杂 JSON 字段会被拆成 text 行，所有算子都只能处理这个字符串字段。
    if is_flattened_conversation:
        text_keys = ["text"]

    # 如果提供了实际字段，校正 text_keys：过滤掉实际不存在的字段，并在必要时回退到可用字段
    if actual_dataset_fields:
        available = [f for f in actual_dataset_fields if f not in _internal_fields]
        valid_text_keys = [k for k in text_keys if k in available]
        if not valid_text_keys:
            # 所选字段均不存在于转换后的数据中，回退到所有可用字段
            valid_text_keys = available or text_keys
        text_keys = valid_text_keys
    
    # 构建 data-juicer 配置（使用容器内路径，使用 os.path.join 确保路径正确拼接）
    config = {
        "project_name": f"data_cleaning_task_{task.id}",
        "dataset_path": os.path.join(input_mount_path, input_filename),  # 容器内输入路径
        "export_path": os.path.join(output_mount_path, output_filename),  # 容器内输出路径
        "np": settings.DATA_JUICER_WORKERS,  # 并行进程数
        "text_keys": text_keys,  # 使用选择的字段或默认字段
        "process": []
    }
    
    # 添加算子配置
    for op in operators:
        if not op.get("enabled", True):
            continue
        operator_type = op.get("operator_type")
        params = (op.get("params") or {}).copy()
        if is_flattened_conversation:
            params["text_key"] = "text"
        
        # 直接使用算子名称（已使用 data-juicer v1.4.4 的实际算子名称）
        # 构建算子配置（data-juicer 要求 process 中的每个元素都是字典）
        op_config = {
            operator_type: params
        }
        config["process"].append(op_config)
    
    return config


async def find_data_cleaning_image(project_id: int) -> str:
    """获取数据清洗任务镜像地址（根据项目ID查找）
    
    使用公共的 image_utils 模块，避免代码重复
    """
    from app.schemas.repository_image import ImageType
    from app.tasks.image_utils import find_image_by_project
    
    image_address = await find_image_by_project(
        project_id=project_id,
        image_type=ImageType.DATA_CLEANING.value,
        is_card_model_null=True
    )
    
    if not image_address:
        raise RuntimeError(f"未找到匹配的数据清洗镜像: project_id={project_id}")
    
    return image_address


async def _create_k8s_job(
    task: TaskBase,
    cleaning_task: DataCleaningTask,
    kubeconfig_str: str,
    k8s_namespace: str,
    namespace: str,
    k8s_uuid: str
) -> str:
    """
    创建 K8s Job 执行数据清洗任务
    
    Args:
        task: Celery任务实例（用于日志）
        cleaning_task: 数据清洗任务数据库对象
        kubeconfig_str: K8s 配置字符串
        k8s_namespace: K8s 命名空间
        namespace: 项目命名空间（用于存储路径）
        k8s_uuid: K8s UUID
    
    Returns:
        Job 名称
    """
    task._log_info(f"开始创建 K8s Job, task_id={cleaning_task.id}")
    
    # 初始化 K8s 启动器
    launcher = K8sLauncher(config_str=kubeconfig_str)
    
    # 获取 data-juicer 镜像（参考训练任务的镜像获取方式）
    image = await find_data_cleaning_image(cleaning_task.project_id)
    task._log_info(f"使用 data-juicer 镜像: {image}")
    
    # 构建存储卷与挂载（使用 llm-training-pvc，与训练任务共用）
    # 根据 DeepexiDataLab Factory 文档要求，映射到 /app/ 下的路径
    storage_items = [
        {"name": "llm-training-pvc", "enum": StoragePath.DATA_CLEANING_INPUT_DATASET},  # /app/clean_data
        {"name": "llm-training-pvc", "enum": StoragePath.DATA_CLEANING_OUTPUT_DATASET},  # /app/output
        {"name": "llm-training-pvc", "enum": StoragePath.DATA_CLEANING_CONFIG},  # 配置文件
        # {"name": "llm-training-pvc", "enum": StoragePath.DATA_CLEANING_DEEPEXI_PLUGINS},  # /app/deepexi_plugins
    ]
    
    volume_mounts, volumes = await launcher.build_storage_volumes(
        storage_items,
        namespace=namespace,
        task_id=cleaning_task.id,
    )
    
    # 环境变量（根据 DeepexiDataLab Factory 文档要求）
    env_vars = {
        "TASK_ID": str(cleaning_task.id),
        "TASK_NAME": cleaning_task.name,
        "LAB_K8S_UUID": k8s_uuid,
        # 关闭 PyTorch 后端自动加载，避免 data-juicer 在通用镜像中误触发 torch_npu 导入失败。
        "TORCH_DEVICE_BACKEND_AUTOLOAD": settings.DATA_CLEANING_TORCH_DEVICE_BACKEND_AUTOLOAD,
    }
    
    # Job 名称（使用连字符，符合 K8s RFC 1123 规范）
    job_name = f"data-cleaning-{cleaning_task.id}-{k8s_uuid[:8]}"
    
    # 创建数据清洗 Job（使用 main.py 启动，符合 DeepexiDataLab Factory 文档）
    result = await launcher.create_job(
        namespace=k8s_namespace,
        job_name=job_name,
        image=image,
        service_type="data_cleaning",
        command=["python", "main.py"],
        args=["--config", StoragePath.DATA_CLEANING_CONFIG.mount_path], 
        cpu_limit=settings.DATA_CLEANING_CPU_LIMIT,
        memory_limit=settings.DATA_CLEANING_MEMORY_LIMIT,
        cpu_request=settings.DATA_CLEANING_CPU_REQUEST,
        memory_request=settings.DATA_CLEANING_MEMORY_REQUEST,
        env_vars=env_vars,
        volume_mounts=volume_mounts,
        volumes=volumes,
        working_dir="/app",  # 根据 DeepexiDataLab Factory 文档，工作目录应为 /app
        security_context=None,
        automount_service_account_token=False,
        k8s_uuid=k8s_uuid,
        affinity=None,
        ttl_seconds_after_finished=600
    )
    
    task._log_info(f"K8s Job 创建成功: {job_name}")
    
    return job_name
