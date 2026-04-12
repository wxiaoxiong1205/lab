import React, { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Tooltip,
  Modal,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  PlusOutlined,
  PlayCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  StopOutlined,
  RedoOutlined,
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import { mockTasks } from '../../data/mockData'
import {
  TRAINING_METHOD_LABELS,
  TRAINING_RUN_STATUS_TAG,
  type TrainingVersion,
  type RunStatus,
  type FineTuneType,
} from '../../types/training'
import {
  getVersionActionFlags,
  TERMINATE_BLOCKED_MESSAGE,
} from './trainingVersionActions'

const { Title, Text } = Typography

// ── 状态样式 ────────────────────────────────────────────────────────────────

const FINE_TUNE_TYPE_LABELS: Record<FineTuneType, string> = {
  full: '全参微调',
  lora: 'LoRA 微调',
}

const TrainingDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const task = mockTasks.find(t => t.id === id)

  const [versions, setVersions] = useState<TrainingVersion[]>(() => task?.versions ?? [])

  useEffect(() => {
    const t = mockTasks.find(x => x.id === id)
    setVersions(t?.versions ?? [])
  }, [id])

  const goVersionDetail = (v: TrainingVersion) => {
    navigate(`/training/detail/${id}/version/${v.id}`)
  }

  const handleStartVersion = (record: TrainingVersion) => {
    setVersions(prev =>
      prev.map(v => (v.id === record.id ? { ...v, status: 'starting' as RunStatus } : v)),
    )
    message.success('已提交启动')
  }

  const handleTerminateVersion = (record: TrainingVersion) => {
    Modal.confirm({
      title: '确认终止该版本训练？',
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        setVersions(prev =>
          prev.map(v => (v.id === record.id ? { ...v, status: 'terminated' as RunStatus } : v)),
        )
        message.success('已提交终止')
      },
    })
  }

  const handleDeleteVersion = (record: TrainingVersion) => {
    Modal.confirm({
      title: '确认删除该版本？',
      okType: 'danger',
      okText: '删除',
      onOk: () => {
        setVersions(prev => prev.filter(v => v.id !== record.id))
        message.success('删除成功')
      },
    })
  }

  const handleEditVersion = (record: TrainingVersion) => {
    navigate(`/training/create?taskId=${id}&editVersion=${record.id}`)
  }

  const handleResubmitVersion = (record: TrainingVersion) => {
    navigate(`/training/create?taskId=${id}&resubmitFrom=${record.id}`)
  }

  if (!task) {
    return (
      <div style={{ padding: '28px 32px' }}>
        <Card style={{ textAlign: 'center', padding: '60px 0', borderRadius: 16 }}>
          <ThunderboltOutlined style={{ fontSize: 48, color: '#cbd5e1', marginBottom: 16 }} />
          <Title level={4} style={{ color: '#64748b' }}>任务不存在</Title>
          <Button type="primary" onClick={() => navigate('/training')} style={{ marginTop: 16, borderRadius: 8 }}>
            返回列表
          </Button>
        </Card>
      </div>
    )
  }

  const columns = [
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
      render: (version: string, record: TrainingVersion) => (
        <button
          type="button"
          onClick={() => goVersionDetail(record)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 40,
            height: 28,
            padding: '0 12px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {version}
        </button>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          <Text style={{ color: '#475569', fontSize: 13 }}>{text}</Text>
        </Tooltip>
      ),
    },
    {
      title: '运行状态',
      dataIndex: 'status',
      key: 'status',
      width: 132,
      render: (status: RunStatus) => {
        const cfg = TRAINING_RUN_STATUS_TAG[status]
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag
              style={{
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                color: cfg.color,
                borderRadius: 6,
                fontWeight: 500,
                padding: '2px 10px',
              }}
            >
              {cfg.label}
            </Tag>
          </div>
        )
      },
    },
    {
      title: '运行时长',
      dataIndex: 'runtime',
      key: 'runtime',
      width: 100,
      render: (time: string) => (
        <Text style={{ color: '#64748b', fontSize: 13, fontFamily: 'monospace' }}>{time}</Text>
      ),
    },
    {
      title: '训练方法',
      dataIndex: 'trainingMethod',
      key: 'trainingMethod',
      width: 140,
      render: (method: TrainingVersion['trainingMethod']) => (
        <Text style={{ color: '#475569', fontSize: 13 }}>{TRAINING_METHOD_LABELS[method] ?? method}</Text>
      ),
    },
    {
      title: '微调类型',
      dataIndex: 'fineTuneType',
      key: 'fineTuneType',
      width: 110,
      render: (ft: FineTuneType | undefined) => (
        <Text style={{ color: '#64748b', fontSize: 13 }}>
          {ft ? FINE_TUNE_TYPE_LABELS[ft] : '—'}
        </Text>
      ),
    },
    {
      title: '创建人',
      dataIndex: 'creator',
      key: 'creator',
      width: 100,
      render: (name: string) => (
        <Text style={{ color: '#64748b', fontSize: 13 }}>{name}</Text>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (time: string) => (
        <Text style={{ color: '#94a3b8', fontSize: 12 }}>{time}</Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_: unknown, record: TrainingVersion) => {
        const f = getVersionActionFlags(record.status)
        return (
          <Space size={4} wrap>
            {f.canStart && (
              <Tooltip title="启动">
                <Button
                  type="text"
                  icon={<PlayCircleOutlined />}
                  onClick={() => handleStartVersion(record)}
                  style={{
                    color: '#10b981',
                    background: 'rgba(16, 185, 129, 0.06)',
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
            )}
            {f.canTerminate && (
              <Tooltip title="终止">
                <Button
                  type="text"
                  icon={<StopOutlined />}
                  onClick={() => handleTerminateVersion(record)}
                  style={{
                    color: '#f97316',
                    background: 'rgba(249, 115, 22, 0.08)',
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
            )}
            {f.showTerminateBlocked && (
              <Tooltip title="终止（启动中不可用）">
                <Button
                  type="text"
                  icon={<StopOutlined />}
                  onClick={() => message.warning(TERMINATE_BLOCKED_MESSAGE)}
                  style={{
                    color: '#94a3b8',
                    background: 'rgba(148, 163, 184, 0.12)',
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
            )}
            {f.canResubmit && (
              <Tooltip title="重新提交">
                <Button
                  type="text"
                  icon={<RedoOutlined />}
                  onClick={() => handleResubmitVersion(record)}
                  style={{
                    color: '#7c3aed',
                    background: 'rgba(124, 58, 237, 0.08)',
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
            )}
            <Tooltip title="查看详情">
              <Button
                type="text"
                icon={<EyeOutlined />}
                onClick={() => goVersionDetail(record)}
                style={{
                  color: '#64748b',
                  background: 'rgba(100, 116, 139, 0.08)',
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
            {f.canEdit && (
              <Tooltip title="编辑">
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => handleEditVersion(record)}
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
            )}
            {f.canDelete && (
              <Tooltip title="删除">
                <Button
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeleteVersion(record)}
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
            )}
          </Space>
        )
      },
    },
  ]

  const handleAddVersion = () => {
    navigate(`/training/create?taskId=${id}`)
  }

  const handleBack = () => {
    navigate('/training')
  }

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%' }}>
      {/* 返回按钮和标题 */}
      <div
        style={{
          marginBottom: 24,
          opacity: 0,
          animation: 'fadeInUp 0.5s ease forwards',
        }}
      >
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          style={{
            borderRadius: 8,
            marginBottom: 16,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          返回
        </Button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            }}
          >
            <ThunderboltOutlined style={{ color: '#fff', fontSize: 20 }} />
          </div>
          <div>
            <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
              训练任务详情
            </Title>
            <Text style={{ color: '#64748b', fontSize: 13 }}>{task.name}</Text>
          </div>
        </div>
      </div>

      {/* 任务信息卡片 */}
      <Card
        style={{
          marginBottom: 24,
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          opacity: 0,
          animation: 'fadeInUp 0.5s ease 0.1s forwards',
        }}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{ width: 4, height: 18, background: 'linear-gradient(180deg, #2563eb 0%, #3b82f6 100%)', borderRadius: 2 }} />
          <Text strong style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>任务信息</Text>
        </div>
        <Card type="inner" style={{ border: 'none', borderRadius: 0 }} styles={{ body: { padding: '16px 24px' } }}>
          <Space size={48} wrap>
            <div>
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>任务名称</Text>
              <Text strong style={{ color: '#0f172a', fontSize: 14 }}>{task.name}</Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>训练类型</Text>
              <span style={{
                fontSize: 12,
                color: task.trainingType === 'text' ? '#64748b' : '#0891b2',
                background: task.trainingType === 'text' ? '#f1f5f9' : 'rgba(8, 145, 178, 0.08)',
                padding: '4px 10px',
                borderRadius: 4,
                fontWeight: 500,
              }}>
                {task.trainingType === 'text' ? '文本生成' : '图像理解'}
              </span>
            </div>
          </Space>
        </Card>
      </Card>

      {/* 版本列表 */}
      <Card
        style={{
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          opacity: 0,
          animation: 'fadeInUp 0.5s ease 0.15s forwards',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Text strong style={{ fontSize: 16, color: '#0f172a', fontWeight: 600 }}>任务版本</Text>
            <Tag
              style={{
                background: '#f1f5f9',
                border: 'none',
                color: '#64748b',
                borderRadius: 12,
                fontSize: 12,
                padding: '2px 10px',
                fontWeight: 500,
              }}
            >
              共 {versions.length} 个版本
            </Tag>
          </div>
          <Space size={12}>
            <Button
              icon={<ReloadOutlined />}
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
              onClick={handleAddVersion}
              style={{
                borderRadius: 8,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontWeight: 600,
              }}
            >
              新增版本
            </Button>
          </Space>
        </div>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={versions}
          rowKey="id"
          pagination={false}
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

export default TrainingDetail
