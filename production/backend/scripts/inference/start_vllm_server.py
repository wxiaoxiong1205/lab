#!/usr/bin/env python
"""
启动 vLLM API 服务脚本
从配置文件中读取参数并启动 vLLM OpenAI 兼容 API 服务
"""

import argparse
import sys
import yaml
from pathlib import Path
from typing import Dict, Any

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from loguru import logger


def load_config(config_file: str) -> Dict[str, Any]:
    """加载配置文件"""
    if not Path(config_file).exists():
        raise FileNotFoundError(f"配置文件不存在: {config_file}")
    
    with open(config_file, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)
    
    if not config:
        raise ValueError("配置文件为空或格式错误")
    
    return config


def get_config_value(config: Dict[str, Any], *keys, default=None):
    """从配置中获取值，支持嵌套键"""
    value = config
    for key in keys:
        if isinstance(value, dict):
            value = value.get(key)
        else:
            return default
        if value is None:
            return default
    return value


def build_vllm_args(config: Dict[str, Any]) -> list:
    """
    从配置文件中构建 vLLM API 服务启动参数
    
    Args:
        config: 配置字典
    
    Returns:
        vLLM API 服务启动参数列表
    """
    # 获取 vLLM 配置
    vllm_config = get_config_value(config, "vllm", default={})
    
    # 获取 OpenAI 配置（用于 served-model-name）
    openai_config = get_config_value(config, "openai", default={})
    
    # 模型路径（从配置文件读取）
    model = vllm_config.get("model_path")
    if not model:
        raise ValueError("必须通过配置文件 vllm.model_path 提供模型路径")
    
    # 构建基础参数
    # 使用 python3 以确保兼容性（某些容器中可能没有 python 命令）
    args = [
        "python3", "-m", "vllm.entrypoints.openai.api_server",
        "--model", model,
        "--host", "0.0.0.0",
        "--port", "8000",
        "--trust-remote-code"
    ]
    
    # 添加 served-model-name（与客户端配置中的 model 保持一致）
    # 如果配置了 openai.model，使用它；否则使用 vllm.served_model_name（如果存在）
    served_model_name = openai_config.get("model") or vllm_config.get("served_model_name")
    if served_model_name:
        args.extend(["--served-model-name", served_model_name])
    
    # 添加可选参数
    if vllm_config.get("tensor_parallel_size") is not None:
        args.extend(["--tensor-parallel-size", str(vllm_config["tensor_parallel_size"])])
    
    if vllm_config.get("max_model_len") is not None:
        args.extend(["--max-model-len", str(vllm_config["max_model_len"])])
    
    if vllm_config.get("gpu_memory_utilization") is not None:
        args.extend(["--gpu-memory-utilization", str(vllm_config["gpu_memory_utilization"])])
    
    if vllm_config.get("max_num_batched_tokens") is not None:
        args.extend(["--max-num-batched-tokens", str(vllm_config["max_num_batched_tokens"])])
    
    if vllm_config.get("max_num_seqs") is not None:
        args.extend(["--max-num-seqs", str(vllm_config["max_num_seqs"])])
    
    return args


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description="启动 vLLM API 服务，从配置文件中读取参数"
    )
    parser.add_argument(
        "--config-file",
        type=str,
        required=True,
        help="配置文件路径（YAML格式），模型路径从配置文件 vllm.model_path 读取"
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="日志级别，默认INFO"
    )
    
    args = parser.parse_args()
    
    # 配置日志
    logger.remove()
    logger.add(
        sys.stderr,
        level=args.log_level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>"
    )
    
    try:
        # 加载配置
        logger.info(f"加载配置文件: {args.config_file}")
        config = load_config(args.config_file)
        
        # 构建启动参数
        logger.info("构建 vLLM API 服务启动参数...")
        vllm_args = build_vllm_args(config)
        
        # 打印启动参数
        logger.info("vLLM API 服务启动参数:")
        logger.info(f"  命令: {' '.join(vllm_args)}")
        
        # 启动服务（使用 exec 替换当前进程）
        logger.info("启动 vLLM API 服务...")
        logger.info("=" * 80)
        
        # 使用 exec 替换当前进程，这样信号处理更正确
        import os
        os.execvp("python3", vllm_args)
        
    except FileNotFoundError as e:
        logger.error(f"配置文件错误: {str(e)}")
        sys.exit(1)
    except ValueError as e:
        logger.error(f"配置参数错误: {str(e)}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"启动失败: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

