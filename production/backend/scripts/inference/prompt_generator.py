"""
Prompt生成模块
支持Jinja2模板引擎，从数据中提取变量并生成符合推理客户端格式的消息列表
"""

import os
from typing import Dict, List, Optional, Any, Tuple
from jinja2 import Template
from loguru import logger


class PromptGenerator:
    """Prompt生成器"""
    
    def __init__(
        self, 
        template_path: Optional[str] = None, 
        template_string: Optional[str] = None,
        metrics: Optional[List[Dict[str, Any]]] = None
    ):
        """
        初始化Prompt生成器
        
        Args:
            template_path: 模板文件路径
            template_string: 模板字符串（如果提供，则优先使用）
            metrics: 评估指标配置列表，每个元素包含：
                - name: 指标名称
                - description: 指标说明
                - score_min: 最小分数
                - score_max: 最大分数
                - score_definitions: 评分含义说明
                - field_mapping: 字段映射配置，将JSONL字段映射到模板变量
        """
        if template_string:
            self.template = Template(template_string)
            template_content = template_string
            logger.info("使用字符串模板初始化Prompt生成器")
        elif template_path:
            if not os.path.exists(template_path):
                raise FileNotFoundError(f"模板文件不存在: {template_path}")
            
            # 从文件加载模板
            with open(template_path, 'r', encoding='utf-8') as f:
                template_content = f.read()
            self.template = Template(template_content)
            logger.info(f"从文件加载模板: {template_path}")
        else:
            raise ValueError("必须提供template_path或template_string之一")
        
        # 保存metrics配置
        if not metrics:
            raise ValueError("metrics配置不能为空，请在配置文件中定义评估指标列表")
        self.metrics = metrics
        logger.info(f"已加载 {len(metrics)} 个评估指标配置")
    
    def _parse_prompt_to_messages(self, prompt_text: str) -> List[Dict[str, str]]:
        """
        解析模板生成的文本为消息列表
        
        支持两种格式：
        1. 包含分隔符的格式：
           ---SYSTEM---
           系统提示内容
           ---USER---
           用户内容
           
        2. 纯文本格式（向后兼容）：
           整个文本作为user消息
        
        Args:
            prompt_text: 模板渲染后的文本
        
        Returns:
            消息列表，格式: [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]
            或 [{"role": "user", "content": "..."}]
        """
        # 检查是否包含分隔符
        if "---SYSTEM---" in prompt_text and "---USER---" in prompt_text:
            # 分割system和user部分
            parts = prompt_text.split("---SYSTEM---", 1)
            if len(parts) == 2:
                remaining = parts[1].split("---USER---", 1)
                if len(remaining) == 2:
                    system_content = remaining[0].strip()
                    user_content = remaining[1].strip()
                    
                    messages = []
                    if system_content:
                        messages.append({"role": "system", "content": system_content})
                    if user_content:
                        messages.append({"role": "user", "content": user_content})
                    
                    return messages if messages else [{"role": "user", "content": prompt_text}]
        
        # 向后兼容：如果没有分隔符，整个文本作为user消息
        return [{"role": "user", "content": prompt_text}]
    
    def _ensure_flat_fields_from_messages(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        兼容 导入的推理结果集：若数据仅有 messages 而无顶层 system/prompt/response/model_response，
        则 补全

        """
        if not isinstance(data, dict):
            return data
        if "system" not in data:
            data["system"] = ""
        if "prompt" not in data:
            data["prompt"] = ""
        if "response" not in data:
            data["response"] = ""
        if "model_response" not in data:
            data["model_response"] = ""
        return data
    
    def generate_for_metrics_batch(
        self,
        data_list: List[Dict[str, Any]]
    ) -> Tuple[List[List[Dict[str, str]]], List[Dict[str, Any]]]:
        """
        为一批数据根据多个评估指标（metrics）生成消息列表
        
        每条输入数据会为每个metric生成一个消息列表，最终返回扁平化的消息列表，
        以及与之对应的元数据列表（用于后续将推理结果还原为每条数据的评估结果）。
        
        输出顺序：按数据优先、指标次优的顺序排列
        例如：data1-metric1, data1-metric2, data2-metric1, data2-metric2, ...
        
        Args:
            data_list: 原始数据字典列表（每个元素对应一行JSONL）
        
        Returns:
            messages_list: 消息列表（长度=数据条数 * 指标数），顺序为：
                    [[{"role": "user", "content": "..."}], ...] 
                    每个元素是一个消息列表，与推理客户端的输入格式一致
            prompt_meta: 与messages_list等长的元数据列表，每个元素包含：
                - sample_index: 原始数据在当前batch中的索引（0, 0, 1, 1, ...）
                - metric: 对应的指标配置字典
        
        Raises:
            ValueError: 如果字段映射配置错误，或模板渲染失败
        """
        messages_list: List[List[Dict[str, str]]] = []
        prompt_meta: List[Dict[str, Any]] = []
        
        for sample_index, data in enumerate(data_list):
            for metric in self.metrics:
                metric_name = metric.get("name")
                field_mapping = metric.get("field_mapping") or {}
                
                # 兼容 导入的推理结果集的情况，自带的四个内置字段可能不存在
                data = self._ensure_flat_fields_from_messages(data)
                
                # 构造渲染数据：包含原始数据 + metric信息 + 映射后的字段
                mapped_data = data.copy()
                mapped_data["metric"] = {
                    "name": metric.get("name"),
                    "description": metric.get("description"),
                    "score_min": metric.get("score_min"),
                    "score_max": metric.get("score_max"),
                    "score_definitions": metric.get("score_definitions"),
                }
                
                # 应用字段映射
                # system 字段为 null/空 视为正常，替换为空字符串；其他字段为 null/空 则记为数据错误
                missing_fields = []
                null_fields = []
                for template_var, jsonl_field in field_mapping.items():
                    if jsonl_field in data:
                        field_value = data[jsonl_field]
                        # 去除首尾空格，兼容多个空格的情况
                        if field_value is not None and isinstance(field_value, str):
                            field_value = field_value.strip()
                        # 检查字段值是否为 None 或空字符串（去除空格后）
                        if field_value is None or field_value == "":
                            is_system_field = (
                                str(template_var).strip().lower() == "system"
                                or str(jsonl_field).strip().lower() == "system"
                            )
                            if is_system_field:
                                mapped_data[template_var] = ""
                            else:
                                null_fields.append(f"{jsonl_field} (映射到 {template_var})")
                                mapped_data[template_var] = None
                        else:
                            mapped_data[template_var] = field_value
                    else:
                        missing_fields.append(f"{jsonl_field} (映射到 {template_var})")
                
                # 如果字段不存在，抛出错误（这是配置错误）
                if missing_fields:
                    error_msg = (
                        f"字段映射配置的字段在数据中不存在: {missing_fields}。"
                        f" 当前metric: {metric_name}，数据中已有的字段: {list(data.keys())}"
                    )
                    logger.error(error_msg)
                    raise ValueError(error_msg)
                
                # 如果字段值为 None 或空字符串，标记为数据错误，但不抛出异常（继续处理其他数据）
                has_data_error = False
                data_error_message = None
                if null_fields:
                    has_data_error = True
                    data_error_message = (
                        f"字段内容缺少，跳过计算: {null_fields}。"
                        f" 当前metric: {metric_name}"
                    )
                    logger.warning(data_error_message)
                
                # 如果字段值为 None，跳过 prompt 生成，直接标记为错误
                if has_data_error:
                    # 字段内容缺少，不生成 prompt，直接标记为错误
                    # 创建一个空的 messages 列表（后续处理会识别为错误），推理端会跳过不调用 vLLM
                    messages = []
                    messages_list.append(messages)
                    prompt_meta.append({
                        "sample_index": sample_index,
                        "metric": metric,
                        "has_data_error": True,
                        "error_message": data_error_message
                    })
                    # 打印上下文：哪条数据、哪个指标、哪些字段为空，便于排查「按理不该为空」的数据问题
                    field_mapping_keys = list(field_mapping.values()) if field_mapping else []
                    data_preview = {}
                    for k in field_mapping_keys:
                        if k not in data:
                            continue
                        v = data.get(k)
                        s = repr(v)
                        data_preview[k] = s[:80] + "..." if len(s) > 80 else v
                    logger.warning(
                        f"评估占位空 messages：数据条索引={sample_index}，指标={metric_name}，"
                        f"空字段={null_fields}，该条数据相关字段预览={data_preview}"
                    )
                else:
                    try:
                        prompt_text = self.template.render(**mapped_data)
                    except Exception as e:
                        logger.error(f"为metric[{metric_name}]生成prompt失败: {str(e)}, 数据: {data}")
                        raise ValueError(f"为metric[{metric_name}]生成prompt失败: {str(e)}")
                    
                    # 解析模板输出，支持system和user角色分离
                    # 格式：如果包含 ---SYSTEM--- 和 ---USER--- 分隔符，则分别提取
                    messages = self._parse_prompt_to_messages(prompt_text)
                    messages_list.append(messages)
                    prompt_meta.append({
                        "sample_index": sample_index,
                        "metric": metric,
                        "has_data_error": False,
                        "error_message": None
                    })
        
        logger.info(
            f"多指标消息生成完成: 数据条数={len(data_list)}, 指标数={len(self.metrics)}, "
            f"总消息数={len(messages_list)}"
        )
        return messages_list, prompt_meta

