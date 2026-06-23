"""
数据权限相关常量定义

统一管理数据权限相关的常量，避免魔法值
"""

# 全局权限标识：tenant_id='0' 表示全局权限/配置
GLOBAL_TENANT_ID = "0"


class RoleType:
    """角色类型常量"""
    PLATFORM_ADMIN = 'platform_admin'  # 平台管理员
    PROJECT_ADMIN = 'project_admin'    # 项目管理员


class ScopeType:
    """作用域类型常量"""
    PLATFORM = 'platform'  # 平台级别
    PROJECT = 'project'    # 项目级别


class PermissionCode:
    """权限代码常量"""
    PROJECT_CREATE = 'project_create'      # 创建项目
    PROJECT_DELETE = 'project_delete'      # 删除项目
    PROJECT_UPDATE = 'project_update'     # 更新项目
    PROJECT_MEMBER_ADD = 'project_member_add'  # 添加项目成员
    PROJECT_MEMBER_DELETE = 'project_member_delete'  # 删除项目成员
    PROJECT_NAMESPACE_CONFIG = 'project_namespace_config'  # 配置项目自定义镜像namespace
    CLUSTER_CREATE = 'cluster_create'      # 创建集群
    CLUSTER_UPDATE = 'cluster_update'      # 更新集群
    CLUSTER_DELETE = 'cluster_delete'      # 删除集群
    STORAGE_CREATE = 'storage_create'      # 创建存储
    STORAGE_UPDATE = 'storage_update'      # 更新存储
    STORAGE_DELETE = 'storage_delete'     # 删除存储
    STORAGE_BIND_CLUSTERS = 'storage_bind_clusters'  # 绑定存储到集群
    STORAGE_UNBIND_CLUSTERS = 'storage_unbind_clusters'  # 解绑存储与集群
    IMAGE_CREATE = 'image_create'         # 创建镜像
    IMAGE_UPDATE = 'image_update'         # 更新镜像
    IMAGE_DELETE = 'image_delete'         # 删除镜像
    REPOSITORY_CREATE = 'repository_create'  # 创建模型仓库
    REPOSITORY_UPDATE = 'repository_update'  # 更新模型仓库
    REPOSITORY_DELETE = 'repository_delete'  # 删除模型仓库
    REPOSITORY_BIND_CLUSTERS = 'repository_bind_clusters'  # 绑定仓库到集群
    REPOSITORY_UNBIND_CLUSTERS = 'repository_unbind_clusters'  # 解绑仓库与集群
    CLUSTER_BIND_STORAGE = 'cluster_bind_storage'  # 集群绑定存储
    CLUSTER_BIND_REPOSITORY = 'cluster_bind_repository'  # 集群绑定仓库
    BASE_MODEL_CREATE = 'base_model_create'  # 创建基座模型
    BASE_MODEL_UPDATE = 'base_model_update'  # 更新基座模型
    TAG_CREATE = 'tag_create'  # 新增标签
    TAG_UPDATE = 'tag_update'  # 编辑标签
    TAG_DELETE = 'tag_delete'  # 删除标签
    TAG_ELEMENTS_CREATE = 'tag_elements_create'  # 新增标签元素
    TAG_ELEMENTS_UPDATE = 'tag_elements_update'  # 编辑标签元素
    TAG_ELEMENTS_DELETE = 'tag_elements_delete'  # 删除标签元素

    BUSINESS_ATTR_CREATE = 'business_attr_create'  # 创建业务属性
    BUSINESS_ATTR_DELETE = 'business_attr_delete'  # 删除业务属性


class SuperAdminAccount:
    """三元模式超级管理员账号常量"""
    SAN_YUAN_SYS_ADMIN = 'sanyuansysadmin'
    SAN_YUAN_SYS_ADMIN_B = 'sanyuansysadminb'
    
    # 所有超级管理员账号列表
    ALL_ACCOUNTS = [SAN_YUAN_SYS_ADMIN, SAN_YUAN_SYS_ADMIN_B]
