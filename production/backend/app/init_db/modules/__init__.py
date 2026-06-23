"""
种子数据模块包
"""
from .image_tags import ImageTagsSeeder
from .images import ImageSeeder
from .models import ModelSeeder
from .data_cleaning import DataCleaningSeeder
from .evaluation_metrics import EvaluationMetricsSeeder
from .common_config import CommonConfigSeeder
from .permission import PermissionSeeder
from .benchmark_datasets import BenchmarkDatasetsSeeder
from .example_notebook.seeder import ExampleNotebookSeeder

# 所有可用的种子管理器（按执行顺序排列）
SEEDERS = [
    ImageSeeder,
    EvaluationMetricsSeeder,
    CommonConfigSeeder,
    DataCleaningSeeder,
    PermissionSeeder,  # 权限配置初始化
    BenchmarkDatasetsSeeder,
    ExampleNotebookSeeder,
    ImageTagsSeeder,
]

__all__ = ['SEEDERS', 'DataCleaningSeeder', 'ImageSeeder', 'EvaluationMetricsSeeder', 'CommonConfigSeeder',
           'PermissionSeeder', 'BenchmarkDatasetsSeeder', 'ExampleNotebookSeeder', 'ImageTagsSeeder']
