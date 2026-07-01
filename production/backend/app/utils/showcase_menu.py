"""Backend-owned fallback menu for explicitly enabled showcase preview."""

from __future__ import annotations

from typing import TypedDict

from app.schemas.menu import MenuItem


class MenuSeed(TypedDict, total=False):
    code: str
    name: str
    sort: int
    path: str
    icon: str
    children: list["MenuSeed"]
    item_type: int


def build_showcase_menu() -> list[MenuItem]:
    next_id = 1442200000000000

    def item(seed: MenuSeed, parent_id: int = 0, id_path: str = "/") -> MenuItem:
        nonlocal next_id
        current_id = next_id
        next_id += 1
        current_path = f"{id_path}{current_id}/"

        return MenuItem(
            id=current_id,
            code=seed["code"],
            name=seed["name"],
            type=seed.get("item_type", 0),
            sort=seed["sort"],
            parentId=parent_id,
            idPath=current_path,
            children=[item(child, current_id, current_path) for child in seed.get("children", [])],
            description="showcase preview menu",
            elementResourceId=current_id,
            elementStatus=0,
            highLightIconUrl=None,
            iconUrl=seed.get("icon", ""),
            pathUrl=seed.get("path", ""),
            remark=None,
            secretLevel=9999,
        )

    menu_seeds: list[MenuSeed] = [
        {"code": "home", "name": "首页", "sort": 10, "path": "/home", "icon": "home"},
        {
            "code": "large_model",
            "name": "大模型",
            "sort": 20,
            "icon": "RobotOutlined",
            "children": [
                {"code": "task_overview", "name": "任务概览", "sort": 10, "path": "/task-overview", "icon": "DatabaseOutlined"},
                {
                    "code": "data_services",
                    "name": "数据服务",
                    "sort": 20,
                    "icon": "DatabaseOutlined",
                    "children": [
                        {
                            "code": "data_management",
                            "name": "数据管理",
                            "sort": 10,
                            "icon": "DatabaseOutlined",
                            "children": [
                                {"code": "training_management", "name": "训练数据管理", "sort": 10, "path": "/datasets"},
                                {"code": "test_management", "name": "测试数据管理", "sort": 20, "path": "/measurement"},
                                {"code": "Inference_result", "name": "推理结果集", "sort": 30, "path": "/Inference"},
                                {"code": "file_management", "name": "文件管理", "sort": 40, "path": "/file-management"},
                            ],
                        },
                        {
                            "code": "data_processing",
                            "name": "数据处理",
                            "sort": 20,
                            "icon": "BarcodeOutlined",
                            "children": [
                                {"code": "data_annotation", "name": "数据标注", "sort": 10, "path": "/data-annotation"},
                                {"code": "data_cleaning", "name": "数据清洗", "sort": 20, "path": "/data-cleaning"},
                                {"code": "data_augmentation", "name": "数据增强", "sort": 30, "path": "/data-augmentation"},
                                {"code": "data_insight", "name": "数据洞察", "sort": 40, "path": "/data-insight"},
                            ],
                        },
                    ],
                },
                {
                    "code": "model_training",
                    "name": "模型训练",
                    "sort": 30,
                    "icon": "CloudServerOutlined",
                    "children": [
                        {
                            "code": "online_notebook",
                            "name": "在线Notebook",
                            "sort": 10,
                            "path": "/finetune/notebooks",
                            "icon": "CloudServerOutlined",
                            "children": [
                                {
                                    "code": "custom_image",
                                    "name": "自定义镜像",
                                    "sort": 10,
                                    "path": "/finetune/notebooks/custom-image",
                                    "item_type": 1,
                                },
                            ],
                        },
                        {"code": "large_model_training", "name": "大模型训练", "sort": 20, "path": "/training", "icon": "ThunderboltOutlined"},
                        {"code": "model_management", "name": "我的模型", "sort": 30, "path": "/model", "icon": "AppstoreOutlined"},
                    ],
                },
                {
                    "code": "evaluation_management",
                    "name": "模型评估",
                    "sort": 40,
                    "icon": "BoxPlotOutlined",
                    "children": [
                        {"code": "effect_evaluation", "name": "效果评估", "sort": 10, "path": "/effect-evaluation", "icon": "RadarChartOutlined"},
                        {"code": "evaluation_indicator", "name": "评估指标", "sort": 20, "path": "/evaluation-indicator", "icon": "BoxPlotOutlined"},
                    ],
                },
                {
                    "code": "model_service",
                    "name": "模型服务",
                    "sort": 50,
                    "icon": "DeploymentUnitOutlined",
                    "children": [
                        {"code": "service_inference_hosted", "name": "大模型部署", "sort": 10, "path": "/service/inference/hosted", "icon": "DeploymentUnitOutlined"},
                        {"code": "service_inference_external", "name": "在线推理服务", "sort": 20, "path": "/service/inference/external"},
                    ],
                },
            ],
        },
        {
            "code": "machine_learn",
            "name": "机器学习",
            "sort": 30,
            "icon": "RobotOutlined",
            "children": [
                {"code": "machine_task_overview", "name": "任务概览", "sort": 10, "path": "/machine-task-overview", "icon": "DatabaseOutlined"},
                {"code": "machine_data_management", "name": "数据管理", "sort": 20, "path": "/machine-data-management", "icon": "DatabaseOutlined"},
                {"code": "MACHINE_ANNOTATION", "name": "数据标注", "sort": 30, "path": "/machine-annotation", "icon": "DeploymentUnitOutlined"},
                {"code": "MACHINE_MODEL_MANAGER", "name": "我的模型", "sort": 40, "path": "/michine-model-manager", "icon": "AppstoreOutlined"},
                {"code": "MACHINE_MODEL_DEPLOYMENT", "name": "模型部署", "sort": 50, "path": "/machine-model-deployment", "icon": "DeploymentUnitOutlined"},
                {
                    "code": "MACHINE_NOTEBOOK",
                    "name": "在线Notebook",
                    "sort": 60,
                    "path": "/machine-notebook",
                    "icon": "CloudServerOutlined",
                    "children": [
                        {"code": "MIRROR", "name": "自定义镜像", "sort": 10, "path": "/machine-notebook/mirror", "item_type": 1},
                    ],
                },
                {"code": "ONLINE_ANNOTATION_SERVICE", "name": "在线标注服务", "sort": 70, "path": "/machine-online-annotation-service", "icon": "DeploymentUnitOutlined"},
            ],
        },
        {
            "code": "admin",
            "name": "系统管理",
            "sort": 40,
            "icon": "AppstoreOutlined",
            "children": [
                {"code": "admin_project", "name": "项目管理", "sort": 10, "path": "/admin/projects", "icon": "ProjectOutlined"},
                {"code": "kubernetes", "name": "集群管理", "sort": 20, "path": "/admin/kubernetes", "icon": "CloudServerOutlined"},
                {"code": "storage_config", "name": "存储配置", "sort": 30, "path": "/admin/storage", "icon": "HddOutlined"},
                {
                    "code": "mirror_management",
                    "name": "镜像管理",
                    "sort": 40,
                    "icon": "ContainerOutlined",
                    "children": [
                        {"code": "mirror_list", "name": "镜像列表", "sort": 10, "path": "/admin/registry/list"},
                        {"code": "mirror_repository", "name": "镜像仓库", "sort": 20, "path": "/admin/registry"},
                    ],
                },
                {"code": "basic_model", "name": "模型仓库", "sort": 50, "path": "/admin/base-model", "icon": "AppstoreOutlined"},
                {"code": "admin_settings", "name": "系统配置", "sort": 60, "path": "/admin/settings", "icon": "SettingOutlined"},
            ],
        },
    ]

    return [item(seed) for seed in menu_seeds]
