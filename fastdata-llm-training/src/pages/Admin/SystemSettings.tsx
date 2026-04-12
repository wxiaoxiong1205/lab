import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Switch, Button, Typography, Space, Divider, InputNumber, Descriptions } from 'antd'
import { SettingOutlined, PlusOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'
import { mockSystemSettings } from '../../data/mockDataAll'
import type { ColumnsType } from 'antd/es/table'
import type { SystemSetting } from '../../types/shared'

const { Text } = Typography

// 输入方式选项
const inputTypes = [
  { value: 'text', label: '文本输入' },
  { value: 'number', label: '数字输入' },
  { value: 'boolean', label: '开关' },
  { value: 'select', label: '下拉选择' },
]

// 配置分组选项
const groupOptions = [
  { value: 'train_config', label: '训练配置' },
  { value: 'storage_config', label: '存储配置' },
  { value: 'security_config', label: '安全配置' },
  { value: 'session_config', label: '会话配置' },
  { value: 'other', label: '其他' },
]

const SystemSettings: React.FC = () => {
  const [data] = useState<SystemSetting[]>(mockSystemSettings)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<SystemSetting | null>(null)
  const [form] = Form.useForm()

  const columns: ColumnsType<SystemSetting> = [
    { title: '属性名称', dataIndex: 'name', key: 'name' },
    { title: '属性描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '输入方式', dataIndex: 'inputType', key: 'inputType', render: (val: string) => (
      <Text style={{ color: '#4f46e5', padding: '2px 8px', background: 'rgba(79, 70, 229, 0.08)', borderRadius: 4 }}>{val}</Text>
    )},
    { title: '属性值', dataIndex: 'value', key: 'value', render: (val: string) => (
      <Text code style={{ fontSize: 11 }}>{val}</Text>
    )},
    { title: '属性分组', dataIndex: 'group', key: 'group', render: (val: string) => (
      <Text style={{ color: '#7c3aed', padding: '2px 8px', background: 'rgba(124, 58, 237, 0.08)', borderRadius: 4 }}>{val}</Text>
    )},
    { title: '是否必填', dataIndex: 'required', key: 'required', render: (val: boolean) => (
      <Text style={{ color: val ? '#1677ff' : '#999' }}>{val ? '是' : '否'}</Text>
    )},
  ]

  const handleOpenCreate = () => {
    form.resetFields()
    setCreateModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('添加系统配置:', values)
      message.success('添加成功')
      setCreateModalVisible(false)
      form.resetFields()
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()
  }

  const handleOpenDetail = (record: SystemSetting) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  return (
    <>
      <SharedListPage
        title="系统配置"
        titleIcon={<SettingOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="系统属性配置管理，配置平台的各项系统参数"
        searchPlaceholder="请输入属性名称"
        searchField="name"
        columns={columns}
        dataSource={data}
        createButtonText="添加属性"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无系统配置"
        actionButtons={[
          { label: '详情', onClick: handleOpenDetail },
          { label: '删除', danger: true, onClick: () => message.success('删除成功') },
        ]}
      />

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <PlusOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>添加系统配置</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={640}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleSubmit} style={{ background: '#4f46e5' }}>
              确认
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Divider orientation="horizontal" plain style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: 12 }}>
            基本信息
          </Divider>

          <Form.Item
            label="属性名称"
            name="name"
            rules={[
              { required: true, message: '请输入属性名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{1,64}$/, message: '支持中英文、数字、下划线，1-64字符' }
            ]}
          >
            <Input placeholder="请输入属性名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item
            label="属性描述"
            name="description"
            rules={[{ required: true, message: '请输入属性描述' }]}
          >
            <Input.TextArea rows={2} placeholder="请详细描述该配置项的作用" maxLength={200} showCount />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            配置信息
          </Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="输入方式"
              name="inputType"
              rules={[{ required: true, message: '请选择输入方式' }]}
            >
              <Select placeholder="请选择输入方式">
                {inputTypes.map(it => (
                  <Select.Option key={it.value} value={it.value}>{it.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label="属性分组"
              name="group"
              rules={[{ required: true, message: '请选择属性分组' }]}
            >
              <Select placeholder="请选择属性分组">
                {groupOptions.map(g => (
                  <Select.Option key={g.value} value={g.label}>{g.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item
            label="属性值"
            name="value"
            rules={[{ required: true, message: '请输入属性值' }]}
          >
            <Input.TextArea rows={2} placeholder="请输入默认值或示例值" maxLength={500} showCount />
          </Form.Item>

          <Form.Item
            label="是否必填"
            name="required"
            valuePropName="checked"
            initialValue={false}
          >
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>

          <div style={{
            background: '#f8fafc',
            borderRadius: 8,
            padding: '12px 16px',
            border: '1px solid #e2e8f0'
          }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <SettingOutlined style={{ marginRight: 6 }} />
              提示：必填配置项在相关表单中必须填写，非必填配置项可跳过
            </Text>
          </div>
        </Form>
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <SettingOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>系统配置详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={600}
        footer={<Button onClick={handleCloseDetail}>关闭</Button>}
      >
        {selectedRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="属性名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="属性描述" span={2}>{selectedRecord.description}</Descriptions.Item>
            <Descriptions.Item label="输入方式">
              <Text style={{ color: '#4f46e5', padding: '2px 8px', background: 'rgba(79, 70, 229, 0.08)', borderRadius: 4 }}>{selectedRecord.inputType}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="是否必填">
              <Text style={{ color: selectedRecord.required ? '#1677ff' : '#999' }}>{selectedRecord.required ? '是' : '否'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="属性值" span={2}>
              <Text code style={{ fontSize: 11 }}>{selectedRecord.value}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="属性分组" span={2}>
              <Text style={{ color: '#7c3aed', padding: '2px 8px', background: 'rgba(124, 58, 237, 0.08)', borderRadius: 4 }}>{selectedRecord.group}</Text>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default SystemSettings
