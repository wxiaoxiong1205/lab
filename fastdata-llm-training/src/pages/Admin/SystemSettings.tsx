import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Input,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { mockSystemSettings } from '../../data/mockDataAll'
import type { SystemSetting } from '../../types/shared'

const { Title, Text } = Typography

const settingGroups = [
  '业务测试数据集',
  '训练数据管理',
  '测试数据管理',
  '模型服务',
  '在线推理服务',
  'API服务',
]

const SystemSettings: React.FC = () => {
  const [searchValue, setSearchValue] = useState('')
  const [activeTab, setActiveTab] = useState('attributes')
  const [activeGroup, setActiveGroup] = useState('业务测试数据集')

  const filteredData = useMemo(
    () =>
      mockSystemSettings.filter(item =>
        item.name.toLowerCase().includes(searchValue.toLowerCase()),
      ),
    [searchValue],
  )

  const columns: ColumnsType<SystemSetting> = [
    { title: '属性名称', dataIndex: 'name', key: 'name' },
    { title: '属性描述', dataIndex: 'description', key: 'description', render: value => value || '-' },
    { title: '输入方式', dataIndex: 'inputType', key: 'inputType', render: value => <Tag color="default">{value}</Tag> },
    { title: '属性值', dataIndex: 'value', key: 'value' },
    { title: '属性分组', dataIndex: 'group', key: 'group' },
    { title: '是否必填', dataIndex: 'required', key: 'required', render: value => (value ? '是' : '否') },
  ]

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%' }}>
      <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
        <Title level={2}>系统配置</Title>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'attributes', label: '属性配置' },
            { key: 'labels', label: '标签配置' },
          ]}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '246px minmax(0,1fr)', gap: 20 }}>
          <Card style={{ borderRadius: 16 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 14 }}>数据管理</Text>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {settingGroups.map(group => {
                const active = group === activeGroup
                return (
                  <div
                    key={group}
                    onClick={() => setActiveGroup(group)}
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
                    {group}
                  </div>
                )
              })}
            </Space>
          </Card>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
              <Input
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                placeholder="请输入属性名称"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                style={{ width: 280 }}
              />
              <Button type="primary" icon={<PlusOutlined />}>添加属性</Button>
            </div>

            <Table
              rowKey="id"
              columns={columns}
              dataSource={filteredData}
              pagination={false}
            />
          </div>
        </div>
      </Card>
    </div>
  )
}

export default SystemSettings
