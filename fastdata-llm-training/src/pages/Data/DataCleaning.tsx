import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Switch,
  Divider,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FilterOutlined, ReloadOutlined, PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  buildCleaningDatasetOptions,
  dataServiceApi,
  type PaginatedResult,
  selectCleaningTasks,
  useDataServiceSnapshot,
} from '../../services/dataServiceApi'

const { Text, Title } = Typography

type CleaningTask = {
  id: string
  name: string
  status: '已完成' | '启动中' | '已终止'
  preDataset: string
  postDataset: string
  operatorValues?: string[]
  creator: string
  createdAt: string
}

type CleaningOperator = {
  value: string
  label: string
  description: string
}

type CleaningCategory = {
  title: string
  operators: CleaningOperator[]
}

const stepCards = [
  {
    title: '选择数据集',
    description: '从平台数据管理中选择需要清洗的数据集。',
  },
  {
    title: '清洗能力选择',
    description: '根据数据特性及目标，选择合适的数据清洗算子。',
  },
  {
    title: '清洗流程配置',
    description: '在选择的清洗算子基础上，配置清洗流程。',
  },
  {
    title: '清洗结果查看',
    description: '清洗完成后，点击详情即可查看清洗结果。',
  },
]

const categories: CleaningCategory[] = [
  {
    title: '数据格式清洗',
    operators: [
      { value: 'blank', label: '空白字符清洗', description: '移除多余的空行、行首/行尾空格、制表符，并将多种换行符统一为\\n' },
      { value: 'garbled', label: '乱码清洗', description: '清洗多种乱码，包括编码异常、键盘乱打、低质量重复文本等' },
      { value: 'html', label: 'HTML标签清洗', description: '移除HTML标签，保留纯文本内容' },
      { value: 'newline', label: '多余换行符清洗', description: '将连续多个换行符合并为单个换行符' },
    ],
  },
  {
    title: 'LLM生成数据清洗',
    operators: [
      { value: 'length', label: '长度异常文本过滤器', description: '移除长度小于指定阈值或大于指定阈值（按token数计算）的内容' },
      { value: 'duplicate-content', label: '重复生成内容移除器', description: '检测并移除LLM重复生成的内容片段' },
      { value: 'truncated', label: '截断句移除器', description: '移除不完整的截断句子，保证文本完整性' },
      { value: 'language', label: '语种过滤器', description: '基于语言识别过滤非目标语种的内容' },
    ],
  },
  {
    title: '数据去重',
    operators: [
      { value: 'exact', label: '精确匹配去重器', description: '基于内容哈希进行精确匹配，删除完全相同的数据项' },
      { value: 'minhash', label: 'MinHash去重器', description: '利用MinHash和LSH找出Jaccard相似度高的文本对' },
      { value: 'simhash', label: 'SimHash去重器', description: '计算SimHash指纹，并根据汉明距离阈值移除重复项' },
    ],
  },
  {
    title: '敏感数据清洗',
    operators: [
      { value: 'contact', label: '联系方式脱敏', description: '识别并处理手机号、Email地址和座机号' },
      { value: 'identity', label: '身份与证件脱敏', description: '识别并处理身份证号、护照号等' },
      { value: 'network', label: '网络与地址脱敏', description: '识别并处理IP地址、URL链接、MAC地址及物理地址' },
      { value: 'finance', label: '金融与车辆脱敏', description: '识别并处理银行卡号、信用卡号、车牌号等' },
      { value: 'social', label: '社交账号脱敏', description: '识别并处理微信号、QQ号、微博账号等社交平台账号' },
      { value: 'keywords', label: '自定义关键词脱敏', description: '根据用户提供的关键词列表进行脱敏处理' },
    ],
  },
]

function statusTag(status: CleaningTask['status']) {
  if (status === '已完成') return <Tag color="success">已完成</Tag>
  if (status === '启动中') return <Tag color="processing">启动中</Tag>
  return <Tag color="default">已终止</Tag>
}

const DataCleaning: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const state = useDataServiceSnapshot()
  const cleaningTasks = selectCleaningTasks(state)
  const [form] = Form.useForm()
  const [selectedOperators, setSelectedOperators] = useState<string[]>([])
  const [detailTask, setDetailTask] = useState<CleaningTask | null>(null)
  const isCreateRoute = location.pathname === '/data-cleaning/create'
  const scheduleEnabled = Form.useWatch('scheduleEnabled', form)
  const datasetOptions = useMemo(() => buildCleaningDatasetOptions(state), [state])
  const selectedDatasetValue = Form.useWatch('dataset', form)
  const [creating, setCreating] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [listLoading, setListLoading] = useState(false)
  const [listResult, setListResult] = useState<PaginatedResult<CleaningTask>>({ items: [], total: 0 })
  const selectedDatasetLabel = useMemo(() => {
    const value = selectedDatasetValue
    return datasetOptions.find(item => item.value === value)?.label ?? '-'
  }, [selectedDatasetValue])

  const filteredItems = useMemo(
    () =>
      listResult.items.filter(item => {
        const matchSearch = !searchValue || item.name.toLowerCase().includes(searchValue.toLowerCase())
        return matchSearch
      }),
    [listResult.items, searchValue],
  )

  const listColumns: ColumnsType<CleaningTask> = [
    { title: '任务名称', dataIndex: 'name', key: 'name' },
    { title: '清洗状态', dataIndex: 'status', key: 'status', width: 100, render: value => statusTag(value) },
    { title: '清洗前数据集', dataIndex: 'preDataset', key: 'preDataset', ellipsis: true },
    { title: '清洗后数据集', dataIndex: 'postDataset', key: 'postDataset', ellipsis: true },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 120 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 176 },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            disabled={record.status !== '已终止'}
            onClick={async () => {
              await dataServiceApi.startCleaningTask(record.id)
            }}
          >
            启动
          </Button>
          <Button type="link" size="small" onClick={() => setDetailTask(record)}>查看详情</Button>
          <Button type="link" size="small" disabled={record.status !== '已终止'}>编辑</Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={async () => {
              await dataServiceApi.deleteCleaningTask(record.id)
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const handleOpenCreate = () => {
    form.resetFields()
    form.setFieldsValue({ sourceType: '已有数据集', outputMode: '新增版本' })
    setSelectedOperators([])
    navigate('/data-cleaning/create')
  }

  const handleCancelCreate = () => {
    navigate('/data-cleaning')
  }

  const handleCreate = async () => {
    try {
      await form.validateFields()
    } catch {
      return
    }

    setCreating(true)
    try {
      await dataServiceApi.createCleaningTask({
        name: form.getFieldValue('name'),
        preDataset: selectedDatasetLabel,
        postDataset: form.getFieldValue('outputName'),
        operatorValues: selectedOperators,
      })
    } finally {
      setCreating(false)
    }
    navigate('/data-cleaning')
  }

  React.useEffect(() => {
    setPage(1)
  }, [searchValue, statusFilter])

  React.useEffect(() => {
    let active = true
    setListLoading(true)

    void dataServiceApi
      .listCleaningTasks({
        status: statusFilter,
        page,
        pageSize,
      })
      .then(result => {
        if (!active) {
          return
        }
        setListResult(result as PaginatedResult<CleaningTask>)
      })
      .finally(() => {
        if (active) {
          setListLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [cleaningTasks, page, pageSize, statusFilter])

  if (isCreateRoute) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={handleCancelCreate}>返回</Button>
          <div>
            <Title level={2} style={{ marginBottom: 6 }}>创建清洗任务</Title>
            <Text type="secondary">配置您的数据清洗流程，提升数据质量与一致性</Text>
          </div>
        </div>

        <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0' }}>
          <Form form={form} layout="vertical" initialValues={{ sourceType: '已有数据集', outputMode: '新增版本', scheduleEnabled: false }}>
            <Divider style={{ marginTop: 0 }}>基本信息</Divider>

            <Form.Item label="任务名称" name="name" rules={[{ required: true, message: '请输入任务名称' }]}>
              <Input placeholder="请输入任务名称" />
            </Form.Item>

            <Form.Item label="数据来源" name="sourceType">
              <Select disabled>
                <Select.Option value="已有数据集">已有数据集</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="选择数据集" name="dataset" rules={[{ required: true, message: '请选择数据集' }]}>
              <Select
                placeholder="选择"
                options={datasetOptions.map(item => ({ value: item.value, label: item.label }))}
              />
            </Form.Item>

            <Form.Item label="清洗字段">
              <Input value="暂无可用字段" disabled />
            </Form.Item>

            <Form.Item label="处理后数据集" name="outputMode">
              <Select disabled>
                <Select.Option value="新增版本">新增版本</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="清洗后数据集名称" name="outputName" rules={[{ required: true, message: '请输入清洗后数据集名称' }]}>
              <Input placeholder="清洗后数据集名称：" />
            </Form.Item>

            <Form.Item label="数据集名称">
              <Input value={selectedDatasetLabel} disabled />
            </Form.Item>

            <Form.Item label="任务定时配置">
              <Space size={12}>
                <Form.Item name="scheduleEnabled" valuePropName="checked" noStyle>
                  <Switch checkedChildren="开" unCheckedChildren="关" />
                </Form.Item>
                {scheduleEnabled && <Text type="secondary">当前版本先保留入口，调度细节后续接入</Text>}
              </Space>
            </Form.Item>

            <Divider>清洗能力</Divider>

            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: 12 }}>
                {categories.map(category => (
                  <Card key={category.title} size="small" style={{ borderRadius: 14 }}>
                    <div style={{ marginBottom: 10 }}>
                      <Text strong>{category.title}</Text>
                      <div><Text type="secondary">({category.operators.length} 个算子)</Text></div>
                    </div>

                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      {category.operators.map(operator => {
                        const active = selectedOperators.includes(operator.value)
                        return (
                          <div
                            key={operator.value}
                            onClick={() =>
                              setSelectedOperators(previous =>
                                previous.includes(operator.value)
                                  ? previous.filter(item => item !== operator.value)
                                  : [...previous, operator.value],
                              )
                            }
                            style={{
                              padding: '12px 14px',
                              borderRadius: 12,
                              border: active ? '1px solid #4f46e5' : '1px solid #e2e8f0',
                              background: active ? 'rgba(79,70,229,0.06)' : '#fff',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>{operator.label}</div>
                            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
                              {operator.description}
                            </Text>
                          </div>
                        )
                      })}
                    </Space>
                  </Card>
                ))}
              </div>

              <Card
                title="数据清洗流程配置"
                extra={
                  <Space>
                    <Button
                      size="small"
                      onClick={() => {
                        message.success(selectedOperators.length ? '模板已保存' : '请先选择清洗算子')
                      }}
                    >
                      保存为模板
                    </Button>
                    <Button size="small" onClick={() => setSelectedOperators([])}>清空算子</Button>
                  </Space>
                }
                style={{ borderRadius: 14, minHeight: 680 }}
              >
                <div style={{ marginBottom: 16 }}>
                  <Text strong>清洗模板</Text>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <Text type="secondary">已选择算子：{selectedOperators.length} 个</Text>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <Card size="small" style={{ borderRadius: 12, background: '#f8fafc' }}>
                    <Text type="secondary">清洗后数据集</Text>
                    <div style={{ marginTop: 6, fontWeight: 600 }}>{form.getFieldValue('outputName') || '待填写'}</div>
                  </Card>
                  <Card size="small" style={{ borderRadius: 12, background: '#f8fafc' }}>
                    <Text type="secondary">流程结果预期</Text>
                    <div style={{ marginTop: 6, fontWeight: 600 }}>{selectedOperators.length ? '将生成清洗结果集' : '待配置流程'}</div>
                  </Card>
                </div>
                {selectedOperators.length ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {selectedOperators.map((operatorValue, index) => {
                      const operator = categories.flatMap(item => item.operators).find(item => item.value === operatorValue)
                      if (!operator) {
                        return null
                      }
                      return (
                        <Card
                          key={operator.value}
                          size="small"
                          style={{ borderRadius: 12 }}
                          extra={
                            <Space size={4}>
                              <Button
                                type="link"
                                size="small"
                                disabled={index === 0}
                                onClick={() =>
                                  setSelectedOperators(previous => {
                                    const next = [...previous]
                                    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                                    return next
                                  })
                                }
                              >
                                上移
                              </Button>
                              <Button
                                type="link"
                                size="small"
                                disabled={index === selectedOperators.length - 1}
                                onClick={() =>
                                  setSelectedOperators(previous => {
                                    const next = [...previous]
                                    ;[next[index + 1], next[index]] = [next[index], next[index + 1]]
                                    return next
                                  })
                                }
                              >
                                下移
                              </Button>
                              <Button
                                type="link"
                                size="small"
                                danger
                                onClick={() =>
                                  setSelectedOperators(previous => previous.filter(item => item !== operator.value))
                                }
                              >
                                移除
                              </Button>
                            </Space>
                          }
                        >
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>{`${index + 1}. ${operator.label}`}</div>
                          <Text type="secondary">{operator.description}</Text>
                        </Card>
                      )
                    })}
                  </div>
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="请在左侧选择清洗算子，或直接拖拽算子到此区域"
                  />
                )}

                {!!selectedOperators.length && (
                  <Card
                    size="small"
                    title="流程摘要"
                    style={{ borderRadius: 12, marginTop: 16 }}
                  >
                    <Text type="secondary" style={{ lineHeight: 1.8 }}>
                      当前流程将按照 {selectedOperators.length} 个算子的顺序执行，并将结果输出到
                      {` ${form.getFieldValue('outputName') || '待填写的结果数据集'}。`}
                    </Text>
                  </Card>
                )}
              </Card>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
              <Button onClick={handleCancelCreate}>取消</Button>
              <Button type="primary" loading={creating} onClick={handleCreate}>创建清洗任务</Button>
            </div>
          </Form>
        </Card>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ marginBottom: 8 }}>数据清洗</Title>
        <Text type="secondary">
          数据清洗功能，通过对数据进行异常清洗、文本过滤、文本去重和去除隐私信息，大幅提升数据质量，优化模型训练效果。
        </Text>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
        {stepCards.map(card => (
          <Card key={card.title} style={{ borderRadius: 16, border: '1px solid #e2e8f0', minHeight: 156 }}>
            <FilterOutlined style={{ fontSize: 24, color: '#0f172a', marginBottom: 20 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>{card.title}</div>
            <Text type="secondary" style={{ lineHeight: 1.7 }}>{card.description}</Text>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <Space>
          <Input
            placeholder="请输入任务名称"
            value={searchValue}
            onChange={event => setSearchValue(event.target.value)}
            style={{ width: 210 }}
          />
          <Select
            placeholder="清洗状态"
            allowClear
            value={statusFilter}
            onChange={value => setStatusFilter(value)}
            style={{ width: 160 }}
            options={[
              { value: '已完成', label: '已完成' },
              { value: '启动中', label: '启动中' },
              { value: '已终止', label: '已终止' },
            ]}
          />
          <Button onClick={() => setPage(1)}>搜索</Button>
          <Button onClick={() => {
            setSearchValue('')
            setStatusFilter(undefined)
          }}>重置</Button>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            创建清洗任务
          </Button>
        </Space>
      </div>

      <Card style={{ borderRadius: 16, border: '1px solid #e2e8f0' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          columns={listColumns}
          dataSource={filteredItems}
          loading={listLoading}
          tableLayout="fixed"
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            pageSize,
            total: filteredItems.length,
            showTotal: total => `共 ${total} 条记录`,
            onChange: nextPage => setPage(nextPage),
          }}
          locale={{ emptyText: '暂无清洗任务' }}
        />
      </Card>

      <Modal
        title="清洗任务详情"
        open={Boolean(detailTask)}
        onCancel={() => setDetailTask(null)}
        footer={<Button onClick={() => setDetailTask(null)}>关闭</Button>}
      >
        {detailTask && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Card size="small">
                <Text type="secondary">清洗状态</Text>
                <div style={{ marginTop: 8 }}>{statusTag(detailTask.status)}</div>
              </Card>
              <Card size="small">
                <Text type="secondary">清洗算子数量</Text>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 600 }}>{detailTask.operatorValues?.length ?? 0}</div>
              </Card>
              <Card size="small">
                <Text type="secondary">输出结果</Text>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 600 }}>{detailTask.postDataset === '-' ? '待生成' : '已生成'}</div>
              </Card>
            </div>

            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="任务名称">{detailTask.name}</Descriptions.Item>
              <Descriptions.Item label="清洗前数据集">{detailTask.preDataset}</Descriptions.Item>
              <Descriptions.Item label="清洗后数据集">{detailTask.postDataset}</Descriptions.Item>
              <Descriptions.Item label="清洗算子">
                {(detailTask.operatorValues ?? []).length
                  ? (detailTask.operatorValues ?? [])
                      .map((value: string) => categories.flatMap(item => item.operators).find(operator => operator.value === value)?.label ?? value)
                      .join('，')
                  : '暂无'}
              </Descriptions.Item>
              <Descriptions.Item label="创建人">{detailTask.creator}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{detailTask.createdAt}</Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default DataCleaning
