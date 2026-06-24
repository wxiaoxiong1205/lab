# 已占用集群API对接指南

## 概述

本文档说明了新对接的 `/api/v1/repository/occupied-clusters/{repository_id}` API接口的使用方法。

## API接口信息

### 端点
```
GET /api/v1/repository/occupied-clusters/{repository_id}
```

### 参数
- `repository_id` (integer): 镜像仓库ID

### 响应格式
```json
{
  "items": [
    {
      "id": 1,
      "name": "主集群",
      "api_server": "https://k8s-api.example.com:6443",
      "status": "连接正常",
      "version": "v1.28.1",
      "bound_at": "2024-01-10T09:00:00Z",
      "is_active": true
    }
  ],
  "total": 1,
  "page": 1,
  "size": 50,
  "pages": 1
}
```

**注意**: API返回的是分页格式，前端服务层会自动处理并映射字段：
- `id` → `cluster_id`  
- `name` → `cluster_name`

### 🧪 浏览器控制台测试

您可以在浏览器控制台中直接测试API：

```javascript
// 测试API调用（请替换为实际的仓库ID）
async function testOccupiedClusters(repositoryId) {
  try {
    const { registryService } = await import('./src/services/registryService');
    const result = await registryService.getOccupiedClusters(repositoryId);
    console.log('✅ API调用成功:', result);
    console.log('📊 已绑定集群数量:', result.length);
    result.forEach((cluster, index) => {
      console.log(`  ${index + 1}. ${cluster.cluster_name} (ID: ${cluster.cluster_id})`);
    });
  } catch (error) {
    console.error('❌ API调用失败:', error);
  }
}

// 使用示例：测试仓库ID为1的已绑定集群
testOccupiedClusters(1);
```

## 前端集成

### 1. 服务层 (registryService.ts)

```typescript
import { registryService } from '../services/registryService';

// 获取仓库ID为1的已占用集群列表
const occupiedClusters = await registryService.getOccupiedClusters(1);
console.log('已占用集群:', occupiedClusters);
```

### 2. 集群绑定管理弹窗 (RegistryClusterBindingModal.tsx)

核心功能：在集群绑定管理弹窗中正确显示已绑定的集群

```typescript
// 加载已绑定集群并设置为Transfer组件的targetKeys
const [availableClustersResult, occupiedClusters] = await Promise.all([
  registryService.getAvailableClusters({
    name: registryName,
    page: 1,
    size: 50
  }),
  registryService.getOccupiedClusters(registryId)
]);

// 设置已绑定的集群作为targetKeys
const boundClusterIds = occupiedClusters.map(cluster => cluster.cluster_id.toString());
setTargetKeys(boundClusterIds);
```

**Transfer组件配置**:
- 左侧显示：可用集群列表
- 右侧显示：已绑定集群列表（通过targetKeys控制）
- 支持拖拽绑定和解绑操作

## 类型定义

### OccupiedCluster 接口

```typescript
interface OccupiedCluster {
  cluster_id: number;        // 集群ID
  cluster_name: string;      // 集群名称
  api_server?: string;       // Kubernetes API服务器地址
  status?: string;           // 集群状态（如 "online", "offline"）
  bound_at?: string;         // 绑定时间（ISO 8601格式）
  is_active?: boolean;       // 是否处于激活状态
}
```

## 功能特性

### 1. 集群绑定状态同步
- 自动获取仓库的已绑定集群列表
- Transfer组件右侧准确显示已绑定的集群
- 支持实时的绑定和解绑操作

### 2. 并行数据加载
- 同时获取可用集群和已绑定集群数据
- 优化加载性能，减少用户等待时间
- 确保数据的一致性和准确性

### 3. 完整的类型安全
- TypeScript类型定义完善
- 编译时错误检查
- 良好的代码提示和自动补全

## 使用场景

### 1. 集群绑定管理弹窗
- 在 Transfer 组件中正确显示已绑定的集群（右侧列表）
- 支持拖拽绑定和解绑操作
- 实时同步绑定状态
- 并行加载可用集群和已绑定集群数据

### 2. 仓库集群状态查询
- 获取指定仓库的已绑定集群列表
- 提供详细的集群状态信息
- 支持集群绑定时间和激活状态查询

## 注意事项

### 1. 认证要求
- 需要有效的JWT令牌
- 确保用户有访问指定仓库的权限

### 2. 数据格式
- 所有时间字段使用ISO 8601格式
- 集群ID为整数类型
- 可选字段可能为空或未定义

### 3. 错误处理
- 仓库不存在时返回404错误
- 权限不足时返回403错误
- 网络异常时进行重试机制

## 更新日志

### 2024年12月21日 - v1.0.0
- ✅ 新增 `getOccupiedClusters` API对接
- ✅ 更新 `RegistryClusterBindingModal` 组件，正确显示已绑定集群
- ✅ 在集群绑定弹窗中并行加载可用集群和已绑定集群数据
- ✅ 完善类型定义和文档说明

### 技术实现文件
- `src/services/registryService.ts` - API服务层
- `src/types/index.ts` - 类型定义
- `src/components/registry/RegistryClusterBindingModal.tsx` - 集群绑定组件
- `project_doc/api-specification.md` - API规范文档 