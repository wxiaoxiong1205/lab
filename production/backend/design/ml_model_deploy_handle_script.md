# ML 模型部署：推理脚本（model.py）与 uploadId

## 流程

1. **分片上传**：`POST /api/v1/upload/init` → 上传分片 → `POST /api/v1/upload/merge`（建议 `usage=public`），得到 **`uploadId`**，合并后文件路径写入 `ChunkUploadSession.file_url`。
2. **创建部署**：`POST /api/v1/inference_tasks/project/{project_id}`，JSON 中：
   - `model_source`: `ml_model`
   - `ml_model_config.ml_model_id`: `ml_models.id`
   - **`ml_model_config.ml_handle_upload_id`**: 上一步的 **uploadId**（须为已合并的 `.py`）
3. **后端**：按 **uploadId** 查 `chunk_upload_sessions`，读取 `file_url` 在 JuiceFS 上的文件，**拷贝**至  
   `/{namespace-{project_id}}/ml/model_{ml_model_id}/model_handle/model.py`  
   与 `StoragePath.ML_MODEL_HANDLE_IMP_PY_FILE` 一致；Pod 挂载到 **`/data/ml_backend/model.py`**。  
   ML 脚本信息写入关联表 **inference_task_ml_handles**（字段 `inference_task_id`、`ml_handle_upload_id`、`ml_handle_jfs_path`），主表 **inference_tasks** 不存该字段。

## 请求样例

### 创建 ML 推理任务

`POST /api/v1/inference_tasks/project/{project_id}`

```json
{
  "server_name": "ml-text-clf-infer",
  "description": "机器学习模型（Notebook 产物）在线推理",
  "project_id": 1,
  "model_source": "ml_model",
  "ml_model_config": {
    "ml_model_id": 100,
    "ml_handle_upload_id": "550e8400-e29b-41d4-a716-446655440000"
  },
  "desired_replicas": 1,
  "inference_engine_type": "vLLM",
  "backend_parameters": ["--dtype", "auto"],
  "env_vars": {},
  "image_config": {
    "image_id": 1,
    "image_name": "vllm-serve",
    "image_url": "registry.example.com/inference/vllm:0.6"
  },
  "graphics_card_resource": {
    "card_type": "GPU",
    "card_model": "A800",
    "count": 1,
    "card_memory": "80GB",
    "k8s_resource_type": "nvidia.com/gpu"
  },
  "resource_cpu_config": {
    "resource_cpu_request": 4,
    "resource_cpu_limit": 8,
    "resource_memory_request": 16,
    "resource_memory_limit": 32
  }
}
```

- `ml_handle_upload_id` 为分片上传 merge 成功后返回的 uploadId，对应已合并的 `.py` 文件。

### 重新部署（ML）

`PUT /api/v1/inference_tasks/{project_id}/{inference_task_id}/redeploy`

Body 与创建结构一致，需包含完整字段；`ml_model_config.ml_handle_upload_id` 须再次传入（可为同一 merge 的 uploadId 或新上传合并后的 uploadId）。示例中仅示意 ML 相关片段：

```json
{
  "server_name": "ml-text-clf-infer",
  "project_id": 1,
  "model_source": "ml_model",
  "ml_model_config": {
    "ml_model_id": 100,
    "ml_handle_upload_id": "550e8400-e29b-41d4-a716-446655440000"
  },
  "redeploy": true,
  ...
}
```

**实现说明**：内部会删旧 K8s 应用与主表/关联表记录后再次创建，并传入 `pin_node_port`（沿用原 NodePort）。ML 须在 Body 中再次提供有效的 `ml_handle_upload_id`。

## 表结构

- **inference_tasks**：主表，不再包含 `ml_handle_upload_id`、`ml_handle_jfs_path`。
- **inference_task_ml_handles**：关联表，字段 `inference_task_id`（存 inference_tasks.id，无外键，由业务方维护）、`ml_handle_upload_id`、`ml_handle_jfs_path`；与主表一对一（仅 ML 部署有记录）。

建表与迁移 SQL 见项目根目录 `inference_task_ml_handles_migration.sql`。
