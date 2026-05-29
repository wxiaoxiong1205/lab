import React, { useEffect, useMemo, useState } from 'react'
import { Button, Card, Empty, Form, Input, Modal, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, FolderAddOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { getCurrentUser, usePermissionStore } from '../../services/permissionStore'

const { Title, Text } = Typography
const { TextArea } = Input

type FileFolderRecord = {
  id: string
  name: string
  description: string
  creator: string
  createdAt: string
}

type CreateFolderFormValues = {
  name?: string
  description?: string
}

type FolderFileRecord = {
  id: string
  name: string
  size: string
  type: string
}

const STORAGE_KEY = 'fastdata-file-management-folders'

const seedFolders: FileFolderRecord[] = [
  { id: 'folder-size-check', name: '文件大小校验', description: '-', creator: 'lab1', createdAt: '2026-05-21 15:46:23' },
  { id: 'folder-retry', name: '失败重试', description: '-', creator: 'deepexilab', createdAt: '2026-05-21 15:31:10' },
  { id: 'folder-cancel-upload', name: '取消上传验证', description: '-', creator: 'lab1', createdAt: '2026-05-21 14:58:42' },
  { id: 'folder-description', name: '描述测试', description: '# 推理结果集 |--...', creator: 'lab1', createdAt: '2026-05-20 19:22:16' },
  { id: 'folder-demo-111', name: '测试111', description: '-', creator: 'lab1', createdAt: '2026-05-20 18:40:03' },
  { id: 'folder-test7', name: 'test7', description: '-', creator: 'lab1', createdAt: '2026-05-20 17:26:38' },
]

const seedFolderFiles: FolderFileRecord[] = [
  { id: 'file-1', name: '文本生成偏好样例(alpaca)-制表符.xlsx', size: '24.43 KB', type: '.xlsx' },
  { id: 'file-2', name: '文本生成偏好样例(alpaca)-制表符.jsonl', size: '11.61 KB', type: '.jsonl' },
  { id: 'file-3', name: '文本生成偏好样例(alpaca)-制表符.json', size: '11.91 KB', type: '.json' },
  { id: 'file-4', name: '文本生成偏好样例(alpaca)-空格.xlsx', size: '24.43 KB', type: '.xlsx' },
  { id: 'file-5', name: '文本生成偏好样例(alpaca)-换行符.xlsx', size: '24.43 KB', type: '.xlsx' },
  { id: 'file-6', name: '文本生成偏好样例(alpaca)-空格.jsonl', size: '11.61 KB', type: '.jsonl' },
  { id: 'file-7', name: '文本生成偏好样例(alpaca)-空格.json', size: '11.91 KB', type: '.json' },
  { id: 'file-8', name: '文本生成偏好样例(alpaca)-换行符.jsonl', size: '11.61 KB', type: '.jsonl' },
  { id: 'file-9', name: '文本生成偏好样例(alpaca)-换行符.xlsx', size: '24.43 KB', type: '.xlsx' },
]

const pageCardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid #edf0f5',
  boxShadow: '0 8px 22px rgba(15, 23, 42, 0.03)',
}

function nowText() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function loadFolders(): FileFolderRecord[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) as FileFolderRecord[] : seedFolders
  } catch {
    return []
  }
}

function saveFolders(folders: FileFolderRecord[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(folders))
}

const FileManagement: React.FC = () => {
  const navigate = useNavigate()
  const { folderId } = useParams()
  const permissionState = usePermissionStore()
  const currentUser = getCurrentUser(permissionState)
  const [form] = Form.useForm<CreateFolderFormValues>()
  const [folders, setFolders] = useState<FileFolderRecord[]>(() => loadFolders())
  const [files, setFiles] = useState<FolderFileRecord[]>(seedFolderFiles)
  const [selectedFileIds, setSelectedFileIds] = useState<React.Key[]>([])
  const [searchDraft, setSearchDraft] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)

  useEffect(() => {
    saveFolders(folders)
  }, [folders])

  const filteredFolders = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase()
    if (!keyword) {
      return folders
    }

    return folders.filter(item => item.name.toLowerCase().includes(keyword))
  }, [folders, searchValue])

  const submitCreateFolder = async () => {
    const values = await form.validateFields()
    const name = values.name?.trim() ?? ''

    if (folders.some(item => item.name === name)) {
      message.warning('文件夹名称已存在')
      return
    }

    setFolders(previous => [
      {
        id: `folder-${Date.now()}`,
        name,
        description: values.description?.trim() || '-',
        creator: currentUser.username,
        createdAt: nowText(),
      },
      ...previous,
    ])
    setCreateModalOpen(false)
    form.resetFields()
    message.success('文件夹创建成功')
  }

  const deleteFolder = (record: FileFolderRecord) => {
    Modal.confirm({
      title: '确认删除文件夹？',
      content: `删除后 ${record.name} 将从文件管理列表移除。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        setFolders(previous => previous.filter(item => item.id !== record.id))
        if (folderId === record.id) {
          navigate('/file-management')
        }
        message.success('文件夹已删除')
      },
    })
  }

  const deleteFile = (record: FolderFileRecord) => {
    Modal.confirm({
      title: '确认删除文件？',
      content: `删除后 ${record.name} 将不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        setFiles(previous => previous.filter(item => item.id !== record.id))
        message.success('文件已删除')
      },
    })
  }

  const uploadFile = () => {
    const nextIndex = files.length + 1
    setFiles(previous => [
      {
        id: `file-${Date.now()}`,
        name: `上传文件-${nextIndex}.jsonl`,
        size: '10.24 KB',
        type: '.jsonl',
      },
      ...previous,
    ])
    message.success('文件上传成功')
  }

  const batchDownloadFiles = () => {
    if (!selectedFileIds.length) {
      return
    }
    message.success(`已开始下载 ${selectedFileIds.length} 个文件`)
  }

  const batchDeleteFiles = () => {
    if (!selectedFileIds.length) {
      return
    }

    Modal.confirm({
      title: '确认批量删除文件？',
      content: `将删除已选择的 ${selectedFileIds.length} 个文件，删除后不可恢复。`,
      okText: '批量删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        const selectedSet = new Set(selectedFileIds)
        setFiles(previous => previous.filter(item => !selectedSet.has(item.id)))
        setSelectedFileIds([])
        message.success('文件已批量删除')
      },
    })
  }

  const columns: ColumnsType<FileFolderRecord> = [
    {
      title: '文件夹名称',
      dataIndex: 'name',
      key: 'name',
      width: 280,
      render: value => <Text>{value}</Text>,
    },
    {
      title: '文件夹描述',
      dataIndex: 'description',
      key: 'description',
      width: 280,
      ellipsis: true,
    },
    {
      title: '创建人',
      dataIndex: 'creator',
      key: 'creator',
      width: 180,
      render: value => <Tag color="blue">{value}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 220,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size={14}>
          <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/file-management/${record.id}`)}>
            文件管理
          </Button>
          <Button type="link" danger style={{ padding: 0 }} onClick={() => deleteFolder(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const selectedFolder = useMemo(
    () => (folderId ? folders.find(item => item.id === folderId) ?? null : null),
    [folderId, folders],
  )

  const fileColumns: ColumnsType<FolderFileRecord> = [
    {
      title: '文件名称',
      dataIndex: 'name',
      key: 'name',
      render: value => <Text>{value}</Text>,
    },
    { title: '文件大小', dataIndex: 'size', key: 'size', width: 180 },
    { title: '文件类型', dataIndex: 'type', key: 'type', width: 180 },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space size={14}>
          <Button type="link" icon={<DownloadOutlined />} style={{ padding: 0 }}>
            下载
          </Button>
          <Button type="link" danger icon={<DeleteOutlined />} style={{ padding: 0 }} onClick={() => deleteFile(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  if (folderId) {
    if (!selectedFolder) {
      return (
        <div style={{ padding: '28px 32px 40px', minHeight: '100%', background: '#f6f7fb' }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/file-management')} style={{ marginBottom: 20 }}>
            返回
          </Button>
          <Card style={pageCardStyle}>
            <Empty description="文件夹不存在" />
          </Card>
        </div>
      )
    }

    return (
      <div style={{ padding: '28px 32px 40px', minHeight: '100%', background: '#f6f7fb' }}>
        <Card style={pageCardStyle} styles={{ body: { padding: '28px 36px 36px' } }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/file-management')} style={{ marginBottom: 28, paddingLeft: 0 }}>
            返回
          </Button>

          <Title level={4} style={{ marginTop: 0, marginBottom: 24 }}>
            基本信息
          </Title>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 22, columnGap: 80, maxWidth: 1100, marginBottom: 36 }}>
            <div>
              <Text type="secondary">文件夹名称：</Text>
              <Text>{selectedFolder.name}</Text>
            </div>
            <div>
              <Text type="secondary">创建人：</Text>
              <Tag color="blue" style={{ marginLeft: 4 }}>{selectedFolder.creator}</Tag>
            </div>
            <div>
              <Text type="secondary">文件夹描述：</Text>
              <Text>{selectedFolder.description || '-'}</Text>
            </div>
            <div>
              <Text type="secondary">创建时间：</Text>
              <Text>{selectedFolder.createdAt.split(' ')[0].replaceAll('-', '/')}</Text>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <Title level={4} style={{ margin: 0 }}>
              文件信息
            </Title>
            <Space>
              {selectedFileIds.length > 0 && (
                <>
                  <Button icon={<DownloadOutlined />} onClick={batchDownloadFiles}>
                    批量下载
                  </Button>
                  <Button danger icon={<DeleteOutlined />} onClick={batchDeleteFiles}>
                    批量删除
                  </Button>
                </>
              )}
              <Button type="primary" icon={<UploadOutlined />} onClick={uploadFile}>
                上传文件
              </Button>
            </Space>
          </div>

          <Table
            rowKey="id"
            rowSelection={{
              selectedRowKeys: selectedFileIds,
              onChange: nextKeys => setSelectedFileIds(nextKeys),
            }}
            columns={fileColumns}
            dataSource={files}
            pagination={false}
          />
        </Card>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px 40px', minHeight: '100%', background: '#f6f7fb' }}>
      <div style={{ marginBottom: 22 }}>
        <Title level={3} style={{ margin: 0 }}>
          文件管理
        </Title>
        <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 15 }}>
          管理各类的文件，支持多种格式上传、下载。
        </Text>
      </div>

      <Card style={pageCardStyle} styles={{ body: { padding: '28px 36px 36px' } }}>
        <div style={{ marginBottom: 18 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            文件夹名
          </Text>
          <Input
            allowClear
            placeholder="搜索文件夹名称"
            prefix={<SearchOutlined style={{ color: '#1f2937' }} />}
            value={searchDraft}
            onChange={event => {
              setSearchDraft(event.target.value)
              setSearchValue(event.target.value)
            }}
            style={{ width: 280 }}
          />
        </div>

        <Space style={{ marginBottom: 18 }}>
          <Button onClick={() => setSearchValue(searchDraft)}>刷新</Button>
          <Button
            onClick={() => {
              setSearchDraft('')
              setSearchValue('')
            }}
          >
            重置
          </Button>
          <Button type="primary" icon={<FolderAddOutlined />} onClick={() => setCreateModalOpen(true)}>
            创建文件夹
          </Button>
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredFolders}
          pagination={false}
          scroll={{ x: 1140 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无数据"
                style={{ padding: '56px 0 64px' }}
              />
            ),
          }}
        />
      </Card>

      <Modal
        title="创建文件夹"
        open={createModalOpen}
        okText="确定"
        cancelText="取消"
        onOk={submitCreateFolder}
        onCancel={() => {
          setCreateModalOpen(false)
          form.resetFields()
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="文件夹名称"
            name="name"
            rules={[
              { required: true, message: '请输入文件夹名称' },
              { max: 80, message: '文件夹名称不能超过 80 个字符' },
            ]}
          >
            <Input placeholder="请输入文件夹名称" />
          </Form.Item>
          <Form.Item label="文件夹描述" name="description" rules={[{ max: 300, message: '文件夹描述不能超过 300 个字符' }]}>
            <TextArea rows={4} maxLength={300} showCount placeholder="请输入文件夹描述" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default FileManagement
