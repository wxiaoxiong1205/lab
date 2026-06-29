#!/usr/bin/env python3
"""Check that backend-owned showcase data survives production code refreshes."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

CHECKS = [
    (
        "demo_showcase seeder module",
        ROOT / "backend/app/init_db/modules/demo_showcase/seeder.py",
        [
            "class DemoShowcaseSeeder",
            'name = "demo_showcase"',
            "_ensure_notebooks",
            "_ensure_online_inference_services",
            "_ensure_file_management",
            "_ensure_benchmark_showcase",
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

    if failures:
        print("demo_showcase audit failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("demo_showcase audit passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
