import { Form } from 'antd'
import _ from 'lodash'
import React, { useEffect } from 'react'
import LabelSelector from '@/components/label-selector'
import ModalFooter from '@/components/modal-footer'
import ScrollerModal from '@/components/scroller-modal'
import SealInput from '@/components/seal-form/seal-input'
import SimpleOverlay from '@/components/simple-overlay'
import { useTransform } from '@/locales'
// import { useIntl } from '@umijs/max';
import 'simplebar-react/dist/simplebar.min.css'

type ViewModalProps = {
  open: boolean
  onCancel: () => void
  onOk: (values: FormData) => Promise<void>
  data: {
    name: string
    labels: object
  }
}
interface FormData {
  labels: object
  name: string
}

const UpdateLabels: React.FC<ViewModalProps> = (props) => {
  const { open, onCancel, data, onOk } = props || {}
  const { $t } = useTransform()
  // const intl = useIntl();
  const [form] = Form.useForm()
  const labels = Form.useWatch('labels', form)

  const handleLabelsChange = (labels: object) => {
    form.setFieldValue('labels', labels)
  }

  const handleSumit = () => {
    form.submit()
  }

  useEffect(() => {
    if (open && data) {
      // 使用 setTimeout 确保在下一个事件循环中设置值
      setTimeout(() => {
        form.setFieldsValue({
          name: data.name,
          labels: data.labels,
        })
      }, 0)
    }
  }, [open, data, form])

  // 添加一个监听表单值变化的 effect
  useEffect(() => {
    const values = form.getFieldsValue()
  }, [form])

  return (
    <ScrollerModal
      title={$t('编辑 Worker')}
      open={open}
      centered
      onCancel={onCancel}
      destroyOnClose
      closeIcon
      maskClosable={false}
      keyboard={false}
      width={600}
      styles={{
        content: {
          padding: '0px',
        },
        header: {
          padding: '24px 24px 0',
          paddingBottom: '0',
        },
        body: {
          padding: '0',
        },
        footer: {
          padding: '0 20px 24px',
        },
      }}
      footer={
        <ModalFooter onOk={handleSumit} onCancel={onCancel}></ModalFooter>
      }
    >
      <SimpleOverlay
        style={{
          maxHeight: '550px',
        }}
      >
        <Form
          name="deployModel"
          form={form}
          onFinish={onOk}
          preserve={false}
          clearOnDestroy
          style={{
            padding: '20px 24px',
            paddingBlock: 0,
          }}
        >
          <Form.Item<FormData> name="name">
            <SealInput.Input
              label={$t('名称')}
              disabled
            />
          </Form.Item>
          <Form.Item<FormData>
            name="labels"
            rules={[
              () => ({
                validator(rule, value) {
                  if (_.keys(value).length > 0) {
                    if (_.some(_.keys(value), (k: string) => !value[k])) {
                      return Promise.reject('请输入标签值')
                    }
                  }
                  return Promise.resolve()
                },
              }),
            ]}
          >
            <LabelSelector
              label={$t('标签')}
              labels={labels}
              btnText={$t('添加标签')}
              onChange={handleLabelsChange}
            >
            </LabelSelector>
          </Form.Item>
        </Form>
      </SimpleOverlay>
    </ScrollerModal>
  )
}

export default UpdateLabels
