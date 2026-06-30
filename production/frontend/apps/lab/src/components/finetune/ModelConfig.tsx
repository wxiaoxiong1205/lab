import React, { useEffect } from 'react'
import { Button, Card, Col, Form, Row, Tag, Typography } from 'antd'
import { CheckCircleOutlined, ExperimentOutlined } from '@ant-design/icons'
import qwen from '/public/qwen.png'
import llama from '/public/llama.png'

const { Text } = Typography
const MODEL_QWEN = 'Qwen'
const MODEL_LLAMA = 'llama'

interface ModelConfigProps {
  form: any
  ModelProviderCategory: any
  modelVersions: any[]
}

const ModelConfig: React.FC<ModelConfigProps> = ({ form, ModelProviderCategory, modelVersions }) => {
  useEffect(() => {
    const downloadedVersions = modelVersions?.filter((version: any) => version.isDownloaded !== false) || []
    if (!downloadedVersions.length) {
      form.setFieldsValue({
        base_model_id: undefined,
        base_model_name: undefined,
      })
      return
    }
    const currentId = form.getFieldValue('base_model_id')
    const isInList = downloadedVersions.some((v: any) => v.id === currentId)
    if (!currentId || !isInList) {
      const firstVersion = downloadedVersions[0]
      form.setFieldsValue({
        base_model_id: firstVersion.id,
        base_model_name: firstVersion.name,
      })
    }
  }, [modelVersions, form])

  return (
    <Card
      title={(
        <div className="flex items-center">
          <ExperimentOutlined className="mr-2 text-[var(--lab-color-success)]" />
          模型配置
        </div>
      )}
      className="mb-4 rounded-[8px]"
      size="small"
    >
      <Form.Item name="base_provider" label="选择基础模型" rules={[{ required: true, message: '请选择基础模型' }]}>
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue, setFieldsValue }) => {
            const selectedProvider = getFieldValue('base_provider')
            return (
              <Row gutter={[12, 12]}>
                {ModelProviderCategory?.options.map((provider: any) => (
                  <Col span={8} key={provider.value}>
                    {provider.value === MODEL_QWEN && (
                      <Card
                        size="small"
                        hoverable
                        className={`model-card ${selectedProvider === provider.value ? 'model-card-selected' : ''}`}
                        onClick={() => setFieldsValue({ base_provider: provider.value })}
                        style={{
                          cursor: 'pointer',
                          border: selectedProvider === provider.value ? '2px solid #1890ff' : '1px solid #d9d9d9',
                          borderRadius: 6,
                          transition: 'all 0.3s',
                          backgroundColor: selectedProvider === provider.value ? '#f6ffed' : '#fafafa',
                          minHeight: '80px',
                        }}
                        styles={{ body: { padding: '8px 12px' } }}
                      >
                        <div className="flex items-center relative">
                          <img className="w-[38px] h-[38px] rounded-[6px] mr-[8px] object-cover" src={provider.value === MODEL_QWEN ? qwen : provider.value === MODEL_LLAMA ? llama : ''} />
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-0.5">
                              <Text strong className="text-[14px]">{provider.name}</Text>
                              {selectedProvider === provider.value && (<CheckCircleOutlined className="text-[var(--lab-color-success)] text-[16px]" />)}
                            </div>
                            <Text type="secondary" className="text-[11px] block leading-[1.3]">
                              {provider?.description}
                            </Text>
                            <Text type="secondary" className="text-[10px]">
                              {provider?.company}
                            </Text>
                          </div>
                        </div>
                      </Card>
                    )}
                  </Col>
                ))}
              </Row>
            )
          }}
        </Form.Item>
      </Form.Item>

      <Form.Item name="base_model_id" label="基础模型版本" rules={[{ required: true, message: '请选择模型版本' }]}>
        <Form.Item noStyle shouldUpdate>
          {({ getFieldValue: getVersion, setFieldsValue }) => {
            const selectedVersion = getVersion('base_model_id')
            return (
              <>
                <Form.Item name="base_model_name" className="hidden">
                  <Text>{selectedVersion}</Text>
                </Form.Item>
                <div className="flex flex-wrap gap-2">
                  {modelVersions.map((version: any) => (
                    <Button
                      className="rounded-[16px] h-[32px] pl-[12px] pr-[12px] text-[12px] relative"
                      key={version.id}
                      type={selectedVersion === version.id ? 'primary' : 'default'}
                      disabled={version.isDownloaded === false}
                      size="small"
                      onClick={() => {
                        setFieldsValue({
                          base_model_id: version.id,
                          base_model_name: version.name,
                        })
                      }}
                      style={{
                        transition: 'all 0.3s',
                      }}
                    >
                      {version.name}
                      <Tag
                        className="ml-2 mr-0 text-[10px]"
                        color={version.isDownloaded === false ? 'default' : 'success'}
                      >
                        {version.isDownloaded === false ? '未下载' : '已下载'}
                      </Tag>
                    </Button>
                  ))}
                  {modelVersions.length === 0 && (<Text type="secondary" className="text-[12px]">暂无适配模型</Text>)}
                </div>
                {modelVersions.some((version: any) => version.isDownloaded === false) && (
                  <Text type="secondary" className="text-[12px] block mt-2">
                    当前仅展示已适配 Qwen 模型；未下载表示模型仓库中暂无该模型。
                  </Text>
                )}
              </>
            )
          }}
        </Form.Item>
      </Form.Item>
    </Card>
  )
}

export default ModelConfig
