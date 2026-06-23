"""
标注任务 - Redis Streams 消费者
用于消费 Redis Streams 中的标注事件并写入文件
"""
import json
import os
import stat
import asyncio
import traceback
from typing import Dict, Any

from sqlalchemy import select

from app.schemas.label import LabelTaskBizType
from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.core.config import settings
from app.core.logging import logger
from app.database.database_depends import Database, run_async_in_celery
from app.models.label_manager import LabelProgress, LabelDataset, LabelTask, LabelMachineLearningDataset
from app.repository.label_progress_mapper import LabelProgressMapper
from app.services.storage.storage import DefaultStorageService
from app.repository.storage import StorageMapper
from app.utils import app_runtime_context
from app.utils.storage_utils import JFSSelectiveCloner
from app.database.base import get_db_session

# 常量
STREAM_NAME = "label:annotations"
CONSUMER_GROUP = "label_annotation_writers"
PROCESSED_KEYS_SET = "label:task:{task_id}:processed_keys"  # 任务级 Redis Set，任务完成时一起清理
ANNOTATED_ITEMS_KEY = "label:task:{task_id}:annotated_items"  # Redis Set 追踪每个任务已标注的行（所有）- 单人标注使用
SAVED_ITEMS_KEY = "label:task:{task_id}:saved_items"  # 兼容旧 key，暂存按用户维度见下
USER_SAVED_ITEMS_KEY = "label:task:{task_id}:user:{user_id}:saved_items"  # 按用户维度追踪暂存行，多人标注每用户独立计数
USER_ANNOTATED_ITEMS_KEY = "label:task:{task_id}:user:{user_id}:annotated_items"  # Redis Set 追踪每个用户已标注的行 - 多人标注使用
ANNOTATION_OFFSETS_KEY = "label:task:{task_id}:annotation_offsets"  # Redis Hash: row_number -> annotations.jsonl offset

# 全局变量
_consumer_task: asyncio.Task = None
_is_running = False
TASK_DB = Database()


def get_storage_service() -> DefaultStorageService:
    """获取 StorageService 实例"""
    storage_mapper = StorageMapper(db=TASK_DB)
    return DefaultStorageService(mapper=storage_mapper)


async def get_juicefs_client():
    """获取 JuiceFS 客户端"""
    storage_service = get_storage_service()
    from app.utils import app_runtime_context
    tenant_id = app_runtime_context.get_tenant_id()
    return await storage_service.JUICEFS_CLIENT(tenant_id)


def get_annotations_path(dataset_path: str) -> str:
    """获取标注文件路径"""
    return dataset_path.replace('.jsonl', '.annotations.jsonl')


async def read_annotations_file(jfs, dataset_path: str) -> Dict[str, Any]:
    """
    读取标注文件（支持追加模式，同一 item_id 后面的覆盖前面的）
    """
    annotations_path = get_annotations_path(dataset_path)
    
    annotations = {}
    if jfs.exists(annotations_path):
        try:
            with jfs.open(annotations_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                        item_id = item.get('item_id')
                        if item_id:
                            # 后面的自动覆盖前面的（处理追加写入的重复数据）
                            annotations[str(item_id)] = item.get('annotation', {})
                    except json.JSONDecodeError:
                        logger.warning(f"跳过无效JSON行: {line}")
        except Exception as e:
            logger.error(f"读取标注文件失败: {str(e)}")
    return annotations


async def append_annotation(jfs, dataset_path: str, item_id: str, annotation: Dict[str, Any]) -> int:
    """
    追加写入单条标注（高性能，无需读取整个文件）
    
    - 直接追加到文件末尾
    - 同一 item_id 的多次写入，读取时后面的覆盖前面的
    - 支持乱序写入（如重试的消息）
    """
    annotations_path = get_annotations_path(dataset_path)
    logger.info(f"追加写入标注: {annotations_path}, item_id={item_id}")
    # 确保目录存在
    remote_dir = os.path.dirname(annotations_path)
    if remote_dir and not jfs.exists(remote_dir):
        jfs.makedirs(remote_dir, exist_ok=True)
    
    # 构建单行数据
    line = json.dumps({
        'item_id': item_id,
        'annotation': annotation
    }, ensure_ascii=False) + '\n'
    
    # 追加写入，并返回本次写入的起始 offset（供 Redis 建索引）。
    with jfs.open(annotations_path, 'a+', encoding='utf-8') as f:
        f.seek(0, os.SEEK_END)
        offset = f.tell()
        f.write(line)
    return int(offset)


async def _update_progress_with_new_session(
    task_id: int,
    user_id: int,
    username: str,
    assigned_count: int,
    redis_client,
    saved_key: str,
    is_multi: bool = True
) -> bool:
    """
    使用独立的 session 更新进度记录。

    进度统计是最终一致的辅助数据（真实标注数据已写入 JFS），
    不做提交后的二次验证，避免多实例竞争导致的误判失败。
    """
    async with get_db_session() as session:
        try:
            # 查询并锁定进度记录，防止并发写冲突
            progress_result = await session.execute(
                select(LabelProgress).filter(
                    LabelProgress.task_id == task_id
                ).with_for_update()
            )
            progresses = progress_result.scalars().all()

            # 在持锁之后读取 Redis 最新值，保证本次写入值的时序正确
            total_saved = await redis_client.scard(saved_key)
            logger.info(f"更新进度: task_id={task_id}, saved={total_saved}, rows={len(progresses)}")

            if not progresses:
                logger.info(f"创建新进度记录: task_id={task_id}, user_id={user_id}, saved={total_saved}")
                session.add(LabelProgress(
                    task_id=task_id,
                    user_id=user_id,
                    assigned_count=assigned_count,
                    saved_count=total_saved,
                    created_id=user_id,
                    created_by=username
                ))
            else:
                if is_multi:
                    # 多人标注：只更新当前用户的进度行，saved_key 为按用户维度
                    for progress in progresses:
                        if progress.user_id == user_id:
                            if progress.saved_count != total_saved:
                                logger.info(f"更新进度记录(多人): id={progress.id}, user_id={user_id}, {progress.saved_count} -> {total_saved}")
                                progress.saved_count = total_saved
                            break
                    else:
                        # 该用户尚无进度行，创建一条
                        session.add(LabelProgress(
                            task_id=task_id,
                            user_id=user_id,
                            assigned_count=assigned_count,
                            saved_count=total_saved,
                            created_id=user_id,
                            created_by=username
                        ))
                else:
                    # 单人标注：将同一任务所有进度行统一为任务级 saved_count
                    for progress in progresses:
                        if progress.saved_count != total_saved:
                            logger.info(f"更新进度记录: id={progress.id}, {progress.saved_count} -> {total_saved}")
                            progress.saved_count = total_saved

            await session.flush()
            await session.commit()
            logger.info(f"进度已保存: task_id={task_id}, saved={total_saved}")
            return True

        except Exception as e:
            await session.rollback()
            raise e


async def process_annotation_event(message_data: Dict[str, Any], redis_client) -> bool:
    """处理单条标注事件（含多人标注的批量提交）"""
    try:
        # 多人标注：批量提交消息（仅同步 Redis 暂存集，JFS 已在逐条暂存时写入）
        if message_data.get('type') == 'batch_submit':
            task_id = int(message_data.get('task_id', 0))
            user_id = int(message_data.get('user_id', 0))
            row_numbers_str = message_data.get('row_numbers', '[]')
            if task_id and user_id:
                try:
                    row_numbers = json.loads(row_numbers_str)
                    saved_key = USER_SAVED_ITEMS_KEY.format(task_id=task_id, user_id=user_id)
                    if row_numbers:
                        await redis_client.srem(saved_key, *[str(r) for r in row_numbers])
                    logger.info(f"批量提交已处理: task_id={task_id}, user_id={user_id}, count={len(row_numbers)}")
                except (json.JSONDecodeError, TypeError) as e:
                    logger.warning(f"批量提交消息解析失败: {e}")
            return True

        task_id = int(message_data.get('task_id', 0))
        dataset_id = int(message_data.get('dataset_id', 0))
        user_id = int(message_data.get('user_id', 0))
        username = message_data.get('username', '')
        row_number = int(message_data.get('row_number', 0))
        is_final = message_data.get('is_final') == '1'
        annotation_str = message_data.get('annotation', '{}')
        idempotency_key = message_data.get('idempotency_key', '')
        
        annotation = json.loads(annotation_str)
        
        if not annotation or row_number <= 0:
            return True
        
        # 幂等性检查：使用任务级 Redis Set 判断是否已处理（任务完成清理时一并删除）
        if idempotency_key:
            processed_key = PROCESSED_KEYS_SET.format(task_id=task_id)
            is_new = await redis_client.sadd(processed_key, idempotency_key)
            if not is_new:
                logger.info(f"标注已处理（幂等跳过）: task_id={task_id}, row_number={row_number}")
                return True
        
        async with get_db_session() as session:
            task_result = await session.execute(select(LabelTask).filter(LabelTask.id == task_id))
            task = task_result.scalar_one_or_none()

            dataset = None
            if task.biz_type == LabelTaskBizType.LLM.value:
                dataset_result = await session.execute(
                    select(LabelDataset).filter(LabelDataset.id == dataset_id)
                )
                dataset = dataset_result.scalar_one_or_none()

            elif task.biz_type == LabelTaskBizType.MACHINE_LEARNING.value:
                dataset_result = await session.execute(
                    select(LabelMachineLearningDataset).filter(
                        LabelMachineLearningDataset.id == dataset_id
                    )
                )
                dataset = dataset_result.scalar_one_or_none()

            if not dataset:
                logger.error(f"数据集不存在: dataset_id={dataset_id}")
                return False
            
            # 区分单人标注(online)与多人标注(multi)：单人用任务级 Set 去重，多人用按用户 Set
            task_result = await session.execute(select(LabelTask).filter(LabelTask.id == task_id))
            task = task_result.scalar_one_or_none()
            task_type = (task.task_type if task else None) or "online"
            is_multi = task_type == "multi"

            # 从项目获取 tenant_id（后台任务需要）
            from app.models.models import Project
            from app.utils import app_runtime_context
            project_result = await session.execute(
                select(Project).filter(Project.id == dataset.project_id)
            )
            project = project_result.scalar_one_or_none()
            if not project:
                logger.error(f"项目不存在: project_id={dataset.project_id}")
                return False
            
            # 设置 tenant_id 到上下文（后台任务需要）
            if project.tenant_id:
                app_runtime_context.set_tenant_id(project.tenant_id)
                logger.debug(f"已设置 tenant_id: {project.tenant_id} (project_id={dataset.project_id})")
            else:
                logger.error(f"项目 {dataset.project_id} 的 tenant_id 为空")
                return False
            
            jfs = await get_juicefs_client()

            # 追加写入单条标注到 JFS（持久化）
            written_offset = await append_annotation(jfs, dataset.dataset_path, str(row_number), annotation)
            # 记录“行号 -> 最新 offset”，读取侧可 O(1) seek 到最新标注，避免从头扫描和命中旧值。
            offsets_key = ANNOTATION_OFFSETS_KEY.format(task_id=task_id)
            await redis_client.hset(offsets_key, str(row_number), str(written_offset))

            # JFS 写入成功后，删除 save_annotations 写入的 Redis 实时内容缓存
            # （数据已落盘，缓存使命结束；读取时直接走 JFS）
            annotation_cache_key = f"label:task:{task_id}:annotation:{row_number}"
            await redis_client.delete(annotation_cache_key)

            # 使用 Redis Set 追踪已标注的行（任务级别 - 单人标注使用）
            annotated_key = ANNOTATED_ITEMS_KEY.format(task_id=task_id)
            await redis_client.sadd(annotated_key, str(row_number))
            
            # 同时追踪用户级别的已标注行（多人标注使用）
            user_annotated_key = USER_ANNOTATED_ITEMS_KEY.format(task_id=task_id, user_id=user_id)
            await redis_client.sadd(user_annotated_key, str(row_number))

            # 单人标注(online)：任务级 Set，多账号/重复标注同一行只计一次；多人标注(multi)：按用户 Set
            if is_multi:
                saved_key = USER_SAVED_ITEMS_KEY.format(task_id=task_id, user_id=user_id)
            else:
                saved_key = SAVED_ITEMS_KEY.format(task_id=task_id)
            if is_final:
                removed_from_saved = await redis_client.srem(saved_key, str(row_number))
                logger.info(f"最终提交操作: task_type={task_type}, row_number={row_number}, 从暂存移除={removed_from_saved > 0}")
            else:
                added_to_saved = await redis_client.sadd(saved_key, str(row_number))
                logger.info(f"暂存操作: task_type={task_type}, row_number={row_number}, 添加到暂存={added_to_saved > 0}")
            
            # 保存 dataset 信息供后续使用
            assigned_count = dataset.total_samples or 0
        
        # 更新进度统计（JFS 已写成功，这里只是辅助计数，允许失败后告警而不阻断）
        max_retries = 3
        last_error = None
        saved_key = USER_SAVED_ITEMS_KEY.format(task_id=task_id, user_id=user_id) if is_multi else SAVED_ITEMS_KEY.format(task_id=task_id)
        for retry in range(max_retries):
            try:
                await _update_progress_with_new_session(
                    task_id=task_id,
                    user_id=user_id,
                    username=username,
                    assigned_count=assigned_count,
                    redis_client=redis_client,
                    saved_key=saved_key,
                    is_multi=is_multi
                )
                total_saved = await redis_client.scard(saved_key)
                total_annotated = await redis_client.scard(annotated_key)
                logger.info(f"标注处理成功: task_id={task_id}, row_number={row_number}, saved={total_saved}, annotated={total_annotated}")
                return True
            except Exception as db_error:
                last_error = db_error
                if retry < max_retries - 1:
                    logger.warning(f"进度更新失败，重试 {retry + 1}/{max_retries}: {str(db_error)}")
                    await asyncio.sleep(0.1 * (retry + 1))

        # 所有重试都失败：JFS 标注数据已写入成功，进度统计失败只告警，不阻断 ACK
        logger.error(
            f"进度更新全部重试失败（JFS 已写成功，不影响标注数据）: "
            f"task_id={task_id}, row_number={row_number}, error={last_error}"
        )
        return True  # 仍然返回 True，让消费者 ACK 消息，避免重复写入 JFS
            
    except Exception as e:
        logger.error(f"处理标注事件失败: {str(e)}", exc_info=True)
        # 异常发生时，尝试同步 Redis Set 和数据库状态，避免不一致
        try:
            task_id = int(message_data.get('task_id', 0))
            user_id = int(message_data.get('user_id', 0))
            if task_id > 0 and user_id > 0:
                await _sync_progress_from_redis(task_id, user_id, redis_client)
        except Exception as sync_error:
            logger.error(f"同步进度状态失败: {str(sync_error)}", exc_info=True)
        return False


async def _sync_progress_from_redis(task_id: int, user_id: int, redis_client) -> None:
    """
    从 Redis Set 同步暂存数到数据库，确保一致性

    用于幂等性跳过或异常恢复时，确保 Redis Set 和数据库状态一致
    使用行锁避免和主流程产生竞争条件

    注意：如果任务已完成，跳过同步（防止把 saved_count 置为 0）
    """
    from app.models.label_manager import LabelTask
    
    try:
        async with get_db_session() as session:
            task_result = await session.execute(
                select(LabelTask).filter(LabelTask.id == task_id)
            )
            task = task_result.scalar_one_or_none()
            if task and task.status == 'completed':
                logger.debug(f"任务已完成，跳过进度同步: task_id={task_id}")
                return
            
            is_multi = (task.task_type if task else None) == "multi"
            if is_multi:
                saved_key = USER_SAVED_ITEMS_KEY.format(task_id=task_id, user_id=user_id)
            else:
                saved_key = SAVED_ITEMS_KEY.format(task_id=task_id)
            total_saved = await redis_client.scard(saved_key)

            if is_multi:
                progress_result = await session.execute(
                    select(LabelProgress).filter(
                        LabelProgress.task_id == task_id,
                        LabelProgress.user_id == user_id
                    ).with_for_update()
                )
            else:
                progress_result = await session.execute(
                    select(LabelProgress).filter(LabelProgress.task_id == task_id).with_for_update()
                )
            progresses = progress_result.scalars().all()
            if progresses:
                for progress in progresses:
                    if progress.saved_count != total_saved:
                        logger.info(f"同步进度状态: task_id={task_id}, user_id={progress.user_id}, 旧值={progress.saved_count}, 新值={total_saved}")
                        progress.saved_count = total_saved
                        need_flush = True
                if need_flush:
                    await session.flush()
                    await session.commit()
                    logger.info(f"同步完成: task_id={task_id}, saved={total_saved}")
                else:
                    logger.debug(f"进度状态一致: task_id={task_id}, saved={total_saved}")
            else:
                # 如果数据库中没有记录，但 Redis 中有数据，需要创建一条任务级记录
                if total_saved > 0:
                    logger.warning(f"进度记录不存在，创建任务级进度: task_id={task_id}, saved={total_saved}")
                    progress = LabelProgress(
                        task_id=task_id,
                        user_id=user_id,
                        assigned_count=0,
                        saved_count=total_saved,
                        created_id=user_id,
                        created_by=str(user_id)
                    )
                    session.add(progress)
                    await session.commit()
    except Exception as e:
        logger.error(f"同步进度状态失败: task_id={task_id}, user_id={user_id}, error={str(e)}", exc_info=True)


async def _sync_task_level_progress_on_startup(task_id: int, redis_saved_count: int, redis_client) -> None:
    """
    同步单人任务级暂存数：更新该任务下所有 progress 行为同一去重总数。
    若任务已完成则清理任务级 Redis key。
    """
    from app.models.label_manager import LabelTask

    try:
        async with get_db_session() as session:
            task_result = await session.execute(
                select(LabelTask).filter(LabelTask.id == task_id)
            )
            task = task_result.scalar_one_or_none()
            if task and task.status == 'completed':
                saved_key = SAVED_ITEMS_KEY.format(task_id=task_id)
                await redis_client.delete(saved_key)
                logger.info(f"启动同步: 单人任务 {task_id} 已完成，清理任务级 Redis 残留")
                return
            progress_result = await session.execute(
                select(LabelProgress).filter(LabelProgress.task_id == task_id).with_for_update()
            )
            progresses = progress_result.scalars().all()
            for progress in progresses:
                if progress.saved_count != redis_saved_count:
                    logger.info(f"启动同步(任务级): task_id={task_id}, user_id={progress.user_id}, 旧值={progress.saved_count}, 新值={redis_saved_count}")
                    progress.saved_count = redis_saved_count
            await session.commit()
    except Exception as e:
        logger.error(f"同步任务级进度失败: task_id={task_id}, error={str(e)}", exc_info=True)


async def _sync_all_progress_on_startup(redis_client) -> None:
    """
    启动时同步所有进度数据
    
    扫描 Redis 中所有 saved_items key：
    - 任务级 key label:task:{task_id}:saved_items（单人标注）→ 更新该任务下所有 progress 行
    - 按用户 key label:task:{task_id}:user:{user_id}:saved_items（多人标注）→ 只更新对应用户的 progress 行
    """
    try:
        logger.info("开始启动时进度同步...")
        # 匹配所有 saved_items key（任务级与按用户两种）
        pattern = "label:task:*:saved_items"
        cursor = 0
        synced_user = 0
        synced_task = 0
        while True:
            cursor, keys = await redis_client.scan(cursor=cursor, match=pattern, count=100)
            for key in keys:
                try:
                    key_str = key.decode('utf-8') if isinstance(key, bytes) else key
                    total_saved = await redis_client.scard(key)
                    if ":user:" in key_str:
                        # label:task:{task_id}:user:{user_id}:saved_items
                        parts = key_str.split(':')
                        if len(parts) >= 5:
                            task_id = int(parts[2])
                            user_id = int(parts[4])
                            await _sync_task_progress_on_startup(task_id, user_id, total_saved, redis_client)
                            synced_user += 1
                    else:
                        # label:task:{task_id}:saved_items 单人任务级
                        parts = key_str.split(':')
                        if len(parts) >= 3:
                            task_id = int(parts[2])
                            await _sync_task_level_progress_on_startup(task_id, total_saved, redis_client)
                            synced_task += 1
                except Exception as key_error:
                    logger.warning(f"同步 key {key} 失败: {str(key_error)}")
            if cursor == 0:
                break
        logger.info(f"启动时进度同步完成: 按用户 {synced_user} 个, 任务级(单人) {synced_task} 个")
        
    except Exception as e:
        logger.error(f"启动时进度同步失败: {str(e)}", exc_info=True)


async def _sync_task_progress_on_startup(task_id: int, user_id: int, redis_saved_count: int, redis_client) -> None:
    """
    同步单个 (task_id, user_id) 的进度：只更新该用户的 progress 行。
    若任务已完成则清理该用户的 Redis key。
    """
    from app.models.label_manager import LabelTask
    
    try:
        async with get_db_session() as session:
            task_result = await session.execute(
                select(LabelTask).filter(LabelTask.id == task_id)
            )
            task = task_result.scalar_one_or_none()
            if task and task.status == 'completed':
                # 任务已完成，清理 Redis 数据而不是同步
                saved_key = SAVED_ITEMS_KEY.format(task_id=task_id)
                annotated_key = ANNOTATED_ITEMS_KEY.format(task_id=task_id)
                processed_key = PROCESSED_KEYS_SET.format(task_id=task_id)
                await redis_client.delete(saved_key, annotated_key, processed_key)
                logger.info(f"启动同步: 任务 {task_id} 已完成，清理 Redis 残留数据")
                return
            progress_result = await session.execute(
                select(LabelProgress).filter(
                    LabelProgress.task_id == task_id,
                    LabelProgress.user_id == user_id
                ).with_for_update()
            )
            progresses = progress_result.scalars().all()
            for progress in progresses:
                if progress.saved_count != redis_saved_count:
                    logger.info(f"启动同步: task_id={task_id}, user_id={user_id}, 旧值={progress.saved_count}, 新值={redis_saved_count}")
                    progress.saved_count = redis_saved_count
            await session.commit()
    except Exception as e:
        logger.error(f"同步任务 {task_id} 用户 {user_id} 进度失败: {str(e)}", exc_info=True)


async def _ensure_consumer_group(redis_client) -> None:
    """确保消费者组存在"""
    try:
        await redis_client.xgroup_create(
            name=STREAM_NAME,
            groupname=CONSUMER_GROUP,
            id='0',
            mkstream=True
        )
        logger.info(f"创建消费者组: {CONSUMER_GROUP}")
    except Exception as e:
        if 'BUSYGROUP' not in str(e):
            logger.warning(f"创建消费者组失败: {str(e)}")


def _decode_stream_message(msg_data: dict) -> dict:
    """解码 Redis Streams 消息（bytes → str）"""
    return {
        (k.decode('utf-8') if isinstance(k, bytes) else k):
        (v.decode('utf-8') if isinstance(v, bytes) else v)
        for k, v in msg_data.items()
    }


async def _process_and_ack(redis_client, msg_id, msg_data: dict) -> None:
    """处理单条消息并 ACK"""
    decoded_data = _decode_stream_message(msg_data)
    success = await process_annotation_event(decoded_data, redis_client)
    if success:
        await redis_client.xack(STREAM_NAME, CONSUMER_GROUP, msg_id)
    else:
        logger.warning(f"消息处理失败，留在 PEL 等待下次 XAUTOCLAIM 重试: msg_id={msg_id}")


async def _reclaim_pending_messages(redis_client, consumer_name: str) -> None:
    """
    使用 XAUTOCLAIM 将 PEL 中超过 30 秒未 ACK 的消息重新分配给当前消费者并处理。
    解决消息处理失败后永久卡死在 PEL 的问题。
    """
    try:
        # XAUTOCLAIM: 将超过 min_idle_time 毫秒未 ACK 的消息转移给当前消费者
        result = await redis_client.xautoclaim(
            name=STREAM_NAME,
            groupname=CONSUMER_GROUP,
            consumername=consumer_name,
            min_idle_time=10000,  # 10 秒未 ACK 视为失败，重新投递
            start_id='0-0',
            count=10
        )
        # result = (next_start_id, [(msg_id, msg_data), ...], [deleted_ids])
        pending_messages = result[1] if result and len(result) > 1 else []
        if pending_messages:
            logger.info(f"XAUTOCLAIM 捞回 {len(pending_messages)} 条 PEL 消息进行重试")
            for msg_id, msg_data in pending_messages:
                await _process_and_ack(redis_client, msg_id, msg_data)
    except Exception as e:
        # XAUTOCLAIM 是 Redis 6.2+ 命令，旧版本不支持时降级跳过
        if 'unknown command' in str(e).lower() or 'wrong number' in str(e).lower():
            logger.debug("当前 Redis 版本不支持 XAUTOCLAIM，跳过 PEL 重试")
        else:
            logger.error(f"XAUTOCLAIM 处理 PEL 消息出错: {str(e)}", exc_info=True)


async def _consume_loop(redis_client, consumer_name: str) -> None:
    """消费循环"""
    global _is_running

    logger.info(f"开始监听标注事件: stream={STREAM_NAME}, consumer={consumer_name}")

    # 每隔多少轮新消息处理，执行一次 PEL 捞回（约 10 秒间隔）
    _reclaim_interval = 2  # block=5000ms * 2 ≈ 10s
    _loop_count = 0

    while _is_running:
        try:
            # 定期处理 PEL 中滞留的失败消息
            _loop_count += 1
            if _loop_count >= _reclaim_interval:
                _loop_count = 0
                await _reclaim_pending_messages(redis_client, consumer_name)

            # 读取新消息
            messages = await redis_client.xreadgroup(
                groupname=CONSUMER_GROUP,
                consumername=consumer_name,
                streams={STREAM_NAME: '>'},
                count=10,
                block=5000
            )

            if not messages:
                continue

            for stream, stream_messages in messages:
                for msg_id, msg_data in stream_messages:
                    await _process_and_ack(redis_client, msg_id, msg_data)

        except asyncio.CancelledError:
            logger.info("标注事件监听已取消")
            break
        except Exception as e:
            logger.error(f"消费标注事件出错: {str(e)}", exc_info=True)
            await asyncio.sleep(1)


async def start_annotation_consumer() -> None:
    """启动标注事件消费者（在应用启动时调用）"""
    global _consumer_task, _is_running
    
    if _is_running:
        logger.warning("标注事件消费者已在运行")
        return
    
    redis_client = settings.REDIS_CLIENT
    if redis_client is None:
        logger.error("Redis 客户端未初始化，无法启动标注事件消费者")
        return
    
    await _ensure_consumer_group(redis_client)
    
    # 启动时同步所有进度数据，修复可能的不一致
    await _sync_all_progress_on_startup(redis_client)
    
    consumer_name = f"consumer_{os.getpid()}"
    _is_running = True
    _consumer_task = asyncio.create_task(_consume_loop(redis_client, consumer_name))
    
    logger.info("标注事件消费者已启动")


async def stop_annotation_consumer() -> None:
    """停止标注事件消费者（在应用关闭时调用）"""
    global _consumer_task, _is_running
    
    if not _is_running:
        return
    
    _is_running = False
    
    if _consumer_task:
        _consumer_task.cancel()
        try:
            await _consumer_task
        except asyncio.CancelledError:
            pass
        _consumer_task = None
    
    logger.info("标注事件消费者已停止")


async def _copy_dataset_label_async_impl(
    self: TaskBase,
    source_path: str,
    target_path: str,
    tenant_id: str,
    task_id: int,
    success_status: str,
    source_file_name: str,
    target_file_name: str,
) -> bool:
    """在单事件循环内完成 JFS 复制与可选任务状态更新，供 Celery 经 run_async_in_celery 调用。"""
    if tenant_id:
        app_runtime_context.set_tenant_id(tenant_id)

    storage = get_storage_service()
    jfs = await storage.JUICEFS_CLIENT(tenant_id)
    if not jfs.exists(source_path):
        err = f"复制数据集失败：源路径不存在 tenant_id={tenant_id} source={source_path}"
        self._log_error(err)
        raise FileNotFoundError(err)
    remote_dir = os.path.dirname(target_path)
    if remote_dir and not jfs.exists(remote_dir):
        jfs.makedirs(remote_dir, exist_ok=True)
    # 仅当拷贝目标是「目录」时再 makedirs(target_path)。LLM 文本等场景 target_path 为 *.jsonl 单文件，
    # 若对其 makedirs 会在 JFS 上建出同名目录，后续 open 该路径会报 Is a directory（Errno 21）。
    clone_dst_is_directory = not str(target_path).lower().endswith(".jsonl")
    if clone_dst_is_directory:
        try:
            jfs.makedirs(target_path, exist_ok=True)
        except Exception:
            pass
    self._log_start(f"开始复制数据集: {source_path} -> {target_path}")
    cloner = JFSSelectiveCloner(jfs, max_workers=8, dry_run=False)
    cloner.clone(source_path, target_path, exclude_files=["data_index.cache"])
    if source_file_name and target_file_name and source_file_name != target_file_name:
        source_stat = jfs.stat(source_path)
        if stat.S_ISDIR(source_stat.st_mode):
            cloned_file_path = os.path.join(target_path, source_file_name).replace("\\", "/")
            renamed_file_path = os.path.join(target_path, target_file_name).replace("\\", "/")
            if jfs.exists(cloned_file_path) and not jfs.exists(renamed_file_path):
                jfs.rename(cloned_file_path, renamed_file_path)
                self._log_complete(
                    f"复制后重命名完成: {cloned_file_path} -> {renamed_file_path}"
                )
    if task_id:
        async with get_db_session() as session:
            task_result = await session.execute(
                select(LabelTask).filter(LabelTask.id == task_id)
            )
            task = task_result.scalar_one_or_none()
            if task and task.status != success_status:
                task.status = success_status
                await session.commit()
    self._log_complete(f"复制数据集完成: {target_path}")
    return True


@celery_app.task(base=TaskBase, bind=True)
def copy_dataset_label_async(
    self: TaskBase,
    source_path: str,
    target_path: str,
    tenant_id: str,
    task_id: int = 0,
    success_status: str = "created",
    source_file_name: str = "",
    target_file_name: str = "",
) -> bool:
    """
    异步复制数据集到标注任务数据集（Celery 任务使用 JFSSelectiveCloner）
    """
    try:
        return run_async_in_celery(
            _copy_dataset_label_async_impl(
                self,
                source_path,
                target_path,
                tenant_id,
                task_id,
                success_status,
                source_file_name,
                target_file_name,
            )
        )
    except Exception as e:
        self._log_error(f"复制数据集失败: {e}")
        raise