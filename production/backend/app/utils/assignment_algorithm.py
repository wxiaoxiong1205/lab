"""
多人标注分配算法工具类

核心功能：
1. 精确分配算法：使用hash排序+精确分配，确保分配数量100%精确匹配
2. 本地文件缓存管理：平衡性能和资源占用
3. 按需计算：适合大任务场景，避免内存压力
"""
import hashlib
import json
import os
import tempfile
from typing import List, Dict, Optional, Tuple
from pathlib import Path


def build_precise_assignment_cache(
    user_ids: List[int],
    assign_counts: List[int],
    random_seed: int
) -> Dict[int, int]:
    """
    构建精确分配缓存
    
    算法步骤：
    1. 计算所有样本的hash值
    2. 按hash值排序（确定性的排序）
    3. 按照分配数量精确分配给用户
    4. 返回 {row_number: user_id} 的映射
    
    时间复杂度：O(n log n) - 排序
    空间复杂度：O(n) - 存储映射表
    
    Args:
        user_ids: 用户ID列表
        assign_counts: 每个用户的分配数量列表
        random_seed: 随机种子
    
    Returns:
        分配映射字典 {row_number: user_id}
    """
    total_samples = sum(assign_counts)
    
    # 1. 计算所有样本的hash值
    sample_hashes = []
    for row_number in range(1, total_samples + 1):
        hash_value = int(hashlib.md5(f"{row_number}_{random_seed}".encode()).hexdigest(), 16)
        sample_hashes.append((row_number, hash_value))
    
    # 2. 按hash值排序（稳定排序，相同hash值保持原有顺序）
    sample_hashes.sort(key=lambda x: (x[1], x[0]))  # 先按hash值，再按row_number排序
    
    # 3. 按照分配数量精确分配给用户
    assignment_cache = {}
    sample_index = 0
    
    for user_index, count in enumerate(assign_counts):
        user_id = user_ids[user_index]
        for _ in range(count):
            row_number = sample_hashes[sample_index][0]
            assignment_cache[row_number] = user_id
            sample_index += 1
    
    return assignment_cache


class LocalFileCacheManager:
    """
    本地临时文件缓存管理器
    """
    
    def __init__(self, cache_dir: Optional[str] = None):
        """
        初始化缓存管理器
        
        Args:
            cache_dir: 缓存目录，默认使用系统临时目录
        """
        if cache_dir is None:
            cache_dir = os.path.join(tempfile.gettempdir(), "assignment_cache")
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_cache_file_path(self, task_id: int, role: str) -> Path:
        """获取缓存文件路径"""
        filename = f"assignment_{task_id}_{role}.json"
        return self.cache_dir / filename
    
    def save_cache(
        self,
        task_id: int,
        role: str,
        assignment_cache: Dict[int, int]
    ) -> bool:
        """
        保存分配缓存到本地文件
        
        Args:
            task_id: 任务ID
            role: 角色（annotator/auditor）
            assignment_cache: 分配缓存字典
        
        Returns:
            是否保存成功
        """
        try:
            cache_file = self._get_cache_file_path(task_id, role)
            
            # 写入文件（原子操作：先写临时文件，再重命名）
            # 注意：JSON的key必须是字符串，所以需要转换
            temp_file = cache_file.with_suffix('.tmp')
            with open(temp_file, 'w', encoding='utf-8') as f:
                json.dump({str(k): v for k, v in assignment_cache.items()}, f)
            
            # 原子重命名
            temp_file.replace(cache_file)
            
            return True
        except Exception as e:
            return False
    
    def load_cache(
        self,
        task_id: int,
        role: str
    ) -> Optional[Dict[int, int]]:
        """
        从本地文件加载分配缓存
        
        Args:
            task_id: 任务ID
            role: 角色（annotator/auditor）
        
        Returns:
            分配缓存字典，如果文件不存在返回None
        """
        try:
            cache_file = self._get_cache_file_path(task_id, role)
            
            if not cache_file.exists():
                return None
            
            with open(cache_file, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
                # 将key从字符串转换回整数
                return {int(k): v for k, v in loaded.items()}
        except Exception as e:
            return None
    
    def get_or_build_cache(
        self,
        task_id: int,
        role: str,
        user_ids: List[int],
        assign_counts: List[int],
        random_seed: int
    ) -> Dict[int, int]:
        """
        获取或构建缓存（智能方法）
        
        如果文件存在，直接加载；如果不存在，重新计算并保存
        
        Args:
            task_id: 任务ID
            role: 角色
            user_ids: 用户ID列表
            assign_counts: 分配数量列表
            random_seed: 随机种子
        
        Returns:
            分配缓存字典
        """
        # 1. 尝试加载缓存
        cache = self.load_cache(task_id, role)
        
        # 2. 如果不存在，重新计算并保存
        if cache is None:
            cache = build_precise_assignment_cache(user_ids, assign_counts, random_seed)
            self.save_cache(task_id, role, cache)
        
        return cache
    
    def delete_cache(self, task_id: int, role: str) -> bool:
        """删除缓存文件"""
        try:
            cache_file = self._get_cache_file_path(task_id, role)
            if cache_file.exists():
                cache_file.unlink()
            return True
        except Exception as e:
            return False


def get_user_assigned_rows(
    user_id: int,
    user_ids: List[int],
    assign_counts: List[int],
    random_seed: int,
    assignment_cache: Optional[Dict[int, int]] = None
) -> List[int]:
    """
    获取分配给指定用户的所有row_number列表
    
    Args:
        user_id: 用户ID
        user_ids: 所有用户ID列表
        assign_counts: 每个用户的分配数量列表
        random_seed: 随机种子
        assignment_cache: 预先构建的分配缓存（可选）
    
    Returns:
        分配给该用户的row_number列表（已排序）
    """
    if assignment_cache is None:
        assignment_cache = build_precise_assignment_cache(
            user_ids, assign_counts, random_seed
        )
    
    # 筛选出分配给当前用户的row_number
    user_assigned_rows = [
        row_number for row_number, assigned_user in assignment_cache.items()
        if assigned_user == user_id
    ]
    user_assigned_rows.sort()  # 排序，保证分页的一致性
    
    return user_assigned_rows


def calculate_assigned_user(
    row_number: int,
    assignment_cache: Dict[int, int],
    default_user_id: Optional[int] = None
) -> Optional[int]:
    """
    从缓存中查询分配结果（O(1)）
    
    Args:
        row_number: 样本行号（从1开始）
        assignment_cache: 分配缓存字典
        default_user_id: 默认用户ID（如果row_number不在缓存中）
    
    Returns:
        分配的用户ID，如果不存在返回None或default_user_id
    """
    return assignment_cache.get(row_number, default_user_id)
