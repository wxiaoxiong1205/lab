import React, { useMemo } from 'react'
import { Alert, Card, Descriptions, Empty, Space, Typography } from 'antd'
import {
  parseGrpoTemplateYaml,
  type GrpoTrainingParameterValues,
} from '../services/grpoTrainingParameterTemplateStore'
import type { FineTuneType } from '../types/training'

const { Text } = Typography

type PreviewSection = {
  title: string
  keys: Array<keyof GrpoTrainingParameterValues>
}

const fieldLabels: Partial<Record<keyof GrpoTrainingParameterValues, string>> = {
  learningRate: '学习率',
  numEpochs: '训练轮次',
  perDeviceBatchSize: '每设备训练 Batch',
  gradientAccumulationSteps: '梯度累积步数',
  warmupRatio: '预热比例',
  useBf16: 'bf16 精度',
  gradientCheckpointing: '梯度检查点',
  maxGradNorm: '最大梯度范数',
  randomSeed: '随机种子',
  weightDecay: '权重衰减',
  numGenerations: '每题生成数量',
  maxPromptLength: 'Prompt 最大长度',
  maxCompletionLength: 'Completion 最大长度',
  temperature: '采样温度',
  topP: 'Top-p',
  topK: 'Top-k',
  repetitionPenalty: '重复惩罚',
  klCoefficient: 'KL 系数',
  clipRange: '裁剪范围',
  advantageEstimator: '优势估计方式',
  rewardNormalization: '奖励归一化',
  rewardScale: '奖励缩放系数',
  cutoffLength: '最大 Token 长度',
  preprocessingNumWorkers: '预处理进程数',
  evalStrategy: '评估策略',
  evalSteps: '评估间隔步数',
  saveStrategy: '模型保存策略',
  saveSteps: '模型保存步数',
  saveTotalLimit: '保存总数限制',
  loggingSteps: '日志记录频率',
  loraRank: 'LoRA 秩',
  loraTargetModules: 'LoRA 目标模块',
  loraAlpha: 'LoRA alpha',
  loraDropout: 'LoRA dropout',
}

const previewSections: PreviewSection[] = [
  {
    title: '训练控制',
    keys: ['learningRate', 'numEpochs', 'perDeviceBatchSize', 'gradientAccumulationSteps', 'warmupRatio', 'useBf16', 'gradientCheckpointing', 'randomSeed', 'maxGradNorm', 'weightDecay'],
  },
  {
    title: '生成采样',
    keys: ['numGenerations', 'maxPromptLength', 'maxCompletionLength', 'temperature', 'topP', 'topK', 'repetitionPenalty'],
  },
  {
    title: '策略优化',
    keys: ['klCoefficient', 'clipRange', 'advantageEstimator', 'rewardNormalization', 'rewardScale'],
  },
  {
    title: '数据处理',
    keys: ['cutoffLength', 'preprocessingNumWorkers'],
  },
  {
    title: '评估保存',
    keys: ['evalStrategy', 'evalSteps', 'saveStrategy', 'saveSteps', 'saveTotalLimit', 'loggingSteps'],
  },
  {
    title: 'LoRA 配置',
    keys: ['loraRank', 'loraTargetModules', 'loraAlpha', 'loraDropout'],
  },
]

function formatValue(value: unknown): React.ReactNode {
  if (value === undefined || value === null || value === '') {
    return <Text type="secondary">-</Text>
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }
  if (Array.isArray(value)) {
    return value.length ? value.join('、') : <Text type="secondary">-</Text>
  }
  return String(value)
}

interface GrpoTrainingParameterFormPreviewProps {
  rawContent?: string
  fineTuneType?: FineTuneType
  params?: GrpoTrainingParameterValues | Record<string, unknown>
  title?: string
}

const GrpoTrainingParameterFormPreview: React.FC<GrpoTrainingParameterFormPreviewProps> = ({
  rawContent,
  fineTuneType,
  params,
  title = '表单预览',
}) => {
  const parsed = useMemo(() => {
    if (!rawContent?.trim()) {
      return {
        fineTuneType,
        params: (params ?? {}) as GrpoTrainingParameterValues,
        error: '',
      }
    }

    try {
      return {
        ...parseGrpoTemplateYaml(rawContent),
        error: '',
      }
    } catch (error) {
      return {
        fineTuneType,
        params: (params ?? {}) as GrpoTrainingParameterValues,
        error: error instanceof Error ? error.message : 'YAML 模板解析失败',
      }
    }
  }, [fineTuneType, params, rawContent])

  const visibleSections = previewSections
    .map(section => ({
      ...section,
      keys: section.keys.filter(key => parsed.fineTuneType === 'lora' || !String(key).startsWith('lora')),
    }))
    .filter(section => section.keys.length > 0)

  return (
    <Card
      size="small"
      title={title}
      style={{ borderRadius: 14, border: '1px solid #e2e8f0', background: '#fbfdff' }}
      styles={{ body: { padding: 14 } }}
    >
      {parsed.error ? (
        <Alert type="warning" showIcon message="暂无法生成表单预览" description={parsed.error} />
      ) : Object.keys(parsed.params ?? {}).length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可预览参数" />
      ) : (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>参数类型</Text>
            <Descriptions
              size="small"
              bordered
              column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }}
              items={[
                {
                  key: 'trainingMethod',
                  label: '训练方法',
                  children: 'GRPO',
                },
                {
                  key: 'fineTuneType',
                  label: '参数类型',
                  children: parsed.fineTuneType === 'lora' ? 'LoRA微调' : parsed.fineTuneType === 'full' ? '全参微调' : '未识别参数类型',
                },
              ]}
            />
          </div>
          {visibleSections.map(section => (
            <div key={section.title}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>{section.title}</Text>
              <Descriptions
                size="small"
                bordered
                column={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 2 }}
                items={section.keys.map(key => ({
                  key,
                  label: fieldLabels[key] ?? key,
                  children: formatValue((parsed.params as Record<string, unknown>)[key]),
                }))}
              />
            </div>
          ))}
        </Space>
      )}
    </Card>
  )
}

export default GrpoTrainingParameterFormPreview
