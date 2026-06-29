"""
模型调用工具模块
提供统一的模型调用接口，支持多种模型类型和数据格式
可扩展设计，便于支持不同模型的输入输出结构
"""

import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List
from enum import Enum

import httpx
from app.core.logging import logger


class DatasetFormat(str, Enum):
    """数据格式枚举"""
    PROMPT_RESPONSE = "prompt-response"
    ALPACA = "alpaca"
    ROLE_BASED = "role-based"
    IMAGE_PROMPT = "image-prompt"
    PREFIX_SUFFIX_MIDDLE = "prefix-suffix-middle"
    GRPO = "grpo"


@dataclass
class ModelConfig:
    """模型配置"""
    model_id: int
    model_name: str
    base_url: str
    api_key: str
    timeout: int = 120
    max_retries: int = 3


@dataclass
class InferenceParams:
    """推理参数（可扩展）"""
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    top_p: float = 1.0
    presence_penalty: float = 0.0
    frequency_penalty: float = 0.0
    # 可以添加更多参数
    extra_params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ModelCallResult:
    """模型调用结果"""
    success: bool
    content: Optional[str] = None
    raw_response: Optional[Dict[str, Any]] = None
    usage: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    elapsed_time: float = 0.0


class BaseModelCaller(ABC):
    """模型调用器基类"""
    
    def __init__(self, config: ModelConfig, params: Optional[InferenceParams] = None):
        self.config = config
        self.params = params or InferenceParams()
    
    @abstractmethod
    async def call(self, messages: List[Dict[str, str]]) -> ModelCallResult:
        """调用模型"""
        pass
    
    @abstractmethod
    async def call_stream(self, messages: List[Dict[str, str]]):
        """流式调用模型，返回异步生成器"""
        pass
    
    @abstractmethod
    def build_messages(self, raw_data: Dict[str, Any], dataset_format: str, image_base_url: Optional[str] = None) -> List[Dict[str, str]]:
        """根据数据格式构建消息
        
        Args:
            raw_data: 原始数据
            dataset_format: 数据格式
            image_base_url: 图片访问的基础URL（图像理解数据集时使用，可选）
        """
        pass
    
    @abstractmethod
    def parse_response(self, result: ModelCallResult, dataset_format: str, raw_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """解析模型响应为标注结果"""
        pass


class OpenAICompatibleCaller(BaseModelCaller):
    """OpenAI兼容API调用器（支持大多数LLM服务）"""
    
    async def call(self, messages: List[Dict[str, str]]) -> ModelCallResult:
        """调用OpenAI兼容的API"""
        start_time = time.time()
        
        # base_url 已经是完整路径，直接使用
        url = self.config.base_url
        
        # 构建请求头
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json"
        }
        
        # 构建请求体
        payload = {
            "model": self.config.model_name,
            "messages": messages,
            "temperature": self.params.temperature,
            "top_p": self.params.top_p,
            "presence_penalty": self.params.presence_penalty,
            "frequency_penalty": self.params.frequency_penalty,
            "stream": False
        }
        
        # 添加max_tokens（如果设置了）
        if self.params.max_tokens:
            payload["max_tokens"] = self.params.max_tokens
        
        # 添加额外参数
        if self.params.extra_params:
            payload.update(self.params.extra_params)
        
        # 发起请求
        for retry in range(self.config.max_retries):
            try:
                async with httpx.AsyncClient(timeout=self.config.timeout) as client:
                    response = await client.post(url, headers=headers, json=payload)
                    
                    if response.status_code == 200:
                        data = response.json()
                        elapsed = time.time() - start_time
                        
                        # 解析响应
                        content = None
                        if data.get("choices") and len(data["choices"]) > 0:
                            choice = data["choices"][0]
                            if choice.get("message"):
                                content = choice["message"].get("content", "")
                        
                        return ModelCallResult(
                            success=True,
                            content=content,
                            raw_response=data,
                            usage=data.get("usage"),
                            elapsed_time=elapsed
                        )
                    else:
                        error_msg = f"HTTP {response.status_code}: {response.text}"
                        logger.warning(f"模型调用失败 (重试 {retry + 1}/{self.config.max_retries}): {error_msg}")
                        
                        if retry == self.config.max_retries - 1:
                            return ModelCallResult(
                                success=False,
                                error=error_msg,
                                elapsed_time=time.time() - start_time
                            )
                        
            except Exception as e:
                error_msg = str(e)
                logger.warning(f"模型调用异常 (重试 {retry + 1}/{self.config.max_retries}): {error_msg}")
                
                if retry == self.config.max_retries - 1:
                    return ModelCallResult(
                        success=False,
                        error=error_msg,
                        elapsed_time=time.time() - start_time
                    )
        
        return ModelCallResult(
            success=False,
            error="未知错误",
            elapsed_time=time.time() - start_time
        )
    
    async def call_stream(self, messages: List[Dict[str, str]]):
        """流式调用OpenAI兼容的API，返回异步生成器"""
        # base_url 已经是完整路径，直接使用
        url = self.config.base_url
        
        # 构建请求头
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json"
        }
        
        # 构建请求体（开启流式）
        payload = {
            "model": self.config.model_name,
            "messages": messages,
            "temperature": self.params.temperature,
            "top_p": self.params.top_p,
            "presence_penalty": self.params.presence_penalty,
            "frequency_penalty": self.params.frequency_penalty,
            "stream": True  # 开启流式输出
        }
        
        if self.params.max_tokens:
            payload["max_tokens"] = self.params.max_tokens
        
        if self.params.extra_params:
            payload.update(self.params.extra_params)
        
        
        try:
            logger.info(f"[call_stream] 开始流式请求，url={url}, model={self.config.model_name}")
            async with httpx.AsyncClient(timeout=self.config.timeout) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    logger.info(f"[call_stream] 收到响应，status_code={response.status_code}")
                    if response.status_code != 200:
                        error_text = await response.aread()
                        error_msg = f"HTTP {response.status_code}: {error_text.decode()}"
                        logger.error(f"[call_stream] HTTP错误: {error_msg}")
                        # 返回标准 OpenAI SSE 错误格式
                        error_data = {
                            "error": {
                                "message": error_msg,
                                "type": "http_error",
                                "code": str(response.status_code)
                            }
                        }
                        yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
                        return
                    
                    # 使用 aiter_text() 读取文本流，保持 SSE 格式完整性
                    # 设置 chunk_size 为 None 以按行读取，保持原始格式
                    async for text_chunk in response.aiter_text(chunk_size=None):
                        # 直接转发原始文本，保持 SSE 格式不变
                        if text_chunk:
                            yield text_chunk
                                
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[call_stream] 异常: {error_msg}", exc_info=True)
            # 返回标准 OpenAI SSE 错误格式
            error_data = {
                "error": {
                    "message": error_msg,
                    "type": "internal_error",
                    "code": "internal_error"
                }
            }
            yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
    
    def build_messages(self, raw_data: Dict[str, Any], dataset_format: str, image_base_url: Optional[str] = None) -> List[Dict[str, str]]:
        """根据数据格式构建OpenAI消息格式
        
        Args:
            raw_data: 原始数据
            dataset_format: 数据格式
            image_base_url: 图片访问的基础URL（图像理解数据集时使用，可选）
        """
        messages = []
        annotation_target = raw_data.get("annotation_target")

        def _collect_task_text() -> str:
            parts: List[str] = []
            for key in ("prompt", "instruction", "input", "text", "prefix", "suffix"):
                value = raw_data.get(key)
                if isinstance(value, str) and value.strip():
                    parts.append(value.strip())
            raw_messages = raw_data.get("messages", [])
            if isinstance(raw_messages, list):
                for item in raw_messages:
                    if isinstance(item, dict):
                        content = item.get("content")
                        if isinstance(content, str) and content.strip():
                            parts.append(content.strip())
            return "\n".join(parts)

        def _infer_rejected_task_style() -> str:
            text = _collect_task_text()
            if not text:
                return "generic"
            lower_text = text.lower()
            if (
                "一句话概括" in text
                or "概括全部内容" in text
                or "约15个单词" in text
                or "字数" in text
                or "摘要" in text
                or "总结" in text
                or "概述" in text
                or "summar" in lower_text
            ):
                return "summary"
            if "rdf" in lower_text or "三元组" in text:
                return "rdf"
            if (
                "json" in lower_text
                or "列表" in text
                or "数组" in text
                or "格式为" in text
                or "输出为 [" in text
                or "结构化" in text
            ):
                return "structured"
            return "generic"

        def _rejected_user_suffix() -> str:
            if annotation_target != "rejected":
                return ""
            rejected_style = _infer_rejected_task_style()
            if rejected_style == "rdf":
                return (
                    "\n\n附加要求：保持原任务要求的输出结构不变，只输出三元组列表本身。"
                    "请故意让结果比标准答案略差，但只能保留一处轻微缺陷。"
                    "优先从以下方式中任选一种：把一个关系词写得更笼统一点，或让一个指代不完全消解。"
                    "不要解释，不要加注释，不要输出结构外文字。"
                )
            if rejected_style == "structured":
                return (
                    "\n\n附加要求：保持原任务要求的结构化格式不变，只输出结构本身。"
                    "请故意加入一处轻微缺陷，例如表述不够精确、字段值略冗余或不够规范。"
                    "不要解释，不要输出结构外文字。"
                )
            if rejected_style == "summary":
                return (
                    "\n\n附加要求：答案要比理想答案更冗长一些，可以轻微超出字数要求或出现少量重复表达，"
                    "但仍需围绕原任务作答。不要解释。"
                )
            return (
                "\n\n附加要求：答案要比理想答案更拖沓、略显冗长或不够凝练，"
                "但仍需围绕原任务作答。不要解释。"
            )

        def _default_system_prompt() -> str:
            base_rules = (
                "你是用于数据标注生成的助手。"
                "只输出最终答案正文，不要输出寒暄、客套话、解释自己在做什么、标题、前缀、后缀、编号、致谢、免责声明或 markdown 代码块。"
                "除非任务明确要求，否则不要复述题目，不要额外展开背景，不要写“好的”“当然可以”“以下是”等冗余语句。"
                "优先保持表达紧凑、信息充分、措辞自然。"
            )

            if annotation_target == "chosen":
                target_rules = (
                    "请生成一个高质量答案：准确、完整、贴合指令，信息密度高，但避免空泛铺垫和重复表述。"
                    "答案不得包含事实错误、关系错配、关键遗漏、无关补充或格式外内容。"
                )
            elif annotation_target == "rejected":
                rejected_style = _infer_rejected_task_style()
                if rejected_style == "summary":
                    target_rules = (
                        "请生成一个较差但仍相关的摘要/概括类答案。"
                        "优先使用风格缺陷：字数偏多、表达啰嗦、信息重复、概括不够凝练、保留不必要细节、轻微偏离字数要求。"
                        "不要把答案写成完全正确且简洁的版本。"
                    )
                elif rejected_style == "rdf":
                    target_rules = (
                        "请生成一个较差但仍相关的 RDF/三元组结构化答案。"
                        "必须严格保持用户要求的外层格式正确，例如仍输出三元组列表。"
                        "但必须在恰好一处引入一个可控缺陷，并让结果与高质量答案可区分。"
                        "优先使用以下缺陷之一：关系词不够精确、实体指代未完全消解、实体边界略粗、一个三元组表述过于笼统。"
                        "不要把所有三元组都改坏，不要完全错误，不要增加结构外说明。"
                    )
                elif rejected_style == "structured":
                    target_rules = (
                        "请生成一个较差但仍相关的结构化答案。"
                        "必须保持用户要求的结构格式正确，但内容上应至少存在一处轻微缺陷，例如关系词不够精确、字段值略显啰嗦、包含轻微冗余元素、表达不够规范。"
                        "不要生成与高质量答案完全一致的结果。"
                        "不要额外增加结构外说明，不要输出解释文本。"
                    )
                else:
                    target_rules = (
                        "请生成一个较差但仍相关的答案，但优先使用风格与表达层面的缺陷，而不是事实性错误。"
                        "优先选择以下缺陷之一或多项：啰嗦、冗长、信息重复、表达拖沓、不够凝练、不符合字数要求、包含不必要铺垫、过度解释。"
                        "只有在确有需要时，才使用轻微遗漏或轻微不精确；不要完全答非所问，不要输出危险、违法、辱骂或明显胡编乱造的内容。"
                        "该答案必须与高质量答案有可辨别差异，不要把答案写成完全正确且简洁的版本。"
                    )
                target_rules += (
                    "必须严格遵守用户要求的输出格式，只输出答案本身。"
                    "不要输出任何解释、注释、说明、理由、前后缀、标题、\"注：\"、\"说明：\"或额外文本。"
                )
            else:
                target_rules = (
                    "请严格按照输入任务要求作答；如果任务要求简洁，就保持简洁；如果任务要求结构化，就严格遵守目标格式。"
                )

            if dataset_format == DatasetFormat.ALPACA.value:
                format_rules = "这是偏好/指令数据生成场景，答案应直接可作为候选回复内容。"
            elif dataset_format == DatasetFormat.ROLE_BASED.value:
                format_rules = "这是对话数据生成场景，答案应直接可作为 assistant 单轮回复内容。"
            elif dataset_format == DatasetFormat.GRPO.value:
                format_rules = "这是 GRPO 训练样本标注场景，答案应直接可作为 reward_model.ground_truth。"
            elif dataset_format == DatasetFormat.IMAGE_PROMPT.value:
                format_rules = "这是图像生成训练样本标注场景，答案应直接可作为 image-prompt 的文字字段内容。"
            elif dataset_format == DatasetFormat.PREFIX_SUFFIX_MIDDLE.value:
                format_rules = "这是补全文本场景，只输出需要补全的内容本身。"
            else:
                format_rules = "这是通用问答场景，直接输出符合要求的回答内容。"

            if annotation_target == "rejected":
                format_rules += " 如果用户要求列表、JSON、三元组或其他结构化格式，只能输出该结构本身。"

            return f"{base_rules}\n\n{target_rules}\n\n{format_rules}"

        def _merge_system_prompt(existing_system_prompt: str = "") -> str:
            default_prompt = _default_system_prompt()
            existing_system_prompt = (existing_system_prompt or "").strip()
            if existing_system_prompt:
                return f"{default_prompt}\n\n{existing_system_prompt}"
            return default_prompt
        
        if dataset_format == DatasetFormat.PROMPT_RESPONSE.value:
            # prompt-response格式：直接将prompt作为用户消息
            prompt = raw_data.get("prompt", "")
            prompt += _rejected_user_suffix()
            if prompt:
                messages.append({"role": "user", "content": prompt})
            
            system_prompt = raw_data.get("system", "") or raw_data.get("system_prompt", "")
            system_prompt = _merge_system_prompt(system_prompt)
            if system_prompt:
                messages.insert(0, {"role": "system", "content": system_prompt})

        elif dataset_format == DatasetFormat.ALPACA.value:
            # alpaca格式：将 instruction/input 组织成单轮用户消息
            instruction = raw_data.get("instruction", "") or raw_data.get("prompt", "")
            input_text = raw_data.get("input", "")
            prompt_parts = []
            if instruction:
                prompt_parts.append(f"指令：\n{instruction}")
            if input_text:
                prompt_parts.append(f"输入：\n{input_text}")
            prompt = "\n\n".join(prompt_parts).strip()
            prompt += _rejected_user_suffix()

            if prompt:
                messages.append({"role": "user", "content": prompt})

            system_prompt = raw_data.get("system", "") or raw_data.get("system_prompt", "")
            system_prompt = _merge_system_prompt(system_prompt)
            if system_prompt:
                messages.insert(0, {"role": "system", "content": system_prompt})
                
        elif dataset_format in (DatasetFormat.ROLE_BASED.value, DatasetFormat.GRPO.value):
            # role-based 使用 messages；GRPO 使用 verl prompt 消息数组。
            raw_messages = raw_data.get("messages", []) if dataset_format == DatasetFormat.ROLE_BASED.value else raw_data.get("prompt", [])
            if isinstance(raw_messages, list):
                messages.append({"role": "system", "content": _default_system_prompt()})
                images_base64 = raw_data.get("images_base64", [])
                image_index = 0  # 用于跟踪已使用的图片索引
                
                for msg in raw_messages:
                    if isinstance(msg, dict) and "role" in msg and "content" in msg:
                        message_dict = {
                            "role": msg["role"],
                            "content": msg["content"]
                        }
                        
                        # 图像理解数据集：处理content中的<image>标签
                        if images_base64 and isinstance(images_base64, list) and len(images_base64) > 0:
                            content = msg.get("content", "")
                            role = msg.get("role", "")
                            
                            # 只处理user消息中的<image>标签
                            if role == "user" and isinstance(content, str) and "<image>" in content:
                                # 解析content中的<image>标签，替换为实际的图片base64
                                content_parts = []
                                parts = content.split("<image>")
                                
                                for i, part in enumerate(parts):
                                    # 添加文本部分
                                    if part.strip():
                                        content_parts.append({
                                            "type": "text",
                                            "text": part
                                        })
                                    
                                    # 如果不是最后一个部分，添加图片（因为split后，最后一个部分后面没有<image>）
                                    if i < len(parts) - 1:
                                        if image_index < len(images_base64):
                                            content_parts.append({
                                                "type": "image_url",
                                                "image_url": {
                                                    "url": images_base64[image_index]
                                                }
                                            })
                                            image_index += 1
                                        else:
                                            logger.warning(f"图片数量不足：content中有{len(parts)-1}个<image>标签，但只有{len(images_base64)}张图片")
                                
                                # 如果content_parts为空（只有<image>标签），至少添加图片
                                if not content_parts and image_index < len(images_base64):
                                    content_parts.append({
                                        "type": "image_url",
                                        "image_url": {
                                            "url": images_base64[image_index]
                                        }
                                    })
                                    image_index += 1
                                
                                message_dict["content"] = content_parts
                            elif role == "user" and image_index < len(images_base64):
                                # user消息没有<image>标签但是有剩余图片，将图片添加到content末尾（向后兼容）
                                content_list = []
                                if content:
                                    content_list.append({
                                        "type": "text",
                                        "text": content
                                    })
                                # 添加所有剩余的图片
                                while image_index < len(images_base64):
                                    content_list.append({
                                        "type": "image_url",
                                        "image_url": {
                                            "url": images_base64[image_index]
                                        }
                                    })
                                    image_index += 1
                                
                                if content_list:
                                    message_dict["content"] = content_list
                        elif image_base_url:
                            # 检查是否应该有图片但转换失败
                            images = raw_data.get("images", [])
                            if images and isinstance(images, list) and len(images) > 0:
                                # 如果有images字段且不为空，说明应该有图片但转换失败
                                logger.error("图像理解数据集缺少base64数据，图片转换可能失败")
                                raise ValueError("图像理解数据集缺少base64数据，无法构建消息")
                            # 如果没有images字段或为空，说明这条数据确实没有图片，正常处理即可
                        
                        messages.append(message_dict)

        elif dataset_format == DatasetFormat.IMAGE_PROMPT.value:
            prompt = raw_data.get("prompt", "") or "请根据图片生成适合图像生成训练的文字描述。"
            messages.append({"role": "system", "content": _default_system_prompt()})
            images_base64 = raw_data.get("images_base64", [])
            if images_base64 and isinstance(images_base64, list):
                content_parts = []
                if prompt:
                    content_parts.append({"type": "text", "text": prompt})
                for image_base64 in images_base64:
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {"url": image_base64}
                    })
                messages.append({"role": "user", "content": content_parts})
            else:
                messages.append({"role": "user", "content": prompt})
                            
        elif dataset_format == DatasetFormat.PREFIX_SUFFIX_MIDDLE.value:
            # prefix-suffix-middle格式：构建填充中间内容的提示
            prefix = raw_data.get("prefix", "")
            suffix = raw_data.get("suffix", "")
            
            # 构建提示词
            prompt = f"请根据以下上下文，填充中间部分的内容：\n\n前文：\n{prefix}\n\n后文：\n{suffix}\n\n请生成中间部分的内容："
            messages.append({"role": "user", "content": prompt})
            
        else:
            # 默认处理：尝试从raw_data中提取可用信息
            if "prompt" in raw_data:
                messages.append({"role": "user", "content": str(raw_data["prompt"])})
            elif "input" in raw_data:
                messages.append({"role": "user", "content": str(raw_data["input"])})
            elif "text" in raw_data:
                messages.append({"role": "user", "content": str(raw_data["text"])})
            else:
                # 将整个数据作为JSON字符串
                messages.append({"role": "user", "content": json.dumps(raw_data, ensure_ascii=False)})
        
        return messages
    
    def parse_response(self, result: ModelCallResult, dataset_format: str, raw_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """解析模型响应为标注结果（根据数据格式）"""
        annotation = {}
        raw_data = raw_data or {}
        
        if not result.success or not result.content:
            return annotation
        
        if dataset_format == DatasetFormat.PROMPT_RESPONSE.value:
            # prompt-response格式：响应内容放入response字段
            annotation["response"] = result.content

        elif dataset_format == DatasetFormat.ALPACA.value:
            # alpaca格式：默认将模型生成结果写入 chosen 字段
            annotation["chosen"] = result.content
            
        elif dataset_format == DatasetFormat.ROLE_BASED.value:
            annotation_target = raw_data.get("annotation_target")
            if annotation_target == "chosen":
                annotation["chosen"] = {"role": "assistant", "content": result.content}
            elif annotation_target == "rejected":
                annotation["rejected"] = {"role": "assistant", "content": result.content}
            else:
                # role-based SFT格式：将响应封装为assistant消息
                annotation["messages"] = [
                    {"role": "assistant", "content": result.content}
                ]
            
        elif dataset_format == DatasetFormat.PREFIX_SUFFIX_MIDDLE.value:
            # prefix-suffix-middle格式：响应内容放入middle字段
            annotation["middle"] = result.content

        elif dataset_format == DatasetFormat.IMAGE_PROMPT.value:
            annotation["prompt"] = result.content

        elif dataset_format == DatasetFormat.GRPO.value:
            annotation["reward_model"] = {
                "ground_truth": result.content
            }
            
        else:
            # 默认：放入response字段
            annotation["response"] = result.content
        
        return annotation


class ModelCallerFactory:
    """模型调用器工厂"""
    
    @staticmethod
    def create(
        caller_type: str,
        config: ModelConfig,
        params: Optional[InferenceParams] = None
    ) -> BaseModelCaller:
        """
        创建模型调用器
        
        Args:
            caller_type: 调用器类型（openai, vllm等，目前都使用OpenAI兼容接口）
            config: 模型配置
            params: 推理参数
            
        Returns:
            模型调用器实例
        """
        # 目前所有类型都使用OpenAI兼容接口
        # 未来可以扩展支持其他类型
        if caller_type.lower() in ["openai", "vllm", "openai_compatible"]:
            return OpenAICompatibleCaller(config, params)
        else:
            # 默认使用OpenAI兼容接口
            logger.warning(f"未知的调用器类型 '{caller_type}'，使用默认OpenAI兼容接口")
            return OpenAICompatibleCaller(config, params)


async def call_model_for_annotation(
    model_config: ModelConfig,
    raw_data: Dict[str, Any],
    dataset_format: str,
    inference_params: Optional[InferenceParams] = None,
    caller_type: str = "openai",
    image_base_url: Optional[str] = None
) -> tuple[ModelCallResult, Dict[str, Any]]:
    """
    便捷函数：调用模型进行标注
    
    Args:
        model_config: 模型配置
        raw_data: 原始数据
        dataset_format: 数据格式
        inference_params: 推理参数
        caller_type: 调用器类型
        image_base_url: 图片访问的基础URL（图像理解数据集时使用，可选）
        
    Returns:
        (调用结果, 解析后的标注内容)
    """
    caller = ModelCallerFactory.create(caller_type, model_config, inference_params)
    
    # 构建消息
    messages = caller.build_messages(raw_data, dataset_format, image_base_url)
    
    if not messages:
        return ModelCallResult(
            success=False,
            error="无法从原始数据构建有效的消息"
        ), {}
    
    # 调用模型
    result = await caller.call(messages)
    
    # 解析响应
    annotation = caller.parse_response(result, dataset_format, raw_data)
    
    return result, annotation


async def call_model_for_annotation_stream(
    model_config: ModelConfig,
    raw_data: Dict[str, Any],
    dataset_format: str,
    inference_params: Optional[InferenceParams] = None,
    caller_type: str = "openai",
    image_base_url: Optional[str] = None
):
    """
    流式调用模型进行标注（SSE生成器）
    
    Args:
        model_config: 模型配置
        raw_data: 原始数据
        dataset_format: 数据格式
        inference_params: 推理参数
        caller_type: 调用器类型
        image_base_url: 图片访问的基础URL（图像理解数据集时使用，可选）
        
    Yields:
        SSE格式的数据块
    """
    logger.info(f"[call_model_for_annotation_stream] 开始流式调用，model_id={model_config.model_id}, dataset_format={dataset_format}")
    caller = ModelCallerFactory.create(caller_type, model_config, inference_params)
    
    # 构建消息
    messages = caller.build_messages(raw_data, dataset_format, image_base_url)
    logger.info(f"[call_model_for_annotation_stream] 构建消息完成，消息数量={len(messages)}")
    
    if not messages:
        error_data = {
            "error": {
                "message": "无法从原始数据构建有效的消息",
                "type": "invalid_request",
                "code": "invalid_messages"
            }
        }
        error_msg = f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
        logger.error(f"[call_model_for_annotation_stream] 无法构建消息，返回错误")
        yield error_msg
        return
    
    # 流式调用模型，直接转发原始的 SSE 格式
    chunk_count = 0
    async for sse_line in caller.call_stream(messages):
        chunk_count += 1
        
        # 检查是否是错误响应（字典格式，这种情况不应该发生，因为现在都返回字符串）
        if isinstance(sse_line, dict):
            if "error" in sse_line:
                # 如果收到字典格式的错误，转换为标准 OpenAI SSE 错误格式
                error_data = {
                    "error": {
                        "message": sse_line['error'] if isinstance(sse_line['error'], str) else str(sse_line['error']),
                        "type": "api_error",
                        "code": "api_error"
                    }
                }
                error_msg = f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
                logger.error(f"[call_model_for_annotation_stream] 收到错误: {sse_line['error']}")
                yield error_msg
                return
            else:
                logger.warning(f"[call_model_for_annotation_stream] 收到未知字典格式: {sse_line}")
                continue
        
        # 直接转发原始的 SSE 行
        yield sse_line
    
    logger.info(f"[call_model_for_annotation_stream] 流式调用完成，总chunk数={chunk_count}")


def _build_annotation(content: str, dataset_format: str, raw_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """根据数据格式构建标注结果"""
    annotation = {}
    raw_data = raw_data or {}
    
    if dataset_format == DatasetFormat.PROMPT_RESPONSE.value:
        annotation["response"] = content
    elif dataset_format == DatasetFormat.ALPACA.value:
        annotation["chosen"] = content
    elif dataset_format == DatasetFormat.ROLE_BASED.value:
        annotation_target = raw_data.get("annotation_target")
        if annotation_target == "chosen":
            annotation["chosen"] = {"role": "assistant", "content": content}
        elif annotation_target == "rejected":
            annotation["rejected"] = {"role": "assistant", "content": content}
        else:
            annotation["messages"] = [{"role": "assistant", "content": content}]
    elif dataset_format == DatasetFormat.PREFIX_SUFFIX_MIDDLE.value:
        annotation["middle"] = content
    elif dataset_format == DatasetFormat.IMAGE_PROMPT.value:
        annotation["prompt"] = content
    else:
        annotation["response"] = content
    
    return annotation
