import React, { useEffect, useState } from 'react'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
  message,
} from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useMetricStore } from '../stores/metricStore'

interface DirectoryFormData {
  name: string
  description?: string
  parent_id?: number
}

const { Title } = Typography

const MetricDirectoryManagement: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    directories,
    loading,
    fetchDirectories,
    createDirectory,
    updateDirectory,
    deleteDirectory,
    setProjectId,
  } = useMetricStore()

  const [isDirectoryModalVisible, setIsDirectoryModalVisible] = useState(false)
  const [editingDirectory, setEditingDirectory] = useState<unknown>(null)
  const [directoryForm] = Form.useForm()

  useEffect(() => {
    setProjectId(Number(projectId))
  }, [projectId])

  useEffect(() => {
    if (projectId) {
      fetchDirectories(Number(projectId))
    }
  }, [projectId])

  // 新建目录
  const handleAddDirectory = () => {
    setEditingDirectory(null)
    directoryForm.resetFields()
    setIsDirectoryModalVisible(true)
  }

  // 编辑目录
  const handleEditDirectory = (directory: unknown) => {
    setEditingDirectory(directory)
    directoryForm.setFieldsValue(directory as Record<string, unknown>)
    setIsDirectoryModalVisible(true)
  }

  // 提交目录表单
  const handleDirectorySubmit = async (values: DirectoryFormData) => {
    try {
      if (projectId) {
        if (editingDirectory) {
          await updateDirectory(
            Number(projectId),
            (editingDirectory as { id: number }).id,
            values,
          )
          message.success(t('metric.directory.updateSuccess'))
        }
        else {
          await createDirectory(Number(projectId), values)
          message.success(t('metric.directory.createSuccess'))
        }
        setIsDirectoryModalVisible(false)
        fetchDirectories(Number(projectId))
      }
    }
    catch {
      message.error(t('common.operationFailed'))
    }
  }

  // 删除目录
  const handleDeleteDirectory = async (directoryId: number) => {
    try {
      if (projectId) {
        await deleteDirectory(Number(projectId), directoryId)
        message.success(t('metric.directory.deleteSuccess'))
        fetchDirectories(Number(projectId))
      }
    }
    catch {
      message.error(t('common.operationFailed'))
    }
  }

  // 目录表格列
  const columns = [
    {
      title: t('metric.directory.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: unknown) => {
        const r = record as { id: number }
        return (
          <a
            onClick={() =>
              navigate(`/project/${projectId}/metrics/directories/${r.id}`)}
          >
            {text}
          </a>
        )
      },
    },
    {
      title: t('metric.directory.description'),
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string) => text || '-',
    },
    {
      title: t('metric.directory.metricCount'),
      dataIndex: 'metric_count',
      key: 'metric_count',
      width: 120,
      render: (count: number) => count || 0,
    },
    {
      title: t('metric.directory.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString() : '-'),
    },
    {
      title: t('common.actions'),
      key: 'action',
      width: 180,
      render: (_: unknown, record: unknown) => {
        const r = record as { id: number }
        return (
          <Space size="small">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleEditDirectory(record)}
            >
              {t('common.edit')}
            </Button>
            <Popconfirm
              title={t('metric.directory.deleteConfirm')}
              onConfirm={() => handleDeleteDirectory(r.id)}
            >
              <Button type="link" danger icon={<DeleteOutlined />}>
                {t('common.delete')}
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <div className="metric-directory-management-container lab-list-page-shell">
      <div
        className="flex justify-between items-center mb-4"
      >
        <Title level={4} className="m-0">
          {t('metric.directory.title') || '指标目录管理'}
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddDirectory}
        >
          {t('metric.directory.add')}
        </Button>
      </div>
      <Table
        dataSource={directories}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize: 10,
          showTotal: (total) =>
            `${t('common.total') || '共'} ${total} ${
              t('metric.directories') || '个目录'
            }`,
        }}
        locale={{
          emptyText: t('metric.directory.noDirectories') || '暂无目录数据',
        }}
      />

      {/* 目录表单模态框 */}
      <Modal
        title={
          editingDirectory
            ? t('metric.directory.edit')
            : t('metric.directory.add')
        }
        open={isDirectoryModalVisible}
        onCancel={() => setIsDirectoryModalVisible(false)}
        onOk={() => directoryForm.submit()}
        confirmLoading={loading}
      >
        <Form
          form={directoryForm}
          layout="vertical"
          onFinish={handleDirectorySubmit}
        >
          <Form.Item
            name="name"
            label={t('metric.directory.name')}
            rules={[
              { required: true, message: t('metric.directory.nameRequired') },
            ]}
          >
            <Input
              placeholder={
                t('metric.directory.nameRequired') || '请输入目录名称'
              }
            />
          </Form.Item>
          <Form.Item
            name="description"
            label={t('metric.directory.description')}
          >
            <Input.TextArea
              placeholder={
                t('metric.directory.description') || '请输入目录描述（可选）'
              }
              rows={3}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default MetricDirectoryManagement
