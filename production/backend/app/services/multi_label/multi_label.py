"""
多人标注服务实现类

实现多人标注的核心功能：
1. 任务创建与管理
2. 成员分配（使用分配规则表）
3. 标注数据获取（基于分配算法）
4. 标注保存
5. 审核功能
6. 任务发布
"""
import json
import os
import random
from datetime import datetime, timezone
from math import ceil
from types import SimpleNamespace
from typing import Optional, Dict, Any, List, Set, Callable, Union, Tuple

from fastapi import HTTPException
from fastapi_pagination import Page
from sqlalchemy import select, func, and_, or_, update
from sqlalchemy.orm.attributes import flag_modified

from app.core.logging import logger
from app.models.label_manager import (
    LabelDataset, LabelMachineLearningDataset, LabelTask, LabelProgress, LabelTaskMember,
    LabelAuditProgress, LabelTaskAssignmentRule
)
from app.models.models import JwtUserInfo, MachineLearningDataset
from app.models.training_dataset_manager import TrainingDataset
from app.repository.label_audit_progress_mapper import LabelAuditProgressMapper
from app.repository.label_dataset_mapper import LabelDatasetMapper
from app.repository.label_progress_mapper import LabelProgressMapper
from app.repository.label_task_assignment_rule_mapper import LabelTaskAssignmentRuleMapper
from app.repository.label_task_mapper import LabelTaskMapper
from app.repository.label_task_member_mapper import LabelTaskMemberMapper
from app.repository.training_dataset_mapper import TrainingDatasetMapper
from app.schemas.label import (
    LabelTaskStatus,
    LabelDatasetSource,
    LabelDatasetType,
    LabelDatasetFormat,
    LabelTaskType,
    LabelTaskBizType,
    LabelDatasetResponse,
    LabelMachineLearningDatasetResponse,
)
from app.schemas.multi_label import (
    MultiLabelTaskCreate, MultiLabelTaskDetailResponse,
    MultiLabelTaskPublishResponse,
    MultiLabelDataResponse, MultiLabelDataItem,
    MultiLabelAnnotationSaveRequest, MultiLabelAnnotationSaveResponse,
    MultiLabelSubmitAllRequest, MultiLabelSubmitAllResponse,
    MultiLabelCompletionStatusResponse,
    MultiLabelAuditDataResponse, MultiLabelAuditDataItem,
    MultiLabelAuditSubmitRequest, MultiLabelAuditSubmitResponse,
    MultiLabelAuditCompletionStatusResponse,
    MultiLabelTaskMembersResponse, AnnotatorMemberItem, AuditorMemberItem,
    AnnotatorAssignRequest, AuditorAssignRequest,
    MemberRole, AuditResult, AuditStatusFilter, AnnotationItemStatus, MultiLabelTaskStatus,
    TaskOverviewResponse, AnnotationTaskResponse, AuditTaskResponse,
    AdminDataResponse, AdminDataItem,
    MultiLabelMemberReplaceRequest, MultiLabelMemberReplaceResponse,
)
from app.schemas.machine_learning_dataset import format_machine_learning_dataset_display_name, MachineLearningDatasetTemplateType
from app.schemas.training_dataset import DatasetUsage
from app.schemas.training_task import TrainingMethodType
from app.services.label.interface import LabelService
from app.services.permission.permission import is_platform_admin, is_project_admin
from app.services.storage.interface import StorageService
from app.services.user.interface import UserService
from app.utils import app_runtime_context
from app.utils.assignment_algorithm import (
    build_precise_assignment_cache, LocalFileCacheManager,
    get_user_assigned_rows, calculate_assigned_user
)
from app.utils.dependencies import is_tenant_admin
from app.utils.name_validator import validate_name_format
from app.utils.storage_enum import StoragePath
from app.utils.timezone_utils import convert_to_naive_datetime
from app.utils.validators import (
    validate_project_exists,
    check_dataset_in_use,
    DatasetTaskCreationKind,
)
from app.services.label.label import DefaultLabelService
from .interface import MultiLabelService


class DefaultMultiLabelService(MultiLabelService):
    """多人标注服务实现类"""
    
    def __init__(
        self,
        dataset_mapper: LabelDatasetMapper,
        training_dataset_mapper: TrainingDatasetMapper,
        task_mapper: LabelTaskMapper,
        progress_mapper: LabelProgressMapper,
        member_mapper: LabelTaskMemberMapper,
        audit_progress_mapper: LabelAuditProgressMapper,
        assignment_rule_mapper: LabelTaskAssignmentRuleMapper,
        storage: StorageService,
        label_service: LabelService,
        user_service: UserService
    ) -> None:
        self.dataset_mapper = dataset_mapper
        self.training_dataset_mapper = training_dataset_mapper
        self.task_mapper = task_mapper
        self.progress_mapper = progress_mapper
        self.member_mapper = member_mapper
        self.audit_progress_mapper = audit_progress_mapper
        self.assignment_rule_mapper = assignment_rule_mapper
        self.storage = storage
        self.label_service = label_service
        self.user_service = user_service
        self.cache_manager = LocalFileCacheManager()
    
    # ------------------------------ 内部辅助方法 ------------------------------
    async def _get_juicefs_client(self) -> Any:
        """获取JuiceFS客户端"""
        from app.utils import app_runtime_context
        tenant_id = app_runtime_context.get_tenant_id()
        return await self.storage.JUICEFS_CLIENT(tenant_id)

    @staticmethod
    def _normalize_task_biz_type(biz_type: Optional[Any]) -> str:
        if isinstance(biz_type, LabelTaskBizType):
            return biz_type.value
        if not biz_type:
            return LabelTaskBizType.LLM.value
        return str(biz_type)

    @classmethod
    def _is_machine_learning_biz(cls, biz_type: Optional[Any]) -> bool:
        return cls._normalize_task_biz_type(biz_type) == LabelTaskBizType.MACHINE_LEARNING.value

    def _dataset_type_value(
        self,
        dataset: Union[LabelDataset, LabelMachineLearningDataset]
    ) -> Optional[str]:
        if isinstance(dataset, LabelMachineLearningDataset):
            return dataset.annotation_type or dataset.data_type
        return dataset.dataset_type

    async def _get_task_dataset(
        self,
        task: LabelTask,
        session=None,
    ) -> Optional[Union[LabelDataset, LabelMachineLearningDataset]]:
        """按任务业务类型读取对应的数据集对象。"""
        if session is None:
            session = await self.task_mapper.get_session()
        if self._is_machine_learning_biz(task.biz_type):
            return await session.scalar(
                select(LabelMachineLearningDataset).filter(
                    LabelMachineLearningDataset.id == task.label_dataset_id
                )
            )
        return await session.scalar(
            select(LabelDataset).filter(LabelDataset.id == task.label_dataset_id)
        )

    async def _get_task_dataset_or_404(
        self,
        task: LabelTask,
        session=None,
    ) -> Union[LabelDataset, LabelMachineLearningDataset]:
        dataset = await self._get_task_dataset(task, session=session)
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        return dataset

    async def _get_task_dataset_in_project_or_404(
        self,
        task: LabelTask,
        project_id: int,
        session=None,
    ) -> Union[LabelDataset, LabelMachineLearningDataset]:
        dataset = await self._get_task_dataset_or_404(task, session=session)
        if dataset.project_id != project_id:
            raise HTTPException(status_code=403, detail="无权访问该任务")
        return dataset

    def _dataset_name_expr(self):
        return func.coalesce(LabelDataset.name, LabelMachineLearningDataset.name)

    def _dataset_type_expr(self):
        return func.coalesce(
            LabelDataset.dataset_type,
            LabelMachineLearningDataset.annotation_type,
            LabelMachineLearningDataset.data_type,
        )

    def _dataset_total_samples_expr(self):
        return func.coalesce(
            LabelDataset.total_samples,
            LabelMachineLearningDataset.total_samples,
        )

    def _dataset_source_id_expr(self):
        return func.coalesce(
            LabelDataset.source_dataset_id,
            LabelMachineLearningDataset.source_dataset_id,
        )

    def _dataset_submit_id_expr(self):
        return func.coalesce(
            LabelDataset.submit_dataset_id,
            LabelMachineLearningDataset.submit_dataset_id,
        )

    def _join_multi_task_dataset(self, query):
        return (
            query
            .outerjoin(
                LabelDataset,
                and_(
                    or_(
                        LabelTask.biz_type == LabelTaskBizType.LLM.value,
                        LabelTask.biz_type.is_(None),
                    ),
                    LabelDataset.id == LabelTask.label_dataset_id,
                ),
            )
            .outerjoin(
                LabelMachineLearningDataset,
                and_(
                    LabelTask.biz_type == LabelTaskBizType.MACHINE_LEARNING.value,
                    LabelMachineLearningDataset.id == LabelTask.label_dataset_id,
                ),
            )
        )

    def _multi_task_project_filter(self, project_id: int):
        return or_(
            and_(
                or_(
                    LabelTask.biz_type == LabelTaskBizType.LLM.value,
                    LabelTask.biz_type.is_(None),
                ),
                LabelDataset.project_id == project_id,
            ),
            and_(
                LabelTask.biz_type == LabelTaskBizType.MACHINE_LEARNING.value,
                LabelMachineLearningDataset.project_id == project_id,
            ),
        )

    @staticmethod
    def _format_training_dataset_name(dataset: TrainingDataset) -> str:
        try:
            usage_desc = DatasetUsage(dataset.usage).description if dataset.usage else None
        except ValueError:
            usage_desc = dataset.usage
        name_version = f"{dataset.name}-{dataset.version}" if dataset.version else dataset.name
        return f"{usage_desc}/{name_version}" if usage_desc else name_version

    @staticmethod
    def _normalize_dataset_id(dataset_id: Any) -> Optional[int]:
        """统一数据集ID类型（兼容 Decimal/str/int）。"""
        if dataset_id is None:
            return None
        if isinstance(dataset_id, str) and not dataset_id.strip():
            return None
        try:
            return int(dataset_id)
        except (TypeError, ValueError):
            return None

    async def _load_related_dataset_names(
        self,
        session,
        rows: List[Any],
    ) -> Dict[str, Dict[int, str]]:
        """批量读取来源/提交数据集名称，按任务业务类型分别查询。"""
        llm_ids: Set[int] = set()
        ml_ids: Set[int] = set()
        for row in rows:
            biz_type = self._normalize_task_biz_type(getattr(row, "biz_type", None))
            source_dataset_id = self._normalize_dataset_id(getattr(row, "source_dataset_id", None))
            submit_dataset_id = self._normalize_dataset_id(getattr(row, "submit_dataset_id", None))
            target = ml_ids if self._is_machine_learning_biz(biz_type) else llm_ids
            if source_dataset_id:
                target.add(source_dataset_id)
            if submit_dataset_id:
                target.add(submit_dataset_id)

        llm_names: Dict[int, str] = {}
        ml_names: Dict[int, str] = {}
        if llm_ids:
            result = await session.execute(
                select(TrainingDataset).filter(TrainingDataset.id.in_(llm_ids))
            )
            for dataset in result.scalars().all():
                llm_names[dataset.id] = self._format_training_dataset_name(dataset)
        if ml_ids:
            result = await session.execute(
                select(MachineLearningDataset).filter(MachineLearningDataset.id.in_(ml_ids))
            )
            for dataset in result.scalars().all():
                ml_names[dataset.id] = format_machine_learning_dataset_display_name(
                    dataset.name,
                    dataset.version,
                    dataset.annotation_type,
                    task_type=dataset.task_type,
                    data_type=dataset.data_type,
                )
        return {
            LabelTaskBizType.LLM.value: llm_names,
            LabelTaskBizType.MACHINE_LEARNING.value: ml_names,
        }

    async def _load_related_training_methods(
        self,
        session,
        rows: List[Any],
    ) -> Dict[str, Dict[int, Optional[str]]]:
        """批量读取来源/提交训练数据集的训练方法类型，机器学习任务返回空映射。"""
        llm_ids: Set[int] = set()
        for row in rows:
            biz_type = self._normalize_task_biz_type(getattr(row, "biz_type", None))
            if self._is_machine_learning_biz(biz_type):
                continue
            source_dataset_id = self._normalize_dataset_id(getattr(row, "source_dataset_id", None))
            submit_dataset_id = self._normalize_dataset_id(getattr(row, "submit_dataset_id", None))
            if source_dataset_id:
                llm_ids.add(source_dataset_id)
            if submit_dataset_id:
                llm_ids.add(submit_dataset_id)

        llm_methods: Dict[int, Optional[str]] = {}
        if llm_ids:
            result = await session.execute(
                select(TrainingDataset).filter(TrainingDataset.id.in_(llm_ids))
            )
            for dataset in result.scalars().all():
                llm_methods[dataset.id] = dataset.training_method_type

        return {
            LabelTaskBizType.LLM.value: llm_methods,
            LabelTaskBizType.MACHINE_LEARNING.value: {},
        }

    async def _get_llm_dataset_training_meta(
        self,
        task: LabelTask,
        dataset: Union[LabelDataset, LabelMachineLearningDataset],
        session=None,
    ) -> Tuple[Optional[TrainingMethodType], Optional[str]]:
        """
        读取 LLM 标注数据集对应的训练元信息。
        - training_method_type: 源训练数据集的 sft/dpo
        - dataset_format: 当前标注数据集格式
        机器学习任务统一返回 (None, None)。
        """
        if task.biz_type != LabelTaskBizType.LLM.value:
            return None, None

        dataset_format = getattr(dataset, "dataset_format", None)
        source_dataset_id = getattr(dataset, "source_dataset_id", None)
        if not source_dataset_id:
            return None, dataset_format

        if session is None:
            session = await self.task_mapper.get_session()

        source_training_dataset = await session.scalar(
            select(TrainingDataset).filter(TrainingDataset.id == source_dataset_id)
        )
        if not source_training_dataset or not source_training_dataset.training_method_type:
            return None, dataset_format

        try:
            return TrainingMethodType(source_training_dataset.training_method_type), dataset_format
        except ValueError:
            return None, dataset_format

    async def _read_dataset_file(self, dataset_path: str) -> List[Dict[str, Any]]:
        """读取数据集文件（raw_data.jsonl）"""
        jfs = await self._get_juicefs_client()
        if not jfs.exists(dataset_path):
            return []
        
        items = []
        try:
            with jfs.open(dataset_path, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, start=1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                        item['row_number'] = line_num
                        items.append(item)
                    except json.JSONDecodeError:
                        logger.warning(f"跳过无效JSON行 {line_num}: {line}")
        except Exception as e:
            logger.error(f"读取数据集文件失败: {str(e)}", exc_info=True)
        
        return items
    
    async def _read_annotations_file(self, dataset_path: str) -> Dict[int, Dict[str, Any]]:
        """读取标注文件，与 label_tasks 写入路径一致：dataset_path.replace('.jsonl', '.annotations.jsonl')"""
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
                            # 消费者写入格式为 item_id + annotation，兼容 row_number（若有）
                            row_number = item.get('row_number')
                            if row_number is None and item.get('item_id') is not None:
                                try:
                                    row_number = int(item['item_id'])
                                except (ValueError, TypeError):
                                    pass
                            if row_number is not None:
                                # 统一为带 annotation 的格式，供上层 item['annotation_data'].get('annotation') 使用
                                annotations[row_number] = item
                        except json.JSONDecodeError:
                            logger.warning(f"跳过无效JSON行: {line}")
            except Exception as e:
                logger.error(f"读取标注文件失败: {str(e)}", exc_info=True)
        return annotations
    
    async def _read_audits_file(self, dataset_path: str) -> Dict[int, Dict[str, Any]]:
        """读取审核文件（audits.overlay.jsonl）"""
        jfs = await self._get_juicefs_client()
        audits_path = self._get_audits_path(dataset_path)

        audits = {}
        if jfs.exists(audits_path):
            try:
                with jfs.open(audits_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            item = json.loads(line)
                            row_number = item.get('row_number')
                            if row_number:
                                audits[row_number] = item
                        except json.JSONDecodeError:
                            logger.warning(f"跳过无效JSON行: {line}")
            except Exception as e:
                logger.error(f"读取审核文件失败: {str(e)}", exc_info=True)
        return audits

    def _get_audits_path(self, dataset_path: str) -> str:
        return os.path.join(os.path.dirname(dataset_path), 'audits.overlay.jsonl')

    async def _read_annotated_row_ids(self, dataset_path: str) -> Set[int]:
        """流式读取标注文件，只收集已标注行号集合，不存内容，避免大文件 OOM。"""
        jfs = await self._get_juicefs_client()
        annotations_path = dataset_path.replace('.jsonl', '.annotations.jsonl')
        ids: Set[int] = set()
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
                        row_number = item.get('row_number')
                        if row_number is None and item.get('item_id') is not None:
                            try:
                                row_number = int(item['item_id'])
                            except (ValueError, TypeError):
                                pass
                        if row_number is not None:
                            ids.add(int(row_number))
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.error(f"读取标注行号失败: {e}", exc_info=True)
        return ids

    async def _read_annotation_for_row(self, dataset_path: str, row_number: int) -> Optional[Dict[str, Any]]:
        """流式读取标注文件，只返回指定行号的标注项，读到即停，避免大文件 OOM。"""
        jfs = await self._get_juicefs_client()
        annotations_path = dataset_path.replace('.jsonl', '.annotations.jsonl')
        if not jfs.exists(annotations_path):
            return None
        try:
            with jfs.open(annotations_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                        rn = item.get('row_number')
                        if rn is None and item.get('item_id') is not None:
                            try:
                                rn = int(item['item_id'])
                            except (ValueError, TypeError):
                                pass
                        if rn == row_number:
                            return item
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.warning(f"读取标注行 {row_number} 失败: {e}")
        return None

    async def _read_audited_row_ids(self, dataset_path: str) -> Set[int]:
        """流式读取审核文件，只收集已审核行号集合，不存内容，避免大文件 OOM。"""
        jfs = await self._get_juicefs_client()
        audits_path = self._get_audits_path(dataset_path)
        ids: Set[int] = set()
        if not jfs.exists(audits_path):
            return ids
        try:
            with jfs.open(audits_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                        row_number = item.get('row_number')
                        if row_number is not None:
                            ids.add(int(row_number))
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.error(f"读取审核行号失败: {e}", exc_info=True)
        return ids

    async def _read_audit_for_row(self, dataset_path: str, row_number: int) -> Optional[Dict[str, Any]]:
        """流式读取审核文件，只返回指定行号的最后一条审核记录（同行多次写入取最后），读到即停。"""
        jfs = await self._get_juicefs_client()
        audits_path = self._get_audits_path(dataset_path)
        if not jfs.exists(audits_path):
            return None
        found = None
        try:
            with jfs.open(audits_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                        if item.get('row_number') == row_number:
                            found = item
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.warning(f"读取审核行 {row_number} 失败: {e}")
        return found

    async def _read_audit_result_map(self, dataset_path: str) -> Dict[int, str]:
        """流式读取审核文件，只收集 row_number -> audit_result（最后一条），用于管理员筛选，不存全文。"""
        jfs = await self._get_juicefs_client()
        audits_path = self._get_audits_path(dataset_path)
        result: Dict[int, str] = {}
        if not jfs.exists(audits_path):
            return result
        try:
            with jfs.open(audits_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                        rn = item.get('row_number')
                        if rn is not None and item.get('audit_result') is not None:
                            result[int(rn)] = str(item['audit_result'])
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.error(f"读取审核结果映射失败: {e}", exc_info=True)
        return result

    async def _read_raw_rows(self, dataset_path: str, row_numbers: List[int]) -> Dict[int, Dict[str, Any]]:
        """流式读取 raw 文件，只返回指定行号的数据，不整份进内存。"""
        jfs = await self._get_juicefs_client()
        if not jfs.exists(dataset_path):
            return {}
        want = set(row_numbers)
        result: Dict[int, Dict[str, Any]] = {}
        current_row = 1
        try:
            with jfs.open(dataset_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    try:
                        item = json.loads(line)
                        if current_row in want:
                            if isinstance(item, list):
                                item = item[0] if item else {}
                            if isinstance(item, dict):
                                item = item.copy()
                            item['row_number'] = current_row
                            result[current_row] = item
                            if len(result) >= len(want):
                                break
                        current_row += 1
                    except json.JSONDecodeError:
                        current_row += 1
        except Exception as e:
            logger.warning(f"读取 raw 行失败: {e}")
        return result

    async def _normalize_annotation_payload_for_dataset(
        self,
        dataset: Union[LabelDataset, LabelMachineLearningDataset],
        row_number: int,
        annotation: Union[Dict[str, Any], List[Any], None],
    ) -> Union[Dict[str, Any], List[Any], None]:
        """
        按数据集格式归一化多人标注保存内容，兼容旧前端字段：
        - alpaca: `response` -> `chosen`
        - role-based SFT: `response` -> `messages=[assistant]`
        - role-based DPO: `response` -> `chosen={role: assistant, content: ...}`
        - role-based DPO: `chosen/rejected` 为字符串时包装成 assistant message
        """
        if not isinstance(annotation, (dict, list)):
            return annotation

        # 掩码实例分割模板：前端 polygon_with_holes 格式转换为 RLE 存储格式
        if (
            isinstance(dataset, LabelMachineLearningDataset)
            and getattr(dataset, "template_type", None) == MachineLearningDatasetTemplateType.INSTANCE_SEGMENTATION_MASK.value
        ):
            try:
                from app.utils.segmentation_codec import frontend_annotations_to_storage
                raw_row = (await self._read_raw_rows(dataset.dataset_path, [row_number])).get(row_number, {}) or {}
                if isinstance(raw_row, dict):
                    h = raw_row.get("height") or (raw_row.get("data") or {}).get("height")
                    w = raw_row.get("width") or (raw_row.get("data") or {}).get("width")
                else:
                    h = w = None
                if isinstance(h, int) and isinstance(w, int):
                    inner = (
                        annotation.get("annotations", [])
                        if isinstance(annotation, dict)
                        else annotation
                    )
                    return frontend_annotations_to_storage(inner, h, w)
                logger.warning(f"多人标注掩码无法获取图片尺寸，丢弃标注内容: row={row_number}")
                return []
            except Exception as e:
                logger.warning(f"多人标注掩码格式转换失败，丢弃标注内容: row={row_number}, error={e}")
            return []

        if not isinstance(annotation, dict):
            return annotation

        dataset_format = getattr(dataset, "dataset_format", None)
        normalized = annotation.copy()

        if dataset_format == LabelDatasetFormat.ALPACA.value:
            if "response" in normalized and "chosen" not in normalized:
                normalized["chosen"] = normalized["response"]
            return normalized

        if dataset_format != LabelDatasetFormat.ROLE_BASED.value:
            return normalized

        raw_item = {}
        try:
            raw_item = (await self._read_raw_rows(dataset.dataset_path, [row_number])).get(row_number, {}) or {}
        except Exception as e:
            logger.warning(
                "读取原始数据用于归一化标注失败: task_dataset_id=%s row=%s error=%s",
                getattr(dataset, "id", None),
                row_number,
                e,
            )

        is_dpo_role_based = isinstance(raw_item, dict) and (
            "chosen" in raw_item or "rejected" in raw_item
        )

        for field_name in ("chosen", "rejected"):
            field_value = normalized.get(field_name)
            if isinstance(field_value, str):
                normalized[field_name] = {
                    "role": "assistant",
                    "content": field_value,
                }

        if "response" in normalized:
            response_content = normalized["response"]
            if is_dpo_role_based:
                normalized.setdefault(
                    "chosen",
                    {"role": "assistant", "content": response_content},
                )
            elif "messages" not in normalized:
                normalized["messages"] = [
                    {"role": "assistant", "content": response_content}
                ]

        return normalized

    def _build_annotation_offset_index(self, jfs, dataset_path: str) -> Dict[int, int]:
        """流式扫描标注文件，记录 row_number -> 行起始 offset，不存内容，避免 OOM。"""
        annotations_path = dataset_path.replace('.jsonl', '.annotations.jsonl')
        index: Dict[int, int] = {}
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
                        rn = item.get('row_number')
                        if rn is None and item.get('item_id') is not None:
                            try:
                                rn = int(item['item_id'])
                            except (ValueError, TypeError):
                                pass
                        if rn is not None:
                            index[int(rn)] = offset
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.error(f"构建标注 offset 索引失败: {e}", exc_info=True)
        return index

    def _build_audit_offset_index(self, jfs, dataset_path: str) -> Dict[int, int]:
        """流式扫描审核文件，记录 row_number -> 最后一条的 offset（同号多次取最后），不存内容。"""
        audits_path = self._get_audits_path(dataset_path)
        index: Dict[int, int] = {}
        if not jfs.exists(audits_path):
            return index
        try:
            with jfs.open(audits_path, 'r', encoding='utf-8') as f:
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
                        rn = item.get('row_number')
                        if rn is not None:
                            index[int(rn)] = offset
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.error(f"构建审核 offset 索引失败: {e}", exc_info=True)
        return index

    def _read_line_at_offset(self, jfs, path: str, offset: int) -> Optional[Dict[str, Any]]:
        """在指定 path 的 offset 处读一行并解析为 JSON。"""
        if not path or offset < 0:
            return None
        try:
            with jfs.open(path, 'r', encoding='utf-8') as f:
                f.seek(offset)
                line = f.readline()
                if not line:
                    return None
                return json.loads(line.strip())
        except Exception:
            return None
    
    def _calculate_item_status(
        self,
        annotation_data: dict,
        audit_data: dict
    ) -> tuple:
        """
        计算数据项状态和是否可编辑
        
        返回: (status: AnnotationItemStatus, is_editable: bool)
        """
        # 无标注数据 -> 待标注
        if not annotation_data:
            return AnnotationItemStatus.PENDING, True

        # 删任务标签后 JFS 可能追加 {"annotation": {}}；未提交前视为待标注（与删类回滚落盘一致）
        is_final = annotation_data.get('is_final', False)
        if not is_final:
            ann = annotation_data.get('annotation')
            if ann is None or ann == {} or ann == []:
                return AnnotationItemStatus.PENDING, True
        
        # 无审核数据
        if not audit_data or not audit_data.get('audit_result'):
            if is_final:
                return AnnotationItemStatus.SUBMITTED, False  # 已提交，不可编辑
            return AnnotationItemStatus.SAVED, True  # 已暂存，可编辑
        
        audit_result = audit_data.get('audit_result')
        
        # 审核通过
        if audit_result == 'passed':
            return AnnotationItemStatus.AUDIT_PASSED, False  # 审核通过，不可编辑
        
        # 审核不通过
        if audit_result == 'failed':
            annotation_time = annotation_data.get('updated_at')
            audit_time = audit_data.get('updated_at')
            
            # 判断是否重标过（标注时间 > 审核时间）
            if annotation_time and audit_time:
                try:
                    from datetime import datetime
                    ann_dt = datetime.fromisoformat(annotation_time) if isinstance(annotation_time, str) else annotation_time
                    aud_dt = datetime.fromisoformat(audit_time) if isinstance(audit_time, str) else audit_time
                    if ann_dt > aud_dt:
                        if is_final:
                            return AnnotationItemStatus.RESUBMITTED, False  # 已重新提交，不可编辑
                        return AnnotationItemStatus.SAVED, True  # 重标后暂存，可编辑
                except (ValueError, TypeError):
                    pass
            
            return AnnotationItemStatus.AUDIT_FAILED, True  # 审核不通过，可编辑
        
        # 默认情况
        return AnnotationItemStatus.SUBMITTED, False
    
    @classmethod
    def _multi_label_jfs_root(cls, namespace: str) -> str:
        """多人非 ML 标注根：.../multi_label/datasets/。"""
        return StoragePath.REGISTERED_MULTI_LABEL_DATASETS.format_storage_path(namespace=namespace)

    @classmethod
    def _multi_label_ml_jfs_root(cls, namespace: str) -> str:
        """多人 ML 标注根：.../multi_label/ml-datasets/。"""
        return StoragePath.REGISTERED_MULTI_LABEL_ML_DATASETS.format_storage_path(namespace=namespace)

    @classmethod
    def _multi_label_llm_raw_data_jsonl_path(cls, namespace: str, label_dataset_id: int) -> str:
        """LLM 等多人非 ML 数据集主文件路径。"""
        return f"{cls._multi_label_jfs_root(namespace)}{label_dataset_id}/raw_data.jsonl"

    @classmethod
    def _multi_label_llm_images_directory(cls, namespace: str, label_dataset_id: int) -> str:
        """LLM 图像理解等多人非 ML 图片目录。"""
        return f"{cls._multi_label_jfs_root(namespace)}{label_dataset_id}/images"

    @classmethod
    def _multi_label_ml_task_directory(cls, namespace: str, label_dataset_id: int, task_name: str) -> str:
        """仅机器学习多人任务：.../multi_label/ml-datasets/{label_dataset_id}/{task_name}/"""
        base_path = cls._multi_label_ml_jfs_root(namespace)
        return f"{base_path}{label_dataset_id}/{task_name}/"

    @classmethod
    def _multi_label_ml_dataset_jsonl_path(cls, namespace: str, label_dataset_id: int, task_name: str) -> str:
        """仅机器学习多人：任务目录下 dataset.jsonl。"""
        return f"{cls._multi_label_ml_task_directory(namespace, label_dataset_id, task_name)}dataset.jsonl"

    @classmethod
    def _multi_label_ml_image_folder_prefix(cls, namespace: str, label_dataset_id: int) -> str:
        """仅机器学习：label_dataset_id 级目录前缀（无任务名）；任务内资产以 dataset_path 为准。"""
        return f"{cls._multi_label_ml_jfs_root(namespace)}{label_dataset_id}"

    def _generate_dataset_path(
        self,
        namespace: str,
        dataset_name: str,
        dataset_id: int,
        biz_type: str = LabelTaskBizType.LLM.value,
    ) -> str:
        """生成多人标注数据集在 JuiceFS 中的存储路径。"""
        if self._is_machine_learning_biz(biz_type):
            return self._multi_label_ml_dataset_jsonl_path(namespace, dataset_id, dataset_name)
        return self._multi_label_llm_raw_data_jsonl_path(namespace, dataset_id)

    def _generate_image_folder_path(
        self,
        namespace: str,
        dataset_id: int,
        biz_type: str = LabelTaskBizType.LLM.value,
    ) -> str:
        """生成多人标注任务下图片/资产所在目录。"""
        if self._is_machine_learning_biz(biz_type):
            return self._multi_label_ml_image_folder_prefix(namespace, dataset_id)
        return self._multi_label_llm_images_directory(namespace, dataset_id)

    async def _build_base_url_for_multi_label_dataset(
        self,
        project_id: int,
        dataset: Union[LabelDataset, LabelMachineLearningDataset],
    ) -> Optional[str]:
        """
        生成图片/资产下载用的 base_url：
        - LLM 图像理解：{tenant}/.../multi_label/datasets/{id}/images/
        - 机器学习：dataset.jsonl 所在目录（{tenant}/.../multi_label/ml-datasets/{id}/{任务名}/），与单人 label/ml-datasets 同级拆分
        """
        tenant_id = app_runtime_context.get_tenant_id()
        if not tenant_id:
            logger.warning("无法获取租户ID，跳过多人标注 base_url 生成")
            return None

        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        if isinstance(dataset, LabelMachineLearningDataset):
            if not (dataset.dataset_path or "").strip():
                logger.warning("机器学习多人数据集 dataset_path 为空，跳过 base_url")
                return None
            image_folder_path = os.path.dirname(dataset.dataset_path.replace("\\", "/"))
            if not image_folder_path.endswith("/"):
                image_folder_path += "/"
            rel = image_folder_path.lstrip("/")
            base_url = f"{tenant_id}/{rel}"
            if not base_url.endswith("/"):
                base_url += "/"
            logger.debug(f"生成多人标注机器学习 base_url: {base_url}")
            return base_url
        if isinstance(dataset, LabelDataset) and dataset.dataset_type == LabelDatasetType.IMAGE_UNDERSTANDING.value:
            image_folder_path = self._generate_image_folder_path(namespace, dataset.id)
            rel = image_folder_path.lstrip("/")
            base_url = f"{tenant_id}/{rel}/"
            logger.debug(f"生成多人标注数据集 base_url: {base_url}")
            return base_url
        return None

    async def _copy_dataset_directory(self, source_dir: str, target_dir: str) -> None:
        """复制 JuiceFS 中的目录（递归复制）"""
        jfs = await self._get_juicefs_client()
        if not jfs.exists(source_dir):
            logger.warning(f"源目录不存在，跳过复制: {source_dir}")
            return
        try:
            target_parent = os.path.dirname(target_dir)
            if target_parent and not jfs.exists(target_parent):
                jfs.makedirs(target_parent, exist_ok=True)
            jfs.makedirs(target_dir, exist_ok=True)

            def copy_recursive(source: str, target: str):
                try:
                    items = jfs.listdir(source)
                except Exception as e:
                    logger.error(f"无法列出目录内容: {source}, 错误: {str(e)}")
                    return
                for item in items:
                    source_path = os.path.join(source, item).replace('\\', '/')
                    target_path = os.path.join(target, item).replace('\\', '/')
                    is_directory = False
                    try:
                        jfs.listdir(source_path)
                        is_directory = True
                    except Exception:
                        pass
                    if is_directory:
                        try:
                            jfs.listdir(target_path)
                        except Exception:
                            jfs.makedirs(target_path, exist_ok=True)
                        copy_recursive(source_path, target_path)
                    else:
                        try:
                            with jfs.open(source_path, 'rb') as source_file:
                                file_content = source_file.read()
                            with jfs.open(target_path, 'wb') as target_file:
                                target_file.write(file_content)
                            logger.debug(f"复制文件: {source_path} -> {target_path}")
                        except Exception as file_error:
                            logger.error(f"复制文件失败: {source_path} -> {target_path}, 错误: {str(file_error)}")
                            raise

            copy_recursive(source_dir, target_dir)
            logger.info(f"成功复制目录: {source_dir} -> {target_dir}")
        except Exception as e:
            logger.error(f"复制目录失败: {source_dir} -> {target_dir}, 错误: {str(e)}")
            raise

    async def _load_machine_learning_label_schema(
        self,
        machine_learning_dataset: MachineLearningDataset,
    ) -> tuple[Optional[Dict[str, str]], int]:
        label_schema_json = None
        class_count = 0
        if not machine_learning_dataset.label_schema_path:
            return label_schema_json, class_count

        jfs = await self._get_juicefs_client()
        if not jfs.exists(machine_learning_dataset.label_schema_path):
            return label_schema_json, class_count

        try:
            with jfs.open(machine_learning_dataset.label_schema_path, "r", encoding="utf-8") as schema_file:
                parsed = json.loads(schema_file.read() or "{}")
                if isinstance(parsed, dict):
                    label_schema_json = {str(k): str(v) for k, v in parsed.items()}
                    class_count = len(label_schema_json)
        except Exception:
            label_schema_json = None
            class_count = 0
        return label_schema_json, class_count

    async def _create_machine_learning_task_dataset(
        self,
        task_create: MultiLabelTaskCreate,
        project_id: int,
        session,
        current_user: JwtUserInfo,
    ) -> tuple[LabelMachineLearningDataset, MachineLearningDataset]:
        if task_create.source_dataset_id is None:
            raise HTTPException(status_code=400, detail="机器学习多人标注任务必须传 source_dataset_id")

        source_ml_dataset = await session.scalar(
            select(MachineLearningDataset).filter(
                MachineLearningDataset.id == task_create.source_dataset_id,
                MachineLearningDataset.project_id == project_id,
            )
        )
        if not source_ml_dataset:
            raise HTTPException(status_code=404, detail=f"机器学习数据集不存在: {task_create.source_dataset_id}")

        existing = await session.scalar(
            select(LabelMachineLearningDataset).filter(
                LabelMachineLearningDataset.project_id == project_id,
                LabelMachineLearningDataset.name == task_create.task_name,
            )
        )
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"项目中已存在同名的机器学习标注任务: {task_create.task_name}",
            )

        label_schema_json, class_count = await self._load_machine_learning_label_schema(source_ml_dataset)
        dataset = LabelMachineLearningDataset(
            name=task_create.task_name,
            description=task_create.dataset_description,
            project_id=project_id,
            source_dataset_id=source_ml_dataset.id,
            override=task_create.override,
            task_type=source_ml_dataset.task_type,
            data_type=source_ml_dataset.data_type,
            annotation_type=source_ml_dataset.annotation_type,
            template_type=source_ml_dataset.template_type,
            class_count=class_count,
            label_schema_json=label_schema_json,
            total_samples=source_ml_dataset.sample_count or 0,
            dataset_path="",
            created_id=current_user.userId,
            created_by=current_user.username,
        )
        session.add(dataset)
        await session.flush()
        await session.refresh(dataset)
        return dataset, source_ml_dataset

    async def _create_llm_task_dataset(
        self,
        task_create: MultiLabelTaskCreate,
        project_id: int,
        session,
        current_user: JwtUserInfo,
    ) -> tuple[LabelDataset, TrainingDataset]:
        existing_datasets = await self.dataset_mapper.query(
            select(LabelDataset).filter(
                LabelDataset.project_id == project_id,
                LabelDataset.name == task_create.task_name,
            )
        )
        if existing_datasets:
            raise HTTPException(
                status_code=400,
                detail=f"项目中已存在同名的标注任务: {task_create.task_name}",
            )

        if task_create.source != LabelDatasetSource.EXISTED_DATASET:
            if task_create.source == LabelDatasetSource.UPLOAD:
                raise HTTPException(status_code=400, detail="暂不支持本地上传功能")
            raise HTTPException(status_code=400, detail=f"不支持的数据来源: {task_create.source}")

        if not task_create.source_dataset_id:
            raise HTTPException(status_code=400, detail="从已有数据集创建时，必须指定数据集")

        training_dataset = await self.training_dataset_mapper.query_one(
            select(TrainingDataset).filter(TrainingDataset.id == task_create.source_dataset_id)
        )
        if not training_dataset:
            raise HTTPException(status_code=404, detail=f"数据集不存在: {task_create.source_dataset_id}")
        if training_dataset.project_id != project_id:
            raise HTTPException(status_code=400, detail="训练数据集不属于当前项目")

        await check_dataset_in_use(
            session,
            training_dataset.name,
            project_id,
            training_dataset.version,
            creating=DatasetTaskCreationKind.LABEL,
        )

        total_samples = training_dataset.total_samples or 0
        if total_samples == 0:
            raise HTTPException(
                status_code=400,
                detail=f"数据集 '{training_dataset.name}' (版本: {training_dataset.version}) 为空，无法创建标注任务",
            )

        inherited_dataset_type = training_dataset.dataset_type
        inherited_dataset_format = training_dataset.dataset_format
        if task_create.dataset_format and task_create.dataset_format != inherited_dataset_format:
            logger.info(
                "多人标注任务请求中的 dataset_format 与源数据集不一致，已按源数据集继承: request=%s source=%s dataset_id=%s",
                task_create.dataset_format,
                inherited_dataset_format,
                training_dataset.id,
            )

        dataset = LabelDataset(
            name=task_create.task_name,
            description=task_create.dataset_description,
            project_id=project_id,
            source=task_create.source,
            source_dataset_id=task_create.source_dataset_id,
            dataset_type=inherited_dataset_type,
            dataset_format=inherited_dataset_format,
            task_type=LabelTaskType.MULTI.value,
            total_samples=total_samples,
            total_characters=training_dataset.total_characters or 0,
            file_size=training_dataset.file_size or 0.0,
            override=task_create.override,
            dataset_path="",
            created_id=current_user.userId,
            created_by=current_user.username,
        )
        session.add(dataset)
        await session.flush()
        await session.refresh(dataset)
        return dataset, training_dataset

    # -------------------------------------------------------------------------
    # 多人标注任务状态机（梳理）
    # -------------------------------------------------------------------------
    # 状态流转图（简版）：
    #   CREATED
    #      └─(有人开始标注)→ ANNOTATING
    #           └─(标注员全部提交)→ ANNOTATION_DONE
    #                └─(审核开始)→ AUDITING
    #                     ├─(存在未通过且未重标)→ REWORK
    #                     │      └─(返工数据全部提交)→ REAUDITING
    #                     │             ├─(仍有未通过)→ REWORK
    #                     │             └─(全部通过)→ AUDIT_PASSED
    #                     └─(全部通过)→ AUDIT_PASSED
    #   AUDIT_PASSED
    #      └─(管理员发布)→ PUBLISHED
    #
    # 说明：
    # - REWORK 阶段只允许标注返工，不允许审核操作。
    # - REAUDITING 是显式“重审轮次”状态，接口不再通过时间戳推断轮次。
    #
    # 状态枚举：CREATED → ANNOTATING → ANNOTATION_DONE → AUDITING → REWORK → REAUDITING → ... → AUDIT_PASSED → PUBLISHED
    #
    # 【正常允许的转换】（valid_transitions，非 force 时校验）
    #   CREATING        → CREATED             （异步拷贝完成，通常由 Celery 直接改库）
    #   CREATED         → ANNOTATING          （有人开始标注）
    #   ANNOTATING      → ANNOTATION_DONE     （所有标注员都提交）
    #   ANNOTATION_DONE → AUDITING            （有人开始审核/有审核数据）
    #   AUDITING       → REWORK | AUDIT_PASSED  （首轮审核提交：有不通过→REWORK，全部通过→AUDIT_PASSED）
    #   REWORK         → REAUDITING              （不通过项都重标并提交后，进入重审）
    #   REAUDITING     → REWORK | AUDIT_PASSED  （重审提交：仍有不通过→REWORK，全部通过→AUDIT_PASSED）
    #   AUDIT_PASSED   → PUBLISHED            （管理员发布）
    #
    # 【触发时机】
    #   - 标注阶段：暂存 → 仅 CREATED→ANNOTATING（在 save_annotation 内）；提交全部 → _check_and_update_annotation_status（ANNOTATING→ANNOTATION_DONE 等）
    #   - 审核阶段：仅审核员「提交审核」→ _check_and_update_audit_status（暂存只保存数据和进度，不改变任务状态）
    #       · ANNOTATION_DONE 且已有审核数据 → 先转 AUDITING，再根据结果转 REWORK 或 AUDIT_PASSED
    #       · 有不通过且未重标 → REWORK（AUDITING/REAUDITING 正常转；ANNOTATING/ANNOTATION_DONE 用 force 转 REWORK）
    #       · 重标提交完成后由标注状态检查逻辑直接从 REWORK 转 REAUDITING（不再借助时间戳推断轮次）
    #       · 全部通过 → AUDIT_PASSED（ANNOTATING/ANNOTATION_DONE 时用 force）
    #   - 返工阶段：标注员暂存不改变状态；所有人提交 → _check_and_update_annotation_status 转 REAUDITING
    #
    # 【前端 is_submitted（审核员不可再改/提交）】任务状态 in {AUDIT_PASSED, PUBLISHED, REWORK} 时为 true
    # -------------------------------------------------------------------------

    async def _update_task_status(
        self,
        task_id: int,
        new_status: MultiLabelTaskStatus,
        force: bool = False
    ) -> bool:
        """
        更新任务状态

        Args:
            task_id: 任务ID
            new_status: 新状态
            force: 是否强制更新（忽略状态转换规则）

        Returns:
            是否更新成功
        """
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            return False

        current_status = task.status

        # 状态转换规则验证（除非force=True）
        valid_transitions = {
            MultiLabelTaskStatus.CREATING.value: [MultiLabelTaskStatus.CREATED.value],
            MultiLabelTaskStatus.CREATED.value: [MultiLabelTaskStatus.ANNOTATING.value],
            MultiLabelTaskStatus.ANNOTATING.value: [MultiLabelTaskStatus.ANNOTATION_DONE.value],
            MultiLabelTaskStatus.ANNOTATION_DONE.value: [MultiLabelTaskStatus.AUDITING.value],
            MultiLabelTaskStatus.AUDITING.value: [MultiLabelTaskStatus.REWORK.value, MultiLabelTaskStatus.AUDIT_PASSED.value],
            MultiLabelTaskStatus.REWORK.value: [MultiLabelTaskStatus.REAUDITING.value],
            MultiLabelTaskStatus.REAUDITING.value: [MultiLabelTaskStatus.REWORK.value, MultiLabelTaskStatus.AUDIT_PASSED.value],
            MultiLabelTaskStatus.AUDIT_PASSED.value: [MultiLabelTaskStatus.PUBLISHED.value],
        }
        
        if not force:
            allowed = valid_transitions.get(current_status, [])
            if new_status.value not in allowed:
                logger.warning(f"无效的状态转换: {current_status} -> {new_status.value}")
                return False
        
        task.status = new_status.value
        await self.task_mapper.commit()
        logger.info(f"任务状态更新: task_id={task_id}, {current_status} -> {new_status.value}")
        return True
    
    async def _check_and_update_annotation_status(self, task_id: int) -> None:
        """
        检查并更新标注相关状态
        
        逻辑：
        - CREATED + 有人开始标注 → ANNOTATING
        - ANNOTATING + 所有人提交完成 → ANNOTATION_DONE
        - REWORK（返工）：暂存或未全部提交时保持 REWORK，仅当所有人提交完成 → REAUDITING
        """
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            return
        
        # 标注阶段：CREATED、ANNOTATING、REWORK（返工重标时也走标注进度）
        if task.status not in [
            MultiLabelTaskStatus.CREATED.value,
            MultiLabelTaskStatus.ANNOTATING.value,
            MultiLabelTaskStatus.REWORK.value,
        ]:
            return
        
        # 获取所有标注员的进度
        progress_list = await self.progress_mapper.query(
            select(LabelProgress).filter(LabelProgress.task_id == task_id)
        )
        
        if not progress_list:
            return
        
        # 检查是否有人开始标注
        has_annotation = any((p.saved_count or 0) > 0 or (p.final_count or 0) > 0 for p in progress_list)
        # 检查是否所有人都提交完成（final_count >= assigned_count），None 按 0 处理
        all_submitted = all((p.final_count or 0) >= (p.assigned_count or 0) for p in progress_list)
        
        if task.status == MultiLabelTaskStatus.CREATED.value and has_annotation:
            # 有人开始标注，转为 ANNOTATING（同一次提交可能 CREATED→ANNOTATING→ANNOTATION_DONE，需继续判断）
            await self._update_task_status(task_id, MultiLabelTaskStatus.ANNOTATING)
            task.status = MultiLabelTaskStatus.ANNOTATING.value
        if task.status == MultiLabelTaskStatus.ANNOTATING.value and all_submitted:
            # 所有人都提交完成，转为 ANNOTATION_DONE
            await self._update_task_status(task_id, MultiLabelTaskStatus.ANNOTATION_DONE)
        elif task.status == MultiLabelTaskStatus.REWORK.value and all_submitted:
            # 返工：仅当所有人提交完成才进入重审；暂存或未全提交时保持 REWORK
            dataset = await self._get_task_dataset(task)
            if dataset:
                audit_result_map = await self._read_audit_result_map(dataset.dataset_path)
                failed_rows = [
                    r for r, v in audit_result_map.items()
                    if v == AuditResult.FAILED.value or v == 'failed'
                ]
                if failed_rows:
                    # 扣减负责这批返工行的审核员的 reviewed_failed_count
                    await self._decrement_auditor_progress_for_rework_rows(task_id, failed_rows)
                    # 将负责这批返工行的审核员 submitted_count 置 0，以便重新审核时 is_submitted=False，界面可操作
                    await self._reset_auditor_submitted_count_for_failed_rows(task_id, failed_rows)
            await self._mark_reaudit_round_started(task_id)
            await self._update_task_status(task_id, MultiLabelTaskStatus.REAUDITING)
    
    async def _check_and_update_audit_status(self, task_id: int) -> None:
        """
        检查并更新审核相关状态
        
        逻辑：
        - 如果任务状态是 ANNOTATION_DONE，有人开始审核，转为 AUDITING
        - 如果存在审核不通过的数据，转为 REWORK
        - 如果所有数据都审核通过，转为 AUDIT_PASSED
        - 重审轮次（REAUDITING）与首轮审核（AUDITING）使用同一套通过/不通过收敛逻辑
        """
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            return
        
        # 获取数据集
        dataset = await self._get_task_dataset(task)
        if not dataset:
            return
        
        # 只读审核结果映射，不整份读入审核文件
        audit_result_map = await self._read_audit_result_map(dataset.dataset_path)
        has_any_audit = bool(audit_result_map)
        
        # ANNOTATION_DONE 且已有审核数据时，先进入审核阶段（AUDITING），再继续判断是否有不通过→REWORK 或全部通过→AUDIT_PASSED，不在此 return
        if task.status == MultiLabelTaskStatus.ANNOTATION_DONE.value and has_any_audit:
            await self._update_task_status(task_id, MultiLabelTaskStatus.AUDITING)
            task.status = MultiLabelTaskStatus.AUDITING.value
        
        run_audit_check = task.status in [
            MultiLabelTaskStatus.AUDITING.value,
            MultiLabelTaskStatus.REAUDITING.value,
            MultiLabelTaskStatus.ANNOTATING.value,
            MultiLabelTaskStatus.ANNOTATION_DONE.value,
        ]
        if run_audit_check:
            audit_progress_list = await self.audit_progress_mapper.query(
                select(LabelAuditProgress).filter(LabelAuditProgress.task_id == task_id)
            )
            total_assigned = sum(p.assigned_count for p in audit_progress_list) if audit_progress_list else 0
            total_passed = sum(p.reviewed_passed_count for p in audit_progress_list) if audit_progress_list else 0
            total_failed = sum(p.reviewed_failed_count for p in audit_progress_list) if audit_progress_list else 0
            total_reviewed = total_passed + total_failed
            
            failed_rows = [r for r, v in audit_result_map.items() if v == AuditResult.FAILED.value or v == 'failed']
            has_failed = len(failed_rows) > 0
            
            # 只对「不通过」的行加载标注与审核时间，判断是否已重标
            all_failed_reworked = True
            if failed_rows:
                jfs = await self._get_juicefs_client()
                ann_index = self._build_annotation_offset_index(jfs, dataset.dataset_path)
                audit_index = self._build_audit_offset_index(jfs, dataset.dataset_path)
                annotations_path = dataset.dataset_path.replace('.jsonl', '.annotations.jsonl')
                audits_path = self._get_audits_path(dataset.dataset_path)
                for row_number in failed_rows:
                    annotation = self._read_line_at_offset(jfs, annotations_path, ann_index[row_number]) if row_number in ann_index else {}
                    audit = self._read_line_at_offset(jfs, audits_path, audit_index[row_number]) if row_number in audit_index else {}
                    annotation = annotation or {}
                    audit = audit or {}
                    annotation_time = annotation.get('updated_at')
                    audit_time = audit.get('updated_at')
                    if not annotation_time or not audit_time:
                        all_failed_reworked = False
                        break
                    try:
                        ann_dt = datetime.fromisoformat(annotation_time) if isinstance(annotation_time, str) else annotation_time
                        aud_dt = datetime.fromisoformat(audit_time) if isinstance(audit_time, str) else audit_time
                        if ann_dt <= aud_dt:
                            all_failed_reworked = False
                            break
                    except (ValueError, TypeError):
                        all_failed_reworked = False
                        break
            
            if total_reviewed >= total_assigned and total_assigned > 0:
                if has_failed and not all_failed_reworked:
                    # 有不通过且未重标，转为 REWORK。审核阶段（AUDITING/REAUDITING）正常转；若当前仍为 ANNOTATING/ANNOTATION_DONE 说明未先进入 AUDITING，用 force 直接转 REWORK
                    if task.status in [MultiLabelTaskStatus.AUDITING.value, MultiLabelTaskStatus.REAUDITING.value]:
                        if task.status != MultiLabelTaskStatus.REWORK.value:
                            await self._update_task_status(task_id, MultiLabelTaskStatus.REWORK)
                            await self._decrement_annotator_progress_for_failed_rows(task_id, failed_rows)
                    elif task.status in [MultiLabelTaskStatus.ANNOTATING.value, MultiLabelTaskStatus.ANNOTATION_DONE.value]:
                        await self._update_task_status(task_id, MultiLabelTaskStatus.REWORK, force=True)
                        await self._decrement_annotator_progress_for_failed_rows(task_id, failed_rows)
                elif not has_failed or total_failed == 0:
                    # 所有都通过，转为 AUDIT_PASSED（若当前为 ANNOTATING/ANNOTATION_DONE 则用 force 允许跨阶段）
                    from_annotating = task.status in [
                        MultiLabelTaskStatus.ANNOTATING.value,
                        MultiLabelTaskStatus.ANNOTATION_DONE.value,
                    ]
                    await self._update_task_status(
                        task_id,
                        MultiLabelTaskStatus.AUDIT_PASSED,
                        force=from_annotating
                    )
    
    async def _reset_auditor_submitted_count_for_failed_rows(
        self,
        task_id: int,
        failed_rows: List[int]
    ) -> None:
        """
        返工后进入新一轮审核时，仅将「被分配了返工行」的审核员的 submitted_count 置 0，
        使其需要重新审核返工数据；未涉及返工行的审核员保持已提交，无需再点一次。
        """
        if not failed_rows:
            return
        rule = await self.assignment_rule_mapper.query_one(
            select(LabelTaskAssignmentRule).filter(
                LabelTaskAssignmentRule.task_id == task_id,
                LabelTaskAssignmentRule.role == MemberRole.AUDITOR.value
            )
        )
        if not rule or not rule.user_ids or not rule.assign_counts:
            return
        audit_cache = self.cache_manager.get_or_build_cache(
            task_id, MemberRole.AUDITOR.value,
            rule.user_ids, rule.assign_counts, rule.random_seed
        )
        auditor_ids_to_reset = {audit_cache[row] for row in failed_rows if row in audit_cache}
        if not auditor_ids_to_reset:
            return
        await self.audit_progress_mapper.execute(
            update(LabelAuditProgress)
            .where(
                and_(
                    LabelAuditProgress.task_id == task_id,
                    LabelAuditProgress.auditor_id.in_(auditor_ids_to_reset),
                )
            )
            .values(submitted_count=0)
        )

    async def _decrement_auditor_progress_for_rework_rows(
        self,
        task_id: int,
        failed_rows: List[int]
    ) -> None:
        """
        返工全部提交（REWORK → REAUDITING）时：只扣减「负责这批返工行」的审核员的 reviewed_failed_count，
        不扣减 assigned_count（分配数不变）。仅处理 failed_rows 对应的数据负责人，不处理其他审核员。
        """
        if not failed_rows:
            return
        rule = await self.assignment_rule_mapper.query_one(
            select(LabelTaskAssignmentRule).filter(
                LabelTaskAssignmentRule.task_id == task_id,
                LabelTaskAssignmentRule.role == MemberRole.AUDITOR.value
            )
        )
        if not rule or not rule.user_ids or not rule.assign_counts:
            return
        audit_cache = self.cache_manager.get_or_build_cache(
            task_id, MemberRole.AUDITOR.value,
            rule.user_ids, rule.assign_counts, rule.random_seed
        )
        # 仅统计「负责这批不通过行」的审核员 -> 其负责的失败行数
        auditor_failed_count: Dict[int, int] = {}
        for row_number in failed_rows:
            auditor_id = audit_cache.get(row_number)
            if auditor_id is not None:
                auditor_failed_count[auditor_id] = auditor_failed_count.get(auditor_id, 0) + 1
        for auditor_id, count in auditor_failed_count.items():
            progress = await self.audit_progress_mapper.query_one(
                select(LabelAuditProgress).filter(
                    LabelAuditProgress.task_id == task_id,
                    LabelAuditProgress.auditor_id == auditor_id
                )
            )
            if not progress:
                continue
            dec_failed = min(count, progress.reviewed_failed_count or 0)
            if dec_failed > 0:
                progress.reviewed_failed_count = (progress.reviewed_failed_count or 0) - dec_failed
                await self.audit_progress_mapper.commit()

    def _reaudit_started_redis_key(self, task_id: int) -> str:
        return f"label:task:{task_id}:reaudit_started_iso"

    async def _mark_reaudit_round_started(self, task_id: int) -> None:
        """
        REWORK→REAUDITING 时写入。返工提交时会批量扣减 reviewed_failed_count，但审核文件仍保留上轮 failed；
        重审若再次判不通过，save_audit 会「先减后加」上一轮 failed：第二条起会把上一条刚加回的计数抵消，
        导致 passed+failed 永远小于 assigned、提交按钮一直灰。用本标记识别「文件中的 failed 早于本轮重审」，
        对这类 prev 不再从 reviewed_failed_count 做减一（仅跳过 failed 的扣减，passed 仍正常维护）。
        """
        from app.core.config import settings

        redis_client = settings.REDIS_CLIENT
        if not redis_client:
            return
        try:
            await redis_client.set(
                self._reaudit_started_redis_key(task_id),
                datetime.now().isoformat(),
                ex=86400 * 120,
            )
        except Exception as e:
            logger.warning("写入重审轮次标记失败 task_id=%s: %s", task_id, e)

    @staticmethod
    def _parse_iso_datetime(value: Any) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, datetime):
            dt = value
        elif isinstance(value, str):
            try:
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                return None
        else:
            return None
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt

    async def _should_skip_prev_failed_count_decrement_for_reaudit(
        self,
        task_id: int,
        task_status: str,
        prev_audit_for_row: Optional[Dict[str, Any]],
    ) -> bool:
        if task_status != MultiLabelTaskStatus.REAUDITING.value or not prev_audit_for_row:
            return False
        prev_result = prev_audit_for_row.get("audit_result")
        if prev_result not in (AuditResult.FAILED.value, "failed", AuditResult.FAILED):
            return False
        from app.core.config import settings

        redis_client = settings.REDIS_CLIENT
        if not redis_client:
            return False
        try:
            raw = await redis_client.get(self._reaudit_started_redis_key(task_id))
        except Exception as e:
            logger.warning("读取重审轮次标记失败 task_id=%s: %s", task_id, e)
            return False
        if not raw:
            return False
        reaudit_iso = raw.decode() if isinstance(raw, bytes) else str(raw)
        reaudit_dt = self._parse_iso_datetime(reaudit_iso)
        prev_ts_raw = prev_audit_for_row.get("updated_at") or prev_audit_for_row.get("audit_time")
        prev_dt = self._parse_iso_datetime(prev_ts_raw)
        if not reaudit_dt or not prev_dt:
            return False
        return prev_dt < reaudit_dt

    async def _decrement_annotator_progress_for_failed_rows(
        self,
        task_id: int,
        failed_rows: List[int]
    ) -> None:
        """
        审核不通过进入返工时：只减统计（LabelProgress.saved_count/final_count 及 Redis 的 saved_items/annotated_items 计数），
        不删除、不修改已标注内容，以便用户在界面上能看到上次填写的内容；统计扣减后标注员在任务列表会看到还有任务需完成。
        """
        if not failed_rows:
            return
        rule = await self.assignment_rule_mapper.query_one(
            select(LabelTaskAssignmentRule).filter(
                LabelTaskAssignmentRule.task_id == task_id,
                LabelTaskAssignmentRule.role == MemberRole.ANNOTATOR.value
            )
        )
        if not rule or not rule.user_ids or not rule.assign_counts:
            return
        assignment_cache = self.cache_manager.get_or_build_cache(
            task_id, MemberRole.ANNOTATOR.value,
            rule.user_ids, rule.assign_counts, rule.random_seed
        )
        # user_id -> 该用户被分配的不通过行号列表
        user_failed_rows: Dict[int, List[int]] = {}
        for row_number in failed_rows:
            user_id = assignment_cache.get(row_number)
            if user_id is not None:
                user_failed_rows.setdefault(user_id, []).append(row_number)
        for user_id, rows in user_failed_rows.items():
            count = len(rows)
            progress = await self.progress_mapper.query_one(
                select(LabelProgress).filter(
                    LabelProgress.task_id == task_id,
                    LabelProgress.user_id == user_id
                )
            )
            if not progress:
                continue
            decrement_saved = min(count, progress.saved_count or 0)
            decrement_final = min(count, progress.final_count or 0)
            if decrement_saved > 0:
                progress.saved_count = (progress.saved_count or 0) - decrement_saved
            if decrement_final > 0:
                progress.final_count = (progress.final_count or 0) - decrement_final
            await self.progress_mapper.commit()
            # 更新 Redis：从该用户的 saved_items、annotated_items 中移除这些行号
            try:
                from app.core.config import settings as app_settings
                redis_client = app_settings.REDIS_CLIENT
                if redis_client:
                    saved_key = f"label:task:{task_id}:user:{user_id}:saved_items"
                    annotated_key = f"label:task:{task_id}:user:{user_id}:annotated_items"
                    for r in rows:
                        await redis_client.srem(saved_key, str(r))
                        await redis_client.srem(annotated_key, str(r))
            except Exception as e:
                logger.warning(f"返工扣减进度后更新 Redis 失败: task_id={task_id}, user_id={user_id}, error={e}")

    async def _update_user_annotation_progress(
        self,
        task_id: int,
        user_id: int,
        is_completed: bool = False
    ) -> None:
        """更新用户的标注进度状态"""
        try:
            # 查询用户的进度记录
            progress = await self.progress_mapper.query_one(
                select(LabelProgress).filter(
                    LabelProgress.task_id == task_id,
                    LabelProgress.user_id == user_id
                )
            )
            if progress:
                if is_completed:
                    progress.status = LabelTaskStatus.COMPLETED.value
                    progress.completed_at = datetime.now()
                await self.progress_mapper.commit()
                logger.info(f"更新用户标注进度: task_id={task_id}, user_id={user_id}, is_completed={is_completed}")
        except Exception as e:
            logger.error(f"更新用户标注进度失败: task_id={task_id}, user_id={user_id}, error={str(e)}", exc_info=True)

    async def _sync_multi_annotator_saved_counts_from_redis(
        self,
        task_id: int,
        user_id: Optional[int] = None,
    ) -> None:
        """
        多人标注：按用户 annotated_items 与 LabelProgress.assigned_count 对齐 saved_count。
        - user_id 为空：同步该任务所有标注员
        - user_id 非空：仅同步指定标注员
        """
        try:
            from app.core.config import settings as app_settings

            redis_client = app_settings.REDIS_CLIENT
            if not redis_client:
                return

            query = select(LabelProgress).filter(LabelProgress.task_id == task_id)
            if user_id is not None:
                query = query.filter(LabelProgress.user_id == user_id)
            progresses = await self.progress_mapper.query(query)
            if not progresses:
                return

            changed = False
            for p in progresses:
                key = f"label:task:{task_id}:user:{p.user_id}:annotated_items"
                n = int(await redis_client.scard(key))
                cap = p.assigned_count or 0
                new_val = min(max(n, 0), cap)
                if (p.saved_count or 0) != new_val:
                    p.saved_count = new_val
                    changed = True
            if changed:
                await self.progress_mapper.commit()
        except Exception as e:
            logger.warning(
                "多人标注同步 saved_count 失败: task_id=%s user_id=%s error=%s",
                task_id,
                user_id,
                e,
            )
    
    # ------------------------------ 任务管理接口实现 ------------------------------
    async def create_multi_label_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_create: MultiLabelTaskCreate,
    ) -> Dict[str, int]:
        """创建多人标注任务。整段在一个事务内执行，报错则回滚保证数据一致性。"""
        session = await self.task_mapper.get_session()
        try:
            # 验证项目存在
            await validate_project_exists(session, project_id)

            if not await self._has_multi_label_project_admin_access(
                session, current_user, project_id
            ):
                raise HTTPException(
                    status_code=403,
                    detail="无权限创建多人标注任务，仅租户管理员、平台管理员或项目管理员可操作",
                )
            
            # 验证数据集名称格式
            try:
                validate_name_format(task_create.task_name, "任务名称")
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            biz_type = task_create.biz_type.value
            if task_create.biz_type == LabelTaskBizType.MACHINE_LEARNING:
                dataset, source_dataset = await self._create_machine_learning_task_dataset(
                    task_create, project_id, session, current_user
                )
            else:
                dataset, source_dataset = await self._create_llm_task_dataset(
                    task_create, project_id, session, current_user
                )

            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
            dataset_path = self._generate_dataset_path(
                namespace,
                task_create.task_name,
                dataset.id,
                biz_type=biz_type,
            )
            dataset.dataset_path = dataset_path

            need_async_copy = task_create.source == LabelDatasetSource.EXISTED_DATASET
            source_path = None
            target_path = None
            source_file_name = ""
            target_file_name = ""
            if need_async_copy:
                if task_create.biz_type == LabelTaskBizType.MACHINE_LEARNING:
                    source_path = StoragePath.REGISTERED_MACHINE_LEARNING_DATASETS.format_storage_path(
                        namespace=namespace,
                        dataset_id=source_dataset.id,
                    ).rstrip("/")
                    target_path = os.path.dirname(dataset_path)
                else:
                    if dataset.dataset_type == LabelDatasetType.IMAGE_UNDERSTANDING:
                        source_path = os.path.dirname(source_dataset.dataset_path)
                        target_path = os.path.dirname(dataset_path)
                        source_file_name = os.path.basename(source_dataset.dataset_path)
                        target_file_name = os.path.basename(dataset_path)
                    else:
                        source_path = source_dataset.dataset_path
                        target_path = dataset_path
                if not source_path or not target_path:
                    logger.error(
                        "创建多人标注任务数据集失败，source_path=%s, target_path=%s",
                        source_path,
                        target_path,
                    )
                    raise HTTPException(status_code=500, detail="创建多人标注任务失败，数据集存在异常")
                if (
                    task_create.biz_type == LabelTaskBizType.MACHINE_LEARNING
                    and source_path
                ):
                    jfs = await self._get_juicefs_client()
                    if not jfs.exists(source_path):
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"源机器学习数据集目录在存储中不存在，无法创建多人标注任务: {source_path}。"
                                f"请确认数据集已上传成功，且项目与 JuiceFS 命名空间 {namespace} 一致。"
                            ),
                        )

            # 创建任务记录（flush 拿 id，不提交）
            task = LabelTask(
                biz_type=biz_type,
                task_type=LabelTaskType.MULTI.value,
                description=task_create.description,
                label_dataset_id=dataset.id,
                status=(
                    MultiLabelTaskStatus.CREATING.value
                    if need_async_copy
                    else MultiLabelTaskStatus.CREATED.value
                ),
                audit_sampling_ratio=task_create.audit_sampling_ratio
            )
            task.created_id = current_user.userId
            task.created_by = current_user.username
            
            await self.task_mapper.insert(task)
            await self.task_mapper.flush()
            
            await self._assign_members_to_task(
                current_user=current_user,
                task_id=task.id,
                annotators=task_create.annotators,
                auditors=task_create.auditors,
                total_samples=dataset.total_samples or 0,
                audit_sampling_ratio=task_create.audit_sampling_ratio,
                skip_commit=True
            )

            # 整段成功后再统一提交
            await self.task_mapper.commit()
            if need_async_copy:
                from app.tasks.label_tasks import copy_dataset_label_async
                copy_dataset_label_async.apply_async(
                    args=[
                        source_path,
                        target_path,
                        app_runtime_context.get_tenant_id(),
                        task.id,
                        MultiLabelTaskStatus.CREATED.value,
                        source_file_name,
                        target_file_name,
                    ]
                )
            return {"id": task.id}
        except HTTPException:
            await self.task_mapper.rollback()
            raise
        except Exception as e:
            await self.task_mapper.rollback()
            logger.error(f"创建多人标注任务失败，已回滚: project_id={project_id}, error={e}", exc_info=True)
            raise
    
    async def _assign_members_to_task(
        self,
        current_user: JwtUserInfo,
        task_id: int,
        annotators: List[AnnotatorAssignRequest],
        auditors: List[AuditorAssignRequest],
        total_samples: int,
        audit_sampling_ratio: int = 100,
        skip_commit: bool = False
    ) -> None:
        """
        内部方法：分配任务成员（标注员和审核员）
        
        这个方法在创建任务时调用，也可以被单独的分配接口调用。
        skip_commit=True 时不提交，由调用方统一提交（用于 create_multi_label_task 事务内）。
        """
        # 分配标注员
        annotator_user_ids = []
        annotator_assign_counts = []
        
        for annotator in annotators:
            annotator_user_ids.append(annotator.user_id)
            annotator_assign_counts.append(annotator.assign_count)
        
        # 验证分配数量
        if annotator_user_ids:
            total_annotator_count = sum(annotator_assign_counts)
            if total_annotator_count != total_samples:
                raise HTTPException(
                    status_code=400,
                    detail=f"标注员分配总数({total_annotator_count})必须等于总样本数({total_samples})"
                )
            
            # 创建标注员分配规则
            random_seed = random.randint(1, 1000000)
            assignment_cache = build_precise_assignment_cache(
                annotator_user_ids, annotator_assign_counts, random_seed
            )
            
            # 保存分配规则
            rule = LabelTaskAssignmentRule(
                task_id=task_id,
                role=MemberRole.ANNOTATOR.value,
                user_ids=annotator_user_ids,
                assign_counts=annotator_assign_counts,
                random_seed=random_seed,
                total_samples=total_annotator_count
            )
            rule.created_id = current_user.userId
            rule.created_by = current_user.username
            
            await self.assignment_rule_mapper.insert(rule)
            
            # 保存缓存到本地文件
            self.cache_manager.save_cache(
                task_id, MemberRole.ANNOTATOR.value, assignment_cache
            )
            
            # 创建成员记录和进度记录（每人各自 deadline）
            for annotator in annotators:
                member = LabelTaskMember(
                    task_id=task_id,
                    user_id=annotator.user_id,
                    role=MemberRole.ANNOTATOR.value,
                    assign_count=annotator.assign_count,
                    deadline=convert_to_naive_datetime(annotator.deadline) if annotator.deadline else None
                )
                member.created_id = current_user.userId
                member.created_by = current_user.username
                await self.member_mapper.insert(member)
                
                # 进度记录
                progress = LabelProgress(
                    task_id=task_id,
                    user_id=annotator.user_id,
                    assigned_count=annotator.assign_count,
                    saved_count=0,
                    final_count=0
                )
                progress.created_id = current_user.userId
                progress.created_by = current_user.username
                await self.progress_mapper.insert(progress)
        
        # 分配审核员
        logger.info(f"开始分配审核员, auditors数量: {len(auditors)}, auditors: {auditors}")
        auditor_user_ids = []
        auditor_assign_counts = []
        
        for auditor in auditors:
            auditor_user_ids.append(auditor.user_id)
            auditor_assign_counts.append(auditor.assign_count)
            
            # 成员记录（每人各自 deadline）
            member = LabelTaskMember(
                task_id=task_id,
                user_id=auditor.user_id,
                role=MemberRole.AUDITOR.value,
                assign_count=auditor.assign_count,
                deadline=convert_to_naive_datetime(auditor.deadline) if auditor.deadline else None
            )
            member.created_id = current_user.userId
            member.created_by = current_user.username
            await self.member_mapper.insert(member)
            
            # 审核进度记录
            audit_progress = LabelAuditProgress(
                task_id=task_id,
                auditor_id=auditor.user_id,
                assigned_count=auditor.assign_count,
                reviewed_passed_count=0,
                reviewed_failed_count=0
            )
            audit_progress.created_id = current_user.userId
            audit_progress.created_by = current_user.username
            await self.audit_progress_mapper.insert(audit_progress)
        
        # 创建审核员分配规则
        logger.info(f"准备创建审核员分配规则, auditor_user_ids: {auditor_user_ids}, auditor_assign_counts: {auditor_assign_counts}")
        if auditor_user_ids:
            total_auditor_count = sum(auditor_assign_counts)
            max_audit_samples = ceil((total_samples * audit_sampling_ratio) / 100) if total_samples > 0 else 0
            if total_auditor_count > max_audit_samples:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"审核员分配总数({total_auditor_count})超过抽检上限({max_audit_samples})，"
                        f"当前数据集总数={total_samples}，抽检比例={audit_sampling_ratio}%"
                    )
                )
            random_seed = random.randint(1, 1000000)
            assignment_cache = build_precise_assignment_cache(
                auditor_user_ids, auditor_assign_counts, random_seed
            )
            
            # 保存分配规则
            auditor_rule = LabelTaskAssignmentRule(
                task_id=task_id,
                role=MemberRole.AUDITOR.value,
                user_ids=auditor_user_ids,
                assign_counts=auditor_assign_counts,
                random_seed=random_seed,
                total_samples=total_auditor_count
            )
            auditor_rule.created_id = current_user.userId
            auditor_rule.created_by = current_user.username
            
            await self.assignment_rule_mapper.insert(auditor_rule)
            
            # 保存缓存到本地文件
            self.cache_manager.save_cache(
                task_id, MemberRole.AUDITOR.value, assignment_cache
            )
        
        if not skip_commit:
            await self.task_mapper.commit()

    async def _has_multi_label_project_admin_access(
        self,
        db: Any,
        current_user: JwtUserInfo,
        project_id: int,
    ) -> bool:
        """多人标注项目维度管理员：租户管理员、平台管理员或项目管理员"""
        from app.utils import app_runtime_context

        is_san_yuan = app_runtime_context.get_san_yuan_tag() or False
        is_tenant = is_tenant_admin(current_user, is_san_yuan)
        is_platform = await is_platform_admin(db, current_user.userId)
        is_project = await is_project_admin(db, project_id, current_user.userId)
        return is_tenant or is_platform or is_project

    async def has_multi_label_project_admin_access(
        self,
        db: Any,
        current_user: JwtUserInfo,
        project_id: int,
    ) -> bool:
        return await self._has_multi_label_project_admin_access(
            db, current_user, project_id
        )
    
    async def list_task_overview(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        biz_type: LabelTaskBizType,
        page: int,
        size: int,
        task_name: Optional[str] = None,
    ) -> Page[TaskOverviewResponse]:
        """任务总览（管理员视图）- 展示标注进度和审核进度，非管理员返回空列表"""
        session = await self.task_mapper.get_session()
        if not await self._has_multi_label_project_admin_access(
            session, current_user, project_id
        ):
            return Page[TaskOverviewResponse](
                items=[],
                total=0,
                page=page,
                size=size,
                pages=0,
            )
        dataset_type_expr = self._dataset_type_expr()
        total_samples_expr = self._dataset_total_samples_expr()
        source_dataset_id_expr = self._dataset_source_id_expr()
        submit_dataset_id_expr = self._dataset_submit_id_expr()
        biz_type_expr = func.coalesce(LabelTask.biz_type, LabelTaskBizType.LLM.value)
        query = self._join_multi_task_dataset(
            select(
                LabelTask.id,
                biz_type_expr.label('biz_type'),
                dataset_type_expr.label('dataset_type'),
                self._dataset_name_expr().label('task_name'),
                LabelTask.description,
                LabelTask.status,
                total_samples_expr.label('total_samples'),
                source_dataset_id_expr.label('source_dataset_id'),
                submit_dataset_id_expr.label('submit_dataset_id'),
                LabelTask.created_at,
                LabelTask.updated_at,
                LabelTask.created_id,
                LabelTask.created_by,
                LabelTask.tenant_id,
            )
        ).filter(
            self._multi_task_project_filter(project_id),
            LabelTask.task_type == LabelTaskType.MULTI.value,
            biz_type_expr == biz_type.value,
        )
        if task_name and task_name.strip():
            query = query.filter(self._dataset_name_expr().ilike(f"%{task_name.strip()}%"))
        
        query = query.order_by(LabelTask.created_at.desc())
        paged = await self.task_mapper.query_page(query, page, size, unique=False)
        rows = list(paged.items)

        task_ids = [row.id for row in rows]

        # 获取标注进度（汇总所有标注员）
        annotation_progress_dict = {}
        if task_ids:
            progress_result = await session.execute(
                select(
                    LabelProgress.task_id,
                    func.sum(LabelProgress.assigned_count).label('assigned_count'),
                    func.sum(LabelProgress.saved_count).label('saved_count')
                )
                .filter(LabelProgress.task_id.in_(task_ids))
                .group_by(LabelProgress.task_id)
            )
            for prog in progress_result.all():
                annotation_progress_dict[prog.task_id] = {
                    'assigned_count': prog.assigned_count or 0,
                    'saved_count': prog.saved_count or 0
                }
        
        # 获取审核进度（汇总所有审核员）
        audit_progress_dict = {}
        if task_ids:
            audit_result = await session.execute(
                select(
                    LabelAuditProgress.task_id,
                    func.sum(LabelAuditProgress.assigned_count).label('total_count'),
                    func.sum(LabelAuditProgress.reviewed_passed_count).label('passed_count'),
                    func.sum(LabelAuditProgress.reviewed_failed_count).label('failed_count')
                )
                .filter(LabelAuditProgress.task_id.in_(task_ids))
                .group_by(LabelAuditProgress.task_id)
            )
            for audit in audit_result.all():
                audit_progress_dict[audit.task_id] = {
                    'total_count': audit.total_count or 0,
                    'passed_count': audit.passed_count or 0,
                    'failed_count': audit.failed_count or 0
                }
        
        # 构建响应
        items = []
        for row in rows:
            annotation = annotation_progress_dict.get(row.id, {'assigned_count': 0, 'saved_count': 0})
            audit = audit_progress_dict.get(row.id, {'total_count': 0, 'passed_count': 0, 'failed_count': 0})

            # 计算进度百分比（saved_count 已按用户维度记录，溢出按 100% 显示）
            annotation_assigned = annotation['assigned_count']
            annotation_saved = annotation['saved_count']
            annotation_progress = min(100.0, round(annotation_saved / annotation_assigned * 100, 2)) if annotation_assigned > 0 else 0
            
            audit_total = audit['total_count']
            audit_passed = audit['passed_count']
            audit_failed = audit['failed_count']
            audit_completed = audit_passed + audit_failed
            # 抽检可多审不可少审，溢出按 100% 显示
            audit_progress = min(100.0, round(audit_completed / audit_total * 100, 2)) if audit_total > 0 else 0
            
            items.append(TaskOverviewResponse(
                id=row.id,
                biz_type=row.biz_type,
                dataset_type=row.dataset_type,
                task_name=row.task_name,
                description=row.description,
                status=row.status,
                total_samples=row.total_samples,
                annotation_assigned_count=annotation_assigned,
                annotation_saved_count=annotation_saved,
                annotation_progress=annotation_progress,
                audit_total_count=audit_total,
                audit_passed_count=audit_passed,
                audit_failed_count=audit_failed,
                audit_progress=audit_progress,
                created_at=row.created_at,
                updated_at=row.updated_at,
                created_id=row.created_id,
                created_by=row.created_by,
                tenant_id=row.tenant_id
            ))

        return paged.copy(update={"items": items})

    async def list_annotation_tasks(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        biz_type: LabelTaskBizType,
        page: int,
        size: int,
        task_name: Optional[str] = None,
    ) -> Page[AnnotationTaskResponse]:
        """标注任务（标注人员视图）- 只要是自己的任务一直都可以看到，不按状态过滤"""
        user_id = current_user.userId

        session = await self.task_mapper.get_session()
        biz_type_expr = func.coalesce(LabelTask.biz_type, LabelTaskBizType.LLM.value)
        query = self._join_multi_task_dataset(
            select(
                LabelTask.id,
                biz_type_expr.label('biz_type'),
                self._dataset_type_expr().label('dataset_type'),
                self._dataset_name_expr().label('task_name'),
                LabelTask.description,
                LabelTask.status,
                self._dataset_source_id_expr().label('source_dataset_id'),
                self._dataset_submit_id_expr().label('submit_dataset_id'),
                LabelTaskMember.assign_count,
                LabelTaskMember.deadline.label('deadline'),
                LabelTask.created_at,
                LabelTask.updated_at,
                LabelTask.created_id,
                LabelTask.created_by,
                LabelTask.tenant_id,
            )
        ).join(
            LabelTaskMember,
            and_(
                LabelTaskMember.task_id == LabelTask.id,
                LabelTaskMember.user_id == user_id,
                LabelTaskMember.role == MemberRole.ANNOTATOR.value,
            ),
        ).filter(
            self._multi_task_project_filter(project_id),
            LabelTask.task_type == LabelTaskType.MULTI.value,
            biz_type_expr == biz_type.value,
        )
        if task_name and task_name.strip():
            query = query.filter(self._dataset_name_expr().ilike(f"%{task_name.strip()}%"))
        
        query = query.order_by(LabelTask.created_at.desc())
        paged = await self.task_mapper.query_page(query, page, size, unique=False)
        rows = list(paged.items)

        task_ids = [row.id for row in rows]

        # 获取当前用户的标注进度
        progress_dict = {}
        if task_ids:
            progress_result = await session.execute(
                select(
                    LabelProgress.task_id,
                    LabelProgress.assigned_count,
                    LabelProgress.saved_count
                )
                .filter(LabelProgress.task_id.in_(task_ids))
                .filter(LabelProgress.user_id == user_id)
            )
            for prog in progress_result.all():
                progress_dict[prog.task_id] = {
                    'assigned_count': prog.assigned_count or 0,
                    'saved_count': prog.saved_count or 0
                }
        
        dataset_names_by_biz = await self._load_related_dataset_names(session, rows)

        # 构建响应
        items = []
        for row in rows:
            progress = progress_dict.get(row.id, {'assigned_count': 0, 'saved_count': 0})
            my_assigned = progress['assigned_count']
            my_saved = progress['saved_count']
            my_progress = min(100.0, round(my_saved / my_assigned * 100, 2)) if my_assigned > 0 else 0
            biz_type = self._normalize_task_biz_type(getattr(row, "biz_type", None))
            source_dataset_id = self._normalize_dataset_id(getattr(row, "source_dataset_id", None))
            submit_dataset_id = self._normalize_dataset_id(getattr(row, "submit_dataset_id", None))

            items.append(AnnotationTaskResponse(
                id=row.id,
                biz_type=row.biz_type,
                dataset_type=row.dataset_type,
                task_name=row.task_name,
                description=row.description,
                status=row.status,
                source_dataset_id=source_dataset_id,
                submit_dataset_id=submit_dataset_id,
                source_dataset_name=dataset_names_by_biz.get(biz_type, {}).get(source_dataset_id) if source_dataset_id else None,
                submit_dataset_name=dataset_names_by_biz.get(biz_type, {}).get(submit_dataset_id) if submit_dataset_id else None,
                my_assigned_count=my_assigned,
                my_saved_count=my_saved,
                my_progress=my_progress,
                deadline=row.deadline,
                created_at=row.created_at,
                updated_at=row.updated_at,
                created_id=row.created_id,
                created_by=row.created_by,
                tenant_id=row.tenant_id
            ))

        return paged.copy(update={"items": items})

    async def list_audit_tasks(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        biz_type: LabelTaskBizType,
        page: int,
        size: int,
        task_name: Optional[str] = None,
    ) -> Page[AuditTaskResponse]:
        """审核任务（审核人员视图）- 进入审核流程之后的所有状态都能看到（ANNOTATION_DONE/AUDITING/REWORK/REAUDITING/AUDIT_PASSED/PUBLISHED）"""
        user_id = current_user.userId

        session = await self.task_mapper.get_session()
        
        # 子查询：计算每个任务的标注进度（saved_count 总和），用于判断是否已标注完成可展示给审核员
        annotation_progress_subquery = (
            select(
                LabelProgress.task_id,
                func.sum(LabelProgress.saved_count).label('total_saved_count')
            )
            .group_by(LabelProgress.task_id)
            .subquery()
        )
        
        total_samples_expr = self._dataset_total_samples_expr()
        biz_type_expr = func.coalesce(LabelTask.biz_type, LabelTaskBizType.LLM.value)
        query = self._join_multi_task_dataset(
            select(
                LabelTask.id,
                biz_type_expr.label('biz_type'),
                self._dataset_type_expr().label('dataset_type'),
                self._dataset_name_expr().label('task_name'),
                LabelTask.description,
                LabelTask.status,
                self._dataset_source_id_expr().label('source_dataset_id'),
                self._dataset_submit_id_expr().label('submit_dataset_id'),
                LabelTaskMember.assign_count,
                LabelTaskMember.deadline.label('deadline'),
                LabelTask.created_at,
                LabelTask.updated_at,
                LabelTask.created_id,
                LabelTask.created_by,
                LabelTask.tenant_id,
            )
        ).join(
            LabelTaskMember,
            and_(
                LabelTaskMember.task_id == LabelTask.id,
                LabelTaskMember.user_id == user_id,
                LabelTaskMember.role == MemberRole.AUDITOR.value,
            ),
        ).outerjoin(
            annotation_progress_subquery,
            annotation_progress_subquery.c.task_id == LabelTask.id,
        ).filter(
            self._multi_task_project_filter(project_id),
            LabelTask.task_type == LabelTaskType.MULTI.value,
            biz_type_expr == biz_type.value,
            LabelTask.status.in_([
                MultiLabelTaskStatus.ANNOTATION_DONE.value,
                MultiLabelTaskStatus.AUDITING.value,
                MultiLabelTaskStatus.REWORK.value,
                MultiLabelTaskStatus.REAUDITING.value,
                MultiLabelTaskStatus.AUDIT_PASSED.value,
                MultiLabelTaskStatus.PUBLISHED.value,
            ]),
            or_(
                LabelTask.status.in_([
                    MultiLabelTaskStatus.AUDITING.value,
                    MultiLabelTaskStatus.REWORK.value,
                    MultiLabelTaskStatus.REAUDITING.value,
                    MultiLabelTaskStatus.AUDIT_PASSED.value,
                    MultiLabelTaskStatus.PUBLISHED.value,
                ]),
                annotation_progress_subquery.c.total_saved_count >= total_samples_expr,
                total_samples_expr == 0,
            ),
        )
        if task_name and task_name.strip():
            query = query.filter(self._dataset_name_expr().ilike(f"%{task_name.strip()}%"))
        
        query = query.order_by(LabelTask.created_at.desc())
        paged = await self.task_mapper.query_page(query, page, size, unique=False)
        rows = list(paged.items)

        task_ids = [row.id for row in rows]

        # 获取当前用户的审核进度
        audit_dict = {}
        if task_ids:
            audit_result = await session.execute(
                select(
                    LabelAuditProgress.task_id,
                    LabelAuditProgress.assigned_count,
                    LabelAuditProgress.reviewed_passed_count,
                    LabelAuditProgress.reviewed_failed_count
                )
                .filter(LabelAuditProgress.task_id.in_(task_ids))
                .filter(LabelAuditProgress.auditor_id == user_id)
            )
            for audit in audit_result.all():
                audit_dict[audit.task_id] = {
                    'total_count': audit.assigned_count or 0,
                    'passed_count': audit.reviewed_passed_count or 0,
                    'failed_count': audit.reviewed_failed_count or 0
                }
        
        dataset_names_by_biz = await self._load_related_dataset_names(session, rows)
        
        # 构建响应
        items = []
        for row in rows:
            audit = audit_dict.get(row.id, {'total_count': 0, 'passed_count': 0, 'failed_count': 0})
            my_total = audit['total_count']
            my_passed = audit['passed_count']
            my_failed = audit['failed_count']
            my_completed = my_passed + my_failed
            # 抽检可多审不可少审，溢出按 100% 显示
            my_progress = min(100.0, round(my_completed / my_total * 100, 2)) if my_total > 0 else 0
            biz_type = self._normalize_task_biz_type(getattr(row, "biz_type", None))
            source_dataset_id = self._normalize_dataset_id(getattr(row, "source_dataset_id", None))
            submit_dataset_id = self._normalize_dataset_id(getattr(row, "submit_dataset_id", None))

            items.append(AuditTaskResponse(
                id=row.id,
                biz_type=row.biz_type,
                dataset_type=row.dataset_type,
                task_name=row.task_name,
                description=row.description,
                status=row.status,
                source_dataset_name=dataset_names_by_biz.get(biz_type, {}).get(source_dataset_id) if source_dataset_id else None,
                submit_dataset_name=dataset_names_by_biz.get(biz_type, {}).get(submit_dataset_id) if submit_dataset_id else None,
                my_audit_total=my_total,
                my_audit_passed=my_passed,
                my_audit_failed=my_failed,
                my_audit_progress=my_progress,
                deadline=row.deadline,
                created_at=row.created_at,
                updated_at=row.updated_at,
                created_id=row.created_id,
                created_by=row.created_by,
                tenant_id=row.tenant_id
            ))

        return paged.copy(update={"items": items})

    async def get_multi_label_task_detail(
        self,
        project_id: int,
        task_id: int
    ) -> MultiLabelTaskDetailResponse:
        """获取多人标注任务详情"""
        session = await self.task_mapper.get_session()
        
        # 查询任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        task_biz_type = task.biz_type or LabelTaskBizType.LLM.value
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id, session=session)
        
        # 查询进度信息
        progress_result = await session.execute(
            select(
                func.sum(LabelProgress.assigned_count).label('assigned_count'),
                func.sum(LabelProgress.saved_count).label('saved_count'),
                func.sum(LabelProgress.final_count).label('final_count')
            )
            .filter(LabelProgress.task_id == task_id)
        )
        progress_row = progress_result.first()
        
        # 获取源数据集名称（格式：{usage_desc}/{name}-{version}）
        related_names = await self._load_related_dataset_names(
            session,
            [
                SimpleNamespace(
                    biz_type=task_biz_type,
                    source_dataset_id=getattr(dataset, "source_dataset_id", None),
                    submit_dataset_id=getattr(dataset, "submit_dataset_id", None),
                )
            ],
        )
        related_methods = await self._load_related_training_methods(
            session,
            [
                SimpleNamespace(
                    biz_type=task_biz_type,
                    source_dataset_id=getattr(dataset, "source_dataset_id", None),
                    submit_dataset_id=getattr(dataset, "submit_dataset_id", None),
                )
            ],
        )
        dataset_name_map = related_names.get(task_biz_type, {})
        training_method_map = related_methods.get(task_biz_type, {})
        source_dataset_name = dataset_name_map.get(dataset.source_dataset_id) if getattr(dataset, "source_dataset_id", None) else None
        submit_dataset_name = dataset_name_map.get(dataset.submit_dataset_id) if getattr(dataset, "submit_dataset_id", None) else None
        training_method_type = None
        if getattr(dataset, "source_dataset_id", None):
            raw_method = training_method_map.get(dataset.source_dataset_id)
            if raw_method:
                try:
                    training_method_type = TrainingMethodType(raw_method)
                except ValueError:
                    training_method_type = None
        if training_method_type is None and getattr(dataset, "submit_dataset_id", None):
            raw_method = training_method_map.get(dataset.submit_dataset_id)
            if raw_method:
                try:
                    training_method_type = TrainingMethodType(raw_method)
                except ValueError:
                    training_method_type = None
        dataset_info = (
            LabelMachineLearningDatasetResponse.model_validate(dataset)
            if self._is_machine_learning_biz(task_biz_type)
            else LabelDatasetResponse.model_validate(dataset)
        )
        
        # 构建进度信息
        progress_info = {
            'assigned_count': progress_row.assigned_count or 0 if progress_row else 0,
            'saved_count': progress_row.saved_count or 0 if progress_row else 0,
            'final_count': progress_row.final_count or 0 if progress_row else 0,
            'total_samples': dataset.total_samples or 0
        }
        
        # 查询成员信息
        # 查询标注员成员
        annotator_members_result = await session.execute(
            select(LabelTaskMember).filter(
                LabelTaskMember.task_id == task_id,
                LabelTaskMember.role == MemberRole.ANNOTATOR.value
            )
        )
        annotator_members = annotator_members_result.scalars().all()
        
        # 查询审核员成员
        auditor_members_result = await session.execute(
            select(LabelTaskMember).filter(
                LabelTaskMember.task_id == task_id,
                LabelTaskMember.role == MemberRole.AUDITOR.value
            )
        )
        auditor_members = auditor_members_result.scalars().all()
        
        # 查询每个成员的标注进度
        member_progress_result = await session.execute(
            select(LabelProgress).filter(LabelProgress.task_id == task_id)
        )
        member_progress_dict = {p.user_id: p for p in member_progress_result.scalars().all()}
        
        # 查询每个审核员的审核进度
        audit_progress_result = await session.execute(
            select(LabelAuditProgress).filter(LabelAuditProgress.task_id == task_id)
        )
        audit_progress_dict = {p.auditor_id: p for p in audit_progress_result.scalars().all()}
        
        # 批量查询成员姓名
        user_id_to_name: Dict[int, str] = {}
        all_member_ids = list({m.user_id for m in annotator_members} | {m.user_id for m in auditor_members})
        if all_member_ids:
            try:
                payload = await self.user_service.user_infos(
                    ids=all_member_ids,
                    username="",
                    page=1,
                    page_size=max(len(all_member_ids), 1)
                )
                for row in (payload.rows or []):
                    uid = getattr(row, 'userId', None) or getattr(row, 'user_id', None)
                    if uid is not None:
                        name = (getattr(row, 'nickname', None) or "").strip() or (getattr(row, 'username', None) or "").strip()
                        user_id_to_name[uid] = name or f"用户{uid}"
            except Exception as e:
                logger.warning("批量查询任务成员姓名失败，将使用占位展示: %s", e)
        for uid in all_member_ids:
            if uid not in user_id_to_name:
                user_id_to_name[uid] = f"用户{uid}"
        
        # 构建标注员列表（每人使用自己的 deadline）
        annotators = []
        for member in annotator_members:
            progress = member_progress_dict.get(member.user_id)
            annotators.append(AnnotatorMemberItem(
                user_id=member.user_id,
                user_name=user_id_to_name.get(member.user_id, f"用户{member.user_id}"),
                assign_count=member.assign_count,
                saved_count=progress.saved_count if progress else 0,
                final_count=progress.final_count if progress else 0,
                deadline=getattr(member, 'deadline', None)
            ))
        
        # 构建审核员列表（每人使用自己的 deadline）
        auditors = []
        for member in auditor_members:
            audit_progress = audit_progress_dict.get(member.user_id)
            auditors.append(AuditorMemberItem(
                user_id=member.user_id,
                user_name=user_id_to_name.get(member.user_id, f"用户{member.user_id}"),
                assigned_count=audit_progress.assigned_count if audit_progress else 0,
                reviewed_passed_count=audit_progress.reviewed_passed_count if audit_progress else 0,
                reviewed_failed_count=audit_progress.reviewed_failed_count if audit_progress else 0,
                deadline=getattr(member, 'deadline', None)
            ))
        
        return MultiLabelTaskDetailResponse(
            id=task.id,
            biz_type=task_biz_type,
            task_type=task.task_type,
            task_name=dataset.name,
            description=task.description,
            status=task.status,
            total_samples=dataset.total_samples,
            assigned_count=progress_info['assigned_count'],
            saved_count=progress_info['saved_count'],
            source_dataset_name=source_dataset_name,
            submit_dataset_name=submit_dataset_name,
            training_method_type=training_method_type,
            dataset=dataset_info,
            progress=progress_info,
            audit_sampling_ratio=task.audit_sampling_ratio,
            annotators=annotators,
            auditors=auditors,
            created_at=task.created_at,
            updated_at=task.updated_at,
            created_id=task.created_id,
            created_by=task.created_by,
            tenant_id=task.tenant_id
        )
    
    async def publish_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> MultiLabelTaskPublishResponse:
        """发布任务（审核完成后生成训练数据集）- 仅管理员可操作"""
        session = await self.task_mapper.get_session()
        
        # 查询任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        task_biz_type = task.biz_type or LabelTaskBizType.LLM.value
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id, session=session)
        
        # 权限检查：仅管理员可发布
        from app.utils import app_runtime_context
        is_san_yuan = app_runtime_context.get_san_yuan_tag() or False
        if not (
            is_tenant_admin(current_user, is_san_yuan)
            or await is_platform_admin(session, current_user.userId)
            or await is_project_admin(session, project_id, current_user.userId)
        ):
            raise HTTPException(status_code=403, detail="无权限发布任务，仅管理员可操作")
        
        # 验证任务状态（只有审核通过的任务才能发布）
        if task.status != MultiLabelTaskStatus.AUDIT_PASSED.value:
            raise HTTPException(status_code=400, detail="只有审核全部通过的任务才能发布")

        # 检查是否已发布
        if dataset.submit_dataset_id:
            raise HTTPException(status_code=400, detail="该任务已发布，不允许重复发布")
        
        # 与单人标注最终提交一致：LLM 生成训练数据集新版本，机器学习生成注册 ML 数据集新版本
        new_submit_dataset_id: Optional[int] = None
        if self._is_machine_learning_biz(task_biz_type):
            assert isinstance(dataset, LabelMachineLearningDataset)
            new_submit_dataset_id = (
                await self.label_service.generate_machine_learning_dataset_from_label_dataset(
                    current_user, dataset
                )
            )
        else:
            assert isinstance(dataset, LabelDataset)
            new_submit_dataset_id = (
                await self.label_service.generate_training_dataset_from_label_dataset(
                    current_user, dataset
                )
            )
        if new_submit_dataset_id is not None:
            dataset.submit_dataset_id = new_submit_dataset_id
        task.status = MultiLabelTaskStatus.PUBLISHED.value
        
        # 构建返回用的名称（可能抛错，放在提交前，失败则上面状态变更不会提交）
        submit_dataset_name = None
        if new_submit_dataset_id is not None:
            if self._is_machine_learning_biz(task_biz_type):
                session = await self.task_mapper.get_session()
                ml_row = await session.scalar(
                    select(MachineLearningDataset).filter(
                        MachineLearningDataset.id == new_submit_dataset_id
                    )
                )
                if ml_row:
                    submit_dataset_name = format_machine_learning_dataset_display_name(
                        ml_row.name,
                        ml_row.version,
                        ml_row.annotation_type,
                        task_type=ml_row.task_type,
                        data_type=ml_row.data_type,
                    )
            else:
                td = await self.training_dataset_mapper.query_one(
                    select(TrainingDataset).filter(TrainingDataset.id == new_submit_dataset_id)
                )
                if td:
                    try:
                        usage_desc = DatasetUsage(td.usage).description if td.usage else "训练"
                    except (ValueError, TypeError):
                        usage_desc = td.usage or "训练"
                    submit_dataset_name = (
                        f"{usage_desc}/{td.name}-{td.version}" if td.name and td.version else None
                    )
        
        # 全部成功后再提交，任一步失败则不会执行到这里，状态不变更
        await self.dataset_mapper.commit()
        await self.task_mapper.commit()
        
        return MultiLabelTaskPublishResponse(
            success=True,
            message="任务发布成功",
            submit_dataset_id=dataset.submit_dataset_id,
            submit_dataset_name=submit_dataset_name
        )
    
    async def delete_multi_label_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> None:
        """
        删除多人标注任务及所有关联数据
        
        仅限未发布的任务可删除；仅管理员或任务创建者可操作
        """
        session = await self.task_mapper.get_session()
        
        # 查询任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        task_biz_type = task.biz_type or LabelTaskBizType.LLM.value
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id, session=session)
        
        # 权限检查：仅管理员或任务创建者可删除
        from app.utils import app_runtime_context
        is_san_yuan = app_runtime_context.get_san_yuan_tag() or False
        is_creator = getattr(task, "created_id", None) == current_user.userId
        if not is_creator and not (
            is_tenant_admin(current_user, is_san_yuan)
            or await is_platform_admin(session, current_user.userId)
            or await is_project_admin(session, project_id, current_user.userId)
        ):
            raise HTTPException(status_code=403, detail="无权限删除该任务，仅管理员或任务创建者可操作")

        member_rows = await session.execute(
            select(LabelTaskMember.user_id).where(LabelTaskMember.task_id == task_id)
        )
        member_user_ids = {row[0] for row in member_rows.fetchall() if row and row[0] is not None}
        
        # 删除关联数据
        # 1. 删除分配规则
        await session.execute(
            LabelTaskAssignmentRule.__table__.delete().where(
                LabelTaskAssignmentRule.task_id == task_id
            )
        )
        
        # 2. 删除任务成员
        await session.execute(
            LabelTaskMember.__table__.delete().where(
                LabelTaskMember.task_id == task_id
            )
        )
        
        # 3. 删除标注进度
        await session.execute(
            LabelProgress.__table__.delete().where(
                LabelProgress.task_id == task_id
            )
        )
        
        # 4. 删除审核进度
        await session.execute(
            LabelAuditProgress.__table__.delete().where(
                LabelAuditProgress.task_id == task_id
            )
        )
        
        # 5. 删除任务
        await session.execute(
            LabelTask.__table__.delete().where(
                LabelTask.id == task_id
            )
        )
        
        # 6. 删除数据集
        dataset_model = LabelMachineLearningDataset if self._is_machine_learning_biz(task_biz_type) else LabelDataset
        await session.execute(
            dataset_model.__table__.delete().where(
                dataset_model.id == dataset.id
            )
        )
        
        # 7. 删除缓存文件
        try:
            self.cache_manager.delete_cache(task_id, MemberRole.ANNOTATOR.value)
            self.cache_manager.delete_cache(task_id, MemberRole.AUDITOR.value)
        except Exception as e:
            logger.warning(f"删除缓存文件失败: {e}")

        # 7.1 删除 Redis 暂存/状态数据
        try:
            from app.core.config import settings as app_settings
            redis_client = app_settings.REDIS_CLIENT
            if redis_client:
                redis_keys = [self._reaudit_started_redis_key(task_id), f"label:task:{task_id}:annotation_offsets"]
                for user_id in member_user_ids:
                    redis_keys.append(f"label:task:{task_id}:user:{user_id}:saved_items")
                    redis_keys.append(f"label:task:{task_id}:user:{user_id}:annotated_items")
                if redis_keys:
                    await redis_client.delete(*redis_keys)
        except Exception as e:
            logger.warning(f"删除多人标注 Redis 数据失败: {e}")

        # 8. 删除 JuiceFS 上的数据集文件
        try:
            if dataset.dataset_path:
                jfs = await self._get_juicefs_client()
                # 删除数据集目录
                dataset_dir = os.path.dirname(dataset.dataset_path)
                if jfs.exists(dataset_dir):
                    jfs.rmr(dataset_dir)
        except Exception as e:
            logger.warning(f"删除数据集文件失败: {e}")
        
        await session.commit()
        logger.info(f"删除多人标注任务成功: task_id={task_id}, dataset_id={dataset.id}")
    
    # ------------------------------ 标注功能接口实现 ------------------------------
    async def get_annotation_data(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int,
        page: Optional[int] = None,
        size: Optional[int] = None,
        is_annotated: Optional[bool] = None,
        status: Optional[str] = None
    ) -> MultiLabelDataResponse:
        """获取分配给当前用户的标注数据（分页）"""
        page = page or 1
        size = size or 20
        
        # 查询任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id)
        training_method_type, dataset_format = await self._get_llm_dataset_training_meta(task, dataset)
        base_url = await self._build_base_url_for_multi_label_dataset(project_id, dataset)
        
        # 查询分配规则
        rule = await self.assignment_rule_mapper.query_one(
            select(LabelTaskAssignmentRule).filter(
                LabelTaskAssignmentRule.task_id == task_id,
                LabelTaskAssignmentRule.role == MemberRole.ANNOTATOR.value
            )
        )
        if not rule:
            raise HTTPException(status_code=404, detail="未找到分配规则")
        
        # 获取或构建分配缓存
        assignment_cache = self.cache_manager.get_or_build_cache(
            task_id, MemberRole.ANNOTATOR.value,
            rule.user_ids, rule.assign_counts, rule.random_seed
        )
        
        # 获取分配给当前用户的所有row_number
        user_assigned_rows = get_user_assigned_rows(
            current_user.userId, rule.user_ids, rule.assign_counts, rule.random_seed, assignment_cache
        )
        
        # 按需读取，避免整份标注/审核/raw 进内存（与单人标注 OOM 优化一致）
        annotated_ids = await self._read_annotated_row_ids(dataset.dataset_path)
        jfs = await self._get_juicefs_client()
        ann_index = self._build_annotation_offset_index(jfs, dataset.dataset_path)
        audit_index = self._build_audit_offset_index(jfs, dataset.dataset_path)
        annotations_path = dataset.dataset_path.replace('.jsonl', '.annotations.jsonl')
        audits_path = self._get_audits_path(dataset.dataset_path)

        from app.core.config import settings as app_settings
        redis_client = app_settings.REDIS_CLIENT

        async def load_annotation_audit_for_rows(rows: List[int]) -> tuple:
            ann_map: Dict[int, Dict] = {}
            audit_map: Dict[int, Dict] = {}
            for rn in rows:
                if rn in ann_index:
                    ann_map[rn] = self._read_line_at_offset(jfs, annotations_path, ann_index[rn]) or {}
                else:
                    ann_map[rn] = {}
                if rn in audit_index:
                    audit_map[rn] = self._read_line_at_offset(jfs, audits_path, audit_index[rn]) or {}
                else:
                    audit_map[rn] = {}
            if redis_client:
                try:
                    for rn in rows:
                        cache_key = f"label:task:{task_id}:annotation:{rn}"
                        cached = await redis_client.get(cache_key)
                        if cached:
                            try:
                                data = json.loads(cached.decode() if isinstance(cached, bytes) else cached)
                                existing = ann_map.get(rn, {})
                                ann_map[rn] = {**(existing or {}), **data, "row_number": rn}
                            except (json.JSONDecodeError, TypeError):
                                pass
                except Exception as e:
                    logger.warning(f"读取标注 Redis 缓存失败: task_id={task_id}, error={e}")
            return ann_map, audit_map

        # 需要按状态/已标注过滤时，只对「当前用户分配行」加载 annotation/audit，再过滤分页
        if is_annotated is not None or status:
            ann_map, audit_map = await load_annotation_audit_for_rows(user_assigned_rows)
            all_data_items = []
            for row_number in user_assigned_rows:
                annotation_data = ann_map.get(row_number, {})
                audit_data = audit_map.get(row_number, {})
                item_status, is_editable = self._calculate_item_status(annotation_data, audit_data)
                # 使用状态驱动“是否已标注”：
                # pending / audit_failed 视为未完成；重标后(sav ed/resubmitted/submitted)应视为已标注
                is_ann = item_status not in {
                    AnnotationItemStatus.PENDING,
                    AnnotationItemStatus.AUDIT_FAILED,
                }
                all_data_items.append({
                    'row_number': row_number,
                    'annotation_data': annotation_data,
                    'audit_data': audit_data,
                    'status': item_status,
                    'is_editable': is_editable,
                    'is_annotated': is_ann
                })
            if is_annotated is not None:
                all_data_items = [x for x in all_data_items if x['is_annotated'] == is_annotated]
            if status:
                all_data_items = [x for x in all_data_items if x['status'].value == status]
            total = len(all_data_items)
            total_pages = ceil(total / size) if total > 0 else 0
            start_index = (page - 1) * size
            end_index = start_index + size
            paged = all_data_items[start_index:end_index]
            page_row_numbers = [x['row_number'] for x in paged]
        else:
            total = len(user_assigned_rows)
            total_pages = ceil(total / size) if total > 0 else 0
            start_index = (page - 1) * size
            end_index = start_index + size
            page_row_numbers = user_assigned_rows[start_index:end_index]
            ann_map, audit_map = await load_annotation_audit_for_rows(page_row_numbers)
            paged = []
            for row_number in page_row_numbers:
                annotation_data = ann_map.get(row_number, {})
                audit_data = audit_map.get(row_number, {})
                item_status, is_editable = self._calculate_item_status(annotation_data, audit_data)
                # 使用状态驱动“是否已标注”，避免重标后仍被判定为未标注
                is_ann = item_status not in {
                    AnnotationItemStatus.PENDING,
                    AnnotationItemStatus.AUDIT_FAILED,
                }
                paged.append({
                    'row_number': row_number,
                    'annotation_data': annotation_data,
                    'audit_data': audit_data,
                    'status': item_status,
                    'is_editable': is_editable,
                    'is_annotated': is_ann
                })

        # 只读取当前页的 raw 行，不整份读入
        raw_map = await self._read_raw_rows(dataset.dataset_path, page_row_numbers)
        # 掩码实例分割模板需要按行将存储的 RLE 格式转换为前端 polygon_with_holes 格式
        _is_mask_template = (
            self._is_machine_learning_biz(task.biz_type)
            and getattr(dataset, "template_type", None) == MachineLearningDatasetTemplateType.INSTANCE_SEGMENTATION_MASK.value
        )
        items = []
        for item in paged:
            rn = item['row_number']
            raw_data = raw_map.get(rn, {})
            annotation = item['annotation_data'].get('annotation')
            if _is_mask_template:
                try:
                    from app.utils.segmentation_codec import storage_annotations_to_frontend
                    if isinstance(raw_data, dict):
                        h = raw_data.get("height") or (raw_data.get("data") or {}).get("height")
                        w = raw_data.get("width") or (raw_data.get("data") or {}).get("width")
                    else:
                        h = w = None
                    if isinstance(h, int) and isinstance(w, int):
                        if isinstance(annotation, list) and annotation:
                            annotation = {"annotations": storage_annotations_to_frontend(annotation, h, w)}
                        # 同步转换 raw_data 中的原始标注，前端渲染时也需要 polygon_with_holes 格式
                        if isinstance(raw_data, dict):
                            raw_anns = raw_data.get("annotations")
                            if isinstance(raw_anns, list) and raw_anns:
                                raw_data = {**raw_data, "annotations": storage_annotations_to_frontend(raw_anns, h, w)}
                except Exception as e:
                    logger.warning(f"多人标注掩码格式反转换失败: row={rn}, error={e}")
            items.append(MultiLabelDataItem(
                item_id=f"item_{rn}",
                row_number=rn,
                raw_data=raw_data,
                annotation=annotation,
                is_annotated=item['is_annotated'],
                status=item['status'],
                is_editable=item['is_editable'],
                audit_result=item['audit_data'].get('audit_result'),
                audit_reason=item['audit_data'].get('reason')
            ))
        return MultiLabelDataResponse(
            items=items,
            total=total,
            page=page,
            size=size,
            total_pages=total_pages,
            training_method_type=training_method_type,
            dataset_format=dataset_format,
            task_status=task.status or MultiLabelTaskStatus.CREATED.value,
            base_url=base_url,
            ml_task_template_type=getattr(dataset, "template_type", None),
            ml_task_annotation_type=getattr(dataset, "annotation_type", None),
        )
    
    async def save_annotation(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        request: MultiLabelAnnotationSaveRequest
    ) -> MultiLabelAnnotationSaveResponse:
        """保存/暂存标注（参考单人标注流程）"""
        from app.core.config import settings
        from app.utils.annotation_redis import send_annotation_event
        
        # 获取任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == request.task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"标注任务不存在: {request.task_id}")
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id)
        
        total_samples = dataset.total_samples or 0
        
        # 验证行号范围
        if request.row_number < 1 or request.row_number > total_samples:
            raise HTTPException(
                status_code=400,
                detail=f"行号超出范围：行号 {request.row_number}，总数据量 {total_samples}（行号范围：1-{total_samples}）"
            )
        
        # 查询分配规则，验证当前用户是否被分配了该行
        rule = await self.assignment_rule_mapper.query_one(
            select(LabelTaskAssignmentRule).filter(
                LabelTaskAssignmentRule.task_id == request.task_id,
                LabelTaskAssignmentRule.role == MemberRole.ANNOTATOR.value
            )
        )
        if not rule:
            raise HTTPException(status_code=404, detail="未找到分配规则")
        
        # 获取分配缓存，验证该行是否分配给当前用户
        assignment_cache = self.cache_manager.get_or_build_cache(
            request.task_id, MemberRole.ANNOTATOR.value,
            rule.user_ids, rule.assign_counts, rule.random_seed
        )
        
        assigned_user_id = calculate_assigned_user(
            request.row_number, assignment_cache, rule.user_ids[0] if rule.user_ids else 0
        )
        if assigned_user_id != current_user.userId:
            raise HTTPException(
                status_code=403,
                detail=f"该行数据未分配给您，无权标注"
            )
        
        # 获取 Redis 客户端
        redis_client = settings.REDIS_CLIENT
        if redis_client is None:
            raise HTTPException(status_code=500, detail="Redis 客户端未初始化")
        
        normalized_annotation = await self._normalize_annotation_payload_for_dataset(
            dataset=dataset,
            row_number=request.row_number,
            annotation=request.annotation,
        )

        # 发送标注事件到 Redis Streams（异步）- 暂存时始终 is_final=false
        try:
            message_id = await send_annotation_event(
                redis_client=redis_client,
                task_id=request.task_id,
                dataset_id=dataset.id,
                row_number=request.row_number,
                annotation=normalized_annotation,
                is_final=False,
                user_id=current_user.userId,
                username=current_user.username
            )
            logger.info(f"多人标注暂存事件已发送: task_id={request.task_id}, row_number={request.row_number}, user_id={current_user.userId}, message_id={message_id}")
        except Exception as e:
            logger.error(f"发送多人标注事件失败: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"保存标注失败: {str(e)}")

        # 立即更新 Redis，保证查询实时可见（与单人标注一致，不等 consumer 处理完）
        try:
            saved_key = f"label:task:{request.task_id}:user:{current_user.userId}:saved_items"
            annotated_key = f"label:task:{request.task_id}:user:{current_user.userId}:annotated_items"
            annotation_cache_key = f"label:task:{request.task_id}:annotation:{request.row_number}"

            await redis_client.sadd(saved_key, str(request.row_number))
            await redis_client.sadd(annotated_key, str(request.row_number))
            now_iso = datetime.now().isoformat()
            await redis_client.set(
                annotation_cache_key,
                json.dumps(
                    {
                        "annotation": normalized_annotation,
                        "is_final": False,
                        # 重标暂存后立即写入更新时间，确保状态判断能识别“已重标”
                        "updated_at": now_iso,
                        "user_id": current_user.userId,
                        "user_name": current_user.username,
                    },
                    ensure_ascii=False,
                ),
                ex=86400,
            )
            # 暂存阶段同步 DB saved_count（在线标注同口径：以用户 annotated_items 回写 DB）
            await self._sync_multi_annotator_saved_counts_from_redis(
                request.task_id, current_user.userId
            )
            # 维护 class_id -> 行号 索引，供 delete_label_tag / _rollback_ml_annotations_for_deleted_class 命中「所有用过该类的样本」
            if (
                self._is_machine_learning_biz(task.biz_type)
                and task.task_type == LabelTaskType.MULTI.value
            ):
                try:
                    new_class_ids = DefaultLabelService._extract_ml_class_ids_from_annotation(
                        normalized_annotation
                    )
                    if new_class_ids:
                        class_pipe = redis_client.pipeline()
                        for cid in new_class_ids:
                            class_pipe.sadd(
                                f"label:task:{request.task_id}:class_usage:{cid}",
                                str(request.row_number),
                            )
                        await class_pipe.execute()
                except Exception as e:
                    logger.warning(
                        "多人标注 ML class_usage 更新失败: task_id=%s row=%s error=%s",
                        request.task_id,
                        request.row_number,
                        e,
                    )
            # 暂存仅触发 CREATED → ANNOTATING，不触发 ANNOTATING→ANNOTATION_DONE 等其它状态变更
            try:
                task_for_status = await self.task_mapper.query_one(
                    select(LabelTask).filter(LabelTask.id == request.task_id)
                )
                if task_for_status and task_for_status.status == MultiLabelTaskStatus.CREATED.value:
                    progress_list = await self.progress_mapper.query(
                        select(LabelProgress).filter(LabelProgress.task_id == request.task_id)
                    )
                    if progress_list and any((p.saved_count or 0) > 0 or (p.final_count or 0) > 0 for p in progress_list):
                        await self._update_task_status(request.task_id, MultiLabelTaskStatus.ANNOTATING)
            except Exception as e:
                logger.warning(f"多人标注暂存后更新任务状态 CREATED→ANNOTATING 失败: task_id={request.task_id}, error={e}")
        except Exception as e:
            logger.warning(f"多人标注 Redis 实时状态更新失败（不影响标注保存）: task_id={request.task_id}, error={str(e)}")

        return MultiLabelAnnotationSaveResponse(
            success=True,
            message="标注已暂存"
        )
    
    async def submit_all_annotations(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        request: MultiLabelSubmitAllRequest
    ) -> MultiLabelSubmitAllResponse:
        """提交全部标注（一次性提交所有已暂存的标注）"""
        from app.core.config import settings
        from app.utils.annotation_redis import send_batch_submit_event
        
        # 获取任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == request.task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail=f"标注任务不存在: {request.task_id}")
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id)
        
        # 查询分配规则
        rule = await self.assignment_rule_mapper.query_one(
            select(LabelTaskAssignmentRule).filter(
                LabelTaskAssignmentRule.task_id == request.task_id,
                LabelTaskAssignmentRule.role == MemberRole.ANNOTATOR.value
            )
        )
        if not rule:
            raise HTTPException(status_code=404, detail="未找到分配规则")
        
        # 获取分配缓存
        assignment_cache = self.cache_manager.get_or_build_cache(
            request.task_id, MemberRole.ANNOTATOR.value,
            rule.user_ids, rule.assign_counts, rule.random_seed
        )
        
        # 获取当前用户被分配的所有行
        user_assigned_rows = get_user_assigned_rows(
            current_user.userId, rule.user_ids, rule.assign_counts, rule.random_seed, assignment_cache
        )
        total_assigned = len(user_assigned_rows)
        
        # 与审核一致：已提交后不可再次提交，除非返工（返工时失败行会扣减进度，final_count < assigned_count 可再次提交）
        progress = await self.progress_mapper.query_one(
            select(LabelProgress).filter(
                LabelProgress.task_id == request.task_id,
                LabelProgress.user_id == current_user.userId
            )
        )
        if progress and total_assigned > 0 and (progress.final_count or 0) >= (progress.assigned_count or total_assigned):
            raise HTTPException(
                status_code=400,
                detail="您已提交过，不可再次提交；返工任务中需重新标注的不通过项可再次提交。"
            )
        
        # 获取 Redis 客户端
        redis_client = settings.REDIS_CLIENT
        if redis_client is None:
            raise HTTPException(status_code=500, detail="Redis 客户端未初始化")
        
        # 使用用户维度的 Redis Key 跟踪已标注行
        annotated_key = f"label:task:{request.task_id}:user:{current_user.userId}:annotated_items"
        
        try:
            # 获取已标注的行数
            annotated_count = await redis_client.scard(annotated_key)
            
            # 验证是否所有分配的行都已标注
            if annotated_count < total_assigned:
                unannotated_count = total_assigned - annotated_count
                raise HTTPException(
                    status_code=400,
                    detail=f"存在未标注的样本，不允许提交。分配给您的样本数：{total_assigned}，已标注：{annotated_count}，未标注：{unannotated_count}。请完成所有分配给您的样本标注后再提交。"
                )
            
            # 发送批量提交事件（将所有已暂存的标注标记为已提交）
            try:
                await send_batch_submit_event(
                    redis_client=redis_client,
                    task_id=request.task_id,
                    dataset_id=dataset.id,
                    user_id=current_user.userId,
                    row_numbers=user_assigned_rows
                )
                logger.info(f"多人标注批量提交事件已发送: task_id={request.task_id}, user_id={current_user.userId}, 提交样本数={total_assigned}")
            except Exception as e:
                logger.error(f"发送批量提交事件失败: {str(e)}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"提交失败: {str(e)}")

            # 立即更新 Redis：从暂存 Set 移除（已提交），并更新标注缓存 is_final=True（与单人标注一致）
            try:
                saved_key = f"label:task:{request.task_id}:user:{current_user.userId}:saved_items"
                for row in user_assigned_rows:
                    await redis_client.srem(saved_key, str(row))
                    cache_key = f"label:task:{request.task_id}:annotation:{row}"
                    cached = await redis_client.get(cache_key)
                    if cached:
                        try:
                            obj = json.loads(cached.decode() if isinstance(cached, bytes) else cached)
                            obj["is_final"] = True
                            await redis_client.set(cache_key, json.dumps(obj, ensure_ascii=False), ex=86400)
                        except (json.JSONDecodeError, TypeError):
                            await redis_client.set(
                                cache_key,
                                json.dumps({"is_final": True}, ensure_ascii=False),
                                ex=86400,
                            )
                    else:
                        await redis_client.set(
                            cache_key,
                            json.dumps({"is_final": True}, ensure_ascii=False),
                            ex=86400,
                        )
            except Exception as e:
                logger.warning(f"多人标注提交后 Redis 状态更新失败（不影响提交结果）: task_id={request.task_id}, error={str(e)}")

            # 更新当前用户的 final_count = 分配数，以便 _check_and_update_annotation_status 能判断是否全部标注员已提交
            progress = await self.progress_mapper.query_one(
                select(LabelProgress).filter(
                    LabelProgress.task_id == request.task_id,
                    LabelProgress.user_id == current_user.userId
                )
            )
            if progress:
                assigned = progress.assigned_count or total_assigned
                progress.final_count = assigned
                # 提交时同步更新 saved_count，与 final_count 一致，保证「已标注完成」判断（含返工提交后）正确
                progress.saved_count = assigned
                await self.progress_mapper.commit()
            # 提交后再做一次 Redis→DB 对齐，避免首页列表口径滞后
            await self._sync_multi_annotator_saved_counts_from_redis(
                request.task_id, current_user.userId
            )

            # 更新用户的进度状态为已完成（若模型有 status/completed_at 等字段）
            await self._update_user_annotation_progress(
                task_id=request.task_id,
                user_id=current_user.userId,
                is_completed=True
            )

            # 检查并更新任务状态：若所有标注员都 final_count >= assigned_count，则 ANNOTATING → ANNOTATION_DONE
            await self._check_and_update_annotation_status(request.task_id)
            
            logger.info(f"多人标注提交成功: task_id={request.task_id}, user_id={current_user.userId}, 提交样本数={total_assigned}")
            
            return MultiLabelSubmitAllResponse(
                success=True,
                message="全部标注已提交",
                submitted_count=total_assigned,
                total_assigned=total_assigned
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"提交全部标注失败: {str(e)}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"提交失败: {str(e)}")
    
    async def get_completion_status(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> MultiLabelCompletionStatusResponse:
        """查询当前用户的标注完成状态"""
        from app.core.config import settings
        
        # 获取任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id)
        training_method_type, dataset_format = await self._get_llm_dataset_training_meta(task, dataset)
        
        # 查询分配规则，获取当前用户被分配的样本数
        rule = await self.assignment_rule_mapper.query_one(
            select(LabelTaskAssignmentRule).filter(
                LabelTaskAssignmentRule.task_id == task_id,
                LabelTaskAssignmentRule.role == MemberRole.ANNOTATOR.value
            )
        )
        
        total_assigned = 0
        if rule and current_user.userId in rule.user_ids:
            user_index = rule.user_ids.index(current_user.userId)
            total_assigned = rule.assign_counts[user_index] if user_index < len(rule.assign_counts) else 0
        
        # completion-status 口径与在线标注对齐：saved_count=max(redis_count, db_saved_count)
        redis_client = settings.REDIS_CLIENT
        db_saved_count = 0
        annotator_progress = await self.progress_mapper.query_one(
            select(LabelProgress).filter(
                LabelProgress.task_id == task_id,
                LabelProgress.user_id == current_user.userId
            )
        )
        if annotator_progress:
            db_saved_count = int(annotator_progress.saved_count or 0)
        saved_count = db_saved_count
        if redis_client:
            annotated_key = f"label:task:{task_id}:user:{current_user.userId}:annotated_items"
            try:
                redis_saved_count = int(await redis_client.scard(annotated_key))
                saved_count = max(redis_saved_count, db_saved_count)
            except Exception as e:
                logger.warning(f"获取 Redis 已标注数量失败，降级使用 DB: {str(e)}")
        
        # 判断是否完成（当前已标注数 >= 分配数）
        is_completed = saved_count >= total_assigned if total_assigned > 0 else False
        # 与审核一致：本人已提交则不可再提交（final_count >= assigned_count）；返工时失败行会扣减进度，此时 is_submitted=False 可再次提交
        is_submitted = (
            annotator_progress is not None
            and total_assigned > 0
            and (annotator_progress.final_count or 0) >= (annotator_progress.assigned_count or total_assigned)
        )
        
        return MultiLabelCompletionStatusResponse(
            task_id=task_id,
            is_completed=is_completed,
            is_submitted=is_submitted,
            saved_count=saved_count,
            total_samples=total_assigned,
            training_method_type=training_method_type,
            dataset_format=dataset_format,
        )
    
    # ------------------------------ 审核功能接口实现 ------------------------------
    async def get_audit_completion_status(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> MultiLabelAuditCompletionStatusResponse:
        """查询当前审核员的完成状态（用于判断是否可以提交）"""
        # 获取任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id)
        
        # 查询当前审核员的进度
        progress = await self.audit_progress_mapper.query_one(
            select(LabelAuditProgress).filter(
                LabelAuditProgress.task_id == task_id,
                LabelAuditProgress.auditor_id == current_user.userId
            )
        )
        
        # 不允许审核员修改/提交：① 任务整体终态（审核通过/已发布/返工中）② 或该审核员本轮已提交（多人审核时一人提交后即禁止该人再操作）
        audit_no_edit_statuses = {
            MultiLabelTaskStatus.AUDIT_PASSED.value,
            MultiLabelTaskStatus.PUBLISHED.value,
            MultiLabelTaskStatus.REWORK.value,
        }
        is_submitted = (
            task.status in audit_no_edit_statuses
            or (progress and (getattr(progress, "submitted_count", 0) or 0) > 0)
        )
        
        if not progress:
            # 当前用户未被分配为审核员或尚无进度记录
            return MultiLabelAuditCompletionStatusResponse(
                task_id=task_id,
                total_assigned=0,
                audited_count=0,
                is_completed=True,
                is_submitted=is_submitted,
                passed_count=0,
                failed_count=0,
                progress_percent=0.0
            )
        
        total_assigned = progress.assigned_count or 0
        passed_count = progress.reviewed_passed_count or 0
        failed_count = progress.reviewed_failed_count or 0
        audited_count = passed_count + failed_count
        # 抽检可多审不可少审，≥分配数即完成，进度溢出按 100%
        is_completed = 0 < total_assigned <= audited_count
        progress_percent = min(100.0, round(audited_count / total_assigned * 100, 2)) if total_assigned > 0 else 0.0
        
        return MultiLabelAuditCompletionStatusResponse(
            task_id=task_id,
            total_assigned=total_assigned,
            audited_count=audited_count,
            is_completed=is_completed,
            is_submitted=is_submitted,
            passed_count=passed_count,
            failed_count=failed_count,
            progress_percent=progress_percent
        )
    
    async def get_audit_data(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int,
        page: Optional[int] = None,
        size: Optional[int] = None,
        audit_status: Optional[AuditStatusFilter] = None,
        is_reaudit: Optional[bool] = None,
    ) -> MultiLabelAuditDataResponse:
        """获取分配给当前审核员的待审核数据（分页）"""
        page = page or 1
        size = size or 10
        
        # 获取任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id)
        base_url = await self._build_base_url_for_multi_label_dataset(project_id, dataset)
        training_method_type, dataset_format = await self._get_llm_dataset_training_meta(task, dataset)
        
        # 查询审核员分配规则
        rule = await self.assignment_rule_mapper.query_one(
            select(LabelTaskAssignmentRule).filter(
                LabelTaskAssignmentRule.task_id == task_id,
                LabelTaskAssignmentRule.role == MemberRole.AUDITOR.value
            )
        )
        if not rule:
            # 没有审核分配规则，返回空数据
            return MultiLabelAuditDataResponse(
                items=[],
                total=0,
                page=page,
                size=size,
                total_pages=0,
                training_method_type=training_method_type,
                dataset_format=dataset_format,
                task_status=task.status or MultiLabelTaskStatus.CREATED.value,
                is_reaudit_round=False,
                base_url=base_url,
                ml_task_template_type=getattr(dataset, "template_type", None),
                ml_task_annotation_type=getattr(dataset, "annotation_type", None),
            )
        
        # 获取分配缓存
        assignment_cache = self.cache_manager.get_or_build_cache(
            task_id, MemberRole.AUDITOR.value,
            rule.user_ids, rule.assign_counts, rule.random_seed
        )
        
        # 获取分配给当前用户的所有行号
        user_assigned_rows = get_user_assigned_rows(
            current_user.userId, rule.user_ids, rule.assign_counts, rule.random_seed, assignment_cache
        )
        
        # 按需读取审核（offset 索引 + 按行取），不整份进内存
        jfs = await self._get_juicefs_client()
        audit_index = self._build_audit_offset_index(jfs, dataset.dataset_path)
        audits_path = self._get_audits_path(dataset.dataset_path)
        audit_map: Dict[int, Dict] = {}
        for rn in user_assigned_rows:
            if rn in audit_index:
                audit_map[rn] = self._read_line_at_offset(jfs, audits_path, audit_index[rn]) or {}
            else:
                audit_map[rn] = {}

        # 重审轮次由状态机直接给出，避免在接口层用时间戳推断
        is_reaudit_round = task.status == MultiLabelTaskStatus.REAUDITING.value
        reaudit_rows: Set[int] = set()
        if is_reaudit_round:
            reaudit_rows = {
                r for r in user_assigned_rows
                if audit_map.get(r, {}).get('audit_result') == AuditResult.FAILED.value
            }

        # 根据 is_reaudit 参数筛选
        if is_reaudit is not None:
            if is_reaudit:
                user_assigned_rows = [r for r in user_assigned_rows if r in reaudit_rows]
            else:
                user_assigned_rows = [r for r in user_assigned_rows if r not in reaudit_rows]

        # 统一审核状态筛选：未审核、审核通过、审核不通过
        if audit_status is not None:
            if audit_status == AuditStatusFilter.UNAUDITED:
                user_assigned_rows = [
                    r for r in user_assigned_rows
                    if audit_map.get(r, {}).get('audit_result') is None
                ]
            else:
                user_assigned_rows = [
                    r for r in user_assigned_rows
                    if audit_map.get(r, {}).get('audit_result') == audit_status.value
                ]
        
        total = len(user_assigned_rows)
        total_pages = ceil(total / size) if total > 0 else 0
        start_index = (page - 1) * size
        end_index = start_index + size
        page_rows = user_assigned_rows[start_index:end_index]
        
        # 只读取当前页的 raw 和 annotation，不整份读入
        raw_map = await self._read_raw_rows(dataset.dataset_path, page_rows)
        ann_index = self._build_annotation_offset_index(jfs, dataset.dataset_path)
        annotations_path = dataset.dataset_path.replace('.jsonl', '.annotations.jsonl')
        # 掩码实例分割模板需要将存储的 RLE 格式转换为前端 polygon_with_holes 格式
        _is_mask_template = (
            self._is_machine_learning_biz(task.biz_type)
            and getattr(dataset, "template_type", None) == MachineLearningDatasetTemplateType.INSTANCE_SEGMENTATION_MASK.value
        )
        items = []
        for row_number in page_rows:
            raw_data = raw_map.get(row_number, {})
            annotation_data = {}
            if row_number in ann_index:
                annotation_data = self._read_line_at_offset(jfs, annotations_path, ann_index[row_number]) or {}
            audit_data = audit_map.get(row_number, {})
            annotation = annotation_data.get('annotation', {})
            if _is_mask_template:
                try:
                    from app.utils.segmentation_codec import storage_annotations_to_frontend
                    if isinstance(raw_data, dict):
                        h = raw_data.get("height") or (raw_data.get("data") or {}).get("height")
                        w = raw_data.get("width") or (raw_data.get("data") or {}).get("width")
                    else:
                        h = w = None
                    if isinstance(h, int) and isinstance(w, int):
                        if isinstance(annotation, list) and annotation:
                            annotation = {"annotations": storage_annotations_to_frontend(annotation, h, w)}
                        # 同步转换 raw_data 中的原始标注，前端渲染时也需要 polygon_with_holes 格式
                        if isinstance(raw_data, dict):
                            raw_anns = raw_data.get("annotations")
                            if isinstance(raw_anns, list) and raw_anns:
                                raw_data = {**raw_data, "annotations": storage_annotations_to_frontend(raw_anns, h, w)}
                except Exception as e:
                    logger.warning(f"审核掩码标注格式转换失败: row={row_number}, error={e}")
            items.append(MultiLabelAuditDataItem(
                item_id=f"item_{row_number}",
                row_number=row_number,
                raw_data=raw_data,
                annotation=annotation,
                audit_result=audit_data.get('audit_result'),
                audit_reason=audit_data.get('reason'),
                is_reaudit=row_number in reaudit_rows
            ))
        return MultiLabelAuditDataResponse(
            items=items,
            total=total,
            page=page,
            size=size,
            total_pages=total_pages,
            training_method_type=training_method_type,
            dataset_format=dataset_format,
            task_status=task.status or MultiLabelTaskStatus.CREATED.value,
            is_reaudit_round=is_reaudit_round,
            base_url=base_url,
            ml_task_template_type=getattr(dataset, "template_type", None),
            ml_task_annotation_type=getattr(dataset, "annotation_type", None),
        )
    
    # ------------------------------ 管理员视图接口实现 ------------------------------
    async def get_admin_overview_data(
        self,
        db,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int,
        page: Optional[int] = None,
        size: Optional[int] = None,
        is_annotated: Optional[bool] = None,
        audit_status: Optional[AuditStatusFilter] = None
    ) -> AdminDataResponse:
        """
        管理员数据总览 - 展示所有数据的标注进度和审核结果
        仅限管理员访问
        """
        page = page or 1
        size = size or 20
        
        # 权限检查：仅允许管理员访问（与 list_task_overview 一致，需传入 db）
        if not await self._has_multi_label_project_admin_access(
            db, current_user, project_id
        ):
            raise HTTPException(status_code=403, detail="无权限访问，仅管理员可查看")
        
        # 获取任务和数据集
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id)
        training_method_type, dataset_format = await self._get_llm_dataset_training_meta(task, dataset)

        base_url = await self._build_base_url_for_multi_label_dataset(project_id, dataset)

        total_samples = dataset.total_samples or 0
        if total_samples <= 0:
            return AdminDataResponse(
                items=[],
                total=0,
                page=page,
                size=size,
                total_pages=0,
                training_method_type=training_method_type,
                dataset_format=dataset_format,
                base_url=base_url,
                ml_task_template_type=getattr(dataset, "template_type", None),
                ml_task_annotation_type=getattr(dataset, "annotation_type", None),
            )
        
        # 按需：只收集行号级标注/审核结果用于筛选，不整份读入
        annotated_ids = await self._read_annotated_row_ids(dataset.dataset_path)
        audit_result_map = await self._read_audit_result_map(dataset.dataset_path)
        filtered_rows = []
        for row_number in range(1, total_samples + 1):
            is_item_annotated = row_number in annotated_ids
            item_audit_result = audit_result_map.get(row_number)
            is_item_audited = item_audit_result is not None
            if is_annotated is not None and is_item_annotated != is_annotated:
                continue
            if audit_status is not None:
                if audit_status == AuditStatusFilter.UNAUDITED:
                    if is_item_audited:
                        continue
                elif item_audit_result != audit_status.value:
                    continue
            filtered_rows.append(row_number)
        
        total = len(filtered_rows)
        total_pages = (total + size - 1) // size if total > 0 else 0
        start = (page - 1) * size
        end = start + size
        page_rows = filtered_rows[start:end]
        
        # 只读取当前页的 raw、标注、审核
        raw_map = await self._read_raw_rows(dataset.dataset_path, page_rows)
        jfs = await self._get_juicefs_client()
        ann_index = self._build_annotation_offset_index(jfs, dataset.dataset_path)
        audit_index = self._build_audit_offset_index(jfs, dataset.dataset_path)
        annotations_path = dataset.dataset_path.replace('.jsonl', '.annotations.jsonl')
        audits_path = self._get_audits_path(dataset.dataset_path)
        # 掩码实例分割模板需要将存储的 RLE 格式转换为前端 polygon_with_holes 格式
        _is_mask_template = (
            self._is_machine_learning_biz(task.biz_type)
            and getattr(dataset, "template_type", None) == MachineLearningDatasetTemplateType.INSTANCE_SEGMENTATION_MASK.value
        )
        paged_items = []
        for row_number in page_rows:
            raw_data = raw_map.get(row_number, {})
            annotation_info = self._read_line_at_offset(jfs, annotations_path, ann_index[row_number]) if row_number in ann_index else None
            audit_info = self._read_line_at_offset(jfs, audits_path, audit_index[row_number]) if row_number in audit_index else None
            is_item_annotated = row_number in annotated_ids or annotation_info is not None
            is_item_audited = audit_info is not None and audit_info.get('audit_result') is not None
            item_audit_result = audit_info.get('audit_result') if audit_info else None
            annotation = annotation_info.get('annotation') if annotation_info else None
            if _is_mask_template:
                try:
                    from app.utils.segmentation_codec import storage_annotations_to_frontend
                    if isinstance(raw_data, dict):
                        h = raw_data.get("height") or (raw_data.get("data") or {}).get("height")
                        w = raw_data.get("width") or (raw_data.get("data") or {}).get("width")
                    else:
                        h = w = None
                    if isinstance(h, int) and isinstance(w, int):
                        if isinstance(annotation, list) and annotation:
                            annotation = {"annotations": storage_annotations_to_frontend(annotation, h, w)}
                        # 同步转换 raw_data 中的原始标注，前端渲染时也需要 polygon_with_holes 格式
                        if isinstance(raw_data, dict):
                            raw_anns = raw_data.get("annotations")
                            if isinstance(raw_anns, list) and raw_anns:
                                raw_data = {**raw_data, "annotations": storage_annotations_to_frontend(raw_anns, h, w)}
                except Exception as e:
                    logger.warning(f"管理员总览掩码标注格式转换失败: row={row_number}, error={e}")
            paged_items.append(AdminDataItem(
                item_id=f"{task_id}_{row_number}",
                row_number=row_number,
                raw_data=raw_data,
                is_annotated=is_item_annotated,
                annotator_id=annotation_info.get('user_id') if annotation_info else None,
                annotator_name=annotation_info.get('user_name') if annotation_info else None,
                annotation=annotation,
                is_audited=is_item_audited,
                auditor_id=audit_info.get('auditor_id') if audit_info else None,
                auditor_name=audit_info.get('auditor_name') if audit_info else None,
                audit_result=item_audit_result,
                audit_reason=audit_info.get('reason') if audit_info else None
            ))
        return AdminDataResponse(
            items=paged_items,
            total=total,
            page=page,
            size=size,
            total_pages=total_pages,
            training_method_type=training_method_type,
            dataset_format=dataset_format,
            base_url=base_url,
            ml_task_template_type=getattr(dataset, "template_type", None),
            ml_task_annotation_type=getattr(dataset, "annotation_type", None),
        )
    
    async def submit_audit_result(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> MultiLabelAuditSubmitResponse:
        """提交审核（完成）：校验当前审核员已全部审完分配数（可多审不可少审），通过即可提交"""
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        allowed_audit_statuses = {
            MultiLabelTaskStatus.ANNOTATION_DONE.value,
            MultiLabelTaskStatus.AUDITING.value,
            MultiLabelTaskStatus.REAUDITING.value,
        }
        if task.status not in allowed_audit_statuses:
            raise HTTPException(
                status_code=400,
                detail="当前任务状态不允许提交审核"
            )
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id)
        progress = await self.audit_progress_mapper.query_one(
            select(LabelAuditProgress).filter(
                LabelAuditProgress.task_id == task_id,
                LabelAuditProgress.auditor_id == current_user.userId
            )
        )
        if not progress:
            raise HTTPException(status_code=403, detail="您不是该任务的审核员或尚无审核进度")
        total_assigned = progress.assigned_count or 0
        audited_count = (progress.reviewed_passed_count or 0) + (progress.reviewed_failed_count or 0)
        # 可多审不可少审，至少审满分配数才能提交
        if total_assigned > 0 and audited_count < total_assigned:
            raise HTTPException(
                status_code=400,
                detail=f"至少需审核 {total_assigned} 条方可提交，当前已审核 {audited_count} 条"
            )
        # 多人审核：该审核员本轮已提交过则禁止再次提交（参考 LabelProgress.final_count，用 submitted_count 表示已提交）
        if (getattr(progress, "submitted_count", 0) or 0) > 0:
            raise HTTPException(status_code=400, detail="您本轮已提交过审核，无法再次提交")
        # 记录本审核员已提交（submitted_count = assigned_count 表示已提交本分配批次），并检查任务状态
        progress.submitted_count = progress.assigned_count or total_assigned
        await self.audit_progress_mapper.update_by_id(progress.id, progress)
        await self._check_and_update_audit_status(task_id)
        return MultiLabelAuditSubmitResponse(
            success=True,
            message="审核已提交"
        )

    async def save_audit_result(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        request: MultiLabelAuditSubmitRequest
    ) -> MultiLabelAuditSubmitResponse:
        """暂存审核结果（通过/不通过），不更新审核进度与任务状态"""
        # 获取任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == request.task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        allowed_audit_statuses = {
            MultiLabelTaskStatus.ANNOTATION_DONE.value,
            MultiLabelTaskStatus.AUDITING.value,
            MultiLabelTaskStatus.REAUDITING.value,
        }
        if task.status not in allowed_audit_statuses:
            raise HTTPException(
                status_code=400,
                detail="当前任务状态不允许暂存审核"
            )
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id)
        
        # 验证行号
        if request.row_number < 1 or request.row_number > (dataset.total_samples or 0):
            raise HTTPException(status_code=400, detail="行号超出范围")
        
        # 查询审核员分配规则，验证当前用户是否被分配了该行
        rule = await self.assignment_rule_mapper.query_one(
            select(LabelTaskAssignmentRule).filter(
                LabelTaskAssignmentRule.task_id == request.task_id,
                LabelTaskAssignmentRule.role == MemberRole.AUDITOR.value
            )
        )
        if not rule:
            raise HTTPException(status_code=404, detail="未找到审核分配规则")
        
        # 获取分配缓存，验证该行是否分配给当前用户
        assignment_cache = self.cache_manager.get_or_build_cache(
            request.task_id, MemberRole.AUDITOR.value,
            rule.user_ids, rule.assign_counts, rule.random_seed
        )
        assigned_user_id = calculate_assigned_user(
            request.row_number, assignment_cache, rule.user_ids[0] if rule.user_ids else 0
        )
        if assigned_user_id != current_user.userId:
            raise HTTPException(status_code=403, detail="该行数据未分配给您审核，无权暂存审核结果")
        
        # 只判断该行是否已有审核记录，不整份读入审核文件
        audited_ids = await self._read_audited_row_ids(dataset.dataset_path)
        is_first_audit_for_row = request.row_number not in audited_ids
        
        # 写入审核暂存到同一文件，is_final=False，读取时同 row 最后一次写入生效
        jfs = await self._get_juicefs_client()
        audits_path = self._get_audits_path(dataset.dataset_path)
        
        audit_record = {
            'row_number': request.row_number,
            'audit_result': request.audit_result.value,
            'reason': request.reason,
            'auditor_id': current_user.userId,
            'auditor_name': current_user.username,
            'audit_time': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
            'is_final': False,
        }
        
        # 返工重审时需在写入前读取该行上一次审核结果，用于更新进度计数
        prev_audit_for_row = None
        if not is_first_audit_for_row:
            prev_audit_for_row = await self._read_audit_for_row(dataset.dataset_path, request.row_number)
        
        remote_dir = os.path.dirname(audits_path)
        if remote_dir and not jfs.exists(remote_dir):
            jfs.makedirs(remote_dir, exist_ok=True)
        
        line = json.dumps(audit_record, ensure_ascii=False) + '\n'
        with jfs.open(audits_path, 'a', encoding='utf-8') as f:
            f.write(line)
        
        # 更新审核进度：首次审核该行则递增；返工重审（该行已有记录）则按「上一次结果减一、本次结果加一」维护 passed/failed 计数
        audit_progress = await self.audit_progress_mapper.query_one(
            select(LabelAuditProgress).filter(
                LabelAuditProgress.task_id == request.task_id,
                LabelAuditProgress.auditor_id == current_user.userId
            )
        )
        if audit_progress:
            if is_first_audit_for_row:
                if request.audit_result == AuditResult.PASSED:
                    audit_progress.reviewed_passed_count += 1
                else:
                    audit_progress.reviewed_failed_count += 1
            else:
                # 返工重审：把上一次结果从计数中减掉，再把本次结果加上
                if prev_audit_for_row:
                    prev_result = prev_audit_for_row.get('audit_result')
                    skip_prev_failed_dec = await self._should_skip_prev_failed_count_decrement_for_reaudit(
                        request.task_id, task.status, prev_audit_for_row
                    )
                    if prev_result in (AuditResult.PASSED.value, 'passed', AuditResult.PASSED):
                        audit_progress.reviewed_passed_count = max(0, (audit_progress.reviewed_passed_count or 0) - 1)
                    else:
                        if not skip_prev_failed_dec:
                            audit_progress.reviewed_failed_count = max(0, (audit_progress.reviewed_failed_count or 0) - 1)
                if request.audit_result == AuditResult.PASSED:
                    audit_progress.reviewed_passed_count += 1
                else:
                    audit_progress.reviewed_failed_count += 1
            await self.audit_progress_mapper.commit()
        
        return MultiLabelAuditSubmitResponse(
            success=True,
            message="审核已暂存"
        )

    async def _migrate_redis_sets_multi_label_user(
        self,
        task_id: int,
        from_user_id: int,
        to_user_id: int,
        raise_on_error: bool = False,
    ) -> None:
        """将多人标注按用户维度的 Redis Set 从原用户迁移到新用户（合并后删除旧 key）。"""
        from app.core.config import settings

        redis_client = settings.REDIS_CLIENT
        if not redis_client:
            return
        for suffix in ("saved_items", "annotated_items"):
            old_key = f"label:task:{task_id}:user:{from_user_id}:{suffix}"
            new_key = f"label:task:{task_id}:user:{to_user_id}:{suffix}"
            try:
                if not await redis_client.exists(old_key):
                    continue
                members = await redis_client.smembers(old_key)
                if members:
                    vals = [
                        m.decode() if isinstance(m, bytes) else str(m)
                        for m in members
                    ]
                    if vals:
                        await redis_client.sadd(new_key, *vals)
                await redis_client.delete(old_key)
            except Exception as e:
                logger.warning(
                    "Redis 成员替换迁移失败 task_id=%s %s->%s: %s",
                    task_id,
                    old_key,
                    new_key,
                    e,
                )
                if raise_on_error:
                    raise

    async def _snapshot_multi_label_user_redis_sets(
        self,
        task_id: int,
        from_user_id: int,
        to_user_id: int,
    ) -> Dict[str, List[str]]:
        """抓取成员替换前的 Redis Set 快照，便于失败时恢复。"""
        from app.core.config import settings

        redis_client = settings.REDIS_CLIENT
        if not redis_client:
            return {}

        snapshot: Dict[str, List[str]] = {}
        for user_id in (from_user_id, to_user_id):
            for suffix in ("saved_items", "annotated_items"):
                key = f"label:task:{task_id}:user:{user_id}:{suffix}"
                members = await redis_client.smembers(key)
                snapshot[key] = [
                    m.decode() if isinstance(m, bytes) else str(m)
                    for m in members
                ]
        return snapshot

    async def _restore_multi_label_user_redis_sets(
        self,
        snapshot: Dict[str, List[str]],
    ) -> None:
        """按快照恢复成员替换前的 Redis Set 状态。"""
        if not snapshot:
            return

        from app.core.config import settings

        redis_client = settings.REDIS_CLIENT
        if not redis_client:
            return

        for key, members in snapshot.items():
            await redis_client.delete(key)
            if members:
                await redis_client.sadd(key, *members)

    def _restore_assignment_cache_snapshot(
        self,
        task_id: int,
        role: str,
        cache_snapshot: Optional[Dict[int, int]],
    ) -> None:
        """按快照恢复本地分配缓存。"""
        if cache_snapshot is None:
            if not self.cache_manager.delete_cache(task_id, role):
                raise RuntimeError(f"删除缓存文件失败: task_id={task_id}, role={role}")
            return

        if not self.cache_manager.save_cache(task_id, role, cache_snapshot):
            raise RuntimeError(f"恢复缓存文件失败: task_id={task_id}, role={role}")

    def _jfs_read_text_if_exists(self, jfs: Any, path: str) -> Optional[str]:
        """读取 JFS 文本文件，不存在时返回 None。"""
        if not path or not jfs.exists(path):
            return None

        with jfs.open(path, "r", encoding="utf-8") as rf:
            return rf.read()

    def _jfs_write_text_atomic(self, jfs: Any, path: str, content: str) -> None:
        """通过临时文件 + rename 原子写入文本文件。"""
        tmp = path + ".member_replace.tmp"
        with jfs.open(tmp, "w", encoding="utf-8") as wf:
            wf.write(content)
        if jfs.exists(path):
            jfs.remove(path)
        jfs.rename(tmp, path)

    def _restore_jfs_text_snapshot(
        self,
        jfs: Any,
        path: str,
        content: Optional[str],
    ) -> None:
        """按快照恢复 JFS 文件内容。"""
        if content is None:
            if path and jfs.exists(path):
                jfs.remove(path)
            return

        self._jfs_write_text_atomic(jfs, path, content)

    def _jfs_rewrite_jsonl_with_mutator(
        self,
        jfs: Any,
        path: str,
        mutator: Callable[[Dict[str, Any]], Dict[str, Any]],
    ) -> None:
        """整文件重写 JSONL：对每行 JSON 调用 mutator（可原地改 dict）。"""
        if not path or not jfs.exists(path):
            return
        lines_out: List[str] = []
        with jfs.open(path, "r", encoding="utf-8") as rf:
            for line in rf:
                if not line.strip():
                    lines_out.append(line)
                    continue
                raw = line.rstrip("\n\r")
                try:
                    obj = json.loads(raw)
                except json.JSONDecodeError:
                    lines_out.append(line if line.endswith("\n") else line + "\n")
                    continue
                mutator(obj)
                lines_out.append(json.dumps(obj, ensure_ascii=False) + "\n")
        self._jfs_write_text_atomic(jfs, path, "".join(lines_out))

    async def replace_task_member(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int,
        request: MultiLabelMemberReplaceRequest,
    ) -> MultiLabelMemberReplaceResponse:
        """替换多人标注任务成员并同步库表、分配规则、缓存、Redis 与落盘审核/标注元数据。仅管理员。"""
        if request.from_user_id == request.to_user_id:
            raise HTTPException(status_code=400, detail="原用户与新用户不能相同")

        session = await self.task_mapper.get_session()
        if not await self._has_multi_label_project_admin_access(
            session, current_user, project_id
        ):
            raise HTTPException(
                status_code=403,
                detail="无权限操作，仅多人标注管理员可替换成员",
            )

        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        if task.task_type != LabelTaskType.MULTI.value:
            raise HTTPException(status_code=400, detail="仅多人标注任务支持成员替换")
        dataset = await self._get_task_dataset_in_project_or_404(task, project_id, session=session)

        role_val = (
            request.role.value
            if isinstance(request.role, MemberRole)
            else str(request.role)
        )

        dup_r = await session.execute(
            select(LabelTaskMember).filter(
                LabelTaskMember.task_id == task_id,
                LabelTaskMember.role == role_val,
                LabelTaskMember.user_id == request.to_user_id,
            )
        )
        if dup_r.scalars().first():
            raise HTTPException(
                status_code=400,
                detail="新用户已是该任务在该角色下的成员",
            )

        from_r = await session.execute(
            select(LabelTaskMember).filter(
                LabelTaskMember.task_id == task_id,
                LabelTaskMember.role == role_val,
                LabelTaskMember.user_id == request.from_user_id,
            )
        )
        from_member = from_r.scalars().first()
        if not from_member:
            raise HTTPException(status_code=404, detail="未找到要替换的原成员")

        try:
            to_item = await self.user_service.user_id(request.to_user_id)
            to_display_name = (
                to_item.nickname or to_item.username or str(request.to_user_id)
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"新用户不存在或无法查询用户信息: {e}",
            ) from e

        from_uid, to_uid = request.from_user_id, request.to_user_id
        cache_snapshot: Optional[Dict[int, int]] = None
        cache_snapshot_captured = False
        redis_snapshot: Optional[Dict[str, List[str]]] = None
        file_snapshot: Optional[Tuple[str, Optional[str]]] = None

        try:
            # 1) 成员
            from_member.user_id = to_uid

            # 2) 进度行
            if role_val == MemberRole.ANNOTATOR.value:
                pr_r = await session.execute(
                    select(LabelProgress).filter(
                        LabelProgress.task_id == task_id,
                        LabelProgress.user_id == from_uid,
                    )
                )
                prog = pr_r.scalars().first()
                if prog:
                    prog.user_id = to_uid
                    prog.created_id = to_uid
                    prog.created_by = to_display_name
            else:
                ar_r = await session.execute(
                    select(LabelAuditProgress).filter(
                        LabelAuditProgress.task_id == task_id,
                        LabelAuditProgress.auditor_id == from_uid,
                    )
                )
                aprog = ar_r.scalars().first()
                if aprog:
                    aprog.auditor_id = to_uid
                    aprog.created_id = to_uid
                    aprog.created_by = to_display_name

            # 3) 分配规则 JSON（必须与成员表一致）
            rule = await self.assignment_rule_mapper.query_one(
                select(LabelTaskAssignmentRule).filter(
                    LabelTaskAssignmentRule.task_id == task_id,
                    LabelTaskAssignmentRule.role == role_val,
                )
            )
            if not rule or not rule.user_ids:
                raise HTTPException(
                    status_code=409,
                    detail="未找到该角色对应的分配规则，无法替换成员",
                )
            if from_uid not in rule.user_ids:
                raise HTTPException(
                    status_code=409,
                    detail="任务成员与分配规则不一致，无法自动替换，请联系运维处理",
                )
            rule.user_ids = [to_uid if u == from_uid else u for u in rule.user_ids]
            flag_modified(rule, "user_ids")

            # 先 flush，把数据库约束错误提前暴露出来，避免外部状态先变更
            await session.flush()

            # 4) 本地分配缓存（与规则一致）
            cache_snapshot = self.cache_manager.load_cache(task_id, role_val)
            cache_snapshot_captured = True
            if rule.user_ids and rule.assign_counts:
                cache = build_precise_assignment_cache(
                    list(rule.user_ids),
                    list(rule.assign_counts),
                    int(rule.random_seed),
                )
                if not self.cache_manager.save_cache(task_id, role_val, cache):
                    raise RuntimeError(
                        f"成员替换后重建分配缓存失败: task_id={task_id}, role={role_val}"
                    )

            # 5) Redis（仅标注员有按用户 Set）
            if role_val == MemberRole.ANNOTATOR.value:
                redis_snapshot = await self._snapshot_multi_label_user_redis_sets(
                    task_id, from_uid, to_uid
                )
                await self._migrate_redis_sets_multi_label_user(
                    task_id, from_uid, to_uid, raise_on_error=True
                )

            # 6) 落盘：审核记录中的 auditor；标注记录中的 user_id/user_name（若有）
            jfs = await self._get_juicefs_client()
            fu, tu, tn = from_uid, to_uid, to_display_name

            def _audit_mut(obj: Dict[str, Any]) -> Dict[str, Any]:
                aid = obj.get("auditor_id")
                try:
                    if aid is None or int(aid) != fu:
                        return obj
                except (TypeError, ValueError):
                    return obj
                obj["auditor_id"] = tu
                obj["auditor_name"] = tn
                return obj

            def _ann_mut(obj: Dict[str, Any]) -> Dict[str, Any]:
                uid = obj.get("user_id")
                try:
                    if uid is None or int(uid) != fu:
                        return obj
                except (TypeError, ValueError):
                    return obj
                obj["user_id"] = tu
                obj["user_name"] = tn
                return obj

            target_path = None
            mutator = None
            if role_val == MemberRole.AUDITOR.value:
                target_path = self._get_audits_path(dataset.dataset_path)
                mutator = _audit_mut
            elif role_val == MemberRole.ANNOTATOR.value:
                target_path = dataset.dataset_path.replace(".jsonl", ".annotations.jsonl")
                mutator = _ann_mut

            if target_path and mutator:
                file_snapshot = (
                    target_path,
                    self._jfs_read_text_if_exists(jfs, target_path),
                )
                self._jfs_rewrite_jsonl_with_mutator(jfs, target_path, mutator)

            await session.commit()
        except Exception as e:
            rollback_error = None
            try:
                await session.rollback()
            except Exception as rb_e:
                rollback_error = rb_e
                logger.error(
                    "成员替换回滚数据库失败 task_id=%s role=%s %s->%s: %s",
                    task_id,
                    role_val,
                    from_uid,
                    to_uid,
                    rb_e,
                    exc_info=True,
                )

            restore_errors: List[str] = []

            if file_snapshot is not None:
                try:
                    restore_jfs = await self._get_juicefs_client()
                    self._restore_jfs_text_snapshot(
                        restore_jfs, file_snapshot[0], file_snapshot[1]
                    )
                except Exception as restore_e:
                    restore_errors.append(f"文件恢复失败: {restore_e}")
                    logger.error(
                        "成员替换恢复落盘文件失败 task_id=%s role=%s %s->%s: %s",
                        task_id,
                        role_val,
                        from_uid,
                        to_uid,
                        restore_e,
                        exc_info=True,
                    )

            if redis_snapshot is not None:
                try:
                    await self._restore_multi_label_user_redis_sets(redis_snapshot)
                except Exception as restore_e:
                    restore_errors.append(f"Redis 恢复失败: {restore_e}")
                    logger.error(
                        "成员替换恢复 Redis 失败 task_id=%s role=%s %s->%s: %s",
                        task_id,
                        role_val,
                        from_uid,
                        to_uid,
                        restore_e,
                        exc_info=True,
                    )

            if cache_snapshot_captured:
                try:
                    self._restore_assignment_cache_snapshot(
                        task_id, role_val, cache_snapshot
                    )
                except Exception as restore_e:
                    restore_errors.append(f"缓存恢复失败: {restore_e}")
                    logger.error(
                        "成员替换恢复本地缓存失败 task_id=%s role=%s %s->%s: %s",
                        task_id,
                        role_val,
                        from_uid,
                        to_uid,
                        restore_e,
                        exc_info=True,
                    )

            if isinstance(e, HTTPException):
                if rollback_error or restore_errors:
                    raise HTTPException(
                        status_code=500,
                        detail="成员替换失败，数据库已回滚，但外部状态回滚可能不完整，请联系运维处理",
                    ) from e
                raise

            logger.error(
                "成员替换失败 task_id=%s role=%s %s->%s: %s",
                task_id,
                role_val,
                from_uid,
                to_uid,
                e,
                exc_info=True,
            )
            detail = (
                "成员替换失败，数据库已回滚，但外部状态回滚可能不完整，请联系运维处理"
                if rollback_error or restore_errors
                else "成员替换失败，数据库和外部状态均已回滚，请稍后重试"
            )
            raise HTTPException(status_code=500, detail=detail) from e

        logger.info(
            "多人标注成员替换成功 task_id=%s role=%s %s->%s",
            task_id,
            role_val,
            from_uid,
            to_uid,
        )
        return MultiLabelMemberReplaceResponse(
            success=True,
            message="成员已替换，相关分配、进度与文件中的用户信息已同步",
        )

    # ------------------------------ 成员管理接口实现 ------------------------------
    async def get_task_members(
        self,
        project_id: int,
        task_id: int
    ) -> MultiLabelTaskMembersResponse:
        """获取任务成员列表"""
        session = await self.task_mapper.get_session()
        
        # 获取任务
        task = await self.task_mapper.query_one(
            select(LabelTask).filter(LabelTask.id == task_id)
        )
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        await self._get_task_dataset_in_project_or_404(task, project_id, session=session)
        
        # 查询标注员成员
        annotator_members_result = await session.execute(
            select(LabelTaskMember).filter(
                LabelTaskMember.task_id == task_id,
                LabelTaskMember.role == MemberRole.ANNOTATOR.value
            )
        )
        annotator_members = annotator_members_result.scalars().all()
        
        # 查询审核员成员
        auditor_members_result = await session.execute(
            select(LabelTaskMember).filter(
                LabelTaskMember.task_id == task_id,
                LabelTaskMember.role == MemberRole.AUDITOR.value
            )
        )
        auditor_members = auditor_members_result.scalars().all()
        
        # 查询标注进度
        progress_result = await session.execute(
            select(LabelProgress).filter(LabelProgress.task_id == task_id)
        )
        progress_dict = {p.user_id: p for p in progress_result.scalars().all()}
        
        # 查询审核进度
        audit_progress_result = await session.execute(
            select(LabelAuditProgress).filter(LabelAuditProgress.task_id == task_id)
        )
        audit_progress_dict = {p.auditor_id: p for p in audit_progress_result.scalars().all()}
        
        # 构建标注员列表
        annotators = []
        for member in annotator_members:
            progress = progress_dict.get(member.user_id)
            annotators.append(AnnotatorMemberItem(
                user_id=member.user_id,
                user_name=f"用户{member.user_id}",  # 实际应查询用户表
                assign_count=member.assign_count,
                saved_count=progress.saved_count if progress else 0,
                final_count=progress.final_count if progress else 0,
                deadline=getattr(member, 'deadline', None)
            ))
        
        # 构建审核员列表
        auditors = []
        for member in auditor_members:
            audit_progress = audit_progress_dict.get(member.user_id)
            auditors.append(AuditorMemberItem(
                user_id=member.user_id,
                user_name=f"用户{member.user_id}",  # 实际应查询用户表
                assigned_count=audit_progress.assigned_count if audit_progress else 0,
                reviewed_passed_count=audit_progress.reviewed_passed_count if audit_progress else 0,
                reviewed_failed_count=audit_progress.reviewed_failed_count if audit_progress else 0,
                deadline=getattr(member, 'deadline', None)
            ))
        
        return MultiLabelTaskMembersResponse(
            annotators=annotators,
            auditors=auditors
        )
