import React, { useMemo, useState } from 'react'
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Result,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getCurrentUser } from '../../services/permissionStore'
import { formatResourceLockMessage, getCreatorDeletePermission, getOnlineAnnotationServiceReferenceLocks } from '../../services/resourceReferenceGuard'
import ResumableUpload from '../../components/ResumableUpload'

const { Title, Text } = Typography

type MLDatasetFormValues = {
  name: string
  description?: string
  version: string
  dataType: 'text' | 'image'
  annotationType: string
  annotationTemplate: string
  labelStatus: 'none' | 'with-label'
  dataSource: 'local' | 'notebook'
}

type MLDatasetVersion = {
  version: string
  creator: string
  createdAt: string
  description?: string
  labelStatus: '无标注信息' | '有标注信息'
  dataSource: '本地上传' | 'Notebook 获取'
  detailRows: MLDatasetDetailRow[]
}

type MLDatasetRecord = {
  id: string
  name: string
  version: string
  dataType: '文本' | '图片'
  annotationType: string
  annotationTemplate: string
  description?: string
  labelStatus: '无标注信息' | '有标注信息'
  dataSource: '本地上传' | 'Notebook 获取'
  creator: string
  createdAt: string
  detailRows?: MLDatasetDetailRow[]
  versions?: MLDatasetVersion[]
}

type MLDatasetDetailRow = {
  key: string
  sampleName: string
  content: string
  label: string | string[]
  status: string
  imageDescription?: string
  boxes?: Array<{ id: string; label: string; x: number; y: number; width: number; height: number }>
  segments?: Array<{ id: string; label: string; points: string }>
}

type AddVersionFormValues = {
  version: string
  labelStatus: '无标注信息' | '有标注信息'
  dataSource: '本地上传' | 'Notebook 获取'
  description?: string
}

const dataTypes = [
  { value: 'text', label: '文本' },
  { value: 'image', label: '图片' },
]

const annotationTypesByDataType: Record<string, Array<{ value: string; label: string; templates: string[] }>> = {
  text: [
    { value: '文本分类', label: '文本分类', templates: ['文本单标签', '文本多标签'] },
    { value: '实体识别', label: '实体识别', templates: ['文本实体识别'] },
  ],
  image: [
    { value: '图像分类', label: '图像分类', templates: ['单图单标签', '单图多标签'] },
    { value: '图像分割', label: '图像分割', templates: ['实例分割'] },
    { value: '物体检测', label: '物体检测', templates: ['矩阵框标注'] },
  ],
}

const initialDatasetRows: MLDatasetRecord[] = [
  { id: '1', name: 'basion-物体检测', version: 'V1', dataType: '图片', annotationType: '物体检测', annotationTemplate: '矩阵框标注', labelStatus: '有标注信息', dataSource: '本地上传', creator: 'lab1', createdAt: '2026-04-24 14:13:09' },
  { id: '2', name: 'qeqwe', version: 'V1', dataType: '文本', annotationType: '实体识别', annotationTemplate: '文本实体识别', labelStatus: '无标注信息', dataSource: 'Notebook 获取', creator: 'lisi', createdAt: '2026-04-22 15:11:38' },
  { id: '3', name: 'basion-文本实体识别', version: 'V3', dataType: '文本', annotationType: '实体识别', annotationTemplate: '文本实体识别', labelStatus: '有标注信息', dataSource: '本地上传', creator: 'lab1', createdAt: '2026-04-15 09:35:59' },
  { id: '4', name: '图像分类-多-1', version: 'V3', dataType: '图片', annotationType: '图像分类', annotationTemplate: '单图多标签', labelStatus: '有标注信息', dataSource: '本地上传', creator: 'admin', createdAt: '2026-04-14 17:43:06' },
  { id: '5', name: 'basion-文本分类-多标签-无标注', version: 'V2', dataType: '文本', annotationType: '文本分类', annotationTemplate: '文本多标签', labelStatus: '无标注信息', dataSource: '本地上传', creator: 'wangwu', createdAt: '2026-04-14 16:33:51' },
  { id: '6', name: 'basion-图像分割-实例分割-无标注', version: 'V1', dataType: '图片', annotationType: '图像分割', annotationTemplate: '实例分割', labelStatus: '无标注信息', dataSource: '本地上传', creator: 'lab1', createdAt: '2026-03-01 09:10:00' },
]

function buildMLDatasetDetailRows(record: MLDatasetRecord): MLDatasetDetailRow[] {
  if (record.detailRows) {
    return record.detailRows
  }

  const sampleType = record.dataType === '图片' ? '图片样本' : '文本样本'
  return Array.from({ length: 3 }, (_, index) => ({
    key: `${record.id}-sample-${index + 1}`,
    sampleName: `${sampleType}-${String(index + 1).padStart(3, '0')}`,
    content: record.dataType === '图片'
      ? ['大象在草地上行走', '海边人物与风筝', '街区车辆与行人'][index] ?? `图片样本 ${index + 1}`
      : `这是 ${record.name} ${record.version} 的第 ${index + 1} 条样本文本。`,
    label: record.labelStatus === '有标注信息'
      ? record.dataType === '图片'
        ? [['动物'], ['人物', '物体'], ['车辆', '文字']][index] ?? ['图片标签']
        : `${record.annotationTemplate}标签${index + 1}`
      : '-',
    status: record.labelStatus === '有标注信息' ? '已标注' : '未标注',
    boxes: record.annotationType === '物体检测'
      ? [
          { id: `${record.id}-box-${index}-1`, label: ['食品', '人物', '物体'][index] ?? '物体', x: 18 + index * 8, y: 16 + index * 5, width: 42, height: 34 },
        ]
      : undefined,
    segments: record.annotationType === '图像分割'
      ? [
          { id: `${record.id}-seg-${index}-1`, label: ['道路', '建筑', '植被'][index] ?? '区域', points: '28,18 76,22 88,64 34,72' },
        ]
      : undefined,
  }))
}

function getDatasetVersions(record: MLDatasetRecord): MLDatasetVersion[] {
  if (record.versions?.length) {
    return [...record.versions].sort((a, b) => getVersionNumber(b.version) - getVersionNumber(a.version))
  }

  const latestNumber = Number(record.version.replace(/^V/i, '')) || 1
  return Array.from({ length: latestNumber }, (_, index) => {
    const version = `V${latestNumber - index}`
    return {
      version,
      creator: record.creator,
      createdAt: index === 0 ? record.createdAt : `2026-04-${String(20 - index).padStart(2, '0')} 10:00:00`,
      description: index === 0 ? record.description : `${record.name} ${version} 历史版本。`,
      labelStatus: record.labelStatus,
      dataSource: record.dataSource,
      detailRows: buildMLDatasetDetailRows({ ...record, version }).map(row => ({
        ...row,
        key: `${record.id}-${version}-${row.key}`,
        content: record.dataType === '图片' ? row.content : `这是 ${record.name} ${version} 的样本文本。`,
      })),
    }
  })
}

function getVersionNumber(version: string) {
  return Number(version.replace(/^V/i, '')) || 1
}

function getNextVersionLabel(record: MLDatasetRecord) {
  const maxVersion = Math.max(...getDatasetVersions(record).map(item => getVersionNumber(item.version)))
  return `V${maxVersion + 1}`
}

function getActiveDatasetVersion(record: MLDatasetRecord, activeVersion?: string) {
  const versions = getDatasetVersions(record)
  return versions.find(item => item.version === activeVersion) ?? versions[0]
}

function buildVersionDetailRows(record: MLDatasetRecord, values: AddVersionFormValues): MLDatasetDetailRow[] {
  const baseRows = buildMLDatasetDetailRows({
    ...record,
    version: values.version,
    labelStatus: values.labelStatus,
    dataSource: values.dataSource,
    detailRows: undefined,
  })

  return [
    ...baseRows,
    {
      key: `${record.id}-${values.version}-sample-${Date.now()}`,
      sampleName: `${record.dataType === '图片' ? '图片样本' : '文本样本'}-新增`,
      content: record.dataType === '图片' ? '新增版本上传样本预览' : `这是 ${record.name} ${values.version} 新增上传的样本文本。`,
      label: values.labelStatus === '有标注信息' ? (record.dataType === '图片' ? ['新增标签'] : '新增标签') : '-',
      status: values.labelStatus === '有标注信息' ? '已标注' : '未标注',
    },
  ]
}

function renderDatasetSample(record: MLDatasetRecord, row: MLDatasetDetailRow) {
  if (record.dataType !== '图片') {
    return <Text>{row.content}</Text>
  }

  const gradients = [
    'linear-gradient(135deg, #8b5e34 0%, #d8a15d 42%, #bfdbfe 100%)',
    'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 45%, #fef3c7 100%)',
    'linear-gradient(135deg, #334155 0%, #64748b 50%, #f97316 100%)',
  ]
  const color = gradients[Math.abs(row.key.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % gradients.length]
  return (
    <div
      style={{
        width: 148,
        height: 96,
        borderRadius: 8,
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 600,
        textAlign: 'center',
        padding: 10,
      }}
    >
      {row.content}
    </div>
  )
}

function renderDatasetLabels(value: MLDatasetDetailRow['label']) {
  if (Array.isArray(value)) {
    return (
      <Space wrap>
        {value.map((label, index) => (
          <Tag key={label} color={index % 2 === 0 ? 'blue' : 'green'}>{label}</Tag>
        ))}
      </Space>
    )
  }

  return value === '-' ? <Text type="secondary">-</Text> : <Tag color="blue">{value}</Tag>
}

function renderInfoGrid(items: Array<{ label: string; value: React.ReactNode }>) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 48, rowGap: 18 }}>
      {items.map(item => (
        <div key={item.label} style={{ minWidth: 0 }}>
          <div style={{ color: '#8c8c8c', fontSize: 13, lineHeight: '20px', marginBottom: 4 }}>{item.label}</div>
          <div style={{ color: '#1f2937', fontSize: 14, lineHeight: '22px', wordBreak: 'break-word' }}>{item.value}</div>
        </div>
      ))}
    </div>
  )
}

function renderTagGroup(labels: string[]) {
  return (
    <Space wrap size={[4, 6]}>
      {labels.map(label => <Tag key={label} color="blue">{label}</Tag>)}
    </Space>
  )
}

const MLDataset: React.FC = () => {
  const [form] = Form.useForm<MLDatasetFormValues>()
  const [addVersionForm] = Form.useForm<AddVersionFormValues>()
  const location = useLocation()
  const navigate = useNavigate()
  const { datasetId } = useParams()
  const isCreateRoute = location.pathname === '/machine-data-management/create'
  const isDetailRoute = Boolean(datasetId)
  const [rows, setRows] = useState<MLDatasetRecord[]>(initialDatasetRows)
  const [activeVersion, setActiveVersion] = useState<string>()
  const [annotationTypeFilter, setAnnotationTypeFilter] = useState<string>('全部')
  const [searchValue, setSearchValue] = useState('')
  const [selectedDataType, setSelectedDataType] = useState<'text' | 'image'>('text')
  const [selectedAnnotationType, setSelectedAnnotationType] = useState('文本分类')
  const [selectedFile, setSelectedFile] = useState<UploadFile | null>(null)
  const [addVersionOpen, setAddVersionOpen] = useState(false)
  const [addVersionFile, setAddVersionFile] = useState<UploadFile | null>(null)

  const filteredRows = useMemo(
    () =>
      rows.filter(item => {
        const matchType = annotationTypeFilter === '全部' || item.annotationType === annotationTypeFilter
        const matchSearch = !searchValue || item.name.toLowerCase().includes(searchValue.toLowerCase())
        return matchType && matchSearch
      }),
    [annotationTypeFilter, searchValue, rows],
  )

  const availableAnnotationTypes = annotationTypesByDataType[selectedDataType]
  const availableTemplates = availableAnnotationTypes.find(item => item.value === selectedAnnotationType)?.templates ?? []
  const selectedDetailRecord = useMemo(
    () => (datasetId ? rows.find(item => item.id === datasetId) ?? null : null),
    [datasetId, rows],
  )
  const detailVersion = activeVersion ?? selectedDetailRecord?.version

  const openAddVersion = (record: MLDatasetRecord) => {
    const nextVersion = getNextVersionLabel(record)
    addVersionForm.setFieldsValue({
      version: nextVersion,
      labelStatus: record.labelStatus,
      dataSource: record.dataSource,
      description: '',
    })
    setAddVersionFile(null)
    setAddVersionOpen(true)
  }

  const submitAddVersion = async (record: MLDatasetRecord) => {
    try {
      const values = await addVersionForm.validateFields()
      const nextVersion: MLDatasetVersion = {
        version: values.version,
        creator: getCurrentUser().account,
        createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        description: values.description,
        labelStatus: values.labelStatus,
        dataSource: values.dataSource,
        detailRows: buildVersionDetailRows(record, values),
      }

      setRows(prev => prev.map(item => {
        if (item.id !== record.id) return item
        const existingVersions = getDatasetVersions(item).filter(version => version.version !== nextVersion.version)
        return {
          ...item,
          version: nextVersion.version,
          labelStatus: nextVersion.labelStatus,
          dataSource: nextVersion.dataSource,
          creator: nextVersion.creator,
          createdAt: nextVersion.createdAt,
          description: nextVersion.description,
          versions: [nextVersion, ...existingVersions],
        }
      }))
      setActiveVersion(nextVersion.version)
      setAddVersionOpen(false)
      setAddVersionFile(null)
      addVersionForm.resetFields()
    } catch {
      return
    }
  }

  const resetCreateState = () => {
    form.resetFields()
    setSelectedDataType('text')
    setSelectedAnnotationType('文本分类')
    setSelectedFile(null)
  }

  const submitCreate = async () => {
    try {
      const values = await form.validateFields()
      setRows(prev => [
        {
          id: `ml-dataset-${Date.now()}`,
          name: values.name,
          version: 'V1',
          dataType: values.dataType === 'image' ? '图片' : '文本',
          annotationType: values.annotationType,
          annotationTemplate: values.annotationTemplate,
          description: values.description,
          labelStatus: values.labelStatus === 'with-label' ? '有标注信息' : '无标注信息',
          dataSource: values.dataSource === 'notebook' ? 'Notebook 获取' : '本地上传',
          creator: getCurrentUser().account,
          createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        },
        ...prev,
      ])
      resetCreateState()
      navigate('/machine-data-management')
    } catch {
      return
    }
  }

  const deleteRecord = (id: string) => {
    const record = rows.find(item => item.id === id)
    const permission = getCreatorDeletePermission(record?.creator, 'machine')
    if (record && !permission.allowed) {
      Modal.warning({
        title: '无权删除该数据集',
        content: permission.reason,
      })
      return false
    }

    const locks = record ? getOnlineAnnotationServiceReferenceLocks(record.name, `${record.annotationType}/${record.name}-${record.version}`) : []
    if (record && locks.length) {
      Modal.warning({
        title: '数据集正在被引用，暂不可删除',
        content: formatResourceLockMessage(record.name, locks),
      })
      return false
    }

    setRows(prev => prev.filter(item => item.id !== id))
    return true
  }

  const deleteDetailRow = (record: MLDatasetRecord, row: MLDatasetDetailRow) => {
    Modal.confirm({
      title: '确认删除该条数据？',
      content: '删除后不可恢复，请确认是否继续。',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        const targetVersion = getActiveDatasetVersion(record, detailVersion)
        setRows(prev => prev.map(item => {
          if (item.id !== record.id) return item
          const versions = getDatasetVersions(item).map(version => (
            version.version === targetVersion.version
              ? { ...version, detailRows: version.detailRows.filter(detail => detail.key !== row.key) }
              : version
          ))
          return {
            ...item,
            detailRows: targetVersion.version === item.version ? versions.find(version => version.version === targetVersion.version)?.detailRows : item.detailRows,
            versions,
          }
        }))
      },
    })
  }

  const columns: ColumnsType<MLDatasetRecord> = [
    { title: '数据集名称', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '最新版本', dataIndex: 'version', key: 'version', width: 110 },
    { title: '数据类型', dataIndex: 'dataType', key: 'dataType', width: 110 },
    { title: '标注类型', dataIndex: 'annotationType', key: 'annotationType', width: 130 },
    { title: '标注模板', dataIndex: 'annotationTemplate', key: 'annotationTemplate', width: 150 },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 110 },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              const permission = getCreatorDeletePermission(record.creator, 'machine')
              if (!permission.allowed) {
                Modal.warning({ title: '权限不足', content: permission.reason })
                return
              }
              setActiveVersion(record.version)
              navigate(`/machine-data-management/${record.id}`)
            }}
          >
            查看详情
          </Button>
          <Popconfirm title="确认删除该数据集？" okText="删除" cancelText="取消" onConfirm={() => deleteRecord(record.id)}>
            <Button type="link" size="small" icon={<DeleteOutlined />} danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  if (isCreateRoute) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Space style={{ marginBottom: 16 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => { resetCreateState(); navigate('/machine-data-management') }}>返回</Button>
          <Title level={3} style={{ margin: 0 }}>创建数据集</Title>
        </Space>

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            version: 'V1',
            dataType: 'text',
            annotationType: '文本分类',
            annotationTemplate: '文本单标签',
            labelStatus: 'none',
            dataSource: 'local',
          }}
        >
          <Card title="基本信息" style={{ borderRadius: 12, marginBottom: 16 }}>
            <Form.Item label="数据集名称" name="name" rules={[{ required: true, message: '请输入数据集名称' }]}>
              <Input placeholder="请输入数据集名称" maxLength={64} showCount />
            </Form.Item>
            <Form.Item label="数据集版本" name="version">
              <Text>V1</Text>
            </Form.Item>
            <Form.Item label="描述" name="description">
              <Input.TextArea rows={4} placeholder="请输入训练数据集描述" maxLength={200} showCount />
            </Form.Item>
          </Card>

          <Card title="数据配置" style={{ borderRadius: 12, marginBottom: 16 }}>
            <Form.Item label="数据类型" name="dataType" rules={[{ required: true, message: '请选择数据类型' }]}>
              <Radio.Group
                options={dataTypes}
                onChange={event => {
                  const nextType = event.target.value as 'text' | 'image'
                  const nextAnnotationType = annotationTypesByDataType[nextType][0]
                  setSelectedDataType(nextType)
                  setSelectedAnnotationType(nextAnnotationType.value)
                  form.setFieldsValue({
                    annotationType: nextAnnotationType.value,
                    annotationTemplate: nextAnnotationType.templates[0],
                  })
                }}
              />
            </Form.Item>
            <Form.Item label="标注类型" name="annotationType" rules={[{ required: true, message: '请选择标注类型' }]}>
              <Radio.Group
                options={availableAnnotationTypes.map(item => ({ label: item.label, value: item.value }))}
                onChange={event => {
                  const nextAnnotationType = event.target.value
                  setSelectedAnnotationType(nextAnnotationType)
                  form.setFieldValue('annotationTemplate', annotationTypesByDataType[selectedDataType].find(item => item.value === nextAnnotationType)?.templates[0])
                }}
              />
            </Form.Item>
            <Form.Item label="标注模板" name="annotationTemplate" rules={[{ required: true, message: '请选择标注模板' }]}>
              <Radio.Group options={availableTemplates.map(item => ({ label: item, value: item }))} />
            </Form.Item>
            <Form.Item label="数据标注状态" name="labelStatus" rules={[{ required: true, message: '请选择数据标注状态' }]}>
              <Radio.Group
                options={[
                  { value: 'none', label: '无标注信息' },
                  { value: 'with-label', label: '有标注信息' },
                ]}
              />
            </Form.Item>
            <Form.Item label="数据来源" name="dataSource" rules={[{ required: true, message: '请选择数据来源' }]}>
              <Radio.Group
                options={[
                  { value: 'local', label: '本地上传' },
                  { value: 'notebook', label: 'Notebook 获取' },
                ]}
              />
            </Form.Item>
            <Form.Item label="上传数据">
              <ResumableUpload
                title="点击或拖拽文件到此区域上传"
                hint="支持文本、图片等机器学习任务数据格式，文件大小不设前端限制"
                value={selectedFile}
                onChange={setSelectedFile}
              />
            </Form.Item>
          </Card>

          <Space>
            <Button onClick={() => { resetCreateState(); navigate('/machine-data-management') }}>取消</Button>
            <Button type="primary" onClick={submitCreate}>确定</Button>
          </Space>
        </Form>
      </div>
    )
  }

  if (isDetailRoute) {
    if (!selectedDetailRecord) {
      return (
        <div style={{ padding: '28px 32px', minHeight: '100%' }}>
          <Card style={{ borderRadius: 12 }}>
            <Space direction="vertical">
              <Title level={3} style={{ margin: 0 }}>数据集不存在</Title>
              <Text type="secondary">当前机器学习数据集不存在或已被删除。</Text>
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/machine-data-management')}>返回列表</Button>
            </Space>
          </Card>
        </div>
      )
    }
    const detailPermission = getCreatorDeletePermission(selectedDetailRecord.creator, 'machine')
    if (!detailPermission.allowed) {
      return (
        <div style={{ padding: '64px 32px' }}>
          <Result
            status="403"
            title="权限不足"
            subTitle="当前账号仅可查看和操作个人机器学习数据；如需查看全部数据，请联系管理员授予对应角色的数据权限。"
            extra={<Button type="primary" onClick={() => navigate('/machine-data-management')}>返回列表</Button>}
          />
        </div>
      )
    }

    const versions = getDatasetVersions(selectedDetailRecord)
    const activeDatasetVersion = getActiveDatasetVersion(selectedDetailRecord, detailVersion)
    const detailRows = activeDatasetVersion.detailRows
    const datasetLabels = selectedDetailRecord.dataType === '图片'
      ? ['食品', '人物', '物体', '动物', '文字', '车辆']
      : ['正向', '负向', '中性', '实体']
    return (
      <div style={{ padding: '24px 32px', minHeight: '100%', background: '#f7f8fa' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/machine-data-management')}>返回</Button>
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => {
                const permission = getCreatorDeletePermission(selectedDetailRecord.creator, 'machine')
                if (!permission.allowed) {
                  Modal.warning({ title: '权限不足', content: permission.reason })
                  return
                }
                Modal.info({ title: '导出数据集', content: '已生成当前版本数据导出任务。' })
              }}
            >
              导出
            </Button>
            <Popconfirm title="确认删除该数据集？" okText="删除" cancelText="取消" onConfirm={() => { if (deleteRecord(selectedDetailRecord.id)) navigate('/machine-data-management') }}>
              <Button danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          </Space>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', gap: 16 }}>
          <Card style={{ borderRadius: 12, border: '1px solid #e5e7eb' }} styles={{ body: { padding: 14 } }}>
            <Button type="primary" block icon={<PlusOutlined />} style={{ height: 44, marginBottom: 16 }} onClick={() => openAddVersion(selectedDetailRecord)}>
              新增版本
            </Button>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {versions.map(version => (
                <Button
                  key={version.version}
                  block
                  type={activeDatasetVersion.version === version.version ? 'primary' : 'text'}
                  onClick={() => setActiveVersion(version.version)}
                  style={{ justifyContent: 'flex-start', height: 42 }}
                >
                  <Space direction="vertical" size={0} align="start">
                    <span>{version.version}</span>
                    <Text type="secondary" style={{ fontSize: 11 }}>{version.detailRows.length} 条样本</Text>
                  </Space>
                </Button>
              ))}
            </Space>
          </Card>

          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="基本信息" style={{ borderRadius: 12, border: '1px solid #e5e7eb' }}>
              {renderInfoGrid([
                { label: '数据集名称', value: selectedDetailRecord.name },
                { label: '当前版本', value: activeDatasetVersion.version },
                { label: '数据量', value: `${detailRows.length} 条` },
                { label: '数据类型', value: selectedDetailRecord.dataType },
                { label: '标注类型', value: selectedDetailRecord.annotationType },
                { label: '标注模板', value: selectedDetailRecord.annotationTemplate },
                { label: '数据标注状态', value: <Tag color={activeDatasetVersion.labelStatus === '有标注信息' ? 'green' : 'default'}>{activeDatasetVersion.labelStatus}</Tag> },
                { label: '数据来源', value: activeDatasetVersion.dataSource },
                { label: '标签', value: renderTagGroup(datasetLabels) },
                { label: '创建人', value: activeDatasetVersion.creator },
                { label: '创建时间', value: activeDatasetVersion.createdAt },
                { label: '描述', value: activeDatasetVersion.description || '-' },
              ])}
            </Card>

            <Card title="数据详情" style={{ borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <Table<MLDatasetDetailRow>
                rowKey="key"
                pagination={{ pageSize: 5, showTotal: total => `共 ${total} 条` }}
                columns={[
                  { title: '序号', key: 'index', width: 100, align: 'center', render: (_value, _row, index) => index + 1 },
                  {
                    title: selectedDetailRecord.dataType === '图片' ? '图片' : '数据内容',
                    key: 'content',
                    render: (_value, row) => renderDatasetSample(selectedDetailRecord, row),
                  },
                  { title: '标签', dataIndex: 'label', key: 'label', width: 240, render: renderDatasetLabels },
                  {
                    title: '操作',
                    key: 'action',
                    width: 100,
                    render: (_value, row) => (
                      <Button type="link" size="small" danger onClick={() => deleteDetailRow(selectedDetailRecord, row)}>
                        删除
                      </Button>
                    ),
                  },
                ]}
                dataSource={detailRows}
              />
            </Card>
          </Space>
        </div>

        <Modal
          title="新增版本"
          open={addVersionOpen}
          width={720}
          okText="提交"
          cancelText="取消"
          onOk={() => submitAddVersion(selectedDetailRecord)}
          onCancel={() => setAddVersionOpen(false)}
          destroyOnClose
        >
          <Form
            form={addVersionForm}
            layout="vertical"
            initialValues={{
              version: getNextVersionLabel(selectedDetailRecord),
              labelStatus: selectedDetailRecord.labelStatus,
              dataSource: selectedDetailRecord.dataSource,
            }}
          >
            <Form.Item label="新版本号" name="version" rules={[{ required: true, message: '请确认新版本号' }]}>
              <Input readOnly />
            </Form.Item>
            <Form.Item label="数据标注状态" name="labelStatus" rules={[{ required: true, message: '请选择数据标注状态' }]}>
              <Radio.Group
                options={[
                  { value: '无标注信息', label: '无标注信息' },
                  { value: '有标注信息', label: '有标注信息' },
                ]}
              />
            </Form.Item>
            <Form.Item label="数据来源" name="dataSource" rules={[{ required: true, message: '请选择数据来源' }]}>
              <Radio.Group
                options={[
                  { value: '本地上传', label: '本地上传' },
                  { value: 'Notebook 获取', label: 'Notebook 获取' },
                ]}
              />
            </Form.Item>
            <Form.Item label="上传数据">
              <ResumableUpload
                title="上传新版本数据"
                hint="提交后将生成新版本并自动切换到该版本；当前为本地 mock 闭环。"
                value={addVersionFile}
                onChange={setAddVersionFile}
              />
            </Form.Item>
            <Form.Item label="描述" name="description">
              <Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入新版本描述" />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Title level={3} style={{ marginBottom: 4 }}>数据管理</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
          管理和创建用于机器学习的数据集，支持数据查看、导入导出和删除等操作。
        </Text>
        <Card style={{ borderRadius: 12, border: '1px solid #e5e7eb' }}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
            <Space wrap>
              <Input
                prefix={<SearchOutlined />}
                placeholder="搜索数据集名称"
                value={searchValue}
                onChange={event => setSearchValue(event.target.value)}
                style={{ width: 220 }}
              />
              <Text>标注类型：</Text>
              <Select
                value={annotationTypeFilter}
                onChange={value => setAnnotationTypeFilter(value)}
                style={{ width: 160 }}
                options={[
                  { value: '全部', label: '全部' },
                  { value: '图像分类', label: '图像分类' },
                  { value: '图像分割', label: '图像分割' },
                  { value: '物体检测', label: '物体检测' },
                  { value: '文本分类', label: '文本分类' },
                  { value: '实体识别', label: '实体识别' },
                ]}
              />
              <Button type="primary" icon={<SearchOutlined />}>搜索</Button>
              <Button onClick={() => { setAnnotationTypeFilter('全部'); setSearchValue('') }}>重置</Button>
            </Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/machine-data-management/create')}>
              创建数据集
            </Button>
          </Space>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredRows}
            pagination={{ pageSize: 20, showTotal: total => `共 ${total} 条记录` }}
          />
        </Card>
      </div>

    </>
  )
}

export default MLDataset
