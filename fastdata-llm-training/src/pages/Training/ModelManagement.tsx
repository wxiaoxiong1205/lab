import React, { useMemo, useState } from 'react'
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
  Divider,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { BookOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  canRunTaskLifecycleAction,
  getPrimaryTaskLifecycleAction,
  TASK_LIFECYCLE_TAG,
  type TaskLifecycleStatus,
} from '../../services/taskLifecycle'
import { formatResourceLockMessage, getModelReferenceLocks } from '../../services/resourceReferenceGuard'

const { Text, Title } = Typography

type ModelRecord = {
  id: string
  name: string
  modelType: string
  baseModel: string
  versionCount: number
  status: TaskLifecycleStatus
  creator: string
  createdAt: string
}

const modelList: ModelRecord[] = [
  { id: 'm-1', name: '123123', modelType: '文本生成', baseModel: 'Qwen2.5-0.5B', versionCount: 2, status: '已完成', creator: 'admin', createdAt: '2026/03/20 10:00:00' },
  { id: 'm-2', name: 'demo-basion-1', modelType: '文本生成', baseModel: 'Qwen2.5-0.5B', versionCount: 3, status: '已创建', creator: 'lab1', createdAt: '2026/03/18 14:30:00' },
  { id: 'm-3', name: 'Qwen-test001', modelType: '文本生成', baseModel: 'Qwen2.5-0.5B-Instruct', versionCount: 3, status: '失败', creator: 'admin', createdAt: '2026/03/25 09:00:00' },
  { id: 'm-4', name: 'Lora模型', modelType: '文本生成', baseModel: 'Qwen3-1.7B', versionCount: 1, status: '已终止', creator: 'lab1', createdAt: '2026/03/22 11:12:00' },
]

function statusTag(status: ModelRecord['status']): React.ReactNode {
  const config = TASK_LIFECYCLE_TAG[status]
  return <Tag color={config.color}>{config.label}</Tag>
}

const ModelManagement: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [searchValue, setSearchValue] = useState('')
  const [detailRecord, setDetailRecord] = useState<ModelRecord | null>(null)
  const [rows, setRows] = useState(modelList)
  const isCreateRoute = location.pathname === '/model/create'

  const filteredModels = useMemo(
    () => rows.filter(item => item.name.toLowerCase().includes(searchValue.toLowerCase())),
    [rows, searchValue],
  )

  const columns: ColumnsType<ModelRecord> = [
    { title: '模型名称', dataIndex: 'name', key: 'name' },
    { title: '模型类型', dataIndex: 'modelType', key: 'modelType' },
    { title: '基础模型', dataIndex: 'baseModel', key: 'baseModel' },
    { title: '版本数量', dataIndex: 'versionCount', key: 'versionCount', width: 120 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: value => statusTag(value) },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_, record) => (
        <Space size={0}>
          {getPrimaryTaskLifecycleAction(record.status) && (
            <Button
              type="link"
              size="small"
              onClick={() =>
                setRows(previous =>
                  previous.map(item =>
                    item.id === record.id
                      ? {
                          ...item,
                          status: getPrimaryTaskLifecycleAction(item.status) === 'start' ? '启动中' : '已创建',
                        }
                      : item,
                  ),
                )
              }
            >
              {getPrimaryTaskLifecycleAction(record.status) === 'start' ? '启动' : '重新提交'}
            </Button>
          )}
          <Button type="link" size="small" disabled={!canRunTaskLifecycleAction(record.status, 'edit')}>编辑</Button>
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>查看详情</Button>
          <Button
            type="link"
            size="small"
            danger
            disabled={!canRunTaskLifecycleAction(record.status, 'delete')}
            onClick={() => {
              const locks = getModelReferenceLocks(record.name)
              if (locks.length) {
                Modal.warning({
                  title: '模型正在被引用，暂不可删除',
                  content: formatResourceLockMessage(record.name, locks),
                })
                return
              }

              setRows(previous => previous.filter(item => item.id !== record.id))
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
    navigate('/model/create')
  }

  const closeCreate = () => {
    navigate('/model')
  }

  const submitCreate = async () => {
    try {
      await form.validateFields()
      closeCreate()
    } catch {
      return
    }
  }

  if (isCreateRoute) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ marginBottom: 20 }} />
        <Card style={{ borderRadius: 18, border: '1px solid #e5e7eb' }}>
          <Form form={form} layout="vertical">
            <Title level={3}>基础信息</Title>

            <Form.Item
              label="模型名称"
              name="name"
              rules={[{ required: true, message: '请输入模型名称' }]}
              extra="支持中英文、数字、下划线、中划线，不能以下划线或中划线开头，2-64个字符"
            >
              <Input placeholder="请输入模型名称" maxLength={64} showCount />
            </Form.Item>

            <Form.Item label="模型版本">
              <Input value="V1" disabled />
            </Form.Item>

            <Form.Item label="模型描述" name="description">
              <Input.TextArea rows={3} placeholder="请输入模型描述，200字以内" maxLength={200} showCount />
            </Form.Item>

            <Divider />
            <Title level={3}>模型配置</Title>

            <Form.Item label="模型来源" name="modelSource" rules={[{ required: true, message: '请选择模型来源' }]}>
              <Select>
                <Select.Option value="trained">大模型训练</Select.Option>
                <Select.Option value="notebook">Notebook</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="模型类型" name="modelType" rules={[{ required: true, message: '请选择模型类型' }]}>
              <Select>
                <Select.Option value="文本生成">文本生成</Select.Option>
                <Select.Option value="图像生成" disabled>图像生成</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="训练任务" name="trainingTask">
              <Select placeholder="请选择训练任务" />
            </Form.Item>

            <Form.Item label="Checkpoint" name="checkpoint">
              <Select placeholder="请选择Checkpoint" />
            </Form.Item>

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <Button onClick={closeCreate}>取消</Button>
              <Button type="primary" onClick={submitCreate}>确定</Button>
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
          <Title level={2} style={{ marginBottom: 20 }}>我的模型</Title>

          <TabsPlaceholder />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="搜索模型名称"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              style={{ width: 260 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              创建模型
            </Button>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredModels}
            pagination={{ pageSize: 10, showTotal: total => `第 1-${total} 条，共 ${total} 条` }}
          />
        </Card>
      </div>

      <Modal
        title="模型详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
      >
        {detailRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="模型名称" span={2}>{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="模型类型">{detailRecord.modelType}</Descriptions.Item>
            <Descriptions.Item label="基础模型">{detailRecord.baseModel}</Descriptions.Item>
            <Descriptions.Item label="版本数量">{detailRecord.versionCount}</Descriptions.Item>
            <Descriptions.Item label="状态">{statusTag(detailRecord.status)}</Descriptions.Item>
            <Descriptions.Item label="创建人">{detailRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

const TabsPlaceholder: React.FC = () => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: 'inline-flex', gap: 24, borderBottom: '1px solid #e5e7eb', width: '100%' }}>
      <div style={{ padding: '0 0 12px', color: '#2563eb', borderBottom: '2px solid #2563eb', fontWeight: 600 }}>我的模型</div>
    </div>
  </div>
)

export default ModelManagement
