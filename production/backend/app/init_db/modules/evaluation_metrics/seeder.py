"""
评估指标数据种子管理器
"""

from typing import Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.basic_metric_manager import EvaluationMetrics, MetricType
from app.models.models import RepositoryResource
from app.utils.timezone_utils import get_current_shanghai_time
from .data import get_evaluation_metrics_data, get_system_referee_metrics_data


class EvaluationMetricsSeeder:
    """评估指标数据种子管理器"""
    
    name = "evaluation_metrics"
    
    async def seed(self, session: AsyncSession) -> Dict[str, Any]:
        """执行评估指标数据初始化"""
        print(f"开始初始化 {self.name} 数据...")
        
        total_created = 0
        total_skipped = 0
        
        # 1. 初始化基础评估指标（按租户）
        basic_result = await self._seed_basic_metrics(session)
        total_created += basic_result["created"]
        total_skipped += basic_result["skipped"]
        
        # 2. 初始化系统默认裁判员指标（全局，tenant_id='0'）
        referee_result = await self._seed_system_referee_metrics(session)
        total_created += referee_result["created"]
        total_skipped += referee_result["skipped"]
        
        print(f"✅ {self.name} 初始化完成 - 创建: {total_created}, 跳过: {total_skipped}")
        return {"created": total_created, "skipped": total_skipped, "errors": 0}
    
    async def _seed_basic_metrics(self, session: AsyncSession) -> Dict[str, Any]:
        """初始化基础评估指标（按租户）"""
        seed_data = get_evaluation_metrics_data()
        if not seed_data:
            print("没有基础评估指标数据需要初始化")
            return {"created": 0, "skipped": 0}
        
        # 查询已经存在的仓库（用于获取租户ID）
        repository_result = await session.execute(select(RepositoryResource))
        existing_repository = repository_result.scalars().all()
        
        if not existing_repository:
            print("没有找到仓库资源，跳过基础评估指标初始化")
            return {"created": 0, "skipped": 0}
        
        # 检查已存在的指标
        metric_codes = [metric["metric_code"] for metric in seed_data]
        metrics_to_create = []
        skipped = 0
        
        for repository in existing_repository:
            # 查询该租户下已存在的基础指标
            stmt = select(EvaluationMetrics).where(
                EvaluationMetrics.metric_code.in_(metric_codes),
                EvaluationMetrics.metric_type == MetricType.BASIC_METRIC,
                EvaluationMetrics.tenant_id == repository.tenant_id
            )
            result = await session.execute(stmt)
            existing_metrics = result.scalars().all()
            
            # 构建已存在的指标代码集合
            existing_metric_codes = {metric.metric_code for metric in existing_metrics}
            
            for metric_data in seed_data:
                if metric_data["metric_code"] in existing_metric_codes:
                    print(f"基础评估指标已存在，跳过: {metric_data['name']} (租户: {repository.tenant_id})")
                    skipped += 1
                    continue
                
                # 创建评估指标对象
                now = get_current_shanghai_time()
                new_metric = EvaluationMetrics(
                    name=metric_data["name"],
                    description=metric_data["description"],
                    metric_code=metric_data["metric_code"],
                    metric_type=metric_data["metric_type"],
                    score_scope=metric_data["score_scope"],
                    metrics_param=metric_data["metrics_param"],
                    is_builtin=metric_data.get("is_builtin", True),
                    created_id=0,
                    created_by='system',
                    tenant_id=repository.tenant_id,
                    created_at=now,
                    updated_at=now
                )
                metrics_to_create.append(new_metric)
        
        # 批量插入新指标
        created = 0
        if metrics_to_create:
            session.add_all(metrics_to_create)
            created = len(metrics_to_create)
            print(f"成功创建 {created} 个基础评估指标")
        else:
            print("所有基础评估指标都已存在，无需创建")
        
        return {"created": created, "skipped": skipped}
    
    async def _seed_system_referee_metrics(self, session: AsyncSession) -> Dict[str, Any]:
        """初始化系统默认裁判员评估指标（全局，tenant_id='0'）"""
        seed_data = get_system_referee_metrics_data()
        if not seed_data:
            print("没有系统默认裁判员指标数据需要初始化")
            return {"created": 0, "skipped": 0}
        
        # 系统默认指标使用 tenant_id='0'
        SYSTEM_TENANT_ID = '0'
        
        # 查询已存在的系统默认裁判员指标
        metric_codes = [metric["metric_code"] for metric in seed_data]
        stmt = select(EvaluationMetrics).where(
            EvaluationMetrics.metric_code.in_(metric_codes),
            EvaluationMetrics.metric_type == MetricType.REFEREE_SYSTEM_METRIC,
            EvaluationMetrics.tenant_id == SYSTEM_TENANT_ID,
            EvaluationMetrics.is_builtin == True
        )
        result = await session.execute(stmt)
        existing_metrics = result.scalars().all()
        
        # 构建已存在的指标代码集合
        existing_metric_codes = {metric.metric_code for metric in existing_metrics}
        
        metrics_to_create = []
        skipped = 0
        
        for metric_data in seed_data:
            if metric_data["metric_code"] in existing_metric_codes:
                print(f"系统默认裁判员指标已存在，跳过: {metric_data['name']}")
                skipped += 1
                continue
            
            # 创建系统默认指标
            now = get_current_shanghai_time()
            new_metric = EvaluationMetrics(
                name=metric_data["name"],
                description=metric_data["description"],
                metric_code=metric_data["metric_code"],
                metric_type=metric_data["metric_type"],
                project_id=metric_data.get("project_id", 0),
                score_scope=metric_data["score_scope"],
                metrics_param=metric_data["metrics_param"],
                sort_order=metric_data.get("sort_order", 0),
                is_builtin=True,
                created_id=0,
                created_by='system',
                tenant_id=SYSTEM_TENANT_ID,
                created_at=now,
                updated_at=now
            )
            metrics_to_create.append(new_metric)
        
        # 批量插入新指标
        created = 0
        if metrics_to_create:
            session.add_all(metrics_to_create)
            created = len(metrics_to_create)
            print(f"成功创建 {created} 个系统默认裁判员指标")
        else:
            print("所有系统默认裁判员指标都已存在，无需创建")
        
        return {"created": created, "skipped": skipped}

