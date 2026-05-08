import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, TagsOutlined } from '@ant-design/icons'
import { useLocation } from 'react-router-dom'
import DocumentAgentSettings from './DocumentAgentSettings'

const { Title, Text } = Typography

type AttributeRecord = {
  id: string
  name: string
  description: string
  inputType: string
  value: string
  group: string
  required: boolean
}

type LabelRecord = {
  id: string
  name: string
  description: string
  group: string
  values: string[]
}

const attributeMenu = [
  { group: '数据管理', items: ['训练数据管理', '测试数据管理'] },
  { group: '模型服务', items: ['在线推理服务'] },
]

const labelMenu = [
  { group: '在线Notebook', items: ['自定义镜像'] },
  { group: '模型仓库', items: [] },
]

const seedAttributeRows: AttributeRecord[] = [
  { id: 'attr-1', name: '训练数据最大上传大小', description: '单次训练数据上传大小限制', inputType: 'number', value: '1024', group: '训练数据管理', required: true },
  { id: 'attr-2', name: '训练数据支持格式', description: '训练数据可上传格式', inputType: 'text', value: 'jsonl,json,xlsx', group: '训练数据管理', required: true },
  { id: 'attr-3', name: '测试数据最大上传大小', description: '单次测试数据上传大小限制', inputType: 'number', value: '512', group: '测试数据管理', required: true },
  { id: 'attr-4', name: '在线推理QPS限制', description: '在线推理服务默认 QPS 限制', inputType: 'number', value: '200', group: '在线推理服务', required: true },
]

const seedLabels: LabelRecord[] = [
  { id: 'label-model-provider', name: '模型提供商', description: '模型仓库可选模型提供商标签', group: '模型仓库', values: ['Qwen', 'DeepSeek', 'Llama', 'Mistral'] },
  { id: 'label-model-source', name: '模型来源', description: '模型仓库模型来源标签', group: '模型仓库', values: ['本地', 'ModelScope'] },
  { id: 'label-1', name: 'python版本', description: 'python镜像版本', group: '自定义镜像', values: ['python3.10', 'python3.11'] },
  { id: 'label-2', name: '框架', description: '深度学习框架', group: '自定义镜像', values: ['torch', 'tf'] },
]

const SystemSettings: React.FC = () => {
  const location = useLocation()
  const [searchValue, setSearchValue] = useState('')
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(location.search).get('tab') === 'agent' ? 'agent' : 'attributes')
  const [activeGroup, setActiveGroup] = useState('训练数据管理')
  const [attributes, setAttributes] = useState<AttributeRecord[]>(seedAttributeRows)
  const [labels, setLabels] = useState<LabelRecord[]>(seedLabels)
  const [attributeOpen, setAttributeOpen] = useState(false)
  const [labelOpen, setLabelOpen] = useState(false)
  const [valueOpen, setValueOpen] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState<LabelRecord | null>(null)
  const [attributeForm] = Form.useForm()
  const [labelForm] = Form.useForm()
  const [valueForm] = Form.useForm()

  useEffect(() => {
    if (new URLSearchParams(location.search).get('tab') === 'agent') {
      setActiveTab('agent')
      setActiveGroup('文档中心')
      setSearchValue('')
    }
  }, [location.search])

  const filteredAttributes = useMemo(
    () =>
      attributes.filter(item =>
        item.group === activeGroup &&
        item.name.toLowerCase().includes(searchValue.toLowerCase()),
      ),
    [activeGroup, attributes, searchValue],
  )

  const filteredLabels = useMemo(
    () =>
      labels.filter(item =>
        item.group === activeGroup &&
        item.name.toLowerCase().includes(searchValue.toLowerCase()),
      ),
    [activeGroup, labels, searchValue],
  )

  const attributeColumns: ColumnsType<AttributeRecord> = [
    { title: '属性名称', dataIndex: 'name', key: 'name' },
    { title: '属性描述', dataIndex: 'description', key: 'description', render: value => value || '-' },
    { title: '属性值', dataIndex: 'value', key: 'value' },
    { title: '属性分组', dataIndex: 'group', key: 'group' },
    { title: '是否必填', dataIndex: 'required', key: 'required', render: value => (value ? '是' : '否') },
  ]

  const labelColumns: ColumnsType<LabelRecord> = [
    { title: '标签名称', dataIndex: 'name', key: 'name' },
    { title: '标签描述', dataIndex: 'description', key: 'description', render: value => value || '-' },
    { title: '标签值数量', key: 'valueCount', render: (_, record) => record.values.length },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, record) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setSelectedLabel(record)
              valueForm.resetFields()
              setValueOpen(true)
            }}
          >
            查看标签值
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              labelForm.setFieldsValue({ name: record.name, description: record.description })
              setSelectedLabel(record)
              setLabelOpen(true)
            }}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => {
              setLabels(previous => previous.filter(item => item.id !== record.id))
              message.success(`已删除标签：${record.name}`)
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const submitLabel = async () => {
    try {
      const values = await labelForm.validateFields()
      if (selectedLabel) {
        setLabels(previous =>
          previous.map(item =>
            item.id === selectedLabel.id ? { ...item, name: values.name, description: values.description || '' } : item,
          ),
        )
        message.success('标签已更新')
      } else {
        setLabels(previous => [
          {
            id: `label-${Date.now()}`,
            name: values.name,
            description: values.description || '',
            group: activeGroup,
            values: [],
          },
          ...previous,
        ])
        message.success('标签已添加')
      }
      setLabelOpen(false)
      setSelectedLabel(null)
      labelForm.resetFields()
    } catch {
      return
    }
  }

  const submitAttribute = async () => {
    try {
      const values = await attributeForm.validateFields()
      setAttributes(previous => [
        {
          id: `attr-${Date.now()}`,
          name: values.name,
          description: values.description || '',
          inputType: 'text',
          value: values.value,
          group: values.group,
          required: values.required ?? true,
        },
        ...previous,
      ])
      setActiveGroup(values.group)
      setAttributeOpen(false)
      attributeForm.resetFields()
      message.success('属性已添加')
    } catch {
      return
    }
  }

  const submitLabelValue = async () => {
    if (!selectedLabel) {
      return
    }

    try {
      const values = await valueForm.validateFields()
      setLabels(previous =>
        previous.map(item =>
          item.id === selectedLabel.id
            ? { ...item, values: [...item.values, values.value] }
            : item,
        ),
      )
      setSelectedLabel(previous =>
        previous ? { ...previous, values: [...previous.values, values.value] } : previous,
      )
      valueForm.resetFields()
      message.success('标签值已添加')
    } catch {
      return
    }
  }

  const currentMenu = activeTab === 'attributes'
    ? attributeMenu
    : activeTab === 'labels'
      ? labelMenu
      : [{ group: '', items: ['文档中心'] }]

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>系统配置</Title>

          <Tabs
            activeKey={activeTab}
            onChange={key => {
              setActiveTab(key)
              setSearchValue('')
              setActiveGroup(key === 'attributes' ? '训练数据管理' : key === 'labels' ? '自定义镜像' : '文档中心')
            }}
            items={[
              { key: 'attributes', label: '属性配置' },
              { key: 'labels', label: '标签配置' },
              { key: 'agent', label: 'Agent助手' },
            ]}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '246px minmax(0,1fr)', gap: 20 }}>
            <Card style={{ borderRadius: 16 }}>
              {activeTab !== 'agent' && (
                <Text type="secondary" style={{ display: 'block', marginBottom: 14 }}>
                  {activeTab === 'attributes' ? '属性配置' : '标签配置'}
                </Text>
              )}
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                {currentMenu.map(group => (
                  <div key={group.group}>
                    {group.group && (() => {
                      const groupSelectable = activeTab === 'labels' && group.items.length === 0
                      const active = group.group === activeGroup
                      return groupSelectable ? (
                        <div
                          onClick={() => setActiveGroup(group.group)}
                          style={{
                            cursor: 'pointer',
                            padding: '12px 16px',
                            borderRadius: 12,
                            background: active ? 'rgba(59,130,246,0.12)' : '#fff',
                            border: active ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                            color: active ? '#2563eb' : '#334155',
                            fontWeight: active ? 600 : 500,
                          }}
                        >
                          {group.group}
                        </div>
                      ) : (
                        <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>{group.group}</Text>
                      )
                    })()}
                    {group.items.length > 0 && (
                      <Space direction="vertical" size={8} style={{ width: '100%', paddingLeft: activeTab === 'labels' && group.group ? 12 : 0 }}>
                        {group.items.map(item => {
                          const active = item === activeGroup
                          return (
                            <div
                              key={item}
                              onClick={() => setActiveGroup(item)}
                              style={{
                                cursor: 'pointer',
                                padding: '12px 16px',
                                borderRadius: 12,
                                background: active ? 'rgba(59,130,246,0.12)' : '#fff',
                                border: active ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                                color: active ? '#2563eb' : '#334155',
                                fontWeight: active ? 600 : 500,
                              }}
                            >
                              {item}
                            </div>
                          )
                        })}
                      </Space>
                    )}
                  </div>
                ))}
              </Space>
            </Card>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16, gap: 12 }}>
                {activeTab === 'agent' ? (
                  <div />
                ) : (
                  <Input
                    prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                    placeholder={activeTab === 'attributes' ? '请输入属性名称' : '请输入标签名称'}
                    value={searchValue}
                    onChange={e => setSearchValue(e.target.value)}
                    style={{ width: 280 }}
                  />
                )}
                {activeTab === 'attributes' ? (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      attributeForm.resetFields()
                      attributeForm.setFieldsValue({ group: activeGroup, required: true })
                      setAttributeOpen(true)
                    }}
                  >
                    添加属性
                  </Button>
                ) : activeTab === 'labels' ? (
                  <Button
                    type="primary"
                    icon={<TagsOutlined />}
                    onClick={() => {
                      setSelectedLabel(null)
                      labelForm.resetFields()
                      setLabelOpen(true)
                    }}
                  >
                    添加标签
                  </Button>
                ) : null}
              </div>

              {activeTab === 'attributes' ? (
                <Table rowKey="id" columns={attributeColumns} dataSource={filteredAttributes} pagination={false} scroll={{ x: 820 }} />
              ) : activeTab === 'labels' ? (
                <Table rowKey="id" columns={labelColumns} dataSource={filteredLabels} pagination={false} scroll={{ x: 760 }} />
              ) : (
                <DocumentAgentSettings />
              )}
            </div>
          </div>
        </Card>
      </div>

      <Modal
        title="添加属性"
        open={attributeOpen}
        onCancel={() => {
          setAttributeOpen(false)
          attributeForm.resetFields()
        }}
        footer={
          <Space>
            <Button onClick={() => {
              setAttributeOpen(false)
              attributeForm.resetFields()
            }}>取消</Button>
            <Button type="primary" onClick={submitAttribute}>确定</Button>
          </Space>
        }
      >
        <Form form={attributeForm} layout="vertical">
          <Form.Item label="属性名称" name="name" rules={[{ required: true, message: '请输入属性名称' }]}>
            <Input placeholder="请输入属性名称" />
          </Form.Item>
          <Form.Item label="属性描述" name="description">
            <Input.TextArea rows={3} placeholder="请输入属性描述（可选）" />
          </Form.Item>
          <Form.Item label="属性值" name="value" rules={[{ required: true, message: '请输入属性值' }]}>
            <Input placeholder="请输入属性值" />
          </Form.Item>
          <Form.Item label="属性分组" name="group" rules={[{ required: true, message: '请选择属性分组' }]}>
            <Select
              options={attributeMenu.flatMap(group => group.items.map(item => ({ value: item, label: item })))}
            />
          </Form.Item>
          <Form.Item label="是否必填" name="required" rules={[{ required: true, message: '请选择是否必填' }]}>
            <Select
              options={[
                { value: true, label: '是' },
                { value: false, label: '否' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={selectedLabel ? '编辑标签' : '添加标签'}
        open={labelOpen}
        onCancel={() => {
          setLabelOpen(false)
          setSelectedLabel(null)
          labelForm.resetFields()
        }}
        footer={
          <Space>
            <Button onClick={() => {
              setLabelOpen(false)
              setSelectedLabel(null)
              labelForm.resetFields()
            }}>取消</Button>
            <Button type="primary" onClick={submitLabel}>确定</Button>
          </Space>
        }
      >
        <Form form={labelForm} layout="vertical">
          <Form.Item label="标签名称" name="name" rules={[{ required: true, message: '请输入标签名称' }]}>
            <Input placeholder="请输入标签名称" />
          </Form.Item>
          <Form.Item label="标签描述" name="description">
            <Input.TextArea rows={3} placeholder="请输入标签描述（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={selectedLabel ? `${selectedLabel.name} · 标签值` : '标签值'}
        open={valueOpen}
        onCancel={() => {
          setValueOpen(false)
          valueForm.resetFields()
        }}
        width={720}
        footer={
          <Space>
            <Button onClick={() => {
              setValueOpen(false)
              valueForm.resetFields()
            }}>关闭</Button>
          </Space>
        }
      >
        {selectedLabel && (
          <>
            <Card
              size="small"
              style={{ marginBottom: 16, borderRadius: 14, border: '1px solid #e5e7eb', background: '#fbfdff' }}
            >
              <Form form={valueForm} layout="inline">
                <Form.Item
                  name="value"
                  rules={[{ required: true, message: '请输入标签值' }]}
                  style={{ flex: 1, minWidth: 280 }}
                >
                  <Input placeholder="请输入标签值" />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" onClick={submitLabelValue}>添加标签值</Button>
                </Form.Item>
              </Form>
            </Card>

            <Table
              rowKey="value"
              pagination={false}
              columns={[
                { title: '标签值', dataIndex: 'value', key: 'value' },
                {
                  title: '操作',
                  key: 'action',
                  width: 120,
                  render: (_, record: { value: string }) => (
                    <Button
                      type="link"
                      size="small"
                      danger
                      onClick={() => {
                        setLabels(previous =>
                          previous.map(item =>
                            item.id === selectedLabel.id
                              ? { ...item, values: item.values.filter(value => value !== record.value) }
                              : item,
                          ),
                        )
                        setSelectedLabel(previous =>
                          previous
                            ? { ...previous, values: previous.values.filter(value => value !== record.value) }
                            : previous,
                        )
                      }}
                    >
                      删除
                    </Button>
                  ),
                },
              ]}
              dataSource={selectedLabel.values.map(value => ({ value }))}
            />
          </>
        )}
      </Modal>
    </>
  )
}

export default SystemSettings
