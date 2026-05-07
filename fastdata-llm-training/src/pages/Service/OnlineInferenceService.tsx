import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  onlineInferenceServiceActions,
  type OnlineInferenceServiceRecord,
  type OnlineServiceConnectionStatus,
  type OnlineServiceModelType,
  useOnlineInferenceServices,
} from '../../services/onlineInferenceServiceStore'
import { useLocation, useNavigate } from 'react-router-dom'

const { Title, Text } = Typography

const sectionCardStyle: React.CSSProperties = {
  borderRadius: 18,
  border: '1px solid #e5e7eb',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.04)',
}

const statusColorMap: Record<OnlineServiceConnectionStatus, string> = {
  测试通过: 'green',
  测试失败: 'red',
}

const OnlineInferenceService: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const services = useOnlineInferenceServices()
  const [searchValue, setSearchValue] = useState('')
  const [statusFilter, setStatusFilter] = useState<OnlineServiceConnectionStatus | undefined>()
  const [modelTypeFilter, setModelTypeFilter] = useState<OnlineServiceModelType | undefined>()
  const [detailRecord, setDetailRecord] = useState<OnlineInferenceServiceRecord | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const isCreateRoute = location.pathname === '/service/inference/external/create'
  const redirectPath = new URLSearchParams(location.search).get('redirect')

  useEffect(() => {
    if (isCreateRoute) {
      form.resetFields()
      setEditingServiceId(null)
      setCreateOpen(true)
    }
  }, [form, isCreateRoute])

  const filteredData = useMemo(
    () =>
      services.filter(item => {
        const matchSearch = !searchValue || item.name.toLowerCase().includes(searchValue.toLowerCase())
        const matchStatus = !statusFilter || item.connectionStatus === statusFilter
        const matchType = !modelTypeFilter || item.modelType === modelTypeFilter
        return matchSearch && matchStatus && matchType
      }),
    [modelTypeFilter, searchValue, services, statusFilter],
  )

  const columns: ColumnsType<OnlineInferenceServiceRecord> = [
    {
      title: '服务名称',
      dataIndex: 'name',
      key: 'name',
      render: value => <Button type="link" size="small" style={{ padding: 0 }}>{value}</Button>,
    },
    {
      title: '连接状态',
      dataIndex: 'connectionStatus',
      key: 'connectionStatus',
      width: 120,
      render: (value: OnlineServiceConnectionStatus) => <Tag color={statusColorMap[value]}>{value}</Tag>,
    },
    { title: '描述', dataIndex: 'description', key: 'description', width: 160 },
    { title: '模型类型', dataIndex: 'modelType', key: 'modelType', width: 150 },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 120 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 },
    {
      title: '操作',
      key: 'action',
      width: 260,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>查看详情</Button>
          <Button type="link" size="small" onClick={() => {
            form.setFieldsValue(record)
            setDetailRecord(null)
            setEditingServiceId(record.id)
            setCreateOpen(true)
          }}>编辑</Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              onlineInferenceServiceActions.updateService(record.id, item =>
                ({ ...item, connectionStatus: item.connectionStatus === '测试通过' ? '测试失败' : '测试通过' }),
              )
              message.success('连接测试已执行')
            }}
          >
            连接测试
          </Button>
          <Button type="text" size="small">...</Button>
        </Space>
      ),
    },
  ]

  const openCreate = () => {
    form.resetFields()
    setEditingServiceId(null)
    setCreateOpen(true)
  }

  const submit = async () => {
    try {
      const values = await form.validateFields()
      if (editingServiceId) {
        onlineInferenceServiceActions.updateService(editingServiceId, record => ({
          ...record,
          name: values.name,
          description: values.description,
          modelType: values.modelType,
        }))
        message.success('在线推理服务已更新')
      } else {
        onlineInferenceServiceActions.createService({
          name: values.name,
          connectionStatus: '测试失败',
          description: values.description,
          modelType: values.modelType,
          creator: 'zhangsan',
        })
        message.success('在线推理服务已创建')
      }
      setCreateOpen(false)
      setEditingServiceId(null)
      form.resetFields()
      if (isCreateRoute && redirectPath) {
        navigate(redirectPath, { replace: true })
      } else if (isCreateRoute) {
        navigate('/service/inference/external', { replace: true })
      }
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <Card style={sectionCardStyle}>
          <Title level={2} style={{ marginBottom: 20 }}>在线推理服务</Title>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <Space wrap>
              <Input
                placeholder="请输入服务名称"
                value={searchValue}
                onChange={event => setSearchValue(event.target.value)}
                style={{ width: 220 }}
              />
              <Select
                placeholder="服务连接状态"
                allowClear
                value={statusFilter}
                onChange={value => setStatusFilter(value)}
                style={{ width: 160 }}
                options={[
                  { value: '测试通过', label: '测试通过' },
                  { value: '测试失败', label: '测试失败' },
                ]}
              />
              <Select
                placeholder="模型类型"
                allowClear
                value={modelTypeFilter}
                onChange={value => setModelTypeFilter(value)}
                style={{ width: 160 }}
                options={[
                  { value: '文本生成', label: '文本生成' },
                  { value: '图像理解', label: '图像理解' },
                  { value: '图像理解/文本生成', label: '图像理解/文本生成' },
                ]}
              />
              <Button onClick={() => message.success('搜索完成')}>搜索</Button>
              <Button
                onClick={() => {
                  setSearchValue('')
                  setStatusFilter(undefined)
                  setModelTypeFilter(undefined)
                }}
              >
                重置
              </Button>
            </Space>

            <Button type="primary" onClick={openCreate}>新建服务</Button>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredData}
            scroll={{ x: 1200 }}
            tableLayout="fixed"
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条数据` }}
          />
        </Card>
      </div>

      <Modal
        title="在线推理服务详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
      >
        {detailRecord && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="服务名称">{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="连接状态">
              <Tag color={statusColorMap[detailRecord.connectionStatus]}>{detailRecord.connectionStatus}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="描述">{detailRecord.description}</Descriptions.Item>
            <Descriptions.Item label="模型类型">{detailRecord.modelType}</Descriptions.Item>
            <Descriptions.Item label="创建人">{detailRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal
        title={editingServiceId ? '编辑在线推理服务' : '新建在线推理服务'}
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false)
          setEditingServiceId(null)
          if (isCreateRoute && redirectPath) {
            navigate(redirectPath, { replace: true })
          } else if (isCreateRoute) {
            navigate('/service/inference/external', { replace: true })
          }
        }}
        onOk={submit}
        okText={editingServiceId ? '保存' : '创建'}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="服务名称" name="name" rules={[{ required: true, message: '请输入服务名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="模型类型" name="modelType" rules={[{ required: true, message: '请选择模型类型' }]}>
            <Select
              options={[
                { value: '文本生成', label: '文本生成' },
                { value: '图像理解', label: '图像理解' },
                { value: '图像理解/文本生成', label: '图像理解/文本生成' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default OnlineInferenceService
