import React, { useState } from 'react'
import { Alert, Button, Card, Col, Descriptions, Divider, Form, Input, Layout, Modal, Radio, Row, Select, Space, Spin, Switch, Table, Tag, Tooltip, Typography, Upload, message } from 'antd'
import { ArrowLeftOutlined, DatabaseOutlined, DownloadOutlined, FileTextOutlined, InboxOutlined, PlusOutlined, RocketOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { RcFile, UploadProps } from 'antd/es/upload'
import { DescriptionTextArea } from '@/components/common/DescriptionTextArea.tsx'
import { datasetDirectoryApi } from '@/services/api'
import { trainingDatasetService } from '@/services/trainingApi'

const { Title, Text } = Typography
const { Sider, Content } = Layout
const { Option } = Select
const { Dragger } = Upload
interface CreateDatasetVersionModalProps {
  visible: boolean
  onCancel: () => void
  onSubmit: (values: any) => void
  projectId: string
  datasetId: string
  datasetInfo: any
}
// 新增数据集版本Modal组件
const CreateDatasetVersionModal: React.FC<CreateDatasetVersionModalProps> = ({ visible, onCancel, onSubmit, datasetInfo }) => {
  const [form] = Form.useForm()
  const [inheritFromHistory, setInheritFromHistory] = useState(true)
  const [selectedHistoryVersion, setSelectedHistoryVersion] = useState<string>('')
  const [dataSource, setDataSource] = useState<string>('upload')
  const [dataUrl, setDataUrl] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  // 计算新版本号
  const calculateNewVersion = () => {
    const currentVersions = [1, 2, 3, 4, 5] // 模拟数据，实际应该从API获取
    const maxVersion = Math.max(...currentVersions)
    return `V${maxVersion + 1}`
  }
  // 表单提交处理
  const handleSubmit = (values: any) => {
    const formData = {
      description: values.description,
      inheritFromHistory,
      parentVersionId: inheritFromHistory ? selectedHistoryVersion : undefined,
      dataSource,
    }
    onSubmit(formData)
  }
  // 文件上传属性
  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    showUploadList: true,
    beforeUpload: (file: RcFile) => {
      const isJsonl = file.name.endsWith('.jsonl')
      const isJson = file.name.endsWith('.json') || file.type === 'application/json'
      // const isCsv = file.name.endsWith('.csv') || file.type === 'text/csv';
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx')
      if (!isJsonl && !isJson && !isExcel) {
        message.error('只支持 jsonl、json 和 xlsx 文件格式!')
        return false
      }
      const isLt100M = file.size / 1024 / 1024 < 100
      if (!isLt100M) {
        message.error('文件大小不能超过 100MB!')
        return false
      }
      setSelectedFile(file)
      return false // 阻止自动上传
    },
    onRemove: () => {
      setSelectedFile(null)
    },
    fileList: selectedFile ? [selectedFile as RcFile] : [],
    maxCount: 1,
  }
  // 重置表单
  const handleCancel = () => {
    form.resetFields()
    setInheritFromHistory(true)
    setSelectedHistoryVersion('')
    setDataSource('upload')
    onCancel()
  }
  return (
    <Modal
      className="top-[20px]"
      title={(
        <div className="text-center">
          <Title level={4} className="m-0">新增数据集版本</Title>
        </div>
      )}
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          description: '',
        }}
      >
        {/* 数据集版本 */}
        <Form.Item name="version" label="" initialValue={calculateNewVersion()}>
          <div>
            <Text strong>
              数据集版本:
              {calculateNewVersion()}
            </Text>
          </div>
        </Form.Item>

        {/* 描述 */}
        <Form.Item name="description" label={<Text strong>描述</Text>}>
          <DescriptionTextArea className="text-[14px]" placeholder="请输入数据集描述" maxLength={300} rows={3} />
        </Form.Item>

        {/* 数据用途 */}
        <Form.Item label={<Text strong>数据用途</Text>}>
          <div className="font-medium">{datasetInfo?.training_type || 'SFT-文本生成'}</div>
        </Form.Item>

        {/* 数据格式 */}
        <Form.Item label={<Text strong>数据格式</Text>}>
          <div className="font-medium">{datasetInfo?.format === 'sharegpt' ? 'Role (user+assistant)' : datasetInfo?.format || 'Role (user+assistant)'}</div>
        </Form.Item>

        <Divider className="py-4" />

        {/* 继承历史版本 */}
        <Form.Item label={<Text strong>继承历史版本</Text>}>
          <div className="flex items-center justify-between">
            <Text className="text-[14px]">是否从历史版本继承数据</Text>
            <Switch checked={inheritFromHistory} onChange={setInheritFromHistory} />
          </div>
        </Form.Item>

        {/* 根据继承状态显示不同内容 */}
        {inheritFromHistory ? (
          <Form.Item label={<Text strong>历史版本</Text>}>
            <Select placeholder="请选择版本" className="w-full" value={selectedHistoryVersion} onChange={setSelectedHistoryVersion} allowClear>
              <Option value="1">V1</Option>
              <Option value="2">V2</Option>
              <Option value="3">V3</Option>
              <Option value="4">V4</Option>
              <Option value="5">V5</Option>
            </Select>
          </Form.Item>
        ) : (
          <Form.Item label={<Text strong>数据来源</Text>}>
            <Radio.Group value={dataSource} onChange={(e) => setDataSource(e.target.value)} className="w-full">
              <Row gutter={[6, 12]}>
                <Col span={12}>
                  <Radio className="w-[100%]" value="upload">
                    <div className="flex items-center gap-2">
                      <PlusOutlined className="text-[16px] text-[var(--lab-color-brand-primary)]" />
                      <span>本地上传</span>
                    </div>
                  </Radio>
                </Col>
                <Col span={12}>
                  <Radio className="w-[100%]" value="url" disabled>
                    <div className="flex items-center gap-2">
                      <DatabaseOutlined className="text-[16px] text-[var(--lab-color-brand-primary)]" />
                      <Tooltip title="即将上线">
                        <span>URL获取</span>
                      </Tooltip>
                    </div>
                  </Radio>
                </Col>
              </Row>
            </Radio.Group>
          </Form.Item>
        )}
        {/* 根据数据来源显示不同的输入方式 */}
        {!inheritFromHistory
          ? (dataSource === 'URL获取' ? (
              <Form.Item label={<Text strong>数据URL</Text>}>
                <Input value={dataUrl} onChange={(e) => setDataUrl(e.target.value)} placeholder="请输入数据文件的URL地址" className="text-[14px]" />
                <Text type="secondary" className="text-[12px] mt-1 block">
                  支持jsonl、json、xlsx格式文件的直链地址
                </Text>
              </Form.Item>
            ) : (
              <Form.Item>
                <Dragger {...uploadProps} className="p-5">
                  <p className="ant-upload-drag-icon text-[48px] text-[var(--lab-color-brand-primary)]">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text text-[16px] m-[16px_0_8px]">
                    将合适文本文件拖拽到此处，或
                    {' '}
                    <a className="text-[var(--lab-color-brand-primary)]">点击上传</a>
                  </p>
                  <p className="ant-upload-hint text-[var(--lab-color-placeholder)] text-[12px] m-0">
                    支持jsonl、json、xlsx格式文件，文件包含tar.gz/zip格式，文件大小上传
                  </p>
                  <p className="ant-upload-hint text-[12px] m-[4px_0_0]" style={{ color: '#999' }}>
                    单个jsonl、json、xlsx文件大小，均不能超过100MB，所有文件数量不超过100
                  </p>
                </Dragger>
              </Form.Item>
            )) : ''}

        {/* 提交按钮 */}
        <div className="text-center mt-6">
          <Space size="middle">
            <Button type="primary" htmlType="submit" className="min-w-[80px]">
              确定
            </Button>
            <Button onClick={handleCancel} className="min-w-[80px]">
              取消
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  )
}
export default CreateDatasetVersionModal
