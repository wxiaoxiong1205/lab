"""
训练指标服务
集成 MLflow 数据库查询功能到训练任务管理中
"""

from typing import List, Dict, Any, Optional
from app.utils.mlflow_db_client import mlflow_db_client, get_training_runs, get_training_metrics
from app.models.training_task_manager import TrainingTask
from app.models.models import Project
from app.database.base import SessionLocal
from app.core.config import settings
from app.core.logging import logger


class TrainingMetricsService:
    """训练指标服务类"""
    
    @staticmethod
    async def get_task_metrics(task_id: int) -> Dict[str, Any]:
        """获取训练任务的 MLflow 指标数据
        
        Args:
            task_id: 训练任务ID
            
        Returns:
            Dict[str, Any]: 包含指标数据的字典
        """
        try:
            # 获取训练任务和项目信息
            with SessionLocal() as db:
                training_task = db.query(TrainingTask).filter(TrainingTask.id == task_id).first()
                if not training_task:
                    logger.warning(f"训练任务不存在: {task_id}")
                    return {}
                
                project = db.query(Project).filter(Project.id == training_task.project_id).first()
                if not project:
                    logger.warning(f"项目不存在: {training_task.project_id}")
                    return {}
                
                project_name = project.name
                task_name = training_task.name
                version = getattr(training_task, 'version', 'v1')
            
            # 构建 MLflow 运行名称
            run_name = settings.get_mlflow_run_name(task_name, version, task_id)
            
            # 获取 MLflow 指标数据（支持租户隔离）
            from app.utils.app_runtime_context import get_tenant_id
            tenant_id = get_tenant_id() or training_task.tenant_id
            metrics_data = await get_training_metrics(project_name, task_name, run_name, tenant_id)
            
            return {
                "task_id": task_id,
                "project_name": project_name,
                "task_name": task_name,
                "run_name": run_name,
                "metrics_data": metrics_data
            }
            
        except Exception as e:
            logger.error(f"获取训练任务指标失败 (task_id: {task_id}): {str(e)}")
            return {}
    
    @staticmethod
    async def get_project_metrics(project_id: int) -> Dict[str, Any]:
        """获取项目下所有训练任务的指标概览
        
        Args:
            project_id: 项目ID
            
        Returns:
            Dict[str, Any]: 项目指标概览
        """
        try:
            with SessionLocal() as db:
                project = db.query(Project).filter(Project.id == project_id).first()
                if not project:
                    logger.warning(f"项目不存在: {project_id}")
                    return {}
                
                # 获取项目下的所有训练任务
                training_tasks = db.query(TrainingTask).filter(TrainingTask.project_id == project_id).all()
                
                project_name = project.name
            
            # 获取项目相关的实验（支持租户隔离）
            from app.utils.mlflow_db_client import get_training_experiments
            from app.utils.app_runtime_context import get_tenant_id
            tenant_id = get_tenant_id()
            experiments = await get_training_experiments(project_name=project_name, tenant_id=tenant_id)
            
            project_metrics = {
                "project_id": project_id,
                "project_name": project_name,
                "total_tasks": len(training_tasks),
                "total_experiments": len(experiments),
                "experiments": [],
                "tasks_summary": []
            }
            
            # 获取每个实验的详细信息
            for exp in experiments:
                exp_runs = await mlflow_db_client.get_runs_by_experiment(exp["experiment_id"])
                project_metrics["experiments"].append({
                    "experiment_name": exp["name"],
                    "experiment_id": exp["experiment_id"],
                    "total_runs": len(exp_runs),
                    "runs": [
                        {
                            "run_name": run.get("name", ""),
                            "status": run["status"],
                            "start_time": run["start_time"],
                            "end_time": run["end_time"]
                        }
                        for run in exp_runs
                    ]
                })
            
            # 获取任务摘要（包含租户ID）
            for task in training_tasks:
                task_summary = {
                    "task_id": task.id,
                    "task_name": task.name,
                    "status": task.status,
                    "mlflow_experiment": settings.get_mlflow_experiment_name(project_name, task.name, tenant_id or task.tenant_id)
                }
                project_metrics["tasks_summary"].append(task_summary)
            
            return project_metrics
            
        except Exception as e:
            logger.error(f"获取项目指标失败 (project_id: {project_id}): {str(e)}")
            return {}
    
    @staticmethod
    async def get_latest_metrics(task_id: int, metric_keys: List[str] = None) -> Dict[str, float]:
        """获取训练任务的最新指标值
        
        Args:
            task_id: 训练任务ID
            metric_keys: 指标键列表，如果为None则返回所有指标
            
        Returns:
            Dict[str, float]: 最新指标值字典
        """
        try:
            metrics_data = await TrainingMetricsService.get_task_metrics(task_id)
            
            if not metrics_data or "metrics_data" not in metrics_data:
                return {}
            
            # 提取最新指标值
            latest_metrics = {}
            run_data = list(metrics_data["metrics_data"].values())
            
            if run_data:
                metrics = run_data[0].get("metrics", [])
                
                # 找到每个指标的最新值
                metric_latest = {}
                for metric in metrics:
                    key = metric["key"]
                    if metric_keys is None or key in metric_keys:
                        if key not in metric_latest or metric["step"] > metric_latest[key]["step"]:
                            metric_latest[key] = metric
                
                # 转换为简单的键值对
                latest_metrics = {key: data["value"] for key, data in metric_latest.items()}
            
            return latest_metrics
            
        except Exception as e:
            logger.error(f"获取最新指标失败 (task_id: {task_id}): {str(e)}")
            return {}
    
    @staticmethod
    async def get_training_progress(task_id: int) -> Dict[str, Any]:
        """获取训练进度信息
        
        Args:
            task_id: 训练任务ID
            
        Returns:
            Dict[str, Any]: 训练进度信息
        """
        try:
            # 获取常见的进度指标
            progress_metrics = ["train_loss", "eval_loss", "accuracy", "learning_rate", "epoch"]
            latest_metrics = await TrainingMetricsService.get_latest_metrics(task_id, progress_metrics)
            
            # 获取任务基本信息
            with SessionLocal() as db:
                training_task = db.query(TrainingTask).filter(TrainingTask.id == task_id).first()
                if not training_task:
                    return {}
            
            progress_info = {
                "task_id": task_id,
                "task_status": training_task.status,
                "progress_percentage": training_task.progress,
                "latest_metrics": latest_metrics,
                "started_at": training_task.started_at,
                "estimated_duration": training_task.estimated_duration
            }
            
            # 计算训练进度百分比（基于epoch或step）
            if "epoch" in latest_metrics and hasattr(training_task, 'total_epochs'):
                total_epochs = getattr(training_task, 'total_epochs', 1)
                if total_epochs > 0:
                    epoch_progress = (latest_metrics["epoch"] / total_epochs) * 100
                    progress_info["epoch_progress"] = min(epoch_progress, 100)
            
            return progress_info
            
        except Exception as e:
            logger.error(f"获取训练进度失败 (task_id: {task_id}): {str(e)}")
            return {}


# 便捷函数
async def get_task_training_metrics(task_id: int) -> Dict[str, Any]:
    """便捷函数：获取训练任务指标"""
    return await TrainingMetricsService.get_task_metrics(task_id)


async def get_project_training_overview(project_id: int) -> Dict[str, Any]:
    """便捷函数：获取项目训练概览"""
    return await TrainingMetricsService.get_project_metrics(project_id)


async def get_task_progress(task_id: int) -> Dict[str, Any]:
    """便捷函数：获取任务进度"""
    return await TrainingMetricsService.get_training_progress(task_id)
