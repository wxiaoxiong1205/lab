"""
基准评估数据集种子数据
"""

from typing import List, Dict, Any

from app.schemas.common import ModelTypeBase


def get_benchmark_datasets_data() -> List[Dict[str, Any]]:
    """获取基准评估数据集种子数据
    
    这些数据集是系统内置的，使用 tenant_id='0' 表示全局可见。
    model_types 使用 ModelTypeBase 枚举值，表示该数据集适用的模型类型分类。
    invoke_name：调用时使用的 OpenCompass 模块名（如 gsm8k_gen、mmlu_ppl），不填则默认 code+_gen。
    """
    text_gen = ModelTypeBase.TEXT_GENERATION.value
    # minio_path: 数据集在 MinIO bucket 中的 ZIP 文件路径，为空则跳过文件同步
    # 同步流程：下载 ZIP → 解压 → 写入 JFS /public/benchmark/datasets/data/{code}/
    _base = "/benchmark/opencompass_datasets"
    return [
        # 知识问答
        {
            "name": "MMLU",
            "code": "mmlu",
            "invoke_name": "mmlu_gen",
            "minio_path": f"{_base}/mmlu.zip",
            "language": "英文",
            "original_sample_count": 14079,
            "description": "MMLU 主要用于评估模型在广泛领域的知识掌握情况,它包含了STEM、人文学科、社会科学等57个学科超过100,000道测试题。",
            "category": "knowledge",
            "model_types": [text_gen],
            "is_builtin": True,
            "sort_order": 1,
        },
        {
            "name": "MMLU-Pro",
            "code": "mmlu_pro",
            "invoke_name": "mmlu_pro_gen",
            "minio_path": f"{_base}/mmlu_pro.zip",
            "language": "英文",
            "original_sample_count": 12032,
            "description": "MMLU-Pro 进阶多任务语言理解",
            "category": "knowledge",
            "model_types": [text_gen],
            "is_builtin": True,
            "sort_order": 2,
        },
        {
            "name": "CMMLU",
            "code": "cmmlu",
            "invoke_name": "cmmlu_gen",
            "minio_path": f"{_base}/cmmlu.zip",
            "language": "中文",
            "original_sample_count": 11582,
            "description": "中文多任务语言理解",
            "category": "knowledge",
            "model_types": [text_gen],
            "is_builtin": True,
            "sort_order": 3,
        },
        {
            "name": "C-Eval",
            "code": "ceval",
            "invoke_name": "ceval_gen",
            "minio_path": f"{_base}/ceval.zip",
            "language": "中文",
            "original_sample_count": 1346,
            "description": "C-Eval 主要用于评估模型对中文文本的理解和应用能力,它包含了数学、物理、化学、历史、地理、文学等52个不同的学科测试题。",
            "category": "knowledge",
            "model_types": [text_gen],
            "is_builtin": True,
            "sort_order": 4,
        },
        {
            "name": "AGIEval",
            "code": "agieval",
            "invoke_name": "agieval_gen",
            "minio_path": f"{_base}/AGIEval.zip",
            "language": "英文",
            "original_sample_count": 4723,
            "description": "AGIEval 知识评估",
            "category": "knowledge",
            "model_types": [text_gen],
            "is_builtin": True,
            "sort_order": 5,
        },
        {
            "name": "GPQA",
            "code": "gpqa",
            "invoke_name": "gpqa_gen",
            "minio_path": f"{_base}/gpqa.zip",
            "language": "英文",
            "original_sample_count": 198,
            "description": "GPQA 研究生级别问答",
            "category": "knowledge",
            "model_types": [text_gen],
            "is_builtin": True,
            "sort_order": 6,
        },
        # 指令遵循
        {
            "name": "IFEval",
            "code": "IFEval",
            "invoke_name": "IFEval_gen_353ae7",
            "export_var": "ifeval_datasets",
            "minio_path": f"{_base}/ifeval.zip",
            "language": "英文",
            "original_sample_count": 541,
            "description": "指令遵循能力评估",
            "category": "instruction_following",
            "model_types": [text_gen],
            "is_builtin": True,
            "sort_order": 7,
        },
        # 代码
        {
            "name": "HumanEval",
            "code": "humaneval",
            "invoke_name": "humaneval_gen",
            "minio_path": f"{_base}/humaneval.zip",
            "language": "代码",
            "original_sample_count": 164,
            "description": "Python代码生成",
            "category": "code",
            "model_types": [text_gen],
            "is_builtin": True,
            "sort_order": 8,
        },
        # 数据集压缩包大小为 3G 解压出来将会更大，目前的数据初始化方案会很慢，所以暂时不支持，如果客户有要求再放开
        # {
        #     "name": "LiveCodeBench",
        #     "code": "livecodebench",
        #     "invoke_name": "livecodebench_gen",
        #     "export_var": "LCB_datasets",
        #     "minio_path": f"{_base}/code_generation_lite.zip",
        #     "language": "代码",
        #     "original_sample_count": 1321,
        #     "description": "LiveCodeBench 是一个用于评估模型在代码生成和调试方面的能力的基准数据集。它包含了1000个编程问题，每个问题都有多个测试用例。",
        #     "category": "code",
        #     "model_types": [text_gen],
        #     "is_builtin": True,
        #     "sort_order": 9,
        # },
        {
            "name": "MBPP",
            "code": "mbpp",
            "invoke_name": "mbpp_gen",
            "minio_path": f"{_base}/mbpp.zip",
            "language": "代码",
            "original_sample_count": 500,
            "description": "Python基础编程问题",
            "category": "code",
            "model_types": [text_gen],
            "is_builtin": True,
            "sort_order": 10,
        },
        # 逻辑推理
        {
            "name": "MATH",
            "code": "math",
            "invoke_name": "math_gen",
            "minio_path": f"{_base}/math.zip",
            "language": "英文",
            "original_sample_count": 5000,
            "description": "高难度数学问题",
            "category": "reasoning",
            "model_types": [text_gen],
            "is_builtin": True,
            "sort_order": 11,
        },
        {
            "name": "GSM8K",
            "code": "gsm8k",
            "invoke_name": "gsm8k_gen",
            "minio_path": f"{_base}/gsm8k.zip",
            "language": "英文",
            "original_sample_count": 1319,
            "description": "GSM8K 主要用于评估模型解决基础数学问题的能力,它包含了超过8,000个小学数学问题。",
            "category": "reasoning",
            "model_types": [text_gen],
            "is_builtin": True,
            "sort_order": 12,
        },
        # 安全可信
        {
            "name": "SimpleQA",
            "code": "SimpleQA",
            "invoke_name": "simpleqa_gen",
            "export_var": "simpleqa_datasets",
            "minio_path": f"{_base}/simpleqa.zip",
            "language": "英文",
            "original_sample_count": 4326,
            "description": "简单问答知识评估",
            "category": "safety",
            "model_types": [text_gen],
            "is_builtin": True,
            "sort_order": 13,
        },
    ]
