# 多数据库支持指南

本项目支持MySQL和PostgreSQL两种数据库系统。以下指南将帮助您配置和使用不同的数据库后端。

## 配置数据库类型

系统默认使用MySQL作为数据库后端。要更改数据库类型，您需要修改环境变量：

```bash
# 在.env文件中设置
DATABASE_TYPE=postgresql  # 可选值：mysql 或 postgresql
DATABASE_URL=postgresql://user:password@localhost:5432/database_name
```

## 连接字符串格式

### MySQL

MySQL连接字符串的格式如下：

```
mysql://username:password@host:port/database_name
```

完整的例子（带驱动程序）：

```
mysql+aiomysql://username:password@host:port/database_name
```

注意：如果您只提供`mysql://`前缀，系统会自动添加`aiomysql`驱动程序。

### PostgreSQL

PostgreSQL连接字符串的格式如下：

```
postgresql://username:password@host:port/database_name
```

完整的例子（带驱动程序）：

```
postgresql+asyncpg://username:password@host:port/database_name
```

注意：如果您只提供`postgresql://`或`postgres://`前缀，系统会自动添加`asyncpg`驱动程序。

## 使用Docker Compose运行

本项目提供了两个Docker Compose配置文件，分别用于MySQL和PostgreSQL：

### 使用MySQL（默认）

```bash
docker-compose up -d
```

### 使用PostgreSQL

```bash
docker-compose -f docker-compose.postgres.yml up -d
```

## 数据库迁移

在不同数据库类型之间迁移数据可能会有一些挑战，特别是考虑到不同数据库系统之间的细微差别。我们建议使用以下步骤进行迁移：

### 从MySQL迁移到PostgreSQL

1. 确保您的PostgreSQL实例已运行并创建了目标数据库。
2. 使用迁移工具导出MySQL数据并导入到PostgreSQL（例如使用pgloader）：

```bash
# 安装pgloader（如果需要）
sudo apt-get install pgloader  # Ubuntu/Debian
brew install pgloader         # MacOS with Homebrew

# 使用pgloader进行迁移
pgloader mysql://user:password@localhost:3306/source_db postgresql://user:password@localhost:5432/target_db
```

3. 修改应用程序配置以使用PostgreSQL。
4. 重启应用程序。

### 从PostgreSQL迁移到MySQL

1. 确保您的MySQL实例已运行并创建了目标数据库。
2. 使用pg_dump导出PostgreSQL数据：

```bash
pg_dump -U postgres -F c -b -v -f database.dump database_name
```

3. 使用适当的工具将数据导入MySQL（可能需要转换步骤）。
4. 修改应用程序配置以使用MySQL。
5. 重启应用程序。

## 数据库特定的考虑事项

### MySQL

- 默认引擎：InnoDB
- 默认字符集：utf8mb4
- 默认排序规则：utf8mb4_unicode_ci

### PostgreSQL

- 支持的版本：12+
- 默认排序规则：根据安装时的数据库集群设置

## 故障排查

### 连接问题

- 确认数据库服务器正在运行
- 验证连接字符串格式是否正确
- 检查用户名/密码是否正确
- 确保数据库用户有适当的权限
- 检查网络连接和防火墙设置

### 迁移问题

如果在运行数据库迁移时遇到问题：

1. 检查数据库类型是否正确配置
2. 确保数据库URL格式正确
3. 查看日志以获取详细错误信息
4. 使用正确的数据库驱动程序

## 开发注意事项

开发新功能时，请注意以下几点：

1. 避免使用特定数据库的SQL功能，除非绝对必要
2. 使用SQLAlchemy ORM而不是直接SQL
3. 如果必须使用原生SQL，请使用`dialect_utils.py`中的工具来处理不同方言
4. 编写新的数据库迁移时，请测试两种数据库类型
5. 在开发环境中测试PostgreSQL和MySQL两种配置 