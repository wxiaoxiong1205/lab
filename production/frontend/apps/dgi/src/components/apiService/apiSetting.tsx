import { Button, Form, Input, InputNumber, Modal, Popover, Spin, Upload, message } from 'antd'
import { useEffect, useState } from 'react'
import { LoadingOutlined, UploadOutlined } from '@ant-design/icons'
import { ModelLogo } from '../model-card/ModelLogo'
import { useTransform } from '@/locales'
import { useSystemConfig } from '@/hooks/use-system-config'
import { apiFileUpload } from '@/services/api'
import type { ApiServiceData } from '@/pages/apiService'
import { apiService } from '@/services/apiService'
import AttributeForm from '@/pages/other-settings/components/AttributeForm'

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

export default function ApiSettingModal({ open, onCancel, data, onSuccess }: {
  open: boolean
  onCancel: () => void
  data: ApiServiceData
  onSuccess: () => void
}) {
  const { $t } = useTransform()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        logo: data?.logo,
        name: data?.name,
        price: data?.price ?? 0.2,
        custom_attribute_values: data?.custom_attribute_values?.map((item) => ({
          attribute_id: item.attribute_id,
          value: item?.value?.split(',').filter((o) => o && o !== ''),
        })),
      })
    }
    else {
      form.resetFields()
    }
  }, [open])

  const handleOk = async () => {
    setLoading(true)
    try {
      const values = await form.validateFields()
      values.custom_attribute_values = values.custom_attribute_values
        .filter((item: any) => item.value)
        .map((item: any) => {
          return {
            attribute_id: item.attribute_id,
            value: Array.isArray(item.value) ? item.value.join(',') : item.value,
          }
        })
      values.owner_type = 'api'
      await apiService.updateApi(data.id, {
        ...values,
        price: Number(values.price),
      })
      message.success($t('保存成功'))
      onSuccess()
      form.resetFields()
    }
    catch (error) {
      console.error(error)
      message.error($t('保存失败'))
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={$t('API设置')}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      afterClose={() => form.resetFields()}
    >
      <Form
        layout="vertical"
        form={form}
      >
        <Form.Item label={$t('API Logo')} name="logo">
          <AvatarUpload></AvatarUpload>
        </Form.Item>

        <Form.Item label={$t('API名称')} name="name">
          <Input placeholder={$t('请输入API名称')} disabled />
        </Form.Item>

        <Form.Item label={$t('调用价格')} name="price">
          <InputNumber
            className="w-full"
            min={0}
            step={0.01}
            placeholder={$t('请输入调用价格')}
            addonAfter={`￥${$t('/万次')}`}
          />
        </Form.Item>

        <AttributeForm type="api" form={form} />
      </Form>
    </Modal>
  )
}
