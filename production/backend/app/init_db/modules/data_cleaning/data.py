"""
数据清洗种子数据
"""

from typing import List, Dict, Any


def get_data_cleaning_data() -> List[Dict[str, Any]]:
    """
    获取数据清洗默认模板种子数据
    
    Returns:
        List[Dict[str, Any]]: 模板数据列表
    """
    return [
        {
            "project_id": 0,  # 0 表示全局内置模板
            "is_builtin": True,
            "steps_json": [
                {
                    "operator_type": "whitespace_cleaner",
                    "operator_name": "空白字符清洗",
                    "params": {},
                    "order": 1
                },
                {
                    "operator_type": "text_quality_filter",
                    "operator_name": "乱码清洗",
                    "params": {
                        "max_abnormal_char_ratio": 0.25,
                        "min_meaningful_char_ratio": 0.7,
                        "max_rare_char_ratio": 0.3,
                        "max_compression_ratio": 0.4,
                        "min_base64_char_ratio": 0.2,
                        "max_consecutive_noise_len": 8,
                        "max_consecutive_rare_len": 5
                    },
                    "order": 2
                },
                {
                    "operator_type": "html_cleaner",
                    "operator_name": "HTML标签清洗",
                    "params": {},
                    "order": 3
                },
                {
                    "operator_type": "token_num_filter",
                    "operator_name": "长度异常文本过滤器",
                    "params": {
                        "min_num": 10,
                        "max_num": 512
                    },
                    "order": 4
                },
                {
                    "operator_type": "document_minhash_deduplicator",
                    "operator_name": "MinHash去重器",
                    "params": {
                        "tokenization": "character",
                        "window_size": 5,
                        "lowercase": True,
                        "num_permutations": 128,
                        "jaccard_threshold": 0.85
                    },
                    "order": 5
                },
                {
                    "operator_type": "document_simhash_deduplicator",
                    "operator_name": "SimHash去重器",
                    "params": {
                        "tokenization": "character",
                        "window_size": 6,
                        "num_blocks": 6,
                        "hamming_distance": 4,
                        "lowercase": True
                    },
                    "order": 6
                },
                {
                    "operator_type": "sensitive_conn_process",
                    "operator_name": "联系方式脱敏",
                    "params": {},
                    "order": 7
                },
                {
                    "operator_type": "id_passport_filter",
                    "operator_name": "身份与证件脱敏",
                    "params": {},
                    "order": 8
                }
            ]
        }
    ]

