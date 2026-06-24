import { title } from 'node:process'
import { useEffect, useState } from 'react'
import { Button, DatePicker, Input, Select, Space, Table, Tag, Tooltip, message } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import type { TablePaginationConfig, TableProps } from 'antd'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import InvokeLogDetailModal from '../../invoke-log/components/InvokeLogDetailModal'
import SecurityTag from '../../invoke-log/components/SecurityTag'
import EventConnectModel from './EventConnectModel'
import {
  apiAlertRecordProcess,
  apiAlertRecordsList,
  apiInvokeLogList,
  apiSensitiveCategoriesGet,
} from '@/services/api'
import { $t } from '@/locales'
import DgiDateTimePicker from '@/components/dgi-date-time-picker'

const { Option } = Select
const { RangePicker } = DatePicker

interface EventItem {
  log_id: string
  id: number
  user_question: string
  ai_response: string
  rule_name: string
  sensitive_types: string
  created_time: number
  risk_level: 'low' | 'medium' | 'high'
  username: string
  token_name: string
  model_name: string
  status: 'processed' | 'unprocessed'
  hasLargeFields?: boolean
  audit_result?: string
  blockLayer?: number
  riskLevel?: string
}

type EventManageType = 'content_security' | 'model_connectivity'

export default function EventModelOrContent({ type }: { type: EventManageType }) {
  const [userQuestion, setUserQuestion] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [ruleName, setRuleName] = useState('')
  const [triggerTime, setTriggerTime] = useState<[dayjs.Dayjs?, dayjs.Dayjs?]>([])
  const [riskLevel, setRiskLevel] = useState<string>('')
  const [sensitiveTypes, setSensitiveTypes] = useState<string[]>([])
  const [username, setUsername] = useState('')
  const [tokenName, setTokenName] = useState('')
  const [modelName, setModelName] = useState('')
  const [status, setStatus] = useState<string>('')
  const [auditResult, setAuditResult] = useState<string>('')
  const [logDetailVisible, setLogDetailVisible] = useState(false)
  const [currentLogData, setCurrentLogData] = useState<EventItem | undefined>(undefined)
  const [logData, setLogData] = useState<any>(undefined)
  const [connectModelOpen, setConnectModelOpen] = useState(false)
  const [connectData, setConnectData] = useState<EventItem | undefined>(undefined)
  const [failed_channels_keyword, setFailedChannelsKeyword] = useState<string>('')

  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
  })

  // 获取敏感类别数据
  const { data: sensitiveCategoriesData } = useRequest(apiSensitiveCategoriesGet, {
    onError: (error) => {
      console.error('获取敏感类别失败:', error)
    },
  })

  // 敏感类型选项 - 使用API数据或默认数据
  const sensitiveTypeOptions = sensitiveCategoriesData?.data || [
    '社会公共安全类',
    '个人信息类',
    '金融信息类',
    '商业机密类',
    '政治敏感类',
    '暴力色情类',
  ]

  // 告警记录列表请求
  const {
    data: listResponse,
    loading,
    run: refreshList,
  } = useRequest(
    () => {
      return apiAlertRecordsList({
        user_question: userQuestion || undefined,
        ai_response: aiResponse || undefined,
        rule_name: ruleName || undefined,
        start_time: triggerTime?.[0] ? triggerTime[0].unix() : undefined,
        end_time: triggerTime?.[1] ? triggerTime[1].unix() : undefined,
        risk_level: riskLevel || undefined,
        sensitive_types: sensitiveTypes.length > 0 ? sensitiveTypes.join(',') : undefined,
        username: username || undefined,
        token_name: tokenName || undefined,
        model_name: modelName || undefined,
        status: status || undefined,
        audit_result: auditResult || undefined,
        page_number: pagination.current?.toString(),
        page_size: pagination.pageSize?.toString(),
        failed_channels_keyword: failed_channels_keyword || undefined,
        type,
      })
    },
    {
      refreshDeps: [userQuestion, failed_channels_keyword, aiResponse, ruleName, triggerTime, riskLevel, sensitiveTypes, username, tokenName, modelName, status, auditResult, pagination.current, pagination.pageSize, type],
      debounceWait: 300,
      onSuccess: (result) => {
        if (result?.data) {
          setPagination((prev) => ({
            ...prev,
            total: result.data.total || 0,
            showTotal: (total) => `总共 ${total} 条`,
          }))
        }
      },
      onError: (error) => {
        message.error('获取告警记录列表失败')
        console.error('获取告警记录列表失败:', error)
      },
    },
  )

  const data = listResponse?.data?.items || []

  const getSensitiveLevelColor = (level: string) => {
    const colors = {
      低风险: 'green',
      medium: 'orange',
      high: 'red',
    }
    return colors[level as keyof typeof colors] || 'default'
  }

  const getSensitiveLevelText = (level: string) => {
    const texts = {
      low: '低风险',
      medium: '中风险',
      high: '高风险',
    }
    return texts[level as keyof typeof texts] || level
  }

  const getProcessStatusColor = (status: string) => {
    const colors = {
      processed: 'green',
      unprocessed: 'orange',
    }
    return colors[status as keyof typeof colors] || 'default'
  }

  const getProcessStatusText = (status: string) => {
    const texts = {
      processed: '已处理',
      unprocessed: '未处理',
    }
    return texts[status as keyof typeof texts] || status
  }

  const handleProcess = async (record: EventItem) => {
    try {
      await apiAlertRecordProcess(record.id)
      message.success('告警记录处理成功')
      refreshList()
    }
    catch (error) {
      message.error('告警记录处理失败')
      console.error('告警记录处理失败:', error)
    }
  }

  const handleViewLog = (record: EventItem) => {
    // 传递logId到LogDetailModal
    setCurrentLogData(record as EventItem)
    if (type === 'model_connectivity') {
      setConnectModelOpen(true)
      setConnectData(record)
    }
    else {
      setLogDetailVisible(true)
      setConnectData(record)
    }
  }

  const handleLogDetailCancel = () => {
    setLogDetailVisible(false)
    setCurrentLogData(undefined)
  }

  // 使用apiInvokeLogList接口查询数据
  // const { loading: logDetailLoading } = useRequest(
  //   async () => {
  //     if (currentLogData) {
  //       return await apiInvokeLogList({
  //         log_id: currentLogData?.log_id,
  //         limit: 1,
  //       });
  //     }
  //     return { data: [], items: [], results: [], id: "", code: 0, msg: "" };
  //   },
  //   {
  //     refreshDeps: [currentLogData, logDetailVisible],
  //     ready: !!(currentLogData && logDetailVisible),
  //     onSuccess: (res) => {
  //       if (res?.data && res.data.length > 0) {
  //         setLogData(res.data[0]);
  //       } else {
  //         // 数据为null或空时重置状态
  //         setLogData(undefined);
  //       }
  //     },
  //     onError: (error) => {
  //       console.error('获取日志详情失败:', error);
  //       message.error($t("获取日志详情失败"));
  //     }
  //   }
  // );

  const action: TableProps<EventItem>['columns'] = [{
    title: '操作',
    key: 'action',
    width: 150,
    align: 'center',
    fixed: 'right',
    render: (_, record) => (
      <Space>
        <Button
          type="link"
          size="small"
          onClick={() => handleProcess(record)}
          disabled={record.status === 'processed'}
          style={{ flex: 1, minWidth: 0 }}
        >
          {record.status === 'processed' ? '已处理' : '处理'}
        </Button>
        <Button
          type="link"
          size="small"
          onClick={() => handleViewLog(record)}
          style={{ flex: 1, minWidth: 0 }}
        >
          日志详情
        </Button>
      </Space>
    ),
  }]
  const connectColumns = [
    {
      title: '资源名称',
      dataIndex: 'model_name',
      key: 'model_name',
      width: 150,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '渠道',
      dataIndex: 'failed_channels',
      key: 'failed_channels',
      width: 300,
      // ellipsis: { showTitle: false },
      render: (text) => {
        const content = text?.map((item) => `${item?.channel_name}: ${item?.address}`)
        return (
          <div>
            {content?.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        )
      },
    },
    {
      title: '资源类型',
      dataIndex: 'resource_type',
      key: 'resource_type',
      width: 150,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>模型</span>
        </Tooltip>
      ),
    },
    {
      title: '规则名称',
      dataIndex: 'rule_name',
      key: 'rule_name',
      width: 150,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '触发时间',
      dataIndex: 'created_time',
      key: 'created_time',
      width: 180,
      render: (timestamp: number) => timestamp ? dayjs(timestamp * 1000).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '告警进度',
      dataIndex: 'progress_summary',
      key: 'progress_summary',
      width: 100,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text}</span>
        </Tooltip>
      ),
    },
    ...action,
  ]
  const columns: TableProps<EventItem>['columns'] = [
    {
      title: '问题',
      dataIndex: 'user_question',
      key: 'user_question',
      width: 200,
      hidden: type !== 'content_security',
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '回答',
      dataIndex: 'ai_response',
      key: 'ai_response',
      width: 200,
      hidden: type !== 'content_security',
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '审核标签',
      dataIndex: 'audit_result',
      key: 'audit_result',
      width: 100,
      hidden: type !== 'content_security',
      render: (_: any, record: EventItem) => (
        <SecurityTag
          auditResult={record.audit_result}
          securityLayer={record.blockLayer}
          riskLevel={record.risk_level}
          showTooltip={false}
        />
      ),
    },
    {
      title: '规则名称',
      dataIndex: 'rule_name',
      key: 'rule_name',
      width: 150,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '敏感类型',
      dataIndex: 'sensitive_types',
      key: 'sensitive_types',
      width: 150,
      hidden: type !== 'content_security',
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '触发时间',
      dataIndex: 'created_time',
      key: 'created_time',
      width: 180,
      render: (timestamp: number) => timestamp ? dayjs(timestamp * 1000).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '风险级别',
      dataIndex: 'risk_level',
      key: 'risk_level',
      hidden: type !== 'content_security',
      width: 100,
      render: (level: string) => (
        <Tag color={getSensitiveLevelColor(level)}>
          {getSensitiveLevelText(level)}
        </Tag>
      ),
    },
    {
      title: '处理状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      hidden: type !== 'content_security',
      render: (status: string) => (
        <Tag color={getProcessStatusColor(status)}>
          {getProcessStatusText(status)}
        </Tag>
      ),
    },
    {
      title: '告警进度',
      dataIndex: 'progress_summary',
      key: 'progress_summary',
      width: 100,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 100,
      hidden: type !== 'content_security',
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '密钥名称',
      dataIndex: 'token_name',
      key: 'token_name',
      width: 120,
      hidden: type !== 'content_security',
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text}</span>
        </Tooltip>
      ),
    },
    {
      title: '模型名称',
      dataIndex: 'model_name',
      key: 'model_name',
      width: 150,
      ellipsis: { showTitle: false },
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <span>{text}</span>
        </Tooltip>
      ),
    },
    ...action,
  ]

  const handleTableChange: TableProps<EventItem>['onChange'] = (paginationInfo) => {
    setPagination({
      ...pagination,
      current: paginationInfo.current || 1,
      pageSize: paginationInfo.pageSize || 10,
    })
  }

  const handleReset = () => {
    setUserQuestion('')
    setAiResponse('')
    setRuleName('')
    setTriggerTime([])
    setRiskLevel('')
    setSensitiveTypes([])
    setUsername('')
    setTokenName('')
    setModelName('')
    setStatus('')
    setAuditResult('')
    setPagination({
      current: 1,
      pageSize: 10,
      total: 0,
    })
  }

  return (
    <div>
      <div style={{ padding: '16px', flexShrink: 0 }}>
        <Space style={{ marginBottom: 16 }} wrap>
          {type === 'content_security' && (
            <>
              <Input
                placeholder="请输入问题"
                value={userQuestion}
                onChange={(e) => setUserQuestion(e.target.value)}
                style={{ width: 180 }}
                prefix={<SearchOutlined />}
              />
              <Input
                placeholder="请输入回答"
                value={aiResponse}
                onChange={(e) => setAiResponse(e.target.value)}
                style={{ width: 180 }}
                prefix={<SearchOutlined />}
              />
              <Select
                placeholder="请选择审核标签"
                value={auditResult || undefined}
                onChange={setAuditResult}
                style={{ width: 150 }}
                allowClear
              >
                <Option value="">全部</Option>
                <Option value="无审核">无审核</Option>
                <Option value="安全">安全</Option>
                <Option value="敏感输入">敏感输入</Option>
                <Option value="敏感输出">敏感输出</Option>
              </Select>
            </>
          )}
          {type === 'model_connectivity' && (
            <>
              <Input
                placeholder="请输入模型名称或API名称"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                style={{ width: 150 }}
                prefix={<SearchOutlined />}
              />
              <Input
                placeholder="请输入渠道/API信息"
                value={failed_channels_keyword}
                onChange={(e) => setFailedChannelsKeyword(e.target.value)}
                style={{ width: 150 }}
                prefix={<SearchOutlined />}
              />
              {/* <Select
                placeholder="请选择资源类型"
                // value={resourceType || undefined}
                // onChange={setResourceType}
                style={{ width: 120 }}
                allowClear
              >
                <Option value="all">全部</Option>
                <Option value="model">模型</Option>
                <Option value="api">API</Option>
              </Select> */}
            </>
          )}
          <Input
            placeholder="请输入规则名称"
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
            style={{ width: 150 }}
            prefix={<SearchOutlined />}
          />
          {type === 'content_security' && (
            <Select
              placeholder="请选择敏感类别"
              value={sensitiveTypes}
              onChange={(value) => setSensitiveTypes(value || [])}
              style={{ width: 200 }}
              mode="multiple"
              showSearch
              filterOption={(input, option) => {
                if (option && 'children' in option) {
                  return String(option.children).toLowerCase().includes(input.toLowerCase())
                }
                return false
              }}
            >
              {sensitiveTypeOptions.map((type: string) => (
                <Option key={type} value={type}>
                  {type}
                </Option>
              ))}
            </Select>
          )}
          <DgiDateTimePicker
            value={triggerTime}
            onChange={(range) => {
              setTriggerTime(range)
            }}
            placeholder="选择时间范围"
            className="w-[380px]"
            hasOptions={false}
          />
          {type === 'content_security' && (
            <>
              <Select
                placeholder="请选择风险级别"
                value={riskLevel || undefined}
                onChange={setRiskLevel}
                style={{ width: 120 }}
                allowClear
              >
                <Option value="低风险">低风险</Option>
                <Option value="中风险">中风险</Option>
                <Option value="高风险">高风险</Option>
              </Select>
              <Select
                placeholder="请选择处理状态"
                value={status || undefined}
                onChange={setStatus}
                style={{ width: 120 }}
                allowClear
              >
                <Option value="processed">已处理</Option>
                <Option value="unprocessed">未处理</Option>
              </Select>
              <Input
                placeholder="请输入用户"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ width: 120 }}
                prefix={<SearchOutlined />}
              />
              <Input
                placeholder="请输入密钥名称"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                style={{ width: 150 }}
                prefix={<SearchOutlined />}
              />
            </>
          )}
          {type === 'content_security' && (
            <Input
              placeholder="请输入模型名称"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              style={{ width: 150 }}
              prefix={<SearchOutlined />}
            />
          )}
          {type !== 'content_security' && (
            <>
              {/* <Input
                placeholder="请输入模型副本名称"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                style={{ width: 150 }}
                prefix={<SearchOutlined />}
              /> */}
              <Select
                placeholder="请选择处理状态"
                value={status || undefined}
                onChange={setStatus}
                style={{ width: 120 }}
                allowClear
              >
                <Option value="processed">已处理</Option>
                <Option value="unprocessed">未处理</Option>
              </Select>
            </>
          )}
          <Button onClick={handleReset}>
            重置
          </Button>
        </Space>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '0 16px 16px' }}>
        <Table
          columns={type === 'model_connectivity' ? connectColumns : columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
          scroll={{ x: 1000, y: 'calc(100vh - 390px)' }}
        />
      </div>

      {/* <LogDetailModal
        visible={logDetailVisible}
        onCancel={handleLogDetailCancel}
        logId={currentLogData}
      /> */}

      {/* <InvokeLogDetailModal
        open={logDetailVisible}
        onCancel={handleLogDetailCancel}
        logData={logData}
      /> */}
      <InvokeLogDetailModal
        open={logDetailVisible}
        onCancel={handleLogDetailCancel}
        type="model"
        params={{
          log_id: currentLogData?.log_id || '',
          start_timestamp: String((currentLogData?.created_time || 0) - 3600),
          end_timestamp: String((currentLogData?.created_time || 0) + 3600),
          hasLargeFields: currentLogData?.hasLargeFields ?? true,
        }}
      />

      <EventConnectModel
        open={connectModelOpen}
        onCancel={() => setConnectModelOpen(false)}
        data={connectData}
      />
    </div>
  )
}
