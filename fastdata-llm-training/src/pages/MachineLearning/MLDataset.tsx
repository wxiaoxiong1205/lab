import React, { useMemo, useState } from 'react'
import { ArrowLeftOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import { useLocation, useNavigate } from 'react-router-dom'
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

const MLDataset: React.FC = () => {
  const [form] = Form.useForm<MLDatasetFormValues>()
  const location = useLocation()
  const navigate = useNavigate()
  const isCreateRoute = location.pathname === '/machine-data-management/create'
  const [rows, setRows] = useState<MLDatasetRecord[]>(initialDatasetRows)
  const [detailRecord, setDetailRecord] = useState<MLDatasetRecord | null>(null)
  const [annotationTypeFilter, setAnnotationTypeFilter] = useState<string>('全部')
  const [searchValue, setSearchValue] = useState('')
  const [selectedDataType, setSelectedDataType] = useState<'text' | 'image'>('text')
  const [selectedAnnotationType, setSelectedAnnotationType] = useState('文本分类')
  const [selectedFile, setSelectedFile] = useState<UploadFile | null>(null)

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
    const permission = getCreatorDeletePermission(record?.creator)
    if (record && !permission.allowed) {
      Modal.warning({
        title: '无权删除该数据集',
        content: permission.reason,
      })
      return
    }

    const locks = record ? getOnlineAnnotationServiceReferenceLocks(record.name, `${record.annotationType}/${record.name}-${record.version}`) : []
    if (record && locks.length) {
      Modal.warning({
        title: '数据集正在被引用，暂不可删除',
        content: formatResourceLockMessage(record.name, locks),
      })
      return
    }

    setRows(prev => prev.filter(item => item.id !== id))
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
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailRecord(record)}>查看详情</Button>
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
                hint="支持文本、图片等机器学习任务数据格式"
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

      <Modal title="数据集详情" open={Boolean(detailRecord)} onCancel={() => setDetailRecord(null)} footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>} width={720}>
        {detailRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="数据集名称" span={2}>{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="最新版本">{detailRecord.version}</Descriptions.Item>
            <Descriptions.Item label="数据类型">{detailRecord.dataType}</Descriptions.Item>
            <Descriptions.Item label="标注类型">{detailRecord.annotationType}</Descriptions.Item>
            <Descriptions.Item label="标注模板">{detailRecord.annotationTemplate}</Descriptions.Item>
            <Descriptions.Item label="数据标注状态">{detailRecord.labelStatus}</Descriptions.Item>
            <Descriptions.Item label="数据来源">{detailRecord.dataSource}</Descriptions.Item>
            <Descriptions.Item label="创建人">{detailRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>{detailRecord.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default MLDataset
