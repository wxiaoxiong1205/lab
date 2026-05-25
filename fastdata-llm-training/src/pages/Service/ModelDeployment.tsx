import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Divider,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ExperimentOutlined, PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  canRunTaskLifecycleAction,
  getPrimaryTaskLifecycleAction,
  STARTING_TERMINATE_BLOCKED_MESSAGE,
  TASK_LIFECYCLE_TAG,
  type TaskLifecycleStatus,
} from '../../services/taskLifecycle'
import TaskMetadataEditor from '../../components/TaskMetadataEditor'
import { createTaskNotification } from '../../services/notificationStore'
import { canAccessResourceData, getCurrentUser, getOperationDeniedMessage } from '../../services/permissionStore'

const { Text, Title } = Typography

type ServiceRecord = {
  id: string
  name: string
  description?: string
  modelName: string
  modelSource: string
  instanceCount: number
  status: TaskLifecycleStatus
  creator: string
  createdAt: string
}

const services: ServiceRecord[] = [
  { id: 'svc-1', name: '服务名称-7B', description: 'Qwen2.5 7B 在线部署任务', modelName: 'Qwen2.5-7B-Instruct', modelSource: '基础模型', instanceCount: 2, status: '运行中', creator: 'admin', createdAt: '2026/03/19 11:00:00' },
  { id: 'svc-2', name: '服务名称-1.5B', description: '轻量模型部署验证任务', modelName: 'Qwen2.5-1.5B-Instruct', modelSource: '基础模型', instanceCount: 1, status: '已创建', creator: 'lab1', createdAt: '2026/03/17 08:30:00' },
]

function statusTag(status: ServiceRecord['status']): React.ReactNode {
  const config = TASK_LIFECYCLE_TAG[status]
  return <Tag color={config.color}>{config.label}</Tag>
}

const ModelDeployment: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [detailRecord, setDetailRecord] = useState<ServiceRecord | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const isCreateRoute = location.pathname === '/service/inference/hosted/create'
  const [serviceRows, setServiceRows] = useState(services)

  const filteredServices = useMemo(
    () => serviceRows.filter(item => item.name.toLowerCase().includes(searchValue.toLowerCase())),
    [searchValue, serviceRows],
  )

  const updateService = (id: string, updater: (record: ServiceRecord) => ServiceRecord) => {
    setServiceRows(previous => previous.map(item => (item.id === id ? updater(item) : item)))
  }

  const deleteService = (id: string) => {
    setServiceRows(previous => previous.filter(item => item.id !== id))
  }
  const canOperateService = (record?: Pick<ServiceRecord, 'creator'> | null) =>
    canAccessResourceData('llm', record?.creator).allowed
  const warnNoServiceDataAccess = (record?: Pick<ServiceRecord, 'creator'> | null) => {
    const permission = canAccessResourceData('llm', record?.creator)
    if (permission.allowed) {
      return true
    }
    message.warning(getOperationDeniedMessage(permission.reason))
    return false
  }

  const columns: ColumnsType<ServiceRecord> = [
    {
      title: '服务名称',
      dataIndex: 'name',
      key: 'name',
      width: 240,
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
            updateService(record.id, item => ({ ...item, name }))
          }}
        />
      ),
    },
    {
      title: '服务描述',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      render: (value, record) => (
        <TaskMetadataEditor
          value={value}
          emptyText="暂无描述"
          placeholder="请输入服务描述"
          type="secondary"
          disabled={!canOperateService(record)}
          onSave={description => {
            if (!warnNoServiceDataAccess(record)) {
              return
            }
            updateService(record.id, item => ({ ...item, description }))
          }}
        />
      ),
    },
    { title: '模型名称', dataIndex: 'modelName', key: 'modelName' },
    { title: '模型来源', dataIndex: 'modelSource', key: 'modelSource' },
    { title: '实例数', dataIndex: 'instanceCount', key: 'instanceCount', width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: value => statusTag(value),
    },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 110 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, record) => (
        <Space size={0}>
          {getPrimaryTaskLifecycleAction(record.status) && (
            <Button
              type="link"
              size="small"
              onClick={() =>
                {
                  if (!warnNoServiceDataAccess(record)) {
                    return
                  }
                  const nextStatus = getPrimaryTaskLifecycleAction(record.status) === 'start' ? '启动中' : '已创建'
                  updateService(record.id, item => ({
                    ...item,
                    status: nextStatus,
                  }))
                  createTaskNotification({
                    type: 'deployment',
                    status: 'started',
                    severity: 'info',
                    taskId: record.id,
                    taskName: record.name,
                    taskModule: '大模型部署',
                    title: '模型部署任务已启动',
                    content: `${record.name} 已进入${nextStatus}。`,
                    targetPath: '/service/inference/hosted',
                  })
                }
              }
            >
              {getPrimaryTaskLifecycleAction(record.status) === 'start' ? '启动' : '重新提交'}
            </Button>
          )}
          <Button
            type="link"
            size="small"
            disabled={!canRunTaskLifecycleAction(record.status, 'edit')}
            onClick={() => warnNoServiceDataAccess(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            disabled={!canRunTaskLifecycleAction(record.status, 'terminate')}
            onClick={() => {
              if (!warnNoServiceDataAccess(record)) {
                return
              }
              if (record.status === '启动中') {
                return message.warning(STARTING_TERMINATE_BLOCKED_MESSAGE)
              }
              updateService(record.id, item => ({ ...item, status: '已终止' }))
              createTaskNotification({
                type: 'deployment',
                status: 'terminated',
                severity: 'warning',
                taskId: record.id,
                taskName: record.name,
                taskModule: '大模型部署',
                title: '模型部署任务已终止',
                content: `${record.name} 已终止。`,
                targetPath: '/service/inference/hosted',
              })
            }}
          >
            终止
          </Button>
          <Button type="link" size="small" onClick={() => {
            if (!warnNoServiceDataAccess(record)) {
              return
            }
            setDetailRecord(record)
          }}>查看详情</Button>
          <Button
            type="link"
            size="small"
            danger
            disabled={!canRunTaskLifecycleAction(record.status, 'delete')}
            onClick={() => {
              if (!warnNoServiceDataAccess(record)) {
                return
              }
              deleteService(record.id)
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const openCreate = () => {
    form.resetFields()
    navigate('/service/inference/hosted/create')
  }

  const closeCreate = () => {
    navigate('/service/inference/hosted')
  }

  const submitCreate = async () => {
    try {
      await form.validateFields()
      const values = form.getFieldsValue()
      const currentUser = getCurrentUser()
      const nextRecord: ServiceRecord = {
        id: `svc-${Date.now()}`,
        name: values.name,
        description: values.description ?? '',
        modelName: values.model ?? 'Qwen2.5-7B-Instruct',
        modelSource: values.modelSource === 'base' ? '基础模型' : '训练生成',
        instanceCount: values.instanceCount ?? 1,
        status: '已创建',
        creator: currentUser.account,
        createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      }
      setServiceRows(previous => [
        nextRecord,
        ...previous,
      ])
      createTaskNotification({
        type: 'deployment',
        status: 'created',
        severity: 'info',
        taskId: nextRecord.id,
        taskName: nextRecord.name,
        taskModule: '大模型部署',
        title: '模型部署任务已创建',
        content: `${nextRecord.name} 已创建，等待启动。`,
        targetPath: '/service/inference/hosted',
      })
      closeCreate()
    } catch {
      return
    }
  }

  if (isCreateRoute) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={closeCreate}>返回</Button>
          <div>
            <Text strong style={{ display: 'block', fontSize: 26, color: '#0f172a', lineHeight: 1.15 }}>部署服务</Text>
            <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 14, lineHeight: 1.7 }}>
              配置模型、资源和镜像信息，完成部署发布。
            </Text>
          </div>
        </div>

        <Card style={{ borderRadius: 18, border: '1px solid #e5e7eb' }}>
          <Form form={form} layout="vertical" initialValues={{ modelSource: 'trained', instanceCount: 1 }}>
            <Title level={3}>部署服务</Title>
            <Divider />

            <Form.Item label="服务名称" name="name" rules={[{ required: true, message: '请输入服务名称' }]}>
              <Input placeholder="请输入服务名称" />
            </Form.Item>

            <Form.Item label="服务描述" name="description">
              <Input.TextArea rows={3} maxLength={300} showCount placeholder="请输入服务描述，最多 300 字" />
            </Form.Item>

            <Divider />
            <Title level={3}>模型配置</Title>

            <Form.Item label="模型来源" name="modelSource" rules={[{ required: true, message: '请选择模型来源' }]}>
              <Select>
                <Select.Option value="trained">训练生成</Select.Option>
                <Select.Option value="base">基础模型</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="选择模型" name="model" rules={[{ required: true, message: '请选择模型' }]}>
              <Select placeholder="请选择模型" />
            </Form.Item>

            <Divider />
            <Title level={3}>资源信息</Title>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <Form.Item label="CPU请求" name="cpuRequest"><InputNumber style={{ width: '100%' }} addonAfter="Core" /></Form.Item>
              <Form.Item label="CPU限制" name="cpuLimit"><InputNumber style={{ width: '100%' }} addonAfter="Core" /></Form.Item>
              <Form.Item label="内存请求" name="memoryRequest"><InputNumber style={{ width: '100%' }} addonAfter="GB" /></Form.Item>
              <Form.Item label="内存限制" name="memoryLimit"><InputNumber style={{ width: '100%' }} addonAfter="GB" /></Form.Item>
              <Form.Item label="显卡类型" name="gpuType"><Select placeholder="请选择显卡类型" /></Form.Item>
              <Form.Item label="显卡数量" name="gpuCount"><Select placeholder="请选择显卡数量" /></Form.Item>
            </div>

            <Form.Item label="部署实例数" name="instanceCount">
              <InputNumber style={{ width: '100%' }} min={1} max={10} />
            </Form.Item>

            <Divider />
            <Title level={3}>镜像配置</Title>

            <Form.Item label="镜像类型" name="imageType"><Select placeholder="请选择镜像类型" /></Form.Item>
            <Form.Item label="选择镜像" name="image"><Select placeholder="请选择镜像" /></Form.Item>
            <Form.Item label="运行命令" name="command"><Input.TextArea rows={2} placeholder="可选配置，如: --port 8000" /></Form.Item>

            <div style={{ display: 'flex', gap: 12 }}>
              <Button onClick={closeCreate}>取消</Button>
              <Button type="primary" onClick={submitCreate}>部署</Button>
            </div>
          </Form>
        </Card>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>大模型部署</Title>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <Input
              placeholder="请输入服务名称"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              style={{ width: 260 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              部署服务
            </Button>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredServices}
            pagination={{ pageSize: 10 }}
          />
        </Card>
      </div>

      <Modal
        title="部署服务详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
      >
        {detailRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="服务名称" span={2}>{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="服务描述" span={2}>{detailRecord.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="模型名称">{detailRecord.modelName}</Descriptions.Item>
            <Descriptions.Item label="模型来源">{detailRecord.modelSource}</Descriptions.Item>
            <Descriptions.Item label="实例数">{detailRecord.instanceCount}</Descriptions.Item>
            <Descriptions.Item label="状态">{statusTag(detailRecord.status)}</Descriptions.Item>
            <Descriptions.Item label="创建人">{detailRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default ModelDeployment
