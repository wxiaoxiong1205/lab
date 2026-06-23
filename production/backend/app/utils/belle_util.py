import os
from typing import Dict, Any, Optional, List
from contextvars import ContextVar

from fastapi import HTTPException
from starlette import status

from app.core import settings
from app.core.logging import logger
from app.utils.http_util import get_belle_api_client


class BelleUtil:
    """Belle第三方接口调用工具类 - 单例模式"""

    _instance = None
    _initialized = False

    def __new__(cls):
        """单例模式实现"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """初始化接口调用信息"""
        if BelleUtil._initialized:
            return

        self.token = ''
        self.client = get_belle_api_client()

        BelleUtil._initialized = True

    async def initialize_token(self):
        """异步初始化token"""
        if not self.token:
            self.token = await self._get_token()

    async def _request_with_refresh(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        """
        发送请求并在token过期时自动刷新并重试一次
        """
        kwargs.pop("token", None)
        try:
            return await self.client.request(method=method, path=path, token=self.token, **kwargs)
        except HTTPException as e:
            if e.status_code == status.HTTP_401_UNAUTHORIZED or e.status_code == status.HTTP_403_FORBIDDEN:
                logger.info("Belle token 过期，自动刷新后重试请求")
                self.token = await self._get_token()
                return await self.client.request(method=method, path=path, token=self.token, **kwargs)
            raise

    async def _get_token(self) -> str:
        """
        获取认证token - 通过API接口获取

        Returns:
            str: 认证token
        """
        try:
            data = {
                "client_id": settings.BELLE_API_CLIENT_ID,
                "client_key": settings.BELLE_API_CLIENT_KEY
            }

            response = await self.client.post(
                "/ai-base-server/openapi/token",
                data=data
            )

            token = (
                    response.get("token")
                    or response.get("access_token")
                    or response.get("data", {}).get("token")
            )

            if not token:
                logger.error(
                    f"Belle token API 返回成功但未包含 token, response={response}"
                )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="百丽认证服务返回异常，未获取到 token"
                )

            logger.info("成功通过API获取 Belle token")
            return token

        except HTTPException:
            raise
        except Exception as e:
            logger.exception(
                f"通过API获取 Belle token 失败 (client_id={settings.BELLE_API_CLIENT_ID}, url=/ai-base-server/openapi/token)"
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="无法连接百丽认证服务，请稍后重试"
            )

    @classmethod
    async def get_instance_with_token(cls) -> 'BelleUtil':
        """
        获取单例实例并初始化token

        Returns:
            BelleUtil: BelleUtil单例实例（已初始化token）
        """
        instance = cls()
        await instance.initialize_token()
        return instance

    async def get_model_detail(self, code: str) -> Dict[str, Any]:
        """
        获取模型详情

        对应curl命令:
        curl --location --request GET 'https://ai-base-test.belle.cn/ai-base-server/openapi/model/detail?code=Qwen/Qwen3-VL-8B-Instruct' \
        --header 'Authorization: Bearer di-pu:1761041357:2121041357:e427dc390cac8db140532ab42ab826826ae5ca7f91066028c99596f76379f6b9'

        Args:
            code: 模型代码，如 'Qwen/Qwen3-VL-8B-Instruct'

        Returns:
            Dict[str, Any]: 模型详情响应数据
        """
        try:
            params = {'code': code}
            response = await self._request_with_refresh("GET", '/ai-base-server/openapi/model/detail', params=params)
            logger.info(f"获取模型详情成功: {code}")
            return response.get('data')
        except Exception as e:
            logger.error(f"获取模型详情失败: {code} - {str(e)}")
            raise

    async def get_model_list(self, page: int = 1, size: int = 10) -> Dict[str, Any]:
        """
        获取模型列表

        Args:
            page: 页码，默认1
            size: 每页数量，默认10

        Returns:
            Dict[str, Any]: 模型列表响应数据
        """
        try:
            params = {'page': page, 'size': size}
            response = await self._request_with_refresh("GET", '/openapi/model/list', params=params)
            logger.info(f"获取模型列表成功: page={page}, size={size}")
            return response
        except Exception as e:
            logger.error(f"获取模型列表失败: page={page}, size={size} - {str(e)}")
            raise

    async def sync_model_file(self, model_code: str, model_source: str = "Modelscope") -> Dict[str, Any]:
        """
        同步模型文件

        对应curl命令:
        curl --location --request POST 'https://ai-base-test.belle.cn/ai-base-server/openapi/model/sync_file' \
        --header 'Authorization: Bearer di-pu:1761041357:2121041357:e427dc390cac8db140532ab42ab826826ae5ca7f91066028c99596f76379f6b9' \
        --header 'Content-Type: application/json' \
        --data-raw '{
            "model_code": "Qwen/Qwen3-Omni-30B-A3B-Instruct",
            "model_source": "Modelscope"
        }'

        Args:
            model_code: 模型代码，如 'Qwen/Qwen3-Omni-30B-A3B-Instruct'
            model_source: 模型来源，默认为 'Modelscope'

        Returns:
            Dict[str, Any]: 同步结果响应数据
        """
        try:
            data = {
                "model_code": model_code,
                "model_source": model_source
            }
            response = await self._request_with_refresh("POST", '/ai-base-server/openapi/model/sync_file', data=data)
            logger.info(f"模型文件同步成功: {model_code}")
            return response
        except Exception as e:
            logger.error(f"模型文件同步失败: {model_code} - {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"模型文件同步失败: {model_code} - {str(e)}"
            )

    async def create_model(self, code: str, source: str = "Modelscope", tags: list = None) -> Dict[str, Any]:
        """
        创建模型

        Args:
            code: 模型代码
            source: 模型来源
            tags: 模型标签列表

        Returns:
            bool: 创建是否成功
        """
        try:
            if tags is None:
                tags = ["string"]

            data = {"code": code, "source": source, "tags": tags}
            response = await self._request_with_refresh("POST", '/ai-base-server/openapi/model', data=data)
            if response.get("code") == 200 and response.get('message') == '成功':
                return response
            else:
                raise HTTPException(response.get("code"),detail=response.get('message'))
        except Exception as e:
            logger.error(f"创建模型失败: {code} - {str(e)}")
            raise

    async def update_model_tags(self, code: str, tags: list) -> Dict[str, Any]:
        """
        更新模型标签

        Args:
            code: 模型代码
            tags: 新的标签列表

        Returns:
            bool: 更新是否成功
        """
        try:
            data = {"code": code, "tags": tags}
            response = await self._request_with_refresh("PUT", '/ai-base-server/openapi/model/tag', data=data)
            logger.info(f"更新模型标签接口成功: {code} 调用结果：{response}")
            return response
        except Exception as e:
            logger.error(f"更新模型标签失败: {code} - {str(e)}")
            raise

    async def get_sync_status(self, code: str) -> Dict[str, Any]:
        """
        获取模型同步状态

        Args:
            code: 模型代码

        Returns:
            Dict[str, Any]: 同步状态信息
        """
        try:
            params = {"code": code}
            response = await self._request_with_refresh("GET", '/ai-base-server/openapi/model/sync_file/status', params=params)
            logger.info(f"获取模型同步状态接口成功: {code} 调用结果：{response}")
            return response.get('data')
        except Exception as e:
            logger.error(f"获取模型同步状态失败: {code} - {str(e)}")
            return {}

    async def get_gpu_brands(self) -> List[str]:
        """
        获取GPU品牌信息

        Returns:
            Dict[str, Any]: GPU品牌信息
        """
        try:
            response = await self._request_with_refresh("GET", '/ai-base-server/openapi/train_task/gpu/brand')
            logger.info(f"获取gpu品牌接口成功：{response}")
            return response.get('data')
        except Exception as e:
            logger.error(f"获取GPU品牌信息失败: {str(e)}")
            return []

    async def get_gpu_models(self, brands: str) -> Dict[str, Any]:
        """
        获取GPU型号信息

        Args:
            brands: GPU品牌，默认为 "nvidia"

        Returns:
            Dict[str, Any]: GPU型号信息
        """
        params = {"brands": brands}
        try:
            response = await self._request_with_refresh("GET", '/ai-base-server/openapi/train_task/gpu/model', params=params)
            logger.info(f"获取GPU型号信息接口成功：{response}")
            return response.get('data')
        except Exception as e:
            logger.error(f"获取GPU型号信息失败:{params} - {str(e)}")
            return {}

    async def calc_max_resources(self, gpu_brand: str, gpu_model: str) -> Dict[str, Any]:
        """
        计算最大资源

        Args:
            gpu_brand: GPU品牌，默认为 "nvidia"
            gpu_model: GPU型号，默认为 "A800"

        Returns:
            Dict[str, Any]: 最大资源计算结果
        """
        data = {
            "gpu_brand": gpu_brand,
            "gpu_model": gpu_model
        }
        try:
            response = await self._request_with_refresh(
                "POST",
                '/ai-base-server/openapi/train_task/v1/calculation/max_resources',
                data=data
            )
            logger.info(f"最大资源计算结果接口成功: {data} 调用结果：{response}")

            return response.get('data') if response.get('data') and response.get('code') == 200 else {}
        except Exception as e:
            logger.error(f"创建模型失败: {data} - {str(e)}")
            return {}

    async def create_train_task(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        创建训练任务

        Args:
            data: 训练任务配置数据

        Returns:
            Dict[str, Any]: 创建结果
        """
        try:
            response = await self._request_with_refresh("POST", '/ai-base-server/openapi/train_task/v1/create', data=data)
            logger.info(f"创建训练任务接口成功: {data} 调用结果：{response}")

            return response.get('data') if response.get('data') and response.get('code') == 200 else {}
        except Exception as e:
            logger.error(f"创建训练任务失败: {data} - {str(e)}")
            raise

    async def get_train_task_logs(self, task_id: int) -> List[Dict[str, Any]]:
        """
        获取训练任务日志

        Args:
            task_id: 任务ID

        Returns:
            Dict[str, Any]: 日志信息
        """
        try:
            params = {"id": task_id}
            response = await self._request_with_refresh("GET", '/ai-base-server/openapi/train_task/logs', params=params)
            logger.info(f"获取训练任务日志成功: task_id={task_id}")
            return response.get('data')
        except Exception as e:
            logger.error(f"获取训练任务日志失败: task_id={task_id} - {str(e)}")
            return []

    async def get_train_task_output(self, task_id: int) -> List[str]:
        """
        获取训练任务输出

        Args:
            task_id: 任务ID

        Returns:
            Dict[str, Any]: 输出信息
        """
        try:
            response = await self._request_with_refresh("GET", f'/ai-base-server/openapi/train_task/output/{task_id}')
            logger.info(f"获取训练任务输出成功: task_id={task_id}，调用结果：{response}")
            return response.get('data') if response.get('data') and response.get('code') == 200 else []
        except Exception as e:
            logger.error(f"获取训练任务输出失败: task_id={task_id} - {str(e)}")
            return []

    async def get_train_task_output_content(self, task_id: int, file_path: str) -> Dict[str, Any]:
        """
        获取训练任务输出内容

        Args:
            task_id: 任务ID
            file_path: 文件路径

        Returns:
            Dict[str, Any]: 输出内容信息
        """
        try:
            params = {"id": task_id, "file_path": file_path}
            response = await self._request_with_refresh("POST", '/ai-base-server/openapi/train_task/output_content', params=params)
            logger.info(f"获取训练任务输出内容成功: task_id={task_id}, file_path={file_path}")
            return response.get('data') if response.get('data') and response.get('code') == 200 else {}
        except Exception as e:
            logger.error(f"获取训练任务输出内容失败: task_id={task_id}, file_path={file_path} - {str(e)}")
            return {}

    async def get_docker_images(self, labels: list = None) -> List[Dict[str, Any]]:
        """
        获取Docker镜像列表

        Args:
            labels: 镜像标签列表

        Returns:
            Dict[str, Any]: 镜像列表信息
        """
        try:
            if labels is None:
                labels = ["dipu"]
            data = {"labels": labels}
            response = await self._request_with_refresh("POST", '/ai-base-server/openapi/docker_image/list', data=data)
            logger.info(f"获取Docker镜像列表成功: labels={labels} response：{response}")
            return response.get('data')
        except Exception as e:
            logger.error(f"获取Docker镜像列表失败: labels={labels} - {str(e)}")
            return []

    async def start_train_task(self, task_id: int) -> Dict[str, Any]:
        """
        启动训练任务

        Args:
            task_id: 任务ID

        Returns:
            Dict[str, Any]: 启动结果
        """
        try:
            response = await self._request_with_refresh("POST", f'/ai-base-server/openapi/train_task/{task_id}/start')
            logger.info(f"启动训练任务成功: task_id={task_id},response:{response}")
            return response
        except Exception as e:
            logger.error(f"启动训练任务失败: task_id={task_id} - {str(e)}")
            raise

    async def get_train_task_status(self, task_id: int) -> Dict[str, Any]:
        """
        获取训练任务状态

        Args:
            task_id: 任务ID

        Returns:
            Dict[str, Any]: 任务状态信息
        """
        try:
            response = await self._request_with_refresh("GET", f'/ai-base-server/openapi/train_task/{task_id}/status')
            logger.info(f"获取训练任务状态成功: task_id={task_id},response:{response}")
            return response.get('data') if response.get('data') and response.get('code') == 200 else {}
        except Exception as e:
            logger.error(f"获取训练任务状态失败: task_id={task_id} - {str(e)}")
            return {}

    async def get_train_task_output_url(self, task_id: int, file_name: str, file_type: str) -> Dict[str, Any]:
        """
        获取训练任务输出URL

        Args:
            task_id: 任务ID
            file_name: 文件名
            file_type: 文件类型（folder或file）

        Returns:
            Dict[str, Any]: 输出URL信息
        """
        try:
            data = {
                "id": task_id,
                "file_name": file_name,
                "file_type": file_type
            }
            response = await self._request_with_refresh("POST", '/ai-base-server/openapi/train_task/output_url', data=data)
            logger.info(f"获取训练任务输出URL成功: task_id={task_id}, file_name={file_name}")
            return response.get('data') if response.get('data') and response.get('code') == 200 else {}
        except Exception as e:
            logger.error(f"获取训练任务输出URL失败: task_id={task_id}, file_name={file_name} - {str(e)}")
            return {}