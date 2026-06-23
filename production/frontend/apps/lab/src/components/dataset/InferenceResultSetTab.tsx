import React, { useEffect, useMemo, useState } from 'react'
import {
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Table,
  type TableColumnsType,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import debounce from 'lodash-es/debounce'
import './InferenceResultSetTab.css'
import TableToolbar from '@/components/common/TableToolbar'
import type { InferenceResultSetSearchParams } from '@/types/inference/index'
import { inferenceResultSetService } from '@/services/inferenceApi'
import { InferenceMethod, InferenceProgressStatus } from '@/types/inference/index'
import { calculatePageAfterDelete } from '@/utils/paginationUtils.ts'
import { getTablePagination } from '@/utils/tablePagination'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import { taskExecutionService } from '@/services/taskExecutionService'

const { Option } = Select
const { Text } = Typography

const DATASET_TYPE_LABELS: Record<string, string> = {
  'text-generation': '文本生成',
  'image-understanding': '图像理解',
}

// 搜索表单接口定义
interface SearchFormData {
  name?: string
  inference_method?: InferenceMethod
  data_usage?: string
  dataset_type?: string
}

interface InferenceResultSetTabProps {
  usage?: string
  projectId: number
}

const InferenceResultSetTab: React.FC<InferenceResultSetTabProps> = ({
  usage,
  projectId,
}) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({})

  const [isEdit, setIsEdit] = useState<boolean>(false)

  // 状态管理
  const [searchForm] = Form.useForm()
  const [searchParams, setSearchParams] = useState<InferenceResultSetSearchParams>({
    page: 1,
    size: 10,
    ...(usage ? { usage } : {}),
  })
  const submitSearch = useMemo(
    () => debounce(() => searchForm.submit(), 300),
    [searchForm],
  )
  const debouncedNameSearch = useMemo(
    () => debounce((value: string) => {
      const name = value.trim()
      setSearchParams((prev) => ({
        ...prev,
        name: name || undefined,
        page: 1,
      }))
    }, 300),
    [],
  )
  useEffect(() => {
    return () => {
      submitSearch.cancel()
      debouncedNameSearch.cancel()
    }
  }, [debouncedNameSearch, submitSearch])

  // 获取推理结果集列表
  const { data: inferenceResultSetsResponse, isLoading: loading } = useQuery({
    queryKey: ['inference-result-sets', projectId, searchParams],
    queryFn: () => inferenceResultSetService.list(projectId, searchParams),
    enabled: !!projectId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
  })

  const inferenceResultSets = inferenceResultSetsResponse?.items || []
  const total = inferenceResultSetsResponse?.total || 0

  // 处理方法
  const handleSearch = (values: SearchFormData) => {
    const name = values.name?.trim()
    const newParams: InferenceResultSetSearchParams = {
      ...searchParams,
      ...values,
      name: name || undefined,
      page: 1,
    }
    setSearchParams(newParams)
  }
  const handleNameSearchChange = (value: string) => {
    debouncedNameSearch(value)
  }
  const handleReset = () => {
    submitSearch.cancel()
    debouncedNameSearch.cancel()
    searchForm.resetFields()
    setSearchParams((prev) => ({
      page: 1,
      size: prev.size,
      ...(usage ? { usage } : {}),
    }))
  }

  const handlePageChange = (page: number, pageSize?: number) => {
    setSearchParams((prev) => ({
      ...prev,
      page: page || prev.page,
      size: pageSize || prev.size,
    }))
  }

  // 刷新列表
  const handleRefresh = async () => {
    try {
      await queryClient.invalidateQueries({
        queryKey: ['inference-result-sets', projectId, searchParams],
      })
      message.success('刷新成功')
    }
    catch (error) {
      console.error('刷新失败:', error)
      // message.error("刷新失败");
    }
  }

  // 渲染推理进度状态
  const getProgressStatusTag = (status: string) => {
    const statusMap: Record<
      string,
      { className: string, text: string }
    > = {
      [InferenceProgressStatus.CREATED]: {
        className: 'inference-result-status-created',
        text: '已创建',
      },
      [InferenceProgressStatus.QUEUED]: {
        className: 'inference-result-status-running',
        text: '排队中',
      },
      [InferenceProgressStatus.PREPARING]: {
        className: 'inference-result-status-running',
        text: '准备中',
      },
      [InferenceProgressStatus.PROCESSING]: {
        className: 'inference-result-status-running',
        text: '运行中',
      },
      [InferenceProgressStatus.COMPLETED]: {
        className: 'inference-result-status-success',
        text: '已完成',
      },
      [InferenceProgressStatus.FAILED]: {
        className: 'inference-result-status-error',
        text: '失败',
      },
      [InferenceProgressStatus.TERMINATED]: {
        className: 'inference-result-status-muted',
        text: '终止',
      },
      [InferenceProgressStatus.STOPPED]: {
        className: 'inference-result-status-muted',
        text: '停止',
      },
      [InferenceProgressStatus.SETTIMEOUT]: {
        className: 'inference-result-status-running',
        text: '定时待启动',
      },
    }

    const config
      = statusMap[status] || { className: 'inference-result-status-muted', text: status || '未知' }
    return <span className={config.className}>{config.text}</span>
  }

  const getDatasetTypeTag = (type?: string) => {
    const label = DATASET_TYPE_LABELS[type || ''] || '-'
    const tone = type === 'image-understanding' ? 'orange' : 'blue'
    return (
      <Tag className={`inference-result-type-tag inference-result-type-tag-${tone}`}>
        {label}
      </Tag>
    )
  }

  const handleDelete = (id: number, datasetName: string) => {
    const rowKey = id?.toString() || datasetName
    const currentPage = searchParams.page
    const currentPageSize = searchParams.size
    const currentTotal = total
    setLoadingRows((prev) => ({ ...prev, [rowKey]: true }))
    inferenceResultSetService
      .delete(projectId, id)
      .then(async (res) => {
        message.success('删除成功')
        // 使用公共方法计算删除后应该跳转的页码
        const targetPage = calculatePageAfterDelete(currentPage, currentPageSize, currentTotal, 1)

        // 如果目标页码与当前页码不同，先更新页码
        if (targetPage !== currentPage) {
          setSearchParams((prev) => ({
            ...prev,
            page: targetPage,
          }))
        }

        // 刷新数据
        await queryClient.refetchQueries({
          queryKey: ['inference-result-sets', projectId],
        })
      })
      .catch((err) => {
        console.log(err)
      })
      .finally(() => {
        setLoadingRows((prev) => {
          const newState = { ...prev }
          delete newState[rowKey]
          return newState
        })
      })
  }

  const handleStop = (id: number, datasetName: string) => {
    const rowKey = id?.toString() || datasetName
    setLoadingRows((prev) => ({ ...prev, [rowKey]: true }))
    inferenceResultSetService
      .stop(projectId, id)
      .then(async () => {
        message.success('终止成功')
        await queryClient.refetchQueries({
          queryKey: ['inference-result-sets', projectId],
        })
      })
      .catch((err) => {
        console.log(err)
        message.error('终止失败')
      })
      .finally(() => {
        setLoadingRows((prev) => {
          const newState = { ...prev }
          delete newState[rowKey]
          return newState
        })
      })
  }

  const handleStart = (id: number, datasetName: string) => {
    const rowKey = id?.toString() || datasetName
    setLoadingRows((prev) => ({ ...prev, [rowKey]: true }))
    taskExecutionService
      .manualStart({
        business_type:
          usage === 'business-inference'
            ? 'business_inference_result_datasets'
            : 'inference_result_datasets',
        business_id: String(id),
      })
      .then(async () => {
        message.success('启动成功')
        await queryClient.refetchQueries({
          queryKey: ['inference-result-sets', projectId],
        })
      })
      .catch((err) => {
        console.log(err)
        message.error('启动失败')
      })
      .finally(() => {
        setLoadingRows((prev) => {
          const newState = { ...prev }
          delete newState[rowKey]
          return newState
        })
      })
  }

  const handleDownload = (id: number, datasetName: string, format: string) => {
    const rowKey = id?.toString() || datasetName
    setLoadingRows((prev) => ({ ...prev, [rowKey]: true }))
    inferenceResultSetService
      .download(projectId, id, format)
      .then((response) => {
        const contentDisposition
          = response.headers['content-disposition']
            || response.headers['Content-Disposition']
            || ''
        const contentType
          = response.headers['content-type']
            || response.headers['Content-Type']
            || response.data?.type
            || ''

        let filename = datasetName

        if (contentDisposition) {
          const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
          if (utf8Match && utf8Match[1]) {
            try {
              filename = decodeURIComponent(utf8Match[1].trim())
            }
            catch (e) {
              filename = utf8Match[1].trim()
            }
          }
          else {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]+)/i)
            if (filenameMatch && filenameMatch[1]) {
              filename = filenameMatch[1].trim().replace(/^["']|["']$/g, '')
            }
          }
        }

        // 清理文件名：移除路径分隔符和非法字符
        filename = filename.replace(/[/\\?%*:|"<>]/g, '').trim()

        // 检查是否有扩展名（检查最后一个点号之后是否有内容，且不是以点结尾）
        const lastDotIndex = filename.lastIndexOf('.')
        const hasExtension = lastDotIndex > 0 && lastDotIndex < filename.length - 1

        if (!hasExtension) {
          if (contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            || contentType.includes('application/vnd.ms-excel')) {
            filename += '.xlsx'
          }
          else if (contentType.includes('text/csv') || contentType.includes('application/csv')) {
            filename += '.csv'
          }
          else if (contentType.includes('application/json') || contentType.includes('text/json')) {
            filename += '.json'
          }
          else if (contentType.includes('json')) {
            filename += '.jsonl'
          }
          else if (contentType.includes('application/zip') || contentType.includes('application/x-zip-compressed')) {
            filename += '.zip'
          }
        }

        let blob: Blob
        if (response.data instanceof Blob) {
          blob = response.data
        }
        else {
          const dataToUse = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
          blob = new Blob([dataToUse], { type: contentType || 'application/octet-stream' })
        }

        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        message.success('下载成功')
      })
      .catch((err) => {
        console.log(err)
        message.error('下载失败')
      })
      .finally(() => {
        setLoadingRows((prev) => {
          const newState = { ...prev }
          delete newState[rowKey]
          return newState
        })
      })
  }

  const navigateToDetail = (id: number, name: string) => {
    if (usage === 'business-inference') {
      navigate(`/project/${projectId}/business-inference/${id || name}`)
    }
    else {
      navigate(`/project/${projectId}/Inference/${id || name}`)
    }
  }

  const handleEditResultSetName = async (record: any, value: string) => {
    const nextName = value.trim()
    const currentName = record.name || ''
    if (!nextName) {
      message.warning('数据集名称不能为空')
      return
    }
    if (nextName === currentName) {
      return
    }

    setIsEdit(true)

    const rowKey = record.id?.toString() || currentName
    setLoadingRows((prev) => ({ ...prev, [rowKey]: true }))
    try {
      await inferenceResultSetService.edit(projectId, record.id, nextName, record.description)
      message.success('数据集名称更新成功')
      await queryClient.refetchQueries({
        queryKey: ['inference-result-sets', projectId],
      })
    }
    catch (error) {
      console.error('更新推理结果集名称失败:', error)
      message.error('数据集名称更新失败')
    }
    finally {
      setLoadingRows((prev) => {
        const newState = { ...prev }
        delete newState[rowKey]
        return newState
      })
      setIsEdit(false)
    }
  }

  // 推理结果集表格列定义
  const columns: TableColumnsType<any> = [
    {
      title: '数据集名称',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left' as const,
      width: 260,
      className: 'inference-result-name-column',
      render: (text: string, record) => {
        const rowKey = record.id?.toString() || record.name
        const isLoading = loadingRows[rowKey]
        // 只有状态为已完成时才能查看、去评估、下载
        // const isCompleted = record.status === InferenceProgressStatus.COMPLETED || record.status === '已完成'
        // const isActionDisabled = isLoading || !isCompleted

        return (
          <div className="inference-result-name-cell">
            <Text
              // title={text}
              ellipsis={{ tooltip: text }}
              // editable={{
              //   tooltip: '编辑名称',
              //   triggerType: ['icon'],
              //   onChange: (value) => handleEditResultSetName(record, value),
              // }}
              disabled={isLoading}
              className="inference-result-name-link cursor-pointer"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('.ant-typography-edit')) return
                navigateToDetail(record.id, record.name)
              }}
            >
              {text}
            </Text>
          </div>
        )
      },
    },
    {
      title: '推理进度',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record: any) => {
        return (
          <>
            {
              status === InferenceProgressStatus.SETTIMEOUT
                ? (
                    <Tooltip title={
                      `启动时间: ${dayjs(record?.schedule_at).format('YYYY-MM-DD HH:mm:ss')}`
                    }
                    >
                      {getProgressStatusTag(status)}
                    </Tooltip>
                  ) : getProgressStatusTag(status)
            }
          </>
        )
      },
    },
    ...(usage !== 'business-inference' ? [{
      title: '数据用途',
      dataIndex: 'dataset_type',
      key: 'dataset_type',
      width: 110,
      render: (type: string) => getDatasetTypeTag(type),
    }] : []),
    ...(usage !== 'business-inference' ? [{
      title: '待推理数据',
      dataIndex: 'source_dataset_name',
      key: 'source_dataset_name',
      align: 'left' as const,
      ellipsis: true,
      width: 210,
      render: (text: string) => <Text>{text || '外部导入'}</Text>,
    }] : []),
    {
      title: usage === 'business-inference' ? '推理模型' : '待推理模型/服务',
      dataIndex: 'model_name',
      key: 'model_name',
      width: 230,
      ellipsis: true,
      render: (text: string, record: any) => (
        <Text>{record.online_service_name || record.model_name || '-'}</Text>
      ),
    },
    {
      title: '数据量',
      dataIndex: 'total_items',
      key: 'total_items',
      width: 100,
      render: (count: number) => count?.toLocaleString() || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      fixed: 'right' as const,
      render: (_, record) => {
        const rowKey = record.id?.toString() || record.name
        const isLoading = loadingRows[rowKey]
        // 只有状态为已完成时才能查看、去评估、下载
        const isCompleted = record.status === InferenceProgressStatus.COMPLETED || record.status === '已完成'
        const isActionDisabled = isLoading || !isCompleted
        // 编辑按钮可用状态：已创建、定时待启动、失败、已终止
        const editableStatuses = [
          '已创建',
          '定时待启动',
          '失败',
          '已终止',
          '终止',
        ]
        const canEdit = editableStatuses.includes(record.status)
        // 判断是否可以启动：已创建、定时待启动、失败、已终止状态可以启动
        const canStart = ['已创建'].includes(record.status)
        // 判断是否可以终止：状态为排队中或运行中
        const canStop = record.status === '排队中'
          || record.status === '运行中'
        // 判断是否可以删除：已创建、定时待启动、已完成、失败、已终止状态可以删除

        const isApi = record.inference_method === InferenceMethod.API || record.inference_method === InferenceMethod.THIRD_API
        const canDelete = ['已创建', '定时待启动', '已完成', '失败', '已终止', '终止'].includes(record.status)

        const actions: TableActionItem[] = [
          {
            key: 'start',
            label: '启动',
            icon: <PlayCircleOutlined />,
            disabled: !canStart || isLoading || record.inference_method === InferenceMethod.IMPORT,
            loading: isLoading,
            onClick: () => handleStart(record.id, record.name),
          },
          {
            key: 'edit',
            label: '编辑',
            icon: <EditOutlined />,
            disabled: isLoading || !canEdit || isApi,
            onClick: () => {
              if (usage === 'business-inference') {
                navigate(`/project/${projectId}/business-inference/create`, {
                  state: {
                    editId: record.id,
                    usage,
                  },
                })
              }
              else {
                navigate(`/project/${projectId}/Inference/create`, {
                  state: {
                    editId: record.id,
                    usage,
                  },
                })
              }
            },
          },
          {
            key: 'delete',
            label: '删除',
            danger: true,
            loading: isLoading,
            visible: canDelete,
            disabled: isLoading,
            confirm: {
              title: '确认删除',
              description: `确定要删除数据集 ${record.name} 吗？删除后将无法恢复。`,
              onConfirm: () => handleDelete(record.id, record.name),
              okText: '确认删除',
              cancelText: '取消',
            },
          },
          {
            key: 'view',
            label: '查看详情',
            onClick: () => navigateToDetail(record.id, record.name),
          },
          {
            key: 'evaluate',
            label: '去评估',
            disabled: !isCompleted,
            onClick: () =>
              navigate(
                `/project/${projectId}/${usage === 'business-inference' ? 'business-effect-evaluation' : 'effect-evaluation'}/auto/create`,
                {
                  state: {
                    inferenceDatasetId: record.id,
                    dataset_type: record.dataset_type,
                    usage,
                  },
                },
              ),
          },
          {
            key: 'download',
            label: '下载',
            disabled: isActionDisabled,
            loading: isLoading,
            onClick: () => {
              let tempFormat: string | undefined
              const handleRadioChange = (e: any) => {
                tempFormat = e.target.value
              }

              Modal.confirm({
                title: '下载格式选择',
                content: (
                  <Radio.Group onChange={handleRadioChange}>
                    {record.dataset_type !== 'image-understanding' && (
                      <>
                        <Radio value="json">JSON</Radio>
                        <Radio value="jsonl">JSONL</Radio>
                        <Radio value="xlsx">XLSX</Radio>
                      </>
                    )}
                    {record.dataset_type === 'image-understanding' && <Radio value="zip">ZIP</Radio>}
                  </Radio.Group>
                ),

                onOk: () => {
                  if (!tempFormat) {
                    // 弹出校验信息，并不关闭弹窗
                    message.warning('请选择下载格式！')
                    return Promise.reject()
                  }
                  else {
                    handleDownload(record.id, record.name, tempFormat)
                  }
                },
              })
            },
          },
          {
            key: 'stop',
            label: '终止',
            disabled: !canStop || isLoading,
            loading: isLoading,
            onClick: () => handleStop(record.id, record.name),
          },
        ]
        return <TableActionColumn actions={actions} maxVisible={2} />
      },
    },
  ]

  const createDataset = () => {
    if (usage === 'business-inference') {
      navigate(`/project/${projectId}/business-inference/create`)
    }
    else {
      navigate(`/project/${projectId}/Inference/create`)
    }
  }

  return (
    <div className="inference-result-set-tab">
      <TableToolbar
        form={searchForm}
        onSearch={handleSearch}
        className="inference-result-toolbar"
        searchFormItems={(
          <>
            <Form.Item name="name" className="!mb-0">
              <Input
                prefix={<SearchOutlined />}
                placeholder="搜索数据集名称"
                className="inference-result-name-input"
                onChange={(event) => handleNameSearchChange(event.target.value)}
                onPressEnter={() => {
                  debouncedNameSearch.cancel()
                  searchForm.submit()
                }}
              />
            </Form.Item>
            {usage !== 'business-inference' && (
              <Form.Item name="inference_method" className="!mb-0">
                <Select
                  placeholder="推理方式"
                  className="inference-result-filter-select"
                  allowClear
                  onChange={() => submitSearch()}
                >
                  <Option value={InferenceMethod.OFFLINE}>离线推理</Option>
                  <Option value={InferenceMethod.ONLINE}>在线推理</Option>
                  <Option value={InferenceMethod.IMPORT}>导入推理结果集</Option>
                </Select>
              </Form.Item>
            )}
            {usage !== 'business-inference' && (
              <Form.Item name="dataset_type" className="!mb-0">
                <Select
                  placeholder="数据用途"
                  className="inference-result-filter-select"
                  allowClear
                  onChange={() => submitSearch()}
                >
                  <Option value="text-generation">文本生成</Option>
                  <Option value="image-understanding">图像理解</Option>
                </Select>
              </Form.Item>
            )}
          </>
        )}
        rightActions={[
          {
            key: 'refresh',
            label: '刷新',
            onClick: handleRefresh,
            loading,
          },
          {
            key: 'reset',
            label: '重置',
            onClick: handleReset,
          },
          {
            key: 'create',
            label: '创建数据集',
            type: 'primary',
            icon: <PlusOutlined />,
            onClick: createDataset,
          },
        ]}
        toolbarActions={[]}
      />

      <Table
        columns={columns}
        dataSource={inferenceResultSets}
        rowKey={(record) => record.id || record.name}
        loading={loading || isEdit}
        pagination={getTablePagination({
          total,
          current: searchParams.page,
          pageSize: searchParams.size,
          onChange: handlePageChange,
          showQuickJumper: true,
          showTotal: (total) => (
            <>
              共
              {total}
              {' '}
              条
            </>
          ),
        })}
        scroll={{ x: 1200 }}
        tableLayout="fixed"
        className="inference-result-table"
      />
    </div>
  )
}

export default InferenceResultSetTab
