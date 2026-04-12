import React, { useState } from 'react'
import {
  Card,
  Table,
  Button,
  Input,
  Space,
  Steps,
  Typography,
  Tooltip,
  message,
} from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
  SearchOutlined,
  DeleteOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate } from 'react-router-dom'
import { mockTasks } from '../../data/mockData'
import type { TrainingTask } from '../../types/training'
import { isVersionInExecution } from './trainingVersionActions'

const { Title, Text } = Typography

const TrainingList: React.FC = () => {
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState('')
  const [data, setData] = useState<TrainingTask[]>(mockTasks)

  // 搜索过滤
  const filteredData = data.filter(item =>
    item.name.toLowerCase().includes(searchText.toLowerCase())
  )

  const taskHasActiveVersion = (t: TrainingTask) =>
    t.versions.some(v => isVersionInExecution(v.status))

  // 表格列定义
  const columns: ColumnsType<TrainingTask> = [
    {
      title: '训练任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 280,
      render: (name: string, record: TrainingTask) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(37, 99, 235, 0.05) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <DatabaseOutlined style={{ color: '#2563eb', fontSize: 18 }} />
          </div>
          <a
            onClick={() => navigate(`/training/detail/${record.id}`)}
            style={{
              color: '#0f172a',
              fontWeight: 600,
              fontSize: 14,
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#2563eb'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#0f172a'}
          >
            {name}
          </a>
        </div>
      ),
    },
    {
      title: '训练类型',
      dataIndex: 'trainingType',
      key: 'trainingType',
      width: 100,
      render: (type: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {type === 'text' ? (
            <span style={{
              fontSize: 12,
              color: '#64748b',
              background: '#f1f5f9',
              padding: '2px 8px',
              borderRadius: 4,
              fontWeight: 500,
            }}>
              文本生成
            </span>
          ) : (
            <span style={{
              fontSize: 12,
              color: '#0891b2',
              background: 'rgba(8, 145, 178, 0.08)',
              padding: '2px 8px',
              borderRadius: 4,
              fontWeight: 500,
            }}>
              图像理解
            </span>
          )}
        </div>
      ),
    },
    {
      title: '版本数量',
      dataIndex: 'versions',
      key: 'versions',
      width: 100,
      align: 'center',
      render: (versions: TrainingTask['versions']) => (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 32,
            height: 28,
            padding: '0 10px',
            background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
            borderRadius: 14,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
          }}
        >
          {versions.length}
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (time: string) => (
        <Text style={{ color: '#64748b', fontSize: 13 }}>{time}</Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      align: 'center',
      render: (_: unknown, record: TrainingTask) => (
        <Space size={4}>
          <Tooltip title="查看详情">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => navigate(`/training/detail/${record.id}`)}
              style={{
                color: '#2563eb',
                background: 'rgba(37, 99, 235, 0.06)',
                borderRadius: 6,
                width: 32,
                height: 32,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </Tooltip>
          <Tooltip title={taskHasActiveVersion(record) ? '存在启动中/排队中/运行中的版本，无法删除任务' : '删除'}>
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              disabled={taskHasActiveVersion(record)}
              onClick={() => handleDelete(record.id)}
              style={{
                color: '#ef4444',
                background: 'rgba(239, 68, 68, 0.06)',
                borderRadius: 6,
                width: 32,
                height: 32,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  // 删除处理
  const handleDelete = (id: string) => {
    setData(prev => prev.filter(item => item.id !== id))
    message.success('删除成功')
  }

  // 刷新处理
  const handleRefresh = () => {
    message.success('刷新成功')
  }

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%' }}>
      {/* 页面标题区域 */}
      <div
        style={{
          marginBottom: 28,
          opacity: 0,
          animation: 'fadeInUp 0.5s ease forwards',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div
            style={{
              width: 40,
              height: 40,
              background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
            }}
          >
            <ThunderboltOutlined style={{ color: '#fff', fontSize: 20 }} />
          </div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
            大模型训练
          </Title>
        </div>
        <Text style={{ color: '#64748b', fontSize: 14, marginLeft: 52 }}>
          项目级别的大模型训练管理，支持完整的训练生命周期跟踪
        </Text>
      </div>

      {/* 步骤卡片 - 流程指引 */}
      <Card
        style={{
          marginBottom: 24,
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          opacity: 0,
          animation: 'fadeInUp 0.5s ease 0.1s forwards',
        }}
        styles={{ body: { padding: '28px 32px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div
            style={{
              width: 6,
              height: 24,
              background: 'linear-gradient(180deg, #2563eb 0%, #3b82f6 100%)',
              borderRadius: 3,
            }}
          />
          <Text style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
            训练流程
          </Text>
        </div>
          <Steps
            current={4}
            style={{ marginTop: 0 }}
            items={[
              {
                title: '数据准备',
                content: '准备训练所需数据集',
                icon: (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      background: 'rgba(37, 99, 235, 0.08)',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <DatabaseOutlined style={{ color: '#2563eb', fontSize: 16 }} />
                  </div>
                ),
              },
              {
                title: '任务创建',
                content: '创建新的模型训练任务',
                icon: (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      background: 'rgba(37, 99, 235, 0.08)',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ExperimentOutlined style={{ color: '#2563eb', fontSize: 16 }} />
                  </div>
                ),
              },
              {
                title: '配置参数',
                content: '设置模型和训练参数',
                icon: (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      background: 'rgba(37, 99, 235, 0.08)',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ThunderboltOutlined style={{ color: '#2563eb', fontSize: 16 }} />
                  </div>
                ),
              },
              {
                title: '分布式训练',
                content: '多GPU集群高效训练',
                icon: (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      background: 'rgba(16, 185, 129, 0.1)',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                >
                  <BarChartOutlined style={{ color: '#10b981', fontSize: 16 }} />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* 统计卡片 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 24,
          opacity: 0,
          animation: 'fadeInUp 0.5s ease 0.15s forwards',
        }}
      >
        {[
          { label: '训练任务', value: filteredData.length, color: '#2563eb', bg: 'rgba(37, 99, 235, 0.08)' },
          { label: '执行中', value: filteredData.filter(t => t.versions.some(v => isVersionInExecution(v.status))).length, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.08)' },
          { label: '已完成', value: filteredData.filter(t => t.versions.every(v => v.status === 'completed')).length, color: '#10b981', bg: 'rgba(16, 185, 129, 0.08)' },
          { label: '失败', value: filteredData.filter(t => t.versions.some(v => v.status === 'failed')).length, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)' },
        ].map((stat, index) => (
          <Card
            key={index}
            style={{
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            }}
            styles={{ body: { padding: '20px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  background: stat.bg,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>
                  {stat.value}
                </span>
              </div>
              <Text style={{ color: '#64748b', fontSize: 13, fontWeight: 500 }}>
                {stat.label}
              </Text>
            </div>
          </Card>
        ))}
      </div>

      {/* 训练记录卡片 */}
      <Card
        style={{
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          opacity: 0,
          animation: 'fadeInUp 0.5s ease 0.2s forwards',
        }}
        styles={{ body: { padding: '24px' } }}
      >
        {/* 卡片头部 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <Text strong style={{ fontSize: 16, color: '#0f172a', fontWeight: 600 }}>
            训练记录
          </Text>
          <Space size={12}>
            <Input.Search
              placeholder="搜索训练任务名称"
              style={{ width: 260 }}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              allowClear
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              style={{
                borderRadius: 8,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/training/create')}
              style={{
                borderRadius: 8,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
              }}
            >
              创建训练任务
            </Button>
          </Space>
        </div>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          pagination={{
            pageSize: 10,
            total: filteredData.length,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: total => (
              <Text style={{ color: '#64748b', fontSize: 13 }}>
                共 <span style={{ color: '#0f172a', fontWeight: 600 }}>{total}</span> 条记录
              </Text>
            ),
          }}
        />
      </Card>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(15px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

export default TrainingList
