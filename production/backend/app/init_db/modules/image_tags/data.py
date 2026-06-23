"""
镜像种子数据
"""

from typing import List, Dict, Any

from app.schemas.repository_image import ImageSource


def get_image_tags_data() -> List[Dict[str, Any]]:
    """获取镜像标签种子数据"""
    return [
        {
            "name": "框架",
            "business_type": "IMAGE",
            "element": [
                {
                    "name": "Pytorch 2.x",
                    "code": "Pytorch2.x",
                    "images": [
                        {
                            "image": "jupyter/deepexi-notebook:pytorch_2.5-cuda_12.1-py312-ubuntu24.04-ai",
                            "image_source": ImageSource.BUILT_IN
                        }
                    ]
                },
                {
                    "name": "torch 2.x",
                    "code": "torch2.x",
                    "images": [
                        {
                            "image": "jupyter/deepexi-notebook:torch_2.5-cann_8.0.rc1-py311-ubuntu22.04-ai",
                            "image_source": ImageSource.BUILT_IN
                        },
                    ]
                }
            ]
        },
        {
            "name": "python版本",
            "business_type": "IMAGE",
            "element": [
                {
                    "name": "python3.11",
                    "code": "python311",
                    "images": [
                        {
                            "image": "jupyter/deepexi-notebook:torch_2.5-cann_8.0.rc1-py311-ubuntu22.04-ai",
                            "image_source": ImageSource.BUILT_IN
                        }
                    ]
                },
                {
                    "name": "python3.12",
                    "code": "python312",
                    "images": [
                        {
                            "image": "jupyter/deepexi-notebook:datascience-cpu-python312-ubuntu24.04-ai",
                            "image_source": ImageSource.BUILT_IN
                        },
                        {
                            "image": "jupyter/deepexi-notebook:pytorch_2.5-cuda_12.1-py312-ubuntu24.04-ai",
                            "image_source": ImageSource.BUILT_IN
                        }
                    ]
                }
            ]
        }
    ]
