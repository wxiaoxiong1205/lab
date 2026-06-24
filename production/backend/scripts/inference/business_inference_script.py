#!/usr/bin/env python
"""
业务推理脚本（RESTful API 调用）
专门用于业务推理结果数据集，通过 RESTful API 调用第三方接口
"""

import argparse
import asyncio
import copy
import json
import os
import sys
import time
import yaml
import aiohttp
from pathlib import Path
from typing import Optional, Dict, Any, List
from loguru import logger
from jsonpath_ng import   parse



# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from scripts.inference.data_processor import read_jsonl_batch, count_jsonl_lines


def load_config(config_file: Optional[str] = None) -> Dict[str, Any]:
    """加载配置文件"""
    if not config_file:
        raise ValueError("配置文件路径不能为空")
    
    if not os.path.exists(config_file):
        raise FileNotFoundError(f"配置文件不存在: {config_file}")
    
    logger.info(f"加载配置文件: {config_file}")
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f) or {}
        logger.info("配置文件加载完成")
        return config
    except yaml.YAMLError as e:
        logger.error(f"配置文件格式错误: {str(e)}")
        raise ValueError(f"配置文件格式错误: {str(e)}") from e
    except Exception as e:
        logger.error(f"读取配置文件失败: {str(e)}")
        raise


def get_config_value(config: Dict, *keys, default=None):
    """从嵌套字典中获取值"""
    value = config
    for key in keys:
        if isinstance(value, dict):
            value = value.get(key)
            if value is None:
                return default
        else:
            return default
    return value if value is not None else default


def format_execution_time(total_time: float) -> str:
    """格式化执行时间为可读字符串"""
    hours = int(total_time // 3600)
    minutes = int((total_time % 3600) // 60)
    seconds = int(total_time % 60)
    milliseconds = int((total_time % 1) * 1000)
    
    if hours > 0:
        return f"{hours}小时{minutes}分钟{seconds}秒"
    elif minutes > 0:
        return f"{minutes}分钟{seconds}秒"
    else:
        return f"{seconds}秒{milliseconds}毫秒"


async def call_restful_api(
    session: aiohttp.ClientSession,
    base_url: str,
    request_data: Dict[str, Any],
    headers: Dict[str, str],
    timeout: int = 120
) -> Dict[str, Any]:
    """
    调用 RESTful API
    
    Args:
        session: aiohttp 会话
        base_url: API 基础 URL
        request_data: 请求数据
        headers: 请求头
        timeout: 超时时间（秒）
    
    Returns:
        API 响应数据
    """


    try:
        async with session.post(
            base_url,
            json=json.loads(json.dumps(request_data, ensure_ascii=False)),
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=timeout)
        ) as response:
            response.raise_for_status()
            data=await response.text()
            logger.info(f"------响应数据------{json.loads(data) }")
            return json.loads(data)
            #return await response.json()
    except asyncio.TimeoutError:
        raise Exception(f"API 调用超时（{timeout}秒）")
    except aiohttp.ClientError as e:
        raise Exception(f"API 调用失败: {str(e)}")
    except Exception as e:
        raise Exception(f"API 调用异常: {str(e)}")

#
# def apply_field_mapping(data: Dict[str, Any], mapping: List[Dict[str, str]]) -> Dict[str, Any]:
#     """
#     应用字段映射（使用 jsonpath-ng 库支持完整的 JSONPath 语法）
#
#     Args:
#         data: 源数据
#         mapping: 字段映射配置列表
#             格式: [{"source_field_path": "$.field", "target_field_path": "$.target"}]
#
#     Returns:
#         映射后的数据
#
#     支持的 JSONPath 语法：
#         - $.field                    # 顶层字段
#         - $.field.subfield           # 嵌套字段
#         - $.field[0]                 # 数组索引
#         - $.field[*]                 # 数组所有元素
#         - $.field[?(@.key > 10)]     # 过滤器表达式
#     """
#     if not mapping:
#         return {}
#
#     result = {}
#
#     for map_item in mapping:
#
#         #获取目标数据和原始数据的jsonpath
#         source_path = map_item.get("source_field_path", "")
#         target_path = map_item.get("target_field_path", "")
#
#
#         if not source_path or not target_path:
#             logger.warning(f"字段映射配置不完整，跳过: {map_item}")
#             continue
#
#         try:
#             # 使用 jsonpath-ng 解析源路径
#             jsonpath_expr = jsonpath_parse(source_path)
#             matches = jsonpath_expr.find(data)
#
#             if not matches:
#                 logger.debug(f"源路径未匹配到数据: {source_path}")
#                 continue
#
#             # 如果匹配到多个值，取第一个（或者可以配置为取所有）
#             value = matches[0].value
#
#             # 设置到目标路径
#             # 目标路径使用简化解析（只支持 $.field.subfield 格式）
#             if target_path.startswith("$."):
#                 target_path = target_path[2:]
#
#             keys = target_path.split(".")
#             current = result
#             for key in keys[:-1]:
#                 if key not in current:
#                     current[key] = {}
#                 elif not isinstance(current[key], dict):
#                     logger.warning(f"目标路径冲突，跳过: {target_path}")
#                     break
#                 current = current[key]
#             else:
#                 # 只有在没有 break 的情况下才设置最终值
#                 current[keys[-1]] = value
#                 logger.debug(f"字段映射成功: {source_path} -> {target_path}")
#
#         except JsonPathParserError as e:
#             logger.error(f"JSONPath 解析错误: {source_path}, 错误: {str(e)}")
#             continue
#         except Exception as e:
#             logger.error(f"字段映射失败: {source_path} -> {target_path}, 错误: {str(e)}")
#             continue
#
#     return result


async def process_batch(
    data_batch: List[Dict[str, Any]],
    batch_idx: int,
    session: aiohttp.ClientSession,
    config: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    处理单个批次的数据
    
    Args:
        data_batch: 数据批次
        batch_idx: 批次索引
        session: aiohttp 会话
        config: 配置字典
    
    Returns:
        处理结果列表
    """
    logger.info(f"\n处理第 {batch_idx} 批数据，包含 {len(data_batch)} 条")
    
    # 从配置中获取参数
    base_url = get_config_value(config, "business_api", "base_url")
    headers = get_config_value(config, "business_api", "headers", default={})
    request_params = get_config_value(config, "business_api", "request_params_tmp", default={})
    request_map = get_config_value(config, "business_api", "request_map", default=[])
    response_params_inference = get_config_value(config, "business_api", "response_params_inference", default=[])
    timeout = get_config_value(config, "business_api", "timeout", default=120)
    max_concurrent = get_config_value(config, "business_api", "max_concurrent", default=4)
    # request_params_binding = get_config_value(config, "business_api", "request_params_binding", default=[])
    request_params_inference = get_config_value(config, "business_api", "request_params_inference",  default=[])

    # logger.info("-----------展示批处理参数开始-------")
    # logger.info(f"请求地址：{base_url}")
    # logger.info(f"请求头：{headers}")
    # logger.info(f"请求参数：{request_params}")
    # logger.info(f"请求映射：{request_map}")
    # logger.info(f"响应映射：{response_map}")
    #
    # logger.info("-----------展示批处理参数结束-------")
    # 将headers 字段描述信心 转换为 json对象 {k:v}

    if not base_url:
        raise ValueError("配置中缺少 business_api.base_url")
    
    # 创建信号量限制并发数
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def process_single_item(index: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """处理单条数据"""

        logger.info(f"数据集：{data}")

        async with semaphore:
            try:
                # 从 request_param 字段获取请求参数（如果存在）
                # 如果没有 request_param，则使用整个 data 作为源数据
                source_data = data.get("request_param", data)
                modified_param={}
                for param in request_params.keys() :
                    modified_param[param] = copy.deepcopy(request_params[param])

                for map_item in request_map:
                    # 获取目标数据和原始数据的jsonpath
                    source_path = map_item.get("source_field_path", "")
                    target_path = map_item.get("target_field_path", "")
                    if not source_path or not target_path:
                        logger.warning(f"字段映射配置不完整，跳过: {map_item}")
                        continue
                    target_value = extract_jsonpath_data(source_data,target_path)
                    modified_param,flag=update_json_by_jsonpath(modified_param, source_path, target_value)
                
                logger.debug(f"[{index+1}/{len(data_batch)}] 调用 API: {base_url}")
                logger.debug(f"[{index+1}/{len(data_batch)}] 请求数据: {json.dumps(modified_param, ensure_ascii=False)[:200]}...")
                
                # 调用 API
                response_data = await call_restful_api(
                    session, base_url, modified_param, headers, timeout
                )
                
                logger.debug(f"[{index+1}/{len(data_batch)}] 响应数据: {json.dumps(response_data, ensure_ascii=False)[:200]}...")

                response_data = json.loads(json.dumps(response_data, ensure_ascii=False))
                # 处理数据
                logger.info(f"输入映射：{request_params_inference}")
                result = {}
                for binding in request_params_inference:
                    binding = json.loads(json.dumps(binding, ensure_ascii=False))
                    key = binding.get("name")
                    value = extract_jsonpath_data(modified_param, binding.get("jsonpath"))
                    result[f"req_{key}"] = value

                logger.info(f"输入映射：{response_params_inference}")
                for binding in response_params_inference:
                    binding = json.loads(json.dumps(binding, ensure_ascii=False))
                    key = binding.get("name")
                    value = extract_jsonpath_data(response_data,  binding.get("jsonpath"))
                    result[f"res_{key}"] = value



                logger.info(f"[{index+1}/{len(data_batch)}] API 调用成功")
                # result["error"]=False
                return {**data, **result}
            except Exception as e:
                logger.error(f"[{index+1}/{len(data_batch)}] 处理失败: {str(e)}")
                raise Exception(f"调用api失败: {str(e)}")
                return {
                    "error": True
                }
    
    # 并发处理所有数据
    tasks = [process_single_item(i, data) for i, data in enumerate(data_batch)]
    results = await asyncio.gather(*tasks)
    
    success_count = sum(1 for r in results if not r.get("error", False))
    failed_count = len(results) - success_count
    
    logger.info(f"批次处理完成，成功: {success_count} 条，失败: {failed_count} 条")
    
    return results


def save_results(results: List[Dict], output_path: str, append: bool = False) -> None:
    """保存结果到 JSONL 文件"""
    # 确保输出目录存在
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
        logger.info(f"创建输出目录: {output_dir}")
    
    mode = 'a' if append else 'w'
    saved_count = 0
    
    try:
        with open(output_path, mode, encoding='utf-8') as f:
            for result in results:
                json_line = json.dumps(result, ensure_ascii=False)
                f.write(json_line + '\n')
                saved_count += 1
        
        if not append:
            logger.info(f"结果保存完成: {saved_count} 条")
        else:
            logger.debug(f"追加保存完成: {saved_count} 条")
            
    except Exception as e:
        logger.error(f"保存结果失败: {str(e)}")
        raise


def write_progress(progress_file: Optional[str], progress_data: Dict[str, Any]) -> None:
    """写入进度信息"""
    if not progress_file:
        return
    
    try:
        progress_dir = os.path.dirname(progress_file)
        if progress_dir and not os.path.exists(progress_dir):
            os.makedirs(progress_dir, exist_ok=True)
        
        with open(progress_file, 'a', encoding='utf-8') as f:
            json_line = json.dumps(progress_data, ensure_ascii=False)
            f.write(json_line + '\n')
    except Exception as e:
        logger.warning(f"写入进度文件失败: {str(e)}")


async def process_file(
    input_file: str,
    output_file: str,
    config: Dict[str, Any]
) -> int:
    """处理单个文件"""
    batch_size = get_config_value(config, "data", "batch_size", default=100)
    skip_errors = get_config_value(config, "data", "skip_errors", default=True)
    progress_file = get_config_value(config, "runtime", "progress_file")
    
    # 清空输出文件
    if os.path.exists(output_file):
        os.remove(output_file)
        logger.info(f"已清空输出文件: {output_file}")
    
    total_count = 0
    
    # 创建 aiohttp 会话
    async with aiohttp.ClientSession() as session:
        try:
            for batch_idx, data_batch in enumerate(
                read_jsonl_batch(input_file, batch_size=batch_size, skip_errors=skip_errors),
                1
            ):
                # 处理批次
                results = await process_batch(data_batch, batch_idx, session, config)
                
                # 保存结果
                is_first_batch = (batch_idx == 1)
                save_results(results, output_file, append=not is_first_batch)
                
                total_count += len(results)
                logger.info(f"第 {batch_idx} 批处理完成并已保存，累计处理 {total_count} 条")
                
                # 写入进度
                if progress_file:
                    write_progress(progress_file, {
                        "batch_index": batch_idx,
                        "processed_lines": total_count,
                        "status": "processing"
                    })
            
            # 写入完成进度
            if progress_file:
                write_progress(progress_file, {
                    "processed_lines": total_count,
                    "status": "completed"
                })
            
            return total_count
            
        except Exception as e:
            logger.error(f"处理文件失败: {str(e)}")
            if progress_file:
                write_progress(progress_file, {
                    "processed_lines": total_count,
                    "status": "error",
                    "error": str(e)
                })
            raise


async def main():
    """主函数"""
    start_time = time.time()
    
    parser = argparse.ArgumentParser(description="业务推理脚本（RESTful API 调用）")
    parser.add_argument("--config_file", type=str, required=True, help="配置文件路径（YAML格式）")
    args = parser.parse_args()
    
    # 加载配置
    config = load_config(args.config_file)
    
    # 配置日志
    log_level = get_config_value(config, "runtime", "log_level", default="INFO")
    logger.remove()
    logger.add(
        sys.stderr,
        level=log_level,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <level>{message}</level>"
    )
    
    logger.info("=" * 80)
    logger.info("业务推理脚本启动（RESTful API 调用）")
    logger.info("=" * 80)
    
    try:
        # 获取输入输出文件
        input_files = get_config_value(config, "runtime", "input_file")
        output_files = get_config_value(config, "runtime", "output_file")
        
        if isinstance(input_files, str):
            input_files = [input_files]
        if isinstance(output_files, str):
            output_files = [output_files]
        
        if not input_files or not output_files:
            raise ValueError("必须指定输入和输出文件")
        
        if len(input_files) != len(output_files):
            raise ValueError("输入文件数量与输出文件数量不一致")
        
        # 处理所有文件
        total_processed = 0
        for input_file, output_file in zip(input_files, output_files):
            logger.info(f"\n处理文件: {input_file}")
            logger.info(f"输出文件: {output_file}")
            
            count = await process_file(input_file, output_file, config)
            total_processed += count
            
            logger.info(f"文件处理完成，共处理 {count} 条数据")
        
        logger.info(f"\n所有文件处理完成，总计处理 {total_processed} 条数据")
        
    except Exception as e:
        logger.error(f"执行失败: {str(e)}")
        sys.exit(1)
    finally:
        end_time = time.time()
        total_time = end_time - start_time
        time_str = format_execution_time(total_time)
        logger.info("=" * 80)
        logger.info(f"脚本执行完成，总耗时: {time_str}")
        logger.info("=" * 80)


def extract_jsonpath_data(data : json, jsonpath_expr:str):
        # 编译 JSONPath 表达式
        expr = parse(jsonpath_expr)
        # 匹配数据并提取值
        matches = expr.find(data)
        # 取出匹配结果中的 value（核心：match.value 是实际值）
        return " ".join([str(match.value) for match in matches])

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

# 提取绑定字段jsonpath信息
def extract_binding_fields(self,fields, parent_path="", result=None):
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
                    "name":field.get("name", "")
                })

            # 3. 处理嵌套的child字段（数组类型）
            child_fields = field.get("child")
            if child_fields and isinstance(child_fields, list):
                # 数组类型的子字段，JSONPath需要加[*]（匹配数组所有元素）
                child_parent_path = f"{current_path}[*]"
                # 递归处理子字段
                self.extract_binding_fields(child_fields, child_parent_path, result)

        return result



if __name__ == "__main__":
    asyncio.run(main())

