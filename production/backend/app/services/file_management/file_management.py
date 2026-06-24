import os
import asyncio
import tempfile
import zipfile
from typing import Optional, List
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from fastapi_pagination import Page

from app.core.logging import logger
from app.models import FileFolder, FileManagementFile, ChunkUploadSession
from app.models.models import JwtUserInfo
from app.repository.file_folder_mapper import FileFolderMapper
from app.repository.file_management_file_mapper import FileManagementFileMapper
from app.repository.chunk_upload_mapper import ChunkUploadMapper
from app.repository.chunk_upload_record_mapper import ChunkUploadRecordMapper
from app.services.file_management.interface import FileManagementService
from app.services.storage.interface import StorageService
from app.services.chunk_upload.interface import ChunkUploadService
from app.schemas.file_management import (
    FileFolderCreate,
    FileFolderUpdate,
    FileFolderResponse,
    FileManagementFileResponse
)
from app.utils.app_runtime_context import get_tenant_id
from app.utils.validators import validate_project_exists
from app.utils.http_util import build_content_disposition_header


class DefaultFileManagementService(FileManagementService):
    """文件管理服务实现类"""
    
    def __init__(
        self,
        folder_mapper: FileFolderMapper,
        file_mapper: FileManagementFileMapper,
        chunk_upload_mapper: ChunkUploadMapper,
        chunk_upload_record_mapper: ChunkUploadRecordMapper,
        storage: StorageService,
        chunk_upload_service: ChunkUploadService
    ) -> None:
        super().__init__(storage)
        self.folder_mapper = folder_mapper
        self.file_mapper = file_mapper
        self.chunk_upload_mapper = chunk_upload_mapper
        self.chunk_upload_record_mapper = chunk_upload_record_mapper
        self.chunk_upload_service = chunk_upload_service
    
    def _parse_folder_from_base_path(self, base_path: Optional[str]) -> Optional[str]:
        """
        从 base_path 解析文件夹名称
        格式：folders/{folder_name} 或空字符串
        """
        if not base_path or base_path.strip() == "":
            return None  # 根目录
        
        if base_path.startswith("folders/"):
            folder_name = base_path.replace("folders/", "", 1)
            return folder_name.strip()
        
        return None
    
    async def _get_or_create_folder(
        self,
        folder_name: Optional[str],
        project_id: int,
        created_by: str
    ) -> Optional[int]:
        """获取或创建文件夹，返回文件夹ID"""
        if not folder_name:
            return None
        
        tenant_id = get_tenant_id()
        
        # 验证项目是否存在
        await validate_project_exists(await self.folder_mapper.get_session(), project_id)
        
        # 查询文件夹是否存在
        folder = await self.folder_mapper.query_one(
            select(FileFolder).filter(
                FileFolder.project_id == project_id,
                FileFolder.name == folder_name,
                FileFolder.tenant_id == tenant_id
            )
        )
        
        if folder:
            return folder.id
        
        # 创建文件夹
        new_folder = FileFolder(
            name=folder_name,
            project_id=project_id,
            created_by=created_by
        )
        await self.folder_mapper.insert(new_folder)
        await self.folder_mapper.commit()
        
        return new_folder.id
    
    async def create_folder(
        self,
        folder: FileFolderCreate,
        current_user: JwtUserInfo
    ) -> FileFolderResponse:
        """创建文件夹"""
        tenant_id = get_tenant_id()
        
        # 验证项目是否存在
        await validate_project_exists(await self.folder_mapper.get_session(), folder.project_id)
        
        # 检查文件夹名称是否已存在
        existing_folder = await self.folder_mapper.query_one(
            select(FileFolder).filter(
                FileFolder.project_id == folder.project_id,
                FileFolder.name == folder.name,
                FileFolder.tenant_id == tenant_id
            )
        )
        
        if existing_folder:
            raise HTTPException(
                status_code=400,
                detail=f"项目下已存在名为 '{folder.name}' 的文件夹"
            )
        
        # 创建文件夹
        new_folder = FileFolder(
            name=folder.name,
            description=folder.description,
            project_id=folder.project_id,
            created_by=current_user.username,
            created_id=current_user.userId
        )
        
        await self.folder_mapper.insert(new_folder)
        await self.folder_mapper.commit()
        
        return FileFolderResponse(
            id=new_folder.id,
            name=new_folder.name,
            description=new_folder.description,
            project_id=new_folder.project_id,
            created_at=new_folder.created_at,
            updated_at=new_folder.updated_at,
            created_by=new_folder.created_by,
            file_count=0
        )
    
    async def list_folders(
        self,
        project_id: int,
        name: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        current_user: Optional[JwtUserInfo] = None
    ) -> Page[FileFolderResponse]:
        """查询文件夹列表"""
        tenant_id = current_user.tenantId if current_user else get_tenant_id()
        
        # 验证项目是否存在
        await validate_project_exists(await self.folder_mapper.get_session(), project_id)
        
        # 构建查询
        query = select(FileFolder).filter(
            FileFolder.project_id == project_id,
            FileFolder.tenant_id == tenant_id
        )
        
        # 文件夹名称模糊搜索
        if name:
            query = query.filter(FileFolder.name.like(f"%{name}%"))
        
        # 按创建时间降序
        query = query.order_by(FileFolder.created_at.desc())
        
        # 分页查询
        page_result = await self.folder_mapper.query_page(query, page, size)
        
        # 计算每个文件夹的文件数量
        items = []
        for folder in page_result.items:
            count_query = select(func.count(FileManagementFile.id)).filter(
                FileManagementFile.folder_id == folder.id,
                FileManagementFile.tenant_id == tenant_id
            )
            file_count = await self.file_mapper.query_one(count_query) or 0
            
            items.append(FileFolderResponse(
                id=folder.id,
                name=folder.name,
                description=folder.description,
                project_id=folder.project_id,
                created_at=folder.created_at,
                updated_at=folder.updated_at,
                created_by=folder.created_by,
                file_count=file_count
            ))
        
        # 返回分页结果
        return Page(
            items=items,
            total=page_result.total,
            page=page_result.page,
            size=page_result.size,
            pages=page_result.pages
        )
    
    async def get_folder(
        self,
        folder_id: int,
        current_user: Optional[JwtUserInfo] = None
    ) -> FileFolderResponse:
        """查询文件夹详情"""
        tenant_id = current_user.tenantId if current_user else get_tenant_id()
        
        folder = await self.folder_mapper.query_one(
            select(FileFolder).filter(
                FileFolder.id == folder_id,
                FileFolder.tenant_id == tenant_id
            )
        )
        
        if not folder:
            raise HTTPException(
                status_code=404,
                detail="文件夹不存在"
            )
        
        # 计算文件数量
        count_query = select(func.count(FileManagementFile.id)).filter(
            FileManagementFile.folder_id == folder_id,
            FileManagementFile.tenant_id == tenant_id
        )
        file_count = await self.file_mapper.query_one(count_query) or 0
        
        return FileFolderResponse(
            id=folder.id,
            name=folder.name,
            description=folder.description,
            project_id=folder.project_id,
            created_at=folder.created_at,
            updated_at=folder.updated_at,
            created_by=folder.created_by,
            file_count=file_count
        )
    
    async def update_folder(
        self,
        folder_id: int,
        folder_update: FileFolderUpdate,
        current_user: JwtUserInfo
    ) -> FileFolderResponse:
        """更新文件夹"""
        tenant_id = get_tenant_id()
        
        folder = await self.folder_mapper.query_one(
            select(FileFolder).filter(
                FileFolder.id == folder_id,
                FileFolder.tenant_id == tenant_id
            )
        )
        
        if not folder:
            raise HTTPException(
                status_code=404,
                detail="文件夹不存在"
            )
        
        # 如果更新名称，检查是否重复
        if folder_update.name and folder_update.name != folder.name:
            existing_folder = await self.folder_mapper.query_one(
                select(FileFolder).filter(
                    FileFolder.project_id == folder.project_id,
                    FileFolder.name == folder_update.name,
                    FileFolder.tenant_id == tenant_id,
                    FileFolder.id != folder_id
                )
            )
            
            if existing_folder:
                raise HTTPException(
                    status_code=400,
                    detail=f"项目下已存在名为 '{folder_update.name}' 的文件夹"
                )
            
            folder.name = folder_update.name
        
        # 更新描述
        if folder_update.description is not None:
            folder.description = folder_update.description
        
        await self.folder_mapper.commit()
        
        # 计算文件数量
        count_query = select(func.count(FileManagementFile.id)).filter(
            FileManagementFile.folder_id == folder_id,
            FileManagementFile.tenant_id == tenant_id
        )
        file_count = await self.file_mapper.query_one(count_query) or 0
        
        return FileFolderResponse(
            id=folder.id,
            name=folder.name,
            description=folder.description,
            project_id=folder.project_id,
            created_at=folder.created_at,
            updated_at=folder.updated_at,
            created_by=folder.created_by,
            file_count=file_count
        )
    
    async def delete_folder(
        self,
        folder_ids: Optional[str] = None,
        current_user: Optional[JwtUserInfo] = None
    ) -> None:
        """删除文件夹（支持批量删除）
        
        Args:
            folder_ids: 多个文件夹ID，用英文逗号分隔（如："1,2,3"）
            current_user: 当前用户信息
        """
        tenant_id = current_user.tenantId if current_user else get_tenant_id()
        
        # 解析文件夹ID列表
        if folder_ids:
            try:
                folder_id_list = [int(fid.strip()) for fid in folder_ids.split(',') if fid.strip()]
                if not folder_id_list:
                    raise HTTPException(
                        status_code=400,
                        detail="folder_ids 参数格式错误：必须包含至少一个有效的文件夹ID"
                    )
            except ValueError as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"folder_ids 参数格式错误：{str(e)}"
                )
        else:
            raise HTTPException(
                status_code=400,
                detail="必须提供 folder_id 或 folder_ids 参数"
            )
        
        # 打印需要删除的文件夹ID
        logger.info(f"准备删除文件夹，文件夹ID列表: {folder_id_list}")
        
        # 查询所有要删除的文件夹
        folders = await self.folder_mapper.query(
            select(FileFolder).filter(
                FileFolder.id.in_(folder_id_list),
                FileFolder.tenant_id == tenant_id
            )
        )
        
        if not folders:
            raise HTTPException(
                status_code=404,
                detail="未找到任何文件夹"
            )
        
        # 检查是否有文件夹不存在
        found_folder_ids = {f.id for f in folders}
        missing_folder_ids = set(folder_id_list) - found_folder_ids
        if missing_folder_ids:
            logger.warning(f"以下文件夹不存在，将跳过: {', '.join(map(str, missing_folder_ids))}")
        
        # 检查每个文件夹下是否有文件，只删除没有文件的文件夹
        folders_to_delete = []
        skipped_folders = []
        
        for folder in folders:
            count_query = select(func.count(FileManagementFile.id)).filter(
                FileManagementFile.folder_id == folder.id,
                FileManagementFile.tenant_id == tenant_id
            )
            file_count = await self.file_mapper.query_one(count_query) or 0
            
            if file_count > 0:
                skipped_folders.append({
                    'id': folder.id,
                    'name': folder.name,
                    'file_count': file_count
                })
                logger.warning(
                    f"跳过删除文件夹 '{folder.name}' (ID: {folder.id})，"
                    f"原因：文件夹下还有 {file_count} 个文件"
                )
            else:
                folders_to_delete.append(folder)
        
        # 如果没有可删除的文件夹
        if not folders_to_delete:
            if skipped_folders:
                skipped_info = ', '.join([
                    f"'{s['name']}' (ID: {s['id']}, 文件数: {s['file_count']})"
                    for s in skipped_folders
                ])
                raise HTTPException(
                    status_code=400,
                    detail=f"文件夹无法删除。跳过: {skipped_info}"
                )
            else:
                raise HTTPException(
                    status_code=404,
                    detail="未找到任何可删除的文件夹"
                )
        
        # 批量删除文件夹
        deleted_folder_ids = []
        for folder in folders_to_delete:
            await self.folder_mapper.delete(folder)
            deleted_folder_ids.append(folder.id)
        
        await self.folder_mapper.commit()
        
        # 打印删除结果日志
        logger.info(f"成功删除 {len(deleted_folder_ids)} 个文件夹，文件夹ID: {deleted_folder_ids}")
        if skipped_folders:
            skipped_ids = [s['id'] for s in skipped_folders]
            logger.info(f"跳过删除 {len(skipped_folders)} 个文件夹（包含文件），文件夹ID: {skipped_ids}")
    
    async def save_file_info_by_upload_id(
        self,
        upload_id: str,
        project_id: int,
        folder_id: Optional[int],
        current_user: JwtUserInfo
    ) -> FileManagementFileResponse:
        """根据 upload_id 保存文件信息（上传成功后调用）"""
        tenant_id = get_tenant_id()
        
        # 验证项目是否存在
        await validate_project_exists(await self.file_mapper.get_session(), project_id)
        
        # 查询上传会话
        query = select(ChunkUploadSession).filter(
            ChunkUploadSession.upload_id == upload_id
        )
        query = await self.chunk_upload_mapper.append_tenant_id(query)
        session = await self.chunk_upload_mapper.query_one(query)
        
        if not session:
            raise HTTPException(
                status_code=404,
                detail=f"上传会话不存在: {upload_id}"
            )
        
        # 检查上传是否已完成
        if not session.is_complete:
            raise HTTPException(
                status_code=400,
                detail=f"上传会话未完成，无法保存文件信息: {upload_id}"
            )
        
        # 检查文件URL是否存在
        if not session.file_url:
            raise HTTPException(
                status_code=404,
                detail=f"文件URL不存在: {upload_id}"
            )
        
        # 检查文件是否已经保存过
        existing_file = await self.file_mapper.query_one(
            select(FileManagementFile).filter(
                FileManagementFile.upload_id == upload_id,
                FileManagementFile.tenant_id == tenant_id
            )
        )
        
        if existing_file:
            # 文件信息已存在，返回现有记录
            folder_name_result = None
            if existing_file.folder_id:
                folder = await self.folder_mapper.query_one(
                    select(FileFolder).filter(
                        FileFolder.id == existing_file.folder_id,
                        FileFolder.tenant_id == tenant_id
                    )
                )
                if folder:
                    folder_name_result = folder.name
            
            return FileManagementFileResponse(
                id=existing_file.id,
                file_name=existing_file.file_name,
                file_size=existing_file.file_size,
                file_hash=existing_file.file_hash,
                file_path=existing_file.file_path,
                folder_id=existing_file.folder_id,
                folder_name=folder_name_result,
                project_id=existing_file.project_id,
                upload_id=existing_file.upload_id,
                created_at=existing_file.created_at,
                created_by=existing_file.created_by
            )
        
        # 如果指定了文件夹ID，验证文件夹是否存在且属于该项目
        if folder_id is not None:
            folder = await self.folder_mapper.query_one(
                select(FileFolder).filter(
                    FileFolder.id == folder_id,
                    FileFolder.project_id == project_id,
                    FileFolder.tenant_id == tenant_id
                )
            )
            if not folder:
                raise HTTPException(
                    status_code=404,
                    detail=f"文件夹不存在或不属于该项目: folder_id={folder_id}, project_id={project_id}"
                )
        
        # 创建文件记录
        file_record = FileManagementFile(
            file_name=session.file_name,
            file_size=session.file_size,
            file_hash=session.file_hash,
            file_path=session.file_url,
            folder_id=folder_id,
            project_id=project_id,
            upload_id=upload_id,
            created_by=current_user.username,
            created_id=current_user.userId
        )
        
        await self.file_mapper.insert(file_record)
        await self.file_mapper.commit()
        
        # 获取文件夹名称（如果有）
        folder_name_result = None
        if folder_id:
            folder = await self.folder_mapper.query_one(
                select(FileFolder).filter(
                    FileFolder.id == folder_id,
                    FileFolder.tenant_id == tenant_id
                )
            )
            if folder:
                folder_name_result = folder.name
        
        logger.info(f"文件信息已保存到文件管理: upload_id={upload_id}, file_id={file_record.id}")
        
        return FileManagementFileResponse(
            id=file_record.id,
            file_name=file_record.file_name,
            file_size=file_record.file_size,
            file_hash=file_record.file_hash,
            file_path=file_record.file_path,
            folder_id=file_record.folder_id,
            folder_name=folder_name_result,
            project_id=file_record.project_id,
            upload_id=file_record.upload_id,
            created_at=file_record.created_at,
            created_by=file_record.created_by
        )
    
    async def list_files(
        self,
        project_id: int,
        folder_id: Optional[int] = None,
        name: Optional[str] = None,
        suffix: Optional[str] = None,
        page: Optional[int] = None,
        size: Optional[int] = None,
        current_user: Optional[JwtUserInfo] = None
    ) -> Page[FileManagementFileResponse]:
        """查询文件列表"""
        tenant_id = current_user.tenantId if current_user else get_tenant_id()
        
        # 如果指定了文件夹ID，验证文件夹是否存在且属于该项目
        if folder_id is not None:
            folder = await self.folder_mapper.query_one(
                select(FileFolder).filter(
                    FileFolder.id == folder_id,
                    FileFolder.project_id == project_id,
                    FileFolder.tenant_id == tenant_id
                )
            )
            if not folder:
                raise HTTPException(
                    status_code=404,
                    detail=f"文件夹不存在或不属于该项目: folder_id={folder_id}, project_id={project_id}"
                )
        
        # 构建查询
        query = select(FileManagementFile).filter(
            FileManagementFile.project_id == project_id,
            FileManagementFile.tenant_id == tenant_id
        )
        
        # 文件夹过滤
        if folder_id is not None:
            query = query.filter(FileManagementFile.folder_id == folder_id)
        
        # 文件名模糊搜索
        if name:
            query = query.filter(FileManagementFile.file_name.ilike(f"%{name}%"))
        
        # 文件后缀搜索
        if suffix:
            if not suffix.startswith('.'):
                suffix = f".{suffix}"
            query = query.filter(FileManagementFile.file_name.ilike(f"%{suffix}"))
        
        # 按创建时间降序
        query = query.order_by(FileManagementFile.created_at.desc())
        
        # 分页查询
        page_result = await self.file_mapper.query_page(query, page, size)
        
        # 获取文件夹名称映射
        folder_ids = {item.folder_id for item in page_result.items if item.folder_id}
        folder_name_map = {}
        if folder_ids:
            folders = await self.folder_mapper.query(
                select(FileFolder).filter(
                    FileFolder.id.in_(folder_ids),
                    FileFolder.tenant_id == tenant_id
                )
            )
            folder_name_map = {folder.id: folder.name for folder in folders}
        
        # 构建响应
        items = []
        for file_item in page_result.items:
            items.append(FileManagementFileResponse(
                id=file_item.id,
                file_name=file_item.file_name,
                file_size=file_item.file_size,
                file_hash=file_item.file_hash,
                file_path=file_item.file_path,
                folder_id=file_item.folder_id,
                folder_name=folder_name_map.get(file_item.folder_id) if file_item.folder_id else None,
                project_id=file_item.project_id,
                upload_id=file_item.upload_id,
                created_at=file_item.created_at,
                created_by=file_item.created_by
            ))
        
        return Page(
            items=items,
            total=page_result.total,
            page=page_result.page,
            size=page_result.size,
            pages=page_result.pages
        )
    
    async def get_file(
        self,
        file_id: int,
        current_user: Optional[JwtUserInfo] = None
    ) -> FileManagementFileResponse:
        """查询文件详情"""
        tenant_id = current_user.tenantId if current_user else get_tenant_id()
        
        file_item = await self.file_mapper.query_one(
            select(FileManagementFile).filter(
                FileManagementFile.id == file_id,
                FileManagementFile.tenant_id == tenant_id
            )
        )
        
        if not file_item:
            raise HTTPException(
                status_code=404,
                detail="文件不存在"
            )
        
        # 获取文件夹名称（如果有）
        folder_name = None
        if file_item.folder_id:
            folder = await self.folder_mapper.query_one(
                select(FileFolder).filter(
                    FileFolder.id == file_item.folder_id,
                    FileFolder.tenant_id == tenant_id
                )
            )
            if folder:
                folder_name = folder.name
        
        return FileManagementFileResponse(
            id=file_item.id,
            file_name=file_item.file_name,
            file_size=file_item.file_size,
            file_hash=file_item.file_hash,
            file_path=file_item.file_path,
            folder_id=file_item.folder_id,
            folder_name=folder_name,
            project_id=file_item.project_id,
            upload_id=file_item.upload_id,
            created_at=file_item.created_at,
            created_by=file_item.created_by
        )
    
    async def delete_file(
        self,
        file_ids: str,
        current_user: Optional[JwtUserInfo] = None
    ) -> None:
        """删除文件（支持批量删除）
        
        Args:
            file_ids: 文件ID字符串，多个ID用英文逗号分隔（如："1,2,3"）
            current_user: 当前用户信息
        """
        tenant_id = current_user.tenantId if current_user else get_tenant_id()
        
        # 解析文件ID列表
        try:
            file_id_list = [int(fid.strip()) for fid in file_ids.split(',') if fid.strip()]
            if not file_id_list:
                raise HTTPException(
                    status_code=400,
                    detail="file_ids 参数格式错误：必须包含至少一个有效的文件ID"
                )
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail=f"file_ids 参数格式错误：{str(e)}"
            )
        
        # 打印需要删除的文件ID
        logger.info(f"准备删除文件，文件ID列表: {file_id_list}")
        
        # 查询所有要删除的文件
        files = await self.file_mapper.query(
            select(FileManagementFile).filter(
                FileManagementFile.id.in_(file_id_list),
                FileManagementFile.tenant_id == tenant_id
            )
        )
        
        if not files:
            raise HTTPException(
                status_code=404,
                detail="未找到任何文件"
            )
        
        # 检查是否有文件不存在
        found_file_ids = {f.id for f in files}
        missing_file_ids = set(file_id_list) - found_file_ids
        if missing_file_ids:
            logger.warning(f"以下文件不存在，将跳过: {', '.join(map(str, missing_file_ids))}")
        
        # 获取 JuiceFS 客户端
        jfs = await self.storage.JUICEFS_CLIENT()
        
        # 收集需要删除的 upload_id
        upload_ids_to_delete = set()
        
        # 批量删除文件
        deleted_file_ids = []
        for file_item in files:
            try:
                # 删除 JuiceFS 中的文件
                try:
                    if jfs.exists(file_item.file_path):
                        jfs.remove(file_item.file_path)
                        logger.info(f"已删除JuiceFS文件: {file_item.file_path}")
                except Exception as e:
                    logger.error(f"删除JuiceFS文件失败: {file_item.file_path}, 错误: {str(e)}")
                    # 继续删除数据库记录，即使文件删除失败
                
                # 收集 upload_id（如果存在）
                if file_item.upload_id:
                    upload_ids_to_delete.add(file_item.upload_id)
                
                # 删除数据库记录
                await self.file_mapper.delete(file_item)
                deleted_file_ids.append(file_item.id)
            except Exception as e:
                logger.error(f"删除文件失败 (ID: {file_item.id}): {str(e)}")
                # 继续处理其他文件
        
        # 提交文件删除操作
        await self.file_mapper.commit()
        
        # 删除上传会话和分片上传记录
        if upload_ids_to_delete:
            try:
                for upload_id in upload_ids_to_delete:
                    await self.chunk_upload_service.cleanup_upload_data(upload_id)
                
                logger.info(f"已删除上传会话和分片上传记录，upload_id列表: {list(upload_ids_to_delete)}")
            except Exception as e:
                logger.error(f"删除上传会话和分片上传记录失败: {str(e)}")
                # 不影响文件删除的成功，只记录错误日志
        
        # 打印删除结果日志
        logger.info(f"成功删除 {len(deleted_file_ids)} 个文件，文件ID: {deleted_file_ids}")
        if missing_file_ids:
            logger.info(f"跳过删除 {len(missing_file_ids)} 个文件（不存在），文件ID: {list(missing_file_ids)}")
    
    async def download_file(
        self,
        file_id: Optional[int] = None,
        file_ids: Optional[str] = None,
        current_user: Optional[JwtUserInfo] = None
    ) -> StreamingResponse:
        """下载文件
        
        支持单个文件下载或批量文件下载（打包为zip）
        """
        tenant_id = current_user.tenantId if current_user else get_tenant_id()
        
        # 参数验证：必须提供 file_id 或 file_ids 之一
        if file_id is None and (file_ids is None or file_ids.strip() == ""):
            raise HTTPException(
                status_code=400,
                detail="必须提供 file_id 或 file_ids 参数"
            )
        
        # 如果提供了 file_ids，解析并执行批量下载
        if file_ids and file_ids.strip():
            try:
                # 解析逗号分隔的字符串为整数列表
                file_id_list = [int(fid.strip()) for fid in file_ids.split(',') if fid.strip()]
                if not file_id_list:
                    raise HTTPException(
                        status_code=400,
                        detail="file_ids 参数格式错误：必须包含至少一个有效的文件ID"
                    )
                # 执行批量下载
                return await self._download_files_as_zip(file_id_list, tenant_id)
            except ValueError as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"file_ids 参数格式错误：{str(e)}"
                )
        
        # 单个文件下载（原有逻辑）
        # 查询文件信息
        file_item = await self.file_mapper.query_one(
            select(FileManagementFile).filter(
                FileManagementFile.id == file_id,
                FileManagementFile.tenant_id == tenant_id
            )
        )
        
        if not file_item:
            raise HTTPException(
                status_code=404,
                detail="文件不存在"
            )
        
        # 获取 JuiceFS 客户端
        jfs = await self.storage.JUICEFS_CLIENT()
        
        # 检查文件是否存在
        try:
            if not jfs.exists(file_item.file_path):
                logger.warning(f"文件不存在: {file_item.file_path}")
                raise HTTPException(
                    status_code=404,
                    detail=f"文件不存在: {file_item.file_path}"
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"检查文件存在性失败: {file_item.file_path}, 错误: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"检查文件失败: {str(e)}"
            )
        
        # 流式读取文件
        async def generate():
            try:
                with jfs.open(file_item.file_path, 'rb') as f:
                    chunk_size = 64 * 1024  # 64KB
                    while True:
                        chunk = f.read(chunk_size)
                        if not chunk:
                            break
                        yield chunk
                        await asyncio.sleep(0)  # 让出控制权
            except Exception as e:
                logger.error(f"读取文件失败: {file_item.file_path}, 错误: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"读取文件失败: {str(e)}"
                )
        
        # 返回流式响应（使用工具函数处理中文文件名）
        return StreamingResponse(
            generate(),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": build_content_disposition_header(file_item.file_name),
                "Content-Length": str(file_item.file_size)
            }
        )
    
    async def _download_files_as_zip(
        self,
        file_ids: List[int],
        tenant_id: str
    ) -> StreamingResponse:
        """批量下载文件并打包为zip"""
        # 查询所有文件信息
        files = await self.file_mapper.query(
            select(FileManagementFile).filter(
                FileManagementFile.id.in_(file_ids),
                FileManagementFile.tenant_id == tenant_id
            )
        )
        
        if not files:
            raise HTTPException(
                status_code=404,
                detail="未找到任何文件"
            )
        
        # 检查是否有文件不存在
        found_file_ids = {f.id for f in files}
        missing_file_ids = set(file_ids) - found_file_ids
        if missing_file_ids:
            raise HTTPException(
                status_code=404,
                detail=f"以下文件不存在: {', '.join(map(str, missing_file_ids))}"
            )
        
        # 获取 JuiceFS 客户端
        jfs = await self.storage.JUICEFS_CLIENT()
        
        # 创建临时目录和zip文件
        temp_dir = tempfile.mkdtemp()
        temp_zip_path = os.path.join(temp_dir, "files.zip")
        
        # 收集失败的文件信息
        failed_files = []
        success_count = 0
        
        try:
            # 创建zip文件并添加文件
            used_names = {}  # 用于跟踪已使用的文件名，处理重名冲突
            with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
                for file_item in files:
                    # 检查文件是否存在
                    try:
                        if not jfs.exists(file_item.file_path):
                            failed_files.append({
                                "id": file_item.id,
                                "name": file_item.file_name,
                                "reason": "文件不存在"
                            })
                            logger.warning(f"文件不存在，跳过: {file_item.file_path}")
                            continue
                    except Exception as e:
                        failed_files.append({
                            "id": file_item.id,
                            "name": file_item.file_name,
                            "reason": f"检查文件失败: {str(e)}"
                        })
                        logger.error(f"检查文件存在性失败: {file_item.file_path}, 错误: {str(e)}")
                        continue
                    
                    # 从JuiceFS读取文件并添加到zip
                    try:
                        with jfs.open(file_item.file_path, 'rb') as f:
                            file_content = f.read()
                            
                            # 处理文件名冲突：如果文件名已存在，添加序号
                            zip_entry_name = file_item.file_name
                            if zip_entry_name in used_names:
                                # 文件名冲突，添加序号
                                name_parts = os.path.splitext(file_item.file_name)
                                counter = used_names[zip_entry_name] + 1
                                zip_entry_name = f"{name_parts[0]}_{counter}{name_parts[1]}"
                                used_names[file_item.file_name] = counter
                                used_names[zip_entry_name] = 0  # 记录新名称
                            else:
                                used_names[zip_entry_name] = 0
                            
                            zip_file.writestr(zip_entry_name, file_content)
                            success_count += 1
                            logger.info(f"已添加文件到zip: {zip_entry_name} (ID: {file_item.id})")
                    except Exception as e:
                        failed_files.append({
                            "id": file_item.id,
                            "name": file_item.file_name,
                            "reason": f"读取文件失败: {str(e)}"
                        })
                        logger.error(f"读取文件失败: {file_item.file_path}, 错误: {str(e)}", exc_info=True)
                        # 继续处理其他文件，不中断整个流程
            
            # 记录下载结果
            if failed_files:
                logger.warning(
                    f"批量下载完成: 成功 {success_count} 个，失败 {len(failed_files)} 个。"
                    f"失败文件详情: {failed_files}"
                )
            
            # 生成zip文件内容的生成器
            def generate_zip_content():
                try:
                    with open(temp_zip_path, 'rb') as f:
                        chunk_size = 64 * 1024  # 64KB
                        while True:
                            chunk = f.read(chunk_size)
                            if not chunk:
                                break
                            yield chunk
                finally:
                    # 清理临时文件
                    try:
                        os.unlink(temp_zip_path)
                        os.rmdir(temp_dir)
                    except Exception as e:
                        logger.warning(f"清理临时文件失败: {str(e)}")
            
            # 返回流式响应（使用工具函数处理中文文件名）
            return StreamingResponse(
                generate_zip_content(),
                media_type="application/zip",
                headers={
                    "Content-Disposition": build_content_disposition_header("files.zip")
                }
            )
            
        except Exception as e:
            # 清理临时文件
            try:
                if os.path.exists(temp_zip_path):
                    os.unlink(temp_zip_path)
                if os.path.exists(temp_dir):
                    os.rmdir(temp_dir)
            except Exception as cleanup_error:
                logger.warning(f"清理临时文件失败: {str(cleanup_error)}")
            
            logger.error(f"创建zip文件失败: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"创建zip文件失败: {str(e)}"
            )

