import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, InfoCircleOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { machineDatamanagement } from '@/services/machineDatamanagement'
import type { ItemList } from '@/services/machineLearnModel'
import { DATASET_CATEGORY_MAP, TASK_TYPE_MAP, TEMPLATE_TYPE_MAP } from '@/services/machineLearnModel'
import '../DirectoryManagement.css'

const { Title, Paragraph, Text } = Typography
// 标注类型 task_type 枚举与中文映射
const TASK_TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'text_classification', label: '文本分类' },
  { value: 'text_entity_recognition', label: '实体识别' },
  { value: 'image_classification', label: '图像分类' },
  { value: 'object_detection', label: '物体检测' },
  { value: 'image_segmentation', label: '图像分割' },
] as const

const DEFAULT_PAGE_SIZE = 20

const MachineDataManagementPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchForm] = Form.useForm()

  const [searchName, setSearchName] = useState('')
  const [taskType, setTaskType] = useState<string>('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({})

  const [isEdit, setIsEdit] = useState<boolean>(false)

  const projectIdNum = Number(projectId)

  const { data: listData, isLoading } = useQuery({
    queryKey: ['machine-dataset-list', projectIdNum, page, pageSize, taskType, searchName],
    queryFn: () =>
      machineDatamanagement.getMachineDatasetList(
        projectIdNum,
        page,
        pageSize,
        taskType,
        searchName || undefined,
      ),
    enabled: !!projectId && !Number.isNaN(projectIdNum),
  })

  const deleteMutation = useMutation({
    mutationFn: (datasetId: number) =>
      machineDatamanagement.deleteMachineDatasets(projectIdNum, datasetId),
    onSuccess: () => {
      message.success('删除成功')
      setDeletingId(null)
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-list'] })
    },
  })

  const items = listData?.items ?? []
  const total = listData?.total ?? 0

  useEffect(() => {
    if (isLoading) return
    const maxPage = Math.max(1, Math.ceil(total / pageSize))
    if (page > maxPage) {
      setPage(maxPage)
    }
  }, [isLoading, total, page, pageSize])

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setSearchName(values.name ?? '')
    setTaskType(values.task_type ?? '')
    setPage(1)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setSearchName('')
    setTaskType('')
    setPage(1)
  }

  const handlePageChange = (p: number, size?: number) => {
    if (size !== undefined && size !== pageSize) {
      setPageSize(size)
    }
    setPage(p)
  }

  const handleViewDetail = (record: ItemList) => {
    navigate(`/project/${projectId}/machine-data-management/${record.id}`)
  }

  const handleEditDatasetName = async (record: ItemList, value: string) => {
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
      await machineDatamanagement.editMachineDatasetBasicInfo(
        projectIdNum,
        record.id,
        {
          name: nextName,
          description: record.description,
        },
      )
      message.success('数据集名称更新成功')
      await queryClient.invalidateQueries({ queryKey: ['machine-dataset-list'] })
    }
    catch (e: unknown) {
      message.error((e as Error)?.message || '数据集名称更新失败')
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

  const handleDelete = (record: ItemList) => {
    setDeletingId(record.id)
    deleteMutation.mutate(record.id)
  }

  const handleCreateDataset = () => {
    navigate(`/project/${projectId}/machine-data-management/create`)
  }

  const columns: ColumnsType<ItemList> = [
    {
      title: '数据集名称',
      dataIndex: 'name',
      key: 'name',
      align: 'left',
      fixed: 'left',
      width: 150,
      className: 'directory-dataset-name-column',
      render: (text: string, record: ItemList) => {
        const rowKey = record.id?.toString() || record.name
        const isLoading = loadingRows[rowKey]
        return (
          <div className="directory-dataset-name-cell">
            <Text
              // title={text}
              ellipsis={{ tooltip: text }}
              editable={{
                tooltip: '编辑名称',
                triggerType: ['icon'],
                onChange: (value) => handleEditDatasetName(record, value),
              }}
              disabled={isLoading}
              className="directory-dataset-name-link cursor-pointer"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('.ant-typography-edit')) return
                handleViewDetail(record)
              }}
            >
              {text}
            </Text>
          </div>
        )
      },
    },
    {
      title: '最新版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
      render: (text: string) => text || '-',
    },
    {
      title: '数据类型',
      dataIndex: 'data_type',
      key: 'data_type',
      width: 100,
      render: (val: string) => DATASET_CATEGORY_MAP[val] ?? val ?? '-',
    },
    {
      title: '标注类型',
      dataIndex: 'task_type',
      key: 'task_type',
      width: 120,
      render: (val: string) => TASK_TYPE_MAP[val] ?? val ?? '-',
    },
    {
      title: '标注模板',
      key: 'template_type',
      dataIndex: 'template_type',
      width: 140,
      render: (val: string) => TEMPLATE_TYPE_MAP[val] ?? val ?? '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_: unknown, record: ItemList) => (
        <div className="lab-table-action-cell">
          <Button type="link" size="small" icon={<InfoCircleOutlined />} onClick={() => handleViewDetail(record)}>
            详情
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定要删除数据集「${record.name}」吗？删除后将无法恢复。`}
            onConfirm={() => handleDelete(record)}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true, loading: deletingId === record.id }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} loading={deletingId === record.id}>
              删除
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ]

  if (!projectId) {
    return (
      <div className="px-6 py-4 pb-16">
        <Paragraph type="danger">缺少项目 ID，请从项目内进入数据管理。</Paragraph>
      </div>
    )
  }

  return (
    <div className="machine-data-management-container lab-list-page-shell">
      <div className="mb-4">
        <Title level={4} className="mb-1">
          数据管理
        </Title>
        <Paragraph type="secondary" className="mb-0">
          管理和创建用于机器学习的数据集，支持数据查看、导入导出和删除等操作。
        </Paragraph>
      </div>

      <Card className="mb-4">
        <Form
          form={searchForm}
          layout="inline"
          initialValues={{ name: '', task_type: '' }}
          onFinish={handleSearch}
          className="flex flex-wrap gap-2"
        >
          <Form.Item name="name" className="mb-2">
            <Input
              placeholder="搜索数据集名称"
              prefix={<SearchOutlined />}
              allowClear
              className="w-[220px]"
            />
          </Form.Item>
          <Form.Item name="task_type">
            <Select
              placeholder="请选择标注类型"
              allowClear
              className="!w-[160px]"
              options={TASK_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </Form.Item>
          <Form.Item className="mb-2">
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                搜索
              </Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <div className="flex justify-end mb-4">
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateDataset}>
          创建数据集
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={items}
        rowKey="id"
        loading={isLoading || isEdit}
        className="directory-dataset-table"
        tableLayout="fixed"
        pagination={{
          total,
          current: page,
          pageSize,
          onChange: handlePageChange,
          showQuickJumper: false,
          showTotal: (t) => `共 ${t} 条记录`,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
      />
    </div>
  )
}

export default MachineDataManagementPage
