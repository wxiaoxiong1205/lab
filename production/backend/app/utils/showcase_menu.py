"""Backend-owned fallback menu for explicitly enabled showcase preview."""

from __future__ import annotations

from app.schemas.menu import MenuItem


def build_showcase_menu() -> list[MenuItem]:
    next_id = 1442200000000000

    def item(code: str, name: str, sort: int, path: str = "", icon: str = "", children: list[MenuItem] | None = None, item_type: int = 0) -> MenuItem:
        nonlocal next_id
        current_id = next_id
        next_id += 1
        return MenuItem(
            id=current_id,
            code=code,
            name=name,
            type=item_type,
            sort=sort,
            parentId=0,
            idPath=f"/{current_id}/",
            children=children or [],
            description="showcase preview menu",
            elementResourceId=current_id,
            elementStatus=0,
            highLightIconUrl=None,
            iconUrl=icon,
            pathUrl=path,
            remark=None,
            secretLevel=9999,
        )

    return [
        item("home", "首页", 10, "/home", "home"),
        item(
            "large_model",
            "大模型",
            20,
            icon="RobotOutlined",
            children=[
                item("task_overview", "任务概览", 10, "/task-overview", "DatabaseOutlined"),
                item("training_management", "训练数据管理", 20, "/datasets"),
                item("test_management", "测试数据管理", 30, "/measurement"),
                item("Inference_result", "推理结果集", 40, "/Inference"),
                item("file_management", "文件管理", 50, "/file-management"),
                item("data_annotation", "数据标注", 60, "/data-annotation"),
                item("data_cleaning", "数据清洗", 70, "/data-cleaning"),
                item("data_augmentation", "数据增强", 80, "/data-augmentation"),
                item("data_insight", "数据洞察", 90, "/data-insight"),
                item("online_notebook", "在线Notebook", 100, "/finetune/notebooks", "CloudServerOutlined"),
                item("large_model_training", "大模型训练", 110, "/training", "ThunderboltOutlined"),
                item("model_management", "我的模型", 120, "/model", "AppstoreOutlined"),
                item("effect_evaluation", "效果评估", 130, "/effect-evaluation", "RadarChartOutlined"),
                item("evaluation_indicator", "评估指标", 140, "/evaluation-indicator", "BoxPlotOutlined"),
                item("service_inference_hosted", "大模型部署", 150, "/service/inference/hosted", "DeploymentUnitOutlined"),
                item("service_inference_external", "在线推理服务", 160, "/service/inference/external"),
            ],
        ),
        item(
            "machine_learn",
            "机器学习",
            30,
            icon="RobotOutlined",
            children=[
                item("machine_task_overview", "任务概览", 10, "/machine-task-overview", "DatabaseOutlined"),
                item("machine_data_management", "数据管理", 20, "/machine-data-management", "DatabaseOutlined"),
                item("MACHINE_ANNOTATION", "数据标注", 30, "/machine-annotation", "DeploymentUnitOutlined"),
                item("MACHINE_MODEL_MANAGER", "我的模型", 40, "/michine-model-manager", "AppstoreOutlined"),
                item("MACHINE_MODEL_DEPLOYMENT", "模型部署", 50, "/machine-model-deployment", "DeploymentUnitOutlined"),
                item("MACHINE_NOTEBOOK", "在线Notebook", 60, "/machine-notebook", "CloudServerOutlined"),
                item("ONLINE_ANNOTATION_SERVICE", "在线标注服务", 70, "/machine-online-annotation-service", "DeploymentUnitOutlined"),
            ],
        ),
        item(
            "admin",
            "系统管理",
            40,
            icon="AppstoreOutlined",
            children=[
                item("admin_project", "项目管理", 10, "/admin/projects", "ProjectOutlined"),
                item("kubernetes", "集群管理", 20, "/admin/kubernetes", "CloudServerOutlined"),
                item("storage_config", "存储配置", 30, "/admin/storage", "HddOutlined"),
                item("mirror_list", "镜像列表", 40, "/admin/registry/list"),
                item("mirror_repository", "镜像仓库", 50, "/admin/registry"),
                item("basic_model", "模型仓库", 60, "/admin/base-model", "AppstoreOutlined"),
                item("admin_settings", "系统配置", 70, "/admin/settings", "SettingOutlined"),
            ],
        ),
    ]
