"""
Notebook 案例保存任务（Celery）
用于异步执行克隆（selective clone）
"""
import logging
from typing import Optional

from fastapi import HTTPException

from app.core import settings
from app.database.base import get_db_session
from app.database.database_depends import run_async_in_celery
from app.tasks.celery_app import celery_app
from app.tasks.task_base import TaskBase
from app.utils import app_runtime_context
from app.utils.error_messages import data_not_found_error
from app.utils.storage_utils import JFSSelectiveCloner, StorageUtils
from app.services.storage.interface import StorageService
from app.models.models import ExampleNotebook, Notebook, StorageResource
from app.repository.example_notebook_mapper import ExampleNotebookMapper

logger = logging.getLogger(__name__)


def get_storage_service() -> StorageService:
    """在 Celery worker 中获取 StorageService 实例"""
    from app.repository.storage import StorageMapper
    from app.database.database_depends import Database
    from app.services.storage.storage import DefaultStorageService
    
    db = Database()
    storage_mapper = StorageMapper(db=db)
    return DefaultStorageService(mapper=storage_mapper)


@celery_app.task(base=TaskBase, bind=True)
def install_example_notebook_async(
    self: TaskBase,
    example_notebook_id: int,
    src_path: str,
    dst_path: str,
    exclude_dirs: Optional[list] = None,
    tenant_id: Optional[str] = None
) -> dict:
    """
    异步安装 Notebook 案例模板（Celery 任务必须是同步函数，内部使用 asyncio.run 执行异步操作）
    
    Args:
        example_notebook_id: 案例ID（已创建的案例记录ID）
        src_path: 源路径（notebook 工作目录）
        dst_path: 目标路径（案例模板目录）
        exclude_dirs: 排除的目录列表
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
    
    Returns:
        dict: 包含任务执行结果的字典，包含案例ID
    """
    return run_async_in_celery(
        _install_example_notebook_async_impl(
            self, example_notebook_id, src_path, dst_path, exclude_dirs, tenant_id
        )
    )


async def _install_example_notebook_async_impl(
    self: TaskBase,
    example_notebook_id: int,
    src_path: str,
    dst_path: str,
    exclude_dirs: Optional[list] = None,
    tenant_id: Optional[str] = None
) -> dict:
    """
    异步安装 Notebook 案例模板的实现函数
    
    Args:
        example_notebook_id: 案例ID（已创建的案例记录ID）
        src_path: 源路径（notebook 工作目录）
        dst_path: 目标路径（案例模板目录）
        exclude_dirs: 排除的目录列表
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
    
    Returns:
        dict: 包含任务执行结果的字典，包含案例ID
    """
    try:
        # 设置租户ID到上下文（Celery worker 进程需要）
        if tenant_id:
            app_runtime_context.set_tenant_id(tenant_id)
            self._log_info(f"已设置租户ID: {tenant_id}")
        else:
            self._log_warning("未传入租户ID，可能导致存储路径错误")

        # 设置任务信息
        celery_id = getattr(getattr(self, 'request', None), 'id', None)
        self.task_name = f"save_example_notebook:{example_notebook_id}" + (
            f":{celery_id}" if celery_id else "")
        self.task_type = "example_notebook"

        self._log_info(f"开始保存 Notebook 案例: {example_notebook_id}")
        self._log_info(f"源路径: {src_path}")
        self._log_info(f"目标路径: {dst_path}")
        self._log_info(f"排除目录: {exclude_dirs}")

        # 获取存储服务
        storage_service = get_storage_service()
        jfs = await storage_service.JUICEFS_CLIENT(tenant_id=tenant_id)

        # 创建选择性克隆器
        cloner = JFSSelectiveCloner(jfs, max_workers=8, dry_run=False)

        # 执行选择性克隆
        cloner.clone(
            src=src_path,
            dst=dst_path,
            exclude_dirs=exclude_dirs or []
        )

        # 记录统计信息
        self._log_info(
            f"Notebook 保存完成: "
            f"name={example_notebook_id}, "
            f"dirs={cloner.dir_count}, "
            f"files={cloner.file_count}"
        )

        # 更新案例记录状态为可用
        try:
            from app.database.database_depends import Database
            from app.utils.timezone_utils import get_current_shanghai_time
            from sqlalchemy import select

            async with get_db_session() as db:
                # 查询案例记录
                example_notebook_result = await db.execute(
                    select(ExampleNotebook).filter(ExampleNotebook.id == example_notebook_id)
                )
                example_notebook = example_notebook_result.scalar_one_or_none()

                if not example_notebook:
                    self._log_error(f"案例记录不存在: {example_notebook_id}")
                    raise ValueError(f"案例记录不存在: {example_notebook_id}")

                # 更新状态为可用
                example_notebook.is_available = True
                example_notebook.updated_at = get_current_shanghai_time()

                await db.commit()
                await db.refresh(example_notebook)
            
                self._log_info(f"已更新案例记录状态为可用: {example_notebook_id}")
        except Exception as e:
            self._log_error(f"更新案例记录状态失败: {str(e)}")
            raise  # 如果更新状态失败，应该抛出异常，因为这是关键操作

        return {
            "status": "success",
            "example_notebook_id": example_notebook_id,
            "dirs": cloner.dir_count,
            "files": cloner.file_count,
            "src_path": src_path,
            "dst_path": dst_path
        }

    except Exception as e:
        self._log_error(
            f"保存 Notebook 案例失败: {example_notebook_id}, "
            f"错误: {str(e)}",
            error=e
        )
        raise


@celery_app.task(base=TaskBase, bind=True)
def apply_example_to_notebook_async(
    self: TaskBase,
    notebook_id: int,
    example_id: int,
    src_path: str,
    dst_path: str,
    exclude_dirs: Optional[list] = None,
    tenant_id: Optional[str] = None,
    built_in: bool = False
) -> dict:
    """
    从模板应用文件到 Notebook（Celery 任务必须是同步函数，内部使用 asyncio.run 执行异步操作）
    
    Args:
        notebook_id: Notebook ID
        example_id: 案例ID
        src_path: 源路径（案例模板目录）
        dst_path: 目标路径（notebook 工作目录）
        exclude_dirs: 排除的目录列表
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
        built_in: 内置案例

    Returns:
        dict: 包含任务执行结果的字典
    """
    return run_async_in_celery(
        _apply_example_to_notebook_async_impl(
            self,
            notebook_id,
            example_id,
            src_path,
            dst_path,
            exclude_dirs,
            tenant_id,
            built_in,
        )
    )


async def _apply_example_to_notebook_async_impl(
    self: TaskBase,
    notebook_id: int,
    example_id: int,
    src_path: str,
    dst_path: str,
    exclude_dirs: Optional[list] = None,
    tenant_id: Optional[str] = None,
    built_in: bool = False
) -> dict:
    """
    从模板应用文件到 Notebook 的实现函数
    
    Args:
        notebook_id: Notebook ID
        example_id: 案例ID
        src_path: 源路径（案例模板目录）
        dst_path: 目标路径（notebook 工作目录）
        exclude_dirs: 排除的目录列表
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）
        built_in: 内置案例
    
    Returns:
        dict: 包含任务执行结果的字典
    """
    try:
        # 设置租户ID到上下文（Celery worker 进程需要）
        if tenant_id:
            app_runtime_context.set_tenant_id(tenant_id)
            self._log_info(f"已设置租户ID: {tenant_id}")
        else:
            self._log_warning("未传入租户ID，可能导致存储路径错误")

        # 设置任务信息
        celery_id = getattr(getattr(self, 'request', None), 'id', None)
        self.task_name = f"apply_example_to_notebook:{notebook_id}:{example_id}" + (
            f":{celery_id}" if celery_id else "")
        self.task_type = "example_notebook"

        self._log_info(f"开始从模板应用文件到 Notebook: notebook_id={notebook_id}, example_id={example_id}")
        self._log_info(f"源路径: {src_path}")
        self._log_info(f"目标路径: {dst_path}")
        self._log_info(f"排除目录: {exclude_dirs}")

        cloner = None
        if not built_in:
            # 获取存储服务
            storage_service = get_storage_service()
            jfs = await storage_service.JUICEFS_CLIENT(tenant_id=tenant_id)

            # 创建选择性克隆器
            cloner = JFSSelectiveCloner(jfs, max_workers=8, dry_run=False)

            # 执行选择性克隆
            cloner.clone(
                src=src_path,
                dst=dst_path,
                exclude_dirs=exclude_dirs or []
            )
        else:
            from app.database.database_depends import Database
            from app.utils.timezone_utils import get_current_shanghai_time
            from sqlalchemy import select
            # 从minio走juicefs sync
            async with get_db_session() as db:  # 获取 AsyncSession
                query = await db.execute(select(StorageResource).where(StorageResource.tenant_id == tenant_id))
                storage_resources = query.scalars().all()
                if not storage_resources:
                    raise HTTPException(status_code=404, detail=data_not_found_error())

                STORAGE_METAURL = f'{settings.STORAGE_ENDPOINT}{storage_resources[0].id}'
                logger.info(f"get juicefs meta_url: {STORAGE_METAURL}")

            # 执行sync从minio到jfs
            rc, out, err = StorageUtils.sync_minio_to_jfs(meta_url=STORAGE_METAURL, src_path=src_path, dst_path=dst_path)

            if rc != 0:
                    raise HTTPException(status_code=500, detail=f"内置案例应用失败: {err}")

        # 记录统计信息
        self._log_info(
            f"从模板应用文件完成: "
            f"notebook_id={notebook_id}, "
            f"example_id={example_id}, "
            f"dirs={0 if cloner is None else cloner.dir_count}, "
            f"files={0 if cloner is None else cloner.file_count}"
        )

        # 更新 Notebook 状态为 CREATED
        try:
            from app.common.status import TaskStatus
            from app.utils.timezone_utils import get_current_shanghai_time
            from sqlalchemy import select

            async with get_db_session() as db:
                # 查询 Notebook 记录
                notebook_result = await db.execute(
                    select(Notebook).filter(Notebook.id == notebook_id)
                )
                notebook = notebook_result.scalar_one_or_none()

                if not notebook:
                    self._log_error(f"Notebook 记录不存在: {notebook_id}")
                    raise ValueError(f"Notebook 记录不存在: {notebook_id}")

                # 更新状态为 CREATED
                notebook.status = TaskStatus.CREATED.value
                notebook.updated_at = get_current_shanghai_time()

                await db.commit()
                await db.refresh(notebook)
            
                self._log_info(f"已更新 Notebook 状态为 CREATED: {notebook_id}")
        except Exception as e:
            self._log_error(f"更新 Notebook 状态失败: {str(e)}")
            raise  # 如果更新状态失败，应该抛出异常，因为这是关键操作

        return {
            "status": "success",
            "notebook_id": notebook_id,
            "example_id": example_id,
            "dirs": 0 if cloner is None else cloner.dir_count,
            "files": 0 if cloner is None else cloner.file_count,
            "src_path": src_path,
            "dst_path": dst_path
        }

    except Exception as e:
        self._log_error(
            f"从模板应用文件到 Notebook 失败: notebook_id={notebook_id}, example_id={example_id}, "
            f"错误: {str(e)}",
            error=e
        )
        # 如果失败，更新 Notebook 状态为 FAILED
        try:
            from app.common.status import TaskStatus
            from app.utils.timezone_utils import get_current_shanghai_time
            from sqlalchemy import select

            async with get_db_session() as db:
                notebook_result = await db.execute(
                    select(Notebook).filter(Notebook.id == notebook_id)
                )
                notebook = notebook_result.scalar_one_or_none()
                if notebook:
                    # notebook.status = TaskStatus.FAILED.value
                    notebook.status = TaskStatus.CREATION_FAILED.value
                    notebook.updated_at = get_current_shanghai_time()
                    await db.commit()
        except Exception as update_error:
            self._log_error(f"更新 Notebook 状态为失败时出错: {str(update_error)}")
        
        raise
