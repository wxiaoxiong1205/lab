from fastapi_pagination.default import Params as DefaultParams
from fastapi import Query


# 自定义全局分页 Params：将每页数量上限从默认 100 调整为 1000，避免推理结果集等列表接口报错 "Input should be less than or equal to 100"
class CustomParams(DefaultParams):
    size: int = Query(50, ge=1, le=1000, description="每页数量")