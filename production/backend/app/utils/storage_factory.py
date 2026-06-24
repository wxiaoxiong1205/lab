import asyncio
import os
from urllib.parse import urlparse

from fastapi import HTTPException
from minio import Minio
from obs import ObsClient
import tos
import subprocess
import tempfile
import shutil

class BucketCheckerFactory:
    @staticmethod
    async def create_checker(storage_type, *args, **kwargs):
        if storage_type == 'minio':
            return MinioBucketChecker(*args, **kwargs)
        elif storage_type == 'tos':
            return TosBucketChecker(*args, **kwargs)
        elif storage_type == 'nfs':
            return NfsBucketChecker(*args, **kwargs)
        elif storage_type == 'obs':
            return ObsBucketChecker(*args, **kwargs)
        elif storage_type == 'eos':
            return EosBucketChecker(*args, **kwargs)
        else:
            raise ValueError(f"Unsupported storage type: {storage_type}")

class MinioBucketChecker:
    def __init__(self, url, access_key, secret_key, bucket_name):
        self.client = Minio(url, access_key=access_key, secret_key=secret_key,secure=False)
        self.bucket_name = bucket_name

    async def is_empty(self):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._check)

    def _check(self):
        try:
            objects = self.client.list_objects(self.bucket_name, recursive=True)
            return next(objects, None) is None
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"MinIO error: {str(e)}")

class TosBucketChecker:
    def __init__(self, access_key, secret_key, endpoint, region, bucket_name):
        self.client = tos.TosClientV2(access_key, secret_key, endpoint, region)
        self.bucket_name = bucket_name

    async def is_empty(self):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._check)

    def _check(self):
        try:
            response = self.client.list_objects(self.bucket_name)
            return not bool(response.contents)
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"TOS error: {str(e)}"
            )

class NfsBucketChecker:
    def __init__(self, endpoint, remote_path):
        self.endpoint = endpoint
        self.remote_path = remote_path

    async def is_empty(self):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._check)

    def _check(self):
        mount_point = tempfile.mkdtemp()
        try:
            subprocess.check_call(
                [
                    "mount", "-t", "nfs", "-o", "ro,timeo=5,retrans=1",
                    f"{self.endpoint}:{self.remote_path}",
                    mount_point
                ],
                timeout=10  # 防止 mount 卡死
            )

            entries = os.listdir(mount_point)
            return len(entries) == 0

        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"NFS error: {str(e)}"
            )
        finally:
            subprocess.call(["umount", mount_point])
            shutil.rmtree(mount_point, ignore_errors=True)

class ObsBucketChecker:
    def __init__(self, access_key, secret_key, region, bucket_name):
        """
        endpoint 示例：
        - https://obs.cn-north-4.myhuaweicloud.com
        - https://obs.<region>.myhuaweicloud.com
        """
        self.client = ObsClient(
            access_key_id=access_key,
            secret_access_key=secret_key,
            server=f'https://obs.{region}.myhuaweicloud.com'
        )
        self.bucket_name = bucket_name

    async def is_empty(self):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._check)

    def _check(self):
        try:
            # listObjects 最多返回 1000 项
            resp = self.client.listObjects(self.bucket_name)

            if resp.status < 300:
                objects = resp.body.contents or []
                return len(objects) == 0

            else:
                raise Exception(f"OBS error status: {resp.status}, msg: {resp.errorMessage}")

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OBS error: {str(e)}")


class EosBucketChecker:
    def __init__(self, endpoint, access_key, secret_key, bucket_name):
        raw = (endpoint or "").strip()
        if not raw:
            raise ValueError("endpoint 不能为空")
        if "://" in raw:
            parsed = urlparse(raw)
            if not parsed.netloc:
                raise ValueError(f"无效 endpoint: {endpoint}")
            target = parsed.netloc
        else:
            target = raw
        self.client = Minio(target, access_key=access_key, secret_key=secret_key, secure=True)
        self.bucket_name = bucket_name

    async def is_empty(self):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._check)

    def _check(self):
        try:
            objects = self.client.list_objects(self.bucket_name, recursive=True)
            return next(objects, None) is None
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"EOS error: {str(e)}")

# Usage example
if __name__ == "__main__":
    # MinIO example
    minio_checker = BucketCheckerFactory.create_checker(
        'minio',
        # Usage
        url='118.196.1.96:9235',
        access_key = 'minioadmin',
        secret_key = 'Xjh@2026',
        bucket_name = 'deepexilab',
    )
    print(f"MinIO bucket empty: {minio_checker.is_empty()}")

    # TOS example
    tos_checker = BucketCheckerFactory.create_checker(
        'tos',
        access_key="xxxxxxxx",
        secret_key="xxxxxxxxx",
        endpoint="tos-cn-guangzhou.volces.com",
        region="cn-guangzhou",
        bucket_name="deepexi-juicefs-test"
    )
    print(f"TOS bucket empty: {tos_checker.is_empty()}")

    # NFS example
    nfs_checker = BucketCheckerFactory.create_checker(
        'nfs',
        endpoint='1.12.228.173',
        mount_point='/path/to/nfs/mount'
    )
    print(f"NFS bucket empty: {nfs_checker.is_empty()}")
