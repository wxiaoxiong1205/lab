import asyncio
import json
import os
import shutil
import tempfile
import urllib.parse
import zipfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import List, Optional, Any, Dict

from fastapi import HTTPException
from fastapi_pagination import Page
from sqlalchemy import select, func, and_, join, cast, String, Integer, or_
from starlette import status
from starlette.responses import JSONResponse, StreamingResponse, FileResponse

from app.common.status import TaskStatus
from app.core.logging import logger
from app.models.data_cleaning_manager import DataCleaningTask
from app.models.evaluation_task_manager import EvaluationTask, EvaluationTaskDatasetModelRelation
from app.models.inference_result_manager import InferenceResultDataset
from app.models.label_manager import LabelDataset, LabelTask
from app.models.models import BusinessAttrValue, BusinessAttrValueOption
from app.models.dataset_operation_manager import DatasetVersionOperation
from app.models.models import JwtUserInfo
from app.models.training_dataset_manager import TrainingDataset
from app.schemas.business_attr_value import (
    BusinessAttrValueInput,
    BusinessAttrValueResponse,
    DATASET_USAGE_TO_BUSINESS_TYPE,
    TRAINING_DATASET_RELATED_BUSINESS_TYPES,
)
from app.schemas.label import LabelTaskStatus, LabelTaskType
from app.schemas.training_dataset import (
    TrainingDatasetResponse, TrainingDatasetSummaryResponse,
    DatasetSampleResponse, DatasetSamplePageResponse, DatasetFormat, DatasetUsage,
    TrainingDatasetUploadTypeCategory, DatasetProcessingStatus, DatasetPublishStatus,
    TrainingDatasetExportTypeCategory, TrainingDatasetAggregationResponse, CountByValueItem,
    AttrOptionGroupItem, TrainingDatasetBasicInfoUpdate,
)
from app.schemas.dataset_operation import DatasetOperationStatus, DatasetOperationType, DatasetKind, DatasetVersionOperationResponse
from app.schemas.training_task import TrainingTypeCategory, TrainingMethodType
from app.utils.business_attr_utils import BusinessAttrValueHelper
from app.utils.dataset_file_parser import (
    generate_filenames as generate_filenames_util,
    format_file_size as format_file_size_util,
    generate_dataset_path as generate_dataset_path_util,
    generate_image_folder_path as generate_image_folder_path_util,
    generate_image_dataset_directory_path as generate_image_dataset_directory_path_util,
    get_index_cache_path as get_index_cache_path_util,
    load_or_build_index as load_or_build_index_util,
    generate_base_path as generate_base_path_util,
    analyze_export_dataset_file_single,
    analyze_image_understanding_dataset_file_content,
    collect_metadata_fields_from_jsonl_iterable_with_stats,
    MetadataFieldsJsonlParseError,
    FILE_TYPE_CONFIG
)
from app.utils.timezone_utils import to_local_tz
from app.utils.timezone_utils import get_current_shanghai_time
from app.utils.showcase_sample_files import is_showcase_sample_path, read_showcase_jsonl_page
from app.utils.validators import CLEANING_TASK_IN_PROGRESS_STATUSES
from app.utils.validators import validate_project_exists, validate_training_dataset_by_name_version_usage_not_exists, \
    validate_training_dataset_by_name_version_usage
from .interface import TrainingDatasetService
from ...models import TrainingTask
from ...repository.training_dataset_mapper import TrainingDatasetMapper
from ...schemas.common import DatasetSampleFileCategory
from ...services.chunk_upload.interface import ChunkUploadService
from ...services.storage.interface import StorageService
from ...utils.app_runtime_context import get_tenant_id
from ...utils.name_validator import validate_name_format


@dataclass
class LineIndex:
    """单行数据的索引信息 - 用于优化大数据集的随机访问"""
    line_number: int      # 行号（从0开始）
    file_offset: int      # 该行在文件中的字节偏移量
    line_length: int      # 该行的字节长度


class DefaultTrainingDatasetService(TrainingDatasetService):
    """训练数据集服务实现类"""
    def __init__(self, training_dataset_mapper: TrainingDatasetMapper, storage: StorageService, chunk_upload_service: ChunkUploadService) -> None:
        super().__init__(training_dataset_mapper, storage, chunk_upload_service)
        self.attr_helper = BusinessAttrValueHelper(training_dataset_mapper)
        # 为大数据集预览优化添加线程池
        self.executor = ThreadPoolExecutor(max_workers=2)

    # ------------------------------ 基础工具方法实现 ------------------------------
    @staticmethod
    def set_publish_display(target) -> None:
        try:
            publish_status = DatasetPublishStatus(getattr(target, "publish", DatasetPublishStatus.UNPUBLISHED.value))
            target.publish = publish_status.value
            target.publish_display = publish_status.description
        except (ValueError, TypeError):
            target.publish_display = None

    @staticmethod
    def set_status_display(target) -> None:
        processing_status_display = getattr(target, "processing_status_display", None)
        publish_display = getattr(target, "publish_display", None)
        if processing_status_display == DatasetProcessingStatus.COMPLETED.description and publish_display in (
            DatasetPublishStatus.UNPUBLISHED.description,
            DatasetPublishStatus.PUBLISHED.description,
        ):
            target.status_display = publish_display
        else:
            target.status_display = processing_status_display

    @staticmethod
    def _operation_to_response(operation: Optional[DatasetVersionOperation]) -> Optional[DatasetVersionOperationResponse]:
        if not operation:
            return None
        response = DatasetVersionOperationResponse.model_validate(operation)
        if response.created_at:
            response.created_at = to_local_tz(operation.created_at)
        if response.updated_at:
            response.updated_at = to_local_tz(operation.updated_at)
        if response.finished_at:
            response.finished_at = to_local_tz(operation.finished_at)
        return response

    async def _get_latest_delete_rows_operation(
        self,
        dataset_id: int,
        include_failed: bool = True,
    ) -> Optional[DatasetVersionOperation]:
        statuses = [
            DatasetOperationStatus.QUEUED.value,
            DatasetOperationStatus.RUNNING.value,
        ]
        if include_failed:
            statuses.append(DatasetOperationStatus.FAILED.value)
        return await self.training_dataset_mapper.query_one(
            select(DatasetVersionOperation).filter(
                DatasetVersionOperation.dataset_kind == DatasetKind.LLM_DATASET.value,
                DatasetVersionOperation.dataset_id == dataset_id,
                DatasetVersionOperation.operation_type == DatasetOperationType.DELETE_ROWS.value,
                DatasetVersionOperation.status.in_(statuses),
            ).order_by(DatasetVersionOperation.updated_at.desc()).limit(1)
        )

    async def _attach_active_operation(self, response: TrainingDatasetResponse) -> None:
        operation = await self._get_latest_delete_rows_operation(response.id)
        response.active_operation = self._operation_to_response(operation)

    @staticmethod
    def generate_dataset_path(
            namespace: str,
            dataset_name: str,
            version: str,
            file_extension: str,
            usage: DatasetUsage,
            dataset_type: Optional[TrainingTypeCategory] = None
    ) -> str:
        """
        生成数据集文件保存路径

        图像理解数据集路径格式：/{namespace}/{usage}/datasets/imageUnderstanding/{dataset_name}_{version}/data.jsonl
        文本生成数据集路径格式：/{namespace}/{usage}/datasets/{dataset_name}_{version}.jsonl

        该方法在其他模块也有调用，勿动
        """

        # 先生成基础目录
        base_path = generate_base_path_util(namespace, usage)

        # 图像类数据集需要额外添加类型子目录和版本目录
        if dataset_type in (TrainingTypeCategory.IMAGE_UNDERSTANDING, TrainingTypeCategory.IMAGE_GENERATION):
            image_dir = 'imageGeneration' if dataset_type == TrainingTypeCategory.IMAGE_GENERATION else 'imageUnderstanding'
            base_path = os.path.join(base_path, image_dir)
            dataset_dir = os.path.join(base_path, f"{dataset_name}_{version}")
            filename = f"data.{file_extension}"
            return os.path.join(dataset_dir, filename).replace('\\', '/')

        elif dataset_type == TrainingTypeCategory.TEXT_GENERATION:
            # 文本生成数据集
            filename = f"{dataset_name}_{version}.{file_extension}"
            return os.path.join(base_path, filename).replace('\\', '/')  # 统一使用 / 分隔符

        else:
            raise HTTPException(status_code=400, detail=f"不支持当前所选的数据集格式：{dataset_type}")


    def get_sample_dataset_path(
            self,
            dataset_type: TrainingTypeCategory,
            training_method_type: TrainingMethodType,
            dataset_format: DatasetFormat,
            file_type: TrainingDatasetUploadTypeCategory
    ) -> str:
        # 计算样例文件基础路径
        current_dir = os.path.dirname(os.path.abspath(__file__))
        api_dir = os.path.dirname(current_dir)  # api
        app_dir = os.path.dirname(api_dir)  # app
        base_sample_dir = os.path.join(app_dir, "sample_datasets")

        # 当前支持 sft / dpo / business 类型样例
        method_dir = training_method_type.value.lower()
        if method_dir not in (
            TrainingMethodType.SFT.value,
            TrainingMethodType.DPO.value,
            TrainingMethodType.GRPO.value,
            TrainingMethodType.BUSINESS.value,
        ):
            raise HTTPException(
                status_code=404,
                detail=f"暂无 {training_method_type.value} 样例数据集"
            )

        if dataset_type == TrainingTypeCategory.IMAGE_GENERATION:
            if training_method_type != TrainingMethodType.SFT or dataset_format != DatasetFormat.IMAGE_PROMPT:
                raise HTTPException(
                    status_code=400,
                    detail="图像生成 V1.15 仅支持 SFT image-prompt 样例数据集"
                )
            if file_type not in (
                TrainingDatasetUploadTypeCategory.ZIP_TYPE,
                TrainingDatasetUploadTypeCategory.IMAGE_PROMPT_ANNOTATED_ZIP,
                TrainingDatasetUploadTypeCategory.IMAGE_PROMPT_UNANNOTATED_ZIP,
            ):
                raise HTTPException(
                    status_code=400,
                    detail="图像生成样例当前仅支持zip格式"
                )
            sample_file_name = (
                DatasetSampleFileCategory.IMAGE_GENERATION_IMAGE_PROMPT_UNANNOTATED
                if file_type == TrainingDatasetUploadTypeCategory.IMAGE_PROMPT_UNANNOTATED_ZIP
                else DatasetSampleFileCategory.IMAGE_GENERATION_IMAGE_PROMPT_ANNOTATED
            )
            sample_path = os.path.join(
                base_sample_dir,
                method_dir,
                "qa",
                f"{sample_file_name.value}.zip"
            )

        elif dataset_type == TrainingTypeCategory.IMAGE_UNDERSTANDING:
            # 图像理解数据集特殊处理
            if training_method_type == TrainingMethodType.GRPO:
                if dataset_format != DatasetFormat.GRPO:
                    raise HTTPException(
                        status_code=400,
                        detail="GRPO训练方法仅支持grpo数据集格式"
                    )
                if file_type != TrainingDatasetUploadTypeCategory.ZIP_TYPE:
                    raise HTTPException(
                        status_code=400,
                        detail="图像理解GRPO样例当前仅支持zip格式"
                    )
                sample_path = os.path.join(
                    base_sample_dir,
                    method_dir,
                    "qa",
                    DatasetSampleFileCategory.IMAGE_UNDERSTANDING_GRPO + "." + file_type
                )

            elif dataset_format == DatasetFormat.ROLE_BASED:
                # role-based
                sample_path = os.path.join(
                    base_sample_dir,
                    method_dir,
                    "qa",
                    DatasetSampleFileCategory.IMAGE_UNDERSTANDING_ROLE_BASED + "." + file_type
                )

            else:
                # 不支持的数据集格式
                raise HTTPException(
                    status_code=400,
                    detail=f"暂无当前数据集格式：{dataset_format} 的样例数据集"
                )

        elif dataset_type == TrainingTypeCategory.TEXT_GENERATION:
            # 文本生成数据集
            if training_method_type == TrainingMethodType.GRPO:
                if dataset_format != DatasetFormat.GRPO:
                    raise HTTPException(
                        status_code=400,
                        detail="GRPO训练方法仅支持grpo数据集格式"
                    )
                if file_type not in (
                    TrainingDatasetUploadTypeCategory.JSON_TYPE,
                    TrainingDatasetUploadTypeCategory.JSONL_TYPE,
                    TrainingDatasetUploadTypeCategory.XLSX_TYPE,
                ):
                    raise HTTPException(
                        status_code=400,
                        detail="GRPO样例当前仅支持json/jsonl/xlsx格式"
                    )
                sample_path = os.path.join(
                    base_sample_dir,
                    method_dir,
                    "qa",
                    DatasetSampleFileCategory.TEXT_GENERATION_GRPO + "." + file_type
                )

            elif dataset_format == DatasetFormat.PROMPT_RESPONSE:
                # prompt_response
                sample_path = os.path.join(
                    base_sample_dir,
                    method_dir,
                    "qa",
                    DatasetSampleFileCategory.TEXT_GENERATION_PROMPT_RESPONSE + "." + file_type
                )

            elif dataset_format == DatasetFormat.ALPACA:
                if file_type not in (
                    TrainingDatasetUploadTypeCategory.JSON_TYPE,
                    TrainingDatasetUploadTypeCategory.JSONL_TYPE,
                    TrainingDatasetUploadTypeCategory.XLSX_TYPE,
                ):
                    raise HTTPException(
                        status_code=400,
                        detail=f"alpaca 样例当前仅支持 json/jsonl/xlsx，暂不支持 {file_type.value}"
                    )
                sample_path = os.path.join(
                    base_sample_dir,
                    method_dir,
                    "qa",
                    DatasetSampleFileCategory.TEXT_GENERATION_DPO_ALPACA + "." + file_type
                )

            elif dataset_format == DatasetFormat.ROLE_BASED:
                # role_based
                if method_dir == TrainingMethodType.DPO.value:
                    sample_path = os.path.join(
                        base_sample_dir,
                        method_dir,
                        "qa",
                        DatasetSampleFileCategory.TEXT_GENERATION_DPO_ROLE_BASED + "." + file_type
                    )
                else:
                    sample_path = os.path.join(
                        base_sample_dir,
                        method_dir,
                        "qa",
                        DatasetSampleFileCategory.TEXT_GENERATION_ROLE_BASED + "_" + file_type + ".zip"
                    )

            else:
                # 不支持的数据集格式
                raise HTTPException(
                    status_code=400,
                    detail=f"暂无当前数据集格式：{dataset_format} 的样例数据集"
                )

        elif dataset_type == TrainingTypeCategory.BUSINESS:
            # 业务测试数据集：
            sample_path = os.path.join(
                base_sample_dir,
                method_dir,
                DatasetSampleFileCategory.BUSINESS_TEST_BUSINESS + "." + file_type
            )

        else:
            # 不支持的数据集类型
            raise HTTPException(
                status_code=400,
                detail=f"暂无当前数据集类型：{dataset_type} 的样例数据集"
            )

        sample_path = os.path.normpath(sample_path)

        if not os.path.exists(sample_path):
            raise HTTPException(
                status_code=404,
                detail=f"样例文件缺失: {sample_path}"
            )

        return sample_path

    # ------------------------------ 核心业务方法实现 ------------------------------
    async def download_sample_dataset(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            dataset_type: TrainingTypeCategory,
            training_method_type: TrainingMethodType,
            dataset_format: DatasetFormat,
            file_type: TrainingDatasetUploadTypeCategory
    ) -> FileResponse:
        """下载样例数据集"""
        # 验证项目存在
        # 验证项目存在
        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        try:
            # 获取样例数据集文件路径
            sample_path = self.get_sample_dataset_path(dataset_type, training_method_type, dataset_format, file_type)

            # 检查文件是否存在
            if not os.path.exists(sample_path):
                raise HTTPException(
                    status_code=404,
                    detail=f"暂无 {training_method_type.value} + {dataset_format.value} 的样例数据集，请联系管理员添加"
                )

            # 根据样例文件的原始名称作生成中文下载文件名
            origin_download_filename = os.path.basename(sample_path)
            prefix, suffix = os.path.splitext(origin_download_filename)

            # 从枚举中获取描述
            description = DatasetSampleFileCategory.get_description_by_value(prefix)

            if description:
                download_filename = f"{description}{suffix}"
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"暂无 {training_method_type.value} + {dataset_format.value} 的样例数据集，请联系管理员添加"
                )

            logger.info(f"用户 {current_user.userId} 在项目 {project_id} 中下载样例数据集: {sample_path}")

            # 直接用 suffix 设置 Content-Type（与下载文件名一致，zip 时为 application/zip）
            from app.utils.dataset_file_parser import FILE_TYPE_CONFIG
            ext_key = (suffix or "").strip().lstrip(".").lower()
            media_type = FILE_TYPE_CONFIG.get(ext_key, FILE_TYPE_CONFIG["jsonl"])["media_type"]

            # 需要将 header 头中的文件名改为 utf-8 格式，否则在下载中文文件名将导致字符编码错误
            filename_utf8 = urllib.parse.quote(download_filename)
            # 返回文件下载响应
            return FileResponse(
                path=sample_path,
                filename=download_filename,
                media_type=media_type,
                headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_utf8}"}
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"下载样例数据集失败: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"下载样例数据集失败: {str(e)}"
            )

    async def download_dataset(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            dataset_name: str,
            version: str,
            usage: DatasetUsage,
            file_type: TrainingDatasetExportTypeCategory
    ):
        """下载指定数据集文件

        对于图像理解数据集，返回zip文件（包含data.jsonl和images文件夹）
        对于文本生成数据集，返回原始文件
        """
        # 验证项目存在
        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        # 查询并验证数据集
        dataset = await validate_training_dataset_by_name_version_usage(
            await self.training_dataset_mapper.get_session(),
            project_id,
            dataset_name,
            version,
            usage
        )

        # 获取JuiceFS客户端
        jfs = await self._get_juicefs_client()

        # 检查文件是否存在（.jsonl数据集文件）
        if not jfs.exists(dataset.dataset_path):
            raise HTTPException(
                status_code=404,
                detail=f"数据集文件不存在: {dataset.dataset_path}"
            )

        try:
            logger.info(f"用户 {current_user.userId} 在项目 {project_id} 中下载数据集: {dataset_name} v{version}")

            return await self._download_dataset_from_export_cache(
                current_user=current_user,
                jfs=jfs,
                dataset=dataset,
                project_id=project_id,
                dataset_name=dataset_name,
                version=version,
                usage=usage,
                file_type=file_type,
            )

        except Exception as e:
            logger.error(f"下载数据集文件失败: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"下载数据集文件失败: {str(e)}"
            )

    async def _download_dataset_from_export_cache(
            self,
            current_user: JwtUserInfo,
            jfs: Any,
            dataset: TrainingDataset,
            project_id: int,
            dataset_name: str,
            version: str,
            usage: DatasetUsage,
            file_type: TrainingDatasetExportTypeCategory,
    ):
        if dataset.dataset_type in (TrainingTypeCategory.IMAGE_UNDERSTANDING, TrainingTypeCategory.IMAGE_GENERATION) and file_type.value != "zip":
            raise HTTPException(
                status_code=500,
                detail=f"当前导出格式不支持：{file_type.value}"
            )

        dataset_dir = os.path.dirname(dataset.dataset_path.rstrip("/")).replace("\\", "/")
        export_root = f"{dataset_dir}/exports/dataset_{dataset.id}/{file_type.value}/"
        meta_path = f"{export_root}meta.json"
        default_artifact_path = f"{export_root}export.{file_type.value}"

        def stream_jfs_file(path: str, chunk_size: int = 1024 * 1024):
            with jfs.open(path, "rb") as src:
                while True:
                    chunk = src.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk

        meta = None
        if jfs.exists(meta_path):
            try:
                with jfs.open(meta_path, "r", encoding="utf-8") as f:
                    parsed = json.loads(f.read() or "{}")
                    if isinstance(parsed, dict):
                        meta = parsed
            except Exception as meta_read_err:
                logger.warning(f"读取训练数据集导出缓存元信息失败 dataset_id={dataset.id}, format={file_type.value}: {meta_read_err}")

        if meta and meta.get("status") == "success":
            artifact_path = str(meta.get("artifact_path") or default_artifact_path)
            if jfs.exists(artifact_path):
                suffix = os.path.splitext(artifact_path)[1].lstrip(".").lower() or file_type.value
                media_type = FILE_TYPE_CONFIG.get(suffix, FILE_TYPE_CONFIG[file_type.value])["media_type"]
                download_filename = f"{dataset_name}_{version}.{suffix}"
                filename_utf8 = urllib.parse.quote(download_filename)
                return StreamingResponse(
                    stream_jfs_file(artifact_path),
                    media_type=media_type,
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_utf8}"}
                )

        if meta and meta.get("status") == "processing":
            return JSONResponse(
                status_code=202,
                content={
                    "status": "processing",
                    "task_id": meta.get("task_id"),
                    "dataset_id": dataset.id,
                    "export_format": file_type.value,
                    "message": "导出任务处理中，请稍后重试下载",
                },
            )

        from app.tasks.dataset_processing_tasks import build_training_dataset_export_cache

        tenant_id = get_tenant_id()
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        celery_result = build_training_dataset_export_cache.apply_async(kwargs={
            "tenant_id": tenant_id,
            "dataset_id": dataset.id,
            "project_id": project_id,
            "dataset_name": dataset_name,
            "version": version,
            "usage": usage.value,
            "dataset_type": dataset.dataset_type,
            "export_file_type": file_type.value,
            "dataset_path": dataset.dataset_path,
            "namespace": namespace,
        })
        return JSONResponse(
            status_code=202,
            content={
                "status": "processing",
                "task_id": celery_result.id,
                "dataset_id": dataset.id,
                "export_format": file_type.value,
                "message": "已提交异步导出任务，请稍后重试下载",
            },
        )

    async def download_image_dataset(
            self,
            jfs: Any,
            dataset: TrainingDataset,
            project_id: int,
            dataset_name: str,
            version: str,
            export_file_type: TrainingDatasetExportTypeCategory
    ) -> StreamingResponse:
        """下载图像理解数据集为zip文件

        zip文件结构：
        - data.jsonl
        - images/
          - image1.jpg
          - image2.jpg
          - ...
        """
        # 图像理解只支持zip格式的导出
        if export_file_type.value != "zip":
            raise HTTPException(
                status_code=500,
                detail=f"当前导出格式不支持：{export_file_type.value}"
            )

        # 获取租户ID
        tenant_id = get_tenant_id()
        if not tenant_id:
            raise HTTPException(
                status_code=500,
                detail="无法获取租户ID"
            )

        # 生成项目命名空间
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"

        # 生成数据集目录路径和文件路径
        dataset_dir_path = generate_image_dataset_directory_path_util(
            namespace, dataset_name, version, dataset.usage, dataset.dataset_type.value
        )
        dataset_file_path = dataset.dataset_path  # data.jsonl路径（已经是完整的JuiceFS路径）
        images_folder_path = generate_image_folder_path_util(
            namespace, dataset_name, version, dataset.usage, dataset.dataset_type.value
        )

        logger.info(f"准备打包图像类数据集: {dataset_dir_path}")
        logger.debug(f"数据集文件路径: {dataset_file_path}")
        logger.debug(f"图片文件夹路径: {images_folder_path}")

        # 检查data.jsonl文件是否存在
        if not jfs.exists(dataset_file_path):
            raise HTTPException(
                status_code=404,
                detail=f"数据集文件不存在: {dataset_file_path}"
            )

        # 使用临时目录而不是单个临时文件，避免内存问题
        temp_dir = None
        temp_zip_path = None

        try:
            # 创建临时目录
            temp_dir = tempfile.mkdtemp()
            temp_zip_path = os.path.join(temp_dir, "dataset.zip")

            # 1. 先将所有文件下载到临时目录
            temp_images_dir = os.path.join(temp_dir, "images")
            os.makedirs(temp_images_dir, exist_ok=True)

            # 将data.jsonl下载到临时目录
            temp_data_path = os.path.join(temp_dir, "data.jsonl")

            # 分块复制文件（同步函数，在线程池中执行）
            def copy_file_with_chunks(src_path: str, dst_path: str, chunk_size: int = 1024 * 1024):  # 1MB chunks
                """分块复制文件"""
                try:
                    with jfs.open(src_path, 'rb') as src_file:
                        with open(dst_path, 'wb') as dst_file:
                            while True:
                                chunk = src_file.read(chunk_size)
                                if not chunk:
                                    break
                                dst_file.write(chunk)
                except Exception as e:
                    logger.error(f"复制文件失败 {src_path} -> {dst_path}: {str(e)}")
                    raise

            # 递归复制目录（同步函数）
            def copy_directory_recursive(src_dir: str, dst_dir: str):
                """递归复制目录"""
                try:
                    items = jfs.listdir(src_dir)
                except Exception as e:
                    logger.warning(f"无法列出目录内容: {src_dir}, 错误: {str(e)}")
                    return

                for item in items:
                    src_item_path = os.path.join(src_dir, item).replace('\\', '/')
                    dst_item_path = os.path.join(dst_dir, item)

                    # 检查是文件还是目录
                    is_directory = False
                    try:
                        jfs.listdir(src_item_path)
                        is_directory = True
                    except:
                        is_directory = False

                    if is_directory:
                        # 如果是目录，递归处理
                        os.makedirs(dst_item_path, exist_ok=True)
                        copy_directory_recursive(src_item_path, dst_item_path)
                    else:
                        # 如果是文件，复制
                        copy_file_with_chunks(src_item_path, dst_item_path)

            # 在线程池中执行文件复制操作，避免阻塞事件循环
            await asyncio.to_thread(copy_file_with_chunks, dataset_file_path, temp_data_path)
            logger.debug("已复制data.jsonl到临时目录")

            # 2. 复制图片文件（如果存在）
            if jfs.exists(images_folder_path):
                try:
                    await asyncio.to_thread(copy_directory_recursive, images_folder_path, temp_images_dir)
                    logger.info(f"已复制images文件夹到临时目录")
                except Exception as e:
                    logger.warning(f"复制images文件夹失败: {str(e)}")
            else:
                logger.warning(f"images文件夹不存在: {images_folder_path}")

            # 3. 创建zip文件（压缩是CPU/磁盘密集型操作，放到线程中避免阻塞事件循环）
            def create_zip_file():
                with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                    # 添加data.jsonl
                    zip_file.write(temp_data_path, 'data.jsonl')
                    logger.debug("已添加data.jsonl到zip")

                    # 添加images文件夹（如果存在）
                    if os.path.exists(temp_images_dir) and os.listdir(temp_images_dir):
                        for root, dirs, files in os.walk(temp_images_dir):
                            for file in files:
                                file_path = os.path.join(root, file)
                                # 计算相对路径
                                rel_path = os.path.relpath(file_path, temp_dir)
                                zip_file.write(file_path, rel_path)
                        logger.info("已添加images文件夹到zip")

            await asyncio.to_thread(create_zip_file)

            # 4. 创建生成器来流式返回zip文件
            def generate_zip_content():
                """生成zip文件内容"""
                file_handle = None
                try:
                    file_handle = open(temp_zip_path, 'rb')
                    chunk_size = 64 * 1024  # 64KB chunks
                    while True:
                        chunk = file_handle.read(chunk_size)
                        if not chunk:
                            break
                        yield chunk
                finally:
                    # 读取完成后关闭文件并清理临时目录
                    if file_handle:
                        try:
                            file_handle.close()
                        except:
                            pass
                    # 清理临时目录
                    try:
                        if temp_dir and os.path.exists(temp_dir):
                            shutil.rmtree(temp_dir, ignore_errors=True)
                            logger.debug(f"已清理临时目录: {temp_dir}")
                    except Exception as e:
                        logger.warning(f"清理临时目录失败: {temp_dir}, 错误: {str(e)}")

            # 生成下载文件名
            download_filename = f"{dataset_name}_{version}.zip"
            filename_utf8 = urllib.parse.quote(download_filename)

            # 返回流式响应
            return StreamingResponse(
                generate_zip_content(),
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_utf8}"}
            )

        except HTTPException:
            # 清理临时文件
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e:
                    logger.warning(f"清理临时目录失败: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"创建zip文件失败: {str(e)}")
            # 清理临时文件
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception as e2:
                    logger.warning(f"清理临时目录失败: {temp_dir}, 错误: {str(e2)}")
            raise HTTPException(
                status_code=500,
                detail=f"创建zip文件失败: {str(e)}"
            )

    async def download_text_dataset(
            self,
            dataset: TrainingDataset,
            project_id: int,
            dataset_name: str,
            version: str,
            export_file_type: TrainingDatasetExportTypeCategory
    ) -> StreamingResponse:
        """下载文本生成数据集文件，支持多格式导出（jsonl、json、xlsx）"""
        # 使用 analyze_export_dataset_file_single 进行格式转换
        file_content = await analyze_export_dataset_file_single(
            db_dataset=dataset,
            export_file_type=export_file_type,
            storage_service=self.storage
        )

        # 获取文件配置（media_type 等）
        file_type_value = export_file_type.value
        file_config = FILE_TYPE_CONFIG.get(file_type_value, FILE_TYPE_CONFIG['jsonl'])
        media_type = file_config['media_type']

        # 生成下载文件名（格式：dataset_name_version.文件类型）
        download_filename = f"{dataset_name}_{version}.{file_type_value}"
        filename_utf8 = urllib.parse.quote(download_filename)

        def generate_file_content():
            yield file_content

        return StreamingResponse(
            generate_file_content(),
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_utf8}"}
        )

    async def list_training_datasets(
            self,
            project_id: int,
            name: Optional[str] = None,
            dataset_type: Optional[TrainingTypeCategory] = None,
            training_method_type: Optional[TrainingMethodType] = None,
            usage: Optional[DatasetUsage] = None,
            page: Optional[int] = None,
            size: Optional[int] = None,
            processing_status: Optional[DatasetProcessingStatus] = None,
    ) -> Page[TrainingDatasetSummaryResponse]:
        """获取训练数据集列表"""
        # 验证项目存在
        # 验证项目存在
        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        # 构建查询条件
        conditions = [TrainingDataset.project_id == project_id]

        if name:
            conditions.append(TrainingDataset.name.ilike(f"%{name}%"))

        if dataset_type:
            conditions.append(TrainingDataset.dataset_type == dataset_type)

        if training_method_type:
            conditions.append(TrainingDataset.training_method_type == training_method_type)

        if usage:
            conditions.append(TrainingDataset.usage == usage)

        # 构建汇总查询：按数据集名称分组，获取汇总信息
        # 使用子查询获取每个数据集名称的第一条记录（按创建时间排序）
        subquery = (
            select(
                TrainingDataset.name,
                TrainingDataset.dataset_type,
                TrainingDataset.training_method_type,
                TrainingDataset.dataset_format,
                TrainingDataset.usage,
                TrainingDataset.project_id,
                TrainingDataset.created_by,
                func.row_number().over(
                    partition_by=TrainingDataset.name,
                    order_by=TrainingDataset.created_at
                ).label('rn')
            )
            .where(and_(*conditions))
        ).subquery()

        # 子查询：获取每个数据集名称的最新版本的处理状态和错误信息
        # 如果提供了 processing_status 筛选，则添加到条件中
        status_conditions = conditions.copy()
        if processing_status:
            status_conditions.append(TrainingDataset.processing_status == processing_status.value)

        latest_status_subquery = (
            select(
                TrainingDataset.name,
                TrainingDataset.processing_status,
                TrainingDataset.processing_error,
                TrainingDataset.publish,
                func.row_number().over(
                    partition_by=TrainingDataset.name,
                    order_by=cast(func.replace(TrainingDataset.version, 'V', ''), Integer).desc()
                ).label('rn')
            )
            .where(and_(*status_conditions))
        ).subquery()

        # 主查询：汇总统计信息
        query = (
            select(
                func.max(TrainingDataset.id).label('id'),
                TrainingDataset.name.label('dataset_name'),
                func.count(TrainingDataset.id).label('version_count'),
                func.concat('V',
                            cast(
                                func.min(
                                    cast(func.replace(TrainingDataset.version, 'V', ''), Integer)
                                ), String)
                            ).label('earliest_version'),
                func.concat('V',
                            cast(
                                func.max(
                                    cast(func.replace(TrainingDataset.version, 'V', ''), Integer)
                                ), String)
                            ).label('latest_version'),
                func.min(TrainingDataset.created_at).label('created_at'),
                func.max(TrainingDataset.updated_at).label('updated_at'),
                # 从子查询获取第一条记录的字段值
                subquery.c.dataset_type,
                subquery.c.training_method_type,
                subquery.c.dataset_format,
                subquery.c.usage,
                subquery.c.project_id,
                subquery.c.created_by,
                # 从最新版本子查询获取处理状态和错误信息
                latest_status_subquery.c.processing_status,
                latest_status_subquery.c.processing_error,
                latest_status_subquery.c.publish
            )
            .select_from(
                join(
                    TrainingDataset,
                    subquery,
                    and_(
                        TrainingDataset.name == subquery.c.name,
                        subquery.c.rn == 1
                    )
                ).join(
                    latest_status_subquery,
                    and_(
                        TrainingDataset.name == latest_status_subquery.c.name,
                        latest_status_subquery.c.rn == 1
                    )
                )
            )
            .where(and_(*conditions))
            .group_by(
              #  TrainingDataset.id,
                TrainingDataset.name,
                subquery.c.dataset_type,
                subquery.c.training_method_type,
                subquery.c.dataset_format,
                subquery.c.usage,
                subquery.c.project_id,
                subquery.c.created_by,
                latest_status_subquery.c.processing_status,
                latest_status_subquery.c.processing_error,
                latest_status_subquery.c.publish
            )
            .order_by(func.max(TrainingDataset.updated_at).desc())  # 按最后更新时间降序
        )

        # 使用 fastapi-pagination 进行分页
        page_result = await self.training_dataset_mapper.query_page(query, page, size)

        # 处理分页结果，设置中文显示字段和枚举转换
        if hasattr(page_result, 'items') and page_result.items:
            for item in page_result.items:
                # 处理 processing_status：转换为枚举并设置中文显示
                if hasattr(item, 'processing_status') and item.processing_status:
                    try:
                        status_enum = DatasetProcessingStatus(item.processing_status)
                        item.processing_status = status_enum
                        item.processing_status_display = status_enum.description
                    except (ValueError, KeyError):
                        # 如果状态值无效，设置为 None
                        item.processing_status = None
                        item.processing_status_display = None
                else:
                    item.processing_status = None
                    item.processing_status_display = None

                self.set_publish_display(item)

                # processing_error 已经通过查询获取，无需额外处理

        return page_result

    async def get_training_dataset_versions(
            self,
            project_id: int,
            dataset_name: str,
            usage: DatasetUsage,
            processing_status: Optional[DatasetProcessingStatus] = None,
            publish: Optional[DatasetPublishStatus] = None,
    ) -> List[TrainingDatasetResponse]:
        """获取当前数据集下的所有版本的数据集"""
        # 验证项目存在
        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        # 构建查询条件
        where_conditions = [
            TrainingDataset.project_id == project_id,
            TrainingDataset.name == dataset_name,
            TrainingDataset.usage == usage
        ]

        # 如果指定了处理状态，添加筛选条件
        if processing_status is not None:
            where_conditions.append(TrainingDataset.processing_status == processing_status.value)
        if publish is not None:
            where_conditions.append(TrainingDataset.publish == publish.value)

        # 查询该数据集名称下的所有版本
        datasets = await self.training_dataset_mapper.query(
            select(TrainingDataset).where(
                *where_conditions
            ).order_by(cast(func.replace(TrainingDataset.version, 'V', ''), Integer).desc())  # 按版本号降序排列
        )


        if not datasets:
            raise HTTPException(
                status_code=404,
                detail=f"项目中不存在名为 '{dataset_name}' 的训练数据集"
            )

        # 获取 business_type 用于查询属性值
        business_type_enum = DATASET_USAGE_TO_BUSINESS_TYPE.get(usage.value)
        business_type_str = business_type_enum.value if business_type_enum else None

        # 转换为响应模型并处理时区和文件大小格式化
        responses = []
        for dataset in datasets:
            response = TrainingDatasetResponse.model_validate(dataset)
            response.created_at = to_local_tz(dataset.created_at)
            response.updated_at = to_local_tz(dataset.updated_at)

            # 显式设置处理状态和错误信息，确保返回给前端
            response.processing_status = DatasetProcessingStatus(dataset.processing_status)
            response.processing_status_display = response.processing_status.description
            response.processing_error = dataset.processing_error
            self.set_publish_display(response)
            self.set_status_display(response)
            await self._attach_active_operation(response)

            # 添加格式化的文件大小显示（前端友好）
            if hasattr(response, 'file_size') and dataset.file_size:
                file_size_bytes = int(dataset.file_size * 1024 * 1024)  # 数据库存储的是MB
                response.file_size_display = format_file_size_util(file_size_bytes)

            # 查询关联属性值和属性值选项
            if business_type_str:
                attr_values = await self.attr_helper.query_attr_values_with_options(
                    reference_id=dataset.id,
                    business_type=business_type_str,
                )
                await self.attr_helper.attach_attr_options(attr_values)
                response.attr_values = [
                    BusinessAttrValueResponse.model_validate(av) for av in attr_values
                ]
            else:
                response.attr_values = []

            responses.append(response)

        return responses

    async def update_training_dataset_basic_info(
            self,
            project_id: int,
            dataset_name: str,
            usage: DatasetUsage,
            update_data: TrainingDatasetBasicInfoUpdate,
    ) -> bool:
        """编辑数据集名称和描述，并同步引用该数据集的冗余名称/描述。"""
        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        datasets = await self.training_dataset_mapper.query(
            select(TrainingDataset).where(
                TrainingDataset.project_id == project_id,
                TrainingDataset.name == dataset_name,
                TrainingDataset.usage == usage,
            )
        )
        if not datasets:
            raise HTTPException(
                status_code=404,
                detail=f"项目中不存在名为 '{dataset_name}' 用途为 '{usage.value}' 的数据集，请刷新重试"
            )

        dataset_ids = [dataset.id for dataset in datasets]
        if "description" in update_data.model_fields_set:
            target_dataset = next((dataset for dataset in datasets if dataset.id == update_data.dataset_id), None)
            if target_dataset is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"数据集ID {update_data.dataset_id} 不属于项目 {project_id} 下 '{dataset_name}' 的 {usage.value} 数据集，请刷新重试"
                )
            target_dataset.description = update_data.description

        new_name = update_data.name
        if new_name is not None:
            try:
                validate_name_format(new_name, "数据集名称")
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

            if new_name != dataset_name:
                exists_datasets = await self.training_dataset_mapper.query(
                    select(TrainingDataset).where(
                        TrainingDataset.project_id == project_id,
                        TrainingDataset.name == new_name,
                    )
                )
                if exists_datasets:
                    exists_dataset = exists_datasets[0]
                    try:
                        exists_usage = DatasetUsage(exists_dataset.usage).description
                    except (ValueError, TypeError):
                        exists_usage = exists_dataset.usage
                    raise HTTPException(
                        status_code=400,
                        detail=f"项目中已存在名为 '{new_name}' 用途为 '{exists_usage}' 的数据集"
                    )

                source_dataset_name_by_id = {}
                for dataset in datasets:
                    dataset.name = new_name
                    source_dataset_name_by_id[dataset.id] = self._format_training_dataset_display_name(dataset)

                inference_result_datasets = await self.training_dataset_mapper.query(
                    select(InferenceResultDataset).where(
                        InferenceResultDataset.project_id == project_id,
                        InferenceResultDataset.source_dataset_id.in_(dataset_ids),
                    )
                )
                for inference_result_dataset in inference_result_datasets:
                    inference_result_dataset.source_dataset_name = source_dataset_name_by_id.get(
                        inference_result_dataset.source_dataset_id, inference_result_dataset.source_dataset_name
                    )

                await self._sync_training_task_dataset_names(
                    project_id,
                    usage,
                    dataset_name,
                    new_name,
                )

        await self.training_dataset_mapper.commit()
        return True

    async def update_training_dataset_publish_status(
        self,
        project_id: int,
        dataset_id: int,
        publish: DatasetPublishStatus,
    ) -> bool:
        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        if publish != DatasetPublishStatus.PUBLISHED:
            raise HTTPException(status_code=400, detail="仅允许将未发布状态修改为已发布状态")

        dataset = await self.training_dataset_mapper.query_one(
            select(TrainingDataset).filter(
                TrainingDataset.project_id == project_id,
                TrainingDataset.id == dataset_id,
            )
        )
        if not dataset:
            raise HTTPException(
                status_code=404,
                detail=f"项目中不存在指定的数据集：dataset_id={dataset_id}"
            )
        active_operation = await self._get_latest_delete_rows_operation(dataset_id, include_failed=False)
        if active_operation:
            raise HTTPException(status_code=400, detail="当前版本有删除任务处理中，请完成后再操作")

        if dataset.publish == DatasetPublishStatus.PUBLISHED.value:
            raise HTTPException(status_code=400, detail="数据集已发布，不用重新发布")
        if dataset.publish != DatasetPublishStatus.UNPUBLISHED.value:
            raise HTTPException(status_code=400, detail="仅未发布状态的数据集可以发布")

        if dataset.processing_status != DatasetProcessingStatus.COMPLETED.value:
            raise HTTPException(status_code=400, detail="数据集处理状态为已完成时才允许发布")

        dataset.publish = DatasetPublishStatus.PUBLISHED.value
        await self.training_dataset_mapper.commit()
        return True

    async def delete_training_dataset_rows(
            self,
            current_user: JwtUserInfo,
            project_id: int,
            dataset_id: int,
            row_numbers: List[int],
    ) -> DatasetVersionOperationResponse:
        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        normalized_rows = sorted(set(row_numbers or []))
        if not normalized_rows:
            raise HTTPException(status_code=400, detail="删除行号不能为空")
        if any(row_number < 1 for row_number in normalized_rows):
            raise HTTPException(status_code=400, detail="删除行号必须大于等于 1")

        dataset = await self.training_dataset_mapper.query_one(
            select(TrainingDataset).filter(
                TrainingDataset.project_id == project_id,
                TrainingDataset.id == dataset_id,
            ).with_for_update()
        )
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        active_operation = await self._get_latest_delete_rows_operation(dataset_id, include_failed=False)
        if active_operation:
            return self._operation_to_response(active_operation)
        if dataset.processing_status != DatasetProcessingStatus.COMPLETED.value:
            raise HTTPException(status_code=400, detail="只有已完成状态的数据集才能删除指定行")
        if dataset.publish != DatasetPublishStatus.UNPUBLISHED.value:
            raise HTTPException(status_code=400, detail="只有未发布状态的数据集才能删除指定行")
        if not dataset.dataset_path:
            raise HTTPException(status_code=404, detail="数据集文件不存在")

        sample_count = int(dataset.total_samples or 0)
        if normalized_rows[-1] > sample_count:
            raise HTTPException(status_code=400, detail=f"删除行号超出数据集范围: {normalized_rows[-1]}")
        if len(normalized_rows) >= sample_count:
            raise HTTPException(status_code=400, detail="删除后数据集至少需要保留一行数据")

        operation = DatasetVersionOperation(
            operation_id=uuid.uuid4().hex,
            dataset_kind=DatasetKind.LLM_DATASET.value,
            dataset_id=dataset.id,
            version=dataset.version,
            operation_type=DatasetOperationType.DELETE_ROWS.value,
            status=DatasetOperationStatus.QUEUED.value,
            row_numbers=normalized_rows,
            requested_count=len(normalized_rows),
            removed_count=0,
            error_message=None,
            created_by=current_user.username,
        )
        session = await self.training_dataset_mapper.get_session()
        session.add(operation)
        await self.training_dataset_mapper.commit()

        try:
            from app.tasks.dataset_processing_tasks import delete_training_dataset_rows
            delete_training_dataset_rows.apply_async(
                args=[dataset_id, normalized_rows, operation.operation_id],
                countdown=1,
            )
            return self._operation_to_response(operation)
        except Exception as exc:
            logger.error(f"提交删除数据集行任务失败: dataset_id={dataset_id}, error={str(exc)}", exc_info=True)
            operation.status = DatasetOperationStatus.FAILED.value
            operation.error_message = f"提交删除数据集行任务失败: {str(exc)}"[:1000]
            operation.finished_at = get_current_shanghai_time()
            await self.training_dataset_mapper.commit()
            raise HTTPException(status_code=500, detail=f"提交删除数据集行任务失败: {str(exc)}") from exc

    async def _sync_training_task_dataset_names(
        self,
        project_id: int,
        usage: DatasetUsage,
        old_name: str,
        new_name: str,
    ) -> None:
        coarse = self._build_training_task_dataset_name_sync_filter(usage, old_name)
        if coarse is None:
            return
        training_tasks = await self.training_dataset_mapper.query(
            select(TrainingTask).where(
                TrainingTask.project_id == project_id,
                coarse,
            )
        )
        for training_task in training_tasks:
            items_raw = training_task.eval_dataset_items if usage == DatasetUsage.VALIDATION else training_task.dataset_items
            renamed_items, items_changed = self._rename_training_task_dataset_items(
                items_raw,
                old_name,
                new_name,
            )
            if not items_changed:
                continue
            if usage == DatasetUsage.VALIDATION:
                training_task.eval_dataset_items = renamed_items
            else:
                training_task.dataset_items = renamed_items

    @staticmethod
    def _build_training_task_dataset_name_sync_filter(usage: DatasetUsage, old_name: str):
        dataset_items_text = cast(
            TrainingTask.eval_dataset_items if usage == DatasetUsage.VALIDATION else TrainingTask.dataset_items,
            String,
        )
        name_patterns = (
            f'"name": {json.dumps(old_name, ensure_ascii=False)}',
            f'"name":{json.dumps(old_name, ensure_ascii=False)}',
        )
        return or_(*(dataset_items_text.contains(pattern) for pattern in name_patterns))

    @staticmethod
    def _rename_training_task_dataset_items(
        items_raw: Any,
        old_name: str,
        new_name: str,
    ) -> tuple[Any, bool]:
        if isinstance(items_raw, str):
            try:
                items_raw = json.loads(items_raw)
            except Exception:
                return items_raw, False
        if not isinstance(items_raw, list):
            return items_raw, False

        changed = False
        renamed_items = []
        for item in items_raw:
            if not isinstance(item, dict):
                renamed_items.append(item)
                continue
            renamed_item = item.copy()
            should_rename = renamed_item.get("name") == old_name
            if should_rename and renamed_item.get("name") != new_name:
                renamed_item["name"] = new_name
                changed = True
            renamed_items.append(renamed_item)
        return renamed_items, changed

    @staticmethod
    def _format_training_dataset_display_name(dataset: TrainingDataset) -> str:
        """格式化训练数据集展示名称：数据集用途/数据集名称-版本号。"""
        try:
            usage_desc = DatasetUsage(dataset.usage).description if dataset.usage else None
        except (ValueError, TypeError):
            usage_desc = dataset.usage
        name_version = f"{dataset.name}>{dataset.version}" if dataset.version else dataset.name
        return f"{usage_desc}/{name_version}" if usage_desc else name_version

    async def preview_dataset_data(
            self,
            project_id: int,
            name: str,
            version: str,
            page: int,
            size: int
    ) -> DatasetSamplePageResponse:
        """
            # 旧版的文件预览实现方法
            # 当前的方法的问题是：
                - 以流式的方式读取，然后依次遍历每一行，取出需要战术上的行数，面对大数据量文件，访问耗时极高
        """
        # 验证项目存在
        # 验证项目是否存在
        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        # 查询数据集
        dataset = await self.training_dataset_mapper.query_one(
            select(TrainingDataset).filter(
                TrainingDataset.project_id == project_id,
                TrainingDataset.name == name,
                TrainingDataset.version == version
            )
        )

        if not dataset:
            raise HTTPException(
                status_code=404,
                detail=f"数据集不存在：项目ID={project_id}, 名称={name}, 版本={version}"
            )

        if is_showcase_sample_path(dataset.dataset_path):
            page_items, total, pages = read_showcase_jsonl_page(dataset.dataset_path, page, size)
            samples = [
                DatasetSampleResponse(row_number=row_number, sample_data=sample)
                for row_number, sample in page_items
            ]
            return DatasetSamplePageResponse(
                items=samples,
                total=total,
                page=page,
                size=size,
                pages=pages,
                base_url=None,
            )

        # 获取JuiceFS客户端
        jfs = await self._get_juicefs_client()

        # 检查文件是否存在
        if not jfs.exists(dataset.dataset_path):
            raise HTTPException(
                status_code=404,
                detail=f"数据集文件不存在: {dataset.dataset_path}"
            )

        try:
            # 使用数据库中存储的样本总数，避免重复计算
            total_samples = dataset.total_samples or 0

            # 计算分页参数
            start_index = (page - 1) * size

            # 流式读取文件，只处理当前页需要的数据
            with jfs.open(dataset.dataset_path, 'r', encoding='utf-8') as f:
                samples = []
                current_row = 0
                collected_samples = 0

                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue

                    # 跳过当前页之前的数据
                    if current_row < start_index:
                        current_row += 1
                        continue

                    # 已收集够当前页的数据，退出循环
                    if collected_samples >= size:
                        break

                    try:
                        # 解析JSON数据，无论是数组还是对象都作为单个样本处理
                        parsed_data = json.loads(line)

                        samples.append(DatasetSampleResponse(
                            row_number=current_row + 1,  # 行号从1开始
                            sample_data=parsed_data
                        ))

                        collected_samples += 1

                    except json.JSONDecodeError as e:
                        logger.warning(f"跳过无效JSON行 {current_row + 1}: {str(e)}")

                    current_row += 1

            # 手动构建分页响应
            total_pages = (total_samples + size - 1) // size if total_samples > 0 else 1

            # 如果是图像理解数据集，生成 base_url
            base_url = None
            if dataset.dataset_type in (TrainingTypeCategory.IMAGE_UNDERSTANDING, TrainingTypeCategory.IMAGE_GENERATION):
                base_url = await self._build_base_url(project_id, dataset)

            # 返回自定义分页响应模型（包含 base_url）
            return DatasetSamplePageResponse(
                items=samples,
                total=total_samples,
                page=page,
                size=size,
                pages=total_pages,
                base_url=base_url
            )

        except Exception as e:
            logger.error(f"读取数据集文件失败: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"读取数据集文件失败: {str(e)}"
            )

    async def create_training_dataset_with_file(
            self,
            current_user: JwtUserInfo,
            name: str,
            project_id: int,
            dataset_type: TrainingTypeCategory,
            training_method_type: TrainingMethodType,
            dataset_format: DatasetFormat,
            usage: DatasetUsage,
            chunk_upload_ids: str,
            version: str = "V1",
            description: Optional[str] = None,
            dataset_config: Optional[str] = None,
            attr_values: Optional[List[BusinessAttrValueInput]] = None
    ) -> TrainingDatasetResponse:
        """上传新的数据集"""
        # 解析配置信息
        # 解析dataset_config（如果提供）
        config_dict = {}
        if dataset_config:
            try:
                config_dict = json.loads(dataset_config)
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=400,
                    detail="数据集配置格式错误：必须是有效的JSON字符串"
                )

        if dataset_format == DatasetFormat.ALPACA and training_method_type != TrainingMethodType.DPO:
            raise HTTPException(
                status_code=400,
                detail="alpaca 数据集格式仅支持 dpo 训练方法"
            )
        if training_method_type == TrainingMethodType.GRPO:
            if dataset_type not in (TrainingTypeCategory.TEXT_GENERATION, TrainingTypeCategory.IMAGE_UNDERSTANDING):
                raise HTTPException(
                    status_code=400,
                    detail="grpo 训练方法仅支持 text-generation 或 image-understanding 数据集类型"
                )
            if dataset_format != DatasetFormat.GRPO:
                raise HTTPException(
                    status_code=400,
                    detail="grpo 训练方法仅支持 grpo 数据集格式"
                )
        elif dataset_format == DatasetFormat.GRPO:
            raise HTTPException(
                status_code=400,
                detail="grpo 数据集格式仅支持 grpo 训练方法"
            )

        # 验证项目是否存在
        project = await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        # 验证数据集名称和版本的唯一性（创建数据集时，不同用途的数据集不允许同名，所以这里不添加usage筛选）
        await validate_training_dataset_by_name_version_usage_not_exists(
            await self.training_dataset_mapper.get_session(),
            project.id,
            name,
            version,
        )

        # 生成项目命名空间
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project.id}"

        # 将upload_ids字符串转化为list
        if chunk_upload_ids is not None and chunk_upload_ids != "":
            # 解析逗号分隔的字符串为整数列表
            chunk_upload_ids_list = [str(cuid.strip()) for cuid in chunk_upload_ids.split(',') if cuid.strip()]
        else:
            raise HTTPException(status_code=404, detail="请提供数据集文件")
        config_dict = {
            **(config_dict or {}),
            "data_source_type": "local_upload",
            "has_uploaded_files": True,
        }

        # 创建数据集记录
        try:
            new_dataset = TrainingDataset(
                name=name,
                description=description,
                project_id=project_id,
                version=version,
                dataset_type=dataset_type.value,
                training_method_type=training_method_type.value,
                dataset_format=dataset_format.value,
                usage=usage.value,
                dataset_config=config_dict,
                metadata_fields=None,
                processing_status=DatasetProcessingStatus.PENDING.value,  # 初始状态：处理中
                publish=DatasetPublishStatus.PROCESSING.value,
                temp_file_path="",  # 记录临时文件路径
                dataset_path="",  # 暂时为空，处理完成后更新
                total_samples=None,
                total_characters=None,
                file_size=None,
                created_id=current_user.userId,
                created_by=current_user.username
            )

            await self.training_dataset_mapper.insert(new_dataset)
            await self.training_dataset_mapper.flush()

            # 保存关联属性值和选项，并获取创建结果供响应使用
            created_attr_values: List = []
            if attr_values:
                created_attr_values = await self.attr_helper.create_attr_values(
                    reference_id=new_dataset.id,
                    attr_values=attr_values,
                    created_id=current_user.userId,
                    created_by=current_user.username,
                    tenant_id=current_user.tenantId,
                )
            await self.training_dataset_mapper.commit()
            await self.training_dataset_mapper.refresh(new_dataset)

        except Exception as e:
            logger.error(f"数据集信息报错数据库失败，操作回退: {str(e)}")
            # 回滚数据库事务
            try:
                await self.training_dataset_mapper.rollback()
            except Exception as rollback_error:
                logger.error(f"回滚事务失败: {str(rollback_error)}")

            # 清理分片上传的文件（如果数据库操作失败，文件已上传但未使用）
            if chunk_upload_ids_list:
                try:
                    for upload_id in chunk_upload_ids_list:
                        try:
                            await self.chunk_upload_service.cleanup_upload_data(upload_id)
                            logger.info(f"已清理分片上传文件: upload_id={upload_id}")
                        except Exception as cleanup_error:
                            logger.error(f"清理分片上传文件失败: upload_id={upload_id}, error={str(cleanup_error)}")
                except Exception as cleanup_error:
                    logger.error(f"清理分片上传文件时发生异常: {str(cleanup_error)}")

            raise HTTPException(status_code=500, detail=f"创建训练数据集失败: {str(e)}")

        # 异步任务执行文件解析逻辑
        try:

            # 异步触发文件处理任务
            try:
                from app.tasks.dataset_processing_tasks import process_dataset_file
                from app.tasks.celery_app import celery_app
                from celery.exceptions import NotRegistered

                # 验证任务是否已注册（预防性检测）
                task_name = 'app.tasks.dataset_processing_tasks.process_dataset_file'
                if task_name not in celery_app.tasks.keys():
                    error_msg = f"Celery任务未注册: {task_name}。请检查Celery worker是否正常运行，任务模块是否正确导入。"
                    logger.error(f"任务未注册: dataset_id={new_dataset.id}, task_name={task_name}")

                    new_dataset.processing_status = DatasetProcessingStatus.FAILED.value
                    new_dataset.publish = DatasetPublishStatus.FAILED.value
                    new_dataset.processing_error = error_msg
                    await self.training_dataset_mapper.commit()

                    raise HTTPException(
                        status_code=500,
                        detail=error_msg
                    )

                # 准备任务参数
                task_args = [new_dataset.id,
                             dataset_type.value,
                             training_method_type.value,
                             dataset_format.value,
                             namespace,
                             name,
                             version,
                             usage.value,
                             chunk_upload_ids_list]

                # 提交任务
                celery_result = process_dataset_file.apply_async(
                    args=task_args,
                    countdown=1  # 延迟1秒执行，确保数据库事务完成
                )

                if not celery_result.id:
                    raise ValueError("Celery任务ID为空，任务可能未成功提交")

                logger.info(f"已触发异步文件处理任务: dataset_id={new_dataset.id}, celery_task_id={celery_result.id}")

            except Exception as e:
                error_msg = f"提交数据集处理任务到Celery队列失败: {str(e)}。"
                logger.error(f"提交任务失败: dataset_id={new_dataset.id}, error={error_msg}", exc_info=True)

                new_dataset.processing_status = DatasetProcessingStatus.FAILED.value
                new_dataset.publish = DatasetPublishStatus.FAILED.value
                new_dataset.processing_error = error_msg
                await self.training_dataset_mapper.commit()

                raise HTTPException(status_code=500, detail=error_msg)

            # 转换为响应模型并返回
            response = TrainingDatasetResponse.model_validate(new_dataset)
            response.created_at = to_local_tz(new_dataset.created_at)
            response.updated_at = to_local_tz(new_dataset.updated_at)

            # 显式设置处理状态和错误信息，确保返回给前端
            response.processing_status = DatasetProcessingStatus(new_dataset.processing_status)
            response.processing_status_display = response.processing_status.description
            response.processing_error = new_dataset.processing_error
            self.set_publish_display(response)

            # 注意：此时文件还在处理中，统计信息为空
            response.file_size_display = "处理中..."

            # 将关联创建的属性值放入响应（直接使用 create 返回的对象，避免额外查询）
            if created_attr_values:
                await self.attr_helper.attach_attr_options(created_attr_values)
                response.attr_values = [
                    BusinessAttrValueResponse.model_validate(av) for av in created_attr_values
                ]
            else:
                response.attr_values = []

            return response

        except Exception as e:
            logger.error(f"创建训练数据集失败: {str(e)}")
            # 若数据集信息已经创建，修改状态为处理失败
            # 注意：如果执行到这里，说明第一个 try-except 已经成功，new_dataset 一定存在
            try:
                new_dataset.processing_status = DatasetProcessingStatus.FAILED.value
                new_dataset.publish = DatasetPublishStatus.FAILED.value
                new_dataset.processing_error = f"创建数据集失败: {str(e)}"
                await self.training_dataset_mapper.commit()
                logger.info(f"已更新数据集状态为失败: dataset_id={new_dataset.id}")
            except Exception as update_error:
                logger.error(f"更新数据集状态失败: dataset_id={new_dataset.id}, error={str(update_error)}")

            raise HTTPException(status_code=500, detail=f"创建训练数据集失败: {str(e)}")

    async def create_dataset_version(
            self,
            current_user: JwtUserInfo,
            name: str,
            project_id: int,
            new_version: str,
            inherit_from_version: bool,
            source_version: Optional[str] = None,
            chunk_upload_ids: Optional[List[str]] = None,
            description: Optional[str] = None,
            dataset_config: Optional[str] = None,
            usage: DatasetUsage = None,
            attr_values: Optional[List[BusinessAttrValueInput]] = None,
    ) -> TrainingDatasetResponse:
        # 解析配置信息
        # 解析dataset_config（如果提供）
        config_dict = {}
        if dataset_config:
            try:
                config_dict = json.loads(dataset_config)
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=400,
                    detail="数据集配置格式错误：必须是有效的JSON字符串"
                )

        # 验证项目是否存在
        project = await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        # 验证数据集名称格式
        try:
            validate_name_format(name, "数据集名称")
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail=str(e)
            )

        # 验证新版本号的唯一性 / 不存在同项目，同版本，同名称，同用途的数据集
        await validate_training_dataset_by_name_version_usage_not_exists(
            await self.training_dataset_mapper.get_session(),
            project.id,
            name,
            new_version,
            usage
        )

        latest_dataset = await self.training_dataset_mapper.query_one(
            select(TrainingDataset).filter(
                TrainingDataset.project_id == project.id,
                TrainingDataset.name == name,
                TrainingDataset.usage == usage
            ).order_by(
                cast(func.replace(TrainingDataset.version, 'V', ''), Integer).desc()
            ).limit(1)
        )
        if not latest_dataset:
            raise HTTPException(status_code=404, detail=f"数据集 '{name}' 不存在")
        active_operation = await self._get_latest_delete_rows_operation(latest_dataset.id, include_failed=False)
        if active_operation:
            raise HTTPException(status_code=400, detail="当前版本有删除任务处理中，请完成后再操作")
        if latest_dataset.processing_status != DatasetProcessingStatus.COMPLETED.value:
            raise HTTPException(status_code=400, detail="最新版本创建成功后才允许新增下一版本")
        if latest_dataset.publish != DatasetPublishStatus.PUBLISHED.value:
            raise HTTPException(status_code=400, detail="最新版本发布后才允许新增下一版本")

        # 获取源版本数据集信息
        source_dataset = await self._get_source_dataset(inherit_from_version, project.id, name, usage, source_version)

        # 生成namespace
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project.id}"

        # 从源版本继承类型信息
        dataset_type = source_dataset.dataset_type
        training_method_type = source_dataset.training_method_type
        dataset_format = source_dataset.dataset_format
        usage = source_dataset.usage

        if dataset_format == DatasetFormat.ALPACA.value and training_method_type != TrainingMethodType.DPO.value:
            raise HTTPException(
                status_code=400,
                detail="alpaca 数据集格式仅支持 dpo 训练方法"
            )

        has_uploaded_files = bool(chunk_upload_ids)

        # 验证文件上传逻辑
        if not inherit_from_version:
            # 上传模式：必须提供chunk_upload_ids
            if chunk_upload_ids is None or len(chunk_upload_ids) == 0:
                raise HTTPException(status_code=400, detail="上传模式下必须提供数据文件")

        source_dataset_dir_path = None
        new_dataset_dir_path = None
        index_source_dataset = None
        new_index_source_dataset = None

        # 处理文件和数据
        if inherit_from_version and source_dataset:
            dataset_path = getattr(source_dataset, "dataset_path", None)
            if not dataset_path:
                raise HTTPException(status_code=400, detail="源版本原始文件不存在，不允许继承")
            total_samples_value = getattr(source_dataset, "total_samples", None) or 0
            if total_samples_value <= 0:
                raise HTTPException(status_code=400, detail="源版本数据量为0，不允许继承")

            # 继承模式：先创建记录并提交异步任务，复制源版本数据不在接口请求内执行
            total_samples = source_dataset.total_samples
            total_characters = source_dataset.total_characters
            file_size_mb = source_dataset.file_size

            # 生成项目命名空间
            new_dataset_path = generate_dataset_path_util(namespace, name, new_version, "jsonl", usage, dataset_type)

            if dataset_type in (TrainingTypeCategory.IMAGE_UNDERSTANDING, TrainingTypeCategory.IMAGE_GENERATION):
                source_dataset_dir_path = generate_image_dataset_directory_path_util(
                    namespace, name, source_version, usage, dataset_type.value
                )
                new_dataset_dir_path = generate_image_dataset_directory_path_util(
                    namespace, name, new_version, usage, dataset_type.value
                )
            else:
                index_source_dataset = get_index_cache_path_util(source_dataset.dataset_path)
                new_index_source_dataset = get_index_cache_path_util(new_dataset_path)

        else:
            # 上传模式：设置默认值（None）
            total_samples = None
            total_characters = None
            file_size_mb = None
            new_dataset_path = ""


        # 先创建新版本的数据集记录
        try:
            # 确定处理状态：文件上传、版本继承都交给 Celery 异步处理
            processing_status = (
                DatasetProcessingStatus.PENDING.value
                if has_uploaded_files or inherit_from_version
                else DatasetProcessingStatus.COMPLETED.value
            )
            config_dict = {
                **(config_dict or {}),
                "data_source_type": "inherit_upload" if inherit_from_version and has_uploaded_files
                else "inherit" if inherit_from_version
                else "local_upload",
                "has_uploaded_files": has_uploaded_files,
            }
            if inherit_from_version and source_version:
                config_dict = {
                    **config_dict,
                    "inherit_source_version": source_version,
                }

            new_dataset = TrainingDataset(
                name=name,
                description=description,
                project_id=project_id,
                version=new_version,
                dataset_type=dataset_type,
                training_method_type=training_method_type,
                dataset_format=dataset_format,
                usage=usage,
                dataset_config=config_dict,
                metadata_fields=(
                    list(source_dataset.metadata_fields)
                    if inherit_from_version and source_dataset.metadata_fields
                    else None
                ),
                total_samples=total_samples,
                total_characters=total_characters,
                file_size=file_size_mb,
                dataset_path=new_dataset_path,
                processing_status=processing_status,
                publish=(
                    DatasetPublishStatus.UNPUBLISHED.value
                    if processing_status == DatasetProcessingStatus.COMPLETED.value
                    else DatasetPublishStatus.PROCESSING.value
                ),
                temp_file_path=None,
                created_id=current_user.userId,
                created_by=current_user.username
            )

            await self.training_dataset_mapper.insert(new_dataset)
            await self.training_dataset_mapper.flush()

            # 保存关联属性值和选项，并获取创建结果供响应使用
            created_attr_values: List = []
            if attr_values:
                created_attr_values = await self.attr_helper.create_attr_values(
                    reference_id=new_dataset.id,
                    attr_values=attr_values,
                    created_id=current_user.userId,
                    created_by=current_user.username,
                    tenant_id=current_user.tenantId,
                )
            await self.training_dataset_mapper.commit()
            await self.training_dataset_mapper.refresh(new_dataset)

        except Exception as e:
            logger.error(f"数据集信息报错数据库失败，操作回退: {str(e)}")
            # 回滚数据库事务
            try:
                await self.training_dataset_mapper.rollback()
            except Exception as rollback_error:
                logger.error(f"回滚事务失败: {str(rollback_error)}")

            # 清理分片上传的文件（如果数据库操作失败，文件已上传但未使用）
            if chunk_upload_ids:
                try:
                    for upload_id in chunk_upload_ids:
                        try:
                            await self.chunk_upload_service.cleanup_upload_data(upload_id)
                            logger.info(f"已清理分片上传文件: upload_id={upload_id}")
                        except Exception as cleanup_error:
                            logger.error(f"清理分片上传文件失败: upload_id={upload_id}, error={str(cleanup_error)}")
                except Exception as cleanup_error:
                    logger.error(f"清理分片上传文件时发生异常: {str(cleanup_error)}")

            raise HTTPException(status_code=500, detail=f"创建训练数据集失败: {str(e)}")

        # 异步处理，解析文件内容
        try:
            # 如果继承源版本，触发异步复制/合并任务，不在接口请求内复制大文件
            if inherit_from_version:
                try:
                    from app.tasks.dataset_processing_tasks import process_dataset_version_inheritance
                    from app.tasks.celery_app import celery_app

                    task_name = 'app.tasks.dataset_processing_tasks.process_dataset_version_inheritance'
                    if task_name not in celery_app.tasks.keys():
                        error_msg = f"Celery任务未注册: {task_name}。请检查Celery worker是否正常运行，任务模块是否正确导入。"
                        logger.error(f"任务未注册: dataset_id={new_dataset.id}, task_name={task_name}")

                        new_dataset.processing_status = DatasetProcessingStatus.FAILED.value
                        new_dataset.publish = DatasetPublishStatus.FAILED.value
                        new_dataset.processing_error = error_msg
                        await self.training_dataset_mapper.commit()

                        raise HTTPException(status_code=500, detail=error_msg)

                    task_args = [
                        new_dataset.id,
                        dataset_type,
                        source_dataset.training_method_type,
                        source_dataset.dataset_format,
                        namespace,
                        name,
                        new_version,
                        usage,
                        source_dataset.dataset_path,
                        new_dataset_path,
                        source_dataset.total_samples or 0,
                        source_dataset.total_characters or 0,
                        source_dataset.file_size,
                        index_source_dataset,
                        new_index_source_dataset,
                        source_dataset_dir_path,
                        new_dataset_dir_path,
                        chunk_upload_ids,
                    ]

                    celery_result = process_dataset_version_inheritance.apply_async(
                        args=task_args,
                        countdown=1
                    )
                    if not celery_result.id:
                        raise ValueError("Celery任务ID为空，任务可能未成功提交")

                    logger.info(
                        f"已触发异步版本继承任务: dataset_id={new_dataset.id}, celery_task_id={celery_result.id}"
                    )

                except Exception as e:
                    error_msg = f"提交数据集版本继承任务到Celery队列失败: {str(e)}。"
                    logger.error(f"提交任务失败: dataset_id={new_dataset.id}, error={error_msg}", exc_info=True)

                    new_dataset.processing_status = DatasetProcessingStatus.FAILED.value
                    new_dataset.publish = DatasetPublishStatus.FAILED.value
                    new_dataset.processing_error = error_msg
                    await self.training_dataset_mapper.commit()

                    raise HTTPException(status_code=500, detail=error_msg)

            # 非继承上传模式：触发异步文件处理任务
            elif has_uploaded_files:
                # 异步触发文件处理任务
                try:
                    from app.tasks.dataset_processing_tasks import process_dataset_file
                    from app.tasks.celery_app import celery_app
                    from celery.exceptions import NotRegistered

                    # 验证任务是否已注册（预防性检测）
                    task_name = 'app.tasks.dataset_processing_tasks.process_dataset_file'
                    if task_name not in celery_app.tasks.keys():
                        error_msg = f"Celery任务未注册: {task_name}。请检查Celery worker是否正常运行，任务模块是否正确导入。"
                        logger.error(f"任务未注册: dataset_id={new_dataset.id}, task_name={task_name}")

                        new_dataset.processing_status = DatasetProcessingStatus.FAILED.value
                        new_dataset.publish = DatasetPublishStatus.FAILED.value
                        new_dataset.processing_error = error_msg
                        await self.training_dataset_mapper.commit()

                        raise HTTPException(
                            status_code=500,
                            detail=error_msg
                        )

                    base_dataset_path = new_dataset_path if inherit_from_version else None

                    # 准备任务参数（顺序须与 process_dataset_file 任务签名一致：dataset_id, dataset_type, dataset_format, namespace, name, version, usage, chunk_upload_ids, base_dataset_path）
                    task_args = [new_dataset.id,
                                 dataset_type,
                                 source_dataset.training_method_type,
                                 source_dataset.dataset_format,
                                 namespace,
                                 name,
                                 new_version,
                                 usage,
                                 chunk_upload_ids,
                                 base_dataset_path]

                    # 提交任务
                    celery_result = process_dataset_file.apply_async(
                        args=task_args,
                        countdown=1  # 延迟1秒执行，确保数据库事务完成
                    )

                    if not celery_result.id:
                        raise ValueError("Celery任务ID为空，任务可能未成功提交")

                    logger.info(
                        f"已触发异步文件处理任务: dataset_id={new_dataset.id}, celery_task_id={celery_result.id}")

                except Exception as e:
                    error_msg = f"提交数据集处理任务到Celery队列失败: {str(e)}。"
                    logger.error(f"提交任务失败: dataset_id={new_dataset.id}, error={error_msg}", exc_info=True)

                    new_dataset.processing_status = DatasetProcessingStatus.FAILED.value
                    new_dataset.publish = DatasetPublishStatus.FAILED.value
                    new_dataset.processing_error = error_msg
                    await self.training_dataset_mapper.commit()

                    raise HTTPException(status_code=500, detail=error_msg)

            # 转换为响应模型
            response = TrainingDatasetResponse.model_validate(new_dataset)
            response.created_at = to_local_tz(new_dataset.created_at)
            response.updated_at = to_local_tz(new_dataset.updated_at)

            # 显式设置处理状态和错误信息，确保返回给前端
            response.processing_status = DatasetProcessingStatus(new_dataset.processing_status)
            response.processing_status_display = response.processing_status.description
            response.processing_error = new_dataset.processing_error
            self.set_publish_display(response)

            # 添加格式化的文件大小显示
            if new_dataset.file_size:
                file_size_bytes = int(new_dataset.file_size * 1024 * 1024)
                response.file_size_display = format_file_size_util(file_size_bytes)
            elif new_dataset.processing_status == DatasetProcessingStatus.PENDING.value:
                # 上传模式且还在处理中
                response.file_size_display = "处理中..."

            inherit_info = f"继承自 {source_version}" if inherit_from_version else "上传新文件"
            if inherit_from_version and has_uploaded_files:
                inherit_info = f"继承自 {source_version} 并合并新上传文件"
            logger.info(f"成功创建数据集版本: {name} v{new_version} (ID: {new_dataset.id}) - {inherit_info}")

            # 将关联创建的属性值放入响应（含 attr_options）
            if created_attr_values:
                await self.attr_helper.attach_attr_options(created_attr_values)
                response.attr_values = [
                    BusinessAttrValueResponse.model_validate(av) for av in created_attr_values
                ]
            else:
                response.attr_values = []

            return response

        except Exception as e:
            logger.error(f"创建数据集版本失败: {str(e)}")
            # 若数据集信息已经创建，修改状态为处理失败
            # 注意：如果执行到这里，说明第一个 try-except 已经成功，new_dataset 一定存在
            try:
                new_dataset.processing_status = DatasetProcessingStatus.FAILED.value
                new_dataset.publish = DatasetPublishStatus.FAILED.value
                new_dataset.processing_error = f"创建数据集版本失败: {str(e)}"
                await self.training_dataset_mapper.commit()
                logger.info(f"已更新数据集版本状态为失败: dataset_id={new_dataset.id}")
            except Exception as update_error:
                logger.error(f"更新数据集版本状态失败: dataset_id={new_dataset.id}, error={str(update_error)}")

            raise HTTPException(status_code=500, detail=f"创建数据集版本失败: {str(e)}")

    async def delete_dataset_all_versions(
            self,
            project_id: int,
            dataset_name: str,
            usage: DatasetUsage,
    ):
        # 验证项目存在
        # 验证项目存在
        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        # 查询该数据集名称下的所有版本
        datasets = await self.training_dataset_mapper.query(
            select(TrainingDataset).where(
                TrainingDataset.project_id == project_id,
                TrainingDataset.name == dataset_name,
                TrainingDataset.usage == usage,
            )
        )


        if not datasets:
            raise HTTPException(
                status_code=404,
                detail=f"项目中不存在名为 '{dataset_name}' 的训练数据集"
            )

        for dataset in datasets:
            active_operation = await self._get_latest_delete_rows_operation(dataset.id, include_failed=False)
            if active_operation:
                raise HTTPException(status_code=400, detail="当前版本有删除任务处理中，请完成后再操作")

        # 校验是否被使用
        for dataset in datasets:
            await self.ensure_dataset_not_referenced(
                project_id, dataset_name, dataset.version, usage, dataset_id=dataset.id
            )

        # 获取项目信息以生成命名空间（用于图像理解数据集的图片文件夹删除）
        project = await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)
        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project.id}"

        # 删除所有版本的文件和数据库记录
        deleted_count = 0
        failed_files = []

        for dataset in datasets:
            try:
                if dataset.dataset_type in (TrainingTypeCategory.IMAGE_UNDERSTANDING, TrainingTypeCategory.IMAGE_GENERATION):
                    # 图像类数据集，删除整个数据集目录
                    try:
                        # 生成数据集目录路径（包含 data.jsonl 和 images 文件夹）
                        dataset_dir_path = generate_image_dataset_directory_path_util(
                            namespace, dataset.name, dataset.version, usage, dataset.dataset_type.value
                        )
                        await self._delete_dataset_directory(dataset_dir_path)
                        logger.info(f"成功删除图像类数据集目录: {dataset_dir_path}")
                    except Exception as e:
                        # 删除目录失败不影响主流程，只记录日志
                        logger.warning(f"删除图像类数据集目录失败 {dataset.name} v{dataset.version}: {str(e)}")
                else:
                    # 文本生成数据集：删除文件
                    # 检查是否存在同名的原始文件，如果存在也一并删除
                    # 判断方法是：查询当前项目下，是否存在与数据集文件同名同版本但不同类型的数据集文件
                    # 首先根据工具包，通过配置信息，生成所有可能的数据集文件名称
                    filenames = generate_filenames_util(dataset.dataset_path)

                    for filename in filenames:
                        # 若存在同版本，同项目且同名但后缀名称不相同的文件
                        # 删除JuiceFS中的文件
                        await self._delete_dataset_file(filename)

                # 删除关联属性值和属性值选项
                business_type_enum = DATASET_USAGE_TO_BUSINESS_TYPE.get(usage.value)
                if business_type_enum:
                    await self.attr_helper.delete_by_reference_ids(
                        reference_ids=[dataset.id],
                        business_type=business_type_enum.value,
                    )

                # 只有文件删除成功后才删除数据库记录
                await self.training_dataset_mapper.delete(dataset)
                deleted_count += 1
                logger.info(f"成功删除数据集: {dataset.name} v{dataset.version}")

            except Exception as e:
                logger.error(f"删除数据集失败 {dataset.name} v{dataset.version}: {str(e)}")
                failed_files.append(f"{dataset.name} v{dataset.version}")
                # 不删除数据库记录，保持数据一致性

        # 提交数据库更改
        await self.training_dataset_mapper.commit()

        if failed_files:
            raise HTTPException(
                status_code=500,
                detail=f"部分数据集删除失败: {', '.join(failed_files)}"
            )

        logger.info(f"成功删除数据集 '{dataset_name}' 的所有 {deleted_count} 个版本")

    async def delete_single_dataset(
            self,
            project_id: int,
            dataset_name: str,
            version: str,
            usage: DatasetUsage,
    ) -> None:
        # 验证项目存在
        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        # 查询数据集，确保属于指定项目、数据集名称和版本
        dataset = await self.training_dataset_mapper.query_one(
            select(TrainingDataset).filter(
                TrainingDataset.project_id == project_id,
                TrainingDataset.name == dataset_name,
                TrainingDataset.version == version,
                TrainingDataset.usage == usage,
            )
        )

        if not dataset:
            raise HTTPException(
                status_code=404,
                detail=f"项目中不存在指定的数据集版本：名称={dataset_name}, 版本={version}"
            )

        active_operation = await self._get_latest_delete_rows_operation(dataset.id, include_failed=False)
        if active_operation:
            raise HTTPException(status_code=400, detail="当前版本有删除任务处理中，请完成后再操作")

        # 校验是否被使用（依赖已解析的 dataset.id）
        await self.ensure_dataset_not_referenced(
            project_id, dataset_name, version, usage, dataset_id=dataset.id
        )

        try:
            if dataset.dataset_type in (TrainingTypeCategory.IMAGE_UNDERSTANDING, TrainingTypeCategory.IMAGE_GENERATION):
                # 图像类数据集，删除整个数据集目录
                try:
                    # 获取项目信息以生成命名空间
                    project = await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)
                    namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project.id}"

                    # 生成数据集目录路径（包含 data.jsonl 和 images 文件夹）
                    dataset_dir_path = generate_image_dataset_directory_path_util(
                        namespace, dataset_name, version, usage, dataset.dataset_type.value
                    )
                    await self._delete_dataset_directory(dataset_dir_path)
                    logger.info(f"成功删除图像类数据集目录: {dataset_dir_path}")
                except Exception as e:
                    # 删除目录失败不影响主流程，只记录日志
                    logger.warning(f"删除图像类数据集目录失败 {dataset_name} v{version}: {str(e)}")
            else:
                # 文本生成数据集：删除文件
                # 检查是否存在同名的原始文件，如果存在也一并删除
                # 判断方法是：查询当前项目下，是否存在与数据集文件同名同版本但不同类型的数据集文件
                # 首先根据工具包，通过配置信息，生成所有可能的数据集文件名称
                filenames = generate_filenames_util(dataset.dataset_path)

                for filename in filenames:
                    # 若存在同版本，同项目且同名但后缀名称不相同的文件
                    # 删除JuiceFS中的文件
                    await self._delete_dataset_file(filename)

            # 删除关联属性值和属性值选项
            business_type_enum = DATASET_USAGE_TO_BUSINESS_TYPE.get(usage.value)
            if business_type_enum:
                await self.attr_helper.delete_by_reference_ids(
                    reference_ids=[dataset.id],
                    business_type=business_type_enum.value,
                )

            # 删除数据库记录
            await self.training_dataset_mapper.delete(dataset)
            await self.training_dataset_mapper.commit()

            logger.info(f"成功删除数据集: {dataset.name} v{dataset.version} (ID: {dataset.id})")

        except Exception as e:
            await self.training_dataset_mapper.rollback()
            logger.error(f"删除数据集失败 {dataset_name} v{version}: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"删除数据集失败: {str(e)}"
            )

    async def preview_dataset_data_optimized(
        self,
        project_id: int,
        name: str,
        version: str,
        page: int,
        size: int,
        usage: DatasetUsage
    ) -> DatasetSamplePageResponse:

        # 验证项目存在
        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        # 查询数据集
        dataset = await self.training_dataset_mapper.query_one(
            select(TrainingDataset).filter(
                TrainingDataset.project_id == project_id,
                TrainingDataset.name == name,
                TrainingDataset.version == version,
                TrainingDataset.usage == usage
            )
        )

        if not dataset:
            raise HTTPException(
                status_code=404,
                detail=f"数据集不存在：项目ID={project_id}, 名称={name}, 版本={version}"
            )

        # 获取JuiceFS客户端
        jfs = await self._get_juicefs_client()

        # 检查文件是否存在
        if not jfs.exists(dataset.dataset_path):
            raise HTTPException(
                status_code=404,
                detail=f"数据集文件不存在: {dataset.dataset_path}"
            )

        try:
            # 使用数据库中存储的样本总数
            total_samples = dataset.total_samples or 0

            if total_samples == 0:
                return DatasetSamplePageResponse(
                    items=[],
                    total=0,
                    page=page,
                    size=size,
                    pages=1,
                    base_url=None
                )

            # 加载或构建行索引（先加载索引，以实际可读行数为准，避免 DB 中 total_samples 与索引不一致时最后一两页为空）
            indices = await load_or_build_index_util(self.executor, jfs, dataset.dataset_path)
            effective_total = min(total_samples, len(indices))
            if effective_total < total_samples:
                logger.warning(
                    f"数据集 {dataset.name} 的 total_samples({total_samples}) 大于索引条数({len(indices)})，以索引条数为准"
                )

            # 计算分页参数
            start_index = (page - 1) * size

            # 如果起始索引超出范围，返回空结果（以 effective_total 为准）
            if start_index >= effective_total:
                return DatasetSamplePageResponse(
                    items=[],
                    total=effective_total,
                    page=page,
                    size=size,
                    pages=(effective_total + size - 1) // size if effective_total > 0 else 1,
                    base_url=None
                )

            # 根据索引读取指定范围的数据
            # 随机访问：直接跳转到目标页的起始位置
            samples = await self._read_lines_by_index(
                jfs,
                dataset.dataset_path,
                indices,
                start_index,
                size
            )

            # 计算总页数（以 effective_total 为准）
            total_pages = (effective_total + size - 1) // size if effective_total > 0 else 1

            # 如果是图像理解数据集，生成 base_url
            base_url = None
            if dataset.dataset_type in (TrainingTypeCategory.IMAGE_UNDERSTANDING, TrainingTypeCategory.IMAGE_GENERATION):
                base_url = await self._build_base_url(project_id, dataset)

            # 返回自定义分页响应模型（包含 base_url）
            return DatasetSamplePageResponse(
                items=samples,
                total=effective_total,
                page=page,
                size=size,
                pages=total_pages,
                base_url=base_url
            )

        except Exception as e:
            logger.error(f"读取数据集文件失败: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"读取数据集文件失败: {str(e)}"
            )

    async def get_metadata_fields(
        self,
        project_id: int,
        dataset_id: int,
    ) -> List[str]:
        """获取训练数据集 JSONL 的元数据字段列表。
        解析文件中的字段（最多读 2 条），再按评估场景追加虚拟字段：
        - role-based：追加 system, prompt, response, model_response
        - alpaca：追加 instruction, input, chosen, rejected
        - 其他格式：仅追加 model_response
        """
        dataset = await self.get_by_id(dataset_id)
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        if dataset.project_id != project_id:
            raise HTTPException(status_code=404, detail="数据集不存在")

        if not dataset.dataset_path:
            raise HTTPException(status_code=404, detail="数据集文件不存在")

        jfs = await self._get_juicefs_client()
        if not jfs.exists(dataset.dataset_path):
            raise HTTPException(status_code=404, detail=f"数据集文件不存在: {dataset.dataset_path}")

        all_fields: set = set()
        sample_count = 0
        max_samples = 2

        with jfs.open(dataset.dataset_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        item_data = json.loads(line)
                        if isinstance(item_data, dict):
                            to_parse = item_data
                        elif isinstance(item_data, list) and item_data and isinstance(item_data[0], dict):
                            to_parse = item_data[0]
                        else:
                            continue
                        self._collect_metadata_fields(to_parse, all_fields)
                        sample_count += 1
                        if sample_count >= max_samples:
                            break
                    except json.JSONDecodeError:
                        continue

        result = sorted(all_fields)
        if dataset.dataset_format == DatasetFormat.ROLE_BASED.value:
            for name in ("system", "prompt", "response", "model_response"):
                if name not in all_fields:
                    result.append(name)
            ordered_fields = ["system", "prompt", "response", "model_response"]
        elif dataset.dataset_format == DatasetFormat.ALPACA.value:
            for name in ("instruction", "input", "chosen", "rejected"):
                if name not in all_fields:
                    result.append(name)
            ordered_fields = ["instruction", "input", "chosen", "rejected"]
        elif dataset.dataset_format == DatasetFormat.GRPO.value:
            for name in ("data_source", "prompt", "reward_model.ground_truth", "extra_info", "model_response"):
                if name not in all_fields:
                    result.append(name)
            ordered_fields = ["data_source", "prompt", "reward_model.ground_truth", "extra_info", "model_response"]
        else:
            if "model_response" not in all_fields:
                result.append("model_response")
            ordered_fields = ["system", "prompt", "response", "model_response"]

        filtered_fields = [field for field in ordered_fields if field in result]
        logger.info(
            f"从训练数据集 {dataset_id} 中提取到 {len(all_fields)} 个字段，追加虚拟字段后共 {len(result)} 个"
        )
        return filtered_fields

    def _collect_metadata_fields(self, data: Dict[str, Any], fields: set, prefix: str = "") -> None:
        """递归收集字典中的所有字段。"""
        for key, value in data.items():
            field_name = f"{prefix}.{key}" if prefix else key
            fields.add(field_name)
            if isinstance(value, dict):
                self._collect_metadata_fields(value, fields, field_name)
            elif isinstance(value, list) and value and isinstance(value[0], dict):
                self._collect_metadata_fields(value[0], fields, field_name)

    async def repair_metadata_fields(
        self,
        force: bool = False,
    ) -> Dict[str, Any]:
        """从历史 dataset JSONL 文件回填 metadata_fields；force=True 时覆盖已有字段。"""
        stmt = select(TrainingDataset).where(
            TrainingDataset.processing_status == DatasetProcessingStatus.COMPLETED.value,
        )
        if not force:
            empty_metadata_fields = or_(
                TrainingDataset.metadata_fields.is_(None),
                cast(TrainingDataset.metadata_fields, String).in_(["[]", "null", ""]),
            )
            stmt = stmt.where(empty_metadata_fields)
        datasets = await self.training_dataset_mapper.query(stmt)

        result = {"total": len(datasets), "repaired": 0, "failed": 0, "failed_items": [], "force": force}
        for dataset in datasets:
            if not force and dataset.metadata_fields:
                continue
            if not dataset.tenant_id:
                message = "数据集 tenant_id 为空，无法定位 JuiceFS 存储"
                logger.warning(f"训练数据集 {dataset.id} {message}，跳过 metadata_fields 修复")
                result["failed"] += 1
                result["failed_items"].append({
                    "dataset_id": dataset.id,
                    "project_id": dataset.project_id,
                    "name": dataset.name,
                    "version": dataset.version,
                    "dataset_path": dataset.dataset_path,
                    "reason_code": "tenant_id_missing",
                    "message": message,
                    "retryable": False,
                })
                continue
            try:
                jfs = await self.storage.JUICEFS_CLIENT(dataset.tenant_id)
            except Exception as exc:
                message = f"获取数据集租户 JuiceFS 客户端失败: tenant_id={dataset.tenant_id}, error={exc}"
                logger.warning(f"训练数据集 {dataset.id} {message}，跳过 metadata_fields 修复")
                result["failed"] += 1
                result["failed_items"].append({
                    "dataset_id": dataset.id,
                    "project_id": dataset.project_id,
                    "name": dataset.name,
                    "version": dataset.version,
                    "dataset_path": dataset.dataset_path,
                    "reason_code": "juicefs_client_error",
                    "message": message,
                    "retryable": True,
                })
                continue
            if not dataset.dataset_path or not jfs.exists(dataset.dataset_path):
                message = f"数据集文件不存在: {dataset.dataset_path or ''}"
                logger.warning(f"训练数据集 {dataset.id} {message}，跳过 metadata_fields 修复")
                result["failed"] += 1
                result["failed_items"].append({
                    "dataset_id": dataset.id,
                    "project_id": dataset.project_id,
                    "name": dataset.name,
                    "version": dataset.version,
                    "dataset_path": dataset.dataset_path,
                    "reason_code": "file_not_found",
                    "message": message,
                    "retryable": False,
                })
                continue
            try:
                with jfs.open(dataset.dataset_path, "r", encoding="utf-8") as dataset_file:
                    collect_result = collect_metadata_fields_from_jsonl_iterable_with_stats(
                        dataset_file,
                        strict=True,
                    )
                if collect_result.total_lines == 0:
                    message = "数据集文件为空或没有有效行"
                    logger.warning(f"训练数据集 {dataset.id} metadata_fields 修复失败: {message}")
                    result["failed"] += 1
                    result["failed_items"].append({
                        "dataset_id": dataset.id,
                        "project_id": dataset.project_id,
                        "name": dataset.name,
                        "version": dataset.version,
                        "dataset_path": dataset.dataset_path,
                        "reason_code": "empty_dataset_file",
                        "message": message,
                        "retryable": False,
                    })
                    continue
                if not collect_result.fields:
                    message = (
                        "未解析到任何 metadata_fields: "
                        f"total_lines={collect_result.total_lines}"
                    )
                    logger.warning(f"训练数据集 {dataset.id} metadata_fields 修复失败: {message}")
                    result["failed"] += 1
                    result["failed_items"].append({
                        "dataset_id": dataset.id,
                        "project_id": dataset.project_id,
                        "name": dataset.name,
                        "version": dataset.version,
                        "dataset_path": dataset.dataset_path,
                        "reason_code": "no_metadata_fields",
                        "message": message,
                        "retryable": False,
                    })
                    continue

                dataset.metadata_fields = collect_result.fields
                await self.training_dataset_mapper.commit()
                result["repaired"] += 1
            except MetadataFieldsJsonlParseError as exc:
                logger.error(f"修复训练数据集 {dataset.id} metadata_fields 失败: {exc}")
                result["failed"] += 1
                result["failed_items"].append({
                    "dataset_id": dataset.id,
                    "project_id": dataset.project_id,
                    "name": dataset.name,
                    "version": dataset.version,
                    "dataset_path": dataset.dataset_path,
                    "reason_code": "invalid_jsonl",
                    "message": str(exc),
                    "retryable": False,
                })
            except Exception as exc:
                logger.error(f"修复训练数据集 {dataset.id} metadata_fields 失败: {exc}", exc_info=True)
                await self.training_dataset_mapper.rollback()
                result["failed"] += 1
                result["failed_items"].append({
                    "dataset_id": dataset.id,
                    "project_id": dataset.project_id,
                    "name": dataset.name,
                    "version": dataset.version,
                    "dataset_path": dataset.dataset_path,
                    "reason_code": "read_or_parse_error",
                    "message": str(exc),
                    "retryable": True,
                })
        return result

    # ------------------------------ 内部辅助方法实现 ------------------------------
    async def _get_source_dataset(
            self,
            inherit_from_version: bool,
            project_id: int,
            dataset_name: str,
            usage: DatasetUsage,
            version: Optional[str] = None
    ) -> TrainingDataset:
        """根据版本号获取源版本数据集信息

        若inherit_from_version为true，代表从源版本号source_version继承信息
        若inherit_from_version为false，代表从最早版本的数据集获取信息

        Args:
            inherit_from_version: 是否继承源数据集
            project_id: 项目id
            dataset_name: 数据集名称
            usage: 数据集用途
            version: 源数据集的版本号
        """

        # 获取源版本信息（用于获取类型信息）
        if inherit_from_version:
            # 继承模式：必须指定源版本
            if not version:
                raise HTTPException(status_code=400, detail="继承模式下必须指定源版本号")

            # 获取需要继承的原始版本的数据集详细
            source_dataset = await self.training_dataset_mapper.query_one(
                select(TrainingDataset).filter(
                    TrainingDataset.project_id == project_id,
                    TrainingDataset.name == dataset_name,
                    TrainingDataset.version == version,
                    TrainingDataset.usage == usage
                )
            )
            if not source_dataset:
                raise HTTPException(
                    status_code=404,
                    detail=f"源版本不存在：数据集 '{dataset_name}' 版本 '{version}'"
                )
        else:
            # 非继承模式：自动选择最早版本获取类型信息
            source_dataset = await self.training_dataset_mapper.query_one(
                select(TrainingDataset).filter(
                    TrainingDataset.project_id == project_id,
                    TrainingDataset.name == dataset_name,
                    TrainingDataset.usage == usage
                ).order_by(TrainingDataset.version.asc()).limit(1)
            )

        if not source_dataset:
            raise HTTPException(
                status_code=404,
                detail=f"源版本不存在：数据集 '{dataset_name}' 版本 '{version}'"
            )

        return source_dataset

    async def _validate_source_dataset_for_inheritance(self, source_dataset: TrainingDataset) -> None:
        """校验源数据集是否满足版本继承条件。"""
        dataset_path = getattr(source_dataset, "dataset_path", None)
        if not dataset_path:
            raise HTTPException(status_code=400, detail="源版本原始文件不存在，不允许继承")

        jfs = await self._get_juicefs_client()
        if not jfs.exists(dataset_path):
            raise HTTPException(status_code=400, detail=f"源版本原始文件不存在: {dataset_path}")

        total_samples = getattr(source_dataset, "total_samples", None) or 0
        if total_samples <= 0:
            raise HTTPException(status_code=400, detail="源版本数据量为0，不允许继承")

    async def _get_juicefs_client(self) -> Any:
        """获取JuiceFS客户端（通过注入的StorageService）"""
        return await self.storage.JUICEFS_CLIENT()

    async def _delete_dataset_file(self, dataset_path: str) -> None:
        jfs = await self._get_juicefs_client()
        if jfs.exists(dataset_path):
            jfs.remove(dataset_path)
            logger.info(f"删除JuiceFS文件: {dataset_path}")
        else:
            logger.warning(f"文件不存在，跳过删除: {dataset_path}")

    async def _delete_dataset_directory(self, directory_path: str) -> None:
        """删除JuiceFS中的目录（递归删除）

        Args:
            directory_path: 目录路径
        """
        jfs = await self._get_juicefs_client()
        if jfs.exists(directory_path):
            jfs.rmr(directory_path)  # 使用 rmr 递归删除目录
            logger.info(f"删除JuiceFS目录: {directory_path}")
        else:
            logger.warning(f"目录不存在，跳过删除: {directory_path}")

    async def _copy_dataset_directory(self, source_dir: str, target_dir: str) -> None:
        """复制JuiceFS中的目录（递归复制）

        Args:
            source_dir: 源目录路径
            target_dir: 目标目录路径
        """
        jfs = await self._get_juicefs_client()

        if not jfs.exists(source_dir):
            logger.warning(f"源目录不存在，跳过复制: {source_dir}")
            return

        try:
            # 确保目标目录的父目录存在
            target_parent = os.path.dirname(target_dir)
            if target_parent and not jfs.exists(target_parent):
                jfs.makedirs(target_parent, exist_ok=True)

            # 创建目标目录
            jfs.makedirs(target_dir, exist_ok=True)

            # 递归复制目录中的所有文件
            def copy_recursive(source: str, target: str):
                """递归复制目录"""
                try:
                    items = jfs.listdir(source)
                except Exception as e:
                    logger.error(f"无法列出目录内容: {source}, 错误: {str(e)}")
                    return

                for item in items:
                    if item == "exports":
                        skipped_path = os.path.join(source, item).replace('\\', '/')
                        logger.info(f"跳过导出缓存目录复制: {skipped_path}")
                        continue

                    source_path = os.path.join(source, item).replace('\\', '/')
                    target_path = os.path.join(target, item).replace('\\', '/')

                    # 先尝试作为目录处理（尝试 listdir）
                    is_directory = False
                    try:
                        jfs.listdir(source_path)
                        is_directory = True
                    except:
                        # listdir 失败，说明是文件
                        is_directory = False

                    if is_directory:
                        # 如果是目录，递归创建并复制
                        try:
                            jfs.listdir(target_path)  # 检查目标目录是否已存在
                        except:
                            jfs.makedirs(target_path, exist_ok=True)
                        copy_recursive(source_path, target_path)
                    else:
                        # 如果是文件，复制文件内容
                        try:
                            with jfs.open(source_path, 'rb') as source_file:
                                file_content = source_file.read()
                            with jfs.open(target_path, 'wb') as target_file:
                                target_file.write(file_content)
                            logger.debug(f"复制文件: {source_path} -> {target_path}")
                        except Exception as file_error:
                            logger.error(f"复制文件失败: {source_path} -> {target_path}, 错误: {str(file_error)}")
                            raise

            copy_recursive(source_dir, target_dir)
            logger.info(f"成功复制目录: {source_dir} -> {target_dir}")

        except Exception as e:
            logger.error(f"复制目录失败: {source_dir} -> {target_dir}, 错误: {str(e)}")
            raise

    async def _validate_image_understanding_upload_image_conflicts(
        self,
        source_image_folder_path: str,
        chunk_upload_ids: Optional[List[str]],
    ) -> None:
        if not chunk_upload_ids:
            return

        jfs = await self._get_juicefs_client()
        for upload_id in chunk_upload_ids:
            upload_file = await self.chunk_upload_service.get_file_by_upload_id(upload_id)
            file_content = await upload_file.read()
            await upload_file.seek(0)
            file_type = upload_file.filename.split('.')[-1].lower()
            try:
                zip_result = await analyze_image_understanding_dataset_file_content(file_content, file_type)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"文件 {upload_file.filename} 解析失败: {str(e)}")

            for image_name, image_content in zip_result.images.items():
                source_image_path = os.path.join(source_image_folder_path, image_name).replace('\\', '/')

                def read_existing_image():
                    if not jfs.exists(source_image_path):
                        return None
                    with jfs.open(source_image_path, 'rb') as existing_image:
                        return existing_image.read()

                existing_content = await asyncio.to_thread(read_existing_image)
                if existing_content is None:
                    continue
                if existing_content != image_content:
                    raise HTTPException(
                        status_code=400,
                        detail=f"图片名 {image_name} 已存在，但是同名图片中新图片和旧图片不一样"
                    )

    async def _read_lines_by_index(
        self,
        jfs,
        dataset_path: str,
        indices: List[LineIndex],
        start_index: int,
        size: int
    ) -> List[DatasetSampleResponse]:
        """
        根据索引读取指定范围的行 - 实现随机访问

        优化原理：
        1. 使用索引直接跳转到目标行的文件偏移量
        2. 并行读取多行数据，减少I/O等待时间
        3. 原方法需要顺序读取所有前面的行

        Args:
            jfs: JuiceFS客户端
            dataset_path: 数据集文件路径
            indices: 行索引列表
            start_index: 起始行索引
            size: 需要读取的行数

        Returns:
            List[DatasetSampleResponse]: 读取的样本列表
        """
        samples = []

        # 确定要读取的索引范围
        end_index = min(start_index + size, len(indices))

        if start_index >= len(indices):
            return samples

        def _read_line_sync(line_idx: LineIndex):
            """同步读取单行的函数，在线程池中执行"""
            try:
                # 读取时，采用二进制读取
                with jfs.open(dataset_path, 'rb') as f:
                    # 直接跳转到指定偏移量
                    f.seek(line_idx.file_offset)
                    line_bytes = f.read(line_idx.line_length)

                    # 解析JSON
                    # 先解码，再清理文本中的换行符号
                    line_str = line_bytes.decode('utf-8', errors='ignore').strip()
                    logger.info(f"读取到第{line_idx.line_number}行，读取长度：{line_idx.line_length}，偏移量：{line_idx.file_offset}:")

                    # 转化为json格式
                    parsed_data = json.loads(line_str)

                    return DatasetSampleResponse(
                        row_number=line_idx.line_number + 1,  # 行号从1开始
                        sample_data=parsed_data
                    )
            except Exception as e:
                logger.warning(f"读取行 {line_idx.line_number + 1} 失败: {str(e)}")
                return None

        # 创建并行读取任务
        read_tasks = []
        loop = asyncio.get_event_loop()

        for i in range(start_index, end_index):
            # 在线程池中执行读取任务
            task = loop.run_in_executor(self.executor, _read_line_sync, indices[i])
            read_tasks.append(task)

        # 并行执行所有读取任务
        results = await asyncio.gather(*read_tasks, return_exceptions=True)

        # 收集有效结果
        for result in results:
            if isinstance(result, Exception):
                logger.warning(f"读取行时发生异常: {str(result)}")
            elif result is not None:
                samples.append(result)

        return samples

    async def _build_base_url(self, project_id: int, dataset: TrainingDataset) -> str:
        # 获取租户ID
        tenant_id = get_tenant_id()

        if tenant_id:
            dataset_path = (dataset.dataset_path or "").replace('\\', '/').strip()
            if not dataset_path:
                logger.warning("数据集文件路径为空，无法生成 base_url")
                return ''

            dataset_dir_path = os.path.dirname(dataset_path).replace('\\', '/').strip('/')
            image_folder_path = f"{dataset_dir_path}/images" if dataset_dir_path else "images"

            # 生成 base_url：{tenant_id}/{图片文件夹路径}/
            # 从 dataset_path 推导，避免数据集改名后用当前 name/version 拼出不存在的旧路径。
            base_url = f"{tenant_id}/{image_folder_path}/"
            logger.debug(f"生成 base_url: {base_url}")

            return base_url
        else:
            logger.warning("无法获取租户ID，跳过 base_url 生成")
            return ''

    async def get_by_id(self, id_field_value):
        return await self.training_dataset_mapper.query_one(select(TrainingDataset).filter(TrainingDataset.id == id_field_value))

    @staticmethod
    def _training_task_json_list_references_dataset(
        items_raw: Any,
        dataset_name: str,
        dataset_version: str,
        dataset_id: Optional[int],
    ) -> bool:
        """
        判断训练任务 JSON 列表是否引用当前待删数据集。

        匹配规则：列表项若含 ``dataset_id`` 则仅与目标主键相等时视为引用；
        否则回退为 ``name`` + ``version`` 与目标一致（兼容历史无 ID 的任务数据）。
        """
        if isinstance(items_raw, str):
            try:
                items_raw = json.loads(items_raw)
            except Exception:
                return False
        if not isinstance(items_raw, list):
            return False
        for item in items_raw:
            if not isinstance(item, dict):
                continue
            iid = item.get("dataset_id")
            if iid is not None:
                if dataset_id is not None and iid == dataset_id:
                    return True
                continue
            if item.get("name") == dataset_name and item.get("version") == dataset_version:
                return True
        return False

    async def _resolve_dataset_id_for_delete_guard(
        self,
        project_id: int,
        dataset_name: str,
        dataset_version: str,
        usage: DatasetUsage,
        dataset_id: Optional[int],
    ) -> Optional[int]:
        """
        解析 ``training_datasets`` 主键，供后续按 ID 做外键类引用检查。

        若调用方已传入 ``dataset_id`` 则直接返回；否则按项目、名称、版本、用途查询一行。
        查无记录时返回 ``None``（仅训练任务侧仍可按 name/version 做字符串级检查）。
        """
        if dataset_id is not None:
            return dataset_id
        row = await self.training_dataset_mapper.execute(
            select(TrainingDataset.id).where(
                TrainingDataset.project_id == project_id,
                TrainingDataset.name == dataset_name,
                TrainingDataset.version == dataset_version,
                TrainingDataset.usage == usage.value,
            )
        )
        return row.scalar_one_or_none()

    # =========== 训练任务引用验证 =========== #
    async def _ensure_not_referenced_by_training_tasks(
        self,
        project_id: int,
        dataset_name: str,
        dataset_version: str,
        dataset_id: Optional[int],
    ) -> None:
        """
        检查当前项目下是否存在训练任务，其 ``dataset_items`` 或 ``eval_dataset_items`` 引用本数据集。

        先对 JSON 文本做子串粗筛以缩小扫描范围，再对每条任务做结构化精确匹配。
        """
        name_str = f'"name": "{dataset_name}"'
        version_str = f'"version": "{dataset_version}"'
        id_str = f'"dataset_id": {dataset_id}' if dataset_id is not None else None

        # 粗筛条件：name/version 同时出现，或序列化后的 dataset_id 出现
        coarse = or_(
            and_(
                cast(TrainingTask.dataset_items, String).contains(name_str),
                cast(TrainingTask.dataset_items, String).contains(version_str),
            ),
            and_(
                cast(TrainingTask.eval_dataset_items, String).contains(name_str),
                cast(TrainingTask.eval_dataset_items, String).contains(version_str),
            ),
        )
        if id_str:
            coarse = or_(
                coarse,
                cast(TrainingTask.dataset_items, String).contains(id_str),
                cast(TrainingTask.eval_dataset_items, String).contains(id_str),
            )

        res = await self.training_dataset_mapper.execute(
            select(TrainingTask.dataset_items, TrainingTask.eval_dataset_items).where(
                TrainingTask.project_id == project_id,
                coarse,
            )
        )
        for dataset_items, eval_dataset_items in res.all():
            if self._training_task_json_list_references_dataset(
                dataset_items, dataset_name, dataset_version, dataset_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="数据集已被训练任务引用，无法删除",
                )
            if self._training_task_json_list_references_dataset(
                eval_dataset_items, dataset_name, dataset_version, dataset_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="数据集已被训练任务评估集配置引用，无法删除",
                )

    # =========== 标注任务引用验证（在线：已提交后可删；多人：已发布后可删）=========== #
    async def _ensure_label_tasks_allow_dataset_delete(
        self, project_id: int, dataset_id: int
    ) -> None:
        """
        训练集被标注数据集引用（来源或提交训练集 ID）时：

        - **在线标注**（``task_type=online``）：须已提交（任务状态为「已完成」或已生成 ``submit_dataset_id``）后才允许删除对应训练集。
        - **多人标注**（``task_type=multi``）：须任务状态为「已发布」后才允许删除。
        """
        online = LabelTaskType.ONLINE.value
        multi = LabelTaskType.MULTI.value
        published = LabelTaskStatus.PUBLISHED.value
        completed = LabelTaskStatus.COMPLETED.value

        # 在线：未完成提交（非 completed 且尚未生成提交训练集）则禁止删除
        ref_online = await self.training_dataset_mapper.execute(
            select(LabelTask.id)
            .join(LabelDataset, LabelTask.label_dataset_id == LabelDataset.id)
            .where(
                LabelDataset.project_id == project_id,
                or_(
                    LabelDataset.source_dataset_id == dataset_id,
                    LabelDataset.submit_dataset_id == dataset_id,
                ),
                LabelTask.task_type == online,
                LabelTask.status != completed,
                LabelDataset.submit_dataset_id.is_(None),
            )
            .limit(1)
        )
        if ref_online.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="数据集存在未完成提交的在线标注任务引用，无法删除",
            )

        # 多人：未发布则禁止删除
        ref_multi = await self.training_dataset_mapper.execute(
            select(LabelTask.id)
            .join(LabelDataset, LabelTask.label_dataset_id == LabelDataset.id)
            .where(
                LabelDataset.project_id == project_id,
                or_(
                    LabelDataset.source_dataset_id == dataset_id,
                    LabelDataset.submit_dataset_id == dataset_id,
                ),
                LabelTask.task_type == multi,
                LabelTask.status != published,
            )
            .limit(1)
        )
        if ref_multi.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="数据集存在未发布的多人标注任务引用，无法删除",
            )

    # =========== 推理结果集引用验证（未到终态则不可删，含未挂评估的纯推理）=========== #
    async def _ensure_not_referenced_by_non_terminal_inference_result_datasets(
        self, project_id: int, dataset_id: int
    ) -> None:
        """
        推理结果集以本训练集为 ``source_dataset_id`` 时，若该推理结果集状态尚未终态，则禁止删除。
        覆盖「仅创建推理结果集、跑推理、未挂评估任务」的场景；终态集合与评估侧一致。
        """
        terminal_statuses = (
            TaskStatus.COMPLETED.value,
            TaskStatus.FAILED.value,
            TaskStatus.TERMINATED.value,
            TaskStatus.CREATION_FAILED.value,
        )
        ref = await self.training_dataset_mapper.execute(
            select(InferenceResultDataset.id)
            .where(
                InferenceResultDataset.project_id == project_id,
                InferenceResultDataset.source_dataset_id == dataset_id,
                InferenceResultDataset.status.notin_(terminal_statuses),
            )
            .limit(1)
        )
        if ref.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="数据集存在未完成的推理任务（推理结果集）引用，无法删除",
            )

    # =========== 评估任务引用验证（未到终态则不可删）=========== #
    async def _ensure_not_referenced_by_running_evaluation_tasks(
        self, project_id: int, dataset_id: int
    ) -> None:
        """
        评估任务关联的推理结果集若来源为本训练集，且评估任务尚未进入终态（已完成/失败/已终止等），则禁止删除。
        """
        terminal_statuses = (
            TaskStatus.COMPLETED.value,
            TaskStatus.FAILED.value,
            TaskStatus.TERMINATED.value,
            TaskStatus.CREATION_FAILED.value,
        )
        ref = await self.training_dataset_mapper.execute(
            select(EvaluationTask.id)
            .join(
                EvaluationTaskDatasetModelRelation,
                EvaluationTaskDatasetModelRelation.evaluation_task_id == EvaluationTask.id,
            )
            .join(
                InferenceResultDataset,
                InferenceResultDataset.id
                == EvaluationTaskDatasetModelRelation.inference_result_dataset_id,
            )
            .where(
                EvaluationTask.project_id == project_id,
                InferenceResultDataset.project_id == project_id,
                InferenceResultDataset.source_dataset_id == dataset_id,
                EvaluationTask.status.notin_(terminal_statuses),
            )
            .limit(1)
        )
        if ref.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="数据集存在未完成的评估任务引用，无法删除",
            )

    # =========== 清洗任务引用验证（进行中则不可删）=========== #
    async def _ensure_not_referenced_by_data_cleaning_tasks(
        self, project_id: int, dataset_id: int
    ) -> None:
        """
        清洗任务处于「进行中」状态且输入或输出为本训练集时禁止删除（与 validators 中进行中状态一致）。
        """
        ref = await self.training_dataset_mapper.execute(
            select(DataCleaningTask.id)
            .where(
                DataCleaningTask.project_id == project_id,
                DataCleaningTask.status.in_(CLEANING_TASK_IN_PROGRESS_STATUSES),
                or_(
                    DataCleaningTask.input_dataset_id == dataset_id,
                    DataCleaningTask.output_dataset_id == dataset_id,
                ),
            )
            .limit(1)
        )
        if ref.first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="数据集存在进行中的清洗任务引用，无法删除",
            )

    # =========== 数据集引用验证入口 =========== #
    async def ensure_dataset_not_referenced(
        self,
        project_id: int,
        dataset_name: str,
        dataset_version: str,
        usage: DatasetUsage,
        *,
        dataset_id: Optional[int] = None,
    ) -> None:
        """
        删除前校验：训练任务 JSON；以及「标注任务（在线须已提交、多人须已发布）/ 进行中清洗 /
        未终态推理结果集（含未挂评估的纯推理）/ 未终态评估」等业务规则。

        若任一路径不满足删除条件则抛出 HTTP 409；通过则正常返回。

        Args:
            project_id: 项目 ID
            dataset_name: 数据集名称
            dataset_version: 版本号
            usage: 数据集用途（训练/验证/测试等），与表字段 ``usage`` 一致
            dataset_id: 可选；若已持有 ``training_datasets.id`` 可传入以避免重复查询

        Note:
            当无法解析到 ``dataset_id`` 时，仅执行训练任务 JSON 侧检查，跳过依赖主键的表。
        """
        # 1. 解析主键（标注 / 评估 / 清洗等依赖 ID）
        resolved_id = await self._resolve_dataset_id_for_delete_guard(
            project_id, dataset_name, dataset_version, usage, dataset_id
        )
        # 2. 训练任务 JSON（dataset_items / eval_dataset_items）
        await self._ensure_not_referenced_by_training_tasks(
            project_id, dataset_name, dataset_version, resolved_id
        )
        if resolved_id is None:
            return
        # 3. 业务规则：标注 / 清洗 / 未终态推理结果集 / 未终态评估（经推理结果集关联）
        await self._ensure_label_tasks_allow_dataset_delete(project_id, resolved_id)
        await self._ensure_not_referenced_by_data_cleaning_tasks(project_id, resolved_id)
        await self._ensure_not_referenced_by_non_terminal_inference_result_datasets(
            project_id, resolved_id
        )
        await self._ensure_not_referenced_by_running_evaluation_tasks(project_id, resolved_id)

    async def get_datasets_by_ids_and_usage(
            self,
            ids: List[int],
            usage: DatasetUsage,
            project_id:int
    ) -> List[TrainingDatasetResponse]:
        """通过 IDs、 usage、project_id 查询数据集列表"""
        if not ids:
            return []

        # 查询数据集
        datasets = await self.training_dataset_mapper.query(
            select(TrainingDataset).filter(
                TrainingDataset.id.in_(ids),
                TrainingDataset.usage == usage,
                TrainingDataset.project_id == project_id
            )
        )

        # 转换为响应模型
        result = []
        for dataset in datasets:
            response = TrainingDatasetResponse.model_validate(dataset)
            result.append(response)

        return result

    async def get_aggregation_stats(
        self,
        project_id: int,
        processing_status: Optional[DatasetProcessingStatus] = None,
        attr_name: Optional[str] = None,
        option_value: Optional[str] = None,
        usage: Optional[List[DatasetUsage]] = None,
        dataset_type: Optional[List[TrainingTypeCategory]] = None,
        training_method_type: Optional[List[TrainingMethodType]] = None,
        dataset_format: Optional[List[DatasetFormat]] = None,
        publish: Optional[List[DatasetPublishStatus]] = None,
    ) -> TrainingDatasetAggregationResponse:
        """聚合统计：按 usage、dataset_format、dataset_type、attr option 分别统计数据量；按数据集 name 去重后统计；支持 processing_status、attr 筛选。

        未传 usage 或 usage 为空列表时：直接返回空统计，不查库。
        传入非空 usage 列表时仅统计所列用途（可多个）。
        未传 dataset_type 时不按数据集类型过滤；传入列表时仅统计所列类型（可多个）。
        未传 training_method_type 时不按训练方法类型过滤；传入列表时仅统计所列方法（可多个）。
        未传 dataset_format 时不按数据格式过滤；传入列表时仅统计所列格式（可多个）。
        """
        if not usage:
            return TrainingDatasetAggregationResponse()

        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        conditions = [
            TrainingDataset.project_id == project_id,
        ]
        if usage:
            conditions.append(TrainingDataset.usage.in_(tuple(u.value for u in usage)))
        if dataset_type:
            conditions.append(
                TrainingDataset.dataset_type.in_(tuple(t.value for t in dataset_type))
            )
        if training_method_type:
            conditions.append(
                TrainingDataset.training_method_type.in_(tuple(t.value for t in training_method_type))
            )
        if dataset_format:
            conditions.append(
                TrainingDataset.dataset_format.in_(tuple(f.value for f in dataset_format))
            )
        if processing_status is not None:
            conditions.append(TrainingDataset.processing_status == processing_status.value)
        if publish:
            conditions.append(TrainingDataset.publish.in_(tuple(p.value for p in publish)))
        if attr_name and option_value:
            attr_exists = (
                select(1)
                .select_from(BusinessAttrValue)
                .join(
                    BusinessAttrValueOption,
                    and_(
                        BusinessAttrValueOption.attr_value_id == BusinessAttrValue.id,
                        BusinessAttrValueOption.reference_id == TrainingDataset.id,
                    ),
                )
                .where(
                    BusinessAttrValue.reference_id == TrainingDataset.id,
                    BusinessAttrValue.name == attr_name,
                    BusinessAttrValueOption.option_value == option_value,
                    BusinessAttrValue.business_type.in_(TRAINING_DATASET_RELATED_BUSINESS_TYPES),
                )
            )
            conditions.append(attr_exists.exists())

        usage_stmt = (
            select(TrainingDataset.usage, func.count(func.distinct(TrainingDataset.name)).label("count"))
            .where(and_(*conditions))
            .group_by(TrainingDataset.usage)
        )
        usage_res = await self.training_dataset_mapper.execute(usage_stmt)
        by_usage = [CountByValueItem(value=row[0], count=row[1]) for row in usage_res.all()]

        format_stmt = (
            select(
                TrainingDataset.dataset_format,
                func.count(func.distinct(TrainingDataset.name)).label("count"),
            )
            .where(and_(*conditions))
            .group_by(TrainingDataset.dataset_format)
        )
        format_res = await self.training_dataset_mapper.execute(format_stmt)
        by_dataset_format = [CountByValueItem(value=row[0], count=row[1]) for row in format_res.all()]
        dataset_format_order = {
            DatasetFormat.PROMPT_RESPONSE.value: 0,
            DatasetFormat.ROLE_BASED.value: 1,
            DatasetFormat.ALPACA.value: 2,
            DatasetFormat.GRPO.value: 3,
        }
        by_dataset_format.sort(
            key=lambda item: (dataset_format_order.get(item.value, len(dataset_format_order)), item.value or "")
        )

        type_stmt = (
            select(
                TrainingDataset.dataset_type,
                func.count(func.distinct(TrainingDataset.name)).label("count"),
            )
            .where(and_(*conditions))
            .group_by(TrainingDataset.dataset_type)
        )
        type_res = await self.training_dataset_mapper.execute(type_stmt)
        by_dataset_type = [CountByValueItem(value=row[0], count=row[1]) for row in type_res.all()]

        # 按属性 name 分组统计；若已按 attr_name+option_value 筛选则不再聚合
        if not (attr_name and option_value):
            option_stmt_orm = (
                select(
                    BusinessAttrValue.name,
                    BusinessAttrValueOption.option_value,
                    func.count(func.distinct(TrainingDataset.name)).label("count"),
                )
                .select_from(TrainingDataset)
                .join(
                    BusinessAttrValue,
                    and_(
                        BusinessAttrValue.reference_id == TrainingDataset.id,
                        BusinessAttrValue.business_type.in_(TRAINING_DATASET_RELATED_BUSINESS_TYPES),
                    ),
                )
                .join(
                    BusinessAttrValueOption,
                    and_(
                        BusinessAttrValueOption.attr_value_id == BusinessAttrValue.id,
                        BusinessAttrValueOption.reference_id == TrainingDataset.id,
                    ),
                )
                .where(and_(*conditions))
                .group_by(BusinessAttrValue.name, BusinessAttrValueOption.option_value)
            )
            option_res = await self.training_dataset_mapper.execute(option_stmt_orm)
            rows = option_res.all()
            from collections import defaultdict
            by_attr: Dict[str, List[CountByValueItem]] = defaultdict(list)
            for row_attr_name, row_option_value, count in rows:
                by_attr[row_attr_name].append(CountByValueItem(value=row_option_value, count=count))
            by_attr_option = [AttrOptionGroupItem(name=an, options=opts) for an, opts in sorted(by_attr.items())]
        else:
            by_attr_option = None

        return TrainingDatasetAggregationResponse(
            usage=by_usage,
            dataset_format=by_dataset_format,
            dataset_type=by_dataset_type,
            attr_option=by_attr_option,
        )


    async def list_training_datasets_by_filters(
                self,
                project_id: int,
                name: Optional[str] = None,
                dataset_type: Optional[TrainingTypeCategory] = None,
                training_method_type: Optional[TrainingMethodType] = None,
                usage: Optional[DatasetUsage] = None,
                page: Optional[int] = None,
                size: Optional[int] = None,
                processing_status: Optional[DatasetProcessingStatus] = None,
                dataset_format: Optional[DatasetFormat] = None,
                publish: Optional[DatasetPublishStatus] = None,
                attr_name: Optional[str] = None,
                option_value: Optional[str] = None,
        ) -> Page[TrainingDatasetSummaryResponse]:
        """按聚合维度过滤的分页列表：按 name 聚合一条摘要（含最新版本状态等）；全量版本由 get_training_dataset_versions 按需拉取。

        未传 usage 或传空字符串时：不查库，直接返回空分页。
        已传 usage 时：未传 dataset_type 时不按数据集类型过滤；未传 dataset_format 时不按数据格式过滤。
        """
        if usage is None:
            p = page if page is not None else 1
            s = size if size is not None else 20
            return Page(items=[], total=0, page=p, size=s, pages=0)

        await validate_project_exists(await self.training_dataset_mapper.get_session(), project_id)

        conditions = [TrainingDataset.project_id == project_id]
        if name:
            conditions.append(TrainingDataset.name.ilike(f"%{name}%"))
        if dataset_type:
            conditions.append(TrainingDataset.dataset_type == dataset_type.value)
        if training_method_type:
            conditions.append(TrainingDataset.training_method_type == training_method_type)
        if usage:
            conditions.append(TrainingDataset.usage == usage.value)
        if dataset_format is not None:
            conditions.append(TrainingDataset.dataset_format == dataset_format.value)
        if publish is not None:
            conditions.append(TrainingDataset.publish == publish.value)
        if attr_name and option_value:
            attr_exists = (
                select(1)
                .select_from(BusinessAttrValue)
                .join(
                    BusinessAttrValueOption,
                    and_(
                        BusinessAttrValueOption.attr_value_id == BusinessAttrValue.id,
                        BusinessAttrValueOption.reference_id == TrainingDataset.id,
                    ),
                )
                .where(
                    BusinessAttrValue.reference_id == TrainingDataset.id,
                    BusinessAttrValue.name == attr_name,
                    BusinessAttrValueOption.option_value == option_value,
                    BusinessAttrValue.business_type.in_(TRAINING_DATASET_RELATED_BUSINESS_TYPES),
                )
            )
            conditions.append(attr_exists.exists())

        subquery = (
            select(
                TrainingDataset.name,
                TrainingDataset.dataset_type,
                TrainingDataset.training_method_type,
                TrainingDataset.dataset_format,
                TrainingDataset.usage,
                TrainingDataset.project_id,
                TrainingDataset.created_by,
                func.row_number().over(
                    partition_by=TrainingDataset.name,
                    order_by=TrainingDataset.created_at
                ).label('rn')
            )
            .where(and_(*conditions))
        ).subquery()

        status_conditions = conditions.copy()
        if processing_status:
            status_conditions.append(TrainingDataset.processing_status == processing_status.value)
        latest_status_subquery = (
            select(
                TrainingDataset.name,
                TrainingDataset.processing_status,
                TrainingDataset.processing_error,
                TrainingDataset.publish,
                func.row_number().over(
                    partition_by=TrainingDataset.name,
                    order_by=cast(func.replace(TrainingDataset.version, 'V', ''), Integer).desc()
                ).label('rn')
            )
            .where(and_(*status_conditions))
        ).subquery()

        query = (
            select(
                func.max(TrainingDataset.id).label('id'),
                TrainingDataset.name.label('dataset_name'),
                func.count(TrainingDataset.id).label('version_count'),
                func.concat('V', cast(func.min(cast(func.replace(TrainingDataset.version, 'V', ''), Integer)), String)).label('earliest_version'),
                func.concat('V', cast(func.max(cast(func.replace(TrainingDataset.version, 'V', ''), Integer)), String)).label('latest_version'),
                func.min(TrainingDataset.created_at).label('created_at'),
                func.max(TrainingDataset.updated_at).label('updated_at'),
                subquery.c.dataset_type,
                subquery.c.training_method_type,
                subquery.c.dataset_format,
                subquery.c.usage,
                subquery.c.project_id,
                subquery.c.created_by,
                latest_status_subquery.c.processing_status,
                latest_status_subquery.c.processing_error,
                latest_status_subquery.c.publish
            )
            .select_from(
                join(TrainingDataset, subquery, and_(TrainingDataset.name == subquery.c.name, subquery.c.rn == 1))
                .join(latest_status_subquery, and_(TrainingDataset.name == latest_status_subquery.c.name, latest_status_subquery.c.rn == 1))
            )
            .where(and_(*conditions))
            .group_by(
                TrainingDataset.name,
                subquery.c.dataset_type,
                subquery.c.training_method_type,
                subquery.c.dataset_format,
                subquery.c.usage,
                subquery.c.project_id,
                subquery.c.created_by,
                latest_status_subquery.c.processing_status,
                latest_status_subquery.c.processing_error,
                latest_status_subquery.c.publish
            )
            .order_by(func.max(TrainingDataset.updated_at).desc())
        )
        page_result = await self.training_dataset_mapper.query_page(query, page, size)

        if hasattr(page_result, 'items') and page_result.items:
            for item in page_result.items:
                if hasattr(item, 'processing_status') and item.processing_status:
                    try:
                        status_enum = DatasetProcessingStatus(item.processing_status)
                        item.processing_status = status_enum
                        item.processing_status_display = status_enum.description
                    except (ValueError, KeyError):
                        item.processing_status = None
                        item.processing_status_display = None
                else:
                    item.processing_status = None
                    item.processing_status_display = None
                self.set_publish_display(item)
        return page_result
