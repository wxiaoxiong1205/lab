from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field, ConfigDict, model_validator
from datetime import datetime
from app.schemas.common import BaseModelWithTimezone
from app.utils.timezone_utils import to_local_tz

# Individual test case schemas
class MetricData(BaseModel):
    name: str
    threshold: float
    success: bool
    score: float
    reason: Optional[str] = None
    strict_mode: Optional[bool] = Field(None, alias="strictMode")
    evaluation_model: Optional[str] = Field(None, alias="evaluationModel")
    error: Optional[str] = None
    evaluation_cost: Optional[float] = Field(None, alias="evaluationCost")
    verbose_logs: Optional[str] = Field(None, alias="verboseLogs")
    
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True
    )

    def model_dump(self):
        """将模型转换为字典，以便进行JSON序列化"""
        return {
            "name": self.name,
            "threshold": self.threshold,
            "success": self.success,
            "score": self.score,
            "reason": self.reason,
            "strict_mode": self.strict_mode,
            "evaluation_model": self.evaluation_model,
            "error": self.error,
            "evaluation_cost": self.evaluation_cost,
            "verbose_logs": self.verbose_logs
        }

class TestCaseBase(BaseModel):
    name: str
    input: str
    actual_output: str = Field(alias="actualOutput")
    success: bool
    metrics_data: List[MetricData] = Field(default_factory=list, alias="metricsData")
    run_duration: float = Field(0.0, alias="runDuration")
    order: int = 0
    is_conversational: bool = Field(False, alias="conversational")
    is_multimodal: bool = Field(False, alias="multimodal")
    context: Optional[List[str]] = Field(default_factory=list)
    retrieval_context: Optional[List[str]] = Field(default_factory=list, alias="retrievalContext")
    expected_output: Optional[str] = Field(None, alias="expectedOutput")
    tools_called: Optional[List[Dict[str, Any]]] = Field(default_factory=list, alias="toolsCalled")
    expected_tools: Optional[List[Dict[str, Any]]] = Field(default_factory=list, alias="expectedTools")
    
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True
    )

class TestCaseCreate(TestCaseBase):
    pass

class TestCase(TestCaseBase):
    id: int
    test_run_id: int
    
    model_config = ConfigDict(from_attributes=True)

# Test run schemas
class TestRunBase(BaseModel):
    evaluate_id: Optional[int] = None # 答案生成任务id
    run_id: Optional[str] = None
    name: Optional[str] = None  # 评估任务名称
    model: Optional[str] = None
    dataset: Optional[str] = None # 数据集名称
    metrics: Optional[List[Dict[str, Any]]] = Field(default_factory=list)  # 评估指标配置
    evaluate_model: Optional[Dict[str, Any]] = Field(default_factory=dict)  # 评估模型配置
    hyperparameters: Optional[Dict[str, Any]] = Field(default_factory=dict)  # 超参数
    status: Optional[str] = None  
    remark: Optional[str] = None  # 备注
    total_test_cases: int = 0
    successful_test_cases: int = 0
    testPassed: int = 0  # 通过的测试用例数量
    testFailed: int = 0  # 失败的测试用例数量
    run_duration: float = 0.0
    metrics_scores: List[Dict[str, Any]] = Field(default_factory=list)
    avg_metric_scores: List[Dict[str, Any]] = Field(default_factory=list)  # 指标平均分数
    started_at: Optional[datetime] = None  # 开始时间
    
    model_config = ConfigDict(from_attributes=True)

class TestRunCreate(BaseModel):
    evaluate_id: int # 答案生成任务id
    name: Optional[str] = None  # 评估任务名称
    metrics: Optional[List[Dict[str, Any]]] = Field(default_factory=list)  # 评估指标配置
    evaluate_model: Optional[Dict[str, Any]] = Field(default_factory=dict)  # 评估模型配置
    remark: Optional[str] = None  # 备注
    model_config = ConfigDict(
        populate_by_name=True
    )

class TestRunList(TestRunBase, BaseModelWithTimezone):
    id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
    
    @model_validator(mode='after')
    def convert_datetime_fields(self) -> 'TestRunList':
        """将所有datetime字段转换为本地时区"""
        if isinstance(self.created_at, datetime):
            self.created_at = to_local_tz(self.created_at)
        if isinstance(self.started_at, datetime):
            self.started_at = to_local_tz(self.started_at)
        return self

class TestRunDetail(TestRunList):
    test_cases: List[TestCase] = Field(default_factory=list)
    
    model_config = ConfigDict(from_attributes=True)
