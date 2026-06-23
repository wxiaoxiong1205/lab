"""
训练模型存储管理工具
使用JuiceFS rename操作实现高效的模型存储管理
"""

import os
import re
import time
from enum import Enum
from typing import Optional
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status

from app.core import settings
from app.models import TrainingTask, BaseModel, TrainedModel
from app.schemas import TrainedModelCreate
from app.schemas.model import MergeConfigConverter, BelleModelType
from app.schemas.resource_config import GraphicsCardResourceConfig
from app.tasks.training_tasks import find_image
from app.utils.belle_util import BelleUtil
from app.utils.storage_enum import StoragePath
from app.core.logging import logger
from app.services.storage.interface import StorageService

class BelleFileType(str,Enum):
    FILE = "file" # 文件
    FOLDER = "folder" # 文件夹

async def register_trained_model(
    belle_task_id: int,
    checkpoint_name: str
) -> Optional[str]:
    """
    注册训练模型：获取百丽模型产物minio_url
    
    Args:
        belle_task_id: 百丽训练任务id
        checkpoint_name: checkpoint目录名（如 checkpoint-1000）
        
    Returns:
        str: 模型的存储路径
        
    Raises:
        HTTPException: 如果操作失败
    """
    try:
        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()
        result = await belle_client.get_train_task_output_url(belle_task_id, checkpoint_name, BelleFileType.FOLDER.value)
        if result:
            return result.get("minio_url").rstrip("/")
        return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"模型地址获取失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"模型地址获取失败: {str(e)}"
        )


async def register_trained_model_lora(
        storage: StorageService,
        task:TrainingTask,
        namespace: str,
        trained_model: TrainedModelCreate,
        trained_id:int,
        belle_task_id:int
) -> str:
    """
    注册训练模型：为lora合并任务创建yaml的模型存储位置
    
    Args:
        storage: 存储服务实例
        task: 训练任务
        namespace: 项目命名空间
        trained_model: 模型创建信息
        trained_id: trained_id
        belle_task_id: belle_task_id

    Returns:
        str: 注册lora merge模型的config
        
    Raises:
        HTTPException: 如果操作失败
    """
    try:
        jfs = await storage.JUICEFS_CLIENT()
        # 检查belle源路径是否存在
        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()
        result = await belle_client.get_train_task_output_url(belle_task_id, trained_model.checkpoint,
                                                              BelleFileType.FOLDER.value)
        if not result:
            raise HTTPException(status_code=404, detail=f"lora模型权重不存在：{task.name}/{task.version}/{trained_model.checkpoint}")

        # 生成训练merge配置
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
            return config_path
            
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


async def _create_belle_merge_task_async_impl(db: AsyncSession, namespace: str,
                                              task: TrainingTask, merge_task: TrainedModel,
                                              tenant_id: str = None):
    """
        百丽训练lora merge实现

        Args:
        task_id: 任务ID
        namespace: 项目命名空间
        task_data: 训练任务数据
        merge_task: 训练合并任务
        tenant_id: 租户ID（Celery worker 进程需要，用于构建正确的存储路径）

        返回:
            Job名称
        """
    try:
        # 获取百丽api客户端
        belle_client = await BelleUtil.get_instance_with_token()

        # 1、没有数据集
        datasets = []

        if not tenant_id:
            raise HTTPException(
            status_code=500,
            detail=f"租户信息缺失，无法生成可访问的下载链接"
        )
            
        download_prefix_path = f'{settings.BACKEND_URL}/api/v1/storage/download/{tenant_id}'

        # 2、把jfs上config_files文件config_path，生成http访问连接
        config_path = StoragePath.TRAINING_MERGE_CONFIGS.format_storage_path(
            namespace=namespace,
            task_id=merge_task.id
        )
        config_files = [
            {
                "config_url": f"{download_prefix_path}{config_path}",
                "file_name": os.path.basename(StoragePath.TRAINING_MERGE_CONFIGS.mount_path),
                "file_format": "yml",
                "pod_path": os.path.dirname(StoragePath.TRAINING_MERGE_CONFIGS.mount_path)
            }
        ]
        # 3、base_models
        result = await db.execute(select(BaseModel).filter(BaseModel.id == task.base_model.get("base_model_id")))
        base_model = result.scalar_one_or_none()

        if not base_model:
            raise HTTPException(status_code=404, detail=f"基础模型不存在：{base_model.id}")

        result = await belle_client.get_train_task_output_url(int(task.lab_k8s_uuid), merge_task.checkpoint, BelleFileType.FOLDER.value)
        if not result:
            raise HTTPException(status_code=404, detail=f"lora模型权重不存在：{task.name}/{task.version}")

        base_models = [
            {
                "model_path": base_model.model_path,
                "pod_path": f"{StoragePath.BASE_MODELS.mount_path}{base_model.model_provider}/{base_model.name}",
                "type": "dir"
            },
            {
                "model_path": result.get("minio_url").rstrip("/"),
                "pod_path": f"{StoragePath.UNREGISTERED_TRAINED_MODELS.mount_path}{merge_task.checkpoint}",
                "type": "dir"
            }
        ]
        # 4、env_variables
        env_variables= [
            {
                "var_key": "TASK_ID",
                "var_value": str(merge_task.id)
            }
        ]
        raw_graphics_card_resource = merge_task.graphics_card_resource or task.graphics_card_resource
        if not raw_graphics_card_resource:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="LoRA 模型必须填写资源配置"
            )

        graphics_card_resource = raw_graphics_card_resource
        if isinstance(raw_graphics_card_resource, dict):
            graphics_card_resource = GraphicsCardResourceConfig(**raw_graphics_card_resource)

        card_type = (
            graphics_card_resource.card_type.value
            if isinstance(graphics_card_resource.card_type, Enum)
            else graphics_card_resource.card_type
        )
        card_model = (
            graphics_card_resource.card_model.value
            if isinstance(graphics_card_resource.card_model, Enum)
            else graphics_card_resource.card_model
        )
        card_memory_match = re.match(r"\d+", str(graphics_card_resource.card_memory or ""))
        if not card_memory_match:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="资源配置缺少有效的显存大小 card_memory"
            )

        # 5、resource_requirement组装，和模型训练任务保持一致，直接使用选定资源
        resource_requirement = {
            "cpu": graphics_card_resource.cpu,
            "gpu_brand": card_type,
            "gpu_count": graphics_card_resource.count,
            "gpu_memory_per_card": int(card_memory_match.group()),
            "gpu_model": card_model,
            "gpu_usage": "multi_card_single_node" if graphics_card_resource.count > 1 else "single_card",
            "memory": graphics_card_resource.memory
        }
        # 6、根据选择的resource_requirement，中获取group_id，组装queue_config
        queue_config = {
            "group_id": graphics_card_resource.queue_group_id
        }
        # 6、固定的output_config
        output_config={
            "output_dir": os.path.dirname(StoragePath.MERGE_TRAINED_MODELS.mount_path)  # 固定的
        }
        # 7、总体整理参数
        data = {
            "name": merge_task.name,
            "model_name": f"{base_model.name}_{int(time.time())}",
            "model_type": BelleModelType.TEXT_GENERATION.value,
            "model_version": merge_task.model_version,
            "docker_image": await find_image(task.project_id, card_type, card_model),
            "description": merge_task.description if merge_task.description else merge_task.name,
            "run_command": "llamafactory-cli export /data/configs/merge_config.yaml",

            "datasets":datasets,
            "config_files":config_files,
            "base_models":base_models,
            "env_variables":env_variables,
            "output_config": output_config,
            "resource_requirement":resource_requirement,
            "queue_config":queue_config,
            "callback": {},
            "train_script": {},
            "create_user": "system",
        }
        logger.info(f"belle训练请求参数：{data}")

        result = await belle_client.create_train_task(data)
        logger.info(f"百丽创建完成{result}")
        return result
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
