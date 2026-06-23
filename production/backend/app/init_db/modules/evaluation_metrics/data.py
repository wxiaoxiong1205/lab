"""
评估指标种子数据
"""

from typing import List, Dict, Any
from app.models.basic_metric_manager import MetricType


def get_evaluation_metrics_data() -> List[Dict[str, Any]]:
    """获取基础评估指标种子数据"""
    return [
        {
            "name": "准确率",
            "description": "用于评估模型正确执行给定任务的能力，模型预测结果与评估集完全一致的样本占比，反映整体预测的正确性。",
            "metric_code": "accuracy",
            "metric_type": MetricType.BASIC_METRIC,
            "score_scope": None,
            "metrics_param": None,
            "is_builtin": True,
        },
        {
            "name": "F1",
            "description": "综合考虑模型精准率与召回率的调和平均值，衡量模型在生成内容时的平衡性能，越高表示模型越稳健。",
            "metric_code": "f1",
            "metric_type": MetricType.BASIC_METRIC,
            "score_scope": None,
            "metrics_param": None,
            "is_builtin": True,
        },
        {
            "name": "ROUGE-1",
            "description": "基于单个词(unigram)的匹配程度，计算模型生成文本与参考答案之间的词汇覆盖率，用于评估关键信息是否被提及。",
            "metric_code": "rouge-1",
            "metric_type": MetricType.BASIC_METRIC,
            "score_scope": None,
            "metrics_param": None,
            "is_builtin": True,
        },
        {
            "name": "Rouge-2",
            "description": "基于两个连续词(bigram)的匹配程度，衡量模型生成文本在短语级别的连贯性与准确性，反映语言的自然度。",
            "metric_code": "rouge-2",
            "metric_type": MetricType.BASIC_METRIC,
            "score_scope": None,
            "metrics_param": None,
            "is_builtin": True,
        },
        {
            "name": "Rouge-L",
            "description": "通过计算模型输出与参考答案之间的最长公共子序列(LCS)，评估语序与结构的相似性，适用于衡量整体语义结构一致性。",
            "metric_code": "rouge-l",
            "metric_type": MetricType.BASIC_METRIC,
            "score_scope": None,
            "metrics_param": None,
            "is_builtin": True,
        },
        {
            "name": "BLEU-4",
            "description": "综合评估模型生成文本与参考文本在1至4元语法(n-gram)层面上的匹配程度，反映语言流畅性与表达准确性，常用于机器翻译与文本生成任务。",
            "metric_code": "bleu-4",
            "metric_type": MetricType.BASIC_METRIC,
            "score_scope": None,
            "metrics_param": None,
            "is_builtin": True,
        },
        {
            "name": "格式遵从性",
            "description": "检测模型输出是否严格遵循JSON格式规范，确保结果具备程序可读性与系统集成友好性。",
            "metric_code": "format_compliance",
            "metric_type": MetricType.BASIC_METRIC,
            "score_scope": None,
            "metrics_param": None,
            "is_builtin": True,
        },
    ]


def get_system_referee_metrics_data() -> List[Dict[str, Any]]:
    """获取系统默认裁判员评估指标种子数据
    
    这些指标用于 RAG（检索增强生成）场景的标准化评估，
    project_id=0 表示系统级别指标，对所有项目可见。
    """
    return [
        # 1. 答案相关性 (Answer Relevancy)
        {
            "name": "答案相关性",
            "description": "评估实际输出相对于输入问题的相关程度，用于检测回答是否跑题",
            "metric_code": "answer_relevancy",
            "metric_type": MetricType.REFEREE_SYSTEM_METRIC,
            "project_id": 0,
            "is_builtin": True,
            "metrics_param": ["input_content", "actual_output"],
            "score_scope": [
                {"score_min": 0, "score_max": 2, "score_definitions": "回答与输入问题几乎无关或明显跑题"},
                {"score_min": 3, "score_max": 5, "score_definitions": "回答与问题部分相关，但遗漏核心意图或偏离重点"},
                {"score_min": 6, "score_max": 8, "score_definitions": "回答整体围绕问题，覆盖主要意图，但存在冗余或轻微偏差"},
                {"score_min": 9, "score_max": 10, "score_definitions": "回答紧扣输入问题，完整且精准覆盖核心意图"}
            ],
            "sort_order": 1,
        },
        # 2. 忠实度 (Faithfulness)
        {
            "name": "忠实度",
            "description": "评估实际输出是否与检索上下文在事实上一致，用于检测是否存在幻觉",
            "metric_code": "faithfulness",
            "metric_type": MetricType.REFEREE_SYSTEM_METRIC,
            "project_id": 0,
            "is_builtin": True,
            "metrics_param": ["actual_output", "retrieval_context"],
            "score_scope": [
                {"score_min": 0, "score_max": 2, "score_definitions": "回答大量内容无法从上下文中验证，存在明显幻觉"},
                {"score_min": 3, "score_max": 5, "score_definitions": "回答主要基于上下文，但包含关键未支持推断或事实偏差"},
                {"score_min": 6, "score_max": 8, "score_definitions": "回答大部分内容可由上下文支持，少量表述不够严谨"},
                {"score_min": 9, "score_max": 10, "score_definitions": "回答内容几乎完全或完全基于上下文，无明显事实错误"}
            ],
            "sort_order": 2,
        },
        # 3. 上下文精确度 (Contextual Precision)
        {
            "name": "上下文精确度",
            "description": "评估检索结果的排序质量，衡量相关上下文是否排在不相关内容之前",
            "metric_code": "contextual_precision",
            "metric_type": MetricType.REFEREE_SYSTEM_METRIC,
            "project_id": 0,
            "is_builtin": True,
            "metrics_param": ["input_content", "retrieval_context"],
            "score_scope": [
                {"score_min": 0, "score_max": 2, "score_definitions": "上下文中大部分内容与问题无关，噪声占比高"},
                {"score_min": 3, "score_max": 5, "score_definitions": "上下文包含相关信息，但无关内容较多或排序不合理"},
                {"score_min": 6, "score_max": 8, "score_definitions": "相关信息占比较高，且主要信息大多排在前列"},
                {"score_min": 9, "score_max": 10, "score_definitions": "高度相关信息优先排序，几乎无无关内容"}
            ],
            "sort_order": 3,
        },
        # 4. 上下文召回率 (Contextual Recall)
        {
            "name": "上下文召回率",
            "description": "评估检索上下文是否覆盖了预期答案所需的所有关键信息",
            "metric_code": "contextual_recall",
            "metric_type": MetricType.REFEREE_SYSTEM_METRIC,
            "project_id": 0,
            "is_builtin": True,
            "metrics_param": ["expected_output", "retrieval_context"],
            "score_scope": [
                {"score_min": 0, "score_max": 2, "score_definitions": "上下文严重缺失回答所需的关键信息"},
                {"score_min": 3, "score_max": 5, "score_definitions": "上下文覆盖部分核心信息，但明显不完整"},
                {"score_min": 6, "score_max": 8, "score_definitions": "上下文覆盖大多数关键信息，仅缺少少量细节"},
                {"score_min": 9, "score_max": 10, "score_definitions": "上下文充分或完全覆盖回答所需的全部关键信息"}
            ],
            "sort_order": 4,
        },
        # 5. 上下文相关性 (Contextual Relevancy)
        {
            "name": "上下文相关性",
            "description": "评估检索到的上下文内容与输入问题的整体相关程度，检测是否检索了过多无关信息",
            "metric_code": "contextual_relevancy",
            "metric_type": MetricType.REFEREE_SYSTEM_METRIC,
            "project_id": 0,
            "is_builtin": True,
            "metrics_param": ["input_content", "retrieval_context"],
            "score_scope": [
                {"score_min": 0, "score_max": 2, "score_definitions": "上下文整体与输入问题相关性极低"},
                {"score_min": 3, "score_max": 5, "score_definitions": "上下文与问题部分相关，但内容分散或偏泛"},
                {"score_min": 6, "score_max": 8, "score_definitions": "上下文整体围绕问题，存在少量无关内容"},
                {"score_min": 9, "score_max": 10, "score_definitions": "上下文高度聚焦输入问题，内容集中且信息密度高"}
            ],
            "sort_order": 5,
        },
    ]
