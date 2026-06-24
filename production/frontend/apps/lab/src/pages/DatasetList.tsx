import React, { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Dropdown,
  Form,
  Menu,
  Modal,
  Space,
  Table,
  message,
} from 'antd'
import {
  DeleteOutlined,
  DownOutlined,
  FolderOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { UploadProps } from 'antd/es/upload/interface'
import type { RcFile } from 'antd/es/upload'
import { useTranslation } from 'react-i18next'
import type { Dataset } from '../types/dataset'
import { datasetApi, datasetDirectoryApi } from '../services/api'
import { useProjectStore } from '../stores/projectStore'

import { TruncatedText } from '../components/dataset-list/TruncatedText'
import { SearchForm } from '../components/dataset-list/SearchForm'
import { CreateDatasetModal } from '../components/dataset-list/CreateDatasetModal'
import { ImportXlsxModal } from '../components/dataset-list/ImportXlsxModal'
import { useDatasetOperations } from '../hooks/dataset/useDatasetOperations'

interface SearchParams {
  project_id: number
  skip: number
  limit: number
  question?: string
  tag_match_type?: 'any' | 'all'
  sort_by?: 'created_at' | 'updated_at' | 'question'
  sort_order?: 'desc' | 'asc'
  directory_id?: number | null
  created_after?: string
  created_before?: string
}

const DatasetList = () => {
  const { t } = useTranslation()
  const { projectId, directoryId } = useParams<{
    projectId: string
    directoryId: string
  }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchForm] = Form.useForm()
  const [createForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const queryClient = useQueryClient()
  const currentProject = useProjectStore((state) => state.currentProject)

  // 优先使用URL中的projectId，如果没有则使用store中的
  const numericProjectId = projectId
    ? parseInt(projectId, 10)
    : currentProject?.id

  // 获取URL参数中的目录ID，优先使用路由参数
  const routeDirectoryId = directoryId ? parseInt(directoryId, 10) : null
  const queryParams = new URLSearchParams(location.search)
  const queryDirectoryId = queryParams.get('directoryId')
  const initialDirectoryId
    = routeDirectoryId
      || (queryDirectoryId ? parseInt(queryDirectoryId, 10) : null)

  // 获取当前目录信息（如果指定了目录ID）
  const { data: currentDirectory } = useQuery({
    queryKey: ['directory', numericProjectId, initialDirectoryId],
    queryFn: () => {
      if (!initialDirectoryId) return null
      return datasetDirectoryApi
        .get(numericProjectId, initialDirectoryId)
        .then((response) => response || null)
    },
    enabled: !!numericProjectId && !!initialDirectoryId,
  })

  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [currentDataset, setCurrentDataset] = useState<
    | (Dataset & {
      keyValues?: { key: string, value: string }[]
    })
    | null
  >(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [importXlsxModalVisible, setImportXlsxModalVisible] = useState(false)
  const [importXlsxFile, setImportXlsxFile] = useState<RcFile | null>(null)

  // 使用ref来跟踪是否已经初始化，避免重复请求
  const isInitializedRef = useRef(false)
  // 使用ref来跟踪上一次的projectId，避免不必要的重新请求
  const prevProjectIdRef = useRef<number | undefined>(undefined)

  // 搜索参数
  const [searchParams, setSearchParams] = useState<SearchParams>({
    project_id: numericProjectId,
    skip: 0,
    limit: 10,
    sort_by: 'created_at',
    sort_order: 'desc',
    directory_id: initialDirectoryId,
  })

  // 获取数据集列表 - 优化React Query配置
  const { data: response = { items: [], total: 0 }, isLoading } = useQuery({
    queryKey: ['datasets', 'list', searchParams],
    queryFn: async () => {
      const result = await datasetApi.list(
        searchParams.project_id,
        searchParams.directory_id,
        {
          question: searchParams.question,
          sort_by: searchParams.sort_by,
          sort_order: searchParams.sort_order,
          created_after: searchParams.created_after,
          created_before: searchParams.created_before,
          page:
            Math.floor((searchParams.skip || 0) / (searchParams.limit || 10))
            + 1,
          size: searchParams.limit,
        },
      )
      return result
    },
    enabled: !!numericProjectId && isInitializedRef.current,
    staleTime: 1000 * 60 * 5, // 5分钟内不重新获取
    refetchOnWindowFocus: false, // 窗口获取焦点时不重新获取
    refetchOnMount: false, // 组件挂载时不自动重新获取
  })

  const datasets = response.items
  const total = response.total

  // 使用自定义hooks
  const {
    createDataset,
    deleteDataset,
    batchDeleteDatasets,
    updateDataset,
    importXlsx,
    exportXlsx,
  } = useDatasetOperations(numericProjectId, routeDirectoryId)

  // 处理分页变化
  const handlePageChange = (page: number, pageSize: number) => {
    const newParams = {
      ...searchParams,
      skip: (page - 1) * pageSize,
      limit: pageSize,
    }
    setSearchParams(newParams)
    isInitializedRef.current = true // 确保查询启用
  }

  // 处理搜索
  const handleSearch = (values: any) => {
    const { question, sort_by, sort_order } = values
    const newParams = {
      ...searchParams,
      project_id: numericProjectId,
      question,
      sort_by: sort_by || 'created_at',
      sort_order: sort_order || 'desc',
      skip: 0, // 重置分页
      limit: searchParams.limit, // 保持每页条数不变
      directory_id: searchParams.directory_id, // 保持当前目录ID
    }
    setSearchParams(newParams)
    isInitializedRef.current = true // 确保查询启用
  }

  // 处理重置
  const handleReset = () => {
    searchForm.resetFields()
    setSearchParams({
      project_id: numericProjectId,
      skip: 0,
      limit: 10,
      sort_by: 'created_at',
      sort_order: 'desc',
      directory_id: initialDirectoryId,
    })
    isInitializedRef.current = true // 确保查询启用
  }

  // 处理创建数据集
  const handleCreateDataset = (values: any) => {
    // 将动态表单的key-value对转换为JSON对象
    const meta_info = (values.keyValues || []).reduce(
      (acc: Record<string, any>, item: any) => {
        if (item.key && item.value) {
          let parsedValue = item.value
          if (!isNaN(Number(item.value))) {
            parsedValue = Number(item.value)
          }
          else if (item.value.toLowerCase() === 'true') {
            parsedValue = true
          }
          else if (item.value.toLowerCase() === 'false') {
            parsedValue = false
          }
          acc[item.key] = parsedValue
        }
        return acc
      },
      {},
    )

    createDataset.mutate(
      {
        question: values.question,
        meta_info,
        ground_truth: values.ground_truth,
        context: values.context,
        directory_id: values.directory_id,
        retrieval_context: values.retrieval_context,
        expected_tools: values.expected_tools,
        comments: values.comments,
      },
      {
        onSuccess: () => {
          setIsModalVisible(false)
          createForm.resetFields()
          // 创建成功后重新获取数据
          isInitializedRef.current = true
          queryClient.invalidateQueries({ queryKey: ['datasets', 'list'] })
        },
      },
    )
  }

  // 处理删除数据集
  const handleDeleteDataset = (id: number) => {
    Modal.confirm({
      title: t('dataset.deleteConfirm'),
      content: t('dataset.deleteContent'),
      okText: t('dataset.deleteOk'),
      cancelText: t('dataset.deleteCancel'),
      onOk: async () => {
        try {
          await deleteDataset.mutate(id, {
            onSuccess: () => {
              // 删除成功后重新获取数据
              isInitializedRef.current = true
              queryClient.invalidateQueries({
                queryKey: ['datasets', 'list'],
              })
              message.success(t('dataset.deleteSuccess'))
            },
          })
        }
        catch (error) {
          console.error('Error deleting dataset:', error)
          message.error(t('dataset.deleteFailed'))
        }
      },
    })
  }

  // 处理批量删除
  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t('dataset.batchDeleteWarning'))
      return
    }

    Modal.confirm({
      title: t('dataset.batchDeleteConfirm'),
      content: t('dataset.batchDeleteContent'),
      okText: t('dataset.batchDeleteOk'),
      cancelText: t('dataset.batchDeleteCancel'),
      onOk: async () => {
        try {
          await batchDeleteDatasets.mutate(
            selectedRowKeys.map((key) => Number(key)),
            {
              onSuccess: () => {
                setSelectedRowKeys([])
                // 删除成功后重新获取数据
                isInitializedRef.current = true
                queryClient.invalidateQueries({
                  queryKey: ['datasets', 'list'],
                })
                message.success(t('dataset.deleteSuccess'))
              },
            },
          )
        }
        catch (error) {
          console.error('Error batch deleting datasets:', error)
          message.error(t('dataset.deleteFailed'))
        }
      },
    })
  }

  // 处理编辑数据集
  const handleEditDataset = (record: Dataset) => {
    // meta_info 转换为 keyValues 数组
    let keyValues: { key: string, value: string }[] = []
    if (record.meta_info && typeof record.meta_info === 'object') {
      keyValues = Object.entries(record.meta_info).map(([key, value]) => ({
        key,
        value: value == null ? '' : String(value),
      }))
    }
    setCurrentDataset({ ...record, keyValues })
    editForm.setFieldsValue({
      ...record,
      keyValues,
    })
    setIsEditModalVisible(true)
  }

  // 处理更新数据集
  const handleUpdateDataset = (values: any) => {
    if (!currentDataset) return

    let metaInfo = {}
    try {
      metaInfo = values.meta_info ? JSON.parse(values.meta_info) : {}
    }
    catch (error) {
      message.error(t('dataset.metaInfoFormatError'))
      return
    }

    updateDataset.mutate(
      {
        datasetId: currentDataset.id,
        data: {
          question: values.question,
          ground_truth: values.ground_truth,
          output: values.output,
          context: values.context,
          meta_info: metaInfo,
          directory_id: values.directory_id,
          retrieval_context: values.retrieval_context,
          expected_tools: values.expected_tools,
          comments: values.comments,
        },
      },
      {
        onSuccess: () => {
          setIsEditModalVisible(false)
          setCurrentDataset(null)
          // 更新成功后重新获取数据
          isInitializedRef.current = true
          queryClient.invalidateQueries({ queryKey: ['datasets', 'list'] })
        },
      },
    )
  }

  // 处理导入XLSX
  const handleImportXlsx = async () => {
    if (!importXlsxFile) {
      message.error(t('dataset.importXlsxWarning'))
      return
    }

    // 直接使用当前目录ID
    importXlsx.mutate(
      {
        file: importXlsxFile,
        directoryId: initialDirectoryId || 0,
      },
      {
        onSuccess: () => {
          setImportXlsxModalVisible(false)
          setImportXlsxFile(null)
          // 导入成功后重新获取数据
          isInitializedRef.current = true
          queryClient.invalidateQueries({ queryKey: ['datasets', 'list'] })
        },
      },
    )
  }

  // XLSX上传配置
  const xlsxUploadProps: UploadProps = {
    beforeUpload: (file) => {
      if (!file.name.endsWith('.xlsx')) {
        message.error(t('dataset.importXlsxFormatWarning'))
        return false
      }
      setImportXlsxFile(file)
      return false
    },
    onRemove: () => {
      setImportXlsxFile(null)
    },
    fileList: importXlsxFile ? [importXlsxFile] : [],
  }

  // 合并所有useEffect，统一处理初始化和项目变更
  useEffect(() => {
    // 获取URL参数中的目录ID
    const queryDirectoryId = directoryId || queryParams.get('directoryId')
    const dirId = queryDirectoryId
      ? parseInt(String(queryDirectoryId), 10)
      : null

    // 只有当projectId变化或目录ID变化时才重新初始化
    if (
      numericProjectId
      && (prevProjectIdRef.current !== numericProjectId
        || initialDirectoryId !== dirId)
    ) {
      console.log('Project or directory changed, initializing data fetch')

      // 更新上一次的projectId
      prevProjectIdRef.current = numericProjectId

      // 重置搜索参数
      const initialParams: SearchParams = {
        project_id: numericProjectId,
        skip: 0,
        limit: 10,
        sort_by: 'created_at',
        sort_order: 'desc',
        directory_id: dirId,
      }

      // 重置表单
      searchForm.resetFields()

      // 更新搜索参数状态
      setSearchParams(initialParams)

      // 初始化数据获取
      const fetchInitialData = async () => {
        try {
          console.log('Fetching initial data with params:', initialParams)
          const result = await datasetApi.list(
            initialParams.project_id,
            initialParams.directory_id,
            {
              question: initialParams.question,
              sort_by: initialParams.sort_by,
              sort_order: initialParams.sort_order,
              created_after: initialParams.created_after,
              created_before: initialParams.created_before,
              page: 1,
              size: initialParams.limit,
            },
          )
          // 更新React Query缓存
          queryClient.setQueryData(['datasets', 'list', initialParams], result)
          // 标记为已初始化，允许后续查询
          isInitializedRef.current = true
        }
        catch (error) {
          console.error('Error fetching initial data:', error)
        }
      }

      fetchInitialData()
    }

    // 组件卸载时的清理
    return () => {
      searchForm.resetFields()
    }
  }, [numericProjectId, directoryId, location.search, queryClient, searchForm])

  // 导航到数据集目录管理页面
  const navigateToDirectories = () => {
    navigate(`/project/${numericProjectId}/datasets`)
  }

  // 返回到数据集列表
  const navigateBackToDatasets = () => {
    navigate(`/project/${numericProjectId}/datasets`)
  }

  if (!currentProject) {
    return null
  }

  const columns = [
    {
      title: t('dataset.nameLabel'),
      dataIndex: 'question',
      key: 'question',
      width: 200,
      render: (text: string) => (
        <TruncatedText
          text={text}
          maxLength={50}
          modalTitle={t('dataset.questionModalTitle')}
        />
      ),
    },
    {
      title: t('dataset.groundTruth'),
      dataIndex: 'ground_truth',
      key: 'ground_truth',
      width: 200,
      render: (text: string) => (
        <TruncatedText text={text} modalTitle={t('dataset.groundTruth')} />
      ),
    },
    {
      title: t('dataset.context'),
      dataIndex: 'context',
      key: 'context',
      width: 200,
      render: (context: string[] | string) => {
        if (Array.isArray(context)) {
          return context.length > 0 ? (
            <>
              {context.map((c, idx) => (
                <div>
                  <TruncatedText
                    key={idx}
                    text={c}
                    modalTitle={t('dataset.context')}
                  />
                </div>
              ))}
            </>
          ) : (
            '-'
          )
        }
        return context ? (
          <TruncatedText text={context} modalTitle={t('dataset.context')} />
        ) : (
          '-'
        )
      },
    },
    {
      title: t('dataset.retrievalContext', '召回上下文'),
      dataIndex: 'retrieval_context',
      key: 'retrieval_context',
      width: 200,
      render: (retrieval_context: string[] | string) => {
        if (Array.isArray(retrieval_context)) {
          return retrieval_context.length > 0 ? (
            <>
              {retrieval_context.map((c, idx) => (
                <div>
                  <TruncatedText
                    key={idx}
                    text={c}
                    modalTitle={t('dataset.retrievalContext', '召回上下文')}
                  />
                </div>
              ))}
            </>
          ) : (
            '-'
          )
        }
        return retrieval_context ? (
          <TruncatedText
            text={retrieval_context}
            modalTitle={t('dataset.retrievalContext', '召回上下文')}
          />
        ) : (
          '-'
        )
      },
    },
    {
      title: t('dataset.toolsCalled', '期望调用工具'),
      dataIndex: 'expected_tools',
      key: 'expected_tools',
      width: 200,
      render: (expected_tools: { name: string }[] | string) => {
        if (Array.isArray(expected_tools)) {
          return expected_tools.length > 0 ? (
            <Space wrap>
              {expected_tools.map((tool, idx) => (
                <TruncatedText
                  key={idx}
                  text={tool.name}
                  modalTitle={t('dataset.toolsCalled', '期望调用工具')}
                />
              ))}
            </Space>
          ) : (
            '-'
          )
        }
        return expected_tools ? (
          <TruncatedText
            text={expected_tools}
            modalTitle={t('dataset.toolsCalled', '期望调用工具')}
          />
        ) : (
          '-'
        )
      },
    },
    {
      title: t('dataset.remark', '备注'),
      dataIndex: 'remark',
      key: 'remark',
      width: 200,
      render: (text: string) =>
        text ? (
          <TruncatedText text={text} modalTitle={t('dataset.remark', '备注')} />
        ) : (
          '-'
        ),
    },
    {
      title: t('dataset.updatedAt'),
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: t('dataset.actions'),
      key: 'action',
      fixed: 'right' as const,
      width: 150,
      render: (_: unknown, record: Dataset) => (
        <Space size="middle">
          <Button type="link" onClick={() => handleEditDataset(record)}>
            {t('dataset.edit')}
          </Button>
          <Button
            type="link"
            danger
            onClick={() => handleDeleteDataset(record.id)}
          >
            {t('dataset.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys)
    },
  }

  return (
    <div className="dataset-list-container lab-list-page-shell">
      <div
        className="flex items-center justify-between"
      >
        <div className="mb-4">
          <span className="text-[20px] font-medium">
            {initialDirectoryId ? currentDirectory?.name || t('dataset.datasetList') : t('dataset.datasetList')}
          </span>
        </div>
        {!initialDirectoryId && (
          <Button
            type="primary"
            icon={<FolderOutlined />}
            onClick={navigateToDirectories}
          >
            {t('dataset.manageDirectories')}
          </Button>
        )}
      </div>

      <SearchForm
        onSearch={handleSearch}
        onReset={handleReset}
        form={searchForm}
      />
      <div
        className="mb-4 flex justify-between"
      >
        <Space>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={handleBatchDelete}
            disabled={selectedRowKeys.length === 0}
          >
            {t('dataset.batchDelete')}
          </Button>
        </Space>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              createForm.resetFields()
              createForm.setFieldValue('directory_id', initialDirectoryId)
              setIsModalVisible(true)
            }}
          >
            {t('dataset.add')}
          </Button>
          <Dropdown
            overlay={(
              <Menu>
                <Menu.Item
                  key="import"
                  onClick={() => setImportXlsxModalVisible(true)}
                >
                  导入数据集
                </Menu.Item>
                <Menu.Item
                  key="export"
                  onClick={() => {
                    exportXlsx({
                      project_id: projectId,
                      ...searchParams,
                    })
                  }}
                >
                  导出数据集
                </Menu.Item>
              </Menu>
            )}
          >
            <Button type="primary">
              操作
              {' '}
              <DownOutlined />
            </Button>
          </Dropdown>
        </Space>
      </div>

      <div className="w-full overflow-x-auto">
        <Table
          columns={columns}
          dataSource={datasets}
          rowKey="id"
          loading={isLoading}
          pagination={{
            total,
            pageSize: searchParams.limit,
            current: Math.floor(searchParams.skip / searchParams.limit) + 1,
            onChange: handlePageChange,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => t('dataset.totalItems', { total }),
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          rowSelection={rowSelection}
          scroll={{ x: 'max-content' }}
          className="w-full overflow-x-auto"
        />
      </div>

      <CreateDatasetModal
        visible={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onSubmit={handleCreateDataset}
        form={createForm}
        loading={createDataset.isPending}
        projectId={numericProjectId}
        currentDirectoryId={initialDirectoryId}
      />

      <CreateDatasetModal
        visible={isEditModalVisible}
        onCancel={() => {
          setIsEditModalVisible(false)
          setCurrentDataset(null)
          editForm.resetFields()
        }}
        onSubmit={handleUpdateDataset}
        form={editForm}
        loading={updateDataset.isPending}
        projectId={numericProjectId}
        dataset={currentDataset}
      />

      <ImportXlsxModal
        visible={importXlsxModalVisible}
        onCancel={() => {
          setImportXlsxModalVisible(false)
          setImportXlsxFile(null)
        }}
        onImport={handleImportXlsx}
        onDownloadTemplate={() => datasetApi.getXlsxTemplate()}
        uploadProps={xlsxUploadProps}
        importFile={importXlsxFile}
        importing={importXlsx.isPending}
      />
    </div>
  )
}

export default DatasetList
