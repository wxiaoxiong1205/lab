import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import { CUSTOM_MODEL_PROVIDER, knownModelProviders, loadBaseModelCatalog, modelProviderOptions, saveBaseModelCatalog } from '../../data/modelCatalog'
import type { BaseModelRecord } from '../../types/shared'
import {
  canRunTaskLifecycleAction,
  getPrimaryTaskLifecycleAction,
  TASK_LIFECYCLE_TAG,
  type TaskLifecycleStatus,
} from '../../services/taskLifecycle'
import { formatResourceLockMessage, getModelReferenceLocks } from '../../services/resourceReferenceGuard'

const { Title } = Typography

type BaseModelRow = Omit<BaseModelRecord, 'status'> & {
  status: TaskLifecycleStatus
  modelSource: 'local' | 'modelscope'
}

const toBaseModelRow = (model: BaseModelRecord, index: number): BaseModelRow => ({
  ...model,
  status: model.status === 'running' ? '运行中' : '已创建',
  modelSource: index % 2 === 0 ? 'modelscope' : 'local',
})

const toCatalogModel = (row: BaseModelRow): BaseModelRecord => ({
  id: row.id,
  code: row.code,
  name: row.name,
  description: row.description,
  provider: row.provider,
  address: row.address,
  status: row.status === '运行中' ? 'running' : 'stopped',
  createdAt: row.createdAt,
})

function statusTag(status: TaskLifecycleStatus): React.ReactNode {
  const config = TASK_LIFECYCLE_TAG[status]
  return <Tag color={config.color}>{config.label}</Tag>
}

const BaseModelManagement: React.FC = () => {
  const [form] = Form.useForm()
  const [providerFilter, setProviderFilter] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<BaseModelRow | null>(null)
  const [rows, setRows] = useState<BaseModelRow[]>(() => loadBaseModelCatalog().map(toBaseModelRow))
  const [modelSource, setModelSource] = useState<'local' | 'modelscope'>('local')
  const selectedProvider = Form.useWatch('provider', form) as string | undefined

  const modelCodeOptions = useMemo(
    () =>
      rows
        .filter(model => {
          if (!selectedProvider || selectedProvider === CUSTOM_MODEL_PROVIDER) return true
          return model.provider === selectedProvider
        })
        .map(model => ({ value: model.code, label: model.code })),
    [rows, selectedProvider],
  )

  const commitRows = (updater: (previous: BaseModelRow[]) => BaseModelRow[]) => {
    setRows(previous => {
      const next = updater(previous)
      saveBaseModelCatalog(next.map(toCatalogModel))
      return next
    })
  }

  const filteredData = useMemo(
    () =>
      rows.filter(item => {
        const matchProvider =
          !providerFilter ||
          (providerFilter === CUSTOM_MODEL_PROVIDER
            ? Boolean(item.provider && !knownModelProviders.includes(item.provider))
            : item.provider === providerFilter)
        return matchProvider
      }),
    [providerFilter, rows],
  )

  const columns: ColumnsType<BaseModelRow> = [
    { title: '模型Code', dataIndex: 'code', key: 'code', width: 220 },
    { title: '描述', dataIndex: 'description', key: 'description', width: 260, render: value => value || '-' },
    { title: '模型提供商', dataIndex: 'provider', key: 'provider', width: 150 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: value => statusTag(value) },
    {
      title: '操作',
      key: 'action',
      width: 360,
      render: (_, record) => (
        <Space size={0} style={{ whiteSpace: 'nowrap' }}>
          {getPrimaryTaskLifecycleAction(record.status) && canRunTaskLifecycleAction(record.status, 'start') && (
            <Button
              type="link"
              size="small"
              onClick={() =>
                commitRows(previous =>
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
              启动
            </Button>
          )}
          {(record.status === '失败' || record.status === '已终止') ? (
            <Button
              type="link"
              size="small"
              onClick={() =>
                commitRows(previous =>
                  previous.map(item =>
                    item.id === record.id ? { ...item, status: '已创建' } : item,
                  ),
                )
              }
            >
              重新提交
            </Button>
          ) : (
            <Button type="link" size="small" disabled={!canRunTaskLifecycleAction(record.status, 'edit')}>编辑</Button>
          )}
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>查看详情</Button>
          {record.modelSource !== 'local' && <Button type="link" size="small">日志</Button>}
          <Button
            type="link"
            size="small"
            danger
            disabled={!canRunTaskLifecycleAction(record.status, 'delete')}
            onClick={() => {
              const locks = getModelReferenceLocks(record.code)
              if (locks.length) {
                Modal.warning({
                  title: '模型正在被引用，暂不可删除',
                  content: formatResourceLockMessage(record.code, locks),
                })
                return
              }

              commitRows(previous => previous.filter(item => item.id !== record.id))
            }}
          >
            删除
          </Button>
          <Button
            type="link"
            size="small"
            disabled={!canRunTaskLifecycleAction(record.status, 'terminate')}
            onClick={() =>
              commitRows(previous =>
                previous.map(item => (item.id === record.id ? { ...item, status: '已终止' } : item)),
              )
            }
          >
            终止
          </Button>
        </Space>
      ),
    },
  ]

  const submitCreate = async () => {
    try {
      await form.validateFields()
      const values = form.getFieldsValue()
      const provider = values.provider === CUSTOM_MODEL_PROVIDER ? values.customProvider?.trim() : values.provider
      commitRows(previous => [
        {
          id: `base-${Date.now()}`,
          code: values.code,
          name: values.code,
          description: values.description,
          provider,
          status: '已创建',
          modelSource: values.modelSource,
          createdAt: new Date().toISOString(),
        },
        ...previous,
      ])
      setCreateOpen(false)
      form.resetFields()
      setModelSource('local')
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>模型仓库</Title>

          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <Space wrap>
              <Select
                placeholder="请选择模型提供商"
                allowClear
                value={providerFilter}
                onChange={value => setProviderFilter(value)}
                style={{ width: 180 }}
                options={modelProviderOptions}
              />
              <Button>搜索</Button>
              <Button onClick={() => { setProviderFilter(undefined) }}>重置</Button>
            </Space>
            <Space>
              <Button>刷新</Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields()
                  form.setFieldsValue({ modelSource: 'local' })
                  setModelSource('local')
                  setCreateOpen(true)
                }}
              >
                新增模型
              </Button>
            </Space>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredData}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 1180 }}
          />
        </Card>
      </div>

      <Modal
        title="新增基础模型"
        open={createOpen}
        width={640}
        onCancel={() => {
          setCreateOpen(false)
          form.resetFields()
          setModelSource('local')
        }}
        footer={
          <Space>
            <Button onClick={() => {
              setCreateOpen(false)
              form.resetFields()
              setModelSource('local')
            }}>取消</Button>
            <Button type="primary" onClick={submitCreate}>确定</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="模型来源" name="modelSource" initialValue="local" rules={[{ required: true, message: '请选择模型来源' }]}>
            <Space wrap>
              <Radio.Group
                onChange={event => {
                  const nextSource = event.target.value as 'local' | 'modelscope'
                  setModelSource(nextSource)
                  form.setFieldsValue({ code: undefined, cluster: undefined, scheduled: false })
                }}
              >
                <Radio.Button value="local">本地</Radio.Button>
                <Radio.Button value="modelscope">ModelScope</Radio.Button>
              </Radio.Group>
              <Typography.Link href="https://www.modelscope.cn/models" target="_blank">
                https://www.modelscope.cn/models
              </Typography.Link>
            </Space>
          </Form.Item>
          <Form.Item label="模型提供商" name="provider" rules={[{ required: true, message: '请选择模型提供商' }]}>
            <Select
              placeholder="请选择模型提供商"
              options={modelProviderOptions}
              onChange={() => form.setFieldsValue({ customProvider: undefined, code: undefined })}
            />
          </Form.Item>
          {selectedProvider === CUSTOM_MODEL_PROVIDER && (
            <Form.Item label="自定义提供商" name="customProvider" rules={[{ required: true, message: '请输入自定义提供商' }]}>
              <Input placeholder="请输入模型提供商名称" />
            </Form.Item>
          )}
          {modelSource === 'local' ? (
            selectedProvider === CUSTOM_MODEL_PROVIDER ? (
              <Form.Item label="模型Code" name="code" rules={[{ required: true, message: '请输入模型Code' }]}>
                <Input placeholder="请输入模型code" />
              </Form.Item>
            ) : (
              <Form.Item label="模型Code" name="code" rules={[{ required: true, message: '请选择模型Code' }]}>
                <Select
                  showSearch
                  placeholder="请选择模型Code"
                  options={modelCodeOptions}
                />
              </Form.Item>
            )
          ) : (
            <>
              <Form.Item label="模型Code" name="code" rules={[{ required: true, message: '请输入模型Code' }]}>
                <Input placeholder="请输入模型code" />
              </Form.Item>
              <Form.Item label="集群" name="cluster" rules={[{ required: true, message: '请选择集群' }]}>
                <Select
                  placeholder="请选择集群，用于模型下载"
                  options={[
                    { value: 'v1.12-cluster', label: 'V1.12版本集群' },
                    { value: 'gpu-training-cluster', label: 'GPU训练集群' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="任务定时配置" name="scheduled" valuePropName="checked" initialValue={false}>
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </>
          )}
          <Form.Item label="模型描述" name="description">
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入模型描述" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="模型仓库详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
      >
        {detailRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="模型Code" span={2}>{detailRecord.code}</Descriptions.Item>
            <Descriptions.Item label="模型名称">{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="模型提供商">{detailRecord.provider || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">{statusTag(detailRecord.status)}</Descriptions.Item>
            <Descriptions.Item label="模型来源">{detailRecord.modelSource === 'local' ? '本地' : 'ModelScope'}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{detailRecord.createdAt}</Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>{detailRecord.description || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default BaseModelManagement
