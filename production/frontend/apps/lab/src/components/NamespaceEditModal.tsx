import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Form, Input, Modal, Select, message } from 'antd'
import { useEffect, useState } from 'react'
import { projectImageBuildNamespaceApi } from '@/services/api'
import { registryMirrorService } from '@/services/RegistryMirrorService'
import { registryService } from '@/services/registryService'

export default function NamespaceEditModal(params: {
  projectId: number
  open: boolean
  onCancel: () => void
}) {
  const { projectId, open, onCancel } = params
  const [form] = Form.useForm()
  const [editLoading, setEditLoading] = useState(false)
  const queryClient = useQueryClient()

  const { data: namespaceOptions, isLoading: optionsLoading } = useQuery({
    queryKey: ['namespaceOptions', 'saveConfirm', projectId],
    queryFn: async () => {
      const registryList = await registryService.getRegistryConfigs({
        page: 1,
        page_size: 1,
      })
      if (!registryList?.items[0]?.id) return []
      return registryMirrorService.getNamespaceEnum({
        repository_id: registryList?.items[0]?.id,
        search_type: 1,
        page: 1,
        size: 100,
      }).then((res) => res.items?.map((item) => ({
        label: item,
        value: item,
      })) || [])
    },
  })

  // 获取命名空间选项
  const { data: namespace, isLoading: namespaceLoading } = useQuery({
    queryKey: ['namespace', 'edit', projectId],
    queryFn: async () => {
      const res = await projectImageBuildNamespaceApi.getProjectImageBuildNamespace(projectId)
      return res
    },
    enabled: open,
  })
  useEffect(() => {
    if (open) form.setFieldsValue({ namespace })
  }, [open, namespace])

  const handleOk = async () => {
    await form.validateFields()
    setEditLoading(true)
    try {
      const values = form.getFieldsValue()
      await projectImageBuildNamespaceApi.createProjectImageBuildNamespace(projectId, values.namespace)
      queryClient.invalidateQueries({ queryKey: ['namespace', 'edit', projectId] })
      message.success('编辑命名空间成功')
      onCancel()
    }
    catch (error) {
      message.error('编辑命名空间失败')
    }
    finally {
      setEditLoading(false)
    }
  }

  const loading = optionsLoading && namespaceLoading

  return (
    <Modal
      title="编辑命名空间"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={editLoading}
      loading={loading}
    >
      <Form form={form}>
        <Form.Item
          name="namespace"
          label="命名空间"
          rules={[{ required: true, message: '请选择命名空间' }]}
        >
          <Select options={namespaceOptions} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
