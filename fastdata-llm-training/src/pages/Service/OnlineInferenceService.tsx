import React, { useState } from 'react'
import { message, Tag } from 'antd'
import {
  ThunderboltOutlined,
  PlusOutlined,
  DeleteOutlined,
  DisconnectOutlined,
} from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'

const mockData = [
  { id: '1', name: '实时推理-7B', modelName: 'Qwen2.5-7B-Instruct', modelSource: '基础模型', instanceCount: 2, status: 'running', creator: 'admin', createdAt: '2026/03/19 11:00:00' },
  { id: '2', name: '实时推理-1.5B', modelName: 'Qwen2.5-1.5B-Instruct', modelSource: '基础模型', instanceCount: 1, status: 'running', creator: 'lab1', createdAt: '2026/03/17 08:30:00' },
  { id: '3', name: '批量推理服务', modelName: 'Qwen3-8B', modelSource: '模型管理', instanceCount: 0, status: 'stopped', creator: 'lab2', createdAt: '2026/03/15 16:00:00' },
]

const statusMap: Record<string, { color: string; label: string }> = {
  running: { color: 'green', label: '运行中' },
  stopped: { color: 'default', label: '已停止' },
  error: { color: 'red', label: '异常' },
}

const OnlineInferenceService: React.FC = () => {
  const [data] = useState(mockData)

  return (
    <SharedListPage
      title="在线推理服务"
      titleIcon={<ThunderboltOutlined style={{ color: '#fff', fontSize: 18 }} />}
      subtitle="提供在线推理能力，支持实时调用模型进行推理"
      searchField="name"
      showSearch={false}
      columns={[
        { title: '服务名称', dataIndex: 'name', key: 'name' },
        { title: '模型名称', dataIndex: 'modelName', key: 'modelName' },
        { title: '模型来源', dataIndex: 'modelSource', key: 'modelSource' },
        { title: '实例数', dataIndex: 'instanceCount', key: 'instanceCount' },
        { title: '状态', dataIndex: 'status', key: 'status', render: (val: string) => {
          const s = statusMap[val] || { color: 'default', label: val }
          return <Tag color={s.color}>{s.label}</Tag>
        }},
        { title: '创建人', dataIndex: 'creator', key: 'creator' },
        { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
      ]}
      dataSource={data}
      showCreateButton={false}
      onRefresh={() => message.success('刷新成功')}
      emptyText="暂无推理服务"
      actionButtons={[
        {
          label: '启动',
          onClick: (record: typeof mockData[0]) => message.success(`启动服务: ${record.name}`),
          disabled: (record: typeof mockData[0]) => record.status === 'running',
        },
        {
          label: '停止',
          onClick: (record: typeof mockData[0]) => message.info(`停止服务: ${record.name}`),
          disabled: (record: typeof mockData[0]) => record.status !== 'running',
        },
      ]}
    />
  )
}

export default OnlineInferenceService
