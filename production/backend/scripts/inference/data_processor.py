"""
数据处理模块
从jsonl文件读取数据，支持批量读取和流式处理
"""

import json
import os
from typing import Iterator, List, Dict, Optional, Tuple, Union
from loguru import logger


def read_jsonl_batch(
    file_path: str,
    batch_size: int = 5000,
    skip_errors: bool = True
) -> Iterator[List[Dict]]:
    """
    从jsonl文件批量读取数据
    
    Args:
        file_path: jsonl文件路径
        batch_size: 每批读取的数据量，默认5000条
        skip_errors: 是否跳过格式错误的数据行，默认True
    
    Yields:
        每批数据的列表
    
    Raises:
        FileNotFoundError: 文件不存在
        IOError: 文件读取错误
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"输入文件不存在: {file_path}")
    
    logger.info(f"开始读取数据文件: {file_path}")
    logger.info(f"批次大小: {batch_size}")
    
    batch = []
    line_count = 0
    error_count = 0
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                
                try:
                    data = json.loads(line)
                    # 支持两种格式：dict 或 list（列表中只有一个元素）
                    if isinstance(data, dict):
                        batch.append(data)
                        line_count += 1
                    elif isinstance(data, list):
                        if len(data) == 1 and isinstance(data[0], dict):
                            # 列表格式，提取第一个元素（字典）
                            batch.append(data[0])
                            line_count += 1
                        else:
                            if skip_errors:
                                error_count += 1
                                logger.warning(f"第{line_num}行数据格式错误，跳过: 列表格式不正确（应为包含单个字典的列表）")
                            else:
                                raise ValueError(f"第{line_num}行数据格式错误: 列表格式不正确（应为包含单个字典的列表）")
                    else:
                        if skip_errors:
                            error_count += 1
                            logger.warning(f"第{line_num}行数据格式错误，跳过: 不是字典或列表类型")
                        else:
                            raise ValueError(f"第{line_num}行数据格式错误: 不是字典或列表类型")
                except json.JSONDecodeError as e:
                    if skip_errors:
                        error_count += 1
                        logger.warning(f"第{line_num}行JSON解析失败，跳过: {str(e)}")
                    else:
                        raise ValueError(f"第{line_num}行JSON解析失败: {str(e)}")
                
                # 当批次达到指定大小时，返回当前批次
                if len(batch) >= batch_size:
                    logger.info(f"已读取 {line_count} 条数据，返回批次（包含 {len(batch)} 条）")
                    yield batch
                    batch = []
        
        # 返回最后一批数据（如果有）
        if batch:
            logger.info(f"返回最后一批数据（包含 {len(batch)} 条）")
            yield batch
        
        logger.info(f"数据读取完成，总计: {line_count} 条有效数据，{error_count} 条错误数据")
        
    except IOError as e:
        logger.error(f"读取文件时发生IO错误: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"读取数据时发生未知错误: {str(e)}")
        raise


def count_jsonl_lines(
    file_paths: Union[str, List[str]],
    batch_size: int = 5000,
    use_shell_command: bool = True
) -> Tuple[int, int]:
    """
    快速统计jsonl文件的总行数和批次数（用于进度显示）
    优先使用 shell 命令（wc -l）统计，如果不可用则回退到优化的 Python 实现
    只统计非空行，不解析JSON内容
    
    性能说明：
    - Shell 命令（wc -l）：最快，但会统计所有行（包括空行），需要二次过滤
    - Python 缓冲区读取：较快，直接统计非空行，无需二次遍历
    - Python 逐行读取：较慢，适合小文件
    
    Args:
        file_paths: jsonl文件路径或文件路径列表
        batch_size: 每批读取的数据量，默认5000条（用于计算总批次数）
        use_shell_command: 是否尝试使用 shell 命令（wc -l），默认 True
                          注意：wc -l 统计所有行，如果文件空行很少，可以接受近似值
    
    Returns:
        (总行数, 总批次数) 的元组（所有文件的总和）
    
    Raises:
        FileNotFoundError: 文件不存在
        IOError: 文件读取错误
    """
    import subprocess
    import platform
    
    # 统一转换为列表
    if isinstance(file_paths, str):
        file_paths = [file_paths]
    
    total_line_count = 0
    
    try:
        # 尝试使用 shell 命令（最快，但统计所有行包括空行）
        if use_shell_command:
            try:
                for file_path in file_paths:
                    if not os.path.exists(file_path):
                        raise FileNotFoundError(f"输入文件不存在: {file_path}")
                    
                    # 使用 wc -l 命令统计行数（包括空行）
                    # 注意：wc -l 会统计所有行，如果文件空行很少，可以接受这个近似值
                    try:
                        # 在 Unix/Linux/Mac 或 Windows Git Bash 中使用 wc -l
                        result = subprocess.run(
                            ['wc', '-l', file_path],
                            capture_output=True,
                            text=True,
                            timeout=30,  # 30秒超时
                            check=False
                        )
                        
                        if result.returncode == 0:
                            # wc -l 输出格式: "行数 文件名"
                            line_count_all = int(result.stdout.strip().split()[0])
                            # 注意：这里使用 wc -l 的结果（包括空行）
                            # 如果文件空行很少，这个近似值是可以接受的
                            # 如果需要精确的非空行数，会回退到 Python 实现
                            total_line_count += line_count_all
                            logger.debug(f"文件 {file_path}: {line_count_all} 行（使用 wc -l，包括空行）")
                        else:
                            raise subprocess.CalledProcessError(result.returncode, 'wc')
                            
                    except (subprocess.CalledProcessError, FileNotFoundError, ValueError, IndexError, TimeoutError, OSError) as e:
                        # wc 命令不可用或失败，回退到 Python 实现
                        logger.debug(f"使用 shell 命令统计失败，回退到 Python 实现: {e}")
                        raise
                
                # 计算总批次数（向上取整）
                total_batches = (total_line_count + batch_size - 1) // batch_size if total_line_count > 0 else 0
                
                logger.info(f"统计完成: 总文件数 {len(file_paths)} 个，总行数 {total_line_count} 条（包括空行），预计批次 {total_batches} 批（使用 wc -l）")
                
                return total_line_count, total_batches
                
            except Exception as e:
                # 如果 shell 命令方法失败，回退到优化的 Python 实现
                logger.debug(f"Shell 命令方法失败，使用优化的 Python 实现: {e}")
        
        # 优化的 Python 实现：使用二进制模式 + 缓冲区读取，直接统计非空行
        # 这种方法比逐行读取快很多，特别是对于大文件
        for file_path in file_paths:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"输入文件不存在: {file_path}")
            
            line_count = 0
            # 使用二进制模式 + 缓冲区读取，性能比逐行读取好很多
            with open(file_path, 'rb') as f:
                buffer = f.read(8192 * 4)  # 32KB 缓冲区，更大的缓冲区可以提高性能
                partial_line = b''  # 用于处理跨缓冲区的行
                
                while buffer:
                    # 将部分行与当前缓冲区合并
                    data = partial_line + buffer
                    # 按换行符分割
                    lines = data.split(b'\n')
                    # 最后一行可能不完整，保存到 partial_line
                    partial_line = lines[-1]
                    
                    # 处理完整的行（除了最后一行）
                    for line in lines[:-1]:
                        if line.strip():  # 只统计非空行
                            line_count += 1
                    
                    # 读取下一块
                    buffer = f.read(8192 * 4)
                
                # 处理最后一行（如果有）
                if partial_line.strip():
                    line_count += 1
            
            total_line_count += line_count
            logger.debug(f"文件 {file_path}: {line_count} 行（使用 Python 缓冲区读取）")
        
        # 计算总批次数（向上取整）
        total_batches = (total_line_count + batch_size - 1) // batch_size if total_line_count > 0 else 0
        
        logger.info(f"统计完成: 总文件数 {len(file_paths)} 个，总行数 {total_line_count} 条，预计批次 {total_batches} 批（使用 Python 缓冲区读取）")
        
        return total_line_count, total_batches
        
    except IOError as e:
        logger.error(f"读取文件时发生IO错误: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"统计数据时发生未知错误: {str(e)}")
        raise
