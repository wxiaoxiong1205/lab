"""
模型模块

包含模型相关的种子数据和初始化逻辑
"""

from .seeder import ModelSeeder
from .data import get_models_data

__all__ = ['ModelSeeder', 'get_models_data']
