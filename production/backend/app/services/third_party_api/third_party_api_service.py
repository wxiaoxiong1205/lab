# app/services/inference_service/impl.py
import dataclasses
import json
from typing import List, Optional, Any, Dict, Union
from jsonpath_ng import  parse, Fields, Index, Slice

import requests
import httpx
from fastapi import HTTPException
from fastapi_pagination import Page
from pydantic import Json
from sqlalchemy import select, delete, null
from sqlalchemy.exc import IntegrityError
from starlette import status

from app.core.logging import logger
from app.models.models import InferenceService, JwtUserInfo, ThirdPartyApiServiceModel
from app.repository.base_mapper import BaseMapper
from app.repository.third_party_api_mapper import ThirdPartyApiMapper
from app.schemas import DatasetSampleResponse
from app.schemas.inference_service import (
    InferenceServiceCreateRequest,
    InferenceServiceResponse,
    InferenceServiceUpdateRequest,
    InferenceServiceTestRequest, InferenceServiceListItemResponse, InferenceServiceDetailResponse
)
from app.schemas.business_attr_value import BusinessAttrValueBusinessType
from app.schemas.third_party_api import ThirdPartyApiCreate, ThirdPartyApiListResponse, ThirdPartyApiDetailResponse, \
    ThirdPartyApiUpdateRequest, ThirdPartyApiVerifyConnectRequest, ThirdPartyApiVerifyConnectResponse, \
    ThirdPartyApiBindingFileds

from app.schemas.workbench_page import WorkbenchPagePayload
from app.services.inference_service.interface import InferenceServiceService
from app.services.third_party_api.interface import ThirdPartyApiService
from app.utils import app_runtime_context
from app.utils.business_attr_utils import BusinessAttrValueHelper
from app.utils.error_messages import data_exists_error


# from app.utils.logger import logger


class DefaultThirdPartyApiServiceService(ThirdPartyApiService):
    def __init__(self, mapper: ThirdPartyApiMapper) -> None:
        self.mapper = mapper
        self.attr_helper = BusinessAttrValueHelper(mapper)

    async def create(self, project_id, current_user: JwtUserInfo, request: ThirdPartyApiCreate) -> bool:
        if request.name:
            is_exists = await self.exists(request.name, project_id, request.id)
            if is_exists:
                raise HTTPException(status_code=400, detail=f"项目中已存在同名api名称：{request.name}")
        try:
            # 直接插入，捕获唯一性约束（排除 attr_values，由下方单独保存）
            instance = ThirdPartyApiServiceModel(
                **request.model_dump(exclude={"attr_values"}),
                created_id=current_user.userId,
                created_by=current_user.username,
                tenant_id=current_user.tenantId,
                project_id=project_id,
                status="未连接"
            )

            await self.mapper.insert(instance)
            await self.mapper.flush()

            # 保存关联属性值及属性值选项
            await self.attr_helper.create_attr_values(
                reference_id=instance.id,
                attr_values=request.attr_values or [],
                created_id=current_user.userId,
                created_by=current_user.username,
                tenant_id=current_user.tenantId,
            )
            await self.mapper.commit()
            return True

        except IntegrityError as e:
            # 回滚事务
            await self.mapper.rollback()

            # 检查是否是唯一约束冲突
            if 'uq_inference_service_project_name_tenant' in str(e.orig):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=data_exists_error(f"服务名称:{request.name}")
                )
            else:
                # 其他完整性错误
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="创建服务失败：数据完整性错误"
                )

    async def list_api(self, project_id, current_user: JwtUserInfo, page_num: int, page_size: int,
                            name: Optional[str] = None,status: Optional[str] = None) -> Page[ThirdPartyApiListResponse]:
        query = select(ThirdPartyApiServiceModel).where(ThirdPartyApiServiceModel.project_id == project_id)

        # 如果有名字，添加名称模糊匹配
        if name is not None:
            query = query.where(ThirdPartyApiServiceModel.name.like(f"%{name}%"))
        if status is not None:
            query = query.where(ThirdPartyApiServiceModel.status.like(f"%{status}%"))

        query = query.order_by(ThirdPartyApiServiceModel.created_at.desc())
        data: Page[ThirdPartyApiListResponse] = await self.mapper.query_page(query, page_num, page_size)
        return data


    async def get_api_detail(self, project_id, current_user: JwtUserInfo,
                                 api_id: int) -> ThirdPartyApiDetailResponse:
        logger.info(f"获取三方api详情: 项目->{project_id}，api主键->{api_id}")
        query = select(ThirdPartyApiServiceModel).where(ThirdPartyApiServiceModel.project_id == project_id).where(
            ThirdPartyApiServiceModel.id == api_id)
        instance = await self.mapper.query_one(query)

        if not instance:
            raise HTTPException(status_code=404, detail="Inference service not found")

        # 查询关联属性值及选项
        attr_values = await self.attr_helper.query_attr_values_with_options(
            reference_id=api_id,
            business_type=BusinessAttrValueBusinessType.API_SERVICE.value,
        )
        await self.attr_helper.attach_attr_options(attr_values)
        instance.attr_values = attr_values

        return instance

    async def delete(self, project_id, ids: List[int]) -> None:
        if not ids:
            return None
        logger.info(f"删除三方api，id列表：{ids}")
        # 删除关联属性值及选项
        await self.attr_helper.delete_by_reference_ids(
            ids, business_type=BusinessAttrValueBusinessType.API_SERVICE.value
        )
        d = delete(ThirdPartyApiServiceModel).where(ThirdPartyApiServiceModel.project_id == project_id).where(
            ThirdPartyApiServiceModel.id.in_(ids))
        await self.mapper.delete_condition(d)
        await self.mapper.commit()
        return None

    async def update(self, project_id, current_user: JwtUserInfo, request: ThirdPartyApiUpdateRequest) -> bool:
        # api名称校验
        if request.name:
            is_exists = await self.exists(request.name, project_id, request.id)
            if is_exists:
                raise HTTPException(status_code=400, detail=f"项目中已存在同名api名称：{request.name}")
        query = select(ThirdPartyApiServiceModel).where(ThirdPartyApiServiceModel.project_id == project_id).where(
            ThirdPartyApiServiceModel.id == request.id)
        instance = await self.mapper.query_one(query)

        if not instance:
            raise HTTPException(status_code=404, detail="Inference service not found")

        if request.name is not None:
            instance.name = request.name
        if request.description is not None:
            instance.description = request.description
        if request.base_url is not None:
            instance.base_url = request.base_url
        if request.header is not None:
            instance.header = request.header
        if request.request_param is not None:
            instance.request_param = request.request_param
        if request.response_param is not None:
            instance.response_param = request.response_param
        if request.request_type is not None:
            instance.request_type = request.request_type
        if request.protocol is not None:
            instance.protocol = request.protocol

        instance.updated_id = current_user.userId
        instance.updated_by = current_user.username
        instance.status = "未测试"
        if request.status is not None:
            instance.status = request.status

        if request.attr_values is not None:
            await self.attr_helper.update_attr_values(
                attr_values=request.attr_values,
                created_id=current_user.userId,
                created_by=current_user.username,
                tenant_id=current_user.tenantId,
                reference_id=instance.id,
                business_type=BusinessAttrValueBusinessType.API_SERVICE.value,
            )

        await self.mapper.commit()
        return True

    async def get_by_id(self, id_field_value):
        return await self.mapper.query_one(select(ThirdPartyApiServiceModel).where(ThirdPartyApiServiceModel.id == id_field_value))

    async def exists(
            self,
            name: str,
            project_id: int,
            id: int | None = None,
    ) -> bool:
        """True 表示已存在"""

        # 基础条件：同 project 内名称不能重复
        query = select(ThirdPartyApiServiceModel.id).where(
            ThirdPartyApiServiceModel.name == name,
            ThirdPartyApiServiceModel.project_id == project_id
        )
        # ,
        # InferenceService.tenant_id == app_runtime_context.get_tenant_id()

        # 修改场景排除自身
        if id is not None:
            query = query.where(ThirdPartyApiServiceModel.id != id)

        stmt = select(query.exists())
        is_exists = await self.mapper.execute(stmt)
        return is_exists.scalar()


    async def verify_connect(self, project_id: int , current_user: JwtUserInfo, request: ThirdPartyApiVerifyConnectRequest  )->ThirdPartyApiVerifyConnectResponse:
        data = await self.get_api_detail(project_id, current_user, request.id)


        base_url=data.base_url
        request_type = data.request_type
        header = data.header



        # test_data = {"id":1,"name":"张三"}

        # 请求头
        headers={}
        if header is not None:
            for e in header:
                headers.setdefault(e.get("name"),e.get("value"))


        print(f"请求header：:{headers}")

        # 更新测试状态
        update_data=ThirdPartyApiUpdateRequest(
            id=data.id,
            name=data.name,
            description=data.description,
            base_url=data.base_url,
            header=header,
            request_param=data.request_param,
            response_param=data.response_param,
            request_type=request_type,
            protocol=data.protocol,
            status="连接失败")



        #请求参数json模板
        request_tmp=self.generate_template(data.request_param)
        print(f"请求参数模板：{request_tmp}")

        #基于模板和原始配置 获取请求参数映射字段jsonpath
        banding=self.get_banding_true_names(data.request_param)
        request_json_path=self.generate_standard_jsonpath(request_tmp,banding)


        #响应参数json模板
        response_tmp=self.generate_template(data.response_param)
        print(f"响应参数模板：{request_tmp}")
        #基于模板和原始配置 获取请求参数映射字段jsonpath
        banding=self.get_banding_true_names(data.response_param)
        response_json_path=self.generate_standard_jsonpath(response_tmp,banding)

        print(f"请求参数绑定参数jsonpath：{request_json_path}")

        print(f"响应参数绑定参数jsonpath：{response_json_path}")

        verify_request_param_json=json.loads(json.dumps(request.verify_request_param))


        for i in request_json_path:
            key=verify_request_param_json.get(str(i))
            print(f"修改key: {key}")
            if key is not None:
                mapped_request_data, update_flag = self.update_json_by_jsonpath(json.loads(json.dumps(request_tmp)), str(i),   key)
                request_tmp=json.loads(json.dumps(mapped_request_data))
                print(f"修改后的请求参数：{mapped_request_data}")


        api_response=ThirdPartyApiVerifyConnectResponse()

        api_response.mapped_request_data=request_tmp
        api_response.original_data={}
        api_response.mapped_response_data={}

        # 调用api
        if request_type.upper() == "POST":
            try:
                print(f"请求参数：{request.verify_request_param}")
                response=None
                #response = requests.post(base_url,data=json.dumps(request_tmp),headers=headers)
                response = requests.post(base_url, json=json.loads(json.dumps(request_tmp, ensure_ascii=False)), headers=headers)
                print(f"请求第三方api报错了：{e}")
                print(f"请求响应体：{response}")

                try:
                    # 尝试解析响应体为 JSON，解析失败则返回原始文本
                    serialized = response.json()
                except ValueError:
                    serialized = {
                       "url": response.url,  # 请求的最终 URL（重定向后）
                    "status_code": response.status_code,  # 响应状态码（200/404/500 等）
                    "reason": response.reason,  # 状态码描述（OK/Not Found 等）
                    "headers": dict(response.headers),  # 响应头（转字典，原生是类字典对象）
                    "encoding": response.encoding,  # 响应编码
                    "elapsed": str(response.elapsed),  # 请求耗时（转字符串，原生是 timedelta 对象）
                    "ok": response.ok  # 是否请求成功（status_code < 400）
                }
                api_response.original_data = serialized


                print(f"状态码：{response.status_code}")
                api_response.state=response.status_code
                response_data =response.json()
                api_response.original_data = response_data











                if response.status_code == 200:
                    update_data.status="连接成功"

                    # 映射响应参数
                    mapped_data={}
                    for p in response_json_path:
                        mapped_data.setdefault(str(p), self.extract_jsonpath_data(response_data, str(p)))
                    api_response.mapped_response_data = mapped_data


                    print("aaaa")
            except Exception as e:
                print("aaaa")
                api_response.state = status.HTTP_500_INTERNAL_SERVER_ERROR
                update_data.status = "连接失败"

                print(f"异常信息:{e}")
        await self.update(project_id, current_user, update_data)
        return api_response






    def extract_jsonpath_data(self,data : json, jsonpath_expr:str):
        # 编译 JSONPath 表达式
        expr = parse(jsonpath_expr)
        # 匹配数据并提取值
        matches = expr.find(data)
        # 取出匹配结果中的 value（核心：match.value 是实际值）
        return [match.value for match in matches]

    def update_json_by_jsonpath(self,json_data, jsonpath_expr, new_value):
        """
        终极修复：增加节点类型判断，避免列表用字符串索引，彻底解决所有异常
        :param json_data: Python 字典/列表（可变对象）
        :param jsonpath_expr: 标准 JSONPath 表达式
        :param new_value: 新值
        :return: 修改后数据，是否成功
        """
        try:
            # 1. 编译 JSONPath，获取所有匹配项（[*] 会拆分为具体索引，如 habits[0]）
            expr = parse(jsonpath_expr)
            matches = expr.find(json_data)

            if not matches:
                print(f"JSONPath {jsonpath_expr} 未匹配到任何字段")
                return json_data, False

            # 2. 遍历每个匹配项，安全解析路径并修改
            for match in matches:
                # 步骤1：获取匹配项的完整字符串路径（如 '$.habits[0].type'）
                full_path = str(match.full_path)
                # 步骤2：移除开头的 '$'，拆分路径片段（如 '$.habits[0].type' → ['habits[0]', 'type']）
                path_parts = full_path.lstrip('$').split('.')
                # 过滤空片段（避免路径以 . 开头导致的空元素）
                path_parts = [p for p in path_parts if p.strip()]

                # 步骤3：逐层定位父节点（核心：每一步判断节点类型）
                current = json_data
                target_key = path_parts[-1]  # 最后一段是要修改的字段/索引
                parent_parts = path_parts[:-1]  # 前面的片段是父路径

                for part in parent_parts:
                    if '[' in part and ']' in part:
                        # 处理数组片段（如 'habits[0]' → 拆分 数组名 + 索引）
                        arr_part, idx_part = part.split('[', 1)
                        arr_idx = int(idx_part.rstrip(']'))

                        # 先定位数组（字典的键），再定位数组索引（整数）
                        if isinstance(current, dict):
                            current = current[arr_part]  # 字典取数组（如 habits）
                        if isinstance(current, list):
                            current = current[arr_idx]  # 列表取索引（如 0）
                    else:
                        # 处理普通字段（仅字典可用字符串索引）
                        if isinstance(current, dict):
                            current = current[part]
                        else:
                            raise ValueError(f"节点 {current} 是列表，无法用字符串 '{part}' 索引")

                # 步骤4：安全修改目标值（判断父节点类型）
                if isinstance(current, dict):
                    # 字典：字符串索引（如 type）
                    current[target_key] = new_value
                elif isinstance(current, list):
                    # 列表：整数索引（如 [0]）
                    current[int(target_key)] = new_value

            return json_data, True
        except Exception as e:
            print(f"修改失败：{e}")
            print(f"修改失败：{e}")
            return json_data, False

    def generate_template(self,data)->Dict[str,Any]:
        """
        递归生成模板（根据 data_type 自动适配类型：array 生成数组，其他生成字典/基础值）
        :param data: 原始 JSON 解析后的列表/字典
        :return: 目标模板字典
        """
        template = {}
        for item in data:
            # 1. 生成键：id 转大写 ID，其余保持原名称
            key = item["name"]

            # 2. 生成基础值：优先取 default_value，无则设为 None
            if "default_value" in item and item["default_value"] is not None:
                value = item["default_value"]
                # 根据 data_type 进行类型转换
                data_type = item.get("data_type", "")
                if data_type == "number":
                    # 尝试将值转为数字
                    if isinstance(value, str):
                        try:
                            value = int(value)
                        except ValueError:
                            try:
                                value = float(value)
                            except ValueError:
                                pass
                    elif not isinstance(value, (int, float)):
                        try:
                            value = float(value)
                        except ValueError:
                            pass
                elif data_type == "boolean":
                    # 尝试将值转为布尔类型
                    if isinstance(value, str):
                        value = value.lower() in ["true", "1", "yes", "y"]
                    else:
                        value = bool(value)
            else:
                value = None

            # 3. 处理子节点（核心：根据 data_type 决定生成数组/字典）
            if item.get("child") and isinstance(item["child"], list):
                # 递归生成子模板（字典格式）
                child_template = self.generate_template(item["child"])

                # 如果当前字段是 array 类型，生成数组（集合）模板；否则生成字典模板
                if item["data_type"] == "array":
                    # array 类型 → 数组包裹子模板（集合类型）
                    value = [child_template]
                else:
                    # 非 array 类型 → 直接用子字典
                    value = child_template
            # 4. 将键值对加入最终模板
            template[key] = value
        return template


    def get_banding_true_names(self,raw_data):
        """从原始数据提取所有 banding=true 的字段 name 值（去重）"""
        banding_true_names = set()  # 用集合去重，避免重复的 id

        def recursive_extract(data):
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        if item.get("binding") is True:
                            banding_true_names.add(item["name"])
                        # 递归处理 child 子节点
                        child = item.get("child")
                        if child and isinstance(child, list):
                            recursive_extract(child)

        recursive_extract(raw_data)
        return list(banding_true_names)

    def generate_standard_jsonpath(self,template_data, target_names, parent_path="$", result=None):
        """
        生成标准 JSONPath（数组用 [*] 匹配所有元素，如 $.habits[*].id）
        """
        if result is None:
            result = []

        # 处理字典节点
        if isinstance(template_data, dict):
            for key, value in template_data.items():
                # 拼接字典字段路径（如 $.id、$.habits）
                current_path = f"{parent_path}.{key}" if parent_path != "$" else f"$.{key}"

                # 匹配目标字段，记录路径
                if key in target_names:
                    result.append(current_path)

                # 递归处理子节点
                if isinstance(value, dict):
                    self.generate_standard_jsonpath(value, target_names, current_path, result)
                # 处理数组：拼接 [*] 后递归（标准 JSONPath 写法）
                elif isinstance(value, list) and len(value) > 0:
                    # 数组路径拼接 [*]（如 $.habits[*]）
                    array_path = f"{current_path}[*]"
                    # 遍历数组内所有元素，递归处理
                    for item in value:
                        self.generate_standard_jsonpath(item, target_names, array_path, result)


        return result


    def extract_binding_fields(self,fields, parent_path="",field_name=None, result=None):
        """
        递归提取所有binding=True的字段，生成desc和jsonpath
        :param fields: 字段配置列表（原始数据）
        :param parent_path: 父级JSONPath路径（递归用）
        :param result: 存储结果的列表（递归用）
        :return: 提取后的结果列表
        """
        # 初始化结果列表（首次调用时）
        if field_name is None:
            field_name = "binding"
        if result is None:
            result = []

        for field in fields:
            # 1. 拼接当前字段的JSONPath路径
            if parent_path:
                # 父级路径存在时，拼接子字段路径
                current_path = f"{parent_path}.{field['name']}"
            else:
                # 根级字段，路径以$.开头
                current_path = f"$.{field['name']}"

            # 2. 判断当前字段是否binding=True，若是则加入结果
            if field.get(field_name, False) is True:
                result.append({
                    "desc": field.get("desc", ""),  # 无desc时默认空字符串
                    "jsonpath": current_path,
                    "name":field.get("name", "")
                })

            # 3. 处理嵌套的child字段（数组类型）
            child_fields = field.get("child")
            if child_fields and isinstance(child_fields, list):
                # 数组类型的子字段，JSONPath需要加[*]（匹配数组所有元素）
                child_parent_path = f"{current_path}[*]"
                # 递归处理子字段
                self.extract_binding_fields(child_fields, child_parent_path,field_name, result)

        return result

    async def get_api_binding_field_info(self, project_id: int , current_user: JwtUserInfo,id :int  )->ThirdPartyApiBindingFileds:
        data = await self.get_api_detail(project_id, current_user, id)
        request_param=data.request_param
        response_param=data.response_param
        req=json.loads(json.dumps(self.extract_binding_fields(request_param)))
        res=json.loads(json.dumps(self.extract_binding_fields(response_param,field_name="inference")))
        return ThirdPartyApiBindingFileds(request_binding=req,response_binding=res)


    async def business_dataset_matedata(self,project_id, current_user, dataset_id,training_dataset_service):
       # 获取dataset
       dataset=await training_dataset_service.get_by_id(dataset_id)
       print(f"S书籍信息：{dataset}")




       #
       mata=await training_dataset_service.preview_dataset_data_optimized(dataset.project_id,dataset.name,dataset.version,1,1,"business_test")
       print(f"信息：{mata.items}")

       field_jsonpath_list = get_sample_data_field_jsonpath(mata.items)

       return  field_jsonpath_list






# ---------------------- 核心工具函数（可封装到你的工具文件中，全局复用） ----------------------
def obj_to_dict(obj: Any) -> Union[Dict, List, Any]:
    """通用对象转原生字典/列表（适配Pydantic模型、dataclass、基础类型）"""
    if hasattr(obj, "model_dump"):  # 优先适配Pydantic 2.x模型
        return obj.model_dump()
    elif dataclasses.is_dataclass(obj):  # 兼容数据类
        return dataclasses.asdict(obj)
    elif isinstance(obj, (list, tuple)):  # 遍历列表/元组递归转换
        return [obj_to_dict(item) for item in obj]
    elif isinstance(obj, dict):  # 遍历字典递归转换
        return {k: obj_to_dict(v) for k, v in obj.items()}
    else:  # 基础类型直接返回
        return obj


def get_sample_data_field_jsonpath(
        response_list: List[DatasetSampleResponse],
        jsonpath_prefix: str = "$"  # 路径前缀，可自定义（如改为"$.data"，默认根节点$）
) -> List[Dict[str, str]]:
    """
    从DatasetSampleResponse列表中提取第一条的sample_data，生成指定格式的字段JSONPath列表
    :param response_list: 接口返回的DatasetSampleResponse对象列表
    :param jsonpath_prefix: JSONPath根前缀，默认$（基于sample_data独立字典的根节点）
    :return: [{"name": 字段名, "jsonpath": 字段路径}, ...]
    """
    # 初始化结果列表
    result = []
    if not response_list:  # 空列表边界处理
        return result

    # 步骤1：对象列表转原生字典列表，提取第一条数据的sample_data纯字典
    raw_dict_list = obj_to_dict(response_list)
    first_sample_data = raw_dict_list[0].get("sample_data", {})  # 确保取到纯字典，无则返回空
    if not first_sample_data:  # sample_data为空字典边界处理
        return result

    # 步骤2：遍历sample_data的每个字段，生成指定格式的字典
    for field_name in first_sample_data.keys():
        # 拼接JSONPath（前缀 + . + 字段名，如$.哈哈哈、$.data.嘿嘿嘿）
        field_jsonpath = f"{jsonpath_prefix}.{field_name}" if jsonpath_prefix else field_name
        # 按要求构造字典，追加到结果列表
        result.append({
            "name": field_name,
            "jsonpath": field_jsonpath
        })
    return result
