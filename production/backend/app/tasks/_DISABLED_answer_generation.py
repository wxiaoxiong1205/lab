import time
import asyncio
import traceback
from typing import Dict, Any, List
from datetime import datetime
from openai import AsyncOpenAI
from celery.exceptions import TaskRevokedError

from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.tasks.constants import TaskStatus
from langchain.prompts import ChatPromptTemplate
from langchain_core.messages.utils import convert_to_openai_messages


def _create_dataset_log(dataset_id, project_id, db_task_id, task_name, llm_config_content, 
                       prompt_messages, dataset_content=None, question="", output=None, 
                       tools_called=None, input_values=None, success=True, 
                       error_message=None, execution_time_ms=None):
    """创建 DatasetLog 记录的通用函数"""
    from app.models.models import DatasetLog
    
    return DatasetLog(
        dataset_id=dataset_id,
        project_id=project_id,
        question=question,
        output=output,
        task_id=db_task_id,
        task_name=task_name,
        log_type="job",
        llm_config_content=llm_config_content,
        prompt_messages=prompt_messages,
        dataset_content=dataset_content or {},
        tools_called=tools_called or [],
        input_values=input_values or {},
        success=success,
        error_message=error_message,
        execution_time_ms=execution_time_ms,
        created_at=datetime.utcnow()
    )


def _validate_required_params(task_args):
    """验证必需参数"""
    required_params = ['project_id', 'prompt_messages', 'llm_config_content', 'directory_id']
    missing_params = [param for param in required_params if not task_args.get(param)]
    
    if missing_params:
        error_msg = f"缺少必需参数: {', '.join(missing_params)}"
        raise ValueError(error_msg)
    
    return {param: task_args[param] for param in required_params}


@celery_app.task(base=TaskBase, bind=True)
def answer_generation_task(self, db_task_id: int, task_args: Dict[str, Any]):
    try:
        need_clean=False
        # 只有PENDING任务才能执行
        if not self.setup_task(db_task_id):
            return
        need_clean=True
        self.update_status(TaskStatus.RUNNING)
        
        # 验证和提取任务参数
        required_params = _validate_required_params(task_args)
        project_id = required_params['project_id']
        prompt_messages = required_params['prompt_messages']
        llm_config_content = required_params['llm_config_content']
        directory_id = task_args.get('directory_id')
        variable_mappings = task_args.get('variable_mappings', {})
        
        
        # 查询数据集
        with self.get_db_session() as session:
            from app.models.models import Dataset
            query = session.query(Dataset).filter(
                Dataset.project_id == project_id,
                Dataset.directory_id == directory_id
            )
            datasets = query.all()
        
        if not datasets:
            error_msg = f"未找到匹配的数据集 (project_id={project_id}, directory_id={directory_id})"
            self.log_error(error_msg)
            raise ValueError(error_msg)
        
        self.log_info(f"找到 {len(datasets)} 个数据集，开始处理")
        
        # 运行异步处理
        result = asyncio.run(_process_datasets_async(
            self, datasets, project_id, prompt_messages, llm_config_content, variable_mappings, db_task_id
        ))
        
        success_msg = f"答案生成任务完成，处理了 {result['total']} 个数据集，成功 {result['success']} 个，失败 {result['failed']} 个"
        if result['total'] == result['success'] + result['failed']:
            self.mark_success(success_msg)
        else:
            self.log_info(success_msg)
        return result
        
    except Exception as e:
        error_msg = str(e)
        self.log_error(f"任务执行失败: {error_msg}", e)
        self.mark_failed(error_msg)
        raise
    finally:
        if need_clean:
            self.cleanup_task()


async def _process_datasets_async(self, datasets, project_id, prompt_messages, llm_config_content, variable_mappings, db_task_id):
    # 配置参数
    MAX_CONCURRENT, BATCH_SIZE = 5, 10
    total_count = len(datasets)
    processed_count = success_count = failed_count = 0
    
    # 创建异步客户端和模板
    async_client = AsyncOpenAI(
        base_url=llm_config_content.get("base_url"),
        api_key=llm_config_content.get("api_key")
    )
    
    prompt_template = ChatPromptTemplate.from_messages(
        prompt_messages.get("messages", []), 
        template_format=prompt_messages.get("template_format")
    )
    
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    dataset_logs = []
    
    async def process_single_dataset(dataset, dataset_index):
        """处理单个数据集的异步函数"""
        async with semaphore:
            try:
                # 构建输入变量
                input_vars = {
                    prompt_var: getattr(dataset, dataset_field, "") 
                    for prompt_var, dataset_field in variable_mappings.items()
                }
                
                # 生成最终消息
                prompt_value = prompt_template.invoke(input_vars)
                final_messages = convert_to_openai_messages(prompt_value.messages)
                question = final_messages[-1]["content"] if final_messages else ""
                
                # OpenAI调用参数
                openai_params = {
                    "model": llm_config_content.get("model"),
                    "temperature": llm_config_content.get("temperature", 0.7),
                    "max_tokens": llm_config_content.get("max_tokens"),
                    "top_p": llm_config_content.get("top_p", 1.0),
                    "frequency_penalty": llm_config_content.get("frequency_penalty", 0.0),
                    "presence_penalty": llm_config_content.get("presence_penalty", 0.0),
                    "timeout": llm_config_content.get("timeout", 120),
                    "messages": final_messages
                }
                
                # 添加工具支持（如果有）
                if hasattr(dataset, 'tools') and dataset.tools:
                    openai_params.update({"tools": dataset.tools, "tool_choice": "auto"})
                
                # 调用LLM
                start_time = time.time()
                response = await async_client.chat.completions.create(**openai_params)
                execution_time_ms = int((time.time() - start_time) * 1000)
                
                # 提取输出和工具调用
                output = response.choices[0].message.content
                tools_called = [
                    {"name": tc.function.name, "arguments": tc.function.arguments}
                    for tc in (response.choices[0].message.tool_calls or [])
                ]
                
                # 创建成功记录
                dataset_content = _prepare_dataset_content(self, dataset)
                return _create_dataset_log(
                    dataset.id, project_id, db_task_id, self.task_name, 
                    llm_config_content, prompt_messages, dataset_content, question, 
                    output, tools_called, input_vars, True, None, execution_time_ms
                ), True
                
            except Exception as e:
                # 检查是否是取消异常
                if isinstance(e, TaskRevokedError):
                    self.log_info("任务在处理数据集时被取消")
                    raise  # 重新抛出，让上层处理
                
                # 创建失败记录
                error_msg = str(e)
                self.log_error(f"处理数据集【{dataset.question}】 失败: {error_msg}")
                dataset_content = _prepare_dataset_content(self, dataset)
                
                return _create_dataset_log(
                    dataset.id, project_id, db_task_id, self.task_name, 
                    llm_config_content, prompt_messages, dataset_content, 
                    getattr(dataset, 'question', ''), None, None, {}, False, error_msg, None
                ), False
    
    # 创建所有任务并流式处理
    tasks = [process_single_dataset(dataset, i) for i, dataset in enumerate(datasets, 1)]
    
    for completed_task in asyncio.as_completed(tasks):
        try:
            result = await completed_task
            
            if isinstance(result, Exception): 
                self.log_error(f"未捕获异常导致处理失败: {str(result)}")
            else:
                dataset_log, is_success = result
                dataset_logs.append(dataset_log)
                
                if is_success:
                    success_count += 1
                    self.log_info(f"数据集【{dataset_log.question}】 处理成功，耗时: {dataset_log.execution_time_ms}ms")
                else:
                    failed_count += 1
                    self.log_error(f"数据集【 {dataset_log.question}】 处理失败: {dataset_log.error_message}")
            
            processed_count += 1
            self.log_info(f"处理进度: {processed_count}/{total_count} (成功: {success_count}, 失败: {failed_count})")
            
            # 每处理一个任务后检查取消状态
            self.check_and_handle_cancellation()
            
            # 批量提交
            if len(dataset_logs) >= BATCH_SIZE:
                if self.batch_insert_dataset_logs(dataset_logs):
                    self.update_progress(processed_count, total_count, success_count, failed_count)
                    self.log_info(f"批量提交完成: {len(dataset_logs)} 条记录已保存到数据库")
                dataset_logs.clear()
            
        except TaskRevokedError:
            # 任务被取消，优雅退出
            self.log_info("任务被取消，停止处理剩余数据集")
            break
            
        except Exception as e:
            # 处理任务执行异常
            error_msg = str(e)
            self.log_error(f"任务执行异常: {error_msg}")
            
            exception_log = _create_dataset_log(
                None, project_id, db_task_id, self.task_name, 
                llm_config_content, prompt_messages, {}, "", None, None, {}, 
                False, f"任务执行异常: {error_msg}", None
            )
            dataset_logs.append(exception_log)
            failed_count += 1
            processed_count += 1
    
    # 提交剩余记录和最终进度更新
    if dataset_logs:
        self.batch_insert_dataset_logs(dataset_logs)
    
    self.update_progress(processed_count, total_count, success_count, failed_count)
    await async_client.close()
    
    return {
        "total": total_count,
        "processed": processed_count,
        "success": success_count,
        "failed": failed_count
    }


def _prepare_dataset_content(self, dataset):
    """准备数据集内容快照的辅助方法"""
    try:
        from app.utils.data_utils import dataset_to_dict
        import json
        dataset_dict = dataset_to_dict(dataset)
        return json.loads(json.dumps(dataset_dict, ensure_ascii=False))
    except Exception as content_error:
        self.log_warning(f"无法处理数据集内容快照: {str(content_error)}")
        return {"id": dataset.id, "question": getattr(dataset, 'question', '')} 
    

@celery_app.task(base=TaskBase, bind=True)
def answer_generation_retry_error(self, db_task_id: int, project_id: int):
    """重试失败的答案生成任务"""
    try:
        # 设置任务环境
        self.setup_task(db_task_id)
        
        # 查询失败的数据集日志
        with self.get_db_session() as session:
            from app.models.models import DatasetLog
            failed_logs_query = session.query(DatasetLog).filter(
                DatasetLog.project_id == project_id,
                DatasetLog.success == False,
                DatasetLog.task_id == db_task_id,
                
            )
            failed_logs = failed_logs_query.all()
        
        self.log_info(f"找到 {len(failed_logs)} 个失败的数据集日志，开始重试")
        
        # 运行异步重试处理
        result = asyncio.run(_retry_failed_logs_async(
            self, failed_logs, project_id, db_task_id
        ))
        
        success_msg = f"重试任务完成，处理了 {result['total']} 个失败记录，成功 {result['success']} 个，仍失败 {result['failed']} 个"
        return result
        
    except Exception as e:
        error_msg = str(e)
        self.log_error(f"重试任务执行失败: {error_msg}", e)
        self.mark_failed(error_msg)
        raise
    finally:
        self.cleanup_task()


async def _retry_failed_logs_async(self, failed_logs, project_id, db_task_id):
    """异步重试失败的数据集日志"""
    # 配置参数
    MAX_CONCURRENT = 5
    total_count = len(failed_logs)
    processed_count = success_count = failed_count = 0
    
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    
    # 创建异步客户端（延迟初始化）
    async_client = None
    
    # 收集需要更新到数据库的记录
    updated_logs = []
    
    async def process_single_failed_log(failed_log):
        """处理单个失败的数据集日志"""
        nonlocal async_client
        async with semaphore:
            try:
                # 检查必要的重试数据
                if not failed_log.llm_config_content or not failed_log.prompt_messages:
                    error_msg = "缺少重试所需的配置信息（llm_config_content 或 prompt_messages）"
                    self.log_warning(f"跳过记录 {failed_log.id}: {error_msg}")
                    return failed_log, False
                
                # 初始化异步客户端（延迟初始化）
                if async_client is None:
                    async_client = AsyncOpenAI(
                        base_url=failed_log.llm_config_content.get("base_url"),
                        api_key=failed_log.llm_config_content.get("api_key")
                    )
                
                # 构建最终消息（使用保存的input_values重新生成）
                if failed_log.input_values:
                    # 如果有输入变量，重新构建prompt
                    prompt_template = ChatPromptTemplate.from_messages(
                        failed_log.prompt_messages.get("messages", []), 
                        template_format=failed_log.prompt_messages.get("template_format")
                    )
                    prompt_value = prompt_template.invoke(failed_log.input_values)
                    final_messages = convert_to_openai_messages(prompt_value.messages)
                else:
                    # 如果没有输入变量，直接使用保存的消息
                    final_messages = failed_log.prompt_messages.get("messages", [])
                
                question = final_messages[-1]["content"] if final_messages else failed_log.question
                
                # OpenAI调用参数
                openai_params = {
                    "model": failed_log.llm_config_content.get("model"),
                    "temperature": failed_log.llm_config_content.get("temperature", 0.7),
                    "max_tokens": failed_log.llm_config_content.get("max_tokens"),
                    "top_p": failed_log.llm_config_content.get("top_p", 1.0),
                    "frequency_penalty": failed_log.llm_config_content.get("frequency_penalty", 0.0),
                    "presence_penalty": failed_log.llm_config_content.get("presence_penalty", 0.0),
                    "timeout": failed_log.llm_config_content.get("timeout", 120),
                    "messages": final_messages
                }
                
                # 调用LLM
                start_time = time.time()
                response = await async_client.chat.completions.create(**openai_params)
                execution_time_ms = int((time.time() - start_time) * 1000)
                
                # 提取输出和工具调用
                output = response.choices[0].message.content
                tools_called = [
                    {"name": tc.function.name, "arguments": tc.function.arguments}
                    for tc in (response.choices[0].message.tool_calls or [])
                ]
                
                # 更新失败记录
                failed_log.output = output
                failed_log.question = question  # 更新可能重新生成的问题
                failed_log.tools_called = tools_called
                failed_log.success = True
                failed_log.error_message = None
                failed_log.execution_time_ms = execution_time_ms
                
                return failed_log, True
                
            except Exception as e:
                # 检查是否是取消异常
                if isinstance(e, TaskRevokedError):
                    self.log_info("重试任务在处理失败记录时被取消")
                    raise  # 重新抛出，让上层处理
                
                # 重试仍然失败，更新错误信息
                error_msg = str(e)
                self.log_error(f"重试记录【{failed_log.question}】 失败: {error_msg}")
                
                # 更新错误信息，但保持success=False
                failed_log.error_message = f"重试失败: {error_msg}"
                
                return failed_log, False
    
    # 创建所有重试任务并流式处理
    tasks = [process_single_failed_log(failed_log) for failed_log in failed_logs]
    
    for completed_task in asyncio.as_completed(tasks):
        try:
            result = await completed_task
            
            if isinstance(result, Exception):
                self.log_error(f"未捕获异常导致重试失败: {str(result)}")
                failed_count += 1
            else:
                updated_log, is_success = result
                
                # 将更新的记录添加到待更新列表
                updated_logs.append(updated_log)
                
                if is_success:
                    success_count += 1
                    self.log_info(f"记录【{updated_log.question}】 重试成功，耗时: {updated_log.execution_time_ms}ms")
                else:
                    failed_count += 1
                    self.log_error(f"记录【{updated_log.question}】 重试失败: {updated_log.error_message}")
            
            processed_count += 1
            self.log_info(f"重试进度: {processed_count}/{total_count} (成功: {success_count}, 失败: {failed_count})")
            
            # 每处理一个任务后检查取消状态
            self.check_and_handle_cancellation()
                
        except TaskRevokedError:
            # 任务被取消，优雅退出
            self.log_info("重试任务被取消，停止处理剩余失败记录")
            break
            
        except Exception as e:
            # 处理任务执行异常
            error_msg = str(e)
            self.log_error(f"重试任务执行异常: {error_msg}")
            failed_count += 1
            processed_count += 1

    
    # 批量更新数据库
    if updated_logs:
        try:
            with self.get_db_session() as session:
                for updated_log in updated_logs:
                    # 从数据库重新查询记录并更新相关字段
                    from app.models.models import DatasetLog
                    db_log = session.query(DatasetLog).filter(DatasetLog.id == updated_log.id).first()
                    if db_log:
                        # 只更新output、success相关的信息
                        db_log.output = updated_log.output
                        db_log.success = updated_log.success
                        db_log.error_message = updated_log.error_message
                        db_log.execution_time_ms = updated_log.execution_time_ms
                        db_log.tools_called = updated_log.tools_called
                        db_log.question = updated_log.question
                
                session.commit()
                self.log_info(f"成功更新了 {len(updated_logs)} 条数据集日志记录到数据库")
                
        except Exception as db_error:
            self.log_error(f"更新数据库失败: {str(db_error)}")
            # 数据库更新失败不影响任务结果，因为重试本身已经完成
    
    # 关闭异步客户端
    if async_client:
        await async_client.close()
    
    return {
        "total": total_count,
        "processed": processed_count,
        "success": success_count,
        "failed": failed_count
    }