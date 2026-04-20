#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${ROOT_DIR}/fastdata-llm-training"

echo "== DeepexiLab Phase 2 Init =="
echo
echo "Workspace : ${ROOT_DIR}"
echo "App dir   : ${APP_DIR}"
echo

echo "[1/6] Git branch"
git -C "${ROOT_DIR}" branch --show-current || true
echo

echo "[2/6] Working tree"
git -C "${ROOT_DIR}" status --short || true
echo

echo "[3/6] Read first"
printf '%s\n' \
  "${ROOT_DIR}/AGENTS.md" \
  "${ROOT_DIR}/progress.md" \
  "${ROOT_DIR}/tasks.json" \
  "${ROOT_DIR}/docs/ai/phase2-operating-guide.md"
echo

echo "[4/6] Read by topic"
cat <<'EOF'
壳层 / 路由：
- docs/architecture/app-shell.md
- docs/architecture/routing.md

状态 / 接口：
- docs/architecture/state-and-services.md
- docs/architecture/api-boundaries.md

模块知识：
- docs/modules/project-space.md
- docs/modules/system-management.md
- docs/modules/data-services.md
EOF
echo

echo "[5/6] Current app commands"
cat <<'EOF'
cd fastdata-llm-training
npm run dev
npm run build
npm run dev:api
EOF
echo

echo "[6/6] Phase 2 reminder"
cat <<'EOF'
- Default truth source is current repository state plus latest user requirement.
- If screenshots are provided, treat them as first-class input.
- Do not guess ambiguous annotations; ask the user directly.
- Update page-side design docs whenever page structure, fields, states, or interactions change.
- Prefer changing shell / routing / shared state before scattered page details when the requirement is architectural.
EOF
