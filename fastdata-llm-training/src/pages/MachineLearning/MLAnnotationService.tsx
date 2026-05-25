import React, { useState } from 'react'
import { Button, Card, Empty, message, Modal, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AppstoreOutlined, PlusOutlined } from '@ant-design/icons'
import { formatResourceLockMessage, getOnlineAnnotationServiceReferenceLocks } from '../../services/resourceReferenceGuard'
import TaskMetadataEditor from '../../components/TaskMetadataEditor'
import { canAccessResourceData, getOperationDeniedMessage } from '../../services/permissionStore'

const { Title, Text } = Typography

type AnnotationServiceRecord = {
  id: string
  name: string
  description?: string
  tool: string
  targetDataset: string
  status: '运行中' | '已停止'
  creator: string
  createdAt: string
}

const seedServices: AnnotationServiceRecord[] = [
  {
    id: 'svc-1',
    name: '图像分类在线标注服务',
    description: '用于图像分类任务的在线标注辅助服务',
    tool: '内置标注工具',
    targetDataset: '图像分类/图像分类-多-1-V3',
    status: '运行中',
    creator: 'lab1',
    createdAt: '2026/04/15 11:05:00',
  },
]

const MLAnnotationService: React.FC = () => {
  const [services, setServices] = useState<AnnotationServiceRecord[]>(seedServices)
  const canOperateService = (record?: Pick<AnnotationServiceRecord, 'creator'> | null) =>
    canAccessResourceData('machine', record?.creator).allowed
  const warnNoServiceDataAccess = (record?: Pick<AnnotationServiceRecord, 'creator'> | null) => {
    const permission = canAccessResourceData('machine', record?.creator)
    if (permission.allowed) {
      return true
    }
    message.warning(getOperationDeniedMessage(permission.reason))
    return false
  }

  const stopService = (record: AnnotationServiceRecord) => {
    if (!warnNoServiceDataAccess(record)) {
      return
    }
    setServices(previous => previous.map(item => (item.id === record.id ? { ...item, status: '已停止' } : item)))
    message.success(`已停止在线标注服务：${record.name}`)
  }

  const deleteService = (record: AnnotationServiceRecord) => {
    if (!warnNoServiceDataAccess(record)) {
      return
    }
    if (record.status === '运行中') {
      Modal.warning({
        title: '在线标注服务运行中，暂不可删除',
        content: '请先停止服务，待服务释放后再删除。',
      })
      return
    }

    const locks = getOnlineAnnotationServiceReferenceLocks(record.name, record.targetDataset)
    if (locks.length) {
      Modal.warning({
        title: '在线标注服务正在被引用，暂不可删除',
        content: formatResourceLockMessage(record.name, locks),
      })
      return
    }

    Modal.confirm({
      title: '确认删除在线标注服务？',
      content: `删除后服务「${record.name}」将从列表移除，请确认是否继续。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setServices(previous => previous.filter(item => item.id !== record.id))
        message.success(`已删除在线标注服务：${record.name}`)
      },
    })
  }

  const columns: ColumnsType<AnnotationServiceRecord> = [
    {
      title: '服务名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (_value, record) => (
        <TaskMetadataEditor
          value={record.name}
          required
          maxLength={80}
          strong
          placeholder="请输入服务名称"
          disabled={!canOperateService(record)}
          onSave={name => {
            if (!warnNoServiceDataAccess(record)) {
              return
            }
            setServices(previous => previous.map(item => (item.id === record.id ? { ...item, name } : item)))
          }}
        />
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      render: (value, record) => (
        <TaskMetadataEditor
          value={value}
          emptyText="暂无描述"
          placeholder="请输入描述"
          type="secondary"
          disabled={!canOperateService(record)}
          onSave={description => {
            if (!warnNoServiceDataAccess(record)) {
              return
            }
            setServices(previous => previous.map(item => (item.id === record.id ? { ...item, description } : item)))
          }}
        />
      ),
    },
    { title: '标注工具', dataIndex: 'tool', key: 'tool' },
    { title: '目标数据集', dataIndex: 'targetDataset', key: 'targetDataset' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: value => <Tag color={value === '运行中' ? 'success' : 'default'}>{value}</Tag>,
    },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 110 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" disabled={record.status !== '运行中'} onClick={() => stopService(record)}>停止</Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              warnNoServiceDataAccess(record)
            }}
          >
            查看详情
          </Button>
          <Button type="link" size="small" danger onClick={() => deleteService(record)}>删除</Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%' }}>
      <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
        <Title level={2}>在线标注服务</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
          当前生产环境未提供稳定独立入口，先保留在线标注服务的可演示实现，承接机器学习标注的后续服务化能力。
        </Text>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />}>创建服务</Button>
        </div>

        {services.length ? (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={services}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条记录` }}
          />
        ) : (
          <Empty description="暂无在线标注服务" />
        )}
      </Card>
    </div>
  )
}

export default MLAnnotationService
