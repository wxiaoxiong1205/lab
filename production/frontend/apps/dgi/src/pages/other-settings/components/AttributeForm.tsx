import { useRequest } from 'ahooks'
import { Form, Input, Select, Spin } from 'antd'
import type { FormInstance } from 'antd/lib'
import { useEffect } from 'react'
import { ModelAttributeService } from '@/services/modelAttributeApi'
import { useTransform } from '@/locales'

export default function AttributeForm({
  type,
  form,
}: { type: 'model' | 'api', form?: FormInstance<any> }) {
  const { $t } = useTransform()

  const { data: list = [], loading } = useRequest(
    () => ModelAttributeService.list({
      owner_type: type, page_number: 1, page_size: 99,
    }).then((res) => {
      return res.items
    }),
    { staleTime: 0 },
  )

  useEffect(() => {
    if (!form || list.length === 0) {
      return
    }
    const currentValues = form.getFieldValue('custom_attribute_values') || []

    form.setFieldsValue({
      custom_attribute_values: list.map((item: any) => ({
        attribute_id: item.id,
        value: currentValues.find((customItem: any) => customItem.attribute_id === item.id)?.value,
      })),
    })
  }, [form, list])

  return (
    <Spin spinning={loading}>
      <>
        {list.map((item: any, index: number) => (
          <Form.Item key={item.id} noStyle>
            <Form.Item name={['custom_attribute_values', index, 'attribute_id']} initialValue={item.id} hidden>
              <Input />
            </Form.Item>
            {item.input_type === 'select' && (
              <Form.Item
                name={['custom_attribute_values', index, 'value']}
                label={item.name}
                rules={[{ required: !!item.required, message: $t('请选择属性值') }]}
                getValueFromEvent={(...args) => {
                  const value = args?.[0]
                  if (!item.multi_select && Array.isArray(value)) {
                    return value.length > 0 ? value[0] : undefined
                  }
                  return value
                }}
                getValueProps={(value) => {
                  if (!item.multi_select && Array.isArray(value)) {
                    return { value: value.length > 0 ? value[0] : undefined }
                  }
                  return { value }
                }}
              >
                <Select
                  mode={item.multi_select ? 'multiple' : undefined}
                  options={(
                    JSON.parse(item.option_values || '[]') as string[])
                    .map((o) => ({ label: o, value: o }),
                    )}
                />
              </Form.Item>
            )}
          </Form.Item>
        ))}
      </>
    </Spin>
  )
}
