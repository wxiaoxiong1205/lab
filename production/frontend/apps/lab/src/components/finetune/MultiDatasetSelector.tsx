import React, { useEffect, useState } from 'react'
import {
  Button, Card, Col, InputNumber, Row,
  Select, Space, Table, Tooltip, Typography, message,
} from 'antd'
import { DeleteOutlined, InfoCircleOutlined, PlusOutlined } from '@ant-design/icons'
import type { DatasetConfig } from '../../types'

const { Title, Text } = Typography
const { Option } = Select

interface Dataset {
  id: string
  name: string
  description?: string
  format: string
  record_count: number
  size: string
  status: string
}

interface MultiDatasetSelectorProps {
  value?: any[]
  onChange?: (datasets: DatasetConfig[]) => void
  availableDatasets: Dataset[]
  disabled?: boolean
}

/**
 * 多数据集选择器组件
 * 支持选择多个数据集并配置训练比例
 */
const MultiDatasetSelector: React.FC<MultiDatasetSelectorProps> = ({
  value = [],
  onChange,
  availableDatasets = [],
  disabled = false,
}) => {
  const [selectedDatasets, setSelectedDatasets] = useState<any[]>(value)

  useEffect(() => {
    setSelectedDatasets(value)
  }, [value])

  // 添加数据集
  const handleAddDataset = () => {
    const newDataset: any = {
      id: '',
      dataset: '',
      ratio: 0,
      record_count: 0,
      sample_rate: 0,
      total_tokens: 0,
    }

    const newList = [...selectedDatasets, newDataset]
    setSelectedDatasets(newList)
    onChange?.(newList)
  }

  // 删除数据集
  const handleRemoveDataset = (index: number) => {
    const newList = selectedDatasets.filter((_, i) => i !== index)
    setSelectedDatasets(newList)
    onChange?.(newList)
  }

  // 更新数据集配置
  const handleUpdateDataset = (index: number, field: string, value: any) => {
    const newList = [...selectedDatasets]

    if (field === 'id') {
      const dataset = availableDatasets.find((d) => d.id === value)
      if (dataset) {
        newList[index] = {
          ...newList[index],
          id: dataset.id,
          dataset: dataset.name,
          record_count: dataset.record_count,
          sample_rate: 0,
          total_tokens: 0,
        }
      }
    }
    else {
      newList[index] = {
        ...newList[index],
        [field]: value,
      }
    }

    setSelectedDatasets(newList)
    onChange?.(newList)
  }

  // 自动平均分配比例
  const handleAutoDistribute = () => {
    if (selectedDatasets.length === 0) return

    const averageRatio = Math.floor(100 / selectedDatasets.length)
    const remainder = 100 - (averageRatio * selectedDatasets.length)

    const newList = selectedDatasets.map((dataset, index) => ({
      ...dataset,
      ratio: index === 0 ? averageRatio + remainder : averageRatio,
    }))

    setSelectedDatasets(newList)
    onChange?.(newList)
  }

  // 验证比例总和
  const getTotalRatio = () => {
    return selectedDatasets.reduce((sum, dataset) => sum + (dataset.ratio || 0), 0)
  }

  const totalRatio = getTotalRatio()
  const isValidRatio = totalRatio === 100

  // 获取可选数据集（排除已选择的）
  const getAvailableOptions = (currentIndex: number) => {
    const selectedIds = selectedDatasets
      .map((d, i) => i !== currentIndex ? d.id : null)
      .filter(Boolean)

    return availableDatasets.filter((dataset) =>
      !selectedIds.includes(dataset.id) && dataset.status === 'active',
    )
  }

  const columns = [
    {
      title: '数据集',
      dataIndex: 'dataset',
      key: 'dataset',
      width: '40%',
      render: (_: any, record: DatasetConfig, index: number) => (
        <Select
          value={record.id || undefined}
          placeholder="请选择数据集"
          className="w-full"
          disabled={disabled}
          onChange={(value) => handleUpdateDataset(index, 'id', value)}
          showSearch
          optionFilterProp="children"
        >
          {getAvailableOptions(index).map((dataset) => (
            <Option key={dataset.id} value={dataset.id}>
              <div>
                <div className="font-bold">{dataset.name}</div>
                <div className="text-[12px] text-[var(--lab-color-text-muted)]">
                  {dataset.format.toUpperCase()}
                  {' '}
                  |
                  {dataset.record_count.toLocaleString()}
                  条记录
                </div>
              </div>
            </Option>
          ))}
        </Select>
      ),
    },
    {
      title: (
        <Space>
          训练比例 (%)
          <Tooltip title="所有数据集的比例总和必须等于100%">
            <InfoCircleOutlined />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'ratio',
      key: 'ratio',
      width: '25%',
      render: (_: any, record: DatasetConfig, index: number) => (
        <InputNumber
          value={record.ratio}
          min={1}
          max={100}
          precision={0}
          className="w-full"
          disabled={disabled}
          onChange={(value) => handleUpdateDataset(index, 'ratio', value || 0)}
          addonAfter="%"
        />
      ),
    },
    {
      title: '记录数',
      dataIndex: 'record_count',
      key: 'record_count',
      width: '20%',
      render: (count: number) => (
        <Text type="secondary">
          {count > 0 ? count.toLocaleString() : '-'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: '15%',
      render: (_: any, record: DatasetConfig, index: number) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          disabled={disabled}
          onClick={() => handleRemoveDataset(index)}
        >
          删除
        </Button>
      ),
    },
  ]

  return (
    <Card
      title={(
        <Space>
          <Title level={5} className="m-0">训练数据集配置</Title>
          <Tooltip title="选择多个数据集进行混合训练，可以提高模型的泛化能力">
            <InfoCircleOutlined />
          </Tooltip>
        </Space>
      )}
      size="small"
    >
      <Table
        columns={columns}
        dataSource={selectedDatasets}
        pagination={false}
        rowKey={(record, index) => `${record.id || 'new'}-${index}`}
        locale={{
          emptyText: '暂无选择的数据集，请点击下方"添加数据集"按钮',
        }}
        size="small"
      />

      <Row justify="space-between" align="middle" className="mt-4">
        <Col>
          <Space>
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={handleAddDataset}
              disabled={disabled || selectedDatasets.length >= 5}
            >
              添加数据集
            </Button>
            {selectedDatasets.length > 1 && (
              <Button
                type="link"
                onClick={handleAutoDistribute}
                disabled={disabled}
              >
                平均分配比例
              </Button>
            )}
          </Space>
        </Col>

        <Col>
          <Space>
            <Text>总比例：</Text>
            <Text
              strong
              type={isValidRatio ? 'success' : 'danger'}
            >
              {totalRatio}
              %
            </Text>
            {!isValidRatio && (
              <Text type="danger" className="text-[12px]">
                (必须等于100%)
              </Text>
            )}
          </Space>
        </Col>
      </Row>

      {selectedDatasets.length > 5 && (
        <Text type="warning" className="text-[12px] block mt-2">
          为了确保训练效果，建议最多选择5个数据集
        </Text>
      )}
    </Card>
  )
}

export default MultiDatasetSelector
