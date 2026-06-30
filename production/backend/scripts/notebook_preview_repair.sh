#!/usr/bin/env bash
set -euo pipefail

ROOT=${LAB_REPO_ROOT:-/root/lab-coding-git}
BACKEND="$ROOT/production/backend"
cd "$BACKEND"

sync_preview_user_id() {
  .venv/bin/python - <<'PY'
from pathlib import Path

import pymysql


def read_env(path: str) -> dict[str, str]:
    data: dict[str, str] = {}
    for raw in Path(path).read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


def write_env_value(path: Path, key: str, value: str) -> None:
    lines = path.read_text().splitlines()
    replaced = False
    for index, raw in enumerate(lines):
        if raw.strip().startswith(f"{key}="):
            lines[index] = f"{key}={value}"
            replaced = True
            break
    if not replaced:
        lines.append(f"{key}={value}")
    path.write_text("\n".join(lines) + "\n")


env_path = Path(".env")
env = read_env(str(env_path))
conn = pymysql.connect(
    host=env.get("DB_HOST", "127.0.0.1"),
    port=int(env.get("DB_PORT", "3306")),
    user=env.get("DB_USER"),
    password=env.get("DB_PASSWORD"),
    database=env.get("DB_NAME"),
    charset="utf8mb4",
    autocommit=True,
)

with conn.cursor() as cur:
    cur.execute(
        "SELECT id FROM users WHERE username='showcase_admin' "
        "AND tenant_id='lab' ORDER BY id LIMIT 1"
    )
    row = cur.fetchone()

conn.close()

if row:
    user_id = str(row[0])
    write_env_value(env_path, "SHOWCASE_PREVIEW_USER_ID", user_id)
    print(f"SHOWCASE_PREVIEW_USER_ID={user_id}")
else:
    print("SHOWCASE_PREVIEW_USER_ID=missing")
PY
}

read_env_and_patch_db() {
  .venv/bin/python - <<'PY'
from pathlib import Path

import pymysql


def read_env(path: str) -> dict[str, str]:
    data: dict[str, str] = {}
    for raw in Path(path).read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data


env = read_env(".env")
conn = pymysql.connect(
    host=env.get("DB_HOST", "127.0.0.1"),
    port=int(env.get("DB_PORT", "3306")),
    user=env.get("DB_USER"),
    password=env.get("DB_PASSWORD"),
    database=env.get("DB_NAME"),
    charset="utf8mb4",
    autocommit=True,
)

with conn.cursor() as cur:
    updates: list[tuple[str, int]] = []
    cur.execute(
        "UPDATE evaluation_tasks SET status='评估中' "
        "WHERE status='annotating' AND project_id IN (1001,1002)"
    )
    updates.append(("evaluation_tasks.annotating", cur.rowcount))

    cur.execute(
        "UPDATE inference_result_datasets SET status='已完成' "
        "WHERE status='completed' AND project_id IN (1001,1002)"
    )
    updates.append(("inference_result_datasets.completed", cur.rowcount))

    cur.execute(
        "UPDATE inference_result_datasets SET status='运行中' "
        "WHERE status IN ('processing','running') AND project_id IN (1001,1002)"
    )
    updates.append(("inference_result_datasets.running", cur.rowcount))

    print("DB_PATCH=" + ",".join(f"{key}:{value}" for key, value in updates))

conn.close()
PY
}

restart_backend() {
  oldpid=$(cat /root/lab-backend.pid 2>/dev/null || true)
  if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null; then
    kill "$oldpid" || true
    sleep 1
  fi

  nohup "$BACKEND/.venv/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000 \
    > /root/lab-backend.log 2>&1 &
  echo $! > /root/lab-backend.pid

  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
      echo "BACKEND_RESTART=ok"
      return 0
    fi
    sleep 1
  done

  echo "BACKEND_RESTART=failed"
  tail -80 /root/lab-backend.log || true
  return 1
}

probe_preview_api() {
  local token="local-preview-lab-tenant-admin-token"
  local fail=0
  local paths=(
    "/api/v1/projects/list?page=1&size=20"
    "/api/v1/training-datasets/project/1001?page=1&size=20"
    "/api/v1/notebooks/1001/list?page=1&size=20"
    "/api/v1/evaluation-tasks/project/1001?page=1&size=20"
    "/api/v1/manual-evaluation-tasks/project/1001/list?page=1&size=10"
    "/api/v1/data_cleaning/1001/tasks?page=1&size=20"
    "/api/v1/inference_tasks/project/1001?page=1&size=20"
    "/api/v1/inference-result-datasets/project/1001/list?page=1&size=20"
    "/api/v1/projects/1001/compute-task-overview/cluster-resources?cluster_id=3001"
    "/api/v1/projects/1001/compute-task-overview/project-resources?cluster_id=3001&task_scope=llm"
    "/api/v1/benchmark/project/1001/tasks?page=1&size=20"
    "/api/v1/data-augmentations/project/1001/tasks?page=1&size=20"
    "/api/v1/machine-learning-datasets/dataset/1001/page?page=1&size=20"
  )

  for path in "${paths[@]}"; do
    code=$(
      curl -sS -H "Authorization: Bearer $token" \
        -o /tmp/lab-preview-probe.out \
        -w "%{http_code}" \
        "http://127.0.0.1:8000$path" || true
    )
    if [ "$code" = "200" ]; then
      echo "PROBE=ok $path"
    else
      echo "PROBE=fail code=$code $path"
      head -c 300 /tmp/lab-preview-probe.out || true
      echo
      fail=1
    fi
  done

  return "$fail"
}

sync_preview_user_id
read_env_and_patch_db
restart_backend
probe_preview_api
