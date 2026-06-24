import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Input,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  FolderOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import debounce from 'lodash-es/debounce'
import { DeepSearchTable, createAxiosLikeRequestAdapter } from '@deep/deep-search-table'
import type { CrudNormalizedResponse, DeepSearchTableConfig, DeepSearchTableRef } from '@deep/deep-search-table'
import type { FileFolder } from '../../services/fileManagementService'
import { fileManagementService } from '../../services/fileManagementService'
import apiClient from '../../services/apiClient'
import CreateFolderModal from './components/CreateFolderModal'
import { calculatePageAfterDelete } from '@/utils/paginationUtils.ts'
import './index.css'

const { Title, Text } = Typography

const FileManagement: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const tableRef = useRef<DeepSearchTableRef<FileFolder>>(null)
  const submitSearchRef = useRef<(() => void) | null>(null)
  const submitSearch = useMemo(
    () => debounce(() => submitSearchRef.current?.(), 300),
    [],
  )
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [pageState, setPageState] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  })

  useEffect(() => {
    return () => submitSearch.cancel()
  }, [submitSearch])

  const handleSearchChange = useCallback((form: { submit: () => void }) => {
    submitSearchRef.current = () => form.submit()
    submitSearch()
  }, [submitSearch])

  // 处理创建文件夹
  const handleCreateFolder = () => {
    setCreateModalVisible(true)
  }

  // 处理进入文件夹详情
  const handleEnterFolder = (folderId: number) => {
    navigate(`/project/${projectId}/file-management/${folderId}`)
  }

  // 处理删除文件夹
  const handleDeleteFolder = async (folderId: number) => {
    try {
      await fileManagementService.deleteFolders([folderId])
      message.success('删除成功')

      const targetPage = calculatePageAfterDelete(
        pageState.current,
        pageState.pageSize,
        pageState.total,
        1,
      )

      if (targetPage !== pageState.current) {
        tableRef.current?.setPage(targetPage, pageState.pageSize)
      }
      else {
        await tableRef.current?.reload()
      }
    }
    catch {
      // message.error(error?.response?.data?.message || "删除失败");
    }
  }

  const handleDataLoaded = useCallback((payload: CrudNormalizedResponse<FileFolder>) => {
    setPageState({
      current: payload.page ?? 1,
      pageSize: payload.pageSize ?? 10,
      total: payload.total,
    })
  }, [])

  // 表格列定义

  const columns = [
    {
      title: '文件夹名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (text: string) => (
        <div className="flex items-center gap-2 min-w-0">
          <FolderOutlined className="text-[var(--lab-color-brand-primary)] shrink-0" />
          <Tooltip title={text}>
            <span className="truncate min-w-0">{text}</span>
          </Tooltip>
        </div>
      ),
    },
    {
      title: '文件夹描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text: string | null) => {
        const displayText = text || '-'
        return (
          <Tooltip title={text || undefined}>
            <span className="truncate block min-w-0">{displayText}</span>
          </Tooltip>
        )
      },
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      render: (text: string | null) => (
        <Tag color="blue">{text || '-'}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => dayjs(text).format('YYYY/MM/DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: any, record: FileFolder) => (
        <Space>
          <Button
            type="link"
            size="small"
            onClick={() => handleEnterFolder(record.id)}
          >
            文件管理
          </Button>
          <Popconfirm
            title="确定要删除这个文件夹吗？"
            description="删除后无法恢复，且只有空文件夹才能删除"
            onConfirm={() => handleDeleteFolder(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const tableConfig: DeepSearchTableConfig<FileFolder> = {
    title: (
      <div className="file-management-title-block">
        <Title level={4} className="file-management-title">
          文件管理
        </Title>
        <Text type="secondary" className="file-management-description">
          管理各类的文件，支持多种格式上传、下载。
        </Text>
      </div>
    ),
    rowKey: 'id',
    columns,
    searchFields: [
      {
        key: 'name',
        label: '文件夹名称',
        type: 'custom',
        render: ({ form }) => (
          <Input
            allowClear
            prefix={<SearchOutlined />}
            className="file-management-search-input"
            placeholder="搜索文件夹名称"
            onChange={() => handleSearchChange(form)}
          />
        ),
      },
    ],
    extraActions: [
      {
        key: 'refresh',
        label: '刷新',
        placement: 'beforeReset',
        className: 'file-management-refresh-button',
      },
      {
        key: 'create',
        label: '创建文件夹',
        type: 'primary',
        icon: <PlusOutlined />,
        className: 'file-management-create-button',
      },
    ],
    actionHandlers: {
      refresh: async ({ reload }) => {
        await reload()
      },
      create: () => {
        handleCreateFolder()
      },
    },
    request: {
      url: '/file-management/folders',
      method: 'GET',
      requestAdapter: createAxiosLikeRequestAdapter(apiClient),
      buildParams: (payload) => ({
        project_id: Number(projectId),
        name: payload.searchValues.name,
        page: payload.page,
        size: payload.pageSize,
      }),
    },
    responseMapper: (response: { data?: { items?: FileFolder[], total?: number | string, page?: number | string, size?: number | string } }) => ({
      list: response?.data?.items ?? [],
      total: Number(response?.data?.total ?? 0),
      page: Number(response?.data?.page ?? 1),
      pageSize: Number(response?.data?.size ?? 10),
      raw: response,
    }),
    queryConfig: {
      key: 'fileFolders',
      enabled: !!projectId,
    },
    pagination: {
      current: 1,
      pageSize: 10,
    },
    showSearchButton: false,
    searchButtonText: '搜索',
    resetButtonText: '重置',
    onDataLoaded: handleDataLoaded,
    tableProps: {
      scroll: { x: 800 },
      size: 'middle',
    },
  }

  return (
    <div className="file-management-container">
      <DeepSearchTable<FileFolder>
        ref={tableRef}
        config={tableConfig}
      />

      {/* 创建文件夹模态框 */}
      <CreateFolderModal
        visible={createModalVisible}
        projectId={Number(projectId)}
        onCancel={() => setCreateModalVisible(false)}
        onSuccess={() => {
          setCreateModalVisible(false)
          void tableRef.current?.reload()
        }}
      />
    </div>
  )
}

export default FileManagement
