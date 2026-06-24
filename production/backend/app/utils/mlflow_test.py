import mlflow
from pathlib import Path

# Create an experiment name, which must be unique and case sensitive
# experiment_id = mlflow.create_experiment(
#     "Social NLP Experiments",
#     artifact_location=Path.cwd().joinpath("mlruns").as_uri(),
#     tags={"version": "v1", "priority": "P1"},
# )
# experiment = mlflow.get_experiment(experiment_id)
# print(f"Name: {experiment.name}")
# print(f"Artifact Location: {experiment.artifact_location}")
# print(f"Tags: {experiment.tags}")
# print(f"Lifecycle_stage: {experiment.lifecycle_stage}")
# print(f"Creation timestamp: {experiment.creation_time}")

# with mlflow.start_run() as run:
#     mlflow.log_param("p", 0)

# run_id = run.info.run_id
# mlflow.delete_run(run_id)

# lifecycle_stage = mlflow.get_run(run_id).info.lifecycle_stage
# print(f"run_id: {run_id}; lifecycle_stage: {lifecycle_stage}")


# 创建实验
mlflow.set_tracking_uri("http://localhost:9005")
# Create an experiment name, which must be unique and case sensitive
experiment_id = mlflow.create_experiment(
    "Social NLP Experiments",
    tags={"version": "v1", "priority": "P1"},
)
# # 获取实验
# experiment = mlflow.get_experiment(experiment_id)
# print(f"Name: {experiment.name}")
# print(f"Experiment_id: {experiment.experiment_id}")
# print(f"Artifact Location: {experiment.artifact_location}")
# print(f"Tags: {experiment.tags}")
# print(f"Lifecycle_stage: {experiment.lifecycle_stage}")
# print(f"Creation timestamp: {experiment.creation_time}")

# # 删除实验
# mlflow.delete_experiment(experiment_id)   #需要测试是否会删除实验得到的模型


# 搜索实验
# Create experiments
# for name, tags in [
#     ("a", None),
#     ("b", None),
#     ("ab", {"k": "v"}),
#     ("bb", {"k": "V"}),
# ]:
#     mlflow.create_experiment(name, tags=tags)

# Search for experiments with name "a"
# experiments = mlflow.search_experiments(filter_string="name = 'a'")
# print("所有实验的名字:")
# all_experiments = mlflow.search_experiments(filter_string="name ILIKE '%d%'")
# for experiment in all_experiments:
#     print(f"- {experiment.name}")

# print("\n" + "="*50 + "\n")


# 创建任务
# mlflow集成
# 客户端登录mlflow
# swanlab login --relogin --host http://63.221.195.17:9139
# 使用环境变量指定实验名
        # Environment:
        # - **HF_MLFLOW_LOG_ARTIFACTS** (`str`, *optional*):
        #     Whether to use MLflow `.log_artifact()` facility to log artifacts. This only makes sense if logging to a
        #     remote server, e.g. s3 or GCS. If set to `True` or *1*, will copy each saved checkpoint on each save in
        #     [`TrainingArguments`]'s `output_dir` to the local or remote artifact storage. Using it without a remote
        #     storage will just copy the files to your artifact location.
        # - **MLFLOW_TRACKING_URI** (`str`, *optional*):
        #     Whether to store runs at a specific path or remote server. Unset by default, which skips setting the
        #     tracking URI entirely.
        # - **MLFLOW_EXPERIMENT_NAME** (`str`, *optional*, defaults to `None`):
        #     Whether to use an MLflow experiment_name under which to launch the run. Default to `None` which will point
        #     to the `Default` experiment in MLflow. Otherwise, it is a case sensitive name of the experiment to be
        #     activated. If an experiment with this name does not exist, a new experiment with this name is created.
        # - **MLFLOW_TAGS** (`str`, *optional*):
        #     A string dump of a dictionary of key/value pair to be added to the MLflow run as tags. Example:
        #     `os.environ['MLFLOW_TAGS']='{"release.candidate": "RC1", "release.version": "2.2.0"}'`.
        # - **MLFLOW_NESTED_RUN** (`str`, *optional*):
        #     Whether to use MLflow nested runs. If set to `True` or *1*, will create a nested run inside the current
        #     run.
        # - **MLFLOW_RUN_ID** (`str`, *optional*):
        #     Allow to reattach to an existing run which can be usefull when resuming training from a checkpoint. When
        #     `MLFLOW_RUN_ID` environment variable is set, `start_run` attempts to resume a run with the specified run ID
        #     and other parameters are ignored.
        # - **MLFLOW_FLATTEN_PARAMS** (`str`, *optional*, defaults to `False`):
        #     Whether to flatten the parameters dictionary before logging.
        # - **MLFLOW_MAX_LOG_PARAMS** (`int`, *optional*):
        #     Set the maximum number of parameters to log in the run.
        # """
        # self._log_artifacts = os.getenv("HF_MLFLOW_LOG_ARTIFACTS", "FALSE").upper() in ENV_VARS_TRUE_VALUES
        # self._nested_run = os.getenv("MLFLOW_NESTED_RUN", "FALSE").upper() in ENV_VARS_TRUE_VALUES
        # self._tracking_uri = os.getenv("MLFLOW_TRACKING_URI", None)
        # self._experiment_name = os.getenv("MLFLOW_EXPERIMENT_NAME", None)
        # self._flatten_params = os.getenv("MLFLOW_FLATTEN_PARAMS", "FALSE").upper() in ENV_VARS_TRUE_VALUES
        # self._run_id = os.getenv("MLFLOW_RUN_ID", None)
        # self._max_log_params = os.getenv("MLFLOW_MAX_LOG_PARAMS", None)

# 使用配置文件指定运行名
#  llama-factory配置文件设置run_name
        # run_name (`str`, *optional*, defaults to `output_dir`):
        #     A descriptor for the run. Typically used for [wandb](https://www.wandb.com/),
        #     [mlflow](https://www.mlflow.org/) and [comet](https://www.comet.com/site) logging. If not specified, will
        #     be the same as `output_dir`.


# 搜索任务
# Create an experiment and log two runs under it
experiment_name = "Social NLP Experiments1"
experiment = mlflow.get_experiment_by_name(experiment_name)
experiment_id = experiment.experiment_id
# mlflow.delete_experiment(experiment.experiment_id)   # 目前实现的删除是软删除
# experiment = mlflow.get_experiment(experiment.experiment_id)
# print(f"Name: {experiment.name}")
# print(f"Artifact Location: {experiment.artifact_location}")
# print(f"Lifecycle_stage: {experiment.lifecycle_stage}")
# print(f"Last Updated timestamp: {experiment.last_update_time}")

# experiment_id = mlflow.create_experiment(experiment_name)
# with mlflow.start_run(experiment_id=experiment_id, run_name="run_1"):
#     mlflow.log_metric("m", 1.55)
#     mlflow.set_tag("s.release", "1.1.0-RC")
# with mlflow.start_run(experiment_id=experiment_id, run_name="run_2"):
#     mlflow.log_metric("m", 2.50)
#     mlflow.set_tag("s.release", "1.2.0-GA")
# Search for all the runs in the experiment with the given experiment ID
df = mlflow.search_runs([experiment_id], order_by=["metrics.m DESC"])
print(df.columns.to_list())
print(df[["metrics.m", "tags.s.release", "run_id", "tags.mlflow.runName"]])
print("--")
# Search the experiment_id using a filter_string with tag
# that has a case insensitive pattern
filter_string = "tags.s.release ILIKE '%rc%'"
df = mlflow.search_runs([experiment_id], filter_string=filter_string)
print(df[["metrics.m", "tags.s.release", "run_id"]])
print("--")
# Search for all the runs in the experiment with the given experiment name
df = mlflow.search_runs(experiment_names=[experiment_name], order_by=["metrics.m DESC"])
print(df[["metrics.m", "tags.s.release", "run_id"]])
