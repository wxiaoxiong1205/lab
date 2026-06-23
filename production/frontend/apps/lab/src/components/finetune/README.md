# Finetune 组件模块

本目录包含了创建微调训练任务页面的所有组件模块，将原本的大型单文件组件拆分为多个可复用的子组件。

## 组件结构

### 1. BasicConfig.tsx
**基础配置组件**
- 任务名称输入
- 任务版本显示
- 任务描述输入

### 2. ModelConfig.tsx
**模型配置组件**
- 训练类型选择
- 基础模型提供商选择
- 模型版本选择

### 3. TrainingConfig.tsx
**训练配置组件**
- 训练方法选择
- 微调类型选择
- 参数配置标签页（通过ParamTabs组件）

### 4. ParamTabs.tsx
**参数配置标签页组件**
- 基础参数：学习率、训练轮次、序列长度等
- 学习率调度：学习率调度计划、cosine策略等
- LoRA相关：LoRA秩等参数
- 评估配置：评估策略、评估间隔等
- 高级配置：梯度检查点、随机种子等
- 早停策略：早停相关参数

### 5. ResourceConfig.tsx
**资源配置组件**
- GPU卡数配置选择
- 资源使用说明

## 使用方式

```tsx
import {
  BasicConfig,
  ModelConfig,
  TrainingConfig,
  ResourceConfig
} from '@/components/finetune';

// 在页面中使用
<BasicConfig form={form} />
<ModelConfig
  form={form}
  TrainingTypeCategory={TrainingTypeCategory}
  ModelProviderCategory={ModelProviderCategory}
  modelVersions={modelVersions}
/>
<TrainingConfig
  form={form}
  TrainingMethodCategory={TrainingMethodCategory}
  labelRender={labelRender}
/>
<ResourceConfig />
```

## 重构优势

1. **模块化**：每个组件职责单一，便于维护
2. **可复用**：组件可以在其他页面中复用
3. **可测试**：每个组件可以独立测试
4. **可维护**：代码结构清晰，便于后续修改
5. **性能优化**：可以针对特定组件进行优化

## 样式保持

所有组件的样式和功能都保持与原文件完全一致，确保用户体验不受影响。
