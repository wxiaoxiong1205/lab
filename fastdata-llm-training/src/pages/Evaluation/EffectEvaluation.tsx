import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Empty,
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
import { ThunderboltOutlined, PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  canRunTaskLifecycleAction,
  getPrimaryTaskLifecycleAction,
  STARTING_TERMINATE_BLOCKED_MESSAGE,
  TASK_LIFECYCLE_TAG,
  type TaskLifecycleAction,
  type TaskLifecycleStatus,
} from '../../services/taskLifecycle'

const { Text, Title } = Typography

type EvaluationTask = {
  id: string
  name: string
  status: TaskLifecycleStatus
  score: string
  result: string
  answerModel: string
  judgeModel: string
  dataset: string
  params: string
  createdAt: string
}

const mockTasks: EvaluationTask[] = [
  {
    id: 'eval-1',
    name: '客服场景评估-3月',
    status: '运行中',
    score: '82.4',
    result: '处理中',
    answerModel: '文本生成模型',
    judgeModel: 'Qwen2.5-7B-Instruct',
    dataset: '测试数据集/属性回归测试-22-333-444>V1',
    params: 'topK=5',
    createdAt: '2026/03/25 10:00:00',
  },
  {
    id: 'eval-2',
    name: '金融风控效果评估',
    status: '已完成',
    score: '91.7',
    result: '已完成',
    answerModel: '文本生成模型',
    judgeModel: 'Qwen3-8B',
    dataset: '推理结果集_2026_04_02_14_03_41',
    params: 'topK=10',
    createdAt: '2026/03/22 14:30:00',
  },
]

function statusTag(status: EvaluationTask['status']): React.ReactNode {
  const config = TASK_LIFECYCLE_TAG[status]
  return <Tag color={config.color}>{config.label}</Tag>
}

const EffectEvaluation: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [detailRecord, setDetailRecord] = useState<EvaluationTask | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const isCreateRoute = location.pathname === '/effect-evaluation/create'
  const [tasks, setTasks] = useState(mockTasks)

  const filteredTasks = useMemo(
    () => tasks.filter(item => item.name.toLowerCase().includes(searchValue.toLowerCase())),
    [searchValue, tasks],
  )

  const mutateTask = (id: string, updater: (task: EvaluationTask) => EvaluationTask) => {
    setTasks(previous => previous.map(task => (task.id === id ? updater(task) : task)))
  }

  const deleteTask = (id: string) => {
    setTasks(previous => previous.filter(task => task.id !== id))
  }

  const runAction = (record: EvaluationTask, action: TaskLifecycleAction) => {
    if (action === 'start') {
      mutateTask(record.id, task => ({ ...task, status: '启动中', result: '启动中' }))
      return
    }

    if (action === 'terminate') {
      if (record.status === '启动中') {
        Modal.warning({
          title: '当前任务不支持终止',
          content: STARTING_TERMINATE_BLOCKED_MESSAGE,
        })
        return
      }

      if (canRunTaskLifecycleAction(record.status, 'terminate')) {
        mutateTask(record.id, task => ({ ...task, status: '已终止', result: '已终止' }))
      }
      return
    }

    if (action === 'resubmit') {
      mutateTask(record.id, task => ({ ...task, status: '已创建', result: '待评估' }))
      return
    }

    if (action === 'delete') {
      deleteTask(record.id)
    }
  }

  const columns: ColumnsType<EvaluationTask> = [
    { title: '任务名称', dataIndex: 'name', key: 'name' },
    { title: '状态', dataIndex: 'status', key: 'status', render: value => statusTag(value) },
    { title: '指标得分', dataIndex: 'score', key: 'score' },
    { title: '测试结果', dataIndex: 'result', key: 'result' },
    { title: '答案生成模型', dataIndex: 'answerModel', key: 'answerModel' },
    { title: '评估模型', dataIndex: 'judgeModel', key: 'judgeModel' },
    { title: '数据集', dataIndex: 'dataset', key: 'dataset', ellipsis: true },
    { title: '超参', dataIndex: 'params', key: 'params' },
    { title: '创建', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
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
              onClick={() => runAction(record, getPrimaryTaskLifecycleAction(record.status)!)}
            >
              {getPrimaryTaskLifecycleAction(record.status) === 'start' ? '启动' : '重新提交'}
            </Button>
          )}
          <Button
            type="link"
            size="small"
            disabled={!canRunTaskLifecycleAction(record.status, 'edit')}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            disabled={!canRunTaskLifecycleAction(record.status, 'terminate')}
            onClick={() => runAction(record, 'terminate')}
          >
            终止
          </Button>
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>查看详情</Button>
          <Button
            type="link"
            size="small"
            danger
            disabled={!canRunTaskLifecycleAction(record.status, 'delete')}
            onClick={() => runAction(record, 'delete')}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const openCreate = () => {
    form.resetFields()
    navigate('/effect-evaluation/create')
  }

  const closeCreate = () => {
    navigate('/effect-evaluation')
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={closeCreate}>返回</Button>
          <Text type="secondary">评估 / 创建评估任务</Text>
        </div>

        <Card style={{ borderRadius: 18, border: '1px solid #e5e7eb' }}>
          <Form form={form} layout="vertical">
            <Title level={3}>创建评估任务</Title>
            <Divider />

            <Form.Item label="评估任务名称" name="name" rules={[{ required: true, message: '请输入评估任务名称' }]}>
              <Input placeholder="请输入评估任务名称" />
            </Form.Item>

            <Form.Item label="描述" name="description">
              <Input.TextArea rows={2} maxLength={200} showCount />
            </Form.Item>

            <Form.Item label="待评估推理结果集" name="dataset" rules={[{ required: true, message: '请选择推理结果集' }]}>
              <Select placeholder="请选择推理结果集" />
            </Form.Item>

            <Form.Item label="待评估模型/服务" name="models" rules={[{ required: true, message: '请选择模型' }]}>
              <Select mode="multiple" placeholder="请选择模型" />
            </Form.Item>

            <Form.Item label="评估方法" name="method" rules={[{ required: true, message: '请选择评估方法' }]}>
              <Select>
                <Select.Option value="judge">裁判员评估</Select.Option>
                <Select.Option value="basic">基础指标评估</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="裁判模型/服务" name="judgeModel">
              <Select placeholder="请选择裁判模型" />
            </Form.Item>

            <Form.Item label="任务定时配置" name="schedule">
              <Input placeholder="后续补时间选择器" />
            </Form.Item>

            <div style={{ display: 'flex', gap: 12 }}>
              <Button onClick={closeCreate}>取消</Button>
              <Button type="primary" onClick={submitCreate}>创建</Button>
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
          <Title level={2}>评估</Title>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <Space>
              <Input
                placeholder="搜索任务名称"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                style={{ width: 240 }}
              />
              <Button>刷新</Button>
            </Space>

            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              创建评估任务
            </Button>
          </div>

          {filteredTasks.length ? (
            <Table
              rowKey="id"
              columns={columns}
              dataSource={filteredTasks}
              pagination={{ pageSize: 10 }}
            />
          ) : (
            <Empty description="暂无数据" style={{ padding: '48px 0' }} />
          )}
        </Card>
      </div>

      <Modal
        title="评估任务详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
      >
        {detailRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="任务名称" span={2}>{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="状态">{statusTag(detailRecord.status)}</Descriptions.Item>
            <Descriptions.Item label="指标得分">{detailRecord.score}</Descriptions.Item>
            <Descriptions.Item label="测试结果">{detailRecord.result}</Descriptions.Item>
            <Descriptions.Item label="答案生成模型">{detailRecord.answerModel}</Descriptions.Item>
            <Descriptions.Item label="评估模型">{detailRecord.judgeModel}</Descriptions.Item>
            <Descriptions.Item label="数据集" span={2}>{detailRecord.dataset}</Descriptions.Item>
            <Descriptions.Item label="超参">{detailRecord.params}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default EffectEvaluation
