import React, { useState } from 'react'
import { Button, Card, Form, Input, List, Modal, Popconfirm, Space, Tooltip, message } from 'antd'
import { DeleteOutlined, EditOutlined, FolderOutlined, HomeOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { promptDirectoryApi } from '../../services/api'
import type { PromptDirectory } from '../../types'

interface PromptDirectoryNavigationProps {
  projectId: number
  currentDirectoryId: number | null
  onDirectorySelect: (directoryId: number | null) => void
}
export const PromptDirectoryNavigation: React.FC<PromptDirectoryNavigationProps> = ({ projectId, currentDirectoryId, onDirectorySelect }) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false)
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [directoryToEdit, setDirectoryToEdit] = useState<PromptDirectory | null>(null)
  // 获取目录列表
  const { data: directories = [], isLoading, error } = useQuery({
    queryKey: ['promptDirectories', projectId],
    queryFn: async () => {
      const dirs = await promptDirectoryApi.list(projectId)
      // 获取每个目录的详细信息，包括提示词数量
      const dirsWithCount = await Promise.all(dirs.items.map(async (dir) => {
        try {
          const details = await promptDirectoryApi.get(projectId, dir.id)
          return {
            ...dir,
            prompt_count: details.directory.prompt_count || 0,
          }
        }
        catch (error) {
          console.error(`Error fetching directory details for ${dir.id}:`, error)
          return {
            ...dir,
            prompt_count: 0,
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
    }) => promptDirectoryApi.create(projectId, {
      name: values.name,
      description: values.description || null,
    }),
    onSuccess: () => {
      message.success(t('prompt.directoryCreated') || '目录创建成功')
      queryClient.invalidateQueries({
        queryKey: ['promptDirectories', projectId],
      })
      setIsCreateModalVisible(false)
      createForm.resetFields()
    },
    onError: (error: any) => {
      console.error('创建目录错误:', error)
      message.error(`${t('prompt.directoryCreateFailed') || '创建目录失败'}: ${error.response?.data?.detail || error.message}`)
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
    }) => promptDirectoryApi.update(projectId, directoryId, data),
    onSuccess: () => {
      message.success(t('prompt.directoryUpdated') || '目录更新成功')
      queryClient.invalidateQueries({
        queryKey: ['promptDirectories', projectId],
      })
      setIsEditModalVisible(false)
      editForm.resetFields()
    },
    onError: (error: any) => {
      message.error(`${t('prompt.directoryUpdateFailed') || '更新目录失败'}: ${error.response?.data?.detail || error.message}`)
    },
  })
  // 删除目录的mutation
  const deleteDirectory = useMutation({
    mutationFn: (directoryId: number) => promptDirectoryApi.delete(projectId, directoryId, false),
    onSuccess: (_, variables) => {
      message.success(t('prompt.directoryDeleted') || '目录删除成功')
      queryClient.invalidateQueries({
        queryKey: ['promptDirectories', projectId],
      })
      // 如果删除的是当前选中的目录，选择"全部"
      if (variables === currentDirectoryId) {
        onDirectorySelect(null)
      }
    },
    onError: (error: any) => {
      message.error(`${t('prompt.directoryDeleteFailed') || '删除目录失败'}: ${error.response?.data?.detail || error.message}`)
    },
  })
  // 强制删除目录的mutation
  const forceDeleteDirectory = useMutation({
    mutationFn: (directoryId: number) => promptDirectoryApi.delete(projectId, directoryId, true),
    onSuccess: (_, variables) => {
      message.success(t('prompt.directoryForceDeleted') || '目录及其提示词删除成功')
      queryClient.invalidateQueries({
        queryKey: ['promptDirectories', projectId],
      })
      // 如果删除的是当前选中的目录，选择"全部"
      if (variables === currentDirectoryId) {
        onDirectorySelect(null)
      }
    },
    onError: (error: any) => {
      message.error(`${t('prompt.directoryForceDeleteFailed') || '强制删除目录失败'}: ${error.response?.data?.detail || error.message}`)
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
  const startEditDirectory = (directory: PromptDirectory) => {
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
    Modal.confirm({
      title: t('prompt.confirmForceDelete') || '确认强制删除',
      content: t('prompt.forceDeleteWarning')
        || '强制删除将移除目录中的所有提示词关联，确认继续？',
      okText: t('common.confirm') || '确认',
      cancelText: t('common.cancel') || '取消',
      onOk: () => {
        forceDeleteDirectory.mutate(directoryId)
      },
    })
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
    <div className="prompt-directory-navigation">
      <Card
        title={(
          <div className="flex justify-between items-center">
            <span>{t('prompt.directories') || '提示词目录'}</span>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setIsCreateModalVisible(true)}>
              {t('prompt.createDirectory') || '新建目录'}
            </Button>
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
              name: t('prompt.allPrompts') || '全部提示词',
              prompt_count: '—',
            },
            ...directories,
          ]}
          renderItem={(item: any) => (
            <List.Item
              className="p-[8px_12px] cursor-pointer"
              key={item.id === null ? 'all' : item.id}
              style={{
                backgroundColor: item.id === currentDirectoryId ? '#e6f7ff' : undefined,
              }}
              onClick={() => handleSelectDirectory(item.id)}
              actions={item.id === null
                ? []
                : [
                    <Space size={0}>
                      <Tooltip title={t('common.edit') || '编辑'}>
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={(e) => {
                            e.stopPropagation()
                            startEditDirectory(item)
                          }}
                        />
                      </Tooltip>
                      <Tooltip title={t('common.delete') || '删除'}>
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteDirectory(item.id)
                          }}
                        />
                      </Tooltip>
                    </Space>,
                  ]}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center flex-1 overflow-hidden">
                  {item.id === null ? (<HomeOutlined className="mr-2" />) : (<FolderOutlined className="mr-2" />)}
                  <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                    {item.name}
                  </span>
                </div>
                <span className="ml-2 text-[var(--lab-color-text-muted)] shrink-0">
                  {item.id === null ? '' : item.prompt_count || 0}
                </span>
              </div>
            </List.Item>
          )}
        />
        {directories.length === 0 && !isLoading && (
          <div className="p-5 text-center text-[var(--lab-color-text-muted)]">
            <InboxOutlined className="text-[24px]" />
            <div className="mt-2">
              {t('prompt.noDirectories') || '暂无目录'}
            </div>
          </div>
        )}
      </Card>

      {/* 创建目录对话框 */}
      <Modal title={t('prompt.createDirectory') || '创建目录'} open={isCreateModalVisible} onCancel={() => setIsCreateModalVisible(false)} onOk={() => createForm.submit()} destroyOnClose>
        <Form form={createForm} layout="vertical" onFinish={handleCreateDirectory}>
          <Form.Item
            name="name"
            label={t('prompt.directoryName') || '目录名称'}
            rules={[
              {
                required: true,
                message: t('prompt.inputDirectoryName') || '请输入目录名称',
              },
            ]}
          >
            <Input placeholder={t('prompt.inputDirectoryName') || '请输入目录名称'} />
          </Form.Item>
          <Form.Item name="description" label={t('prompt.directoryDescription') || '目录描述'}>
            <Input.TextArea placeholder={t('prompt.inputDirectoryDescription') || '请输入目录描述'} rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑目录对话框 */}
      <Modal title={t('prompt.editDirectory') || '编辑目录'} open={isEditModalVisible} onCancel={() => setIsEditModalVisible(false)} onOk={() => editForm.submit()} destroyOnClose>
        <Form form={editForm} layout="vertical" onFinish={handleEditDirectory}>
          <Form.Item
            name="name"
            label={t('prompt.directoryName') || '目录名称'}
            rules={[
              {
                required: true,
                message: t('prompt.inputDirectoryName') || '请输入目录名称',
              },
            ]}
          >
            <Input placeholder={t('prompt.inputDirectoryName') || '请输入目录名称'} />
          </Form.Item>
          <Form.Item name="description" label={t('prompt.directoryDescription') || '目录描述'}>
            <Input.TextArea placeholder={t('prompt.inputDirectoryDescription') || '请输入目录描述'} rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
export default PromptDirectoryNavigation
