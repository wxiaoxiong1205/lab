import json
import math
from pathlib import Path
from typing import Any, Iterator

SHOWCASE_SAMPLE_SCHEME = "builtin-sample://"


def make_showcase_sample_path(relative_path: str) -> str:
    return f"{SHOWCASE_SAMPLE_SCHEME}{relative_path.lstrip('/')}"


def is_showcase_sample_path(path: str | None) -> bool:
    return bool(path and path.startswith(SHOWCASE_SAMPLE_SCHEME))


def resolve_showcase_sample_path(path: str) -> Path:
    if not is_showcase_sample_path(path):
        raise ValueError(f"不是内置演示样例路径: {path}")

    relative_path = path[len(SHOWCASE_SAMPLE_SCHEME):].lstrip("/")
    root = Path(__file__).resolve().parents[1] / "sample_datasets"
    resolved = (root / relative_path).resolve()

    if not str(resolved).startswith(str(root.resolve())):
        raise ValueError(f"非法内置演示样例路径: {path}")
    return resolved


def showcase_sample_exists(path: str | None) -> bool:
    if not is_showcase_sample_path(path):
        return False
    return resolve_showcase_sample_path(path).exists()


def iter_showcase_jsonl(path: str) -> Iterator[tuple[int, dict[str, Any] | list[Any] | Any]]:
    resolved = resolve_showcase_sample_path(path)
    with resolved.open("r", encoding="utf-8") as file_obj:
        row_number = 0
        for line in file_obj:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            row_number += 1
            yield row_number, json.loads(stripped)


def read_showcase_jsonl_page(path: str, page: int, size: int) -> tuple[list[tuple[int, Any]], int, int]:
    start = max(page - 1, 0) * size
    end = start + size
    items: list[tuple[int, Any]] = []
    total = 0

    for row_number, sample in iter_showcase_jsonl(path):
        if start <= total < end:
            items.append((row_number, sample))
        total += 1

    pages = math.ceil(total / size) if total > 0 else 1
    return items, total, pages


def count_showcase_jsonl(path: str) -> int:
    return sum(1 for _ in iter_showcase_jsonl(path))
