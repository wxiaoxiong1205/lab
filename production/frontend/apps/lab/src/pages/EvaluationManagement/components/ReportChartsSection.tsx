import { DownloadOutlined } from '@ant-design/icons'
import { Button, Card, Col, Row, Select, Skeleton, Space, Table, Tag, Typography } from 'antd'
import { Bar, BarChart, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type React from 'react'
import BenchmarkRadarChart from './BenchmarkRadarChart'
import type { EvaluationType } from '@/types/ReportDetailTypes.ts'
import type { ProjectEvaluationTaskReport } from '@/services/modelEvaluationServices'

const { Title, Text } = Typography

interface EvaluationMethodOption {
  value: string
  label: string
  apiValue: string
}

interface ReportChartsSectionProps {
  evaluationType: EvaluationType
  loading: boolean
  reportData: ProjectEvaluationTaskReport | null
  evaluationMethodFilter: string
  setEvaluationMethodFilter: (value: string) => void
  calculationMethod: string
  setCalculationMethod: (value: string) => void
  getEvaluationMethodOptions: () => EvaluationMethodOption[]
  radarData: any[]
  barData: any[]
  multiRadarData: any[]
  modelConfigs: any[]
  modelNames: string[]
  isComparison: boolean
  maxValue: number
  radarChartRef: React.RefObject<HTMLDivElement>
  barChartRef: React.RefObject<HTMLDivElement>
  onDownloadDatasetResult: (datasetCode: string, modelId?: number) => void
}

function DataDetailTooltip() {
  return (
    <div>
      <div>
        评分数据明细
        <span className="text-gray-500 text-[12px]">（得分以百分比形式展示，具体计算方式：得分/最大值）</span>
      </div>
    </div>
  )
}

export default function ReportChartsSection({
  evaluationType,
  loading,
  reportData,
  evaluationMethodFilter,
  setEvaluationMethodFilter,
  calculationMethod,
  setCalculationMethod,
  getEvaluationMethodOptions,
  radarData,
  barData,
  multiRadarData,
  modelConfigs,
  modelNames,
  isComparison,
  maxValue,
  radarChartRef,
  barChartRef,
  onDownloadDatasetResult,
}: ReportChartsSectionProps) {
  return (
    <>
      <Card className="mb-6 min-h-[400px]">
        <div className="flex items-center justify-between mb-4">
          <Space className="flex items-center">
            <Title level={5} className="mt-2">报告结果</Title>
            {evaluationType === 'auto' && (
              <Select
                value={evaluationMethodFilter}
                onChange={setEvaluationMethodFilter}
                size="small"
                className="w-[120px]"
                disabled={loading}
              >
                {getEvaluationMethodOptions().map((option) => (
                  <Select.Option key={option.value} value={option.value}>
                    {option.label}
                  </Select.Option>
                ))}
              </Select>
            )}
          </Space>
          <Space>
            <Text type="secondary">计算方式：</Text>
            <Select
              value={calculationMethod}
              onChange={setCalculationMethod}
              size="small"
              className="w-24"
              disabled={loading}
            >
              <Select.Option value="平均">平均</Select.Option>
            </Select>
          </Space>
        </div>

        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : (isComparison ? multiRadarData.length > 0 : radarData.length > 0) ? (
          <Row gutter={24}>
            <Col span={12}>
              <Card size="small" title="评分维度雷达图">
                <div ref={radarChartRef}>
                  {isComparison ? (
                    <BenchmarkRadarChart
                      type="multi"
                      multiData={multiRadarData}
                      modelConfigs={modelConfigs}
                      height={300}
                      domain={[0, maxValue]}
                    />
                  ) : (
                    <BenchmarkRadarChart
                      type="single"
                      singleData={radarData}
                      modelName={modelNames[0]}
                      height={300}
                      domain={[0, maxValue]}
                    />
                  )}
                </div>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title={<DataDetailTooltip />}>
                {isComparison ? (
                  <Table
                    size="small"
                    columns={[
                      { title: '评估指标', dataIndex: 'subject', key: 'subject', fixed: 'left' },
                      ...modelConfigs.map((config) => ({
                        title: config.name,
                        dataIndex: config.key,
                        key: config.key,
                        render: (value: number) => value !== undefined && value !== null ? value.toFixed(2) : '-',
                      })),
                      ...(evaluationType === 'benchmark' && reportData?.model_reports?.[0]?.model_id ? [{
                        title: '操作',
                        key: 'action',
                        width: 80,
                        fixed: 'right' as const,
                        render: (_: any, record: { subject: string }) => (
                          <Button
                            type="link"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => onDownloadDatasetResult(record.subject, reportData.model_reports[0].model_id)}
                          >
                            下载
                          </Button>
                        ),
                      }] : []),
                    ]}
                    dataSource={multiRadarData.map((item, index) => ({ ...item, key: index }))}
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                  />
                ) : (
                  <Table
                    size="small"
                    columns={[
                      { title: '评估指标', dataIndex: 'name', key: 'name', fixed: 'left' },
                      { title: modelNames[0] || '', dataIndex: 'value', key: 'value', render: (value) => value !== undefined && value !== null ? value.toFixed(2) : '-' },
                      ...(evaluationType === 'benchmark' && reportData?.model_reports?.[0]?.model_id ? [{
                        title: '操作',
                        key: 'action',
                        width: 80,
                        fixed: 'right' as const,
                        render: (_: any, record: { name: string }) => (
                          <Button
                            type="link"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => onDownloadDatasetResult(record.name, reportData.model_reports[0].model_id)}
                          >
                            下载
                          </Button>
                        ),
                      }] : []),
                    ]}
                    dataSource={radarData.map((item, index) => ({ ...item, key: index }))}
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                  />
                )}
              </Card>
            </Col>
          </Row>
        ) : (
          <div className="text-center py-8 text-gray-400">
            暂无报告数据
          </div>
        )}
      </Card>

      <Card className="min-h-[350px]">
        <Title level={5} className="mb-4">评分对比柱状图</Title>
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : (
          <>
            {modelNames.length > 0 && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {modelNames.map((name, index) => (
                  <Tag key={name || index} color={isComparison ? modelConfigs[index]?.tagColor || 'blue' : 'blue'}>
                    {name}
                  </Tag>
                ))}
              </div>
            )}
            {barData.length > 0 ? (
              <div ref={barChartRef}>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={barData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 90 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey={isComparison ? 'subject' : 'name'}
                      angle={-45}
                      textAnchor="end"
                      height={90}
                      interval={0}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      domain={[0, maxValue]}
                      ticks={Array.from({ length: 6 }, (_, i) => Math.round((maxValue / 5) * i))}
                      label={{ value: '分数', angle: -90, position: 'insideLeft' }}
                    />
                    <RechartsTooltip
                      formatter={(value: number, name: string) => {
                        if (isComparison) {
                          const config = modelConfigs.find((c) => c.key === name)
                          return [`${value.toFixed(2)}`, config?.name || name]
                        }
                        return [`${value.toFixed(2)}`, modelNames[0] || '模型']
                      }}
                      labelFormatter={(label) => `指标: ${label}`}
                    />
                    {isComparison ? (
                      modelConfigs.map((config) => (
                        <Bar
                          key={config.key}
                          dataKey={config.key}
                          fill={config.color}
                          radius={[4, 4, 0, 0]}
                          name={config.name}
                        />
                      ))
                    ) : (
                      <Bar
                        dataKey="value"
                        fill="#1890ff"
                        radius={[4, 4, 0, 0]}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                暂无数据
              </div>
            )}
          </>
        )}
      </Card>
    </>
  )
}
