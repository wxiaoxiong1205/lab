import { useRequest } from 'ahooks'
import { Form, Modal, Select, message } from 'antd'
import TextArea from 'antd/es/input/TextArea'
import { useEffect, useState } from 'react'
import { apiApprovalCreate, apiModelList } from '@/services/api'
import { $t } from '@/locales'
import { apiService } from '@/services/apiService'

interface ModelPermissionApplyModalProps {
  open: boolean
  applyReason?: string
  handleApply?: () => void
  onCancel: () => void
}

interface ModelPermissionApplyForm {
  model: string[]
  api: string[]
  applyReason: string
}

export default function ModelPermissionApplyModal({
  open,
  onCancel,
}: ModelPermissionApplyModalProps) {
  const [form] = Form.useForm<ModelPermissionApplyForm>()
  const [loading, setLoading] = useState(false)

  // 初始化
  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        model: [],
        applyReason: '',
      })
    }
  }, [form, open])

  const modelOptions = useRequest(() => {
    return apiModelList({
      page_number: 1,
      page_size: 999,
      view: 'can_apply',
    }).then((res) => res.data.items)
  }, {
    refreshDeps: [open, loading],
  }).data?.map((item: any) => ({ label: item.model_name, value: item.id }))

  const apiOptions = useRequest(() => {
    return apiService.getApiList({
      page_number: 1,
      page_size: 999,
      view: 'can_apply',
    }).then((res) => res.items)
  }, {
    refreshDeps: [open, loading],
  }).data?.map((item) => ({ label: item.name, value: item.id }))

  const handleApply = async () => {
    await form.validateFields()

    const values = form.getFieldsValue()
    if (!values.model && !values.api) {
      message.error($t('请至少申请一个资源'))
      return
    }

    setLoading(true)

    const query = {
      type: 2,
      content: JSON.stringify({
        model_ids: values.model,
        api_ids: values.api,
      }),
      apply_reason: values.applyReason,
    }

    try {
      await apiApprovalCreate(query)
      message.success($t('申请成功'))
      onCancel()
    }
    catch (error) {
      message.error(error.message)
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={$t('申请资源')}
      open={open}
      onCancel={onCancel}
      width={640}
      okText={$t('发起申请')}
      onOk={handleApply}
      okButtonProps={{
        loading,
      }}
    >
      <Form
        form={form}
        layout="vertical"
      >
        <Form.Item
          name="model"
          label={$t('申请模型')}
        >
          <Select
            options={modelOptions}
            mode="multiple"
            showSearch
            optionFilterProp="label"
            placeholder={$t('请选择模型')}
          />
        </Form.Item>

        <Form.Item
          name="api"
          label={$t('申请API')}
        >
          <Select
            options={apiOptions}
            mode="multiple"
            showSearch
            optionFilterProp="label"
            placeholder={$t('请选择API')}
          />
        </Form.Item>

        <Form.Item
          name="applyReason"
          label={$t('申请理由')}
          rules={[
            { max: 64, message: $t('申请理由不能超过64个字符') },
          ]}
        >
          <TextArea
            rows={4}
            placeholder={$t('请输入申请理由')}
            maxLength={64}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
