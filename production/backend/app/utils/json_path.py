"""Small helpers for dotted JSON paths used by dataset tooling."""

from typing import Any, List, Tuple


def iter_json_path_values(data: Any, path: str) -> List[Tuple[str, Any]]:
    """
    Return concrete dotted paths and values for a logical dotted path.

    Lists support two forms:
    - prompt.0.content -> a concrete index
    - prompt.content -> content from every dict item in prompt
    """
    if not path:
        return []

    parts = [part for part in path.split(".") if part]
    results: List[Tuple[str, Any]] = []

    def _walk(current: Any, remaining: List[str], concrete: List[str]) -> None:
        if not remaining:
            results.append((".".join(concrete), current))
            return

        part = remaining[0]
        if isinstance(current, dict):
            if part in current:
                _walk(current[part], remaining[1:], concrete + [part])
            return

        if isinstance(current, list):
            if part.isdigit():
                index = int(part)
                if 0 <= index < len(current):
                    _walk(current[index], remaining[1:], concrete + [part])
                return
            for index, item in enumerate(current):
                _walk(item, remaining, concrete + [str(index)])

    _walk(data, parts, [])
    return results


def set_json_path_value(data: Any, path: str, value: Any) -> Any:
    """Set a value on a concrete dotted path, creating containers when needed."""
    if not path:
        return data

    parts = [part for part in path.split(".") if part]
    if not parts:
        return data

    current = data
    for index, part in enumerate(parts[:-1]):
        next_part = parts[index + 1]
        next_container = [] if next_part.isdigit() else {}

        if isinstance(current, dict):
            if part not in current or current[part] is None:
                current[part] = next_container
            current = current[part]
            continue

        if isinstance(current, list) and part.isdigit():
            list_index = int(part)
            while len(current) <= list_index:
                current.append(None)
            if current[list_index] is None:
                current[list_index] = next_container
            current = current[list_index]
            continue

        return data

    last_part = parts[-1]
    if isinstance(current, dict):
        current[last_part] = value
    elif isinstance(current, list) and last_part.isdigit():
        list_index = int(last_part)
        while len(current) <= list_index:
            current.append(None)
        current[list_index] = value
    return data


def collect_json_leaf_paths(data: Any, max_depth: int = 6) -> List[str]:
    """Collect scalar leaf paths, collapsing list indexes for UI-facing fields."""
    paths: List[str] = []
    seen = set()

    def _add(path: str) -> None:
        if path and path not in seen:
            seen.add(path)
            paths.append(path)

    def _walk(current: Any, prefix: List[str], depth: int) -> None:
        if depth > max_depth:
            return
        if isinstance(current, dict):
            for key, value in current.items():
                _walk(value, prefix + [str(key)], depth + 1)
            return
        if isinstance(current, list):
            for item in current:
                _walk(item, prefix, depth + 1)
            return
        _add(".".join(prefix))

    _walk(data, [], 0)
    return paths
