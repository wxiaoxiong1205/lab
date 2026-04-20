#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${ROOT_DIR}/fastdata-llm-training"

echo "== DeepexiLab Phase 2 Init =="
echo
echo "Workspace: ${ROOT_DIR}"
echo "App dir:   ${APP_DIR}"
echo
echo "[1/6] Current branch"
git -C "${ROOT_DIR}" branch --show-current || true
echo
echo "[2/6] Working tree status"
git -C "${ROOT_DIR}" status --short || true
echo
echo "[3/6] Core guidance files"
printf '%s\n' \
  "${ROOT_DIR}/AGENTS.md" \
  "${ROOT_DIR}/progress.md" \
  "${ROOT_DIR}/tasks.json" \
  "${ROOT_DIR}/docs/ai/phase2-operating-guide.md" \
  "${ROOT_DIR}/docs/architecture/app-shell.md" \
  "${ROOT_DIR}/docs/architecture/routing.md" \
  "${ROOT_DIR}/docs/architecture/api-boundaries.md"
echo
echo "[4/6] Suggested reading order"
cat <<'EOF'
1. AGENTS.md
2. progress.md
3. tasks.json
4. docs/ai/phase2-operating-guide.md
5. Related docs under docs/architecture and docs/modules
6. Then read only the code directly related to the current request
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
echo "[6/6] Phase 2 working reminder"
cat <<'EOF'
- Default baseline is current repository state plus latest user requirements.
- Do not default back to first-phase production-environment replication.
- If the user provides screenshots, treat them as first-class input.
- Update page-side design docs whenever page structure, fields, states, or interactions change.
EOF
