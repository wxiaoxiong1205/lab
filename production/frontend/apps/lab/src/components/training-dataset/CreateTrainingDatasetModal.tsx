import React, { useState } from 'react'
import { Button, Card, Col, Divider, Form, Input, Modal, Popover, Radio, Row, Space, Typography, Upload, message } from 'antd'
import { CloudUploadOutlined, DatabaseOutlined, DownloadOutlined, FileTextOutlined, InboxOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import type { RcFile, UploadProps } from 'antd/es/upload'
import type { CreateTrainingDatasetRequest } from '../../types'
import datasetTypeRoleImage from '../../assets/dataset_type_role.png'
import './CreateTrainingDatasetModal.css'

const { TextArea } = Input
const { Text, Title } = Typography
const { Dragger } = Upload
interface CreateTrainingDatasetModalProps {
  visible: boolean
  onCancel: () => void
  onSubmit: (values: CreateTrainingDatasetRequest, file?: File) => void
  form: any
  loading: boolean
}
const CreateTrainingDatasetModal: React.FC<CreateTrainingDatasetModalProps> = ({ visible, onCancel, onSubmit, form, loading }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dataSource, setDataSource] = useState<string>('文本生成')
  const [dataPreprocess, setDataPreprocess] = useState<string>('监督学习SFT')
  const [dataFormat, setDataFormat] = useState<string>('Role(user+assistant)')
  const [importMethod, setImportMethod] = useState<string>('本地上传')
  const [dataUrl, setDataUrl] = useState<string>('')
  // 数据用途选项
  const dataSourceOptions = [
    { value: '文本生成', label: '文本生成', icon: <FileTextOutlined /> },
    { value: '图像生成', label: '图像生成', icon: <DatabaseOutlined /> },
    { value: '图像理解', label: '图像理解', icon: <CloudUploadOutlined /> },
  ]
  // 根据数据用途获取对应的数据预处理选项
  const getDataPreprocessOptions = (dataSource: string) => {
    switch (dataSource) {
      case '文本生成':
        return [
          { value: '监督学习SFT', label: '监督学习SFT' },
          { value: '偏好对齐DPO', label: '偏好对齐DPO' },
        ]
      case '图像生成':
        return [
          { value: '监督学习', label: '监督学习' },
        ]
      case '图像理解':
        return [
          { value: '监督学习', label: '监督学习' },
        ]
      default:
        return [
          { value: '监督学习SFT', label: '监督学习SFT' },
          { value: '偏好对齐DPO', label: '偏好对齐DPO' },
        ]
    }
  }
  // 当数据用途改变时，自动设置默认的数据预处理选项
  const handleDataSourceChange = (e: any) => {
    const value = typeof e === 'string' ? e : e.target.value
    setDataSource(value)
    const options = getDataPreprocessOptions(value)
    if (options.length > 0) {
      setDataPreprocess(options[0].value)
    }
  }
  // 数据格式选项
  const dataFormatOptions = [
    { value: 'Role(user+assistant)', label: 'Role(user+assistant)' },
  ]
  // 文件上传属性
  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    showUploadList: true,
    beforeUpload: (file: RcFile) => {
      const isJsonl = file.name.endsWith('.jsonl')
      const isCsv = file.name.endsWith('.csv') || file.type === 'text/csv'
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx')
      if (!isJsonl && !isCsv && !isExcel) {
        message.error('只支持 jsonl、csv 和 xlsx 文件格式!')
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
  // 映射函数
  const mapDataSourceToTrainingType = (source: string): 'SFT-文本生成' | 'SFT-图片理解' | 'DPO-文本生成' => {
    switch (source) {
      case '图像生成':
        return 'SFT-图片理解'
      case '图像理解':
        return 'SFT-图片理解'
      default:
        return 'SFT-文本生成'
    }
  }
  const mapDataFormatToFormat = (format: string): 'sharegpt' | 'json' | 'excel' => {
    switch (format) {
      case 'Role(user+assistant)':
        return 'sharegpt'
      case 'Prefix+Suffix+Middle':
        return 'excel'
      default:
        return 'json'
    }
  }
  // 表单提交处理
  const handleSubmit = (values: any) => {
    const formData: CreateTrainingDatasetRequest = {
      name: values.name,
      description: values.description,
      training_type: mapDataSourceToTrainingType(dataSource),
      format: mapDataFormatToFormat(dataFormat),
      meta_info: {
        data_purpose: dataSource,
        data_preprocess: dataPreprocess,
        data_format: dataFormat,
        import_method: importMethod,
        data_url: importMethod === 'URL获取' ? dataUrl : undefined,
        ...values.meta_info,
      },
    }
    onSubmit(formData, selectedFile || undefined)
  }
  // 下载模板文件
  const downloadTemplate = (format: string) => {
    let fileName: string
    let fileUrl: string
    // 根据格式选择对应的示例文件
    switch (format) {
      case 'jsonl':
        fileName = 'SFT_Role_jsonl.zip'
        fileUrl = `/SFT_Role_jsonl.zip`
        break
      case 'csv':
        fileName = 'SFT_Role_csv.zip'
        fileUrl = `/SFT_Role_csv.zip`
        break
      case 'xlsx':
        fileName = 'SFT_Role_xlsx.zip'
        fileUrl = `/SFT_Role_xlsx.zip`
        break
      default:
        message.error('不支持的文件格式')
        return
    }
    // 创建下载链接
    const a = document.createElement('a')
    a.href = fileUrl
    a.download = fileName
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  return (
    <Modal
      className="top-[20px]"
      title={(
        <div className="text-center">
          <Title level={4} className="m-0">创建数据集</Title>
        </div>
      )}
      open={visible}
      onCancel={() => {
        onCancel()
        form.resetFields()
        setSelectedFile(null)
      }}
      footer={null}
      width={900}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          name: `数据集_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '_')}`,
        }}
      >
        {/* 数据集名称 */}
        <Form.Item name="name" label={<Text strong>数据集名称</Text>} rules={[{ required: true, message: '请输入数据集名称' }]}>
          <Input placeholder="请输入数据集名称" maxLength={50} showCount className="text-[14px]" />
        </Form.Item>
        {/* 数据集版本,默认v1 */}
        <Form.Item name="version" label="" initialValue="v1">
          <div>
            <Text strong>数据集版本:V1</Text>
          </div>
        </Form.Item>

        {/* 描述 */}
        <Form.Item name="description" label={<Text strong>描述</Text>}>
          <TextArea className="text-[14px]" placeholder="请输入数据集描述" autoSize={{ minRows: 3, maxRows: 6 }} maxLength={300} showCount />
        </Form.Item>

        {/* 数据用途 */}
        <Form.Item label={<Text strong>数据用途</Text>}>
          <Radio.Group value={dataSource} onChange={handleDataSourceChange} className="w-full">
            <Row gutter={[12, 12]}>
              {dataSourceOptions.map((option) => {
                const isDisabled = option.value !== '文本生成'
                return (
                  <Col span={6} key={option.value}>
                    <Card
                      className={[
                        'training-dataset-option-card text-center relative',
                        dataSource === option.value ? 'training-dataset-option-card-selected' : '',
                        isDisabled ? 'training-dataset-option-card-disabled' : '',
                      ].join(' ')}
                      size="small"
                      hoverable={!isDisabled}
                      onClick={() => {
                        if (isDisabled) {
                          message.warning(`${option.label}功能即将上线，敬请期待！`)
                        }
                        else {
                          handleDataSourceChange(option.value)
                        }
                      }}
                    >
                      <div className="p-[6px_0]">
                        <div
                          className="training-dataset-option-icon text-[16px] mb-[6px]"
                        >
                          {option.icon}
                        </div>
                        <Radio className="hidden" value={option.value} disabled={isDisabled} />
                        <Text
                          className="training-dataset-option-label text-[12px]"
                          strong
                        >
                          {option.label}
                        </Text>
                        {isDisabled && (
                          <div
                            className="training-dataset-coming-soon absolute top-[2px] right-[2px] text-[10px] rounded-[2px] p-[1px_3px]"
                          >
                            即将上线
                          </div>
                        )}
                      </div>
                    </Card>
                  </Col>
                )
              })}
            </Row>
          </Radio.Group>
        </Form.Item>

        {/* 数据预处理 */}
        <Form.Item>
          <Radio.Group value={dataPreprocess} onChange={(e) => setDataPreprocess(e.target.value)} className="w-full">
            <Row gutter={[8, 8]}>
              {getDataPreprocessOptions(dataSource).map((option) => {
                const preprocessOptions = getDataPreprocessOptions(dataSource)
                const colSpan = preprocessOptions.length === 1 ? 8 : 12
                return (
                  <Col span={colSpan} key={option.value}>
                    <Radio
                      className={[
                        'training-dataset-preprocess-radio w-[100%] p-[8px_12px] m-[0] rounded-[4px]',
                        dataPreprocess === option.value ? 'training-dataset-preprocess-radio-selected' : '',
                      ].join(' ')}
                      value={option.value}
                    >
                      <Text className="text-[13px]">{option.label}</Text>
                    </Radio>
                  </Col>
                )
              })}
            </Row>
          </Radio.Group>
        </Form.Item>

        {/* 数据格式 */}
        <Form.Item label={(
          <div className="flex items-center gap-2">
            <Text strong>数据格式</Text>
            <Popover
              content={(
                <div className="max-w-[400px]">
                  <img
                    className="training-dataset-format-preview w-[100%] h-[auto] rounded-[4px]"
                    src={datasetTypeRoleImage}
                    alt="数据格式说明"
                  />
                  <div className="mt-2 text-[12px] text-[var(--lab-color-text-muted)]">
                    <div>
                      <strong>Role(user+assistant)</strong>
                      : 支持多轮对话的标准化格式
                    </div>
                  </div>
                </div>
              )}
              title="数据格式说明"
              placement="right"
              trigger="hover"
              overlayStyle={{ maxWidth: '450px' }}
            >
              <QuestionCircleOutlined className="text-[var(--lab-color-brand-primary)] cursor-pointer text-[14px]" />
            </Popover>
          </div>
        )}
        >
          <div className="flex gap-2 flex-wrap">
            {dataFormatOptions.map((option) => (
              <Button className="rounded-[16px] p-[4px_16px] h-[auto] text-[12px]" key={option.value} type={dataFormat === option.value ? 'primary' : 'default'} size="small" onClick={() => setDataFormat(option.value)}>
                {option.label}
              </Button>
            ))}
          </div>
        </Form.Item>

        {/* 数据来源 */}
        <Form.Item label={<Text strong>数据来源</Text>}>
          <Radio.Group value={importMethod} onChange={(e) => setImportMethod(e.target.value)} className="w-full">
            <Row gutter={[6, 12]}>
              <Col span={6}>
                <Radio className="w-[100%]" value="本地上传">
                  <div className="flex items-center gap-2">
                    <InboxOutlined className="text-[16px] text-[var(--lab-color-brand-primary)]" />
                    <span>本地上传</span>
                  </div>
                </Radio>
              </Col>
              <Col span={6}>
                <Radio className="w-[100%]" value="URL获取">
                  <div className="flex items-center gap-2">
                    <CloudUploadOutlined className="text-[16px] text-[var(--lab-color-brand-primary)]" />
                    <span>URL获取</span>
                  </div>
                </Radio>
              </Col>
            </Row>
          </Radio.Group>
        </Form.Item>

        <Divider />

        {/* 根据数据来源显示不同的输入方式 */}
        {importMethod === 'URL获取' ? (
          <Form.Item label={<Text strong>数据URL</Text>}>
            <Input value={dataUrl} onChange={(e) => setDataUrl(e.target.value)} placeholder="请输入数据文件的URL地址" className="text-[14px]" />
            <Text type="secondary" className="text-[12px] mt-1 block">
              支持jsonl、csv、xlsx格式文件的直链地址
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
                支持jsonl、csv、xlsx格式文件，文件包含tar.gz/zip格式，文件大小上传
              </p>
              <p className="ant-upload-hint text-[var(--lab-color-placeholder)] text-[12px] m-[4px_0_0]">
                单个jsonl、csv、xlsx文件大小，均不能超过100MB，所有文件数量不超过100
              </p>
            </Dragger>
          </Form.Item>
        )}

        {/* 示例下载 */}
        <div className="mb-6">
          <Text strong className="mb-2 block">示例下载：</Text>
          <Space>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadTemplate('jsonl')} className="text-[var(--lab-color-brand-primary)]">
              SFT Role JSONL示例
            </Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadTemplate('csv')} className="text-[var(--lab-color-brand-primary)]">
              SFT Role CSV示例
            </Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadTemplate('xlsx')} className="text-[var(--lab-color-brand-primary)]">
              SFT Role XLSX示例
            </Button>
          </Space>
          <Text type="secondary" className="text-[12px] mt-2 block">
            下载包含完整训练数据格式的示例文件，可直接参考使用
          </Text>
        </div>

        {/* 提交按钮 */}
        <div className="text-center mt-[32px]">
          <Space size="middle">
            <Button type="primary" htmlType="submit" loading={loading} className="min-w-[80px]">
              确定
            </Button>
            <Button
              onClick={() => {
                onCancel()
                form.resetFields()
                setSelectedFile(null)
              }}
              className="min-w-[80px]"
            >
              取消
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  )
}
export default CreateTrainingDatasetModal
