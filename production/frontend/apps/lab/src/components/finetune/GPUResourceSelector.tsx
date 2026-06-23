import React, { useEffect, useState } from 'react'
import {
  Alert, Button, Card, Col, Divider,
  InputNumber, List, Progress, Row, Select,
  Space, Spin, Tag, Tooltip, Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type {
  GPUInfo,
  KubernetesNode,
  NodeGPUResponse } from '../../services/kubernetesResourceService'
import {
  getGPUTypes,
  getKubernetesNodes,
  getNodeGPUs,
} from '../../services/kubernetesResourceService'

const { Option } = Select
const { Title, Text } = Typography

interface GPUResourceSelectorProps {
  value?: {
    node_name: string
    count: number
    type: string
    specific_gpus?: string[]
  }
  onChange?: (value: any) => void
  disabled?: boolean
}

/**
 * GPU资源选择组件
 * 支持节点选择和GPU配置
 */
const GPUResourceSelector: React.FC<GPUResourceSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [loading, setLoading] = useState(false)
  const [nodes, setNodes] = useState<KubernetesNode[]>([])
  const [selectedNodeGPUs, setSelectedNodeGPUs] = useState<NodeGPUResponse | null>(null)
  const [gpuTypes, setGPUTypes] = useState<Array<{ type: string, display_name: string, memory: string }>>([])
  const [selectedGPUType, setSelectedGPUType] = useState<string>('')
  const [availableNodes, setAvailableNodes] = useState<KubernetesNode[]>([])

  // 加载GPU类型
  const loadGPUTypes = async () => {
    try {
      const response = await getGPUTypes()
      setGPUTypes(response.gpu_types)
    }
    catch (error) {
      console.error('Failed to load GPU types:', error)
    }
  }

  // 加载节点信息
  const loadNodes = async (gpuType?: string) => {
    setLoading(true)
    try {
      const response = await getKubernetesNodes({
        gpu_type: gpuType,
        available_only: true,
      })
      setNodes(response.nodes)
      setAvailableNodes(response.nodes)
    }
    catch (error) {
      console.error('Failed to load nodes:', error)
      setNodes([])
      setAvailableNodes([])
    }
    finally {
      setLoading(false)
    }
  }

  // 加载指定节点的GPU信息
  const loadNodeGPUs = async (nodeName: string) => {
    if (!nodeName) return

    setLoading(true)
    try {
      const nodeGPUs = await getNodeGPUs(nodeName)
      setSelectedNodeGPUs(nodeGPUs)
    }
    catch (error) {
      console.error('Failed to load node GPUs:', error)
      setSelectedNodeGPUs(null)
    }
    finally {
      setLoading(false)
    }
  }

  // 初始化加载
  useEffect(() => {
    loadGPUTypes()
    loadNodes()
  }, [])

  // 当选择的GPU类型改变时，重新加载节点
  useEffect(() => {
    if (selectedGPUType) {
      loadNodes(selectedGPUType)
    }
  }, [selectedGPUType])

  // 当选择的节点改变时，加载节点GPU信息
  useEffect(() => {
    if (value?.node_name) {
      loadNodeGPUs(value.node_name)
    }
  }, [value?.node_name])

  // 处理GPU类型选择
  const handleGPUTypeChange = (type: string) => {
    setSelectedGPUType(type)
    // 清空之前的选择
    onChange?.({
      node_name: '',
      count: 1,
      type,
      specific_gpus: [],
    })
  }

  // 处理节点选择
  const handleNodeChange = (nodeName: string) => {
    const node = availableNodes.find((n) => n.name === nodeName)
    if (node) {
      onChange?.({
        node_name: nodeName,
        count: value?.count || 1,
        type: selectedGPUType || node.labels['gpu-type'] || '',
        specific_gpus: [],
      })
    }
  }

  // 处理GPU数量变化
  const handleGPUCountChange = (count: number) => {
    onChange?.({
      ...value,
      count: count || 1,
    })
  }

  // 获取GPU状态颜色
  const getGPUStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return '#52c41a'
      case 'partial':
        return '#faad14'
      case 'occupied':
        return '#ff4d4f'
      default:
        return '#d9d9d9'
    }
  }

  // 获取GPU状态图标
  const getGPUStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return <CheckCircleOutlined className="text-[var(--lab-color-success)]" />
      case 'partial':
        return <ExclamationCircleOutlined style={{ color: '#faad14' }} />
      case 'occupied':
        return <CloseCircleOutlined className="text-[var(--lab-color-danger)]" />
      default:
        return <CloseCircleOutlined style={{ color: '#d9d9d9' }} />
    }
  }

  // 渲染GPU状态
  const renderGPUStatus = (gpu: GPUInfo) => {
    const memoryUsed = parseInt(gpu.memory_total.replace('GB', '')) - parseInt(gpu.memory_free.replace('GB', ''))
    const memoryTotal = parseInt(gpu.memory_total.replace('GB', ''))
    const memoryPercent = (memoryUsed / memoryTotal) * 100

    return (
      <div className="mb-2">
        <Space>
          {getGPUStatusIcon(gpu.status)}
          <Text strong>
            GPU
            {gpu.index}
          </Text>
          <Tag color={getGPUStatusColor(gpu.status)}>{gpu.status}</Tag>
        </Space>
        <div className="mt-1">
          <Text type="secondary">{gpu.name}</Text>
        </div>
        <div className="mt-1">
          <Progress
            percent={memoryPercent}
            size="small"
            format={() => `${gpu.memory_free} / ${gpu.memory_total}`}
            strokeColor={getGPUStatusColor(gpu.status)}
          />
        </div>
      </div>
    )
  }

  // 计算可用GPU数量
  const getAvailableGPUCount = () => {
    if (!selectedNodeGPUs) return 0
    return selectedNodeGPUs.gpus.filter((gpu) => gpu.status === 'available').length
  }

  return (
    <div>
      <Title level={5}>GPU资源配置</Title>

      {/* GPU类型选择 */}
      <Card title="选择GPU类型" size="small" className="mb-4">
        <Select
          placeholder="请选择GPU类型"
          className="w-full"
          value={selectedGPUType}
          onChange={handleGPUTypeChange}
          disabled={disabled}
        >
          {gpuTypes.map((type) => (
            <Option key={type.type} value={type.type}>
              <Space>
                <span>{type.display_name}</span>
                <Tag color="blue">{type.memory}</Tag>
              </Space>
            </Option>
          ))}
        </Select>
      </Card>

      {/* 节点选择 */}
      {selectedGPUType && (
        <Card title="选择计算节点" size="small" className="mb-4">
          <Spin spinning={loading}>
            <Select
              placeholder="请选择计算节点"
              className="w-full"
              value={value?.node_name}
              onChange={handleNodeChange}
              disabled={disabled}
            >
              {availableNodes.map((node) => (
                <Option key={node.name} value={node.name}>
                  <Space>
                    <span>{node.name}</span>
                    <Tag color="green">
                      {node.gpus.filter((gpu) => gpu.status === 'available').length}
                      {' '}
                      个可用
                    </Tag>
                    <Tag color="orange">
                      {node.gpus.filter((gpu) => gpu.status === 'partial').length}
                      {' '}
                      个部分占用
                    </Tag>
                  </Space>
                </Option>
              ))}
            </Select>
          </Spin>

          {availableNodes.length === 0 && !loading && (
            <Alert
              message="没有可用节点"
              description="当前没有具有所选GPU类型的可用节点。"
              type="warning"
              showIcon
              className="mt-4"
            />
          )}
        </Card>
      )}

      {/* GPU数量配置 */}
      {value?.node_name && (
        <Card title="GPU数量配置" size="small" className="mb-4">
          <Row gutter={16}>
            <Col span={12}>
              <Text>所需GPU数量：</Text>
              <InputNumber
                min={1}
                max={getAvailableGPUCount()}
                value={value.count}
                onChange={handleGPUCountChange}
                className="ml-2"
                disabled={disabled}
              />
            </Col>
            <Col span={12}>
              <Text type="secondary">
                可用GPU数量：
                {getAvailableGPUCount()}
              </Text>
            </Col>
          </Row>
        </Card>
      )}

      {/* 节点GPU详情 */}
      {selectedNodeGPUs && (
        <Card
          title={(
            <Space>
              <span>节点GPU详情</span>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => loadNodeGPUs(value?.node_name || '')}
                loading={loading}
              />
            </Space>
          )}
          size="small"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Text strong>节点信息</Text>
              <div className="mt-2">
                <div>
                  节点名称:
                  {selectedNodeGPUs.node_name}
                </div>
                <div>
                  节点状态:
                  <Tag color="green">{selectedNodeGPUs.node_status}</Tag>
                </div>
                <div>
                  GPU容量:
                  {selectedNodeGPUs.gpu_capacity}
                </div>
              </div>
            </Col>
            <Col span={12}>
              <Text strong>GPU资源汇总</Text>
              <div className="mt-2">
                <div>
                  可用:
                  <Tag color="green">{selectedNodeGPUs.gpu_summary.available_count}</Tag>
                </div>
                <div>
                  部分占用:
                  <Tag color="orange">{selectedNodeGPUs.gpu_summary.partial_count}</Tag>
                </div>
                <div>
                  已占用:
                  <Tag color="red">{selectedNodeGPUs.gpu_summary.occupied_count}</Tag>
                </div>
                <div>
                  总内存:
                  {selectedNodeGPUs.gpu_summary.total_memory_capacity}
                  GB
                </div>
              </div>
            </Col>
          </Row>

          <Divider />

          <Text strong>GPU列表</Text>
          <div className="mt-2 max-h-[300px] overflow-y-auto">
            {selectedNodeGPUs.gpus.map((gpu) => (
              <div key={gpu.index}>
                {renderGPUStatus(gpu)}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

export default GPUResourceSelector
