import React, { useMemo, useState } from 'react'
import { ArrowLeftOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Card, Descriptions, Form, Input, Modal, Popconfirm, Radio, Select, Space, Table, Tabs, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useLocation, useNavigate } from 'react-router-dom'
import { formatResourceLockMessage, getModelReferenceLocks } from '../../services/resourceReferenceGuard'
import ResumableUpload from '../../components/ResumableUpload'

const { Title, Text } = Typography

type MLModelFormValues = {
  name: string
  description?: string
  modelType: 'text' | 'image'
  annotationType: string
  taskType: string
  source: 'local' | 'notebook'
  weightFile?: string | { name?: string }
  tokenizer?: string | { name?: string }
  network?: string
}

type MLModelRecord = {
  id: string
  name: string
  version: string
  versionCount: number
  modelType: '文本' | '图片'
  annotationType: string
  taskType: string
  source: '本地上传' | 'Notebook 获取'
  weightFile: string
  tokenizer?: string
  network?: string
  description?: string
  createdAt: string
}

const modelOptionsByType: Record<string, Array<{ value: string; label: string; taskTypes: string[] }>> = {
  text: [
    { value: '文本分类', label: '文本分类', taskTypes: ['文本单标签', '文本多标签'] },
    { value: '实体识别', label: '实体识别', taskTypes: ['文本实体识别'] },
  ],
  image: [
    { value: '图像分类', label: '图像分类', taskTypes: ['单图单标签', '单图多标签'] },
    { value: '图像分割', label: '图像分割', taskTypes: ['实例分割'] },
    { value: '物体检测', label: '物体检测', taskTypes: ['矩阵框标注'] },
  ],
}

const initialModels: MLModelRecord[] = [
  { id: '1', name: '111', version: 'V1', versionCount: 1, modelType: '文本', annotationType: '文本分类', taskType: '文本单标签', source: 'Notebook 获取', weightFile: 'notebook://ml-nb-1/model.pt', tokenizer: 'notebook://ml-nb-1/tokenizer.json', network: 'TextClassifier', createdAt: '2026-04-22 15:11:38' },
  { id: '2', name: 'basion-文本分类-单标签', version: 'V1', versionCount: 1, modelType: '文本', annotationType: '文本分类', taskType: '文本单标签', source: 'Notebook 获取', weightFile: 'notebook://ml-nb-2/model.pt', tokenizer: 'notebook://ml-nb-2/tokenizer.json', network: 'BertClassifier', createdAt: '2026-04-15 09:35:59' },
  { id: '3', name: '测试数据001_hzj', version: 'V1', versionCount: 1, modelType: '文本', annotationType: '实体识别', taskType: '文本实体识别', source: '本地上传', weightFile: 'ner-model.pt', tokenizer: 'tokenizer.json', network: 'CRF-NER', createdAt: '2026-04-14 17:43:06' },
  { id: '4', name: 'hzj_图片分类多标签', version: 'V1', versionCount: 1, modelType: '图片', annotationType: '图像分类', taskType: '单图多标签', source: 'Notebook 获取', weightFile: 'notebook://vision-lab/resnet.pt', network: 'ResNet50', createdAt: '2026-04-13 15:17:32' },
  { id: '5', name: 'basion-图像分类-单标签', version: 'V1', versionCount: 1, modelType: '图片', annotationType: '图像分类', taskType: '单图单标签', source: '本地上传', weightFile: 'image-classifier.pt', network: 'ConvNeXt-Tiny', createdAt: '2026-04-10 10:00:00' },
]

function normalizeUploadFileName(value: unknown): string | undefined {
  if (!value) {
    return undefined
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'object' && 'name' in value) {
    return String((value as { name?: string }).name ?? '')
  }
  return undefined
}

const MLModelManagement: React.FC = () => {
  const [form] = Form.useForm<MLModelFormValues>()
  const location = useLocation()
  const navigate = useNavigate()
  const isCreateRoute = location.pathname === '/machine-model-management/create'
  const [models, setModels] = useState<MLModelRecord[]>(initialModels)
  const [searchValue, setSearchValue] = useState('')
  const [detailRecord, setDetailRecord] = useState<MLModelRecord | null>(null)
  const [selectedModelType, setSelectedModelType] = useState<'text' | 'image'>('text')
  const [selectedAnnotationType, setSelectedAnnotationType] = useState('文本分类')
  const [selectedSource, setSelectedSource] = useState<'local' | 'notebook'>('notebook')

  const filteredModels = useMemo(
    () => models.filter(item => !searchValue || item.name.toLowerCase().includes(searchValue.toLowerCase())),
    [models, searchValue],
  )
  const annotationOptions = modelOptionsByType[selectedModelType]
  const taskTypeOptions = annotationOptions.find(item => item.value === selectedAnnotationType)?.taskTypes ?? []

  const resetCreateState = () => {
    form.resetFields()
    setSelectedModelType('text')
    setSelectedAnnotationType('文本分类')
    setSelectedSource('notebook')
  }

  const submitCreate = async () => {
    try {
      const values = await form.validateFields()
      setModels(prev => [
        {
          id: `ml-model-${Date.now()}`,
          name: values.name,
          version: 'V1',
          versionCount: 1,
          modelType: values.modelType === 'image' ? '图片' : '文本',
          annotationType: values.annotationType,
          taskType: values.taskType,
          source: values.source === 'local' ? '本地上传' : 'Notebook 获取',
          weightFile: normalizeUploadFileName(values.weightFile) || (values.source === 'local' ? 'model.pt' : 'notebook://请选择 Notebook/model.pt'),
          tokenizer: normalizeUploadFileName(values.tokenizer),
          network: values.network,
          description: values.description,
          createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
        },
        ...prev,
      ])
      resetCreateState()
      navigate('/machine-model-management')
    } catch {
      return
    }
  }

  const columns: ColumnsType<MLModelRecord> = [
    { title: '模型名称', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '版本数量', dataIndex: 'versionCount', key: 'versionCount', width: 160 },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailRecord(record)}>查看详情</Button>
          <Popconfirm
            title="确认删除该模型？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => {
              const locks = getModelReferenceLocks(record.name)
              if (locks.length) {
                Modal.warning({
                  title: '模型正在被引用，暂不可删除',
                  content: formatResourceLockMessage(record.name, locks),
                })
                return
              }

              setModels(prev => prev.filter(item => item.id !== record.id))
            }}
          >
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
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => { resetCreateState(); navigate('/machine-model-management') }}>返回</Button>
          <Title level={3} style={{ margin: 0 }}>创建模型</Title>
        </Space>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            modelType: 'text',
            annotationType: '文本分类',
            taskType: '文本单标签',
            source: 'notebook',
          }}
        >
          <Card title="基本信息" style={{ borderRadius: 12, marginBottom: 16 }}>
            <Form.Item label="模型名称" name="name" rules={[{ required: true, message: '请输入模型名称' }]}>
              <Input placeholder="请输入模型名称" maxLength={64} showCount />
            </Form.Item>
            <Form.Item label="模型版本">
              <Text>V1</Text>
            </Form.Item>
            <Form.Item label="模型描述" name="description">
              <Input.TextArea rows={4} placeholder="请输入模型描述，200字符以内" maxLength={200} showCount />
            </Form.Item>
          </Card>

          <Card title="模型配置" style={{ borderRadius: 12, marginBottom: 16 }}>
            <Form.Item label="模型类型" name="modelType" rules={[{ required: true, message: '请选择模型类型' }]}>
              <Radio.Group
                options={[
                  { value: 'text', label: '文本' },
                  { value: 'image', label: '图片' },
                ]}
                onChange={event => {
                  const nextType = event.target.value as 'text' | 'image'
                  const nextAnnotationType = modelOptionsByType[nextType][0]
                  setSelectedModelType(nextType)
                  setSelectedAnnotationType(nextAnnotationType.value)
                  form.setFieldsValue({
                    annotationType: nextAnnotationType.value,
                    taskType: nextAnnotationType.taskTypes[0],
                  })
                }}
              />
            </Form.Item>
            <Form.Item label="标注类型" name="annotationType" rules={[{ required: true, message: '请选择标注类型' }]}>
              <Radio.Group
                options={annotationOptions.map(item => ({ value: item.value, label: item.label }))}
                onChange={event => {
                  const nextAnnotationType = event.target.value
                  setSelectedAnnotationType(nextAnnotationType)
                  form.setFieldValue('taskType', annotationOptions.find(item => item.value === nextAnnotationType)?.taskTypes[0])
                }}
              />
            </Form.Item>
            <Form.Item label="任务类型" name="taskType" rules={[{ required: true, message: '请选择任务类型' }]}>
              <Radio.Group options={taskTypeOptions.map(item => ({ value: item, label: item }))} />
            </Form.Item>
            <Form.Item label="模型来源" name="source" rules={[{ required: true, message: '请选择模型来源' }]}>
              <Radio.Group
                options={[
                  { value: 'local', label: '本地上传' },
                  { value: 'notebook', label: 'Notebook 获取' },
                ]}
                onChange={event => setSelectedSource(event.target.value)}
              />
            </Form.Item>
            <Form.Item label="权重文件" name="weightFile" rules={[{ required: selectedSource === 'local', message: '请输入或选择权重文件' }]}>
              {selectedSource === 'notebook' ? (
                <Select
                  placeholder="请选择 Notebook，再展开选择 .pt 文件"
                  options={[
                    { value: 'notebook://ml-nb-1/model.pt', label: 'ML-Notebook-1 / model.pt' },
                    { value: 'notebook://vision-lab/resnet.pt', label: 'Vision-Lab / resnet.pt' },
                  ]}
                />
              ) : (
                <ResumableUpload
                  accept=".pt,.pth,.onnx,.pkl"
                  title="点击或拖拽权重文件到此区域上传"
                  hint="支持 .pt/.pth/.onnx/.pkl 等模型权重文件；失败或取消后可继续上传"
                />
              )}
            </Form.Item>
            <Form.Item label="分词器" name="tokenizer">
              {selectedSource === 'notebook' ? (
                <Select
                  placeholder="请选择权重文件所在 Notebook 的分词器"
                  options={[
                    { value: 'notebook://ml-nb-1/tokenizer.json', label: 'ML-Notebook-1 / tokenizer.json' },
                    { value: 'notebook://ml-nb-2/tokenizer.json', label: 'ML-Notebook-2 / tokenizer.json' },
                  ]}
                />
              ) : (
                <ResumableUpload
                  accept=".json,.txt,.model"
                  title="点击或拖拽分词器文件到此区域上传"
                  hint="支持 tokenizer.json 等分词器文件；失败或取消后可继续上传"
                />
              )}
            </Form.Item>
            <Form.Item label="网络结构" name="network">
              <Input placeholder="请输入网络结构" />
            </Form.Item>
          </Card>

          <Space>
            <Button onClick={() => { resetCreateState(); navigate('/machine-model-management') }}>取消</Button>
            <Button type="primary" onClick={submitCreate}>确定</Button>
          </Space>
        </Form>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Title level={3} style={{ marginBottom: 16 }}>模型管理</Title>
        <Card style={{ borderRadius: 12, border: '1px solid #e5e7eb' }}>
          <Tabs
            activeKey="mine"
            items={[{ key: 'mine', label: '我的模型' }]}
            tabBarExtraContent={
              <Space>
                <Input prefix={<SearchOutlined />} placeholder="按名称搜索" value={searchValue} onChange={event => setSearchValue(event.target.value)} style={{ width: 220 }} />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/machine-model-management/create')}>创建模型</Button>
              </Space>
            }
          />
          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredModels}
            pagination={{ pageSize: 10, showTotal: total => `第 1-${total} 条，共 ${total} 条` }}
          />
        </Card>
      </div>

      <Modal title="模型详情" open={Boolean(detailRecord)} onCancel={() => setDetailRecord(null)} footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>} width={760}>
        {detailRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="模型名称" span={2}>{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="模型版本">{detailRecord.version}</Descriptions.Item>
            <Descriptions.Item label="版本数量">{detailRecord.versionCount}</Descriptions.Item>
            <Descriptions.Item label="模型类型">{detailRecord.modelType}</Descriptions.Item>
            <Descriptions.Item label="标注类型">{detailRecord.annotationType}</Descriptions.Item>
            <Descriptions.Item label="任务类型">{detailRecord.taskType}</Descriptions.Item>
            <Descriptions.Item label="模型来源">{detailRecord.source}</Descriptions.Item>
            <Descriptions.Item label="权重文件" span={2}>{detailRecord.weightFile}</Descriptions.Item>
            <Descriptions.Item label="分词器" span={2}>{detailRecord.tokenizer || '-'}</Descriptions.Item>
            <Descriptions.Item label="网络结构" span={2}>{detailRecord.network || '-'}</Descriptions.Item>
            <Descriptions.Item label="模型描述" span={2}>{detailRecord.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default MLModelManagement
