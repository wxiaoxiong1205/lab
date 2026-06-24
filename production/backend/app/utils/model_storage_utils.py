"""
训练模型存储管理工具
使用JuiceFS rename操作实现高效的模型存储管理
"""

import os
from typing import Optional, Tuple, Union
from fastapi import HTTPException
from starlette import status

from app.schemas import TrainedModelCreate
from app.schemas.model import MergeConfigConverter, ModelRegisterSourceType
from app.utils.storage_enum import StoragePath
from app.core.logging import logger
from app.services.storage.interface import StorageService
from app.tasks.model_storage_tasks import copy_registered_model_async
from app.utils import app_runtime_context


async def register_trained_model(
    storage: StorageService,
    namespace: str,
    task_id: Optional[int],
    task_name: Optional[str],
    task_version: Optional[str],
    checkpoint_name: Optional[str],
    model_name: str,
    model_version: str = "v1",
    start_async_copy: bool = True,
    trained_model_id: Optional[int] = None,
    return_paths: bool = False,
    model_source_type: str = ModelRegisterSourceType.TRAINING.value,
    notebook_id: Optional[int] = None,
    notebook_path: Optional[str] = None,
) -> Union[str, Tuple[str, str]]:
    """
    注册训练模型：为训练任务输出的模型提交异步复制任务到注册模型存储位置
    
    Args:
        storage: 存储服务实例
        namespace: 项目命名空间
        task_id: 训练任务ID
        task_name: 训练任务名称
        task_version: 训练任务版本
        checkpoint_name: checkpoint目录名（如 checkpoint-1000）
        model_name: 注册模型名称
        model_version: 模型版本
        
    Returns:
        str | tuple[str, str]: 注册模型的存储路径，或 (source_path, target_path)
        
    Raises:
        HTTPException: 如果操作失败
        
    Note:
        使用异步复制，原始checkpoint目录仍然保留在训练任务目录中
        training_name格式为: {task_name}_{task_version}
    """
    try:
        jfs = await storage.JUICEFS_CLIENT()

        source_path = None
        if model_source_type == ModelRegisterSourceType.NOTEBOOK.value:
            # 构建源路径（notebook任务输出）
            unregistered_base = StoragePath.NOTEBOOK_WORK.format_storage_path(
                project_name=namespace,
                instance_name=f"notebook-{notebook_id}"
            )
            source_path = f"{unregistered_base}{notebook_path}"
        else:
            # 构建源路径（训练任务输出）
            unregistered_base = StoragePath.UNREGISTERED_TRAINED_MODELS.format_storage_path(
                namespace=namespace,
                task_id=task_id
            )
            source_path = f"{unregistered_base}{checkpoint_name}"
        # 构建目标路径（注册模型）
        registered_base = StoragePath.REGISTERED_TRAINED_MODELS.format_storage_path(
            namespace=namespace
        )
        target_filename = f"{model_name}_{model_version}"
        target_path = f"{registered_base}{target_filename}"
        
        # 检查源路径是否存在
        if not jfs.exists(source_path):
            raise HTTPException(
                status_code=404,
                detail=f"任务输出模型不存在: {source_path}"
            )
        
        # 检查目标路径是否已存在
        if jfs.exists(target_path):
            raise HTTPException(
                status_code=409,
                detail=f"注册模型已存在: {target_path}"
            )
        
        # 确保目标目录存在
        target_dir = os.path.dirname(target_path)
        if target_dir and not jfs.exists(target_dir):
            try:
                jfs.makedirs(target_dir, exist_ok=True)
                logger.info(f"成功创建注册模型目录: {target_dir}")
            except Exception as e:
                logger.error(f"创建注册模型目录失败: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"创建注册模型目录失败: {str(e)}"
                )
        
        # 使用异步复制任务创建注册模型（保留原始checkpoint）
        try:
            # 返回源路径和目标路径
            if return_paths:
                return source_path, target_path
            # 兼容旧版本，使用异步复制任务创建注册模型
            if start_async_copy:
                tenant_id = app_runtime_context.get_tenant_id()
                copy_registered_model_async.apply_async(
                    args=[source_path, target_path, tenant_id, trained_model_id]
                )
                logger.info(f"已提交模型复制任务: {source_path} -> {target_path}")
            return target_path
            
        except Exception as e:
            logger.error(f"注册模型失败: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"注册模型失败: {str(e)}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"模型注册操作失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"模型注册操作失败: {str(e)}"
        )


async def register_trained_model_lora(
        storage: StorageService,
        namespace: str,
        trained_model: TrainedModelCreate,
        trained_id:int
) -> str:
    """
    注册训练模型：为lora合并任务创建yaml的模型存储位置
    
    Args:
        storage: 存储服务实例
        namespace: 项目命名空间
        trained_model: 模型创建信息
        trained_id: trained_id

    Returns:
        str: 注册模型的存储路径
        
    Raises:
        HTTPException: 如果操作失败
    """
    try:
        jfs = await storage.JUICEFS_CLIENT()
        
        # 构建源路径（训练任务输出）
        unregistered_base = StoragePath.UNREGISTERED_TRAINED_MODELS.format_storage_path(
            namespace=namespace,
            task_id=trained_model.task_id
        )
        source_path = f"{unregistered_base}{trained_model.checkpoint}"

        # 构建目标路径（注册模型）
        registered_base = StoragePath.MERGE_TRAINED_MODELS.format_storage_path(
            namespace=namespace
        )
        target_filename = f"{trained_model.name}_{trained_model.model_version}"
        target_path = f"{registered_base}{target_filename}"
        
        # 检查源路径是否存在
        if not jfs.exists(source_path):
            raise HTTPException(
                status_code=404,
                detail=f"训练任务输出模型不存在: {source_path}"
            )
        
        # 检查目标路径是否已存在
        if jfs.exists(target_path):
            raise HTTPException(
                status_code=409,
                detail=f"注册模型已存在: {target_path}"
            )
        
        # 确保目标目录存在
        target_dir = os.path.dirname(target_path)
        if target_dir and not jfs.exists(target_dir):
            try:
                jfs.makedirs(target_dir, exist_ok=True)
                logger.info(f"成功创建注册模型目录: {target_dir}")
            except Exception as e:
                logger.error(f"创建注册模型目录失败: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"创建注册模型目录失败: {str(e)}"
                )
        
        # 使用软链接创建注册模型（保留原始checkpoint）
        try:
            logger.info("开始生成训练配置...")
            template = MergeConfigConverter.to_llama_factory_config(base_model_name=trained_model.base_model_name,
                                                                    model_provider=trained_model.model_provider)
            # 使用转换器将API配置转换为内部配置
            yaml_content = MergeConfigConverter.api_to_llama_factory(trained_model, template).to_yaml()

            logger.info("训练配置生成完成")
            logger.debug(f"配置内容预览: {yaml_content[:500]}...")

            # 存储配置到JuiceFS
            config_path = await _store_config(yaml_content, jfs, namespace, trained_id)

            logger.info(f"训练配置已成功生成并存储: {config_path}")
            return target_path
            
        except Exception as e:
            logger.error(f"注册训练模型失败: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"注册训练模型失败: {str(e)}"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"模型注册操作失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"模型注册操作失败: {str(e)}"
        )


async def unregister_trained_model(
    storage: StorageService,
    registered_model_path: str
) -> bool:
    """
    注销训练模型：删除注册模型（软链接或实际目录）
    
    Args:
        storage: 存储服务实例
        registered_model_path: 注册模型路径
        
    Returns:
        bool: 是否操作成功
        
    Note:
        使用remove删除，适用于软链接和实际目录
    """
    try:
        jfs = await storage.JUICEFS_CLIENT()
        
        if not jfs.exists(registered_model_path):
            logger.warning(f"注册模型不存在，跳过删除: {registered_model_path}")
            return True
        
        # 使用rmr统一删除（支持软链接和目录）
        jfs.rmr(registered_model_path)
        logger.info(f"成功删除注册模型: {registered_model_path}")
        
        return True
        
    except Exception as e:
        logger.error(f"注销训练模型失败: {str(e)}")
        return False


async def cleanup_training_task(
    storage: StorageService,
    namespace: str,
    task_id: int,
    registered_models: list = None
) -> bool:
    """
    清理整个训练任务，包括模型文件、配置文件、数据集等所有相关文件
    
    Args:
        storage: 存储服务实例
        namespace: 项目命名空间
        task_id: 训练任务ID
        registered_models: 关联的注册模型列表，从数据库查询获得
                          格式: [{"path": "注册模型路径", "checkpoint": "checkpoint名"}]
        
    Returns:
        bool: 是否清理成功
        
    Note:
        1. 清理整个训练任务目录，包括模型、配置、数据集等所有文件
        2. 如果有关联的注册模型，会先将这些模型保留（转移到注册位置）
        3. registered_models应该从数据库中查询TrainedModel表获得，不依赖文件系统自动发现
    """
    try:
        jfs = await storage.JUICEFS_CLIENT()
        
        # 构建训练任务根目录路径
        task_root_path = StoragePath.TRAINING_TASK_ROOT.format_storage_path(
            namespace=namespace,
            task_id=task_id
        )
        
        # 检查训练任务目录是否存在
        if not jfs.exists(task_root_path):
            logger.info(f"训练任务目录不存在，无需清理: {task_root_path}")
            return True
        
        logger.info(f"开始清理训练任务: task_{task_id}")
        logger.info(f"  - 任务根目录: {task_root_path}")
        
        # 模型目录路径（用于处理注册模型）
        models_path = StoragePath.UNREGISTERED_TRAINED_MODELS.format_storage_path(
            namespace=namespace,
            task_id=task_id
        )
        
        # 注册模型列表应该从数据库查询获得，不需要自动发现
        
        # 处理关联的注册模型（保留这些模型）
        if registered_models and jfs.exists(models_path):
            logger.info(f"处理 {len(registered_models)} 个注册模型...")
            for model_info in registered_models:
                registered_path = model_info["path"]
                checkpoint_name = model_info["checkpoint"]
                source_path = f"{models_path}{checkpoint_name}"
                
                try:
                    # 检查原始检查点目录是否存在
                    if jfs.exists(source_path):
                        # 检查注册模型是否存在
                        if jfs.exists(registered_path):
                            # 读取软链接指向的路径
                            try:
                                link_target = jfs.readlink(registered_path)
                                
                                # 处理相对路径：将相对路径转换为绝对路径进行比较
                                if not link_target.startswith('/'):
                                    # 相对路径：基于注册模型目录计算绝对路径
                                    import os
                                    registered_dir = os.path.dirname(registered_path)
                                    absolute_link_target = os.path.normpath(os.path.join(registered_dir, link_target))
                                else:
                                    # 已经是绝对路径
                                    absolute_link_target = link_target
                                
                                if absolute_link_target == source_path:
                                    # 删除软链接
                                    jfs.rmr(registered_path)
                                    logger.info(f"删除软链接: {registered_path}")
                                    
                                    # 将原始目录rename到注册模型位置
                                    jfs.rename(source_path, registered_path)
                                    logger.info(f"保留注册模型，转移到: {source_path} -> {registered_path}")
                                else:
                                    logger.warning(f"软链接目标不匹配，跳过: {registered_path} -> {link_target} (绝对路径: {absolute_link_target}), 期望: {source_path}")
                                    
                            except Exception as link_error:
                                # 如果不是软链接，可能已经是实际目录，跳过
                                logger.info(f"注册模型不是软链接或已经是实际目录，跳过: {registered_path}")
                                continue
                        else:
                            logger.warning(f"注册模型路径不存在，跳过: {registered_path}")
                    else:
                        logger.warning(f"原始检查点目录不存在，跳过: {source_path}")
                            
                except Exception as model_error:
                    logger.error(f"处理注册模型失败: {model_info}, 错误: {str(model_error)}")
                    continue
        
        # 清理整个训练任务目录（一次性删除所有相关文件）
        if jfs.exists(task_root_path):
            jfs.rmr(task_root_path)
            logger.info(f"训练任务清理完成: task_{task_id}")
            logger.info(f"  - 已删除整个任务目录: {task_root_path}")
        else:
            logger.info(f"训练任务目录已不存在: {task_root_path}")
        
        return True
        
    except Exception as e:
        logger.error(f"清理训练任务失败: {str(e)}")
        return False


async def get_model_storage_info(storage: StorageService, model_path: str) -> dict:
    """
    获取模型存储信息
    
    Args:
        storage: 存储服务实例
        model_path: 模型路径
        
    Returns:
        dict: 模型存储信息
    """
    try:
        jfs = await storage.JUICEFS_CLIENT()
        
        if not jfs.exists(model_path):
            return {
                "path": model_path,
                "exists": False,
                "size": 0,
                "type": "unknown",
                "is_symlink": False
            }
        
        # 获取文件统计信息
        stat_info = jfs.stat(model_path)
        
        # 判断存储类型
        storage_type = "unknown"
        if "/training/finetuned_models/" in model_path:
            storage_type = "registered"
        elif "/training/task/" in model_path and "/finetuned_models/" in model_path:
            storage_type = "unregistered"
        
        # 检查是否是软链接
        is_symlink = False
        symlink_target = None
        try:
            symlink_target = jfs.readlink(model_path)
            is_symlink = True
        except:
            # 不是软链接或读取失败
            pass
        
        result = {
            "path": model_path,
            "exists": True,
            "size": getattr(stat_info, 'size', 0),
            "type": storage_type,
            "is_directory": getattr(stat_info, 'is_dir', lambda: False)(),
            "is_symlink": is_symlink
        }
        
        if is_symlink and symlink_target:
            result["symlink_target"] = symlink_target
        
        return result
        
    except Exception as e:
        logger.error(f"获取模型存储信息失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"获取模型存储信息失败: {str(e)}"
        )


async def _store_config(yaml_content: str, jfs_client, namespace: str, trained_id: int) -> str:
    """
    存储配置到JuiceFS

    Args:
        yaml_content: YAML配置内容
        jfs_client: JuiceFS客户端实例
        namespace: 命名空间
        trained_id: trained_id

    Returns:
        str: 存储的配置文件路径

    Raises:
        RuntimeError: 当存储失败时抛出
    """
    logger.info("开始存储训练配置到JuiceFS...")

    # 构建实际的配置文件路径
    config_path = StoragePath.TRAINING_MERGE_CONFIGS.format_storage_path(
        namespace=namespace,
        task_id=trained_id
    )

    try:
        # 确保远程目录存在
        import os
        remote_dir = os.path.dirname(config_path)
        if remote_dir:
            try:
                jfs_client.makedirs(remote_dir, exist_ok=True)
            except Exception as e:
                logger.warning(f"创建目录失败: {e}")
                # 继续执行，因为目录可能已经存在

            # 将内容写入文件
            with jfs_client.open(config_path, 'w') as remote_file:
                remote_file.write(yaml_content)
                remote_file.flush()

        logger.info(f"训练配置已存储到: {config_path}")
        return config_path
    except Exception as e:
        logger.error(f"写入配置内容失败: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"YAML配置存储失败，无法创建模型合并任务: {str(e)}")
