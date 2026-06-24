"""
ML 部署在线开发 Notebook：异步初始化工作区（scripts 同步、demo 与 model.py 拷贝）。
与 example_notebook_tasks 解耦，避免与案例发布任务混在同一文件。
"""
import logging

from sqlalchemy import select

from app.database.base import get_db_session
from app.database.database_depends import Database, run_async_in_celery
from app.models.models import Notebook, KubernetesResource, ProjectKubernetesRelation
from app.repository.notebook_mapper import NotebookMapper
from app.repository.storage import StorageMapper
from app.services.storage.storage import DefaultStorageService
from app.services.storage.interface import StorageService
from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.utils import app_runtime_context
from app.utils.k8s_launcher import K8sLauncher
from app.utils.storage_utils import JFSSelectiveCloner

logger = logging.getLogger(__name__)


def _get_storage_service() -> StorageService:
    db = Database()
    storage_mapper = StorageMapper(db=db)
    return DefaultStorageService(mapper=storage_mapper)


@celery_app.task(base=TaskBase, bind=True)
def setup_ml_deploy_dev_notebook_workspace_async(
    self: TaskBase,
    project_id: int,
    notebook_id: int,
    src_path: str,
    src_model_py_path: str,
    dst_path: str,
    mount_handle: bool,
) -> dict:
    """
    ML 在线开发 Notebook：在单个 Celery 任务中完成 scripts 同步到 JuiceFS、
    demo 拷贝到工作区；仅当 mount_handle 为 True 时再拷贝 model.py 路径。
    工作区就绪后将 Notebook 置为 CREATED；若此时已发起部署（启动中/排队中等），不覆盖已有状态。
    """
    return run_async_in_celery(
        _setup_ml_deploy_dev_notebook_workspace_impl(
            self,
            project_id,
            notebook_id,
            src_path,
            src_model_py_path,
            dst_path,
            mount_handle,
        )
    )


async def _setup_ml_deploy_dev_notebook_workspace_impl(
    self: TaskBase,
    project_id: int,
    notebook_id: int,
    src_path: str,
    src_model_py_path: str,
    dst_path: str,
    mount_handle: bool,
) -> dict:
    celery_id = getattr(getattr(self, "request", None), "id", None)
    self.task_name = f"setup_ml_deploy_dev_notebook_workspace:{notebook_id}" + (
        f":{celery_id}" if celery_id else ""
    )
    self.task_type = "ml_deploy_dev_notebook"
    mapper = None

    try:
        async with get_db_session() as db:
            nb_row = await db.execute(select(Notebook).where(Notebook.id == notebook_id))
            orm_nb = nb_row.scalar_one_or_none()
            if not orm_nb:
                raise ValueError(f"Notebook 不存在: {notebook_id}")

            tenant_id = orm_nb.tenant_id
            nb_namespace = orm_nb.namespace
            nb_lab_k8s_uuid = orm_nb.lab_k8s_uuid

            cfg_row = await db.execute(
                select(KubernetesResource.config)
                .join(
                    ProjectKubernetesRelation,
                    ProjectKubernetesRelation.k8s_id == KubernetesResource.id,
                )
                .where(ProjectKubernetesRelation.project_id == project_id)
            )
            cfg = cfg_row.first()
            if not cfg:
                raise ValueError("未找到项目 Kubernetes 集群配置")

        if tenant_id:
            app_runtime_context.set_tenant_id(tenant_id)
            self._log_info(f"已设置租户ID: {tenant_id}")
        else:
            self._log_warning("未传入租户ID，可能导致存储路径错误")

        launcher = K8sLauncher(config_str=cfg[0])
        mapper = NotebookMapper(db=Database())
        storage_service = _get_storage_service()
        jfs = await storage_service.JUICEFS_CLIENT(tenant_id=tenant_id)

        try:
            from app.services.inference_task.inference_deploy_scripts_uploader import (
                InferenceDeployScriptsUploader,
            )

            script_uploader = InferenceDeployScriptsUploader(
                project_id=project_id,
                namespace=nb_namespace,
                k8s_uuid=nb_lab_k8s_uuid or "",
                launcher=launcher,
                db=mapper,
                jfs=jfs,
            )
            await script_uploader.build_script_configs()
        except Exception as script_ex:
            logger.warning(
                "ML 在线开发 Notebook：scripts 同步到 JuiceFS 失败，容器内 demo 目录可能为空或旧版本: %s",
                script_ex,
                exc_info=True,
            )

        self._log_info(
            f"开始拷贝 ML demo 到工作区: notebook_id={notebook_id} src={src_path} dst={dst_path}"
        )
        cloner_demo = JFSSelectiveCloner(jfs, max_workers=8, dry_run=False)
        cloner_demo.clone(src=src_path, dst=dst_path, exclude_dirs=[])
        self._log_info(
            f"ML demo 拷贝完成: dirs={cloner_demo.dir_count} files={cloner_demo.file_count}"
        )

        if mount_handle:
            self._log_info(
                f"开始拷贝 model.py 到工作区: notebook_id={notebook_id} src={src_model_py_path}"
            )
            cloner_model = JFSSelectiveCloner(jfs, max_workers=8, dry_run=False)
            cloner_model.clone(src=src_model_py_path, dst=dst_path, exclude_dirs=[])
            self._log_info(
                f"model.py 拷贝完成: dirs={cloner_model.dir_count} files={cloner_model.file_count}"
            )
        else:
            self._log_info(
                f"未挂载 ML handle（mount_handle=False），跳过 model.py 拷贝: notebook_id={notebook_id}"
            )

        from app.common.status import TaskStatus
        from app.utils.timezone_utils import get_current_shanghai_time

        async with get_db_session() as db:
            notebook_result = await db.execute(
                select(Notebook).filter(Notebook.id == notebook_id)
            )
            nb = notebook_result.scalar_one_or_none()
            if not nb:
                self._log_error(f"Notebook 记录不存在: {notebook_id}")
                raise ValueError(f"Notebook 记录不存在: {notebook_id}")
            # 与 start_or_deploy_notebook / deploy 可能并发：勿把已推进的部署态写回「已创建」
            no_clobber = {
                TaskStatus.PREPARING.value,
                TaskStatus.PENDING.value,
                TaskStatus.RUNNING.value,
                TaskStatus.SCHEDULED_PENDING.value,
                TaskStatus.TERMINATED.value,
                TaskStatus.FAILED.value,
                TaskStatus.COMPLETED.value,
            }
            if nb.status in no_clobber:
                self._log_info(
                    f"Notebook 状态已为 {nb.status}，跳过写回 CREATED（工作区初始化完成）: {notebook_id}"
                )
            else:
                nb.status = TaskStatus.CREATED.value
                self._log_info(f"已更新 Notebook 状态为 CREATED: {notebook_id}")
            nb.updated_at = get_current_shanghai_time()
            await db.commit()
            await db.refresh(nb)

        return {
            "status": "success",
            "notebook_id": notebook_id,
            "project_id": project_id,
            "dst_path": dst_path,
        }

    except Exception as e:
        self._log_error(
            f"ML 在线开发 Notebook 工作区初始化失败: notebook_id={notebook_id}, 错误: {str(e)}",
            error=e,
        )
        try:
            from app.common.status import TaskStatus
            from app.utils.timezone_utils import get_current_shanghai_time

            async with get_db_session() as db:
                notebook_result = await db.execute(
                    select(Notebook).filter(Notebook.id == notebook_id)
                )
                nb = notebook_result.scalar_one_or_none()
                if nb:
                    nb.status = TaskStatus.CREATION_FAILED.value
                    nb.updated_at = get_current_shanghai_time()
                    await db.commit()
        except Exception as update_error:
            self._log_error(f"更新 Notebook 状态为失败时出错: {str(update_error)}")
        raise
    finally:
        if mapper is not None:
            try:
                await mapper.close()
            except Exception as close_error:
                self._log_warning(f"关闭 NotebookMapper 数据库会话失败: {close_error}")
