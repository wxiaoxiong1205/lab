import React, { useMemo, useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Descriptions, Tag, Dropdown, Switch, Card, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DatabaseOutlined, PlusOutlined, MoreOutlined, DownloadOutlined, StopOutlined, FileTextOutlined, EyeOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { InferenceResultRecord } from '../../services/dataServiceStore'
import {
  buildInferencePendingDatasetOptions,
  dataServiceApi,
  type PaginatedResult,
  selectInferenceResults,
  useDataServiceSnapshot,
} from '../../services/dataServiceApi'
import {
  canRunTaskLifecycleAction,
  getAllowedTaskLifecycleActions,
  STARTING_TERMINATE_BLOCKED_MESSAGE,
} from '../../services/taskLifecycle'

const { Text } = Typography

const progressMap: Record<string, { color: string; label: string }> = {
  '已完成': { color: 'success', label: '已完成' },
  '启动中': { color: 'processing', label: '启动中' },
  '排队中': { color: 'processing', label: '排队中' },
  '运行中': { color: 'processing', label: '运行中' },
  '失败': { color: 'error', label: '失败' },
  '已创建': { color: 'default', label: '已创建' },
  '定时待启动': { color: 'gold', label: '定时待启动' },
  '已终止': { color: 'warning', label: '已终止' },
}

const dataUsageTags: Record<string, { color: string; text: string }> = {
  '文本生成': { color: 'blue', text: '文本生成' },
  '图像理解': { color: 'cyan', text: '图像理解' },
}

type InferenceDetailRow = {
  key: string
  input: string
  output: string
  score?: string
}

function buildInferenceDetailRows(record: InferenceResultRecord): InferenceDetailRow[] {
  return [
    {
      key: `${record.id}-1`,
      input: `${record.pendingData} - 样本 1`,
      output: `${record.pendingModel} 的推理输出示例 1`,
      score: record.progress,
    },
    {
      key: `${record.id}-2`,
      input: `${record.pendingData} - 样本 2`,
      output: `${record.pendingModel} 的推理输出示例 2`,
      score: record.progress,
    },
  ]
}

const InferenceResult: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { id } = useParams()
  const state = useDataServiceSnapshot()
  const inferenceResults = selectInferenceResults(state)
  const [inferenceMode, setInferenceMode] = useState<string | undefined>(undefined)
  const [dataUsage, setDataUsage] = useState<string | undefined>(undefined)
  const [searchValue, setSearchValue] = useState('')
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<InferenceResultRecord | null>(null)
  const [form] = Form.useForm()
  const scheduleEnabled = Form.useWatch('scheduleEnabled', form)
  const isCreateRoute = location.pathname === '/inference/create'
  const isDetailRoute = location.pathname.startsWith('/inference/') && !isCreateRoute
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [listLoading, setListLoading] = useState(false)
  const [listResult, setListResult] = useState<PaginatedResult<InferenceResultRecord>>({ items: [], total: 0 })
  const detailRecord = useMemo(() => {
    if (!isDetailRoute || !id) {
      return null
    }

    const decoded = decodeURIComponent(id)
    return inferenceResults.find(item => item.name === decoded) ?? null
  }, [id, inferenceResults, isDetailRoute])

  const pendingDatasetOptions = buildInferencePendingDatasetOptions(state)
  const detailColumns: ColumnsType<InferenceDetailRow> = [
    { title: '序号', dataIndex: 'key', key: 'index', width: 84, render: (_value, _row, index) => index + 1 },
    { title: '输入数据', dataIndex: 'input', key: 'input' },
    { title: '推理结果', dataIndex: 'output', key: 'output' },
    { title: '状态', dataIndex: 'score', key: 'score', width: 120 },
  ]

  const handleOpenCreate = () => {
    navigate('/inference/create')
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setCreating(true)
      await dataServiceApi.createInferenceResult({
        name: values.name,
        dataUsage: values.dataUsage,
        pendingData: values.pendingData,
        pendingModel: values.pendingModel,
      })
      message.success('创建成功')
      setCreateModalVisible(false)
      form.resetFields()
      navigate('/inference')
    } catch (error) {
      console.error('表单验证失败:', error)
    } finally {
      setCreating(false)
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()

    if (isCreateRoute) {
      navigate('/inference')
    }
  }

  const handleOpenDetail = (record: any) => {
    navigate(`/inference/${encodeURIComponent(record.name)}`)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)

    if (isDetailRoute) {
      navigate('/inference')
    }
  }

  const handleAction = (key: string, record: any) => {
    if (key === 'start') {
      void dataServiceApi.startInferenceResult(record.id).then(() => {
        message.success(`启动推理: ${record.name}`)
      })
    }
    else if (key === 'resubmit') {
      void dataServiceApi.startInferenceResult(record.id).then(() => {
        message.success(`已重新提交: ${record.name}`)
      })
    }
    else if (key === 'edit') handleOpenDetail(record)
    else if (key === 'detail') handleOpenDetail(record)
    else if (key === 'evaluate') {
      navigate('/effect-evaluation')
      message.success(`已跳转评估入口：${record.name}`)
    }
    else if (key === 'download') {
      message.success(`开始下载：${record.name}`)
    }
    else if (key === 'terminate') {
      if (record.progress === '启动中') {
        message.warning(STARTING_TERMINATE_BLOCKED_MESSAGE)
        return
      }
      void dataServiceApi.terminateInferenceResult(record.id).then(() => {
        message.success(`已终止：${record.name}`)
      })
    }
    else if (key === 'delete') {
      void dataServiceApi.deleteInferenceResult(record.id).then(() => {
        message.success('删除成功')
      })
    }
  }

  const getActionItems = (record: InferenceResultRecord): MenuProps['items'] => {
    const items: MenuProps['items'] = [{ key: 'detail', label: '查看详情' }]

    if (record.progress === '已完成') {
      items.push({ key: 'evaluate', label: '去评估' })
      items.push({ key: 'download', label: '下载' })
    }

    if (canRunTaskLifecycleAction(record.progress, 'terminate')) {
      items.push({ key: 'terminate', label: '终止' })
    }

    if (canRunTaskLifecycleAction(record.progress, 'resubmit')) {
      items.push({ key: 'resubmit', label: '重新提交' })
    }

    return items
  }

  React.useEffect(() => {
    setPage(1)
  }, [dataUsage, inferenceMode, searchValue])

  React.useEffect(() => {
    if (isCreateRoute) {
      form.resetFields()
      setCreateModalVisible(true)
      return
    }

    setCreateModalVisible(false)
  }, [form, isCreateRoute])

  React.useEffect(() => {
    if (!isDetailRoute) {
      setDetailModalVisible(false)
      setSelectedRecord(null)
      return
    }

    if (!detailRecord) {
      return
    }

    setSelectedRecord(detailRecord)
    setDetailModalVisible(true)
  }, [detailRecord, isDetailRoute])

  React.useEffect(() => {
    let active = true
    setListLoading(true)

    void dataServiceApi
      .listInferenceResults({
        search: searchValue,
        dataUsage,
        inferenceMode,
        page,
        pageSize,
      })
      .then(result => {
        if (!active) {
          return
        }
        setListResult(result)
      })
      .finally(() => {
        if (active) {
          setListLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [dataUsage, inferenceMode, inferenceResults, page, pageSize, searchValue])

  const createFormContent = (
    <Form form={form} layout="vertical" initialValues={{ inferenceMode: '离线推理', dataUsage: '文本生成' }}>
      <Divider plain style={{ margin: '0 0 16px', color: '#64748b', fontSize: 12 }}>基本信息</Divider>

      <Form.Item label="数据集名称" name="name" rules={[{ required: true, message: '请输入数据集名称' }]}>
        <Input placeholder="请输入数据集名称" maxLength={50} showCount />
      </Form.Item>

      <Form.Item label="描述" name="description">
        <Input.TextArea rows={2} placeholder="请输入描述（0 / 300）" maxLength={300} showCount />
      </Form.Item>

      <Divider plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>推理配置</Divider>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        <Form.Item label="推理方式" name="inferenceMode" rules={[{ required: true, message: '请选择推理方式' }]}>
          <Select placeholder="请选择推理方式">
            <Select.Option value="离线推理">离线推理</Select.Option>
            <Select.Option value="在线推理">在线推理</Select.Option>
            <Select.Option value="导入推理结果集">导入推理结果集</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item label="数据用途" name="dataUsage" rules={[{ required: true, message: '请选择数据用途' }]}>
          <Select placeholder="请选择数据用途">
            <Select.Option value="文本生成">文本生成</Select.Option>
            <Select.Option value="图像理解">图像理解</Select.Option>
          </Select>
        </Form.Item>
      </div>

      <Form.Item label="任务定时配置">
        <Space size={12}>
          <Form.Item name="scheduleEnabled" valuePropName="checked" noStyle>
            <Switch checkedChildren="开" unCheckedChildren="关" />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>按生产环境保留定时任务入口</Text>
        </Space>
      </Form.Item>

      <Form.Item label="待推理模型" name="pendingModel" rules={[{ required: true, message: '请选择待推理模型' }]}>
        <Select placeholder="请选择待推理模型" showSearch>
          <Select.Option value="qwen3-nl-plus">qwen3-nl-plus</Select.Option>
          <Select.Option value="qwen2-vl-2b-instruct">Qwen2-VL-2B-Instruct</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item label="待推理数据" name="pendingData" rules={[{ required: true, message: '请选择待推理数据' }]}>
        <Select placeholder="选择" showSearch options={pendingDatasetOptions} />
      </Form.Item>

      <Divider plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>资源配置</Divider>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        <Form.Item label="显卡类型及型号" name="gpuType">
          <Select placeholder="请选择显卡类型及型号" />
        </Form.Item>
        <Form.Item label="显卡数量" name="gpuCount">
          <Select placeholder="1张" defaultValue="1张">
            <Select.Option value="1张">1张</Select.Option>
            <Select.Option value="2张">2张</Select.Option>
          </Select>
        </Form.Item>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        <Form.Item label="CPU 请求" name="cpuRequest">
          <Input suffix="Core" placeholder="请输入CPU请求数" />
        </Form.Item>
        <Form.Item label="CPU 限制" name="cpuLimit">
          <Input suffix="Core" placeholder="请输入CPU限制数" />
        </Form.Item>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        <Form.Item label="内存请求" name="memRequest">
          <Input suffix="GB" placeholder="请输入内存请求" />
        </Form.Item>
        <Form.Item label="内存限制" name="memLimit">
          <Input suffix="GB" placeholder="请输入内存限制" />
        </Form.Item>
      </div>
    </Form>
  )

  const detailContent = selectedRecord && (
    <>
      <Card
        title={<Space><FileTextOutlined style={{ color: '#3b82f6' }} /><span style={{ color: '#3b82f6' }}>基本信息</span></Space>}
        style={{ borderRadius: 18, marginBottom: 18 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 24, columnGap: 24 }}>
          <div><Text type="secondary">数据集名称：</Text><Text strong>{selectedRecord.name}</Text></div>
          <div><Text type="secondary">推理进度：</Text><Tag color={(progressMap[selectedRecord.progress] || { color: 'default' }).color}>{selectedRecord.progress}</Tag></div>
          <div><Text type="secondary">数据用途：</Text><Tag color={(dataUsageTags[selectedRecord.dataUsage] || { color: 'default' }).color}>{selectedRecord.dataUsage}</Tag></div>
          <div><Text type="secondary">数据量：</Text><Text strong>{selectedRecord.dataVolume} 条</Text></div>
          <div><Text type="secondary">待推理数据：</Text><Text strong>{selectedRecord.pendingData}</Text></div>
          <div><Text type="secondary">待推理模型/服务：</Text><Text strong>{selectedRecord.pendingModel}</Text></div>
          <div><Text type="secondary">创建时间：</Text><Text strong>{selectedRecord.createdAt}</Text></div>
        </div>
      </Card>

      <Card
        title={<Space><DatabaseOutlined style={{ color: '#3b82f6' }} /><span style={{ color: '#3b82f6' }}>推理明细</span></Space>}
        style={{ borderRadius: 18 }}
      >
        <Table rowKey="key" columns={detailColumns} dataSource={buildInferenceDetailRows(selectedRecord)} pagination={false} />
      </Card>
    </>
  )

  if (isCreateRoute) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ marginBottom: 20 }}>
          <Text type="secondary">推理结果集 / 新建</Text>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <div>
              <Text strong style={{ fontSize: 24, color: '#0f172a' }}>创建推理数据集</Text>
              <div><Text type="secondary">对齐生产环境独立创建路径与资源配置结构。</Text></div>
            </div>
            <Space>
              <Button onClick={handleCancel}>取消</Button>
              <Button type="primary" loading={creating} onClick={handleSubmit}>确定</Button>
            </Space>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
          {createFormContent}
        </div>
      </div>
    )
  }

  if (isDetailRoute && selectedRecord) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <Text type="secondary" style={{ fontSize: 14 }}>
            推理结果集 / {selectedRecord.name}
          </Text>
            <Space size={16}>
            <Button icon={<EyeOutlined />} disabled={selectedRecord.progress !== '已完成'} onClick={() => navigate('/effect-evaluation')}>去评估</Button>
            <Dropdown menu={{ items: [{ key: 'download-json', label: '下载 JSON' }, { key: 'download-xlsx', label: '下载 XLSX' }], onClick: () => message.success(`开始下载：${selectedRecord.name}`) }}>
              <Button icon={<DownloadOutlined />}>下载</Button>
            </Dropdown>
            <Button
              icon={<StopOutlined />}
              disabled={!canRunTaskLifecycleAction(selectedRecord.progress, 'terminate')}
              onClick={async () => {
                if (selectedRecord.progress === '启动中') {
                  message.warning(STARTING_TERMINATE_BLOCKED_MESSAGE)
                  return
                }
                await dataServiceApi.terminateInferenceResult(selectedRecord.id)
                message.success(`已终止：${selectedRecord.name}`)
              }}
            >
              终止
            </Button>
            <Button danger icon={<MoreOutlined />} onClick={async () => {
              await dataServiceApi.deleteInferenceResult(selectedRecord.id)
              handleCloseDetail()
              message.success(`已删除：${selectedRecord.name}`)
            }}>
              删除
            </Button>
          </Space>
        </div>

        {detailContent}
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        {/* 页面标题 */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 40, height: 40,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            }}>
              <DatabaseOutlined style={{ color: '#fff', fontSize: 18 }} />
            </div>
            <Text strong style={{ fontSize: 18, color: '#0f172a' }}>推理结果集</Text>
          </div>
          <Text type="secondary" style={{ fontSize: 13, marginLeft: 52 }}>
            管理推理数据集, 适用于模型选型、效果评估或模型复用场景。
          </Text>
        </div>

        {/* 工具栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Select
              placeholder="推理方式"
              allowClear
              style={{ width: 150 }}
              value={inferenceMode}
              onChange={val => setInferenceMode(val)}
              options={[
                { value: '离线推理', label: '离线推理' },
                { value: '在线推理', label: '在线推理' },
              ]}
            />
            <Select
              placeholder="数据用途"
              allowClear
              style={{ width: 150 }}
              value={dataUsage}
              onChange={val => setDataUsage(val)}
              options={[
                { value: '文本生成', label: '文本生成' },
                { value: '图像理解', label: '图像理解' },
              ]}
            />
            <Input
              prefix={<span style={{ color: '#94a3b8' }}>🔍</span>}
              placeholder="搜索"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              allowClear
              style={{ borderRadius: 8, width: 200 }}
            />
            <Button onClick={() => { setSearchValue(''); setInferenceMode(undefined); setDataUsage(undefined) }}>重置</Button>
          </div>
          <Space>
            <Button icon={<span>🔄</span>} onClick={() => message.success('刷新成功')}>刷新</Button>
            <Button type="primary" icon={<span>➕</span>} onClick={handleOpenCreate}>创建数据集</Button>
          </Space>
        </div>

        {/* 表格 */}
        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['数据集名称', '推理进度', '数据用途', '待推理数据', '待推理模型/服务', '数据量', '创建时间', '操作'].map((col, i) => (
                  <th key={i} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(listLoading ? [] : listResult.items).map(record => {
                const p = progressMap[record.progress] || { color: 'default', label: record.progress }
                const d = dataUsageTags[record.dataUsage] || { color: 'default', text: record.dataUsage }
                return (
                  <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#0f172a', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.name}>{record.name}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <Tag color={p.color}>{p.label}</Tag>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Tag color={d.color}>{d.text}</Tag>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.pendingData}>{record.pendingData}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.pendingModel}>{record.pendingModel}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#0f172a' }}>{record.dataVolume}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{record.createdAt}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <Space size={0}>
                        <Button
                          type="link"
                          size="small"
                          disabled={!canRunTaskLifecycleAction(record.progress, 'start') && !canRunTaskLifecycleAction(record.progress, 'resubmit')}
                          onClick={() => handleAction(canRunTaskLifecycleAction(record.progress, 'start') ? 'start' : 'resubmit', record)}
                        >
                          {canRunTaskLifecycleAction(record.progress, 'start') ? '启动' : canRunTaskLifecycleAction(record.progress, 'resubmit') ? '重新提交' : '启动'}
                        </Button>
                        <Button type="link" size="small" disabled={!canRunTaskLifecycleAction(record.progress, 'edit')} onClick={() => handleAction('edit', record)}>编辑</Button>
                        <Button type="link" size="small" danger disabled={!canRunTaskLifecycleAction(record.progress, 'delete')} onClick={() => handleAction('delete', record)}>删除</Button>
                        <Dropdown menu={{ items: getActionItems(record), onClick: ({ key }) => handleAction(key, record) }} trigger={['click']}>
                          <Button type="text" size="small" icon={<MoreOutlined />} />
                        </Dropdown>
                      </Space>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>共 {listResult.total} 条数据</Text>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Space>
            <Text type="secondary">第 {page} 页</Text>
            <Button disabled={page <= 1} onClick={() => setPage(previous => previous - 1)}>上一页</Button>
            <Button disabled={page * pageSize >= listResult.total} onClick={() => setPage(previous => previous + 1)}>下一页</Button>
          </Space>
        </div>
      </div>

      {/* 创建弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PlusOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>创建推理数据集</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={720}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" loading={creating} onClick={handleSubmit}>确定</Button>
          </Space>
        }
        destroyOnClose
      >
        {createFormContent}
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DatabaseOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>推理数据集详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={640}
        footer={<Button onClick={handleCloseDetail}>关闭</Button>}
      >
        {detailContent}
      </Modal>
    </>
  )
}

export default InferenceResult
