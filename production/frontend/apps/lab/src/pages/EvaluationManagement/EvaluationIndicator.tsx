import React, { useState } from 'react'
import {
  Form,
  Input,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BasicMetricsResponse,
  EvaluationMetric } from '../../services/modelEvaluationServices'
import {
  modelEvaluationServices,
} from '../../services/modelEvaluationServices'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import TableToolbar from '@/components/common/TableToolbar'
import { formatDateTime } from '@/utils/timeProcessing'
import { getTablePagination } from '@/utils/tablePagination'

const { Title, Text } = Typography

interface ScoreScopeItem {
  score_min?: number
  score_max?: number
}

const EvaluationIndicatorPage: React.FC = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams<{ projectId: string }>()

  const [activeTab, setActiveTab] = useState('custom')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedScenario, setSelectedScenario] = useState<string | undefined>(undefined)
  const [searchForm] = Form.useForm()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 获取 projectId，优先从路由参数获取，如果没有则从 location.state 获取
  const currentProjectId = projectId || location.state?.projectId

  // 自定义指标查询
  const { data, isLoading } = useQuery({
    queryKey: ['evaluationMetrics', currentProjectId, searchKeyword, selectedScenario, currentPage, pageSize],
    queryFn: async () => {
      if (!currentProjectId) {
        throw new Error('缺少项目ID')
      }
      const result = await modelEvaluationServices.getProjectMetrics(Number(currentProjectId), {
        name: searchKeyword || undefined,
        page: currentPage,
        size: pageSize,
      })
      return result
    },
    enabled: !!currentProjectId && activeTab === 'custom',
    staleTime: 0,
    refetchOnMount: true,
  })

  // 基础指标查询
  const { data: basicMetricsData, isLoading: basicMetricsLoading } = useQuery({
    queryKey: ['basicMetrics'],
    queryFn: async () => {
      const result = await modelEvaluationServices.getBasicMetrics({
        page: 1,
        size: 1000,
      })
      console.log('基础指标数据:', result) // 调试日志
      return result
    },
    staleTime: 0,
    refetchOnMount: true,
    enabled: activeTab === 'basic',
  })

  const metrics = data?.items || []
  const total = data?.total || 0
  const availableBasicMetrics = Array.isArray(basicMetricsData)
    ? basicMetricsData
    : ((basicMetricsData as BasicMetricsResponse)?.items || [])

  const handleCreate = () => {
    navigate('create', { state: { projectId: currentProjectId } })
  }

  const handleEdit = (record: EvaluationMetric) => {
    navigate(`edit/${record.id}`, {
      state: {
        isEdit: true,
        initialValues: record,
        projectId: currentProjectId,
      },
    })
  }

  const handleView = (record: EvaluationMetric) => {
    navigate(`view/${record.id}`, {
      state: {
        isView: true,
        initialValues: record,
        projectId: currentProjectId,
      },
    })
  }

  const handleDelete = async (record: EvaluationMetric) => {
    if (!currentProjectId) {
      message.error('缺少项目ID')
      return
    }
    try {
      await modelEvaluationServices.deleteProjectMetric(Number(currentProjectId), record.id)
      message.success(`已删除指标: ${record.name}`)
      queryClient.invalidateQueries({ queryKey: ['evaluationMetrics'] })
    }
    catch (error) {
      message.error('删除失败')
    }
  }

  const handleSearch = (values: { keyword?: string }) => {
    setSearchKeyword(values.keyword || '')
    setSelectedScenario(undefined)
    setCurrentPage(1)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setSearchKeyword('')
    setSelectedScenario(undefined)
    setCurrentPage(1)
  }

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    if (key === 'custom') {
      setCurrentPage(1)
    }
  }

  const columns = [
    {
      title: '评估指标',
      dataIndex: 'name',
      key: 'name',
      width: 120,
    },
    {
      title: '指标说明',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      width: 300,
    },
    {
      title: '指标分值范围',
      dataIndex: 'score_scope',
      key: 'score_scope',
      width: 120,
      render: (score_scope: ScoreScopeItem[] | undefined | null) => {
        // score_scope 可能是 undefined/null 或数组（后端返回）
        if (!Array.isArray(score_scope) || score_scope.length === 0) {
          return <Tag color="default">-</Tag>
        }
        // 取最小分、最大分
        let min = Number.POSITIVE_INFINITY
        let max = Number.NEGATIVE_INFINITY
        score_scope.forEach((item: ScoreScopeItem) => {
          if (
            typeof item.score_min === 'number'
            && typeof item.score_max === 'number'
          ) {
            if (item.score_min < min) min = item.score_min
            if (item.score_max > max) max = item.score_max
          }
        })
        if (
          min === Number.POSITIVE_INFINITY
          || max === Number.NEGATIVE_INFINITY
        ) {
          return <Tag color="default">-</Tag>
        }
        return <Tag color="blue">{`${min}-${max}分`}</Tag>
      },
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (time: string) => formatDateTime(time),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right' as const,
      render: (_: unknown, record: EvaluationMetric) => {
        const actions: TableActionItem[] = record.is_builtin
          ? [{ key: 'view', label: '查看详情', onClick: () => handleView(record) }]
          : [
              { key: 'edit', label: '编辑', onClick: () => handleEdit(record) },
              {
                key: 'delete',
                label: '删除',
                confirm: {
                  title: '确定删除该指标吗？',
                  onConfirm: () => handleDelete(record),
                  okText: '确定',
                  cancelText: '取消',
                },
              },
            ]
        return <TableActionColumn actions={actions} />
      },
    },
  ]

  // 基础指标表格列
  const basicMetricsColumns = [
    {
      title: '指标',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '指标说明',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
  ]

  const DefiniteIndicator = () => {
    return (
      <>
        <TableToolbar
          form={searchForm}
          onSearch={handleSearch}
          searchFormItems={(
            <Form.Item name="keyword" className="mb-0">
              <Input
                placeholder="搜索指标名称"
                prefix={<SearchOutlined />}
                className="w-[200px]"
                allowClear
              />
            </Form.Item>
          )}
          rightActions={[
            {
              key: 'search',
              label: '搜索',
              type: 'primary',
              onClick: () => searchForm.submit(),
            },
            {
              key: 'reset',
              label: '重置',
              onClick: handleReset,
            },
          ]}
          toolbarActions={[
            {
              key: 'create',
              label: '新建指标',
              type: 'primary',
              onClick: handleCreate,
            },
          ]}
        />

        <Table
          columns={columns}
          dataSource={metrics}
          rowKey="id"
          loading={isLoading}
          pagination={getTablePagination({
            total,
            current: currentPage,
            pageSize,
            onChange: (page, size) => {
              setCurrentPage(page)
              setPageSize(size)
            },
          })}
          scroll={{ x: 1200 }}
        />
      </>
    )
  }

  const BasicIndicator = () => {
    return (
      <Table
        columns={basicMetricsColumns}
        dataSource={availableBasicMetrics}
        rowKey="name"
        loading={basicMetricsLoading}
        pagination={false}
        scroll={{ x: 1200 }}
        locale={{ emptyText: '暂无基础指标' }}
      />
    )
  }
  return (
    <div className="evaluation-indicator-container lab-list-page-shell">
      <div className="mb-4">
        <Title level={4} className="m-0 mb-2">
          评估指标
        </Title>
        <Text type="secondary">
          管理模型评估指标，适用于自动化评估、人工评估或模型选型场景。
        </Text>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'custom',
            label: '自定义指标',
            children: (
              <DefiniteIndicator />
            ),
          },
          {
            key: 'basic',
            label: '基础指标',
            children: (
              <BasicIndicator />
            ),
          },
        ]}
      />
    </div>
  )
}

export default EvaluationIndicatorPage
