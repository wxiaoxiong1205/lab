"""
基准评估数据集数据种子管理器
"""

import os
import zipfile
import tempfile
from typing import Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.benchmark_task_manager import BenchmarkDataset
from app.models.models import StorageResource
from app.utils.timezone_utils import get_current_shanghai_time
from .data import get_benchmark_datasets_data


class BenchmarkDatasetsSeeder:
    """基准评估数据集数据种子管理器"""
    
    name = "benchmark_datasets"
    
    async def seed(self, session: AsyncSession) -> Dict[str, Any]:
        """执行基准评估数据集数据初始化"""
        print(f"开始初始化 {self.name} 数据...")
        
        # 获取种子数据
        seed_data = get_benchmark_datasets_data()
        if not seed_data:
            print(f"没有 {self.name} 数据需要初始化")
            return {"created": 0, "skipped": 0, "errors": 0}
        
        # 系统内置数据集使用 tenant_id='0' 表示全局可见
        SYSTEM_TENANT_ID = '0'
        
        # 查询已存在的数据集
        # dataset_codes = [dataset["code"] for dataset in seed_data]
        stmt = select(BenchmarkDataset).where(
            # BenchmarkDataset.code.in_(dataset_codes),
            BenchmarkDataset.tenant_id == SYSTEM_TENANT_ID,
            BenchmarkDataset.is_builtin == True
        )
        result = await session.execute(stmt)
        existing_datasets = result.scalars().all()
        existing_by_code = {row.code: row for row in existing_datasets}

        now = get_current_shanghai_time()
        datasets_to_create = []
        skipped = 0
        updated = 0
        deleted = 0

        # ── 处理更新和创建 ──
        for dataset_data in seed_data:
            code = dataset_data["code"]
            existing = existing_by_code.get(code)
            if existing is not None:
                # 已存在：以 data.py 为准对比并更新
                changed = self._apply_seed_to_existing(existing, dataset_data, now)
                if changed:
                    updated += 1
                    print(f"基准评估数据集已更新（以 data.py 为准）: {dataset_data['name']} ({code})")
                else:
                    skipped += 1
                    print(f"基准评估数据集已存在，跳过: {dataset_data['name']} ({code})")
                continue

            # 创建新数据集
            new_dataset = BenchmarkDataset(
                name=dataset_data["name"],
                code=code,
                invoke_name=dataset_data.get("invoke_name"),
                export_var=dataset_data.get("export_var"),
                language=dataset_data.get("language"),
                original_sample_count=dataset_data.get("original_sample_count"),
                description=dataset_data.get("description"),
                category=dataset_data["category"],
                model_types=dataset_data.get("model_types"),
                is_builtin=dataset_data["is_builtin"],
                sort_order=dataset_data["sort_order"],
                created_id=0,
                created_by='system',
                tenant_id=SYSTEM_TENANT_ID,
                created_at=now,
                updated_at=now
            )
            datasets_to_create.append(new_dataset)

        # ── 处理删除：如果数据库中存在的内置数据集不在 seed_data 中，则删除 ──
        seed_codes = {d["code"] for d in seed_data}
        for code, existing in existing_by_code.items():
            if code not in seed_codes:
                await session.delete(existing)
                deleted += 1
                print(f"基准评估数据集已从数据库中删除（因 data.py 中已移除）: {existing.name} ({code})")

        created = 0
        if datasets_to_create:
            session.add_all(datasets_to_create)
            created = len(datasets_to_create)
            print(f"成功创建 {created} 个基准评估数据集")
        if updated:
            print(f"已按 data.py 更新 {updated} 个基准评估数据集")
        if deleted:
            print(f"已按 data.py 删除 {deleted} 个过时的基准评估数据集")

        # 同步数据集文件：从 MinIO 同步到 JFS
        await self._sync_datasets_to_jfs(session, seed_data)

        print(f"✅ {self.name} 初始化完成 - 创建: {created}, 更新: {updated}, 删除: {deleted}, 跳过: {skipped}")
        return {"created": created, "skipped": skipped, "updated": updated, "deleted": deleted, "errors": 0}

    def _apply_seed_to_existing(self, existing: BenchmarkDataset, data: Dict[str, Any], now) -> bool:
        """用 data.py 的条目更新已存在记录，以 data 为准；data 中所有在模型上存在的字段都参与对比与更新。"""
        skip_keys = {"code", "id", "tenant_id", "created_at", "created_id", "created_by", "minio_path"}
        changed = False
        for key, new_val in data.items():
            if key in skip_keys or not hasattr(existing, key):
                continue
            cur_val = getattr(existing, key, None)
            if new_val != cur_val:
                setattr(existing, key, new_val)
                changed = True
        if changed:
            existing.updated_at = now
        return changed

    async def _sync_datasets_to_jfs(self, session: AsyncSession, seed_data: list) -> None:
        """将数据集 ZIP 从 MinIO 下载解压后同步到每个租户的 JFS。

        流程：
        1. 从 MinIO 统一下载并解压到本地临时目录（只下载一次）。
        2. 解压后仅一层目录时，JFS 目录名用该目录名（与 zip 内一致）；否则用 code。
        3. 对每个租户存储，将内容写入 /public/benchmark/datasets/data/{jfs_folder_name}/。
        """
        datasets_with_path = [d for d in seed_data if d.get("minio_path")]
        if not datasets_with_path:
            return

        try:
            from minio import Minio
            from app.core import settings
            import juicefs

            minio_client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE.lower() == "true",
            )
        except Exception as e:
            print(f"[benchmark_datasets] 初始化 MinIO 客户端失败，跳过文件同步: {e}")
            return

        # 查询所有已初始化的存储配置
        storage_stmt = (
            select(StorageResource)
            .where(StorageResource.is_init == True)
            .order_by(StorageResource.id.asc())
        )
        storage_result = await session.execute(storage_stmt)
        storages = storage_result.scalars().all()
        if not storages:
            print("[benchmark_datasets] 未找到已初始化的存储配置，跳过文件同步")
            return

        print(f"[benchmark_datasets] 找到 {len(storages)} 个已初始化存储，开始同步数据集")

        with tempfile.TemporaryDirectory() as tmp_dir:
            # ── 第一步：从 MinIO 统一下载解压（只做一次） ──
            local_datasets = {}  # code -> src_dir
            for dataset in datasets_with_path:
                code = dataset["code"]
                minio_path = dataset["minio_path"]
                try:
                    zip_local = os.path.join(tmp_dir, f"{code}.zip")
                    minio_client.fget_object(settings.MINIO_BUCKET, minio_path, zip_local)

                    extract_dir = os.path.join(tmp_dir, f"extracted_{code}")
                    os.makedirs(extract_dir, exist_ok=True)
                    with zipfile.ZipFile(zip_local, "r") as zf:
                        zf.extractall(extract_dir)

                    # 先按原逻辑判断一层目录
                    entries = [e for e in os.listdir(extract_dir) if not e.startswith(".") and e != "__MACOSX"]
                    if len(entries) == 1:
                        single = os.path.join(extract_dir, entries[0])
                        src_dir = single if os.path.isdir(single) else extract_dir
                    else:
                        src_dir = extract_dir

                    # 额外处理：如果出现 ceval/ceval 这种重复嵌套目录，则自动向下拍平
                    while True:
                        inner_entries = [e for e in os.listdir(src_dir) if not e.startswith(".") and e != "__MACOSX"]
                        if len(inner_entries) == 1:
                            inner = os.path.join(src_dir, inner_entries[0])
                            if os.path.isdir(inner) and inner_entries[0].lower() == os.path.basename(src_dir).lower():
                                src_dir = inner
                                continue
                        break

                    # JFS 目录名：以最终解析后的目录名为准
                    jfs_folder_name = (
                        os.path.basename(src_dir) if src_dir != extract_dir else code
                    )
                    local_datasets[code] = (src_dir, jfs_folder_name)
                    print(f"[benchmark_datasets] 已下载并解压: {code} -> JFS 目录 {jfs_folder_name}")
                except Exception as e:
                    print(f"[benchmark_datasets] 数据集 {code} 下载/解压失败: {e}")

            if not local_datasets:
                print("[benchmark_datasets] 没有成功下载的数据集，跳过同步")
                return

            # ── 第二步：遍历所有租户存储，逐个同步 ──
            for storage in storages:
                meta_url = f"{settings.STORAGE_ENDPOINT}{storage.id}"
                print(
                    f"[benchmark_datasets] 开始同步到存储 "
                    f"id={storage.id}, tenant_id={storage.tenant_id}"
                )
                try:
                    jfs = juicefs.Client(name="", meta=meta_url)
                except Exception as e:
                    print(
                        f"[benchmark_datasets]   存储 {storage.id} JFS 客户端创建失败: {e}"
                    )
                    continue

                for code, (src_dir, jfs_folder_name) in local_datasets.items():
                    jfs_dst_dir = f"/public/benchmark/datasets/data/{jfs_folder_name}"

                    try:
                        if jfs.exists(jfs_dst_dir) and jfs.listdir(jfs_dst_dir):
                            print(
                                f"[benchmark_datasets]   数据集 {code} "
                                f"已存在于存储 {storage.id}，跳过"
                            )
                            continue
                    except Exception:
                        pass

                    try:
                        if not jfs.exists(jfs_dst_dir):
                            jfs.makedirs(jfs_dst_dir)

                        file_count = 0
                        for root, _, files in os.walk(src_dir):
                            for filename in files:
                                local_file = os.path.join(root, filename)
                                rel_path = os.path.relpath(local_file, src_dir)
                                jfs_file_path = f"{jfs_dst_dir}/{rel_path}"

                                parent_dir = os.path.dirname(jfs_file_path)
                                if not jfs.exists(parent_dir):
                                    jfs.makedirs(parent_dir)

                                with open(local_file, "rb") as f:
                                    with jfs.open(jfs_file_path, "wb") as jf:
                                        jf.write(f.read())
                                file_count += 1

                        print(
                            f"[benchmark_datasets]   数据集 {code} "
                            f"同步到存储 {storage.id} 完成，共 {file_count} 个文件"
                        )
                    except Exception as e:
                        print(
                            f"[benchmark_datasets]   数据集 {code} "
                            f"同步到存储 {storage.id} 失败: {e}"
                        )
