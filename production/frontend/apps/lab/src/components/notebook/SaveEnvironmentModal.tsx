import { useQuery } from '@tanstack/react-query'
import { Checkbox, Form, Input, Modal, message } from 'antd'
import { useEffect, useState } from 'react'
import { registryMirrorService } from '@/services/RegistryMirrorService'
import { projectImageBuildNamespaceApi } from '@/services/api'

export default function SaveEnvironmentModal(params: {
  open: boolean
  notebookId: number
  projectId: number
  imageName: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [form] = Form.useForm()
  const { open, notebookId, projectId, imageName, onSaved, onCancel } = params

  const [uploadLoading, setUploadLoading] = useState(false)

  const { data: namespace, isLoading: loading } = useQuery({
    queryKey: ['namespace', 'save', notebookId],
    queryFn: async () => {
      const res = await projectImageBuildNamespaceApi.getProjectImageBuildNamespace(projectId)
      return res
    },
    enabled: open,
  })

  useEffect(() => {
    if (open) {
      form.setFieldValue('include_lab_work', false)
    }
  }, [form, open])

  const titleView = (
    <div>
      <div className="!flex !items-center !gap-2">
        <div>
          保存环境
        </div>
        <div
          className="!text-sm !text-gray-500 !text-xs"
        >
          {/* (保存环境时,仅包括新增的"包和依赖库等",不包括挂载的代码、数据和模型) */}
          选择需要保存到自定义镜像的内容，并填写镜像信息。
        </div>
      </div>
    </div>
  )

  const handleSaveEnvironment = async () => {
    await form.validateFields()
    const values = form.getFieldsValue()
    setUploadLoading(true)
    try {
      await registryMirrorService.saveRegistryImage({
        project_id: projectId,
        notebook_id: notebookId,
        trigger_type: 'manual',
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
      setUploadLoading(false)
    }
  }

  return (
    <Modal
      title={titleView}
      open={open}
      onCancel={onCancel}
      onOk={handleSaveEnvironment}
      okText="确定"
      confirmLoading={uploadLoading}
      cancelText="取消"
      width={600}
      loading={loading}
      okButtonProps={{ disabled: (namespace === 'null' || !namespace) }}
    >
      <Form
        form={form}
        layout="vertical"
        className="!mt-4"
        initialValues={{ include_lab_work: false }}
      >
        {(namespace === 'null' || !namespace) && (
          <div className="text-red-500 mb-2">
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
      </Form>
    </Modal>
  )
}
