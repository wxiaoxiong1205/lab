# 种子数据初始化模块

## 概述

这是一个模块化的数据库种子数据初始化系统。每个功能模块包含独立的数据和初始化逻辑，便于维护和扩展。

## 目录结构

```
app/init_db/
├── __init__.py          # 模块导出入口
├── init.py              # 初始化函数和主入口
├── manager.py           # SeedManager 种子数据管理器
├── README.md            # 说明文档
└── modules/             # 功能模块目录
    ├── __init__.py      # 模块注册（SEEDERS）
    ├── models/          # 模型模块
    │   ├── __init__.py
    │   ├── data.py      # 模型种子数据
    │   └── seeder.py    # ModelSeeder 初始化逻辑
    └── images/          # 镜像模块
        ├── __init__.py
        ├── data.py      # 镜像种子数据
        └── seeder.py    # ImageSeeder 初始化逻辑
```

## 使用方法

### 1. 代码中调用

```python
from app.init_db import init_all, init_models, init_images

# 初始化所有数据（需要传入 session）
await init_all(session)

# 仅初始化模型数据
await init_models()

# 仅初始化镜像数据
await init_images()
```

### 2. 命令行使用

```bash
# 初始化所有数据
python -m app.init_db.init

# 初始化指定模块
python -m app.init_db.init models
python -m app.init_db.init images
python -m app.init_db.init advanced_templates
```

## 核心组件

### SeedManager（管理器）
- `run_all(session)` - 执行所有种子数据初始化
- `run_single(name)` - 执行单个模块初始化
- 自动检查数据库连接
- 统计并输出初始化结果

### Seeder（种子管理器）
每个模块的 Seeder 类需实现：
- `name` 属性：模块名称
- `seed(session)` 方法：执行初始化逻辑
- 返回结果：`{"created": int, "skipped": int, "errors": int}`

## 如何新增模块

### 第1步：创建模块目录和文件

```bash
mkdir -p app/init_db/modules/your_module
```

创建三个文件：
- `__init__.py` - 导出 Seeder 和数据函数
- `data.py` - 定义 `get_xxx_data()` 函数返回种子数据列表
- `seeder.py` - 定义 `XxxSeeder` 类实现初始化逻辑

### 第2步：注册到模块系统

编辑 `modules/__init__.py`：

```python
from .your_module import YourSeeder

SEEDERS = [
    ModelSeeder,
    ImageSeeder,
    YourSeeder,  # 新增
]
```

### 第3步：添加便捷函数（可选）

在 `init.py` 中添加：

```python
async def init_your_module() -> bool:
    manager = SeedManager()
    result = await manager.run_single("your_module")
    return result["success"]
```

在 `__init__.py` 中导出：

```python
__all__ = [
    'init_all',
    'init_models',
    'init_images',
    'init_your_module',  # 新增
    'SeedManager',
]
```

## 注意事项

1. **模块名称**：`seeder.py` 中的 `name` 属性必须与模块目录名一致
2. **执行顺序**：在 `modules/__init__.py` 的 `SEEDERS` 列表中控制执行顺序
3. **数据库模型**：确保导入正确的数据库模型类
4. **会话传递**：`init_all()` 可复用外部 session，未传 session 时内部创建；其他函数内部创建 session
5. **重复处理**：种子管理器会自动跳过已存在的记录
6. **租户隔离**：models 和 images 模块基于 RepositoryResource 的租户ID创建数据

## 当前模块

| 模块 | 说明 | 数据源 |
|------|------|--------|
| models | 基础模型数据 | 基于 RepositoryResource 租户创建 |
| images | 镜像数据 | 基于 RepositoryResource 租户创建 |
| advanced_templates | 高级模板数据 | 基于 RepositoryResource 租户创建，YAML 文件生成 |

---

**最后更新**: 2026-06-23
