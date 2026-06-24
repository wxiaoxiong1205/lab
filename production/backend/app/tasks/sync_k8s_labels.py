import asyncio
from app.core.logging import logger
import os
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.services.k8s.k8s import sync_kubernetes_labels
from app.utils.redis_lock_utils import try_acquire_lock, release_lock_if_owner


# ---------- 配置 ----------
LOCK_KEY = os.getenv("LOCK_KEY", "distributed:sync_k8s_labels:lock")
LOCK_TTL_SECONDS = 1 * 60
K8S_LABELS_SCHEDULER_CRON = os.getenv("K8S_LABELS_SCHEDULER_CRON", "*/10 * * * *")
# -------------------------

class KubernetesLabelsSync:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()

    def start(self):
        trigger = CronTrigger.from_crontab(K8S_LABELS_SCHEDULER_CRON)
        self.scheduler.add_job(
            self._job_wrapper,
            trigger=trigger,
            id="sync_k8s_labels",
            replace_existing=True,
            max_instances=1,
        )
        self.scheduler.start()
        logger.info(f"KubernetesLabelsSync 定时任务已启动（cron={K8S_LABELS_SCHEDULER_CRON}）")

    async def _job_wrapper(self):
        token = None
        try:
            token = await try_acquire_lock(LOCK_KEY, LOCK_TTL_SECONDS)
            if not token:
                logger.info("未获得锁，跳过本次执行（其他实例正在运行）")
                return
            logger.info("获得分布式锁，开始执行任务")
            await sync_kubernetes_labels()
        except Exception as e:
            logger.exception(f"任务执行异常: {e}")
        finally:
            if token:
                released = await release_lock_if_owner(LOCK_KEY, token)
                logger.info(f"释放锁 {LOCK_KEY} -> {token} : {released}")