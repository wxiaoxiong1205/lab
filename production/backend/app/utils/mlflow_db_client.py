"""
MLflow 数据库连接客户端
用于直接查询 MLflow 数据库中的实验、运行和指标数据
"""

import json
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings
from app.core.logging import logger


class MLflowDBClient:
    """MLflow 数据库客户端"""
    
    def __init__(self):
        """初始化 MLflow 数据库连接"""
        self.async_engine = None
        self.sync_engine = None
        self.async_session_factory = None
        self.sync_session_factory = None
        self._setup_connections()
    
    def _setup_connections(self):
        """设置数据库连接"""
        # 获取 MLflow 数据库连接 URL
        mlflow_backend_uri = settings.MLFLOW_BACKEND_STORE_URI
        
        # 创建异步引擎
        if settings.DATABASE_TYPE == "postgresql":
            # 为异步连接添加 asyncpg 驱动
            async_uri = mlflow_backend_uri.replace("postgresql://", "postgresql+asyncpg://")
        elif settings.DATABASE_TYPE == "mysql":
            # 为异步连接添加 aiomysql 驱动
            async_uri = mlflow_backend_uri.replace("mysql://", "mysql+aiomysql://")
        else:
            async_uri = mlflow_backend_uri
        
        self.async_engine = create_async_engine(
            async_uri,
            echo=settings.LOG_LEVEL.upper() == "DEBUG",
            pool_size=5,
            max_overflow=20,
            pool_timeout=30,
            pool_recycle=1200,
            pool_pre_ping=True
        )
        
        # 创建同步引擎
        if settings.DATABASE_TYPE == "postgresql":
            # 为同步连接添加 psycopg2 驱动
            sync_uri = mlflow_backend_uri.replace("postgresql://", "postgresql+psycopg2://")
        elif settings.DATABASE_TYPE == "mysql":
            # 为同步连接添加 pymysql 驱动
            sync_uri = mlflow_backend_uri.replace("mysql://", "mysql+pymysql://")
        else:
            sync_uri = mlflow_backend_uri
        
        self.sync_engine = create_engine(
            sync_uri,
            echo=settings.LOG_LEVEL.upper() == "DEBUG",
            pool_size=5,
            max_overflow=20,
            pool_timeout=30,
            pool_recycle=1200,
            pool_pre_ping=True
        )
        
        # 创建会话工厂
        self.async_session_factory = async_sessionmaker(
            self.async_engine,
            class_=AsyncSession,
            expire_on_commit=False
        )
        
        self.sync_session_factory = sessionmaker(
            self.sync_engine,
            class_=Session,
            expire_on_commit=False
        )
    
    @asynccontextmanager
    async def async_session(self):
        """异步会话上下文管理器"""
        session = self.async_session_factory()
        try:
            yield session
        except Exception as e:
            logger.error(f"MLflow 数据库异步会话错误: {str(e)}")
            await session.rollback()
            raise
        finally:
            await session.close()
    
    @asynccontextmanager
    def sync_session(self):
        """同步会话上下文管理器"""
        session = self.sync_session_factory()
        try:
            yield session
        except Exception as e:
            logger.error(f"MLflow 数据库同步会话错误: {str(e)}")
            session.rollback()
            raise
        finally:
            session.close()
    
    async def get_experiments(self, limit: int = 100) -> List[Dict[str, Any]]:
        """获取实验列表"""
        query = """
        SELECT 
            experiment_id,
            name,
            artifact_location,
            lifecycle_stage,
            creation_time,
            last_update_time
        FROM experiments 
        WHERE lifecycle_stage != 'deleted'
        ORDER BY creation_time DESC
        LIMIT :limit
        """
        
        async with self.async_session() as session:
            result = await session.execute(text(query), {"limit": limit})
            return [dict(row._mapping) for row in result]
    
    async def get_runs_by_experiment(self, experiment_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """根据实验ID获取运行列表"""
        query = """
        SELECT 
            run_uuid,
            name,
            source_type,
            source_name,
            entry_point_name,
            user_id,
            status,
            start_time,
            end_time,
            source_version,
            lifecycle_stage,
            artifact_uri
        FROM runs 
        WHERE experiment_id = :experiment_id
        AND lifecycle_stage != 'deleted'
        ORDER BY start_time DESC
        LIMIT :limit
        """
        
        async with self.async_session() as session:
            result = await session.execute(text(query), {
                "experiment_id": experiment_id,
                "limit": limit
            })
            return [dict(row._mapping) for row in result]
    
    async def get_metrics_by_run(self, run_uuid: str) -> List[Dict[str, Any]]:
        """根据运行ID获取指标数据"""
        query = """
        SELECT 
            key,
            value,
            timestamp,
            step
        FROM metrics 
        WHERE run_uuid = :run_uuid
        ORDER BY key, step
        """
        
        async with self.async_session() as session:
            result = await session.execute(text(query), {"run_uuid": run_uuid})
            return [dict(row._mapping) for row in result]
    
    async def get_params_by_run(self, run_uuid: str) -> List[Dict[str, Any]]:
        """根据运行ID获取参数数据"""
        query = """
        SELECT 
            key,
            value
        FROM params 
        WHERE run_uuid = :run_uuid
        ORDER BY key
        """
        
        async with self.async_session() as session:
            result = await session.execute(text(query), {"run_uuid": run_uuid})
            return [dict(row._mapping) for row in result]
    
    async def get_tags_by_run(self, run_uuid: str) -> List[Dict[str, Any]]:
        """根据运行ID获取标签数据"""
        query = """
        SELECT 
            key,
            value
        FROM tags 
        WHERE run_uuid = :run_uuid
        ORDER BY key
        """
        
        async with self.async_session() as session:
            result = await session.execute(text(query), {"run_uuid": run_uuid})
            return [dict(row._mapping) for row in result]
    
    def sync_get_experiments(self, limit: int = 100) -> List[Dict[str, Any]]:
        """同步获取实验列表"""
        query = """
        SELECT 
            experiment_id,
            name,
            artifact_location,
            lifecycle_stage,
            creation_time,
            last_update_time
        FROM experiments 
        WHERE lifecycle_stage != 'deleted'
        ORDER BY creation_time DESC
        LIMIT :limit
        """
        
        with self.sync_session() as session:
            result = session.execute(text(query), {"limit": limit})
            return [dict(row._mapping) for row in result]
    
    def sync_get_runs_by_experiment(self, experiment_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """同步根据实验ID获取运行列表"""
        query = """
        SELECT 
            run_uuid,
            name,
            source_type,
            source_name,
            entry_point_name,
            user_id,
            status,
            start_time,
            end_time,
            source_version,
            lifecycle_stage,
            artifact_uri
        FROM runs 
        WHERE experiment_id = :experiment_id
        AND lifecycle_stage != 'deleted'
        ORDER BY start_time DESC
        LIMIT :limit
        """
        
        with self.sync_session() as session:
            result = session.execute(text(query), {
                "experiment_id": experiment_id,
                "limit": limit
            })
            return [dict(row._mapping) for row in result]
    
    async def get_experiment_by_name(self, experiment_name: str) -> Optional[Dict[str, Any]]:
        """根据实验名称获取实验信息"""
        query = """
        SELECT 
            experiment_id,
            name,
            artifact_location,
            lifecycle_stage,
            creation_time,
            last_update_time
        FROM experiments 
        WHERE name = :experiment_name
        AND lifecycle_stage != 'deleted'
        """
        
        async with self.async_session() as session:
            result = await session.execute(text(query), {"experiment_name": experiment_name})
            row = result.first()
            return dict(row._mapping) if row else None
    
    async def get_run_summary(self, run_uuid: str) -> Dict[str, Any]:
        """获取运行的完整摘要信息（包括参数、指标、标签）"""
        async with self.async_session() as session:
            # 获取运行基本信息
            run_query = """
            SELECT 
                run_uuid,
                experiment_id,
                name,
                source_type,
                source_name,
                user_id,
                status,
                start_time,
                end_time,
                lifecycle_stage,
                artifact_uri
            FROM runs 
            WHERE run_uuid = :run_uuid
            """
            
            result = await session.execute(text(run_query), {"run_uuid": run_uuid})
            run_info = result.first()
            
            if not run_info:
                return {}
            
            # 获取参数、指标、标签
            params = await self.get_params_by_run(run_uuid)
            metrics = await self.get_metrics_by_run(run_uuid)
            tags = await self.get_tags_by_run(run_uuid)
            
            return {
                "run_info": dict(run_info._mapping),
                "params": {param["key"]: param["value"] for param in params},
                "metrics": metrics,
                "tags": {tag["key"]: tag["value"] for tag in tags}
            }
    
    async def delete_run(self, run_uuid: str) -> bool:
        """删除 MLflow 运行及其所有相关数据
        
        Args:
            run_uuid: 运行UUID
            
        Returns:
            bool: 删除是否成功
        """
        try:
            async with self.async_session() as session:
                # 1. 删除 latest_metrics 数据（必须先删除，因为有外键约束）
                await session.execute(
                    text("DELETE FROM latest_metrics WHERE run_uuid = :run_uuid"),
                    {"run_uuid": run_uuid}
                )
                
                # 2. 删除指标数据
                await session.execute(
                    text("DELETE FROM metrics WHERE run_uuid = :run_uuid"),
                    {"run_uuid": run_uuid}
                )
                
                # 3. 删除参数数据
                await session.execute(
                    text("DELETE FROM params WHERE run_uuid = :run_uuid"),
                    {"run_uuid": run_uuid}
                )
                
                # 4. 删除标签数据
                await session.execute(
                    text("DELETE FROM tags WHERE run_uuid = :run_uuid"),
                    {"run_uuid": run_uuid}
                )
                
                # 5. 删除运行记录
                await session.execute(
                    text("DELETE FROM runs WHERE run_uuid = :run_uuid"),
                    {"run_uuid": run_uuid}
                )
                
                await session.commit()
                logger.info(f"成功删除 MLflow 运行: {run_uuid}")
                return True
                
        except Exception as e:
            logger.error(f"删除 MLflow 运行失败 ({run_uuid}): {str(e)}")
            return False
    
    async def delete_experiment(self, experiment_id: str) -> bool:
        """删除 MLflow 实验及其所有运行
        
        Args:
            experiment_id: 实验ID
            
        Returns:
            bool: 删除是否成功
        """
        try:
            async with self.async_session() as session:
                # 1. 获取实验下的所有运行
                runs_result = await session.execute(
                    text("SELECT run_uuid FROM runs WHERE experiment_id = :experiment_id"),
                    {"experiment_id": experiment_id}
                )
                run_uuids = [row[0] for row in runs_result]
                
                # 2. 删除所有运行的数据（使用内部删除逻辑，避免重复事务）
                for run_uuid in run_uuids:
                    # 删除 latest_metrics 数据
                    await session.execute(
                        text("DELETE FROM latest_metrics WHERE run_uuid = :run_uuid"),
                        {"run_uuid": run_uuid}
                    )
                    
                    # 删除指标数据
                    await session.execute(
                        text("DELETE FROM metrics WHERE run_uuid = :run_uuid"),
                        {"run_uuid": run_uuid}
                    )
                    
                    # 删除参数数据
                    await session.execute(
                        text("DELETE FROM params WHERE run_uuid = :run_uuid"),
                        {"run_uuid": run_uuid}
                    )
                    
                    # 删除标签数据
                    await session.execute(
                        text("DELETE FROM tags WHERE run_uuid = :run_uuid"),
                        {"run_uuid": run_uuid}
                    )
                    
                    # 删除运行记录
                    await session.execute(
                        text("DELETE FROM runs WHERE run_uuid = :run_uuid"),
                        {"run_uuid": run_uuid}
                    )
                
                # 3. 删除实验记录
                await session.execute(
                    text("DELETE FROM experiments WHERE experiment_id = :experiment_id"),
                    {"experiment_id": experiment_id}
                )
                
                await session.commit()
                logger.info(f"成功删除 MLflow 实验: {experiment_id}")
                return True
                
        except Exception as e:
            logger.error(f"删除 MLflow 实验失败 ({experiment_id}): {str(e)}")
            return False
    
    async def delete_run_by_name(self, experiment_name: str, run_name: str) -> bool:
        """根据实验名称和运行名称删除运行
        
        Args:
            experiment_name: 实验名称
            run_name: 运行名称
            
        Returns:
            bool: 删除是否成功
        """
        try:
            # 获取实验信息
            experiment = await self.get_experiment_by_name(experiment_name)
            if not experiment:
                logger.warning(f"未找到实验: {experiment_name}")
                return False
            
            # 获取实验下的所有运行
            runs = await self.get_runs_by_experiment(experiment["experiment_id"])
            
            # 查找匹配的运行
            target_run = None
            for run in runs:
                if run.get("name") == run_name:
                    target_run = run
                    break
            
            if not target_run:
                logger.warning(f"未找到运行: {run_name} (实验: {experiment_name})")
                return False
            
            # 删除运行
            return await self.delete_run(target_run["run_uuid"])
            
        except Exception as e:
            logger.error(f"根据名称删除运行失败 ({experiment_name}/{run_name}): {str(e)}")
            return False


# 创建全局实例
mlflow_db_client = MLflowDBClient()


# 便捷函数
async def get_training_experiments(project_name: str = None, task_name: str = None, tenant_id: str = None) -> List[Dict[str, Any]]:
    """获取训练相关的实验（支持租户隔离）
    
    Args:
        project_name: 项目名称
        task_name: 任务名称
        tenant_id: 租户ID（可选，如果不提供则从上下文获取）
    """
    from app.utils.app_runtime_context import get_tenant_id
    
    # 如果没有传入 tenant_id，从上下文获取
    if tenant_id is None:
        tenant_id = get_tenant_id()
    
    experiments = await mlflow_db_client.get_experiments()
    
    if project_name or task_name:
        filtered = []
        for exp in experiments:
            exp_name = exp.get("name", "")
            if project_name and task_name:
                # 匹配格式：deepexilab-{tenant_id}-{project_name}-{task_name} 或 deepexilab-{project_name}-{task_name}（向后兼容）
                expected_name = settings.get_mlflow_experiment_name(project_name, task_name, tenant_id)
                if exp_name == expected_name:
                    filtered.append(exp)
            elif project_name:
                # 匹配包含项目名称的实验（支持租户隔离）
                if tenant_id:
                    # 新格式：deepexilab-{tenant_id}-{project_name}-
                    pattern = f"deepexilab-{tenant_id}-{project_name}-"
                else:
                    # 向后兼容：deepexilab-{project_name}-
                    pattern = f"deepexilab-{project_name}-"
                if pattern in exp_name:
                    filtered.append(exp)
        return filtered
    
    # 如果没有指定项目或任务，根据租户过滤
    if tenant_id:
        filtered = []
        for exp in experiments:
            exp_name = exp.get("name", "")
            # 只返回当前租户的实验（格式：deepexilab-{tenant_id}-...）
            if exp_name.startswith(f"deepexilab-{tenant_id}-"):
                filtered.append(exp)
        return filtered
    
    return experiments


async def get_training_runs(project_name: str, task_name: str, tenant_id: str = None) -> List[Dict[str, Any]]:
    """获取特定训练任务的所有运行（支持租户隔离）
    
    Args:
        project_name: 项目名称
        task_name: 任务名称
        tenant_id: 租户ID（可选，如果不提供则从上下文获取）
    """
    from app.utils.app_runtime_context import get_tenant_id
    
    # 如果没有传入 tenant_id，从上下文获取
    if tenant_id is None:
        tenant_id = get_tenant_id()
    
    experiment_name = settings.get_mlflow_experiment_name(project_name, task_name, tenant_id)
    experiment = await mlflow_db_client.get_experiment_by_name(experiment_name)
    
    if not experiment:
        logger.warning(f"未找到实验: {experiment_name}")
        return []
    
    runs = await mlflow_db_client.get_runs_by_experiment(experiment["experiment_id"])
    return runs


async def get_training_metrics(project_name: str, task_name: str, run_name: str = None, tenant_id: str = None) -> Dict[str, Any]:
    """获取训练指标数据（支持租户隔离）
    
    Args:
        project_name: 项目名称
        task_name: 任务名称
        run_name: 运行名称（可选）
        tenant_id: 租户ID（可选，如果不提供则从上下文获取）
    """
    runs = await get_training_runs(project_name, task_name, tenant_id)
    
    if run_name:
        # 查找特定运行
        target_run = None
        for run in runs:
            if run.get("name") == run_name:
                target_run = run
                break
        
        if not target_run:
            logger.warning(f"未找到运行: {run_name}")
            return {}
        
        return await mlflow_db_client.get_run_summary(target_run["run_uuid"])
    else:
        # 返回所有运行的指标
        results = {}
        for run in runs:
            run_uuid = run["run_uuid"]
            run_summary = await mlflow_db_client.get_run_summary(run_uuid)
            results[run.get("name", run_uuid)] = run_summary
        
        return results
