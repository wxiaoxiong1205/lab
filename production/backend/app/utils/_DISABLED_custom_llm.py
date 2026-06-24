import os
import requests
import json
import asyncio
import aiohttp
import logging
from typing import Optional, Any, Tuple, Dict, Type, List, Union
from pydantic import BaseModel
import re
from dotenv import load_dotenv

from deepeval.models import DeepEvalBaseLLM


# 配置日志记录器
logger = logging.getLogger(__name__)

class CustomLLM(DeepEvalBaseLLM):
    def __init__(self, config: Dict[str, Any]):
        # 从配置字典中获取参数，提供默认值以防某些参数未指定
        self.base_url = config.get("base_url")
        self.api_key = config.get("api_key")
        if config.get("model"):
            self.model_name = config.get("model")
        else:
            self.model_name = config.get("model_name")
        self.temperature = config.get("temperature", 0.7)
        self.max_tokens = config.get("max_tokens")
        self.frequency_penalty = config.get("frequency_penalty", 0)
        self.presence_penalty = config.get("presence_penalty", 0)
        self.top_p = config.get("top_p", 1.0)
        self.system_prompt = config.get("system_prompt")
        
        
        # 验证必要的环境变量
        if not self.api_key:
            raise ValueError("api_key must be provided in config dictionary")
        if not self.base_url:
            raise ValueError("base_url must be provided in config dictionary")
    
    def load_model(self):
        # 不需要实际加载模型，因为我们使用API调用
        return self
    
    def get_model_name(self):
        return f"API-based LLM ({self.model_name})"
    
    def _build_headers(self):
        """构建API请求头"""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
    
    def _build_payload(self, prompt: str, response_format: Optional[Dict] = None):
        """构建API请求体"""
        messages = []
        
        # 如果提供了system prompt，添加到消息列表中
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
            
        # 添加用户消息
        messages.append({"role": "user", "content": prompt})
        
        payload = {
            "model": self.model_name,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "frequency_penalty": self.frequency_penalty,
            "presence_penalty": self.presence_penalty,
            "top_p": self.top_p
        }
        # 如果需要特定的响应格式（例如JSON）
        if response_format:
            payload["response_format"] = response_format
            
        return payload
    
    def _extract_content(self, response_json: Dict) -> str:
        """从API响应中提取生成的内容"""
        try:
            return response_json["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            error_msg = f"Error extracting content from response: {str(e)}"
            if "error" in response_json:
                error_msg += f". API Error: {response_json['error']}"
            raise ValueError(error_msg)
        
    def _format_prompt(self, prompt: str, schema: Optional[Type[BaseModel]]) -> str:
        """添加JSON格式要求到prompt"""
        if schema is None:
            return prompt
            
        # 从Pydantic模型生成JSON Schema
        schema_json = json.dumps(schema.schema(), indent=2)
        
        return f"""{prompt}

请严格按以下JSON格式返回数据，不要包含任何其他解释或标记：
{schema_json}

确保你的响应可以直接被解析为有效的JSON对象，且完全符合上述格式要求。"""
    
    def generate(self, prompt: str, schema: Optional[Type[BaseModel]] = None) -> Union[str, BaseModel]:
        """同步调用LLM API，可选择性地支持schema参数来格式化输出"""
        chat_endpoint = f"{self.base_url}/chat/completions"
        headers = self._build_headers()
        if schema:
            prompt = self._format_prompt(prompt, schema)
        logger.info(f'=============================prompt=====================:\n{prompt}\n')

        payload = self._build_payload(prompt)
        
        try:
            response = requests.post(
                chat_endpoint,
                headers=headers,
                json=payload,
                timeout=60  # 设置超时时间
            )
            response.raise_for_status()  # 检查HTTP错误
            response_json = response.json()
            content = self._extract_content(response_json)
            
            # 如果提供了schema，尝试解析JSON并返回schema实例
            if schema:
                try:
                    # 尝试提取JSON部分（处理模型可能生成的非JSON前缀/后缀）
                    json_match = re.search(r'(\{.*\}|\[.*\])', content, re.DOTALL)
                    if json_match:
                        content = json_match.group(1)
                    
                    # 解析JSON
                    data = json.loads(content)
                    
                    # 如果数据是列表类型，转换为字典
                    if isinstance(data, list):
                        data = {"response": data}
                    elif not isinstance(data, dict):
                        data = {"response": str(data)}
                    
                    return schema(**data)
                except (json.JSONDecodeError, ValueError) as e:
                    # 如果JSON解析失败，返回带response属性的对象
                    return type('Response', (), {'response': content})()
            
            # 如果没有提供schema或者解析失败，直接返回内容字符串
            return content
        except requests.exceptions.RequestException as e:
            # 处理HTTP请求相关错误
            raise RuntimeError(f"API request failed: {str(e)}")
        except Exception as e:
            # 处理其他所有错误
            raise RuntimeError(f"Error in generate method: {str(e)}")
    
    async def a_generate(self, prompt: str, schema: Optional[Type[BaseModel]] = None) -> Union[str, BaseModel]:
        """异步调用LLM API，可选择性地支持schema参数来格式化输出"""
        chat_endpoint = f"{self.base_url}/chat/completions"
        headers = self._build_headers()
        
        if schema:
            prompt = self._format_prompt(prompt, schema)
        # logger.info(f"prompt:\n{prompt}")
        
        payload = self._build_payload(prompt)
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    chat_endpoint,
                    headers=headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=300)  # 减少超时时间到5分钟
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise RuntimeError(f"API returned status {response.status}: {error_text}")
                    
                    response_json = await response.json()
                    content = self._extract_content(response_json)
                    
                    # 如果提供了schema，尝试解析JSON并返回schema实例
                    if schema:
                        try:
                            # 尝试提取JSON部分（处理模型可能生成的非JSON前缀/后缀）
                            json_match = re.search(r'(\{.*\}|\[.*\])', content, re.DOTALL)
                            if json_match:
                                content = json_match.group(1)
                            
                            # 解析JSON
                            data = json.loads(content)
                            
                            # 如果数据是列表类型，转换为字典
                            if isinstance(data, list):
                                data = {"response": data}
                            elif not isinstance(data, dict):
                                data = {"response": str(data)}
                            
                            return schema(**data)
                        except (json.JSONDecodeError, ValueError) as e:
                            # 如果JSON解析失败，返回带response属性的对象
                            return type('Response', (), {'response': content})()
                    
                    # 如果没有提供schema或者解析失败，直接返回内容字符串
                    return content
        except asyncio.TimeoutError:
            raise RuntimeError("API request timed out")
        except Exception as e:
            raise RuntimeError(f"Error in a_generate method: {str(e)}")