import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Col, Divider, Empty, Row, Space, Tag, Tooltip, Typography } from 'antd'
import { EyeInvisibleOutlined, EyeOutlined, RollbackOutlined } from '@ant-design/icons'
import type { Dataset } from '../types'
import { useProjectStore } from '../stores/projectStore'
import ThinkableContent from '../components/ThinkableContent'
import './DatasetComparison.css'

const { Title, Text, Paragraph } = Typography
interface ComparisonGroup {
  question: string
  datasets: Dataset[]
}
interface LocationState {
  selectedDatasets?: Dataset[]
}
const DatasetComparison = () => {
  const { projectId } = useParams<{
    projectId: string
  }>()
  const navigate = useNavigate()
  const location = useLocation()
  const currentProject = useProjectStore((state) => state.currentProject)
  const numericProjectId = projectId
    ? parseInt(projectId, 10)
    : currentProject?.id
    // Get datasets directly from navigation state
  const { selectedDatasets = [] } = (location.state as LocationState) || {}
  const [comparisonGroups, setComparisonGroups] = useState<ComparisonGroup[]>([])
  // Track which datasets are hidden
  const [hiddenDatasets, setHiddenDatasets] = useState<Record<number, boolean>>({})
  // Helper to get model name from dataset (either directly or from meta_info)
  const getModelName = (dataset: Dataset): string => {
    // Check if model is directly available
    if (dataset.model) {
      return dataset.model
    }
    // Check in meta_info
    if (dataset.meta_info) {
      const { meta_info } = dataset
      // Handle case where model is an object with name/model property
      if (meta_info.model && typeof meta_info.model === 'object') {
        // If model is an object with name property
        if (meta_info.model.name)
          return meta_info.model.name
        // If model is an object with model property
        if (meta_info.model.model)
          return meta_info.model.model
      }
      // Handle string values
      if (meta_info.model && typeof meta_info.model === 'string')
        return meta_info.model
      if (meta_info.model_name)
        return meta_info.model_name
      if (meta_info.llm)
        return meta_info.llm
      if (meta_info.llm_model)
        return meta_info.llm_model
    }
    return '未知模型'
  }
  // Toggle dataset visibility
  const toggleDatasetVisibility = (datasetId: number) => {
    setHiddenDatasets((prev) => ({
      ...prev,
      [datasetId]: !prev[datasetId],
    }))
  }
  // Group datasets by question on component mount or when selectedDatasets change
  useEffect(() => {
    if (selectedDatasets.length >= 2) {
      // Group by question
      const groupedByQuestion: Record<string, Dataset[]> = {}
      selectedDatasets.forEach((dataset) => {
        if (!groupedByQuestion[dataset.question]) {
          groupedByQuestion[dataset.question] = []
        }
        groupedByQuestion[dataset.question].push(dataset)
      })
      // Filter groups that have at least 2 datasets
      const groups: ComparisonGroup[] = Object.entries(groupedByQuestion)
        .filter(([_, datasets]) => datasets.length > 1)
        .map(([question, datasets]) => ({
          question,
          datasets: datasets.sort((a, b) => a.id - b.id), // Sort by ID for consistent display
        }))
      setComparisonGroups(groups)
    }
    else {
      setComparisonGroups([])
    }
  }, [selectedDatasets])
  // If no datasets are passed, show a message and prompt user to go back
  if (selectedDatasets.length === 0) {
    return (
      <div className="dataset-comparison-page">
        <Card
          title={`${currentProject?.name || 'Project'} - 数据集输出比较`}
          className="overflow-hidden"
          extra={(
            <Button type="primary" icon={<RollbackOutlined />} onClick={() => navigate(`/project/${numericProjectId}/datasets`)}>
              返回数据集列表
            </Button>
          )}
        >
          <Empty description="请先在数据集列表页面选择要比较的数据集" />
        </Card>
      </div>
    )
  }
  return (
    <div className="dataset-comparison-page">
      <Card
        title={`${currentProject?.name || 'Project'} - 数据集输出比较`}
        className="overflow-hidden"
        extra={(
          <Button type="primary" icon={<RollbackOutlined />} onClick={() => navigate(`/project/${numericProjectId}/datasets`)}>
            返回数据集列表
          </Button>
        )}
      >
        <div className="mb-4">
          <Text>
            已选择
            {selectedDatasets.length}
            {' '}
            个数据集进行比较
          </Text>
        </div>

        <Divider />

        {comparisonGroups.length === 0 ? (<Empty description="所选数据集中没有相同问题，无法进行比较" />) : (
          <>
            <Title level={4}>
              已找到
              {' '}
              {comparisonGroups.length}
              {' '}
              组可比较的数据集
            </Title>

            {comparisonGroups.map((group, groupIndex) => (
              <Card
                className="mb-[32px]"
                key={groupIndex}
                style={{ backgroundColor: '#f9f9f9' }}
                title={(
                  <Space direction="vertical" className="w-full">
                    <Text strong className="text-[16px]">
                      问题 #
                      {groupIndex + 1}
                    </Text>
                    <Paragraph style={{
                      fontSize: 16,
                      background: '#f0f0f0',
                      padding: '12px',
                      borderLeft: '4px solid #1890ff',
                      margin: '8px 0',
                    }}
                    >
                      {group.question}
                    </Paragraph>
                  </Space>
                )}
              >
                <div className="mb-4">
                  <div className="mb-2">
                    <Text strong>数据集显示控制:</Text>
                  </div>
                  <div className="visibility-controls">
                    {group.datasets.map((dataset) => {
                      const modelName = getModelName(dataset)
                      return (
                        <Button key={dataset.id} type={hiddenDatasets[dataset.id] ? 'default' : 'primary'} size="small" icon={hiddenDatasets[dataset.id] ? (<EyeInvisibleOutlined />) : (<EyeOutlined />)} onClick={() => toggleDatasetVisibility(dataset.id)} className={`visibility-control-button ${hiddenDatasets[dataset.id] ? 'hidden' : ''}`} style={{ display: 'flex', alignItems: 'center' }}>
                          {modelName}
                          {' '}
                          (#
                          {dataset.id}
                          )
                        </Button>
                      )
                    })}
                  </div>
                </div>

                <Row gutter={[16, 16]}>
                  {group.datasets
                    .filter((dataset) => !hiddenDatasets[dataset.id])
                    .map((dataset, datasetIndex) => (
                      <Col
                        key={dataset.id}
                        xs={24}
                        sm={24}
                        md={group.datasets.filter((d) => !hiddenDatasets[d.id])
                          .length > 2
                          ? 12
                          : 12}
                        lg={group.datasets.filter((d) => !hiddenDatasets[d.id])
                          .length > 2
                          ? 8
                          : 12}
                        xl={group.datasets.filter((d) => !hiddenDatasets[d.id])
                          .length > 3
                          ? 6
                          : 24
                            / Math.min(group.datasets.filter((d) => !hiddenDatasets[d.id]).length, 3)}
                      >
                        <Card
                          className="comparison-card h-[100%]"
                          type="inner"
                          title={(
                            <div className="flex justify-between items-center">
                              <span>
                                数据集 #
                                {dataset.id}
                              </span>
                              <div className="flex gap-2">
                                <Tooltip title="隐藏此数据集">
                                  <Button
                                    type="text"
                                    size="small"
                                    icon={<EyeInvisibleOutlined />}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleDatasetVisibility(dataset.id)
                                    }}
                                  />
                                </Tooltip>
                              </div>
                            </div>
                          )}
                          style={{
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                          }}
                          headStyle={{
                            backgroundColor: datasetIndex % 2 === 0 ? '#e6f7ff' : '#fff7e6',
                            borderLeft: datasetIndex % 2 === 0
                              ? '3px solid #1890ff'
                              : '3px solid #faad14',
                          }}
                        >
                          <div className="mb-3">
                            <Text strong className="block mb-1">
                              模型:
                            </Text>
                            <div className="flex flex-wrap gap-2 items-center">
                              <Tooltip title={(
                                <div>
                                  <p>
                                    <strong>模型信息:</strong>
                                  </p>
                                  {dataset.meta_info?.model
                                  && typeof dataset.meta_info.model
                                  === 'object' ? (
                                        <div>
                                          {Object.entries(dataset.meta_info.model).map(([key, value]) => (
                                            <p key={key}>
                                              <strong>
                                                {key}
                                                :
                                              </strong>
                                              {' '}
                                              {value === null
                                                ? 'null'
                                                : String(value)}
                                            </p>
                                          ))}
                                        </div>
                                      ) : (
                                        <p>
                                          <strong>模型名称:</strong>
                                          {' '}
                                          {getModelName(dataset)}
                                        </p>
                                      )}
                                  <Divider className="my-2" />
                                  <p>
                                    <strong>其他元数据:</strong>
                                  </p>
                                  {dataset.meta_info
                                  && Object.entries(dataset.meta_info)
                                    .filter(([key]) => key !== 'model'
                                      && key !== 'model_name'
                                      && key !== 'llm'
                                      && key !== 'llm_model')
                                    .map(([key, value]) => {
                                      if (key === 'prompt'
                                        || key === 'input_values') {
                                        return (
                                          <p key={key}>
                                            <strong>
                                              {key}
                                              :
                                            </strong>
                                            {' '}
                                            {typeof value === 'object'
                                              ? '[Object]'
                                              : String(value)}
                                          </p>
                                        )
                                      }
                                      return (
                                        <p key={key}>
                                          <strong>
                                            {key}
                                            :
                                          </strong>
                                          {' '}
                                          {typeof value === 'object'
                                            ? JSON.stringify(value)
                                            : String(value)}
                                        </p>
                                      )
                                    })}
                                </div>
                              )}
                              >
                                <Tag color="purple" className="model-tag">
                                  {getModelName(dataset)}
                                </Tag>
                              </Tooltip>

                              {/* Try multiple possible locations for prompt title */}
                              {(dataset.meta_info?.prompt?.title
                                || dataset.meta_info?.prompt_title
                                || (typeof dataset.meta_info?.prompt === 'string'
                                  ? dataset.meta_info?.prompt
                                  : null)) && (
                                <Tooltip title="Prompt标题">
                                  <Tag color="cyan">
                                    Prompt:
                                    {' '}
                                    {dataset.meta_info?.prompt?.title
                                    || dataset.meta_info?.prompt_title
                                    || (typeof dataset.meta_info?.prompt
                                      === 'string'
                                      ? dataset.meta_info?.prompt
                                      : '')}
                                  </Tag>
                                </Tooltip>
                              )}

                              {dataset.meta_info?.model?.temperature
                              !== undefined && (
                                <Tooltip title="Temperature值，控制输出的随机性">
                                  <Tag color="blue">
                                    温度:
                                    {' '}
                                    {dataset.meta_info.model.temperature}
                                  </Tag>
                                </Tooltip>
                              )}

                              {dataset.meta_info?.model?.max_tokens
                              !== undefined
                              && dataset.meta_info.model.max_tokens !== null && (
                                <Tooltip title="最大生成的token数量">
                                  <Tag color="green">
                                    最大Tokens:
                                    {' '}
                                    {dataset.meta_info.model.max_tokens}
                                  </Tag>
                                </Tooltip>
                              )}
                            </div>
                          </div>

                          <div className="mb-5">
                            <Text strong className="block mb-2">
                              输出:
                            </Text>
                            <div
                              className="p-[12px] rounded-[4px] max-h-[none] overflow-visible"
                              style={{
                                backgroundColor: '#fff',
                                border: '1px solid #f0f0f0',
                                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)',
                              }}
                            >
                              <div className="md-content-wrapper">
                                <ThinkableContent content={dataset.output || '无输出'} />
                              </div>
                            </div>
                          </div>

                          {dataset.ground_truth && (
                            <div className="mb-5">
                              <Text strong className="block mb-2">
                                标准答案:
                              </Text>
                              <div
                                className="p-[12px] rounded-[4px]"
                                style={{
                                  backgroundColor: '#fff',
                                  border: '1px solid #f0f0f0',
                                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)',
                                }}
                              >
                                <div className="md-content-wrapper">
                                  <ThinkableContent content={dataset.ground_truth} />
                                </div>
                              </div>
                            </div>
                          )}

                          <div>
                            <Text type="secondary">
                              创建时间:
                              {' '}
                              {new Date(dataset.created_at).toLocaleString()}
                            </Text>
                          </div>
                        </Card>
                      </Col>
                    ))}
                </Row>
              </Card>
            ))}
          </>
        )}
      </Card>
    </div>
  )
}
export default DatasetComparison
