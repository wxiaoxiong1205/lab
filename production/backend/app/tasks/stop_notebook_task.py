import asyncio
from app.core.logging import logger
import os
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.services.notebook.notebook import stop_overdue_notebooks
from app.utils.redis_lock_utils import try_acquire_lock, release_lock_if_owner


# ---------- 配置 ----------
LOCK_KEY = os.getenv("LOCK_KEY", "distributed:stop_overdue_notebooks:lock")
LOCK_TTL_SECONDS = 60
SCHEDULER_CRON = "*/1 * * * *"
# -------------------------

class NotebookTasks:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()

    def start(self):
        trigger = CronTrigger.from_crontab(SCHEDULER_CRON)
        self.scheduler.add_job(
            # lambda: asyncio.create_task(self._job_wrapper()),
            self._job_wrapper,
            trigger=trigger,
            id="stop_overdue_notebooks",
            replace_existing=True,
            max_instances=1,
        )
        self.scheduler.start()
        logger.info(f"Notebook 定时任务已启动（cron={SCHEDULER_CRON}）")

    async def _job_wrapper(self):
        token = None
        try:
            token = await try_acquire_lock(LOCK_KEY, LOCK_TTL_SECONDS)
            if not token:
                logger.info("未获得锁，跳过本次执行（其他实例正在运行）")
                return
            logger.info("获得分布式锁，开始执行任务")
            await stop_overdue_notebooks()
        except Exception as e:
            logger.exception(f"任务执行异常: {e}")
        finally:
            if token:
                released = await release_lock_if_owner(LOCK_KEY, token)
                logger.info(f"释放锁 {LOCK_KEY} -> {token} : {released}")