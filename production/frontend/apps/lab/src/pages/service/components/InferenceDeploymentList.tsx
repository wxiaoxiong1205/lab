import { useEffect, useState } from 'react'
import type { TableColumnsType } from 'antd'
import { Button, Form, Input, Modal, Select, Space, Table, message } from 'antd'
import { CopyOutlined, DeleteOutlined, EyeOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import { DelopServerApi } from '@/services/inferenceService'
import { useCopy } from '@/hooks/useCopy'
import { ModelSource } from '@/types/inference/deplop'
/** 列表行数据（与推理任务列表接口字段对齐后的展示结构） */
export interface InferenceDeploymentListItem {
  id: number
  server_name: string
  model_name: string
  model_source: string
  desired_replicas: number
  ready_replicas: number
  status: '准备中' | '运行中' | '终止' | '停止' | '创建' | '失败'
  creator: string
  created_time: string
  access_url: string
}
export interface InferenceDeploymentListProps {
  pageTitle: string
  queryKeyPrefix: string
  fixedModelSource?: 'ml_model'
  detailPathRelative: string
  routeSegmentForCreate: string
  createPathSuffix: string
}
function mapApiDataToRows(apiItems: any[]): InferenceDeploymentListItem[] {
  return apiItems.map((item) => ({
    id: item.id,
    server_name: item.server_name,
    model_name: item.model_name,
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
  if (text === ModelSource.TrainedModel)
    return '训练生成'
  if (text === ModelSource.MachineModel)
    return '机器模型'
    /** 历史数据可能仍为 base_model，列表已不提供按基础模型筛选 */
  if (text === ModelSource.BaseModel)
    return '基础模型'
  return text
}
export default function InferenceDeploymentList(props: InferenceDeploymentListProps) {
  const { pageTitle, queryKeyPrefix, fixedModelSource, detailPathRelative, routeSegmentForCreate, createPathSuffix } = props
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams<{
    projectId: string
  }>()
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [searchParams, setSearchParams] = useState({
    page: 1,
    size: 10,
  })
  /** 与表单筛选联动，保证搜索/重置后列表请求与 queryKey 一致 */
  const [searchNonce, setSearchNonce] = useState(0)
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
  const [hasError, setHasError] = useState(false)
  useEffect(() => {
    const value = localStorage.getItem('projectEnumValues')
    if (value) {
      const options = JSON.parse(value).all_enums?.find((item: {
        enum_name: string
      }) => item.enum_name === 'TrainingTaskStatus')?.options
      if (options?.length) {
        setModelStatusList(options)
      }
      else {
        setModelStatusList([])
      }
    }
  }, [])
  const { data: services, refetch: reloadServicesList } = useQuery({
    queryKey: [queryKeyPrefix, projectId, searchParams.page, searchParams.size, fixedModelSource, searchNonce],
    queryFn: async () => {
      try {
        const rawModelSource = serverSearchForm.getFieldValue('model_source')
        const response = await DelopServerApi.list({
          project_id: parseInt(projectId || '0', 10),
          page: searchParams.page,
          size: searchParams.size,
          server_name: serverSearchForm.getFieldValue('server_name'),
          model_name: serverSearchForm.getFieldValue('model_name'),
          model_source: fixedModelSource === 'ml_model'
            ? 'ml_model'
            : (rawModelSource === 'all' ? undefined : rawModelSource),
          status: serverSearchForm.getFieldValue('status') === '全部' ? undefined : serverSearchForm.getFieldValue('status'),
        })
        let formattedServices = mapApiDataToRows(response.items)
        /** LLM 列表仅展示 base_model / trained_model，避免与其它入口数据混在一起 */
        if (fixedModelSource !== 'ml_model') {
          formattedServices = formattedServices.filter((r) => r.model_source === ModelSource.BaseModel || r.model_source === ModelSource.TrainedModel)
        }
        setTotal(response.total)
        return formattedServices
      }
      catch (error) {
        setHasError(true)
        return []
      }
      finally {
        setLoading(false)
      }
    },
    enabled: !hasError && !!projectId,
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
  const navigateToDetail = (taskId: number) => {
    navigate(`/project/${projectId}/${detailPathRelative}/${taskId}`)
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
  const columns: TableColumnsType<InferenceDeploymentListItem> = [
    {
      title: '服务名称',
      dataIndex: 'server_name',
      key: 'server_name',
      align: 'left',
      render: (text: string, record: InferenceDeploymentListItem) => (
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
    {
      title: '模型来源',
      dataIndex: 'model_source',
      key: 'model_source',
      align: 'left',
      render: (text: string) => (<div>{modelSourceLabel(text)}</div>),
    },
    {
      title: '实例数',
      key: 'slNum',
      align: 'left',
      render: (_, record: InferenceDeploymentListItem) => (
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
      render: (_, record: InferenceDeploymentListItem) => (
        <Space size="middle">
          <Button
            type="link"
            size="small"
            icon={<PlayCircleOutlined />}
            disabled={record.status === '运行中' || record.status === '准备中' || record.status === '创建'}
            onClick={() => {
              Modal.confirm({
                title: '确认启动',
                content: `确定要启动服务 ${record.server_name} 吗？`,
                okText: '确认启动',
                cancelText: '取消',
                okButtonProps: { type: 'primary' },
                centered: true,
                onOk: () => onListStartOrStop(projectId!, record.id, 'start'),
              })
            }}
          >
            启动
          </Button>

          <Button
            type="link"
            size="small"
            icon={<StopOutlined />}
            disabled={record.ready_replicas == 0}
            onClick={() => {
              Modal.confirm({
                title: '确认停止',
                content: '服务停止，所有依赖此服务的请求都将中断，请确保已无应用依赖！请确认是否停止？',
                okText: '确认停止',
                cancelText: '取消',
                okButtonProps: { danger: true },
                centered: true,
                onOk: () => onListStartOrStop(projectId!, record.id, 'stop'),
              })
            }}
          >
            停止
          </Button>

          <Button
            danger
            type="link"
            icon={<DeleteOutlined />}
            size="small"
            onClick={() => {
              Modal.confirm({
                title: '确认删除',
                content: `确定要删除服务 ${record.server_name} 吗？`,
                okText: '确认删除',
                cancelText: '取消',
                okButtonProps: { danger: true },
                centered: true,
                onOk: () => onListDelete(projectId!, record.id),
              })
            }}
          >
            删除
          </Button>

          <Button
            type="link"
            size="small"
            disabled={record.status !== '运行中'}
            icon={<EyeOutlined />}
            onClick={() => {
              setIsShowVisitInfo(true)
              setVisitInfo({ address: record.access_url, serverName: record.server_name })
            }}
          >
            访问信息
          </Button>
        </Space>
      ),
    },
  ]
  const handlePageChange = (page: number, size: number) => {
    setSearchParams((prev) => ({ ...prev, page, size }))
  }
  const handleSearch = () => {
    setSearchParams((prev) => ({ ...prev, page: 1 }))
    setSearchNonce((n) => n + 1)
  }
  const resetSearch = () => {
    serverSearchForm.resetFields()
    setSearchParams((prev) => ({ ...prev, page: 1 }))
    setSearchNonce((n) => n + 1)
  }
  const visitModal = (address: string, serviceName: string) => {
    const visitModalForm = [
      {
        label: '地址',
        value: address,
      },
      {
        label: '服务名称',
        value: serviceName,
      },
    ]
    return (
      <Modal title="访问信息" open={isShowVisitInfo} footer={null} onCancel={() => { setIsShowVisitInfo(false) }} centered width={600}>
        <div className="py-2 flex flex-col items-center">
          <div className="mb-4 text-gray-600 text-sm bg-blue-50 p-3 rounded-md border border-blue-200 w-full">
            您可以使用以下信息通过 API 访问该服务
          </div>

          <Form labelAlign="right" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} className="w-full max-w-lg">
            {visitModalForm.map((item, index) => (
              <Form.Item key={index} label={<span className="text-gray-700">{item.label}</span>}>
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
  const basePath = location.pathname.split(`/${routeSegmentForCreate}`)[0]
  return (
    <div className="inference-deployment-container lab-list-page-shell">
      <h2 className="text-xl font-semibold mb-4 text-[1.5rem]">{pageTitle}</h2>
      <Form form={serverSearchForm} layout="inline" onFinish={handleSearch} className="w-full">
        <div className="flex justify-between items-start flex-wrap gap-y-2 p-0 w-full">
          <div className="flex flex-wrap gap-2 flex-1 min-w-0">
            <Form.Item name="server_name" className="mb-2">
              <Input placeholder="请输入服务名称" className="w-[200px]" />
            </Form.Item>
            <Form.Item name="model_name" className="mb-2">
              <Input placeholder="请输入模型名称" className="w-[180px]" />
            </Form.Item>
            {!fixedModelSource && (
              <Form.Item name="model_source" className="mb-2">
                <Select placeholder="模型来源" className="w-[160px]" allowClear>
                  <Option value="all">全部</Option>
                  <Option value={ModelSource.BaseModel}>基础模型</Option>
                  <Option value={ModelSource.TrainedModel}>训练生成</Option>
                </Select>
              </Form.Item>
            )}
            <Form.Item name="status" className="mb-2">
              <Select placeholder="状态" className="w-[120px]" allowClear>
                <Option value="">全部</Option>
                {modelStatusList.map((item) => (<Option value={item.value} key={item.value}>{item.value}</Option>))}
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
              <Button
                type="primary"
                onClick={() => {
                  navigate(`${basePath}/${createPathSuffix}`)
                }}
              >
                部署服务
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
          showQuickJumper: true,
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
