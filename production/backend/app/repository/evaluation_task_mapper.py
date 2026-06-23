from app.models.evaluation_task_manager import (
    EvaluationTask,
    EvaluationTaskDatasetModelRelation,
    EvaluationReport
)
from app.models.basic_metric_manager import EvaluationMetrics
from app.models.evaluation_metric_metadata_relation import EvaluationMetricMetadataRelation
from app.repository.base_mapper import BaseMapper


class EvaluationTaskMapper(BaseMapper[EvaluationTask]):
    pass


class EvaluationTaskDatasetModelRelationMapper(BaseMapper[EvaluationTaskDatasetModelRelation]):
    pass


class EvaluationReportMapper(BaseMapper[EvaluationReport]):
    pass


class EvaluationMetricsMapper(BaseMapper[EvaluationMetrics]):
    pass


class EvaluationMetricMetadataRelationMapper(BaseMapper[EvaluationMetricMetadataRelation]):
    pass

