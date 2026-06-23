import abc
import datetime
from abc import ABC
from typing import List

import pandas as pd

from app.models.models import OperatorLogs, JwtUserInfo
from app.repository.base_mapper import BaseMapper
from app.schemas.common import ResModel
from app.schemas.log import OperatorLogsResponse, OperatorLogsRequest, BatchApprovalUpdateRequest
from app.schemas.workbench_page import WorkbenchPagePayload


class OperatorLogsService(ABC):
    """模型服务抽象接口类（含基础模型+训练模型）"""

    def __init__(self, mapper: BaseMapper) -> None:
        self.mapper = mapper
        pass

    @abc.abstractmethod
    async def get_function_type_enum(self, ) -> List[str]:
        pass

    @abc.abstractmethod
    async def get_operator_type_enum(self, ) -> List[str]:
        pass

    @abc.abstractmethod
    async def create(self, data: OperatorLogs):
        pass

    @abc.abstractmethod
    async def list(self, current_user: JwtUserInfo, page_num: int, page_size: int, operator_log: OperatorLogsRequest) \
            -> WorkbenchPagePayload[OperatorLogsResponse]:
        pass

    @abc.abstractmethod
    async def batch_update_approval_status(self, current_user: JwtUserInfo, request: BatchApprovalUpdateRequest):
        pass

    @abc.abstractmethod
    async def delete_list(self, ids: [], start_time: datetime, end_time: datetime):
        pass

    @abc.abstractmethod
    async def export_pdf(self, ids: []):
        pass

    @abc.abstractmethod
    async def export_excel(self, ids: []):
        pass

    @abc.abstractmethod
    def model_list_to_df(self, model_list: List[OperatorLogs]) -> pd.DataFrame:
        pass

    @abc.abstractmethod
    async def get_list(self, ids: []) -> List[OperatorLogs]:
        pass

    @abc.abstractmethod
    async def get_by_id(self, id_field_value):
        pass
