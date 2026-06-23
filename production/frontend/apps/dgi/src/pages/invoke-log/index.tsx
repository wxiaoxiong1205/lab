/* eslint-disable no-undef */
import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Input,
  Segmented,
  Select,
  Space,
  Table,
  TreeSelect,
} from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import type { TableProps } from 'antd'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import InvokeLogDetailModal from './components/InvokeLogDetailModal'
import SecurityTag from './components/SecurityTag'
import { apiInvokeLogList, apiSensitiveCategoriesList } from '@/services/api'
import { useTransform } from '@/locales'
import TooltipContent from '@/components/TooltipContent'
import Title from '@/components/Title'
import DgiDateTimePicker from '@/components/dgi-date-time-picker'

interface InvokeLogItem {
  answer: string
  channelId: number
  createdTime: number
  elapsedTime: number
  inputTokens: number
  modelName: string
  outputTokens: number
  question: string
  requestBody: string
  responseBody: string
  tokenId: number
  tokenName: string
  totalTokens: number
  userid: number
  username: string
  search_time: string
  isStream: boolean
  securityLayer?: number
  audit_result?: string
  logId?: string
  hasLargeFields?: boolean
}

function toTimestamp(time: any) {
  return time ? Math.floor(dayjs(time).valueOf() / 1000) : undefined
}

export default function InvokeLogPage() {
  const [searchTime, setSearchTime] = useState<[dayjs.Dayjs?, dayjs.Dayjs?]>([
    dayjs().subtract(200, 'hour').startOf('day'),
    dayjs(),
  ])
  const tableRef = useRef<any>(null)
  const [modelName, setModelName] = useState('')
  const [channelId, setChannelId] = useState('')
  const [accessName, setAccessName] = useState('')
  const [userName, setUserName] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [currentLogData, setCurrentLogData] = useState<InvokeLogItem>()
  const [tableData, setTableDate] = useState<InvokeLogItem[]>([])
  const tableDataRef = useRef<InvokeLogItem[]>([])
  const [appendLoading, setAppendLoading] = useState(false)
  const [securityTag, setSecurityTag] = useState(undefined)
  const [sensitiveLevel, setSensitiveLevel] = useState(undefined)
  const [sensitiveCategory, setSensitiveCategory] = useState<string[]>([])
  const { $t } = useTransform()
  const [isOperated, setIsOperated] = useState(false)
  const [isManualSearch, setIsManualSearch] = useState(false)
  const [type, setType] = useState<'model' | 'api'>('model')

  const [apiName, setApiName] = useState('')
  const [apiUrl, setApiUrl] = useState('')

  useEffect(() => {
    tableDataRef.current = tableData
  }, [tableData])

  const loadDataList = (time?: string) => {
    return apiInvokeLogList({
      type,
      question: question || undefined,
      answer: answer || undefined,
      audit_result: securityTag || undefined,
      start_timestamp: toTimestamp(searchTime?.[0]),
      end_timestamp: toTimestamp(searchTime?.[1]),
      search_time: time,
      token_name: accessName || undefined,
      model_name: modelName || undefined,
      channel_id: channelId ? Number(channelId) : undefined,
      username: userName || undefined,
      desc: 'backward',
      limit: 30,
      sensitive_category:
        sensitiveCategory.length > 0 ? sensitiveCategory.join(',') : undefined,
      risk_level: sensitiveLevel || undefined,
      api_name: apiName || undefined,
      api_url: apiUrl || undefined,
    }).then((res) => {
      return res.data
    })
  }

  // 使用 useRequest 处理数据请求
  const { loading, run: initList } = useRequest(loadDataList, {
    debounceWait: 300,
    onSuccess: (data) => {
      setTableDate(data ? [...data] : [])
      setIsManualSearch(false)
      tableRef.current?.scrollTo({ index: 0 })
    },
    refreshDeps: [type], // type变化时自动发起请求
  })

  const { data: sensitiveCategoryData = [] } = useRequest(() =>
    apiSensitiveCategoriesList().then((res) => {
      return res.data || []
    }),
  )

  // 处理查看详情
  const handleViewDetail = (record: InvokeLogItem) => {
    setCurrentLogData(record)
    setIsDetailModalOpen(true)
  }

  useEffect(() => {
    const tableBody = document.querySelector('.ant-table-body') as HTMLElement
    if (tableBody) {
      if (isDetailModalOpen) {
        tableBody.style.overflow = 'hidden'
      }
      else {
        tableBody.style.overflow = 'auto'
      }
    }
  }, [isDetailModalOpen])

  const scrollRef = useRef({
    left: 0,
    top: 0,
  })

  const handleTableScroll = async (event: React.UIEvent<HTMLDivElement>) => {
    if (isManualSearch) {
      return
    }
    if (isDetailModalOpen) {
      return
    }

    const target = event.target as HTMLDivElement
    if (!target.classList.contains('ant-table-body')) {
      return
    }

    const { scrollTop, clientHeight, scrollHeight, scrollLeft } = target

    const verticalDelta = scrollTop - scrollRef.current.top

    // 横向滚动/轻微抖动不触发追加加载（触控板横滚常伴随极小的 scrollTop 变化）
    if (Math.abs(verticalDelta) < 8) {
      scrollRef.current = { left: scrollLeft, top: scrollTop }
      return
    }

    // 使用阈值判断是否接近底部，避免浏览器缩放导致的精度问题
    const threshold = 10
    const isNearBottom = scrollHeight - scrollTop - clientHeight <= threshold

    // 垂直滚动 & 接近底部了
    if (
      verticalDelta > 0
      && isNearBottom
      && !appendLoading
    ) {
      setAppendLoading(true)
      const appendList = await loadDataList(
        tableDataRef.current[tableDataRef.current.length - 1]?.search_time,
      )
      setAppendLoading(false)
      setTableDate((prev) => [...prev, ...(appendList ?? [])])
    }
    scrollRef.current = {
      left: scrollLeft,
      top: scrollTop,
    }
  }

  const handleSearch = () => {
    if (!isOperated) {
      updateSEarchTime()
    }
    setTableDate([])
    initList()
    setIsManualSearch(true)
  }

  const updateSEarchTime = () => {
    const defaultTime: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs().subtract(200, 'hour').startOf('day'), dayjs()]
    setSearchTime(defaultTime)
  }

  const handleReset = () => {
    setIsOperated(false)
    updateSEarchTime()
    setQuestion('')
    setAnswer('')
    setChannelId('')
    setUserName('')
    setAccessName('')
    setModelName('')
    initList()
    setIsManualSearch(true)
    setSecurityTag(undefined)
    setSensitiveCategory([])
    setSensitiveLevel(undefined)
  }

  const columns: TableProps<InvokeLogItem>['columns'] = [
    {
      title: $t('时间'),
      dataIndex: 'createdTime',
      key: 'createdTime',
      width: 180,
      render: (text) => dayjs(text * 1000).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: $t('问题'),
      dataIndex: 'question',
      key: 'question',
      width: 300,
      render: (text) => {
        const showText = Array.isArray(text) ? text[0].text : text
        return showText ? (
          <TooltipContent width="400px" content={showText} />
        ) : (
          '--'
        )
      },
    },
    {
      title: $t('回答'),
      dataIndex: 'answer',
      key: 'answer',
      width: 300,
      ellipsis: true,
      render: (text) => {
        let content = text
        try {
          content = decodeURIComponent(text)
        }
        catch { }
        return content ? (
          <TooltipContent width="400px" content={content} />
        ) : (
          '--'
        )
      },
    },
    {
      title: $t('审核标签'),
      dataIndex: 'auditResult',
      key: 'auditResult',
      hidden: type === 'api',
      width: 100,
      render: (_: any, record: any) => (
        <SecurityTag
          auditResult={record.auditResult}
          securityLayer={record.blockLayer}
          riskLevel={record.riskLevel}
        />
      ),
    },
    {
      title: $t('审核内容'),
      dataIndex: 'auditInputContent',
      key: 'auditInputContent',
      width: 160,
      hidden: type === 'api',
      render: (text) => {
        return text ? <TooltipContent width="400px" content={text} /> : '--'
      },
    },
    {
      title: $t('审核耗时(s)'),
      dataIndex: 'auditInputTime',
      key: 'auditInputTime',
      width: 120,
      hidden: type === 'api',
      render: (time) => {
        return time ? time.toFixed(4) : '--'
      },
    },
    {
      title: $t('渠道ID'),
      dataIndex: 'channelId',
      key: 'channelId',
      width: 100,
      hidden: type === 'api',
    },
    {
      title: $t('用户'),
      dataIndex: 'username',
      key: 'username',
      width: 100,
      ellipsis: true,
      render: (text: string) => <TooltipContent content={text} />,
    },
    {
      title: $t('密钥名称'),
      dataIndex: 'tokenName',
      key: 'tokenName',
      width: 120,
      ellipsis: true,
      render: (text: string) => <TooltipContent content={text} />,
    },
    {
      title: type === 'model' ? $t('模型名称') : $t('API名称'),
      dataIndex: type === 'model' ? 'modelName' : 'apiName',
      key: type === 'model' ? 'modelName' : 'apiName',
      width: type === 'model' ? 160 : 200,
      ellipsis: true,
      render: (text: string) => <TooltipContent content={text} />,
    },
    {
      title: $t('总Token'),
      dataIndex: 'totalTokens',
      key: 'totalTokens',
      width: 140,
      hidden: type === 'api',
    },
    {
      title: $t('输入Token'),
      dataIndex: 'inputTokens',
      key: 'inputTokens',
      width: 140,
      hidden: type === 'api',
    },
    {
      title: $t('输出Token'),
      dataIndex: 'outputTokens',
      key: 'outputTokens',
      width: 140,
      hidden: type === 'api',
    },
    {
      title: $t('API地址'),
      dataIndex: 'path',
      key: 'path',
      width: 240,
      ellipsis: true,
      hidden: type === 'model',
    },
    {
      title: $t('操作'),
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Space size="middle">
          <a className="text-blue-600" onClick={() => handleViewDetail(record)}>
            {$t('详情')}
          </a>
        </Space>
      ),
    },
  ]

  const handleDateTimeChange = (range: [dayjs.Dayjs, dayjs.Dayjs]) => {
    setSearchTime([range[0], range[1]])
    setIsOperated(true)
  }

  return (
    <div className="bg-white min-h-full rounded-lg p-6">
      <div className="mb-6">
        <Title title={$t('调用日志')} description={$t('模型请求日志记录')} />
        <Segmented
          value={type}
          onChange={(v) => setType(v as any)}
          options={[
            { label: $t('模型'), value: 'model' },
            { label: $t('API'), value: 'api' },
          ]}
        />
        <div className="flex gap-4 flex-wrap mt-4">
          <div className="flex items-center gap-2">
            <DgiDateTimePicker
              value={searchTime}
              onChange={handleDateTimeChange}
              placeholder="选择时间范围"
              className="w-[380px]"
              hasOptions={false}
            />
            {/* <TimeRangePicker
              value={searchTime}
              onChange={(time: RangePickerProps["value"]) => {
                setSearchTime(time)
                setIsOperated(true)
              }}
              placeholder="选择时间范围"
              className="w-[380px]"
            /> */}
          </div>
          {type === 'model' && (
            <Input
              placeholder={$t('渠道ID')}
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="max-w-[120px]"
              allowClear
            />
          )}
          <Input
            placeholder={$t('问题')}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            prefix={<SearchOutlined className="text-gray-400" />}
            className="max-w-[200px]"
            allowClear
          />
          <Input
            placeholder={$t('答案')}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            prefix={<SearchOutlined className="text-gray-400" />}
            className="max-w-[200px]"
            allowClear
          />
          <Input
            placeholder={$t('用户名称')}
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            prefix={<SearchOutlined className="text-gray-400" />}
            className="max-w-[200px]"
            allowClear
          />
          <Input
            placeholder={$t('密钥名称')}
            value={accessName}
            onChange={(e) => setAccessName(e.target.value)}
            prefix={<SearchOutlined className="text-gray-400" />}
            className="max-w-[200px]"
            allowClear
          />
          {type === 'model' && (
            <>
              <Input
                placeholder={$t('请输入模型名称')}
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                prefix={<SearchOutlined className="text-gray-400" />}
                className="max-w-[200px]"
                allowClear
              />
              <Select
                placeholder={$t('审核标签')}
                className="w-40"
                value={securityTag}
                onChange={setSecurityTag}
              >
                <Select.Option value="">{$t('全部')}</Select.Option>
                <Select.Option value="无审核">{$t('无审核')}</Select.Option>
                <Select.Option value="安全">{$t('安全')}</Select.Option>
                {/* <Select.Option value={"不安全"}>{$t("不安全")}</Select.Option> */}
                <Select.Option value="敏感输入">{$t('敏感输入')}</Select.Option>
                <Select.Option value="敏感输出">{$t('敏感输出')}</Select.Option>
              </Select>
              <Select
                placeholder={$t('敏感级别')}
                className="w-40"
                value={sensitiveLevel}
                onChange={setSensitiveLevel}
              >
                <Select.Option value="">{$t('全部')}</Select.Option>
                <Select.Option value="低风险">{$t('低风险')}</Select.Option>
                <Select.Option value="中风险">{$t('中风险')}</Select.Option>
                <Select.Option value="高风险">{$t('高风险')}</Select.Option>
              </Select>
              <TreeSelect
                className="w-60"
                showSearch
                treeCheckable
                value={sensitiveCategory}
                dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
                placeholder={$t('敏感类别')}
                allowClear
                multiple
                treeDefaultExpandAll
                onChange={(value) => {
                  setSensitiveCategory(Array.isArray(value) ? value : [])
                }}
                treeData={sensitiveCategoryData}
                maxTagCount={1}
                fieldNames={{
                  label: 'name',
                  value: 'name',
                }}
              />
            </>
          )}
          {type === 'api' && (
            <>
              <Input
                placeholder={$t('API名称')}
                value={apiName}
                onChange={(e) => setApiName(e.target.value)}
                prefix={<SearchOutlined className="text-gray-400" />}
                className="max-w-[200px]"
                allowClear
              />
              <Input
                placeholder={$t('API地址')}
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                prefix={<SearchOutlined className="text-gray-400" />}
                className="max-w-[200px]"
                allowClear
              />
            </>
          )}

          <Button type="primary" onClick={handleSearch}>
            {$t('查询')}
          </Button>
          <Button type="primary" onClick={handleReset}>
            {$t('重置')}
          </Button>
          <div className="flex-1" />
        </div>
      </div>

      <Table
        ref={tableRef}
        columns={columns}
        dataSource={tableData}
        rowKey="search_time"
        loading={loading || appendLoading}
        pagination={false}
        scroll={{ x: 1000, y: 'calc(100vh - 390px)' }}
        onScroll={handleTableScroll}
      />
      <InvokeLogDetailModal
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        type={type}
        params={{
          log_id: currentLogData?.logId || '',
          start_timestamp: String((currentLogData?.createdTime || 0) - 3600),
          end_timestamp: String((currentLogData?.createdTime || 0) + 3600),
          // start_timestamp: toTimestamp(searchTime?.[0])?.toString() || "",
          // end_timestamp: toTimestamp(searchTime?.[1])?.toString() || "",
          hasLargeFields: currentLogData?.hasLargeFields || false,
        }}
      />
    </div>
  )
}
