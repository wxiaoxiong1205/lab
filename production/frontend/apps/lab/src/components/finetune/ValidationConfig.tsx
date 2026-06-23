import React, { useMemo } from 'react'
import { Alert, Badge, Button, Card, Col, Radio, Row, Select, Slider, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { InfoCircleOutlined, StarFilled } from '@ant-design/icons'
import type { DatasetConfig, FinetuneDataset, ValidationConfig } from '../../types'

const { Text } = Typography
const { Option } = Select
interface ValidationConfigProps {
  value?: ValidationConfig
  onChange?: (config: ValidationConfig) => void
  availableValidationDatasets?: FinetuneDataset[]
  selectedTrainingDatasets?: DatasetConfig[] // 新增：选中的训练数据集
  disabled?: boolean
}
// 从数据集描述中提取领域信息
const extractDomain = (description: string = ''): string => {
  const domainKeywords = {
    金融: ['金融', '财务', '投资', '银行', '保险', '证券'],
    法律: ['法律', '法规', '合同', '律师', '司法'],
    医疗: ['医疗', '医学', '健康', '疾病', '药物', '诊断'],
    教育: ['教育', '培训', '教学', '学习', '课程'],
    代码: ['代码', '编程', '开发', '程序', '软件'],
    通用对话: ['对话', '聊天', '通用', '日常'],
    指令: ['指令', 'instruction', 'alpaca'],
  }
  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some((keyword) => description.toLowerCase().includes(keyword.toLowerCase()))) {
      return domain
    }
  }
  return '通用'
}
// 获取领域颜色标签
const getDomainColor = (domain: string): string => {
  const colors: Record<string, string> = {
    金融: 'gold',
    法律: 'blue',
    医疗: 'green',
    教育: 'orange',
    代码: 'purple',
    通用对话: 'cyan',
    指令: 'magenta',
    通用: 'default',
  }
  return colors[domain] || 'default'
}
const ValidationConfigComponent: React.FC<ValidationConfigProps> = ({ value, onChange, availableValidationDatasets = [], selectedTrainingDatasets = [], disabled = false }) => {
  // 使用value作为主要配置源，确保与表单系统同步
  const config = value || { type: 'split' as const, split_ratio: 20 }
  // 添加调试日志
  console.log('ValidationConfig: 当前配置', { value, config, selectedTrainingDatasets })
  // 分析训练数据集领域分布
  const trainingDomainAnalysis = useMemo(() => {
    const domainCounts: Record<string, number> = {}
    const totalRecords = selectedTrainingDatasets.reduce((sum, ds) => sum + ds.record_count, 0)
    selectedTrainingDatasets.forEach((dataset) => {
      const domain = extractDomain(availableValidationDatasets.find((d) => d.id === dataset.id)?.description)
      domainCounts[domain] = (domainCounts[domain] || 0) + dataset.record_count
    })
    const domainPercentages = Object.entries(domainCounts).map(([domain, count]) => ({
      domain,
      count,
      percentage: totalRecords > 0 ? Math.round((count / totalRecords) * 100) : 0,
    })).sort((a, b) => b.count - a.count)
    return { domainPercentages, totalRecords, mainDomain: domainPercentages[0]?.domain || '通用' }
  }, [selectedTrainingDatasets, availableValidationDatasets])
  // 智能推荐验证集
  const smartRecommendations = useMemo(() => {
    if (selectedTrainingDatasets.length === 0)
      return []
    const trainDatasetIds = new Set(selectedTrainingDatasets.map((ds) => ds.id))
    const { mainDomain } = trainingDomainAnalysis
    // 过滤可用验证集（排除已选择的训练集）
    const candidateDatasets = availableValidationDatasets.filter((dataset) => !trainDatasetIds.has(dataset.id) && dataset.status === 'active')
    // 计算推荐分数
    const recommendations = candidateDatasets.map((dataset) => {
      const domain = extractDomain(dataset.description)
      let score = 0
      const reasons: string[] = []
      // 领域匹配加分
      if (domain === mainDomain) {
        score += 100
        reasons.push(`与主要训练领域"${mainDomain}"匹配`)
      }
      else if (domain !== '通用' && trainingDomainAnalysis.domainPercentages.some((d) => d.domain === domain)) {
        score += 60
        reasons.push(`与训练数据子领域"${domain}"匹配`)
      }
      else if (domain === '通用' || domain === '通用对话') {
        score += 30
        reasons.push('通用验证集，适用性广')
      }
      // 数据规模加分（合理的验证集大小）
      const idealValidationSize = trainingDomainAnalysis.totalRecords * 0.2 // 理想验证集为训练集的20%
      const sizeRatio = dataset.record_count / idealValidationSize
      if (sizeRatio >= 0.5 && sizeRatio <= 2) {
        score += 20
        reasons.push('数据规模合适')
      }
      else if (sizeRatio >= 0.2 && sizeRatio <= 5) {
        score += 10
      }
      return {
        dataset,
        score,
        reasons,
        domain,
        isHighlyRecommended: score >= 80,
      }
    }).sort((a, b) => b.score - a.score).slice(0, 5) // 取前5个推荐
    return recommendations
  }, [selectedTrainingDatasets, availableValidationDatasets, trainingDomainAnalysis])
  // 计算建议的分割比例
  const suggestedSplitRatio = useMemo(() => {
    const totalRecords = trainingDomainAnalysis.totalRecords
    if (totalRecords <= 10000)
      return 25 // 小数据集用更高比例
    if (totalRecords <= 50000)
      return 20 // 中等数据集
    return 15 // 大数据集用较低比例
  }, [trainingDomainAnalysis.totalRecords])
  const handleConfigChange = (newConfig: Partial<ValidationConfig>) => {
    const updatedConfig = { ...config, ...newConfig }
    console.log('ValidationConfig: 配置变化', { newConfig, updatedConfig })
    onChange?.(updatedConfig)
    console.log('ValidationConfig: 已调用onChange', updatedConfig)
  }
  const handleTypeChange = (newType: 'split' | 'platform') => {
    if (newType === 'split') {
      handleConfigChange({
        type: 'split',
        split_ratio: suggestedSplitRatio,
        platform_datasets: undefined,
      })
    }
    else {
      handleConfigChange({
        type: 'platform',
        split_ratio: undefined,
        platform_datasets: [],
      })
    }
  }
  const handleAutoSelectRecommended = () => {
    const topRecommendation = smartRecommendations.find((r) => r.isHighlyRecommended)
    if (topRecommendation) {
      const newDataset: DatasetConfig = {
        id: topRecommendation.dataset.id,
        name: topRecommendation.dataset.name,
        ratio: 100,
        record_count: topRecommendation.dataset.record_count,
        format: topRecommendation.dataset.format,
      }
      handleConfigChange({ platform_datasets: [newDataset] })
      message.success(`已自动选择推荐验证集：${topRecommendation.dataset.name}`)
    }
  }
  const handleAddPlatformDataset = (datasetId: string) => {
    const dataset = availableValidationDatasets.find((d) => d.id === datasetId)
    if (!dataset)
      return
    const newDataset: DatasetConfig = {
      id: dataset.id,
      name: dataset.name,
      ratio: 100,
      record_count: dataset.record_count,
      format: dataset.format,
    }
    const currentDatasets = config.platform_datasets || []
    handleConfigChange({
      platform_datasets: [...currentDatasets, newDataset],
    })
  }
  const handleRemovePlatformDataset = (datasetId: string) => {
    const currentDatasets = config.platform_datasets || []
    const updatedDatasets = currentDatasets.filter((d) => d.id !== datasetId)
    handleConfigChange({ platform_datasets: updatedDatasets })
  }
  const getAvailableValidationOptions = () => {
    const selectedIds = (config.platform_datasets || []).map((d) => d.id)
    const trainDatasetIds = new Set(selectedTrainingDatasets.map((ds) => ds.id))
    return availableValidationDatasets.filter((dataset) => !selectedIds.includes(dataset.id)
      && !trainDatasetIds.has(dataset.id)
      && dataset.status === 'active')
  }
  const getMatchLevel = (score: number) => {
    if (score >= 80)
      return { color: 'success', text: '高度匹配' }
    if (score >= 50)
      return { color: 'warning', text: '较好匹配' }
    return { color: 'default', text: '一般匹配' }
  }
  const renderRecommendations = () => {
    if (smartRecommendations.length === 0)
      return null
    const recommendationColumns = [
      {
        title: '推荐验证集',
        dataIndex: 'dataset',
        key: 'dataset',
        render: (dataset: FinetuneDataset, recommendation: {
          dataset: FinetuneDataset
          score: number
          reasons: string[]
          domain: string
          isHighlyRecommended: boolean
        }) => (
          <div>
            <Space>
              <Text strong>{dataset.name}</Text>
              <Tag color={getDomainColor(recommendation.domain)}>
                {recommendation.domain}
              </Tag>
              {recommendation.isHighlyRecommended && <StarFilled style={{ color: '#faad14' }} />}
            </Space>
            <div className="text-[12px] text-[var(--lab-color-text-muted)] mt-1">
              <Space>
                <span>
                  {dataset.format?.toUpperCase()}
                  {' '}
                  |
                  {' '}
                  {dataset.record_count?.toLocaleString()}
                  条记录
                </span>
              </Space>
            </div>
          </div>
        ),
      },
      {
        title: '匹配度',
        dataIndex: 'score',
        key: 'score',
        render: (score: number) => {
          const match = getMatchLevel(score)
          return <Badge status={match.color as 'success' | 'warning' | 'default'} text={match.text} />
        },
      },
      {
        title: '推荐理由',
        dataIndex: 'reasons',
        key: 'reasons',
        render: (reasons: string[]) => (
          <div>
            {reasons.map((reason, index) => (
              <div key={index} className="text-[12px]">
                •
                {reason}
              </div>
            ))}
          </div>
        ),
      },
      {
        title: '操作',
        key: 'action',
        render: (_: unknown, recommendation: {
          dataset: FinetuneDataset
          score: number
          reasons: string[]
          domain: string
          isHighlyRecommended: boolean
        }) => (
          <Button size="small" type="primary" onClick={() => handleAddPlatformDataset(recommendation.dataset.id)} disabled={disabled}>
            选择
          </Button>
        ),
      },
    ]
    return (
      <Card title="智能推荐验证集" size="small" className="mb-4">
        <div className="mb-3">
          <Space>
            <Text>基于您的训练数据集，为您推荐以下验证集：</Text>
            {smartRecommendations.some((r) => r.isHighlyRecommended) && (
              <Button size="small" type="link" onClick={handleAutoSelectRecommended} disabled={disabled}>
                自动选择最佳推荐
              </Button>
            )}
          </Space>
        </div>
        <Table columns={recommendationColumns} dataSource={smartRecommendations} pagination={false} size="small" rowKey={(record) => record.dataset.id} />
      </Card>
    )
  }
  return (
    <div>
      <Card title="验证集配置" size="small">
        {/* 训练数据集分析 */}
        {selectedTrainingDatasets.length > 0 && (
          <Card title="训练数据集分析" size="small" className="mb-4">
            <Row gutter={16}>
              <Col span={12}>
                <Text strong>数据规模：</Text>
                <span>
                  {trainingDomainAnalysis.totalRecords.toLocaleString()}
                  {' '}
                  条记录
                </span>
              </Col>
              <Col span={12}>
                <Text strong>主要领域：</Text>
                <Space>
                  {trainingDomainAnalysis.domainPercentages.slice(0, 3).map(({ domain, percentage }) => (
                    <Tag key={domain} color={getDomainColor(domain)}>
                      {domain}
                      {' '}
                      {percentage}
                      %
                    </Tag>
                  ))}
                </Space>
              </Col>
            </Row>
          </Card>
        )}

        <Radio.Group value={config.type} onChange={(e) => handleTypeChange(e.target.value)} disabled={disabled}>
          <Space direction="vertical" className="w-full">
            <Radio value="split">
              <Space>
                从训练集分割
                <Tooltip title="将训练数据集按比例分割为训练集和验证集">
                  <InfoCircleOutlined />
                </Tooltip>
              </Space>
            </Radio>

            {config.type === 'split' && (
              <div className="ml-6 mt-2">
                <Row gutter={16} align="middle">
                  <Col span={12}>
                    <Text>
                      验证集比例:
                      {config.split_ratio}
                      %
                    </Text>
                    <Slider
                      min={5}
                      max={30}
                      value={config.split_ratio}
                      onChange={(value) => handleConfigChange({ split_ratio: value })}
                      disabled={disabled}
                      marks={{
                        5: '5%',
                        15: '15%',
                        20: '20%',
                        25: '25%',
                        30: '30%',
                      }}
                    />
                  </Col>
                  <Col span={12}>
                    <Alert
                      message={`建议比例: ${suggestedSplitRatio}%`}
                      description={`基于您的数据规模（${trainingDomainAnalysis.totalRecords.toLocaleString()}条记录），建议使用${suggestedSplitRatio}%的验证比例`}
                      type="info"
                      showIcon
                      action={(
                        <Button size="small" type="link" onClick={() => handleConfigChange({ split_ratio: suggestedSplitRatio })} disabled={disabled}>
                          应用建议
                        </Button>
                      )}
                    />
                  </Col>
                </Row>
              </div>
            )}

            <Radio value="platform">
              <Space>
                使用平台验证集
                <Tooltip title="选择平台提供的专用验证数据集">
                  <InfoCircleOutlined />
                </Tooltip>
              </Space>
            </Radio>

            {config.type === 'platform' && (
              <div className="ml-6 mt-2">
                {selectedTrainingDatasets.length > 0 && renderRecommendations()}

                <Row gutter={16}>
                  <Col span={24}>
                    <div className="mb-3">
                      <Text strong>平台验证集</Text>
                      <Text type="secondary" className="ml-2">
                        选择适合的验证数据集
                      </Text>
                    </div>
                    <Select placeholder="请选择..." className="w-full" value={undefined} onChange={handleAddPlatformDataset} disabled={disabled} showSearch filterOption={(input, option) => option?.label?.toString().toLowerCase().includes(input.toLowerCase()) || false} optionLabelProp="label">
                      {getAvailableValidationOptions().map((dataset) => {
                        const domain = extractDomain(dataset.description)
                        return (
                          <Option key={dataset.id} value={dataset.id} label={dataset.name}>
                            <div className="p-[4px_0]">
                              <div className="flex justify-between items-center">
                                <Space>
                                  <Text strong>{dataset.name}</Text>
                                  <Tag color={getDomainColor(domain)}>
                                    {domain}
                                  </Tag>
                                </Space>
                                <Text type="secondary" className="text-[12px]">
                                  {dataset.record_count.toLocaleString()}
                                  条
                                </Text>
                              </div>
                              <div className="text-[12px] text-[var(--lab-color-text-muted)] mt-0.5">
                                {dataset.format.toUpperCase()}
                                {' '}
                                |
                                {dataset.description || '暂无描述'}
                              </div>
                            </div>
                          </Option>
                        )
                      })}
                    </Select>
                  </Col>
                </Row>

                {config.platform_datasets && config.platform_datasets.length > 0 && (
                  <div className="mt-4">
                    <Text strong>已选择的验证集：</Text>
                    <Table
                      columns={[
                        {
                          title: '验证集名称',
                          dataIndex: 'name',
                          key: 'name',
                        },
                        {
                          title: '格式',
                          dataIndex: 'format',
                          key: 'format',
                          render: (format: string) => format.toUpperCase(),
                        },
                        {
                          title: '记录数',
                          dataIndex: 'record_count',
                          key: 'record_count',
                          render: (count: number) => count.toLocaleString(),
                        },
                        {
                          title: '操作',
                          key: 'action',
                          render: (_, record: DatasetConfig) => (
                            <Button size="small" danger onClick={() => handleRemovePlatformDataset(record.id)} disabled={disabled}>
                              移除
                            </Button>
                          ),
                        },
                      ]}
                      dataSource={config.platform_datasets}
                      pagination={false}
                      size="small"
                      rowKey="id"
                    />
                  </div>
                )}
              </div>
            )}
          </Space>
        </Radio.Group>
      </Card>
    </div>
  )
}
export default ValidationConfigComponent
