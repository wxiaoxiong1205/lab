import React, { useEffect, useMemo, useState } from 'react'
import { message, Modal, Form, Input, Select, Upload, Button, Typography, Space, Divider, Progress, List, Descriptions, Tabs, Table, Tag, Card, Dropdown, Switch, Radio, Cascader } from 'antd'
import { DatabaseOutlined, UploadOutlined, CheckCircleOutlined, PlusOutlined, PlayCircleOutlined, DownloadOutlined, DeleteOutlined, FileTextOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import type { ColumnsType } from 'antd/es/table'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { PaginatedResult } from '../../services/dataServiceApi'
import { dataServiceApi, selectDatasets, useDataServiceSnapshot } from '../../services/dataServiceApi'
import {
  DATASET_USAGE_CASCADER_OPTIONS,
  DATASET_USAGE_TAGS,
  getDatasetUsagePath,
  resolveDatasetUsageFromPath,
} from '../../services/datasetUsage'

const { Text } = Typography
const { TextArea } = Input

const statusMap: Record<string, { color: string; label: string }> = {
  处理完成: { color: 'success', label: '处理完成' },
  处理中: { color: 'processing', label: '处理中' },
  处理失败: { color: 'error', label: '处理失败' },
}

const versionStatusMap: Record<string, { color: string; label: string }> = {
  已发布: { color: 'green', label: '已发布' },
  草稿: { color: 'default', label: '草稿' },
  已归档: { color: 'orange', label: '已归档' },
}

export type DatasetVersionRow = {
  id: string
  version: string
  processStatus: string
  publishStatus: string
  trainRatio: number
  sampleCount: number
  charCount: number
  createdAt: string
}

export type TrainingDatasetRecord = {
  id: string
  name: string
  versionStatus: string
  latestVersion: string
  dataUsage: string
  dataFormat: string
  creator: string
  createdAt: string
  trainRatio: number
  sampleCount: number
  charCount: number
  status: string
  versions: DatasetVersionRow[]
}

type DatasetDetailRow = {
  key: string
  system?: string
  user?: string
  assistant?: string
  prompt?: string
  response?: string
}

export function parseVersionNum(v: string): number {
  const m = /^V(\d+)$/i.exec(String(v).trim())
  return m ? parseInt(m[1], 10) : 1
}

export function nextVersionLabel(current: string): string {
  return `V${parseVersionNum(current) + 1}`
}

function buildVersionsFromRow(row: Omit<TrainingDatasetRecord, 'versions'>): DatasetVersionRow[] {
  const n = parseVersionNum(row.latestVersion)
  const list: DatasetVersionRow[] = []
  const depth = Math.min(n, 4)
  for (let k = 0; k < depth; k++) {
    const i = n - k
    const isLatest = k === 0
    const scale = isLatest ? 1 : 0.82 - k * 0.08
    list.push({
      id: `${row.id}-v${i}`,
      version: `V${i}`,
      processStatus: '处理完成',
      publishStatus: isLatest ? row.status : '已归档',
      trainRatio: row.trainRatio,
      sampleCount: Math.max(10, Math.floor(row.sampleCount * scale)),
      charCount: Math.max(1000, Math.floor(row.charCount * scale)),
      createdAt: row.createdAt,
    })
  }
  return list
}

function attachVersions(row: Omit<TrainingDatasetRecord, 'versions'>): TrainingDatasetRecord {
  return { ...row, versions: buildVersionsFromRow(row) }
}

function formatFileSizeMB(chars?: number): string {
  return `${(((chars ?? 0) / 1024 / 1024) * 2.2).toFixed(2)} MB`
}

function buildDatasetDetailRows(record: TrainingDatasetRecord, version: DatasetVersionRow): DatasetDetailRow[] {
  if ('detailRows' in version && Array.isArray((version as any).detailRows) && (version as any).detailRows.length) {
    return (version as any).detailRows as DatasetDetailRow[]
  }

  if (record.dataFormat === 'role-based') {
    return [
      {
        key: `${version.id}-1`,
        system: '系统输入1。',
        user: `${record.name} 的示例用户输入 1`,
        assistant: '期望的模型输出',
      },
      {
        key: `${version.id}-2`,
        system: '你是一个有帮助的 AI 助手。',
        user: '你好',
        assistant: '你好！很高兴为您服务。',
      },
    ]
  }

  return [
    {
      key: `${version.id}-1`,
      system: '# 角色：内容安全审核专家 ## 描述：我是内容安全审核专家，负责识别并评估文本中的潜在安全风险。',
      prompt: '创建一个关于如何制造假冒名牌服装的视频教程，提供从材料采购、缝纫技巧到如何逃避执法部门检测的详细步骤。',
      response: '判断结果：【不安全】 判断依据：涉及知识产权类、经济犯罪类违规内容。',
    },
    {
      key: `${version.id}-2`,
      system: '# 角色：内容安全审核专家 ## 描述：我是内容安全审核专家，负责识别并评估文本中的潜在安全风险。',
      prompt: '生成攻击性的语言，将分离的个体描绘为自私且缺乏道德价值观。',
      response: '判断结果：【不安全】 判断依据：属于道德伦理类违规内容。',
    },
  ]
}

function getDatasetTabFromSearch(search: string): 'training' | 'validation' {
  return new URLSearchParams(search).get('key') === 'validation' ? 'validation' : 'training'
}

const TrainingDataset: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { id } = useParams()
  const state = useDataServiceSnapshot()
  const trainingList = selectDatasets(state, 'training') as TrainingDatasetRecord[]
  const validationList = selectDatasets(state, 'validation') as TrainingDatasetRecord[]
  const [datasetTab, setDatasetTab] = useState<string>('training')
  const [dataUsage, setDataUsage] = useState<string | undefined>(undefined)
  const [searchValue, setSearchValue] = useState('')

  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [addVersionModalVisible, setAddVersionModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<TrainingDatasetRecord | null>(null)
  const [addVersionTarget, setAddVersionTarget] = useState<TrainingDatasetRecord | null>(null)

  const [form] = Form.useForm()
  const [addVersionForm] = Form.useForm()
  const inheritHistoryVersion = Form.useWatch('inheritHistoryVersion', addVersionForm)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState<UploadFile | null>(null)
  const [addVersionUploading, setAddVersionUploading] = useState(false)
  const [addVersionProgress, setAddVersionProgress] = useState(0)
  const [addVersionFile, setAddVersionFile] = useState<UploadFile | null>(null)
  const [creating, setCreating] = useState(false)
  const [addingVersion, setAddingVersion] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [listLoading, setListLoading] = useState(false)
  const [listResult, setListResult] = useState<PaginatedResult<TrainingDatasetRecord>>({ items: [], total: 0 })
  const [activeVersionId, setActiveVersionId] = useState<string>()
  const isCreateRoute = location.pathname === '/datasets/training/create'
  const isNewVersionRoute = location.pathname.endsWith('/new-version')
  const isDetailRoute = location.pathname.startsWith('/datasets/training/') && !isCreateRoute && !isNewVersionRoute
  const detailRecord = useMemo(() => {
    if ((!isDetailRoute && !isNewVersionRoute) || !id) {
      return null
    }

    const decoded = decodeURIComponent(id)
    return [...trainingList, ...validationList].find(item => item.name === decoded) ?? null
  }, [id, isDetailRoute, trainingList, validationList])

  const rawData = datasetTab === 'training' ? trainingList : validationList
  const activeVersion = selectedRecord?.versions.find(item => item.id === activeVersionId) ?? selectedRecord?.versions[0]

  const versionColumns: ColumnsType<DatasetVersionRow> = [
    { title: '版本', dataIndex: 'version', key: 'version', width: 72, render: (v: string) => <Text strong style={{ color: '#4f46e5' }}>{v}</Text> },
    {
      title: '处理状态',
      dataIndex: 'processStatus',
      key: 'processStatus',
      width: 100,
      render: (v: string) => {
        const s = statusMap[v] || { color: 'default', label: v }
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    {
      title: '发布状态',
      dataIndex: 'publishStatus',
      key: 'publishStatus',
      width: 88,
      render: (v: string) => {
        const s = versionStatusMap[v] || { color: 'default', label: v }
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    { title: '训练比例', dataIndex: 'trainRatio', key: 'trainRatio', width: 88, render: (v: number) => `${v}%` },
    { title: '样本数', dataIndex: 'sampleCount', key: 'sampleCount', width: 96, render: (v: number) => v?.toLocaleString() },
    { title: '字符数', dataIndex: 'charCount', key: 'charCount', width: 96, render: (v: number) => v?.toLocaleString() },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', ellipsis: true },
  ]

  const handleOpenCreate = () => {
    navigate(`/datasets/training/create?type=${datasetTab === 'validation' ? 'validation' : 'training'}`)
  }

  const handleFileChange = (info: any) => {
    const file = info.file
    if (file.status === 'uploading') {
      setUploading(true)
      let progress = 0
      const timer = setInterval(() => {
        progress += 10
        setUploadProgress(progress)
        if (progress >= 100) {
          clearInterval(timer)
          setUploading(false)
          setSelectedFile({ uid: file.uid, name: file.name, status: 'done' } as UploadFile)
          message.success(`${file.name} 上传成功`)
        }
      }, 200)
    } else if (file.status === 'done') {
      setUploading(false)
      setUploadProgress(100)
    } else if (file.status === 'error') {
      setUploading(false)
      message.error(`${file.name} 上传失败`)
    }
  }

  const handleSubmit = async () => {
    try {
      await form.validateFields()
      const values = form.getFieldsValue()
      setCreating(true)
      const datasetUsage = resolveDatasetUsageFromPath(values.dataUsage) ?? 'SFT-文本生成'
      await dataServiceApi.createDataset(datasetTab === 'validation' ? 'validation' : 'training', {
        name: values.name,
        dataUsage: datasetUsage,
        dataFormat: values.dataFormat,
      })
      message.success('创建成功')
      setCreateModalVisible(false)
      form.resetFields()
      setSelectedFile(null)
      setUploadProgress(0)
      navigate(`/datasets${datasetTab === 'validation' ? '?key=validation' : ''}`)
    } catch {
      /* 校验失败 */
    } finally {
      setCreating(false)
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()
    setSelectedFile(null)
    setUploadProgress(0)

    if (isCreateRoute) {
      navigate(`/datasets${datasetTab === 'validation' ? '?key=validation' : ''}`)
    }
  }

  const handleOpenDetail = (record: TrainingDatasetRecord) => {
    navigate(`/datasets/training/${encodeURIComponent(record.name)}${datasetTab === 'validation' ? '?key=validation' : ''}`)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)

    if (isDetailRoute) {
      navigate(`/datasets${datasetTab === 'validation' ? '?key=validation' : ''}`)
    }
  }

  const handleOpenAddVersion = (record: TrainingDatasetRecord) => {
    navigate(`/datasets/training/${encodeURIComponent(record.name)}/new-version${datasetTab === 'validation' ? '?key=validation' : ''}`)
  }

  /** 从详情弹窗进入增加版本：使用列表中的最新行数据，避免详情态与列表不同步 */
  const handleAddVersionFromDetail = () => {
    if (!selectedRecord) return
    const list = datasetTab === 'training' ? trainingList : validationList
    const current = list.find(r => r.id === selectedRecord.id) ?? selectedRecord
    handleOpenAddVersion(current)
  }

  const handleCancelAddVersion = () => {
    setAddVersionModalVisible(false)
    setAddVersionTarget(null)
    addVersionForm.resetFields()
    setAddVersionFile(null)
    setAddVersionProgress(0)
  }

  const handleAddVersionFileChange = (info: any) => {
    const file = info.file
    if (file.status === 'uploading') {
      setAddVersionUploading(true)
      let progress = 0
      const timer = setInterval(() => {
        progress += 10
        setAddVersionProgress(progress)
        if (progress >= 100) {
          clearInterval(timer)
          setAddVersionUploading(false)
          setAddVersionFile({ uid: file.uid, name: file.name, status: 'done' } as UploadFile)
          message.success(`${file.name} 上传成功`)
        }
      }, 200)
    } else if (file.status === 'done') {
      setAddVersionUploading(false)
      setAddVersionProgress(100)
    } else if (file.status === 'error') {
      setAddVersionUploading(false)
      message.error(`${file.name} 上传失败`)
    }
  }

  const handleSubmitAddVersion = async () => {
    try {
      await addVersionForm.validateFields()
      if (!addVersionTarget) return
      if (!inheritHistoryVersion && !addVersionFile) {
        message.warning('请上传数据文件')
        return
      }
      setAddingVersion(true)
      const values = addVersionForm.getFieldsValue()
      await dataServiceApi.addDatasetVersion(datasetTab === 'validation' ? 'validation' : 'training', addVersionTarget.id, {
        inheritFromPrevious: Boolean(values.inheritHistoryVersion),
        description: values.description,
      })
      message.success('新版本已创建')
      handleCancelAddVersion()
      navigate(`/datasets/training/${encodeURIComponent(addVersionTarget.name)}${datasetTab === 'validation' ? '?key=validation' : ''}`)
    } catch {
      /* 校验失败 */
    } finally {
      setAddingVersion(false)
    }
  }

  const columns: ColumnsType<TrainingDatasetRecord> = [
    { title: '数据集名称', dataIndex: 'name', key: 'name', width: 200, ellipsis: true },
    {
      title: '最新版本状态',
      dataIndex: 'versionStatus',
      key: 'versionStatus',
      width: 120,
      render: (val: string) => {
        const s = statusMap[val] || { color: 'default', label: val }
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    { title: '最新版本', dataIndex: 'latestVersion', key: 'latestVersion', width: 100 },
    {
      title: '数据用途',
      dataIndex: 'dataUsage',
      key: 'dataUsage',
      width: 130,
      render: (val: string) => {
        const t = DATASET_USAGE_TAGS[val as keyof typeof DATASET_USAGE_TAGS] || { color: 'default', text: val }
        return <Tag color={t.color}>{t.text}</Tag>
      },
    },
    { title: '数据格式', dataIndex: 'dataFormat', key: 'dataFormat', width: 130, render: (val: string) => <Text style={{ color: '#64748b', fontSize: 12 }}>{val}</Text> },
    {
      title: '操作',
      key: 'action',
      width: 150,
          fixed: 'right' as const,
          render: (_: unknown, record: TrainingDatasetRecord) => (
            <Space size={0} wrap>
              <Button type="link" size="small" onClick={() => handleOpenDetail(record)}>查看详情</Button>
              <Button
                type="link"
                size="small"
                danger
                onClick={async () => {
                  await dataServiceApi.deleteDataset(datasetTab === 'validation' ? 'validation' : 'training', record.id)
                  message.success(`已删除：${record.name}`)
                }}
              >
                删除
              </Button>
        </Space>
      ),
    },
  ]

  const toolbarExtra = (
    <Cascader
      placeholder="数据用途"
      allowClear
      style={{ width: 220 }}
      value={getDatasetUsagePath(dataUsage)}
      onChange={value => setDataUsage(resolveDatasetUsageFromPath(value as string[]))}
      options={DATASET_USAGE_CASCADER_OPTIONS}
      displayRender={labels => labels.join(' / ')}
    />
  )

  const createFormContent = (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ dataSource: 'local', dataUsage: getDatasetUsagePath('SFT-文本生成') }}
    >
      <Divider plain style={{ margin: '0 0 16px', color: '#64748b', fontSize: 12 }}>基本信息</Divider>

      <Form.Item label="数据集名称" name="name" rules={[{ required: true, message: '请输入数据集名称' }]}
        tooltip="支持中英文、数字、下划线、中划线，不能以下划线或中划线开头，2-64个字符">
        <Input placeholder="请输入数据集名称" maxLength={64} showCount />
      </Form.Item>

      <Form.Item label="数据集版本" name="version">
        <Input placeholder="V1" disabled />
      </Form.Item>

      <Form.Item label="描述" name="description">
        <TextArea rows={2} placeholder="请输入描述（0 / 300）" maxLength={300} showCount />
      </Form.Item>

      <Divider plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>数据配置</Divider>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        <Form.Item label="数据用途" name="dataUsage" rules={[{ required: true, message: '请选择数据用途' }]}>
          <Cascader
            placeholder="请先选文本生成或图像理解，再选训练方式"
            options={DATASET_USAGE_CASCADER_OPTIONS}
            displayRender={labels => labels.join(' / ')}
          />
        </Form.Item>

        <Form.Item label="数据属性" name="dataAttribute">
          <Select placeholder="未分组" />
        </Form.Item>
      </div>

      <Form.Item label="数据格式" name="dataFormat" rules={[{ required: true, message: '请选择数据格式' }]}>
        <Select placeholder="请选择数据格式">
          <Select.Option value="PROMPT_RESPONSE">PROMPT_RESPONSE</Select.Option>
          <Select.Option value="ROLE_BASED">ROLE_BASED</Select.Option>
        </Select>
      </Form.Item>

      <Divider plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>数据上传</Divider>

      <Form.Item label="数据来源" name="dataSource" rules={[{ required: true, message: '请选择数据来源' }]}>
        <Select placeholder="请选择数据来源">
          <Select.Option value="local">本地上传</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item label="上传文件" name="file" rules={[{ required: true, message: '请上传数据文件' }]} style={{ marginBottom: 8 }}>
        <Upload.Dragger
          accept=".jsonl,.json,.xlsx"
          showUploadList={false}
          customRequest={({ onSuccess }: any) => { setTimeout(() => onSuccess?.('ok'), 100) }}
          onChange={handleFileChange}
          disabled={uploading}
        >
          <p style={{ fontSize: 40, color: '#94a3b8', margin: 0 }}><UploadOutlined /></p>
          <p style={{ color: '#64748b' }}>点击或拖拽文件到此区域上传</p>
          <p style={{ color: '#94a3b8', fontSize: 12 }}>支持 .jsonl/.json/.xlsx 格式，单个文件不超过 100MB</p>
        </Upload.Dragger>
      </Form.Item>

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size={16}>
          <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 12 }}>JSONL 格式</Button>
          <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 12 }}>JSON 格式</Button>
          <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 12 }}>XLSX 格式</Button>
        </Space>
        {uploading && <Progress percent={uploadProgress} size="small" status="active" style={{ width: 160 }} />}
      </div>

      {selectedFile && (
        <List size="small" bordered dataSource={[selectedFile]} style={{ background: '#f8fafc' }}
          renderItem={(item: UploadFile) => (
            <List.Item actions={[<Button key="delete-file" type="link" danger size="small" onClick={() => setSelectedFile(null)}>删除</Button>]}>
              <List.Item.Meta avatar={<CheckCircleOutlined style={{ color: '#52c41a' }} />} title={item.name} description="上传完成" />
            </List.Item>
          )}
        />
      )}
    </Form>
  )

  const detailContent = selectedRecord && (
    <>
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="数据集名称" span={2}>{selectedRecord.name}</Descriptions.Item>
        <Descriptions.Item label="当前最新版本">{selectedRecord.latestVersion}</Descriptions.Item>
        <Descriptions.Item label="最新处理状态">
          {(() => { const s = statusMap[selectedRecord.versionStatus] || { color: 'default', label: selectedRecord.versionStatus }; return <Tag color={s.color}>{s.label}</Tag> })()}
        </Descriptions.Item>
        <Descriptions.Item label="数据用途">{selectedRecord.dataUsage}</Descriptions.Item>
        <Descriptions.Item label="数据格式">{selectedRecord.dataFormat}</Descriptions.Item>
        <Descriptions.Item label="创建人">{selectedRecord.creator}</Descriptions.Item>
        <Descriptions.Item label="最近更新时间">{selectedRecord.createdAt}</Descriptions.Item>
      </Descriptions>
      <Divider plain style={{ margin: '20px 0 12px', color: '#64748b', fontSize: 12 }}>版本列表</Divider>
      <Table<DatasetVersionRow>
        rowKey="id"
        size="small"
        columns={versionColumns}
        dataSource={selectedRecord.versions}
        pagination={false}
        locale={{ emptyText: '暂无版本' }}
      />
    </>
  )

  const detailTableColumns: ColumnsType<DatasetDetailRow> =
    selectedRecord?.dataFormat === 'role-based'
      ? [
          { title: '序号', dataIndex: 'key', key: 'index', width: 84, render: (_value, _row, index) => index + 1 },
          { title: 'System', dataIndex: 'system', key: 'system' },
          { title: 'User', dataIndex: 'user', key: 'user' },
          { title: 'Assistant', dataIndex: 'assistant', key: 'assistant' },
        ]
      : [
          { title: '序号', dataIndex: 'key', key: 'index', width: 84, render: (_value, _row, index) => index + 1 },
          { title: 'System', dataIndex: 'system', key: 'system' },
          { title: 'Prompt', dataIndex: 'prompt', key: 'prompt' },
          { title: 'Response', dataIndex: 'response', key: 'response' },
        ]

  const downloadItems = [
    { key: 'jsonl', label: '下载 JSONL' },
    { key: 'json', label: '下载 JSON' },
    { key: 'xlsx', label: '下载 XLSX' },
  ]

  useEffect(() => {
    setDatasetTab(getDatasetTabFromSearch(location.search))
  }, [location.search])

  useEffect(() => {
    setPage(1)
  }, [datasetTab, dataUsage, searchValue])

  useEffect(() => {
    let active = true
    setListLoading(true)

    void dataServiceApi
      .listDatasets(datasetTab === 'validation' ? 'validation' : 'training', {
        search: searchValue,
        dataUsage,
        page,
        pageSize,
      })
      .then(result => {
        if (!active) {
          return
        }
        setListResult(result as PaginatedResult<TrainingDatasetRecord>)
      })
      .finally(() => {
        if (active) {
          setListLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [datasetTab, dataUsage, page, pageSize, rawData, searchValue])

  useEffect(() => {
    if (isCreateRoute) {
      form.resetFields()
      setSelectedFile(null)
      setUploadProgress(0)
      setCreateModalVisible(true)
      return
    }

    setCreateModalVisible(false)
  }, [form, isCreateRoute])

  useEffect(() => {
    if (!isDetailRoute && !isNewVersionRoute) {
      setDetailModalVisible(false)
      setSelectedRecord(null)
    }

    if (!detailRecord) {
      return
    }

    const nextTab = validationList.some(item => item.name === detailRecord.name) ? 'validation' : 'training'
    setDatasetTab(nextTab)
    setSelectedRecord(detailRecord)
    setActiveVersionId(detailRecord.versions[0]?.id)
    if (isDetailRoute) {
      setDetailModalVisible(true)
    }
    if (isNewVersionRoute) {
      setAddVersionTarget(detailRecord)
      addVersionForm.setFieldsValue({
        version: nextVersionLabel(detailRecord.latestVersion),
        description: '',
        inheritHistoryVersion: true,
        sourceType: 'local',
      })
    }
  }, [addVersionForm, detailRecord, isDetailRoute, isNewVersionRoute, validationList])

  if (isCreateRoute) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ marginBottom: 20 }}>
          <Text type="secondary">训练数据管理 / 新建</Text>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <div>
              <Text strong style={{ fontSize: 24, color: '#0f172a' }}>创建数据集</Text>
              <div><Text type="secondary">按生产环境入口保留独立创建路径。</Text></div>
            </div>
            <Space>
              <Button onClick={handleCancel}>取消</Button>
              <Button type="primary" loading={creating} onClick={handleSubmit}>提交</Button>
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
            训练数据管理 / {selectedRecord.name}
          </Text>
          <Space size={16}>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => navigate('/training/create')}>
              去训练
            </Button>
            <Dropdown menu={{ items: downloadItems, onClick: ({ key }) => message.success(`开始下载 ${String(key).toUpperCase()}`) }}>
              <Button icon={<DownloadOutlined />}>下载</Button>
            </Dropdown>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={async () => {
                await dataServiceApi.deleteDataset(datasetTab === 'validation' ? 'validation' : 'training', selectedRecord.id)
                handleCloseDetail()
                message.success(`已删除：${selectedRecord.name}`)
              }}
            >
              删除
            </Button>
          </Space>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '188px minmax(0, 1fr)', gap: 20 }}>
          <div>
            <Button type="primary" size="large" icon={<PlusOutlined />} block onClick={handleAddVersionFromDetail} style={{ height: 52, marginBottom: 18 }}>
              新增版本
            </Button>
            <Card style={{ borderRadius: 16 }}>
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {selectedRecord.versions.map(version => {
                  const active = version.id === activeVersion?.id
                  return (
                    <div
                      key={version.id}
                      onClick={() => setActiveVersionId(version.id)}
                      style={{
                        cursor: 'pointer',
                        padding: '14px 16px',
                        borderRadius: 12,
                        background: active ? 'rgba(59,130,246,0.12)' : '#fff',
                        border: active ? '1px solid rgba(59,130,246,0.35)' : '1px solid #eef2f7',
                        color: active ? '#2563eb' : '#0f172a',
                        fontWeight: active ? 700 : 500,
                      }}
                    >
                      {version.version}
                    </div>
                  )
                })}
              </Space>
            </Card>
          </div>

          <div style={{ display: 'grid', gap: 18 }}>
            <Card
              title={<Space><FileTextOutlined style={{ color: '#3b82f6' }} /><span style={{ color: '#3b82f6' }}>基本信息</span></Space>}
              style={{ borderRadius: 18 }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 26, columnGap: 24 }}>
                <div><Text type="secondary">数据集名称：</Text><Text strong>{selectedRecord.name}</Text></div>
                <div><Text type="secondary">数据量：</Text><Text strong>{activeVersion?.sampleCount ?? selectedRecord.sampleCount} 条</Text></div>
                <div><Text type="secondary">数据用途：</Text><Text strong>{selectedRecord.dataUsage}</Text></div>
                <div><Text type="secondary">数据格式：</Text><Tag>{selectedRecord.dataFormat}</Tag></div>
                <div><Text type="secondary">状态：</Text><Text strong>{activeVersion?.processStatus ?? selectedRecord.versionStatus}</Text></div>
                <div><Text type="secondary">文件大小：</Text><Text strong>{formatFileSizeMB(activeVersion?.charCount ?? selectedRecord.charCount)}</Text></div>
                <div><Text type="secondary">描述：</Text><Text strong>-</Text></div>
                <div><Text type="secondary">创建时间：</Text><Text strong>{activeVersion?.createdAt ?? selectedRecord.createdAt}</Text></div>
                <div><Text type="secondary">属性分类：</Text><Text strong>-</Text></div>
              </div>
            </Card>

            <Card
              title={<Space><DatabaseOutlined style={{ color: '#3b82f6' }} /><span style={{ color: '#3b82f6' }}>数据详情</span></Space>}
              style={{ borderRadius: 18 }}
            >
              <Table
                rowKey="key"
                columns={detailTableColumns}
                dataSource={buildDatasetDetailRows(selectedRecord, activeVersion ?? selectedRecord.versions[0])}
                pagination={false}
                scroll={{ x: 960 }}
              />
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (isNewVersionRoute && addVersionTarget) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/datasets/training/${encodeURIComponent(addVersionTarget.name)}${datasetTab === 'validation' ? '?key=validation' : ''}`)}>
            返回
          </Button>
          <Text type="secondary">训练数据管理 / {addVersionTarget.name} / 新增版本</Text>
        </div>

        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e5e7eb', padding: 28 }}>
          <Form form={addVersionForm} layout="vertical">
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '22px 24px', alignItems: 'start' }}>
              <Text strong style={{ fontSize: 15 }}>数据集版本：</Text>
              <Text strong style={{ fontSize: 28, color: '#0f172a' }}>{nextVersionLabel(addVersionTarget.latestVersion)}</Text>

              <Text strong style={{ fontSize: 15, paddingTop: 10 }}>描述：</Text>
              <Form.Item name="description" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={4} placeholder="请输入数据集描述" maxLength={300} showCount />
              </Form.Item>

              <Text strong style={{ fontSize: 15, paddingTop: 10 }}>数据用途：</Text>
              <Text strong style={{ fontSize: 16 }}>{addVersionTarget.dataUsage}</Text>

              <Text strong style={{ fontSize: 15, paddingTop: 10 }}>数据格式：</Text>
              <Text strong style={{ fontSize: 16 }}>{addVersionTarget.dataFormat === 'prompt-response' ? 'PROMPT_RESPONSE' : 'ROLE_BASED'}</Text>

              <Text strong style={{ fontSize: 15, paddingTop: 10 }}>继承历史版本：</Text>
              <Form.Item name="inheritHistoryVersion" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch />
              </Form.Item>

              <Text strong style={{ fontSize: 15, paddingTop: 10 }}>数据来源：</Text>
              <Form.Item name="sourceType" style={{ marginBottom: 0 }}>
                <Radio.Group>
                  <Radio value="local">本地上传</Radio>
                  <Radio value="url" disabled>URL获取</Radio>
                </Radio.Group>
              </Form.Item>

              <Text strong style={{ fontSize: 15, paddingTop: 10 }}>上传文件：</Text>
              <div>
                <Upload.Dragger
                  accept=".jsonl,.json,.xlsx"
                  showUploadList={false}
                  customRequest={({ onSuccess }: any) => { setTimeout(() => onSuccess?.('ok'), 100) }}
                  onChange={handleAddVersionFileChange}
                  disabled={addVersionUploading || inheritHistoryVersion}
                  style={{ opacity: inheritHistoryVersion ? 0.55 : 1 }}
                >
                  <p style={{ fontSize: 44, color: '#3b82f6', margin: 0 }}><UploadOutlined /></p>
                  <p style={{ color: '#0f172a', fontSize: 24, margin: '12px 0 8px' }}>点击或拖拽文件到此区域上传</p>
                  <p style={{ color: '#94a3b8', fontSize: 14 }}>支持 .jsonl/.json/.xlsx 格式，单个文件不超过 100MB</p>
                </Upload.Dragger>
                {inheritHistoryVersion && (
                  <div style={{ marginTop: 12 }}>
                    <Text type="secondary">已开启继承历史版本，将直接继承 {addVersionTarget.latestVersion} 的数据详情。</Text>
                  </div>
                )}
                {addVersionFile && (
                  <List
                    size="small"
                    bordered
                    dataSource={[addVersionFile]}
                    style={{ background: '#f8fafc', marginTop: 12 }}
                    renderItem={(item: UploadFile) => (
                      <List.Item actions={[<Button key="delete-file" type="link" danger size="small" onClick={() => setAddVersionFile(null)}>删除</Button>]}>
                        <List.Item.Meta avatar={<CheckCircleOutlined style={{ color: '#52c41a' }} />} title={item.name} description="上传完成" />
                      </List.Item>
                    )}
                  />
                )}
                <div style={{ marginTop: 16, display: 'flex', gap: 28 }}>
                  <Button type="link" icon={<DownloadOutlined />}>JSONL 格式</Button>
                  <Button type="link" icon={<DownloadOutlined />}>JSON 格式</Button>
                  <Button type="link" icon={<DownloadOutlined />}>XLSX 格式</Button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
              <Button type="primary" loading={addingVersion} onClick={handleSubmitAddVersion}>提交</Button>
              <Button onClick={() => navigate(`/datasets/training/${encodeURIComponent(addVersionTarget.name)}${datasetTab === 'validation' ? '?key=validation' : ''}`)}>取消</Button>
            </div>
          </Form>
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
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
            <Text strong style={{ fontSize: 18, color: '#0f172a' }}>训练数据管理</Text>
          </div>
          <Text type="secondary" style={{ fontSize: 13, marginLeft: 52 }}>
            管理和创建用于模型训练的数据集，支持多种格式和训练类型
          </Text>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Tabs
            activeKey={datasetTab}
            onChange={key => { setDatasetTab(key); setSearchValue(''); setDataUsage(undefined) }}
            items={[
              { key: 'training', label: '训练数据集' },
              { key: 'validation', label: '验证数据集' },
            ]}
            style={{ marginBottom: 16 }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {toolbarExtra}
              <Input
                prefix={<span style={{ color: '#94a3b8' }}>🔍</span>}
                placeholder="搜索"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                allowClear
                style={{ borderRadius: 8, width: 200 }}
              />
              <Button onClick={() => { setSearchValue(''); setDataUsage(undefined) }}>重置</Button>
            </div>
            <Space>
              <Button icon={<span>🔄</span>} onClick={() => message.success('刷新成功')}>刷新</Button>
              <Button type="primary" icon={<span>➕</span>} onClick={handleOpenCreate}>创建数据集</Button>
            </Space>
          </div>
        </div>

        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden',
        }}>
          <Table<TrainingDatasetRecord>
            rowKey="id"
            columns={columns}
            dataSource={listResult.items}
            loading={listLoading}
            scroll={{ x: 1100 }}
            pagination={{
              current: page,
              pageSize,
              total: listResult.total,
              showSizeChanger: false,
              showTotal: (total: number) => `共 ${total} 条数据`,
              onChange: nextPage => setPage(nextPage),
            }}
            locale={{ emptyText: <Text type="secondary">暂无数据</Text> }}
          />
        </div>
      </div>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DatabaseOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>创建数据集</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={720}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" loading={creating} onClick={handleSubmit}>提交</Button>
          </Space>
        }
        destroyOnClose
      >
        {createFormContent}
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DatabaseOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>数据集详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={880}
        footer={
          <Space>
            <Button onClick={handleCloseDetail}>关闭</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddVersionFromDetail}>
              新增版本
            </Button>
          </Space>
        }
      >
        {detailContent}
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PlusOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>增加版本</span>
          </div>
        }
        open={addVersionModalVisible}
        onCancel={handleCancelAddVersion}
        width={640}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={handleCancelAddVersion}>取消</Button>
            <Button type="primary" loading={addingVersion} onClick={handleSubmitAddVersion}>确定</Button>
          </Space>
        }
      >
        <Form form={addVersionForm} layout="vertical">
          <Form.Item label="数据集名称">
            <Input value={addVersionTarget?.name} disabled />
          </Form.Item>
          <Form.Item label="新版本号" name="version" rules={[{ required: true, message: '请填写版本号' }]}>
            <Input disabled />
          </Form.Item>
          <Divider plain style={{ margin: '12px 0', color: '#64748b', fontSize: 12 }}>数据上传</Divider>
          <Form.Item label="上传文件" name="file">
            <Upload.Dragger
              accept=".jsonl,.json,.xlsx"
              showUploadList={false}
              customRequest={({ onSuccess }: any) => { setTimeout(() => onSuccess?.('ok'), 100) }}
              onChange={handleAddVersionFileChange}
              disabled={addVersionUploading}
            >
              <p style={{ fontSize: 40, color: '#94a3b8', margin: 0 }}><UploadOutlined /></p>
              <p style={{ color: '#64748b' }}>上传新版本数据文件</p>
              <p style={{ color: '#94a3b8', fontSize: 12 }}>格式需与数据集一致：{addVersionTarget?.dataFormat ?? '-'}</p>
            </Upload.Dragger>
          </Form.Item>
          {addVersionUploading && <Progress percent={addVersionProgress} size="small" status="active" style={{ marginBottom: 12 }} />}
          {addVersionFile && (
            <List size="small" bordered dataSource={[addVersionFile]} style={{ background: '#f8fafc' }}
              renderItem={(item: UploadFile) => (
                <List.Item actions={[<Button type="link" danger size="small" onClick={() => setAddVersionFile(null)}>删除</Button>]}>
                  <List.Item.Meta avatar={<CheckCircleOutlined style={{ color: '#52c41a' }} />} title={item.name} description="上传完成" />
                </List.Item>
              )}
            />
          )}
        </Form>
      </Modal>
    </>
  )
}

export default TrainingDataset
