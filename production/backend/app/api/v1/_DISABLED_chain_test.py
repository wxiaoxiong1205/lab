import json
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List, AsyncIterator, Tuple

from fastapi import APIRouter, Depends, HTTPException, status, Path
from fastapi.responses import StreamingResponse
from openai import OpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel, Field, validator
from app.models.models import Prompt, LLMConfig, User, DatasetLog, JwtUserInfo
from app.utils.data_utils import dataset_to_dict, llm_config_to_dict, prompt_to_dict
from app.utils.dataset_utils import get_dataset
from app.utils.dependencies import get_db_and_user
from app.utils.error_messages import data_not_found_error
from app.api.dataset.utils.validators import validate_project
from app.core.logging import logger
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages.utils import convert_to_openai_messages

router = APIRouter(prefix="/api/v1/chain_test", tags=["chain-test"])

# Input validation models
class ChainInput(BaseModel):
    prompt_id: int = Field(..., description="ID of the prompt to use")
    llm_config_id: int = Field(..., description="ID of the LLM configuration")
    input_values: Dict[str, Any] = Field(..., description="Dictionary of input values")
    dataset_id: Optional[int] = Field(None, description="Optional ID of existing dataset")
    session_id: Optional[str] = Field(None, description="Optional session ID for conversations")

    @validator('input_values')
    def validate_input_values(cls, v):
        if not v:
            raise ValueError("input_values cannot be empty")
        return v


async def _log_conversation_async(
    project_id: int,
    question: str,
    output: str,
    session_id: Optional[str],
    dataset_content: Optional[Dict[str, Any]],
    history_content: List[Dict[str, str]],
    execution_time_ms: Optional[int],
    ttft_ms: Optional[int],
    llm_config_content: Optional[Dict[str, Any]] = None,
    prompt_content: Optional[Dict[str, Any]] = None
) -> None:
    """异步记录对话日志"""
    try:
        from app.database.base import async_session
        async with async_session() as db:
            dataset_log = DatasetLog(
                project_id=project_id,
                question=question,
                output=output,
                session_id=session_id,
                dataset_content=dataset_content,
                history_content=history_content,
                llm_config_content=llm_config_content,
                prompt_messages=prompt_content,
                success=True,
                execution_time_ms=execution_time_ms,
                ttft_ms=ttft_ms,
                log_type="chat",
                task_id=None
            )
            
            db.add(dataset_log)
            await db.commit()
            logger.info(f"成功记录对话日志，问题: {question[:50]}...")
            
    except Exception as e:
        logger.error(f"异步记录对话日志失败: {str(e)}")

async def validate_resource_belongs_to_project(
    db: AsyncSession, 
    resource_id: int, 
    project_id: int, 
    resource_type: str
) -> Any:
    """通用验证资源是否属于指定项目"""
    model_map = {
        "prompt": Prompt,
        "llm_config": LLMConfig
    }
    
    model = model_map.get(resource_type)
    if not model:
        raise ValueError(f"不支持的资源类型: {resource_type}")
    
    query = select(model).where(and_(model.id == resource_id, model.project_id == project_id))
    result = await db.execute(query)
    resource = result.scalar_one_or_none()
    
    if not resource:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=data_not_found_error()
        )
    return resource

async def get_latest_dataset_logs_by_session_id(db: AsyncSession, session_id: str) -> DatasetLog:
    """获取会话最新日志"""
    query = select(DatasetLog).where(DatasetLog.session_id == session_id).order_by(DatasetLog.created_at.desc()).limit(1)
    result = await db.execute(query)
    return result.scalar_one_or_none()

async def process_openai_stream_response(
    response,
    start_time: datetime,
    dataset_dict: Optional[Dict[str, Any]],
    messages: Optional[List[Dict[str, str]]],
    project_id: int,
    session_id: Optional[str] = None,
    llm_config_content: Optional[Dict[str, Any]] = None,
    prompt_content: Optional[Dict[str, Any]] = None
) -> AsyncIterator[str]:
    """处理流式响应并异步记录日志"""
    complete_response = ""
    complete_tool_calls = ""
    ttft_ms = None
    
    try:
        for chunk in response:
            if not chunk.choices or len(chunk.choices) == 0:
                continue
                
            if chunk.choices[0].delta.content is not None:
                content = chunk.choices[0].delta.content
                if ttft_ms is None and content:
                    ttft_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                yield f"data: {content}\n\n"
                complete_response += content
                
            if hasattr(chunk.choices[0].delta, 'tool_calls') and chunk.choices[0].delta.tool_calls is not None:
                tool_calls_data = chunk.choices[0].delta.tool_calls
                tool_data = ""
                for tool_call in tool_calls_data:
                    if tool_call.function.name is not None:
                        tool_data = tool_call.function.name
                        complete_tool_calls += tool_call.function.name
                    if tool_call.function.arguments is not None:
                        tool_data = tool_call.function.arguments
                        complete_tool_calls += tool_call.function.arguments
                    yield f"data: {tool_data}\n\n"
                    
        # 更新消息历史
        question = messages[-1]["content"]
        messages.append({"role": "assistant", "content": complete_response})
        
        # 异步记录日志
        if complete_response and project_id:
            try:
                import asyncio
                asyncio.create_task(
                    _log_conversation_async(
                        project_id=project_id,
                        question=question,
                        output=complete_response,
                        session_id=session_id,
                        dataset_content=dataset_dict,
                        history_content=messages.copy(),
                        execution_time_ms=int((datetime.now() - start_time).total_seconds() * 1000) if start_time else None,
                        ttft_ms=ttft_ms,
                        llm_config_content=llm_config_content,
                        prompt_content=prompt_content
                    )
                )
            except Exception as log_error:
                logger.error(f"异步日志记录失败: {str(log_error)}")
                
    except Exception as e:
        error_msg = f"OpenAI流处理错误: {str(e)}"
        logger.error(error_msg)
        raise


@router.post("/by-project/{project_id}/invoke")
async def run_chain_fallback_openai(
    project_id: int = Path(..., description="项目ID"),
    chain_input: ChainInput = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user)
) -> StreamingResponse:
    """在指定项目下运行链测试"""
    db, current_user = deps
    
    request_id = str(uuid.uuid4())
    start_time = datetime.now()
    
    # 验证会话ID
    if not chain_input.session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="session_id is required for OpenAI API"
        )
    
    try:
        # 验证项目和资源
        await validate_project(db, project_id)
        prompt = await validate_resource_belongs_to_project(db, chain_input.prompt_id, project_id, "prompt")
        llm_config = await validate_resource_belongs_to_project(db, chain_input.llm_config_id, project_id, "llm_config")
        dataset = await get_dataset(db, chain_input.dataset_id)
        
        # 检查会话记录
        dataset_log = await get_latest_dataset_logs_by_session_id(db, chain_input.session_id)
        new_session = not dataset_log
        
        # 准备数据集字典
        dataset_dict = dataset_to_dict(dataset) if dataset else None
        
        # 准备配置快照
        llm_config_content = llm_config_to_dict(llm_config)
        prompt_content = prompt_to_dict(prompt)
            
        # 创建OpenAI客户端
        openai_client = OpenAI(base_url=llm_config.base_url, api_key=llm_config.api_key)
        
        # 准备OpenAI参数
        openai_params = {
            "model": llm_config.model,
            "stream": True,
            "temperature": llm_config.temperature,
            "max_tokens": llm_config.max_tokens,
            "top_p": llm_config.top_p,
            "frequency_penalty": llm_config.frequency_penalty,
            "presence_penalty": llm_config.presence_penalty,
            "timeout": llm_config.timeout
        }
        
        if new_session:
            # 新对话处理
            try:
                prompt_template = ChatPromptTemplate.from_messages(prompt.messages, template_format=prompt.template_format)
                prompt_value = prompt_template.invoke(chain_input.input_values)
                messages = convert_to_openai_messages(prompt_value.messages)
                
                if dataset and dataset.tools:
                    openai_params["tools"] = dataset.tools
                    openai_params["tool_choice"] = "auto"
            except Exception as e:
                logger.error(f"请求 {request_id}: 处理提示词模板失败: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to process prompt template: {str(e)}"
                )
        else:
            # 多轮对话处理
            question = chain_input.input_values.get("follow_up_question", "")
            if not question:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="follow_up_question is required for session conversations"
                )
                
            # 解析历史消息
            if isinstance(dataset_log.history_content, list):
                messages = dataset_log.history_content
            else:
                try:
                    messages = json.loads(dataset_log.history_content)
                except json.JSONDecodeError:
                    messages = []
            
            messages.append({"role": "user", "content": question})
        
        # 创建OpenAI请求
        openai_params["messages"] = messages
        openai_response = openai_client.chat.completions.create(**openai_params)
        
        # 返回流式响应
        return StreamingResponse(
            process_openai_stream_response(
                response=openai_response,
                start_time=start_time,
                dataset_dict=dataset_dict,
                messages=messages,
                project_id=project_id,
                session_id=chain_input.session_id,
                llm_config_content=llm_config_content,
                prompt_content=prompt_content
            ),
            media_type="text/event-stream"
        )
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"运行OpenAI API时出错: {str(e)}"
        return StreamingResponse(
            (f"data: {json.dumps({'error': error_msg}, ensure_ascii=False)}\n\n" for _ in range(1)),
            media_type="text/event-stream"
        )