"""
结果后处理模块
解析推理结果，验证格式，并存储到文件
"""

import json
import os
from datetime import datetime
from typing import List, Dict, Any
from loguru import logger


class ResultProcessor:
    """结果后处理器"""
    
    def __init__(self):
        """
        初始化结果处理器
        """
        # 用于统计各个指标的平均分
        # 格式: {metric_name: {"total_score": 0.0, "valid_count": 0, "total_count": 0}}
        self.metrics_stats = {}
    
    def _parse_llm_response(self, text: str, metric_name: str) -> Dict[str, Any]:
        """
        解析 LLM 返回的 JSON 响应，提取 score 和 reason
        """
        if not text or not text.strip():
            return {"score": None, "reason": "模型响应为空"}

        # 1. 清理 markdown 标签
        clean_text = text.strip()
        if clean_text.startswith("```"):
            # 去掉开头
            clean_text = clean_text.split("\n", 1)[-1] if "\n" in clean_text else clean_text[3:]
            # 去掉结尾
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
        clean_text = clean_text.strip()

        try:
            # 2. 尝试解析为 JSON
            data = json.loads(clean_text)
            
            # 3. 提取分值和理由
            # LLM 返回的格式可能是 {"指标名": {"score": 5, "reason": "..."}}
            # 也可能是 {"score": 5, "reason": "..."}
            result_data = data
            if metric_name in data:
                result_data = data[metric_name]
            
            score = result_data.get("score")
            reason = result_data.get("reason", "")
            
            return {
                "score": score,
                "reason": reason
            }
        except Exception as e:
            logger.warning(f"解析 LLM 响应失败: {str(e)}, 原始文本: {text}...")
            return {"score": None, "reason": None}

    def build_metric_results(
        self,
        original_data: List[Dict[str, Any]],
        prompt_meta: List[Dict[str, Any]],
        inference_results: Dict[str, List]
    ) -> List[Dict[str, Any]]:
        """
        将多指标评估的推理结果还原为按原始数据聚合的结果（方案A）
        
        每条原始数据对应一行输出，包含一个 evaluations 列表，列表中每个元素对应一个 metric 的评估结果。
        """
        success_results = inference_results.get("success", [])
        failed_results = inference_results.get("failed", [])
        
        # 构建扁平索引到结果的映射
        result_map: Dict[int, Dict[str, Any]] = {}
        for item in failed_results:
            result_map[item["index"]] = {"result": "", "error": item["error"]}
        for item in success_results:
            result_map[item["index"]] = {"result": item["result"], "error": None}
        
        # 初始化按原始数据索引的结果结构
        processed_results: List[Dict[str, Any]] = []
        for data in original_data:
            processed_results.append({
                **data,
                "evaluations": []  # 每条数据的所有指标评估结果
            })
        
        total_prompts = len(prompt_meta)
        
        for flat_index, meta in enumerate(prompt_meta):
            sample_index: int = meta["sample_index"]
            metric_cfg: Dict[str, Any] = meta["metric"]
            metric_name = metric_cfg.get("name")
            
            # 检查 prompt_meta 中是否有数据错误标记（字段值为 None）
            has_data_error = meta.get("has_data_error", False)
            data_error_message = meta.get("error_message")
            
            # 检查原始数据是否有错误（原始推理失败）
            original_data_item = original_data[sample_index]
            original_has_error = original_data_item.get("error", False) is True
            original_error_message = original_data_item.get("error_message", "")
            
            result_info = result_map.get(flat_index)
            if result_info is None:
                # 理论上不应该发生
                error_msg = "推理结果缺失"
                logger.error(f"第 {flat_index + 1} 条prompt（metric={metric_name}）没有对应的推理结果")
                result_text = ""
                inference_error = True
            else:
                result_text = result_info["result"]
                error_msg = result_info["error"]
                inference_error = error_msg is not None
            
            # 如果字段值为 None（数据错误），或者原始数据有错误，或者评估推理失败，都不应该进行打分
            if has_data_error:
                # 字段内容缺少，跳过计算
                is_error = True
                score = None
                parsed_result = {}
                error_msg = data_error_message or "字段内容缺少，跳过计算"
                logger.debug(f"第 {flat_index + 1} 条prompt（metric={metric_name}）字段内容缺少，跳过打分: {error_msg}")
            elif original_has_error:
                # 原始推理失败，即使评估推理成功也不应该打分
                is_error = True
                score = None
                parsed_result = {}
                error_msg = original_error_message or "原始推理失败，跳过评估"
                logger.debug(f"第 {flat_index + 1} 条prompt（metric={metric_name}）原始推理失败，跳过打分: {error_msg}")
            elif inference_error:
                # 评估推理失败
                is_error = True
                score = None
                parsed_result = {}
                logger.debug(f"第 {flat_index + 1} 条prompt（metric={metric_name}）评估推理失败，跳过打分: {error_msg}")
            else:
                # 只有原始推理成功且评估推理成功时才解析响应和提取分数
                is_error = False
                parsed_result = self._parse_llm_response(result_text, metric_name)
                score = parsed_result.get("score")
            
            # 更新统计信息
            if metric_name not in self.metrics_stats:
                self.metrics_stats[metric_name] = {"total_score": 0.0, "valid_count": 0, "total_count": 0}
            
            self.metrics_stats[metric_name]["total_count"] += 1
            
            # 只有原始推理成功、评估推理成功、没有数据错误且分数有效时才参与统计
            if not has_data_error and not original_has_error and not inference_error and score is not None:
                try:
                    # 确保 score 是数字
                    numeric_score = float(score)
                    self.metrics_stats[metric_name]["total_score"] += numeric_score
                    self.metrics_stats[metric_name]["valid_count"] += 1
                except (ValueError, TypeError):
                    logger.warning(f"指标 {metric_name} 的分数无效: {score}")

            evaluation: Dict[str, Any] = {
                "metric_name": metric_name,
                "description": metric_cfg.get("description"),
                "score_min": metric_cfg.get("score_min"),
                "score_max": metric_cfg.get("score_max"),
                "score": score,  # 原始推理失败或评估推理失败时为 None
                "reason": parsed_result.get("reason") if not is_error else None,  # 失败时 reason 为 None
                "error": is_error,
                # 始终保留原始模型输出字符串，解析失败时方便分析原因
                "raw_response": result_text,
            }
            if is_error and error_msg:
                evaluation["error_message"] = error_msg
            
            # 将该metric的评估结果挂到对应的原始数据上
            processed_results[sample_index]["evaluations"].append(evaluation)
        
        logger.info(
            f"多指标评估结果构建完成: 原始数据条数={len(original_data)}, "
            f"总prompt数={total_prompts}, 成功={len(success_results)}, 失败={len(failed_results)}"
        )
        return processed_results
    
    def reset_stats(self) -> None:
        """
        清空统计数据，用于处理下一个文件
        """
        self.metrics_stats = {}
        logger.info("已重置 ResultProcessor 统计数据")

    def save_statistics(
        self, 
        statistics_path: str, 
        input_file: str = "",
        inference_result_dataset_id = None
    ) -> None:
        """
        计算并保存当前文件的统计结果到jsonl文件（追加模式）
        
        Args:
            statistics_path: 统计文件保存路径
            input_file: 当前处理的输入文件名
            inference_result_dataset_id: 推理结果数据集ID列表（可选）
        """
        if not statistics_path:
            return

        # 计算平均分
        metrics_report = []
        for metric_name, stats in self.metrics_stats.items():
            valid_count = stats["valid_count"]
            total_count = stats["total_count"]
            total_score = stats["total_score"]
            average = total_score / valid_count if valid_count > 0 else 0.0
            
            metrics_report.append({
                "metric_name": metric_name,
                "average_score": round(average, 4),
                "total_count": total_count,
                "valid_count": valid_count
            })
        
        if not metrics_report:
            logger.warning(f"文件 {input_file} 没有生成任何有效的指标统计数据")
            return

        # 构建最终的一行记录
        record = {
            "file_name": os.path.basename(input_file) if input_file else "unknown",
            "metrics": metrics_report,
            "timestamp": datetime.now().isoformat()
        }
        
        # 如果提供了 inference_result_dataset_id，添加到记录中
        if inference_result_dataset_id is not None:
            record["inference_result_dataset_id"] = inference_result_dataset_id
        
        try:
            # 确保目录存在
            output_dir = os.path.dirname(statistics_path)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir, exist_ok=True)
            
            # 使用追加模式写入 JSONL
            with open(statistics_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(record, ensure_ascii=False) + '\n')
                
            logger.info(f"统计报告已追加到: {statistics_path} (来源: {record['file_name']})")
        except Exception as e:
            logger.error(f"保存统计报告失败: {str(e)}")
            raise

    def save_results(
        self,
        results: List[Dict],
        output_path: str,
        create_dir: bool = True,
        append: bool = False
    ) -> None:
        """
        保存结果到jsonl文件
        
        Args:
            results: 结果列表
            output_path: 输出文件路径
            create_dir: 如果目录不存在是否创建
            append: 是否追加模式（True=追加，False=覆盖）
        """
        # 确保输出目录存在
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            if create_dir:
                os.makedirs(output_dir, exist_ok=True)
                logger.info(f"创建输出目录: {output_dir}")
            else:
                raise FileNotFoundError(f"输出目录不存在: {output_dir}")
        
        # 写入jsonl文件
        mode = 'a' if append else 'w'
        if append:
            logger.debug(f"追加保存 {len(results)} 条结果到文件: {output_path}")
        else:
            logger.info(f"开始保存结果到文件: {output_path}")
        
        saved_count = 0
        error_count = 0
        
        try:
            with open(output_path, mode, encoding='utf-8') as f:
                for result in results:
                    try:
                        json_line = json.dumps(result, ensure_ascii=False)
                        f.write(json_line + '\n')
                        saved_count += 1
                    except Exception as e:
                        error_count += 1
                        logger.warning(f"保存结果时出错: {str(e)}, 数据: {result}")
            
            if not append:
                logger.info(f"结果保存完成: 成功 {saved_count} 条，失败 {error_count} 条")
                logger.info(f"输出文件: {output_path}")
            else:
                logger.debug(f"追加保存完成: 成功 {saved_count} 条，失败 {error_count} 条")
            
        except IOError as e:
            logger.error(f"保存文件时发生IO错误: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"保存结果时发生未知错误: {str(e)}")
            raise
