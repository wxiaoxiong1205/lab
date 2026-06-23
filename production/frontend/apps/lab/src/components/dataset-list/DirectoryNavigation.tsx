import React, { useState } from 'react'
import { Button, Card, Form, Input, List, Modal, Popconfirm, Space, Tooltip, message } from 'antd'
import { DeleteOutlined, EditOutlined, FolderOutlined, HomeOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { datasetDirectoryApi } from '../../services/api'
import type { DatasetDirectory, DatasetDirectoryWithCount } from '../../types/dataset'
// 辅助函数：测试API调用
const testApiCall = async (projectId: number) => {
  try {
    console.log('测试创建目录API, projectId:', projectId)
    const testData = {
      name: `测试目录-${new Date().toISOString()}`,
      description: '这是一个测试目录',
      project_id: projectId,
    }
    console.log('请求参数:', testData)
    const response = await fetch(`/api/datasets/directories/project/${projectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify(testData),
    })
    console.log('响应状态:', response.status)
    const data = await response.json()
    console.log('响应数据:', data)
    if (!response.ok) {
      console.error('API错误:', data)
      throw new Error(data.detail || '创建目录失败')
    }
    return data
  }
  catch (error) {
    console.error('测试API调用失败:', error)
    throw error
  }
}
interface DirectoryNavigationProps {
  projectId: number
  currentDirectoryId: number | null
  onDirectorySelect: (directoryId: number | null) => void
}
export const DirectoryNavigation: React.FC<DirectoryNavigationProps> = ({ projectId, currentDirectoryId, onDirectorySelect }) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false)
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [directoryToEdit, setDirectoryToEdit] = useState<DatasetDirectory | null>(null)
  // 获取目录列表
  const { data: directories = [], isLoading, error } = useQuery({
    queryKey: ['directories', projectId],
    queryFn: async () => {
      const dirs = await datasetDirectoryApi.list(projectId)
      // 获取每个目录的详细信息，包括数据集数量
      const dirsWithCount = await Promise.all(dirs.items.map(async (dir) => {
        try {
          const details = await datasetDirectoryApi.get(projectId, dir.id)
          return {
            ...dir,
            dataset_count: details.dataset_count || 0,
          }
        }
        catch (error) {
          console.error(`Error fetching directory details for ${dir.id}:`, error)
          return {
            ...dir,
            dataset_count: 0,
          }
        }
      }))
      return dirsWithCount
    },
    enabled: Boolean(projectId),
  })
  // 创建目录的mutation
  const createDirectory = useMutation({
    mutationFn: (values: {
      name: string
      description?: string
    }) => datasetDirectoryApi.create(projectId, {
      name: values.name,
      description: values.description || null,
    }),
    onSuccess: () => {
      message.success(t('dataset.directoryCreated') || '目录创建成功')
      queryClient.invalidateQueries({ queryKey: ['directories', projectId] })
      setIsCreateModalVisible(false)
      createForm.resetFields()
    },
    onError: (error: any) => {
      console.error('创建目录错误:', error)
      message.error(`${t('dataset.directoryCreateFailed') || '创建目录失败'}: ${error.response?.data?.detail || error.message}`)
    },
  })
  // 编辑目录的mutation
  const updateDirectory = useMutation({
    mutationFn: ({ directoryId, data }: {
      directoryId: number
      data: {
        name?: string
        description?: string
      }
    }) => datasetDirectoryApi.update(projectId, directoryId, data),
    onSuccess: () => {
      message.success(t('dataset.directoryUpdated') || '目录更新成功')
      queryClient.invalidateQueries({ queryKey: ['directories', projectId] })
      setIsEditModalVisible(false)
      editForm.resetFields()
    },
    onError: (error: any) => {
      message.error(`${t('dataset.directoryUpdateFailed') || '更新目录失败'}: ${error.response?.data?.detail || error.message}`)
    },
  })
  // 删除目录的mutation
  const deleteDirectory = useMutation({
    mutationFn: (directoryId: number) => datasetDirectoryApi.delete(projectId, directoryId, false),
    onSuccess: (_, variables) => {
      message.success(t('dataset.directoryDeleted') || '目录删除成功')
      queryClient.invalidateQueries({ queryKey: ['directories', projectId] })
      // 如果删除的是当前选中的目录，选择"全部"
      if (variables === currentDirectoryId) {
        onDirectorySelect(null)
      }
    },
    onError: (error: any) => {
      message.error(`${t('dataset.directoryDeleteFailed') || '删除目录失败'}: ${error.response?.data?.detail || error.message}`)
    },
  })
  // 强制删除目录及其数据集的mutation
  const forceDeleteDirectory = useMutation({
    mutationFn: (directoryId: number) => datasetDirectoryApi.delete(projectId, directoryId, true),
    onSuccess: (_, variables) => {
      message.success(t('dataset.directoryForceDeleted') || '目录及其数据集删除成功')
      queryClient.invalidateQueries({ queryKey: ['directories', projectId] })
      // 如果删除的是当前选中的目录，选择"全部"
      if (variables === currentDirectoryId) {
        onDirectorySelect(null)
      }
    },
    onError: (error: any) => {
      message.error(`${t('dataset.directoryForceDeleteFailed') || '强制删除目录失败'}: ${error.response?.data?.detail || error.message}`)
    },
  })
  // 处理创建目录
  const handleCreateDirectory = (values: {
    name: string
    description?: string
  }) => {
    createDirectory.mutate(values)
  }
  // 处理编辑目录
  const handleEditDirectory = (values: {
    name?: string
    description?: string
  }) => {
    if (directoryToEdit) {
      updateDirectory.mutate({
        directoryId: directoryToEdit.id,
        data: values,
      })
    }
  }
  // 开始编辑目录
  const startEditDirectory = (directory: DatasetDirectory) => {
    setDirectoryToEdit(directory)
    editForm.setFieldsValue({
      name: directory.name,
      description: directory.description,
    })
    setIsEditModalVisible(true)
  }
  // 处理删除目录
  const handleDeleteDirectory = (directoryId: number) => {
    deleteDirectory.mutate(directoryId)
  }
  // 处理强制删除目录
  const handleForceDeleteDirectory = (directoryId: number) => {
    forceDeleteDirectory.mutate(directoryId)
  }
  // 处理选择目录
  const handleSelectDirectory = (directoryId: number | null) => {
    onDirectorySelect(directoryId)
  }
  if (error) {
    return (
      <div>
        加载目录失败:
        {(error as Error).message}
      </div>
    )
  }
  return (
    <div className="directory-navigation">
      <Card
        title={(
          <div className="flex justify-between items-center">
            <span>{t('dataset.directories') || '数据集目录'}</span>
            <div>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setIsCreateModalVisible(true)} className="mr-2">
                {t('dataset.createDirectory') || '新建目录'}
              </Button>
              <Button
                size="small"
                onClick={() => {
                  message.info('正在测试API...')
                  testApiCall(projectId)
                    .then(() => message.success('测试成功'))
                    .catch((error) => console.error('测试失败:', error))
                }}
              >
                测试
              </Button>
            </div>
          </div>
        )}
        size="small"
        className="mb-4"
        loading={isLoading}
        bodyStyle={{
          padding: '8px 12px',
          maxHeight: '300px',
          overflowY: 'auto',
        }}
      >
        <List
          size="small"
          dataSource={[
            {
              id: null,
              name: t('dataset.allDatasets') || '全部数据集',
              dataset_count: 0,
            },
            ...directories,
          ]}
          renderItem={(item: any) => (
            <List.Item
              className="cursor-pointer rounded-[4px] p-[4px_8px]"
              style={{
                backgroundColor: item.id === currentDirectoryId ? '#e6f7ff' : 'transparent',
              }}
              onClick={() => handleSelectDirectory(item.id)}
              actions={item.id !== null
                ? [
                    <Tooltip title={t('dataset.edit') || '编辑'}>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={(e) => {
                          e.stopPropagation()
                          startEditDirectory(item as DatasetDirectory)
                        }}
                      />
                    </Tooltip>,
                    <Popconfirm
                      title={t('dataset.confirmDeleteDirectory')
                      || '确定要删除此目录吗?'}
                      okText={t('common.yes') || '是'}
                      cancelText={t('common.no') || '否'}
                      onConfirm={(e) => {
                        e?.stopPropagation()
                        handleDeleteDirectory(item.id)
                      }}
                    >
                      <Tooltip title={t('dataset.delete') || '删除'}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                      </Tooltip>
                    </Popconfirm>,
                  ]
                : []}
            >
              <List.Item.Meta
                avatar={item.id === null ? <HomeOutlined /> : <FolderOutlined />}
                title={item.name}
                description={item.dataset_count !== undefined
                  ? `${item.dataset_count} ${t('dataset.items') || '条数据'}`
                  : ''}
              />
            </List.Item>
          )}
        />
      </Card>

      {/* 创建目录Modal */}
      <Modal
        title={t('dataset.createDirectory') || '创建数据集目录'}
        open={isCreateModalVisible}
        onCancel={() => {
          setIsCreateModalVisible(false)
          createForm.resetFields()
        }}
        footer={null}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateDirectory}>
          <Form.Item
            name="name"
            label={t('dataset.directoryName') || '目录名称'}
            rules={[
              {
                required: true,
                message: t('dataset.directoryNameRequired') || '请输入目录名称',
              },
            ]}
          >
            <Input placeholder={t('dataset.directoryNamePlaceholder') || '请输入目录名称'} />
          </Form.Item>

          <Form.Item name="description" label={t('dataset.directoryDescription') || '目录描述'}>
            <Input.TextArea placeholder={t('dataset.directoryDescriptionPlaceholder')
            || '请输入目录描述（可选）'}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={createDirectory.isPending}>
                {t('common.create') || '创建'}
              </Button>
              <Button onClick={() => {
                setIsCreateModalVisible(false)
                createForm.resetFields()
              }}
              >
                {t('common.cancel') || '取消'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑目录Modal */}
      <Modal
        title={t('dataset.editDirectory') || '编辑数据集目录'}
        open={isEditModalVisible}
        onCancel={() => {
          setIsEditModalVisible(false)
          setDirectoryToEdit(null)
          editForm.resetFields()
        }}
        footer={null}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditDirectory}>
          <Form.Item
            name="name"
            label={t('dataset.directoryName') || '目录名称'}
            rules={[
              {
                required: true,
                message: t('dataset.directoryNameRequired') || '请输入目录名称',
              },
            ]}
          >
            <Input placeholder={t('dataset.directoryNamePlaceholder') || '请输入目录名称'} />
          </Form.Item>

          <Form.Item name="description" label={t('dataset.directoryDescription') || '目录描述'}>
            <Input.TextArea placeholder={t('dataset.directoryDescriptionPlaceholder')
            || '请输入目录描述（可选）'}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={updateDirectory.isPending}>
                {t('common.save') || '保存'}
              </Button>
              <Button onClick={() => {
                setIsEditModalVisible(false)
                setDirectoryToEdit(null)
                editForm.resetFields()
              }}
              >
                {t('common.cancel') || '取消'}
              </Button>
            </Space>
          </Form.Item>
        </Form>

        {/* 如果目录不为空，显示强制删除选项 */}
        {directoryToEdit && (
          <div
            className="mt-[16px] pt-[16px]"
            style={{
              borderTop: '1px solid #f0f0f0',
            }}
          >
            <Popconfirm
              title={t('dataset.confirmForceDeleteDirectory')
              || '确定要删除此目录及其中的所有数据集吗?'}
              description={t('dataset.forceDeleteWarning')
              || '此操作不可撤销，目录中的所有数据集将被删除'}
              okText={t('common.yes') || '是'}
              cancelText={t('common.no') || '否'}
              okType="danger"
              onConfirm={() => {
                handleForceDeleteDirectory(directoryToEdit.id)
                setIsEditModalVisible(false)
                setDirectoryToEdit(null)
              }}
            >
              <Button danger type="text" icon={<DeleteOutlined />} loading={forceDeleteDirectory.isPending}>
                {t('dataset.forceDeleteDirectory') || '删除目录及其数据集'}
              </Button>
            </Popconfirm>
          </div>
        )}
      </Modal>
    </div>
  )
}
