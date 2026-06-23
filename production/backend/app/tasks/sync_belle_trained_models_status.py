from app.core.logging import logger
import os
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.services.training_task.belle_training_task import sync_belle_trained_models_task
from app.utils.redis_lock_utils import try_acquire_lock, release_lock_if_owner


# ---------- 配置 ----------
BELLE_TRAINED_MODELS_LOCK_KEY = os.getenv("BELLE_TRAINED_MODELS_LOCK_KEY", "distributed:sync_belle_trained_models_status:lock")
LOCK_TTL_SECONDS = 1 * 60
BELLE_TRAINED_MODELS_STATUS_SCHEDULER_CRON = "*/1 * * * *"
PROVIDER_TYPE = os.getenv('PROVIDER_TYPE','default')
# -------------------------

class BelleTrainedModelsStatusSync:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()

    def start(self):
        if PROVIDER_TYPE != 'belle':
            return
        trigger = CronTrigger.from_crontab(BELLE_TRAINED_MODELS_STATUS_SCHEDULER_CRON)
        self.scheduler.add_job(
            self._job_wrapper,
            trigger=trigger,
            id="sync_belle_trained_models_status",
            replace_existing=True,
            max_instances=1,
        )
        self.scheduler.start()
        logger.info(f"BelleTrainedModelsStatusSync 定时任务已启动（cron={BELLE_TRAINED_MODELS_STATUS_SCHEDULER_CRON}）")

    async def _job_wrapper(self):
        token = None
        try:
            token = await try_acquire_lock(BELLE_TRAINED_MODELS_LOCK_KEY, LOCK_TTL_SECONDS)
            if not token:
                logger.info("未获得锁，跳过本次执行（其他实例正在运行）")
                return
            logger.info("获得分布式锁，开始执行任务")
            await sync_belle_trained_models_task()
        except Exception as e:
            logger.exception(f"任务执行异常: {e}")
        finally:
            if token:
                released = await release_lock_if_owner(BELLE_TRAINED_MODELS_LOCK_KEY, token)
                logger.info(f"释放锁 {BELLE_TRAINED_MODELS_LOCK_KEY} -> {token} : {released}")