from app.models.benchmark_task_manager import (
    BenchmarkTask,
    BenchmarkTaskModelRelation,
    BenchmarkTaskDatasetRelation,
    BenchmarkDataset,
    BenchmarkResult,
    BenchmarkLeaderboard
)
from app.repository.base_mapper import BaseMapper


class BenchmarkTaskMapper(BaseMapper[BenchmarkTask]):
    pass


class BenchmarkTaskModelRelationMapper(BaseMapper[BenchmarkTaskModelRelation]):
    pass


class BenchmarkTaskDatasetRelationMapper(BaseMapper[BenchmarkTaskDatasetRelation]):
    pass


class BenchmarkDatasetMapper(BaseMapper[BenchmarkDataset]):
    pass


class BenchmarkResultMapper(BaseMapper[BenchmarkResult]):
    pass


class BenchmarkLeaderboardMapper(BaseMapper[BenchmarkLeaderboard]):
    pass
