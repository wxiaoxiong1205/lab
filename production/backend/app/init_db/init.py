"""
数据库种子数据初始化入口

提供简单的初始化函数
"""

import asyncio
import sys
import os
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.base import get_db_session

from .manager import SeedManager

async def init_all_result(session: AsyncSession):
    """初始化所有种子数据并返回完整结果"""
    manager = SeedManager()
    return await manager.run_all(session)


async def init_all(session:AsyncSession) -> bool:
    """初始化所有种子数据"""
    result = await init_all_result(session)
    return result["success"]


async def init_all_standalone() -> bool:
    """命令行入口使用的全量初始化。"""
    async with get_db_session() as session:
        result = await init_all_result(session)
        if result["success"]:
            await session.commit()
            return True
        await session.rollback()
        return False


async def init_images() -> bool:
    """仅初始化模型数据"""
    manager = SeedManager()
    result = await manager.run_single("images")
    return result["success"]


async def init_data_cleaning() -> bool:
    """仅初始化数据清洗数据"""
    manager = SeedManager()
    result = await manager.run_single("data_cleaning")
    return result["success"]


async def init_evaluation_metrics() -> bool:
    """仅初始化评估指标数据"""
    manager = SeedManager()
    result = await manager.run_single("evaluation_metrics")
    return result["success"]


async def init_common_config() -> bool:
    """仅初始化通用配置数据"""
    manager = SeedManager()
    result = await manager.run_single("common_config")
    return result["success"]


async def init_example_notebook() -> bool:
    """仅初始化内置 Notebook 案例数据"""
    manager = SeedManager()
    result = await manager.run_single("example_notebook")
    return result["success"]


async def init_advanced_templates() -> bool:
    """仅初始化高级模板数据"""
    manager = SeedManager()
    result = await manager.run_single("advanced_templates")
    return result["success"]


async def init_demo_showcase() -> bool:
    """仅初始化演示数据"""
    manager = SeedManager()
    result = await manager.run_single("demo_showcase")
    return result["success"]


async def main():
    """主函数 - 用于直接运行此脚本"""
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg == "images":
            success = await init_images()
        elif arg == "data_cleaning":
            success = await init_data_cleaning()
        elif arg == "evaluation_metrics":
            success = await init_evaluation_metrics()
        elif arg == "common_config":
            success = await init_common_config()
        elif arg == "example_notebook":
            success = await init_example_notebook()
        elif arg == "advanced_templates":
            success = await init_advanced_templates()
        elif arg == "demo_showcase":
            success = await init_demo_showcase()
        elif arg == "all":
            success = await init_all_standalone()
        else:
            print(f"未知的参数: {arg}。支持的参数: images, data_cleaning, evaluation_metrics, common_config, example_notebook, advanced_templates, demo_showcase, all")
            sys.exit(1)
    else:
        # 默认初始化所有数据
        success = await init_all_standalone()
    
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    current_file = Path(__file__).resolve()
    project_root = current_file.parent.parent.parent  
    if str(project_root) not in sys.path:
        print(f"添加项目根目录到 Python 路径: {project_root}")
        sys.path.insert(0, str(project_root))
    asyncio.run(main())
