import React, { useEffect } from 'react'
import { Form, Input, Modal, message } from 'antd'
import { fileManagementService } from '../../../services/fileManagementService'

interface CreateFolderModalProps {
  visible: boolean
  projectId: number
  onCancel: () => void
  onSuccess: () => void
}

const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  visible,
  projectId,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm()

  useEffect(() => {
    if (visible) {
      form.resetFields()
    }
  }, [visible, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await fileManagementService.createFolder({
        name: values.name?.trim(),
        description: values.description?.trim(),
        project_id: projectId,
      })
      message.success('创建文件夹成功')
      onSuccess()
    }
    catch (error: any) {
      if (error?.errorFields) {
        // 表单验证错误
        return
      }
      message.error(error?.response?.data?.message || '创建文件夹失败')
    }
  }

  return (
    <Modal
      title="创建文件夹"
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText="确定"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="name"
          label="文件夹名称"
          rules={[
            { required: true, message: '请输入文件夹名称' },
            { max: 50, message: '文件夹名称不能超过50个字符' },
            {
              validator: (_, value) => {
                if (!value) {
                  return Promise.resolve()
                }
                if (value.trim() === '') {
                  return Promise.reject(new Error('文件夹名称不能全为空格'))
                }
                if (value !== value.trim()) {
                  return Promise.reject(new Error('文件夹名称前后不能有空格'))
                }
                return Promise.resolve()
              },
            },
          ]}
        >
          <Input
            placeholder="请输入文件夹名称"
            maxLength={50}
            showCount
          />
        </Form.Item>
        <Form.Item
          name="description"
          label="文件夹描述"
          rules={[{ max: 1000, message: '文件夹描述不能超过1000个字符' }]}
        >
          <Input.TextArea
            placeholder="请输入文件夹描述"
            rows={4}
            maxLength={1000}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default CreateFolderModal
