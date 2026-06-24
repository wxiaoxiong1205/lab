import os
import uuid
import io
import asyncio
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy import select, delete as sql_delete
from sqlalchemy.dialects.postgresql import insert

from app.core.logging import logger
from app.models import ChunkUploadSession, ChunkUploadRecord
from app.repository.chunk_upload_mapper import ChunkUploadMapper
from app.repository.chunk_upload_record_mapper import ChunkUploadRecordMapper
from app.utils.app_runtime_context import get_tenant_id
from app.schemas.chunk_upload import (
    ChunkUploadInitRequest,
    ChunkUploadInitResponse,
    ChunkUploadMergeRequest,
    ChunkUploadMergeResponse,
    ChunkUploadProgressRequest,
    ChunkUploadProgressResponse,
    ChunkUploadFileUsage,
    ChunkUploadFileInfoResponse
)
from app.services.chunk_upload.interface import ChunkUploadService
from app.services.storage.interface import StorageService
from app.utils.dataset_file_parser import get_content_type_by_extension
from app.utils.storage_enum import StoragePath
from app.utils.validators import validate_project_exists


class DefaultChunkUploadService(ChunkUploadService):
    """分片上传服务实现类"""
    
    def __init__(self, mapper: ChunkUploadMapper, record_mapper: ChunkUploadRecordMapper, storage: StorageService) -> None:
        super().__init__(mapper, record_mapper, storage)
    
    async def _get_juicefs_client(self):
        """获取JuiceFS客户端"""
        return await self.storage.JUICEFS_CLIENT()
    
    def _generate_upload_id(self) -> str:
        """生成上传会话ID"""
        return str(uuid.uuid4())
    
    def _get_chunk_temp_dir(self, upload_id: str) -> str:
        """获取分片临时目录路径"""
        base_path = StoragePath.CHUNK_UPLOAD_TEMP.storage_path.format(upload_id=upload_id)
        return base_path.replace('\\', '/')

    async def _get_final_file_path(
            self,
            file_name: str,
            usage: ChunkUploadFileUsage,
            project_id: Optional[int],
            upload_id: str
    ) -> str:
        """获取最终文件保存路径
        
        Args:
            file_name: 文件名
            usage: 文件用途
            project_id: 项目ID（非公共用途时必需）
            upload_id: 上传会话ID
            
        Returns:
            str: 最终文件保存路径
        """
        if usage == ChunkUploadFileUsage.PUBLIC:
            # 公共模块：保存路径为 /public/chunk_upload/files/{upload_id}/
            save_path = f"{StoragePath.CHUNK_UPLOAD_FILES.storage_path}{upload_id}"
        else:
            # 非公共模块：保存路径为 /{namespace}/{usage}/{upload_id}/
            # 验证项目ID
            if not project_id:
                raise HTTPException(
                    status_code=400,
                    detail="非公共用途的文件必须提供项目ID"
                )

            # 验证项目是否存在
            project = await validate_project_exists(await self.mapper.get_session(), project_id)

            # 生成项目命名空间
            namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{project.id}"

            # 构建保存路径：/{namespace}/{usage}/{upload_id}/
            save_path = f"/{namespace}/{usage.value}/{upload_id}"

        # 确保文件名安全（移除路径分隔符等）
        safe_filename = os.path.basename(file_name)
        return os.path.join(save_path, safe_filename).replace('\\', '/')
    
    async def init_upload(
        self,
        request: ChunkUploadInitRequest
    ) -> ChunkUploadInitResponse:
        """初始化上传会话
        
        不再支持秒传，只支持断点续传。
        即使文件哈希已存在，也会创建新的上传会话。
        """
        try:
            # 计算总分片数
            total_chunks = (request.fileSize + request.chunkSize - 1) // request.chunkSize
            
            # 检查是否存在未完成的上传会话（断点续传）：仅当 hash、大小、分片大小、文件名均一致时才复用
            incomplete_session = await self.mapper.query_one(
                select(ChunkUploadSession).filter(
                    ChunkUploadSession.file_hash == request.fileHash,
                    ChunkUploadSession.file_size == request.fileSize,
                    ChunkUploadSession.chunk_size == request.chunkSize,
                    ChunkUploadSession.file_name == request.fileName,
                    ChunkUploadSession.is_complete == False
                ).order_by(ChunkUploadSession.created_at.desc())  # 取最新的
            )

            if incomplete_session:
                logger.info(f"发现未完成的上传会话，支持断点续传: {incomplete_session.upload_id}")
                return ChunkUploadInitResponse(
                    uploadId=incomplete_session.upload_id,
                    exists=False  # 不是秒传，但可以续传
                )

            # 创建新的上传会话
            upload_id = self._generate_upload_id()
            
            session = ChunkUploadSession(
                upload_id=upload_id,
                file_name=request.fileName,
                file_size=request.fileSize,
                chunk_size=request.chunkSize,
                file_hash=request.fileHash,
                total_chunks=total_chunks,
                is_complete=False
            )
            
            await self.mapper.insert(session)
            await self.mapper.commit()
            
            logger.info(f"创建上传会话: {upload_id}, 文件: {request.fileName}, 总分片: {total_chunks}")
            
            return ChunkUploadInitResponse(
                uploadId=upload_id,
                exists=False
            )
            
        except Exception as e:
            logger.error(f"初始化上传失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"初始化上传失败: {str(e)}")
    
    async def upload_chunk(
        self,
        upload_id: str,
        chunk_index: int,
        file_hash: str,
        chunk_file: UploadFile
    ) -> None:
        """上传分片"""
        db_session = None
        try:
            # 获取数据库会话
            db_session = await self.mapper.get_session()
            
            # 1. 验证会话是否存在
            query = select(ChunkUploadSession).filter(
                ChunkUploadSession.upload_id == upload_id
            )
            query = await self.mapper.append_tenant_id(query)
            
            result = await db_session.execute(query)
            session = result.scalar_one_or_none()
            
            if not session:
                raise HTTPException(status_code=404, detail=f"上传会话不存在: {upload_id}")
            
            # 验证文件哈希
            if session.file_hash != file_hash:
                raise HTTPException(status_code=400, detail="文件哈希不匹配")
            
            # 验证分片索引
            if chunk_index < 0 or chunk_index >= session.total_chunks:
                raise HTTPException(status_code=400, detail=f"分片索引超出范围: {chunk_index}")
            
            # 2. 检查分片是否已上传（查询分片记录表）
            chunk_record_query = select(ChunkUploadRecord).filter(
                ChunkUploadRecord.upload_id == upload_id,
                ChunkUploadRecord.chunk_index == chunk_index
            )
            chunk_record_query = await self.record_mapper.append_tenant_id(chunk_record_query)
            
            existing_record = await db_session.execute(chunk_record_query)
            if existing_record.scalar_one_or_none():
                logger.info(f"分片 {chunk_index} 已上传，跳过")
                await db_session.rollback()
                return
            
            # 3. 读取分片数据
            chunk_data = await chunk_file.read()
            chunk_size = len(chunk_data)
            
            # 4. 保存分片到JuiceFS临时目录
            jfs = await self._get_juicefs_client()
            chunk_dir = self._get_chunk_temp_dir(upload_id)
            chunk_path = os.path.join(chunk_dir, f"{chunk_index}").replace('\\', '/')

            def save_chunk_to_jfs():
                # 确保目录存在
                if not jfs.exists(chunk_dir):
                    jfs.makedirs(chunk_dir, exist_ok=True)

                with jfs.open(chunk_path, 'wb') as f:
                    f.write(chunk_data)

            await asyncio.to_thread(save_chunk_to_jfs)
            
            # 5. 使用 INSERT ... ON CONFLICT DO NOTHING 原子性地插入分片记录
            # 即使并发插入，数据库唯一约束会保证只有一个成功
            tenant_id = get_tenant_id()
            
            stmt = insert(ChunkUploadRecord).values(
                upload_id=upload_id,
                chunk_index=chunk_index,
                chunk_path=chunk_path,
                chunk_size=chunk_size,
                tenant_id=tenant_id
            ).on_conflict_do_nothing(
                index_elements=['upload_id', 'chunk_index']
            )
            
            await db_session.execute(stmt)
            await db_session.commit()
            
            logger.info(f"分片上传成功: {upload_id}, chunk_index={chunk_index}")
            
        except HTTPException:
            if db_session:
                await db_session.rollback()
            raise
        except Exception as e:
            if db_session:
                await db_session.rollback()
            logger.error(f"上传分片失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"上传分片失败: {str(e)}")
    
    async def merge_chunks(
        self,
        request: ChunkUploadMergeRequest
    ) -> ChunkUploadMergeResponse:
        """合并分片"""
        start_time = datetime.now()
        
        try:
            # 查询上传会话
            session = await self.mapper.query_one(
                select(ChunkUploadSession).filter(
                    ChunkUploadSession.upload_id == request.uploadId
                )
            )
            
            if not session:
                raise HTTPException(status_code=404, detail=f"上传会话不存在: {request.uploadId}")
            
            # 验证文件哈希
            if session.file_hash != request.fileHash:
                raise HTTPException(status_code=400, detail="文件哈希不匹配")
            
            # 验证总分片数
            if session.total_chunks != request.totalChunks:
                raise HTTPException(status_code=400, detail="总分片数不匹配")
            
            # 查询已上传的分片记录
            db_session = await self.mapper.get_session()
            uploaded_records_query = select(ChunkUploadRecord.chunk_index).filter(
                ChunkUploadRecord.upload_id == request.uploadId
            )
            uploaded_records_query = await self.record_mapper.append_tenant_id(uploaded_records_query)
            
            result = await db_session.execute(uploaded_records_query)
            uploaded_chunks = sorted([row[0] for row in result.fetchall()])
            
            # 检查是否所有分片都已上传
            if len(uploaded_chunks) != session.total_chunks:
                missing_chunks = set(range(session.total_chunks)) - set(uploaded_chunks)
                raise HTTPException(
                    status_code=400,
                    detail=f"分片未完全上传，缺失分片: {sorted(missing_chunks)}"
                )
            
            # 合并分片
            jfs = await self._get_juicefs_client()
            chunk_dir = self._get_chunk_temp_dir(request.uploadId)
            
            # 获取最终文件路径（根据 usage 参数）
            final_path = await self._get_final_file_path(
                request.fileName,
                request.usage,
                request.project_id,
                request.uploadId
            )
            final_dir = os.path.dirname(final_path)

            expected_file_size = session.file_size

            def merge_chunks_to_jfs():
                # 确保最终目录存在
                if not jfs.exists(final_dir):
                    jfs.makedirs(final_dir, exist_ok=True)

                # 按顺序合并所有分片（使用已上传的分片记录）
                with jfs.open(final_path, 'wb') as final_file:
                    for chunk_index in uploaded_chunks:
                        chunk_path = os.path.join(chunk_dir, f"{chunk_index}").replace('\\', '/')

                        if not jfs.exists(chunk_path):
                            raise HTTPException(status_code=500, detail=f"分片文件不存在: {chunk_path}")

                        with jfs.open(chunk_path, 'rb') as chunk_file:
                            while True:
                                chunk_data = chunk_file.read(1024 * 1024)
                                if not chunk_data:
                                    break
                                final_file.write(chunk_data)

                # 验证文件大小
                final_stat = jfs.stat(final_path)
                if final_stat.st_size != expected_file_size:
                    # 删除不完整的文件
                    jfs.remove(final_path)
                    raise HTTPException(
                        status_code=500,
                        detail=f"文件大小不匹配: 期望 {expected_file_size}, 实际 {final_stat.st_size}"
                    )

            await asyncio.to_thread(merge_chunks_to_jfs)
            
            # 更新上传会话
            session.is_complete = True
            session.file_url = final_path
            await self.mapper.commit()
            
            # 清理临时分片文件
            try:
                def cleanup_chunks_from_jfs():
                    for chunk_index in uploaded_chunks:
                        chunk_path = os.path.join(chunk_dir, f"{chunk_index}").replace('\\', '/')
                        if jfs.exists(chunk_path):
                            jfs.remove(chunk_path)
                    # 删除临时目录
                    if jfs.exists(chunk_dir):
                        jfs.rmdir(chunk_dir)

                await asyncio.to_thread(cleanup_chunks_from_jfs)
            except Exception as cleanup_error:
                logger.warning(f"清理临时分片文件失败: {str(cleanup_error)}")
            
            end_time = datetime.now()
            
            logger.info(f"分片合并成功: {request.uploadId}, 文件: {final_path}")
            
            return ChunkUploadMergeResponse(
                fileName=request.fileName,
                fileSize=session.file_size,
                uploadId=request.uploadId,
                chunkSize=session.chunk_size,
                totalChunkNum=session.total_chunks,
                error=None,
                success=True,
                fileUrl=final_path,
                startTime=start_time.isoformat(),
                endTime=end_time.isoformat()
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"合并分片失败: {str(e)}")
            
            # 更新错误信息
            try:
                session = await self.mapper.query_one(
                    select(ChunkUploadSession).filter(
                        ChunkUploadSession.upload_id == request.uploadId
                    )
                )
                if session:
                    session.error_message = str(e)
                    await self.mapper.commit()
            except:
                pass
            
            raise HTTPException(status_code=500, detail=f"合并分片失败: {str(e)}")
    
    async def get_progress(
        self,
        request: ChunkUploadProgressRequest
    ) -> ChunkUploadProgressResponse:
        """查询上传进度"""
        try:
            session = await self.mapper.query_one(
                select(ChunkUploadSession).filter(
                    ChunkUploadSession.upload_id == request.uploadId
                )
            )
            
            if not session:
                raise HTTPException(status_code=404, detail=f"上传会话不存在: {request.uploadId}")
            
            # 查询已上传的分片记录
            db_session = await self.mapper.get_session()
            uploaded_records_query = select(ChunkUploadRecord.chunk_index).filter(
                ChunkUploadRecord.upload_id == request.uploadId
            )
            uploaded_records_query = await self.record_mapper.append_tenant_id(uploaded_records_query)
            
            result = await db_session.execute(uploaded_records_query)
            uploaded_chunks = sorted([row[0] for row in result.fetchall()])
            
            return ChunkUploadProgressResponse(
                uploadedChunks=uploaded_chunks,
                isComplete=session.is_complete
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"查询进度失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"查询进度失败: {str(e)}")

    async def get_file_info_by_upload_id(self, upload_id: str) -> ChunkUploadFileInfoResponse:
        """通过upload_id查询上传文件信息。"""
        try:
            query = select(ChunkUploadSession).filter(
                ChunkUploadSession.upload_id == upload_id
            )
            query = await self.mapper.append_tenant_id(query)
            session = await self.mapper.query_one(query)

            if not session:
                raise HTTPException(status_code=404, detail=f"上传会话不存在: {upload_id}")

            return ChunkUploadFileInfoResponse(
                uploadId=session.upload_id,
                fileName=session.file_name,
                fileSize=session.file_size,
                fileHash=session.file_hash,
                chunkSize=session.chunk_size,
                totalChunkNum=session.total_chunks,
                isComplete=session.is_complete,
                fileUrl=f"{get_tenant_id()}{session.file_url}",
                errorMessage=session.error_message,
                createdAt=session.created_at.isoformat() if session.created_at else None,
                updatedAt=session.updated_at.isoformat() if session.updated_at else None,
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"查询上传文件信息失败: {str(e)}")
            raise HTTPException(status_code=500, detail=f"查询上传文件信息失败: {str(e)}")

    async def cleanup_upload_data(self, upload_id: str) -> None:
        """清理分片上传相关的数据

        删除分片上传的原始文件、上传会话和分片记录。
        该方法通常在上传的文件被成功使用后调用（如文件已保存到最终位置）。

        Args:
            upload_id: 分片上传ID
        """
        try:
            tenant_id = get_tenant_id()

            # 1. 查询上传会话，获取文件路径
            query = select(ChunkUploadSession).filter(
                ChunkUploadSession.upload_id == upload_id
            )
            query = await self.mapper.append_tenant_id(query)
            session = await self.mapper.query_one(query)

            if not session:
                logger.warning(f"上传会话不存在，跳过清理: upload_id={upload_id}")
                return

            # 2. 删除JuiceFS中的原始文件
            if session.file_url:
                try:
                    jfs = await self._get_juicefs_client()

                    def remove_uploaded_file_from_jfs():
                        if jfs.exists(session.file_url):
                            jfs.remove(session.file_url)
                            logger.info(f"已删除JuiceFS中的分片上传原始文件: {session.file_url}")
                        else:
                            logger.warning(f"JuiceFS文件不存在，跳过删除: {session.file_url}")

                    await asyncio.to_thread(remove_uploaded_file_from_jfs)
                except Exception as e:
                    logger.error(f"删除JuiceFS文件失败: {session.file_url}, 错误: {str(e)}")
                    # 继续删除数据库记录，即使文件删除失败

            # 3. 删除分片上传记录
            try:
                delete_chunk_records = sql_delete(ChunkUploadRecord).filter(
                    ChunkUploadRecord.upload_id == upload_id,
                    ChunkUploadRecord.tenant_id == tenant_id
                )
                await self.record_mapper.delete_condition(delete_chunk_records)
                logger.info(f"已删除分片上传记录: upload_id={upload_id}")
            except Exception as e:
                logger.error(f"删除分片上传记录失败: upload_id={upload_id}, 错误: {str(e)}")

            # 4. 删除上传会话
            try:
                delete_session = sql_delete(ChunkUploadSession).filter(
                    ChunkUploadSession.upload_id == upload_id,
                    ChunkUploadSession.tenant_id == tenant_id
                )
                await self.mapper.delete_condition(delete_session)
                logger.info(f"已删除上传会话: upload_id={upload_id}")
            except Exception as e:
                logger.error(f"删除上传会话失败: upload_id={upload_id}, 错误: {str(e)}")

            # 5. 提交删除操作
            try:
                await self.record_mapper.commit()
                await self.mapper.commit()
                logger.info(f"成功清理分片上传数据: upload_id={upload_id}")
            except Exception as e:
                logger.error(f"提交删除操作失败: upload_id={upload_id}, 错误: {str(e)}")

        except Exception as e:
            logger.error(f"清理分片上传数据失败: upload_id={upload_id}, 错误: {str(e)}")
            # 不影响主流程，只记录错误日志

    async def get_file_by_upload_id(self, upload_id: str) -> UploadFile:
        """通过upload_id从JuiceFS获取分片上传的文件

        该方法用于获取已完成分片上传的文件，返回UploadFile对象，方便其他服务复用。

        Args:
            upload_id: 分片上传ID

        Returns:
            UploadFile: 文件对象，包含文件名和内容

        Raises:
            HTTPException: 如果上传会话不存在、未完成或文件不存在
        """
        try:
            # 1. 查询数据库，获取分片文件的存储路径
            query = select(ChunkUploadSession).filter(
                ChunkUploadSession.upload_id == upload_id
            )
            # 添加租户过滤
            query = await self.mapper.append_tenant_id(query)
            session = await self.mapper.query_one(query)

            if not session:
                logger.error(f"上传会话不存在: {upload_id}")
                raise HTTPException(
                    status_code=404,
                    detail=f"上传会话不存在: {upload_id}"
                )

            # 检查上传是否已完成
            if not session.is_complete:
                raise HTTPException(
                    status_code=400,
                    detail=f"上传会话未完成，无法获取文件: {upload_id}"
                )

            # 检查文件URL是否存在
            if not session.file_url:
                raise HTTPException(
                    status_code=404,
                    detail=f"文件URL不存在: {upload_id}"
                )

            # 2. 通过文件存储路径，从JuiceFS获取文件内容
            jfs = await self._get_juicefs_client()

            def read_uploaded_file_from_jfs():
                # 检查文件是否存在
                if not jfs.exists(session.file_url):
                    raise HTTPException(
                        status_code=404,
                        detail=f"文件不存在: {session.file_url}"
                    )

                with jfs.open(session.file_url, 'rb') as f:
                    return f.read()

            file_content = await asyncio.to_thread(read_uploaded_file_from_jfs)

            logger.info(f"从JuiceFS读取文件成功: {session.file_url}, 大小: {len(file_content)} 字节")

            # 3. 创建UploadFile对象并返回
            # 使用BytesIO创建文件流
            file_stream = io.BytesIO(file_content)
            file_stream.seek(0)  # 重置文件指针到开头

            # 根据文件扩展名确定content_type
            file_extension = os.path.splitext(session.file_name)[1].lower()
            content_type = get_content_type_by_extension(file_extension)
            if not content_type:
                raise HTTPException(
                    status_code=400,
                    detail=f"不支持的文件格式！{file_extension}"
                )

            # 创建UploadFile对象
            upload_file = UploadFile(
                file=file_stream,
                filename=session.file_name,
                headers={"content-type": content_type}
            )

            logger.info(f"成功创建UploadFile对象: {session.file_name}")
            return upload_file

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"通过upload_id获取文件失败: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"获取文件失败: {str(e)}"
            )

