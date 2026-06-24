#!/usr/bin/env python3
"""
统一管理器 - 简化版

同时运行Kubernetes状态监听器和定时任务管理器。
"""

import asyncio
import signal
import sys
from pathlib import Path
from typing import Optional

from app.managers.scheduled_tasks_manager import ScheduledTasksManager

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from app.core.logging import logger
from app.managers.k8s_status_manager import K8sStatusManager


class UnifiedManager:
    """统一管理器 - 管理K8s状态监听器和定时任务管理器"""
    
    def __init__(self):
        """初始化统一管理器"""
        self.running = True
        self.k8s_status_manager: Optional[K8sStatusManager] = None
        self.scheduled_tasks_manager: Optional[ScheduledTasksManager] = None
        logger.info("统一管理器初始化完成")
    
    async def start(self) -> None:
        """启动统一管理器"""
        logger.info("启动统一管理器")
        
        try:
            # 启动Kubernetes状态管理器
            logger.info("正在启动Kubernetes状态管理器...")
            self.k8s_status_manager = K8sStatusManager()
            await self.k8s_status_manager.start()
            logger.info("✅ Kubernetes状态管理器启动成功")

            # 启动定时任务管理器（含分布式锁，已整合原异步定时任务）
            logger.info("正在启动定时任务管理器...")
            self.scheduled_tasks_manager = ScheduledTasksManager()
            self.scheduled_tasks_manager.start()
            logger.info("✅ 定时任务管理器启动成功")
            
            logger.info("🚀 统一管理器启动完成")
            
        except Exception as e:
            logger.error(f"统一管理器启动失败: {e}")
            await self.stop()
            raise
    
    async def stop(self) -> None:
        """停止统一管理器"""
        logger.info("正在停止统一管理器...")
        
        self.running = False

        # 停止定时任务管理器
        if self.scheduled_tasks_manager:
            await self.scheduled_tasks_manager.stop()
        
        # 停止Kubernetes状态管理器
        if self.k8s_status_manager:
            logger.info("正在停止Kubernetes状态管理器...")
            await self.k8s_status_manager.stop()
            logger.info("✅ Kubernetes状态管理器已停止")
        
        logger.info("🛑 统一管理器已完全停止")


async def main() -> None:
    """主入口函数"""
    manager: Optional[UnifiedManager] = None
    shutdown_event = asyncio.Event()

    def signal_handler() -> None:
        """处理停止信号"""
        print("收到停止信号，正在优雅关闭统一管理器...")
        if not shutdown_event.is_set():
            shutdown_event.set()

    # 设置信号处理器
    # Windows 上的 ProactorEventLoop 不支持 add_signal_handler
    # 需要使用不同的方式处理信号
    import platform
    loop = asyncio.get_running_loop()
    
    if platform.system() == 'Windows':
        # Windows 上使用 signal.signal() 直接注册信号处理器
        def windows_signal_handler(signum, frame):
            signal_handler()
        
        signal.signal(signal.SIGINT, windows_signal_handler)
        signal.signal(signal.SIGTERM, windows_signal_handler)
    else:
        # Unix/Linux 系统可以使用 add_signal_handler
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, signal_handler)

    try:
        manager = UnifiedManager()
        await manager.start()

        # 等待关闭信号
        await shutdown_event.wait()

    except Exception as e:
        logger.error(f"❌ 统一管理器运行异常: {e}")
        if not shutdown_event.is_set():
            shutdown_event.set()

    finally:
        logger.info("正在停止统一管理器...")
        if manager:
            await manager.stop()

        # 清理信号处理器
        if platform.system() == 'Windows':
            # Windows 上恢复默认信号处理器
            signal.signal(signal.SIGINT, signal.SIG_DFL)
            signal.signal(signal.SIGTERM, signal.SIG_DFL)
        else:
            # Unix/Linux 系统移除信号处理器
            for sig in (signal.SIGINT, signal.SIGTERM):
                try:
                    loop.remove_signal_handler(sig)
                except Exception as e:
                    logger.error(f"清理信号处理器失败: {e}")

        logger.info("统一管理器已优雅退出")


def run_standalone() -> None:
    """独立运行模式"""
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("🛑 用户中断")
    except Exception as e:
        logger.error(f"❌ 启动失败: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    run_standalone()