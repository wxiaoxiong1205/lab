#!/usr/bin/env python
"""
模型生成脚本（推理结果生成）
用于生成推理结果集，是评估的前置步骤
与评估脚本的区别：不需要 metrics，每条数据只生成一个 prompt，输出格式更简单
"""

import argparse
import asyncio
import base64
import json
import os
import sys
import time
import yaml
from pathlib import Path
from typing import Optional, Dict, Any, Tuple, List
from loguru import logger

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.inference.data_processor import read_jsonl_batch, count_jsonl_lines
from scripts.inference.inference_client import create_client, InferenceClient


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
    parser = argparse.ArgumentParser(description="模型生成脚本（推理结果生成）")
    
    # 必需参数
    parser.add_argument("--config_file", type=str, required=True, help="配置文件路径（YAML格式）")
    
    return parser


def format_message_content_for_logging(content: Any, max_length_per_node: int = 100) -> str:
    """
    格式化消息内容用于日志打印（根据 JSON 节点约束长度，确保每个节点都有输出）
    
    Args:
        content: 消息内容，可能是字符串或列表（OpenAI 多模态格式）
        max_length_per_node: 每个节点的最大打印长度（默认80字符）
    
    Returns:
        格式化后的字符串，用于日志打印
    """
    if isinstance(content, str):
        # 字符串类型：直接限制长度
        if len(content) > max_length_per_node:
            return f"{content[:max_length_per_node]}..."
        return content
    elif isinstance(content, list):
        # 列表类型（OpenAI 多模态格式）：遍历每个节点
        formatted_parts = []
        for i, node in enumerate(content):
            if isinstance(node, dict):
                node_type = node.get("type", "unknown")
                if node_type == "text":
                    # 文本节点
                    text = node.get("text", "")
                    if len(text) > max_length_per_node:
                        formatted_parts.append(f"text: {text[:max_length_per_node]}...")
                    else:
                        formatted_parts.append(f"text: {text}")
                elif node_type == "image_url":
                    # 图片节点
                    image_url = node.get("image_url", {})
                    if isinstance(image_url, dict):
                        url = image_url.get("url", "")
                        if url.startswith("data:"):
                            # base64 编码的图片，只打印前缀信息
                            mime_type = url.split(";")[0].replace("data:", "")
                            formatted_parts.append(f"image_url: [{mime_type}, base64数据...]")
                        else:
                            # 普通 URL，限制长度
                            if len(url) > max_length_per_node:
                                formatted_parts.append(f"image_url: {url[:max_length_per_node]}...")
                            else:
                                formatted_parts.append(f"image_url: {url}")
                    else:
                        formatted_parts.append(f"image_url: {str(image_url)[:max_length_per_node]}...")
                else:
                    # 其他类型的节点
                    node_str = str(node)
                    if len(node_str) > max_length_per_node:
                        formatted_parts.append(f"{node_type}: {node_str[:max_length_per_node]}...")
                    else:
                        formatted_parts.append(f"{node_type}: {node_str}")
            else:
                # 非字典节点，直接转换为字符串
                node_str = str(node)
                if len(node_str) > max_length_per_node:
                    formatted_parts.append(f"[{i}]: {node_str[:max_length_per_node]}...")
                else:
                    formatted_parts.append(f"[{i}]: {node_str}")
        
        # 如果列表为空，返回提示信息
        if not formatted_parts:
            return "[空内容]"
        
        # 用 " | " 连接各个节点
        return " | ".join(formatted_parts)
    else:
        # 其他类型：转换为字符串并限制长度
        content_str = str(content)
        if len(content_str) > max_length_per_node:
            return f"{content_str[:max_length_per_node]}..."
        return content_str


class SimplePromptGenerator:
    """简单的消息生成器（用于生成场景，不需要metrics）"""
    
    def __init__(self):
        """初始化消息生成器"""
        logger.info("消息生成器初始化完成（直接从数据中读取 system 和 prompt 字段）")
    
    def generate_batch(self, data_list: List[Dict[str, Any]]) -> List[List[Dict[str, str]]]:
        """
        为一批数据生成消息列表
        
        Args:
            data_list: 原始数据字典列表（每个元素对应一行JSONL）
        
        Returns:
            messages_list: 消息列表（长度=数据条数），每条数据生成一个消息列表
                格式: [[{"role": "system", "content": "..."}, {"role": "user", "content": "..."}], ...]
                - role "system" 对应 data 中的 "system" 字段（可选）
                - role "user" 对应 data 中的 "prompt" 字段（必选）
        
        Raises:
            ValueError: 如果数据中缺少必选的 "prompt" 字段
        """
        messages_list: List[List[Dict[str, str]]] = []
        
        for data in data_list:
            try:
                messages = []
                
                # system 字段可选：如果有 system 字段，添加 system 消息
                if "system" in data and data["system"]:
                    messages.append({
                        "role": "system",
                        "content": str(data["system"])
                    })
                
                # prompt 字段必选：检查是否存在
                if "prompt" not in data:
                    error_msg = f"数据中缺少必选的 'prompt' 字段: {data}"
                    logger.error(error_msg)
                    raise ValueError(error_msg)
                
                if not data["prompt"]:
                    error_msg = f"数据中的 'prompt' 字段为空: {data}"
                    logger.error(error_msg)
                    raise ValueError(error_msg)
                
                # 添加 user 消息
                messages.append({
                    "role": "user",
                    "content": str(data["prompt"])
                })
                
                messages_list.append(messages)
                
                # 格式化打印 messages 信息（根据 JSON 节点约束长度，确保每个节点都有输出）
                messages_str = "\n".join([
                    f"  [{i+1}] {msg['role'].upper()}: {format_message_content_for_logging(msg['content'])}"
                    for i, msg in enumerate(messages)
                ])
                logger.info(f"生成消息列表 (索引 {len(messages_list)-1}):\n{messages_str}")
            except Exception as e:
                logger.error(f"生成消息失败: {str(e)}, 数据: {data}")
                raise ValueError(f"生成消息失败: {str(e)}")
        
        logger.info(f"消息生成完成: 数据条数={len(data_list)}, 总消息数={len(messages_list)}")
        return messages_list


class RoleBasePromptGenerator(SimplePromptGenerator):
    """role-based 格式的消息生成器（支持图片理解）"""

    def __init__(self, output_file: Optional[str] = None):
        """
        初始化消息生成器
        
        Args:
            output_file: 输出文件路径，用于计算图片的完整路径（容器挂载前缀）
        """
        super().__init__()
        self.output_file = output_file
        logger.info("RoleBasePromptGenerator 初始化完成（支持 role-based 格式和图片理解）")

    def set_output_file(self, output_file: str):
        """
        设置输出文件路径（用于计算图片的完整路径）
        
        Args:
            output_file: 输出文件路径
        """
        self.output_file = output_file
        logger.debug(f"已设置 output_file: {output_file}")

    def _encode_image_to_base64(self, image_path: str) -> str:
        """
        将图片文件编码为 base64 字符串
        
        Args:
            image_path: 图片文件的完整路径
            
        Returns:
            base64 编码的字符串（包含 data URI 前缀）
            
        Raises:
            FileNotFoundError: 如果图片文件不存在
            ValueError: 如果无法确定图片格式
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"图片文件不存在: {image_path}")
        
        # 根据文件扩展名确定 MIME 类型
        ext = os.path.splitext(image_path)[1].lower()
        mime_types = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        }
        mime_type = mime_types.get(ext, 'image/jpeg')  # 默认为 jpeg
        
        # 读取图片文件并编码为 base64
        with open(image_path, 'rb') as f:
            image_data = f.read()
            base64_data = base64.b64encode(image_data).decode('utf-8')
        
        # 返回 data URI 格式
        return f"data:{mime_type};base64,{base64_data}"

    def _build_openai_message_content(self, text_content: str, images: List[str]) -> List[Dict[str, Any]]:
        """
        按照 OpenAI 格式构建消息内容（将文本和图片拼接）
        将 <image> 标签替换为 "图片1"、"图片2" 等占位符，同时添加对应的图片节点
        
        Args:
            text_content: 文本内容（可能包含 <image> 标签）
            images: 图片路径列表（相对路径，需要拼接完整路径）
            
        Returns:
            OpenAI 格式的 content 列表，格式: [{"type": "text", "text": "..."}, {"type": "image_url", "image_url": {"url": "data:..."}}, ...]
        """
        content_parts: List[Dict[str, Any]] = []
        
        # 统计 <image> 标签的数量
        image_tag_count = text_content.count("<image>")
        
        # 如果没有图片或没有 <image> 标签，直接返回文本
        if not images or image_tag_count == 0:
            if text_content:
                content_parts.append({"type": "text", "text": text_content})
            return content_parts
        
        # 计算图片的完整路径（output_file 的父路径 + 相对路径）
        if not self.output_file:
            raise ValueError("output_file 未设置，无法计算图片的完整路径")
        
        output_dir = os.path.dirname(self.output_file)
        if not output_dir:
            output_dir = "."
        
        # 检查图片数量是否足够
        if len(images) < image_tag_count:
            logger.warning(
                f"消息中有 {image_tag_count} 个 <image> 标签，但只有 {len(images)} 张图片。"
                f"部分 <image> 标签将没有对应的图片。"
            )
        
        # 先构建替换后的文本（将 <image> 替换为 "图片1"、"图片2" 等）
        processed_text_parts = []
        image_index = 0
        
        # 按照 <image> 标签分割文本
        parts = text_content.split("<image>")
        
        for i, part in enumerate(parts):
            # 添加文本部分
            processed_text_parts.append(part)
            
            # 如果不是最后一部分，添加占位符并处理图片
            if i < len(parts) - 1:
                image_index += 1
                placeholder = f"图片{image_index}"
                processed_text_parts.append(placeholder)
        
        # 合并所有文本部分
        processed_text = "".join(processed_text_parts)
        
        # 添加文本节点
        content_parts.append({"type": "text", "text": processed_text})
        
        # 添加所有图片节点
        for i in range(min(image_tag_count, len(images))):
            image_relative_path = images[i]
            # 拼接完整路径
            image_full_path = os.path.join(output_dir, image_relative_path)
            # 标准化路径（处理相对路径和绝对路径）
            image_full_path = os.path.normpath(image_full_path)
            
            try:
                # 编码图片为 base64
                base64_image = self._encode_image_to_base64(image_full_path)
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": base64_image}
                })
                logger.debug(f"已添加图片到消息内容 ({i+1}/{image_tag_count}): {image_relative_path} -> {image_full_path}")
            except Exception as e:
                logger.error(f"处理图片失败: {image_full_path}, 错误: {str(e)}")
                # 如果图片处理失败，跳过该图片，但保留占位符
        
        return content_parts

    def generate_batch(self, data_list: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
        """
        为一批数据生成消息列表（按照 OpenAI 格式，支持图片理解）

        支持 role-based 格式：{"messages": [{"content": "...", "role": "user"}, ...], "images": [...]}

        Args:
            data_list: 原始数据字典列表（每个元素对应一行JSONL）

        Returns:
            messages_list: 消息列表（长度=数据条数），每条数据生成一个消息列表
                格式: [[{"role": "system", "content": "..."}, {"role": "user", "content": [...]}], ...]
                其中 content 可能是字符串（无图片）或列表（包含文本和图片的 OpenAI 格式）

        Raises:
            ValueError: 如果数据格式不正确或缺少必选字段
        """
        messages_list: List[List[Dict[str, Any]]] = []

        for data in data_list:
            try:
                messages = []

                # 检查是否为 role-based 格式（新格式）
                if "messages" not in data:
                    error_msg = f"数据中缺少 'messages' 字段: {data}"
                    logger.error(error_msg)
                    raise ValueError(error_msg)
                
                raw_messages = data["messages"]

                if not raw_messages:
                    error_msg = f"数据中的 'messages' 字段为空: {data}"
                    logger.error(error_msg)
                    raise ValueError(error_msg)

                # 1. 去除最后一个 role 为 assistant 的消息，将其内容保存到原数据中
                last_assistant_content = None
                if raw_messages and isinstance(raw_messages[-1], dict):
                    last_msg = raw_messages[-1]
                    if last_msg.get("role") == "assistant" and "content" in last_msg:
                        last_assistant_content = str(last_msg["content"])
                        # 保存到原数据中作为 response（如果还没有 response 字段）
                        if "response" not in data or not data["response"]:
                            data["response"] = last_assistant_content
                        # 从 messages 中移除最后一个 assistant 消息
                        raw_messages = raw_messages[:-1]
                        logger.debug(f"已移除最后一个 assistant 消息，内容长度: {len(last_assistant_content)}")

                if not raw_messages:
                    error_msg = f"移除最后一个 assistant 消息后，messages 为空: {data}"
                    logger.error(error_msg)
                    raise ValueError(error_msg)

                # 2. 获取 images 数组（如果存在）
                images = data.get("images", [])
                if not isinstance(images, list):
                    images = []

                # 保存原始 messages（用于生成 prompt，不替换 <image> 标签）
                original_messages_for_prompt = []
                
                # 3. 处理 messages，按照 OpenAI 格式构建（将图片编码为 base64 并拼接在 content 中）
                image_index = 0  # 当前已使用的图片索引
                for msg in raw_messages:
                    if isinstance(msg, dict) and "role" in msg and "content" in msg:
                        role = str(msg["role"])
                        original_content = str(msg["content"])
                        
                        # 保存原始内容（用于 prompt）
                        original_messages_for_prompt.append({
                            "role": role,
                            "content": original_content
                        })
                        
                        # 统计当前消息中的 <image> 标签数量
                        image_count_in_message = original_content.count("<image>")
                        
                        # 构建 OpenAI 格式的 content
                        if image_count_in_message > 0:
                            # 如果消息中有 <image> 标签，提取对应的图片
                            message_images = []
                            if image_index < len(images):
                                # 从 images 数组中提取对应数量的图片
                                message_images = images[image_index:image_index + image_count_in_message]
                                image_index += image_count_in_message
                            
                            # 使用列表格式（文本和图片混合），即使 message_images 为空也会返回只包含文本的列表
                            content = self._build_openai_message_content(original_content, message_images)
                        else:
                            # 如果消息中没有 <image> 标签，直接使用字符串
                            content = original_content

                        messages.append({
                            "role": role,
                            "content": content
                        })

                logger.debug(
                    f"使用 role-based 格式，共 {len(messages)} 条消息（已移除最后一个 assistant 消息），{len(images)} 张图片")

                # 4. 补充 system 字段：从 messages 中提取 role 为 system 的 content
                system_content = None
                for msg in raw_messages:
                    if isinstance(msg, dict) and msg.get("role") == "system":
                        system_content = str(msg.get("content", ""))
                        break
                
                if system_content:
                    data["system"] = system_content
                    logger.debug(f"已提取 system 字段，内容长度: {len(system_content)}")
                else:
                    # 如果没有 system 消息，设置为空字符串
                    data["system"] = ""
                
                # 5. 补充 prompt 字段：将原始 messages（未替换 <image> 标签）转换为字符串格式
                # 格式：User: content1\nAssistant: content2\nUser: content3
                # 注意：去除 role 为 system 的消息，使用原始内容（包含 <image> 标签）
                prompt_parts = []
                for msg in original_messages_for_prompt:
                    role = msg.get("role", "")
                    # 跳过 system 角色的消息
                    if role == "system":
                        continue
                    
                    role_capitalized = role.capitalize()
                    content = msg.get("content", "")
                    if role_capitalized and content:
                        prompt_parts.append(f"<{role_capitalized}> {content}")
                
                prompt_text = "\n".join(prompt_parts)
                data["prompt"] = prompt_text
                logger.debug(f"已生成 prompt 字段，内容长度: {len(prompt_text)}（已排除 system 消息，使用原始 <image> 标签）")

                messages_list.append(messages)

                # 格式化打印 messages 信息（根据 JSON 节点约束长度，确保每个节点都有输出）
                messages_str = "\n".join([
                    f"  [{i + 1}] {msg['role'].upper()}: {format_message_content_for_logging(msg['content'])}"
                    for i, msg in enumerate(messages)
                ])
                logger.info(f"生成消息列表 (索引 {len(messages_list) - 1}):\n{messages_str}")
            except Exception as e:
                logger.error(f"生成消息失败: {str(e)}, 数据: {data}")
                raise ValueError(f"生成消息失败: {str(e)}")

        logger.info(f"消息生成完成: 数据条数={len(data_list)}, 总消息数={len(messages_list)}")
        return messages_list


def initialize_components(config: Dict[str, Any], client_type: str, data_format: Optional[str] = None) -> Tuple[SimplePromptGenerator, InferenceClient]:
    """
    初始化所有组件
    
    Args:
        config: 配置字典
        client_type: 推理客户端类型（openai 或 vllm）
        data_format: 数据格式（role-based 或其他），如果为 role-based 则使用 RoleBasePromptGenerator
    
    Returns:
        Tuple[SimplePromptGenerator, InferenceClient]: 消息生成器和推理客户端
    """
    # 根据 data_format 选择消息生成器
    if data_format == "role-based":
        logger.info("使用 RoleBasePromptGenerator（role-based 格式）")
        prompt_generator = RoleBasePromptGenerator()
    else:
        logger.info("使用 SimplePromptGenerator（原格式）")
        prompt_generator = SimplePromptGenerator()
    
    # 初始化推理客户端
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
    
    return prompt_generator, inference_client


async def process_batch(
    data_batch: list,
    batch_idx: int,
    prompt_generator: SimplePromptGenerator,
    inference_client: InferenceClient,
    output_file: Optional[str] = None
) -> list:
    """
    处理单个批次的数据
    
    Args:
        data_batch: 数据批次
        batch_idx: 批次索引
        prompt_generator: 消息生成器
        inference_client: 推理客户端
        output_file: 输出文件路径（用于 RoleBasePromptGenerator 计算图片路径）
    """
    logger.info(f"\n处理第 {batch_idx} 批数据，包含 {len(data_batch)} 条")
    
    # 如果是 RoleBasePromptGenerator，设置 output_file
    if isinstance(prompt_generator, RoleBasePromptGenerator) and output_file:
        prompt_generator.set_output_file(output_file)
    
    # 生成消息列表（每条数据一个消息列表，支持 system 和 user 角色）
    messages_list = prompt_generator.generate_batch(data_batch)
    logger.info(f"消息生成完成，共 {len(messages_list)} 条")
    
    # 执行推理
    logger.info("开始推理...")
    inference_results = await inference_client.infer_batch(messages_list)
    
    success_count = len(inference_results.get("success", []))
    failed_count = len(inference_results.get("failed", []))
    logger.info(f"推理完成，成功: {success_count} 条，失败: {failed_count} 条，总计: {success_count + failed_count} 条")
    
    # 构建结果：原始数据 + 生成的回答
    processed_results = []
    success_results = inference_results.get("success", [])
    failed_results = inference_results.get("failed", [])
    
    # 构建索引到结果的映射
    result_map: Dict[int, Dict[str, Any]] = {}
    for item in failed_results:
        result_map[item["index"]] = {"result": "", "error": item["error"]}
    for item in success_results:
        result_map[item["index"]] = {"result": item["result"], "error": None}
    
    # 将推理结果添加到原始数据中
    for i, data in enumerate(data_batch):
        result_info = result_map.get(i)
        if result_info is None:
            logger.error(f"第 {i + 1} 条数据没有对应的推理结果，这不应该发生")
            processed_results.append({
                **data,
                "model_response": "",
                "error": True,
                "error_message": "推理结果缺失"
            })
        else:
            processed_results.append({
                **data,
                "model_response": result_info["result"],
                "error": result_info["error"] is not None,
            })
            if result_info["error"]:
                processed_results[-1]["error_message"] = result_info["error"]
    
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


def save_results(results: List[Dict], output_path: str, create_dir: bool = True, append: bool = False) -> None:
    """保存结果到jsonl文件"""
    import json
    
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


async def process_single_file(
    input_file: str,
    output_file: str,
    prompt_generator: SimplePromptGenerator,
    inference_client: InferenceClient,
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
    
    # 清空输出文件（确保每次执行都是全新的文件）
    if os.path.exists(output_file):
        try:
            os.remove(output_file)
            logger.info(f"已清空输出文件: {output_file}")
        except Exception as e:
            logger.warning(f"清空输出文件失败: {output_file}, 错误: {str(e)}")
    else:
        # 如果文件不存在，确保输出目录存在
        output_dir = os.path.dirname(output_file)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
            logger.info(f"已创建输出目录: {output_dir}")
    
    total_count = 0
    batch_count = 0

    has_processed_any_batch_flag = False # 批次处理标志，用于判断当前文件是否执行过至少一次处理逻辑

    try:
        # 批量读取和处理数据
        for batch_idx, data_batch in enumerate(
            read_jsonl_batch(input_file, batch_size=data_batch_size, skip_errors=skip_errors),
            1
        ):
            processed_results = await process_batch(
                data_batch, batch_idx, prompt_generator, inference_client, output_file
            )

            # 将批次处理标志变量设置为True，代表当前数据集存在有效数据
            has_processed_any_batch_flag = True

            # 每个批次处理完立即追加保存
            is_first_batch = (batch_idx == 1)
            save_results(
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

        # 在返回结果前，判断当前推理结果集是否有被处理过
        # 避免当推理结果集所有的数据均为无效被跳过时，保存结果jsonl文件的逻辑不执行，导致结果文件路径下无对应结果文件，抛出404
        if not has_processed_any_batch_flag:
            logger.warning(f"输入文件 {input_file} 没有有效数据，创建空输出文件: {output_file}")
            save_results([], output_file, append=False)
            logger.info(f"已创建空输出文件: {output_file}")

        
        return total_count, batch_count
        
    except KeyboardInterrupt:
        logger.warning(f"用户中断，已处理并保存 {total_count} 条结果（{batch_count} 批）")
        raise
    except Exception as e:
        logger.error(f"处理文件 {input_file} 时发生错误: {str(e)}", exc_info=True)
        logger.info(f"已处理并保存 {total_count} 条结果（{batch_count} 批）")
        raise


async def process_all_file(
    prompt_generator: SimplePromptGenerator,
    inference_client: InferenceClient,
    config: Dict[str, Any]
) -> None:
    """处理所有输入文件并保存结果"""
    # 从配置中读取参数
    input_files = get_config_value(config, "runtime", "input_file", default=None)
    output_files = get_config_value(config, "runtime", "output_file", default=None)
    data_batch_size = get_config_value(config, "data", "batch_size", default=5000)
    progress_file = get_config_value(config, "runtime", "progress_file", default=None)
    
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
    
    try:
        for file_idx, (input_file, output_file) in enumerate(zip(input_files, output_files), 1):
            logger.info(f"\n{'=' * 80}")
            logger.info(f"处理文件 {file_idx}/{total_files}: {input_file}")
            logger.info(f"输出文件: {output_file}")
            logger.info(f"{'=' * 80}")
            
            file_total_count, file_batch_count = await process_single_file(
                input_file,
                output_file,
                prompt_generator,
                inference_client,
                config,
                total_lines,
                total_batches,
                all_total_count,
                all_batch_count
            )
            
            all_total_count += file_total_count
            all_batch_count += file_batch_count
            
            logger.info(f"\n文件 {file_idx}/{total_files} 处理完成:")
            logger.info(f"  批次数: {file_batch_count}")
            logger.info(f"  处理条数: {file_total_count}")
        
        # 输出总体统计信息
        logger.info(f"\n{'=' * 80}")
        logger.info("生成脚本执行完成")
        logger.info(f"  总文件数: {total_files}")
        logger.info(f"  实际处理批次: {all_batch_count} / 预计批次: {total_batches}")
        logger.info(f"  实际处理条数: {all_total_count} / 预计行数: {total_lines}")
        if all_total_count < total_lines:
            skipped = total_lines - all_total_count
            logger.warning(f"  跳过的数据条数: {skipped} ({skipped/total_lines*100:.2f}%)")
        logger.info(f"{'=' * 80}")
        
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
        raise
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
        raise


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
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>"
    )
    
    logger.info("=" * 80)
    logger.info("模型生成脚本启动（推理结果生成）")
    logger.info("=" * 80)
    
    try:
        # 从配置文件读取 client_type
        client_type = get_config_value(config, "runtime", "client_type", default=None)
        if not client_type:
            logger.error("必须在配置文件 runtime.client_type 中指定推理客户端类型（openai 或 vllm）")
            sys.exit(1)
        
        # 从配置文件读取 data_format（可选，默认为 None，使用 SimplePromptGenerator）
        data_format = get_config_value(config, "data", "format", default=None)
        if data_format:
            logger.info(f"数据格式: {data_format}")
        
        # 初始化组件
        prompt_generator, inference_client = initialize_components(config, client_type, data_format)
        
        progress_file = get_config_value(config, "runtime", "progress_file", default=None)
        if progress_file:
            logger.info(f"进度文件: {progress_file}")
        
        # 处理所有文件
        await process_all_file(
            prompt_generator,
            inference_client,
            config
        )
        
    except KeyboardInterrupt:
        logger.warning("用户中断执行")
        sys.exit(1)
    except Exception as e:
        logger.error(f"执行失败: {str(e)}", exc_info=True)
        sys.exit(1)
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

