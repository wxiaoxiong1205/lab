from pathlib import Path
from typing import Any, Dict, List


YAML_DIR = Path(__file__).resolve().parent / "yamls"


def _read_yaml(name: str) -> str:
    return (YAML_DIR / name).read_text(encoding="utf-8")


def get_advanced_template_seed_data() -> List[Dict[str, Any]]:
    return [
        {
            "name": "GRPO 默认低资源lora模版",
            "description": "GRPO 训练默认高级参数模板，用于渲染 additional_params 表单。",
            "domain": "llm_training",
            "template_type": "grpo",
            "status": "enabled",
            "visibility": "system",
            "yaml_content": _read_yaml("grpo_default.yaml"),
        }
    ]
