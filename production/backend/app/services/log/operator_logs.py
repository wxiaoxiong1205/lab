import datetime
from typing import List

import pandas as pd
from fastapi_pagination import Page
from pydantic import ValidationError
from sqlalchemy import select, delete

from .interface import OperatorLogsService
from ...common.function_type import FunctionType
from ...common.operator_audit_type import AuditStatus
from ...common.operator_type import OperatorType
from ...models.models import OperatorLogs, JwtUserInfo
from ...repository.base_mapper import BaseMapper
from ...schemas.log import OperatorLogsResponse, OperatorLogsRequest, BatchApprovalUpdateRequest
from ...schemas.workbench_page import WorkbenchPagePayload
from ...utils.excel_utils import df_to_excel
from ...utils.pdf_utils import df_to_pdf
from ...utils.timezone_utils import convert_to_naive_datetime, format_datetime


class DefaultOperatorLogsService(OperatorLogsService):
    """模型服务实现类"""
    # TODO 修改mapper注入逻辑后使用LogMapper 而不是BaseMapper
    def __init__(self, mapper: BaseMapper) -> None:
        self.mapper = mapper
        pass

    async def get_function_type_enum(self) -> List[str]:
        str_list = []
        for i, e in enumerate(FunctionType):
            str_list.append(e.value[0])

        return str_list

    async def get_operator_type_enum(self) -> List[str]:
        str_list = []
        for i, e in enumerate(OperatorType):
            str_list.append(e.value[0])

        return str_list
        pass

    async def create(self, data: OperatorLogs):
        insert = await self.mapper.insert(data)
        await self.mapper.commit()
        pass

    async def list(self, current_user: JwtUserInfo, page_num: int, page_size: int, operator_log: OperatorLogsRequest) \
            -> WorkbenchPagePayload[OperatorLogsResponse]:
        query = select(OperatorLogs)
        # 处理时间范围查询，需要转换为 naive datetime（数据库字段是 timezone=False）
        exclude_set = set()
        if operator_log.start_time is not None and operator_log.end_time is not None:
            start_time_naive = convert_to_naive_datetime(operator_log.start_time)
            end_time_naive = convert_to_naive_datetime(operator_log.end_time)
            query = (query
                     .where(OperatorLogs.created_at >= start_time_naive)
                     .where(OperatorLogs.created_at <= end_time_naive)
                     )
            exclude_set.update({'start_time', 'end_time'})

        # 如果 audit_status 为 -1 或 None，则排除该字段
        if operator_log.audit_status is None or operator_log.audit_status == -1 or operator_log.audit_status == "":
            exclude_set.add('audit_status')

        operator_log_dict = operator_log.model_dump(exclude=exclude_set)

        operator_log_filtered = OperatorLogsRequest(**operator_log_dict)

        # 添加排序，order_by 返回新的查询对象，需要赋值回去
        query = query.order_by(OperatorLogs.created_at.desc())
        data: Page[OperatorLogs] = await self.mapper.query_condition_fuzzy(query, operator_log_filtered, OperatorLogs, page_num,
                                                                     page_size)
        workbench_page_data: WorkbenchPagePayload[OperatorLogsResponse] = WorkbenchPagePayload[OperatorLogsResponse](
            total=data.total, rows=data.items, number=data.page,
            size=data.size, totalPages=data.total)
        return workbench_page_data

    async def batch_update_approval_status(self, current_user: JwtUserInfo, request: BatchApprovalUpdateRequest):
        # 查询需要更新的日志记录
        query = select(OperatorLogs).where(OperatorLogs.id.in_(request.ids))
        logs = await self.mapper.query(query)

        # 更新每条记录的审计状态和审计原因
        for log in logs:
            log.audit_status = request.audit_status
            log.audit_reason = request.audit_reason or ""

        # 批量更新数据库
        if logs:
            await self.mapper.update_list(logs)
            await self.mapper.commit()
        pass

    async def delete_list(self, ids: [], start_time: datetime, end_time: datetime):

        d = delete(OperatorLogs)
        if ids is not None:
            d = d.where(OperatorLogs.id.in_(ids))
        if start_time is not None and end_time is not None:
            # 处理时间范围查询，需要转换为 naive datetime（数据库字段是 timezone=False）
            start_time_naive = convert_to_naive_datetime(start_time)
            end_time_naive = convert_to_naive_datetime(end_time)
            d = d.where(OperatorLogs.created_at >= start_time_naive).where(OperatorLogs.created_at <= end_time_naive)

        await self.mapper.delete_condition(d)

    async def export_pdf(self, ids: []):
        get_list = await self.get_list(ids)
        df = self.model_list_to_df(get_list)
        return df_to_pdf(df)

    async def get_list(self, ids: []) -> List[OperatorLogs]:
        if ids is not None:
            # 选择导出的
            query = select(OperatorLogs).where(OperatorLogs.id.in_(ids))
            data = await self.mapper.query(query)
        else:
            data = await self.mapper.query(select(OperatorLogs))

        return data

    async def export_excel(self, ids: []):
        get_list = await self.get_list(ids)
        df = self.model_list_to_df(get_list)
        return df_to_excel(df)

    def model_list_to_df(self, model_list: List[OperatorLogs]) -> pd.DataFrame:
        """将 SQLAlchemy 模型列表转为 DataFrame，只选择需要的列并重命名为中文"""
        if not model_list:
            return pd.DataFrame()  # 空列表返回空 DataFrame

        # 定义列映射：数据库字段名 -> 中文列名
        column_mapping = {
            'account': '账号',
            'created_by': '用户名',
            'created_at': '时间',
            'ip_addres': 'IP地址',
            'table_name': '表名',
            'function_name': '功能名称',
            'operation_type': '操作类型',
            'audit_status': '审计状态',
            'audit_reason': '审计原因',
            'audit_time': '审计时间',

        }
        
        # 只选择需要的列（按顺序）
        selected_fields = ['account', 'created_by', 'created_at', 'ip_addres', 
                          'table_name', 'function_name', 'operation_type', 'audit_status', 'audit_reason', 'audit_time']
        
        # 提取每个模型实例的字段值，组成列表
        data = []
        for model in model_list:
            row = []
            for field in selected_fields:
                value = getattr(model, field, None)
                # 格式化时间字段
                if field in ['created_at', 'audit_time'] and value is not None:
                    value = format_datetime(value)
                    # 格式化审计状态字段
                elif field == 'audit_status' and value is not None:
                    value = AuditStatus.to_chinese(value)
                row.append(value)
            data.append(row)

        # 创建 DataFrame，使用中文列名
        chinese_columns = [column_mapping[field] for field in selected_fields]

        df = pd.DataFrame(data, columns=chinese_columns).fillna("")
        # 按照"时间"列进行倒序排序
        if '时间' in df.columns:
            df = df.sort_values(by='时间', ascending=False)

        return df

    async def get_by_id(self, id_field_value):
        return await self.mapper.query_one(select(OperatorLogs).where(OperatorLogs.id == id_field_value))
