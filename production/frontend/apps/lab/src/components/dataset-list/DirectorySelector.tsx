import React, { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, Select, Spin, message } from 'antd'
import { FolderOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { datasetDirectoryApi } from '../../services/api'
import type { DatasetDirectory } from '../../types/dataset'

interface DirectorySelectorProps {
  projectId: number
  value?: number | null
  onChange?: (value: number | null) => void
  allowCreate?: boolean
  width?: number | string
  placeholder?: string
}

export const DirectorySelector: React.FC<DirectorySelectorProps> = ({
  projectId,
  value,
  onChange,
  allowCreate = true,
  width = '100%',
  placeholder = '选择数据集目录',
}) => {
  const queryClient = useQueryClient()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [createForm] = Form.useForm()

  // 获取目录列表
  const {
    data: directories = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['directories', projectId],
    queryFn: () => datasetDirectoryApi.list(projectId).then((res) => res.items),
    enabled: Boolean(projectId),
  })

  // 创建目录的mutation
  const createDirectory = useMutation({
    mutationFn: (values: { name: string, description?: string }) =>
      datasetDirectoryApi.create(projectId, {
        ...values,
      }),
    onSuccess: () => {
      message.success('目录创建成功')
      queryClient.invalidateQueries({ queryKey: ['directories', projectId] })
      setIsModalVisible(false)
      createForm.resetFields()
    },
    onError: (error: any) => {
      message.error(`创建目录失败: ${error.message}`)
    },
  })

  // 处理创建目录
  const handleCreateDirectory = (values: {
    name: string
    description?: string
  }) => {
    createDirectory.mutate(values)
  }

  // 处理Select变化
  const handleChange = (directoryId: number | null) => {
    if (onChange) {
      onChange(directoryId)
    }
  }

  // 处理点击"新建目录"按钮
  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsModalVisible(true)
  }

  return (
    <>
      <Select
        style={{ width }}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        allowClear
        loading={isLoading}
        optionLabelProp="label"
      >
        {directories.map((directory: DatasetDirectory) => (
          <Select.Option
            key={directory.id}
            value={directory.id}
            label={directory.name}
          >
            <div className="flex items-center">
              <FolderOutlined className="mr-2" />
              {directory.name}
            </div>
          </Select.Option>
        ))}
      </Select>

      <Modal
        title="创建数据集目录"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createDirectory.isPending}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateDirectory}
        >
          <Form.Item
            name="name"
            label="目录名称"
            rules={[{ required: true, message: '请输入目录名称' }]}
          >
            <Input placeholder="请输入目录名称" />
          </Form.Item>
          <Form.Item name="description" label="目录描述">
            <Input.TextArea placeholder="请输入目录描述（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
