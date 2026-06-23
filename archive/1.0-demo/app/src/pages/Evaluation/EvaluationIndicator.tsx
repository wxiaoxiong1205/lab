import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { canAccessResourceData, getCurrentUser, getOperationDeniedMessage } from '../../services/permissionStore'
import { validateFieldsAndScroll } from '../../utils/formValidation'

const { Title, Text } = Typography

type IndicatorTab = 'custom' | 'basic'

type EvaluationIndicatorRecord = {
  id: string
  name: string
  description: string
  scoreRange: string
  creator: string
  createdAt: string
  category: IndicatorTab
}

const seedIndicators: EvaluationIndicatorRecord[] = [
  {
    id: 'indicator-1',
    name: '答案相关性',
    description: '评估实际输出相对于输入问题的相关程度，用于检测回答是否跑题',
    scoreRange: '0-10分',
    creator: 'system',
    createdAt: '2025/12/30 17:53:40',
    category: 'basic',
  },
  {
    id: 'indicator-2',
    name: '忠实度',
    description: '评估实际输出是否与检索上下文在事实上保持一致，用于检测是否存在幻觉',
    scoreRange: '0-10分',
    creator: 'system',
    createdAt: '2025/12/30 17:53:40',
    category: 'basic',
  },
  {
    id: 'indicator-3',
    name: '上下文精确度',
    description: '评估检索结果的排序质量，衡量相关上下文是否排在不相关内容之前',
    scoreRange: '0-10分',
    creator: 'system',
    createdAt: '2025/12/30 17:53:40',
    category: 'basic',
  },
  {
    id: 'indicator-4',
    name: '不连续区间全量指标',
    description: '测试',
    scoreRange: '1-10分',
    creator: 'lab1',
    createdAt: '2026/04/08 18:09:10',
    category: 'custom',
  },
  {
    id: 'indicator-5',
    name: '111111111',
    description: '11111',
    scoreRange: '1-4分',
    creator: 'deepexilab',
    createdAt: '2026/03/03 16:46:58',
    category: 'custom',
  },
  {
    id: 'indicator-6',
    name: '评估指标2801',
    description: '评估指标布局修改测试',
    scoreRange: '1-5分',
    creator: 'lab1',
    createdAt: '2026/02/28 15:53:06',
    category: 'custom',
  },
]

const sectionCardStyle: React.CSSProperties = {
  borderRadius: 18,
  border: '1px solid #e5e7eb',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.04)',
}

const EvaluationIndicatorPage: React.FC = () => {
  const [form] = Form.useForm()
  const [indicators, setIndicators] = useState(seedIndicators)
  const [searchValue, setSearchValue] = useState('')
  const [tab, setTab] = useState<IndicatorTab>('custom')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<EvaluationIndicatorRecord | null>(null)
  const [editingRecord, setEditingRecord] = useState<EvaluationIndicatorRecord | null>(null)

  const filteredData = useMemo(
    () =>
      indicators.filter(
        item => item.category === tab && item.name.toLowerCase().includes(searchValue.toLowerCase()),
      ),
    [indicators, searchValue, tab],
  )
  const warnNoIndicatorDataAccess = (record?: Pick<EvaluationIndicatorRecord, 'creator'> | null) => {
    const permission = canAccessResourceData('llm', record?.creator)
    if (permission.allowed) {
      return true
    }
    message.warning(getOperationDeniedMessage(permission.reason))
    return false
  }

  const columns: ColumnsType<EvaluationIndicatorRecord> = [
    { title: '评估指标', dataIndex: 'name', key: 'name', width: 220 },
    { title: '指标说明', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '指标分值范围',
      dataIndex: 'scoreRange',
      key: 'scoreRange',
      width: 140,
      render: value => <Tag color="blue">{value}</Tag>,
    },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 120 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => {
        const builtIn = record.creator === 'system'
        return (
          <Space size={0}>
            {builtIn ? (
              <Button type="link" size="small" onClick={() => setDetailRecord(record)}>
                查看详情
              </Button>
            ) : (
              <>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    if (!warnNoIndicatorDataAccess(record)) {
                      return
                    }
                    setEditingRecord(record)
                    form.setFieldsValue(record)
                    setCreateOpen(true)
                  }}
                >
                  编辑
                </Button>
                <Button
                  type="link"
                  size="small"
                  danger
                  onClick={() => {
                    if (!warnNoIndicatorDataAccess(record)) {
                      return
                    }
                    setIndicators(previous => previous.filter(item => item.id !== record.id))
                    message.success('删除成功')
                  }}
                >
                  删除
                </Button>
              </>
            )}
          </Space>
        )
      },
    },
  ]

  const openCreate = () => {
    setEditingRecord(null)
    form.resetFields()
    setCreateOpen(true)
  }

  const submit = async () => {
    try {
      const values = await validateFieldsAndScroll<Record<string, any>>(form, message)

      if (!values) {
        return
      }

      if (editingRecord) {
        setIndicators(previous =>
          previous.map(item =>
            item.id === editingRecord.id
              ? { ...item, name: values.name, description: values.description, scoreRange: values.scoreRange }
              : item,
          ),
        )
        message.success('指标已更新')
      } else {
        const currentUser = getCurrentUser()
        setIndicators(previous => [
          {
            id: `indicator-${Date.now()}`,
            name: values.name,
            description: values.description,
            scoreRange: values.scoreRange,
            creator: currentUser.account,
            createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
            category: 'custom',
          },
          ...previous,
        ])
        message.success('指标已创建')
      }
      setCreateOpen(false)
      setEditingRecord(null)
      form.resetFields()
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <Card style={sectionCardStyle}>
          <Title level={2} style={{ marginBottom: 8 }}>评估指标</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            管理模型评估指标，适用于自动化评估、人工评估或模型选型场景。
          </Text>

          <Tabs
            activeKey={tab}
            onChange={key => setTab(key as IndicatorTab)}
            items={[
              { key: 'custom', label: '自定义指标' },
              { key: 'basic', label: '基础指标' },
            ]}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <Space wrap>
              <Input
                placeholder="搜索指标名称"
                value={searchValue}
                onChange={event => setSearchValue(event.target.value)}
                style={{ width: 240 }}
              />
              <Button onClick={() => message.success('搜索完成')}>搜索</Button>
              <Button onClick={() => setSearchValue('')}>重置</Button>
            </Space>

            {tab === 'custom' && (
              <Button type="primary" onClick={openCreate}>
                新建指标
              </Button>
            )}
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredData}
            scroll={{ x: 1200 }}
            tableLayout="fixed"
            pagination={{ pageSize: 20, showTotal: total => `共 ${total} 条数据` }}
          />
        </Card>
      </div>

      <Modal
        title={editingRecord ? '编辑评估指标' : '新建评估指标'}
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false)
          setEditingRecord(null)
        }}
        onOk={submit}
        okText={editingRecord ? '保存' : '创建'}
      >
        <Form form={form} layout="vertical" scrollToFirstError={{ behavior: 'smooth', block: 'center' }}>
          <Form.Item label="评估指标" name="name" rules={[{ required: true, message: '请输入评估指标' }]}>
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item label="指标说明" name="description" rules={[{ required: true, message: '请输入指标说明' }]}>
            <Input.TextArea rows={4} maxLength={200} showCount />
          </Form.Item>
          <Form.Item label="指标分值范围" name="scoreRange" rules={[{ required: true, message: '请输入指标分值范围' }]}>
            <Input placeholder="例如：0-10分" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="指标详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
      >
        {detailRecord && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="评估指标">{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="指标说明">{detailRecord.description}</Descriptions.Item>
            <Descriptions.Item label="指标分值范围">{detailRecord.scoreRange}</Descriptions.Item>
            <Descriptions.Item label="创建人">{detailRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default EvaluationIndicatorPage
