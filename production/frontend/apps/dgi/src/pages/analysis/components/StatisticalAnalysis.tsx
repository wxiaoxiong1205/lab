import React, { memo, useCallback, useMemo, useState } from 'react'
import { Segmented, Select, Spin, Table, Tabs } from 'antd'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import { useRequest } from 'ahooks'
import { useShallow } from 'zustand/react/shallow'
import { apiAnalysis, apiUsersList } from '@/services/api'
import { useTransform } from '@/locales'
import Title from '@/components/Title'
import useMenuStore from '@/stores/menu'
import { useSystemConfig } from '@/hooks/use-system-config'
import DgiDateTimePicker from '@/components/dgi-date-time-picker'
import useAuthStore from '@/stores/auth'

dayjs.extend(duration)

const { TabPane } = Tabs

interface MenuItem {
  id: number
  code: string
  name: string
  description: string
  enabled: boolean
  children: MenuItem[] | null
}

function ceil2(num: number) {
  return typeof num === 'number' ? Math.ceil(num * 100) / 100 : undefined
}

/** 总秒数格式化为 00小时：00分：00秒，细粒度到秒（四舍五入），基于 dayjs duration */
function formatSecondsToHMS(totalSeconds: number, $t: (text: any) => string) {
  if (!totalSeconds) return '--'
  const sec = Math.max(0, Math.round(totalSeconds))
  const d = dayjs.duration(sec, 'seconds')
  const h = Math.floor(d.asHours())
  const m = Math.floor(d.asMinutes() % 60)
  const s = Math.floor(d.asSeconds() % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}小时${pad(m)}分钟${pad(s)}秒`
}

function CustomTooltip({ active, payload, label, title, body }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="p-2 w-[200px] bg-[#000] text-white rounded-lg">
        <h3 className="text-xs">{title}</h3>
        {body(payload)}
        <h3>{label}</h3>
      </div>
    )
  }
}

function ChartCard({
  title,
  children,
  total,
  loading,
}: {
  title: string
  children: React.ReactNode
  total?: string | number
  loading?: boolean
}) {
  return (
    <Spin spinning={loading}>
      <div className="bg-white rounded-lg p-4 min-h-[348px]">
        <h2 className="font-semibold mb-2">{title}</h2>
        {total && <h3 className="text-lg font-semibold mb-2">{total}</h3>}
        {children}
      </div>
    </Spin>
  )
}

// 自定义比较函数，用于 memo 优化
function arePropsEqual(prevProps: any, nextProps: any) {
  // 比较 searchTime 数组
  const prevTime0 = prevProps.searchTime?.[0]?.valueOf()
  const prevTime1 = prevProps.searchTime?.[1]?.valueOf()
  const nextTime0 = nextProps.searchTime?.[0]?.valueOf()
  const nextTime1 = nextProps.searchTime?.[1]?.valueOf()

  if (prevTime0 !== nextTime0 || prevTime1 !== nextTime1) {
    return false
  }

  // 比较其他 props
  return (
    prevProps.selectedUser === nextProps.selectedUser
    && prevProps.type === nextProps.type
    && prevProps.getData === nextProps.getData
    && prevProps.amountSymbol === nextProps.amountSymbol
    && prevProps.$t === nextProps.$t
    && prevProps.maxLength === nextProps.maxLength
  )
}

// 概览页面的花费图表组件
const OverviewCostChart = memo(({
  searchTime,
  selectedUser,
  getData,
  amountSymbol,
  $t,
}: {
  searchTime: [Dayjs?, Dayjs?]
  selectedUser: string | undefined
  getData: (aggregation: string, user_name?: string) => Promise<any>
  amountSymbol: string
  $t: (text: any) => string
}) => {
  const { data, loading } = useRequest(
    () => getData('cost_details', selectedUser),
    {
      refreshDeps: [searchTime, selectedUser],
    },
  )

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-2 w-[200px] bg-[#000] text-white rounded-lg">
          <h3>{$t('花费')}</h3>
          <p>
            {amountSymbol}
            {payload[0].value}
          </p>
          <h3>{label}</h3>
        </div>
      )
    }
  }

  const showData = (data?.data?.data ?? []).map((m: any) => ({
    cost: ceil2(m.cost),
    time: dayjs(m.timestamp * 1000).format('YYYY-MM-DD'),
  }))

  return (
    <ChartCard
      title={$t('花费')}
      loading={loading}
      total={`${ceil2(data?.data?.details?.cost) ?? '--'} ${$t('元')}`}
    >
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={showData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="cost" fill="#2E9668" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}, arePropsEqual)

// 概览页面的Token使用图表组件
const OverviewTokenChart = memo(({
  searchTime,
  selectedUser,
  getData,
  $t,
}: {
  searchTime: [Dayjs?, Dayjs?]
  selectedUser: string | undefined
  getData: (aggregation: string, user_name?: string) => Promise<any>
  $t: (text: any) => string
}) => {
  const { data, loading } = useRequest(
    () => getData('token_details', selectedUser),
    {
      refreshDeps: [searchTime, selectedUser],
    },
  )

  const showData = (data?.data?.data ?? []).map((m: any) => ({
    input_token: ceil2(m.input_token),
    output_token: ceil2(m.output_token),
    total_token: ceil2(m.total_token),
    time: dayjs(m.timestamp * 1000).format('YYYY-MM-DD'),
  }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-2 w-[200px] bg-[#000] text-white rounded-lg">
          <h3 className="text-xs">{$t('token 使用')}</h3>
          <p>
            {$t('输入Token')}
            ：
            {payload[0].value / 1000}
            {' '}
            K
          </p>
          <p>
            {$t('输出Token')}
            ：
            {payload[1].value / 1000}
            {' '}
            K
          </p>
          <p>
            {$t('总Token')}
            ：
            {(payload[0].value + payload[1].value) / 1000}
            {' '}
            K
          </p>
          <h3>{label}</h3>
        </div>
      )
    }
  }

  const formatYAxisValue = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`
    }
    return String(value)
  }

  return (
    <ChartCard
      loading={loading}
      title={$t('Token使用')}
      total={
        `${data?.data?.details?.total_token
          ? ceil2(data?.data?.details?.total_token / 1000 / 1000)
          : '--'} M`
      }
    >
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={showData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" />
          <YAxis tickFormatter={formatYAxisValue} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="input_token" stackId="a" fill="#2E9668" />
          <Bar dataKey="output_token" stackId="a" fill="#2671C2" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}, arePropsEqual)

// 概览页面的请求数图表组件
const OverviewRequestChart = memo(({
  searchTime,
  selectedUser,
  type,
  getData,
  $t,
}: {
  searchTime: [Dayjs?, Dayjs?]
  selectedUser: string | undefined
  type: 'model' | 'api'
  getData: (aggregation: string, user_name?: string, type?: 'model' | 'api') => Promise<any>
  $t: (text: any) => string
}) => {
  const { data, loading } = useRequest(
    () => getData('request_details', selectedUser, type),
    {
      refreshDeps: [searchTime, selectedUser, type],
    },
  )

  const showData = (data?.data?.data ?? []).map((m: any) => ({
    fail_request: ceil2(m.fail_request),
    success_request: ceil2(m.success_request),
    total_request: ceil2(m.total_request),
    time: dayjs(m.timestamp * 1000).format('YYYY-MM-DD'),
  }))

  return (
    <ChartCard
      loading={loading}
      title={$t('请求数')}
      total={data?.data?.details?.total_request ?? '--'}
    >
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={showData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip
            content={(
              <CustomTooltip
                title={$t('请求数')}
                body={(payload: any[]) =>
                  payload && (
                    <>
                      <p>
                        {$t('总请求数')}
                        ：
                        {payload[0].value}
                      </p>
                      <p>
                        {$t('错误')}
                        ：
                        {payload[1]?.value ?? 0}
                      </p>
                    </>
                  )}
              />
            )}
          />
          <Bar dataKey="success_request" stackId="a" fill="#2E9668" />
          <Bar dataKey="fail_request" stackId="a" fill="#B65356" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}, arePropsEqual)

// 概览页面的模型表格组件
const OverviewModelTable = memo(({
  searchTime,
  selectedUser,
  getData,
  $t,
  maxLength,
  amountSymbol,
  type,
}: {
  searchTime: [Dayjs?, Dayjs?]
  selectedUser: string | undefined
  getData: (aggregation: string, user_name?: string) => Promise<any>
  $t: (text: any) => string
  type: 'model' | 'api'
  maxLength?: number
  amountSymbol: string
}) => {
  const { data, loading } = useRequest(
    () => getData(`${type}_channel_details`, selectedUser),
    {
      refreshDeps: [searchTime, selectedUser, type],
    },
  )

  const modelColumns = [
    {
      width: 150,
      title: $t('模型'),
      dataIndex: 'model_name',
      key: 'model_name',
      ellipsis: true,
    },
    {
      width: 80,
      title: $t('请求'),
      dataIndex: 'requests',
      key: 'requests',
      sorter: (a: any, b: any) => a.requests - b.requests,
    },
    {
      width: 80,
      title: $t('Token数'),
      dataIndex: 'tokens',
      key: 'tokens',
      render: (_v: any, record: any) => (
        ceil2(record.tokens) || '--'
      ),
    },
    {
      width: 150,
      title: $t('语音时长'),
      dataIndex: 'duration_seconds',
      key: 'duration_seconds',
      render: (v: any) => formatSecondsToHMS(v, $t),
    },
    {
      width: 80,
      title: `${$t('花费')} (${amountSymbol})`,
      dataIndex: 'cost',
      key: 'cost',
      render: (v: any) => ceil2(v),
    },
  ]

  const apiColumns = [
    {
      title: $t('API名称(Top 10)'),
      dataIndex: 'api_name',
      key: 'api_name',
    },
    {
      title: $t('请求数'),
      dataIndex: 'requests',
      key: 'requests',
    },
  ]

  const tableData = useMemo(() => {
    if (maxLength) {
      return (data?.data?.data ?? []).slice(0, maxLength)
    }
    return data?.data?.data ?? []
  }, [data, maxLength])

  return (
    <ChartCard title="" loading={loading}>
      <Table
        columns={type === 'model' ? modelColumns : apiColumns}
        dataSource={tableData}
        rowKey={type === 'model' ? 'model' : 'api'}
        pagination={false}
      />
    </ChartCard>
  )
}, arePropsEqual)

export default function AnalysisPage() {
  const { $t } = useTransform()
  const [searchTime, setSearchTime] = useState<[Dayjs?, Dayjs?]>([
    dayjs().subtract(7, 'day').startOf('day'),
    dayjs().endOf('day').hour(23).minute(59),
  ])
  const [activeTab, setActiveTab] = useState<string>('1')
  const { amountSymbol } = useSystemConfig(true)
  const [type, setType] = useState<'model' | 'api'>('model')

  const { userInfo } = useAuthStore(useShallow((state) => {
    return {
      userInfo: state.userInfo,
    }
  }))

  const [selectedUser, setSelectedUser] = useState<string | undefined>(
    userInfo?.username || undefined,
  )

  const { menuList, isRoot, isManager } = useMenuStore(
    useShallow((state) => {
      return {
        menuList: state.menuList,
        isRoot: state.isRoot,
        isManager: state.isManager,
      }
    }),
  )

  const getData = useCallback(
    (aggregation: string, user_name?: string, type?: 'model' | 'api') =>
      apiAnalysis({
        aggregation,
        start_time: Math.floor(dayjs(searchTime?.[0]).valueOf() / 1000),
        end_time: Math.floor(dayjs(searchTime?.[1]).valueOf() / 1000),
        ...(user_name && { user_name }),
        ...(type && { request_type: type }),
      }),
    [searchTime],
  )

  // 请求用户
  function UserRequestChart() {
    const { data, loading } = useRequest(
      () => getData('active_users', selectedUser),
      {
        refreshDeps: [searchTime, selectedUser],
      },
    )
    const showData = (data?.data?.data ?? []).map((m: any) => ({
      value: m.active_users,
      time: dayjs(m.timestamp * 1000).format('YYYY-MM-DD'),
    }))

    const formatYAxisValue = (value: number) => {
      // 只有当值大于等于1时才显示，避免多个0
      if (value < 1) return ''
      return Math.floor(value).toString()
    }

    return (
      <ChartCard
        loading={loading}
        title={$t('请求用户')}
        total={data?.data?.details?.active_users ?? '--'}
      >
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={showData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" />
            <YAxis tickFormatter={formatYAxisValue} />
            <Tooltip
              content={(
                <CustomTooltip
                  title={$t('请求用户')}
                  body={(payload: any[]) => payload[0]?.value ?? '--'}
                />
              )}
            />
            <Area dataKey="value" fill="url(#colorUv)" stroke="#F59E0C" />
            <defs>
              <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="20%" stopColor="#F59E0C" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#fff" stopOpacity={0} />
              </linearGradient>
            </defs>
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    )
  }

  // 用户平均请求数
  function UserAverageRequestChart() {
    const { data, loading } = useRequest(
      () => getData('user_avg_requests', selectedUser),
      {
        refreshDeps: [searchTime, selectedUser],
      },
    )
    const showData = (data?.data?.data ?? []).map((m: any) => ({
      value: m.avg_requests,
      time: dayjs(m.timestamp * 1000).format('YYYY-MM-DD'),
    }))
    return (
      <ChartCard
        loading={loading}
        title={$t('用户平均请求数')}
        total={ceil2(data?.data?.details?.current_avg_requests) ?? '--'}
      >
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={showData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip
              content={(
                <CustomTooltip
                  title={$t('用户平均请求数')}
                  body={(payload: any[]) => payload[0]?.value ?? '--'}
                />
              )}
            />
            <Area dataKey="value" fill="url(#colorUv)" stroke="#F59E0C" />
            <defs>
              <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="20%" stopColor="#F59E0C" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#fff" stopOpacity={0} />
              </linearGradient>
            </defs>
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    )
  }

  function UserTable() {
    const { data, loading } = useRequest(
      () => getData('user_cost_details', selectedUser),
      {
        refreshDeps: [searchTime, selectedUser],
      },
    )
    const userColumns = [
      {
        title: $t('用户'),
        dataIndex: 'user_name',
        key: 'user_name',
      },
      {
        title: $t('API请求'),
        dataIndex: 'api_requests',
        key: 'api_requests',
        sorter: (a: any, b: any) => a.api_requests - b.api_requests,
      },
      {
        title: $t('模型请求'),
        dataIndex: 'requests',
        key: 'requests',
        sorter: (a: any, b: any) => a.requests - b.requests,
      },
      {
        title: `${$t('花费')} (${amountSymbol})`,
        dataIndex: 'cost',
        key: 'cost',
        render: (v: any) => ceil2(v),
      },
      {
        title: $t('Token数'),
        dataIndex: 'tokens',
        key: 'tokens',
        render: (v: any) => ceil2(v),
      },
      {
        title: $t('语音时长'),
        dataIndex: 'duration_seconds',
        key: 'duration_seconds',
        render: (v: any) => formatSecondsToHMS(v, $t),
      },
    ]
    return (
      <ChartCard loading={loading} title="">
        <Table
          columns={userColumns}
          dataSource={data?.data?.data ?? []}
          rowKey="user"
          pagination={false}
        />
      </ChartCard>
    )
  }

  function ModelTable({ maxLength, amountSymbol, type }: { maxLength?: number, amountSymbol: string, type: 'model' | 'api' }) {
    const { data, loading } = useRequest(
      () => getData(`${type}_channel_details`, selectedUser),
      {
        refreshDeps: [searchTime, selectedUser, type],
      },
    )
    const modelColumns = [
      {
        title: $t('模型'),
        dataIndex: 'model_name',
        key: 'model_name',
      },
      {
        title: $t('请求'),
        dataIndex: 'requests',
        key: 'requests',
        sorter: (a: any, b: any) => a.requests - b.requests,
      },
      {
        title: $t('Token数'),
        dataIndex: 'tokens',
        key: 'tokens',
        render: (v: any) => ceil2(v),
      },
      {
        title: $t('语音时长'),
        dataIndex: 'duration_seconds',
        key: 'duration_seconds',
        render: (v: any) => formatSecondsToHMS(v, $t),
      },
      {
        title: `${$t('花费')} (${amountSymbol})`,
        dataIndex: 'cost',
        key: 'cost',
        render: (v: any) => ceil2(v),
      },
    ]

    const apiColumns = [
      {
        title: $t('API'),
        width: 200,
        dataIndex: 'api_name',
        key: 'api_name',
      },
      {
        title: $t('请求数'),
        width: 100,
        dataIndex: 'requests',
        key: 'requests',
      },
      {
        title: $t('花费'),
        width: 100,
        dataIndex: 'cost',
        key: 'cost',
        render: (v: any) => ceil2(v),
      },
    ]

    const tableData = useMemo(() => {
      if (maxLength) {
        return (data?.data?.data ?? []).slice(0, maxLength)
      }
      return data?.data?.data ?? []
    }, [data, maxLength])
    return (
      <ChartCard title="" loading={loading}>
        <Table
          columns={type === 'model' ? modelColumns : apiColumns}
          dataSource={tableData}
          rowKey={type === 'model' ? 'model' : 'api'}
          pagination={false}
        />
      </ChartCard>
    )
  }

  function ErrorRateChart({ type }: { type: 'model' | 'api' }) {
    const { data, loading } = useRequest(
      () => getData('error_rate', selectedUser, type),
      {
        refreshDeps: [searchTime, selectedUser, type],
      },
    )
    const showData = (data?.data?.data ?? []).map((m: any) => ({
      value: ceil2(m.error_rate),
      time: dayjs(m.timestamp * 1000).format('YYYY-MM-DD'),
    }))
    return (
      <ChartCard
        loading={loading}
        title={$t('错误率')}
        total={`${ceil2(data?.data?.details?.total_error_rate) ?? '--'}%`}
      >
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={showData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip
              content={(
                <CustomTooltip
                  title={$t('错误率')}
                  body={(payload: any[]) => payload[0]?.value ?? '--'}
                />
              )}
            />
            <Area dataKey="value" fill="url(#colorUv)" stroke="#F59E0C" />
            <defs>
              <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="20%" stopColor="#F59E0C" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#fff" stopOpacity={0} />
              </linearGradient>
            </defs>
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    )
  }

  function ErrorCountChart({ type }: { type: 'model' | 'api' }) {
    const { data, loading } = useRequest(
      () => getData('error_count', selectedUser, type),
      {
        refreshDeps: [searchTime, selectedUser, type],
      },
    )
    const showData = (data?.data?.data ?? []).map((m: any) => ({
      value: m.fail_count,
      time: dayjs(m.timestamp * 1000).format('YYYY-MM-DD'),
    }))
    return (
      <ChartCard
        loading={loading}
        title={$t('错误数')}
        total={data?.data?.details?.fail_count ?? '--'}
      >
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={showData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip
              content={(
                <CustomTooltip
                  title={$t('错误数')}
                  body={(payload: any[]) => payload[0]?.value ?? '--'}
                />
              )}
            />
            <Bar dataKey="value" fill="#B65356" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    )
  }

  function AccessKeyTable({ amountSymbol }: { amountSymbol: string }) {
    const { data, loading } = useRequest(
      () => getData('key_ranking', selectedUser),
      {
        refreshDeps: [searchTime, selectedUser],
      },
    )
    const columns = [
      {
        title: $t('密钥名称'),
        dataIndex: 'token_name',
        key: 'token_name',
      },
      {
        title: $t('API请求数'),
        dataIndex: 'api_requests',
        key: 'api_requests',
        sorter: (a: any, b: any) => a.api_requests - b.api_requests,
      },
      {
        title: $t('模型请求数'),
        dataIndex: 'requests',
        key: 'requests',
        sorter: (a: any, b: any) => a.requests - b.requests,
      },
      {
        title: $t('已用token数'),
        dataIndex: 'tokens',
        key: 'tokens',
        sorter: (a: any, b: any) => a.tokens - b.tokens,
      },
      {
        title: $t('语音时长'),
        dataIndex: 'duration_seconds',
        key: 'duration_seconds',
        render: (v: any) => formatSecondsToHMS(v, $t),
      },
      {
        title: `${$t('花费')} (${amountSymbol})`,
        dataIndex: 'cost',
        key: 'cost',
        render: (v: any) => ceil2(v),
      },
    ]
    return (
      <ChartCard title="" loading={loading}>
        <Table
          columns={columns}
          dataSource={data?.data?.data ?? []}
          rowKey="model"
          pagination={false}
        />
      </ChartCard>
    )
  }

  // 内容安全相关组件
  function ContentSecurityRequestChart() {
    const { data, loading } = useRequest(
      () => getData('security_details', selectedUser),
      {
        refreshDeps: [searchTime, selectedUser],
      },
    )

    const [visibleData, setVisibleData] = useState({
      total_check: true,
      pass_check: true,
      fail_check: true,
      output_fail_check: true,
    })

    const showData = (data?.data?.data ?? []).map((m: any) => ({
      name: dayjs(m.timestamp * 1000).format('YYYY-MM-DD'),
      total_check: m.total_check || 0,
      pass_check: m.pass_check || 0,
      fail_check: m.fail_check || 0,
      output_fail_check: m.output_fail_check || 0,
    }))

    const toggleDataVisibility = (dataKey: keyof typeof visibleData) => {
      setVisibleData((prev) => ({
        ...prev,
        [dataKey]: !prev[dataKey],
      }))
    }

    const CustomTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
        return (
          <div className="p-2 w-[200px] bg-[#000] text-white rounded-lg">
            <h3 className="text-xs">内容安全统计</h3>
            {payload.map((item: any, index: number) => {
              const labelMap: Record<string, string> = {
                total_check: '审核请求数',
                pass_check: '安全请求数',
                fail_check: '输入拦截数',
                output_fail_check: '输出拦截数',
              }
              return (
                <p key={index}>
                  {labelMap[item.dataKey] || item.dataKey}
                  ：
                  {item.value}
                </p>
              )
            })}
            <h3>{label}</h3>
          </div>
        )
      }
    }

    const legendData = [
      { key: 'total_check' as const, color: '#8884d8', label: '审核请求数' },
      { key: 'pass_check' as const, color: '#2E9668', label: '安全请求数' },
      { key: 'fail_check' as const, color: '#DC2626', label: '输入拦截数' },
      { key: 'output_fail_check' as const, color: '#F59E0C', label: '输出拦截数' },
    ]

    return (
      <ChartCard title="内容安全请求统计" loading={loading}>
        {/* 新增：修改为3列布局，屏蔽输出拦截数 */}
        <div className="mb-4 grid grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-800">
              {data?.data?.details?.total_check?.toLocaleString() ?? '--'}
            </div>
            <div className="text-sm text-gray-600 mt-1">审核请求数</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {data?.data?.details?.pass_check?.toLocaleString() ?? '--'}
            </div>
            <div className="text-sm text-gray-600 mt-1">安全请求数</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {data?.data?.details?.fail_check?.toLocaleString() ?? '--'}
            </div>
            <div className="text-sm text-gray-600 mt-1">输入拦截数</div>
          </div>
          <div className="text-center p-3 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {data?.data?.details?.output_fail_check?.toLocaleString() ?? '--'}
            </div>
            <div className="text-sm text-gray-600 mt-1">输出拦截数</div>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap gap-4">
          {legendData.map((item) => (
            <div
              key={item.key}
              className={`flex items-center gap-2 cursor-pointer select-none ${visibleData[item.key as keyof typeof visibleData]
                ? ''
                : 'opacity-50'
              }`}
              onClick={() => toggleDataVisibility(item.key)}
            >
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm">{item.label}</span>
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={showData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            {visibleData.total_check && (
              <Bar dataKey="total_check" fill="#8884d8" />
            )}
            {visibleData.pass_check && (
              <Bar dataKey="pass_check" fill="#2E9668" />
            )}
            {visibleData.fail_check && (
              <Bar dataKey="fail_check" fill="#DC2626" stackId="blocked" />
            )}
            {visibleData.output_fail_check && (
              <Bar dataKey="output_fail_check" fill="#F59E0C" stackId="blocked" />
            )}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    )
  }

  function ContentSecurityCategoryChart() {
    const { data, loading } = useRequest(
      () => getData('sensitive_type_details', selectedUser),
      {
        refreshDeps: [searchTime, selectedUser],
      },
    )

    const [filterType, setFilterType] = useState<'all' | 'input' | 'output'>('all')

    const getValueByFilterType = useCallback((item: any, type: 'all' | 'input' | 'output') => {
      const valueMap = {
        all: item.total_count ?? 0,
        input: item.count ?? 0,
        output: item.output_count ?? 0,
      }
      return valueMap[type]
    }, [])

    const COLORS = ['#2E9668', '#2671C2', '#F59E0C', '#B65356', '#8884d8']
    const pieData = useMemo(() => {
      return (data?.data ?? []).map((item: any, index: number) => ({
        name: item.sensitive_type || '未知',
        value: getValueByFilterType(item, filterType),
        color: COLORS[index % COLORS.length],
      }))
    }, [data?.data, filterType, getValueByFilterType])

    const renderCustomizedLabel = ({
      cx,
      cy,
      midAngle,
      innerRadius,
      outerRadius,
      percent,
    }: any) => {
      const RADIAN = Math.PI / 180
      const radius = innerRadius + (outerRadius - innerRadius) * 0.5
      const x = cx + radius * Math.cos(-midAngle * RADIAN)
      const y = cy + radius * Math.sin(-midAngle * RADIAN)

      return (
        <text
          x={x}
          y={y}
          fill="white"
          textAnchor={x > cx ? 'start' : 'end'}
          dominantBaseline="central"
          fontSize={12}
        >
          {`${(percent * 100).toFixed(0)}%`}
        </text>
      )
    }

    return (
      <ChartCard title="敏感类别分布" loading={loading}>
        <div className="mb-4">
          <Segmented
            value={filterType}
            onChange={(value) => setFilterType(value as 'all' | 'input' | 'output')}
            options={[
              { label: '全部', value: 'all' },
              { label: '敏感输入', value: 'input' },
              { label: '敏感输出', value: 'output' },
            ]}
          />
        </div>
        {pieData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomizedLabel}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {pieData.map((item: any, index: number) => (
                <div key={index} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm">{item.name}</span>
                  <span className="text-sm text-gray-500">{item.value}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            暂无数据
          </div>
        )}
      </ChartCard>
    )
  }

  function ContentSecurityLevelChart() {
    const { data, loading } = useRequest(
      () => getData('risk_level_details', selectedUser),
      {
        refreshDeps: [searchTime, selectedUser],
      },
    )

    const [filterType, setFilterType] = useState<'all' | 'input' | 'output'>('all')

    const getValueByFilterType = useCallback((item: any, type: 'all' | 'input' | 'output') => {
      const valueMap = {
        all: item.total_count ?? item.count ?? 0,
        input: item.input_count ?? 0,
        output: item.output_count ?? 0,
      }
      return valueMap[type]
    }, [])

    const COLORS = ['#2E9668', '#F59E0C', '#B65356']
    const pieData = useMemo(() => {
      return (data?.data ?? []).map((item: any, index: number) => ({
        name: item.risk_level || '未知',
        value: getValueByFilterType(item, filterType),
        color: COLORS[index % COLORS.length],
      }))
    }, [data?.data, filterType, getValueByFilterType])

    const renderCustomizedLabel = ({
      cx,
      cy,
      midAngle,
      innerRadius,
      outerRadius,
      percent,
    }: any) => {
      const RADIAN = Math.PI / 180
      const radius = innerRadius + (outerRadius - innerRadius) * 0.5
      const x = cx + radius * Math.cos(-midAngle * RADIAN)
      const y = cy + radius * Math.sin(-midAngle * RADIAN)

      return (
        <text
          x={x}
          y={y}
          fill="white"
          textAnchor={x > cx ? 'start' : 'end'}
          dominantBaseline="central"
          fontSize={12}
        >
          {`${(percent * 100).toFixed(0)}%`}
        </text>
      )
    }

    return (
      <ChartCard title="敏感级别分类" loading={loading}>
        <div className="mb-4">
          <Segmented
            value={filterType}
            onChange={(value) => setFilterType(value as 'all' | 'input' | 'output')}
            options={[
              { label: '全部', value: 'all' },
              { label: '敏感输入', value: 'input' },
              { label: '敏感输出', value: 'output' },
            ]}
          />
        </div>
        {pieData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomizedLabel}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-1 gap-2">
              {pieData.map((item: any, index: number) => (
                <div key={index} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm">{item.name}</span>
                  <span className="text-sm text-gray-500">
                    {item.value}
                    {' '}
                    (
                    {(() => {
                      if (pieData.length === 0) return 0
                      const total = pieData.reduce(
                        (sum: number, p: any) => sum + p.value,
                        0,
                      )
                      if (total === 0) return 0
                      const percentage = (item.value / total) * 100
                      return isNaN(percentage) ? 0 : percentage.toFixed(0)
                    })()}
                    %)
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            暂无数据
          </div>
        )}
      </ChartCard>
    )
  }

  function ContentSecurityTable() {
    const { data, loading } = useRequest(
      () => getData('model_security_details', selectedUser),
      {
        refreshDeps: [searchTime, selectedUser],
      },
    )

    const columns = [
      {
        title: $t('模型名称'),
        dataIndex: 'model_name',
        key: 'model_name',
      },
      {
        title: '审核请求数',
        dataIndex: 'total_requests',
        key: 'total_requests',
        sorter: (a: any, b: any) => a.total_requests - b.total_requests,
      },
      {
        title: '安全请求数',
        dataIndex: 'safe_requests',
        key: 'safe_requests',
        sorter: (a: any, b: any) => a.safe_requests - b.safe_requests,
      },
      {
        title: '输入拦截数',
        dataIndex: 'input_blocked',
        key: 'input_blocked',
        sorter: (a: any, b: any) => (a.input_blocked || 0) - (b.input_blocked || 0),
      },
      {
        title: '输出拦截数',
        dataIndex: 'output_blocked',
        key: 'output_blocked',
        sorter: (a: any, b: any) => (a.output_blocked || 0) - (b.output_blocked || 0),
      },
    ]

    return (
      <ChartCard title="明细数据" loading={loading}>
        <Table
          columns={columns}
          dataSource={data?.data || []}
          rowKey="key"
          pagination={false}
          locale={{
            emptyText: '暂无数据',
          }}
        />
      </ChartCard>
    )
  }

  // 获取用户列表
  const { data: userListData } = useRequest(() =>
    apiUsersList({ page_size: '1000' }),
  )

  const userOptions = useMemo(() => {
    return (userListData?.data ?? []).map((user: any) => ({
      label: user.username || user.display_name,
      value: user.username,
    }))
  }, [userListData])

  function findUserMenuEnabledStatus(menuData: MenuItem[]): boolean | null {
    // First find the "统计分析" menu
    const statisticsMenu = menuData
      .find((menu) => menu.children?.some((child) => child.name === '统计分析'))
      ?.children?.find((child) => child.name === '统计分析')

    if (!statisticsMenu) return null

    // Then find the "用户" menu within its children
    const userMenu = statisticsMenu.children?.find(
      (item) => item.name === '用户',
    )

    return userMenu?.enabled ?? null
  }

  const onChangeTabs = (key: string) => {
    setActiveTab(key)
    setType('model')
  }

  return (
    <div className="min-h-full">
      <Title title={$t('统计分析')} description={$t('模型请求可视化监控')} />
      <Tabs
        activeKey={activeTab}
        onChange={onChangeTabs}
        tabBarStyle={{
          background: '#fff',
          padding: '0 20px',
          position: 'sticky',
          top: '-24px',
          zIndex: 100,
        }}
        tabBarExtraContent={(
          <div className="flex items-center gap-4">
            {isManager && (
              <Select
                placeholder="选择用户"
                allowClear
                className="w-48"
                value={selectedUser}
                onChange={setSelectedUser}
                showSearch
                optionFilterProp="label"
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                options={[
                  {
                    label: $t('全部'),
                    value: '',
                  },
                  ...userOptions,
                ]}
              />
            )}
            <DgiDateTimePicker
              value={searchTime}
              onChange={(range) => {
                console.log('range', range)
                setSearchTime(range)
              }}
              placeholder="选择时间范围"
              className="w-[380px]"
              hasOptions={false}
              hasTimer={false}
            />
            {/* <DatePicker.RangePicker
              value={searchTime}
              // showTime
              placeholder={[$t("开始时间"), $t("结束时间")]}
              className="w-[380px]"
              disabledDate={(current) => current && current > dayjs().endOf('day')}
              onChange={(date) => {
                setSearchTime(date);
              }}
            /> */}
          </div>
        )}
      >
        <TabPane tab={$t('概览')} key="1">
          {activeTab === '1' && (
            <div>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <OverviewCostChart
                  searchTime={searchTime}
                  selectedUser={selectedUser}
                  getData={getData}
                  amountSymbol={amountSymbol}
                  $t={$t}
                />
                <OverviewTokenChart
                  searchTime={searchTime}
                  selectedUser={selectedUser}
                  getData={getData}
                  $t={$t}
                />
              </div>
              <Segmented
                value={type}
                onChange={(v) => setType(v as any)}
                options={[
                  { label: $t('模型'), value: 'model' },
                  { label: $t('API'), value: 'api' },
                ]}
                className="!mb-4"
              />
              <div className="grid grid-cols-2 gap-4 mb-8">
                <OverviewRequestChart
                  searchTime={searchTime}
                  selectedUser={selectedUser}
                  getData={getData}
                  $t={$t}
                  type={type}
                />
                <OverviewModelTable
                  searchTime={searchTime}
                  selectedUser={selectedUser}
                  amountSymbol={amountSymbol}
                  getData={getData}
                  $t={$t}
                  maxLength={10}
                  type={type}
                />
              </div>
            </div>
          )}
        </TabPane>
        {/* {findUserMenuEnabledStatus(menuList as MenuItem[]) && (
          <TabPane tab={$t("用户")} key="2">
            <div className="grid grid-cols-2 gap-4 mb-8">
              <UserRequestChart />
              <UserTable />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <UserAverageRequestChart />
            </div>
          </TabPane>
        )} */}
        {isManager && (
          <TabPane tab={$t('用户')} key="2">
            {activeTab === '2' && (
              <>
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <UserRequestChart />
                  <UserTable />
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <UserAverageRequestChart />
                </div>
              </>
            )}
          </TabPane>
        )}
        <TabPane tab={$t('异常')} key="3">
          {activeTab === '3' && (
            <div>
              <Segmented
                value={type}
                onChange={(v) => setType(v as any)}
                options={[
                  { label: $t('模型'), value: 'model' },
                  { label: $t('API'), value: 'api' },
                ]}
                className="!mb-4"
              />
              <div className="grid grid-cols-2 gap-4 mb-8">
                <ErrorRateChart type={type} />
                <ErrorCountChart type={type} />
              </div>
            </div>
          )}
        </TabPane>
        <TabPane tab={$t('密钥')} key="4">
          {activeTab === '4' && (
            <div className="grid grid-cols-1 gap-4">
              <AccessKeyTable amountSymbol={amountSymbol} />
            </div>
          )}
        </TabPane>
        <TabPane tab={$t('资源')} key="5">
          {activeTab === '5' && (
            <div>
              <Segmented
                value={type}
                onChange={(v) => setType(v as any)}
                options={[
                  { label: $t('模型'), value: 'model' },
                  { label: $t('API'), value: 'api' },
                ]}
                className="!mb-4"
              />
              <div className="grid grid-cols-1 gap-4">
                <ModelTable amountSymbol={amountSymbol} type={type} />
              </div>
            </div>
          )}
        </TabPane>
        <TabPane tab={$t('内容安全')} key="6">
          {activeTab === '6' && (
            <>
              <div className="grid grid-cols-1 gap-4 mb-8">
                <ContentSecurityRequestChart />
                <div className="grid grid-cols-2 gap-4">
                  <ContentSecurityCategoryChart />
                  <ContentSecurityLevelChart />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <ContentSecurityTable />
              </div>
            </>
          )}
        </TabPane>
      </Tabs>
    </div>
  )
}
