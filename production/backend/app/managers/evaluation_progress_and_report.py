#!/usr/bin/env python3
"""
评估报告生成器

负责生成评估任务的报告（基础指标评估和裁判员评估）。
"""

import json
import os
from collections import defaultdict
from typing import Dict, List, Any

from sqlalchemy import select

from app.common.status import TaskStatus
from app.core.logging import logger
from app.models.evaluation_task_manager import EvaluationTask, EvaluationTaskDatasetModelRelation
from app.schemas.evaluation_task import (
    EvaluationMethod, CalculationMethod, AggregativeMetric, EvaluationReportCreate, ModelMetricSummary
)
from app.services.evaluation_task.interface import EvaluationTaskService
from app.services.storage.interface import StorageService
from app.utils.storage_enum import StoragePath


class EvaluationReportGenerator:
    """评估报告生成器"""
    
    def __init__(
        self,
        tenant_id: str,
        task_id: int,
        task: EvaluationTask,
        evaluation_task_service: EvaluationTaskService,
        storage_service: StorageService
    ):
        self.tenant_id = tenant_id
        self.id = task_id
        self.db_task = task
        self.evaluation_task_service = evaluation_task_service
        self.storage_service = storage_service
    
    async def update_report(self) -> None:
        """更新评估报告"""
        if self.db_task.status != TaskStatus.COMPLETED.value:
            return

        # 判断数据库的评估报告是否存在，存在则直接跳过
        existing_report = await self.evaluation_task_service.get_evaluation_report(
            self.db_task.project_id,
            self.db_task.id
        )
        
        if existing_report and existing_report.model_reports:
            logger.debug(f"评估任务 {self.db_task.id} 的报告已存在（共 {len(existing_report.model_reports)} 个模型），跳过生成")
            return

        # 根据评估方法处理不同类型的报告
        evaluation_method = self.db_task.evaluation_method
        
        if evaluation_method in [EvaluationMethod.BASIC_METRIC.value, EvaluationMethod.ALL.value]:
            await self._handle_basic_metrics_report()
        
        if evaluation_method in [EvaluationMethod.REFEREE.value, EvaluationMethod.ALL.value]:
            await self._handle_referee_report()
    
    async def _handle_basic_metrics_report(self) -> None:
        """处理基础指标评估报告"""
        try:
            # 1. 获取任务关联关系
            relations = await self.evaluation_task_service.relation_mapper.query(
                select(EvaluationTaskDatasetModelRelation).filter(
                    EvaluationTaskDatasetModelRelation.evaluation_task_id == self.id
                )
            )
            
            if not relations:
                logger.warning(f"评估任务 {self.id} 没有关联的模型和数据集，跳过报告生成")
                return
            
            # 2. 获取 JuiceFS 客户端
            jfs = await self.storage_service.JUICEFS_CLIENT(self.tenant_id)
            if not jfs:
                logger.warning(f"租户 {self.tenant_id} 的 JuiceFS 客户端不可用，跳过报告生成")
                return
            
            # 3. 按模型分组，收集每个模型的所有数据集指标（以model_name为key）
            model_data_map = self._collect_model_metrics(relations, jfs)
            
            # 4. 聚合每个模型的指标数据并保存到数据库
            for model_name, model_info in model_data_map.items():
                await self._save_model_report(model_info["model_id"], model_info)
            
        except Exception as e:
            logger.error(f"处理基础指标评估报告失败 [任务: {self.id}, 租户: {self.tenant_id}]: {e}")
    
    def _collect_model_metrics(self, relations, jfs) -> Dict[str, Dict[str, Any]]:
        """收集每个模型的指标数据（以model_name为key）"""
        model_data_map: Dict[str, Dict[str, Any]] = {}
        
        for relation in relations:
            model_id_key = relation.evaluated_model_id
            model_name = relation.evaluated_model_name or f"模型_{model_id_key}"
            dataset_id = relation.inference_result_dataset_id
            
            # 初始化模型数据（以model_name为key）
            if model_name not in model_data_map:
                model_data_map[model_name] = {
                    "model_id": model_id_key,
                    "model_name": model_name,
                    "model_source": getattr(relation, "evaluated_model_source", None) or "base_model",
                    "datasets": []
                }
            
            # 获取 summary 文件
            summary_data = self._load_summary_file(dataset_id, jfs)
            if summary_data:
                model_data_map[model_name]["datasets"].append({
                    "dataset_id": dataset_id,
                    "summary_data": summary_data
                })
        
        return model_data_map
    
    def _load_summary_file(self, dataset_id: int, jfs) -> Dict[str, Any]:
        """加载指定数据集的 summary 文件"""
        if not self.db_task.result_file_path:
            return None
        
        # 查找包含该 dataset_id 的文件路径
        for file_path in self.db_task.result_file_path:
            if f"_source_{dataset_id}_" in file_path:
                # 将 .jsonl 替换为 _summary.json
                summary_file_path = file_path.replace(".jsonl", "_summary.json")
                
                # 验证文件是否存在并读取
                if jfs.exists(summary_file_path):
                    try:
                        with jfs.open(summary_file_path, 'r', encoding='utf-8') as f:
                            return json.load(f)
                    except Exception as e:
                        logger.error(f"读取评估结果汇总文件失败 {summary_file_path}: {e}")
        
        logger.warning(f"未找到评估结果汇总文件: dataset_id={dataset_id}, task_id={self.id}")
        return None
    
    async def _save_model_report(self, model_id: int, model_info: Dict[str, Any]) -> None:
        """保存模型的评估报告"""
        datasets = model_info["datasets"]
        if not datasets:
            return
        
        # 收集所有数据集的指标值
        metrics_collection = self._aggregate_metrics(datasets)
        
        # 计算聚合指标（average, max, min）
        aggregative_metrics = self._calculate_aggregative_metrics(metrics_collection)
        
        if aggregative_metrics:
            # 创建或更新评估报告
            report_create = EvaluationReportCreate(
                evaluation_task_id=self.id,
                evaluated_model_id=model_id,
                evaluated_model_name=model_info["model_name"],
                evaluated_model_source=model_info.get("model_source"),
                evaluation_method=EvaluationMethod.BASIC_METRIC,
                aggregative_metrics=aggregative_metrics,
                comparison_data=None  # 对比评估暂未实现
            )
            
            await self.evaluation_task_service.create_or_update_evaluation_report(report_create)
            logger.info(
                f"已更新评估任务 {self.id} 的模型 {model_id} ({model_info['model_name']}) 的基础指标报告"
            )
    
    def _aggregate_metrics(self, datasets: List[Dict[str, Any]]) -> Dict[str, Dict[str, List[Any]]]:
        """聚合数据集的指标值"""
        metrics_collection: Dict[str, Dict[str, List[Any]]] = defaultdict(
            lambda: {"values": [], "errors": []}
        )
        
        for dataset_info in datasets:
            summary_data = dataset_info["summary_data"]
            metrics_summary = summary_data.get("metrics_summary", {})
            
            for metric_name, metric_data in metrics_summary.items():
                if isinstance(metric_data, dict):
                    average = metric_data.get("average")
                    error = metric_data.get("error")
                    
                    if error is not None:
                        metrics_collection[metric_name]["errors"].append(error)
                    elif average is not None:
                        try:
                            metrics_collection[metric_name]["values"].append(float(average))
                        except (ValueError, TypeError):
                            pass
        
        return metrics_collection
    
    def _calculate_aggregative_metrics(
        self, 
        metrics_collection: Dict[str, Dict[str, List[Any]]]
    ) -> List[AggregativeMetric]:
        """计算聚合指标（average, max, min）"""
        metrics_by_method: Dict[str, Dict[str, float]] = defaultdict(dict)
        
        for metric_name, metric_info in metrics_collection.items():
            values = metric_info["values"]
            if not values:
                continue
            
            # 计算 average, max, min
            metrics_by_method[CalculationMethod.AVERAGE.value][metric_name] = sum(values) / len(values)
            metrics_by_method[CalculationMethod.MAX.value][metric_name] = max(values)
            metrics_by_method[CalculationMethod.MIN.value][metric_name] = min(values)
        
        # 获取指标的 score_min 和 score_max（基础指标评估固定值）
        metric_min_scores = {}
        metric_max_scores = {}
        for metric_name in metrics_by_method[CalculationMethod.AVERAGE.value].keys():
            # 基础指标评估：score_min=0, score_max=1.0
            metric_min_scores[metric_name] = 0
            metric_max_scores[metric_name] = 1.0
        
        # 将 Dict[str, float] 转换为 Dict[str, ModelMetricSummary]
        def extend_metric_summary(metric_summary: Dict[str, float]) -> Dict[str, ModelMetricSummary]:
            """将 Dict[str, float] 格式转换为 Dict[str, ModelMetricSummary] 格式"""
            extended_summary = {}
            for metric_name, score in metric_summary.items():
                score_min = metric_min_scores.get(metric_name, 0)
                score_max = metric_max_scores.get(metric_name, 1.0)
                
                # 计算百分比分数
                if score_max and score_max > 0:
                    percentage_score = round((score / score_max) * 100, 2)
                else:
                    percentage_score = 0.0
                
                extended_summary[metric_name] = ModelMetricSummary(
                    metric_name=metric_name,
                    score=score,
                    score_min=int(score_min),
                    score_max=int(score_max),
                    percentage_score=percentage_score
                )
            return extended_summary
        
        # 构建 AggregativeMetric 列表
        return [
            AggregativeMetric(
                calculation_method=CalculationMethod(method),
                metric_summary=extend_metric_summary(metric_summary)
            )
            for method, metric_summary in metrics_by_method.items()
            if metric_summary
        ]
    
    async def _handle_referee_report(self) -> None:
        """处理裁判员评估报告"""
        try:
            # 1. 获取任务关联关系
            relations = await self.evaluation_task_service.relation_mapper.query(
                select(EvaluationTaskDatasetModelRelation).filter(
                    EvaluationTaskDatasetModelRelation.evaluation_task_id == self.id
                )
            )
            
            if not relations:
                logger.warning(f"评估任务 {self.id} 没有关联的模型和数据集，跳过报告生成")
                return
            
            # 2. 获取 JuiceFS 客户端
            jfs = await self.storage_service.JUICEFS_CLIENT(self.tenant_id)
            if not jfs:
                logger.warning(f"租户 {self.tenant_id} 的 JuiceFS 客户端不可用，跳过报告生成")
                return
            
            # 3. 读取统计文件
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{self.db_task.project_id}"
            statistics_file_path = StoragePath.EVALUATION_STATISTICS_RES.format_storage_path(
                namespace=namespace,
                task_id=self.id
            )
            
            if not jfs.exists(statistics_file_path):
                logger.warning(f"统计文件不存在: {statistics_file_path}")
                return
            
            # 4. 解析统计文件并按模型分组（以model_name为key）
            model_data_map = self._parse_referee_statistics_file(jfs, statistics_file_path, relations)
            
            # 5. 保存每个模型的报告
            for model_name, model_info in model_data_map.items():
                await self._save_referee_model_report(model_info["model_id"], model_info)
            
        except Exception as e:
            logger.error(f"处理裁判员评估报告失败 [任务: {self.id}, 租户: {self.tenant_id}]: {e}")
    
    def _parse_referee_statistics_file(
        self, 
        jfs, 
        statistics_file_path: str, 
        relations: List[EvaluationTaskDatasetModelRelation]
    ) -> Dict[str, Dict[str, Any]]:
        """解析裁判员评估统计文件
        
        统计文件格式为 JSONL，每行是一个 JSON 对象，包含：
        - file_name: 文件名（可能包含数据集信息）
        - inference_result_dataset_id: 推理结果数据集ID（可以是单个ID或ID列表，优先使用此字段匹配）
        - metrics: 指标数组，每个指标包含 metric_name, average_score, total_count, valid_count
        - timestamp: 时间戳
        
        匹配逻辑（按优先级）：
        1. 优先使用统计文件中的 inference_result_dataset_id 字段
        2. 如果不存在，尝试从 file_name 中提取 dataset_id（匹配 _source_{dataset_id}_ 模式）
        3. 如果仍无法匹配，使用第一个关联关系
        
        Args:
            jfs: JuiceFS客户端
            statistics_file_path: 统计文件路径
            relations: 任务关联关系列表
            
        Returns:
            Dict[str, Dict[str, Any]]: 按模型名称分组的指标数据（key为model_name）
        """
        model_data_map: Dict[str, Dict[str, Any]] = {}
        
        # 构建数据集ID到模型ID、名称、来源的映射
        dataset_to_model: Dict[int, int] = {}
        dataset_to_model_name: Dict[int, str] = {}
        dataset_to_model_source: Dict[int, str] = {}
        for relation in relations:
            dataset_id = relation.inference_result_dataset_id
            model_id = relation.evaluated_model_id
            model_name = relation.evaluated_model_name or f"模型_{model_id}"
            dataset_to_model[dataset_id] = model_id
            dataset_to_model_name[dataset_id] = model_name
            dataset_to_model_source[dataset_id] = getattr(relation, "evaluated_model_source", None) or "base_model"
        
        try:
            with jfs.open(statistics_file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    
                    try:
                        # 解析 JSON 行
                        stats_data = json.loads(line)
                        
                        # 优先从统计文件中读取 inference_result_dataset_id
                        dataset_id = None
                        
                        # 1. 尝试从统计文件中直接读取 inference_result_dataset_id
                        if "inference_result_dataset_id" in stats_data:
                            dataset_id_value = stats_data.get("inference_result_dataset_id")
                            # 如果是列表，取第一个；如果是单个值，直接使用
                            if isinstance(dataset_id_value, list):
                                if dataset_id_value:
                                    dataset_id = dataset_id_value[0]
                            elif dataset_id_value is not None:
                                dataset_id = dataset_id_value
                        
                        # 2. 如果统计文件中没有，尝试从 file_name 中提取数据集ID
                        if dataset_id is None:
                            file_name = stats_data.get("file_name", "")
                            # file_name 格式可能包含数据集信息，例如：inference_result_xxx_source_{dataset_id}_xxx.jsonl
                            for d_id in dataset_to_model.keys():
                                if f"_source_{d_id}_" in file_name or f"source_{d_id}" in file_name:
                                    dataset_id = d_id
                                    break
                        
                        # 3. 如果仍然无法匹配，尝试从关联关系中匹配（使用第一个匹配的）
                        if dataset_id is None and relations:
                            # 可以根据其他逻辑匹配，这里先使用第一个关联关系
                            dataset_id = relations[0].inference_result_dataset_id
                        
                        if dataset_id is None or dataset_id not in dataset_to_model:
                            file_name = stats_data.get("file_name", "")
                            logger.warning(f"无法匹配数据集ID: file_name={file_name}, inference_result_dataset_id={stats_data.get('inference_result_dataset_id')}")
                            continue
                        
                        model_id = dataset_to_model[dataset_id]
                        model_name = dataset_to_model_name[dataset_id]
                        model_source = dataset_to_model_source.get(dataset_id, "base_model")
                        
                        # 初始化模型数据（以model_name为key）
                        if model_name not in model_data_map:
                            model_data_map[model_name] = {
                                "model_id": model_id,
                                "model_name": model_name,
                                "model_source": model_source,
                                "metrics": []
                            }
                        
                        # 添加指标数据
                        metrics = stats_data.get("metrics", [])
                        if metrics:
                            model_data_map[model_name]["metrics"].extend(metrics)
                        
                    except json.JSONDecodeError as e:
                        logger.warning(f"跳过无效的JSON行: {line[:100]}, 错误: {e}")
                        continue
                    except Exception as e:
                        logger.error(f"解析统计文件行失败: {e}")
                        continue
        
        except Exception as e:
            logger.error(f"读取统计文件失败 {statistics_file_path}: {e}")
            return {}
        
        return model_data_map
    
    async def _save_referee_model_report(self, model_id: int, model_info: Dict[str, Any]) -> None:
        """保存裁判员评估模型的报告
        
        Args:
            model_id: 模型ID
            model_info: 模型信息字典，包含 metrics 列表
        """
        metrics_list = model_info.get("metrics", [])
        if not metrics_list:
            logger.warning(f"模型 {model_id} 没有指标数据，跳过保存")
            return
        
        # 收集所有指标的平均分
        # 格式: {metric_name: [average_score1, average_score2, ...]}
        metrics_collection: Dict[str, List[float]] = defaultdict(list)
        
        for metric_data in metrics_list:
            if isinstance(metric_data, dict):
                metric_name = metric_data.get("metric_name")
                average_score = metric_data.get("average_score")
                
                if metric_name and average_score is not None:
                    try:
                        metrics_collection[metric_name].append(float(average_score))
                    except (ValueError, TypeError):
                        logger.warning(f"跳过无效的指标分数: {metric_data}")
        
        if not metrics_collection:
            logger.warning(f"模型 {model_id} 没有有效的指标数据，跳过保存")
            return
        
        # 获取指标的 score_min 和 score_max（从任务的 evaluation_prompt_config 中获取）
        metric_min_scores = {}
        metric_max_scores = {}
        
        if self.db_task.evaluation_prompt_config and isinstance(self.db_task.evaluation_prompt_config, dict):
            metrics_config = self.db_task.evaluation_prompt_config.get("metrics", [])
            for metric_config in metrics_config:
                if isinstance(metric_config, dict):
                    metric_name = metric_config.get("name") or metric_config.get("metric_name")
                    score_min = metric_config.get("score_min")
                    score_max = metric_config.get("score_max")
                    if metric_name:
                        if score_min is not None:
                            metric_min_scores[metric_name] = score_min
                        if score_max is not None:
                            metric_max_scores[metric_name] = score_max
        
        # 对于没有配置的指标，使用默认值
        for metric_name in metrics_collection.keys():
            if metric_name not in metric_min_scores:
                metric_min_scores[metric_name] = 0
            if metric_name not in metric_max_scores:
                metric_max_scores[metric_name] = 10  # 默认最大值
        
        # 计算聚合指标（average, max, min）
        metrics_by_method: Dict[str, Dict[str, float]] = defaultdict(dict)
        
        for metric_name, scores in metrics_collection.items():
            if not scores:
                continue
            
            # 计算 average（所有数据集的平均分的平均值）
            avg_value = sum(scores) / len(scores)
            metrics_by_method[CalculationMethod.AVERAGE.value][metric_name] = avg_value
            
            # # 计算 max
            # max_value = max(scores)
            # metrics_by_method[CalculationMethod.MAX.value][metric_name] = max_value
            #
            # # 计算 min
            # min_value = min(scores)
            # metrics_by_method[CalculationMethod.MIN.value][metric_name] = min_value
        
        # 将 Dict[str, float] 转换为 Dict[str, ModelMetricSummary]
        def extend_metric_summary(metric_summary: Dict[str, float]) -> Dict[str, ModelMetricSummary]:
            """将 Dict[str, float] 格式转换为 Dict[str, ModelMetricSummary] 格式"""
            extended_summary = {}
            for metric_name, score in metric_summary.items():
                score_min = metric_min_scores.get(metric_name, 0)
                score_max = metric_max_scores.get(metric_name, 10)
                
                # 计算百分比分数
                if score_max and score_max > 0:
                    percentage_score = round((score / score_max) * 100, 2)
                else:
                    percentage_score = 0.0
                
                extended_summary[metric_name] = ModelMetricSummary(
                    metric_name=metric_name,
                    score=score,
                    score_min=int(score_min),
                    score_max=int(score_max),
                    percentage_score=percentage_score
                )
            return extended_summary
        
        # 构建 AggregativeMetric 列表
        aggregative_metrics = [
            AggregativeMetric(
                calculation_method=CalculationMethod(method),
                metric_summary=extend_metric_summary(metric_summary)
            )
            for method, metric_summary in metrics_by_method.items()
            if metric_summary
        ]
        
        if aggregative_metrics:
            # 创建或更新评估报告
            report_create = EvaluationReportCreate(
                evaluation_task_id=self.id,
                evaluated_model_id=model_id,
                evaluated_model_name=model_info["model_name"],
                evaluated_model_source=model_info.get("model_source"),
                evaluation_method=EvaluationMethod.REFEREE,
                aggregative_metrics=aggregative_metrics,
                comparison_data=None
            )
            
            await self.evaluation_task_service.create_or_update_evaluation_report(report_create)
            logger.info(
                f"已更新评估任务 {self.id} 的模型 {model_id} ({model_info['model_name']}) 的裁判员评估报告"
            )
