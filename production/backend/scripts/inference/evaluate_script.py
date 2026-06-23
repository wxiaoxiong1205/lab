#!/usr/bin/env python
"""
模型推理脚本主入口
整合数据处理、Prompt生成、推理请求和结果后处理模块
"""

import argparse
import asyncio
import json
import os
import sys
import time
import yaml
from pathlib import Path
from typing import Optional, Dict, Any, Tuple, List, Callable
from loguru import logger

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.inference.data_processor import read_jsonl_batch, count_jsonl_lines
from scripts.inference.prompt_generator import PromptGenerator
from scripts.inference.inference_client import create_client, InferenceClient
from scripts.inference.result_processor import ResultProcessor


def load_config(config_file: Optional[str] = None) -> Dict[str, Any]:
    """加载配置文件"""
    if not config_file:
        raise ValueError("配置文件路径不能为空")
    
    if not os.path.exists(config_file):
        raise FileNotFoundError(f"配置文件不存在: {config_file}")
    
    logger.info(f"加载配置文件: {config_file}")
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f) or {}
        logger.info("配置文件加载完成")
        return config
    except yaml.YAMLError as e:
        logger.error(f"配置文件格式错误: {str(e)}")
        raise ValueError(f"配置文件格式错误: {str(e)}") from e
    except Exception as e:
        logger.error(f"读取配置文件失败: {str(e)}")
        raise


def format_execution_time(total_time: float) -> str:
    """格式化执行时间为可读字符串"""
    hours = int(total_time // 3600)
    minutes = int((total_time % 3600) // 60)
    seconds = int(total_time % 60)
    milliseconds = int((total_time % 1) * 1000)
    
    if hours > 0:
        return f"{hours}小时{minutes}分钟{seconds}秒{milliseconds}毫秒"
    elif minutes > 0:
        return f"{minutes}分钟{seconds}秒{milliseconds}毫秒"
    else:
        return f"{seconds}秒{milliseconds}毫秒"


def get_config_value(config: Dict, *keys, default=None):
    """从嵌套字典中获取值"""
    value = config
    for key in keys:
        if isinstance(value, dict):
            value = value.get(key)
            if value is None:
                return default
        else:
            return default
    return value if value is not None else default


def create_argument_parser() -> argparse.ArgumentParser:
    """创建命令行参数解析器"""
    parser = argparse.ArgumentParser(description="模型推理脚本")
    
    # 必需参数
    parser.add_argument("--config_file", type=str, required=True, help="配置文件路径（YAML格式）")
    
    return parser




def initialize_components(config: Dict[str, Any], client_type: str) -> Tuple[PromptGenerator, InferenceClient, ResultProcessor]:
    """初始化所有组件"""
    # 初始化Prompt生成器
    prompt_template_path = get_config_value(config, "prompt", "template_path")
    if not prompt_template_path:
        logger.error("必须在配置文件的prompt.template_path中提供Prompt模板路径")
        sys.exit(1)
    
    # 读取metrics配置（必需）
    metrics = get_config_value(config, "metrics", default=None)
    if not metrics:
        logger.error("必须在配置文件中定义 metrics 配置，当前未检测到 metrics 配置")
        sys.exit(1)
    
    prompt_generator = PromptGenerator(
        template_path=prompt_template_path,
        metrics=metrics
    )
    logger.info("Prompt生成器初始化完成")
    
    # 初始化推理客户端
    # 根据client_type直接从对应配置段提取
    if client_type == "openai":
        client_config = get_config_value(config, "openai", default={})
    else:  # vllm
        client_config = get_config_value(config, "vllm", default={})
    
    # 提取推理参数
    inference_params = get_config_value(config, "inference", default={})
    
    # 过滤None值
    client_config = {k: v for k, v in client_config.items() if v is not None}
    inference_params = {k: v for k, v in inference_params.items() if v is not None}
    
    inference_client = create_client(client_type, client_config=client_config, inference_params=inference_params)
    logger.info("推理客户端初始化完成")
    
    # 初始化结果处理器
    result_processor = ResultProcessor()
    logger.info("结果处理器初始化完成")
    
    return prompt_generator, inference_client, result_processor


async def process_batch(
    data_batch: list,
    batch_idx: int,
    prompt_generator: PromptGenerator,
    inference_client: InferenceClient,
    result_processor: ResultProcessor
) -> list:
    """处理单个批次的数据"""
    logger.info(f"\n处理第 {batch_idx} 批数据，包含 {len(data_batch)} 条")
    
    metrics = prompt_generator.metrics
    logger.info(f"使用 {len(metrics)} 个评估指标，将为每条数据生成多个评估prompt")
    
    # 为整个batch生成多指标消息列表（扁平列表）
    messages_list, prompt_meta = prompt_generator.generate_for_metrics_batch(
        data_list=data_batch
    )
    logger.info(f"消息生成完成，共 {len(messages_list)} 条（每条数据 {len(metrics)} 个指标）")
    
    # 执行推理（一次性传入所有消息列表，充分利用批处理能力）
    logger.info("开始推理...")
    inference_results = await inference_client.infer_batch(messages_list)
    
    success_count = len(inference_results.get("success", []))
    failed_count = len(inference_results.get("failed", []))
    logger.info(f"推理完成，成功: {success_count} 条，失败: {failed_count} 条，总计: {success_count + failed_count} 条")
    
    # 构建按原始数据聚合的评估结果
    processed_results = result_processor.build_metric_results(
        original_data=data_batch,
        prompt_meta=prompt_meta,
        inference_results=inference_results
    )
    return processed_results


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


async def process_single_file(
    input_file: str,
    output_file: str,
    prompt_generator: PromptGenerator,
    inference_client: InferenceClient,
    result_processor: ResultProcessor,
    config: Dict[str, Any],
    all_total_lines: int = 0,
    all_total_batches: int = 0,
    all_processed_lines: int = 0,
    all_processed_batches: int = 0
) -> Tuple[int, int]:
    """处理单个文件的所有数据并保存结果（每个批次处理完立即保存）"""
    # 从配置中读取参数
    data_batch_size = get_config_value(config, "data", "batch_size", default=5000)
    skip_errors = get_config_value(config, "data", "skip_errors", default=True)
    progress_file = get_config_value(config, "runtime", "progress_file", default=None)
    
    total_count = 0
    batch_count = 0
    
    try:
        # 批量读取和处理数据
        for batch_idx, data_batch in enumerate(
            read_jsonl_batch(input_file, batch_size=data_batch_size, skip_errors=skip_errors),
            1
        ):
            processed_results = await process_batch(
                data_batch, batch_idx, prompt_generator, inference_client,
                result_processor
            )
            
            # 每个批次处理完立即追加保存
            is_first_batch = (batch_idx == 1)
            result_processor.save_results(
                processed_results, 
                output_file, 
                append=not is_first_batch
            )
            
            total_count += len(processed_results)
            batch_count = batch_idx
            logger.info(f"第 {batch_idx} 批处理完成并已保存，累计处理 {total_count} 条")
            
            # 写入进度信息（使用所有文件的总体进度）
            if progress_file:
                current_all_processed = all_processed_lines + total_count
                current_all_batches = all_processed_batches + batch_idx
                progress_data = {
                    "batch_index": current_all_batches,
                    "total_batches": all_total_batches,
                    "processed_lines": current_all_processed,
                    "total_lines": all_total_lines,
                    "status": "processing"
                }
                write_progress(progress_file, progress_data)
        
        return total_count, batch_count
        
    except KeyboardInterrupt:
        logger.warning(f"用户中断，已处理并保存 {total_count} 条结果（{batch_count} 批）")
        raise
    except Exception as e:
        logger.error(f"处理文件 {input_file} 时发生错误: {str(e)}", exc_info=True)
        logger.info(f"已处理并保存 {total_count} 条结果（{batch_count} 批）")
        raise


async def process_all_file(
    prompt_generator: PromptGenerator,
    inference_client: InferenceClient,
    result_processor: ResultProcessor,
    config: Dict[str, Any]
) -> None:
    """处理所有输入文件并保存结果"""
    # 从配置中读取参数
    input_files = get_config_value(config, "runtime", "input_file", default=None)
    output_files = get_config_value(config, "runtime", "output_file", default=None)
    data_batch_size = get_config_value(config, "data", "batch_size", default=5000)
    progress_file = get_config_value(config, "runtime", "progress_file", default=None)
    statistics_file = get_config_value(config, "runtime", "statistics_file", default=None)
    
    # 支持单个文件路径或文件路径列表
    if isinstance(input_files, str):
        input_files = [input_files]
    if isinstance(output_files, str):
        output_files = [output_files]
    
    if not input_files:
        raise ValueError("必须在配置文件 runtime.input_file 中指定输入文件路径")
    if not output_files:
        raise ValueError("必须在配置文件 runtime.output_file 中指定输出文件路径")
    
    if len(input_files) != len(output_files):
        raise ValueError(f"输入文件数量 ({len(input_files)}) 与输出文件数量 ({len(output_files)}) 不一致")
    
    total_files = len(input_files)
    all_total_count = 0
    all_batch_count = 0
    file_idx = 0  # 初始化，用于异常处理
    
    # 统计总行数和总批次数（用于进度显示）
    total_lines, total_batches = count_jsonl_lines(input_files, batch_size=data_batch_size)
    
    # 写入开始进度
    if progress_file:
        write_progress(progress_file, {
            "batch_index": 0,
            "total_batches": total_batches,
            "processed_lines": 0,
            "total_lines": total_lines,
            "status": "started"
        })
    
    # 从配置中读取 inference_result_dataset_id（在处理文件前读取一次）
    inference_result_dataset_id_list = get_config_value(
        config, "runtime", "inference_result_dataset_id", default=None
    )
    # 确保是列表格式
    if isinstance(inference_result_dataset_id_list, (int, str)):
        inference_result_dataset_id_list = [inference_result_dataset_id_list]
    elif inference_result_dataset_id_list is None:
        inference_result_dataset_id_list = []
    
    try:
        for file_idx, (input_file, output_file) in enumerate(zip(input_files, output_files), 1):
            logger.info("\n" + "=" * 80)
            logger.info(f"处理文件 {file_idx}/{total_files}: {input_file}")
            logger.info(f"输出文件: {output_file}")
            logger.info("=" * 80)
            
            file_total_count, file_batch_count = await process_single_file(
                input_file,
                output_file,
                prompt_generator,
                inference_client,
                result_processor,
                config,
                total_lines,
                total_batches,
                all_total_count,
                all_batch_count
            )
            
            all_total_count += file_total_count
            all_batch_count += file_batch_count
            
            # 保存该文件的统计报告并重置统计器
            if statistics_file:
                # 根据文件索引获取对应的 dataset_id（如果列表长度足够）
                # 如果只有一个 dataset_id，所有文件共用；如果有多个，按索引匹配
                if inference_result_dataset_id_list:
                    if len(inference_result_dataset_id_list) == 1:
                        # 只有一个 dataset_id，所有文件共用
                        current_dataset_id = inference_result_dataset_id_list[0]
                    elif file_idx - 1 < len(inference_result_dataset_id_list):
                        # 多个 dataset_id，按文件索引匹配（file_idx 从1开始，所以减1）
                        current_dataset_id = inference_result_dataset_id_list[file_idx - 1]
                    else:
                        # 文件数量超过 dataset_id 数量，使用最后一个
                        current_dataset_id = inference_result_dataset_id_list[-1]
                        logger.warning(
                            f"文件索引 {file_idx} 超出 dataset_id 列表长度，使用最后一个 dataset_id: {current_dataset_id}"
                        )
                else:
                    current_dataset_id = None
                
                result_processor.save_statistics(
                    statistics_file, 
                    input_file,
                    inference_result_dataset_id=current_dataset_id if current_dataset_id is not None else None
                )
                result_processor.reset_stats()
            
            logger.info(f"\n文件 {file_idx}/{total_files} 处理完成:")
            logger.info(f"  批次数: {file_batch_count}")
            logger.info(f"  处理条数: {file_total_count}")
        
        # 输出总体统计信息
        logger.info("\n" + "=" * 80)
        logger.info("所有文件处理完成统计信息:")
        logger.info("=" * 80)
        logger.info("推理脚本执行完成")
        logger.info(f"  总文件数: {total_files}")
        logger.info(f"  实际处理批次: {all_batch_count} / 预计批次: {total_batches}")
        logger.info(f"  实际处理条数: {all_total_count} / 预计行数: {total_lines}")
        if all_total_count < total_lines:
            skipped = total_lines - all_total_count
            logger.warning(f"  跳过的数据条数: {skipped} ({skipped/total_lines*100:.2f}%)")
        logger.info("=" * 80)
        
        # 写入完成进度（状态为completed时，进度显示为100%，因为可能有脏数据被跳过）
        if progress_file:
            write_progress(progress_file, {
                "batch_index": total_batches,
                "total_batches": total_batches,
                "processed_lines": total_lines,
                "total_lines": total_lines,
                "status": "completed"
            })
        
    except KeyboardInterrupt:
        logger.warning(f"用户中断，已处理 {file_idx}/{total_files} 个文件，累计处理 {all_total_count} 条结果（{all_batch_count} 批）")
        # 写入中断进度
        if progress_file:
            write_progress(progress_file, {
                "batch_index": all_batch_count,
                "total_batches": total_batches,
                "processed_lines": all_total_count,
                "total_lines": total_lines,
                "status": "interrupted"
            })
        sys.exit(1)
    except Exception as e:
        logger.error(f"处理过程中发生错误: {str(e)}", exc_info=True)
        logger.info(f"已处理 {file_idx}/{total_files} 个文件，累计处理 {all_total_count} 条结果（{all_batch_count} 批）")
        # 写入错误进度
        if progress_file:
            write_progress(progress_file, {
                "batch_index": all_batch_count,
                "total_batches": total_batches,
                "processed_lines": all_total_count,
                "total_lines": total_lines,
                "status": "error"
            })
        sys.exit(1)


async def main():
    """主函数"""
    # 记录脚本开始执行时间
    start_time = time.time()
    
    parser = create_argument_parser()
    args = parser.parse_args()
    
    # 加载配置
    config = load_config(args.config_file)
    
    # 配置日志（从配置文件读取）
    log_level = get_config_value(config, "runtime", "log_level", default="INFO")
    logger.remove()
    logger.add(
        sys.stderr,
        level=log_level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        colorize=True
    )
    
    logger.info("=" * 80)
    logger.info("模型推理脚本启动")
    logger.info("=" * 80)
    
    # 从配置文件读取 client_type
    client_type = get_config_value(config, "runtime", "client_type", default=None)
    if not client_type:
        logger.error("必须在配置文件 runtime.client_type 中指定推理客户端类型（openai 或 vllm）")
        sys.exit(1)
    
    # 初始化组件（会在内部读取并验证 metrics 配置）
    prompt_generator, inference_client, result_processor = initialize_components(
        config, client_type
    )
    logger.info(f"检测到多指标配置，共 {len(prompt_generator.metrics)} 个评估指标，将按方案A输出评估结果")
    
    try:
        await process_all_file(
            prompt_generator,
            inference_client,
            result_processor,
            config
        )
    finally:
        # 计算并记录总执行时间
        end_time = time.time()
        total_time = end_time - start_time
        time_str = format_execution_time(total_time)
        logger.info("=" * 80)
        logger.info(f"脚本执行完成，总耗时: {time_str} ({total_time:.3f}秒)")
        logger.info("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
