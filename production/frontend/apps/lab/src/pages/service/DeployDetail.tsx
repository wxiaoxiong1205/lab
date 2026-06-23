import type { DescriptionsProps, TableColumnsType } from 'antd'
import { Button, Card, Descriptions, Form, InputNumber, Modal, Skeleton, Space, Table, Tabs, Tag, Tooltip, message } from 'antd'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftOutlined, CheckOutlined, CloseOutlined, FormOutlined } from '@ant-design/icons'
import { useWebSocket } from 'ahooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import React from 'react'
import DeployServicePage from './DeployServicePage'
import { CodeView } from '@/components/codeView'
import { DelopServerApi } from '@/services/inferenceService'
import { getInstanceList, getPodLogsStreamUrl } from '@/services/kubernetesService'
import { ModelSource } from '@/types/inference/deplop'

function deployDetailModelSourceLabel(source: string) {
  if (source === ModelSource.BaseModel)
    return '基础模型'
  if (source === ModelSource.TrainedModel)
    return '训练生成'
  if (source === ModelSource.MachineModel)
    return '机器模型'
  return source
}
const InferenceServiceDetailPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { inference_task_id } = useParams<{
    inference_task_id: string
  }>()
  const { projectId } = useParams<{
    projectId: string
  }>()
  const isMachineDeploymentRoute = location.pathname.includes('machine-model-deployment')
  // const [serviceDetail, setServiceDetail] = useState<any>();
  const [isLoading, setIsLoading] = useState(true)
  const [suspendInferenceDetailQuery, setSuspendInferenceDetailQuery] = useState(false)
  const [descriptionList, setDescription] = useState<DescriptionsProps['items']>()
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [current, setCurrent] = useState(1)
  const tabs = [
    {
      key: 'basic',
      label: '基本信息',
    },
    {
      key: 'Deployment',
      label: '部署信息',
    },
    {
      key: 'real',
      label: '实例管理',
    },
  ]
  const [activeTab, setActiveTab] = useState(tabs[0]?.key || 'basic')
  // const [realList, setRealList] = useState<InstanceListResponse[]>([])
  // 实例管理内容
  const [slControlForm] = Form.useForm()
  const [slNumBtnStatus, setSlNumBtnStatus] = useState<'show' | 'edit'>('show')
  const [targetDesiredReplicas, setTargetDesiredReplicas] = useState<number>(0) // 目标实例数
  const [desiredReplicas, setDesiredReplicas] = useState<number>(0)
  const [showCodeView, setShowCodeView] = useState(false)
  // 日志文本
  const [selectedPodInfo, setSelectedPodInfo] = useState<{
    podName: string
    containerName: string
  }>({ podName: '', containerName: '' })
  const [logsText, setLogsText] = useState<string>('')
  // 构建 WebSocket URL（只有 Modal 打开且有 pod 信息时才构建）
  const socketUrl = useMemo(() => {
    if (!showCodeView || !selectedPodInfo || !projectId)
      return ''
    return getPodLogsStreamUrl(Number(projectId), selectedPodInfo.podName)
  }, [showCodeView, selectedPodInfo, projectId])
  // 解析日志信息
  const parseLokiLogMessage = (message: string | any): string => {
    try {
      // 如果是字符串，先解析成对象
      const data = typeof message === 'string' ? JSON.parse(message) : message
      if (!data.streams || !Array.isArray(data.streams)) {
        return ''
      }
      const logs: string[] = []
      // 遍历所有 streams
      data.streams.forEach((stream: any) => {
        if (!stream.values || !Array.isArray(stream.values))
          return
        // 遍历每条日志
        stream.values.forEach((value: any[]) => {
          if (value.length < 2)
            return
          const timestamp = value[0] // 纳秒级时间戳
          const logContent = value[1] // 日志内容
          // 将纳秒时间戳转换为毫秒（去掉后6位）
          const timestampMs = Math.floor(parseInt(timestamp) / 1000000)
          const date = new Date(timestampMs)
          // 格式化时间
          const timeStr = date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })
          // 拼接时间和日志内容
          logs.push(`[${timeStr}] ${logContent}`)
        })
      })
      return logs.join('')
    }
    catch (error) {
      console.error('解析日志失败:', error)
      return ''
    }
  }
  // WebSocket 连接
  const { disconnect } = useWebSocket(socketUrl, {
    manual: !socketUrl, // socketUrl 为空时不自动连接
    onOpen: () => {
      setLogsText('') // 连接成功后清空旧日志
    },
    onMessage: (event) => {
      // 解析 Loki 格式的日志
      const formattedLog = parseLokiLogMessage(event.data)
      // 追加到 logsText
      if (formattedLog) {
        setLogsText((prev) => prev + formattedLog)
      }
    },
    onError: (event) => {
      console.error('WebSocket 错误:', event)
      message.error('日志连接失败')
    },
    onClose: () => {
    },
  })
  // 日志关闭
  const handleCloseCodeView = () => {
    // 断开 WebSocket 连接
    disconnect && disconnect()
    // 关闭 Modal
    setShowCodeView(false)
    // 清空状态
    setSelectedPodInfo(null)
    setLogsText('')
  }
  const inferenceDetailQueryEnabled = !suspendInferenceDetailQuery && !!(projectId && inference_task_id)
  // 获取服务详情（各 Tab 均需 serviceDetail；此前仅在「基本信息」enabled，切到「部署信息」会导致无法拉取/更新）
  const { data: serviceDetail, refetch: refetchServiceDetail } = useQuery({
    queryKey: ['inference-service-detail', projectId, inference_task_id],
    queryFn: async () => {
      try {
        const res = await DelopServerApi.getDetail({
          project_id: parseInt(projectId!),
          inference_task_id: parseInt(inference_task_id!),
        })
        const desc: DescriptionsProps['items'] = [
          {
            key: 'server_name',
            label: '服务名称',
            children: res.server_name,
          },
          {
            key: 'model_name',
            label: '模型名称',
            children: res.model_name,
          },
          {
            key: 'model_source',
            label: '模型来源',
            children: deployDetailModelSourceLabel(String(res.model_source)),
          },
          {
            key: 'model_id',
            label: '服务ID',
            children: res.id,
          },
          {
            key: 'created_at',
            label: '创建时间',
            children: dayjs(res.created_at).format('YYYY-MM-DD HH:mm:ss'),
          },
        ]
        setDescription(desc)
        // 当目标实例数不为0时，说明是编辑实例数，需要轮询获取真实实例数
        // 如果目标实例数和真实实例数相等，则设置当前实例数为真实实例数，并清空目标实例数
        if (targetDesiredReplicas != 0) {
          if (targetDesiredReplicas == res.desired_replicas) {
            setDesiredReplicas(res.desired_replicas)
            setTargetDesiredReplicas(0)
          }
          setDesiredReplicas(targetDesiredReplicas)
        }
        else {
          setDesiredReplicas(res.desired_replicas)
        }
        return res
      }
      catch (error) {
        console.error(error)
        throw error
      }
      finally {
        setIsLoading(false)
      }
    },
    enabled: inferenceDetailQueryEnabled,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: activeTab !== 'Deployment',
    refetchInterval: (query) => {
      if (activeTab === 'Deployment')
        return false
      if (query.state.error)
        return false
      return 3000
    },
  })
  // 获取实例列表
  const { data: realList, refetch: refetchRealList } = useQuery({
    queryKey: ['inference-service-real-list', inference_task_id],
    queryFn: async () => {
      try {
        const res = await getInstanceList(parseInt(projectId), serviceDetail?.app_name)
        return res
      }
      catch (error) {
        console.error(error)
        throw error
      }
      finally {
        setIsLoading(false)
      }
    },
    enabled: activeTab === 'real',
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: (query) => query.state.error ? null : 3000,
  })
  useEffect(() => {
    switch (activeTab) {
      case 'basic':
        setIsLoading(true)
        refetchServiceDetail()
        break
      case 'Deployment':
        setIsLoading(true)
        refetchServiceDetail()
        break
      case 'real':
        setIsLoading(true)
        refetchRealList()
        break
    }
  }, [activeTab])
  // 返回列表页
  const handleBack = () => {
    if (!projectId) {
      navigate(-1)
      return
    }
    navigate(`/project/${projectId}/${isMachineDeploymentRoute ? 'machine-model-deployment' : 'service/inference/hosted'}`)
  }
  // 获取状态标签颜色
  const getStatusTagColor = (status: string) => {
    const statusMap: Record<string, string> = {
      创建: 'success',
      运行中: 'success',
      准备中: 'processing',
      终止: 'error',
      失败: 'error',
    }
    return statusMap[status] || 'default'
  }
  // 基本信息卡片
  const basicView = () => {
    return (
      <>
        <Tag className="rounded-[12px] p-[4px_16px]" color={getStatusTagColor(serviceDetail.status)}>
          {serviceDetail.status}
        </Tag>
        <Descriptions className="!pl-1 !pt-4" column={1} items={descriptionList} />
      </>
    )
  }
  // 部署信息内容
  const handleTwiceDeploySuccess = () => {
    setSuspendInferenceDetailQuery(true)
    void queryClient.cancelQueries({
      queryKey: ['inference-service-detail', projectId, inference_task_id],
    })
  }
  const DeploymentView = () => {
    return (
      <div>
        <DeployServicePage twice readyDelopMsg={serviceDetail} onTwiceDeploySuccess={handleTwiceDeploySuccess} />
      </div>
    )
  }
  // 实例管理内容
  const RealView = () => {
    const editDesiredReplicas = async (type: 'save' | 'cancel') => {
      if (type == 'save') {
        try {
          await slControlForm.validateFields()
          const values = slControlForm.getFieldsValue()
          await DelopServerApi.updateDesiredReplicas({
            project_id: parseInt(projectId),
            inference_task_id: serviceDetail.id,
            desired_replicas: values.desired_replicas,
          })
          message.success('保存成功')
          setSlNumBtnStatus('show')
          // 设置目标实例数和当前实例数，轮询获取真实实例数
          setTargetDesiredReplicas(values.desired_replicas)
          setDesiredReplicas(values.desired_replicas)
          setLoading(true)
          await refetchRealList()
        }
        catch (error) {
          console.error(error)
        }
      }
      else {
        setSlNumBtnStatus('show')
        slControlForm.setFieldValue('desired_replicas', desiredReplicas)
      }
    }
    const logView = (record: any) => {
      // 记录要查看的 pod 信息
      setSelectedPodInfo({
        podName: record.pod_name,
        containerName: record.containers[0]?.name || '',
      })
      // 清空旧日志
      setLogsText('')
      // 打开 Modal
      setShowCodeView(true)
    }
    const columns: TableColumnsType<any> = [
      {
        title: '实例名称',
        align: 'center',
        key: 'pod_name',
        dataIndex: 'pod_name',
      },
      {
        title: '状态',
        align: 'center',
        key: 'phase',
        dataIndex: 'phase',
      },
      {
        title: '操作',
        dataIndex: 'action',
        key: 'action',
        align: 'center',
        render: (_: any, record: any) => {
          return (
            <div>
              <Button type="link" onClick={() => logView(record)}>日志</Button>
            </div>
          )
        },
      },
    ]
    return (
      <>
        <Form
          form={slControlForm}
          layout="inline"
          // onFinish={editDesiredReplicas}
          className="w-full"
        >
          <Form.Item label="实例数">
            {slNumBtnStatus == 'edit' ? (
              <div className="flex items-center gap-2 !w-45">
                <Space.Compact block>
                  <Form.Item
                    name="desired_replicas"
                    noStyle
                    rules={[
                      {
                        required: true,
                        message: '请输入实例数',
                      },
                      {
                        pattern: /^[1-9]\d*$/,
                        message: '实例数必须为正整数',
                      },
                    ]}
                    initialValue={desiredReplicas.toString()}
                  >
                    <InputNumber className="!w-full" placeholder="请输入实例数" onPressEnter={() => editDesiredReplicas('save')} />
                  </Form.Item>
                  <Tooltip title="保存">
                    <Button icon={<CheckOutlined />} onClick={() => editDesiredReplicas('save')}></Button>
                  </Tooltip>
                  <Tooltip title="取消">
                    <Button icon={<CloseOutlined />} onClick={() => editDesiredReplicas('cancel')}></Button>
                  </Tooltip>
                </Space.Compact>

              </div>
            )
              : (
                  <div className="hover:cursor-pointer flex items-center gap-2">
                    <Space.Compact block>
                      <Button>{desiredReplicas}</Button>
                      <Tooltip title="编辑">
                        <Button icon={<FormOutlined />} onClick={() => setSlNumBtnStatus('edit')}></Button>
                      </Tooltip>
                    </Space.Compact>
                  </div>
                )}
          </Form.Item>
        </Form>

        <Table
          columns={columns}
          dataSource={realList}
          rowKey={(record) => record.id}
          // loading={isLoading}
          pagination={{
            total,
            pageSize,
            current,
            onChange: (page: number, size: number) => {
              setPageSize(size)
              setCurrent(page)
            },
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          className="mt-4"
          scroll={{ x: 'max-content' }} // 设置为max-content让表格根据内容自动调整宽度
        />
      </>
    )
  }
  return (
    <div className="inference-deployment-detail-container lab-list-page-shell">
      {/* 页面头部 */}
      <div className="mb-4">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回
        </Button>
      </div>

      <Card>
        <Tabs activeKey={activeTab} items={tabs} onChange={(key: string) => setActiveTab(key)}>
        </Tabs>

        {isLoading ? (<Skeleton active paragraph={{ rows: 4 }} />) : (serviceDetail && (activeTab == 'basic' ? basicView()
          : activeTab == 'Deployment' ? DeploymentView()
            : activeTab == 'real' ? RealView() : null))}
      </Card>

      <Modal open={showCodeView} onCancel={handleCloseCodeView} width="80%" title="日志" centered cancelText="取消" okText="确认" onOk={() => setShowCodeView(false)} footer={null}>
        {CodeView({
          text: logsText,
          language: 'log',
          customStyle: {
            height: '60vh',
          },
          featureControl: {
            wordCount: false,
          },
        })}
      </Modal>
    </div>
  )
}
export default InferenceServiceDetailPage
