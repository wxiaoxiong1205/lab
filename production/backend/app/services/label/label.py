import asyncio
import json
import os
import shutil
from typing import Optional, Dict, Any, Set, Tuple, Union, List

from fastapi import HTTPException, UploadFile
from fastapi_pagination import Page
from sqlalchemy import select, func, delete, update

from app.core.logging import logger
from app.models.label_manager import (
    LabelDataset,
    LabelTask,
    LabelProgress,
    LabelAutoModel,
    LabelMachineLearningDataset,
    LabelTaskMember,
)
from app.models.models import InferenceService
from app.models.models import JwtUserInfo, MachineLearningDataset
from app.models.training_dataset_manager import TrainingDataset
from app.repository.label_auto_model_mapper import LabelAutoModelMapper
from app.repository.label_dataset_mapper import LabelDatasetMapper
from app.repository.label_progress_mapper import LabelProgressMapper
from app.repository.label_task_mapper import LabelTaskMapper
from app.repository.training_dataset_mapper import TrainingDatasetMapper
from app.schemas.label import (
    LabelDatasetResponse,
    LabelTaskCreate, LabelTaskResponse, LabelTaskDetailResponse,
    LabelProgressResponse,
    AnnotationSaveRequest, AnnotationSaveResponse,
    AnnotationDataItem, AnnotationDataResponse,
    LabelTaskStatus, LabelDatasetSource, LabelDatasetType, LabelDatasetFormat,
    LabelTaskType, LabelTaskBizType, LabelMachineLearningDatasetResponse,
    LabelAutoModelCreate, LabelAutoModelResponse,
    AIAnnotationRequest, AIAnnotationTarget,
    AnnotationCompletionStatusResponse, dataset_model_map,
    LabelTagCreateRequest, LabelTagListResponse, LabelTagItemResponse, LabelTagCreateResponse,
    LabelTagCreateItemResponse,
    LabelTagUpdateRequest, LabelTagUpdateResponse,
)
from app.schemas.machine_learning_dataset import format_machine_learning_dataset_display_name, MachineLearningDatasetTemplateType
from app.schemas.training_dataset import DatasetUsage
from app.schemas.training_task import TrainingTypeCategory, TrainingMethodType
from app.services.storage.interface import StorageService
from app.utils.model_caller import (
    ModelConfig, InferenceParams
)
from app.utils.name_validator import validate_name_format
from app.utils.storage_enum import StoragePath
from app.utils.dataset_file_parser import collect_metadata_fields_from_jsonl_iterable
from app.utils.validators import (
    validate_project_exists,
    check_dataset_in_use,
    DatasetTaskCreationKind,
)
from .interface import LabelService
from ...core import settings
from ...utils import app_runtime_context


class DefaultLabelService(LabelService):
    """标注服务实现类"""
    # 标签删除影响行数保护阈值：
    # 超限直接拒绝，避免误操作导致全量任务被“强制回滚”。
    ML_LABEL_DELETE_ROLLBACK_LIMIT = 10000

    IMAGE_ASSET_DATASET_TYPES = {
        LabelDatasetType.IMAGE_UNDERSTANDING.value,
        LabelDatasetType.IMAGE_GENERATION.value,
    }
    
    def __init__(
        self,
        dataset_mapper: LabelDatasetMapper,
        training_dataset_mapper: TrainingDatasetMapper,
        task_mapper: LabelTaskMapper,
        progress_mapper: LabelProgressMapper,
        auto_model_mapper: LabelAutoModelMapper,
        storage: StorageService
    ) -> None:
        super().__init__(
            dataset_mapper,
            training_dataset_mapper,
            task_mapper,
            progress_mapper,
            auto_model_mapper,
            storage,
        )

    # ------------------------------ 内部辅助方法 ------------------------------
    async def _get_juicefs_client(self) -> Any:
        """获取JuiceFS客户端（通过注入的StorageService）"""
        from app.utils import app_runtime_context
        tenant_id = app_runtime_context.get_tenant_id()
        return await self.storage.JUICEFS_CLIENT(tenant_id)

    @staticmethod
    def _decode_redis_members(members: Set[Any]) -> Set[str]:
        """把 Redis smembers 结果统一为字符串集合。"""
        return {
            m.decode() if isinstance(m, bytes) else str(m)
            for m in (members or set())
        }

    @staticmethod
    def _ml_label_class_usage_key(task_id: int, class_id: str) -> str:
        return f"label:task:{task_id}:class_usage:{class_id}"

    @staticmethod
    def _ml_label_counter_key(task_id: int) -> str:
        return f"label:task:{task_id}:label_id_counter"

    @staticmethod
    def _get_max_label_schema_class_id(schema: Dict[str, Any]) -> int:
        existing_ids = [int(k) for k in schema.keys() if str(k).isdigit()]
        return max(existing_ids) if existing_ids else 0

    async def _allocate_ml_label_class_id(
        self,
        task_id: int,
        schema: Dict[str, Any],
        redis_client: Any,
    ) -> int:
        counter_key = self._ml_label_counter_key(task_id)
        max_existing_id = self._get_max_label_schema_class_id(schema)
        try:
            exists = await redis_client.exists(counter_key)
            if not exists:
                await redis_client.set(counter_key, max_existing_id)
            return int(await redis_client.incr(counter_key))
        except Exception as e:
            logger.warning(
                f"Redis 分配标签ID失败，降级使用 schema 最大值+1: task_id={task_id}, error={e}"
            )
            return max_existing_id + 1

    @staticmethod
    def _annotation_offsets_key(task_id: int) -> str:
        return f"label:task:{task_id}:annotation_offsets"

    @staticmethod
    def _annotation_offsets_jfs_path(dataset_path: str) -> str:
        return dataset_path.replace(".jsonl", ".annotations.offsets.json")

    async def _get_annotation_offset_from_jfs(
        self,
        dataset_path: str,
        target_row: int
    ) -> Optional[int]:
        """
        从 JFS 持久化 offsets 文件读取指定行号的 offset。
        仅在 Redis offset 缺失时使用，避免直接退化为扫描整份 annotations 文件。
        """
        jfs = await self._get_juicefs_client()
        offsets_path = self._annotation_offsets_jfs_path(dataset_path)
        if not jfs.exists(offsets_path):
            return None
        try:
            with jfs.open(offsets_path, "r", encoding="utf-8") as f:
                content = f.read()
            if not content.strip():
                return None
            offsets = json.loads(content)
            if not isinstance(offsets, dict):
                return None
            raw_offset = offsets.get(str(target_row))
            if raw_offset is None:
                return None
            offset = int(raw_offset)
            return offset if offset >= 0 else None
        except Exception as e:
            logger.warning(
                f"读取 JFS offsets 失败: dataset_path={dataset_path}, row={target_row}, error={e}"
            )
            return None

    async def _persist_annotation_offsets_to_jfs(
        self,
        redis_client,
        task_id: int,
        dataset_path: str
    ) -> int:
        """
        将 Redis 中的 annotation_offsets 持久化到 JFS。
        返回成功写入的 offset 条数。
        """
        try:
            offsets_key = self._annotation_offsets_key(task_id)
            raw_offsets = await redis_client.hgetall(offsets_key)
            if not raw_offsets:
                return 0

            normalized: Dict[str, int] = {}
            for raw_k, raw_v in raw_offsets.items():
                k = raw_k.decode() if isinstance(raw_k, bytes) else str(raw_k)
                if not k.isdigit():
                    continue
                try:
                    v = int(raw_v.decode() if isinstance(raw_v, bytes) else raw_v)
                except (TypeError, ValueError):
                    continue
                if v >= 0:
                    normalized[k] = v

            if not normalized:
                return 0

            jfs = await self._get_juicefs_client()
            offsets_path = self._annotation_offsets_jfs_path(dataset_path)
            remote_dir = os.path.dirname(offsets_path)
            if remote_dir and not jfs.exists(remote_dir):
                jfs.makedirs(remote_dir, exist_ok=True)
            with jfs.open(offsets_path, "w", encoding="utf-8") as f:
                f.write(json.dumps(normalized, ensure_ascii=False))
            return len(normalized)
        except Exception as e:
            logger.warning(
                f"持久化 offsets 到 JFS 失败: task_id={task_id}, dataset_path={dataset_path}, error={e}"
            )
            return 0

    @staticmethod
    def _extract_ml_class_ids_from_annotation(annotation: Any) -> Set[str]:
        """
        从机器学习标注内容中提取 class_id 集合。
        - 分类任务：annotation 通常是 [0, 2] / ["0", "2"]
        - 检测/分割任务：annotation 通常是 [{"class_id": 1, ...}, ...]
        """
        class_ids: Set[str] = set()

        def _normalize_class_id(raw: Any) -> Optional[str]:
            if isinstance(raw, int) and raw >= 0:
                return str(raw)
            if isinstance(raw, str) and raw.isdigit():
                return str(int(raw))
            return None

        def _walk_container(value: Any) -> None:
            if isinstance(value, dict):
                normalized = _normalize_class_id(value.get("class_id"))
                if normalized is not None:
                    class_ids.add(normalized)
                for item in value.values():
                    if isinstance(item, (dict, list, tuple, set)):
                        _walk_container(item)
                return
            if isinstance(value, (list, tuple, set)):
                for item in value:
                    if isinstance(item, (dict, list, tuple, set)):
                        _walk_container(item)

        if isinstance(annotation, list):
            for item in annotation:
                normalized = _normalize_class_id(item)
                if normalized is not None:
                    class_ids.add(normalized)
                    continue
                if isinstance(item, (dict, list, tuple, set)):
                    _walk_container(item)
        elif isinstance(annotation, (dict, tuple, set)):
            _walk_container(annotation)

        return class_ids

    async def _rollback_ml_annotations_for_deleted_class(
        self,
        task: LabelTask,
        dataset: LabelMachineLearningDataset,
        class_id: int,
        redis_client: Any
    ) -> None:
        """
        删除机器学习标签时，强制回滚所有命中样本：
        1) 从 saved_items / annotated_items 移除
        2) 删除实时 annotation 缓存
        3) 清理 class -> rows 索引

        设计原则（宁可错杀）：
        - 行上只要出现过被删除 class_id，即整行回退到“未标注”
        - 不做“剩余标签是否还能保留”的细粒度判断

        注意：仅清 Redis 时，读取侧仍按 JFS 最新行判定状态，故必须追加空标注落盘并更新 offset，
        否则单图多标签删类后该行仍表现为「已暂存/已完成」。
        """
        usage_key = self._ml_label_class_usage_key(task.id, str(class_id))
        saved_key = f"label:task:{task.id}:saved_items"
        annotated_key = f"label:task:{task.id}:annotated_items"
        raw_rows = await redis_client.smembers(usage_key)
        decoded_rows = self._decode_redis_members(raw_rows)
        row_numbers = sorted((row for row in decoded_rows if row.isdigit()), key=int)
        invalid_rows = decoded_rows.difference(row_numbers)
        if invalid_rows:
            logger.warning(
                "删除标签发现非数字行号，已跳过: task_id=%s class_id=%s rows=%s",
                task.id,
                class_id,
                list(invalid_rows)[:10]
            )

        if len(row_numbers) > self.ML_LABEL_DELETE_ROLLBACK_LIMIT:
            # 防误删：影响范围过大时直接阻断，要求人工确认/分批处理。
            raise HTTPException(
                status_code=400,
                detail=(
                    f"删除标签将影响 {len(row_numbers)} 条数据，超过限制 "
                    f"{self.ML_LABEL_DELETE_ROLLBACK_LIMIT}，请分批处理或联系管理员"
                )
            )

        annotator_user_ids: List[int] = []
        if task.task_type == LabelTaskType.MULTI.value:
            session = await self.task_mapper.get_session()
            member_result = await session.execute(
                select(LabelTaskMember.user_id).where(
                    LabelTaskMember.task_id == task.id,
                    LabelTaskMember.role == "annotator",
                ).distinct()
            )
            annotator_user_ids = [row[0] for row in member_result.all()]
            if not annotator_user_ids:
                prog_result = await session.execute(
                    select(LabelProgress.user_id).where(LabelProgress.task_id == task.id)
                )
                annotator_user_ids = list({row[0] for row in prog_result.all()})

        # 一次 pipeline 保证状态统一落地，避免出现“删了一半”的中间态。
        pipe = redis_client.pipeline()
        for row in row_numbers:
            # 关键点1：回退任务进度（暂存/已标注集合都移除）
            pipe.srem(saved_key, row)
            pipe.srem(annotated_key, row)
            # 关键点2：清掉实时标注缓存，防止 UI 读到旧值
            pipe.delete(f"label:task:{task.id}:annotation:{row}")
            # 多人标注：每人一套 saved_items / annotated_items，否则删类后进度不回退
            if task.task_type == LabelTaskType.MULTI.value:
                for uid in annotator_user_ids:
                    pipe.srem(f"label:task:{task.id}:user:{uid}:saved_items", row)
                    pipe.srem(f"label:task:{task.id}:user:{uid}:annotated_items", row)
        # 关键点3：清掉反向索引（class_id -> rows）
        pipe.delete(usage_key)
        await pipe.execute()

        if not row_numbers:
            return

        await self._persist_empty_ml_annotations_after_class_delete(
            task_id=task.id,
            dataset_path=dataset.dataset_path,
            row_numbers=row_numbers,
            redis_client=redis_client,
        )

        if task.task_type == LabelTaskType.MULTI.value:
            await self._sync_multi_annotator_saved_counts_from_redis(
                task_id=task.id,
                annotator_user_ids=annotator_user_ids,
                redis_client=redis_client,
            )
        else:
            await self._sync_online_task_saved_count_from_redis(
                task_id=task.id,
                cap_samples=dataset.total_samples or 0,
                redis_client=redis_client,
            )

    async def _persist_empty_ml_annotations_after_class_delete(
        self,
        task_id: int,
        dataset_path: Optional[str],
        row_numbers: List[str],
        redis_client: Any,
    ) -> None:
        """
        删类回滚后向 .annotations.jsonl 追加空标注行，使「按文件尾覆盖」的读取与单人 consumer 一致。
        同时更新 Redis annotation_offsets，避免其它读路径仍指向旧 offset。
        """
        if not dataset_path or not row_numbers:
            return
        try:
            from app.tasks.label_tasks import append_annotation

            jfs = await self._get_juicefs_client()
            offsets_key = self._annotation_offsets_key(task_id)
            for row in row_numbers:
                offset = await append_annotation(jfs, dataset_path, str(row), {})
                if redis_client is not None:
                    await redis_client.hset(offsets_key, str(row), str(offset))
        except Exception as e:
            logger.error(
                "删类回滚落盘空标注失败: task_id=%s row_count=%s error=%s",
                task_id,
                len(row_numbers),
                e,
                exc_info=True,
            )
            raise HTTPException(status_code=500, detail=f"删标签后更新标注文件失败: {e}") from e

    async def _read_annotations_file(self, dataset_path: str) -> Dict[str, Any]:
        """读取标注文件（annotations.jsonl）全量进内存，仅在不关心内存时使用。"""
        jfs = await self._get_juicefs_client()
        annotations_path = dataset_path.replace('.jsonl', '.annotations.jsonl')
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
                            item_id = item.get('item_id') or str(item.get('row_number', ''))
                            if item_id:
                                annotations[item_id] = item.get('annotation', {})
                        except json.JSONDecodeError:
                            logger.warning(f"跳过无效JSON行: {line}")
            except Exception as e:
                logger.error(f"读取标注文件失败: {str(e)}", exc_info=True)
        return annotations

    async def _read_annotated_row_ids(self, dataset_path: str) -> Set[str]:
        """流式读取标注文件，只收集已标注的行号集合，不存标注内容，避免大文件 OOM。"""
        jfs = await self._get_juicefs_client()
        annotations_path = dataset_path.replace('.jsonl', '.annotations.jsonl')
        ids: Set[str] = set()
        if not jfs.exists(annotations_path):
            return ids
        try:
            with jfs.open(annotations_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                        item_id = item.get('item_id') or str(item.get('row_number', ''))
                        if item_id:
                            ids.add(item_id)
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.error(f"读取标注文件行号失败: {str(e)}", exc_info=True)
        return ids

    async def _read_annotation_for_row(self, task_id: int, dataset_path: str, target_row: int) -> Optional[Dict[str, Any]]:
        """
        读取指定行号标注：
        1) 优先走 Redis offset 索引，直接 seek 到最新写入位置
        2) 索引缺失/失效时降级全量扫描，但取“最后一次命中”避免读到旧值
        """
        jfs = await self._get_juicefs_client()
        annotations_path = dataset_path.replace('.jsonl', '.annotations.jsonl')
        target_id = str(target_row)
        if not jfs.exists(annotations_path):
            return None

        redis_client = settings.REDIS_CLIENT
        if redis_client:
            try:
                offset_key = self._annotation_offsets_key(task_id)
                raw_offset = await redis_client.hget(offset_key, target_id)
                if raw_offset is None:
                    # Redis 被清理后，尝试从 JFS 侧车索引恢复单行 offset。
                    jfs_offset = await self._get_annotation_offset_from_jfs(dataset_path, target_row)
                    if jfs_offset is not None:
                        raw_offset = str(jfs_offset)
                if raw_offset is not None:
                    offset = int(raw_offset.decode() if isinstance(raw_offset, bytes) else raw_offset)
                    with jfs.open(annotations_path, 'r', encoding='utf-8') as f:
                        f.seek(offset)
                        line = f.readline()
                    if line:
                        try:
                            item = json.loads(line.strip())
                            item_id = item.get('item_id') or str(item.get('row_number', ''))
                            if item_id == target_id:
                                return item.get('annotation') or {}
                        except json.JSONDecodeError:
                            pass
            except Exception as e:
                logger.warning(
                    f"读取 offset 索引失败，降级全量扫描: task_id={task_id}, row={target_row}, error={e}"
                )

        try:
            latest_annotation = None
            with jfs.open(annotations_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                        item_id = item.get('item_id') or str(item.get('row_number', ''))
                        if item_id == target_id:
                            latest_annotation = item.get('annotation') or {}
                    except json.JSONDecodeError:
                        continue
            return latest_annotation
        except Exception as e:
            logger.warning(f"读取标注行 {target_row} 失败: {e}")
        return None

    def _build_annotation_offset_index(self, jfs, annotations_path: str) -> Dict[str, int]:
        """
        流式扫描标注文件，只记录每行的 item_id -> 行起始 offset，不存标注内容，避免大文件 OOM。
        合并时按 offset seek 再读单行即可。
        """
        index: Dict[str, int] = {}
        if not jfs.exists(annotations_path):
            return index
        try:
            with jfs.open(annotations_path, 'r', encoding='utf-8') as f:
                while True:
                    offset = f.tell()
                    line = f.readline()
                    if not line:
                        break
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                        item_id = item.get('item_id') or str(item.get('row_number', ''))
                        if item_id:
                            index[item_id] = offset
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.error(f"构建标注 offset 索引失败: {e}", exc_info=True)
        return index

    def _stream_merge_to_path(
        self,
        jfs,
        raw_path: str,
        annotations_path: str,
        offset_index: Dict[str, int],
        redis_annotations: Dict[str, Any],
        dataset: LabelDataset,
        out_path: str
    ) -> Tuple[int, int]:
        """
        流式合并：逐行读 raw，按 offset 按需读标注，合并后直接写入 out_path，不积压 merged 列表，避免 OOM。
        返回 (total_samples, total_characters)。
        """
        total_samples = 0
        total_characters = 0
        row_number = 1
        with jfs.open(raw_path, 'r', encoding='utf-8') as raw_f, \
             jfs.open(out_path, 'w', encoding='utf-8') as out_f:
            ann_f = None
            try:
                for line in raw_f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    try:
                        parsed_data = json.loads(line)
                        if isinstance(parsed_data, list):
                            item = parsed_data[0] if parsed_data else None
                        elif isinstance(parsed_data, dict):
                            item = parsed_data
                        else:
                            continue
                        if item is None:
                            continue
                        item_id = str(row_number)
                        annotation = redis_annotations.get(item_id)
                        if annotation is None and item_id in offset_index:
                            if ann_f is None:
                                ann_f = jfs.open(annotations_path, 'r', encoding='utf-8')
                            ann_f.seek(offset_index[item_id])
                            ann_line = ann_f.readline()
                            if ann_line:
                                try:
                                    ann_item = json.loads(ann_line.strip())
                                    annotation = ann_item.get('annotation') if isinstance(ann_item, dict) else None
                                except json.JSONDecodeError:
                                    pass
                        if annotation and isinstance(annotation, dict):
                            item = self._merge_annotation_to_item(item, annotation, dataset.dataset_format)
                        if (
                            dataset.dataset_type in self.IMAGE_ASSET_DATASET_TYPES
                            or dataset.dataset_format == LabelDatasetFormat.GRPO.value
                        ):
                            merged_line = json.dumps(item, ensure_ascii=False)
                        else:
                            merged_line = '[' + json.dumps(item, ensure_ascii=False) + ']'
                        out_f.write(merged_line + '\n')
                        total_samples += 1
                        total_characters += len(merged_line)
                        row_number += 1
                    except (json.JSONDecodeError, Exception) as e:
                        logger.warning(f"处理数据行失败: row_number={row_number}, 错误: {str(e)}")
                        continue
            finally:
                if ann_f is not None:
                    try:
                        ann_f.close()
                    except Exception:
                        pass
        return total_samples, total_characters

    def _generate_dataset_path(self, namespace: str, dataset_name: str, file_extension: str = 'jsonl',
                               module_prefix: str = 'label', dataset_id: int = None,
                               biz_type: str = LabelTaskBizType.LLM.value) -> str:
        """生成数据集在JuiceFS中的存储路径
        
        Args:
            namespace: 命名空间
            dataset_name: 数据集名称
            file_extension: 文件扩展名
            module_prefix: 模块前缀，用于区分不同模块的数据集（如 'label' 表示标注数据集）
            dataset_id: 数据集ID，用于确保路径唯一性（作为路径的一部分，而不是文件名的一部分）
        """
        base_path = None
        filename = None
        if biz_type == LabelTaskBizType.LLM.value:
            base_path = StoragePath.REGISTERED_LABEL_DATASETS.format_storage_path(namespace=namespace)
            filename = f"{module_prefix}_{dataset_name}.{file_extension}"
        elif biz_type == LabelTaskBizType.MACHINE_LEARNING.value:
            base_path = StoragePath.REGISTERED_LABEL_ML_DATASETS.format_storage_path(namespace=namespace)
            filename = f"{dataset_name}/dataset.{file_extension}"

        if dataset_id:
            # ID作为路径的一部分：/{namespace}/label/datasets/{dataset_id}/label_{dataset_name}.jsonl
            return f"{base_path}{dataset_id}/{filename}"
        else:
            return f"{base_path}{filename}"

    def _generate_image_folder_path(
        self,
        namespace: str,
        dataset_id: int,
        biz_type: LabelTaskBizType = LabelTaskBizType.LLM
    ) -> str:
        """
        生成图像理解数据集的图片文件夹路径（用于标注数据集）
        
        Args:
            namespace: 命名空间
            dataset_id: 数据集ID
            
        Returns:
            str: 图片文件夹路径（完整路径，以 / 开头，用于 JuiceFS 操作）
        """
        # 标注数据集的图片文件夹路径：/{namespace}/label/datasets/{dataset_id}/images
        base_path = None
        if biz_type == LabelTaskBizType.LLM:
            base_path = f"{StoragePath.REGISTERED_LABEL_DATASETS.format_storage_path(namespace=namespace)}{dataset_id}/images"
        elif biz_type == LabelTaskBizType.MACHINE_LEARNING:
            base_path = f"{StoragePath.REGISTERED_LABEL_ML_DATASETS.format_storage_path(namespace=namespace)}{dataset_id}"
        return base_path
    
    def _generate_training_image_folder_path(
        self,
        namespace: str,
        dataset_name: str,
        version: str,
        usage: DatasetUsage,
        dataset_type: str = LabelDatasetType.IMAGE_UNDERSTANDING.value,
    ) -> str:
        """
        生成训练数据集的图片文件夹路径
        
        路径格式：/{namespace}/{usage}/datasets/imageUnderstanding/{dataset_name}_{version}/images
        
        Args:
            namespace: 命名空间
            dataset_name: 数据集名称
            version: 版本号
            usage: 数据集用途
            
        Returns:
            str: 图片文件夹路径
        """
        # 生成基础路径
        if usage == DatasetUsage.TRAINING:
            base_path = StoragePath.REGISTERED_TRAINED_DATASETS.format_storage_path(namespace=namespace)
        elif usage == DatasetUsage.VALIDATION:
            base_path = StoragePath.REGISTERED_VALIDATION_DATASETS.format_storage_path(namespace=namespace)
        elif usage == DatasetUsage.TEST:
            base_path = StoragePath.REGISTERED_TEST_DATASETS.format_storage_path(namespace=namespace)
        else:
            raise HTTPException(status_code=400, detail=f"不支持当前所选的数据集类型：{usage}")
        
        image_dir = 'imageGeneration' if dataset_type == LabelDatasetType.IMAGE_GENERATION.value else 'imageUnderstanding'
        base_path = os.path.join(base_path, image_dir)
        dataset_dir = os.path.join(base_path, f"{dataset_name}_{version}")
        return os.path.join(dataset_dir, 'images').replace('\\', '/')

    async def _build_base_url_for_label_dataset(self, project_id: int, dataset: Union[
        LabelDataset, LabelMachineLearningDataset], biz_type: LabelTaskBizType = LabelTaskBizType.LLM) -> Optional[str]:
        """为标注数据集生成图片访问的基础URL
        
        Args:
            project_id: 项目ID
            dataset: 标注数据集对象
            
        Returns:
            base_url: 图片访问的基础URL，格式为 {tenant_id}/{图片文件夹路径}/
                     用于拼接下载URL：/api/v1/storage/download/{base_url}{image_name}
        """
        from app.utils import app_runtime_context
        tenant_id = app_runtime_context.get_tenant_id()
        
        if tenant_id:
            # 生成项目命名空间
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
            
            # 生成图片文件夹路径（完整路径，以 / 开头）
            image_folder_path = self._generate_image_folder_path(namespace, dataset.id, biz_type)
            
            # 去掉开头的 /，因为下载接口路径格式是 /api/v1/storage/download/{tenant_id}/{path}
            # 如果 image_folder_path 以 / 开头，拼接后会有双斜杠
            image_folder_path_relative = image_folder_path.lstrip('/')
            
            # 生成 base_url：{tenant_id}/{图片文件夹路径}/
            # 格式：{tenant_id}/{namespace}/label/datasets/{dataset_id}/images/
            base_url = f"{tenant_id}/{image_folder_path_relative}/"
            logger.debug(f"生成标注数据集 base_url: {base_url}")
            
            return base_url
        else:
            logger.warning("无法获取租户ID，跳过 base_url 生成")
            return None

    def _read_row_from_file(self, jfs, dataset_path: str, target_row: int) -> Optional[Dict[str, Any]]:
        """从 JFS 文件中读取第 target_row 条有效数据（行号从 1 开始），读到即停止。"""
        current_row = 1
        with jfs.open(dataset_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                try:
                    parsed = json.loads(line)
                    if isinstance(parsed, list):
                        data = parsed[0] if parsed else None
                    elif isinstance(parsed, dict):
                        data = parsed
                    else:
                        data = None

                    if data is not None:
                        if current_row == target_row:
                            return data
                        current_row += 1
                    else:
                        current_row += 1
                except json.JSONDecodeError:
                    current_row += 1
        return None

    async def _copy_dataset_directory(self, source_dir: str, target_dir: str) -> None:
        """复制JuiceFS中的目录（递归复制）
        
        Args:
            source_dir: 源目录路径
            target_dir: 目标目录路径
        """
        jfs = await self._get_juicefs_client()
        
        if not jfs.exists(source_dir):
            logger.warning(f"源目录不存在，跳过复制: {source_dir}")
            return
        
        def _sync_copy(source: str, target: str) -> None:
            """在线程池中执行的同步递归复制，避免阻塞 asyncio 事件循环。"""
            target_parent = os.path.dirname(target)
            if target_parent and not jfs.exists(target_parent):
                jfs.makedirs(target_parent, exist_ok=True)
            jfs.makedirs(target, exist_ok=True)

            def copy_recursive(src: str, dst: str) -> None:
                try:
                    items = jfs.listdir(src)
                except Exception as e:
                    logger.error(f"无法列出目录内容: {src}, 错误: {str(e)}")
                    return

                for item in items:
                    src_path = os.path.join(src, item).replace('\\', '/')
                    dst_path = os.path.join(dst, item).replace('\\', '/')

                    try:
                        jfs.listdir(src_path)
                        is_directory = True
                    except Exception:
                        is_directory = False

                    if is_directory:
                        jfs.makedirs(dst_path, exist_ok=True)
                        copy_recursive(src_path, dst_path)
                    else:
                        try:
                            with jfs.open(src_path, 'rb') as sf:
                                file_content = sf.read()
                            with jfs.open(dst_path, 'wb') as df:
                                df.write(file_content)
                            logger.debug(f"复制文件: {src_path} -> {dst_path}")
                        except Exception as file_error:
                            logger.error(f"复制文件失败: {src_path} -> {dst_path}, 错误: {str(file_error)}")
                            raise

            copy_recursive(source, target)

        try:
            import asyncio
            await asyncio.to_thread(_sync_copy, source_dir, target_dir)
            logger.info(f"成功复制目录: {source_dir} -> {target_dir}")
        except Exception as e:
            logger.error(f"复制目录失败: {source_dir} -> {target_dir}, 错误: {str(e)}")
            raise

    # ------------------------------ 标注任务接口实现 ------------------------------
    async def create_label_task(
        self,
        current_user: JwtUserInfo,
        task_create: LabelTaskCreate,
        file: Optional[UploadFile] = None
    ) -> Dict[str, int]:
        """
        创建标注任务（在线/多人），在创建任务时自动创建数据集
        
        返回: {"id": 任务ID}
        """
        session = await self.task_mapper.get_session()
        
        # 验证项目存在
        await validate_project_exists(session, task_create.project_id)
        
        # 验证数据集名称格式
        try:
            validate_name_format(task_create.task_name, "任务名称")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        ml_label_dataset = None
        dataset = None
        llm_dataset_path = None
        # 机器学习任务：直接关联 machine_learning_datasets，不创建 label_datasets
        if task_create.biz_type == LabelTaskBizType.MACHINE_LEARNING:
            ml_label_dataset = await self._create_machine_learning_label_task(task_create,session,current_user)
        elif task_create.biz_type == LabelTaskBizType.LLM:
            # llm任务：label_datasets
            dataset, llm_dataset_path = await self._create_llm_label_task(task_create, session, current_user)
        else:
            # raise HTTPException(status_code=500, detail=f"标注任务类型暂不支持")
            # llm任务：label_datasets
            dataset, llm_dataset_path = await self._create_llm_label_task(task_create, session, current_user)

        # 现在有了数据集ID，使用ID生成唯一路径
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{task_create.project_id}"
        dataset_id = dataset.id if dataset else ml_label_dataset.id
        dataset_path = self._generate_dataset_path(namespace, task_create.task_name, dataset_id=dataset_id,
                                                   biz_type=task_create.biz_type)
        
        source_path: Optional[str] = None
        target_path: Optional[str] = None
        source_file_name: str = ""
        target_file_name: str = ""
        need_async_copy = task_create.source == LabelDatasetSource.EXISTED_DATASET
        if need_async_copy:
            # 机器学习任务
            if task_create.biz_type == LabelTaskBizType.MACHINE_LEARNING and ml_label_dataset:
                source_path = StoragePath.REGISTERED_MACHINE_LEARNING_DATASETS.format_storage_path(
                    namespace=namespace,
                    dataset_id=ml_label_dataset.source_dataset_id,
                )
                target_path = os.path.dirname(dataset_path)
            else:
                if dataset.dataset_type in self.IMAGE_ASSET_DATASET_TYPES:
                    # 图像理解使用dataset_path中的文件夹为路径
                    source_path = os.path.dirname(llm_dataset_path)
                    target_path = os.path.dirname(dataset_path)
                    source_file_name = os.path.basename(llm_dataset_path)
                    target_file_name = os.path.basename(dataset_path)
                else:
                    # 非图像理解直接使用dataset_path
                    source_path = llm_dataset_path
                    target_path = dataset_path
            if not source_path or not target_path:
                logger.error(f"创建标注任务数据集复杂错误，source_path：{source_path}，dataset_path：{target_path}")
                raise HTTPException(status_code=500, detail="创建标注任务失败，数据集存在异常")

        try:
            # 更新数据集路径
            if task_create.biz_type == LabelTaskBizType.MACHINE_LEARNING:
                ml_label_dataset.dataset_path = dataset_path
            if task_create.biz_type == LabelTaskBizType.LLM:
                dataset.dataset_path = dataset_path

            # 先创建任务，再把 task_id 传给异步拷贝任务更新状态
            task = LabelTask(
                biz_type=task_create.biz_type,
                task_type=task_create.task_type.value,
                label_dataset_id=dataset_id,
                status=LabelTaskStatus.CREATING.value if need_async_copy else LabelTaskStatus.CREATED.value,
                created_id=current_user.userId,
                created_by=current_user.username,
            )
            await self.task_mapper.insert(task)
            await self.task_mapper.flush()

            total_samples = dataset.total_samples if dataset else ml_label_dataset.total_samples
            progress = LabelProgress(
                task_id=task.id,
                user_id=current_user.userId,
                assigned_count=total_samples or 0,
                saved_count=0,
                created_id=current_user.userId,
                created_by=current_user.username,
            )
            await self.progress_mapper.insert(progress)
            await session.commit()
            await session.refresh(task)
        except Exception as e:
            await session.rollback()
            logger.error(f"创建标注任务失败，已回滚数据库事务: {str(e)}")
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(status_code=500, detail=f"创建标注任务失败: {str(e)}")

        if need_async_copy:
            from app.tasks.label_tasks import copy_dataset_label_async
            copy_dataset_label_async.apply_async(
                args=[
                    source_path,
                    target_path,
                    app_runtime_context.get_tenant_id(),
                    task.id,
                    LabelTaskStatus.CREATED.value,
                    source_file_name,
                    target_file_name,
                ]
            )

        return {"id": task.id}

    async def _create_machine_learning_label_task(self,task_create,session,current_user):
        if task_create.source_dataset_id is None:
            raise HTTPException(status_code=400, detail="机器学习任务必须传 source_dataset_id（机器学习数据集ID）")

        ml_dataset = await session.scalar(
            select(MachineLearningDataset).filter(
                MachineLearningDataset.id == task_create.source_dataset_id,
                MachineLearningDataset.project_id == task_create.project_id,
            )
        )
        if not ml_dataset:
            raise HTTPException(status_code=404, detail=f"机器学习数据集不存在: {task_create.source_dataset_id}")

        existing_ml_datasets = await session.execute(
            select(LabelMachineLearningDataset).filter(
                LabelMachineLearningDataset.project_id == task_create.project_id,
                LabelMachineLearningDataset.name == task_create.task_name,
            )
        )
        if existing_ml_datasets.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"项目中已存在同名的机器学习标注任务: {task_create.task_name}",
            )

        label_schema_json = None
        class_count = 0
        if ml_dataset.label_schema_path:
            jfs = await self._get_juicefs_client()
            if jfs.exists(ml_dataset.label_schema_path):
                try:
                    with jfs.open(ml_dataset.label_schema_path, "r", encoding="utf-8") as schema_file:
                        parsed = json.loads(schema_file.read() or "{}")
                        if isinstance(parsed, dict):
                            label_schema_json = {str(k): str(v) for k, v in parsed.items()}
                            class_count = len(label_schema_json)
                except Exception:
                    label_schema_json = None
                    class_count = 0

        ml_label_dataset = LabelMachineLearningDataset(
            name=task_create.task_name,
            description=task_create.dataset_description,
            project_id=task_create.project_id,
            source_dataset_id=ml_dataset.id,
            task_type=ml_dataset.task_type,
            data_type=ml_dataset.data_type,
            annotation_type=ml_dataset.annotation_type,
            template_type=ml_dataset.template_type,
            class_count=class_count,
            label_schema_json=label_schema_json,
            total_samples=ml_dataset.sample_count or 0,
            dataset_path=ml_dataset.dataset_path,
            created_id=current_user.userId,
            created_by=current_user.username,
        )
        session.add(ml_label_dataset)
        await session.flush()
        await session.refresh(ml_label_dataset)
        return ml_label_dataset

    async def _create_llm_label_task(self,task_create,session,current_user):
        # 检查同一项目下是否已存在同名的标注数据集
        existing_datasets = await self.dataset_mapper.query(
            select(LabelDataset).filter(
                LabelDataset.project_id == task_create.project_id,
                LabelDataset.name == task_create.task_name
            )
        )
        if existing_datasets:
            raise HTTPException(
                status_code=400,
                detail=f"项目中已存在同名的标注任务: {task_create.task_name}"
            )

        # 根据数据来源处理，创建数据集
        dataset_path = None
        total_samples = 0
        total_characters = 0
        file_size_mb = 0.0

        if task_create.source == LabelDatasetSource.EXISTED_DATASET:
            # 从已有数据集创建（从 training_dataset 读取）
            if not task_create.source_dataset_id:
                raise HTTPException(status_code=400, detail="从已有数据集创建时，必须指定数据集")

            # 查询数据集
            training_dataset = await self.training_dataset_mapper.query_one(
                select(TrainingDataset).filter(
                    TrainingDataset.id == task_create.source_dataset_id
                )
            )

            if not training_dataset:
                raise HTTPException(status_code=404, detail=f"数据集不存在: {task_create.source_dataset_id}")

            # 验证项目匹配
            if training_dataset.project_id != task_create.project_id:
                raise HTTPException(status_code=400, detail="训练数据集不属于当前项目")

            # 创建标注任务：仅检查是否被进行中的清洗任务占用
            await check_dataset_in_use(
                session,
                training_dataset.name,
                task_create.project_id,
                training_dataset.version,
                creating=DatasetTaskCreationKind.LABEL,
            )

            # 数据集类型
            dataset_type = LabelDatasetType(training_dataset.dataset_type)

            # 数据集格式
            dataset_format = LabelDatasetFormat(training_dataset.dataset_format)

            # 读取训练数据集文件
            jfs = await self._get_juicefs_client()
            if not jfs.exists(training_dataset.dataset_path):
                raise HTTPException(
                    status_code=404,
                    detail=f"训练数据集文件不存在: {training_dataset.dataset_path}"
                )

            # 使用训练数据集的统计信息
            total_samples = training_dataset.total_samples or 0
            total_characters = training_dataset.total_characters or 0
            file_size_mb = training_dataset.file_size or 0.0

            # 校验数据集是否为空
            if total_samples == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"数据集 '{training_dataset.name}' (版本: {training_dataset.version}) 为空，无法创建标注任务"
                )

        elif task_create.source == LabelDatasetSource.UPLOAD:
            raise HTTPException(status_code=400, detail="暂不支持本地上传功能")
        else:
            raise HTTPException(status_code=400, detail=f"不支持的数据来源: {task_create.source}")

        # 先创建数据集记录（不提交），通过 flush 获取ID用于生成路径
        dataset = LabelDataset(
            name=task_create.task_name,
            description=task_create.dataset_description,
            project_id=task_create.project_id,
            source=task_create.source.value,
            source_dataset_id=task_create.source_dataset_id,
            dataset_type=dataset_type.value,
            dataset_format=dataset_format.value,
            task_type=task_create.task_type.value,
            override=task_create.override,
            total_samples=total_samples,
            total_characters=total_characters,
            file_size=file_size_mb,
            dataset_path="",  # 临时占位符，等获取到ID后再生成
            created_id=current_user.userId,
            created_by=current_user.username
        )

        await self.dataset_mapper.insert(dataset)
        # 先刷新获取ID，但不提交
        await session.flush()
        await session.refresh(dataset)
        return dataset, training_dataset.dataset_path

    async def get_label_task(
        self,
        task_id: int
    ) -> LabelTaskDetailResponse:
        """获取标注任务详情（包含数据集信息和进度）"""
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"标注任务不存在: {task_id}")
        
        # 按业务类型读取不同数据集详情
        dataset = None
        ml_dataset = None
        if task.biz_type == LabelTaskBizType.MACHINE_LEARNING.value:
            if not task.label_dataset_id:
                raise HTTPException(status_code=404, detail="机器学习任务缺少 label_dataset_id")
            session = await self.task_mapper.get_session()
            ml_dataset = await session.scalar(
                select(LabelMachineLearningDataset).filter(LabelMachineLearningDataset.id == task.label_dataset_id)
            )
            if not ml_dataset:
                raise HTTPException(status_code=404, detail=f"机器学习数据集不存在: {task.label_dataset_id}")
        else:
            dataset = await self.dataset_mapper.query_one(
                select(LabelDataset).filter(LabelDataset.id == task.label_dataset_id)
            )
            if not dataset:
                raise HTTPException(status_code=404, detail=f"标注数据集不存在: {task.label_dataset_id}")
        
        # 获取进度信息
        progress = await self.progress_mapper.query_one(
            select(LabelProgress).filter(LabelProgress.task_id == task_id)
        )

        training_method_type = None
        if task.biz_type != LabelTaskBizType.MACHINE_LEARNING.value and dataset and dataset.source_dataset_id:
            session = await self.task_mapper.get_session()
            source_training_dataset = await session.scalar(
                select(TrainingDataset).filter(TrainingDataset.id == dataset.source_dataset_id)
            )
            if source_training_dataset and source_training_dataset.training_method_type:
                try:
                    training_method_type = TrainingMethodType(source_training_dataset.training_method_type)
                except ValueError:
                    training_method_type = None
        
        task_name = ml_dataset.name if ml_dataset else (dataset.name if dataset else "")
        total_samples = ml_dataset.total_samples if ml_dataset else (dataset.total_samples if dataset else 0)
        response = LabelTaskDetailResponse(
            id=task.id,
            biz_type=task.biz_type,
            task_type=task.task_type,
            label_dataset_id=task.label_dataset_id,
            status=task.status,
            task_name=task_name,
            total_samples=total_samples,
            assigned_count=0,
            saved_count=0,
            source_dataset_name=None,
            submit_dataset_name=None,
            dataset_type=None,
            training_method_type=training_method_type,
            created_by=task.created_by,
            created_at=task.created_at,
            created_id=task.created_id,
            tenant_id=task.tenant_id,
            updated_at=task.updated_at,
        )
        if task.biz_type == LabelTaskBizType.MACHINE_LEARNING.value:
            response.dataset = LabelMachineLearningDatasetResponse.model_validate(ml_dataset) if ml_dataset else None
        else:
            response.dataset = LabelDatasetResponse.model_validate(dataset) if dataset else None
        prog_model = LabelProgressResponse.model_validate(progress) if progress else None
        if prog_model and task.task_type != LabelTaskType.MULTI.value:
            cap = (ml_dataset.total_samples if ml_dataset else 0) if task.biz_type == LabelTaskBizType.MACHINE_LEARNING.value else (dataset.total_samples or 0)
            rc = settings.REDIS_CLIENT
            if rc and cap > 0:
                try:
                    n = int(await rc.scard(f"label:task:{task_id}:saved_items"))
                    prog_model = prog_model.model_copy(
                        update={
                            # Redis key 不存在时 scard 也会返回 0，不能直接覆盖 DB 中已落盘/已同步的进度
                            "saved_count": min(max(prog_model.saved_count or 0, n), cap),
                            "assigned_count": cap,
                        }
                    )
                except Exception as e:
                    logger.warning(
                        f"任务详情读取在线暂存进度失败，使用 DB: task_id={task_id}, error={e}"
                    )
        response.progress = prog_model
        
        return response

    async def get_label_task_data(
        self,
        task_id: int,
        page: Optional[int] = None,
        size: Optional[int] = None,
        is_annotated: Optional[bool] = None
    ) -> AnnotationDataResponse:
        """
        获取标注任务中的单条数据，返回数据项、总条数和分页信息
        
        Args:
            task_id: 任务ID
            page: 页码（从1开始），用于前端分页显示，表示过滤后数据的页码位置
            size: 每页数量，与page配合使用
            is_annotated: 标注状态过滤（True=已标注，False=未标注，None=不过滤）
        
        Note:
            - 前端使用 page 和 size 来分页，根据 page 和 size 计算对应的 row_number（原始文件中的行号）
            - 返回的数据项中包含 row_number 字段，供前端保存标注时使用
        """
        # 参数验证
        if page is not None and page < 1:
            raise HTTPException(status_code=400, detail="页码必须大于0")
        
        if size is not None and (size < 1 or size > 100):
            raise HTTPException(status_code=400, detail="每页数量必须在1-100之间")
        
        # 默认值
        if page is None:
            page = 1
        
        # 获取任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"标注任务不存在: {task_id}")
        # 获取数据集表
        dataset_model = dataset_model_map[task.biz_type]
        # 获取数据集
        dataset = await self.dataset_mapper.query_one(
            select(dataset_model).filter(dataset_model.id == task.label_dataset_id)
        )
        if not dataset:
            raise HTTPException(status_code=404, detail=f"标注数据集不存在: {task.label_dataset_id}")
        
        total_samples = dataset.total_samples or 0
        if total_samples == 0:
            raise HTTPException(status_code=404, detail="数据集为空")
        
        # 读取 Redis 实时数据（consumer 尚未写入 JFS 时的实时缓存）
        redis_client = settings.REDIS_CLIENT
        redis_saved_row_strs: Set[str] = set()
        if redis_client:
            try:
                saved_key = f"label:task:{task_id}:saved_items"
                raw_members = await redis_client.smembers(saved_key)
                redis_saved_row_strs = {
                    m.decode() if isinstance(m, bytes) else m for m in raw_members
                }
            except Exception as e:
                logger.warning(f"读取 Redis saved_items 失败，降级只读 JFS: {e}")

        actual_size = size or 20

        # 读取原始数据文件
        jfs = await self._get_juicefs_client()
        if not jfs.exists(dataset.dataset_path):
            raise HTTPException(status_code=404, detail=f"数据集文件不存在: {dataset.dataset_path}")

        # 如果是图像理解数据集，提前生成 base_url
        base_url = None
        training_method_type = None
        dataset_format = getattr(dataset, 'dataset_format', None)
        if task.biz_type == LabelTaskBizType.LLM.value and getattr(dataset, 'source_dataset_id', None):
            session = await self.task_mapper.get_session()
            source_training_dataset = await session.scalar(
                select(TrainingDataset).filter(TrainingDataset.id == dataset.source_dataset_id)
            )
            if source_training_dataset and source_training_dataset.training_method_type:
                try:
                    training_method_type = TrainingMethodType(source_training_dataset.training_method_type)
                except ValueError:
                    training_method_type = None
        if task.biz_type == LabelTaskBizType.LLM and dataset.dataset_type in self.IMAGE_ASSET_DATASET_TYPES:
            base_url = await self._build_base_url_for_label_dataset(dataset.project_id, dataset)
        elif task.biz_type == LabelTaskBizType.MACHINE_LEARNING:
            base_url = await self._build_base_url_for_label_dataset(dataset.project_id, dataset, task.biz_type)
            base_url = f"{base_url}{dataset.name}/"
        target_row: Optional[int] = None
        total_count: int = 0
        actual_page = page

        if is_annotated is None:
            # 快速路径：直接按行号定位，不加载整份标注文件，避免大文件 OOM
            target_index = (page - 1) * actual_size
            if target_index >= total_samples:
                raise HTTPException(
                    status_code=400,
                    detail=f"页码超出范围：页码 {page}，每页 {actual_size} 条，总数据量 {total_samples}"
                )
            target_row = target_index + 1  # 行号从 1 开始
            total_count = total_samples
        else:
            # 过滤路径：只加载已标注行号集合（不加载标注内容），再流式扫 raw 文件收集符合条件行号
            annotated_ids = await self._read_annotated_row_ids(dataset.dataset_path)
            filtered_rows: list = []
            current_row = 1
            with jfs.open(dataset.dataset_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    try:
                        parsed_data = json.loads(line)
                        if isinstance(parsed_data, list):
                            if not parsed_data:
                                current_row += 1
                                continue
                        elif not isinstance(parsed_data, dict):
                            current_row += 1
                            continue

                        item_id = str(current_row)
                        is_item_annotated = (
                            item_id in annotated_ids
                            or item_id in redis_saved_row_strs
                        )
                        if is_item_annotated == is_annotated:
                            filtered_rows.append(current_row)
                        current_row += 1
                    except json.JSONDecodeError:
                        current_row += 1

            filtered_total = len(filtered_rows)
            if filtered_total == 0:
                item = AnnotationDataItem(
                    item_id="",
                    row_number=0,
                    raw_data={},
                    annotation=None,
                    is_annotated=False
                )
                return AnnotationDataResponse(
                    items=item,
                    total=0,
                    page=actual_page,
                    size=actual_size,
                    total_pages=0,
                    training_method_type=training_method_type,
                    dataset_format=dataset_format,
                    base_url=base_url,
                    ml_task_template_type=getattr(dataset, 'template_type', None),
                    ml_task_annotation_type=getattr(dataset, 'annotation_type', None)
                )

            target_index = (page - 1) * actual_size
            if target_index >= filtered_total:
                raise HTTPException(
                    status_code=400,
                    detail=f"页码超出范围：页码 {page}，每页 {actual_size} 条，符合条件的数据总数 {filtered_total}"
                )
            target_row = filtered_rows[target_index]
            total_count = filtered_total

        # 读取目标行数据（快速路径只需一次从头读到 target_row 即停止）
        target_data = self._read_row_from_file(jfs, dataset.dataset_path, target_row)
        if target_data is None:
            raise HTTPException(
                status_code=500,
                detail=f"数据不一致：行号 {target_row} 在数据文件中不存在，可能是数据集记录的总数与实际文件行数不一致"
            )
        
        # 只读取目标行的标注内容（流式读到即停），避免整份 annotations 文件进内存
        item_id = str(target_row)
        annotation = await self._read_annotation_for_row(task_id, dataset.dataset_path, target_row)
        if annotation is None and redis_client:
            try:
                annotation_cache_key = f"label:task:{task_id}:annotation:{target_row}"
                cached = await redis_client.get(annotation_cache_key)
                if cached:
                    annotation = json.loads(cached.decode() if isinstance(cached, bytes) else cached)
            except Exception as e:
                logger.warning(f"读取 Redis 标注缓存失败: task_id={task_id}, row={target_row}, error={e}")

        # 掩码实例分割模板：将存储的 RLE 格式转换为前端 polygon_with_holes 格式
        # height/width 优先取顶层字段，不存在时从嵌套的 data 对象中读取
        if (
            task.biz_type == LabelTaskBizType.MACHINE_LEARNING.value
            and getattr(dataset, "template_type", None) == MachineLearningDatasetTemplateType.INSTANCE_SEGMENTATION_MASK.value
        ):
            try:
                from app.utils.segmentation_codec import storage_annotations_to_frontend
                if isinstance(target_data, dict):
                    h = target_data.get("height") or (target_data.get("data") or {}).get("height")
                    w = target_data.get("width") or (target_data.get("data") or {}).get("width")
                else:
                    h = w = None
                if isinstance(h, int) and isinstance(w, int):
                    if isinstance(annotation, list) and annotation:
                        annotation = {"annotations": storage_annotations_to_frontend(annotation, h, w)}
                    # 同步转换 raw_data 中的原始标注，前端渲染时也需要 polygon_with_holes 格式
                    if isinstance(target_data, dict):
                        raw_anns = target_data.get("annotations")
                        if isinstance(raw_anns, list) and raw_anns:
                            target_data = {**target_data, "annotations": storage_annotations_to_frontend(raw_anns, h, w)}
            except Exception as e:
                logger.warning(f"掩码标注格式反转换失败，返回原始数据: task_id={task_id}, row={target_row}, error={e}")

        item = AnnotationDataItem(
            item_id=item_id,
            row_number=target_row,
            raw_data=target_data,
            annotation=annotation,
            is_annotated=annotation is not None
        )
        
        # 计算总页数
        total_pages = (total_count + actual_size - 1) // actual_size if total_count > 0 else 0
        
        return AnnotationDataResponse(
            items=item,
            total=total_count,
            page=actual_page,
            size=actual_size,
            total_pages=total_pages,
            training_method_type=training_method_type,
            dataset_format=dataset_format,
            base_url=base_url,
            ml_task_template_type=getattr(dataset, 'template_type', None),
            ml_task_annotation_type=getattr(dataset, 'annotation_type', None)
        )

    async def list_label_tasks(
        self,
        project_id: int,
        task_type: Optional[str] = None,
        task_name: Optional[str] = None,
        dataset_type: Optional[TrainingTypeCategory] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        biz_type: Optional[LabelTaskBizType] = LabelTaskBizType.LLM
    ) -> Page[LabelTaskResponse]:
        """获取项目下的标注任务列表"""
        session = await self.task_mapper.get_session()
        # 获取数据集表
        dataset_model = dataset_model_map[biz_type]
        # 验证项目存在
        await validate_project_exists(session, project_id)
        
        # 构建查询：先查询 LabelTask 对象
        query = select(LabelTask).join(
            dataset_model, LabelTask.label_dataset_id == dataset_model.id
        ).filter(
            dataset_model.project_id == project_id,LabelTask.biz_type == biz_type
        )
        
        # 按 dataset_type 过滤：使用 LabelDataset.dataset_type，不依赖 TrainingDataset，
        # 避免来源/提交训练数据集被删除后任务在列表中查不到（与数据清洗分页逻辑一致）
        if dataset_type:
            dataset_type_str = dataset_type.value
            query = query.filter(LabelDataset.dataset_type == dataset_type_str)
        
        if task_type:
            query = query.filter(LabelTask.task_type == task_type)

        if task_name:
            query = query.filter(dataset_model.name.ilike(f"%{task_name}%"))
        
        query = query.order_by(LabelTask.created_at.desc())
        tasks = await self.task_mapper.query_page(query, page, size, unique=False)

        
        # 收集所有需要查询的数据集ID和任务ID
        task_ids = [task.id for task in tasks.items]
        dataset_ids = [task.label_dataset_id for task in tasks.items]
        
        # 批量查询数据集信息
        dataset_map = {}
        if dataset_ids:
            datasets = await self.dataset_mapper.query(
                select(dataset_model).filter(dataset_model.id.in_(dataset_ids))
            )
            for ds in datasets:
                dataset_map[ds.id] = {
                    'name': ds.name,
                    'total_samples': ds.total_samples,
                    'source_dataset_id': ds.source_dataset_id,
                    'submit_dataset_id': ds.submit_dataset_id
                }
        
        # 收集所有关联的数据集ID
        rel_dataset_ids = set()
        for ds_info in dataset_map.values():
            if ds_info.get('source_dataset_id'):
                rel_dataset_ids.add(ds_info['source_dataset_id'])
            if ds_info.get('submit_dataset_id'):
                rel_dataset_ids.add(ds_info['submit_dataset_id'])
        
        # 批量查询训练数据集名称与类型
        training_dataset_map = {}  # 存储数据集名称
        training_dataset_type_map = {}  # 存储数据集类型
        if rel_dataset_ids:
            training_datasets = None
            ml_datasets = None
            if biz_type == LabelTaskBizType.LLM:
                training_datasets = await session.execute(
                    select(TrainingDataset).filter(TrainingDataset.id.in_(rel_dataset_ids))
                )
            else:
                ml_datasets = await session.execute(
                    select(MachineLearningDataset).filter(MachineLearningDataset.id.in_(rel_dataset_ids))
                )
            for td in (training_datasets.scalars().all() if training_datasets else []):
                # 格式化名称：数据集用途/数据集名称-版本号
                usage_desc = ""
                if td.usage:
                    try:
                        usage_desc = DatasetUsage(td.usage).description
                    except ValueError:
                        usage_desc = td.usage
                name_version = f"{td.name}-{td.version}" if td.version else td.name
                training_dataset_map[td.id] = f"{usage_desc}/{name_version}" if usage_desc else name_version
                # 保存数据集类型（优先使用来源数据集的类型）
                training_dataset_type_map[td.id] = td.dataset_type
            for td in (ml_datasets.scalars().all() if ml_datasets else []):
                training_dataset_map[td.id] = format_machine_learning_dataset_display_name(
                    td.name, td.version, td.annotation_type
                )
                # 保存数据集类型（优先使用来源数据集的类型）
                training_dataset_type_map[td.id] = None

        # 批量查询进度：多人任务按行汇总；在线任务若多条 progress 记录，sum(assigned) 会夸大分母，改用数据集 total_samples + Redis 暂存数
        multi_task_ids = [t.id for t in tasks.items if t.task_type == LabelTaskType.MULTI.value]
        online_task_ids = [t.id for t in tasks.items if t.task_type != LabelTaskType.MULTI.value]

        progress_map: Dict[int, Dict[str, int]] = {}
        if multi_task_ids:
            progress_result = await session.execute(
                select(
                    LabelProgress.task_id,
                    func.sum(LabelProgress.assigned_count).label('total_assigned_count'),
                    func.sum(LabelProgress.saved_count).label('total_saved_count'),
                )
                .filter(LabelProgress.task_id.in_(multi_task_ids))
                .group_by(LabelProgress.task_id)
            )
            for row in progress_result.all():
                progress_map[row.task_id] = {
                    'assigned_count': int(row.total_assigned_count or 0),
                    'saved_count': int(row.total_saved_count or 0),
                }

        online_saved_max: Dict[int, int] = {}
        if online_task_ids:
            max_saved_result = await session.execute(
                select(
                    LabelProgress.task_id,
                    func.max(LabelProgress.saved_count).label('max_saved'),
                )
                .filter(LabelProgress.task_id.in_(online_task_ids))
                .group_by(LabelProgress.task_id)
            )
            for row in max_saved_result.all():
                online_saved_max[row.task_id] = int(row.max_saved or 0)

        redis_client = settings.REDIS_CLIENT
        redis_saved_map: Dict[int, int] = {}
        if redis_client and online_task_ids:
            try:
                async def _scard_saved(tid: int) -> Tuple[int, int]:
                    c = await redis_client.scard(f"label:task:{tid}:saved_items")
                    return tid, int(c or 0)

                pairs = await asyncio.gather(
                    *[_scard_saved(tid) for tid in online_task_ids],
                    return_exceptions=True,
                )
                for item in pairs:
                    if isinstance(item, BaseException):
                        continue
                    tid, c = item
                    redis_saved_map[tid] = c
            except Exception as e:
                logger.warning(f"批量读取在线标注 Redis 暂存数失败: {e}")

        # 构建响应对象
        items = []
        for task in tasks.items:
            dataset_info = dataset_map.get(task.label_dataset_id, {})
            total_samples = dataset_info.get('total_samples') or 0
            if task.task_type == LabelTaskType.MULTI.value:
                progress_info = progress_map.get(task.id, {'assigned_count': 0, 'saved_count': 0})
                assigned_count = progress_info['assigned_count']
                saved_count = progress_info['saved_count']
            else:
                assigned_count = total_samples
                saved_count = max(
                    online_saved_max.get(task.id, 0),
                    redis_saved_map.get(task.id, 0)
                )
                if assigned_count:
                    saved_count = min(saved_count, assigned_count)
            
            # 获取来源和提交数据集名称
            source_dataset_name = None
            submit_dataset_name = None
            dataset_type = None
            if dataset_info.get('source_dataset_id'):
                source_dataset_id = dataset_info['source_dataset_id']
                source_dataset_name = training_dataset_map.get(source_dataset_id)
                # 优先使用来源数据集的类型，转换为枚举
                dataset_type_str = training_dataset_type_map.get(source_dataset_id)
                if dataset_type_str:
                    try:
                        dataset_type = TrainingTypeCategory(dataset_type_str)
                    except ValueError:
                        # 如果无法转换为枚举，保持为 None
                        dataset_type = None
            if dataset_info.get('submit_dataset_id'):
                submit_dataset_id = dataset_info['submit_dataset_id']
                submit_dataset_name = training_dataset_map.get(submit_dataset_id)
                # 如果没有来源数据集类型，使用提交数据集的类型
                if not dataset_type:
                    dataset_type_str = training_dataset_type_map.get(submit_dataset_id)
                    if dataset_type_str:
                        try:
                            dataset_type = TrainingTypeCategory(dataset_type_str)
                        except ValueError:
                            dataset_type = None
            
            items.append(LabelTaskResponse(
                biz_type=task.biz_type,
                id=task.id,
                task_type=task.task_type,
                label_dataset_id=task.label_dataset_id,
                status=task.status,
                task_name=dataset_info.get('name', ''),
                total_samples=dataset_info.get('total_samples'),
                assigned_count=assigned_count,
                saved_count=saved_count,
                source_dataset_name=source_dataset_name,
                submit_dataset_name=submit_dataset_name,
                dataset_type=dataset_type,
                created_by=task.created_by,
                created_at=task.created_at,
                created_id=task.created_id,
                tenant_id=task.tenant_id,
                updated_at=task.updated_at
            ))
        return tasks.copy(update={"items": items})

    async def delete_label_task(
        self,
        task_id: int
    ) -> None:
        """删除标注任务（已完成/已发布任务也支持删除）"""
        session = await self.task_mapper.get_session()
        
        # 获取任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"标注任务不存在: {task_id}")

        # 获取数据集表
        dataset_model = dataset_model_map[task.biz_type]
        
        # 获取数据集
        dataset = await self.dataset_mapper.query_one(
            select(dataset_model).filter(dataset_model.id == task.label_dataset_id)
        )

        if not dataset:
            raise HTTPException(status_code=404, detail=f"标注数据集不存在: {task.label_dataset_id}")
        
        # 删除进度记录
        await self.progress_mapper.delete_condition(delete(LabelProgress).where(LabelProgress.task_id == task_id))
        await self.auto_model_mapper.delete_condition(delete(LabelAutoModel).where(LabelAutoModel.task_id == task_id))

        # 删除任务记录
        await self.task_mapper.delete(task)

        # 删除数据集文件（原始文件和标注文件）
        if dataset:
            jfs = await self._get_juicefs_client()

            dataset_dir = os.path.dirname(dataset.dataset_path) if dataset.dataset_path else None
            if task.biz_type == LabelTaskBizType.MACHINE_LEARNING.value:
                if dataset_dir and jfs.exists(dataset_dir):
                    jfs.rmr(dataset_dir)
                    logger.info(f"删除机器学习标注任务目录: {dataset_dir}")
            else:
                if dataset.dataset_type in self.IMAGE_ASSET_DATASET_TYPES:
                    if dataset_dir and jfs.exists(dataset_dir):
                        jfs.rmr(dataset_dir)
                        logger.info(f"删除图像类标注任务目录: {dataset_dir}")
                else:
                    if dataset.dataset_path and jfs.exists(dataset.dataset_path):
                        jfs.remove(dataset.dataset_path)
                        logger.info(f"删除数据集文件: {dataset.dataset_path}")

                    annotations_path = dataset.dataset_path.replace('.jsonl', '.annotations.jsonl')
                    if jfs.exists(annotations_path):
                        jfs.remove(annotations_path)
                        logger.info(f"删除标注文件: {annotations_path}")

            # 删除数据集记录
            await self.dataset_mapper.delete(dataset)
        
        # 清理 Redis 中的相关数据
        try:
            redis_client = settings.REDIS_CLIENT
            if redis_client:
                from app.tasks.label_tasks import ANNOTATED_ITEMS_KEY, SAVED_ITEMS_KEY, PROCESSED_KEYS_SET
                annotated_key = ANNOTATED_ITEMS_KEY.format(task_id=task_id)
                saved_key = SAVED_ITEMS_KEY.format(task_id=task_id)
                processed_key = PROCESSED_KEYS_SET.format(task_id=task_id)

                await redis_client.delete(annotated_key, saved_key, processed_key)
                logger.info(f"已清理 Redis 数据: task_id={task_id}")
        except Exception as e:
            logger.warning(f"清理 Redis 数据失败: task_id={task_id}, error={str(e)}")
        
        await session.commit()
        logger.info(f"删除标注任务成功: task_id={task_id}")

    async def check_annotation_completion(
        self,
        task_id: int
    ) -> AnnotationCompletionStatusResponse:
        """
        查询是否完成标注（暂存数=总条数）
        
        Args:
            task_id: 任务ID
        
        Returns:
            AnnotationCompletionStatusResponse: 包含是否完成标注的状态信息
        """
        # 获取任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"标注任务不存在: {task_id}")
        # 获取数据集表
        dataset_model = dataset_model_map[task.biz_type]
        # 获取数据集
        dataset = await self.dataset_mapper.query_one(
            select(dataset_model).filter(dataset_model.id == task.label_dataset_id)
        )
        if not dataset:
            raise HTTPException(status_code=404, detail=f"标注数据集不存在: {task.label_dataset_id}")
        
        # 获取总条数
        total_samples = dataset.total_samples or 0

        # 从 Redis Set 读取暂存数（实时，不依赖 consumer 异步更新 DB）
        redis_client = settings.REDIS_CLIENT
        saved_count = 0
        db_saved_count = 0
        session = await self.progress_mapper.get_session()
        progress_result = await session.execute(
            select(func.sum(LabelProgress.saved_count)).filter(
                LabelProgress.task_id == task_id
            )
        )
        db_saved_count = int(progress_result.scalar() or 0)
        if redis_client:
            try:
                saved_key = f"label:task:{task_id}:saved_items"
                saved_count = max(int(await redis_client.scard(saved_key)), db_saved_count)
            except Exception as e:
                logger.warning(f"读取 Redis saved_count 失败，降级使用 DB: task_id={task_id}, error={e}")
                saved_count = db_saved_count
        else:
            saved_count = db_saved_count

        # 判断是否完成：暂存数=总条数
        is_completed = (saved_count == total_samples) if total_samples > 0 else False
        
        # 判断是否已提交：任务状态为已完成或已生成提交数据集
        is_submitted = (
            task.status == LabelTaskStatus.COMPLETED.value or 
            dataset.submit_dataset_id is not None
        )
        
        return AnnotationCompletionStatusResponse(
            task_id=task_id,
            is_completed=is_completed,
            is_submitted=is_submitted,
            saved_count=saved_count,
            total_samples=total_samples
        )

    async def add_label_tag(
        self,
        task_id: int,
        request: LabelTagCreateRequest
    ) -> LabelTagCreateResponse:
        """新增标注标签（仅机器学习任务）"""
        task = await self.task_mapper.query_one(select(LabelTask).filter(LabelTask.id == task_id))
        if not task:
            raise HTTPException(status_code=404, detail=f"标注任务不存在: {task_id}")
        if task.biz_type != LabelTaskBizType.MACHINE_LEARNING.value:
            raise HTTPException(status_code=400, detail="仅机器学习标注任务支持标签管理")

        session = await self.task_mapper.get_session()
        dataset = await session.scalar(
            select(LabelMachineLearningDataset).filter(LabelMachineLearningDataset.id == task.label_dataset_id)
        )
        if not dataset:
            raise HTTPException(status_code=404, detail=f"标注数据集不存在: {task.label_dataset_id}")

        schema = dict(dataset.label_schema_json) if isinstance(dataset.label_schema_json, dict) else {}
        requested_names = [name.strip() for name in request.tag_name.split(",")]
        normalized_names = []
        for name in requested_names:
            if not name:
                continue
            if name in normalized_names:
                raise HTTPException(status_code=400, detail=f"请求中存在重复标签: {name}")
            normalized_names.append(name)

        if not normalized_names:
            raise HTTPException(status_code=400, detail="标签名称不能为空")

        existing_names = {str(value).strip() for value in schema.values()}
        duplicated_names = [name for name in normalized_names if name in existing_names]
        if duplicated_names:
            raise HTTPException(status_code=400, detail=f"标签已存在: {', '.join(duplicated_names)}")

        redis_client = settings.REDIS_CLIENT
        created_items = []
        for normalized_name in normalized_names:
            if redis_client is None:
                class_id = self._get_max_label_schema_class_id(schema) + 1
            else:
                class_id = await self._allocate_ml_label_class_id(task_id, schema, redis_client)
                if str(class_id) in schema:
                    class_id = self._get_max_label_schema_class_id(schema) + 1

            schema[str(class_id)] = normalized_name
            created_items.append(LabelTagCreateItemResponse(class_id=class_id, tag_name=normalized_name))

        await session.execute(
            update(LabelMachineLearningDataset)
            .where(LabelMachineLearningDataset.id == task.label_dataset_id)
            .values(
                label_schema_json=schema,
                class_count=len(schema)
            )
        )
        await session.commit()
        return LabelTagCreateResponse(items=created_items, total=len(created_items))

    async def update_label_tag(
        self,
        task_id: int,
        class_id: int,
        request: LabelTagUpdateRequest
    ) -> LabelTagUpdateResponse:
        """编辑标注标签（仅机器学习任务）"""
        task = await self.task_mapper.query_one(select(LabelTask).filter(LabelTask.id == task_id))
        if not task:
            raise HTTPException(status_code=404, detail=f"标注任务不存在: {task_id}")
        if task.biz_type != LabelTaskBizType.MACHINE_LEARNING.value:
            raise HTTPException(status_code=400, detail="仅机器学习标注任务支持标签管理")

        session = await self.task_mapper.get_session()
        dataset = await session.scalar(
            select(LabelMachineLearningDataset).filter(LabelMachineLearningDataset.id == task.label_dataset_id)
        )
        if not dataset:
            raise HTTPException(status_code=404, detail=f"标注数据集不存在: {task.label_dataset_id}")

        schema = dict(dataset.label_schema_json) if isinstance(dataset.label_schema_json, dict) else {}
        key = str(class_id)
        if key not in schema:
            raise HTTPException(status_code=404, detail=f"标签不存在: class_id={class_id}")

        normalized_name = request.tag_name.strip()
        existing_name_owner = next(
            (str(k) for k, v in schema.items() if str(v).strip() == normalized_name),
            None,
        )
        if existing_name_owner is not None and existing_name_owner != key:
            raise HTTPException(status_code=400, detail=f"标签已存在: {normalized_name}")

        schema[key] = normalized_name

        await session.execute(
            update(LabelMachineLearningDataset)
            .where(LabelMachineLearningDataset.id == task.label_dataset_id)
            .values(
                label_schema_json=schema,
                class_count=len(schema)
            )
        )
        await session.commit()
        return LabelTagUpdateResponse(class_id=class_id, tag_name=normalized_name)

    async def list_label_tags(
        self,
        task_id: int
    ) -> LabelTagListResponse:
        """查询标注标签列表（仅机器学习任务）"""
        task = await self.task_mapper.query_one(select(LabelTask).filter(LabelTask.id == task_id))
        if not task:
            raise HTTPException(status_code=404, detail=f"标注任务不存在: {task_id}")
        if task.biz_type != LabelTaskBizType.MACHINE_LEARNING.value:
            raise HTTPException(status_code=400, detail="仅机器学习标注任务支持标签管理")

        session = await self.task_mapper.get_session()
        dataset = await session.scalar(
            select(LabelMachineLearningDataset).filter(LabelMachineLearningDataset.id == task.label_dataset_id)
        )
        if not dataset:
            raise HTTPException(status_code=404, detail=f"标注数据集不存在: {task.label_dataset_id}")

        schema = dataset.label_schema_json if isinstance(dataset.label_schema_json, dict) else {}
        items = []
        for key in sorted(schema.keys(), key=lambda x: int(x) if str(x).isdigit() else x):
            if str(key).isdigit():
                items.append(LabelTagItemResponse(class_id=int(key), tag_name=str(schema[key])))
        return LabelTagListResponse(items=items, total=len(items))

    async def delete_label_tag(
        self,
        task_id: int,
        class_id: int
    ) -> None:
        """删除标注标签（仅机器学习任务）"""
        task = await self.task_mapper.query_one(select(LabelTask).filter(LabelTask.id == task_id))
        if not task:
            raise HTTPException(status_code=404, detail=f"标注任务不存在: {task_id}")
        if task.biz_type != LabelTaskBizType.MACHINE_LEARNING.value:
            raise HTTPException(status_code=400, detail="仅机器学习标注任务支持标签管理")

        session = await self.task_mapper.get_session()
        dataset = await session.scalar(
            select(LabelMachineLearningDataset).filter(LabelMachineLearningDataset.id == task.label_dataset_id)
        )
        if not dataset:
            raise HTTPException(status_code=404, detail=f"标注数据集不存在: {task.label_dataset_id}")

        schema = dataset.label_schema_json if isinstance(dataset.label_schema_json, dict) else {}
        key = str(class_id)
        if key not in schema:
            raise HTTPException(status_code=404, detail=f"标签不存在: class_id={class_id}")

        redis_client = settings.REDIS_CLIENT
        if redis_client is None:
            raise HTTPException(status_code=500, detail="Redis 客户端未初始化，无法执行标签删除回滚")

        try:
            # 先做“强制回滚”再删 schema，确保标签删除行为对用户可见状态立即生效。
            await self._rollback_ml_annotations_for_deleted_class(
                task=task,
                dataset=dataset,
                class_id=class_id,
                redis_client=redis_client
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                f"删除标签回滚失败: task_id={task_id}, class_id={class_id}, error={e}",
                exc_info=True
            )
            raise HTTPException(status_code=500, detail=f"删除标签回滚失败: {e}")

        del schema[key]

        await session.execute(
            update(LabelMachineLearningDataset)
            .where(LabelMachineLearningDataset.id == task.label_dataset_id)
            .values(
                label_schema_json=schema,
                class_count=len(schema)
            )
        )
        await session.commit()

    async def _sync_multi_annotator_saved_counts_from_redis(
        self,
        task_id: int,
        annotator_user_ids: List[int],
        redis_client: Any,
    ) -> None:
        """
        多人标注：按用户 annotated_items 与 LabelProgress.assigned_count 对齐各标注员 saved_count。
        与 multi_label.save_annotation 中 scard(annotated_key) 写库逻辑一致。
        """
        if not redis_client or not annotator_user_ids:
            return
        try:
            updated = False
            for uid in annotator_user_ids:
                annotated_key = f"label:task:{task_id}:user:{uid}:annotated_items"
                n = int(await redis_client.scard(annotated_key))
                progress = await self.progress_mapper.query_one(
                    select(LabelProgress).filter(
                        LabelProgress.task_id == task_id,
                        LabelProgress.user_id == uid,
                    )
                )
                if progress is None:
                    continue
                cap = progress.assigned_count or 0
                new_val = min(n, cap) if cap else n
                if (progress.saved_count or 0) != new_val:
                    progress.saved_count = new_val
                    updated = True
            if updated:
                await self.progress_mapper.commit()
        except Exception as e:
            logger.warning(
                "多人标注删标签后同步各标注员 saved_count 失败: task_id=%s error=%s",
                task_id,
                e,
            )

    async def _sync_online_task_saved_count_from_redis(
        self,
        task_id: int,
        cap_samples: int,
        redis_client,
    ) -> None:
        """在线任务：把 DB 中该任务所有进度行的 saved_count 与 Redis 暂存集对齐（与多人标注侧一致，避免只依赖 consumer 导致进度滞后）。"""
        if not redis_client or cap_samples <= 0:
            return
        try:
            saved_key = f"label:task:{task_id}:saved_items"
            n = min(int(await redis_client.scard(saved_key)), cap_samples)
            progresses = await self.progress_mapper.query(
                select(LabelProgress).filter(LabelProgress.task_id == task_id)
            )
            if not progresses:
                return
            updated = False
            for p in progresses:
                if p.saved_count != n:
                    p.saved_count = n
                    updated = True
            if updated:
                await self.progress_mapper.commit()
        except Exception as e:
            logger.warning(
                f"在线标注暂存后同步 saved_count 失败: task_id={task_id}, error={e}"
            )

    # ------------------------------ 标注数据接口实现 ------------------------------

    async def save_annotations(
        self,
        current_user: JwtUserInfo,
        request: AnnotationSaveRequest
    ) -> AnnotationSaveResponse:
        """保存单条标注（暂存/最终提交）- 异步方式，通过 Redis Streams"""
        session = await self.task_mapper.get_session()
        
        # 获取任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == request.task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"标注任务不存在: {request.task_id}")

        # 获取数据集表
        dataset_model = dataset_model_map[task.biz_type]
        # 获取数据集
        dataset = await self.dataset_mapper.query_one(
            select(dataset_model).filter(dataset_model.id == task.label_dataset_id)
        )

        if not dataset:
            raise HTTPException(status_code=404, detail=f"标注数据集不存在: {task.label_dataset_id}")
        
        total_samples = dataset.total_samples or 0
        
        # 获取 Redis 客户端
        redis_client = settings.REDIS_CLIENT
        
        if redis_client is None:
            raise HTTPException(status_code=500, detail="Redis 客户端未初始化")
        
        # 只有当 row_number 和 annotation 都有值时才发送标注事件
        if request.row_number is not None and request.annotation is not None:
            # 验证行号范围（从1开始）
            if request.row_number < 1 or request.row_number > total_samples:
                raise HTTPException(
                    status_code=400,
                    detail=f"行号超出范围：行号 {request.row_number}，总数据量 {total_samples}（行号范围：1-{total_samples}）"
                )
            
            # 掩码实例分割模板：将前端 polygon_with_holes 格式转换为 RLE 存储格式
            # 必须在 Redis 写入和 class_usage 提取之前完成，确保存储的是 RLE 格式
            annotation_to_store = request.annotation
            if (
                task.biz_type == LabelTaskBizType.MACHINE_LEARNING.value
                and getattr(dataset, "template_type", None) == MachineLearningDatasetTemplateType.INSTANCE_SEGMENTATION_MASK.value
                and annotation_to_store is not None
            ):
                try:
                    from app.utils.segmentation_codec import frontend_annotations_to_storage
                    jfs = await self._get_juicefs_client()
                    raw_row = await asyncio.to_thread(self._read_row_from_file, jfs, dataset.dataset_path, request.row_number)
                    if isinstance(raw_row, dict):
                        h = raw_row.get("height") or (raw_row.get("data") or {}).get("height")
                        w = raw_row.get("width") or (raw_row.get("data") or {}).get("width")
                    else:
                        h = w = None
                    if isinstance(h, int) and isinstance(w, int):
                        inner = (
                            annotation_to_store.get("annotations", [])
                            if isinstance(annotation_to_store, dict)
                            else annotation_to_store
                        )
                        annotation_to_store = frontend_annotations_to_storage(inner, h, w)
                    else:
                        logger.warning(f"掩码标注无法获取图片尺寸，丢弃标注内容: task_id={request.task_id}, row={request.row_number}")
                        annotation_to_store = []
                except Exception as e:
                    logger.warning(f"掩码标注格式转换失败，丢弃标注内容: task_id={request.task_id}, error={e}")
                    annotation_to_store = []

            # 发送单条标注到 Redis Streams（consumer 异步写入 JFS）
            try:
                from app.utils.annotation_redis import send_annotation_event
                message_id = await send_annotation_event(
                    redis_client=redis_client,
                    task_id=request.task_id,
                    dataset_id=dataset.id,
                    row_number=request.row_number,
                    annotation=annotation_to_store,
                    is_final=request.is_final,
                    user_id=current_user.userId,
                    username=current_user.username
                )
                logger.info(f"标注事件已发送到 Redis Streams: task_id={request.task_id}, row_number={request.row_number}, message_id={message_id}")
            except Exception as e:
                logger.error(f"发送标注事件到 Redis Streams 失败: {str(e)}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"保存标注失败: {str(e)}")

            # 立即更新 Redis，保证查询实时可见（不等 consumer 处理完）
            try:
                saved_key = f"label:task:{request.task_id}:saved_items"
                annotated_key = f"label:task:{request.task_id}:annotated_items"
                annotation_cache_key = f"label:task:{request.task_id}:annotation:{request.row_number}"

                if request.is_final:
                    # 最终提交：从暂存 Set 移除（与 consumer 行为一致）
                    await redis_client.srem(saved_key, str(request.row_number))
                else:
                    # 暂存：加入暂存 Set
                    await redis_client.sadd(saved_key, str(request.row_number))

                # 无论暂存还是最终提交，都记录为已标注
                await redis_client.sadd(annotated_key, str(request.row_number))

                # 缓存标注内容，供 get_label_task_data 在 consumer 写入 JFS 前实时展示
                # 24小时过期（consumer 写入 JFS 后会主动删除此 key）
                await redis_client.set(
                    annotation_cache_key,
                    json.dumps(annotation_to_store, ensure_ascii=False),
                    ex=86400
                )

                if task.biz_type == LabelTaskBizType.MACHINE_LEARNING.value:
                    # 机器学习任务只维护反向索引 class_usage: class_id -> rows。
                    # 当前不支持同一行覆盖改标（增删 class_id 差异计算），所以无需 row -> class_ids 正向索引。
                    new_class_ids = self._extract_ml_class_ids_from_annotation(annotation_to_store)
                    if new_class_ids:
                        class_pipe = redis_client.pipeline()
                        for class_id in new_class_ids:
                            class_pipe.sadd(
                                self._ml_label_class_usage_key(request.task_id, class_id),
                                str(request.row_number)
                            )
                        await class_pipe.execute()

                if task.task_type != LabelTaskType.MULTI.value:
                    await self._sync_online_task_saved_count_from_redis(
                        request.task_id, total_samples, redis_client
                    )
            except Exception as e:
                # Redis 实时更新失败不阻断主流程，consumer 最终会补偿
                logger.warning(f"Redis 实时状态更新失败（不影响标注保存）: task_id={request.task_id}, error={str(e)}")

        # 如果是最终提交，先验证是否所有样本都已标注
        if request.is_final:
            # 检查是否已经提交过（防止重复提交）
            if task.status == LabelTaskStatus.COMPLETED.value:
                raise HTTPException(status_code=400, detail="该任务已提交，不允许重复提交")
            if dataset.submit_dataset_id is not None:
                raise HTTPException(status_code=400, detail="该任务已生成提交数据集，不允许重复提交")
            
            # 检查是否所有样本都已标注
            annotated_key = f"label:task:{request.task_id}:annotated_items"
            try:
                if total_samples == 0:
                    raise HTTPException(status_code=400, detail="数据集样本数为0，无法提交")
                
                # 获取已标注的行数（从 Redis Set，已在上方实时更新过）
                annotated_count = await redis_client.scard(annotated_key)

                # 验证是否所有样本都已标注
                if annotated_count < total_samples:
                    unannotated_count = total_samples - annotated_count
                    raise HTTPException(
                        status_code=400,
                        detail=f"存在未标注的样本，不允许提交。总样本数：{total_samples}，已标注：{annotated_count}，未标注：{unannotated_count}。请完成所有样本的标注后再提交。"
                    )
                
                logger.info(f"标注完成度验证通过: task_id={request.task_id}, 总样本数={total_samples}, 已标注={annotated_count}")
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"检查标注完成度失败: {str(e)}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"检查标注完成度失败: {str(e)}")
        
        # 如果是最终提交，生成训练数据集新版本
        new_version_id = None
        if request.is_final:
            try:
                if task.biz_type == LabelTaskBizType.LLM.value:
                    new_version_id = await self._generate_training_dataset_on_final_submit(
                        current_user=current_user,
                        task=task,
                        dataset=dataset,
                        session=session
                    )
                else:
                    new_version_id = await self._generate_ml_dataset_on_final_submit(
                        current_user=current_user,
                        task=task,
                        dataset=dataset,
                        session=session
                    )
                
                # 最终提交成功后，清除 Redis 中的任务相关数据
                if new_version_id:
                    await self._cleanup_redis_on_final_submit(
                        redis_client=redis_client,
                        task_id=request.task_id,
                        dataset_path=dataset.dataset_path
                    )
                    
            except Exception as e:
                logger.error(f"生成训练数据集新版本失败: {str(e)}", exc_info=True)
                # 不抛出异常，标注已保存成功，版本生成失败不影响标注
                return AnnotationSaveResponse(
                    success=True,
                    message=f"标注已提交，但生成新版本失败: {str(e)}"
                )
        
        message = "标注已提交" if request.is_final else "标注已暂存"
        if new_version_id:
            if task.biz_type == LabelTaskBizType.MACHINE_LEARNING.value:
                message = f"标注已提交，已生成机器学习数据集新版本 (ID: {new_version_id})"
            else:
                message = f"标注已提交，已生成训练数据集新版本 (ID: {new_version_id})"
        
        return AnnotationSaveResponse(
            success=True,
            message=message
        )

    async def generate_training_dataset_from_label_dataset(
        self,
        current_user: JwtUserInfo,
        dataset: LabelDataset
    ) -> Optional[int]:
        """
        由标注数据集生成训练数据集新版本（读取标注、合并原始数据、创建新版本）。
        不更新 task 或 progress，仅返回新训练数据集 ID，供多人标注发布等场景复用。
        """
        new_training_dataset = await self._build_training_dataset_from_label_dataset(current_user, dataset)
        if new_training_dataset is None:
            return None
        logger.info(f"由标注数据集生成训练数据集成功: label_dataset_id={dataset.id}, new_training_dataset_id={new_training_dataset.id}")
        return new_training_dataset.id

    async def generate_machine_learning_dataset_from_label_dataset(
        self,
        current_user: JwtUserInfo,
        dataset: LabelMachineLearningDataset,
    ) -> Optional[int]:
        """
        由机器学习标注数据集生成注册的机器学习数据集新版本。
        不更新 task 或 progress 或 label 侧 submit_dataset_id，仅返回新数据集 ID，供多人标注发布等复用。
        """
        return await self._build_ml_dataset_version_from_label_ml_dataset(current_user, dataset)

    async def _build_training_dataset_from_label_dataset(
        self,
        current_user: JwtUserInfo,
        dataset: LabelDataset
    ) -> Optional[TrainingDataset]:
        """
        读取标注文件、合并原始数据、创建/覆盖训练数据集新版本。
        不更新 label_dataset、task 或 progress。返回新训练数据集对象或 None。
        """
        if not dataset.source_dataset_id:
            logger.warning(f"标注数据集 {dataset.id} 未找到源训练数据集ID，跳过版本生成")
            return None

        source_training_dataset = await self.training_dataset_mapper.query_one(
            select(TrainingDataset).filter(TrainingDataset.id == dataset.source_dataset_id)
        )
        if not source_training_dataset:
            logger.error(f"源训练数据集不存在: {dataset.source_dataset_id}")
            return None
        
        jfs = await self._get_juicefs_client()
        if not jfs.exists(dataset.dataset_path):
            logger.error(f"数据集文件不存在: {dataset.dataset_path}")
            return None

        annotations_path = dataset.dataset_path.replace('.jsonl', '.annotations.jsonl')
        # 只建 offset 索引，不把标注内容载入内存，避免大文件/多任务 OOM
        offset_index = self._build_annotation_offset_index(jfs, annotations_path)

        # 仅补充 Redis 中尚未落盘的标注（通常很少），只存这一小部分内容
        redis_annotations: Dict[str, Any] = {}
        redis_client = settings.REDIS_CLIENT
        if redis_client:
            try:
                task = await self.task_mapper.query_one(
                    select(LabelTask).filter(LabelTask.label_dataset_id == dataset.id)
                )
                if task:
                    annotated_key = f"label:task:{task.id}:annotated_items"
                    annotated_members = await redis_client.smembers(annotated_key)
                    for member in annotated_members:
                        row_str = member.decode() if isinstance(member, bytes) else member
                        if row_str not in offset_index:
                            cache_key = f"label:task:{task.id}:annotation:{row_str}"
                            cached = await redis_client.get(cache_key)
                            if cached:
                                try:
                                    redis_annotations[row_str] = json.loads(
                                        cached.decode() if isinstance(cached, bytes) else cached
                                    )
                                    logger.info(f"最终提交时从 Redis 缓存补充标注: task_id={task.id}, row={row_str}")
                                except Exception:
                                    pass
            except Exception as e:
                logger.warning(f"最终提交时读取 Redis 缓存标注失败（不影响已落盘数据）: label_dataset_id={dataset.id}, error={e}")

        if not offset_index and not redis_annotations:
            logger.info(f"标注数据集 {dataset.id} 没有标注数据，跳过版本生成")
            return None

        # 流式合并到临时文件，不积压 merged 列表
        merge_out_path = dataset.dataset_path.rstrip('.jsonl') + '_merge_tmp.jsonl'
        try:
            total_samples, total_characters = self._stream_merge_to_path(
                jfs, dataset.dataset_path, annotations_path,
                offset_index, redis_annotations, dataset, merge_out_path
            )
            if total_samples == 0:
                return None
            if dataset.override:
                result = await self._override_training_dataset(
                    jfs=jfs,
                    source_dataset=source_training_dataset,
                    merged_data=None,
                    merged_data_path=merge_out_path,
                    total_samples=total_samples,
                    total_characters=total_characters,
                    current_user=current_user,
                    training_dataset_mapper=self.training_dataset_mapper,
                    label_dataset=dataset
                )
            else:
                result = await self._create_new_training_dataset_version(
                    jfs=jfs,
                    source_dataset=source_training_dataset,
                    merged_data=None,
                    merged_data_path=merge_out_path,
                    total_samples=total_samples,
                    total_characters=total_characters,
                    current_user=current_user,
                    training_dataset_mapper=self.training_dataset_mapper,
                    label_dataset=dataset
                )
            return result
        finally:
            try:
                if jfs.exists(merge_out_path):
                    jfs.remove(merge_out_path)
            except Exception as e:
                logger.warning(f"删除合并临时文件失败: %s, %s", merge_out_path, e)

    async def _generate_training_dataset_on_final_submit(
        self,
        current_user: JwtUserInfo,
        task: LabelTask,
        dataset: LabelDataset,
        session
    ) -> Optional[int]:
        """
        最终提交时生成训练数据集新版本
        
        Returns:
            新版本的训练数据集ID，如果不满足条件则返回 None
        """
        new_training_dataset = await self._build_training_dataset_from_label_dataset(current_user, dataset)
        if new_training_dataset is None:
            return None

        dataset.submit_dataset_id = new_training_dataset.id
        task.status = LabelTaskStatus.COMPLETED.value
        total_samples = dataset.total_samples or 0
        progress_result = await session.execute(
            select(LabelProgress).filter(LabelProgress.task_id == task.id)
        )
        for progress in progress_result.scalars().all():
            progress.saved_count = total_samples
            logger.info(f"最终提交更新进度: task_id={task.id}, user_id={progress.user_id}, saved_count={total_samples}")
        
        await session.commit()
        logger.info(f"最终提交生成新版本成功: task_id={task.id}, new_training_dataset_id={new_training_dataset.id}")
        return new_training_dataset.id

    def _stream_merge_ml_to_path(
        self,
        jfs,
        raw_path: str,
        annotations_path: str,
        offset_index: Dict[str, int],
        out_path: str,
    ) -> Tuple[int, int]:
        """机器学习数据集流式合并：逐行读取原数据，按行号覆盖标注字段并写出。"""
        total_samples = 0
        total_characters = 0
        row_number = 1
        with jfs.open(raw_path, "r", encoding="utf-8") as raw_f, jfs.open(out_path, "w", encoding="utf-8") as out_f:
            ann_f = None
            try:
                for line in raw_f:
                    stripped = line.strip()
                    if not stripped:
                        continue
                    try:
                        item = json.loads(stripped)
                    except json.JSONDecodeError:
                        row_number += 1
                        continue

                    annotation = None
                    item_id = str(row_number)
                    if item_id in offset_index:
                        if ann_f is None:
                            ann_f = jfs.open(annotations_path, "r", encoding="utf-8")
                        ann_f.seek(offset_index[item_id])
                        ann_line = ann_f.readline()
                        if ann_line:
                            try:
                                ann_item = json.loads(ann_line.strip())
                                ann = ann_item.get("annotation") if isinstance(ann_item, dict) else None
                                # 机器学习标注里 annotation 常见为 list[dict]，也兼容 dict
                                if isinstance(ann, (dict, list)):
                                    annotation = ann
                            except json.JSONDecodeError:
                                annotation = None

                    if annotation is not None and isinstance(item, dict):
                        merged = item.copy()
                        # 机器学习样本标准结构优先覆盖 annotations 字段
                        if "annotations" in merged:
                            merged["annotations"] = annotation
                        elif isinstance(annotation, dict):
                            merged.update(annotation)
                        else:
                            merged["annotations"] = annotation
                    else:
                        merged = item

                    merged_line = json.dumps(merged, ensure_ascii=False)
                    out_f.write(merged_line + "\n")
                    total_samples += 1
                    total_characters += len(merged_line)
                    row_number += 1
            finally:
                if ann_f is not None:
                    try:
                        ann_f.close()
                    except Exception:
                        pass
        return total_samples, total_characters

    async def _build_ml_dataset_version_from_label_ml_dataset(
        self,
        current_user: JwtUserInfo,
        dataset: LabelMachineLearningDataset,
    ) -> Optional[int]:
        """
        读取机器学习标注文件、合并、创建新注册的 MachineLearningDataset 并提交。
        不更新 LabelTask / LabelProgress / label 侧 submit_dataset_id。
        """
        session = await self.task_mapper.get_session()
        source_ml_dataset = await session.scalar(
            select(MachineLearningDataset).filter(MachineLearningDataset.id == dataset.source_dataset_id)
        )
        if not source_ml_dataset:
            logger.error(f"源机器学习数据集不存在: {dataset.source_dataset_id}")
            return None

        jfs = await self._get_juicefs_client()
        if not dataset.dataset_path or not jfs.exists(dataset.dataset_path):
            logger.error(f"机器学习标注数据集文件不存在: {dataset.dataset_path}")
            return None

        annotations_path = dataset.dataset_path.replace(".jsonl", ".annotations.jsonl")
        offset_index = self._build_annotation_offset_index(jfs, annotations_path)
        if not offset_index:
            logger.info(
                f"机器学习标注数据集无标注数据，跳过版本生成: label_ml_dataset_id={dataset.id}"
            )
            return None

        merge_out_path = dataset.dataset_path.rstrip(".jsonl") + "_ml_merge_tmp.jsonl"
        new_storage = ""
        try:
            total_samples, total_characters = self._stream_merge_ml_to_path(
                jfs=jfs,
                raw_path=dataset.dataset_path,
                annotations_path=annotations_path,
                offset_index=offset_index,
                out_path=merge_out_path,
            )
            if total_samples == 0:
                return None

            with jfs.open(merge_out_path, "r", encoding="utf-8") as metadata_file:
                metadata_fields = collect_metadata_fields_from_jsonl_iterable(metadata_file)

            existing_versions = await session.execute(
                select(MachineLearningDataset.version).filter(
                    MachineLearningDataset.project_id == source_ml_dataset.project_id,
                    MachineLearningDataset.name == source_ml_dataset.name,
                ).order_by(MachineLearningDataset.id.desc())
            )
            versions = [row[0] for row in existing_versions.fetchall()]
            new_version = self._generate_next_version(versions)
            file_size_mb = total_characters / (1024 * 1024) if total_characters else 0

            new_dataset = MachineLearningDataset(
                name=source_ml_dataset.name,
                description=f"由标注任务生成的新版本（基于 {source_ml_dataset.version}）",
                project_id=source_ml_dataset.project_id,
                version=new_version,
                dataset_category=source_ml_dataset.dataset_category,
                task_type=source_ml_dataset.task_type,
                data_type=source_ml_dataset.data_type,
                annotation_type=source_ml_dataset.annotation_type,
                template_type=source_ml_dataset.template_type,
                is_annotated=True,
                source_type=source_ml_dataset.source_type,
                storage_path="",
                dataset_path="",
                label_schema_path=None,
                sample_count=total_samples,
                file_size=file_size_mb,
                metadata_fields=metadata_fields,
                created_id=current_user.userId,
                created_by=current_user.username,
            )
            session.add(new_dataset)
            await session.flush()
            await session.refresh(new_dataset)

            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{source_ml_dataset.project_id}"
            new_storage = StoragePath.REGISTERED_MACHINE_LEARNING_DATASETS.format_storage_path(
                namespace=namespace, dataset_id=new_dataset.id
            ).rstrip("/") + "/"
            if not jfs.exists(new_storage):
                jfs.makedirs(new_storage, exist_ok=True)

            with jfs.open(merge_out_path, "rb") as src_f, jfs.open(new_storage + "dataset.jsonl", "wb") as dst_f:
                shutil.copyfileobj(src_f, dst_f)

            source_assets = (source_ml_dataset.storage_path or "").rstrip("/") + "/assets/"
            target_assets = new_storage + "assets/"
            if source_ml_dataset.storage_path and jfs.exists(source_assets):
                from app.tasks.label_tasks import copy_dataset_label_async
                copy_dataset_label_async.apply_async(args=[
                    source_assets,
                    target_assets,
                    app_runtime_context.get_tenant_id()
                ])

            if dataset.label_schema_json is not None:
                with jfs.open(new_storage + "classname.json", "w", encoding="utf-8") as f:
                    f.write(json.dumps(dataset.label_schema_json, ensure_ascii=False, indent=2))
                new_dataset.label_schema_path = new_storage + "classname.json"
            elif source_ml_dataset.label_schema_path and jfs.exists(source_ml_dataset.label_schema_path):
                with jfs.open(source_ml_dataset.label_schema_path, "rb") as f:
                    schema_content = f.read()
                with jfs.open(new_storage + "classname.json", "wb") as f:
                    f.write(schema_content)
                new_dataset.label_schema_path = new_storage + "classname.json"

            new_dataset.storage_path = new_storage
            new_dataset.dataset_path = new_storage + "dataset.jsonl"

            await session.commit()
            await session.refresh(new_dataset)
            logger.info(
                f"生成机器学习数据集新版本成功: label_ml_dataset_id={dataset.id}, new_ml_dataset_id={new_dataset.id}"
            )
            return new_dataset.id
        except Exception:
            await session.rollback()
            if new_storage and jfs.exists(new_storage):
                try:
                    jfs.rmr(new_storage)
                except Exception:
                    pass
            raise
        finally:
            try:
                if jfs.exists(merge_out_path):
                    jfs.remove(merge_out_path)
            except Exception:
                pass

    async def _generate_ml_dataset_on_final_submit(
        self,
        current_user: JwtUserInfo,
        task: LabelTask,
        dataset: LabelMachineLearningDataset,
        session
    ) -> Optional[int]:
        """
        最终提交时生成机器学习数据集新版本。
        """
        new_id = await self._build_ml_dataset_version_from_label_ml_dataset(current_user, dataset)
        if new_id is None:
            return None

        dataset.submit_dataset_id = new_id
        task.status = LabelTaskStatus.COMPLETED.value
        progress_result = await session.execute(
            select(LabelProgress).filter(LabelProgress.task_id == task.id)
        )
        for progress in progress_result.scalars().all():
            progress.saved_count = dataset.total_samples or 0

        await session.commit()
        logger.info(
            f"最终提交生成机器学习数据集新版本成功: task_id={task.id}, new_ml_dataset_id={new_id}"
        )
        return new_id

    async def _cleanup_redis_on_final_submit(
        self,
        redis_client,
        task_id: int,
        dataset_path: Optional[str] = None
    ) -> None:
        """
        最终提交成功后清除 Redis 中的任务相关数据

        清除的 key:
        - label:task:{task_id}:saved_items         - 暂存行号 Set
        - label:task:{task_id}:annotated_items      - 已标注行号 Set
        - label:task:{task_id}:processed_keys       - 幂等 key Set
        - label:task:{task_id}:annotation_offsets   - 行号到标注 offset 的 Hash（清理前持久化到 JFS）
        - label:task:{task_id}:label_id_counter     - 标签ID自增计数器
        - label:task:{task_id}:annotation:{row}     - 各行标注内容缓存（scan 批量删除）
        """
        try:
            saved_key = f"label:task:{task_id}:saved_items"
            annotated_key = f"label:task:{task_id}:annotated_items"
            processed_key = f"label:task:{task_id}:processed_keys"
            offsets_key = self._annotation_offsets_key(task_id)
            label_counter_key = self._ml_label_counter_key(task_id)

            persisted_offsets = 0
            if dataset_path:
                persisted_offsets = await self._persist_annotation_offsets_to_jfs(
                    redis_client=redis_client,
                    task_id=task_id,
                    dataset_path=dataset_path
                )

            deleted_saved = await redis_client.delete(saved_key)
            deleted_annotated = await redis_client.delete(annotated_key)
            deleted_processed = await redis_client.delete(processed_key)
            deleted_offsets = await redis_client.delete(offsets_key)
            deleted_label_counter = await redis_client.delete(label_counter_key)

            # 批量删除标注内容缓存（label:task:{task_id}:annotation:*）
            annotation_pattern = f"label:task:{task_id}:annotation:*"
            cursor = 0
            deleted_annotations = 0
            while True:
                cursor, keys = await redis_client.scan(cursor, match=annotation_pattern, count=100)
                if keys:
                    deleted_annotations += await redis_client.delete(*keys)
                if cursor == 0:
                    break

            logger.info(
                f"最终提交后清除 Redis 数据: task_id={task_id}, "
                f"deleted_saved={deleted_saved}, deleted_annotated={deleted_annotated}, "
                f"deleted_processed={deleted_processed}, deleted_offsets={deleted_offsets}, "
                f"deleted_label_counter={deleted_label_counter}, "
                f"persisted_offsets={persisted_offsets}, "
                f"deleted_annotation_cache={deleted_annotations}"
            )
        except Exception as e:
            logger.warning(f"清除 Redis 数据失败: task_id={task_id}, error={str(e)}")

    def _merge_annotation_to_item(
        self,
        item: Dict[str, Any],
        annotation: Dict[str, Any],
        dataset_format: str
    ) -> Dict[str, Any]:
        """
        将标注数据合并到原始数据项
        根据不同的数据格式进行合并
        """
        if dataset_format == LabelDatasetFormat.PROMPT_RESPONSE.value:
            # prompt-response 格式：标注内容替换 response 字段
            if 'response' in annotation:
                item['response'] = annotation['response']
            if 'prompt' in annotation:
                item['prompt'] = annotation['prompt']
        elif dataset_format == LabelDatasetFormat.ALPACA.value:
            # alpaca 格式：支持 instruction / input / chosen / rejected 的局部更新
            for field_name in ('instruction', 'input', 'chosen', 'rejected'):
                if field_name in annotation:
                    item[field_name] = annotation[field_name]
            # 兼容自动标注或旧前端仅回传 response 的场景，将其落到 chosen
            if 'response' in annotation and 'chosen' not in annotation:
                item['chosen'] = annotation['response']
        elif dataset_format == LabelDatasetFormat.ROLE_BASED.value:
            # role-based 格式：同时兼容
            # 1. SFT: {"messages": [...]}
            # 2. DPO: {"messages": [...], "chosen": {...}, "rejected": {...}}
            # 如果原始数据和标注数据都有 messages，进行智能合并
            if 'messages' in annotation:
                if 'messages' in item and isinstance(item['messages'], list) and isinstance(annotation['messages'], list):
                    # 多轮对话：合并 messages，支持部分更新
                    # 策略：如果标注的 messages 长度与原始相同，按索引一一对应更新
                    # 这样可以支持只更新被标注的 assistant 消息，保留其他消息不变
                    original_messages = item['messages']
                    annotated_messages = annotation['messages']
                    
                    if len(annotated_messages) == len(original_messages):
                        # 长度相同：按索引一一对应更新（支持部分更新）
                        merged_messages = []
                        for idx in range(len(original_messages)):
                            original_msg = original_messages[idx]
                            annotated_msg = annotated_messages[idx] if idx < len(annotated_messages) else None
                            
                            if annotated_msg and isinstance(annotated_msg, dict) and isinstance(original_msg, dict):
                                # 如果角色匹配，更新消息（支持部分更新 assistant 消息）
                                if annotated_msg.get('role') == original_msg.get('role'):
                                    merged_messages.append(annotated_msg.copy())
                                else:
                                    # 角色不匹配，保留原始消息
                                    merged_messages.append(original_msg.copy() if isinstance(original_msg, dict) else original_msg)
                            else:
                                # 没有对应的标注消息，保留原始消息
                                merged_messages.append(original_msg.copy() if isinstance(original_msg, dict) else original_msg)
                        
                        item['messages'] = merged_messages
                    else:
                        # 长度不同：直接替换（可能是完全重新标注）
                        item['messages'] = annotation['messages']
                else:
                    # 如果原始数据没有 messages 或格式不对，直接替换
                    item['messages'] = annotation['messages']

            # DPO role-based: chosen / rejected 都是 assistant 消息对象
            for field_name in ('chosen', 'rejected'):
                if field_name not in annotation:
                    continue
                field_value = annotation[field_name]
                if isinstance(field_value, dict):
                    item[field_name] = field_value.copy()
                else:
                    item[field_name] = field_value

            # 兼容旧前端仅回传 response 的场景，默认将其落到 chosen
            if 'response' in annotation and 'chosen' not in annotation:
                item['chosen'] = {
                    "role": "assistant",
                    "content": annotation['response']
                }
        elif dataset_format == LabelDatasetFormat.PREFIX_SUFFIX_MIDDLE.value:
            # prefix-suffix-middle 格式
            if 'prefix' in annotation:
                item['prefix'] = annotation['prefix']
            if 'suffix' in annotation:
                item['suffix'] = annotation['suffix']
            if 'middle' in annotation:
                item['middle'] = annotation['middle']
        elif dataset_format == LabelDatasetFormat.GRPO.value:
            # GRPO 格式：保留原始样本结构，主要更新 reward_model.ground_truth。
            for field_name in ('data_source', 'prompt', 'ability', 'extra_info'):
                if field_name in annotation:
                    item[field_name] = annotation[field_name]

            if isinstance(annotation.get('reward_model'), dict):
                current_reward_model = item.get('reward_model')
                if not isinstance(current_reward_model, dict):
                    current_reward_model = {}
                current_reward_model.update(annotation['reward_model'])
                item['reward_model'] = current_reward_model

            ground_truth = None
            ground_truth_set = False
            for field_name in ('reward_model.ground_truth', 'ground_truth', 'answer', 'response'):
                if field_name in annotation:
                    ground_truth = annotation[field_name]
                    ground_truth_set = True
                    break
            if ground_truth_set:
                current_reward_model = item.get('reward_model')
                if not isinstance(current_reward_model, dict):
                    current_reward_model = {}
                current_reward_model['ground_truth'] = ground_truth
                item['reward_model'] = current_reward_model
        elif dataset_format == LabelDatasetFormat.IMAGE_PROMPT.value:
            # 图像生成 image-prompt：只更新文字字段，保留 images[] 和图片文件不变。
            if 'prompt' in annotation:
                item['prompt'] = annotation['prompt']
            if 'negative_prompt' in annotation:
                item['negative_prompt'] = annotation['negative_prompt']
            if 'metadata' in annotation:
                metadata = annotation['metadata']
                if isinstance(metadata, dict):
                    item['metadata'] = metadata
        else:
            # 通用处理：直接合并标注内容
            item.update(annotation)
        
        return item

    async def _override_training_dataset(
        self,
        jfs,
        source_dataset: TrainingDataset,
        merged_data: Optional[list] = None,
        merged_data_path: Optional[str] = None,
        total_samples: int = 0,
        total_characters: int = 0,
        current_user: Optional[JwtUserInfo] = None,
        training_dataset_mapper: Optional[TrainingDatasetMapper] = None,
        label_dataset: Optional[LabelDataset] = None
    ) -> TrainingDataset:
        """覆盖模式：更新源训练数据集的文件和统计信息。支持 merged_data 或 merged_data_path（流式拷贝，不占大内存）。"""
        if merged_data_path:
            # 流式拷贝，避免整份内容进内存
            with jfs.open(merged_data_path, 'r', encoding='utf-8') as src, \
                 jfs.open(source_dataset.dataset_path, 'w', encoding='utf-8') as dst:
                chunk_size = 1024 * 1024
                while True:
                    chunk = src.read(chunk_size)
                    if not chunk:
                        break
                    dst.write(chunk)
            file_size_mb = total_characters / (1024 * 1024) if total_characters else 0
        else:
            content = '\n'.join(merged_data or []) + '\n'
            with jfs.open(source_dataset.dataset_path, 'w', encoding='utf-8') as f:
                f.write(content)
            file_size_mb = len(content.encode('utf-8')) / (1024 * 1024)
        
        # 更新统计信息
        source_dataset.total_samples = total_samples
        source_dataset.total_characters = total_characters
        source_dataset.file_size = file_size_mb

        session = await training_dataset_mapper.get_session()
        await session.commit()
        await session.refresh(source_dataset)

        await self._copy_label_images_if_needed(
            label_dataset=label_dataset,
            target_dataset_name=source_dataset.name,
            target_version=source_dataset.version,
            target_usage=DatasetUsage(source_dataset.usage),
            project_id=source_dataset.project_id
        )

        logger.info(f"覆盖训练数据集成功: id={source_dataset.id}, path={source_dataset.dataset_path}")
        return source_dataset

    async def _create_new_training_dataset_version(
        self,
        jfs,
        source_dataset: TrainingDataset,
        merged_data: Optional[list] = None,
        merged_data_path: Optional[str] = None,
        total_samples: int = 0,
        total_characters: int = 0,
        current_user: Optional[JwtUserInfo] = None,
        training_dataset_mapper: Optional[TrainingDatasetMapper] = None,
        label_dataset: Optional[LabelDataset] = None
    ) -> TrainingDataset:
        """新版本模式：创建新版本的训练数据集。支持 merged_data 或 merged_data_path（流式拷贝）。"""
        # 获取现有版本，生成新版本号
        existing_versions = await training_dataset_mapper.execute(
            select(TrainingDataset.version).filter(
                TrainingDataset.project_id == source_dataset.project_id,
                TrainingDataset.name == source_dataset.name
            ).order_by(TrainingDataset.id.desc())
        )
        versions = [row[0] for row in existing_versions.fetchall()]
        
        # 生成新版本号
        new_version = self._generate_next_version(versions)
        
        # 生成新文件路径（与训练数据集创建逻辑保持一致，使用静态方法无需实例化）
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{source_dataset.project_id}"
        from app.services.training_dataset.training_dataset import DefaultTrainingDatasetService
        from app.schemas.training_dataset import DatasetUsage
        from app.schemas.training_task import TrainingTypeCategory
        usage_enum = DatasetUsage(source_dataset.usage) if source_dataset.usage else DatasetUsage.TRAINING
        dataset_type_enum = TrainingTypeCategory(source_dataset.dataset_type) if source_dataset.dataset_type else None
        new_dataset_path = DefaultTrainingDatasetService.generate_dataset_path(
            namespace, source_dataset.name, new_version, 'jsonl', usage_enum, dataset_type_enum
        )
        
        # 确保目录存在
        remote_dir = os.path.dirname(new_dataset_path)
        if remote_dir and not jfs.exists(remote_dir):
            jfs.makedirs(remote_dir, exist_ok=True)
        
        # 写入新文件：流式拷贝或整份写入
        if merged_data_path:
            with jfs.open(merged_data_path, 'r', encoding='utf-8') as src, \
                 jfs.open(new_dataset_path, 'w', encoding='utf-8') as dst:
                chunk_size = 1024 * 1024
                while True:
                    chunk = src.read(chunk_size)
                    if not chunk:
                        break
                    dst.write(chunk)
            file_size_mb = total_characters / (1024 * 1024) if total_characters else 0
            with jfs.open(merged_data_path, 'r', encoding='utf-8') as metadata_file:
                metadata_fields = collect_metadata_fields_from_jsonl_iterable(metadata_file)
        else:
            content = '\n'.join(merged_data or []) + '\n'
            with jfs.open(new_dataset_path, 'w', encoding='utf-8') as f:
                f.write(content)
            file_size_mb = len(content.encode('utf-8')) / (1024 * 1024)
            metadata_fields = collect_metadata_fields_from_jsonl_iterable(merged_data or [])
        
        # 创建新的数据集记录
        new_dataset = TrainingDataset(
            name=source_dataset.name,
            description=f"由标注任务生成的新版本（基于 {source_dataset.version}）",
            project_id=source_dataset.project_id,
            version=new_version,
            dataset_type=source_dataset.dataset_type,
            training_method_type=source_dataset.training_method_type,
            dataset_format=source_dataset.dataset_format,
            usage=source_dataset.usage,
            dataset_config=source_dataset.dataset_config,
            total_samples=total_samples,
            total_characters=total_characters,
            file_size=file_size_mb,
            dataset_path=new_dataset_path,
            metadata_fields=metadata_fields,
            created_id=current_user.userId,
            created_by=current_user.username
        )
        
        await training_dataset_mapper.insert(new_dataset)
        session = await training_dataset_mapper.get_session()
        await session.commit()
        await session.refresh(new_dataset)
        
        await self._copy_label_images_if_needed(
            label_dataset=label_dataset,
            target_dataset_name=source_dataset.name,
            target_version=new_version,
            target_usage=DatasetUsage(source_dataset.usage),
            project_id=source_dataset.project_id
        )

        logger.info(f"创建训练数据集新版本成功: id={new_dataset.id}, version={new_version}, path={new_dataset_path}")
        return new_dataset

    async def _copy_label_images_if_needed(
        self,
        label_dataset: LabelDataset,
        target_dataset_name: str,
        target_version: str,
        target_usage,
        project_id: int
    ) -> None:
        """
        若标注数据集为图像理解类型，将图片文件夹从标注数据集复制到训练数据集目录。
        失败时仅记录日志，不影响主流程。
        """
        if label_dataset.dataset_type not in self.IMAGE_ASSET_DATASET_TYPES:
            return
        try:
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
            label_image_folder_path = self._generate_image_folder_path(namespace, label_dataset.id)
            training_image_folder_path = self._generate_training_image_folder_path(
                namespace,
                target_dataset_name,
                target_version,
                target_usage,
                label_dataset.dataset_type,
            )
            await self._copy_dataset_directory(label_image_folder_path, training_image_folder_path)
            logger.info(f"成功复制图像类数据集图片文件夹: {label_image_folder_path} -> {training_image_folder_path}")
        except Exception as e:
            logger.error(f"复制图像类数据集图片文件夹失败（不影响文件写入）: {str(e)}")

    def _generate_next_version(self, existing_versions: list) -> str:
        """根据现有版本号生成下一个版本号"""
        if not existing_versions:
            return "V2"  # 如果没有版本记录，从V2开始（假设原始是V1）
        
        # 解析版本号，找到最大的版本号
        max_version = 1
        for version in existing_versions:
            if version and version.startswith('V'):
                try:
                    version_num = int(version[1:])
                    max_version = max(max_version, version_num)
                except ValueError:
                    pass
        
        return f"V{max_version + 1}"

    # ------------------------------ 自动标注配置接口实现 ------------------------------
    async def save_auto_model_config(
        self,
        current_user: JwtUserInfo,
        config: LabelAutoModelCreate
    ) -> LabelAutoModelResponse:
        """保存自动标注配置（创建或更新）"""
        session = await self.auto_model_mapper.get_session()
        
        # 查询是否已存在该任务的配置
        existing_config = await self.auto_model_mapper.query_one(
            select(LabelAutoModel).filter(LabelAutoModel.task_id == config.task_id)
        )
        
        if existing_config:
            # 更新现有配置
            existing_config.model_id = config.model_id
            existing_config.param_config_json = config.param_config_json
            await session.commit()
            await session.refresh(existing_config)
            logger.info(f"更新自动标注配置成功: id={existing_config.id}")
            return LabelAutoModelResponse.model_validate(existing_config)
        else:
            # 创建新配置
            auto_model = LabelAutoModel(
                task_id=config.task_id,
                model_id=config.model_id,
                param_config_json=config.param_config_json,
                created_id=current_user.userId,
                created_by=current_user.username
            )
            await self.auto_model_mapper.insert(auto_model)
            await session.commit()
            await session.refresh(auto_model)
            logger.info(f"创建自动标注配置成功: id={auto_model.id}")
            return LabelAutoModelResponse.model_validate(auto_model)

    async def get_auto_model_config(
        self,
        task_id: int
    ) -> Optional[LabelAutoModelResponse]:
        """获取项目的自动标注配置"""
        # 查询配置
        config = await self.auto_model_mapper.query_one(
            select(LabelAutoModel).filter(LabelAutoModel.task_id == task_id)
        )
        
        if not config:
            return None
        
        return LabelAutoModelResponse.model_validate(config)

    # ------------------------------ AI自动标注接口实现 ------------------------------
    async def ai_annotate_stream(
        self,
        current_user: JwtUserInfo,
        request: AIAnnotationRequest
    ):
        """AI自动标注（流式输出版本）"""
        from app.utils.model_caller import call_model_for_annotation_stream
        
        task_id = request.task_id
        input_data = request.input_data
        
        # 在流式输出开始之前，完成所有数据库查询并提取所需数据
        # 使用独立的数据库会话，避免与中间件的会话冲突
        async with self.task_mapper._db.session() as session:
            # 1. 获取任务信息
            task_result = await session.execute(
                select(LabelTask).filter(LabelTask.id == task_id)
            )
            task = task_result.scalar_one_or_none()
            if not task:
                error_data = {
                    "error": {
                        "message": f"标注任务不存在: {task_id}",
                        "type": "not_found",
                        "code": "task_not_found"
                    }
                }
                yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
                return
            
            # 2. 获取数据集信息（主要获取dataset_format）
            dataset_result = await session.execute(
                select(LabelDataset).filter(LabelDataset.id == task.label_dataset_id)
            )
            dataset = dataset_result.scalar_one_or_none()
            if not dataset:
                error_data = {
                    "error": {
                        "message": f"标注数据集不存在: {task.label_dataset_id}",
                        "type": "not_found",
                        "code": "dataset_not_found"
                    }
                }
                yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
                return
            
            dataset_format = dataset.dataset_format
            dataset_type = dataset.dataset_type
            requested_annotation_target = input_data.annotation_target.value if input_data.annotation_target else None
            annotation_target = requested_annotation_target
            if dataset_format == LabelDatasetFormat.ALPACA.value:
                annotation_target = annotation_target or AIAnnotationTarget.CHOSEN.value
            elif (
                dataset_format == LabelDatasetFormat.ROLE_BASED.value
                and getattr(dataset, "source_dataset_id", None)
            ):
                source_training_dataset = await session.scalar(
                    select(TrainingDataset).filter(
                        TrainingDataset.id == dataset.source_dataset_id
                    )
                )
                if (
                    source_training_dataset
                    and source_training_dataset.training_method_type == TrainingMethodType.DPO.value
                ):
                    annotation_target = annotation_target or AIAnnotationTarget.CHOSEN.value
            
            # 3. 获取自动标注模型配置
            auto_model_result = await session.execute(
                select(LabelAutoModel).filter(LabelAutoModel.task_id == task_id)
            )
            auto_model_config = auto_model_result.scalar_one_or_none()
            if not auto_model_config:
                error_data = {
                    "error": {
                        "message": f"任务 {task_id} 未配置自动标注模型",
                        "type": "not_found",
                        "code": "auto_model_not_found"
                    }
                }
                yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
                return
            
            # 4. 获取推理服务信息（inference_service表）
            inference_service_result = await session.execute(
                select(InferenceService).filter(InferenceService.id == auto_model_config.model_id)
            )
            inference_service = inference_service_result.scalar_one_or_none()
            if not inference_service:
                error_data = {
                    "error": {
                        "message": f"推理服务不存在: model_id={auto_model_config.model_id}",
                        "type": "not_found",
                        "code": "inference_service_not_found"
                    }
                }
                yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
                return
            
            # 提取所需数据，在会话关闭前完成
            model_id = inference_service.id
            model_name = inference_service.model_name
            base_url = inference_service.base_url
            api_key = inference_service.api_key
            param_config_json = auto_model_config.param_config_json
            
            # 如果是图像类数据集，生成base_url用于图片路径转换
            image_base_url = None
            if dataset_type in self.IMAGE_ASSET_DATASET_TYPES:
                image_base_url = await self._build_base_url_for_label_dataset(dataset.project_id, dataset)
        
        # 会话已关闭，现在开始流式输出
        # 5. 将input_data转换为raw_data格式
        raw_data = self._convert_input_to_raw_data(
            input_data, dataset_format, image_base_url, annotation_target
        )
        
        # 5.1 如果是图像类数据集，读取图片并转换为base64
        if dataset_type in self.IMAGE_ASSET_DATASET_TYPES and input_data.images and image_base_url:
            try:
                jfs = await self._get_juicefs_client()
                import base64
                
                # 构建完整的JuiceFS路径
                namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{dataset.project_id}"
                image_folder_path = self._generate_image_folder_path(namespace, dataset.id)
                
                # 读取图片并转换为base64
                image_base64_list = []
                for image_path in input_data.images:
                    if image_path:
                        # 处理image_path：如果包含images/前缀，去掉它
                        if image_path.startswith("images/"):
                            image_filename = image_path[len("images/"):]
                        elif image_path.startswith("/images/"):
                            image_filename = image_path[len("/images/"):]
                        else:
                            image_filename = image_path
                        
                        # 构建完整路径
                        full_image_path = f"{image_folder_path}/{image_filename}"
                        
                        # 读取图片文件（二进制模式）
                        if jfs.exists(full_image_path):
                            with jfs.open(full_image_path, 'rb') as f:
                                image_bytes = f.read()
                                # 转换为base64
                                image_base64 = base64.b64encode(image_bytes).decode('utf-8')
                                
                                # 根据文件扩展名确定MIME类型
                                image_ext = os.path.splitext(image_path)[1].lower()
                                mime_type_map = {
                                    '.jpg': 'image/jpeg',
                                    '.jpeg': 'image/jpeg',
                                    '.png': 'image/png',
                                    '.gif': 'image/gif',
                                    '.webp': 'image/webp'
                                }
                                mime_type = mime_type_map.get(image_ext, 'image/jpeg')
                                
                                # 构建data URI格式：data:image/jpeg;base64,{base64_string}
                                data_uri = f"data:{mime_type};base64,{image_base64}"
                                image_base64_list.append(data_uri)
                        else:
                            logger.error(f"图片文件不存在: {full_image_path}")
                            raise HTTPException(
                                status_code=404,
                                detail=f"图片文件不存在: {full_image_path}"
                            )
                
                # 检查是否成功转换了所有图片
                if len(image_base64_list) != len([img for img in input_data.images if img]):
                    raise HTTPException(
                        status_code=500,
                        detail=f"图片转换失败：期望转换 {len([img for img in input_data.images if img])} 张图片，实际转换 {len(image_base64_list)} 张"
                    )
                
                # 将base64数据放入raw_data中
                raw_data["images_base64"] = image_base64_list
            except HTTPException:
                # 重新抛出HTTP异常
                raise
            except Exception as e:
                logger.error(f"读取图片并转换为base64失败: {str(e)}", exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail=f"读取图片并转换为base64失败: {str(e)}"
                )
        
        # 6. 构建模型配置
        model_config = ModelConfig(
            model_id=model_id,
            model_name=model_name,
            base_url=base_url,
            api_key=api_key,
            timeout=120,
            max_retries=3
        )
        
        # 7. 构建推理参数（从param_config_json获取）
        inference_params = InferenceParams()
        if param_config_json and isinstance(param_config_json, dict):
            allowed_keys = {"temperature", "max_tokens", "top_p", "presence_penalty"}
            for key in allowed_keys & param_config_json.keys():
                setattr(inference_params, key, param_config_json[key])

        # 8. 流式调用模型进行标注（此时数据库会话已关闭）
        logger.info(f"[ai_annotate_stream] 开始流式调用，task_id={task_id}, model_id={model_id}, model_name={model_name}")
        
        try:
            chunk_count = 0
            async for chunk in call_model_for_annotation_stream(
                model_config=model_config,
                raw_data=raw_data,
                dataset_format=dataset_format,
                inference_params=inference_params,
                caller_type="openai",
                image_base_url=image_base_url
            ):
                chunk_count += 1
                yield chunk
            
            logger.info(f"[ai_annotate_stream] AI标注流式输出完成: task_id={task_id}, 总chunk数={chunk_count}")
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[ai_annotate_stream] AI标注异常: task_id={task_id}, error={error_msg}", exc_info=True)
            error_data = {
                "error": {
                    "message": error_msg,
                    "type": "internal_error",
                    "code": "annotation_error"
                }
            }
            error_response = f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
            yield error_response

    def _convert_input_to_raw_data(
        self,
        input_data,
        dataset_format: str,
        image_base_url: Optional[str] = None,
        annotation_target: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        将AIAnnotationInput转换为模型调用所需的raw_data格式
        
        Args:
            input_data: AI标注输入数据
            dataset_format: 数据集格式
            image_base_url: 图片访问的基础URL（图像理解数据集时使用）
        """
        raw_data = {}

        def _derive_from_messages():
            """从 messages 推导 prompt / system，用于兼容只传 messages 的请求"""
            if not input_data.messages or not isinstance(input_data.messages, list):
                return
            system_parts = []
            last_user_content = None
            for m in input_data.messages:
                if not isinstance(m, dict) or "role" not in m:
                    continue
                role = m.get("role")
                content = m.get("content")
                if role == "system" and content is not None:
                    system_parts.append(str(content))
                elif role == "user" and content is not None:
                    last_user_content = str(content) if not isinstance(content, list) else None
            if last_user_content is not None and "prompt" not in raw_data:
                raw_data["prompt"] = last_user_content
            if system_parts and "system" not in raw_data:
                raw_data["system"] = "\n".join(system_parts)

        if annotation_target:
            raw_data["annotation_target"] = annotation_target

        if dataset_format == LabelDatasetFormat.PROMPT_RESPONSE.value:
            # prompt-response格式
            if input_data.prompt:
                raw_data["prompt"] = input_data.prompt
            if input_data.system_prompt:
                raw_data["system"] = input_data.system_prompt
            # 兼容：只传了 messages 时，从 messages 推导 prompt/system
            _derive_from_messages()

        elif dataset_format == LabelDatasetFormat.ALPACA.value:
            # alpaca格式：优先使用 instruction/input，兼容 prompt/system 或 messages 推导
            if input_data.instruction:
                raw_data["instruction"] = input_data.instruction
            if input_data.input is not None:
                raw_data["input"] = input_data.input
            if input_data.system_prompt:
                raw_data["system"] = input_data.system_prompt
            if input_data.prompt and "instruction" not in raw_data:
                raw_data["instruction"] = input_data.prompt
            _derive_from_messages()
            if "instruction" not in raw_data and "prompt" in raw_data:
                raw_data["instruction"] = raw_data["prompt"]

        elif dataset_format == LabelDatasetFormat.ROLE_BASED.value:
            # role-based格式
            if input_data.messages:
                raw_data["messages"] = input_data.messages
            # 图像理解数据集：处理images字段
            if input_data.images:
                raw_data["images"] = input_data.images

        elif dataset_format == LabelDatasetFormat.IMAGE_PROMPT.value:
            # image-prompt 格式：图像生成标注只补充/优化文字，图片作为只读上下文。
            if input_data.prompt:
                raw_data["prompt"] = input_data.prompt
            elif input_data.messages:
                _derive_from_messages()
            if input_data.images:
                raw_data["images"] = input_data.images

        elif dataset_format == LabelDatasetFormat.GRPO.value:
            # GRPO 格式：prompt 使用 verl 所需的消息数组结构。
            if input_data.messages:
                raw_data["prompt"] = input_data.messages
            elif input_data.prompt:
                raw_data["prompt"] = [{"role": "user", "content": input_data.prompt}]
            if input_data.system_prompt:
                raw_data.setdefault("prompt", [])
                raw_data["prompt"].insert(0, {"role": "system", "content": input_data.system_prompt})
            if input_data.reward_model:
                raw_data["reward_model"] = input_data.reward_model
            if input_data.ground_truth is not None:
                reward_model = raw_data.get("reward_model")
                if not isinstance(reward_model, dict):
                    reward_model = {}
                reward_model["ground_truth"] = input_data.ground_truth
                raw_data["reward_model"] = reward_model
            if input_data.ability:
                raw_data["ability"] = input_data.ability
            if input_data.extra_info:
                raw_data["extra_info"] = input_data.extra_info
            if input_data.data_source:
                raw_data["data_source"] = input_data.data_source
            if input_data.images:
                raw_data["images"] = input_data.images

        elif dataset_format == LabelDatasetFormat.PREFIX_SUFFIX_MIDDLE.value:
            # prefix-suffix-middle格式
            if input_data.prefix:
                raw_data["prefix"] = input_data.prefix
            if input_data.suffix:
                raw_data["suffix"] = input_data.suffix

        else:
            # 默认使用prompt-response
            if input_data.prompt:
                raw_data["prompt"] = input_data.prompt
            if input_data.system_prompt:
                raw_data["system"] = input_data.system_prompt
            _derive_from_messages()

        return raw_data
