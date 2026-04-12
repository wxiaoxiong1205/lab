import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Upload, Button, Typography, Space, Divider, List, Descriptions } from 'antd'
import { AppstoreOutlined, PlusOutlined, UploadOutlined, CheckCircleOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'
import type { UploadFile } from 'antd/es/upload/interface'

const { Text } = Typography

// 数据类型选项
const dataTypes = [
  { value: 'image', label: '图像', description: '支持图片分类、检测、分割等任务' },
  { value: 'text', label: '文本', description: '支持文本分类、NER等任务' },
  { value: 'audio', label: '音频', description: '支持语音识别等任务' },
]

// 标注类型选项（根据数据类型动态显示）
const annotationTypesByDataType: Record<string, Array<{ value: string; label: string; template: string }>> = {
  image: [
    { value: 'image_classification', label: '图像分类', template: 'ImageNet分类模板' },
    { value: 'object_detection', label: '物体检测', template: '矩阵框标注' },
    { value: 'semantic_segmentation', label: '语义分割', template: '多边形标注' },
    { value: 'instance_segmentation', label: '实例分割', template: '实例分割模板' },
  ],
  text: [
    { value: 'text_classification_single', label: '文本分类（单标签）', template: '短文本单标签' },
    { value: 'text_classification_multi', label: '文本分类（多标签）', template: '短文本多标签' },
    { value: 'entity_recognition', label: '实体识别', template: '通用NER模板' },
  ],
  audio: [
    { value: 'speech_recognition', label: '语音识别', template: '语音转文字模板' },
  ],
}

// 标注模板选项
const templates = [
  { value: 'imagenet', label: 'ImageNet分类模板' },
  { value: 'coco_detection', label: 'COCO检测模板' },
  { value: 'ner_general', label: '通用NER模板' },
  { value: 'sentiment_binary', label: '二元情感模板' },
  { value: 'sentiment_triplet', label: '三元组情感模板' },
  { value: 'custom', label: '自定义模板' },
]

const mockData = [
  { id: '1', name: '测试测试测试测试测', version: 'v1', dataType: '文本', annotationType: '文本分类', annotationTemplate: '短文本单标签', createdAt: '2026/03/10 09:00:00' },
  { id: '2', name: '图像分类-无标注-1', version: 'v3', dataType: '图片', annotationType: '图像分类', annotationTemplate: '单图单标签', createdAt: '2026/03/15 14:00:00' },
  { id: '3', name: '图像分割-无标注-1', version: 'v3', dataType: '图片', annotationType: '图像分割', annotationTemplate: '实例分割', createdAt: '2026/03/18 11:00:00' },
  { id: '4', name: '物体检测-无标注-1', version: 'v1', dataType: '图片', annotationType: '物体检测', annotationTemplate: '矩阵框标注', createdAt: '2026/03/20 10:00:00' },
]

const MLDataset: React.FC = () => {
  const [data] = useState(mockData)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<typeof mockData[0] | null>(null)
  const [form] = Form.useForm()
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<UploadFile | null>(null)
  const [selectedDataType, setSelectedDataType] = useState<string | null>(null)
  const [filterAnnotationType, setFilterAnnotationType] = useState<string>('')

  const handleOpenCreate = () => {
    form.resetFields()
    setSelectedFile(null)
    setSelectedDataType(null)
    setCreateModalVisible(true)
  }

  const handleOpenDetail = (record: typeof mockData[0]) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  const handleDataTypeChange = (value: string) => {
    setSelectedDataType(value)
    form.setFieldValue('annotationType', undefined)
    form.setFieldValue('annotationTemplate', undefined)
  }

  const handleFileChange = (info: any) => {
    const file = info.file
    if (file.status === 'uploading') {
      setUploading(true)
      let progress = 0
      const timer = setInterval(() => {
        progress += 10
        if (progress >= 100) {
          clearInterval(timer)
          setUploading(false)
          setSelectedFile({
            uid: file.uid,
            name: file.name,
            status: 'done',
          } as UploadFile)
          message.success(`${file.name} 上传成功`)
        }
      }, 200)
    } else if (file.status === 'done') {
      setUploading(false)
    } else if (file.status === 'error') {
      setUploading(false)
      message.error(`${file.name} 上传失败`)
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('创建机器学习数据集:', values)
      message.success('创建成功')
      setCreateModalVisible(false)
      form.resetFields()
      setSelectedFile(null)
      setSelectedDataType(null)
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()
    setSelectedFile(null)
    setSelectedDataType(null)
  }

  const annotationTypes = selectedDataType ? annotationTypesByDataType[selectedDataType] || [] : []
  const filteredData = filterAnnotationType
    ? data.filter(item => item.annotationType === filterAnnotationType)
    : data

  return (
    <>
      <SharedListPage
        title="机器学习数据管理"
        titleIcon={<AppstoreOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="管理和创建用于机器学习的数据集，支持数据查看、导入导出和删除等操作"
        searchPlaceholder="搜索数据集名称"
        searchField="name"
        columns={[
          { title: '数据集名称', dataIndex: 'name', key: 'name' },
          { title: '最新版本', dataIndex: 'version', key: 'version' },
          { title: '数据类型', dataIndex: 'dataType', key: 'dataType' },
          { title: '标注类型', dataIndex: 'annotationType', key: 'annotationType' },
          { title: '标注模板', dataIndex: 'annotationTemplate', key: 'annotationTemplate' },
          { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
        ]}
        dataSource={filteredData}
        createButtonText="创建数据集"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无数据集"
        actionButtons={[
          { label: '查看详情', onClick: handleOpenDetail },
          { label: '删除', danger: true, onClick: () => message.success('删除成功') },
        ]}
      />

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <PlusOutlined style={{ color: '#fff', fontSize: 16 }} />
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
            <Button type="primary" onClick={handleSubmit} style={{ background: '#4f46e5' }}>
              创建
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Divider orientation="horizontal" plain style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: 12 }}>
            基本信息
          </Divider>

          <Form.Item
            label="数据集名称"
            name="name"
            rules={[
              { required: true, message: '请输入数据集名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,64}$/, message: '支持中英文、数字、下划线、中划线，2-64字符' }
            ]}
          >
            <Input placeholder="请输入数据集名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="请输入数据集描述（可选）" maxLength={200} showCount />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            数据配置
          </Divider>

          <Form.Item
            label="数据类型"
            name="dataType"
            rules={[{ required: true, message: '请选择数据类型' }]}
          >
            <Select
              placeholder="请选择数据类型"
              onChange={handleDataTypeChange}
            >
              {dataTypes.map(dt => (
                <Select.Option key={dt.value} value={dt.value}>
                  <div>
                    <div>{dt.label}</div>
                    <Text type="secondary" style={{ fontSize: 11 }}>{dt.description}</Text>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="标注类型"
            name="annotationType"
            rules={[{ required: true, message: '请选择标注类型' }]}
          >
            <Select
              placeholder="请先选择数据类型"
              disabled={!selectedDataType}
            >
              {annotationTypes.map(at => (
                <Select.Option key={at.value} value={at.value}>{at.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="标注模板"
            name="annotationTemplate"
            rules={[{ required: true, message: '请选择标注模板' }]}
          >
            <Select placeholder="请选择标注模板">
              {templates.map(t => (
                <Select.Option key={t.value} value={t.label}>{t.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            数据上传
          </Divider>

          <Form.Item
            label="上传数据"
            name="file"
            style={{ marginBottom: 8 }}
          >
            <Upload.Dragger
              name="file"
              multiple={false}
              showUploadList={false}
              customRequest={({ file, onSuccess }: any) => {
                setTimeout(() => onSuccess?.('ok'), 100)
              }}
              onChange={handleFileChange}
              disabled={uploading}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined style={{ fontSize: 40, color: '#94a3b8' }} />
              </p>
              <p className="ant-upload-text" style={{ color: '#64748b' }}>
                点击或拖拽文件到此区域上传
              </p>
              <p className="ant-upload-hint" style={{ color: '#94a3b8' }}>
                支持图片文件（jpg、png）、文本文件（txt、json）、音频文件（wav、mp3）等
              </p>
            </Upload.Dragger>
          </Form.Item>

          {selectedFile && (
            <List
              size="small"
              bordered
              dataSource={[selectedFile]}
              renderItem={(item: UploadFile) => (
                <List.Item
                  style={{ background: '#f8fafc' }}
                  actions={[
                    <Button type="link" danger size="small" onClick={() => setSelectedFile(null)}>删除</Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />}
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
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AppstoreOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>数据集详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={640}
        footer={
          <Button onClick={handleCloseDetail}>关闭</Button>
        }
      >
        {selectedRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="数据集名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="最新版本">{selectedRecord.version}</Descriptions.Item>
            <Descriptions.Item label="数据类型">{selectedRecord.dataType}</Descriptions.Item>
            <Descriptions.Item label="标注类型" span={2}>{selectedRecord.annotationType}</Descriptions.Item>
            <Descriptions.Item label="标注模板" span={2}>{selectedRecord.annotationTemplate}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default MLDataset
