import React from 'react'
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

// 单模型数据结构（用于详情页面）
interface SingleModelData {
  name: string
  value: number
}

// 多模型对比数据结构（用于基准评估页面）
interface MultiModelData {
  subject: string
  [key: string]: any // 支持动态的模型字段，如 modelA, modelB, modelC
}

// 模型配置
interface ModelConfig {
  key: string // 数据字段名，如 'modelA', 'modelB'
  name: string // 显示名称，如 'Qwen3-72B'
  color: string // 颜色
}

interface BenchmarkRadarChartProps {
  // 数据类型：single（单模型）或 multi（多模型对比）
  type?: 'single' | 'multi'
  // 单模型数据
  singleData?: SingleModelData[]
  // 多模型数据
  multiData?: MultiModelData[]
  // 模型配置（多模型时使用）
  modelConfigs?: ModelConfig[]
  // 模型名称（单模型时使用）
  modelName?: string
  // 图表高度
  height?: number
  // 数据范围
  domain?: [number, number]
}

const BenchmarkRadarChart: React.FC<BenchmarkRadarChartProps> = ({
  type = 'single',
  singleData,
  multiData,
  modelConfigs,
  modelName,
  height = 300,
  domain = [0, 100],
}) => {
  // 默认单模型数据
  const defaultSingleData: SingleModelData[] = [
    { name: '语义连贯性', value: 95.04 },
    { name: '内容丰富度', value: 99.83 },
    { name: '内容相关性', value: 98.21 },
    { name: '创新表达力', value: 93.21 },
    { name: '语言准确性', value: 95.21 },
  ]

  // 默认多模型数据
  const defaultMultiData: MultiModelData[] = [
    { subject: 'C-Eval', modelA: 235, modelB: 185, modelC: 280 },
    { subject: 'MMLU', modelA: 241, modelB: 220, modelC: 260 },
    { subject: 'GSM8K', modelA: 115, modelB: 190, modelC: 270 },
    { subject: 'HumanEval', modelA: 235, modelB: 200, modelC: 240 },
    { subject: 'MBPF', modelA: 352, modelB: 260, modelC: 280 },
    { subject: 'BBH', modelA: 349, modelB: 270, modelC: 250 },
  ]

  // 默认模型配置
  const defaultModelConfigs: ModelConfig[] = [
    { key: 'modelA', name: 'Model A', color: '#1890ff' },
    { key: 'modelB', name: 'Model B', color: '#52c41a' },
    { key: 'modelC', name: 'Model C', color: '#faad14' },
  ]

  // 根据类型选择数据和配置
  const chartData = type === 'single'
    ? (singleData || defaultSingleData)
    : (multiData || defaultMultiData)

  const configs = modelConfigs || defaultModelConfigs

  // 渲染单模型雷达图
  const renderSingleModelChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={chartData}>
        <PolarGrid stroke="#e0e0e0" />
        <PolarAngleAxis
          dataKey="name"
          tick={{ fill: '#666', fontSize: 12 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={domain}
          tick={{ fill: '#999', fontSize: 10 }}
        />
        <Radar
          name={modelName || ''}
          dataKey="value"
          stroke="#1890ff"
          fill="#1890ff"
          fillOpacity={0.3}
          strokeWidth={2}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
          }}
          formatter={(value: number) => `${value.toFixed(2)}`}
        />
      </RadarChart>
    </ResponsiveContainer>
  )

  // 渲染多模型对比雷达图
  const renderMultiModelChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={chartData}>
        <PolarGrid stroke="#e0e0e0" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: '#666', fontSize: 12 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={domain}
          tick={{ fill: '#999', fontSize: 10 }}
        />
        {configs.map((config) => (
          <Radar
            key={config.key}
            name={config.name}
            dataKey={config.key}
            stroke={config.color}
            fill={config.color}
            fillOpacity={0.2}
            strokeWidth={2}
          />
        ))}
        <Legend
          wrapperStyle={{
            paddingTop: '20px',
          }}
          iconType="square"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #d9d9d9',
            borderRadius: '4px',
          }}
          formatter={(value: number) => `${value.toFixed(2)}`}
        />
      </RadarChart>
    </ResponsiveContainer>
  )

  return type === 'single' ? renderSingleModelChart() : renderMultiModelChart()
}

export default BenchmarkRadarChart
