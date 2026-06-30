/*
 * @Author: fangjun fangjun@deepexi.com
 * @Date: 2025-08-27 15:39:53
 * @LastEditors: fangjun fangjun@deepexi.com
 * @LastEditTime: 2025-09-26 18:01:46
 * @FilePath: \deepexi-lab-web\src\components\dataset\TrainingDatasetTab.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import React, { useState } from 'react'
import {
  Button,
  Card,
  Form,
  Progress,
  Select,
  Space,
  Table,
  type TableColumnsType,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  FileOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { ModelService } from '@/services/modelsApi'
import { taskExecutionService } from '@/services/taskExecutionService'
import type { BaseModel, CreateBaseModelParams, GetBaseModelsParams } from '@/types/model'
import useI18n from '@/hooks/useI18n'
import CreateBaseModelModal from '@/components/common/CreateBaseModelModal'
import EditBaseModelModal from '@/components/common/EditBaseModelModal'

import { useConfigStore } from '@/stores/configStore'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import './index.css'

const { Option } = Select
const { Text, Title } = Typography

// 搜索表单接口定义
interface SearchFormData {
  name?: string
  model_provider?: string
}

const BaseModelManagement: React.FC = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // 状态管理
  const [searchForm] = Form.useForm()
  const [searchParams, setSearchParams] = useState<GetBaseModelsParams>({
    page: 1,
    size: 20,
    is_available: false,
  })
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editingModel, setEditingModel] = useState<BaseModel | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [startLoadingRows, setStartLoadingRows] = useState<Record<string, boolean>>({})
  const [stopLoadingRows, setStopLoadingRows] = useState<Record<string, boolean>>({})

  const { config, providerType } = useConfigStore()
  const isBelleProvider = config?.PROVIDER_TYPE === providerType

  // 获取基础模型列表
  const { data: baseModelsResponse, isLoading: loading, refetch } = useQuery({
    queryKey: ['base-models', searchParams],
    queryFn: () => ModelService.getBaseModels(searchParams),
  })

  // 获取基础模型状态枚举
  const { data: modelStatusEnums } = useQuery({
    queryKey: ['modelStatusEnums'],
    queryFn: () => ModelService.getBaseModelStatusEnums(),
  })

  const baseModels = baseModelsResponse?.items || []
  const total = baseModelsResponse?.total || 0

  // 处理方法
  const handleSearch = (values: SearchFormData) => {
    const newParams: GetBaseModelsParams = {
      ...searchParams,
      ...values,
      page: 1,
    }
    setSearchParams(newParams)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setSearchParams({
      page: 1,
      size: 20,
      is_available: false,
    })
  }

  const handlePageChange = (page: number, pageSize?: number) => {
    setSearchParams((prev) => ({
      ...prev,
      page: page || prev.page,
      size: pageSize || prev.size,
    }))
  }

  // 创建基础模型
  const createBaseModelMutation = useMutation({
    mutationFn: (params: CreateBaseModelParams) => ModelService.CreateBaseModel(params),
    onSuccess: () => {
      message.success('模型创建成功')
      setCreateModalVisible(false)
      queryClient.invalidateQueries({ queryKey: ['base-models'] })
    },
  })

  const handleCreateBaseModel = (values: CreateBaseModelParams) => {
    createBaseModelMutation.mutate(values)
  }

  // 更新基础模型
  const updateBaseModelMutation = useMutation({
    mutationFn: ({ id, values }: { id: string, values: Partial<CreateBaseModelParams> }) =>
      ModelService.UpdateBaseModel(id, values),
    onSuccess: () => {
      message.success('模型更新成功')
      setEditModalVisible(false)
      setEditingModel(null)
      queryClient.invalidateQueries({ queryKey: ['base-models'] })
    },
    onError: (error: any) => {
      console.error(error.message || '更新失败')
    },
  })

  const handleEditBaseModel = (values: CreateBaseModelParams) => {
    if (editingModel) {
      updateBaseModelMutation.mutate({ id: editingModel.id, values })
    }
  }

  const handleEdit = (model: BaseModel) => {
    // 传定时配置给编辑弹窗（兼容接口返回 scheduleAt）
    const modelWithSchedule: BaseModel = {
      ...model,
      schedule_at: model.schedule_at ?? (model as any).scheduleAt,
    }
    setEditingModel(modelWithSchedule)
    setEditModalVisible(true)
  }

  // 删除基础模型
  const deleteBaseModelMutation = useMutation({
    mutationFn: (modelId: number) => ModelService.deleteModelList(modelId),
    onSuccess: () => {
      message.success('删除成功')
      setDeletingId(null)
      queryClient.invalidateQueries({ queryKey: ['base-models'] })
    },
    onError: (error: any) => {
      console.error(error.message || '删除失败')
      setDeletingId(null)
    },
  })

  const handleDelete = (model: BaseModel) => {
    setDeletingId(model.id)
    deleteBaseModelMutation.mutate(Number(model.id))
  }

  // 查看日志
  const handleViewLogs = (model: BaseModel) => {
    navigate(`/project/admin/base-model/logs?modelId=${model.id}&modelName=${encodeURIComponent(model.name)}`)
  }

  // 启动基础模型下载任务
  const handleStart = async (record: BaseModel) => {
    const rowKey = record.id
    setStartLoadingRows((prev) => ({ ...prev, [rowKey]: true }))
    try {
      await taskExecutionService.manualStart({
        business_type: 'base_model',
        business_id: String(record.id),
      })
      message.success('启动成功')
      await queryClient.invalidateQueries({ queryKey: ['base-models'] })
    }
    catch (err) {
      console.error(err)
    }
    finally {
      setStartLoadingRows((prev) => {
        const next = { ...prev }
        delete next[rowKey]
        return next
      })
    }
  }

  // 终止基础模型下载任务
  const handleStop = async (record: BaseModel) => {
    const rowKey = record.id
    setStopLoadingRows((prev) => ({ ...prev, [rowKey]: true }))
    try {
      await ModelService.stopBaseModelDownload(record.id)
      message.success('终止成功')
      await queryClient.invalidateQueries({ queryKey: ['base-models'] })
    }
    catch (err) {
      console.error(err)
      console.error('终止失败')
    }
    finally {
      setStopLoadingRows((prev) => {
        const next = { ...prev }
        delete next[rowKey]
        return next
      })
    }
  }

  const handleRefresh = async () => {
    try {
      await refetch()
      message.success('刷新成功')
    }
    catch (error) {
      console.error('刷新失败:', error)
    }
  }

  // 模型仓库表格列定义
  const columns: TableColumnsType<BaseModel> = [
    {
      title: '模型Code',
      dataIndex: 'name',
      key: 'name',
      align: 'left',
      width: 180,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      align: 'left',
      width: 200,
      render: (text: string) => {
        const displayText = text || '-'
        return (
          <Tooltip title={displayText}>
            <Text className="w-[260px]" ellipsis={{ tooltip: false }}>
              {displayText}
            </Text>
          </Tooltip>
        )
      },
    },
    {
      title: '模型提供商',
      dataIndex: 'model_provider',
      key: 'model_provider',
      align: 'left',
      width: 80,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      align: 'left',
      width: 100,
      render: (status: string, record: BaseModel) => {
        const content = <span className="inline-block cursor-default">{status}</span>
        const isScheduledPending = status === '定时待启动'
        const tipTitle
          = isScheduledPending && record?.schedule_at
            ? `启动时间: ${dayjs(record.schedule_at).format('YYYY-MM-DD HH:mm:ss')}`
            : undefined
        return tipTitle ? (
          <Tooltip title={tipTitle} placement="topLeft">
            {content}
          </Tooltip>
        ) : (
          content
        )
      },
    },
    {
      title: '下载进度',
      dataIndex: 'progress',
      key: 'progress',
      align: 'left',
      width: 160,
      hidden: !isBelleProvider,
      render: (progress: string | null) => {
        if (!progress) {
          return '--'
        }
        const percent = Number(progress.replace('%', ''))
        return <Progress percent={percent} format={(percent) => `${percent}%`} />
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      align: 'left',
      width: 160,
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      width: !isBelleProvider ? 240 : '',
      align: 'left',
      fixed: 'right' as const,
      render: (_, record) => {
        const statusEnum = modelStatusEnums?.find((item) => item.value === record.status)
        // const statusLabel = statusEnum?.label ?? '';
        const isFailed = ['已创建', '定时待启动', '已完成', '失败', '已终止', '终止'].includes(record.status)
        // 可启动：等待、失败、已停止等
        const canStart = ['已创建'].includes(record.status)
        // 可终止：下载中、运行中等
        const canStop = ['排队中', '运行中'].includes(record.status)
        const rowStartLoading = startLoadingRows[record.id]
        const rowStopLoading = stopLoadingRows[record.id]

        const actions: TableActionItem[] = [
          {
            key: 'start',
            label: '启动',
            icon: <PlayCircleOutlined />,
            disabled: !canStart || rowStartLoading,
            loading: rowStartLoading,
            visible: true,
            onClick: () => handleStart(record),
          },
          {
            key: 'edit',
            label: '编辑',
            visible: !isBelleProvider,
            icon: <EditOutlined />,
            onClick: () => handleEdit(record),
          },
          {
            key: 'delete',
            label: '删除',
            icon: <DeleteOutlined />,
            danger: true,
            visible: isFailed && !isBelleProvider,
            loading: deletingId === record.id,
            confirm: {
              title: '确认删除',
              description: `确定要删除模型 ${record.name} 吗？删除后将无法恢复。`,
              onConfirm: () => handleDelete(record),
              okText: '确认删除',
              cancelText: '取消',
            },
          },
          {
            key: 'logs',
            label: '日志',
            icon: <FileOutlined />,
            visible: !!(record.model_source && record.model_source !== 'Local' && ['运行中', '已完成', '失败', '已终止', '终止'].includes(record?.status)) && !isBelleProvider,
            disabled: record.status === 'wait',
            onClick: () => handleViewLogs(record),
          },
          {
            key: 'stop',
            label: '终止',
            icon: <StopOutlined />,
            disabled: !canStop || rowStopLoading,
            loading: rowStopLoading,
            visible: !isBelleProvider,
            onClick: () => handleStop(record),
          },
        ]

        return (
          <Space size={24} className="base-model-actions">
            <TableActionColumn actions={actions} maxVisible={2} />
          </Space>
        )
      },
    },
  ]
  return (
    <div className="base-model-management-container lab-list-page-shell">
      <div className="flex justify-between mb-4">
        <Title level={4} className="m-0">模型仓库</Title>
      </div>

      <Card className="mb-4">
        <Form
          form={searchForm}
          layout="inline"
          onFinish={handleSearch}
          className="w-full flex flex-row flex-wrap gap-2"
        >
          <Form.Item name="model_provider" className="mb-2">
            <Select className="w-[250px]" placeholder="请选择模型提供商" allowClear>
              <Option value="Qwen">Qwen</Option>
            </Select>
          </Form.Item>
          <Form.Item className="mb-2">
            <Space>
              <Button type="primary" htmlType="submit">
                搜索
              </Button>
              <Button onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Form.Item>
          <div className="flex justify-end flex-1">
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRefresh}
                loading={loading}
              >
                刷新
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalVisible(true)}
              >
                新增模型
              </Button>
            </Space>
          </div>
        </Form>
      </Card>

      {/* 基础模型表格 */}
      <Table
        columns={columns}
        dataSource={baseModels}
        rowKey={(record) => record.id}
        loading={loading}
        className="base-model-table"
        pagination={{
          total,
          pageSize: searchParams.size || 20,
          current: searchParams.page || 1,
          onChange: handlePageChange,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条记录`,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
        scroll={{ x: 'max-content' }}
      />

      {/* 创建基础模型模态框 */}
      <CreateBaseModelModal
        visible={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onOk={handleCreateBaseModel}
        loading={createBaseModelMutation.isPending}
      />

      {/* 编辑基础模型模态框 */}
      <EditBaseModelModal
        visible={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false)
          setEditingModel(null)
        }}
        onOk={handleEditBaseModel}
        loading={updateBaseModelMutation.isPending}
        model={editingModel}
      />
    </div>
  )
}

export default BaseModelManagement
