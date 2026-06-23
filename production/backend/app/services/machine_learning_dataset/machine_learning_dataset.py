import json
import os
import re
import urllib.parse
from io import BytesIO
from math import ceil
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, UploadFile, status
from fastapi.params import Depends
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi_pagination import Params, Page
from sqlalchemy import String, cast, func, or_, select

from app.common.status import TaskStatus
from app.core.logging import logger
from app.models.label_manager import LabelMachineLearningDataset, LabelTask
from app.models.models import JwtUserInfo, MachineLearningDataset, Notebook
from app.repository.machine_learning_dataset_mapper import MachineLearningDatasetMapper
from app.schemas.label import LabelTaskBizType, LabelTaskStatus, LabelTaskType
from app.schemas.machine_learning_dataset import (
    MachineLearningDatasetAnnotationType,
    MachineLearningDatasetBasicInfoUpdate,
    MachineLearningDatasetCategory,
    MachineLearningDatasetCreateResponse,
    MachineLearningDatasetDataSource,
    MachineLearningDatasetDataType,
    MachineLearningDatasetDetailResponse,
    MachineLearningDatasetSampleCategory,
    MachineLearningDatasetSampleResponse,
    MachineLearningDatasetResponse,
    MachineLearningDatasetSampleFileType,
    MachineLearningDatasetSourceType,
    MachineLearningDatasetTaskType,
    MachineLearningDatasetTemplateType, TASK_EXPORT_FORMATS, ExportFormat,
)
from app.schemas.notebook import NotebookExtDatasetType, NotebookExtKey
from app.utils.dataset_file_parser import (
    FILE_TYPE_CONFIG,
    collect_metadata_fields_from_jsonl_iterable,
    collect_metadata_fields_from_jsonl_iterable_with_stats,
    MetadataFieldsJsonlParseError,
)
from app.services.chunk_upload.interface import ChunkUploadService
from app.services.storage.interface import StorageService
from app.utils.machine_learning_dataset_parser import parse_machine_learning_dataset_files
from app.utils.name_validator import validate_name_format
from app.utils.storage_enum import StoragePath
from app.utils.timezone_utils import to_local_tz
from app.utils.validators import validate_project_exists, validate_notebook_exists
from app.utils.app_runtime_context import get_tenant_id

from .interface import MachineLearningDatasetService


JSONL_WRITE_BATCH_SIZE = 500


def _write_jsonl_bytes_in_batches(file_obj, content: bytes, batch_size: int = JSONL_WRITE_BATCH_SIZE) -> None:
    """按固定条数批量写入 JSONL，避免 JuiceFS 单次写入超大 buffer。"""
    if not content:
        return

    content_length = len(content)
    batch_start = 0
    search_start = 0
    lines_in_batch = 0

    while search_start < content_length:
        newline_index = content.find(b"\n", search_start)
        if newline_index == -1:
            lines_in_batch += 1
            break

        lines_in_batch += 1
        search_start = newline_index + 1
        if lines_in_batch >= batch_size:
            file_obj.write(content[batch_start:search_start])
            batch_start = search_start
            lines_in_batch = 0

    if batch_start < content_length:
        file_obj.write(content[batch_start:])


def _copy_jsonl_file_in_batches(jfs, source_path: str, target_path: str, batch_size: int = JSONL_WRITE_BATCH_SIZE) -> None:
    """按固定条数从 JuiceFS 源 JSONL 复制到目标 JSONL。"""
    with jfs.open(source_path, "rb") as src:
        with jfs.open(target_path, "wb") as dst:
            batch_lines = []
            while True:
                line = src.readline()
                if not line:
                    break
                batch_lines.append(line)
                if len(batch_lines) >= batch_size:
                    dst.write(b"".join(batch_lines))
                    batch_lines = []
            if batch_lines:
                dst.write(b"".join(batch_lines))


def _build_machine_learning_dataset_base_url(dataset: MachineLearningDataset) -> Optional[str]:
    """
    供详情接口返回：{tenant_id}/{storage_path}/dataset_{dataset_id}/
    storage_path 已以 dataset_{id} 结尾时不重复拼接。
    """
    tenant_id = get_tenant_id()
    if not tenant_id:
        return None
    sp = (dataset.storage_path or "").replace("\\", "/").strip().strip("/")
    if not sp:
        return None
    dataset_dir = f"dataset_{dataset.id}"
    segments = [s for s in sp.split("/") if s]
    if segments and segments[-1] == dataset_dir:
        rel = "/".join(segments)
    else:
        rel = f"{sp}/{dataset_dir}".replace("//", "/")
    return f"{tenant_id}/{rel}/"


def _collect_metadata_fields_from_jsonl_bytes(content: bytes) -> List[str]:
    """从规范化后的机器学习 dataset.jsonl bytes 中收集字段。"""
    text = content.decode("utf-8")
    return collect_metadata_fields_from_jsonl_iterable(text.splitlines())


def _format_allowed_extensions(data_type: MachineLearningDatasetDataType) -> str:
    """返回某数据类型支持的样例格式说明，用于错误提示。"""
    allowed = MachineLearningDatasetSampleCategory.get_allowed_file_types(data_type)
    return "、".join(ft.value for ft in allowed) if allowed else "无"

def _format_not_annotated_allowed_extensions(template_type: MachineLearningDatasetTemplateType) -> str:
    """返回某模板类型支持的无标注样例格式说明，用于错误提示。"""
    allowed = MachineLearningDatasetSampleCategory.get_allowed_not_annotated_file_types(template_type.value)
    return "、".join(ft.value for ft in allowed) if allowed else "无"


class DefaultMachineLearningDatasetService(MachineLearningDatasetService):
    def __init__(
        self,
        machine_learning_dataset_mapper: MachineLearningDatasetMapper,
        storage: StorageService,
        chunk_upload_service: ChunkUploadService,
    ) -> None:
        super().__init__(machine_learning_dataset_mapper, storage, chunk_upload_service)

    async def get_file_by_jfs_path(self, file_path: str) -> UploadFile:
        """从 JFS 路径读取单个文件并封装为 UploadFile。"""
        jfs = await self.storage.JUICEFS_CLIENT()
        path = (file_path or "").strip().replace("\\", "/")
        if not path:
            raise HTTPException(status_code=400, detail="notebook_path 不能为空")
        if not jfs.exists(path):
            raise HTTPException(status_code=404, detail=f"JFS 文件不存在: {path}")
        with jfs.open(path, "rb") as f:
            content = f.read()
        return UploadFile(filename=os.path.basename(path), file=BytesIO(content))

    def build_notebook_jfs_path(
        self,
        project_id: int,
        notebook_id: int,
        notebook_path: str,
    ) -> str:
        """给前端上传的 notebook 文件路径补上 JFS 前缀。"""
        project_name = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
        base_path = StoragePath.NOTEBOOK_WORK.format_storage_path(
            project_name=project_name,
            instance_name=f"notebook-{notebook_id}"
        )
        return base_path.rstrip("/") + "/" + notebook_path.lstrip("/")

    async def create_dataset_with_file(
        self,
        current_user: JwtUserInfo,
        name: str,
        project_id: int,
        chunk_upload_ids: Optional[str],
        data_type: Optional[MachineLearningDatasetDataType],
        annotation_type: Optional[MachineLearningDatasetAnnotationType],
        template_type: Optional[MachineLearningDatasetTemplateType],
        is_annotated: bool = True,
        version: str = "V1",
        inherit_from_version: bool = False,
        source_version: Optional[str] = None,
        description: Optional[str] = None,
        data_source: Optional[MachineLearningDatasetDataSource] = None,
        notebook_id: Optional[int] = None,
        notebook_name: Optional[str] = None,
        notebook_path: Optional[str] = None,
    ) -> MachineLearningDatasetCreateResponse:
        """创建机器学习数据集：上传解析 或 从已有版本继承（复制文件与元信息）。"""
        logger.info(f"机器学习数据集创建来源: {data_source}")
        session = await self.machine_learning_dataset_mapper.get_session()
        await validate_project_exists(session, project_id)
        try:
            validate_name_format(name, "机器学习数据集名称")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        existing = await self.machine_learning_dataset_mapper.query_one(
            select(MachineLearningDataset).filter(
                MachineLearningDataset.project_id == project_id,
                MachineLearningDataset.name == name,
                MachineLearningDataset.version == version,
            )
        )
        if existing:
            raise HTTPException(status_code=400, detail="同项目下已存在同名同版本的机器学习数据集")

        if inherit_from_version:
            return await self._create_dataset_by_inherit(
                current_user, name, project_id, chunk_upload_ids, version, source_version, description,
                data_source=data_source, notebook_id=notebook_id, notebook_name=notebook_name,
                notebook_path=notebook_path,
            )
        return await self._create_dataset_by_upload(
            current_user, name, project_id, chunk_upload_ids, data_type, annotation_type, template_type,
           is_annotated, version, description, data_source=data_source, notebook_id=notebook_id,
            notebook_name=notebook_name, notebook_path=notebook_path,
        )

    async def _create_dataset_by_inherit(
        self,
        current_user: JwtUserInfo,
        name: str,
        project_id: int,
        chunk_upload_ids: Optional[str],
        version: str,
        source_version: Optional[str],
        description: Optional[str],
        data_source: Optional[MachineLearningDatasetDataSource] = None,
        notebook_id: Optional[int] = None,
        notebook_name: Optional[str] = None,
        notebook_path: Optional[str] = None,
    ) -> MachineLearningDatasetCreateResponse:
        """继承模式：从源版本复制数据，支持在继承时追加同类型的新文件。"""
        if not source_version or not source_version.strip():
            raise HTTPException(status_code=400, detail="继承模式下必须指定源版本号")
        source = await self.machine_learning_dataset_mapper.query_one(
            select(MachineLearningDataset).filter(
                MachineLearningDataset.project_id == project_id,
                MachineLearningDataset.name == name,
                MachineLearningDataset.version == source_version.strip(),
            )
        )
        if not source:
            raise HTTPException(status_code=404, detail=f"源版本不存在：数据集 '{name}' 版本 '{source_version}'")
        if not source.dataset_path:
            raise HTTPException(status_code=400, detail="源版本数据集文件路径无效，无法继承")
        jfs = await self.storage.JUICEFS_CLIENT()
        if not jfs.exists(source.dataset_path):
            raise HTTPException(status_code=404, detail="源版本 dataset.jsonl 不存在，无法继承")

        upload_ids = [x.strip() for x in (chunk_upload_ids or "").split(",") if x.strip()]
        use_notebook_paths = data_source == MachineLearningDatasetDataSource.NOTEBOOK_FETCH
        append_from_notebook = use_notebook_paths and bool(notebook_path)
        if upload_ids and append_from_notebook:
            raise HTTPException(status_code=400, detail="继承追加文件时，上传文件和 notebook 文件不能同时指定")

        parse_result = None
        asset_files: Dict[str, bytes] = {}
        merged_dataset_jsonl_content = None
        merged_sample_count = source.sample_count or 0
        effective_label_schema = self._read_label_schema(jfs, source)

        if upload_ids or append_from_notebook:
            if append_from_notebook:
                if not notebook_id:
                    raise HTTPException(status_code=400, detail="notebook 数据来源时，notebook_id 必传且不能为空")
                if not notebook_path:
                    raise HTTPException(status_code=400, detail="notebook 数据来源时，notebook_path 必传且不能为空")
                if not notebook_name:
                    raise HTTPException(status_code=400, detail="notebook 数据来源时，notebook_name 不能为空")
                await validate_notebook_exists(await self.machine_learning_dataset_mapper.get_session(), notebook_id)
                jfs_path = self.build_notebook_jfs_path(project_id, notebook_id, notebook_path)
                files = [await self.get_file_by_jfs_path(jfs_path)]
            else:
                files = [await self.chunk_upload_service.get_file_by_upload_id(uid) for uid in upload_ids]

            parse_result, asset_files = await parse_machine_learning_dataset_files(
                files=files,
                data_type=source.data_type,
                annotation_type=source.annotation_type,
                template_type=source.template_type,
                is_annotated=bool(source.is_annotated),
                inherited_label_schema=effective_label_schema,
                version=version,
            )
            effective_label_schema = self._merge_inherited_label_schema(effective_label_schema, parse_result.label_schema)
            if source.data_type in (MachineLearningDatasetDataType.IMAGE, MachineLearningDatasetDataType.IMAGE.value):
                self._validate_asset_name_conflicts(jfs, source.storage_path, asset_files)
            source_dataset_jsonl_content = self._read_jfs_bytes(jfs, source.dataset_path)
            self._validate_sample_id_conflicts(source_dataset_jsonl_content, parse_result.dataset_jsonl_content)
            merged_dataset_jsonl_content = self._merge_dataset_jsonl_content(
                source_dataset_jsonl_content,
                parse_result.dataset_jsonl_content,
            )
            merged_sample_count = source.sample_count + parse_result.sample_count
        if merged_dataset_jsonl_content is not None:
            metadata_fields = _collect_metadata_fields_from_jsonl_bytes(merged_dataset_jsonl_content)
        else:
            metadata_fields = list(source.metadata_fields) if source.metadata_fields else None

        dataset = MachineLearningDataset(
            name=name,
            description=description if description is not None else source.description,
            project_id=project_id,
            version=version,
            dataset_category=source.dataset_category,
            task_type=source.task_type,
            data_type=source.data_type,
            data_source=source.data_source,
            notebook_id=source.notebook_id,
            notebook_name=source.notebook_name,
            notebook_path=source.notebook_path,
            annotation_type=source.annotation_type,
            template_type=source.template_type,
            is_annotated=source.is_annotated,
            source_type=source.source_type,
            storage_path="",
            dataset_path="",
            label_schema_path=None,
            metadata_fields=metadata_fields,
            sample_count=merged_sample_count,
            file_size=(len(merged_dataset_jsonl_content) / (1024 * 1024)) if merged_dataset_jsonl_content is not None else source.file_size,
            created_id=current_user.userId,
            created_by=current_user.username,
        )
        new_storage = ""
        try:
            await self.machine_learning_dataset_mapper.insert(dataset)
            await self.machine_learning_dataset_mapper.flush()
            await self.machine_learning_dataset_mapper.refresh(dataset)
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
            new_storage = StoragePath.REGISTERED_MACHINE_LEARNING_DATASETS.format_storage_path(namespace=namespace, dataset_id=dataset.id)
            new_storage = new_storage.rstrip("/") + "/"
            self._copy_ml_storage(jfs, source.storage_path.rstrip("/") + "/", new_storage)
            if merged_dataset_jsonl_content is not None:
                with jfs.open(new_storage + "dataset.jsonl", "wb") as f:
                    _write_jsonl_bytes_in_batches(f, merged_dataset_jsonl_content)
                if asset_files:
                    assets_path = new_storage + "assets/"
                    if not jfs.exists(assets_path):
                        jfs.makedirs(assets_path, exist_ok=True)
                    for filename, content in asset_files.items():
                        with jfs.open(assets_path + filename, "wb") as f:
                            f.write(content)
                if effective_label_schema is not None:
                    with jfs.open(new_storage + "classname.json", "w", encoding="utf-8") as f:
                        f.write(json.dumps(effective_label_schema, ensure_ascii=False, indent=2))
                dataset.source_type = MachineLearningDatasetSourceType.MIXED.value
            dataset.storage_path = new_storage
            dataset.dataset_path = f"{new_storage}dataset.jsonl"
            dataset.label_schema_path = f"{new_storage}classname.json" if effective_label_schema is not None else None
            await self.machine_learning_dataset_mapper.commit()
            await self.machine_learning_dataset_mapper.refresh(dataset)
        except HTTPException:
            await self.machine_learning_dataset_mapper.rollback()
            if new_storage and jfs.exists(new_storage):
                try:
                    jfs.rmr(new_storage)
                except Exception:
                    pass
            raise
        except Exception as exc:
            await self.machine_learning_dataset_mapper.rollback()
            if new_storage and jfs.exists(new_storage):
                try:
                    jfs.rmr(new_storage)
                except Exception:
                    pass
            raise HTTPException(status_code=500, detail=f"继承创建数据集失败: {str(exc)}") from exc
        finally:
            for upload_id in upload_ids:
                try:
                    await self.chunk_upload_service.cleanup_upload_data(upload_id)
                except Exception:
                    pass
        logger.info(f"用户 {current_user.userId} 在项目 {project_id} 中继承创建机器学习数据集: {name} v{version} 自 v{source_version}")
        response = MachineLearningDatasetCreateResponse.model_validate(dataset)
        response.created_at = to_local_tz(dataset.created_at)
        response.updated_at = to_local_tz(dataset.updated_at)
        return response

    def _read_jfs_bytes(self, jfs, path: str) -> bytes:
        with jfs.open(path, "rb") as f:
            return f.read()

    def _read_label_schema(self, jfs, dataset: MachineLearningDataset) -> Optional[Dict[str, str]]:
        schema_path = dataset.label_schema_path
        if not schema_path and dataset.storage_path:
            candidate = dataset.storage_path.rstrip("/") + "/classname.json"
            schema_path = candidate if jfs.exists(candidate) else None
        if not schema_path or not jfs.exists(schema_path):
            return None
        try:
            with jfs.open(schema_path, "r", encoding="utf-8") as f:
                schema = json.loads(f.read() or "{}")
        except Exception as exc:
            raise HTTPException(status_code=400, detail="源版本 classname.json 解析失败，无法继承追加文件") from exc
        if not isinstance(schema, dict):
            raise HTTPException(status_code=400, detail="源版本 classname.json 格式错误，无法继承追加文件")
        return {str(k): str(v) for k, v in schema.items()}

    def _merge_inherited_label_schema(
        self,
        source_schema: Optional[Dict[str, str]],
        new_schema: Optional[Dict[str, str]],
    ) -> Optional[Dict[str, str]]:
        if source_schema is None:
            return new_schema
        if new_schema is None:
            return source_schema

        merged_schema = dict(source_schema)
        for class_id, class_name in new_schema.items():
            if class_id in merged_schema and merged_schema[class_id] != class_name:
                raise HTTPException(
                    status_code=400,
                    detail=f"继承追加文件的类别映射与源版本冲突: class_id={class_id}，源类型: {merged_schema[class_id]}，追加类型：{class_name}",
                )
            merged_schema[class_id] = class_name
        return merged_schema

    def _validate_asset_name_conflicts(self, jfs, source_storage_path: str, asset_files: Dict[str, bytes]) -> None:
        if not asset_files or not source_storage_path:
            return
        source_assets_path = source_storage_path.rstrip("/") + "/assets/"
        if not jfs.exists(source_assets_path):
            return
        for filename, content in asset_files.items():
            source_asset_path = source_assets_path + filename
            if jfs.exists(source_asset_path) and self._read_jfs_bytes(jfs, source_asset_path) != content:
                raise HTTPException(status_code=400, detail=f"继承版本中已存在同名图片但内容不同: {filename}")

    def _validate_sample_id_conflicts(self, source_content: bytes, new_content: bytes) -> None:
        source_ids = set()
        for line in source_content.decode("utf-8").splitlines():
            if not line.strip():
                continue
            try:
                sample = json.loads(line)
            except json.JSONDecodeError:
                continue
            sample_id = sample.get("sample_id") if isinstance(sample, dict) else None
            if sample_id:
                source_ids.add(str(sample_id))
        for line in new_content.decode("utf-8").splitlines():
            if not line.strip():
                continue
            sample = json.loads(line)
            sample_id = sample.get("sample_id") if isinstance(sample, dict) else None
            if sample_id and str(sample_id) in source_ids:
                raise HTTPException(status_code=400, detail=f"继承追加文件中存在与源版本重复的 sample_id: {sample_id}")

    def _merge_dataset_jsonl_content(self, source_content: bytes, new_content: bytes) -> bytes:
        source_text = source_content.decode("utf-8").strip()
        new_text = new_content.decode("utf-8").strip()
        merged = "\n".join(part for part in [source_text, new_text] if part)
        return (merged + "\n").encode("utf-8") if merged else b""

    def _copy_ml_storage(self, jfs, source_dir: str, target_dir: str) -> None:
        """将源目录下的 dataset.jsonl、assets/、classname.json 复制到目标目录。"""
        if not jfs.exists(target_dir):
            jfs.makedirs(target_dir, exist_ok=True)
        src_jsonl = source_dir + "dataset.jsonl"
        if jfs.exists(src_jsonl):
            _copy_jsonl_file_in_batches(jfs, src_jsonl, target_dir + "dataset.jsonl")
        src_assets = source_dir + "assets/"
        if jfs.exists(src_assets):
            self._jfs_copy_dir(jfs, src_assets, target_dir + "assets/")
        src_schema = source_dir + "classname.json"
        if jfs.exists(src_schema):
            with jfs.open(src_schema, "rb") as f:
                content = f.read()
            with jfs.open(target_dir + "classname.json", "wb") as f:
                f.write(content)

    def _jfs_copy_dir(self, jfs, src_dir: str, target_dir: str) -> None:
        """递归复制 JuiceFS 目录。"""
        jfs.makedirs(target_dir, exist_ok=True)
        for item in jfs.listdir(src_dir):
            src_path = (src_dir.rstrip("/") + "/" + item).replace("\\", "/")
            tgt_path = (target_dir.rstrip("/") + "/" + item).replace("\\", "/")
            try:
                jfs.listdir(src_path)
                self._jfs_copy_dir(jfs, src_path + "/", tgt_path + "/")
            except Exception:
                with jfs.open(src_path, "rb") as f:
                    data = f.read()
                with jfs.open(tgt_path, "wb") as f:
                    f.write(data)

    async def _delete_dataset_files(self, dataset: MachineLearningDataset) -> None:
        """删除该数据集在 JFS 上的存储目录，失败仅打日志不抛错。"""
        if not dataset or not getattr(dataset, "storage_path", None):
            return
        try:
            jfs = await self.storage.JUICEFS_CLIENT()
            path = (dataset.storage_path or "").rstrip("/")
            if path and jfs.exists(path):
                jfs.rmr(path)
        except Exception as e:
            logger.warning("删除机器学习数据集 JFS 目录失败 dataset_id=%s path=%s: %s", getattr(dataset, "id", None), getattr(dataset, "storage_path", ""), e)

    async def _delete_dataset_record(self, dataset: MachineLearningDataset) -> None:
        """从数据库删除该数据集记录（不提交，由调用方 commit）。"""
        await self.machine_learning_dataset_mapper.delete(dataset)

    async def _create_dataset_by_upload(
        self,
        current_user: JwtUserInfo,
        name: str,
        project_id: int,
        chunk_upload_ids: Optional[str],
        data_type: Optional[MachineLearningDatasetDataType],
        annotation_type: Optional[MachineLearningDatasetAnnotationType],
        template_type: Optional[MachineLearningDatasetTemplateType],
        is_annotated: bool,
        version: str,
        description: Optional[str],
        data_source: Optional[MachineLearningDatasetDataSource] = None,
        notebook_id: Optional[int] = None,
        notebook_name: Optional[str] = None,
        notebook_path: Optional[str] = None,
    ) -> MachineLearningDatasetCreateResponse:
        """上传模式：解析上传文件并写入存储。"""
        upload_ids = [x.strip() for x in (chunk_upload_ids or "").split(",") if x.strip()]
        # 校验 notebook 来源数据
        use_notebook_paths = data_source == MachineLearningDatasetDataSource.NOTEBOOK_FETCH
        if use_notebook_paths:
            if not notebook_id:
                raise HTTPException(status_code=400, detail="notebook 数据来源时，notebook_id 必传且不能为空")
            if not notebook_path:
                raise HTTPException(status_code=400, detail="notebook 数据来源时，notebook_path 必传且不能为空")
            if not notebook_name:
                raise HTTPException(status_code=400, detail="notebook 数据来源时，notebook_name 不能为空")
            await validate_notebook_exists(await self.machine_learning_dataset_mapper.get_session(), notebook_id)
            jfs_path = self.build_notebook_jfs_path(project_id, notebook_id, notebook_path)


        if not upload_ids and data_source == MachineLearningDatasetDataSource.LOCAL_UPLOAD:
            raise HTTPException(status_code=400, detail="请提供上传文件")
        if not data_type or not annotation_type or not template_type:
            raise HTTPException(status_code=400, detail="上传模式下必须指定数据类型、标注类型与标注模板")
        cleanup_upload_ids = list(upload_ids)
        jfs = await self.storage.JUICEFS_CLIENT()
        dataset = None
        try:
            if use_notebook_paths:
                files = [await self.get_file_by_jfs_path(jfs_path)]
            else:
                files = [await self.chunk_upload_service.get_file_by_upload_id(uid) for uid in upload_ids]
            parse_result, asset_files = await parse_machine_learning_dataset_files(
                files=files,
                data_type=data_type,
                annotation_type=annotation_type,
                template_type=template_type,
                is_annotated=is_annotated,
            )
            metadata_fields = _collect_metadata_fields_from_jsonl_bytes(parse_result.dataset_jsonl_content)
            dataset = MachineLearningDataset(
                name=name,
                description=description,
                project_id=project_id,
                version=version,
                dataset_category=MachineLearningDatasetCategory.MACHINE_LEARNING.value,
                task_type=parse_result.task_type,
                data_type=data_type,
                data_source=data_source,
                notebook_id=notebook_id,
                notebook_name=notebook_name,
                notebook_path=notebook_path,
                annotation_type=annotation_type,
                template_type=template_type,
                is_annotated=is_annotated,
                source_type=MachineLearningDatasetSourceType(parse_result.source_type).value
                if parse_result.source_type in MachineLearningDatasetSourceType._value2member_map_
                else MachineLearningDatasetSourceType.MIXED.value,
                storage_path="",
                dataset_path="",
                label_schema_path=None,
                metadata_fields=metadata_fields,
                sample_count=parse_result.sample_count,
                file_size=len(parse_result.dataset_jsonl_content) / (1024 * 1024),
                created_id=current_user.userId,
                created_by=current_user.username,
            )
            await self.machine_learning_dataset_mapper.insert(dataset)
            await self.machine_learning_dataset_mapper.flush()
            await self.machine_learning_dataset_mapper.refresh(dataset)
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project_id}"
            storage_path = StoragePath.REGISTERED_MACHINE_LEARNING_DATASETS.format_storage_path(namespace=namespace, dataset_id=dataset.id)
            storage_path = storage_path.rstrip("/") + "/"
            dataset_path = storage_path + "dataset.jsonl"
            assets_path = storage_path + "assets/"
            label_schema_path = storage_path + "classname.json"
            if not jfs.exists(storage_path):
                jfs.makedirs(storage_path, exist_ok=True)
            with jfs.open(dataset_path, "wb") as f:
                _write_jsonl_bytes_in_batches(f, parse_result.dataset_jsonl_content)
            if asset_files:
                if not jfs.exists(assets_path):
                    jfs.makedirs(assets_path, exist_ok=True)
                for filename, content in asset_files.items():
                    with jfs.open(assets_path + filename, "wb") as f:
                        f.write(content)
            if parse_result.label_schema is not None:
                with jfs.open(label_schema_path, "w", encoding="utf-8") as f:
                    f.write(json.dumps(parse_result.label_schema, ensure_ascii=False, indent=2))
                dataset.label_schema_path = label_schema_path
            dataset.storage_path = storage_path
            dataset.dataset_path = dataset_path
            await self.machine_learning_dataset_mapper.commit()
            await self.machine_learning_dataset_mapper.refresh(dataset)
        except HTTPException:
            await self.machine_learning_dataset_mapper.rollback()
            if dataset and getattr(dataset, "storage_path", None) and jfs.exists(dataset.storage_path):
                try:
                    jfs.rmr(dataset.storage_path)
                except Exception:
                    pass
            raise
        except Exception as exc:
            await self.machine_learning_dataset_mapper.rollback()
            if dataset and getattr(dataset, "storage_path", None) and jfs.exists(dataset.storage_path):
                try:
                    jfs.rmr(dataset.storage_path)
                except Exception:
                    pass
            raise HTTPException(status_code=500, detail=f"创建机器学习数据集失败: {str(exc)}") from exc
        finally:
            for upload_id in cleanup_upload_ids:
                try:
                    await self.chunk_upload_service.cleanup_upload_data(upload_id)
                except Exception:
                    pass
        response = MachineLearningDatasetCreateResponse.model_validate(dataset)
        response.created_at = to_local_tz(dataset.created_at)
        response.updated_at = to_local_tz(dataset.updated_at)
        return response

    def _validate_sample_file_type_supported(
        self,
        data_type: MachineLearningDatasetDataType,
        template_type: MachineLearningDatasetTemplateType,
        file_type: MachineLearningDatasetSampleFileType,
        is_annotated: bool = True,
    ) -> None:
        """根据枚举配置判断当前数据类型是否支持所请求的样例格式，不支持则抛出 HTTPException。"""
        if is_annotated:
            if not MachineLearningDatasetSampleCategory.is_file_type_supported(data_type, file_type):
                raise HTTPException(
                    status_code=400,
                    detail=f"数据类型 {data_type.value} 的样例仅支持 {_format_allowed_extensions(data_type)} 格式",
                )
        else:
            if not MachineLearningDatasetSampleCategory.is_not_annotated_file_type_supported(template_type.value, file_type):
                raise HTTPException(
                    status_code=400,
                    detail=f"数据类型 {template_type.value} 的无标注样例仅支持 {_format_not_annotated_allowed_extensions(template_type)} 格式",
                )

    def get_sample_dataset_path(
        self,
        data_type: MachineLearningDatasetDataType,
        template_type: MachineLearningDatasetTemplateType,
        file_type: MachineLearningDatasetSampleFileType,
        is_annotated: bool = True,
    ) -> str:
        """解析样例文件路径（支持文本、图像类型；支持格式由枚举 MachineLearningDatasetSampleCategory 配置）。"""
        self._validate_sample_file_type_supported(data_type, template_type, file_type, is_annotated)
        category = None
        if is_annotated:
            category = MachineLearningDatasetSampleCategory.get_by_template_type(template_type.value)
        else:
            category = MachineLearningDatasetSampleCategory.get_not_annotated_by_template_type(template_type.value)
        if not category:
            raise HTTPException(
                status_code=400,
                detail=f"暂无模板 {template_type.value} 的样例数据集",
            )
        if category.data_type != data_type:
            raise HTTPException(
                status_code=400,
                detail=f"模板 {template_type.value} 与数据类型 {data_type.value} 不匹配",
            )
        current_dir = os.path.dirname(os.path.abspath(__file__))
        api_dir = os.path.dirname(current_dir)
        app_dir = os.path.dirname(api_dir)
        base_sample_dir = os.path.join(app_dir, "sample_datasets", "machine_learning")
        sample_path = os.path.normpath(os.path.join(base_sample_dir, f"{category.file_prefix}.{file_type.value}"))
        if not os.path.exists(sample_path):
            raise HTTPException(status_code=404, detail=f"样例文件缺失: {sample_path}")
        return sample_path

    async def download_sample_dataset(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        data_type: MachineLearningDatasetDataType,
        template_type: MachineLearningDatasetTemplateType,
        file_type: MachineLearningDatasetSampleFileType,
        is_annotated: bool = True,
    ) -> FileResponse:
        """下载机器学习样例数据集（仿 training_dataset 的 download_sample_dataset）。"""
        await validate_project_exists(await self.machine_learning_dataset_mapper.get_session(), project_id)
        try:
            category = None
            sample_path = self.get_sample_dataset_path(data_type, template_type, file_type,is_annotated)

            if is_annotated:
                category = MachineLearningDatasetSampleCategory.get_by_template_type(template_type.value)
            else:
                category = MachineLearningDatasetSampleCategory.get_not_annotated_by_template_type(template_type.value)

            download_name_cn = category.description if category else ""
            suffix = f".{file_type.value}"
            download_filename = f"{download_name_cn}{suffix}"

            ext_key = (suffix or "").strip().lstrip(".").lower()
            media_type = FILE_TYPE_CONFIG.get(ext_key, FILE_TYPE_CONFIG["jsonl"])["media_type"]

            filename_utf8 = urllib.parse.quote(download_filename)
            logger.info(f"用户 {current_user.userId} 在项目 {project_id} 中下载机器学习样例: {sample_path}")
            return FileResponse(
                path=sample_path,
                filename=download_filename,
                media_type=media_type,
                headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_utf8}"},
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"下载机器学习样例数据集失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"下载样例数据集失败: {str(e)}") from e

    async def download_dataset(
        self,
        current_user: JwtUserInfo,
        project_id: int,
        dataset_id: int,
        export_format: ExportFormat
    ) -> StreamingResponse | JSONResponse:
        """下载已创建的机器学习数据集；所有格式均走异步缓存导出。"""
        await validate_project_exists(await self.machine_learning_dataset_mapper.get_session(), project_id)
        dataset = await self.machine_learning_dataset_mapper.query_one(
            select(MachineLearningDataset).filter(
                MachineLearningDataset.id == dataset_id,
                MachineLearningDataset.project_id == project_id,
            )
        )
        if not dataset:
            raise HTTPException(status_code=404, detail="机器学习数据集不存在")
        if not dataset.template_type:
            raise HTTPException(status_code=400, detail="数据集缺少 template_type，无法导出")
        try:
            template_type = MachineLearningDatasetTemplateType(dataset.template_type)
            get_export_format_or_raise(template_type, export_format)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        jfs = await self.storage.JUICEFS_CLIENT()
        if not dataset.dataset_path or not jfs.exists(dataset.dataset_path):
            raise HTTPException(status_code=404, detail="数据集文件不存在")

        storage_path = dataset.storage_path.rstrip("/") + "/"
        assets_path = storage_path + "assets/"
        safe_name = re.sub(r'[^\w\s\u4e00-\u9fff-]', "_", dataset.name or "dataset").strip() or "dataset"

        def _stream_jfs_file(path: str, chunk_size: int = 64 * 1024):
            with jfs.open(path, "rb") as src:
                while True:
                    chunk = src.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk

        if export_format != ExportFormat.PLATFORM and not dataset.is_annotated:
            raise HTTPException(status_code=400, detail="无标注数据集无法导出训练格式")

        from app.tasks.machine_learning_dataset_export_tasks import build_ml_dataset_export_cache

        export_root = f"{storage_path}exports/{export_format.value}/"
        meta_path = f"{export_root}meta.json"
        default_artifact_ext = "zip"
        default_artifact_path = f"{export_root}export.{default_artifact_ext}"

        meta = None
        if jfs.exists(meta_path):
            try:
                with jfs.open(meta_path, "r", encoding="utf-8") as f:
                    parsed = json.loads(f.read() or "{}")
                    if isinstance(parsed, dict):
                        meta = parsed
            except Exception as meta_read_err:
                logger.warning(
                    "读取机器学习导出缓存元信息失败 dataset_id=%s format=%s: %s",
                    dataset_id, export_format.value, meta_read_err
                )

        if meta and meta.get("status") == "success":
            artifact_path = str(meta.get("artifact_path") or default_artifact_path)
            if jfs.exists(artifact_path):
                suffix = os.path.splitext(artifact_path)[1].lstrip(".").lower() or default_artifact_ext
                media_type = FILE_TYPE_CONFIG.get(suffix, FILE_TYPE_CONFIG["zip"])["media_type"]
                download_filename = (
                    f"{safe_name}_{dataset.version or 'V1'}_{export_format.value}.{suffix}"
                )
                filename_utf8 = urllib.parse.quote(download_filename)
                return StreamingResponse(
                    _stream_jfs_file(artifact_path),
                    media_type=media_type,
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_utf8}"},
                )

        if meta and meta.get("status") == "processing":
            return JSONResponse(
                status_code=202,
                content={
                    "status": "processing",
                    "task_id": meta.get("task_id"),
                    "dataset_id": dataset_id,
                    "export_format": export_format.value,
                    "message": "导出任务处理中，请稍后重试下载",
                },
            )

        tenant_id = get_tenant_id()
        celery_result = build_ml_dataset_export_cache.apply_async(kwargs={
            "tenant_id": tenant_id,
            "dataset_id": dataset_id,
            "project_id": project_id,
            "template_type": template_type.value,
            "export_format": export_format.value,
            "dataset_path": dataset.dataset_path,
            "storage_path": storage_path,
            "label_schema_path": dataset.label_schema_path,
        })
        return JSONResponse(
            status_code=202,
            content={
                "status": "processing",
                "task_id": celery_result.id,
                "dataset_id": dataset_id,
                "export_format": export_format.value,
                "message": "已提交异步导出任务，请稍后重试下载",
            },
        )

    async def list_datasets(
        self,
        project_id: int,
        params: Params = Depends(),
        name: Optional[str] = None,
        task_type: Optional[MachineLearningDatasetTaskType] = None,
        template_type: Optional[MachineLearningDatasetTemplateType] = None,
        is_annotated: Optional[bool] = None
    ) -> Page[MachineLearningDatasetResponse]:
        """分页查询机器学习数据集列表；同一名称多版本时仅返回最新版本（按 id 最大）。"""
        # 子查询：每个 (project_id, name) 取最新版本的 id（id 最大即最新）
        subq = (
            select(func.max(MachineLearningDataset.id))
            .where(MachineLearningDataset.project_id == project_id)
            .group_by(MachineLearningDataset.name)
        )
        if name:
            subq = subq.where(MachineLearningDataset.name.like(f"%{name.strip()}%"))
        if task_type:
            subq = subq.where(MachineLearningDataset.task_type == task_type.value)
        if template_type:
            subq = subq.where(MachineLearningDataset.template_type == template_type.value)
        if is_annotated is not None:
            subq = subq.where(MachineLearningDataset.is_annotated == is_annotated)
        base_query = (
            select(MachineLearningDataset)
            .where(
                MachineLearningDataset.project_id == project_id,
                MachineLearningDataset.id.in_(subq),
            )
            .order_by(MachineLearningDataset.updated_at.desc())
        )
        return await self.machine_learning_dataset_mapper.query_page(
            base_query,
            page=params.page,
            page_size=params.size,
        )

    async def get_dataset_versions(
        self,
        project_id: int,
        dataset_id: int,
        is_annotated: Optional[bool] = None
    ) -> List[MachineLearningDatasetResponse]:
        """根据数据集 id 获取该数据集（同名）下的所有版本列表，按创建时间倒序。"""
        await validate_project_exists(await self.machine_learning_dataset_mapper.get_session(), project_id)
        ref = await self.machine_learning_dataset_mapper.query_one(
            select(MachineLearningDataset).filter(
                MachineLearningDataset.id == dataset_id,
                MachineLearningDataset.project_id == project_id,
            )
        )
        if not ref:
            raise HTTPException(status_code=404, detail="机器学习数据集不存在")
        stmt = select(MachineLearningDataset).filter(
            MachineLearningDataset.project_id == project_id,
            MachineLearningDataset.name == ref.name,
        ).order_by(MachineLearningDataset.created_at.desc())

        if is_annotated is not None:
            stmt = stmt.filter(MachineLearningDataset.is_annotated == is_annotated)
        datasets = await self.machine_learning_dataset_mapper.query(stmt)
        result = []
        for d in datasets:
            resp = MachineLearningDatasetResponse.model_validate(d)
            resp.created_at = to_local_tz(d.created_at)
            resp.updated_at = to_local_tz(d.updated_at)
            result.append(resp)
        return result

    async def update_dataset_basic_info(
        self,
        project_id: int,
        dataset_id: int,
        update_data: MachineLearningDatasetBasicInfoUpdate,
    ) -> bool:
        """编辑机器学习数据集名称和描述。"""
        await validate_project_exists(await self.machine_learning_dataset_mapper.get_session(), project_id)
        target_dataset = await self.machine_learning_dataset_mapper.query_one(
            select(MachineLearningDataset).where(
                MachineLearningDataset.id == dataset_id,
                MachineLearningDataset.project_id == project_id,
            )
        )
        if not target_dataset:
            raise HTTPException(status_code=404, detail="机器学习数据集不存在")

        old_name = target_dataset.name
        if update_data.name is not None:
            try:
                validate_name_format(update_data.name, "数据集名称")
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

            if update_data.name != old_name:
                exists_datasets = await self.machine_learning_dataset_mapper.query(
                    select(MachineLearningDataset).where(
                        MachineLearningDataset.project_id == project_id,
                        MachineLearningDataset.name == update_data.name,
                    ).limit(1)
                )
                if exists_datasets:
                    raise HTTPException(status_code=400, detail=f"项目中已存在名为 '{update_data.name}' 的机器学习数据集")

                same_name_datasets = await self.machine_learning_dataset_mapper.query(
                    select(MachineLearningDataset).where(
                        MachineLearningDataset.project_id == project_id,
                        MachineLearningDataset.name == old_name,
                    )
                )
                for dataset in same_name_datasets:
                    dataset.name = update_data.name

        if "description" in update_data.model_fields_set:
            target_dataset.description = update_data.description

        await self.machine_learning_dataset_mapper.commit()
        return True

    async def delete_dataset(self, project_id: int, dataset_id: int) -> None:
        """根据数据集 id 删除单条记录及其 JFS 上的文件。"""
        await validate_project_exists(await self.machine_learning_dataset_mapper.get_session(), project_id)
        dataset = await self.machine_learning_dataset_mapper.query_one(
            select(MachineLearningDataset).filter(
                MachineLearningDataset.id == dataset_id,
                MachineLearningDataset.project_id == project_id,
            )
        )
        if not dataset:
            raise HTTPException(status_code=404, detail="机器学习数据集不存在")
        await self.ensure_dataset_not_referenced(project_id, dataset_id)
        await self._delete_dataset_files(dataset)
        await self._delete_dataset_record(dataset)
        await self.machine_learning_dataset_mapper.commit()

    async def delete_dataset_all_versions(self, project_id: int, dataset_id: int) -> None:
        """根据数据集 id 查到同名所有版本，依次删除每条记录及对应 JFS 文件。"""
        await validate_project_exists(await self.machine_learning_dataset_mapper.get_session(), project_id)
        ref = await self.machine_learning_dataset_mapper.query_one(
            select(MachineLearningDataset).filter(
                MachineLearningDataset.id == dataset_id,
                MachineLearningDataset.project_id == project_id,
            )
        )
        if not ref:
            raise HTTPException(status_code=404, detail="机器学习数据集不存在")
        datasets = await self.machine_learning_dataset_mapper.query(
            select(MachineLearningDataset).filter(
                MachineLearningDataset.project_id == project_id,
                MachineLearningDataset.name == ref.name,
            )
        )
        for d in datasets:
            await self.ensure_dataset_not_referenced(project_id, d.id)
        for d in datasets:
            await self._delete_dataset_files(d)
            await self._delete_dataset_record(d)
        await self.machine_learning_dataset_mapper.commit()

    async def ensure_dataset_not_referenced(self, project_id: int, dataset_id: int) -> None:
        """
        删除前校验机器学习数据集引用。

        机器学习数据集当前会被 ML 标注任务和 Notebook 的
        ``ext.dataset.machine_learning_dataset`` 引用；清洗任务表只引用训练数据集。
        """
        await self._ensure_label_tasks_allow_dataset_delete(project_id, dataset_id)
        await self._ensure_not_referenced_by_non_terminal_notebooks(project_id, dataset_id)

    async def _ensure_label_tasks_allow_dataset_delete(self, project_id: int, dataset_id: int) -> None:
        """
        ML 标注任务引用规则：
        - 在线标注：已完成或已生成 submit_dataset_id 后允许删除。
        - 多人标注：已发布后允许删除。
        """
        online = LabelTaskType.ONLINE.value
        multi = LabelTaskType.MULTI.value
        completed = LabelTaskStatus.COMPLETED.value
        published = LabelTaskStatus.PUBLISHED.value

        ref_online = await self.machine_learning_dataset_mapper.execute(
            select(LabelTask.id, LabelMachineLearningDataset.name)
            .join(LabelMachineLearningDataset, LabelTask.label_dataset_id == LabelMachineLearningDataset.id)
            .where(
                LabelTask.biz_type == LabelTaskBizType.MACHINE_LEARNING.value,
                LabelMachineLearningDataset.project_id == project_id,
                or_(
                    LabelMachineLearningDataset.source_dataset_id == dataset_id,
                    LabelMachineLearningDataset.submit_dataset_id == dataset_id,
                ),
                LabelTask.task_type == online,
                LabelTask.status != completed,
                LabelMachineLearningDataset.submit_dataset_id.is_(None),
            )
            .limit(1)
        )
        online_row = ref_online.first()
        if online_row:
            task_id, task_name = online_row
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"机器学习数据集存在未完成提交的在线标注任务引用，无法删除：{task_name or task_id}",
            )

        ref_multi = await self.machine_learning_dataset_mapper.execute(
            select(LabelTask.id, LabelMachineLearningDataset.name)
            .join(LabelMachineLearningDataset, LabelTask.label_dataset_id == LabelMachineLearningDataset.id)
            .where(
                LabelTask.biz_type == LabelTaskBizType.MACHINE_LEARNING.value,
                LabelMachineLearningDataset.project_id == project_id,
                or_(
                    LabelMachineLearningDataset.source_dataset_id == dataset_id,
                    LabelMachineLearningDataset.submit_dataset_id == dataset_id,
                ),
                LabelTask.task_type == multi,
                LabelTask.status != published,
            )
            .limit(1)
        )
        multi_row = ref_multi.first()
        if multi_row:
            task_id, task_name = multi_row
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"机器学习数据集存在未发布的多人标注任务引用，无法删除：{task_name or task_id}",
            )

    async def _ensure_not_referenced_by_non_terminal_notebooks(self, project_id: int, dataset_id: int) -> None:
        """Notebook 未进入终态时，如果挂载了该 ML 数据集则禁止删除。"""
        terminal_statuses = (
            TaskStatus.COMPLETED.value,
            TaskStatus.FAILED.value,
            TaskStatus.TERMINATED.value,
            TaskStatus.CREATION_FAILED.value,
        )
        notebooks = await self.machine_learning_dataset_mapper.query(
            select(Notebook).where(
                Notebook.project_id == project_id,
                Notebook.status.notin_(terminal_statuses),
            )
        )
        for notebook in notebooks:
            if self._notebook_references_machine_learning_dataset(notebook.ext, dataset_id):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"机器学习数据集存在未结束的 Notebook 引用，无法删除：{notebook.instance_name or notebook.id}",
                )

    @staticmethod
    def _notebook_references_machine_learning_dataset(ext: Optional[Dict[str, Any]], dataset_id: int) -> bool:
        if not isinstance(ext, dict):
            return False
        dataset_block = ext.get(NotebookExtKey.DATASET.value) or {}
        if not isinstance(dataset_block, dict):
            return False
        items = dataset_block.get(NotebookExtDatasetType.MACHINE_LEARNING_DATASET.value) or []
        if not isinstance(items, list):
            return False

        for item in items:
            raw_dataset_id = item.get("dataset_id") if isinstance(item, dict) else item
            try:
                if int(raw_dataset_id) == dataset_id:
                    return True
            except (TypeError, ValueError):
                continue
        return False

    async def get_dataset_detail(
        self,
        project_id: int,
        dataset_id: int,
        page: int = 1,
        size: int = 20,
    ) -> MachineLearningDatasetDetailResponse:
        """查询数据集详情，并按行分页读取 dataset.jsonl。"""
        if page < 1 or size < 1:
            raise HTTPException(status_code=400, detail="page 和 size 必须大于 0")

        dataset = await self.machine_learning_dataset_mapper.query_one(
            select(MachineLearningDataset).filter(
                MachineLearningDataset.id == dataset_id,
                MachineLearningDataset.project_id == project_id,
            )
        )
        if not dataset:
            raise HTTPException(status_code=404, detail="机器学习数据集不存在")

        jfs = await self.storage.JUICEFS_CLIENT()
        if not dataset.dataset_path or not jfs.exists(dataset.dataset_path):
            raise HTTPException(status_code=404, detail="dataset.jsonl 文件不存在")

        total_samples = dataset.sample_count or 0
        start_index = (page - 1) * size
        end_index = start_index + size
        label_schema = None

        items = []
        current_row = 0
        with jfs.open(dataset.dataset_path, "r", encoding="utf-8") as dataset_file:
            for line in dataset_file:
                stripped = line.strip()
                if not stripped:
                    continue

                if current_row < start_index:
                    current_row += 1
                    continue
                if current_row >= end_index:
                    break

                try:
                    sample = json.loads(stripped)
                    # 掩码实例分割模板：将存储的 RLE 格式标注逐条转换为前端 polygon_with_holes 格式
                    if dataset.template_type == MachineLearningDatasetTemplateType.INSTANCE_SEGMENTATION_MASK.value:
                        try:
                            from app.utils.segmentation_codec import storage_annotations_to_frontend
                            h = sample.get("height") or (sample.get("data") or {}).get("height")
                            w = sample.get("width") or (sample.get("data") or {}).get("width")
                            ann_list = sample.get("annotations")
                            if isinstance(ann_list, list) and ann_list and isinstance(h, int) and isinstance(w, int):
                                converted = []
                                for ann in ann_list:
                                    seg = ann.get("segmentation") if isinstance(ann, dict) else None
                                    if isinstance(seg, dict) and seg.get("type") == "rle":
                                        result = storage_annotations_to_frontend([ann], h, w)
                                        converted.append(result[0] if result else ann)
                                    else:
                                        converted.append(ann)
                                sample = {**sample, "annotations": converted}
                        except Exception as e:
                            logger.warning(f"数据集详情掩码标注格式转换失败: row={current_row + 1}, error={e}")
                    items.append(
                        MachineLearningDatasetSampleResponse(
                            row_number=current_row + 1,
                            sample_data=sample,
                        )
                    )
                except json.JSONDecodeError:
                    # 跳过损坏行，行号继续递增，保证分页游标稳定
                    pass
                current_row += 1

        # 读取 classname.json 内容用于前端展示类型映射
        if dataset.label_schema_path and jfs.exists(dataset.label_schema_path):
            try:
                with jfs.open(dataset.label_schema_path, "r", encoding="utf-8") as schema_file:
                    schema_content = schema_file.read().strip()
                    if schema_content:
                        parsed_schema = json.loads(schema_content)
                        if isinstance(parsed_schema, dict):
                            label_schema = {str(k): str(v) for k, v in parsed_schema.items()}
            except Exception:
                label_schema = None

        pages = ceil(total_samples / size) if total_samples > 0 else 1
        base_url = _build_machine_learning_dataset_base_url(dataset)
        return MachineLearningDatasetDetailResponse(
            id=dataset.id,
            name=dataset.name,
            description=dataset.description,
            project_id=dataset.project_id,
            version=dataset.version,
            dataset_category=dataset.dataset_category,
            task_type=dataset.task_type,
            data_type=dataset.data_type,
            annotation_type=dataset.annotation_type,
            template_type=dataset.template_type,
            is_annotated=dataset.is_annotated,
            source_type=dataset.source_type,
            storage_path=dataset.storage_path,
            dataset_path=dataset.dataset_path,
            label_schema_path=dataset.label_schema_path,
            metadata_fields=dataset.metadata_fields,
            sample_count=dataset.sample_count,
            file_size=dataset.file_size,
            created_at=to_local_tz(dataset.created_at),
            updated_at=to_local_tz(dataset.updated_at),
            created_by=dataset.created_by,
            base_url=base_url,
            label_schema=label_schema,
            items=items,
            total=total_samples,
            page=page,
            size=size,
            pages=pages,
        )

    async def repair_metadata_fields(
        self,
    ) -> Dict[str, Any]:
        """从历史机器学习 dataset.jsonl 文件回填空的 metadata_fields。"""
        empty_metadata_fields = or_(
            MachineLearningDataset.metadata_fields.is_(None),
            cast(MachineLearningDataset.metadata_fields, String).in_(["[]", "null", ""]),
        )
        stmt = select(MachineLearningDataset).where(empty_metadata_fields)
        datasets = await self.machine_learning_dataset_mapper.query(stmt)

        jfs = await self.storage.JUICEFS_CLIENT()
        result = {"total": len(datasets), "repaired": 0, "failed": 0, "failed_items": []}
        for dataset in datasets:
            if dataset.metadata_fields:
                continue
            if not dataset.dataset_path or not jfs.exists(dataset.dataset_path):
                message = f"数据集文件不存在: {dataset.dataset_path or ''}"
                logger.warning(f"机器学习数据集 {dataset.id} {message}，跳过 metadata_fields 修复")
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
                    logger.warning(f"机器学习数据集 {dataset.id} metadata_fields 修复失败: {message}")
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
                    logger.warning(f"机器学习数据集 {dataset.id} metadata_fields 修复失败: {message}")
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
                await self.machine_learning_dataset_mapper.commit()
                result["repaired"] += 1
            except MetadataFieldsJsonlParseError as exc:
                logger.error(f"修复机器学习数据集 {dataset.id} metadata_fields 失败: {exc}")
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
                logger.error(f"修复机器学习数据集 {dataset.id} metadata_fields 失败: {exc}", exc_info=True)
                await self.machine_learning_dataset_mapper.rollback()
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

    async def get_metadata_fields(
        self,
        project_id: int,
        dataset_id: int,
    ) -> List[str]:
        """获取机器学习数据集字段元数据列表，直接读取 metadata_fields。"""
        dataset = await self.machine_learning_dataset_mapper.query_one(
            select(MachineLearningDataset).filter(
                MachineLearningDataset.id == dataset_id,
                MachineLearningDataset.project_id == project_id,
            )
        )
        if not dataset:
            raise HTTPException(status_code=404, detail="机器学习数据集不存在")

        raw_fields = dataset.metadata_fields or []
        if not isinstance(raw_fields, list):
            logger.warning(f"机器学习数据集 {dataset_id} 的 metadata_fields 不是列表，已按空列表处理")
            return []
        return sorted({field for field in raw_fields if isinstance(field, str) and field})

def get_supported_formats(task_type: MachineLearningDatasetTemplateType) -> list[ExportFormat]:
    """获取任务支持的导出格式"""
    return TASK_EXPORT_FORMATS.get(task_type, [])


def validate_export_format(
    task_type: MachineLearningDatasetTemplateType,
    export_format: ExportFormat
) -> bool:
    """验证导出格式是否被任务支持"""
    return export_format in get_supported_formats(task_type)


def get_export_format_or_raise(
    task_type: MachineLearningDatasetTemplateType,
    export_format: ExportFormat
) -> ExportFormat:
    """验证并返回导出格式，不支持则抛出异常"""
    if not validate_export_format(task_type, export_format):
        supported = [f.value for f in get_supported_formats(task_type)]
        raise ValueError(
            f"数据集模板类型 '{task_type.value}' 不支持格式 '{export_format.value}'，"
            f"支持的格式: {supported}"
        )
    return export_format
