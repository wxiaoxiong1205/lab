#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
IMAGE="lab-cn-guangzhou.cr.volces.com/fs/vllm-service:v0.13.0-npu"

cd "${REPO_ROOT}"

docker build \
  "$@" \
  -f scripts/inference/docker/Dockerfile.vllm.npu \
  -t "${IMAGE}" \
  .

docker push "${IMAGE}"
