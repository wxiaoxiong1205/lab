import { useQuery } from '@tanstack/react-query'
import { Checkbox, Form, Input, Modal, Radio, message } from 'antd'
import { useEffect, useState } from 'react'
import { registryMirrorService } from '@/services/RegistryMirrorService'
import { projectImageBuildNamespaceApi } from '@/services/api'

export default function SaveEnvironmentConfirmModal(params: {
  open: boolean
  notebookId?: number
  projectId: number
  imageName?: string
  onSaved: () => void
  onCancel: () => void
  stopNotebook: (notebookId: number) => void
}) {
  const { open, notebookId, projectId, imageName, onSaved, onCancel, stopNotebook } = params

  const [form] = Form.useForm()
  const [shouldSave, setShouldSave] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const { data: namespace, isLoading: loading } = useQuery({
    queryKey: ['namespace', 'saveConfirm', notebookId],
    queryFn: async () => {
      const res
        = await projectImageBuildNamespaceApi.getProjectImageBuildNamespace(
          projectId,
        )
      return res
    },
    enabled: open,
  })

  useEffect(() => {
    if (open) {
      form.setFieldValue('include_lab_work', false)
    }
  }, [form, open])

  const handleSaveEnvironment = async () => {
    const values = form.getFieldsValue()

    // 选择“否”：直接停止
    if (!shouldSave) {
      stopNotebook(notebookId!)
      onCancel()
      return
    }

    // 选择“是”：校验表单
    await form.validateFields()

    setActionLoading(true)
    try {
      await registryMirrorService.saveRegistryImage({
        project_id: projectId,
        notebook_id: notebookId,
        trigger_type: 'auto',
        namespace,
        name: values.image_name,
        describe: values.image_description,
        include_lab_work: !!values.include_lab_work,
      })

      message.success('保存环境成功')
      onSaved()
      onCancel()
    }
    catch {
      message.error('保存环境失败')
    }
    finally {
      setActionLoading(false)
    }
  }

  return (
    <Modal
      title="是否保存当前最新环境"
      open={open}
      onCancel={onCancel}
      onOk={handleSaveEnvironment}
      okText="确定"
      cancelText="取消"
      width={600}
      loading={loading}
      confirmLoading={actionLoading}
      okButtonProps={{ disabled: (namespace === 'null' || !namespace) && shouldSave }}
    >
      <Form
        form={form}
        layout="vertical"
        className="!mt-4"
        initialValues={{ include_lab_work: false }}
      >
        {/* 是否保存 */}
        <Form.Item className="!mb-0">
          <Radio.Group
            value={shouldSave}
            onChange={(e) => setShouldSave(e.target.value)}
            className="!flex !gap-6"
          >
            <Radio value>是</Radio>
            <Radio value={false}>否</Radio>
          </Radio.Group>
        </Form.Item>

        {/* 是：展示保存环境表单 */}
        {shouldSave && (
          <>
            {(namespace === 'null' || !namespace) && (
              <div className="text-red-500 py-2">
                您还未设置命名空间，无法保存镜像，请联系管理员设置
              </div>
            )}

            <div className="!mb-4 !space-y-3">
              <Checkbox checked disabled>
                包+依赖库
              </Checkbox>
              <Form.Item
                name="include_lab_work"
                valuePropName="checked"
                className="!mb-0"
              >
                <Checkbox>
                  工作目录（/lab/work）
                </Checkbox>
              </Form.Item>
            </div>

            <Form.Item
              name="image_name"
              label="镜像名称"
              rules={[{ required: true, message: '请输入镜像名称' }]}
              initialValue={imageName}
            >
              <Input placeholder="请输入镜像名称" />
            </Form.Item>

            <Form.Item
              name="image_description"
              label="镜像描述"
            >
              <Input.TextArea
                placeholder="请输入镜像描述"
                rows={4}
              />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  )
}
