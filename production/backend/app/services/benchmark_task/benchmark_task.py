import os
from datetime import datetime
from typing import List, Optional, Dict, Any

import re
from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse
from fastapi_pagination import Page
from sqlalchemy import select, func, cast, Float, or_, and_

from app.common.status import TaskStatus
from app.common.task_execution import (
    TaskExecutionBusinessType,
    TaskExecutionExecutor,
    TaskExecutionMethod,
    TaskExecutionStatus,
)
from app.core.logging import logger
from app.models.benchmark_task_manager import (
    BenchmarkTask,
    BenchmarkTaskModelRelation,
    BenchmarkTaskDatasetRelation,
    BenchmarkDataset,
    BenchmarkResult,
    BenchmarkLeaderboard
)
from app.models.models import JwtUserInfo
from app.models.models import TaskExecution
from app.schemas.benchmark_task import BenchmarkModelType, OfflineModelSource
from app.schemas.benchmark_task import (
    BenchmarkTaskCreate,
    BenchmarkTaskUpdate,
    BenchmarkTaskSummaryResponse,
    BenchmarkTaskDetailResponse,
    BenchmarkDatasetResponse,
    BenchmarkLeaderboardItemResponse,
    BenchmarkRadarChartModelData,
    BenchmarkRadarChartDataItem,
    BenchmarkTaskCompareRequest,
    BenchmarkTaskCompareResponse,
    BenchmarkModelReportData,
    BenchmarkReportModelData,
    BenchmarkTaskLogResponse,
    BenchmarkTaskReportResponse,
    BenchmarkTaskModelRelationResponse,
    BenchmarkTaskDatasetRelationResponse,
    BenchmarkResultResponse,
)
from app.utils import app_runtime_context
from app.utils.name_validator import validate_name_format
from app.utils.storage_enum import StoragePath
from .interface import BenchmarkTaskService
from ...common.constants import GLOBAL_TENANT_ID


def _match_prediction_file(files: list, dataset_code: str) -> Optional[str]:
    """从预测目录文件列表中找到与 dataset_code 匹配的文件名。

    匹配策略（优先级从高到低）：
    1. 精确匹配：openai_{dataset_code}.json 或 {dataset_code}.json
    2. 大小写不敏感精确匹配
    3. 大小写不敏感前缀匹配：文件名（去掉 openai_ 前缀和 .json 后缀）以 dataset_code 开头
       如 GPQA_diamond 匹配 gpqa，math 匹配 math
    """
    code_lower = dataset_code.lower()

    # 候选名（不含扩展名）→ 原始文件名
    candidates: dict[str, str] = {}
    for f in files:
        if not f.endswith(".json"):
            continue
        stem = f[:-5]  # 去掉 .json
        if stem.startswith("openai_"):
            stem = stem[7:]  # 去掉 openai_ 前缀
        candidates[stem.lower()] = f

    # 1 & 2: 精确匹配（含大小写不敏感）
    for key in (code_lower, f"openai_{code_lower}"):
        if key in candidates:
            return candidates[key]

    # 3: 前缀匹配，如 gpqa_diamond → gpqa
    for stem_lower, orig_file in candidates.items():
        if stem_lower == code_lower or stem_lower.startswith(code_lower + "_"):
            return orig_file

    return None


class DefaultBenchmarkTaskService(BenchmarkTaskService):
    """基准评估任务服务实现类"""

    async def run_create_benchmark_task_post_process(self, task_id: int) -> None:
        """执行器后处理：提交基准评估任务到 Celery"""
        task = await self.task_mapper.query_one(select(BenchmarkTask).where(BenchmarkTask.id == task_id))
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"基准评估任务不存在: {task_id}"
            )
        await self._submit_task_to_celery(task, task.project_id, task_id)

    async def _get_model_info(
        self,
        model_type: str,
        model_id: int,
        offline_model_source: str = OfflineModelSource.TRAINED.value,
    ) -> tuple[str, Optional[str]]:
        """根据模型类型从不同表获取模型信息
        
        Args:
            model_type: 模型类型，BenchmarkModelType.MODEL.value 或 BenchmarkModelType.SERVICE.value
            model_id: 模型/服务ID
            offline_model_source: 离线模型来源，OfflineModelSource.TRAINED.value 或 BASE.value，仅 model_type=model 时有效
            
        Returns:
            tuple: (model_name, model_version)，在线服务/基础模型的 model_version 为 None
            
        Raises:
            HTTPException: 如果模型或服务不存在
        """
        if model_type == BenchmarkModelType.MODEL.value:
            if offline_model_source == OfflineModelSource.BASE.value:
                # 从 base_models 表查询基础模型
                base_model = await self.model_service.get_base_model_by_id(model_id)
                if not base_model:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"基础模型不存在: {model_id}"
                    )
                return base_model.name, None  # 基础模型无版本号
            # 从 trained_models 表查询训练模型
            trained_model = await self.model_service.get_by_id(model_id)
            if not trained_model:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"训练模型不存在: {model_id}"
                )
            return trained_model.name, trained_model.model_version
        else:
            # 从 inference_service 表查询；使用 model_name 与 OpenCompass summary CSV 表头一致，便于结果解析入库
            inference_service = await self.inference_service_service.get_by_id(model_id)
            if not inference_service:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"推理服务不存在: {model_id}"
                )
            return inference_service.model_name, None  # 在线服务没有版本号

    async def validate_task(self, task_id: int, project_id: int) -> BenchmarkTask:
        """验证基准评估任务是否存在且属于指定项目"""
        session = await self.task_mapper.get_session()
        query = select(BenchmarkTask).where(
            BenchmarkTask.id == task_id,
            BenchmarkTask.project_id == project_id
        )
        query = await self.task_mapper.append_tenant_id(query)
        result = await session.execute(query)
        task = result.scalar_one_or_none()
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"基准评估任务不存在或不属于该项目"
            )
        return task

    async def list_datasets(
        self,
        category: Optional[str] = None,
        model_type: Optional[str] = None,
        tenant_id: Optional[str] = None
    ) -> List[BenchmarkDatasetResponse]:
        """获取基准评估数据集列表（按分类、模型类型组织）；支持全局 + 当前租户数据集"""
        session = await self.dataset_mapper.get_session()
        if tenant_id:
            query = select(BenchmarkDataset).where(
                or_(
                    BenchmarkDataset.tenant_id == GLOBAL_TENANT_ID,
                    BenchmarkDataset.tenant_id == tenant_id,
                )
            )
        else:
            query = select(BenchmarkDataset).where(BenchmarkDataset.tenant_id == GLOBAL_TENANT_ID)
        if category:
            query = query.where(BenchmarkDataset.category == category)
        if model_type:
            # model_types 为空表示兼容全部类型；否则需包含当前 model_type
            query = query.where(
                or_(
                    BenchmarkDataset.model_types.is_(None),
                    BenchmarkDataset.model_types.contains([model_type])
                )
            )
        query = query.order_by(BenchmarkDataset.sort_order, BenchmarkDataset.id)
        result = await session.execute(query)
        datasets = result.scalars().all()
        return [BenchmarkDatasetResponse.model_validate(d) for d in datasets]

    async def create_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task: BenchmarkTaskCreate
    ) -> BenchmarkTaskDetailResponse:
        """创建基准评估任务"""
        # 验证项目是否存在
        project_exists = await self.project_service.is_existed(project_id)
        if not project_exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="项目不存在"
            )

        # 验证任务名称格式
        try:
            validate_name_format(task.name, "任务名称")
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        # 检查名称是否重复（租户 + 项目空间id + name 唯一）
        tenant_id = app_runtime_context.get_tenant_id()
        if tenant_id:
            name_check_query = select(BenchmarkTask).filter(
                BenchmarkTask.name == task.name,
                BenchmarkTask.project_id == project_id,
                BenchmarkTask.tenant_id == tenant_id
            )
            existing_task_with_same_name = await self.task_mapper.query_one(name_check_query)
            if existing_task_with_same_name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"已存在同名基准评估任务：{task.name}（同一租户和项目空间下名称必须唯一）"
                )

        # 仅使用 schedule_at：有值则按定时执行，无值则手动启动
        schedule_at = task.schedule_at
        db_task = BenchmarkTask(
            name=task.name,
            description=task.description,
            project_id=project_id,
            model_type=task.model_type.value,
            model_provider=task.model_provider if task.model_type == BenchmarkModelType.SERVICE else None,
            inference_params=task.inference_params,
            schedule_at=schedule_at,
            schedule_enabled=schedule_at is not None,
            graphics_card_resource=task.graphics_card_resource,
            status=TaskStatus.SCHEDULED_PENDING.value if schedule_at else TaskStatus.CREATED.value,
            progress=0,
            created_id=current_user.userId,
            created_by=current_user.username
        )
        try:
            await self.task_mapper.insert(db_task)
            await self.task_mapper.flush()

            # 创建模型关联（离线模型支持基础模型/训练模型两种来源）
            model_name, model_version = await self._get_model_info(
                task.model_type.value,
                task.model_id,
                task.offline_model_source.value,
            )

            model_relation = BenchmarkTaskModelRelation(
                benchmark_task_id=db_task.id,
                model_id=task.model_id,
                model_name=model_name,
                model_version=model_version,
                model_type=task.model_type.value,
                sort_order=0,
                created_id=current_user.userId,
                created_by=current_user.username
            )
            await self.model_relation_mapper.insert(model_relation)

            # 创建数据集关联（仅存 dataset_code，与 OpenCompass / BenchmarkResult 一致）
            seen_codes: set = set()
            for dataset_id in task.dataset_ids:
                session = await self.dataset_mapper.get_session()
                dataset_query = select(BenchmarkDataset).where(
                    or_(
                        BenchmarkDataset.tenant_id == GLOBAL_TENANT_ID,
                        BenchmarkDataset.tenant_id == current_user.tenantId,
                    ),
                    BenchmarkDataset.id == dataset_id,
                )
                dataset_result = await session.execute(dataset_query)
                dataset = dataset_result.scalar_one_or_none()
                if not dataset:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"数据集不存在: {dataset_id}"
                    )
                if dataset.code in seen_codes:
                    continue
                seen_codes.add(dataset.code)
                invoke_name = getattr(dataset, "invoke_name", None) or (dataset.code + "_gen")
                dataset_relation = BenchmarkTaskDatasetRelation(
                    benchmark_task_id=db_task.id,
                    dataset_code=dataset.code,
                    invoke_name=invoke_name,
                    export_var=getattr(dataset, "export_var", None),
                    created_id=current_user.userId,
                    created_by=current_user.username
                )
                await self.dataset_relation_mapper.insert(dataset_relation)

            # 创建执行器任务（schedule_at 有值按定时执行，否则等待手动启动）
            execution = TaskExecution(
                business_type=TaskExecutionBusinessType.BENCHMARK_TASK.value,
                business_id=db_task.id,
                schedule_at=schedule_at,
                status=TaskExecutionStatus.PENDING.value,
                executor=TaskExecutionExecutor.BENCHMARK_TASK.value,
                method=TaskExecutionMethod.START.value,
                kwargs={"project_id": project_id}
            )
            await self.task_mapper.insert(execution)

            await self.task_mapper.commit()
        except Exception:
            await self.task_mapper.rollback()
            raise

        return await self.get_task(project_id, db_task.id)

    async def list_tasks(
        self,
        project_id: int,
        name: Optional[str] = None,
        status: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
    ) -> Page[BenchmarkTaskSummaryResponse]:
        """获取项目下的基准评估任务列表（分页）"""
        session = await self.task_mapper.get_session()
        query = select(BenchmarkTask).where(BenchmarkTask.project_id == project_id)

        if name:
            query = query.where(BenchmarkTask.name.ilike(f"%{name}%"))
        if status:
            query = query.where(BenchmarkTask.status == status)

        query = query.order_by(BenchmarkTask.created_at.desc())
        query = await self.task_mapper.append_tenant_id(query)

        paginated_result = await self.task_mapper.query_page(query, page, size)
        task_ids = [t.id for t in paginated_result.items]
        tenant_ids = list({t.tenant_id for t in paginated_result.items})

        # 批量加载评估模型、评估数据集关联及数据集名称
        models_by_task: Dict[int, List[BenchmarkTaskModelRelationResponse]] = {tid: [] for tid in task_ids}
        datasets_by_task: Dict[int, List[BenchmarkTaskDatasetRelationResponse]] = {tid: [] for tid in task_ids}
        if task_ids:
            model_rel_query = select(BenchmarkTaskModelRelation).where(
                BenchmarkTaskModelRelation.benchmark_task_id.in_(task_ids)
            ).order_by(BenchmarkTaskModelRelation.benchmark_task_id, BenchmarkTaskModelRelation.sort_order)
            model_rel_query = await self.model_relation_mapper.append_tenant_id(model_rel_query)
            model_rels = (await session.execute(model_rel_query)).scalars().all()
            for m in model_rels:
                models_by_task.setdefault(m.benchmark_task_id, []).append(
                    BenchmarkTaskModelRelationResponse.model_validate(m)
                )

            dataset_rel_query = select(BenchmarkTaskDatasetRelation).where(
                BenchmarkTaskDatasetRelation.benchmark_task_id.in_(task_ids)
            )
            dataset_rel_query = await self.dataset_relation_mapper.append_tenant_id(dataset_rel_query)
            dataset_rels = (await session.execute(dataset_rel_query)).scalars().all()
            codes = list({r.dataset_code for r in dataset_rels})
            code_to_dataset: Dict[tuple, Any] = {}
            if codes:
                ds_query = select(BenchmarkDataset).where(
                    BenchmarkDataset.code.in_(codes),
                    or_(
                        BenchmarkDataset.tenant_id == GLOBAL_TENANT_ID,
                        BenchmarkDataset.tenant_id.in_(tenant_ids),
                    ),
                )
                for ds in (await session.execute(ds_query)).scalars().all():
                    code_to_dataset[(ds.tenant_id, ds.code)] = ds
            task_tenant_by_id = {t.id: t.tenant_id for t in paginated_result.items}
            for r in dataset_rels:
                tid = r.benchmark_task_id
                tenant_id = task_tenant_by_id.get(tid)
                ds = code_to_dataset.get((tenant_id, r.dataset_code)) or code_to_dataset.get((GLOBAL_TENANT_ID, r.dataset_code))
                datasets_by_task[tid].append(
                    BenchmarkTaskDatasetRelationResponse(
                        id=r.id,
                        dataset_id=ds.id if ds else 0,
                        dataset_name=ds.name if ds else r.dataset_code,
                        dataset_code=r.dataset_code,
                    )
                )

        items = []
        for task in paginated_result.items:
            row = BenchmarkTaskSummaryResponse.model_validate(task)
            row.models = models_by_task.get(task.id) or []
            row.datasets = datasets_by_task.get(task.id) or []
            if row.status == TaskStatus.RUNNING.value:
                row.finished_at = datetime.now() if row.finished_at is None else row.finished_at
            elif row.status not in [
                TaskStatus.COMPLETED.value,
                TaskStatus.FAILED.value,
                TaskStatus.TERMINATED.value,
            ]:
                row.started_at = None
                row.finished_at = None
            items.append(row)

        return Page(
            items=items,
            total=paginated_result.total,
            page=paginated_result.page,
            size=paginated_result.size,
            pages=paginated_result.pages
        )

    async def get_task(
        self,
        project_id: int,
        task_id: int
    ) -> BenchmarkTaskDetailResponse:
        """获取指定基准评估任务详情"""
        task = await self.validate_task(task_id, project_id)

        # 获取模型关联
        session = await self.model_relation_mapper.get_session()
        model_query = select(BenchmarkTaskModelRelation).where(
            BenchmarkTaskModelRelation.benchmark_task_id == task_id
        ).order_by(BenchmarkTaskModelRelation.sort_order)
        model_query = await self.model_relation_mapper.append_tenant_id(model_query)
        model_result = await session.execute(model_query)
        models = [
            BenchmarkTaskModelRelationResponse.model_validate(m)
            for m in model_result.scalars().all()
        ]

        # 获取数据集关联（仅存 dataset_code），按 code 查 BenchmarkDataset 得到 id/name 用于响应
        dataset_query = select(BenchmarkTaskDatasetRelation).where(
            BenchmarkTaskDatasetRelation.benchmark_task_id == task_id
        )
        dataset_query = await self.dataset_relation_mapper.append_tenant_id(dataset_query)
        dataset_result = await session.execute(dataset_query)
        relation_list = dataset_result.scalars().all()
        codes = list({r.dataset_code for r in relation_list})
        code_to_dataset = {}
        if codes:
            ds_query = select(BenchmarkDataset).where(
                BenchmarkDataset.code.in_(codes),
                or_(
                    BenchmarkDataset.tenant_id == GLOBAL_TENANT_ID,
                    BenchmarkDataset.tenant_id == task.tenant_id,
                ),
            )
            ds_result = await session.execute(ds_query)
            for ds in ds_result.scalars().all():
                # 同 code 时优先使用当前任务租户的数据集（覆盖全局）
                if ds.code not in code_to_dataset or ds.tenant_id == task.tenant_id:
                    code_to_dataset[ds.code] = ds
        datasets = [
            BenchmarkTaskDatasetRelationResponse(
                id=r.id,
                dataset_id=code_to_dataset[r.dataset_code].id if r.dataset_code in code_to_dataset else 0,
                dataset_name=code_to_dataset[r.dataset_code].name if r.dataset_code in code_to_dataset else r.dataset_code,
                dataset_code=r.dataset_code,
            )
            for r in relation_list
        ]

        response = BenchmarkTaskDetailResponse.model_validate(task)
        response.models = models
        response.datasets = datasets
        
        # 调度时间直接读取任务字段
        response.schedule_at = task.schedule_at
        
        return response

    async def get_benchmark_task_dataset_totals(
        self, task_id: int, tenant_id: Optional[str] = None
    ) -> Dict[str, int]:
        """获取任务关联的各数据集的 original_sample_count（用于从 predictions JSON 计算进度）。"""
        if tenant_id is None:
            task = await self.task_mapper.query_one(
                select(BenchmarkTask).where(BenchmarkTask.id == task_id)
            )
            tenant_id = task.tenant_id if task else None
        session = await self.dataset_relation_mapper.get_session()
        rel_query = select(BenchmarkTaskDatasetRelation).where(
            BenchmarkTaskDatasetRelation.benchmark_task_id == task_id
        )
        rel_query = await self.dataset_relation_mapper.append_tenant_id(rel_query)
        rels = (await session.execute(rel_query)).scalars().all()
        codes = list({r.dataset_code for r in rels})
        if not codes:
            return {}
        ds_query = select(BenchmarkDataset).where(
            BenchmarkDataset.code.in_(codes),
            or_(
                BenchmarkDataset.tenant_id == GLOBAL_TENANT_ID,
                BenchmarkDataset.tenant_id == tenant_id,
            ),
        )
        datasets = (await session.execute(ds_query)).scalars().all()
        return {
            ds.code: (ds.original_sample_count or 0)
            for ds in datasets
        }

    async def update_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int,
        task: BenchmarkTaskUpdate
    ) -> BenchmarkTaskDetailResponse:
        """编辑任务配置        """
        db_task = await self.validate_task(task_id, project_id)
        original_model_type = db_task.model_type

        # 只能更新状态为created、failed、paused或terminated的任务
        allowed_statuses = [
            TaskStatus.CREATED.value,
            TaskStatus.SCHEDULED_PENDING.value,
            TaskStatus.FAILED.value,
            TaskStatus.TERMINATED.value
        ]
        if db_task.status not in allowed_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"当前状态为 {db_task.status}，不允许编辑"
            )

        # 如果更新了任务名称，验证名称格式并检查是否重复
        if task.name is not None:
            # 验证任务名称格式
            try:
                validate_name_format(task.name, "任务名称")
            except ValueError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
            
            # 如果名称有变化，检查名称是否重复（租户 + 项目空间id + name 唯一）
            if task.name != db_task.name:
                tenant_id = app_runtime_context.get_tenant_id()
                if tenant_id:
                    name_check_query = select(BenchmarkTask).filter(
                        BenchmarkTask.name == task.name,
                        BenchmarkTask.project_id == project_id,
                        BenchmarkTask.tenant_id == tenant_id
                    )
                    # 排除当前任务本身
                    name_check_query = name_check_query.filter(BenchmarkTask.id != task_id)
                    
                    existing_task_with_same_name = await self.task_mapper.query_one(name_check_query)
                    if existing_task_with_same_name:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"已存在同名基准评估任务：{task.name}（同一租户和项目空间下名称必须唯一）"
                        )

        # 更新任务基本信息
        if task.name is not None:
            db_task.name = task.name
        if task.description is not None:
            db_task.description = task.description
        # 处理定时任务配置：仅接受 schedule_at
        db_task.schedule_at = task.schedule_at
        if task.graphics_card_resource is not None:
            db_task.graphics_card_resource = task.graphics_card_resource
        # 切换 model / service 时必须同时落库 model_type，并置空仅适用于另一类型的任务字段
        if task.model_type is not None:
            db_task.model_type = task.model_type.value
            if task.model_type == BenchmarkModelType.MODEL:
                db_task.model_provider = None  # 仅 service 有效，切到 model 置空
            elif task.model_type == BenchmarkModelType.SERVICE:
                db_task.graphics_card_resource = None  # 仅离线模型有效，切到 service 置空
                if task.model_provider:
                    db_task.model_provider = task.model_provider
        elif task.model_provider is not None:
            db_task.model_provider = task.model_provider
        if task.inference_params is not None:
            db_task.inference_params = task.inference_params

        #重置启动完成时间与进度
        db_task.started_at = None
        db_task.finished_at = None
        db_task.progress = 0
        db_task.celery_task_id = None

        try:
            # 切换 model/service 且未带 model_id 时无法重建关联（两类 ID 不共用），必须同时提交 model_id
            if task.model_type is not None and task.model_id is None:
                if task.model_type.value != original_model_type:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="切换模型类型时请同时提交待评估模型/服务 model_id（在线服务与离线模型 ID 不共用）",
                    )
            # 切换类型时先删除原类型的关联数据，再按新类型写入（若提交了 model_id）
            is_type_switch = (
                task.model_type is not None and task.model_type.value != original_model_type
            )
            if is_type_switch or task.model_id is not None:
                session = await self.model_relation_mapper.get_session()
                delete_query = select(BenchmarkTaskModelRelation).where(
                    BenchmarkTaskModelRelation.benchmark_task_id == task_id
                )
                delete_query = await self.model_relation_mapper.append_tenant_id(delete_query)
                delete_result = await session.execute(delete_query)
                old_relations = delete_result.scalars().all()
                for old_rel in old_relations:
                    await self.model_relation_mapper.delete(old_rel)
                await self.task_mapper.flush()
            # 仅当提交了 model_id 时写入新关联
            if task.model_id is not None:
                offline_source = (
                    task.offline_model_source.value
                    if task.offline_model_source is not None
                    else OfflineModelSource.TRAINED.value
                )
                model_name, model_version = await self._get_model_info(
                    task.model_type, task.model_id, offline_source
                )
                model_relation = BenchmarkTaskModelRelation(
                    benchmark_task_id=task_id,
                    model_id=task.model_id,
                    model_name=model_name,
                    model_version=model_version,
                    model_type=db_task.model_type,
                    sort_order=0,
                    created_id=current_user.userId,
                    created_by=current_user.username
                )
                await self.model_relation_mapper.insert(model_relation)

            # 更新数据集关联
            if task.dataset_ids is not None:
                session = await self.dataset_relation_mapper.get_session()
                delete_query = select(BenchmarkTaskDatasetRelation).where(
                    BenchmarkTaskDatasetRelation.benchmark_task_id == task_id
                )
                delete_query = await self.dataset_relation_mapper.append_tenant_id(delete_query)
                delete_result = await session.execute(delete_query)
                old_relations = delete_result.scalars().all()
                for old_rel in old_relations:
                    await self.dataset_relation_mapper.delete(old_rel)
                await self.task_mapper.flush()

                seen_codes: set = set()
                for dataset_id in task.dataset_ids:
                    session = await self.dataset_mapper.get_session()
                    dataset_query = select(BenchmarkDataset).where(
                        or_(
                            BenchmarkDataset.tenant_id == GLOBAL_TENANT_ID,
                            BenchmarkDataset.tenant_id == current_user.tenantId,
                        ),
                        BenchmarkDataset.id == dataset_id,
                    )
                    dataset_result = await session.execute(dataset_query)
                    dataset = dataset_result.scalar_one_or_none()
                    if not dataset:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"数据集不存在: {dataset_id}"
                        )
                    if dataset.code in seen_codes:
                        continue
                    seen_codes.add(dataset.code)
                    invoke_name = getattr(dataset, "invoke_name", None) or (dataset.code + "_gen")
                    dataset_relation = BenchmarkTaskDatasetRelation(
                        benchmark_task_id=task_id,
                        dataset_code=dataset.code,
                        invoke_name=invoke_name,
                        export_var=getattr(dataset, "export_var", None),
                        created_id=current_user.userId,
                        created_by=current_user.username
                    )
                    await self.dataset_relation_mapper.insert(dataset_relation)

            # 根据最新配置同步任务状态与执行器调度时间
            schedule_at = db_task.schedule_at
            db_task.status = (
                TaskStatus.SCHEDULED_PENDING.value
                if schedule_at is not None
                else TaskStatus.CREATED.value
            )

            execution = await self.task_mapper.query_one(
                select(TaskExecution).where(
                    TaskExecution.business_type == TaskExecutionBusinessType.BENCHMARK_TASK.value,
                    TaskExecution.business_id == task_id
                ).order_by(TaskExecution.created_at.desc())
            )
            if execution:
                execution.schedule_at = schedule_at
                execution.status = TaskExecutionStatus.PENDING.value
                execution.retry_count = 0
                execution.last_error = None
                execution.locked_at = None
                execution.locked_by = None
                execution.kwargs = {"project_id": project_id}
            else:
                execution = TaskExecution(
                    business_type=TaskExecutionBusinessType.BENCHMARK_TASK.value,
                    business_id=task_id,
                    schedule_at=schedule_at,
                    status=TaskExecutionStatus.PENDING.value,
                    executor=TaskExecutionExecutor.BENCHMARK_TASK.value,
                    method=TaskExecutionMethod.START.value,
                    kwargs={"project_id": project_id}
                )
                await self.task_mapper.insert(execution)

            await self.task_mapper.commit()
        except Exception:
            await self.task_mapper.rollback()
            raise

        return await self.get_task(project_id, task_id)

    async def delete_task(
        self,
        project_id: int,
        task_id: int
    ) -> None:
        """删除任务（运行中需先终止）"""
        task = await self.validate_task(task_id, project_id)

        # 参考数据清洗：仅允许已创建/定时待启动/已完成/失败/已终止的任务删除
        if task.status not in [
            TaskStatus.CREATED.value,
            TaskStatus.SCHEDULED_PENDING.value,
            TaskStatus.TERMINATED.value,
            TaskStatus.FAILED.value,
            TaskStatus.COMPLETED.value,
        ]:
            raise HTTPException(
                status_code=400,
                detail=f"当前任务状态为 {task.status}，不允许删除"
            )

        try:
            session = await self.model_relation_mapper.get_session()
            model_query = select(BenchmarkTaskModelRelation).where(
                BenchmarkTaskModelRelation.benchmark_task_id == task_id
            )
            model_query = await self.model_relation_mapper.append_tenant_id(model_query)
            model_result = await session.execute(model_query)
            for model_rel in model_result.scalars().all():
                await self.model_relation_mapper.delete(model_rel)

            dataset_query = select(BenchmarkTaskDatasetRelation).where(
                BenchmarkTaskDatasetRelation.benchmark_task_id == task_id
            )
            dataset_query = await self.dataset_relation_mapper.append_tenant_id(dataset_query)
            dataset_result = await session.execute(dataset_query)
            for dataset_rel in dataset_result.scalars().all():
                await self.dataset_relation_mapper.delete(dataset_rel)

            # 同步删除执行器记录，避免残留调度数据
            execution_query = select(TaskExecution).where(
                TaskExecution.business_type == TaskExecutionBusinessType.BENCHMARK_TASK.value,
                TaskExecution.business_id == task_id
            )
            execution_query = await self.task_mapper.append_tenant_id(execution_query)
            execution_result = await session.execute(execution_query)
            for execution in execution_result.scalars().all():
                await self.task_mapper.delete(execution)

            await self.task_mapper.delete(task)
            await self.task_mapper.commit()
        except Exception:
            await self.task_mapper.rollback()
            raise

    async def _submit_task_to_celery(
        self,
        task: BenchmarkTask,
        project_id: int,
        task_id: int
    ) -> None:
        """
        提交任务到Celery队列的公共方法
        
        Args:
            task: 基准评估任务对象
            project_id: 项目ID
            task_id: 任务ID
        """
        # 生成项目命名空间
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        
        # 获取当前租户ID（Celery worker 进程需要）
        from app.utils.app_runtime_context import get_tenant_id
        tenant_id = get_tenant_id()
        if not tenant_id:
            # 如果上下文没有，从数据库记录中获取（已自动填充）
            tenant_id = task.tenant_id
        
        # 启动异步Celery任务
        try:
            from app.tasks.benchmark_tasks import create_benchmark_task_async
            from app.tasks.celery_app import celery_app
            
            logger.info(f"准备提交基准评估任务到Celery队列: task_id={task_id}, namespace={namespace}, tenant_id={tenant_id}")
            
            # 准备任务参数（需要将任务数据序列化为字典）
            task_data = {
                "id": task.id,
                "name": task.name,
                "description": task.description,
                "project_id": task.project_id,
                "model_type": task.model_type,
                "graphics_card_resource": task.graphics_card_resource,
                "schedule_enabled": bool(task.schedule_at),
                "schedule_at": task.schedule_at.isoformat() if task.schedule_at else None,
            }
            task_args = [task_id, namespace, task_data, tenant_id]
            
            # 提交任务
            celery_result = create_benchmark_task_async.apply_async(
                args=task_args,
                countdown=1  # 延迟1秒执行，确保数据库事务完成
            )
            
            # 验证任务ID
            if not celery_result.id:
                raise ValueError("Celery任务ID为空，任务可能未成功提交")
            
            logger.info(f"Celery任务已提交，任务ID: {celery_result.id}")
            
            # 更新任务状态为排队中
            task.status = TaskStatus.PENDING.value
            task.started_at = None
            task.finished_at = None
            # 保存Celery任务ID
            task.celery_task_id = celery_result.id
            await self.task_mapper.commit()
            
            logger.info(f"基准评估任务已成功提交到Celery队列: task_id={task_id}, Celery任务ID: {celery_result.id}")
        except ImportError as e:
            # 如果 benchmark_tasks 模块不存在，记录错误并抛出异常
            logger.error(
                f"基准评估任务Celery模块未找到: {str(e)}，请确保已实现 benchmark_tasks 模块"
            )
            task.status = TaskStatus.FAILED.value
            task.error_message = f"Celery任务模块未找到: {str(e)}"
            await self.task_mapper.commit()
            raise HTTPException(
                status_code=500,
                detail=f"基准评估任务Celery模块未找到: {str(e)}。请确保已实现 benchmark_tasks 模块。"
            )
        except Exception as e:
            # 记录错误并更新任务状态为失败
            logger.error(
                f"提交基准评估任务到Celery队列失败: task_id={task_id}, "
                f"错误: {str(e)}, 错误类型: {type(e).__name__}",
                exc_info=True
            )
            # 更新任务状态为失败
            task.status = TaskStatus.FAILED.value
            task.error_message = f"提交任务到队列失败: {str(e)}"
            await self.task_mapper.commit()
            # 抛出异常
            raise HTTPException(
                status_code=500,
                detail=f"提交基准评估任务到队列失败: {str(e)}。请检查Celery broker连接和worker状态。"
            )

    async def start_task(
        self,
        project_id: int,
        task_id: int
    ) -> None:
        """启动任务"""
        task = await self.validate_task(task_id, project_id)

        if task.status not in [TaskStatus.CREATED.value, TaskStatus.SCHEDULED_PENDING.value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="只能启动状态为创建/定时待启动的任务"
            )

        execution = await self.task_mapper.query_one(
            select(TaskExecution).where(
                TaskExecution.business_type == TaskExecutionBusinessType.BENCHMARK_TASK.value,
                TaskExecution.business_id == task_id
            ).order_by(TaskExecution.created_at.desc())
        )
        if not execution:
            # 兼容历史数据：无执行器记录则直接提交 Celery
            await self._submit_task_to_celery(task, project_id, task_id)
            return

        if execution.schedule_at is not None:
            raise HTTPException(status_code=400, detail="定时待启动的任务不允许手动启动")
        if execution.status == TaskExecutionStatus.DONE.value:
            raise HTTPException(status_code=400, detail="任务已完成，无需重复启动")
        if execution.status == TaskExecutionStatus.RUNNING.value:
            raise HTTPException(status_code=400, detail="任务正在执行中")

        execution.status = TaskExecutionStatus.RUNNING.value
        execution.locked_at = datetime.now()
        execution.locked_by = "benchmark_start_api"
        await self.task_mapper.commit()

        try:
            await self.run_create_benchmark_task_post_process(task_id=task_id)
            execution.status = TaskExecutionStatus.DONE.value
            execution.locked_at = None
            execution.locked_by = None
            await self.task_mapper.commit()
        except Exception as e:
            execution.retry_count = (execution.retry_count or 0) + 1
            execution.last_error = str(e)
            execution.status = (
                TaskExecutionStatus.PENDING.value
                if execution.retry_count <= execution.max_retry
                else TaskExecutionStatus.FAILED.value
            )
            execution.locked_at = None
            execution.locked_by = None
            await self.task_mapper.commit()
            raise

    async def cancel_task(
        self,
        project_id: int,
        task_id: int
    ) -> None:
        """终止基准评估任务"""
        from celery import current_app as celery_app
        
        # 1. 验证任务存在
        task = await self.validate_task(task_id, project_id)

        # 2. 检查任务状态，只有运行中、准备中或排队中的任务才能终止
        if task.status not in [TaskStatus.RUNNING.value, TaskStatus.PENDING.value]:
            raise HTTPException(
                status_code=400,
                detail=f"任务当前状态为 {task.status}，只有运行中、排队中的任务才能终止"
            )

        # 3. 取消Celery任务（如果有）
        if task.celery_task_id:
            try:
                celery_app.control.revoke(task.celery_task_id, terminate=True)
                logger.info(f"已取消Celery任务: {task.celery_task_id}")
            except Exception as e:
                logger.warning(f"取消Celery任务失败: {e}")

        # 4. 更新任务状态为终止
        task.status = TaskStatus.TERMINATED.value
        task.error_message = "任务已被用户终止"
        
        # 5. 更新任务结束时间
        task.finished_at = datetime.now()
        # 兜底逻辑，若此时任务开始时间为空，设置开始时间为任务创建时间
        if not task.started_at:
            task.started_at = task.created_at
            logger.warning(
                f"基准评估任务 {task.id} 在终态时 started_at 为空，"
                f"使用 created_at ({task.started_at}) 作为兜底值"
            )

        await self.task_mapper.commit()
        logger.info(f"基准评估任务 {task_id} 状态已更新为终止")

        # 同步执行器任务状态
        execution = await self.task_mapper.query_one(
            select(TaskExecution).where(
                TaskExecution.business_type == TaskExecutionBusinessType.BENCHMARK_TASK.value,
                TaskExecution.business_id == task_id
            ).order_by(TaskExecution.created_at.desc())
        )
        if execution and execution.status in [TaskExecutionStatus.PENDING.value, TaskExecutionStatus.RUNNING.value]:
            execution.status = TaskExecutionStatus.FAILED.value
            execution.last_error = "任务已被用户终止"
            execution.locked_at = None
            execution.locked_by = None
            await self.task_mapper.commit()

        # 6. 在K8s上删除对应的Job
        await self.delete_benchmark_k8s_job(task_id, project_id)

    async def delete_benchmark_k8s_job(self, task_id: int, project_id: int) -> None:
        """删除基准评估任务对应的 K8s Job（任务完成或终止后调用）。"""
        from app.utils.k8s_launcher import K8sLauncher
        from app.models.models import KubernetesResource, ProjectKubernetesRelation

        try:
            session = await self.task_mapper.get_session()
            k8s_query = select(KubernetesResource.config).join(
                ProjectKubernetesRelation,
                ProjectKubernetesRelation.k8s_id == KubernetesResource.id
            ).filter(ProjectKubernetesRelation.project_id == project_id)
            k8s_query = await self.task_mapper.append_tenant_id(k8s_query)
            k8s_result = await session.execute(k8s_query)
            k8s_configs = k8s_result.scalars().all()

            if not k8s_configs:
                logger.warning(f"项目 {project_id} 没有找到K8s配置，跳过删除Job")
                return

            launcher = K8sLauncher(config_str=k8s_configs[0])
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
            job_name = f"benchmark-task-{task_id}"

            success = await launcher.delete_job(namespace=namespace, job_name=job_name)
            if success:
                logger.info(f"成功删除Job: {job_name}")
            else:
                logger.warning(f"Job {job_name} 不存在或删除失败")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"删除基准评估 K8s Job 失败: task_id={task_id}, error={e}", exc_info=True)

    async def resubmit_task(
        self,
        project_id: int,
        task_id: int
    ) -> None:
        """重新提交任务（失败/已取消状态）- 重置状态并立即启动任务"""
        task = await self.validate_task(task_id, project_id)

        if task.status not in [TaskStatus.FAILED.value, TaskStatus.TERMINATED.value]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="只能重新提交failed或terminated状态的任务"
            )

        # 清理上次运行产生的 JFS 资源（config/ 和 results/ 子目录），避免垃圾堆积
        try:
            from app.core.depend_manager import AutoContainer as _AC
            _storage_service = _AC().storage_service()
            app_runtime_context.set_tenant_id(task.tenant_id or None)
            _jfs = await _storage_service.JUICEFS_CLIENT(app_runtime_context.get_tenant_id())
            if _jfs:
                namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
                task_root = StoragePath.BENCHMARK_TASK_ROOT.format_storage_path(
                    namespace=namespace, task_id=task_id
                ).rstrip("/")
                if _jfs.exists(task_root):
                    _jfs.rmr(task_root)
                    logger.info(f"已清理基准评估任务 JFS 目录: {task_root}")
        except Exception as _e:
            logger.warning(f"清理基准评估任务 JFS 目录失败（不影响重新提交）: task_id={task_id}, error={_e}")

        # 重置任务状态和相关信息
        task.status = TaskStatus.CREATED.value
        task.progress = 0
        task.error_message = None
        task.log_path = None
        task.result_path = None
        task.started_at = None
        task.finished_at = None
        task.lab_k8s_uuid = None
        task.celery_task_id = None
        await self.task_mapper.commit()

        # 立即启动任务（提交到Celery队列）
        await self._submit_task_to_celery(task, project_id, task_id)

    async def _make_unique_clone_name(
        self, project_id: int, tenant_id: Optional[str], base_name: str
    ) -> str:
        """在项目+租户下生成唯一克隆名：base_name_clone、base_name_clone_1、base_name_clone_2 ..."""
        for n in range(0, 1000):
            candidate = f"{base_name}_clone" if n == 0 else f"{base_name}_clone_{n}"
            q = select(BenchmarkTask).where(
                BenchmarkTask.project_id == project_id,
                BenchmarkTask.name == candidate,
            )
            if tenant_id:
                q = q.where(BenchmarkTask.tenant_id == tenant_id)
            existing = await self.task_mapper.query_one(q)
            if not existing:
                return candidate
        return f"{base_name}_clone_0"

    async def clone_task(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        task_id: int
    ) -> BenchmarkTaskDetailResponse:
        """克隆任务（克隆名去重：从 xxx_clone 再克隆得到 xxx_clone_1，避免多条 xxx_clone）"""
        original_task = await self.validate_task(task_id, project_id)
        base_name = re.sub(r"_clone(_\d+)?$", "", (original_task.name or "").strip()) or (original_task.name or "").strip()
        if not base_name:
            base_name = "基准评估任务"
        tenant_id = getattr(original_task, "tenant_id", None) or app_runtime_context.get_tenant_id()
        clone_name = await self._make_unique_clone_name(project_id, tenant_id, base_name)

        new_task = BenchmarkTask(
            name=clone_name,
            description=original_task.description,
            project_id=project_id,
            model_type=original_task.model_type,
            model_provider=getattr(original_task, "model_provider", None),
            inference_params=getattr(original_task, "inference_params", None),
            schedule_at=original_task.schedule_at,
            schedule_enabled=original_task.schedule_at is not None,
            graphics_card_resource=original_task.graphics_card_resource,
            status=TaskStatus.CREATED.value,
            progress=0,
            created_id=current_user.userId,
            created_by=current_user.username,
        )
        try:
            await self.task_mapper.insert(new_task)
            await self.task_mapper.flush()

            session = await self.model_relation_mapper.get_session()

            # 克隆模型关联（保持 sort_order）
            model_query = (
                select(BenchmarkTaskModelRelation)
                .where(BenchmarkTaskModelRelation.benchmark_task_id == task_id)
                .order_by(BenchmarkTaskModelRelation.sort_order, BenchmarkTaskModelRelation.id)
            )
            model_query = await self.model_relation_mapper.append_tenant_id(model_query)
            model_result = await session.execute(model_query)
            for model_rel in model_result.scalars().all():
                new_model_rel = BenchmarkTaskModelRelation(
                    benchmark_task_id=new_task.id,
                    model_id=model_rel.model_id,
                    model_name=model_rel.model_name,
                    model_version=model_rel.model_version,
                    model_type=model_rel.model_type,
                    sort_order=model_rel.sort_order,
                    created_id=current_user.userId,
                    created_by=current_user.username,
                )
                await self.model_relation_mapper.insert(new_model_rel)

            # 克隆数据集关联（含 invoke_name、export_var，保持原顺序）
            dataset_query = (
                select(BenchmarkTaskDatasetRelation)
                .where(BenchmarkTaskDatasetRelation.benchmark_task_id == task_id)
                .order_by(BenchmarkTaskDatasetRelation.id)
            )
            dataset_query = await self.dataset_relation_mapper.append_tenant_id(dataset_query)
            dataset_result = await session.execute(dataset_query)
            for dataset_rel in dataset_result.scalars().all():
                new_dataset_rel = BenchmarkTaskDatasetRelation(
                    benchmark_task_id=new_task.id,
                    dataset_code=dataset_rel.dataset_code,
                    invoke_name=getattr(dataset_rel, "invoke_name", None),
                    export_var=getattr(dataset_rel, "export_var", None),
                    created_id=current_user.userId,
                    created_by=current_user.username,
                )
                await self.dataset_relation_mapper.insert(new_dataset_rel)

            await self.task_mapper.commit()
        except Exception:
            await self.task_mapper.rollback()
            raise

        return await self.get_task(project_id, new_task.id)

    async def compare_tasks(
        self,
        project_id: int,
        request: BenchmarkTaskCompareRequest
    ) -> BenchmarkTaskCompareResponse:
        """对比评估（传入任务ID列表，2-5个，返回对比数据）"""
        if len(request.task_ids) < 2 or len(request.task_ids) > 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="任务数量必须在2-5个之间"
            )

        # 验证所有任务都属于该项目且已完成
        tasks = []
        for task_id in request.task_ids:
            task = await self.validate_task(task_id, project_id)
            if task.status != TaskStatus.COMPLETED.value:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"任务{task_id}状态必须为completed才能对比"
                )
            tasks.append(task)

        # 获取对比数据：按任务 ID 列表查询，不做去重，用户选了几个任务就对比几条（每条对应该任务下模型在该任务中的得分）
        session = await self.result_mapper.get_session()
        result_query = select(BenchmarkResult).where(
            BenchmarkResult.benchmark_task_id.in_(request.task_ids)
        )
        result_query = await self.result_mapper.append_tenant_id(result_query)
        result_res = await session.execute(result_query)
        results = result_res.scalars().all()

        # 按 (benchmark_task_id, model_id) 分组：同一任务同一模型为一条对比项，不按模型名去重
        from collections import defaultdict
        task_model_results = defaultdict(lambda: {"scores": {}, "model_name": None, "model_version": None})
        dataset_codes_set = set()

        for r in results:
            key = (r.benchmark_task_id, r.model_id)
            if task_model_results[key]["model_name"] is None:
                task_model_results[key]["model_name"] = r.model_name
                task_model_results[key]["model_version"] = r.model_version
            task_model_results[key]["scores"][r.dataset_code] = r.score
            dataset_codes_set.add(r.dataset_code)

        dataset_codes = sorted(dataset_codes_set)

        # 批量查询数据集名称（code -> name）
        code_to_name: Dict[str, str] = {}
        if dataset_codes:
            ds_query = select(BenchmarkDataset).where(BenchmarkDataset.code.in_(dataset_codes))
            ds_query = await self.dataset_mapper.append_tenant_id(ds_query)
            ds_result = await session.execute(ds_query)
            for d in ds_result.scalars().all():
                code_to_name[d.code] = d.name

        # 按任务顺序输出对比项（用户选了哪些任务就按该顺序展示哪些条）
        task_id_order = request.task_ids
        seen_keys = set()
        model_reports = []
        for task_id in task_id_order:
            # 该任务下可能只有一个 model_id（典型情况）
            for (tid, model_id), data in task_model_results.items():
                if tid != task_id or (tid, model_id) in seen_keys:
                    continue
                seen_keys.add((tid, model_id))
                dataset_scores = data["scores"]
                data_items = [
                    BenchmarkRadarChartDataItem(
                        dataset_code=code,
                        dataset_name=code_to_name.get(code, code),
                        score=dataset_scores.get(code, 0.0)
                    )
                    for code in dataset_codes
                ]
                display_name = data["model_name"] or ""
                if data["model_version"] and str(data["model_version"]).strip():
                    display_name = f"{display_name}({data['model_version']})"
                radar_chart_model_data = BenchmarkRadarChartModelData(
                    model_id=model_id,
                    model_name=display_name,
                    model_version=data["model_version"],
                    data=data_items
                )
                model_reports.append(BenchmarkModelReportData(
                    model_id=model_id,
                    model_name=display_name,
                    model_version=data["model_version"],
                    radar_chart_data=radar_chart_model_data
                ))
                break  # 当前任务只取第一个模型（基准评估每任务单模型）

        return BenchmarkTaskCompareResponse(
            benchmark_task_ids=[task.id for task in tasks],
            evaluation_type="comparison",
            model_reports=model_reports
        )

    async def get_task_report(
        self,
        project_id: int,
        task_id: int
    ) -> BenchmarkTaskReportResponse:
        """获取评估报告"""
        task = await self.validate_task(task_id, project_id)

        # 获取评估结果
        session = await self.result_mapper.get_session()
        result_query = select(BenchmarkResult).where(
            BenchmarkResult.benchmark_task_id == task_id
        )
        result_query = await self.result_mapper.append_tenant_id(result_query)
        result_result = await session.execute(result_query)
        results = [
            BenchmarkResultResponse.model_validate(r)
            for r in result_result.scalars().all()
        ]

        # 按模型分组结果，构建模型报告数据
        from collections import defaultdict
        model_results_map = defaultdict(lambda: {"scores": {}, "model_name": None, "model_version": None})
        
        for result in results:
            model_id = result.model_id
            if model_results_map[model_id]["model_name"] is None:
                model_results_map[model_id]["model_name"] = result.model_name
                model_results_map[model_id]["model_version"] = result.model_version
            model_results_map[model_id]["scores"][result.dataset_code] = result.score

        # 构建模型报告列表
        model_reports = []
        for model_id, data in model_results_map.items():
            dataset_scores = data["scores"]
            # 计算平均得分
            if dataset_scores:
                average_score = sum(dataset_scores.values()) / len(dataset_scores)
            else:
                average_score = None
            
            model_reports.append(BenchmarkReportModelData(
                model_id=model_id,
                model_name=data["model_name"],
                model_version=data["model_version"],
                dataset_scores=dataset_scores,
                average_score=average_score
            ))

        return BenchmarkTaskReportResponse(
            benchmark_task_id=task.id,
            evaluation_type="single",
            model_reports=model_reports
        )

    async def download_benchmark_report_docx(self, project_id: int, task_id: int):
        """下载基准评估报告 DOCX 文件。"""
        task_data = await self.get_task(project_id, task_id)
        report_data = await self.get_task_report(project_id, task_id)
        if not report_data.model_reports:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"基准评估任务 {task_id} 没有找到评估报告数据",
            )
        from app.utils.benchmark_report_docx_generator import BenchmarkReportDocxGenerator
        generator = BenchmarkReportDocxGenerator(task_data, report_data)
        docx_bytes = generator.generate()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = re.sub(r'[<>:"/\\|?*]', '_', task_data.name)
        filename = f"基准评估报告_{safe_name}_{timestamp}.docx"
        from app.utils.http_util import build_content_disposition_header
        return StreamingResponse(
            iter([docx_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": build_content_disposition_header(filename)},
        )

    async def download_benchmark_compare_report_docx(self, project_id: int, request: BenchmarkTaskCompareRequest):
        """下载对比评估报告 DOCX。请求体与 compare_tasks 一致（task_ids），先拉取对比数据再生成报告。"""
        compare_data = await self.compare_tasks(project_id, request)
        if not compare_data.model_reports:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="对比评估无报告数据，无法生成 DOCX",
            )
        from app.utils.benchmark_compare_report_docx_generator import BenchmarkCompareReportDocxGenerator
        generator = BenchmarkCompareReportDocxGenerator(compare_data)
        docx_bytes = generator.generate()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        task_part = "_".join(f"任务{tid}" for tid in compare_data.benchmark_task_ids)
        safe_part = re.sub(r'[<>:"/\\|?*]', '_', task_part)
        filename = f"对比评估报告_{safe_part}_{timestamp}.docx"
        from app.utils.http_util import build_content_disposition_header
        return StreamingResponse(
            iter([docx_bytes]),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": build_content_disposition_header(filename)},
        )

    async def download_task_result_file(
        self,
        project_id: int,
        task_id: int,
        dataset_code: str,
        model_id: Optional[int] = None,
    ) -> bytes:
        """下载基准评估结果 JSON 文件（JFS：result_path/predictions/{model_name}/{dataset}.json）"""
        task = await self.validate_task(task_id, project_id)
        if not task.result_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="该任务暂无结果路径",
            )
        model_rels = await self.model_relation_mapper.query(
            select(BenchmarkTaskModelRelation).where(
                BenchmarkTaskModelRelation.benchmark_task_id == task_id
            ).order_by(BenchmarkTaskModelRelation.sort_order)
        )
        model_rels = list(model_rels) if model_rels else []
        if not model_rels:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="该任务未关联模型",
            )
        if model_id is not None:
            rel = next((m for m in model_rels if m.model_id == model_id), None)
            if not rel:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="指定模型不属于该任务",
                )
            model_name = rel.model_name
        else:
            model_name = model_rels[0].model_name
        base = task.result_path.strip().lstrip("/").rstrip("/")
        pred_dir = f"{base}/predictions/{model_name}"

        from app.core.depend_manager import AutoContainer
        storage_service = AutoContainer().storage_service()
        app_runtime_context.set_tenant_id(task.tenant_id or None)
        jfs = await storage_service.JUICEFS_CLIENT(app_runtime_context.get_tenant_id())
        if not jfs:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="存储服务不可用")

        # 列出预测目录下所有文件，用模糊匹配找到对应数据集的预测文件
        # OpenCompass 文件名使用数据集 abbr（如 GPQA_diamond），可能与 dataset_code（如 gpqa）大小写/后缀不同
        try:
            all_files = jfs.listdir(pred_dir) if jfs.exists(pred_dir) else []
        except Exception as e:
            logger.debug("列出预测目录失败 %s: %s", pred_dir, e)
            all_files = []

        matched_file = _match_prediction_file(all_files, dataset_code)
        if matched_file:
            file_path = f"{pred_dir}/{matched_file}"
            try:
                with jfs.open(file_path, "rb") as f:
                    return f.read()
            except Exception as e:
                logger.debug("读取预测文件失败 %s: %s", file_path, e)

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到结果文件：predictions/{model_name}/{dataset_code}.json",
        )

    async def get_task_logs(
        self,
        project_id: int,
        task_id: int,
    ) -> BenchmarkTaskLogResponse:
        """获取任务日志（优先归档日志，其次 Loki 实时日志）"""
        from datetime import datetime
        from app.utils.log_service import log_service

        task = await self.validate_task(task_id, project_id)

        if task.log_path:
            logs = log_service.get_logs_from_minio(task.log_path)
            return BenchmarkTaskLogResponse(archived=True, logs=logs)
        if not task.lab_k8s_uuid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="任务没有关联的K8S UUID"
            )
        end_time = task.finished_at if task.finished_at else datetime.now()
        logs = log_service.get_logs_from_loki(
            task.lab_k8s_uuid,
            start_time=task.started_at,
            end_time=end_time,
            days=30
        )
        return BenchmarkTaskLogResponse(archived=False, logs=logs)

    async def download_task_log(self, project_id: int, task_id: int) -> bytes:
        """下载任务日志文件（优先归档日志，其次 Loki 实时日志）"""
        from datetime import datetime
        from app.utils.log_service import log_service

        task = await self.validate_task(task_id, project_id)
        if task.log_path:
            logs = log_service.get_logs_from_minio(task.log_path)
            logs_str = "\n".join(logs) if isinstance(logs, list) else str(logs)
            return logs_str.encode("utf-8")
        if not task.lab_k8s_uuid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="任务没有关联的K8S UUID，无法获取日志"
            )
        end_time = task.finished_at if task.finished_at else datetime.now()
        logs = log_service.get_logs_from_loki(
            task.lab_k8s_uuid,
            start_time=task.started_at,
            end_time=end_time,
            days=30
        )
        logs_str = "\n".join(logs) if isinstance(logs, list) else str(logs)
        return logs_str.encode("utf-8")

    async def get_leaderboard(
        self,
        project_id: int,
        sort_by: str = "average_score",
        sort_order: str = "desc",
        page: Optional[int] = None,
        size: Optional[int] = None,
    ) -> Page[BenchmarkLeaderboardItemResponse]:
        """获取榜单列表（分页、支持按平均分或指定数据集得分排序）。
        
        同一模型（model_name + model_version）跑多次任务时只保留最新一次评估得分，去重与排序均在 SQL 层完成，不影响分页。
        """
        session = await self.leaderboard_mapper.get_session()
        page = page or 1
        size = size or 10

        # 内层：按 (model_name, model_version) 分区，取 last_evaluated_at / last_task_id 最新的一条（ROW_NUMBER）
        inner = select(
            BenchmarkLeaderboard,
            func.row_number().over(
                partition_by=[BenchmarkLeaderboard.model_name, BenchmarkLeaderboard.model_version],
                order_by=[
                    BenchmarkLeaderboard.last_evaluated_at.desc().nulls_last(),
                    BenchmarkLeaderboard.last_task_id.desc().nulls_last(),
                ],
            ).label("rn"),
        ).where(
            BenchmarkLeaderboard.project_id == project_id,
        )
        inner = await self.leaderboard_mapper.append_tenant_id(inner)
        subq = inner.subquery()

        # 去重：只保留 rn=1，再排序、分页
        outer = select(subq).where(subq.c.rn == 1)
        if sort_by == "average_score":
            if sort_order == "desc":
                outer = outer.order_by(subq.c.average_score.desc())
            else:
                outer = outer.order_by(subq.c.average_score.asc())
        else:
            score_expr = cast(
                func.jsonb_extract_path_text(subq.c.dataset_scores, sort_by),
                Float,
            )
            if sort_order == "desc":
                outer = outer.order_by(score_expr.desc().nulls_last())
            else:
                outer = outer.order_by(score_expr.asc().nulls_last())

        # 总数：去重后的行数（SQL 层）
        count_sub = select(subq.c.id).where(subq.c.rn == 1).subquery()
        count_stmt = select(func.count()).select_from(count_sub)
        count_result = await session.execute(count_stmt)
        total = count_result.scalar() or 0

        # 分页
        outer = outer.offset((page - 1) * size).limit(size)
        result = await session.execute(outer)
        page_rows = result.all()

        items = []
        for row in page_rows:
            display_name = row.model_name
            if row.model_version and str(row.model_version).strip():
                display_name = f"{row.model_name}({row.model_version})"
            resp = BenchmarkLeaderboardItemResponse(
                id=row.id,
                created_at=row.created_at,
                updated_at=row.updated_at,
                created_id=row.created_id,
                created_by=row.created_by,
                tenant_id=row.tenant_id,
                project_id=row.project_id,
                model_id=row.model_id,
                model_name=display_name,
                model_version=row.model_version,
                average_score=row.average_score,
                dataset_scores=dict(row.dataset_scores or {}),
                last_task_id=row.last_task_id,
                last_evaluated_at=row.last_evaluated_at,
            )
            items.append(resp)

        pages = (total + size - 1) // size if size > 0 else 1
        return Page(
            items=items,
            total=total,
            page=page,
            size=size,
            pages=pages,
        )

    async def get_radar_chart(
        self,
        project_id: int,
        model_ids: List[int]
    ) -> BenchmarkTaskReportResponse:
        """获取雷达图数据"""
        if len(model_ids) < 1 or len(model_ids) > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="模型数量必须在1-10个之间"
            )

        session = await self.leaderboard_mapper.get_session()
        query = select(BenchmarkLeaderboard).where(
            BenchmarkLeaderboard.project_id == project_id,
            BenchmarkLeaderboard.model_id.in_(model_ids)
        )
        query = await self.leaderboard_mapper.append_tenant_id(query)
        result = await session.execute(query)
        leaderboard_items = result.scalars().all()

        # 构建模型报告数据
        model_reports = []
        for item in leaderboard_items:
            dataset_scores = item.dataset_scores or {}
            # 计算平均得分
            if dataset_scores:
                average_score = sum(dataset_scores.values()) / len(dataset_scores)
            else:
                average_score = None
            # 有版本号时在模型名称后拼接 (version)
            display_name = f"{item.model_name}({item.model_version})" if (item.model_version and str(item.model_version).strip()) else item.model_name

            model_reports.append(BenchmarkReportModelData(
                model_id=item.model_id,
                model_name=display_name,
                model_version=item.model_version,
                dataset_scores=dataset_scores,
                average_score=average_score
            ))

        # 返回报告格式的数据
        return BenchmarkTaskReportResponse(
            benchmark_task_id=project_id, 
            evaluation_type="comparison", 
            model_reports=model_reports
        )
