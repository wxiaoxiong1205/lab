"""
基准评估数据集模块
"""
from .seeder import BenchmarkDatasetsSeeder
from .data import get_benchmark_datasets_data

__all__ = ['BenchmarkDatasetsSeeder', 'get_benchmark_datasets_data']
