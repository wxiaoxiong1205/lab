import React, { useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  Descriptions,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type {
  FileManagementFile } from '../../services/fileManagementService'
import {
  FileFolder,
  fileManagementService,
} from '../../services/fileManagementService'
import { downloadBlobFile, extractFilenameFromHeaders } from '../../utils/download'
import UploadFileModal from './components/UploadFileModal'

const { Title, Text } = Typography

const FolderDetail: React.FC = () => {
  const { projectId, folderId } = useParams<{
    projectId: string
    folderId: string
  }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [uploadModalVisible, setUploadModalVisible] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // 获取文件夹详情
  const { data: folderDetail, isLoading: folderLoading } = useQuery({
    queryKey: ['fileFolderDetail', folderId],
    queryFn: async () => {
      if (!folderId) {
        throw new Error('文件夹ID不存在')
      }
      const response = await fileManagementService.getFolderDetail(
        Number(folderId),
      )
      return response
    },
    enabled: !!folderId,
  })

  // 获取文件列表
  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: [
      'fileManagementFiles',
      projectId,
      folderId,
      currentPage,
      pageSize,
    ],
    queryFn: async () => {
      if (!projectId) {
        throw new Error('项目ID不存在')
      }
      const response = await fileManagementService.getFiles({
        project_id: Number(projectId),
        folder_id: folderId ? Number(folderId) : undefined,
        page: currentPage,
        size: pageSize,
      })
      return response
    },
    enabled: !!projectId,
  })

  const files = filesData?.items || []
  const total = filesData?.total || 0

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`
  }

  // 获取文件类型（从文件名提取后缀）
  const getFileType = (fileName: string) => {
    const lastDot = fileName.lastIndexOf('.')
    if (lastDot === -1) return '-'
    return fileName.substring(lastDot)
  }

  // 处理上传文件
  const handleUploadFile = () => {
    setUploadModalVisible(true)
  }

  // 处理下载文件
  const handleDownloadFile = async (fileId: number) => {
    try {
      const response = await fileManagementService.downloadFiles(fileId)

      // 从响应头提取文件名
      const filename = extractFilenameFromHeaders(response.headers)

      // 创建 Blob 并下载
      const blob = new Blob([response.data])
      downloadBlobFile(blob, filename || undefined)

      message.success('下载成功')
    }
    catch (error: any) {
      // message.error(error?.response?.data?.message || "下载失败");
    }
  }

  // 处理批量下载
  const handleBatchDownload = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要下载的文件')
      return
    }
    try {
      const response = await fileManagementService.downloadFiles(
        selectedRowKeys as number[],
      )

      // 从响应头提取文件名
      const filename = extractFilenameFromHeaders(response.headers)

      // 批量下载返回的是ZIP文件
      const blob = new Blob([response.data], { type: 'application/zip' })
      downloadBlobFile(blob, filename || undefined)

      message.success('批量下载成功')
    }
    catch (error: any) {
      // message.error(error?.response?.data?.message || "批量下载失败");
    }
  }

  // 处理删除文件
  const handleDeleteFile = async (fileId: number) => {
    try {
      await fileManagementService.deleteFiles([fileId])
      message.success('删除成功')

      const newTotal = total - 1
      const maxPage = Math.ceil(newTotal / pageSize) || 1
      if (currentPage > maxPage) {
        setCurrentPage(maxPage)
      }

      queryClient.invalidateQueries({
        queryKey: ['fileManagementFiles', projectId, folderId],
      })
      queryClient.invalidateQueries({
        queryKey: ['fileFolderDetail', folderId],
      })
    }
    catch (error: any) {
      message.error(error?.response?.data?.message || '删除失败')
    }
  }

  // 处理批量删除
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的文件')
      return
    }
    try {
      await fileManagementService.deleteFiles(selectedRowKeys as number[])
      message.success('批量删除成功')
      setSelectedRowKeys([])

      // 计算删除后的最大页码
      const deleteCount = selectedRowKeys.length
      const newTotal = total - deleteCount
      const maxPage = Math.ceil(newTotal / pageSize) || 1

      // 如果当前页大于最大页，则跳转到最大页（或第一页）
      if (currentPage > maxPage) {
        setCurrentPage(maxPage)
      }

      queryClient.invalidateQueries({
        queryKey: ['fileManagementFiles', projectId, folderId],
      })
      queryClient.invalidateQueries({
        queryKey: ['fileFolderDetail', folderId],
      })
    }
    catch (error: any) {
      message.error(error?.response?.data?.message || '批量删除失败')
    }
  }

  // 表格列定义
  const columns = [
    {
      title: '文件名称',
      dataIndex: 'file_name',
      key: 'file_name',
      render: (text: string) => (
        <Space>
          <FileOutlined className="text-[var(--lab-color-brand-primary)]" />
          <span>{text}</span>
        </Space>
      ),
    },
    {
      title: '文件大小',
      dataIndex: 'file_size',
      key: 'file_size',
      render: (size: number) => formatFileSize(size),
    },
    {
      title: '文件类型',
      key: 'file_type',
      render: (_: any, record: FileManagementFile) =>
        getFileType(record.file_name),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: FileManagementFile) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleDownloadFile(record.id)}
          >
            下载
          </Button>
          <Popconfirm
            title="确定要删除这个文件吗？"
            description="删除后无法恢复"
            onConfirm={() => handleDeleteFile(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="folder-detail-container lab-list-page-shell">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(-1)}
        className="mb-4"
      >
        返回
      </Button>

      {/* 基本信息卡片 */}
      <Card title="基本信息" className="mb-4" loading={folderLoading}>
        {folderDetail && (
          <Descriptions column={2}>
            <Descriptions.Item label="文件夹名称">
              {folderDetail.name}
            </Descriptions.Item>
            <Descriptions.Item label="创建人">
              <Tag color="blue">{folderDetail.created_by || '-'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="文件夹描述">
              {folderDetail.description || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {dayjs(folderDetail.created_at).format('YYYY/MM/DD')}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {/* 文件信息卡片 */}
      <Card
        title="文件信息"
        className="mt-5"
        extra={(
          <Space>
            {selectedRowKeys.length > 0 && (
              <>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleBatchDownload}
                >
                  批量下载
                </Button>
                <Popconfirm
                  title="确定要批量删除这些文件吗？"
                  description="删除后无法恢复"
                  onConfirm={handleBatchDelete}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button danger icon={<DeleteOutlined />}>
                    批量删除
                  </Button>
                </Popconfirm>
              </>
            )}
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={handleUploadFile}
            >
              上传文件
            </Button>
          </Space>
        )}
      >
        {/* 文件列表表格 */}
        <Table
          columns={columns}
          dataSource={files}
          rowKey="id"
          loading={filesLoading}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, size) => {
              setCurrentPage(page)
              setPageSize(size)
            },
            onShowSizeChange: (current, size) => {
              setCurrentPage(1)
              setPageSize(size)
            },
          }}
          scroll={{ x: 800 }}
          size="middle"
        />
      </Card>

      {/* 上传文件模态框 */}
      <UploadFileModal
        visible={uploadModalVisible}
        projectId={Number(projectId)}
        folderId={folderId ? Number(folderId) : undefined}
        onCancel={() => setUploadModalVisible(false)}
        onSuccess={() => {
          setUploadModalVisible(false)
          queryClient.invalidateQueries({
            queryKey: ['fileManagementFiles', projectId, folderId],
          })
          queryClient.invalidateQueries({
            queryKey: ['fileFolderDetail', folderId],
          })
        }}
      />
    </div>
  )
}

export default FolderDetail
