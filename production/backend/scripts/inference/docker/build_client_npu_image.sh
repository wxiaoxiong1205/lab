#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
IMAGE="lab-cn-guangzhou.cr.volces.com/fs/inference-client:1.0.0-npu"

cd "${REPO_ROOT}"

docker build \
  "$@" \
  -f scripts/inference/docker/Dockerfile.client \
  -t "${IMAGE}" \
  .

docker push "${IMAGE}"
