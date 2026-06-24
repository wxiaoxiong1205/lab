from abc import ABC, abstractmethod
from typing import Optional

from fastapi_pagination import Page
from starlette.responses import Response

from app.models.models import JwtUserInfo
from app.schemas.machine_learning_dataset import MachineLearningDatasetTemplateType

from app.schemas.online_annotation_service import (
    OnlineAnnotationAiProxyRequest,
    OnlineAnnotationServiceCreateRequest,
    OnlineAnnotationServiceResponse,
    OnlineAnnotationServiceStatus,
    OnlineAnnotationServiceTestRequest,
    OnlineAnnotationServiceUpdateRequest,
)


class OnlineAnnotationService(ABC):

    @abstractmethod
    async def create(self,
                     project_id: int,
                     current_user: JwtUserInfo,
                     request: OnlineAnnotationServiceCreateRequest) -> bool:
        """创建在线标注服务"""
        pass

    @abstractmethod
    async def delete(self, project_id: int, service_id: int) -> None:
        """删除在线标注服务"""
        pass

    @abstractmethod
    async def update(self,
                     project_id: int,
                     current_user: JwtUserInfo,
                     request: OnlineAnnotationServiceUpdateRequest) -> bool:
        """更新在线标注服务"""
        pass

    @abstractmethod
    async def list_services(self,
                            project_id: int,
                            current_user: JwtUserInfo,
                            page_num: int,
                            page_size: int,
                            name: Optional[str] = None,
                            status: Optional[OnlineAnnotationServiceStatus] = None,
                            template_type: Optional[MachineLearningDatasetTemplateType] = None,
                            ) -> Page[OnlineAnnotationServiceResponse]:
        """分页查询在线标注服务"""
        pass

    @abstractmethod
    async def get_detail(
        self,
        project_id: int,
        service_id: int,
        current_user: JwtUserInfo,
    ) -> OnlineAnnotationServiceResponse:
        """按项目 ID 与服务 ID 查询在线标注服务详情"""
        pass

    @abstractmethod
    async def test_connectivity(
        self,
        project_id: int,
        current_user: JwtUserInfo,
        request: OnlineAnnotationServiceTestRequest,
    ) -> bool:
        """连通性测试：GET base_url 去尾斜杠后拼 /health，根据返回 JSON 的 status 是否为 UP 更新服务状态"""
        pass

    @abstractmethod
    async def proxy_ai_annotation(
        self,
        project_id: int,
        current_user: JwtUserInfo,
        request: OnlineAnnotationAiProxyRequest,
    ) -> Response:
        """将 predict_base_url 去尾斜杠后拼 /predict 再 POST，原样透传上游响应。"""
        pass
