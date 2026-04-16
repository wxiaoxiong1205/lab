import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  List,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  Upload,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { UploadFile } from 'antd/es/upload/interface'
import { AppstoreOutlined, PlusOutlined, UploadOutlined, CheckCircleOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

type MLDatasetRecord = {
  id: string
  name: string
  version: string
  dataType: string
  annotationType: string
  annotationTemplate: string
  createdAt: string
}

const dataTypes = [
  { value: 'image', label: '图片', description: '支持图片分类、检测、分割等任务' },
  { value: 'text', label: '文本', description: '支持文本分类、实体识别等任务' },
  { value: 'audio', label: '音频', description: '支持语音识别等任务' },
]

const annotationTypesByDataType: Record<string, Array<{ value: string; label: string; template: string }>> = {
  image: [
    { value: 'image_classification', label: '图像分类', template: '单图单标签' },
    { value: 'object_detection', label: '物体检测', template: '矩阵框标注' },
    { value: 'image_segmentation', label: '图像分割', template: '实例分割' },
  ],
  text: [
    { value: 'text_classification', label: '文本分类', template: '文本单标签' },
    { value: 'entity_recognition', label: '实体识别', template: '文本实体识别' },
  ],
  audio: [
    { value: 'speech_recognition', label: '语音识别', template: '语音转文字模板' },
  ],
}

const datasetRows: MLDatasetRecord[] = [
  { id: '1', name: '图像分类-多-1', version: 'V3', dataType: '图片', annotationType: '图像分类', annotationTemplate: '单图多标签', createdAt: '2026/03/10 09:00:00' },
  { id: '2', name: 'basion-文本实体识别', version: 'V2', dataType: '文本', annotationType: '实体识别', annotationTemplate: '文本实体识别', createdAt: '2026/03/08 14:30:00' },
  { id: '3', name: 'basion-文本分类-多标签-无标注', version: 'V2', dataType: '文本', annotationType: '文本分类', annotationTemplate: '文本多标签', createdAt: '2026/03/05 11:00:00' },
  { id: '4', name: 'basion-文本分类-单标签-无标注', version: 'V2', dataType: '文本', annotationType: '文本分类', annotationTemplate: '文本单标签', createdAt: '2026/03/03 11:20:00' },
  { id: '5', name: 'basion-图像分类-单标签-无标注', version: 'V2', dataType: '图片', annotationType: '图像分类', annotationTemplate: '单图单标签', createdAt: '2026/03/02 15:45:00' },
  { id: '6', name: 'basion-图像分割-实例分割-无标注', version: 'V1', dataType: '图片', annotationType: '图像分割', annotationTemplate: '实例分割', createdAt: '2026/03/01 09:10:00' },
]

const MLDataset: React.FC = () => {
  const [form] = Form.useForm()
  const [createOpen, setCreateOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<MLDatasetRecord | null>(null)
  const [annotationTypeFilter, setAnnotationTypeFilter] = useState<string>('全部')
  const [searchValue, setSearchValue] = useState('')
  const [selectedDataType, setSelectedDataType] = useState<string>()
  const [selectedFile, setSelectedFile] = useState<UploadFile | null>(null)
  const [uploading, setUploading] = useState(false)

  const filteredRows = useMemo(
    () =>
      datasetRows.filter(item => {
        const matchType = annotationTypeFilter === '全部' || item.annotationType === annotationTypeFilter
        const matchSearch = !searchValue || item.name.toLowerCase().includes(searchValue.toLowerCase())
        return matchType && matchSearch
      }),
    [annotationTypeFilter, searchValue],
  )

  const availableAnnotationTypes = selectedDataType ? annotationTypesByDataType[selectedDataType] ?? [] : []

  const columns: ColumnsType<MLDatasetRecord> = [
    { title: '数据集名称', dataIndex: 'name', key: 'name' },
    { title: '最新版本', dataIndex: 'version', key: 'version', width: 90 },
    { title: '数据类型', dataIndex: 'dataType', key: 'dataType', width: 100 },
    { title: '标注类型', dataIndex: 'annotationType', key: 'annotationType', width: 120 },
    { title: '标注模板', dataIndex: 'annotationTemplate', key: 'annotationTemplate', width: 140 },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>查看详情</Button>
          <Button type="link" size="small" danger>删除</Button>
        </Space>
      ),
    },
  ]

  const handleFileChange = (info: any) => {
    const file = info.file
    if (file.status === 'uploading') {
      setUploading(true)
      window.setTimeout(() => {
        setUploading(false)
        setSelectedFile({
          uid: file.uid,
          name: file.name,
          status: 'done',
        } as UploadFile)
      }, 400)
    }
  }

  const submitCreate = async () => {
    try {
      await form.validateFields()
      setCreateOpen(false)
      form.resetFields()
      setSelectedDataType(undefined)
      setSelectedFile(null)
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>数据管理</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            管理和创建用于机器学习的数据集，支持数据查看、导入导出和删除等操作。
          </Text>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <Space>
              <Select
                value={annotationTypeFilter}
                onChange={value => setAnnotationTypeFilter(value)}
                style={{ width: 180 }}
                options={[
                  { value: '全部', label: '全部' },
                  { value: '图像分类', label: '图像分类' },
                  { value: '图像分割', label: '图像分割' },
                  { value: '物体检测', label: '物体检测' },
                  { value: '文本分类', label: '文本分类' },
                  { value: '实体识别', label: '实体识别' },
                ]}
              />
              <Input
                placeholder="搜索"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                style={{ width: 220 }}
              />
              <Button>搜索</Button>
              <Button onClick={() => { setAnnotationTypeFilter('全部'); setSearchValue('') }}>重置</Button>
            </Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              创建数据集
            </Button>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredRows}
            pagination={{ pageSize: 20, showTotal: total => `共 ${total} 条记录` }}
          />
        </Card>
      </div>

      <Modal
        title="创建数据集"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        width={720}
        footer={
          <Space>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitCreate}>创建</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Divider>基本信息</Divider>

          <Form.Item label="数据集名称" name="name" rules={[{ required: true, message: '请输入数据集名称' }]}>
            <Input placeholder="请输入数据集名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="请输入数据集描述（可选）" maxLength={200} showCount />
          </Form.Item>

          <Divider>数据配置</Divider>

          <Form.Item label="数据类型" name="dataType" rules={[{ required: true, message: '请选择数据类型' }]}>
            <Select
              placeholder="请选择数据类型"
              onChange={value => {
                setSelectedDataType(value)
                form.setFieldValue('annotationType', undefined)
                form.setFieldValue('annotationTemplate', undefined)
              }}
            >
              {dataTypes.map(item => (
                <Select.Option key={item.value} value={item.value}>
                  <div>
                    <div>{item.label}</div>
                    <Text type="secondary" style={{ fontSize: 11 }}>{item.description}</Text>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="标注类型" name="annotationType" rules={[{ required: true, message: '请选择标注类型' }]}>
            <Select placeholder="请先选择数据类型" disabled={!selectedDataType}>
              {availableAnnotationTypes.map(item => (
                <Select.Option key={item.value} value={item.label}>{item.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="标注模板" name="annotationTemplate" rules={[{ required: true, message: '请选择标注模板' }]}>
            <Select placeholder="请选择标注模板">
              {availableAnnotationTypes.map(item => (
                <Select.Option key={`${item.value}-template`} value={item.template}>{item.template}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Divider>数据上传</Divider>

          <Form.Item label="上传数据" name="file">
            <Upload.Dragger
              showUploadList={false}
              customRequest={({ onSuccess }: any) => window.setTimeout(() => onSuccess?.('ok'), 100)}
              onChange={handleFileChange}
              disabled={uploading}
            >
              <p><UploadOutlined style={{ fontSize: 38, color: '#3b82f6' }} /></p>
              <p>点击或拖拽文件到此区域上传</p>
              <p style={{ color: '#94a3b8' }}>支持图片、文本、音频等机器学习任务数据格式</p>
            </Upload.Dragger>
          </Form.Item>

          {selectedFile && (
            <List
              size="small"
              bordered
              dataSource={[selectedFile]}
              renderItem={(item: UploadFile) => (
                <List.Item actions={[<Button type="link" danger size="small" onClick={() => setSelectedFile(null)}>删除</Button>]}>
                  <List.Item.Meta
                    avatar={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                    title={item.name}
                    description="上传完成"
                  />
                </List.Item>
              )}
            />
          )}
        </Form>
      </Modal>

      <Modal
        title="数据集详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
      >
        {detailRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="数据集名称" span={2}>{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="最新版本">{detailRecord.version}</Descriptions.Item>
            <Descriptions.Item label="数据类型">{detailRecord.dataType}</Descriptions.Item>
            <Descriptions.Item label="标注类型" span={2}>{detailRecord.annotationType}</Descriptions.Item>
            <Descriptions.Item label="标注模板" span={2}>{detailRecord.annotationTemplate}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default MLDataset
