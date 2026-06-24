"""
推理客户端模块
支持OpenAI和vLLM两种推理方式，提供统一接口
"""

import os
import time
import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Any
from loguru import logger
import httpx

try:
    from vllm import LLM, SamplingParams
except ImportError:
    LLM = None
    SamplingParams = None   
    logger.warning("vllm库未安装，vLLM客户端不可用")


# ==================== 参数类定义 ====================

@dataclass
class OpenAIClientConfig:
    """OpenAI客户端配置参数"""
    api_key: str  # 必需，OpenAI API密钥，用于身份认证
    base_url: str  # 必需，OpenAI API基础URL，私有化部署时需要指定
    model: str  # 必需，OpenAI模型名称，如"gpt-4"、"gpt-3.5-turbo"等
    timeout: int = 120  # 请求超时时间（秒），默认120秒，超过此时间未响应将抛出超时异常
    max_retries: int = 3  # 最大重试次数，默认3次，当请求失败时会自动重试
    max_concurrent: int = 10  # 最大并发数，默认10，控制同时进行的请求数，避免触发速率限制
    unsupported_params: Optional[List[str]] = None  # 可选，不兼容的推理参数名列表，如 ["presence_penalty"]


@dataclass
class VLLMClientConfig:
    """vLLM客户端配置参数"""
    model_path: str = ""  # 必需，模型文件路径，指向本地或挂载的模型目录
    tensor_parallel_size: int = 1  # 张量并行大小，默认1（单GPU），多GPU推理时可设置为GPU数量
    max_model_len: Optional[int] = None  # 最大模型长度（token数），None表示使用模型默认值，用于限制输入+输出的总长度
    gpu_memory_utilization: float = 0.9  # GPU内存利用率，范围0.0-1.0，默认0.9（使用90%的GPU内存），影响可同时处理的请求数
    max_num_batched_tokens: Optional[int] = None  # 单批次最大token数量，None表示使用默认值，用于连续批处理优化，控制批处理效率
    max_num_seqs: Optional[int] = None  # 最大序列数，None表示使用默认值，用于连续批处理优化，控制同时处理的序列数量


@dataclass
class InferenceParams:
    """统一的推理参数（适用于所有客户端）"""
    # 通用推理参数（OpenAI和vLLM都支持）
    max_tokens: Optional[int] = None  # 最大生成token数，None表示不限制
    temperature: float = 0.7  # 控制随机性，范围0-2，默认0.7
    top_p: float = 1.0  # 核采样，范围0-1，默认1.0（采样时考虑所有tokens)
    presence_penalty: float = 0.0  # 存在性惩罚，范围-2.0到2.0，默认0.0（不惩罚）
    seed: Optional[int] = None  # 随机种子，用于可复现生成，None表示随机 

# max_tokens在一些新的部署方式下，改为了max_completion_tokens，这里为了兼容这个参数就不传啦
OPENAI_BODY_BLOCKED_PARAMS = {"gpu_memory_utilization", "max_tokens"}

class InferenceClient(ABC):
    """推理客户端抽象基类"""
    
    @abstractmethod
    async def infer_batch(self, messages_list: List[List[Dict[str, str]]]) -> Dict[str, List]:
        """
        批量推理
        
        Args:
            messages_list: 消息列表，格式: [[{"role": "system", "content": "..."}, {"role": "user", "content": "..."}], ...]
                每个元素是一个消息列表，支持 system、user、assistant 角色
        
        Returns:
            包含成功和失败结果的字典:
            {
                "success": [{"index": int, "result": str}, ...],
                "failed": [{"index": int, "error": str}, ...]
            }
        """
        pass


class OpenAIClient(InferenceClient):
    """OpenAI推理客户端"""

    # 兼容性过滤规则：命中模型关键字时，自动移除对应参数
    MODEL_UNSUPPORTED_PARAMS: Dict[str, set[str]] = {
        # "deepseek": {"presence_penalty"},
    }
    
    def __init__(
        self,
        client_config: OpenAIClientConfig,
        inference_params: InferenceParams
    ):
        """
        初始化OpenAI客户端
        
        Args:
            client_config: 客户端配置参数
            inference_params: 推理参数
        """
        # 验证客户端配置参数
        if not client_config.api_key:
            raise ValueError("必须通过client_config提供api_key")
        if not client_config.base_url:
            raise ValueError("必须通过client_config提供base_url")
        if not client_config.model:
            raise ValueError("必须通过client_config提供model")
        
        # 保存参数
        self.client_config = client_config
        self.inference_params = inference_params
        
        # 初始化HTTP客户端（使用REST API方式）
        # 确保base_url以/结尾，然后拼接/v1/chat/completions，这个由在线推理服务保证
        self.api_url = client_config.base_url
        self.api_key = client_config.api_key
        
        # 创建httpx异步客户端
        timeout = httpx.Timeout(client_config.timeout, connect=10.0)
        self.client = httpx.AsyncClient(
            timeout=timeout,
            limits=httpx.Limits(max_keepalive_connections=client_config.max_concurrent)
        )
        
        # 设置请求头
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        logger.info(f"初始化OpenAI REST API客户端: model={client_config.model}, base_url={client_config.base_url}")

    @staticmethod
    def _truncate_response_text(response_text: str, max_length: int = 2000) -> str:
        """截断过长的响应内容，避免日志过大。"""
        if len(response_text) <= max_length:
            return response_text
        return response_text[:max_length] + "...(truncated)"

    def _extract_response_text(self, response: Optional[httpx.Response]) -> str:
        """从响应中提取可读文本，便于异常日志打印。"""
        if response is None:
            return "<no response>"

        try:
            response_text = response.text
        except Exception as exc:
            return f"<failed to read response: {exc}>"

        response_text = (response_text or "").strip()
        return self._truncate_response_text(response_text or "<empty response>")

    def _get_filtered_inference_params(self) -> Dict[str, Any]:
        """按模型兼容性规则过滤请求参数。"""
        filtered_params = {
            k: v for k, v in asdict(self.inference_params).items()
            if v is not None
        }

        unsupported_params = set(self.client_config.unsupported_params or [])
        unsupported_params.update(OPENAI_BODY_BLOCKED_PARAMS)
        model_name = (self.client_config.model or "").lower()
        for model_keyword, blocked_params in self.MODEL_UNSUPPORTED_PARAMS.items():
            if model_keyword in model_name:
                unsupported_params.update(blocked_params)

        if unsupported_params:
            dropped_params = sorted(k for k in filtered_params.keys() if k in unsupported_params)
            if dropped_params:
                logger.info(
                    f"模型 {self.client_config.model} 过滤不兼容推理参数: {dropped_params}"
                )
                filtered_params = {
                    k: v for k, v in filtered_params.items()
                    if k not in unsupported_params
                }

        return filtered_params
    
    async def close(self):
        """关闭HTTP客户端连接"""
        if hasattr(self, 'client') and self.client:
            await self.client.aclose()
            logger.info("OpenAI REST API客户端已关闭")
    
    async def __aenter__(self):
        """异步上下文管理器入口"""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器出口"""
        await self.close()
    
    async def infer_batch(self, messages_list: List[List[Dict[str, str]]]) -> Dict[str, List]:
        """
        批量推理
        
        Args:
            messages_list: 消息列表，格式: [[{"role": "system", "content": "..."}, {"role": "user", "content": "..."}], ...]
                每个元素是一个消息列表，支持 system、user、assistant 角色
                数据读取阶段已控制批次大小，这里直接处理所有消息列表
        
        Returns:
            包含成功和失败结果的字典:
            {
                "success": [{"index": int, "result": str}, ...],
                "failed": [{"index": int, "error": str}, ...]
            }
        
        注意：
            - 数据读取阶段已通过data_batch_size控制批次大小（默认5千条）
            - 如果消息列表数量很大且内存有限，可以通过调整data_batch_size来减少单次处理的数量
            - 支持 system prompt、多轮对话等更复杂的场景
        """
        max_concurrent = self.client_config.max_concurrent
        total = len(messages_list)
        logger.info(f"开始推理，总计 {total} 条消息列表，最大并发数: {max_concurrent}")
        
        # 格式化打印前几条消息列表示例（用于调试）
        if total > 0:
            import json
            logger.info(f"消息列表示例（前 {min(2, total)} 条）:")
            for i in range(min(2, total)):
                logger.info(f"  第 {i+1} 条消息:\n{json.dumps(messages_list[i], ensure_ascii=False, indent=4)}")
        
        # 使用信号量限制并发数
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def infer_with_semaphore(messages: List[Dict[str, str]], idx: int) -> str:
            """带并发限制的推理函数"""
            async with semaphore:
                return await self._infer_single(messages, idx)
        
        # 并发处理所有消息列表（受信号量限制）
        # 注意：虽然一次性创建所有协程，但实际执行受semaphore限制，不会同时发起过多请求
        # 使用return_exceptions=True，让单条失败不影响其他条目的处理
        results = await asyncio.gather(*[
            infer_with_semaphore(messages, idx=i) for i, messages in enumerate(messages_list)
        ], return_exceptions=True)
        
        # 分离成功和失败的结果
        success_results = []
        failed_results = []
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                error_msg = f"推理失败: {str(result)}"
                logger.warning(f"第{i+1}条推理失败: {error_msg}")
                failed_results.append({
                    "index": i,
                    "error": error_msg
                })
            else:
                success_results.append({
                    "index": i,
                    "result": result
                })
        
        logger.info(f"推理完成，成功: {len(success_results)} 条，失败: {len(failed_results)} 条，总计: {total} 条")
        return {
            "success": success_results,
            "failed": failed_results
        }
    
    async def _infer_single(self, messages: List[Dict[str, str]], idx: int = 0) -> str:
        """
        推理单个消息列表
        
        Args:
            messages: 消息列表，格式: [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]
                支持的角色: "system", "user", "assistant"
            idx: 索引（用于日志）
        
        Returns:
            推理结果
        """
        start_time = time.time()
        
        try:
            # 验证消息格式
            if not isinstance(messages, list):
                raise ValueError(f"messages 必须是列表格式，收到: {type(messages)}")
            
            for msg in messages:
                if not isinstance(msg, dict):
                    raise ValueError(f"消息必须是字典格式，收到: {type(msg)}")
                if "role" not in msg or "content" not in msg:
                    raise ValueError(f"消息必须包含 'role' 和 'content' 字段，收到: {msg}")
                if msg["role"] not in ["system", "user", "assistant"]:
                    raise ValueError(f"消息角色必须是 'system', 'user' 或 'assistant'，收到: {msg['role']}")
            
            # 构建OpenAI API请求体
            request_body = self._get_filtered_inference_params()
            request_body["model"] = self.client_config.model  # 从client_config获取model
            request_body["messages"] = messages
            
            # 发送REST API请求（带重试逻辑）
            response = await self._send_request_with_retry(request_body)
            
            response_data = response.json()
            
            # 解析响应
            if "choices" not in response_data or len(response_data["choices"]) == 0:
                raise ValueError("API响应中没有choices字段或choices为空")
            
            result = response_data["choices"][0]["message"]["content"] or ""
            elapsed = time.time() - start_time
            
            logger.debug(f"第{idx+1}条推理完成，耗时: {elapsed:.2f}秒")
            return result
            
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(f"第{idx+1}条推理失败，耗时: {elapsed:.2f}秒，错误: {str(e)}")
            raise
    
    async def _send_request_with_retry(self, request_body: Dict[str, Any]) -> httpx.Response:
        """
        发送HTTP请求，带重试逻辑
        
        Args:
            request_body: 请求体字典
            
        Returns:
            httpx.Response对象
        """
        max_retries = self.client_config.max_retries
        last_exception = None
        
        for attempt in range(max_retries + 1):  # 初始请求 + 重试次数
            try:
                response = await self.client.post(
                    self.api_url,
                    headers=self.headers,
                    json=request_body
                )
                response.raise_for_status()  # 如果状态码不是2xx，抛出异常
                return response
            except httpx.HTTPStatusError as e:
                last_exception = e
                response_text = self._extract_response_text(e.response)
                if attempt < max_retries:
                    wait_time = min(2 ** attempt, 10)
                    logger.warning(
                        f"请求失败（尝试 {attempt + 1}/{max_retries + 1}），{wait_time}秒后重试: {str(e)}\n"
                        f"response: {response_text}"
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(
                        f"请求失败，已达到最大重试次数 {max_retries + 1}: {str(e)}\n"
                        f"response: {response_text}"
                    )
            except (httpx.RequestError, httpx.TimeoutException) as e:
                last_exception = e
                if attempt < max_retries:
                    # 指数退避：1s, 2s, 4s...
                    wait_time = min(2 ** attempt, 10)
                    logger.warning(f"请求失败（尝试 {attempt + 1}/{max_retries + 1}），{wait_time}秒后重试: {str(e)}")
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"请求失败，已达到最大重试次数 {max_retries + 1}: {str(e)}")
        
        # 所有重试都失败，抛出最后一个异常
        raise last_exception
    

class VLLMClient(InferenceClient):
    """vLLM推理客户端"""
    
    def __init__(
        self,
        client_config: VLLMClientConfig,
        inference_params: InferenceParams
    ):
        """
        初始化vLLM客户端
        
        Args:
            client_config: 客户端配置参数
            inference_params: 推理参数
        """
        if LLM is None:
            raise ImportError("vllm库未安装，请先安装: pip install vllm")
        
        # 验证客户端配置
        if not client_config.model_path:
            raise ValueError("必须提供模型路径")
        
        if not os.path.exists(client_config.model_path):
            raise FileNotFoundError(f"模型路径不存在: {client_config.model_path}")
        
        # 保存参数
        self.client_config = client_config
        self.inference_params = inference_params
        
        logger.info(f"初始化vLLM客户端: model_path={client_config.model_path}")
        logger.info(f"加载模型参数: tensor_parallel_size={client_config.tensor_parallel_size}, "
                   f"max_model_len={client_config.max_model_len}, "
                   f"gpu_memory_utilization={client_config.gpu_memory_utilization}")
        
        # 初始化LLM，添加连续批处理优化参数
        llm_kwargs = {
            k: v for k, v in asdict(client_config).items() 
            if v is not None and k != "model_path"
        }
        
        self.llm = LLM(model=client_config.model_path, **llm_kwargs)
        
        # 初始化采样参数
        sampling_kwargs = asdict(self.inference_params)
        sampling_kwargs = {k: v for k, v in sampling_kwargs.items() if v is not None}
        
        self.sampling_params = SamplingParams(**sampling_kwargs)
        
        logger.info("vLLM模型加载完成，已启用连续批处理优化")
    
    async def infer_batch(self, messages_list: List[List[Dict[str, str]]]) -> Dict[str, List]:
        """
        批量推理
        
        Args:
            messages_list: 消息列表，格式: [[{"role": "system", "content": "..."}, {"role": "user", "content": "..."}], ...]
                每个元素是一个消息列表，支持 system、user、assistant 角色
                数据读取阶段已控制批次大小，这里直接一次性处理
        
        Returns:
            包含成功和失败结果的字典:
            {
                "success": [{"index": int, "result": str}, ...],
                "failed": [{"index": int, "error": str}, ...]
            }
        
        注意：
            - 数据读取阶段已通过data_batch_size控制批次大小（默认5千条）
            - vLLM的连续批处理优化可以高效处理大量不同长度的序列
            - 如果遇到资源限制（如超过max_num_seqs），可以通过调整data_batch_size或VLLM配置参数来解决
            - 使用chat接口会自动应用模型的chat_template
        """
        total = len(messages_list)
        # 过滤空消息列表，避免 vLLM/transformers 应用 chat_template 时报 IndexError（conversation[0] 越界）
        valid_indices = [i for i, m in enumerate(messages_list) if isinstance(m, list) and len(m) > 0]
        valid_messages_list = [messages_list[i] for i in valid_indices]
        empty_indices = [i for i in range(total) if i not in valid_indices]

        # 验证消息格式（仅验证非空列表）
        for messages in valid_messages_list:
            if not isinstance(messages, list):
                raise ValueError(f"messages 必须是列表格式，收到: {type(messages)}")
            for msg in messages:
                if not isinstance(msg, dict):
                    raise ValueError(f"消息必须是字典格式，收到: {type(msg)}")
                if "role" not in msg or "content" not in msg:
                    raise ValueError(f"消息必须包含 'role' 和 'content' 字段，收到: {msg}")

        # 空列表直接标记为失败，不调用 vLLM
        failed_results = [
            {"index": i, "error": "消息列表为空，已跳过推理"}
            for i in empty_indices
        ]
        if empty_indices:
            import json
            logger.warning(
                f"共 {len(empty_indices)} 条消息列表为空或格式异常，已跳过推理，原始索引: {empty_indices[:10]}{'...' if len(empty_indices) > 10 else ''}。"
                " 这些空列表通常来自评估流程中「指标所需字段值为空」的占位，详见上游 prompt 生成日志中的「评估占位空 messages」或「字段内容缺少」。"
            )
            for idx in empty_indices[:10]:  # 最多打印前 10 条异常内容
                raw = messages_list[idx]
                try:
                    raw_str = json.dumps(raw, ensure_ascii=False, indent=2)
                except Exception:
                    raw_str = repr(raw)
                logger.warning(f"  格式异常 messages[{idx}]: {raw_str}")
            if len(empty_indices) > 10:
                logger.warning(f"  ... 还有 {len(empty_indices) - 10} 条未打印")

        logger.info(f"开始推理，总计 {total} 条消息列表（有效 {len(valid_messages_list)} 条），充分利用vLLM连续批处理优化")

        # 格式化打印前几条有效消息列表示例（用于调试）
        if valid_messages_list:
            import json
            logger.info(f"消息列表示例（前 {min(2, len(valid_messages_list))} 条）:")
            for idx in range(min(2, len(valid_messages_list))):
                logger.info(f"  第 {idx+1} 条消息:\n{json.dumps(valid_messages_list[idx], ensure_ascii=False, indent=4)}")

        start_time = time.time()

        if not valid_messages_list:
            elapsed = time.time() - start_time
            logger.info(f"无有效消息列表，跳过 vLLM 调用，耗时: {elapsed:.2f}秒")
            return {"success": [], "failed": failed_results}

        success_results = []
        try:
            # 使用chat接口，会自动应用模型的chat_template（仅传入非空列表）
            # vLLM会对所有消息列表进行连续批处理优化
            # 注意：这是同步阻塞操作，但在当前场景中（顺序处理批次，无其他并发任务）可以直接调用
            outputs = self.llm.chat(valid_messages_list, sampling_params=self.sampling_params)

            # 按原始索引映射成功/失败结果
            for j, output in enumerate(outputs):
                orig_i = valid_indices[j]
                try:
                    if output.outputs and len(output.outputs) > 0:
                        result = output.outputs[0].text
                        success_results.append({
                            "index": orig_i,
                            "result": result
                        })
                    else:
                        error_msg = "vLLM返回结果为空"
                        logger.warning(f"第{orig_i+1}条推理失败: {error_msg}")
                        failed_results.append({
                            "index": orig_i,
                            "error": error_msg
                        })
                except Exception as e:
                    error_msg = f"提取结果失败: {str(e)}"
                    logger.warning(f"第{orig_i+1}条推理失败: {error_msg}")
                    failed_results.append({
                        "index": orig_i,
                        "error": error_msg
                    })

            elapsed = time.time() - start_time
            logger.info(f"推理完成，耗时: {elapsed:.2f}秒，成功: {len(success_results)} 条，失败: {len(failed_results)} 条，平均每条: {elapsed/total:.3f}秒")
            return {
                "success": success_results,
                "failed": failed_results
            }

        except Exception as e:
            # 如果整个批次失败，所有条目都标记为失败
            elapsed = time.time() - start_time
            error_msg = f"vLLM批次推理失败: {str(e)}"
            logger.error(f"推理失败，耗时: {elapsed:.2f}秒，错误: {error_msg}")
            
            failed_results = [
                {"index": i, "error": error_msg}
                for i in range(total)
            ]
            return {
                "success": [],
                "failed": failed_results
            }


def create_client(
    client_type: str,
    client_config: Optional[Dict[str, Any]] = None,
    inference_params: Optional[Dict[str, Any]] = None
) -> InferenceClient:
    """
    创建推理客户端工厂函数
    
    Args:
        client_type: 客户端类型 ("openai" 或 "vllm")
        client_config: 客户端配置参数字典
        inference_params: 推理参数字典
    
    Returns:
        推理客户端实例
    
    Raises:
        ValueError: 客户端类型不支持或缺少必需配置参数
        TypeError: 配置参数类型错误
    """
    client_config = client_config or {}
    inference_params = inference_params or {}

    try:
        if client_type.lower() == "openai":
            filtered_inference_params = {
                k: v for k, v in inference_params.items()
                if k not in OPENAI_BODY_BLOCKED_PARAMS
            }
            dropped_params = sorted(set(inference_params.keys()) - set(filtered_inference_params.keys()))
            if dropped_params:
                logger.info(f"OpenAI客户端初始化时忽略不进入body的推理参数: {dropped_params}")
            return OpenAIClient(
                client_config=OpenAIClientConfig(**client_config),
                inference_params=InferenceParams(**filtered_inference_params)
            )
        elif client_type.lower() == "vllm":
            return VLLMClient(
                client_config=VLLMClientConfig(**client_config),
                inference_params=InferenceParams(**inference_params)
            )
        else:
            raise ValueError(f"不支持的客户端类型: {client_type}，支持的类型: openai, vllm")
    except TypeError as e:
        # 捕获缺少必需字段的错误，提供更友好的错误信息
        error_msg = str(e)
        if "required" in error_msg.lower() or "missing" in error_msg.lower():
            raise ValueError(f"缺少必需的配置参数: {error_msg}") from e
        raise

