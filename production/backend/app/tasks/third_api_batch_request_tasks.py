import asyncio
from pathlib import Path

import aiohttp
import json
import os

from typing import Dict, List, Any
from aiohttp import ClientError, ClientTimeout
from distro import distro_release_info
from fastapi import Depends
from jsonpath_ng import parse
from juicefs import Client
from sqlalchemy import select

from app.common.status import TaskStatus
from app.core.logging import logger
from app.models.models import JwtUserInfo, ThirdPartyApiServiceModel
from app.repository.base_mapper import BaseMapper
from app.repository.third_party_api_mapper import ThirdPartyApiMapper
from app.repository.training_dataset_mapper import TrainingDatasetMapper
from app.schemas import storage
from app.schemas.business_inference_result_dataset import BusinessInferenceResultDatasetCreate
from app.schemas.third_party_api import ThirdPartyApiBindingFileds
from app.services.chunk_upload import ChunkUploadService
from app.services.storage.interface import StorageService
from app.tasks import TaskBase
from app.tasks.celery_app import celery_app
from pydantic import BaseModel
from datetime import datetime

from app.models import InferenceResultDataset
from app.repository.inference_result_mapper import InferenceResultDatasetMapper
from app.utils.auth import get_current_user
from app.utils.storage_enum import StoragePath

# ===================== 1. 全局配置 =====================
# 异步请求配置
REQUEST_TIMEOUT = ClientTimeout(total=30)  # 单请求超时30秒
MAX_CONCURRENT = 10                       # 最大并发数，避免接口限流




# 更新状态
async def update_task_progress(
         mapper:InferenceResultDatasetMapper
        ,dataset_id:int
        ,project_id: int
        ,task_status:str
        ,process : int
        ,celery_task_id:str
) -> bool:
    """
    更新任务进度/状态到MySQL（支持部分字段更新）
    :return: 操作是否成功
    """
    print("--------------------hengxin zhaungtai--------------")
    print(f"--------------------{InferenceResultDatasetMapper}--------------")
    try:

        query = select(InferenceResultDataset).where(InferenceResultDataset.project_id == project_id).where(
            InferenceResultDataset.id == dataset_id)
        instance =await  mapper.query_one(query)
        # 修复3：先判断instance是否存在，再访问instance.id（避免AttributeError）
        if not instance:
            logger.error(f"结果集dataset_id={dataset_id}、project_id={project_id}不存在，更新失败")
            return False
        # 按需更新字段



        # instance=InferenceResultDataset(**json.loads(json.dumps(instance)))

        if not instance.started_at:
            instance.started_at=datetime.now()

        instance.finished_at=datetime.now()
        instance.status = task_status
        instance.progress = process
        instance.celery_task_id = celery_task_id
        await  mapper.commit()
        logger.info(f"任务进度更新成功：dataset_id={dataset_id}，状态={task_status}，进度={process}%")
        return True
    except Exception as e:
        await  mapper.rollback()
        logger.error(f"更新任务dataset_id={dataset_id}进度失败: {str(e)}", exc_info=True)
        return False





# 异步请求工具函数（复用，无修改）
async def single_request(
    session: aiohttp.ClientSession,
    base_url: str,
    headers: Dict[str, str],
    request_type: str,
    param: Dict[str, Any]
) -> Dict[str, Any]:

    print("------------------发送http 请求--------------")
    print(f"--------------请求参数----{json.dumps(param)}--------------")
    print(f"--------------请求参头----{json.dumps(headers)}--------------")

    result = {
        "input_param": param,
        "request_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f"),
        "success": False,
        "status_code": 500,
        "response_data": None,
        "error_msg": None
    }
    try:
        if request_type.upper() == "POST":
            async with session.post(
                url=base_url, headers=headers, json=param, timeout=REQUEST_TIMEOUT
            ) as resp:
                print(f"请求状态码：{resp.status}")
                result["status_code"] = resp.status
                result["response_data"] = await resp.json()
                if 200 <= resp.status < 300:
                    result["success"] = True
                else:
                    result["error_msg"] = f"非成功状态码: {resp.status}"


        elif request_type.upper() == "GET":
            async with session.get(
                url=base_url, headers=headers, params=param, timeout=REQUEST_TIMEOUT
            ) as resp:
                result["status_code"] = resp.status
                result["response_data"] = await resp.json()
                if 200 <= resp.status < 300:
                    result["success"] = True
                else:
                    result["error_msg"] = f"非成功状态码: {resp.status}"
        else:
            result["error_msg"] = f"不支持的请求类型: {request_type}，仅支持GET/POST"
    except ClientTimeout:
        result["error_msg"] = f"请求超时（{REQUEST_TIMEOUT.total}秒）"
    except ClientError as e:
        result["error_msg"] = f"网络异常: {str(e)[:200]}"
    except ValueError:
        result["error_msg"] = "接口返回非JSON格式，无法解析"
    except Exception as e:
        result["error_msg"] = f"未知异常: {str(e)[:200]}"
    return result



# ====== 改造：异步请求核心逻辑（支持逐个执行+进度回调） ======
async def async_batch_request_core(
    input_data: Dict[str, Any],
    progress_callback  # 进度回调函数，每完成一个请求调用一次
) -> List[Dict[str, Any]]:
    """
    批量异步请求核心逻辑（改造后）
    :param progress_callback: 回调函数，参数为(success: bool)，用于更新进度
    """
    # 解析并校验参数
    try:
        base_url = input_data["base_url"]
        headers = input_data["headers"]
        request_type = input_data["request_type"]
        request_params = input_data["request_params"]
        request_params=json.loads(json.dumps(request_params,ensure_ascii=False))

        print(f"请求参数--request_params：{request_params}")

        if not base_url or not isinstance(request_params, list) or len(request_params) == 0:
            raise ValueError("base_url不能为空，request_params必须是非空列表")
    except KeyError as e:
        raise KeyError(f"缺失核心参数: {e}")
    except Exception as e:
        raise Exception(f"参数解析失败: {e}")
    
    # 执行批量请求（改造：逐个执行，每完成一个调用回调更新进度）
    request_results = []
    connector = aiohttp.TCPConnector(limit=MAX_CONCURRENT)
    async with aiohttp.ClientSession(connector=connector) as session:
        # 修复：加索引，打印当前执行的请求序号，直观确认执行次数
        for req_idx, param in enumerate(request_params, 1):
            print(f"【开始执行第{req_idx}/{len(request_params)}次API调用】参数：{param}")
            res = await single_request(session, base_url, headers, request_type, param)
            request_results.append(res)
            await progress_callback(res["success"])
            print(f"【第{req_idx}/{len(request_params)}次API调用完成】成功：{res['success']}，错误信息：{res['error_msg']}")
    return request_results




# ===================== 4. Celery异步任务（核心改造：实时更新MySQL进度） =====================
@celery_app.task(base=TaskBase, bind=True)
def batch_request_task(
                         self: TaskBase
                       , dataset_id: int
                       , project_id: int
                       , request:BusinessInferenceResultDatasetCreate
                       , tenant_id :str
                       ) -> Dict[str, Any]:
    """
    Celery异步任务（改造后）：
    1. 初始化任务到MySQL
    2. 执行批量请求，每完成一个更新一次MySQL进度
    3. 执行完成后，更新MySQL最终状态+写入本地文件
    """


    from app.database.database_depends import run_async_in_celery

    return run_async_in_celery(
        _batch_request_task_impl(
            self,
            dataset_id,
            project_id,
            request,
            tenant_id,
        )
    )




async  def   _batch_request_task_impl(
                         self: TaskBase
                       , dataset_id: int
                       , project_id: int
                       , request:BusinessInferenceResultDatasetCreate
                       , tenant_id :str
                       ) -> Dict[str, Any]:
    from app.core.depend_manager import AutoContainer
    container = AutoContainer()
    mapper: InferenceResultDatasetMapper = container.inference_result_dataset_mapper()
    third_party_api_mapper :ThirdPartyApiMapper= container.third_party_api_mapper()
    train_dataset_mapper: TrainingDatasetMapper = container.training_dataset_mapper()
    storage_service: StorageService = container.storage_service()






    print(f"mapper：{mapper}")
    print(f"dataset_id：{dataset_id}")
    print(f"project_id：{project_id}")

    query = select(InferenceResultDataset).where(InferenceResultDataset.project_id == project_id).where(
        InferenceResultDataset.id == dataset_id)
    instance = await mapper.query_one(query)

    # 生成项目命名空间
    namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"

    # 业务推理结果集存放地址
    file_path = await generate_file_path(instance.id, namespace, instance.name)
    instance.file_path = file_path


    print(f"文件夹{dir}")



    print(f"文件路径：{str(file_path)}")


    task_id = self.request.id  # Celery唯一任务ID

    print(f"异步程序id:{task_id}")

   # TaskStatus

    # 更新 异步处理数据状态为 初始化
    await update_task_progress(
        mapper, dataset_id, project_id, TaskStatus.PENDING.value, 0, task_id
    )


    #instance.id,
    input_data =await  parameter_encapsulation(third_party_api_mapper,train_dataset_mapper,instance, request, tenant_id,storage_service)

    try:
    #     # 1. 解析参数，获取总请求数
        base_url = input_data["base_url"]
        request_type = input_data["request_type"]
        request_params = input_data["request_params"]
        total_count = len(request_params)

        print(f"base_url:{base_url}")
        print(f"request_type:{request_type}")
        print(f"request_params:{request_params}")
        print(f"total_count:{total_count}")

        # 1. 解析参数，获取总请求数（input_data是dict，可正常索引）
        if not all(k in input_data for k in ["base_url", "request_type", "request_params"]):
            raise KeyError(f"input_data缺失核心参数，当前keys: {list(input_data.keys())}")
        base_url = input_data["base_url"]
        request_type = input_data["request_type"]
        request_params = input_data["request_params"]
        total_count = len(request_params)
        total_samples = input_data.get("total_samples", total_count)  # 兜底，避免除零
        logger.info(f"参数解析成功，总请求数：{total_count}，基础URL：{base_url}")


        # 定义定时任务相关变量（新增核心）
        progress_task = None  # 定时更新进度的任务对象
        is_running = True     # 定时任务运行标志位，控制启停
        # 进度统计变量（全局，请求完成时仅更新此变量）
        # 3. 定义进度统计变量+回调函数（核心：实时更新MySQL）
        completed_count = 0
        success_count = 0
        fail_count = 0
        async def progress_callback(is_success: bool):
            nonlocal completed_count, success_count, fail_count
            completed_count += 1
            if is_success:
                success_count += 1
            else:
                fail_count += 1
            # 仅打印日志，不调用数据库更新
            logger.info(f"请求完成：累计完成{completed_count}/{total_count}，成功{success_count}，失败{fail_count}")

        # 2. 定义定时更新进度的核心函数（新增）
        async def schedule_progress_update():
            """每10秒读取统计变量，更新数据库进度"""
            nonlocal completed_count, success_count, fail_count, total_samples, total_count
            while is_running:  # 由is_running控制循环启停
                if completed_count > 0:  # 有请求完成时才计算进度
                    process = (success_count / total_samples) * 100 if total_samples > 0 else 0
                    process = round(process, 0)
                    logger.info(f"定时更新进度：已完成{completed_count}/{total_count}，成功率：{process:.0f}%")
                    # 调用原有更新函数，更新数据库
                    await update_task_progress(
                        mapper, dataset_id, project_id, TaskStatus.RUNNING.value, process, task_id
                    )
                # 暂停10秒，核心定时逻辑
                await asyncio.sleep(10)

        # 3. 启动定时更新任务（新增）：用asyncio.create_task创建独立异步任务
        progress_task = asyncio.create_task(schedule_progress_update())
        logger.info(f"进度定时更新任务已启动，更新间隔：10秒")

        # 4. 执行批量请求（原有逻辑，无改动）
        logger.info("开始执行批量异步请求，即将进入single_request")
        request_results = await async_batch_request_core(input_data, progress_callback)
        logger.info(f"批量请求执行完成，总结果数：{len(request_results)}")






        bingding_fields=await get_api_binding_field_info(third_party_api_mapper, project_id, instance.online_service_id )
        print(f"绑定参数:{bingding_fields}")
        request_binding=bingding_fields.request_binding

        print(f"绑定参数:{request_binding}")

        response_binding=bingding_fields.response_binding
        print(f"绑定参数:{response_binding}")




        # 5. 合并结果，写入本地文件
        final_result = {
            "task_info": {
                "task_id": task_id,
                "start_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "end_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "total_request": total_count,
                "success_request": success_count,
                "fail_request": fail_count,
                "result_file_path": ""
            },
            "request_details": request_results
        }
       # print(f"最终结果：{final_result}")


        final_result=json.loads(json.dumps(final_result,ensure_ascii=False))


        print(f"最终输出：{final_result}")

        # 确保目录存在

        jfs=await storage_service.JUICEFS_CLIENT(tenant_id)
        remote_dir = os.path.dirname(file_path)
        if remote_dir:
            if not jfs.exists(remote_dir):
                print(f"远程验证数据集目录不存在，正在创建: {remote_dir}")
                jfs.makedirs(remote_dir, exist_ok=True)
                print(f"远程验证数据集目录创建成功: {remote_dir}")
            else:
                print(f"远程验证数据集目录已存在: {remote_dir}")




        with jfs.open(file_path, 'w', encoding='utf-8') as f:

            for item in final_result.get("request_details"):
                item=json.loads(json.dumps(item,ensure_ascii=False))
        #
        #         # 序列化单个对象，保留中文
        #         # 获取输入输出映射字段
                input_param=item.get("input_param")
                input_param=json.loads(json.dumps(input_param,ensure_ascii=False))

                for req in request_binding:
                    print(f"映射入参数{req}")
                    req=json.loads(json.dumps(req,ensure_ascii=False))
                    key=req.get("name")
                    jsonpath = req.get("jsonpath")
                    item[f"request_{key}"]=extract_jsonpath_data(input_param,jsonpath)
                    print(f"输出结果{item}")



                response_data = item.get("response_data")
                response_data = json.loads(json.dumps(response_data,ensure_ascii=False))
                for req in response_binding:
                    print(f"映射出参数{req}")
                    req=json.loads(json.dumps(req,ensure_ascii=False))
                    key=req.get("name")
                    jsonpath = req.get("jsonpath")
                    data=extract_jsonpath_data(response_data,jsonpath)
                    item[f"response_{key}"]=data

                    print(f"输出结果{item}")

                line = json.dumps(item,ensure_ascii=False)
                print("----------完成一次---------")
                # 逐行写入
                f.write(line + "\n")

        # 5. 批量请求完成：强制更新最终完成状态（100%）（新增）
        logger.info(f"批量请求完成，强制更新最终进度为100%")
        await update_task_progress(
            mapper, dataset_id, project_id, TaskStatus.COMPLETED.value,100, task_id
        )
        # 4. 运行异步请求（传入回调函数，实时更新进度）

    except Exception as e:

        await update_task_progress(
            mapper, dataset_id, project_id, TaskStatus.FAILED.value,  (success_count / total_samples) * 100 if total_samples > 0 else 0, task_id
        )


        print(e)
        pass




# 请求参数模型（无修改）
class RequestTaskParam(BaseModel):
    base_url: str
    headers: Dict[str, str]
    request_type: str
    response_binding_json_path: List[str]
    request_params: List[Dict[str, Any]]
    total_samples:int


async def generate_file_path(task_id:int, namespace:str, dataset_name:str)->str:
        """生成文件路径"""
        base_path = StoragePath.REAL_INFERENCE_DATASETS.format_storage_path(namespace=namespace, task_id=task_id)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"inference_result_{task_id}_{timestamp}.jsonl"
        return f"{base_path}{filename}"


async  def _jsf_client(storage_service: StorageService,tenant_id:str)->Client  :
        return await storage_service.JUICEFS_CLIENT(tenant_id)






# def extract_jsonpath_data(data : json, jsonpath_expr:str):
#         print(f"jsonpath_expr: {jsonpath_expr}")
#         # 编译 JSONPath 表达式
#         expr = parse(rf"{jsonpath_expr}")
#         # 匹配数据并提取值
#         matches = expr.find(data)
#         # 取出匹配结果中的 value（核心：match.value 是实际值）
#         return " ".join([match.value for match in matches])

def extract_jsonpath_data(data: Dict[str, Any], jsonpath_expr: str) -> str:
    """
    从字典格式的JSON数据中提取JSONPath指定的内容

    Args:
        data: 解析后的JSON数据（字典/列表格式）
        jsonpath_expr: JSONPath表达式

    Returns:
        提取到的字符串（多个值用空格分隔，无匹配返回空字符串）
    """
    print(f"jsonpath_expr: {jsonpath_expr}")
    try:
        # 直接编译表达式，避免rf双重转义
        expr = parse(jsonpath_expr)
        # 匹配数据
        matches = expr.find(data)
        # 提取值并处理可能的非字符串类型（如数字、布尔值）
        values = []
        for match in matches:
            # 确保值是字符串类型，避免非字符串值报错
            if isinstance(match.value, (str, int, float, bool)):
                values.append(str(match.value))
            elif match.value is None:
                values.append("")
            else:
                # 对复杂类型（如字典/列表）转为JSON字符串
                values.append(json.dumps(match.value, ensure_ascii=False))

        return " ".join(values)

    except Exception as e:
        print(f"提取JSONPath数据失败：{e}")
        return ""

def update_json_by_jsonpath(json_data, jsonpath_expr, new_value):
        """
        终极修复：增加节点类型判断，避免列表用字符串索引，彻底解决所有异常
        :param json_data: Python 字典/列表（可变对象）
        :param jsonpath_expr: 标准 JSONPath 表达式
        :param new_value: 新值
        :return: 修改后数据，是否成功
        """
        try:
            # 1. 编译 JSONPath，获取所有匹配项（[*] 会拆分为具体索引，如 habits[0]）
            expr = parse(rf"{jsonpath_expr}")
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

def generate_template(data)->Dict[str,Any]:
        """
        递归生成模板（根据 data_type 自动适配类型：array 生成数组，其他生成字典/基础值）
        :param data: 原始 JSON 解析后的列表/字典
        :return: 目标模板字典
        """
        template = {}
        for item in data:
            # 1. 生成键：id 转大写 ID，其余保持原名称
            key = item["name"]

            # 2. 生成基础值：优先取 default_value（转数字），无则设为 None
            if "default_value" in item and item["default_value"] is not None:
                    # 尝试将 default_value 转为数字（如 "1" → 1）
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
                child_template = generate_template(item["child"])

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


def get_banding_true_names(raw_data):
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

def generate_standard_jsonpath(template_data, target_names, parent_path="$", result=None):
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
                    generate_standard_jsonpath(value, target_names, current_path, result)
                # 处理数组：拼接 [*] 后递归（标准 JSONPath 写法）
                elif isinstance(value, list) and len(value) > 0:
                    # 数组路径拼接 [*]（如 $.habits[*]）
                    array_path = f"{current_path}[*]"
                    # 遍历数组内所有元素，递归处理
                    for item in value:
                        generate_standard_jsonpath(item, target_names, array_path, result)

        return result


def extract_binding_fields(fields, parent_path="", result=None):
        """
        递归提取所有binding=True的字段，生成desc和jsonpath
        :param fields: 字段配置列表（原始数据）
        :param parent_path: 父级JSONPath路径（递归用）
        :param result: 存储结果的列表（递归用）
        :return: 提取后的结果列表
        """
        # 初始化结果列表（首次调用时）
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
            if field.get("binding", False) is True:
                result.append({
                    "desc": field.get("desc", ""),  # 无desc时默认空字符串
                    "jsonpath": current_path,
                    "name": field["name"],
                })

            # 3. 处理嵌套的child字段（数组类型）
            child_fields = field.get("child")
            if child_fields and isinstance(child_fields, list):
                # 数组类型的子字段，JSONPath需要加[*]（匹配数组所有元素）
                child_parent_path = f"{current_path}[*]"
                # 递归处理子字段
                extract_binding_fields(child_fields, child_parent_path, result)

        return result

async def get_api_binding_field_info(api_mapper :ThirdPartyApiMapper, project_id: int ,id :int  )->ThirdPartyApiBindingFileds:


        query = select(ThirdPartyApiServiceModel).where(ThirdPartyApiServiceModel.project_id == project_id).where(
            ThirdPartyApiServiceModel.id == id)
        data = await api_mapper.query_one(query)


        request_param=data.request_param
        response_param=data.response_param
        req=json.loads(json.dumps(extract_binding_fields(request_param),ensure_ascii=False, indent=2))
        res=json.loads(json.dumps(extract_binding_fields(response_param),ensure_ascii=False, indent=2))
        return ThirdPartyApiBindingFileds(request_binding=req,response_binding=res)


async  def parameter_encapsulation(third_party_api_mapper :ThirdPartyApiMapper,train_dataset_mapper :TrainingDatasetMapper,instance:InferenceResultDataset,request:BusinessInferenceResultDatasetCreate
        ,tenant_id:str,
    storage_service: StorageService       ):
        rep={}
        list=[]
        # 基于 三方api 接口id 获取三方api信息
        if instance.online_service_id:
            query = select(ThirdPartyApiServiceModel).where(
                ThirdPartyApiServiceModel.project_id == instance.project_id).where(
                ThirdPartyApiServiceModel.id == instance.online_service_id)
            api = await third_party_api_mapper.query_one(query)

            rep["base_url"]=api.base_url
            headers={}
            header_fileds=json.loads(json.dumps(api.header,ensure_ascii=False, indent=2))

            for key in header_fileds:
                key_json=json.loads(json.dumps(key,ensure_ascii=False, indent=2))
                name=key_json.get("name")
                value=key_json.get("default_value")
                headers[str(name)]=value
            rep["headers"]=headers
            rep["request_type"]=api.request_type

            # 三方api 请求参数
            request_param = api.request_param
            # 基于请求参数获取 参数模板
            request_param_tmp = generate_template(request_param)

            print(f"参数模板：{request_param_tmp}")
            # 获取创建数据集请求的 参数映射字段信息

            print(f"请求参数：{str(request)}")

            request= json.loads(json.dumps(request,ensure_ascii=False, indent=2))

            request_param_map = json.loads(json.dumps(request.get("param"),ensure_ascii=False, indent=2))
            print(f"参数映射关系:{request_param_map}")
            request_in_map = request_param_map.get("request_map")
            print(f"请求参数映射关系:{request_in_map}")

            request_maps = json.loads(json.dumps(request_in_map,ensure_ascii=False, indent=2))

            print(f"请求参数映射:{request_maps}")

            response_param=api.response_param

            # 基于模板和原始配置 获取请求参数映射字段jsonpath
            banding = get_banding_true_names(response_param)
            response_tmp=generate_template(response_param)

            response_json_path = generate_standard_jsonpath(response_tmp, banding)

            rep["response_binding_json_path"]= response_json_path




        # 获取 待推理数据集信息
        if instance.source_dataset_id:
            from app.models.training_dataset_manager import TrainingDataset
            source_dataset = await train_dataset_mapper.query_one(
                select(TrainingDataset).filter(TrainingDataset.id == instance.source_dataset_id)
            )

            if source_dataset:
                # 数据集格式
                if source_dataset.dataset_format:
                    dataset_format = source_dataset.dataset_format
                    print(f"dataset_format:{dataset_format}")
                # 数据集数据量
                if source_dataset.total_samples:
                    instance.total_items = source_dataset.total_samples
                    logger.info(f"从源数据集 {instance.source_dataset_id} 获取数据量: {source_dataset.total_samples}")

                    rep["total_samples"]=source_dataset.total_samples

                # 从源数据集获取 dataset_type 和 dataset_format
                if source_dataset.dataset_type:
                    instance.dataset_type = source_dataset.dataset_type
                    logger.info(
                        f"从源数据集 {instance.source_dataset_id} 获取数据集类型: {source_dataset.dataset_type}")

                if source_dataset.dataset_format:
                    instance.dataset_format = source_dataset.dataset_format
                    logger.info(
                        f"从源数据集 {instance.source_dataset_id} 获取数据格式: {source_dataset.dataset_format}")
                # 数据集存放地址
                source_dataset_path = source_dataset.dataset_path
                if source_dataset_path:
                    jfs = await  _jsf_client(storage_service,tenant_id)
                    file_exists = jfs.exists(source_dataset_path)
                    if file_exists:
                        print(f"文件：{source_dataset.dataset_path}")
                        # 读取数据集
                        with jfs.open(source_dataset_path.encode("utf-8"), 'r', encoding='utf-8') as f:

                            index = 0
                            for line in f:
                                #解析数据集
                                json_data = request_param_tmp
                             #   print(f"数据明细：{line}")

                                json_line = json.loads(line)
                             #   print(f"读取到的json:{json_line}")

                                for i in request_maps:

                                    # 解析 请求映射集合中的每一对映射关系
                                    in_out_map = json.loads(json.dumps(i,ensure_ascii=False, indent=2))

                                    # 获取源 字段jsonpath
                                    source_field_path = in_out_map.get("source_field_path")
                                    # 目标字段jsonpath
                                    target_field_path = in_out_map.get("target_field_path")
                                    # 从数据集 获取字段值
                                    target_data = extract_jsonpath_data(json_line, target_field_path)
                                    # 将 请求参数模板中的值替换为 数据集中的 值
                                    json_data, flag = update_json_by_jsonpath(json_data, source_field_path,  target_data)
                                json_data = json.loads(json.dumps(json_data,ensure_ascii=False, indent=2))
                                json_data["index"] = index
                                print(f"完成参数映射绑定后的参数：{json_data}")
                                index = index + 1
                                # 将参数追加到 参数列表中
                                list.append(json_data)
                        rep["request_params"]=list
                        return rep

            else:
                logger.warning(f"源数据集 {instance.source_dataset_id} 不存在")
