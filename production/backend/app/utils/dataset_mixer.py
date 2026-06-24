"""
数据集混合工具模块
提供数据集混合、采样率处理等功能
"""

import json
import random

import os
import tempfile
import zipfile
import shutil

from typing import List, Dict, Any, Optional
from pathlib import Path
from app.core.logging import logger
class DatasetMixer:
    """数据集混合器"""
    
    def __init__(self, jfs_client):
        """
        初始化数据集混合器
        
        Args:
            jfs_client: JuiceFS客户端实例
        """
        self.jfs_client = jfs_client
    
    def mix_datasets(
        self,
        dataset_items: List[Dict[str, Any]],
        output_path: str,
        random_seed: Optional[int] = None
    ) -> str:
        """
        混合多个数据集
        
        Args:
            dataset_items: 数据集项列表，每个项包含：
                - name: 数据集名称
                - dataset_path: 数据集文件路径
                - sample_count: 原始样本数
                - sampling_rate: 采样率乘数
            output_path: 输出文件路径
            random_seed: 随机种子，用于结果重现
            
        Returns:
            str: 生成的混合数据集文件路径
            
        Raises:
            Exception: 当混合过程失败时抛出异常
        """
        if random_seed is not None:
            random.seed(random_seed)
            logger.info(f"设置随机种子: {random_seed}")
        
        logger.info(f"开始处理 {len(dataset_items)} 个数据集")
        
        # 收集所有数据集的样本
        all_samples = []
        
        for i, dataset_item in enumerate(dataset_items, 1):
            logger.info(f"处理数据集 {i}/{len(dataset_items)}: {dataset_item['name']}")
            logger.info(f"  路径: {dataset_item['dataset_path']}")
            logger.info(f"  原始样本数: {dataset_item['sample_count']}")
            logger.info(f"  采样率: {dataset_item['sampling_rate']} (乘数)")
            
            try:
                # 读取并处理数据集
                samples = self._process_single_dataset(dataset_item)
                
                # 将采样后的样本添加到总样本列表
                all_samples.extend(samples)
                logger.info(f"  添加到混合数据集: {len(samples)} 个样本")
                
            except Exception as e:
                logger.error(f"  处理数据集 {dataset_item['name']} 时出错: {e}")
                continue
        
        logger.info(f"混合数据集总样本数: {len(all_samples)}")
        
        # 打乱所有样本
        random.shuffle(all_samples)
        logger.info("样本已打乱")
        
        # 写入混合数据集
        return self._save_mixed_dataset(all_samples, output_path)
    
    def _process_single_dataset(self, dataset_item: Dict[str, Any]) -> List[List[Dict[str, Any]]]:
        """
        处理单个数据集
        
        Args:
            dataset_item: 数据集项
            
        Returns:
            List[List[Dict[str, Any]]]: 处理后的样本列表（每个元素是一个数组）
        """
        # 读取原始数据集
        with self.jfs_client.open(dataset_item['dataset_path'], 'r', encoding='utf-8') as f:
            dataset_content = f.read()
        
        logger.info(f"  原始文件大小: {len(dataset_content)} 字节")
        
        # 解析数据集（假设是JSONL格式）
        samples = self._parse_jsonl(dataset_content)
        logger.info(f"  解析成功样本数: {len(samples)}")
        
        # 应用采样率
        samples = self._apply_sampling_rate(samples, dataset_item['sampling_rate'])
        
        return samples
    
    def _parse_jsonl(self, content: str) -> List[List[Dict[str, Any]]]:
        """
        解析JSONL格式内容
        
        Args:
            content: JSONL格式的字符串内容
            
        Returns:
            List[List[Dict[str, Any]]]: 解析后的样本列表（每行是一个数组）
        """
        samples = []
        for line_num, line in enumerate(content.strip().split('\n'), 1):
            if line.strip():
                try:
                    sample = json.loads(line)
                    samples.append(sample)
                except json.JSONDecodeError:
                    logger.warning(f"  跳过无效的JSON行 {line_num}: {line[:100]}...")
                    continue
        
        return samples
    
    def _apply_sampling_rate(self, samples: List[List[Dict[str, Any]]], sampling_rate: float) -> List[List[Dict[str, Any]]]:
        """
        应用采样率
        
        Args:
            samples: 原始样本列表（每个元素是一个数组）
            sampling_rate: 采样率乘数
            
        Returns:
            List[List[Dict[str, Any]]]: 采样后的样本列表
        """
        if sampling_rate == 1.0:
            logger.info(f"  采样率为1.0，保持原始样本数: {len(samples)}")
            return samples
        
        # 计算目标样本数：原始样本数 × 采样率
        target_sample_count = int(len(samples) * sampling_rate)
        logger.info(f"  目标样本数: {len(samples)} × {sampling_rate} = {target_sample_count}")
        
        # 如果目标样本数大于原始样本数，需要重复采样
        if target_sample_count > len(samples):
            # 重复采样直到达到目标数量
            repeated_samples = []
            while len(repeated_samples) < target_sample_count:
                # 随机选择样本进行重复
                repeated_samples.extend(random.sample(samples, min(len(samples), target_sample_count - len(repeated_samples))))
            samples = repeated_samples[:target_sample_count]
            logger.info(f"  重复采样后样本数: {len(samples)}")
        else:
            # 如果目标样本数小于等于原始样本数，进行随机采样
            samples = random.sample(samples, target_sample_count)
            logger.info(f"  随机采样后样本数: {len(samples)}")
        
        return samples
    
    def _save_mixed_dataset(self, samples: List[List[Dict[str, Any]]], output_path: str) -> str:
        """
        保存混合数据集
        
        Args:
            samples: 样本列表（每个元素是一个数组）
            output_path: 输出文件路径
            
        Returns:
            str: 保存的文件路径
        """
        try:
            # 确保输出目录存在
            output_dir = Path(output_path).parent
            if not self.jfs_client.exists(str(output_dir)):
                # 这里需要根据实际的jfs客户端接口来创建目录
                # 假设有mkdir方法，如果没有可以跳过或使用其他方式
                pass
            
            # 处理样本数据格式
            processed_samples = []
            is_single_turn = True  # 假设是单轮对话，直到发现多轮对话
            
            for sample_array in samples:
                if isinstance(sample_array, list):
                    if len(sample_array) == 1:
                        # 单轮对话：提取数组中的唯一元素
                        processed_samples.append(sample_array[0])
                    else:
                        # 多轮对话：保持原数组格式
                        processed_samples.append(sample_array)
                        is_single_turn = False
                else:
                    # 如果不是数组，直接添加
                    processed_samples.append(sample_array)
                    is_single_turn = False
            
            # 写入混合数据集 - JSON格式
            with self.jfs_client.open(output_path, 'w', encoding='utf-8') as f:
                json_content = json.dumps(processed_samples, ensure_ascii=False, indent=2)
                f.write(json_content)
                f.flush()
            
            logger.info(f"成功生成混合数据集: {output_path}")
            logger.info(f"总样本数: {len(processed_samples)}")
            logger.info(f"数据格式: {'单轮对话' if is_single_turn else '多轮对话或混合格式'}")

            # 获取provider_type
            provider_type = os.getenv('PROVIDER_TYPE', 'default')
            if provider_type == 'belle':
                # 生成本地临时zip文件
                json_filename = os.path.basename(output_path)
                zip_dir_path = os.path.dirname(output_path)
                append_json_str_to_tmp_zip(json_content, zip_dir_path, json_filename)

            return output_path
            
        except Exception as e:
            logger.error(f"写入混合数据集失败: {e}")
            raise Exception(f"生成混合数据集失败: {str(e)}")

def create_mixed_dataset(
    jfs_client,
    dataset_items: List[Dict[str, Any]],
    output_path: str,
    random_seed: Optional[int] = None
) -> str:
    """
    创建混合数据集的便捷函数
    
    Args:
        jfs_client: JuiceFS客户端实例
        dataset_items: 数据集项列表
        output_path: 输出文件路径
        random_seed: 随机种子
        
    Returns:
        str: 生成的混合数据集文件路径
    """
    mixer = DatasetMixer(jfs_client)
    return mixer.mix_datasets(dataset_items, output_path, random_seed)

def append_json_str_to_tmp_zip(json_content: str, zip_dir_path: str, entry_name: str):
    """
    将内存中的单个 JSON 数据追加到本地临时 ZIP 文件。
    上传临时zip到 JFS，返回本地临时 ZIP 路径。

    Args:
        json_content: json_content
        zip_dir_path: ZIP 文件全路径
        entry_name: ZIP 内部 JSON 文件名（例如 custom_dataset.json、dataset_info.json）

    Returns:
        str: 临时 ZIP 文件本地路径
    """
    # 临时 zip 文件名（不带目录结构）
    sanitized_dir = f'/tmp/{zip_dir_path.strip("/").replace("/", "-")}'
    tmp_zip_path = os.path.join(tempfile.gettempdir(), f"{sanitized_dir}-dataset.zip")

    # 如果不存在则创建空 zip
    if not os.path.exists(tmp_zip_path):
        with zipfile.ZipFile(tmp_zip_path, "w", compression=zipfile.ZIP_DEFLATED):
            pass

    # 追加新的 JSON 内容
    with zipfile.ZipFile(tmp_zip_path, "a", compression=zipfile.ZIP_DEFLATED) as zf:
        # 如果是 jsonl，且内容实际上是 JSON Array，则转成真正 JSONL
        if entry_name.endswith(".jsonl"):
            try:
                parsed = json.loads(json_content)
                if isinstance(parsed, list):
                    json_content = "\n".join(
                        json.dumps(item, ensure_ascii=False)
                        for item in parsed
                    )
            except Exception:
                # 解析失败说明可能本来就是 jsonl
                pass
        # 如果同名文件已存在，先删除再写入
        if entry_name in zf.namelist():
            zf.fp.seek(0)  # rewind
            # 无法直接删除，通常覆盖即可
        zf.writestr(entry_name, json_content)

    # with open(tmp_path, "rb") as f_in, jfs_client.open(zip_dir_path, "wb") as f_out:
    #     shutil.copyfileobj(f_in, f_out)

    # 删除临时文件
    # os.remove(tmp_path)

    return zip_dir_path


def append_jfs_dir_to_tmp_zip(jfs_client, source_dir_path: str, zip_dir_path: str, archive_base_path: str):
    """将 JFS 目录递归追加到本地临时 ZIP 文件中。"""
    sanitized_dir = f'/tmp/{zip_dir_path.strip("/").replace("/", "-")}'
    tmp_zip_path = os.path.join(tempfile.gettempdir(), f"{sanitized_dir}-dataset.zip")

    if not os.path.exists(tmp_zip_path):
        with zipfile.ZipFile(tmp_zip_path, "w", compression=zipfile.ZIP_DEFLATED):
            pass

    def _iter_files(current_dir: str):
        try:
            entries = jfs_client.listdir(current_dir)
        except Exception:
            yield current_dir
            return

        for entry in entries:
            entry_path = os.path.join(current_dir, str(entry)).replace("\\", "/")
            yield from _iter_files(entry_path)

    with zipfile.ZipFile(tmp_zip_path, "a", compression=zipfile.ZIP_DEFLATED) as zf:
        for file_path in _iter_files(source_dir_path):
            relative_path = os.path.relpath(str(file_path), source_dir_path).replace("\\", "/")
            archive_name = os.path.join(archive_base_path, relative_path).replace("\\", "/")
            with jfs_client.open(file_path, "rb") as src_file:
                zf.writestr(archive_name, src_file.read())

    return zip_dir_path