#!/usr/bin/env python
"""
基础指标评估脚本主入口
支持多种基础指标的批量计算和结果输出
"""
import argparse
import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
from loguru import logger

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.basic_metrics import get_calculator, METRIC_CALCULATORS
from scripts.basic_metrics.output_processor import output_results_to_file
from scripts.inference.data_processor import read_jsonl_batch, count_jsonl_lines


def load_stop_words(stop_words_path: Optional[str]) -> Optional[List[str]]:
    """
    加载停用词列表
    
    Args:
        stop_words_path: 停用词文件路径（每行一个停用词）
    
    Returns:
        List[str]: 停用词列表，如果文件不存在或路径为空则返回None
    """
    if not stop_words_path or not os.path.exists(stop_words_path):
        return None
    
    try:
        stop_words = []
        with open(stop_words_path, 'r', encoding='utf-8') as f:
            for line in f:
                word = line.strip()
                if word:
                    stop_words.append(word)
        logger.info(f"成功加载 {len(stop_words)} 个停用词")
        return stop_words
    except Exception as e:
        logger.warning(f"加载停用词文件失败: {e}，将不使用停用词")
        return None


def write_progress(
    progress_file: Optional[str],
    progress_data: Dict[str, Any]
) -> None:
    """写入进度信息到进度文件"""
    if not progress_file:
        return
    
    try:
        # 确保目录存在
        progress_dir = os.path.dirname(progress_file)
        if progress_dir and not os.path.exists(progress_dir):
            os.makedirs(progress_dir, exist_ok=True)
        
        # 追加写入进度信息（JSONL格式）
        with open(progress_file, 'a', encoding='utf-8') as f:
            json_line = json.dumps(progress_data, ensure_ascii=False)
            f.write(json_line + '\n')
    except Exception as e:
        logger.warning(f"写入进度文件失败: {str(e)}")


def extract_prediction_and_reference(data: Dict[str, Any]) -> tuple:
    """
    从数据中提取预测结果 == 模型推理后的结果 和 参考答案 == 标准答案Ground Truth
    
    Args:
        data: 数据字典，应包含 prediction 和 reference 字段
    
    Returns:
        tuple: (prediction, reference) - 如果字段值为 None，则返回 None
    """
    # 支持多种字段名
    # 这里添加了 model_response、response主要是为了贴合推理结果数据集文件的表头
    # 注意：如果字段值为 None，则返回 None（不转换为空字符串）
    # 按优先级查找字段，如果找到则使用（包括空字符串），如果所有字段都为 None 或不存在，返回 None
    prediction = None
    for field_name in ['prediction', 'Model Response', 'generated_text', 'model_response']:
        if field_name in data:
            value = data[field_name]
            if value is not None:
                # 如果值不为 None，转换为字符串并去除首尾空格
                prediction = str(value).strip()
                # 如果去除空格后为空，返回 None
                if prediction == "":
                    prediction = None
                break
            # 如果值为 None，继续查找下一个字段
    
    reference = None
    for field_name in ['response', 'standard_response', 'ground_truth']:
        if field_name in data:
            value = data[field_name]
            if value is not None:
                # 如果值不为 None，转换为字符串并去除首尾空格
                reference = str(value).strip()
                # 如果去除空格后为空，返回 None
                if reference == "":
                    reference = None
                break
            # 如果值为 None，继续查找下一个字段

    return prediction, reference


def calculate_metrics(
    input_file: Union[str, List[str]],
    metrics: List[str],
    stop_words: Optional[List[str]] = None,
    output_file: Optional[Union[str, List[str]]] = None,
    progress_file: Optional[str] = None
) -> Dict[str, Any]:
    """
    计算指标
    
    Args:
        input_file: 输入JSONL文件路径（可以是单个文件或文件列表）
        metrics: 要计算的指标列表（指标代码）
        stop_words: 停用词列表
        output_file: 输出文件路径（可以是单个文件或文件列表，数量需与输入文件一致，可选）
        progress_file: 进度文件路径（可选，用于记录处理进度）
    
    Returns:
        Dict[str, Any]: 计算结果统计
    """
    # 支持单个文件路径或文件路径列表
    if isinstance(input_file, str):
        input_files = [input_file]
    else:
        input_files = input_file
    
    if isinstance(output_file, str):
        output_files = [output_file]
    elif output_file is None:
        output_files = []
    else:
        output_files = output_file
    
    # 验证输入和输出文件数量匹配
    if output_files and len(input_files) != len(output_files):
        raise ValueError(
            f"输入文件数量 ({len(input_files)}) 与输出文件数量 ({len(output_files)}) 不一致"
        )
    # 验证指标代码
    invalid_metrics = [m for m in metrics if m not in METRIC_CALCULATORS]
    if invalid_metrics:
        raise ValueError(f"不支持的指标代码: {invalid_metrics}")
    
    # 初始化计算器
    calculators = {}
    for metric_code in metrics:
        calculators[metric_code] = get_calculator(metric_code, stop_words=stop_words)
        logger.info(f"初始化指标计算器: {metric_code}")
    
    # 统计总行数和总批次数（用于进度显示）
    batch_size = 5000  # 与 read_jsonl_batch 的默认批次大小一致
    total_lines, total_batches = count_jsonl_lines(input_files, batch_size=batch_size)
    
    # 写入开始进度
    if progress_file:
        write_progress(progress_file, {
            "batch_index": 0,
            "total_batches": total_batches,
            "processed_lines": 0,
            "total_lines": total_lines,
            "status": "started"
        })
    
    # 处理多个文件：每个文件独立计算指标
    all_results = []
    all_total = 0
    all_valid = 0
    all_processed_lines = 0
    all_processed_batches = 0
    
    try:
        for file_idx, input_file_path in enumerate(input_files):
            logger.info(f"\n{'=' * 80}")
            logger.info(f"处理文件 {file_idx + 1}/{len(input_files)}: {input_file_path}")
            logger.info(f"{'=' * 80}")

            # 读取当前文件的数据（分批读取，每批更新进度）
            file_data = []
            file_batch_count = 0

            for batch_idx, batch in enumerate(read_jsonl_batch(input_file_path, batch_size=batch_size, skip_errors=True), 1):
                file_data.extend(batch)
                file_batch_count = batch_idx

                # 更新进度
                all_processed_lines += len(batch)
                all_processed_batches += 1

                if progress_file:
                    progress_data = {
                        "batch_index": all_processed_batches,
                        "total_batches": total_batches,
                        "processed_lines": all_processed_lines,
                        "total_lines": total_lines,
                        "status": "processing"
                    }
                    write_progress(progress_file, progress_data)

            logger.info(f"文件 {file_idx + 1} 共读取 {len(file_data)} 条数据（{file_batch_count} 批）")

            # 提取预测结果和参考答案
            # 为所有数据都添加到列表中（包括 None 值），确保索引对应
            file_predictions = []
            file_references = []

            for i, data in enumerate(file_data):
                pred, ref = extract_prediction_and_reference(data)
                # 无论 pred 或 ref 是否为 None，都添加到列表中
                # 这样索引就能对应上，None 值会在 calculate_batch 中被处理
                file_predictions.append(pred)
                file_references.append(ref)

            logger.info(f"文件 {file_idx + 1} 有效数据: {len(file_predictions)} 条")

            if not file_predictions:
                logger.warning(f"文件 {file_idx + 1} 没有有效数据，跳过")
                file_results = {
                    "total": len(file_data),
                    "valid": 0,
                    "metrics": {}
                }
            else:
                # 计算当前文件的各指标
                file_results = {
                    "total": len(file_data),
                    "valid": len(file_predictions),
                    "metrics": {}
                }
            
            for metric_code, calculator in calculators.items():
                logger.info(f"开始计算文件 {file_idx + 1} 的指标: {metric_code}")
                try:
                    # 批量计算（会处理 None 值）
                    batch_result = calculator.calculate_batch(file_predictions, file_references)
                    
                    # 为每条数据添加指标分数（索引直接对应原始数据索引）
                    file_metric_scores = {}
                    for idx, score in enumerate(batch_result['scores']):
                        file_metric_scores[idx] = score
                    
                    file_results["metrics"][metric_code] = {
                        "average": batch_result['average'],
                        "total": batch_result['total'],
                        "valid": batch_result['valid'],
                        "scores": file_metric_scores  # 保存每条数据的分数（可能包含 None）
                    }
                    
                    logger.info(f"文件 {file_idx + 1} 指标 {metric_code} 计算完成，平均分数: {batch_result['average']:.4f}，有效样本: {batch_result['valid']}/{batch_result['total']}")
                except Exception as e:
                    logger.error(f"计算文件 {file_idx + 1} 的指标 {metric_code} 失败: {e}")
                    file_results["metrics"][metric_code] = {
                        "error": str(e)
                    }
        
            # 输出当前文件的结果
            if output_files and file_idx < len(output_files):
                output_file_path = output_files[file_idx]
                output_results_to_file(file_data, file_results, output_file_path, metrics)
        
            # 累计统计
            all_results.append(file_results)
            all_total += file_results["total"]
            all_valid += file_results["valid"]

    except KeyboardInterrupt:
        logger.warning("用户中断评估")
        # 写入中断进度
        if progress_file:
            write_progress(progress_file, {
                "batch_index": all_processed_batches,
                "total_batches": total_batches,
                "processed_lines": all_processed_lines,
                "total_lines": total_lines,
                "status": "interrupted"
            })
        raise
    except Exception as e:
        logger.error(f"评估过程中发生错误: {e}")
        # 写入错误进度
        if progress_file:
            write_progress(progress_file, {
                "batch_index": all_processed_batches,
                "total_batches": total_batches,
                "processed_lines": all_processed_lines,
                "total_lines": total_lines,
                "status": "error"
            })
        raise
    
    # 构建汇总结果（所有文件的聚合）
    # 计算所有文件的加权平均分
    aggregated_results = {
        "total": all_total,
        "valid": all_valid,
        "metrics": {}
    }
    
    for metric_code in metrics:
        total_weighted_score = 0.0
        total_valid_count = 0
        
        for file_result in all_results:
            if metric_code in file_result["metrics"] and "average" in file_result["metrics"][metric_code]:
                file_valid = file_result["metrics"][metric_code]["valid"]
                file_average = file_result["metrics"][metric_code]["average"]
                total_weighted_score += file_average * file_valid
                total_valid_count += file_valid
        
        if total_valid_count > 0:
            aggregated_average = total_weighted_score / total_valid_count
            # 保留4位小数
            aggregated_average = round(aggregated_average, 4)
            aggregated_results["metrics"][metric_code] = {
                "average": aggregated_average,
                "total": all_total,
                "valid": total_valid_count
            }
        else:
            aggregated_results["metrics"][metric_code] = {
                "error": "所有文件都没有有效数据"
            }
        
        # 写入完成进度
        if progress_file:
            write_progress(progress_file, {
                "batch_index": total_batches,
                "total_batches": total_batches,
                "processed_lines": total_lines,
                "total_lines": total_lines,
                "status": "completed"
            })
        
        return aggregated_results
    





def create_argument_parser() -> argparse.ArgumentParser:
    """创建命令行参数解析器"""
    parser = argparse.ArgumentParser(
        description="基础指标评估脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
支持的指标代码:
  accuracy          - 准确率
  f1                - F1分数
  rouge-1           - ROUGE-1
  rouge-2           - Rouge-2
  rouge-l           - Rouge-L
  bleu-4            - BLEU-4
  format_compliance - 格式遵从性
  semantic_similarity - 语义相似度

输入数据格式（JSONL）:
  每行一个JSON对象，应包含以下字段之一：
  - prediction/model_response/generated_response: 模型预测结果
  - reference/standard_response/answer: 参考答案

示例:
  python -m scripts.basic_metrics.main \\
    --input_file /data/project/huangwenyuan/lab/test.jsonl \\
    --metrics  f1 rouge-1 rouge-2  rouge-l bleu-4 format_compliance \\
    --output_file results.jsonl \\
    --stop_words stopwords.txt
        """
    )
    
    # 必需参数
    parser.add_argument(
        "--input_file",
        type=str,
        nargs='+',
        required=True,
        help="输入JSONL文件路径（可以是单个文件或文件列表），包含预测结果和参考答案"
    )
    
    parser.add_argument(
        "--metrics",
        type=str,
        nargs='+',
        required=True,
        choices=list(METRIC_CALCULATORS.keys()),
        help="要计算的指标列表（可指定多个）"
    )
    
    # 可选参数
    parser.add_argument(
        "--output_file",
        type=str,
        nargs='*',
        default=None,
        help="输出JSONL文件路径（可以是单个文件或文件列表，数量需与输入文件一致，可选）"
    )
    
    parser.add_argument(
        "--progress_file",
        type=str,
        default=None,
        help="进度文件路径（可选，JSONL格式，用于记录实时进度信息）"
    )
    
    parser.add_argument(
        "--stop_words",
        type=str,
        default=None,
        help="停用词文件路径（可选，每行一个停用词）"
    )
    
    parser.add_argument(
        "--log_level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="日志级别，默认INFO"
    )
    
    return parser


def main():
    """主函数"""
    parser = create_argument_parser()
    args = parser.parse_args()
    
    # 配置日志
    logger.remove()
    logger.add(
        sys.stderr,
        level=args.log_level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>"
    )
    
    logger.info("=" * 80)
    logger.info("基础指标评估脚本启动")
    logger.info("=" * 80)
    # 处理输入文件列表
    if isinstance(args.input_file, list):
        logger.info(f"输入文件 ({len(args.input_file)} 个):")
        for i, file_path in enumerate(args.input_file, 1):
            logger.info(f"  {i}. {file_path}")
    else:
        logger.info(f"输入文件: {args.input_file}")
    
    logger.info(f"计算指标: {', '.join(args.metrics)}")
    
    # 处理输出文件列表
    if args.output_file:
        if isinstance(args.output_file, list):
            logger.info(f"输出文件 ({len(args.output_file)} 个):")
            for i, file_path in enumerate(args.output_file, 1):
                logger.info(f"  {i}. {file_path}")
        else:
            logger.info(f"输出文件: {args.output_file}")
    else:
        logger.info(f"输出文件: 不输出文件")
    
    logger.info(f"进度文件: {args.progress_file or '不记录进度'}")
    logger.info(f"停用词文件: {args.stop_words or '不使用停用词'}")
    
    try:
        # 加载停用词
        stop_words = load_stop_words(args.stop_words)
        
        # 计算指标
        results = calculate_metrics(
            input_file=args.input_file,
            metrics=args.metrics,
            stop_words=stop_words,
            output_file=args.output_file,
            progress_file=args.progress_file
        )
        
        # 输出汇总结果
        logger.info("=" * 80)
        logger.info("计算结果汇总")
        logger.info("=" * 80)
        logger.info(f"总样本数: {results['total']}")
        logger.info(f"有效样本数: {results['valid']}")
        logger.info("")
        logger.info("各指标平均分数:")
        for metric_code, metric_result in results["metrics"].items():
            if "average" in metric_result:
                logger.info(f"  {metric_code}: {metric_result['average']:.4f}")
            elif "error" in metric_result:
                logger.info(f"  {metric_code}: 计算失败 - {metric_result['error']}")
        
        logger.info("=" * 80)
        logger.info("评估完成")
        logger.info("=" * 80)
        
    except Exception as e:
        logger.error(f"评估失败: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()

