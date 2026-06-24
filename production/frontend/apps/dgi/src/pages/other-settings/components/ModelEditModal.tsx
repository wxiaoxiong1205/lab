import {
  Button,
  Form,
  Input,
  Modal,
  Popover,
  Radio,
  Select,
  Spin,
  Upload,
  message,
} from 'antd'
import { LoadingOutlined, UploadOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { useRequest } from 'ahooks'
import Editor from '@monaco-editor/react'
import type { ValidateErrorEntity } from 'rc-field-form/lib/interface'
import AttributeForm from './AttributeForm'
import {
  apiFileUpload,
  apiModelDetail,
  apiModelUpdate,
} from '@/services/api'
import { useTransform } from '@/locales'
import { getModelPriceInfo, useSystemConfig } from '@/hooks/use-system-config'
import { ModelLogo } from '@/components/model-card/ModelLogo'

// loader.config({
//   paths: {
//     vs: 'https://cdn.bootcdn.net/ajax/libs/monaco-editor/0.52.2/min/vs',
//   },
// });

interface ModelEditModalProps {
  open: boolean
  modelId: number | null
  onCancel: () => void
  onSuccess: () => void
  securityLevels: { label: string, value: string }[]
}

interface AvatarOption {
  url: string
  id: string | number
}

function AvatarUpload({
  value,
  onChange,
}: {
  value?: string
  onChange?: (value: string) => void
}) {
  const { modelAvatars, isLoading } = useSystemConfig(true)
  const { $t } = useTransform()
  const [uploading, setUploading] = useState(false)
  const [open, setOpen] = useState(false)

  const handleUpload = async ({ file }: any) => {
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await apiFileUpload(formData)
      onChange && onChange(res.data.url)
      message.success($t('上传成功'))
    }
    catch {
      message.error($t('上传失败'))
    }
    finally {
      setUploading(false)
    }
  }

  // 上传头像
  const beforeUpload = (file: File) => {
    const isJpgOrPng = ['image/jpeg', 'image/png', 'image/jpg'].includes(
      file.type,
    )
    if (!isJpgOrPng) {
      message.error($t('仅支持 JPG/PNG 格式'))
      return Upload.LIST_IGNORE
    }
    if (file.size / 1024 / 1024 > 2) {
      message.error($t('图片大小不能超过2MB'))
      return Upload.LIST_IGNORE
    }
    return true
  }

  const handleSelect = (url: string) => {
    setOpen(false)
    onChange && onChange(url)
  }
  return (
    <div className="flex items-center gap-2">
      <ModelLogo name="avatar-preview" logo={value} size="large" className="rounded border border-gray-200" />
      <div className="flex flex-col gap-2">
        <Popover
          open={open}
          placement="bottom"
          trigger="click"
          onOpenChange={setOpen}
          content={(
            <Spin spinning={isLoading}>
              <div className="w-[200px] flex flex-wrap gap-2">
                {modelAvatars.map((url) => (
                  url && <ModelLogo key={url} name="avatar" logo={url} size="w-14 h-14" className="cursor-pointer border-solid hover:scale-110 transition-all duration-300" onClick={() => handleSelect(url)} />
                ))}
              </div>
            </Spin>
          )}
        >
          <Button>{$t('系统头像')}</Button>
        </Popover>
        <Upload
          showUploadList={false}
          customRequest={handleUpload}
          beforeUpload={beforeUpload}
          accept=".jpg,.jpeg,.png"
        >
          <Button
            icon={uploading ? <LoadingOutlined /> : <UploadOutlined />}
            loading={uploading}
          >
            {$t('点击上传')}
          </Button>
        </Upload>
      </div>
    </div>
  )
}

export default function ModelEditModal({
  open,
  modelId,
  securityLevels,
  onCancel,
  onSuccess,
}: ModelEditModalProps) {
  const { $t } = useTransform()
  const [form] = Form.useForm()
  const [avatarType, setAvatarType] = useState<'system' | 'upload'>('system')
  const DEFAULT_REALTIME_SECOND_PRICE = 0.0002

  const category = Form.useWatch('category', form)

  const [avatarUrl, setAvatarUrl] = useState<string>('')
  const [initLoading, setInitLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)

  const selectedCategories = Form.useWatch('category', form)
  const isRealtimeModel = selectedCategories?.includes('Realtime')

  const { securityPolicyOptions, isLoading, securityLevelEnabled } = useSystemConfig(true)

  function genPriceInfo(categories: string[]) {
    // 优先使用 Realtime，其次 AudioTranscription、Vision_Language，最后使用第一个类型
    const primaryCategory = categories.includes('Realtime')
      ? 'Realtime'
      : categories.includes('AudioTranscription')
        ? 'AudioTranscription'
        : categories.includes('Vision_Language')
          ? 'Vision_Language'
          : categories[0] || 'ChatCompletions'

    const priceInfo = getModelPriceInfo(primaryCategory)
    return priceInfo
  }

  // 监听模型类型变化，自动设置价格
  const handleCategoryChange = (categories: string[]) => {
    const priceInfo = genPriceInfo(categories)
    if (categories.includes('Realtime')) {
      form.setFieldsValue({
        second_price: form.getFieldValue('second_price') ?? DEFAULT_REALTIME_SECOND_PRICE,
        input_token_price: undefined,
        output_token_price: undefined,
        inference_params: '',
      })
      return
    }

    form.setFieldsValue({
      second_price: undefined,
      input_token_price: priceInfo.input,
      output_token_price: priceInfo.output || undefined,
    })
  }

  // 获取模型详情
  const { run: fetchDetail } = useRequest(apiModelDetail, {
    manual: true,
    onSuccess: (res) => {
      const data = res.data
      const categories = data.category.split(',')
      const priceInfo = genPriceInfo(categories)

      form.setFieldsValue({
        logo: data.logo,
        model_name: data.model_name,
        category: categories,
        inference_params: data.inference_params,
        description: data.description,
        data_level: data.data_level,
        security_policy: data.security_policy,
        security_policy_out: data.security_policy_out,
        input_token_price: data.input_token_price || priceInfo.input,
        second_price: data.second_price || undefined,
        output_token_price:
          data.output_token_price || priceInfo.output || undefined,
        custom_attribute_values: data.custom_attribute_values.map((item) => {
          return {
            attribute_id: item.attribute_id,
            value: item.value?.split(',').filter((o) => o && o !== ''),
          }
        }),
      })
      setAvatarUrl(data.logo_url || '')
      setAvatarType(data.logo_url ? 'upload' : 'system')
    },
  })

  const { modelTypeOptions, fetchConfig } = useSystemConfig()

  useEffect(() => {
    if (open && modelId) {
      setInitLoading(true)
      Promise.all([fetchDetail(modelId), fetchConfig()]).finally(() =>
        setInitLoading(false),
      )
    }
    else if (!open) {
      form.resetFields()
      // 重置时设置默认价格（文本模型价格）
      const defaultPriceInfo = genPriceInfo(['ChatCompletions'])
      form.setFieldsValue({
        input_token_price: defaultPriceInfo.input,
        output_token_price: defaultPriceInfo.output,
        second_price: undefined,
      })
      setAvatarUrl('')
      setAvatarType('system')
    }
  }, [open, modelId])

  const handleOk = async () => {
    setSaveLoading(true)
    try {
      const values = await form.validateFields()
      const customAttributeValues = values.custom_attribute_values ?? []

      if (values.description && values.description.length > 512) {
        message.error($t('模型说明最多512字'))
        return
      }
      await apiModelUpdate(modelId!, {
        ...values,
        logo_url: avatarUrl,
        category: values.category.join(','),
        input_token_price: isRealtimeModel ? undefined : Number(values.input_token_price),
        inference_params: isRealtimeModel ? '' : values.inference_params || '',
        output_token_price: isRealtimeModel
          ? undefined
          : values.output_token_price
            ? Number(values.output_token_price)
            : undefined,
        second_price: isRealtimeModel ? Number(values.second_price) : undefined,
        custom_attribute_values: customAttributeValues.filter(
          (item) => item.value !== undefined && item.value !== '',
        ).map((item) => {
          return {
            attribute_id: item.attribute_id,
            value: Array.isArray(item.value) ? item.value.join(',') : item.value,
          }
        }),
      })
      message.success($t('保存成功'))
      onSuccess()
      onCancel()
    }
    catch (e) {
      console.error(e)
      // const error = e as ValidateErrorEntity | Error
      // if (!('errorFields' in error)) {
      //   console.error(error)
      //   message.error($t('保存失败'))
      // }
    }
    finally {
      setSaveLoading(false)
    }
  }

  const ModelPriceInfo = () => {
    return (
      <div className="mb-4 p-4 text-sm">
        <p className="font-medium mb-2">
          {$t('模型Token价格设置。可参考的价格区间：')}
        </p>
        <p>
          {$t(
            '文本模型：输入价格0.002~0.004¥/1k tokens，输出价格0.006~0.012¥/1k tokens',
          )}
        </p>
        <p>
          {$t(
            'VL模型：输入价格0.008~0.016¥/1k tokens，输出价格0.024~0.048¥/1k tokens',
          )}
        </p>
        <p>
          {$t(
            '语音识别：输入价格0.06~0.12¥/1k tokens，输出价格0.024~0.048¥/1k tokens',
          )}
        </p>
        <p>
          {$t('实时语音识别：输入价格0.0002~0.0004¥/秒')}
        </p>
        <p>
          {$t(
            '语音合成：输入价格0.0016~0.0032¥/1k tokens，输出价格0.01~0.02¥/1k tokens',
          )}
        </p>
        <p>{$t('向量模型：输入价格0.0005~0.0007¥/1k tokens')}</p>
        <p>{$t('重排模型：输入价格0.0008¥/1k tokens')}</p>
      </div>
    )
  }

  const handleEditorChange = (value: string) => {
    form.setFieldsValue({
      inference_params: value,
    })
  }

  return (
    <Modal
      title={$t('模型设置')}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText={$t('保存')}
      cancelText={$t('取消')}
      confirmLoading={initLoading || saveLoading}
      destroyOnHidden
    >
      <Spin spinning={initLoading}>
        <Form form={form} layout="vertical">
          <Form.Item label={$t('模型Logo')} name="logo">
            <AvatarUpload></AvatarUpload>
          </Form.Item>
          <Form.Item
            label={$t('模型名称')}
            name="model_name"
            rules={[{ required: true, message: $t('请输入模型名称') }]}
          >
            <Input maxLength={64} disabled placeholder={$t('请输入模型名称')} />
          </Form.Item>
          <Form.Item
            label={$t('模型类型')}
            name="category"
            rules={[{ required: true, message: $t('请选择模型类型') }]}
          >
            <Select
              placeholder={$t('请选择模型类型')}
              options={modelTypeOptions}
              showSearch
              optionFilterProp="label"
              mode="multiple"
              onChange={handleCategoryChange}
            />
          </Form.Item>
          {!selectedCategories?.includes('AudioSpeech') && !selectedCategories?.includes('Realtime') && (
            <Form.Item
              name="security_policy"
              label={$t('内容安全审核策略')}
              tooltip={(
                <div>
                  <p>
                    {$t(
                      'L0 无审核：不对请求内容审核，依赖基础模型自有的合规检查机制提供内容安全保障。',
                    )}
                  </p>
                  <p>
                    {$t(
                      'L1 敏感词审核：对基础模型安全加固，采用敏感词过滤算法，通过敏感词库对违规问题拦截。',
                    )}
                  </p>
                  <p>
                    {$t(
                      'L2 语义融合审核：对基础模型安全加固，通过敏感词与语义分析双重审核，提升对隐晦违规内容的识别率。',
                    )}
                  </p>
                </div>
              )}
            >
              {/* <Form.Item
              name="security_policy"
              label=""
              rules={[{ required: true, message: "请选择安全审核策略" }]}
            >
              <Select
                placeholder={$t("请选择内容安全审核策略")}
                options={securityPolicyOptions}
                loading={isLoading}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item> */}
              <div className="space-y-4">
                <Form.Item
                  name="security_policy"
                  label="输入审核"
                  rules={[{ required: true, message: '请选择输入审核策略' }]}
                >
                  <Select
                    placeholder={$t('请选择内容安全审核策略')}
                    options={securityPolicyOptions}
                    loading={isLoading}
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Form.Item
                  name="security_policy_out"
                  label="输出审核"
                  rules={[{ required: true, message: '请选择输出审核策略' }]}
                >
                  <Select
                    placeholder={$t('请选择内容安全审核策略')}
                    options={securityPolicyOptions}
                    loading={isLoading}
                    showSearch
                    optionFilterProp="label"
                  />
                </Form.Item>
              </div>
            </Form.Item>
          )}

          {isRealtimeModel
            ? (
                <Form.Item
                  label={$t('实时语音识别价格(￥/秒)')}
                  name="second_price"
                  rules={[{ required: true, message: $t('请输入实时语音识别价格') }]}
                  tooltip={<ModelPriceInfo />}
                >
                  <Input
                    placeholder={$t('请输入实时语音识别价格')}
                    suffix="￥/秒"
                    type="number"
                    step="0.0001"
                  />
                </Form.Item>
              )
            : (
                <>
                  <Form.Item
                    label={$t('输入Token价格')}
                    name="input_token_price"
                    rules={[{ required: true, message: $t('请输入输入Token价格') }]}
                    tooltip={<ModelPriceInfo />}
                  >
                    <Input
                      placeholder={$t('请输入输入Token价格')}
                      suffix="¥/1k tokens"
                      type="number"
                      step="0.0001"
                    />
                  </Form.Item>
                  <Form.Item
                    label={$t('输出Token价格')}
                    name="output_token_price"
                    tooltip={<ModelPriceInfo />}
                  >
                    <Input
                      placeholder={$t('请输入输出Token价格')}
                      suffix="¥/1k tokens"
                      type="number"
                      step="0.0001"
                    />
                  </Form.Item>
                </>
              )}
          {securityLevelEnabled && (
            <Form.Item name="data_level" label={$t('模型密级')}>
              <Select
                placeholder={$t('请选择模型密级')}
                options={securityLevels}
              />
            </Form.Item>
          )}
          <AttributeForm type="model" form={form} />
          {!isRealtimeModel && (
            <Form.Item
              label={$t('推理参数')}
              name="inference_params"
              tooltip={`${$t('此选项可选，可设置JSON格式的推理参数，自动合并到原始请求中；如果原始请求中存在相同参数，按此处设置的值生效。样例：')}{"temperature": 0.8,"max_tokens": 2000}`}
            >
              <Editor
                height="10vh"
                defaultLanguage="json"
                defaultValue={form.getFieldValue('inference_params') || ''}
                onChange={handleEditorChange as any}
                options={{
                  automaticLayout: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                }}
              />
            </Form.Item>
          )}
          <Form.Item
            label={$t('模型说明')}
            name="description"
            rules={[{ max: 512, message: $t('模型说明最多512字') }]}
          >
            <Input.TextArea
              rows={4}
              maxLength={512}
              placeholder={$t('请输入模型说明，最多512字')}
            />
          </Form.Item>
        </Form>
      </Spin>
    </Modal>
  )
}
