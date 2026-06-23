import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Col, Descriptions, Input, Row, Spin, Table, Tabs, Tag, Tooltip, Typography, message } from 'antd'
import { ArrowLeftOutlined, ClearOutlined, CodeOutlined, DatabaseOutlined, DownloadOutlined, HistoryOutlined, PauseOutlined, PlayCircleOutlined, ReloadOutlined, SearchOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { finetuneTaskService } from '@/services/FinetuneTrainingServices'
import { TrainingTaskStatusMapping } from '@/utils/EnumMaping'
import MLflowInfo from '@/components/MLflowInfo'
import { formatDuration } from '@/utils/timeProcessing'
import { useConfigStore } from '@/stores/configStore'
import './ExperimentRunDetail.css'

const { Text } = Typography
/**
 * 实验运行详情页面
 * 展示训练任务的详细信息，包括基本信息、参数配置、数据集等
 */
const ExperimentRunDetail: React.FC = () => {
  const { projectId, runId } = useParams<{
    projectId: string
    runId: string
  }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const version = searchParams.get('version')
  const [runDetail, setRunDetail] = useState<any>(null)
  const logTab = searchParams.get('activeTab')
  const [activeTab, setActiveTab] = useState(logTab || 'datasets')
  const [logSearchText, setLogSearchText] = useState('')
  const [mergedLogsData, setMergedLogsData] = useState<any>(null)
  const [isPolling, setIsPolling] = useState(false)
  const logsContainerRef = React.useRef<HTMLDivElement>(null)
  const [fineTuningType, setFineTuningType] = useState<any[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { config, providerType } = useConfigStore()
  const queryClient = useQueryClient()
  // 刷新页面数据
  const handleRefresh = async () => {
    if (!projectId || !runId)
      return
    setIsRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finetuneRuns', projectId, runId] }),
        queryClient.invalidateQueries({ queryKey: ['taskCheckpoints', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['trainingLogs', projectId, runId] }),
      ])
      message.success('刷新成功')
    }
    catch {
      message.error('刷新失败，请重试')
    }
    finally {
      setIsRefreshing(false)
    }
  }
  // 获取检查点数据
  const { data: checkpointsData, isLoading: isCheckpointsLoading, error: checkpointsError } = useQuery({
    queryKey: ['taskCheckpoints', projectId, runDetail?.id, activeTab],
    queryFn: async () => {
      try {
        const response = await finetuneTaskService.getTaskCheckpoints(Number(projectId), runDetail?.id)
        return response
      }
      catch (err) {
        console.error('获取检查点失败:', err)
        throw err
      }
    },
    enabled: activeTab === 'artifacts' && Boolean(runDetail?.id), // 只在训练产物tab激活时执行查询
    retry: 2,
    staleTime: 0, // 数据立即过期，确保每次都是最新的
    refetchOnMount: 'always', // 每次挂载时都重新获取
  })
  // 获取训练任务详情
  const { data, isLoading, error } = useQuery({
    queryKey: ['finetuneRuns', projectId, runId],
    queryFn: async () => {
      try {
        const response = await finetuneTaskService.getTaskVersions(Number(projectId), runId)
        return response
      }
      catch (err) {
        console.error('获取训练任务详情失败:', err)
        throw err
      }
    },
    enabled: !!projectId && !!runId && activeTab !== 'artifacts', // 训练产物tab时不调用
    retry: 3,
    refetchOnMount: 'always',
  })
  useEffect(() => {
    if (!data || !Array.isArray(data) || data?.length === 0)
      return
    if (version) {
      const versionData = data.find((item: any) => item.version === version)
      setRunDetail(versionData)
    }
    else {
      setRunDetail(data[0])
    }
  }, [data, version])
  useEffect(() => {
    const projectEnumValues = JSON.parse(localStorage.getItem('projectEnumValues') || '{}')
    const TypeList = projectEnumValues?.enums_by_module?.training_task?.find((item) => item.enum_name === 'LRSchedulerType')?.options || []
    setFineTuningType(TypeList)
  }, [])
  const getFineTuningTypeName = (value: string) => {
    switch (value) {
      case 'full':
        return '全参微调'
      case 'lora':
        return 'Lora微调'
      default: '-'
    }
  }
  // 获取学习率调度器类型名称
  const getLRSchedulerTypeName = (value: string) => {
    if (!value)
      return '-'
    const matchedOption = fineTuningType.find((item: any) => item.value === value)
    return matchedOption?.name || value
  }
  // GPU使用率
  // 格式化时间
  const formatTime = (timeString?: string, format: 'locale' | 'iso' | 'datetime' = 'locale') => {
    if (!timeString)
      return '-'
    try {
      const date = new Date(timeString)
      switch (format) {
        case 'iso':
          return date.toISOString()
        case 'datetime':
          return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        default:
          return date.toLocaleString('zh-CN')
      }
    }
    catch (error) {
      console.error('时间格式化错误:', error)
      return '-'
    }
  }
  const { data: logsData, isLoading: isLogsLoading, error: logsError } = useQuery({
    queryKey: ['trainingLogs', projectId, runId, version, activeTab],
    queryFn: async () => {
      try {
        // 获取当前时间，东八区ISO格式
        const endTime = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00')
        const response = await finetuneTaskService.getTaskLogs(Number(projectId), runDetail?.id, endTime)
        return response
      }
      catch (err) {
        console.error('获取训练日志失败:', err)
        throw err
      }
    },
    enabled: activeTab === 'logs' && Boolean(runDetail?.id), // 只在日志tab激活时执行查询
    retry: 2,
    staleTime: 0, // 数据立即过期，确保每次都是最新的
    refetchOnMount: 'always', // 每次挂载时都重新获取
  })
  // 处理日志数据合并和轮询
  useEffect(() => {
    if (logsData) {
      setMergedLogsData(logsData)
      // 如果archived为false，开始轮询
      if (!logsData.archived && activeTab === 'logs') {
        setIsPolling(true)
      }
      else {
        setIsPolling(false)
      }
    }
  }, [logsData, activeTab])
  // 自动滚动到底部
  useEffect(() => {
    if (mergedLogsData && logsContainerRef.current && isPolling) {
      const container = logsContainerRef.current
      container.scrollTop = container.scrollHeight
    }
  }, [mergedLogsData, isPolling])
  // 轮询获取增量日志
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null
    let abortController: AbortController | null = null
    if (config?.PROVIDER_TYPE === providerType)
      return
    // 如果状态为已完成/失败 不进行轮询（不再调用）
    const isFinished = runDetail?.status === '已完成' || runDetail?.status === '失败'
    if (isFinished) {
      setIsPolling(false)
      return
    }
    if (isPolling && runDetail?.id) {
      const pollIncrementalLogs = async () => {
        try {
          abortController?.abort()
          abortController = new AbortController()
          const startTime = new Date(Date.now() + 8 * 60 * 60 * 1000 - 5000).toISOString().replace('Z', '+08:00')
          const endTime = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00')
          const response = await finetuneTaskService.getTaskLogsByTime(Number(projectId), runDetail.id, startTime, endTime, abortController.signal)
          if (response && response.logs && Array.isArray(response.logs)) {
            setMergedLogsData((prevData: any) => {
              if (!prevData)
                return response
              return {
                ...prevData,
                logs: [...(prevData.logs || []), ...response.logs],
                archived: response.archived,
              }
            })
            // 如果返回的archived为true，停止轮询
            if (response.archived) {
              setIsPolling(false)
            }
          }
        }
        catch (error: any) {
          // 如果是取消请求，不显示错误
          if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
            return
          }
          console.error('获取增量日志失败:', error)
          // 发生错误时停止轮询
          setIsPolling(false)
        }
      }
      // 立即执行一次
      pollIncrementalLogs()
      // 设置5秒轮询
      intervalId = setInterval(pollIncrementalLogs, 5000)
    }
    return () => {
      abortController?.abort() // 取消未完成的请求
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [isPolling, projectId, runDetail?.id, runDetail?.status, config?.PROVIDER_TYPE, providerType])
  // 切换Tab时停止轮询
  useEffect(() => {
    if (activeTab !== 'logs') {
      setIsPolling(false)
    }
  }, [activeTab])
  // 处理错误情况
  if (error) {
    return (
      <div className="p-6">
        <Alert message="获取数据失败" description="无法加载训练任务详情，请稍后重试" type="error" showIcon />
        <Button className="mt-4" onClick={() => navigate(`/project/${projectId}/training`)}>
          返回列表
        </Button>
      </div>
    )
  }
  // 切换Tab
  const handleTabChange = (key: string) => {
    setActiveTab(key)
  }
  const goTaskDetails = () => {
    navigate(`/project/${projectId}/training/tasks/${runDetail?.name}`)
  }
  // 渲染参数表格
  const renderParamTable = (params: Record<string, any>, options?: { showBaseModelTemplate?: boolean }) => {
    // 定义参数显示顺序
    const parameterOrder = [
      'learning_rate',
      'num_train_epochs',
      'per_device_train_batch_size',
      'gradient_accumulation_steps',
      'warmup_ratio',
      'lr_scheduler_type',
      'bf16',
    ]
    // 按预定义顺序排序，未定义的参数排在后面并按字母顺序排序
    const parameterData = Object.entries(params)
      .sort(([keyA], [keyB]) => {
        const indexA = parameterOrder.indexOf(keyA)
        const indexB = parameterOrder.indexOf(keyB)
        // 如果都在预定义顺序中，按顺序排序
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB
        }
        // 如果只有A在预定义顺序中，A排在前面
        if (indexA !== -1) {
          return -1
        }
        // 如果只有B在预定义顺序中，B排在前面
        if (indexB !== -1) {
          return 1
        }
        // 如果都不在预定义顺序中，按字母顺序排序
        return keyA.localeCompare(keyB)
      })
      .map(([key, value]) => {
        // 如果是 lr_scheduler_type，映射到对应的 name 值
        let displayValue = value
        if (key === 'lr_scheduler_type') {
          displayValue = getLRSchedulerTypeName(String(value))
        }
        else if (typeof value === 'object') {
          displayValue = JSON.stringify(value, null, 2)
        }
        return {
          key,
          value: displayValue,
        }
      })

    const baseModelTemplate = runDetail?.base_model?.template
    if (options?.showBaseModelTemplate && typeof baseModelTemplate === 'string' && baseModelTemplate.trim()) {
      parameterData.push({
        key: 'template',
        value: baseModelTemplate,
      })
    }

    const parameterColumns: ColumnsType<{ key: string, value: any }> = [
      {
        title: '参数名称',
        dataIndex: 'key',
        key: 'key',
        width: '40%',
      },
      {
        title: '参数值',
        dataIndex: 'value',
        key: 'value',
        render: (value: any) => (
          <code className="p-[2px_4px] rounded-[3px] break-all experiment-run-inline-code">
            {String(value)}
          </code>
        ),
      },
    ]
    return (<Table columns={parameterColumns} dataSource={parameterData} rowKey="key" pagination={false} size="small" className="mb-4" />)
  }
  // 渲染显卡资源配置
  const renderGraphicsCardResource = (graphicsCardResource?: any) => {
    if (!graphicsCardResource) {
      return <Alert message="暂无显卡资源配置信息" type="info" showIcon />
    }
    const formatValue = (value: any, unit = '') => {
      if (value === undefined || value === null || value === '')
        return '-'
      return unit ? `${value}${unit}` : value
    }

    const resourceData = [
      {
        key: 'gpu_type_model',
        label: '显卡类型及型号',
        value: [
          graphicsCardResource.card_type,
          graphicsCardResource.card_model,
        ].filter(Boolean).join(' / ') || '-',
      },
      {
        key: 'count',
        label: '显卡卡数配置',
        value: formatValue(graphicsCardResource.count, '张'),
      },
      {
        key: 'cpu_request',
        label: 'CPU 请求',
        value: formatValue(graphicsCardResource.cpu_request, ' Core'),
      },
      {
        key: 'cpu_limit',
        label: 'CPU 限制',
        value: formatValue(graphicsCardResource.cpu_limit, ' Core'),
      },
      {
        key: 'memory_request',
        label: '内存请求',
        value: formatValue(graphicsCardResource.memory_request, ' GB'),
      },
      {
        key: 'memory_limit',
        label: '内存限制',
        value: formatValue(graphicsCardResource.memory_limit, ' GB'),
      },
    ].filter(Boolean) as Array<{
      key: string
      label: string
      value: any
    }>
    const resourceColumns: ColumnsType<{
      key: string
      label: string
      value: any
    }> = [
      {
        title: '配置项',
        dataIndex: 'label',
        key: 'label',
        width: '40%',
      },
      {
        title: '配置值',
        dataIndex: 'value',
        key: 'value',
        render: (value: any) => (
          <code className="p-[2px_4px] rounded-[3px] break-all experiment-run-inline-code">
            {String(value)}
          </code>
        ),
      },
    ]
    return (<Table columns={resourceColumns} dataSource={resourceData} rowKey="key" pagination={false} size="small" className="mb-4" />)
  }
  // 渲染数据集表格
  const renderDatasetTable = (datasets?: Array<{
    name: string
    dataset_path: string
    sample_count: number
    character_count: number
    weight_in_total: number
    sampling_rate: number
  }>, usage?: string) => {
    if (!datasets || datasets.length === 0) {
      return <Alert message="暂无数据集信息" type="info" showIcon />
    }
    const datasetColumns: ColumnsType<typeof datasets[0]> = [
      {
        title: '数据集名称',
        dataIndex: 'name',
        key: 'name',
        width: 180,
        render: (name: string) => <Text strong className="cursor-pointer text-[var(--lab-color-brand-primary)]" onClick={() => navigate(`/project/${projectId}/datasets/${usage}/${name}?usage=${usage}`)}>{name}</Text>,
      },
      {
        title: '版本',
        dataIndex: 'version',
        key: 'version',
      },
      // {
      //   title: '路径',
      //   dataIndex: 'dataset_path',
      //   key: 'dataset_path',
      //   render: (path: string) => <code>{path}</code>
      // },
      {
        title: '样本数量',
        dataIndex: 'sample_count',
        key: 'sample_count',
      },
      {
        title: '字符数',
        dataIndex: 'character_count',
        key: 'character_count',
      },
      {
        title: '权重',
        dataIndex: 'weight_in_total',
        key: 'weight_in_total',
        render: (weight: number) => `${weight || 0}%`,
      },
      {
        title: '采样率',
        dataIndex: 'sampling_rate',
        key: 'sampling_rate',
        render: (rate: number) => `${rate}`,
      },
    ]
    return (<Table columns={datasetColumns} dataSource={datasets} rowKey={(record, index) => `${record.name}-${(record as any).version || index}`} pagination={false} size="small" />)
  }
  // 渲染检查点列表
  const renderCheckpoints = (checkpoints?: {
    name: string
    epoch: number
    train_loss: number
    eval_loss: number
    step: number
  }[]) => {
    if (!checkpoints || checkpoints.length === 0) {
      return <Alert message="暂无检查点" type="info" showIcon />
    }
    const checkpointColumns: ColumnsType<typeof checkpoints[0]> = [
      {
        title: 'Step',
        dataIndex: 'name',
        key: 'name',
      },
      {
        title: 'Training Loss',
        dataIndex: 'train_loss',
        key: 'train_loss',
        render: (loss: number) => loss || '-',
        sorter: (a, b) => (a.train_loss || 0) - (b.train_loss || 0),
        defaultSortOrder: 'ascend',
        showSorterTooltip: false,
      },
    ]
    return (<Table columns={checkpointColumns} dataSource={checkpoints} rowKey={(record, index) => record.name || `checkpoint-${index}`} pagination={false} size="small" showSorterTooltip={false} />)
  }
  if (!runDetail) {
    return (
      <div className="p-6">
        <Card loading={isLoading} />
      </div>
    )
  }
  return (
    <div className="p-6">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => goTaskDetails()}>
            返回
          </Button>
          <Button icon={<ReloadOutlined />} type="primary" onClick={handleRefresh} loading={isRefreshing}>
            刷新
          </Button>
        </div>

        {/* 运行基本信息 */}
        <Card title="任务基本信息" className="!mb-6">
          <Row gutter={24}>
            <Col span={18}>
              <Descriptions column={2} size="small">
                {version ? (<Descriptions.Item label="版本号">{version}</Descriptions.Item>) : (<Descriptions.Item label="运行名称">{`${runDetail.version}` || '-'}</Descriptions.Item>)}

                <Descriptions.Item label="运行状态">
                  {runDetail.status === '定时待启动' && (runDetail.schedule_at ?? runDetail.scheduleAt) ? (
                    <Tooltip title={`启动时间: ${formatTime(runDetail.schedule_at ?? runDetail.scheduleAt, 'datetime')}`}>
                      <span>
                        <Tag color={TrainingTaskStatusMapping(runDetail.status).color}>
                          {TrainingTaskStatusMapping(runDetail.status).text}
                        </Tag>
                      </span>
                    </Tooltip>
                  ) : (
                    <Tag color={TrainingTaskStatusMapping(runDetail.status).color}>
                      {TrainingTaskStatusMapping(runDetail.status).text}
                    </Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="开始时间">
                  {formatTime(runDetail.started_at)}
                </Descriptions.Item>
                <Descriptions.Item label="结束时间">
                  {runDetail.finished_at ? formatTime(runDetail.finished_at) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="微调类型" span={2}>
                  {getFineTuningTypeName(runDetail.training_type?.fine_tuning_type)}
                </Descriptions.Item>
                <Descriptions.Item label="任务描述" span={2}>
                  <p className="whitespace-pre-wrap">{runDetail.description}</p>
                </Descriptions.Item>
                <Descriptions.Item label="运行时长" span={2}>
                  {formatDuration(runDetail.estimated_duration || 0)}
                </Descriptions.Item>
                <Descriptions.Item label="训练加速配置" span={2}>
                  <p className="whitespace-pre-wrap">{runDetail.deepspeed || '-'}</p>
                </Descriptions.Item>
              </Descriptions>
            </Col>
          </Row>
        </Card>

        {/* 详细信息Tabs */}
        <Card>
          <Tabs
            activeKey={activeTab}
            size="large"
            onChange={handleTabChange}
            items={[
              {
                key: 'datasets',
                label: (
                  <span>
                    <DatabaseOutlined />
                    数据集
                  </span>
                ),
                children: (
                  <div>
                    <Card title="训练数据集" size="small" className="mb-4">
                      {renderDatasetTable(runDetail.dataset_items, 'training')}
                    </Card>
                    <Card title="验证数据集" size="small">
                      {(runDetail.eval_dataset_items && runDetail.eval_dataset_items.length > 0) ? (renderDatasetTable(runDetail.eval_dataset_items, 'validation')) : (
                        <div>
                          <div className="mb-4">
                            <Text>已从训练数据集中按比例随机抽取样本作为验证集</Text>
                          </div>
                          <Row gutter={[16, 8]}>
                            <Col span={12}>
                              <Text>抽取比例</Text>
                            </Col>
                            <Col span={12} className="text-right">
                              <Text>
                                {runDetail.effective_evaluation_items[0]?.sampling_rate * 100 || '-'}
                                %
                              </Text>
                            </Col>
                            <Col span={12}>
                              <Text>验证集样本总数</Text>
                            </Col>
                            <Col span={12} className="text-right">
                              <Text>
                                {runDetail.effective_evaluation_items && Array.isArray(runDetail.effective_evaluation_items) && runDetail.effective_evaluation_items.length > 0
                                  ? `${runDetail.effective_evaluation_items.reduce((sum: number, item: any) => sum + (item.sample_count || 0), 0)}条`
                                  : '-'}
                              </Text>
                            </Col>
                          </Row>
                        </div>
                      )}
                    </Card>
                  </div>
                ),
              },
              {
                key: 'graphicsCard',
                label: (
                  <span>
                    <ThunderboltOutlined />
                    显卡资源配置
                  </span>
                ),
                children: (
                  <Card title="显卡资源配置" size="small">
                    {renderGraphicsCardResource(runDetail?.graphics_card_resource)}
                  </Card>
                ),
              },
              {
                key: 'parameters',
                label: (
                  <span>
                    <SettingOutlined />
                    参数配置
                  </span>
                ),
                children: (
                  <Tabs
                    defaultActiveKey="basic"
                    size="small"
                    items={[
                      runDetail.basic && {
                        key: 'basic',
                        label: '基础参数',
                        children: renderParamTable(runDetail.basic, { showBaseModelTemplate: true }),
                      },
                      runDetail.advanced && {
                        key: 'advanced',
                        label: '高级配置',
                        children: renderParamTable(runDetail.advanced),
                      },
                      runDetail.data_processing && {
                        key: 'data_processing',
                        label: '数据处理配置',
                        children: renderParamTable(runDetail.data_processing),
                      },
                      runDetail.lora_config && {
                        key: 'lora',
                        label: 'LoRA配置',
                        children: renderParamTable(runDetail.lora_config),
                      },
                      runDetail.dpo_config && {
                        key: 'dpo',
                        label: 'DPO配置',
                        children: renderParamTable(runDetail.dpo_config),
                      },
                      runDetail.save && {
                        key: 'save',
                        label: '保存配置',
                        children: renderParamTable(runDetail.save),
                      },
                      runDetail.evaluation && {
                        key: 'evaluation',
                        label: '评估配置',
                        children: renderParamTable(Object.fromEntries(Object.entries(runDetail.evaluation).filter(([key]) => key !== 'eval_use_split' && key !== 'eval_split_ratio'))),
                      },
                      runDetail.monitor && {
                        key: 'monitor',
                        label: '监控配置',
                        children: renderParamTable(runDetail.monitor),
                      },
                      runDetail.additional_params && Object.keys(runDetail.additional_params).length > 0 && {
                        key: 'additional',
                        label: '额外参数',
                        children: renderParamTable(runDetail.additional_params),
                      },
                    ].filter(Boolean)} // 过滤掉false值
                  />
                ),
              },
              {
                key: 'mlflow',
                label: (
                  <span>
                    <CodeOutlined />
                    指标
                  </span>
                ),
                children: (
                  <div>
                    <MLflowInfo runDetail={runDetail} />
                  </div>
                ),
              },
              {
                key: 'logs',
                label: (
                  <span>
                    <HistoryOutlined />
                    训练日志
                  </span>
                ),
                children: isLogsLoading ? (
                  <div className="text-center p-[50px]">
                    <Spin tip="日志加载中..." />
                  </div>
                ) : logsError ? (<Alert message="获取日志失败" description="无法加载训练日志，请稍后重试" type="error" showIcon />) : mergedLogsData ? (
                  <div>
                    {/* 日志搜索栏和统计信息 */}
                    <div className="mb-4">
                      <div className="flex gap-2 items-center mb-2">
                        <Input placeholder="搜索日志内容..." prefix={<SearchOutlined />} value={logSearchText} onChange={(e) => setLogSearchText(e.target.value)} className="flex-1" allowClear />
                        {logSearchText && (
                          <Button size="small" icon={<ClearOutlined />} onClick={() => setLogSearchText('')}>
                            清除
                          </Button>
                        )}
                        {mergedLogsData && !mergedLogsData.archived && config?.PROVIDER_TYPE !== providerType && (
                          <Button size="small" type={isPolling ? 'default' : 'primary'} icon={isPolling ? <PauseOutlined /> : <PlayCircleOutlined />} onClick={() => setIsPolling(!isPolling)}>
                            {isPolling ? '暂停' : '继续'}
                          </Button>
                        )}
                      </div>
                      {/* 日志统计信息 */}
                      {mergedLogsData.logs && Array.isArray(mergedLogsData.logs) && (
                        <div className="text-[12px] text-[var(--lab-color-text-muted)] flex gap-4 items-center">
                          <span>
                            总日志数:
                            {mergedLogsData.logs.length}
                          </span>
                          {(() => {
                            const isFinished = runDetail?.status === '已完成' || runDetail?.status === '失败'
                            if (isFinished) {
                              return (
                                <span className="text-[var(--lab-color-text-muted)]">
                                  ✓ 已结束
                                </span>
                              )
                            }
                            if (isPolling && config?.PROVIDER_TYPE !== providerType) {
                              return (
                                <span className="text-[var(--lab-color-success)]">
                                  🔄 实时更新中...
                                </span>
                              )
                            }
                            return null
                          })()}
                          {logSearchText && (
                            <span>
                              匹配结果:
                              {' '}
                              {mergedLogsData.logs.filter((log: any) => {
                                let logContent = ''
                                if (typeof log === 'string') {
                                  logContent = log
                                }
                                else if (log && typeof log === 'object') {
                                  if (log.message) {
                                    logContent = log.message
                                  }
                                  else if (log.text || log.content || log.log) {
                                    logContent = log.text || log.content || log.log
                                  }
                                  else {
                                    logContent = JSON.stringify(log, null, 2)
                                  }
                                }
                                else {
                                  logContent = String(log)
                                }
                                return logContent.toLowerCase().includes(logSearchText.toLowerCase())
                              }).length}
                            </span>
                          )}
                          {config?.PROVIDER_TYPE !== providerType && <span>显示格式: 编号 + 内容</span>}
                        </div>
                      )}
                    </div>

                    <div className="p-[16px] rounded-[6px] font-mono max-h-[600px] overflow-y-auto experiment-run-log-container" ref={logsContainerRef}>
                      {mergedLogsData.archived && (
                        <div className="mb-[12px] p-[8px] rounded-[4px] experiment-run-log-alert">
                          <Text type="secondary" className="text-[12px]">
                            📁 已加载归档日志
                          </Text>
                        </div>
                      )}
                      {isPolling && config?.PROVIDER_TYPE !== providerType && (
                        <div className="mb-[12px] p-[8px] rounded-[4px] experiment-run-log-live">
                          <Text type="secondary" className="text-[12px] text-[var(--lab-color-success)]">
                            🔄 正在实时获取日志...
                          </Text>
                        </div>
                      )}
                      <div className="text-[13px] leading-[1.5]">
                        {mergedLogsData.logs && Array.isArray(mergedLogsData.logs)
                          ? (() => {
                            // 过滤日志
                              const filteredLogs = mergedLogsData.logs.filter((log: any) => {
                                if (!logSearchText)
                                  return true
                                let logContent = ''
                                if (typeof log === 'string') {
                                  logContent = log
                                }
                                else if (log && typeof log === 'object') {
                                  if (log.message) {
                                    logContent = log.message
                                  }
                                  else if (log.text || log.content || log.log) {
                                    logContent = log.text || log.content || log.log
                                  }
                                  else {
                                    logContent = JSON.stringify(log, null, 2)
                                  }
                                }
                                else {
                                  logContent = String(log)
                                }
                                return logContent.toLowerCase().includes(logSearchText.toLowerCase())
                              })
                              return filteredLogs.length > 0 ? (filteredLogs.map((log: any, index: number) => {
                              // 处理日志格式，支持不同的数据结构
                                let logContent = ''
                                let logNumber = index
                                if (typeof log === 'string') {
                                  logContent = log
                                }
                                else if (log && typeof log === 'object') {
                                // 如果有message字段
                                  if (log.message) {
                                    logContent = log.message
                                  }
                                  // 如果有其他文本字段
                                  else if (log.text || log.content || log.log) {
                                    logContent = log.text || log.content || log.log
                                  }
                                  // 如果是对象，尝试序列化
                                  else {
                                    logContent = JSON.stringify(log, null, 2)
                                  }
                                  // 如果对象有编号字段，使用对象的编号
                                  if (log.number !== undefined || log.index !== undefined) {
                                    logNumber = log.number || log.index
                                  }
                                }
                                else {
                                  logContent = String(log)
                                }
                                // 根据日志级别添加颜色
                                const getLogClassName = (content: string) => {
                                  if (content.includes('ERROR') || content.includes('error')) {
                                    return 'experiment-run-log-line-error'
                                  }
                                  else if (content.includes('WARN') || content.includes('warning')) {
                                    return 'experiment-run-log-line-warning'
                                  }
                                  else if (content.includes('INFO') || content.includes('info')) {
                                    return 'experiment-run-log-line-info'
                                  }
                                  return ''
                                }
                                // 高亮搜索关键词
                                const highlightText = (text: string, searchText: string) => {
                                  if (!searchText)
                                    return text
                                  const regex = new RegExp(`(${searchText})`, 'gi')
                                  const parts = text.split(regex)
                                  return (
                                    <>
                                      {parts.map((part, i) => {
                                      // 检查当前部分是否匹配搜索文本（不区分大小写）
                                        const isMatch = searchText && part.toLowerCase().includes(searchText.toLowerCase())
                                        return (
                                          <span key={i} className={isMatch ? 'experiment-run-log-highlight' : undefined}>
                                            {part}
                                          </span>
                                        )
                                      })}
                                    </>
                                  )
                                }
                                return (
                                  <div key={index} className={`experiment-run-log-line ${getLogClassName(logContent)}`}>
                                    <span className="text-[var(--lab-color-text-muted)] mr-2 min-w-[40px] inline-block">
                                      {logNumber}
                                      :
                                    </span>
                                    <span className="whitespace-pre-wrap break-words">
                                      {highlightText(logContent, logSearchText)}
                                    </span>
                                  </div>
                                )
                              })) : (
                                <div className="italic text-center p-[20px] experiment-run-empty-text">
                                  没有找到匹配的日志内容
                                </div>
                              )
                            })()
                          : <div className="italic experiment-run-empty-text">暂无日志内容</div>}
                      </div>
                    </div>
                  </div>
                ) : (<Alert message="暂无日志信息" type="info" showIcon />),
              },
              {
                key: 'artifacts',
                label: (
                  <span>
                    <DownloadOutlined />
                    训练产物
                  </span>
                ),
                children: (
                  <div>
                    {config?.PROVIDER_TYPE !== providerType && (
                      <Card title="模型输出路径" size="small" className="mb-4">
                        {runDetail.model_output_path ? (
                          <div className="break-all">
                            <code>{runDetail.model_output_path}</code>
                          </div>
                        ) : (<Alert message="暂无模型输出" type="info" showIcon />)}
                      </Card>
                    )}
                    <Card title="检查点" size="small">
                      {isCheckpointsLoading ? (<Spin tip="加载检查点中..." />) : checkpointsError ? (<Alert message="加载检查点失败" type="error" showIcon />) : (renderCheckpoints(checkpointsData))}
                    </Card>
                    {/* {runDetail.metrics_url && (
                      <Card title="指标可视化" size="small" className="mt-4">
                        <a href={runDetail.metrics_url} target="_blank" rel="noopener noreferrer">
                          <Button type="link" icon={<BarChartOutlined />}>
                            查看详细指标
                          </Button>
                        </a>
                      </Card>
                    )} */}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </Card>
    </div>
  )
}
export default ExperimentRunDetail
