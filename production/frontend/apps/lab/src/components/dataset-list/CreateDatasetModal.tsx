import React, { useEffect } from 'react'
import { Button, Form, Input, Modal, Space } from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

interface CreateDatasetModalProps {
  visible: boolean
  onCancel: () => void
  onSubmit: (values: any) => void
  form: any
  loading: boolean
  projectId: number
  currentDirectoryId?: number | null
  dataset?: Record<string, any> | null
}

export const CreateDatasetModal: React.FC<CreateDatasetModalProps> = ({
  visible,
  onCancel,
  onSubmit,
  form,
  loading,
  projectId,
  currentDirectoryId,
  dataset,
}) => {
  const { t } = useTranslation()

  // 编辑模式：dataset 存在，回填表单
  useEffect(() => {
    if (visible) {
      if (dataset) {
        // 编辑模式，回填所有字段
        form.setFieldsValue({ ...dataset })
      }
      else if (currentDirectoryId !== undefined) {
        // 新建模式，设置目录
        form.setFieldValue('directory_id', currentDirectoryId)
      }
    }
  }, [visible, currentDirectoryId, dataset, form])

  return (
    <Modal
      title={dataset ? t('dataset.edit') : t('dataset.add')}
      open={visible}
      onCancel={() => {
        onCancel()
        form.resetFields()
      }}
      footer={null}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        initialValues={dataset || { directory_id: currentDirectoryId }}
      >
        <Form.Item
          name="question"
          label={t('dataset.question')}
          rules={[{ required: true, message: t('dataset.questionRequired') }]}
        >
          <Input.TextArea
            placeholder={t('dataset.questionPlaceholder')}
            rows={4}
            showCount
          />
        </Form.Item>

        {/* 隐藏表单字段，自动设置目录 */}
        <Form.Item name="directory_id" hidden>
          <Input type="hidden" />
        </Form.Item>

        <Form.Item name="ground_truth" label={t('dataset.groundTruth')}>
          <Input.TextArea
            placeholder={t('dataset.groundTruthPlaceholder')}
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </Form.Item>

        <Form.Item label={t('dataset.context')}>
          <Form.List name="context">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className="flex mb-4 gap-2 items-center justify-between"
                  >
                    <Form.Item
                      className="flex-1 !mb-0"
                      {...field}
                      name={field.name}
                      rules={[
                        {
                          required: true,
                          message: t('dataset.contextPlaceholder'),
                        },
                      ]}
                    >
                      <Input
                        className="w-full"
                        placeholder={t('dataset.contextPlaceholder')}
                      />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(field.name)} />
                  </div>
                ))}
                <Form.Item>
                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                  >
                    {t('dataset.addContext', '添加上下文')}
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form.Item>

        <Form.Item label="召回上下文">
          <Form.List name="retrieval_context">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className="flex mb-4 gap-2 items-center justify-between"
                  >
                    <Form.Item
                      className="flex-1 !mb-0"
                      {...field}
                      name={field.name}
                      rules={[
                        {
                          required: true,
                          message: t(
                            'dataset.retrievalContextRequired',
                            '请输入召回上下文',
                          ),
                        },
                      ]}
                    >
                      <Input
                        className="w-full"
                        placeholder={t(
                          'dataset.retrievalContextPlaceholder',
                          '请输入召回上下文',
                        )}
                      />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(field.name)} />
                  </div>
                ))}
                <Form.Item>
                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                  >
                    添加召回上下文
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form.Item>

        <Form.Item label={t('dataset.toolsCalled', '期望工具')}>
          <Form.List name="expected_tools">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className="flex mb-4 gap-2 items-center justify-between"
                  >
                    <Form.Item
                      className="flex-1 !mb-0"
                      {...field}
                      name={[field.name, 'name']}
                      rules={[
                        {
                          required: true,
                          message: t(
                            'dataset.toolNameRequired',
                            '请输入工具名称',
                          ),
                        },
                      ]}
                    >
                      <Input placeholder={t('dataset.toolName', '工具名称')} />
                    </Form.Item>
                    <MinusCircleOutlined onClick={() => remove(field.name)} />
                  </div>
                ))}
                <Form.Item>
                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                  >
                    {t('dataset.addTool', '添加工具')}
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form.Item>

        <Form.Item
          label={t('dataset.metaInfo')}
          tooltip={t('dataset.metaInfoTooltip')}
        >
          <Form.List name="keyValues" initialValue={[{ key: '', value: '' }]}>
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space
                    key={field.key}
                    className="flex mb-2"
                    align="baseline"
                  >
                    <Form.Item
                      {...field}
                      validateTrigger={['onChange', 'onBlur']}
                      name={[field.name, 'key']}
                      rules={[
                        {
                          validator: (_, value) => {
                            if (!value) return Promise.resolve()
                            if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) {
                              return Promise.reject(
                                t('dataset.keyNameInvalid'),
                              )
                            }
                            const keys = form
                              .getFieldValue('keyValues')
                              ?.map((item: any) => item?.key)
                              ?.filter((key: string) => key)
                            const count
                              = keys?.filter((key: string) => key === value)
                                .length || 0
                            if (count > 1) {
                              return Promise.reject(
                                t('dataset.keyNameDuplicate'),
                              )
                            }
                            return Promise.resolve()
                          },
                        },
                      ]}
                    >
                      <Input
                        placeholder={t('dataset.keyName')}
                        className="w-[150px]"
                      />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      validateTrigger={['onChange', 'onBlur']}
                      name={[field.name, 'value']}
                    >
                      <Input
                        placeholder={t('dataset.value')}
                        className="w-[200px]"
                      />
                    </Form.Item>
                    {fields.length > 1 && (
                      <MinusCircleOutlined onClick={() => remove(field.name)} />
                    )}
                  </Space>
                ))}
                <Form.Item>
                  <Button
                    type="dashed"
                    onClick={() => add({ key: '', value: '' })}
                    block
                    icon={<PlusOutlined />}
                  >
                    {t('dataset.addKeyValue')}
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form.Item>
        <Form.Item name="comments" label="备注">
          <Input.TextArea rows={2} placeholder="请输入备注" />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              {t('dataset.create')}
            </Button>
            <Button
              onClick={() => {
                onCancel()
                form.resetFields()
              }}
            >
              {t('dataset.cancel')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  )
}
