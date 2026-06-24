# 测试用例实现指南

## 概述

本文档基于当前项目测试用例的实际实现，提供测试开发的标准化指南和最佳实践。通过分析 `app/tests/` 目录下的测试代码，总结了测试架构、设计模式和实现规范，为后续功能的测试用例开发提供参考。

## 测试架构概览

### 1. 测试基础设施

项目采用分层的测试架构，核心组件包括：

```
app/tests/
├── base_test.py          # 测试基类和工具类
├── conftest.py           # pytest配置和依赖注入
├── test_config.py        # 测试环境配置
├── pytest.ini           # pytest基础配置
├── test_user.py          # 用户模块测试
├── test_project.py       # 项目模块测试
├── test_llm_config.py    # LLM配置模块测试
└── __init__.py
```

### 2. 核心技术栈

- **测试框架**: pytest
- **HTTP客户端**: FastAPI TestClient
- **数据库**: PostgreSQL（专用测试数据库）
- **异步支持**: asyncio + AsyncSessionAdapter
- **数据库ORM**: SQLAlchemy
- **认证**: JWT Bearer Token

## 测试基础设施详解

### 1. BaseTestCase 基类

所有测试类都应继承 `BaseTestCase`，提供统一的测试基础设施：

```python
class TestUserFeature(BaseTestCase):
    def test_some_feature(self, test_client, override_get_db, override_get_auth_db_session, db_session):
        # 使用self.data_factory创建测试数据
        # 使用self.auth_helper处理认证
        # 使用self.cleanup_*方法清理数据
```

**核心功能:**
- `data_factory`: 统一的测试数据生成工具
- `auth_helper`: 认证相关操作助手
- 数据清理方法: `cleanup_users()`, `cleanup_projects()`
- 断言助手: `assert_user_response()`, `assert_project_response()`

### 2. TestDataFactory 数据工厂

负责生成唯一、一致的测试数据：

```python
# 生成用户数据
user_data = self.data_factory.user_data("prefix")
# 生成管理员数据  
admin_data = self.data_factory.admin_data("admin_prefix")
# 生成项目数据
project_data = self.data_factory.project_data("project_prefix")
```

**设计特点:**
- 使用微秒时间戳确保数据唯一性
- 支持参数自定义覆盖默认值
- 提供不同类型数据的专用方法

### 3. TestAuthHelper 认证助手

简化测试中的认证流程：

```python
# 注册用户
user_info = self.auth_helper.register_user(test_client, user_data)

# 用户登录
token = self.auth_helper.login_user(test_client, username, password)

# 一步创建认证用户
user_info, token = self.auth_helper.create_authenticated_user(test_client, user_data)

# 获取认证头
headers = self.auth_helper.get_auth_headers(token)
```

### 4. 数据库会话管理

使用 `AsyncSessionAdapter` 解决异步兼容性问题：

```python
class AsyncSessionAdapter:
    """异步会话适配器，提供异步接口但内部使用同步操作"""
    def __init__(self, sync_session: Session):
        self._sync_session = sync_session
    
    async def execute(self, statement):
        return self._sync_session.execute(statement)
```

**优势:**
- 避免事件循环冲突
- 保持与异步应用的兼容性
- 使用专用测试数据库确保隔离

## 测试配置规范

### 1. pytest配置 (pytest.ini)

```ini
[pytest]
asyncio_mode = strict
asyncio_default_fixture_loop_scope = function
```

### 2. 测试数据库配置

```python
class TestSettings(Settings):
    DATABASE_TYPE: str = "postgresql"
    DB_HOST: str = "139.9.225.88"
    DB_PORT: int = 31109
    DB_NAME: str = "dataset_distillation_test_unit"
    TESTING: bool = True
```

### 3. 依赖注入配置

每个测试都需要标准的fixture参数：

```python
def test_feature(self, test_client, override_get_db, override_get_auth_db_session, db_session):
    # test_client: FastAPI测试客户端
    # override_get_db: 覆盖普通API的数据库会话
    # override_get_auth_db_session: 覆盖认证中间件的数据库会话
    # db_session: 直接数据库会话访问
```

## 测试类设计模式

### 1. 功能分组模式

按业务功能将测试用例分组为独立的测试类：

```python
class TestUserRegistration(BaseTestCase):
    """用户注册功能测试类"""
    
class TestUserLogin(BaseTestCase):
    """用户登录功能测试类"""
    
class TestUserProfile(BaseTestCase):
    """用户信息查询测试类"""
```

### 2. 测试用例命名规范

- **成功路径**: `test_功能_success`
- **权限控制**: `test_功能_permissions` 或 `test_功能_unauthorized`
- **数据验证**: `test_功能_invalid_data`
- **边界条件**: `test_功能_edge_case`
- **错误处理**: `test_功能_error_handling`

### 3. 标准测试流程

每个测试方法遵循以下结构：

```python
def test_feature_success(self, test_client, override_get_db, override_get_auth_db_session, db_session):
    """测试说明"""
    # 1. 准备测试数据
    user_data = self.data_factory.user_data("test_prefix")
    user_info, token = self.auth_helper.create_authenticated_user(test_client, user_data)
    
    try:
        # 2. 执行操作
        headers = self.auth_helper.get_auth_headers(token)
        response = test_client.post("/api/endpoint", json=data, headers=headers)
        
        # 3. 验证结果
        assert response.status_code == status.HTTP_200_OK
        response_data = response.json()
        self.assert_response_structure(response_data, expected_data)
        
    finally:
        # 4. 清理数据
        self.cleanup_users(test_client, [user_info["id"]])
```

## 测试用例实现最佳实践

### 1. 数据生成和管理

**✅ 推荐做法:**
```python
# 使用数据工厂生成唯一数据
user_data = self.data_factory.user_data("specific_test")

# 在finally块中清理数据
try:
    # 测试逻辑
    pass
finally:
    self.cleanup_users(test_client, [user_info["id"]])
```

**❌ 避免做法:**
```python
# 硬编码测试数据，可能造成冲突
user_data = {"username": "testuser", "email": "test@test.com"}

# 忘记清理数据
# 没有finally块清理
```

### 2. 认证处理

**✅ 推荐做法:**
```python
# 使用认证助手
user_info, token = self.auth_helper.create_authenticated_user(test_client, user_data)
headers = self.auth_helper.get_auth_headers(token)

# 测试未授权访问
self.check_unauthorized_access(test_client, "GET", "/api/endpoint")
```

**❌ 避免做法:**
```python
# 手动处理认证流程，代码重复
response = test_client.post("/api/v1/users/register", json=user_data)
login_response = test_client.post("/api/v1/users/login", data={"username": "...", "password": "..."})
token = login_response.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
```

### 3. 断言和验证

**✅ 推荐做法:**
```python
# 使用专用断言方法
self.assert_user_response(response_data, expected_user_data)
self.assert_pagination_response(response_data)

# 验证具体业务逻辑
assert response.status_code == status.HTTP_201_CREATED
assert "access_token" in response_data
```

**❌ 避免做法:**
```python
# 只检查状态码，不验证响应内容
assert response.status_code == 200

# 不完整的响应验证
assert "id" in response_data  # 缺少其他字段验证
```

### 4. 错误处理测试

**✅ 推荐做法:**
```python
def test_invalid_data_scenarios(self, test_client, override_get_db, override_get_auth_db_session, db_session):
    """测试各种无效数据场景"""
    user_info, token = self.auth_helper.create_authenticated_user(test_client, user_data)
    
    invalid_cases = [
        {"name": "", "description": "空名称"},
        {"name": "a" * 101, "description": "名称过长"},
        {"description": "缺少名称字段"}
    ]
    
    try:
        headers = self.auth_helper.get_auth_headers(token)
        for invalid_data in invalid_cases:
            response = test_client.post("/api/endpoint", json=invalid_data, headers=headers)
            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    finally:
        self.cleanup_users(test_client, [user_info["id"]])
```

### 5. 权限控制测试

**✅ 推荐做法:**
```python
def test_permission_control(self, test_client, override_get_db, override_get_auth_db_session, db_session):
    """测试权限控制"""
    # 创建普通用户和管理员
    user_data = self.data_factory.user_data("regular")
    admin_data = self.data_factory.admin_data("admin")
    
    user_info, user_token = self.auth_helper.create_authenticated_user(test_client, user_data)
    admin_info, admin_token = self.auth_helper.create_authenticated_user(test_client, admin_data)
    
    try:
        # 普通用户访问 - 失败
        response = test_client.get("/api/admin-endpoint", 
                                 headers=self.auth_helper.get_auth_headers(user_token))
        assert response.status_code == status.HTTP_403_FORBIDDEN
        
        # 管理员访问 - 成功
        response = test_client.get("/api/admin-endpoint", 
                                 headers=self.auth_helper.get_auth_headers(admin_token))
        assert response.status_code == status.HTTP_200_OK
    finally:
        self.cleanup_users(test_client, [user_info["id"], admin_info["id"]])
```

## 常见测试场景模板

### 1. CRUD操作测试模板

```python
class TestResourceCRUD(BaseTestCase):
    """资源CRUD操作测试"""
    
    def test_create_resource_success(self, test_client, override_get_db, override_get_auth_db_session, db_session):
        """创建资源成功"""
        user_info, token = self.auth_helper.create_authenticated_user(test_client, self.data_factory.user_data("create"))
        resource_data = {"name": "test_resource", "description": "test description"}
        
        try:
            response = test_client.post("/api/resources", 
                                      json=resource_data, 
                                      headers=self.auth_helper.get_auth_headers(token))
            assert response.status_code == status.HTTP_201_CREATED
            
            response_data = response.json()
            assert response_data["name"] == resource_data["name"]
            # 清理创建的资源
            self.cleanup_resources(test_client, [response_data["id"]], token)
        finally:
            self.cleanup_users(test_client, [user_info["id"]])
    
    def test_read_resource_success(self, test_client, override_get_db, override_get_auth_db_session, db_session):
        """读取资源成功"""
        # 类似模式...
    
    def test_update_resource_success(self, test_client, override_get_db, override_get_auth_db_session, db_session):
        """更新资源成功"""
        # 类似模式...
    
    def test_delete_resource_success(self, test_client, override_get_db, override_get_auth_db_session, db_session):
        """删除资源成功"""
        # 类似模式...
```

### 2. 权限控制测试模板

```python
class TestResourcePermissions(BaseTestCase):
    """资源权限控制测试"""
    
    def test_unauthorized_access(self, test_client, override_get_db):
        """未认证访问测试"""
        endpoints = [
            ("GET", "/api/resources"),
            ("POST", "/api/resources"),
            ("PUT", "/api/resources/1"),
            ("DELETE", "/api/resources/1")
        ]
        
        for method, url in endpoints:
            self.check_unauthorized_access(test_client, method, url)
    
    def test_role_based_access(self, test_client, override_get_db, override_get_auth_db_session, db_session):
        """基于角色的访问控制"""
        # 创建不同角色用户并测试访问权限
```

### 3. 数据验证测试模板

```python
class TestResourceValidation(BaseTestCase):
    """资源数据验证测试"""
    
    def test_required_fields_validation(self, test_client, override_get_db, override_get_auth_db_session, db_session):
        """必填字段验证"""
        user_info, token = self.auth_helper.create_authenticated_user(test_client, self.data_factory.user_data("validation"))
        
        required_fields = ["name", "type", "status"]
        
        try:
            headers = self.auth_helper.get_auth_headers(token)
            for field in required_fields:
                invalid_data = {"name": "test", "type": "test", "status": "active"}
                del invalid_data[field]
                
                response = test_client.post("/api/resources", json=invalid_data, headers=headers)
                assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        finally:
            self.cleanup_users(test_client, [user_info["id"]])
```

## 测试数据管理策略

### 1. 数据隔离原则

- 每个测试使用唯一的测试数据
- 测试完成后必须清理数据
- 使用专用测试数据库，避免影响其他环境

### 2. 数据清理最佳实践

```python
def test_complex_scenario(self, test_client, override_get_db, override_get_auth_db_session, db_session):
    """复杂场景测试"""
    # 记录所有创建的资源ID
    created_users = []
    created_projects = []
    
    try:
        # 创建测试数据
        user1_info, user1_token = self.auth_helper.create_authenticated_user(test_client, self.data_factory.user_data("user1"))
        created_users.append(user1_info["id"])
        
        project1 = self.create_project(test_client, self.data_factory.project_data("project1"), user1_token)
        created_projects.append(project1["id"])
        
        # 执行测试逻辑
        # ...
        
    finally:
        # 清理所有数据（注意清理顺序）
        if created_projects:
            self.cleanup_projects(test_client, created_projects, user1_token)
        if created_users:
            self.cleanup_users(test_client, created_users)
```

### 3. 测试数据生成策略

```python
# 为不同测试场景生成特定数据
normal_user = self.data_factory.user_data("normal")
admin_user = self.data_factory.admin_data("admin")
inactive_user = self.data_factory.user_data("inactive", is_active=False)

# 生成边界情况数据
long_name_project = self.data_factory.project_data("long", name="x" * 50)
empty_desc_project = self.data_factory.project_data("empty", description=None)
```

## 性能和维护考虑

### 1. 测试性能优化

- 使用 `scope="function"` 确保每个测试的独立性
- 优化数据库连接池配置
- 避免不必要的数据库操作

### 2. 测试维护性

- 集中管理测试数据和配置
- 使用描述性的测试名称和注释
- 定期重构重复的测试代码

### 3. 错误调试

```python
# 在测试失败时提供详细信息
def test_with_debugging(self, test_client, override_get_db, override_get_auth_db_session, db_session):
    """带调试信息的测试"""
    try:
        response = test_client.post("/api/endpoint", json=data)
        # 失败时打印详细信息
        if response.status_code != expected_status:
            print(f"Response status: {response.status_code}")
            print(f"Response body: {response.text}")
        assert response.status_code == expected_status
    except Exception as e:
        print(f"Test failed with data: {data}")
        print(f"Error: {str(e)}")
        raise
```

## 总结

本测试指南基于项目的实际测试实现，总结了以下关键原则：

1. **统一基础设施**: 使用 `BaseTestCase` 提供一致的测试基础
2. **数据工厂模式**: 通过 `TestDataFactory` 生成唯一、可控的测试数据
3. **认证助手**: 使用 `TestAuthHelper` 简化认证流程
4. **资源清理**: 在 `finally` 块中确保测试数据清理
5. **分层测试**: 按功能模块组织测试类和方法
6. **全面覆盖**: 包括成功路径、错误处理、边界条件和权限控制

遵循这些实践，可以编写出结构清晰、维护性强、可靠稳定的测试用例，为项目的持续开发提供坚实的质量保障。