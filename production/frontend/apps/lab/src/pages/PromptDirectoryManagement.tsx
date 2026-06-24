import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FolderOpenOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { promptDirectoryApi } from '../services/api'
import { useProjectStore } from '../stores/projectStore'

const { Title, Text } = Typography
const { TextArea } = Input

interface DirectoryFormValues {
  name: string
  description?: string
}

const PromptDirectoryManagement: React.FC = () => {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentProject = useProjectStore((state) => state.currentProject)

  // 优先使用URL中的projectId，如果没有则使用store中的
  const numericProjectId = projectId
    ? parseInt(projectId, 10)
    : currentProject?.id

  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false)
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [currentDirectory, setCurrentDirectory] = useState<any>(null)

  // 获取目录列表
  const {
    data: directories = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['promptDirectories', numericProjectId],
    queryFn: () =>
      promptDirectoryApi.list(numericProjectId).then((res) => res.items),
    enabled: !!numericProjectId,
    staleTime: 1000 * 60 * 5, // 5分钟内不重新获取
    refetchOnWindowFocus: false,
  })

  // 创建目录
  const createDirectory = useMutation({
    mutationFn: (values: DirectoryFormValues) =>
      promptDirectoryApi.create(numericProjectId, {
        ...values,
      }),
    onSuccess: () => {
      message.success(t('prompt.directoryCreateSuccess') || '目录创建成功')
      setIsCreateModalVisible(false)
      createForm.resetFields()
      queryClient.invalidateQueries({
        queryKey: ['promptDirectories', numericProjectId],
      })
    },
    onError: (error: any) => {
      message.error(
        `${t('prompt.directoryCreateFailed') || '创建目录失败'}: ${
          error.response?.data?.detail || error.message
        }`,
      )
    },
  })

  // 更新目录
  const updateDirectory = useMutation({
    mutationFn: ({ id, values }: { id: number, values: DirectoryFormValues }) =>
      promptDirectoryApi.update(numericProjectId, id, values),
    onSuccess: () => {
      message.success(t('prompt.directoryUpdateSuccess') || '目录更新成功')
      setIsEditModalVisible(false)
      editForm.resetFields()
      queryClient.invalidateQueries({
        queryKey: ['promptDirectories', numericProjectId],
      })
    },
    onError: (error: any) => {
      message.error(
        `${t('prompt.directoryUpdateFailed') || '更新目录失败'}: ${
          error.response?.data?.detail || error.message
        }`,
      )
    },
  })

  // 删除目录
  const deleteDirectory = useMutation({
    mutationFn: (id: number) =>
      promptDirectoryApi.delete(numericProjectId, id, false),
    onSuccess: () => {
      message.success(t('prompt.directoryDeleteSuccess') || '目录删除成功')
      queryClient.invalidateQueries({
        queryKey: ['promptDirectories', numericProjectId],
      })
    },
    onError: (error: any) => {
      if (error.response?.data?.detail?.includes('prompts')) {
        Modal.confirm({
          title: t('prompt.containsPrompts') || '目录包含提示词',
          icon: <ExclamationCircleOutlined />,
          content:
            t('prompt.forceDeleteConfirm')
            || '此目录包含提示词，确定要强制删除吗？强制删除将解除目录与提示词的关联。',
          okText: t('common.confirm') || '确认',
          cancelText: t('common.cancel') || '取消',
          onOk: () => {
            // 强制删除目录
            forceDeleteDirectory.mutate(currentDirectory.id)
          },
        })
      }
      else {
        message.error(
          `${t('prompt.directoryDeleteFailed') || '删除目录失败'}: ${
            error.response?.data?.detail || error.message
          }`,
        )
      }
    },
  })

  // 强制删除目录
  const forceDeleteDirectory = useMutation({
    mutationFn: (id: number) =>
      promptDirectoryApi.delete(numericProjectId, id, true),
    onSuccess: () => {
      message.success(
        t('prompt.directoryForceDeleteSuccess') || '目录强制删除成功',
      )
      queryClient.invalidateQueries({
        queryKey: ['promptDirectories', numericProjectId],
      })
    },
    onError: (error: any) => {
      message.error(
        `${t('prompt.directoryForceDeleteFailed') || '强制删除目录失败'}: ${
          error.response?.data?.detail || error.message
        }`,
      )
    },
  })

  // 处理创建目录
  const handleCreateDirectory = (values: DirectoryFormValues) => {
    createDirectory.mutate(values)
  }

  // 处理更新目录
  const handleUpdateDirectory = (values: DirectoryFormValues) => {
    if (currentDirectory) {
      updateDirectory.mutate({ id: currentDirectory.id, values })
    }
  }

  // 处理删除目录
  const handleDeleteDirectory = (directory: any) => {
    setCurrentDirectory(directory)
    deleteDirectory.mutate(directory.id)
  }

  // 处理编辑目录
  const handleEditDirectory = (directory: any) => {
    setCurrentDirectory(directory)
    editForm.setFieldsValue({
      name: directory.name,
      description: directory.description,
    })
    setIsEditModalVisible(true)
  }

  // 处理查看目录
  const handleViewDirectory = (directory: any) => {
    navigate(
      `/project/${numericProjectId}/prompts/directories/${directory.id}`,
    )
  }

  // 表格列定义
  const columns = [
    {
      title: t('prompt.directoryName'),
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <a
          className="text-[var(--lab-color-brand-primary)] cursor-pointer"
          onClick={() => handleViewDirectory(record)}
        >
          {text}
        </a>
      ),
    },
    {
      title: t('directory.description') || '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string) => text || '-',
    },
    {
      title: t('prompt.promptCount') || '提示词数量',
      dataIndex: 'prompt_count',
      key: 'prompt_count',
      width: 120,
      render: (count: number) => count || 0,
    },
    {
      title: t('directory.createdAt') || '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: t('common.actions') || '操作',
      key: 'action',
      width: 200,
      render: (_: any, record: any) => (
        <Space size="small">
          <Tooltip title={t('common.edit') || '编辑'}>
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleEditDirectory(record)}
            />
          </Tooltip>
          <Tooltip title={t('common.delete') || '删除'}>
            <Popconfirm
              title={
                t('prompt.directoryDeleteConfirm') || '确定要删除此目录吗？'
              }
              onConfirm={() => handleDeleteDirectory(record)}
              okText={t('common.confirm') || '确认'}
              cancelText={t('common.cancel') || '取消'}
            >
              <Button type="link" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ]

  if (!numericProjectId) {
    return <div>{t('common.selectProject') || '请选择项目'}</div>
  }

  if (error) {
    return (
      <div>
        {t('common.loadFailed') || '加载失败'}
        :
        {(error as Error).message}
      </div>
    )
  }

  return (
    <div className="prompt-directory-management-container">
      <Card
        title={(
          <div
            className="flex justify-between items-center"
          >
            <Title level={4} className="m-0">
              {t('prompt.directoryManagement') || '提示词目录管理'}
            </Title>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsCreateModalVisible(true)}
              className="rounded-[4px]"
            >
              {t('prompt.createDirectory') || '创建目录'}
            </Button>
          </div>
        )}
      >
        <Table
          dataSource={directories}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 10,
            showTotal: (total) =>
              `${t('common.total') || '共'} ${total} ${
                t('prompt.directories') || '个目录'
              }`,
          }}
          locale={{ emptyText: t('prompt.noDirectories') || '暂无目录数据' }}
        />
      </Card>

      {/* 创建目录对话框 */}
      <Modal
        title={t('prompt.createDirectory') || '创建目录'}
        open={isCreateModalVisible}
        onCancel={() => setIsCreateModalVisible(false)}
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
            label={t('prompt.directoryName') || '目录名称'}
            rules={[
              {
                required: true,
                message: t('prompt.inputDirectoryName') || '请输入目录名称',
              },
            ]}
          >
            <Input
              placeholder={t('prompt.inputDirectoryName') || '请输入目录名称'}
            />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('prompt.directoryDescription') || '目录描述'}
          >
            <TextArea
              placeholder={
                t('prompt.inputDirectoryDescription')
                || '请输入目录描述（可选）'
              }
              rows={4}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑目录对话框 */}
      <Modal
        title={t('prompt.editDirectory') || '编辑目录'}
        open={isEditModalVisible}
        onCancel={() => setIsEditModalVisible(false)}
        onOk={() => editForm.submit()}
        confirmLoading={updateDirectory.isPending}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdateDirectory}
        >
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
            <Input
              placeholder={t('prompt.inputDirectoryName') || '请输入目录名称'}
            />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('prompt.directoryDescription') || '目录描述'}
          >
            <TextArea
              placeholder={
                t('prompt.inputDirectoryDescription')
                || '请输入目录描述（可选）'
              }
              rows={4}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PromptDirectoryManagement
