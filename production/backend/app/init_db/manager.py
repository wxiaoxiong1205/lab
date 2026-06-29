"""
种子数据管理器

提供简单的种子数据初始化管理
"""

from typing import List, Dict, Any, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.base import get_db_session
from app.core.logging import logger
from .modules import SEEDERS


class SeedManager:
    """种子数据管理器"""
    
    async def run_all(self, session:AsyncSession) -> Dict[str, Any]:
        """执行所有种子数据初始化"""
        print("🚀 开始执行数据初始化...")
        
        # 检查数据库连接
        if not await self._check_db_connection():
            print("❌ 数据库连接失败，无法进行数据初始化")
            return {"success": False, "error": "数据库连接失败"}
        
        results = {}
        total_created = 0
        total_updated = 0
        total_skipped = 0
        total_errors = 0
        failed_seeders: List[Dict[str, str]] = []
        
        # 按顺序执行所有种子管理器
        for seeder_class in SEEDERS:
            seeder_name = getattr(seeder_class, "name", seeder_class.__name__)
            try:
                seeder = seeder_class()
                logger.info(f"开始执行 seeder: {seeder_name}")
                result = await seeder.seed(session)
                results[seeder.name] = result
                
                total_created += result.get("created", 0)
                total_updated += result.get("updated", 0)
                total_skipped += result.get("skipped", 0)
                seeder_errors = result.get("errors", 0)
                total_errors += seeder_errors
                if seeder_errors:
                    error_detail = result.get("error") or result.get("error_messages") or f"errors={seeder_errors}"
                    failed_seeders.append({"seeder": seeder.name, "error": str(error_detail)})
                    logger.error(f"Seeder '{seeder.name}' 初始化返回错误: {result}")
                else:
                    logger.info(f"完成执行 seeder: {seeder.name}")
                
            except Exception as e:
                print(f"❌ {seeder_name} 初始化失败: {str(e)}")
                logger.exception(f"Seeder '{seeder_name}' 初始化失败")
                failed_seeders.append({"seeder": seeder_name, "error": str(e)})
                results[seeder_name] = {"created": 0, "updated": 0, "skipped": 0, "errors": 1, "error": str(e)}
                total_errors += 1
        
        # 输出总结
        print("=" * 50)
        print("📊 数据初始化总结:")
        print(f"  总计创建: {total_created}")
        print(f"  总计更新: {total_updated}")
        print(f"  总计跳过: {total_skipped}")
        print(f"  总计错误: {total_errors}")
        
        for name, result in results.items():
            status = "✅" if result.get("errors", 0) == 0 else "❌"
            print(
                f"  {status} {name}: 创建 {result.get('created', 0)}, "
                f"更新 {result.get('updated', 0)}, 跳过 {result.get('skipped', 0)}, "
                f"错误 {result.get('errors', 0)}"
            )
        
        print("=" * 50)
        
        if total_errors > 0:
            print("⚠️  数据初始化完成，但存在错误")
            return {"success": False, "results": results, "failed_seeders": failed_seeders}
        else:
            print("🎉 数据初始化成功完成!")
            return {"success": True, "results": results}
    
    async def run_single(self, seeder_name: str) -> Dict[str, Any]:
        """执行单个种子数据初始化"""
        print(f"开始执行 {seeder_name} 数据初始化...")
        
        # 查找对应的种子管理器
        seeder_class = None
        for s in SEEDERS:
            if hasattr(s, 'name') and s.name == seeder_name:
                seeder_class = s
                break
            elif s.__name__.lower().replace('seeder', '') == seeder_name.lower():
                seeder_class = s
                break
        
        if not seeder_class:
            print(f"❌ 未找到 {seeder_name} 的种子管理器")
            return {"success": False, "error": f"未找到 {seeder_name} 的种子管理器"}
        
        async with get_db_session() as session:
            try:
                seeder = seeder_class()
                result = await seeder.seed(session)
                if result.get("errors", 0) > 0:
                    await session.rollback()
                    return {"success": False, "result": result}
                await session.commit()
                return {"success": True, "result": result}
            except Exception as e:
                await session.rollback()
                print(f"❌ {seeder_name} 初始化失败: {str(e)}")
                logger.exception(f"Seeder '{seeder_name}' 初始化失败")
                return {"success": False, "error": str(e)}
    
    async def _check_db_connection(self) -> bool:
        """检查数据库连接"""
        try:
            async with get_db_session() as session:
                await session.execute(text("SELECT 1"))
                print("✅ 数据库连接正常")
                return True
        except Exception as e:
            print(f"❌ 数据库连接失败: {str(e)}")
            return False
