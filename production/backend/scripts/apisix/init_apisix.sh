#!/bin/sh
set -eu

# Write OpenAPI training-dataset APISIX routes through APISIX Admin API.
# Intended to run in an initContainer before the application traffic reaches APISIX.

APISIX_ADMIN_URL="${APISIX_ADMIN_URL:-http://apisix:9180}"
APISIX_ADMIN_KEY="${APISIX_ADMIN_KEY:?APISIX_ADMIN_KEY is required}"

wait_for_apisix_admin() {
  retries="${APISIX_WAIT_RETRIES:-60}"
  interval="${APISIX_WAIT_INTERVAL_SECONDS:-2}"
  attempt=1

  echo "Waiting for APISIX Admin API at ${APISIX_ADMIN_URL} ..."
  while [ "$retries" -gt 0 ]; do
    response_file="/tmp/apisix-admin-ready-response.$$"
    curl_error_file="/tmp/apisix-admin-ready-error.$$"
    http_code="$(curl -sS -o "$response_file" -w '%{http_code}' \
      --connect-timeout "${APISIX_CONNECT_TIMEOUT_SECONDS:-2}" \
      --max-time "${APISIX_REQUEST_TIMEOUT_SECONDS:-5}" \
      "${APISIX_ADMIN_URL}/apisix/admin/routes" \
      -H "X-API-KEY: ${APISIX_ADMIN_KEY}" 2>"$curl_error_file" || true)"

    if [ "$http_code" = "200" ]; then
      rm -f "$response_file" "$curl_error_file"
      echo "APISIX Admin API is ready."
      return 0
    fi

    if [ "$http_code" = "000" ]; then
      echo "APISIX Admin API not reachable yet, attempt ${attempt}: $(cat "$curl_error_file")"
    else
      echo "APISIX Admin API returned HTTP ${http_code}, attempt ${attempt}: $(cat "$response_file")"
    fi

    rm -f "$response_file" "$curl_error_file"

    retries=$((retries - 1))
    attempt=$((attempt + 1))
    sleep "$interval"
  done

  echo "ERROR: APISIX Admin API is not ready at ${APISIX_ADMIN_URL}" >&2
  return 1
}

# Build the APISIX upstream payload.
# Args: id, scheme, name, type, node_host, node_port, node_weight, priority.
upstream_json() {
  upstream_id="$1"
  upstream_scheme="$2"
  upstream_name="$3"
  upstream_type="$4"
  upstream_node_host="$5"
  upstream_node_port="$6"
  upstream_node_weight="$7"
  upstream_priority="$8"

  cat <<EOF
{
  "id": "${upstream_id}",
  "scheme": "${upstream_scheme}",
  "name": "${upstream_name}",
  "type": "${upstream_type}",
  "nodes": [
    {
      "host": "${upstream_node_host}",
      "port": ${upstream_node_port},
      "weight": ${upstream_node_weight},
      "priority": ${upstream_priority}
    }
  ]
}
EOF
}

# Create or update one APISIX upstream through Admin API.
# Args are the same as upstream_json().
put_upstream() {
  upstream_id="$1"
  upstream_scheme="$2"
  upstream_name="$3"
  upstream_type="$4"
  upstream_node_host="$5"
  upstream_node_port="$6"
  upstream_node_weight="$7"
  upstream_priority="$8"
  upstream_payload="$(upstream_json "$upstream_id" "$upstream_scheme" "$upstream_name" "$upstream_type" "$upstream_node_host" "$upstream_node_port" "$upstream_node_weight" "$upstream_priority")"

  echo "Writing upstream ${upstream_id}: ${upstream_node_host}:${upstream_node_port}"
  response_file="/tmp/apisix-upstream-put-response.$$"
  curl_error_file="/tmp/apisix-upstream-put-error.$$"
  http_code="$(curl -sS -o "$response_file" -w '%{http_code}' \
    "${APISIX_ADMIN_URL}/apisix/admin/upstreams/${upstream_id}" \
    -H "X-API-KEY: ${APISIX_ADMIN_KEY}" \
    -H "Content-Type: application/json" \
    -X PUT \
    -d "$upstream_payload" 2>"$curl_error_file")" || {
      echo "ERROR: curl failed while writing upstream ${upstream_id}" >&2
      cat "$curl_error_file" >&2 2>/dev/null || true
      cat "$response_file" >&2 2>/dev/null || true
      rm -f "$response_file" "$curl_error_file"
      return 1
    }

  if [ "$http_code" != "200" ] && [ "$http_code" != "201" ]; then
    echo "ERROR: APISIX Admin API returned HTTP ${http_code} while writing upstream ${upstream_id}" >&2
    cat "$response_file" >&2 2>/dev/null || true
    echo >&2
    rm -f "$response_file" "$curl_error_file"
    return 1
  fi

  cat "$response_file"
  rm -f "$response_file" "$curl_error_file"
  echo
}

# Build the APISIX route payload.
# Args: id, name, uri, methods_json, desc, upstream_id.
route_json() {
  route_id="$1"
  route_name="$2"
  route_uri="$3"
  route_methods="$4"
  route_description="$5"
  route_upstream_id="$6"

  cat <<EOF
{
  "status": 1,
  "methods": ${route_methods},
  "uri": "${route_uri}",
  "name": "${route_name}",
  "desc": "${route_description}",
  "upstream_id": "${route_upstream_id}",
  "plugins": {
    "hmac-auth": {
      "allowed_algorithms": [
        "hmac-sha256"
      ],
      "clock_skew": 300
    }
  },
  "id": "${route_id}",
  "priority": 0,
  "enable_websocket": false
}
EOF
}

# Create or update one APISIX route through Admin API.
# Args are the same as route_json().
put_route() {
  route_id="$1"
  route_name="$2"
  route_uri="$3"
  route_methods="$4"
  route_description="$5"
  route_upstream_id="$6"
  route_payload="$(route_json "$route_id" "$route_name" "$route_uri" "$route_methods" "$route_description" "$route_upstream_id")"

  echo "Writing route ${route_id}: ${route_uri}"
  response_file="/tmp/apisix-route-put-response.$$"
  curl_error_file="/tmp/apisix-route-put-error.$$"
  http_code="$(curl -sS -o "$response_file" -w '%{http_code}' \
    "${APISIX_ADMIN_URL}/apisix/admin/routes/${route_id}" \
    -H "X-API-KEY: ${APISIX_ADMIN_KEY}" \
    -H "Content-Type: application/json" \
    -X PUT \
    -d "$route_payload" 2>"$curl_error_file")" || {
      echo "ERROR: curl failed while writing route ${route_id}" >&2
      cat "$curl_error_file" >&2 2>/dev/null || true
      cat "$response_file" >&2 2>/dev/null || true
      rm -f "$response_file" "$curl_error_file"
      return 1
    }

  if [ "$http_code" != "200" ] && [ "$http_code" != "201" ]; then
    echo "ERROR: APISIX Admin API returned HTTP ${http_code} while writing route ${route_id}" >&2
    cat "$response_file" >&2 2>/dev/null || true
    echo >&2
    rm -f "$response_file" "$curl_error_file"
    return 1
  fi

  cat "$response_file"
  rm -f "$response_file" "$curl_error_file"
  echo
}

# Delete one APISIX route through Admin API. Missing routes are ignored.
delete_route() {
  route_id="$1"

  echo "Deleting obsolete route ${route_id} if it exists"
  response_file="/tmp/apisix-route-delete-response.$$"
  curl_error_file="/tmp/apisix-route-delete-error.$$"
  http_code="$(curl -sS -o "$response_file" -w '%{http_code}' \
    "${APISIX_ADMIN_URL}/apisix/admin/routes/${route_id}" \
    -H "X-API-KEY: ${APISIX_ADMIN_KEY}" \
    -X DELETE 2>"$curl_error_file")" || {
      echo "ERROR: curl failed while deleting route ${route_id}" >&2
      cat "$curl_error_file" >&2 2>/dev/null || true
      cat "$response_file" >&2 2>/dev/null || true
      rm -f "$response_file" "$curl_error_file"
      return 1
    }

  if [ "$http_code" != "200" ] && [ "$http_code" != "202" ] && [ "$http_code" != "404" ]; then
    echo "ERROR: APISIX Admin API returned HTTP ${http_code} while deleting route ${route_id}" >&2
    cat "$response_file" >&2 2>/dev/null || true
    echo >&2
    rm -f "$response_file" "$curl_error_file"
    return 1
  fi

  cat "$response_file"
  rm -f "$response_file" "$curl_error_file"
  echo
}

wait_for_apisix_admin





# 创建上游服务
put_upstream \
  "lab_upstream_00000001" \
  "http" \
  "deepai-lab-backend后端服务" \
  "roundrobin" \
  "deepai-lab-backend" \
  "8000" \
  "1" \
  "1"





# 创建路由
# app/api/openapi/v1/training_dataset.py routes.
# Use APISIX official parameterized uri syntax.
# Requires APISIX config: apisix.router.http=radixtree_uri_with_parameter.
put_route \
  "lab_route_00000001" \
  "下载训练数据集样例路由" \
  "/openapi/lab/v1/training-datasets/project/:project_id/sample/download" \
  '["GET"]' \
  "下载指定项目下训练数据集的样例文件。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000002" \
  "下载训练数据集版本路由" \
  "/openapi/lab/v1/training-datasets/project/:project_id/dataset/:dataset_name/version/:version/download" \
  '["GET"]' \
  "下载指定训练数据集版本；导出文件未准备好时返回异步导出任务状态。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000003" \
  "分页查询训练数据集路由" \
  "/openapi/lab/v1/training-datasets/project/:project_id" \
  '["GET"]' \
  "分页查询指定项目下的训练数据集列表。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000004" \
  "查询训练数据集版本列表路由" \
  "/openapi/lab/v1/training-datasets/project/:project_id/dataset/:dataset_name" \
  '["GET"]' \
  "查询指定训练数据集的全部版本列表。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000005" \
  "查询训练数据集使用状态路由" \
  "/openapi/lab/v1/training-datasets/project/:project_id/dataset/:dataset_name/version/:version/in-use" \
  '["GET"]' \
  "查询指定训练数据集版本是否正在被使用。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000006" \
  "预览训练数据集样本路由" \
  "/openapi/lab/v1/training-datasets/project/:project_id/dataset/:dataset_name/version/:version/preview" \
  '["GET"]' \
  "预览指定训练数据集版本的样本数据。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000007" \
  "上传训练数据集路由" \
  "/openapi/lab/v1/training-datasets" \
  '["POST"]' \
  "上传并创建新的训练数据集。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000008" \
  "上传训练数据集新版本路由" \
  "/openapi/lab/v1/training-datasets/:dataset_name/versions" \
  '["POST"]' \
  "为指定训练数据集上传并创建新版本。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000009" \
  "删除训练数据集全部版本路由" \
  "/openapi/lab/v1/training-datasets/project/:project_id/dataset/:dataset_name" \
  '["DELETE"]' \
  "删除指定训练数据集的全部版本。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000010" \
  "删除训练数据集单个版本路由" \
  "/openapi/lab/v1/training-datasets/project/:project_id/dataset/:dataset_name/:version" \
  '["DELETE"]' \
  "删除指定训练数据集的单个版本。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000011" \
  "查询训练数据集聚合统计路由" \
  "/openapi/lab/v1/training-datasets/project/:project_id/stats" \
  '["GET"]' \
  "查询指定项目下训练数据集的聚合统计信息。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000012" \
  "按聚合条件过滤训练数据集路由" \
  "/openapi/lab/v1/training-datasets/project/:project_id/filtered" \
  '["GET"]' \
  "按聚合筛选条件查询指定项目下的训练数据集。" \
  "lab_upstream_00000001"

# app/api/openapi/v1/chunk_upload.py routes.
put_route \
  "lab_route_00000013" \
  "初始化分片上传路由" \
  "/openapi/lab/v1/uploads/init" \
  '["POST"]' \
  "创建文件分片上传会话并返回上传会话ID。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000014" \
  "上传文件分片路由" \
  "/openapi/lab/v1/uploads/:upload_id/chunks/:chunk_index" \
  '["PUT"]' \
  "上传指定上传会话中的单个文件分片。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000015" \
  "完成分片上传路由" \
  "/openapi/lab/v1/uploads/:upload_id/complete" \
  '["POST"]' \
  "校验并合并指定上传会话中的所有分片。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000016" \
  "查询分片上传进度路由" \
  "/openapi/lab/v1/uploads/:upload_id" \
  '["GET"]' \
  "查询指定上传会话已上传的分片索引和完成状态。" \
  "lab_upstream_00000001"

# app/api/openapi/v1/file_management.py routes.
put_route \
  "lab_route_00000017" \
  "创建文件夹路由" \
  "/openapi/lab/v1/file-management/folders" \
  '["POST"]' \
  "在指定项目下创建文件夹。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000018" \
  "查询文件夹列表路由" \
  "/openapi/lab/v1/file-management/folders" \
  '["GET"]' \
  "查询指定项目下的文件夹列表。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000019" \
  "查询文件夹详情路由" \
  "/openapi/lab/v1/file-management/folders/:folder_id" \
  '["GET"]' \
  "查询指定文件夹的详细信息。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000020" \
  "更新文件夹路由" \
  "/openapi/lab/v1/file-management/folders/:folder_id" \
  '["PUT"]' \
  "更新指定文件夹的名称和描述。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000021" \
  "删除文件夹路由" \
  "/openapi/lab/v1/file-management/folders" \
  '["DELETE"]' \
  "删除指定文件夹，支持批量删除。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000022" \
  "查询文件列表路由" \
  "/openapi/lab/v1/file-management/files" \
  '["GET"]' \
  "查询指定项目下的文件列表。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000023" \
  "下载文件路由" \
  "/openapi/lab/v1/file-management/files/download" \
  '["GET"]' \
  "下载单个文件或批量下载多个文件。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000024" \
  "查询文件详情路由" \
  "/openapi/lab/v1/file-management/files/:file_id" \
  '["GET"]' \
  "查询指定文件的详细信息。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000025" \
  "删除文件路由" \
  "/openapi/lab/v1/file-management/files" \
  '["DELETE"]' \
  "删除指定文件，支持批量删除。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000026" \
  "保存上传文件信息路由" \
  "/openapi/lab/v1/file-management/files/add" \
  '["POST"]' \
  "根据上传会话ID保存文件信息到文件管理。" \
  "lab_upstream_00000001"

# app/api/openapi/v1/machine_learning_dataset.py routes.
put_route \
  "lab_route_00000027" \
  "上传机器学习数据集路由" \
  "/openapi/lab/v1/machine-learning-datasets/dataset/:project_id/upload" \
  '["POST"]' \
  "上传文件创建机器学习数据集版本。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000028" \
  "上传机器学习数据集新版本路由" \
  "/openapi/lab/v1/machine-learning-datasets/dataset/:project_id/version/upload" \
  '["POST"]' \
  "继承已有版本并可追加新文件，创建机器学习数据集新版本。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000029" \
  "下载机器学习数据集样例路由" \
  "/openapi/lab/v1/machine-learning-datasets/dataset/:project_id/sample/download" \
  '["GET"]' \
  "下载机器学习数据集样例文件。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000030" \
  "下载机器学习数据集路由" \
  "/openapi/lab/v1/machine-learning-datasets/dataset/:project_id/:dataset_id/download" \
  '["GET"]' \
  "下载指定机器学习数据集版本；导出文件未准备好时返回异步导出任务状态。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000031" \
  "查询机器学习数据集版本列表路由" \
  "/openapi/lab/v1/machine-learning-datasets/dataset/:project_id/:dataset_id/versions" \
  '["GET"]' \
  "查询同名机器学习数据集的全部版本。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000032" \
  "分页查询机器学习数据集路由" \
  "/openapi/lab/v1/machine-learning-datasets/dataset/:project_id/page" \
  '["GET"]' \
  "分页查询指定项目下的机器学习数据集。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000033" \
  "编辑机器学习数据集基础信息路由" \
  "/openapi/lab/v1/machine-learning-datasets/dataset/:project_id/:dataset_id/basic-info" \
  '["PUT"]' \
  "编辑机器学习数据集名称或描述。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000034" \
  "查询机器学习数据集详情路由" \
  "/openapi/lab/v1/machine-learning-datasets/dataset/:project_id/:dataset_id" \
  '["GET"]' \
  "查询指定机器学习数据集详情。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000035" \
  "删除机器学习数据集版本路由" \
  "/openapi/lab/v1/machine-learning-datasets/dataset/:project_id/:dataset_id" \
  '["DELETE"]' \
  "删除指定机器学习数据集版本。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000036" \
  "删除机器学习数据集全部版本路由" \
  "/openapi/lab/v1/machine-learning-datasets/dataset/:project_id/:dataset_id/versions" \
  '["DELETE"]' \
  "删除指定机器学习数据集的全部同名版本。" \
  "lab_upstream_00000001"

put_route \
  "lab_route_00000037" \
  "查询机器学习数据集导出格式路由" \
  "/openapi/lab/v1/machine-learning-datasets/dataset/export-formats" \
  '["GET"]' \
  "查询每个机器学习任务模板支持的导出格式。" \
  "lab_upstream_00000001"

echo "APISIX OpenAPI routes initialized."
