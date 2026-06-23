# ModelService 与定时任务的循环依赖修复说明

## 问题现象

定时任务启动或执行时，`AutoContainer` 注入失败（如 `model_service`、`base_mapper` 等未正确初始化）。

## 循环依赖链

1. **定时任务加载**  
   `app.managers.scheduled_tasks` 被 `ScheduledTasksManager` 等加载。

2. **scheduled_tasks 顶层导入**  
   - `from app.services.model.belle_model import sync_belle_base_model`  
   - `from app.services.training_task.belle_training_task import sync_belle_trained_models_task, sync_belle_training_task`  
   - `from app.core.depend_manager import AutoContainer`

3. **belle_model 加载**  
   - `belle_model` 顶层：`from app.services.model.model import DefaultModelService`  
   - 开始加载 `app.services.model.model`。

4. **model 顶层导入**  
   - `from app.tasks.model_storage_tasks import copy_registered_model_async`  
   - `from ..project.project import ensure_pvc_exists`  
   - 以及若干 mapper、storage、schemas 等。

5. **AutoContainer 初始化**  
   - `scheduled_tasks` 随后执行 `from app.core.depend_manager import AutoContainer`。  
   - `depend_manager` 执行 `scan_package("app.services")`，会再次 `import app.services.model.model`。  
   - 此时若 `model` 仍在首次加载中（被 belle_model 拉起的链未结束），则出现**循环导入**：  
     - `model` 未完全初始化即被扫描逻辑使用，导致容器注入异常或定时任务中取到的服务/BaseMapper 未就绪。

## 修复方案

### 1. 打破 `model` → `model_storage_tasks` 的顶层依赖（app/services/model/model.py）

- **原状**：顶层 `from app.tasks.model_storage_tasks import copy_registered_model_async`。  
- **修改**：删除该顶层导入；在唯一使用处（`create_trained_model` 中调用 `copy_registered_model_async.apply_async` 的位置）改为**函数内懒加载**：  
  `from app.tasks.model_storage_tasks import copy_registered_model_async`。  
- **效果**：加载 `app.services.model.model` 时不再加载 `app.tasks.model_storage_tasks`，避免在容器扫描阶段引入 tasks 链，减少循环风险。

### 2. 打破 `scheduled_tasks` → `belle_model` / `belle_training_task` 的顶层依赖（app/managers/scheduled_tasks.py）

- **原状**：顶层导入  
  `sync_belle_base_model`、`sync_belle_trained_models_task`、`sync_belle_training_task`。  
- **修改**：删除上述顶层导入；在各自 schedule 入口方法内（`sync_belle_base_model_job`、`sync_belle_trained_models_task_job`、`sync_belle_training_task_job`）按需**懒加载**对应函数。  
- **效果**：加载 `scheduled_tasks` 时不再加载 `app.services.model.belle_model` 和 `app.services.training_task.belle_training_task`，因此不会在 AutoContainer 初始化之前拉起 `ModelService` 实现类链，循环被打破；定时任务执行时再按需导入，此时容器已就绪。

## 使用注意

- `ModelService` 及其实现类（如 `DefaultModelService`、`BelleModelService`）中，如需在方法内使用其他可能形成环的模块（如 `app.tasks.*`、其他 service），建议**在方法内按需 import**，避免顶层导入形成新环。  
- 定时任务中通过 `AutoContainer.xxx()` 获取服务/Mapper 时，应保证在**应用与容器均已完成初始化**之后执行（例如在 schedule 回调或 job 方法内调用），避免在模块加载阶段访问容器。
