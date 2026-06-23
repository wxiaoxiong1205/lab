import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Form, Input, Popconfirm, Select, Space, Table, type TableColumnsType, Tag, Tooltip, Typography, message } from 'antd'
import { DeleteOutlined, ExclamationCircleOutlined, InfoCircleOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import debounce from 'lodash-es/debounce'
import type { TrainingDatasetSearchParams } from '../../types'
import TableToolbar from '@/components/common/TableToolbar'
import { getDatasetDeleteErrorMessage, getDatasetVersionDeleteBlockReason } from '@/components/dataset/datasetDeleteGuard'
import type { ProjectEnumValuesResponse } from '@/services/api.ts'
import { trainingDatasetService } from '@/services/trainingApi.ts'
import { calculatePageAfterDelete } from '@/utils/paginationUtils.ts'
import { getTablePagination } from '@/utils/tablePagination'

const { Option } = Select
const { Text } = Typography
interface SearchFormData {
  dataset_type?: string
  name?: string
  format?: string
  is_published?: boolean
}
interface DatasetTabProps {
  projectId: number
  type: 'training' | 'test' | 'validation' | 'business_test' | 'business_training'
  basePath: string
  dataset_type?: string
}
const DatasetTab: React.FC<DatasetTabProps> = ({ projectId, type, basePath, dataset_type }) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const usage = type
  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({})
  const [trainingSearchForm] = Form.useForm()
  const [trainingSearchParams, setTrainingSearchParams] = useState<TrainingDatasetSearchParams>({
    page: 1,
    size: 10,
    usage: type,
    dataset_type,
  })
  const [isEdit, setIsEdit] = useState<boolean>(false)
  const prevProjectIdRef = useRef<number | undefined>(undefined)
  const submitTrainingSearch = useMemo(
    () => debounce(() => trainingSearchForm.submit(), 300),
    [trainingSearchForm],
  )
  const debouncedTrainingNameSearch = useMemo(
    () => debounce((value: string) => {
      const name = value.trim()
      setTrainingSearchParams((prev) => ({
        ...prev,
        name: name || undefined,
        page: 1,
      }))
    }, 300),
    [],
  )
  useEffect(() => {
    return () => {
      submitTrainingSearch.cancel()
      debouncedTrainingNameSearch.cancel()
    }
  }, [debouncedTrainingNameSearch, submitTrainingSearch])
  useEffect(() => {
    if (projectId && prevProjectIdRef.current !== projectId) {
      prevProjectIdRef.current = projectId
      setTrainingSearchParams({
        page: 1,
        size: 10,
        usage: type,
        dataset_type,
      })
      trainingSearchForm.resetFields()
      queryClient.invalidateQueries({
        queryKey: ['training-datasets'],
      })
    }
  }, [projectId, type, dataset_type, queryClient, trainingSearchForm])
  const [projectEnumValues, setProjectEnumValues] = useState<ProjectEnumValuesResponse | null>(null)
  useEffect(() => {
    const fetchProjectEnumValues = async () => {
      const cachedEnumValues = localStorage.getItem('trainingDatasetEnumValues')
      if (cachedEnumValues) {
        try {
          const parsedValues = JSON.parse(cachedEnumValues).all_enums.find((item: any) => item.module === 'training_dataset')
          setProjectEnumValues(parsedValues)
        }
        catch (error) {
          console.error('Failed to parse cached enum values:', error)
        }
      }
    }
    fetchProjectEnumValues()
  }, [])
  // 获取数据集列表 - queryKey 包含 projectId 以确保切换项目时重新获取数据
  const { data: trainingDatasetsResponse, isLoading: trainingLoading } = useQuery({
    queryKey: ['training-datasets', projectId, trainingSearchParams],
    queryFn: () => {
      // 映射参数，将TrainingDatasetSearchParams转换为getDataParams
      const apiParams = {
        name: trainingSearchParams.name,
        dataset_type: trainingSearchParams.dataset_type,
        page: trainingSearchParams.page,
        size: trainingSearchParams.size,
        usage: trainingSearchParams.usage,
      }
      return trainingDatasetService.get(projectId, apiParams)
    },
    enabled: !!projectId,
    staleTime: 0, // 数据立即过期，确保每次都会重新获取
    refetchOnMount: true, // 组件挂载时重新获取
  })
  const trainingDatasets = trainingDatasetsResponse?.items || []
  const trainingTotal = trainingDatasetsResponse?.total || 0
  const handleTrainingSearch = (values: SearchFormData) => {
    const name = values.name?.trim()
    setTrainingSearchParams((prev) => ({
      ...prev,
      dataset_type: values.dataset_type,
      name: name || undefined,
      page: 1,
    }))
  }
  const handleTrainingNameSearchChange = (value: string) => {
    debouncedTrainingNameSearch(value)
  }
  const handleTrainingReset = () => {
    submitTrainingSearch.cancel()
    debouncedTrainingNameSearch.cancel()
    trainingSearchForm.resetFields()
    setTrainingSearchParams((prev) => ({
      ...prev,
      name: undefined,
      dataset_type,
      page: 1,
      usage,
    }))
  }
  const handleTrainingPageChange = (page: number, pageSize?: number) => {
    setTrainingSearchParams((prev) => ({
      ...prev,
      page: page || prev.page,
      size: pageSize || prev.size,
      usage,
    }))
  }
  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: ['training-datasets', projectId],
    })
  }

  const getTrainingTypeTag = (currentDatasetType?: string, trainingMethodType?: string) => {
    const prefix = trainingMethodType === 'dpo' ? 'DPO' : 'SFT'
    const typeMap: Record<string, { color: string, text: string }> = {
      'text-generation': { color: 'cyan', text: `${prefix}-文本生成` },
      'image-understanding': { color: 'yellow', text: `${prefix}-图像理解` },
    }
    const config = typeMap[currentDatasetType || 'text-generation']
    return (
      <Tag color={config.color} className={`directory-dataset-tag directory-dataset-tag-${config.color}`.trim()} style={{ margin: 0 }}>
        {config.text}
      </Tag>
    )
  }
  const getStatusClassName = (status?: string) => {
    if (!status)
      return ''
    if (status.includes('完成') || status.includes('成功'))
      return 'directory-dataset-status-success'
    if (status.includes('失败'))
      return 'directory-dataset-status-error'
    if (status.includes('进行') || status.includes('中'))
      return 'directory-dataset-status-running'
    if (status.includes('终止') || status.includes('草稿'))
      return 'directory-dataset-status-muted'
    if (status.includes('正常'))
      return 'directory-dataset-status-normal'
    return ''
  }
  const handleDelete = async (record: any) => {
    const id = record.id
    const datasetName = record.dataset_name
    const rowKey = id?.toString() || datasetName
    const currentPage = trainingSearchParams.page
    const currentPageSize = trainingSearchParams.size
    const currentTotal = trainingTotal
    setLoadingRows((prev) => ({ ...prev, [rowKey]: true }))

    try {
      const blockReason = await getDatasetVersionDeleteBlockReason(projectId, datasetName, record.latest_version, usage)
      if (blockReason) {
        message.warning(blockReason)
        return
      }

      await trainingDatasetService.delete(projectId, datasetName, usage)
      message.success('删除成功')
      const targetPage = calculatePageAfterDelete(currentPage, currentPageSize, currentTotal, 1)
      if (targetPage !== currentPage) {
        setTrainingSearchParams((prev) => ({
          ...prev,
          page: targetPage,
        }))
      }
      await queryClient.refetchQueries({
        queryKey: ['training-datasets', projectId],
      })
    }
    catch (error) {
      message.error(getDatasetDeleteErrorMessage(error, '删除失败'))
    }
    finally {
      setLoadingRows((prev) => {
        const newState = { ...prev }
        delete newState[rowKey]
        return newState
      })
    }
  }
  const navigateToDetail = (id: number, name: string) => {
    navigate(`${basePath}/${name || id}`)
  }
  const handleEditDatasetName = async (record: any, value: string) => {
    const nextName = value.trim()
    const currentName = record.dataset_name || ''
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
      await trainingDatasetService.edit(projectId, currentName, record.id, usage, nextName, record.description)
      await queryClient.refetchQueries({
        queryKey: ['training-datasets', projectId],
      })
      message.success('数据集名称更新成功')
    }
    catch (error) {
      console.error('更新数据集名称失败:', error)
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
  const trainingColumns: TableColumnsType<any> = [
    {
      title: '数据集名称',
      dataIndex: 'dataset_name',
      key: 'dataset_name',
      align: 'left',
      fixed: 'left',
      width: 180,
      className: 'directory-dataset-name-column',
      render: (text: string, record) => {
        const rowKey = record.id?.toString() || record.dataset_name
        const isLoading = loadingRows[rowKey]
        return (
          <div className="directory-dataset-name-cell">
            <Text
              // title={text}
              ellipsis={{ tooltip: text }}
              // editable={{
              //   tooltip: '编辑名称',
              //   triggerType: ['icon'],
              //   onChange: (value) => handleEditDatasetName(record, value),
              // }}
              disabled={isLoading}
              className="directory-dataset-name-link cursor-pointer"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('.ant-typography-edit')) return
                navigateToDetail(record.id, record.dataset_name)
              }}
            >
              {text}
            </Text>
          </div>
        )
      },
    },
    {
      title: '最新版本状态',
      dataIndex: 'processing_status_display',
      key: 'processing_status_display',
      align: 'left',
      width: 170,
      render: (text: string, record) => (
        <Space className="!gap-x-[23px]">
          <span className={getStatusClassName(text)}>{text || '-'}</span>
          {record?.processing_error && (
            <Tooltip title={record.processing_error}>
              <ExclamationCircleOutlined className="cursor-pointer" style={{ color: 'rgba(112, 118, 127, 1)' }} />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '最新版本',
      dataIndex: 'latest_version',
      key: 'latest_version',
      align: 'left',
      width: 110,
      render: (text: string) => (<Text className="block text-left">{text}</Text>),
    },
    ...(dataset_type !== 'business'
      ? [{
          title: '数据用途',
          dataIndex: 'training_method_type',
          key: 'training_method_type',
          align: 'left' as const,
          width: 140,
          render: (_: string, record: any) => getTrainingTypeTag(record.dataset_type, record.training_method_type),
        }]
      : []),
    ...(dataset_type !== 'business'
      ? [{
          title: '数据格式',
          dataIndex: 'dataset_format',
          key: 'dataset_format',
          align: 'left' as const,
          width: 130,
          render: (typeValue: string) => <span>{typeValue || '-'}</span>,
        }]
      : []),
    ...(dataset_type === 'business'
      ? [{
          title: '创建人',
          dataIndex: 'created_by',
          key: 'created_by',
          align: 'left' as const,
          width: 100,
          render: (text: string) => text || '-',
        }]
      : []),
    ...(dataset_type === 'business'
      ? [{
          title: '创建时间',
          dataIndex: 'created_at',
          key: 'created_at',
          align: 'left' as const,
          width: 100,
          render: (text: string) => dayjs(text).format('YYYY/MM/DD HH:mm:ss'),
        }]
      : []),
    {
      title: '操作',
      key: 'action',
      width: 130,
      align: 'left',
      fixed: 'right',
      render: (_: unknown, record: any) => {
        const rowKey = record.id?.toString() || record.dataset_name
        const isLoading = loadingRows[rowKey]
        return (
          <Space size={24} className="directory-dataset-actions">
            <Button type="link" icon={<InfoCircleOutlined />} className="directory-dataset-action" onClick={() => navigateToDetail(record.id, record.dataset_name)}>
              详情
            </Button>
            <Popconfirm title="确认删除" description={`确定要删除数据集 ${record.dataset_name} 吗？删除后将无法恢复。`} onConfirm={() => handleDelete(record)} okText="确认删除" cancelText="取消">
              <Button type="link" icon={<DeleteOutlined />} loading={isLoading} disabled={isLoading} className="directory-dataset-action directory-dataset-delete-action">
                删除
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]
  const directoryPagination = getTablePagination({
    total: trainingTotal,
    current: trainingSearchParams.page,
    pageSize: trainingSearchParams.size,
    onChange: handleTrainingPageChange,
    showQuickJumper: true,
    showTotal: (total) => (
      <>
        共
        {total}
        {' '}
        条
      </>
    ),
  })
  return (
    <div className="directory-dataset-tab">
      <TableToolbar
        form={trainingSearchForm}
        onSearch={handleTrainingSearch}
        className="directory-dataset-toolbar"
        searchFormItems={(
          <>
            <Form.Item name="name" className="!mb-0">
              <Input
                prefix={<SearchOutlined />}
                placeholder="数据集名称"
                className="directory-dataset-name-input"
                onChange={(event) => handleTrainingNameSearchChange(event.target.value)}
                onPressEnter={() => {
                  debouncedTrainingNameSearch.cancel()
                  trainingSearchForm.submit()
                }}
              />
            </Form.Item>
            {dataset_type !== 'business' && (
              <Form.Item name="dataset_type" className="!mb-0">
                <Select
                  placeholder="数据用途"
                  className="directory-dataset-type-select"
                  allowClear
                  onChange={() => submitTrainingSearch()}
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
          },
          {
            key: 'reset',
            label: '重置',
            onClick: handleTrainingReset,
          },
          {
            key: 'create',
            label: '创建数据集',
            type: 'primary',
            icon: <PlusOutlined />,
            onClick: () => navigate(`${basePath}/create?type=${encodeURIComponent(type)}`),
          },
        ]}
        toolbarActions={[]}
      />

      <Table columns={trainingColumns} dataSource={trainingDatasets} rowKey={(record) => record.id || record.dataset_name} loading={trainingLoading || isEdit} pagination={directoryPagination} className="directory-dataset-table" scroll={{ x: 1200 }} />
    </div>
  )
}
export default DatasetTab
