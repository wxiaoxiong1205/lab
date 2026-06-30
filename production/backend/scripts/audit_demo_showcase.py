#!/usr/bin/env python3
"""Check that backend-owned showcase data survives production code refreshes."""

from pathlib import Path
import ast


ROOT = Path(__file__).resolve().parents[2]


def _literalish(node):
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.List):
        return [_literalish(item) for item in node.elts]
    if isinstance(node, ast.Dict):
        return {_literalish(key): _literalish(value) for key, value in zip(node.keys, node.values)}
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "make_showcase_sample_path":
        return f"builtin-sample://{_literalish(node.args[0])}"
    raise ValueError(f"unsupported node: {ast.dump(node, include_attributes=False)}")


def _load_demo_data_lists() -> tuple[list[dict], list[dict]]:
    data_path = ROOT / "backend/app/init_db/modules/demo_showcase/data.py"
    tree = ast.parse(data_path.read_text(encoding="utf-8"))
    values = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in {"TRAINING_DATASETS", "MACHINE_LEARNING_DATASETS"}:
                    values[target.id] = _literalish(node.value)
    return values.get("TRAINING_DATASETS", []), values.get("MACHINE_LEARNING_DATASETS", [])


def _load_seed_method_calls() -> set[str]:
    seeder_path = ROOT / "backend/app/init_db/modules/demo_showcase/seeder.py"
    tree = ast.parse(seeder_path.read_text(encoding="utf-8"))
    calls: set[str] = set()
    for node in ast.walk(tree):
        if not (isinstance(node, ast.AsyncFunctionDef) and node.name == "seed"):
            continue
        for child in ast.walk(node):
            if (
                isinstance(child, ast.Call)
                and isinstance(child.func, ast.Attribute)
                and child.func.attr.startswith("_ensure_")
            ):
                calls.add(child.func.attr)
    return calls


REQUIRED_SEED_CALLS = {
    "_ensure_user",
    "_ensure_projects",
    "_ensure_k8s",
    "_ensure_storage",
    "_ensure_repository",
    "_ensure_relations",
    "_ensure_base_models",
    "_ensure_repository_images",
    "_ensure_online_inference_services",
    "_ensure_openapi_applications",
    "_ensure_third_party_apis",
    "_ensure_training_datasets",
    "_ensure_machine_learning_datasets",
    "_ensure_inference_results",
    "_ensure_notebooks",
    "_ensure_training_tasks",
    "_ensure_trained_models",
    "_ensure_ml_models",
    "_ensure_inference_tasks",
    "_ensure_evaluation_tasks",
    "_ensure_processing_tasks",
    "_ensure_label_tasks",
    "_ensure_ml_label_tasks",
    "_ensure_file_management",
    "_ensure_annotation_services",
    "_ensure_benchmark_showcase",
    "_ensure_image_build_logs",
    "_ensure_task_executions",
}


CHECKS = [
    (
        "demo_showcase seeder module",
        ROOT / "backend/app/init_db/modules/demo_showcase/seeder.py",
        [
            "class DemoShowcaseSeeder",
            'name = "demo_showcase"',
            "_ensure_notebooks",
            "_ensure_training_datasets",
            "_ensure_machine_learning_datasets",
            "_ensure_inference_results",
            "_ensure_training_tasks",
            "_ensure_inference_tasks",
            "_ensure_evaluation_tasks",
            "_ensure_processing_tasks",
            "_ensure_label_tasks",
            "_ensure_ml_label_tasks",
            "_ensure_online_inference_services",
            "_ensure_file_management",
            "_ensure_annotation_services",
            "_ensure_benchmark_showcase",
            "_ensure_image_build_logs",
            "_ensure_task_executions",
        ],
    ),
    (
        "demo_showcase registration",
        ROOT / "backend/app/init_db/modules/__init__.py",
        ["DemoShowcaseSeeder", "SEEDERS"],
    ),
    (
        "demo_showcase cli command",
        ROOT / "backend/app/init_db/init.py",
        ["init_demo_showcase", 'arg == "demo_showcase"'],
    ),
    (
        "builtin sample path helper",
        ROOT / "backend/app/utils/showcase_sample_files.py",
        ["SHOWCASE_SAMPLE_SCHEME", "read_showcase_jsonl_page"],
    ),
    (
        "training dataset builtin preview",
        ROOT / "backend/app/services/training_dataset/training_dataset.py",
        ["is_showcase_sample_path", "read_showcase_jsonl_page"],
    ),
    (
        "inference result builtin preview",
        ROOT / "backend/app/services/inference_result/inference_result.py",
        ["is_showcase_sample_path", "read_showcase_jsonl_page"],
    ),
    (
        "machine learning builtin preview",
        ROOT / "backend/app/services/machine_learning_dataset/machine_learning_dataset.py",
        ["is_showcase_sample_path", "read_showcase_jsonl_page"],
    ),
    (
        "frontend preview is explicit",
        ROOT / "frontend/apps/lab/src/mock/localPreviewData.ts",
        ["export const isLocalPreview = import.meta.env.VITE_SHOWCASE_PREVIEW === 'true'"],
    ),
    (
        "frontend showcase token is request-layer fallback",
        ROOT / "frontend/apps/lab/src/services/apiClient.ts",
        ["isShowcasePreviewBackend", "if (!token && isShowcasePreview", "token = showcasePreviewToken"],
    ),
    (
        "showcase preview auth is env gated",
        ROOT / "backend/app/utils/showcase_auth.py",
        ["SHOWCASE_PREVIEW_AUTH", "local-preview-lab-tenant-admin-token", "SHOWCASE_READ_METHODS", "build_showcase_preview_payload"],
    ),
    (
        "showcase preview auth is wired into middleware",
        ROOT / "backend/app/utils/auth_middleware.py",
        ["is_showcase_preview_request(request, token)", "build_showcase_preview_payload()"],
    ),
    (
        "showcase preview env example",
        ROOT / "backend/env.example",
        ["SHOWCASE_PREVIEW_AUTH=false", "仅限隔离演示后端开启"],
    ),
    (
        "showcase menu fallback is backend owned",
        ROOT / "backend/app/utils/showcase_menu.py",
        ["build_showcase_menu", "MenuItem", "showcase preview menu"],
    ),
    (
        "frontend menu tries backend before fallback",
        ROOT / "frontend/apps/lab/src/services/api.ts",
        ["const response = await api.get<unknown>('/menu')", "本地预览：/menu 获取失败，使用预览菜单数据兜底"],
    ),
    (
        "data augmentation fallback is explicit",
        ROOT / "frontend/apps/lab/src/services/dataAugmentationService.ts",
        ["import.meta.env.VITE_SHOWCASE_PREVIEW === 'true'", "const response = await apiClient.get<DataAugmentationTask>"],
    ),
    (
        "data insight fallback is explicit",
        ROOT / "frontend/apps/lab/src/services/dataInsightService.ts",
        ["import.meta.env.VITE_SHOWCASE_PREVIEW === 'true'", "const response = await apiClient.get<DataInsightTask>"],
    ),
    (
        "migration doc",
        ROOT.parent / "docs/migration/demo-showcase-data.md",
        ["python -m app.init_db.init demo_showcase", "生产代码更新", "覆盖每个可达生产模块"],
    ),
]


def main() -> int:
    failures: list[str] = []
    for name, path, needles in CHECKS:
        if not path.exists():
            failures.append(f"{name}: missing {path}")
            continue
        content = path.read_text(encoding="utf-8")
        for needle in needles:
            if needle not in content:
                failures.append(f"{name}: missing marker {needle!r} in {path}")

    try:
        seed_calls = _load_seed_method_calls()
        for method_name in sorted(REQUIRED_SEED_CALLS - seed_calls):
            failures.append(f"demo_showcase seed flow: missing seed() call {method_name}")

        TRAINING_DATASETS, MACHINE_LEARNING_DATASETS = _load_demo_data_lists()
        training_usages = {item["usage"] for item in TRAINING_DATASETS}
        for usage in {"training", "validation", "test", "business_training", "business_test"}:
            if usage not in training_usages:
                failures.append(f"training datasets: missing usage {usage!r}")

        training_statuses = {item["processing_status"] for item in TRAINING_DATASETS}
        for status in {"completed", "pending", "failed"}:
            if status not in training_statuses:
                failures.append(f"training datasets: missing processing_status {status!r}")

        business_datasets = [item for item in TRAINING_DATASETS if item["usage"].startswith("business_")]
        for item in business_datasets:
            if item["dataset_format"] != "business" or item["training_method_type"] != "business":
                failures.append(f"business dataset {item['name']}: expected business method and format")

        ml_statuses = {item["processing_status"] for item in MACHINE_LEARNING_DATASETS}
        for status in {"completed", "pending", "failed"}:
            if status not in ml_statuses:
                failures.append(f"machine learning datasets: missing processing_status {status!r}")

        ml_task_types = {item["task_type"] for item in MACHINE_LEARNING_DATASETS}
        for task_type in {"text_classification", "text_entity_recognition", "image_classification", "object_detection", "image_segmentation"}:
            if task_type not in ml_task_types:
                failures.append(f"machine learning datasets: missing task_type {task_type!r}")

        for item in [*TRAINING_DATASETS, *MACHINE_LEARNING_DATASETS]:
            if not item.get("path", "").startswith("builtin-sample://"):
                failures.append(f"{item['name']}: sample path must use builtin-sample://")
    except Exception as exc:
        failures.append(f"demo_showcase data contract: parse failed: {exc}")

    seeder_path = ROOT / "backend/app/init_db/modules/demo_showcase/seeder.py"
    seeder_content = seeder_path.read_text(encoding="utf-8") if seeder_path.exists() else ""
    for marker in [
        "showcase-SFT训练已完成",
        "showcase-GRPO训练运行中",
        "showcase-DPO训练失败",
        "showcase-基础模型在线推理运行中",
        "showcase-训练模型在线推理已完成",
        "showcase-ML模型部署失败",
        "showcase-自动评估已完成",
        "showcase-对比评估运行中",
        "showcase-客服问答清洗已完成",
        "showcase-客服问答增强运行中",
        "showcase-多轮对话洞察已完成",
        "showcase-ML图像分类在线标注",
        "showcase-ML检测多人标注",
        "showcase-基准评测已完成",
        "showcase-基准评测排队中",
        "showcase-Notebook镜像构建成功",
        "showcase-ML Notebook镜像构建中",
        "showcase-推理镜像构建失败",
        "TaskExecutionBusinessType.IMAGE_BUILD_LOG.value",
        "TaskExecutionBusinessType.TRAINING_TASK.value",
        "TaskExecutionBusinessType.INFERENCE_RESULT_DATASETS.value",
        "TaskExecutionBusinessType.BUSINESS_INFERENCE_RESULT_DATASETS.value",
        "TaskExecutionBusinessType.EVALUATION_TASK.value",
        "TaskExecutionBusinessType.DATA_CLEANING_TASK.value",
        "TaskExecutionBusinessType.BENCHMARK_TASK.value",
        "showcase-业务推理接口失败",
        "showcase-推理结果失败",
    ]:
        if marker not in seeder_content:
            failures.append(f"demo_showcase seeder contract: missing marker {marker!r}")

    if failures:
        print("demo_showcase audit failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("demo_showcase audit passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
