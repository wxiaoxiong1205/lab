import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  message,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
  Descriptions,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EditOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  buildAnnotationDatasetOptions,
  dataServiceApi,
  type PaginatedResult,
  selectAnnotationTasks,
  useDataServiceSnapshot,
} from '../../services/dataServiceApi'

const { Text, Title } = Typography

type AnnotationTask = {
  id: string
  name: string
  dataVolume: number
  progress: number | null
  collaborationMode?: 'online' | 'multi'
  reviewerCount?: number
  reviewMode?: string
  datasetType?: 'text-generation' | 'image-understanding'
  preDataset: string
  postDataset: string
  outputMode?: string
  creator: string
  createdAt: string
}

type DatasetOption = {
  value: string
  label: string
  count: number
}

const stepCards = [
  {
    title: '选择数据集',
    description: '从已有数据集中选择或上传新数据',
  },
  {
    title: '标注数据',
    description: '使用工具对数据进行精确标注',
  },
  {
    title: '发布数据集',
    description: '完成标注后发布供模型训练使用',
  },
  {
    title: '使用数据集',
    description: '下载或直接调用标注完成的数据集',
  },
]

function getDatasetTypeFromSearch(search: string): 'text-generation' | 'image-understanding' {
  const value = new URLSearchParams(search).get('dataset_type')
  return value === 'image-understanding' ? 'image-understanding' : 'text-generation'
}

const DataAnnotation: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const state = useDataServiceSnapshot()
  const annotationTasks = selectAnnotationTasks(state)
  const [form] = Form.useForm()
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<AnnotationTask | null>(null)
  const [collaborationTab, setCollaborationTab] = useState<'online' | 'multi'>('online')
  const [datasetType, setDatasetType] = useState<'text-generation' | 'image-understanding'>('text-generation')
  const [selectedDatasetValue, setSelectedDatasetValue] = useState<string>()
  const [creating, setCreating] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [listLoading, setListLoading] = useState(false)
  const [listResult, setListResult] = useState<PaginatedResult<AnnotationTask>>({ items: [], total: 0 })

  const datasetOptions = useMemo(
    () => buildAnnotationDatasetOptions(state, datasetType),
    [datasetType, state],
  )
  const selectedDataset = useMemo(
    () => datasetOptions.find(item => item.value === selectedDatasetValue) ?? null,
    [datasetOptions, selectedDatasetValue],
  )

  const filteredItems = useMemo(
    () =>
      listResult.items.filter(item => {
        const matchMode = !item.collaborationMode || item.collaborationMode === collaborationTab
        const matchSearch = !searchValue || item.name.toLowerCase().includes(searchValue.toLowerCase())
        return matchMode && matchSearch
      }),
    [collaborationTab, listResult.items, searchValue],
  )

  useEffect(() => {
    const nextType = getDatasetTypeFromSearch(location.search)
    setDatasetType(nextType)
    form.setFieldValue('datasetType', nextType)
  }, [form, location.search])

  useEffect(() => {
    let active = true
    setListLoading(true)

    void dataServiceApi
      .listAnnotationTasks({ page, pageSize })
      .then(result => {
        if (!active) {
          return
        }
        setListResult(result as PaginatedResult<AnnotationTask>)
      })
      .finally(() => {
        if (active) {
          setListLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [annotationTasks, page, pageSize])

  const handleDatasetTypeChange = (nextType: 'text-generation' | 'image-understanding') => {
    navigate(`/data-annotation?dataset_type=${nextType}`)
    setSelectedDatasetValue(undefined)
    form.setFieldsValue({ dataset: undefined, datasetType: nextType, outputName: undefined })
  }

  const handleOpenCreate = () => {
    form.resetFields()
    form.setFieldsValue({
      datasetType,
      outputMode: '新增版本',
      sourceType: '已有数据集',
    })
    setSelectedDatasetValue(undefined)
    setCreateOpen(true)
  }

  const handleCloseCreate = () => {
    setCreateOpen(false)
    setSelectedDatasetValue(undefined)
  }

  const handleSubmitCreate = async () => {
    try {
      await form.validateFields()
      setCreateOpen(false)
    } catch {
      return
    }

    const datasetLabel = selectedDataset?.label ?? '-'
    const outputMode = form.getFieldValue('outputMode')
    setCreating(true)
    try {
      await dataServiceApi.createAnnotationTask({
        name: form.getFieldValue('name'),
        dataVolume: selectedDataset?.count ?? 0,
        collaborationMode: collaborationTab,
        reviewerCount: collaborationTab === 'multi' ? form.getFieldValue('reviewerCount') : undefined,
        reviewMode: collaborationTab === 'multi' ? form.getFieldValue('reviewMode') : undefined,
        datasetType: form.getFieldValue('datasetType'),
        preDataset: datasetLabel,
        postDataset: outputMode === '新增版本' ? `${datasetLabel}-标注结果` : '-',
        outputMode,
      })
    } finally {
      setCreating(false)
    }
  }

  const columns: ColumnsType<AnnotationTask> = [
    { title: '任务名称', dataIndex: 'name', key: 'name' },
    { title: '数据量', dataIndex: 'dataVolume', key: 'dataVolume', width: 88 },
    {
      title: '协作模式',
      dataIndex: 'collaborationMode',
      key: 'collaborationMode',
      width: 110,
      render: value => (value === 'multi' ? '多人标注' : '在线标注'),
    },
    {
      title: '标注进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 110,
      render: value => (value === null ? '-' : <Progress percent={value} size="small" showInfo={false} />),
    },
    { title: '标注前数据集', dataIndex: 'preDataset', key: 'preDataset', ellipsis: true },
    { title: '标注后数据集', dataIndex: 'postDataset', key: 'postDataset', ellipsis: true },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 120 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 176 },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => { setSelectedTask(record); setDetailOpen(true) }}>
            查看详情
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={async () => {
              await dataServiceApi.deleteAnnotationTask(record.id)
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ marginBottom: 24 }}>
          <Title level={2} style={{ marginBottom: 8, color: '#0f172a' }}>数据标注</Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            支持数据集在线标注、多人协同,提升数据处理效率。
          </Text>
        </div>

        <Tabs
          activeKey={collaborationTab}
          onChange={key => setCollaborationTab(key as 'online' | 'multi')}
          items={[
            { key: 'online', label: '在线标注' },
            { key: 'multi', label: '多人标注' },
          ]}
          style={{ marginBottom: 18 }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
          {stepCards.map(card => (
            <Card
              key={card.title}
              style={{ borderRadius: 16, border: '1px solid #e2e8f0', minHeight: 156 }}
              styles={{ body: { padding: 24 } }}
            >
              <EditOutlined style={{ fontSize: 24, color: '#0f172a', marginBottom: 20 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>{card.title}</div>
              <Text type="secondary" style={{ lineHeight: 1.7 }}>{card.description}</Text>
            </Card>
          ))}
        </div>

        <Tabs
          activeKey={datasetType}
          onChange={key => handleDatasetTypeChange(key as 'text-generation' | 'image-understanding')}
          items={[
            { key: 'text-generation', label: '文本标注' },
            { key: 'image-understanding', label: '图像标注' },
          ]}
          style={{ marginBottom: 16 }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
          <Input
            placeholder="请输入任务名称"
            value={searchValue}
            onChange={event => setSearchValue(event.target.value)}
            style={{ width: 220, marginRight: 'auto' }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => message.success('刷新成功')}>刷新</Button>
          <Button onClick={() => setSearchValue('')}>重置</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            创建标注任务
          </Button>
        </div>

        <Card
          style={{ borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          styles={{ body: { padding: 0 } }}
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredItems}
            loading={listLoading}
            tableLayout="fixed"
            scroll={{ x: 1280 }}
            pagination={{
              current: page,
              pageSize,
              total: filteredItems.length,
              showSizeChanger: false,
              showTotal: total => `共 ${total} 条记录`,
              onChange: nextPage => setPage(nextPage),
            }}
            locale={{ emptyText: '暂无标注任务' }}
          />
        </Card>
      </div>

      <Modal
        title={collaborationTab === 'online' ? '在线标注任务' : '多人标注任务'}
        open={createOpen}
        onCancel={handleCloseCreate}
        width={680}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={handleCloseCreate}>取消</Button>
            <Button type="primary" loading={creating} onClick={handleSubmitCreate}>确定</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ sourceType: '已有数据集', outputMode: '新增版本', datasetType }}>
          <Form.Item
            label="任务名称"
            name="name"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="请输入任务名称" />
          </Form.Item>

          <Form.Item
            label="数据集类型"
            name="datasetType"
            rules={[{ required: true, message: '请选择数据集类型' }]}
          >
            <Select onChange={value => handleDatasetTypeChange(value)}>
              <Select.Option value="text-generation">文本生成</Select.Option>
              <Select.Option value="image-understanding">图像理解</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="数据选择" name="sourceType">
            <Select disabled>
              <Select.Option value="已有数据集">已有数据集</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="选择数据集"
            name="dataset"
            rules={[{ required: true, message: '请选择数据集' }]}
          >
            <Select
              placeholder="选择"
              onChange={value => setSelectedDatasetValue(value)}
              options={datasetOptions.map(item => ({ value: item.value, label: item.label }))}
            />
          </Form.Item>

          <div style={{ marginTop: -6, marginBottom: 16 }}>
            <Text type="secondary">数据量:{selectedDataset?.count ?? 0}条</Text>
          </div>

          <Form.Item label="处理后数据集" name="outputMode">
            <Select disabled>
              <Select.Option value="新增版本">新增版本</Select.Option>
            </Select>
          </Form.Item>

          {collaborationTab === 'multi' && (
            <>
              <Form.Item label="协作人数" name="reviewerCount" rules={[{ required: true, message: '请输入协作人数' }]}>
                <Select
                  options={[
                    { value: 2, label: '2人' },
                    { value: 3, label: '3人' },
                    { value: 5, label: '5人' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="审核方式" name="reviewMode" rules={[{ required: true, message: '请选择审核方式' }]}>
                <Select
                  options={[
                    { value: '双人交叉审核', label: '双人交叉审核' },
                    { value: '组长复核', label: '组长复核' },
                    { value: '全量复核', label: '全量复核' },
                  ]}
                />
              </Form.Item>
            </>
          )}

          <Form.Item label="数据集名称">
            <Input value={selectedDataset?.label ?? '-'} disabled />
          </Form.Item>

          <Form.Item label="标注后数据集预览">
            <Input value={selectedDataset ? `${selectedDataset.label}-标注结果` : '-'} disabled />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="标注任务详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>关闭</Button>}
      >
        {selectedTask && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="任务名称" span={2}>{selectedTask.name}</Descriptions.Item>
            <Descriptions.Item label="数据量">{selectedTask.dataVolume}</Descriptions.Item>
            <Descriptions.Item label="标注进度">
              {selectedTask.progress === null ? '-' : <Progress percent={selectedTask.progress} size="small" showInfo={false} />}
            </Descriptions.Item>
            <Descriptions.Item label="协作模式">{selectedTask.collaborationMode === 'multi' ? '多人标注' : '在线标注'}</Descriptions.Item>
            <Descriptions.Item label="数据集类型">
              {selectedTask.datasetType === 'image-understanding' ? '图像理解' : '文本生成'}
            </Descriptions.Item>
            <Descriptions.Item label="协作人数">
              {selectedTask.collaborationMode === 'multi' ? `${selectedTask.reviewerCount ?? '-'}人` : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="审核方式">{selectedTask.reviewMode ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="输出方式">{selectedTask.outputMode ?? '新增版本'}</Descriptions.Item>
            <Descriptions.Item label="标注前数据集" span={2}>{selectedTask.preDataset}</Descriptions.Item>
            <Descriptions.Item label="标注后数据集" span={2}>{selectedTask.postDataset}</Descriptions.Item>
            <Descriptions.Item label="创建人">{selectedTask.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{selectedTask.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default DataAnnotation
