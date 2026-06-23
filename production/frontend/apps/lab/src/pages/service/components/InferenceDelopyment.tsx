import { useEffect, useState } from 'react'
import type { TableColumnsType } from 'antd'
import { Button, Form, Input, Modal, Select, Space, Table, message } from 'antd'
import { CopyOutlined, DeleteOutlined, EyeOutlined, PlayCircleOutlined, SearchOutlined, StopOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { DelopServerApi } from '@/services/inferenceService'
import { useCopy } from '@/hooks/useCopy'
import { InferenceEngineType } from '@/types/inference/deplop'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'

const ML_MODEL_LIST_INFERENCE_ENGINES: InferenceEngineType[] = [
  InferenceEngineType.VLLM,
  InferenceEngineType.DGIServer,
  InferenceEngineType.MindIE,
  InferenceEngineType.SGLang,
]
export interface InferenceDelopymentProps {
  /** 页面标题 */
  pageTitle: string
  /** 列表查询 queryKey 前缀，避免与「模型部署 / 机器模型部署」缓存串用 */
  queryKeyPrefix: string
  /** 固定模型来源（如机器模型列表传 `ml_model`）时隐藏来源筛选项并始终带给列表接口 */
  fixedModelSource?: string
  /** 详情页路径段（相对 projectId），如 `service/inference/hosted` 或 `machine-model-deployment` */
  detailPathRelative: string
  /** 创建页路径段（相对 projectId），如 `service/inference/hosted/create` */
  createPathSuffix: string
  /** 右上角创建按钮文案 */
  createButtonLabel?: string
}
interface InferenceService {
  id: number
  server_name: string
  model_name: string
  model_source: string
  desired_replicas: number
  ready_replicas: number
  status: string
  creator: string
  created_time: string
  access_url: string
}
function mapApiDataToComponentFormat(apiItems: any[]): InferenceService[] {
  return apiItems.map((item) => ({
    id: item.id,
    server_name: item.server_name,
    model_name: item.model_name,
    network_architecture: item?.network_architecture || '-',
    model_source: item.model_source,
    desired_replicas: item.desired_replicas,
    ready_replicas: item.ready_replicas,
    status: item.status,
    creator: item.created_by,
    created_time: dayjs(item.created_at).format('YYYY/MM/DD HH:mm:ss'),
    access_url: item.access_url,
  }))
}
function modelSourceLabel(text: string) {
  if (text === 'trained_model')
    return '训练生成'
  if (text === 'base_model')
    return '基础模型'
  if (text === 'ml_model')
    return '机器模型'
  return text
}
/**
 * 已部署推理任务列表（模型部署 / 机器模型部署共用）
 */
export default function InferenceDelopyment(props: InferenceDelopymentProps) {
  const { pageTitle, queryKeyPrefix, fixedModelSource, detailPathRelative, createPathSuffix, createButtonLabel = '部署服务' } = props
  const navigate = useNavigate()
  const { projectId } = useParams<{
    projectId: string
  }>()
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [searchParams, setSearchParams] = useState({
    page: 1,
    size: 10,
  })
  const { Option } = Select
  const [serverSearchForm] = Form.useForm()
  const [isShowVisitInfo, setIsShowVisitInfo] = useState(false)
  const { copy } = useCopy()
  const [visitInfo, setVisitInfo] = useState<{
    address: string
    serverName: string
  }>({ address: '', serverName: '' })
  const [modelStatusList, setModelStatusList] = useState<Array<{
    name?: string
    value: string
    label?: string
    description?: string
  }>>([])
  useEffect(() => {
    const value = localStorage.getItem('projectEnumValues')
    if (value) {
      const options = JSON.parse(value).all_enums?.find((item: {
        enum_name: string
      }) => item.enum_name === 'TrainingTaskStatus')?.options
      if (options?.length)
        setModelStatusList(options)
      else
        setModelStatusList([])
    }
  }, [])
  const { data: services, refetch: reloadServicesList } = useQuery({
    queryKey: [queryKeyPrefix, projectId, searchParams.page, searchParams.size, fixedModelSource ?? ''],
    queryFn: async () => {
      try {
        const modelSourceParam = fixedModelSource
          ?? (serverSearchForm.getFieldValue('model_source') === 'all' ? undefined : serverSearchForm.getFieldValue('model_source'))
        const response = await DelopServerApi.list({
          project_id: parseInt(projectId!, 10),
          page: searchParams.page,
          size: searchParams.size,
          server_name: serverSearchForm.getFieldValue('server_name'),
          model_name: serverSearchForm.getFieldValue('model_name'),
          model_source: modelSourceParam,
          inference_engine_type: fixedModelSource ? 'ML' : ML_MODEL_LIST_INFERENCE_ENGINES,
          status: serverSearchForm.getFieldValue('status') === '全部' ? undefined : serverSearchForm.getFieldValue('status'),
        })
        const formattedServices = mapApiDataToComponentFormat(response.items)
        setTotal(response.total)
        return formattedServices
      }
      catch (err) {
        console.error('加载推理部署列表失败:', err)
        return []
      }
      finally {
        setLoading(false)
      }
    },
    enabled: !!projectId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 3000,
  })
  const handleReload = async () => {
    setLoading(true)
    await reloadServicesList()
    setLoading(false)
  }
  const navigateToDetail = (id: number) => {
    navigate(`/project/${projectId}/${detailPathRelative}/${id}`)
  }
  const onListStartOrStop = async (pid: string, inferenceTaskId: number, updateType: 'start' | 'stop') => {
    try {
      await DelopServerApi.startOrStop({ project_id: Number(pid), inference_task_id: inferenceTaskId, update_type: updateType })
      message.success(`${updateType === 'start' ? '启动' : '停止'}成功`)
      handleReload()
    }
    catch (error) {
      console.error(`${updateType === 'start' ? '启动' : '停止'}失败:`, error)
    }
  }
  const onListDelete = async (pid: string, inferenceTaskId: number) => {
    try {
      await DelopServerApi.delete({ project_id: Number(pid), inference_task_id: inferenceTaskId })
      message.success('删除成功')
      handleReload()
    }
    catch (error) {
      console.error('删除失败:', error)
    }
  }
  const columns: TableColumnsType<InferenceService> = [
    {
      title: '服务名称',
      dataIndex: 'server_name',
      key: 'server_name',
      align: 'left',
      render: (text: string, record: InferenceService) => (
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            navigateToDetail(record.id)
          }}
        >
          {text}
        </a>
      ),
    },
    {
      title: '模型名称',
      dataIndex: 'model_name',
      key: 'model_name',
      align: 'left',
    },
    ...(fixedModelSource ? [{
      title: '网络架构',
      dataIndex: 'network_architecture',
      key: 'network_architecture',
      align: 'left' as const,
      render: (text: string) => <div>{text}</div>,
    }]
      : []),
    {
      title: '模型来源',
      dataIndex: 'model_source',
      key: 'model_source',
      align: 'left',
      render: (text: string) => <div>{modelSourceLabel(text)}</div>,
    },
    {
      title: '实例数',
      key: 'slNum',
      align: 'left',
      render: (_, record: InferenceService) => (
        <div>
          {record.ready_replicas}
          /
          {record.desired_replicas}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      align: 'left',
    },
    {
      title: '创建人',
      dataIndex: 'creator',
      key: 'creator',
      align: 'left',
    },
    {
      title: '创建时间',
      dataIndex: 'created_time',
      key: 'created_time',
      align: 'center',
    },
    {
      title: '操作',
      key: 'action',
      align: 'center',
      width: 200,
      fixed: 'right' as const,
      render: (_, record: InferenceService) => {
        const actions: TableActionItem[] = [
          {
            key: 'start',
            label: '启动',
            icon: <PlayCircleOutlined />,
            disabled: !['已创建', '已终止', '失败'].includes(record.status),
            onClick: () => {
              Modal.confirm({
                title: '确认启动',
                content: `确定要启动服务 ${record.server_name} 吗？`,
                okText: '确认启动',
                cancelText: '取消',
                okButtonProps: { type: 'primary' },
                centered: true,
                onOk: () => onListStartOrStop(projectId!, record.id, 'start'),
              })
            },
          },
          {
            key: 'stop',
            label: '停止',
            icon: <StopOutlined />,
            disabled: !['排队中', '运行中'].includes(record.status),
            onClick: () => {
              Modal.confirm({
                title: '确认停止',
                content: '服务停止，所有依赖此服务的请求都将中断，请确保已无应用依赖！请确认是否停止？',
                okText: '确认停止',
                cancelText: '取消',
                okButtonProps: { danger: true },
                centered: true,
                onOk: () => onListStartOrStop(projectId!, record.id, 'stop'),
              })
            },
          },
          {
            key: 'delete',
            label: '删除',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => {
              Modal.confirm({
                title: '确认删除',
                content: `确定要删除服务 ${record.server_name} 吗？`,
                okText: '确认删除',
                cancelText: '取消',
                okButtonProps: { danger: true },
                centered: true,
                onOk: () => onListDelete(projectId!, record.id),
              })
            },
          },
          {
            key: 'visit',
            label: '访问信息',
            icon: <EyeOutlined />,
            disabled: record.status !== '运行中',
            onClick: () => {
              setIsShowVisitInfo(true)
              setVisitInfo({ address: record.access_url, serverName: record.server_name })
            },
          },
        ]
        return <TableActionColumn actions={actions} />
      },
    },
  ]
  const handlePageChange = (page: number, size: number) => {
    setSearchParams((prev) => ({ ...prev, page, size }))
  }
  const handleSearch = () => {
    handleReload()
  }
  const resetSearch = () => {
    serverSearchForm.resetFields()
    handleReload()
  }
  const visitModal = (address: string, serviceName: string) => {
    const visitModalForm = [
      { label: '地址', value: address },
      { label: '服务名称', value: serviceName },
    ]
    return (
      <Modal title="访问信息" open={isShowVisitInfo} footer={null} onCancel={() => { setIsShowVisitInfo(false) }} centered width={600}>
        <div className="py-2 flex flex-col items-center">
          <div className="mb-4 text-gray-600 text-sm bg-blue-50 p-3 rounded-md border border-blue-200 w-full">
            您可以使用以下信息通过 API 访问该服务
          </div>

          <Form labelAlign="right" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} className="w-full max-w-lg">
            {visitModalForm.map((item) => (
              <Form.Item key={item.label} label={<span className="text-gray-700">{item.label}</span>}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 px-3 py-1 bg-gray-50 border border-gray-300 rounded-md text-gray-800 font-mono text-sm hover:bg-gray-100 transition-colors">
                    <div className="truncate" title={item.value}>
                      {item.value}
                    </div>
                  </div>
                  <Button icon={<CopyOutlined />} type="default" size="middle" onClick={() => copy(item.value, item.label)} className="flex-shrink-0" title={`复制${item.label}`}>
                    复制
                  </Button>
                </div>
              </Form.Item>
            ))}
          </Form>
        </div>
      </Modal>
    )
  }
  return (
    <div className="inference-deployment-container lab-list-page-shell">
      <h2 className="text-xl font-semibold mb-4 text-[1.5rem]">{pageTitle}</h2>
      <Form form={serverSearchForm} layout="inline" onFinish={handleSearch} className="w-full">
        <div className="flex justify-between items-start flex-wrap gap-y-2 p-0 w-full">
          <div className="flex flex-wrap gap-2 flex-1 min-w-0">
            <Form.Item name="server_name" className="mb-2">
              <Input placeholder="请输入服务名称" prefix={<SearchOutlined />} className="w-[200px]" />
            </Form.Item>
            <Form.Item name="model_name" className="mb-2">
              <Input placeholder="请输入模型名称" prefix={<SearchOutlined />} className="w-[180px]" />
            </Form.Item>
            {!fixedModelSource && (
              <Form.Item name="model_source" className="mb-2">
                <Select placeholder="模型来源" className="w-[140px]" allowClear>
                  <Option value="all">全部</Option>
                  <Option value="trained_model">训练生成</Option>
                  <Option value="base_model">基础模型</Option>
                </Select>
              </Form.Item>
            )}
            <Form.Item name="status" className="mb-2">
              <Select placeholder="状态" className="!w-[120px]" allowClear>
                <Option value="">全部</Option>
                {modelStatusList.map((item) => (<Option value={item.value} key={`${item.value}-${item.label ?? ''}`}>{item.value}</Option>))}
              </Select>
            </Form.Item>
          </div>
          <Form.Item className="mb-2 ml-0">
            <Space>
              <Button type="primary" htmlType="submit">
                搜索
              </Button>
              <Button onClick={resetSearch}>
                重置
              </Button>
            </Space>
          </Form.Item>

          <div className="flex items-center gap-2 shrink-0 ml-[auto]">
            <Form.Item className="mb-2 mr-0">
              <Button type="primary" onClick={() => navigate(`/project/${projectId}/${createPathSuffix}`)}>
                {createButtonLabel}
              </Button>
            </Form.Item>
          </div>
        </div>
      </Form>

      <Table
        columns={columns}
        dataSource={services}
        rowKey={(record) => record.id}
        loading={loading}
        pagination={{
          total,
          pageSize: searchParams.size,
          current: searchParams.page,
          onChange: handlePageChange,
          showSizeChanger: true,
          showQuickJumper: false,
          showTotal: (t) => `共 ${t} 条记录`,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
        className="mt-4"
        scroll={{ x: 'max-content' }}
      />

      {visitModal(visitInfo.address, visitInfo.serverName)}
    </div>
  )
}
