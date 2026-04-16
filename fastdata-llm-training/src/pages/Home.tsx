import React, { useState } from 'react'
import { Card, Typography, Row, Col, Progress, Tag, Modal, Descriptions, Button, Space } from 'antd'
import {
  RocketOutlined,
  CloudServerOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
  ArrowRightOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { getCurrentProject, usePermissionStore } from '../services/permissionStore'

const { Title, Text } = Typography

type TaskType = 'training' | 'evaluation' | 'inference' | 'annotation' | 'cleaning'

interface Task {
  id: string
  name: string
  type: TaskType
  status: 'running' | 'completed' | 'pending'
  progress: number
  extra?: string
  createdAt: string
}

const typeConfig: Record<TaskType, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
  training: { color: '#2563eb', bg: 'rgba(37,99,235,0.08)', label: '训练', icon: <CloudServerOutlined /> },
  evaluation: { color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', label: '评估', icon: <BarChartOutlined /> },
  inference: { color: '#059669', bg: 'rgba(5,150,105,0.08)', label: '推理', icon: <ThunderboltOutlined /> },
  annotation: { color: '#d97706', bg: 'rgba(217,119,6,0.08)', label: '标注', icon: <ExperimentOutlined /> },
  cleaning: { color: '#0891b2', bg: 'rgba(8,145,178,0.08)', label: '清洗', icon: <DatabaseOutlined /> },
}

const statusConfig: Record<string, { tagColor: string; tagLabel: string }> = {
  running: { tagColor: 'processing', tagLabel: '运行中' },
  completed: { tagColor: 'success', tagLabel: '已完成' },
  pending: { tagColor: 'default', tagLabel: '待执行' },
}

const quickEntries = [
  {
    title: '大模型训练',
    description: '基于分布式 GPU 集群的大语言模型训练',
    icon: <CloudServerOutlined />,
    color: '#2563eb',
    bgGradient: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%)',
    path: '/training',
  },
  {
    title: '数据管理',
    description: '训练数据和测试数据统一管理',
    icon: <DatabaseOutlined />,
    color: '#059669',
    bgGradient: 'linear-gradient(135deg, rgba(5, 150, 105, 0.1) 0%, rgba(52, 211, 153, 0.05) 100%)',
    path: '/datasets',
  },
  {
    title: '效果评估',
    description: '对模型进行效果评估',
    icon: <ExperimentOutlined />,
    color: '#7c3aed',
    bgGradient: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(167, 139, 250, 0.05) 100%)',
    path: '/effect-evaluation',
  },
]

const stats = [
  { title: '训练任务', value: 12, suffix: '个', color: '#2563eb' },
  { title: '评估任务', value: 5, suffix: '个', color: '#7c3aed' },
  { title: '已完成', value: 8, suffix: '个', color: '#10b981' },
  { title: 'GPU使用', value: 76, suffix: '%', color: '#8b5cf6' },
]

const tasks: Task[] = [
  { id: '1', name: '文本生成多轮-模型训练', type: 'training', status: 'running', progress: 75, createdAt: '2026/03/25 10:00:00' },
  { id: '2', name: '图像理解-模型训练', type: 'training', status: 'completed', progress: 100, createdAt: '2026/03/20 14:00:00' },
  { id: '3', name: '客服场景评估-3月', type: 'evaluation', status: 'running', progress: 65, createdAt: '2026/03/25 10:00:00' },
  { id: '4', name: '金融风控效果评估', type: 'evaluation', status: 'completed', progress: 100, createdAt: '2026/03/22 14:30:00' },
  { id: '5', name: '推理结果集_2026_03_25_09_35_45', type: 'inference', status: 'completed', progress: 100, createdAt: '2026/03/25 09:35:00' },
  { id: '6', name: '离线_模型管理_lora-文本生成', type: 'inference', status: 'running', progress: 45, createdAt: '2026/03/23 14:20:00' },
  { id: '7', name: '多轮对话标注-批次A', type: 'annotation', status: 'running', progress: 85, createdAt: '2026/03/23 10:00:00' },
  { id: '8', name: '训练集去重清洗', type: 'cleaning', status: 'completed', progress: 100, createdAt: '2026/03/22 10:00:00' },
]

const typePaths: Record<TaskType, string> = {
  training: '/training',
  evaluation: '/effect-evaluation',
  inference: '/inference',
  annotation: '/data-annotation',
  cleaning: '/data-cleaning',
}

const Home: React.FC = () => {
  const navigate = useNavigate()
  const permissionState = usePermissionStore()
  const currentProject = getCurrentProject(permissionState)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const navigateToTask = (task: Task) => {
    navigate(typePaths[task.type])
  }

  const handleOpenDetail = (task: Task, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedTask(task)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedTask(null)
  }

  const handleGoToPage = () => {
    if (selectedTask) {
      handleCloseDetail()
      navigate(typePaths[selectedTask.type])
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                  borderRadius: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 10px 24px rgba(37, 99, 235, 0.28)',
                }}
              >
                <FolderOpenOutlined style={{ color: '#fff', fontSize: 24 }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <Title level={2} style={{ margin: 0, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.8px' }}>
                    {currentProject?.name ?? '项目概览'}
                  </Title>
                  <Tag color="blue" style={{ margin: 0 }}>
                    已进入项目
                  </Tag>
                </div>
                <Text style={{ color: '#64748b', fontSize: 14, display: 'block', marginBottom: 6 }}>
                  {currentProject?.description || '当前项目暂无描述，以下为该项目空间中的快捷入口与最新任务。'}
                </Text>
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                  创建时间：{currentProject?.createdAt ?? '-'}
                </Text>
              </div>
            </div>

            <Button onClick={() => navigate('/workspace')}>返回项目空间</Button>
          </div>
        </div>

        <Card
          style={{
            marginBottom: 24,
            borderRadius: 16,
            border: '1px solid #dbeafe',
            background: 'linear-gradient(90deg, rgba(37,99,235,0.07) 0%, rgba(14,165,233,0.05) 100%)',
          }}
          styles={{ body: { padding: '18px 22px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: 700 }}>项目空间已建立当前项目上下文</Text>
              <Text style={{ color: '#64748b', fontSize: 13, display: 'block', marginTop: 6 }}>
                后续进入数据服务、模型训练、模型评估、模型服务等页面时，都会基于当前项目权限进行访问控制。
              </Text>
            </div>
            <div
              style={{
                width: 44,
                height: 44,
                background: 'rgba(255,255,255,0.8)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <RocketOutlined style={{ color: '#2563eb', fontSize: 20 }} />
            </div>
          </div>
        </Card>

        {/* 统计卡片 */}
        <Row gutter={[20, 20]} style={{ marginBottom: 28 }}>
          {stats.map((stat, index) => (
            <Col span={6} key={index}>
              <Card
                style={{
                  borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                  opacity: 0,
                  animation: `fadeInUp 0.5s ease ${0.1 + index * 0.05}s forwards`,
                }}
                styles={{ body: { padding: '24px' } }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <Text style={{ color: '#64748b', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}>
                      {stat.title}
                    </Text>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 32, fontWeight: 700, color: stat.color, lineHeight: 1 }}>
                        {stat.value}
                      </span>
                      <span style={{ fontSize: 14, color: '#94a3b8' }}>{stat.suffix}</span>
                    </div>
                  </div>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      background: `${stat.color}15`,
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ThunderboltOutlined style={{ color: stat.color, fontSize: 20 }} />
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        {/* 快捷入口 */}
        <Card
          style={{
            marginBottom: 28,
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            opacity: 0,
            animation: 'fadeInUp 0.5s ease 0.25s forwards',
          }}
          styles={{ body: { padding: '28px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ width: 6, height: 24, background: 'linear-gradient(180deg, #2563eb 0%, #3b82f6 100%)', borderRadius: 3 }} />
            <Title level={4} style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
              快捷入口
            </Title>
          </div>

          <Row gutter={[20, 20]}>
            {quickEntries.map((entry, index) => (
              <Col span={8} key={index}>
                <Card
                  hoverable
                  onClick={() => navigate(entry.path)}
                  style={{
                    borderRadius: 16,
                    border: '1px solid #e2e8f0',
                    background: entry.bgGradient,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                  styles={{ body: { padding: '28px 24px', position: 'relative', zIndex: 1 } }}
                  className="quick-entry-card"
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      background: 'rgba(255, 255, 255, 0.9)',
                      backdropFilter: 'blur(10px)',
                      borderRadius: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 16,
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                    }}
                  >
                    <span style={{ fontSize: 24, color: entry.color }}>{entry.icon}</span>
                  </div>
                  <Title level={5} style={{ margin: '0 0 8px', fontWeight: 700, color: '#0f172a' }}>
                    {entry.title}
                  </Title>
                  <Text style={{ color: '#64748b', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                    {entry.description}
                  </Text>
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 20,
                      right: 20,
                      width: 32,
                      height: 32,
                      background: 'rgba(255, 255, 255, 0.8)',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0,
                      transform: 'translateX(-8px)',
                      transition: 'all 0.3s ease',
                    }}
                    className="arrow-icon"
                  >
                    <ArrowRightOutlined style={{ color: entry.color, fontSize: 14 }} />
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>

        {/* 最新任务进度 */}
        <Card
          style={{
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            opacity: 0,
            animation: 'fadeInUp 0.5s ease 0.3s forwards',
          }}
          styles={{ body: { padding: '28px' } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ width: 6, height: 24, background: 'linear-gradient(180deg, #8b5cf6 0%, #a78bfa 100%)', borderRadius: 3 }} />
            <Title level={4} style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
              最新任务
            </Title>
          </div>

          <Row gutter={[20, 20]}>
            {tasks.map((task) => {
              const cfg = typeConfig[task.type]
              const s = statusConfig[task.status]
              return (
                <Col span={12} key={task.id}>
                  <Card
                    onClick={() => navigateToTask(task)}
                    style={{
                      background: cfg.bg,
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    styles={{ body: { padding: '20px' } }}
                    className="task-card"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ color: cfg.color, fontSize: 16 }}>{cfg.icon}</div>
                        <Text strong style={{ color: '#0f172a', fontSize: 14 }}>{task.name}</Text>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Tag color={s.tagColor} style={{ margin: 0 }}>{s.tagLabel}</Tag>
                        <Tag style={{ margin: 0, background: `${cfg.color}15`, border: `1px solid ${cfg.color}30`, color: cfg.color }}>
                          {cfg.label}
                        </Tag>
                      </div>
                    </div>
                    <Progress
                      percent={task.progress}
                      strokeColor={cfg.color}
                      railColor="#e2e8f0"
                      size="small"
                      format={(p) => <span style={{ color: cfg.color, fontSize: 12 }}>{p}%</span>}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                      <Text style={{ color: '#94a3b8', fontSize: 12 }}>{task.createdAt}</Text>
                      <Text
                        style={{ color: cfg.color, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                        onClick={(e) => handleOpenDetail(task, e)}
                      >
                        查看详情 →
                      </Text>
                    </div>
                  </Card>
                </Col>
              )
            })}
          </Row>
        </Card>

        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .quick-entry-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
          }
          .quick-entry-card:hover .arrow-icon {
            opacity: 1 !important;
            transform: translateX(0) !important;
          }
          .task-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
            border-color: #cbd5e1;
          }
        `}</style>
      </div>

      {/* 任务详情 Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: `linear-gradient(135deg, ${typeConfig[selectedTask?.type ?? 'training'].color} 0%, ${typeConfig[selectedTask?.type ?? 'training'].color}aa 100%)`,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {selectedTask && typeConfig[selectedTask.type].icon}
            </div>
            <span style={{ fontWeight: 600 }}>任务详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={560}
        footer={
          <Space>
            <Button onClick={handleCloseDetail}>关闭</Button>
            <Button type="primary" style={{ background: '#4f46e5' }} onClick={handleGoToPage}>
              进入详情
            </Button>
          </Space>
        }
      >
        {selectedTask && (
          <>
            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="任务名称" span={2}>{selectedTask.name}</Descriptions.Item>
              <Descriptions.Item label="任务类型">
                <Tag style={{ background: `${typeConfig[selectedTask.type].color}15`, border: `1px solid ${typeConfig[selectedTask.type].color}30`, color: typeConfig[selectedTask.type].color }}>
                  {typeConfig[selectedTask.type].label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusConfig[selectedTask.status].tagColor}>
                  {statusConfig[selectedTask.status].tagLabel}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>{selectedTask.createdAt}</Descriptions.Item>
            </Descriptions>

            <div style={{
              background: `${typeConfig[selectedTask.type].color}10`,
              borderRadius: 12,
              padding: '16px 20px',
              border: `1px solid ${typeConfig[selectedTask.type].color}25`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>执行进度</Text>
                <Text strong style={{ color: typeConfig[selectedTask.type].color, fontSize: 14 }}>
                  {selectedTask.progress}%
                </Text>
              </div>
              <Progress
                percent={selectedTask.progress}
                strokeColor={typeConfig[selectedTask.type].color}
                railColor={`${typeConfig[selectedTask.type].color}25`}
                showInfo={false}
              />
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

export default Home
