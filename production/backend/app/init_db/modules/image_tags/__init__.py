"""
镜像标签模块

包含镜像标签相关的种子数据和初始化逻辑
"""

from .seeder import ImageTagsSeeder
from .data import get_image_tags_data

__all__ = ['ImageTagsSeeder', 'get_image_tags_data']