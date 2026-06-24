import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { DeepSearchTable, createAxiosLikeRequestAdapter } from '@deep/deep-search-table'
import type { CrudNormalizedResponse, DeepSearchTableConfig, DeepSearchTableRef } from '@deep/deep-search-table'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import apiClient from '@/services/apiClient.ts'
import { machineAnnotationService } from '@/services/machineAnnotation.ts'
import type { MachineAnnotationItem } from '@/types/machineLearing/machineAnnotationModel.ts'
import { calculatePageAfterDelete } from '@/utils/paginationUtils.ts'

const { Title } = Typography

const statusRenderMap: Record<string, React.ReactNode> = {
  running: <Tag color="green">运行中</Tag>,
  stopped: <Tag color="default">已停止</Tag>,
  error: <Tag color="red">异常</Tag>,
  未测试: <Tag color="blue">未测试</Tag>,
  测试通过: <Tag color="green">测试通过</Tag>,
  测试失败: <Tag color="red">测试失败</Tag>,
}

function renderConnectionStatus(status: string) {
  return statusRenderMap[status] ?? <Tag>{status || '-'}</Tag>
}

const MachineOnlineAnnotation: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const tableRef = useRef<DeepSearchTableRef<MachineAnnotationItem>>(null)
  const [pageState, setPageState] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  })

  const handleDataLoaded = useCallback((payload: CrudNormalizedResponse<MachineAnnotationItem>) => {
    setPageState({
      current: payload.page ?? 1,
      pageSize: payload.pageSize ?? 10,
      total: payload.total,
    })
  }, [])

  const pid = Number(projectId)

  const tableConfig = useMemo<DeepSearchTableConfig<MachineAnnotationItem>>(() => ({
    rowKey: 'id',
    searchFields: [
      {
        type: 'input',
        key: 'name',
        props: { placeholder: '请输入服务名称', allowClear: true },
      },
    ],
    searchButtonText: '搜索',
    columns: [
      {
        title: '服务名称',
        dataIndex: 'name',
        key: 'name',
        align: 'left',
        fixed: 'left' as const,
        width: 150,
        ellipsis: true,
        render: (text: string, record: MachineAnnotationItem) => {
          const displayText = text.length > 10 ? `${text.substring(0, 10)}...` : text
          return (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                navigate(`${record.id}`)
              }}
              className="overflow-hidden text-ellipsis whitespace-nowrap break-all"
              title={text}
            >
              {displayText}
            </a>
          )
        },
      },
      {
        title: '连接状态',
        dataIndex: 'status',
        key: 'status',
        align: 'left',
        width: 120,
        render: (status: string) => renderConnectionStatus(status),
      },
      {
        title: '描述',
        dataIndex: 'description',
        key: 'description',
        align: 'left',
        width: 250,
        ellipsis: true,
        render: (text: string) => (
          <div className="max-w-[500px] overflow-hidden text-ellipsis whitespace-nowrap break-all" title={text}>
            {text || '-'}
          </div>
        ),
      },
      {
        title: '服务类型',
        key: 'service_type',
        align: 'left',
        width: 200,
        render: (_: unknown, record: MachineAnnotationItem) => {
          return (
            <div className="flex flex-wrap gap-1">
              {record.service_type}
            </div>
          )
        },
      },
      {
        title: '创建人',
        dataIndex: 'created_by',
        key: 'created_by',
        align: 'left',
        width: 120,
      },
      {
        title: '创建时间',
        dataIndex: 'created_at',
        key: 'created_at',
        align: 'left',
        width: 180,
        render: (text: string) => (text ? dayjs(text).format('YYYY/MM/DD HH:mm:ss') : '-'),
      },
      {
        title: '操作',
        key: 'action',
        align: 'left',
        fixed: 'right' as const,
        width: 100,
        render: (_: unknown, record: MachineAnnotationItem) => {
          const actions: TableActionItem[] = [
            {
              key: 'view',
              label: '详情',
              onClick: () => navigate(`${record.id}`),
            },
            {
              key: 'edit',
              label: '编辑',
              onClick: () => navigate('create', {
                state: { editId: record.id },
              }),
            },
            {
              key: 'test',
              label: '连接测试',
              onClick: async () => {
                try {
                  const result = await machineAnnotationService.testConnect(pid, { id: record.id })
                  if (result) {
                    message.success('连接测试成功')
                  }
                  else {
                    message.error('连接测试失败')
                  }
                  await tableRef.current?.reload()
                }
                catch (error) {
                  message.error(`连接测试失败：${(error as Error).message}`)
                }
              },
            },
            {
              key: 'delete',
              label: '删除',
              danger: true,
              confirm: {
                title: '确认删除',
                description: `确定要删除服务 ${record.name} 吗？删除后将无法恢复。`,
                okText: '确认删除',
                cancelText: '取消',
                onConfirm: async () => {
                  try {
                    await machineAnnotationService.delete(pid, record.id)
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
                  catch (error) {
                    message.error(`删除失败：${(error as Error).message}`)
                  }
                },
              },
            },
          ]
          return <TableActionColumn actions={actions} />
        },
      },
    ],
    toolbarActions: [
      {
        key: 'create',
        label: '新建服务',
        type: 'primary',
        icon: <PlusOutlined />,
      },
    ],
    actionHandlers: {
      create: () => {
        navigate('create')
      },
    },
    request: {
      url: `/online_annotation_service/project/${projectId}/list`,
      method: 'GET',
      requestAdapter: createAxiosLikeRequestAdapter(apiClient),
      buildParams: (payload) => {
        const nameRaw = payload.searchValues?.name
        const name = typeof nameRaw === 'string' ? nameRaw.trim() : ''
        return {
          page: payload.page,
          size: payload.pageSize,
          ...(name ? { name } : {}),
        }
      },
    },
    responseMapper: (response: {
      data?: {
        items?: MachineAnnotationItem[]
        total?: number | string
        page?: number | string
        size?: number | string
      }
    }) => ({
      list: response?.data?.items ?? [],
      total: Number(response?.data?.total ?? 0),
      page: Number(response?.data?.page ?? 1),
      pageSize: Number(response?.data?.size ?? 10),
      raw: response,
    }),
    queryConfig: {
      key: 'machineOnlineAnnotationList',
      enabled: !!projectId,
    },
    pagination: {
      current: 1,
      pageSize: 10,
    },
    onDataLoaded: handleDataLoaded,
    tableProps: {
      scroll: { x: 'max-content' },
      size: 'middle',
    },
  }), [projectId, pid, navigate, handleDataLoaded, pageState])

  return (
    <div className="machine-online-annotation-container lab-list-page-shell">
      <div className="mb-4">
        <Title level={4} className="m-0">
          在线标注服务
        </Title>
      </div>

      <DeepSearchTable<MachineAnnotationItem>
        ref={tableRef}
        config={tableConfig}
      />
    </div>
  )
}

export default MachineOnlineAnnotation
