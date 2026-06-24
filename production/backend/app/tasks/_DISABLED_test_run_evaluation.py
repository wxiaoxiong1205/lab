"""
TestRun评估任务模块
"""
import json
import traceback
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.tasks.constants import TaskStatus
from app.tasks.logger import TaskLogger
from app.utils.custom_llm import CustomLLM
from deepeval.test_case import LLMTestCase
from deepeval.metrics import (
    GEval, AnswerRelevancyMetric, ToolCorrectnessMetric, 
    FaithfulnessMetric, ContextualPrecisionMetric, 
    ContextualRecallMetric, ContextualRelevancyMetric
)
from deepeval.test_case import LLMTestCaseParams, ToolCall, ToolCallParams
from deepeval import evaluate as deepeval_evaluate
from deepeval.test_run import TestRunManager


class TestRunTaskLogger:
    """TestRun任务日志记录器"""
    
    def __init__(self, test_run_id: int):
        self.test_run_id = test_run_id
        self.logger = TaskLogger(test_run_id, "test_run")
        
    def log_info(self, message: str, **kwargs):
        self.logger.info(message, **kwargs)
    
    def log_warning(self, message: str, **kwargs):
        self.logger.warning(message, **kwargs)
    
    def log_error(self, message: str, error: Exception = None, **kwargs):
        if error:
            self.logger.log_error(error, message)
        else:
            self.logger.error(message, **kwargs)
    
    def log_progress(self, processed: int, total: int, message: str = None):
        self.logger.log_progress(processed, total, message)
    
    def log_start(self, message: str):
        self.logger.log_start(message)
    
    def log_complete(self, message: str):
        self.logger.log_complete(message)


def convert_lists_to_tuples(obj):
    """递归地将字典中的列表转换为元组以避免unhashable type错误"""
    if isinstance(obj, list):
        return tuple(convert_lists_to_tuples(item) for item in obj)
    elif isinstance(obj, dict):
        return {k: convert_lists_to_tuples(v) for k, v in obj.items()}
    else:
        return obj


def decode_unicode_in_dict(obj):
    """递归解码字典中的Unicode编码字符为中文字符"""
    if isinstance(obj, dict):
        return {k: decode_unicode_in_dict(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [decode_unicode_in_dict(item) for item in obj]
    elif isinstance(obj, str) and '\\u' in obj:
        try:
            import re
            processed_str = obj.replace('\\\\u', '\\u')
            pattern = r'\\u([0-9a-fA-F]{4})'
            
            def unicode_to_char(match):
                hex_val = match.group(1)
                try:
                    return chr(int(hex_val, 16))
                except:
                    return match.group(0)
            
            return re.sub(pattern, unicode_to_char, processed_str)
        except Exception as e:
            return obj
    return obj



@celery_app.task(base=TaskBase, bind=True)
def test_run_evaluation_task(self, test_run_id: int, project_id: int):
    """
    TestRun评估任务
    
    Args:
        test_run_id: TestRun ID
        project_id: 项目ID
    """
    logger = logging.getLogger(__name__)
    task_logger = TestRunTaskLogger(test_run_id)
    self.task_logger = task_logger
    run_name = ''
    
    try:
        with self.get_db_session() as session:
            from app.models.models import TestRun
            test_run = session.query(TestRun).filter(TestRun.id == test_run_id,TestRun.project_id == project_id).first()
            if not test_run:
                logger.error(f"评估任务 {test_run_id} 不存在")
                return
            logger.info(f"评估任务 {test_run.name} 状态: {test_run.status})")
            run_name = test_run.name
            status = test_run.status
            # 只有pengding状态才能执行
            if status != 'PENDING':
                logger.info(f"评估任务 {run_name} 状态为 {status}，跳过执行")
                return
            session.query(TestRun).filter(TestRun.id == test_run_id).update({TestRun.status: TaskStatus.RUNNING})
            session.commit()
            self.task_logger.log_info(f"评估任务 {run_name} 开始")
        
        # 运行评估任务
        _run_test_evaluation_sync(self, test_run)
        log_path = self.task_logger.logger.archive_logs()
        with self.get_db_session() as session:
            test_run = session.query(TestRun).filter(TestRun.id == test_run_id).first()
            test_run.log_path = log_path
            test_run.finished_at = datetime.utcnow()
            session.commit()
    except Exception as e:
        error_msg = str(e)
        logger.error(f"TestRun {test_run_id} 评估失败: {error_msg}")
        logger.error(f"错误详情: {traceback.format_exc()}")
        try:
            with self.get_db_session() as session:
                test_run = session.query(TestRun).filter(TestRun.id == test_run_id).first()
                if test_run:
                    try:
                        log_path = self.task_logger.logger.archive_logs()
                        test_run.status = TaskStatus.FAILED
                        test_run.error_message = error_msg
                        test_run.log_path = log_path
                        test_run.finished_at = datetime.utcnow()
                    except Exception:
                        test_run.status = TaskStatus.FAILED
                        test_run.error_message = error_msg
                        test_run.finished_at = datetime.utcnow()
                    session.commit()
        except Exception as final_error:
            logger.error(f"最终状态更新失败: {final_error}")

def _run_test_evaluation_sync(self, test_run):
    """运行测试评估的同步函数"""

    try:
        self.task_logger.log_info(f"开始处理评估任务 {test_run.name} 的评估数据")
        # 1. 准备LLM配置
        llm_config = test_run.evaluate_model
        if isinstance(llm_config, str):
            try:
                llm_config = json.loads(llm_config)
            except json.JSONDecodeError:
                self.task_logger.log_warning(f"解析模型配置失败: {llm_config}")
                llm_config = {"model_name": llm_config}
        elif not isinstance(llm_config, dict):
            llm_config = {"model_name": str(llm_config)}
        
        # 2. 查询评估数据
        from app.models.models import DatasetLog
        with self.get_db_session() as session:
            dataset_logs = session.query(DatasetLog).filter(
                DatasetLog.task_id == test_run.evaluate_id,
                DatasetLog.log_type == "job"
        ).order_by(DatasetLog.created_at).all()
        
        if not dataset_logs:
            raise ValueError(f"评估数据集为空:{test_run.evaluate_id}")
        
        # 3. 准备数据集日志数据
        dataset_logs_data = []
        for log in dataset_logs:
            dataset_logs_data.append({
                "dataset_content": log.dataset_content,
                "output": log.output,
                "llm_config_content": getattr(log, "llm_config_content", None),
                "prompt_messages": getattr(log, "prompt_messages", None),
                "tools_called": getattr(log, "tools_called", None)
            })
        
        # 4. 准备配置参数
        model_config = getattr(dataset_logs[0], "llm_config_content", {}) or {}
        prompt_config = getattr(dataset_logs[0], "prompt_messages", {}) or {}
        metrics_config = test_run.metrics
        
        # 创建自定义LLM
        custom_llm = CustomLLM(llm_config)
        test_cases = []
        self.task_logger.log_info(f"开始创建测试用例，共 {len(dataset_logs_data)} 条数据")
        
        # 创建测试用例
        for idx, dataset_log_data in enumerate(dataset_logs_data):
            try:
                dataset_content = dataset_log_data.get("dataset_content", {})
                input_text = dataset_content.get("question", "")
                expected_output = dataset_content.get("ground_truth", "")
                context = dataset_content.get("context", [])
                retrieval_context = dataset_content.get("retrieval_context", [])
                expected_tools = dataset_content.get("expected_tools", [])
                tools_called = dataset_log_data.get("tools_called", [])
                # 解码input_text和expected_output中的Unicode字符串为中文
                if input_text and isinstance(input_text, str):
                    input_text = decode_unicode_in_dict(input_text)
                if expected_output and isinstance(expected_output, str):
                    expected_output = decode_unicode_in_dict(expected_output)
                # 处理 expected_tools
                expected_tools_list = []
                if expected_tools and isinstance(expected_tools, list):
                    for tool in expected_tools:
                        if isinstance(tool, dict):
                            input_params = tool.get("input_parameters")
                            
                            if isinstance(input_params, dict):
                                # 解码Unicode字符串为中文
                                decoded_input_params = decode_unicode_in_dict(input_params)
                                safe_input_params = convert_lists_to_tuples(decoded_input_params)
                            else:
                                safe_input_params = {"value": input_params} if input_params is not None else {}
                            
                            tool_call = ToolCall(
                                name=tool.get("name", ""),
                                description=tool.get("description"),
                                reasoning=tool.get("reasoning"),
                                output=tool.get("output"),
                                input_parameters=safe_input_params
                            )
                            expected_tools_list.append(tool_call)
                
                # 处理 tools_called
                tools_called_list = []
                if tools_called and isinstance(tools_called, list):
                    for tool in tools_called:
                        if isinstance(tool, dict):
                            arguments = tool.get("arguments", None)
                            if isinstance(arguments, str):
                                try:
                                    arguments = json.loads(arguments)
                                except json.JSONDecodeError:
                                    self.task_logger.log_warning(f"无法解析工具参数JSON: {arguments}")
                                    arguments = {}
                            
                            if isinstance(arguments, dict):
                                # 解码Unicode字符串为中文
                                decoded_arguments = decode_unicode_in_dict(arguments)
                                safe_arguments = convert_lists_to_tuples(decoded_arguments)
                            else:
                                safe_arguments = {"value": arguments} if arguments is not None else {}
                            
                            tool_call = ToolCall(
                                name=tool.get("name", ""),
                                input_parameters=safe_arguments
                            )
                            tools_called_list.append(tool_call)
                
                actual_output = dataset_log_data.get("output")
                if tools_called_list:
                    actual_output = str(tools_called_list)
                
                # 解码actualOutput中的Unicode字符串为中文
                if actual_output and isinstance(actual_output, str):
                    actual_output = decode_unicode_in_dict(actual_output)
                
                if not actual_output:
                    self.task_logger.log_warning(f"跳过空输出的测试用例: {input_text}")
                    continue
                    
                test_case = LLMTestCase(
                    input=input_text,
                    actual_output=actual_output,
                    expected_output=expected_output,
                    context=context if context else None,
                    retrieval_context=retrieval_context if retrieval_context else None,
                    expected_tools=expected_tools_list if expected_tools_list else None,
                    tools_called=tools_called_list if tools_called_list else None,
                )
                test_cases.append(test_case)
                
            except Exception as e:
                self.task_logger.log_error(f"创建测试用例失败 {idx}: {e}")
                continue
        
        if not test_cases:
            raise ValueError(f"No valid test cases could be created for test run {test_run.id}")
        
        self.task_logger.log_info(f"成功创建 {len(test_cases)} 个测试用例")
        
        # 创建评估指标
        metrics = []
        try:
            # 安全地解析metrics配置
            if isinstance(metrics_config, str):
                try:
                    metrics_config_list = json.loads(metrics_config)
                except (json.JSONDecodeError, TypeError) as e:
                    self.task_logger.log_error(f"Failed to parse metrics_config JSON: {e}")
                    metrics_config_list = []
            elif isinstance(metrics_config, list):
                metrics_config_list = metrics_config
            else:
                self.task_logger.log_warning(f"Unexpected metrics_config type: {type(metrics_config)}")
                metrics_config_list = []
            
            for metric_config in metrics_config_list:
                if not isinstance(metric_config, dict):
                    self.task_logger.log_warning(f"Skipping invalid metric config: {metric_config}")
                    continue
                self.task_logger.log_info(f"metric_cofig:{metric_config}")
                    
                metric_type = metric_config.get("type")
                params_content = metric_config.get("params_content", {})
                
                if not isinstance(params_content, dict):
                    self.task_logger.log_warning(f"Invalid params_content for metric {metric_type}: {params_content}")
                    params_content = {}
                
                if metric_type == "GEval":
                    evaluation_params = params_content.get("evaluation_params", [])
                    if not isinstance(evaluation_params, list):
                        evaluation_params = []
                    
                    # 安全地获取LLMTestCaseParams属性
                    evaluation_params_enum = []
                    for param in evaluation_params:
                        try:
                            param_enum = getattr(LLMTestCaseParams, param.upper())
                            evaluation_params_enum.append(param_enum)
                        except AttributeError:
                            self.task_logger.log_warning(f"Unknown evaluation parameter: {param}")
                            continue
                    
                    if params_content.get("evaluation_steps"):
                        geval_metric = GEval(
                            name=metric_config.get("name"),
                            evaluation_params=evaluation_params_enum,
                            evaluation_steps=params_content.get("evaluation_steps"),
                            model=custom_llm,
                            threshold=params_content.get("threshold",0.5),
                            strict_mode=params_content.get("strict_mode", False),
                            verbose_mode=False
                        )
                    else:
                        geval_metric = GEval(
                            name=metric_config.get("name"),
                            evaluation_params=evaluation_params_enum,
                            criteria=params_content.get("criteria"),
                            model=custom_llm,
                            threshold=params_content.get("threshold",0.5),
                            strict_mode=params_content.get("strict_mode", False),
                            verbose_mode=False
                        )
                    metrics.append(geval_metric)
                elif metric_type == "AnswerRelevancy":
                    relevancy_metric = AnswerRelevancyMetric(
                        model=custom_llm,
                        threshold=params_content.get("threshold", 0.5),
                        strict_mode=params_content.get("strict_mode", False),
                        include_reason=params_content.get("include_reason", False),
                        verbose_mode=False
                    )
                    metrics.append(relevancy_metric)
                elif metric_type == "ToolCorrectness":
                    tool_correctness_metric = ToolCorrectnessMetric(
                        evaluation_params=[ToolCallParams.INPUT_PARAMETERS],
                        threshold=params_content.get("threshold", 0.5),
                        strict_mode=params_content.get("strict_mode", False),
                        verbose_mode=False,
                    )
                    metrics.append(tool_correctness_metric)
                elif metric_type == "Faithfulness":
                    faithfulness_metric = FaithfulnessMetric(
                        model=custom_llm,
                        threshold=params_content.get("threshold", 0.5),
                        strict_mode=params_content.get("strict_mode", False),
                        include_reason=params_content.get("include_reason", False),
                        verbose_mode=False
                    )
                    metrics.append(faithfulness_metric)
                elif metric_type == "ContextualPrecision":
                    contextual_precision_metric = ContextualPrecisionMetric(
                        model=custom_llm,
                        threshold=params_content.get("threshold", 0.5),
                        strict_mode=params_content.get("strict_mode", False),
                        include_reason=params_content.get("include_reason", False),
                        verbose_mode=False
                    )
                    metrics.append(contextual_precision_metric)
                elif metric_type == "ContextualRecall":
                    contextual_recall_metric = ContextualRecallMetric(
                        model=custom_llm,
                        threshold=params_content.get("threshold", 0.5),
                        strict_mode=params_content.get("strict_mode", False),
                        include_reason=params_content.get("include_reason", False),
                        verbose_mode=False
                    )
                    metrics.append(contextual_recall_metric)
                elif metric_type == "ContextualRelevancy":
                    contextual_relevancy_metric = ContextualRelevancyMetric(
                        model=custom_llm,
                        threshold=params_content.get("threshold", 0.5),
                        strict_mode=params_content.get("strict_mode", False),
                        include_reason=params_content.get("include_reason", False),
                        verbose_mode=False
                    )
                    metrics.append(contextual_relevancy_metric)
        except Exception as e:
            self.task_logger.log_error(f"Error creating metrics from configuration: {e}")
    
        if not metrics:
            raise ValueError(f"评估指标为空 {test_run.id}")
            
        self.task_logger.log_info(f"成功创建 {len(metrics)} 个评估指标")
        
        # 保存原始的wrap_up_test_run方法并打补丁
        original_wrap_up_test_run = TestRunManager.wrap_up_test_run

        def patched_wrap_up_test_run(self, runDuration, display_table=False, display=None):
            test_run = self.get_test_run()
            if test_run is None:
                self.task_logger.log_warning("Test Run is empty, please try again.")
                return None
            elif (
                len(test_run.test_cases) == 0
                and len(test_run.conversational_test_cases) == 0
            ):
                self.task_logger.log_warning("No test cases found, please try again.")
                return None

            valid_scores = test_run.construct_metrics_scores()
            if valid_scores == 0:
                self.task_logger.log_warning("All metrics errored for all test cases, please try again.")
                return None
            
            test_run.run_duration = runDuration
            test_run.calculate_test_passes_and_fails()
            test_run.sort_test_cases()
            test_run.delete_test_case_instance_ids()
            
            if display_table:
                self.display_results_table(test_run, display)
            
            try:
                json_data = test_run.model_dump(by_alias=True, exclude_none=True)
            except AttributeError:
                json_data = test_run.dict(by_alias=True, exclude_none=True)
            
            return json.dumps(json_data, ensure_ascii=False)

        TestRunManager.wrap_up_test_run = patched_wrap_up_test_run

        
        try:
            # 准备超参数
            if test_run.hyperparameters:
                hyperparameters = test_run.hyperparameters
            else:
                hyperparameters = {
                    "model": model_config.get("model", "Unknown Model"),
                    "prompt template": str(prompt_config.get("messages", "Unknown Prompt Template")),
                    "max_tokens": model_config.get("max_tokens"),
                    "temperature": model_config.get("temperature"),
                    "top_p": model_config.get("top_p"),
                    "frequency_penalty": model_config.get("frequency_penalty"),
                    "presence_penalty": model_config.get("presence_penalty"),
                    "base_url": model_config.get("base_url"),
                }
            
            self.task_logger.log_info(f"开始运行deepeval评估，测试用例数: {len(test_cases)}, 指标数: {len(metrics)}")
            
            # 运行评估
            evaluation_run = deepeval_evaluate(
                test_cases=test_cases,
                metrics=metrics,
                hyperparameters=hyperparameters,
                run_async=True,  
                verbose_mode=False,
                skip_on_missing_params=True,
                write_cache=False,
                use_cache=False,
                print_results=False,
                max_concurrent=4,
                
            )
            
            evaluation_result = getattr(evaluation_run, 'confident_link', None)
            
            if evaluation_result is None:
                raise Exception(f"评估结果为None")
            else:
                try:
                    evaluation_data = json.loads(evaluation_result) if isinstance(evaluation_result, str) else evaluation_result
                except json.JSONDecodeError as e:
                    self.task_logger.log_error(f"解析评估结果JSON失败: {e}")
                    raise Exception(f"评估结果不是有效的JSON: {str(e)}")
                    
            if not test_run.hyperparameters:
                test_run.hyperparameters = hyperparameters
            
            test_run.testPassed = evaluation_data.get("testPassed", 0)
            test_run.testFailed = evaluation_data.get("testFailed", 0)
            test_run.total_test_cases = test_run.testPassed + test_run.testFailed
            test_run.successful_test_cases = test_run.testPassed
            
            if "metricsScores" in evaluation_data:
                test_run.metrics_scores = evaluation_data["metricsScores"]
                
                avg_scores = []
                for metric_score in evaluation_data["metricsScores"]:
                    metric_name = metric_score.get("metric")
                    scores = metric_score.get("scores", [])
                    if scores and len(scores) > 0:
                        avg_score = sum(scores) / len(scores)
                        avg_scores.append({
                            "name": metric_name,
                            "averageScore": avg_score,
                            "count": len(scores)
                        })
                test_run.avg_metric_scores = avg_scores
                        # 更新test_run到数据库
            from app.models.models import TestRun
            with self.get_db_session() as session:
                db_test_run = session.query(TestRun).filter(TestRun.id == test_run.id).first()
                if db_test_run:
                    db_test_run.testPassed = test_run.testPassed
                    db_test_run.testFailed = test_run.testFailed
                    db_test_run.total_test_cases = test_run.total_test_cases
                    db_test_run.successful_test_cases = test_run.successful_test_cases
                    db_test_run.metrics_scores = test_run.metrics_scores
                    db_test_run.avg_metric_scores = test_run.avg_metric_scores
                    if not db_test_run.hyperparameters:
                        db_test_run.hyperparameters = test_run.hyperparameters
                    session.commit()
            
            test_cases = []
            from app.models.models import TestCase
            for idx, tc_data in enumerate(evaluation_data["testCases"]):
                if "metricsData" in tc_data and tc_data["metricsData"]:
                    tc_data["metricsData"] = decode_unicode_in_dict(tc_data["metricsData"])
                
                test_case = TestCase(
                    test_run_id=test_run.id,
                    name=tc_data.get("name", f"test_case_{idx}"),
                    input=tc_data.get("input", ""),
                    actual_output=tc_data.get("actualOutput", ""),
                    expected_output=tc_data.get("expectedOutput", ""),
                    success=tc_data.get("success", False),
                    metrics_data=tc_data.get("metricsData", []),
                    run_duration=tc_data.get("runDuration", 0.0),
                    order=tc_data.get("order", idx),
                    context=tc_data.get("context", []),
                    retrieval_context=tc_data.get("retrievalContext", []),
                    expected_tools=tc_data.get("expectedTools", []),
                    tools_called=tc_data.get("toolsCalled", []),
                    is_conversational=tc_data.get("conversational", False),
                )
                test_cases.append(test_case)
            
            with self.get_db_session() as session:
                session.add_all(test_cases)
                session.commit()
            with self.get_db_session() as session:
                session.query(TestRun).filter(TestRun.id == test_run.id).update({TestRun.status: TaskStatus.SUCCESS})
                session.commit()
            self.task_logger.log_info(f"TestRun {test_run.id} 评估完成成功")
        except Exception as e:
            self.task_logger.log_error(f"评估过程中发生错误: {e}")
            with self.get_db_session() as session:
                session.query(TestRun).filter(TestRun.id == test_run.id).update({TestRun.status: TaskStatus.FAILED})
                session.commit()
        finally:
            # 恢复原始方法
            TestRunManager.wrap_up_test_run = original_wrap_up_test_run
    except Exception as e:
        self.task_logger.log_error(f"评估过程中发生错误: {e}")
        raise e
