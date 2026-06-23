import { SearchOutlined } from '@ant-design/icons'
import type { TableProps } from 'antd'
import { Button, Empty, Input, Select, Table, Tag, message } from 'antd'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import TooltipContent from '@/components/TooltipContent'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTransform } from '@/locales'
import { apiAllModelChanelTest, apiChannelModelList, apiModelTest } from '@/services/api'
import BackTabbar from '@/components/BackTabbar'

interface ModelItem {
  channel_id: number
  channel_name: string
  creator: string
  enabled: number
  group: string
  model: string
  priority: number
  provider: string
  response_time: number
  test_time: number
  type: string
  updated_time: number
  base_url?: string
  id?: number
}

enum STATUS {
  ENABLE = 1,
  DISABLE = 2,
}

export default function ChannelTest({ name = '' }: { name?: string }) {
  const { $t } = useTransform()
  const navigate = useNavigate()

  const { channelTypeOptions } = useSystemConfig(true)

  const { groupListName = name } = useParams<{ groupListName: string }>()

  const [modelName, setModelName] = useState('')
  const [modelUrl, setModelUrl] = useState('')
  const [channel, setChannel] = useState('')
  const [connectivity, setConnectivity] = useState<string | undefined>(undefined)
  const [channelType, setChannelType] = useState<string | undefined>(undefined)
  const [channelStatus, setChannelStatus] = useState<string | undefined>(undefined)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [testingModels, setTestingModels] = useState<Record<string, boolean>>({})

  const {
    data = [],
    loading,
    run: getList,
  } = useRequest(
    () => {
      if (!groupListName) return Promise.resolve([])
      return apiChannelModelList({
        connect_status:
          connectivity === undefined
            ? undefined
            : connectivity === ''
              ? undefined
              : Number(connectivity),
        group_list_name: groupListName,
        channel_name: channel || undefined,
        base_url: modelUrl || undefined,
        page_number: pagination.current,
        page_size: pagination.pageSize,
        model_name: modelName || undefined,
        types: channelType ? [channelType] : undefined,
        status: channelStatus ? Number(channelStatus) : undefined,
      }).then((res) => {
        setPagination((prev) => ({ ...prev, total: res.data.total }))
        return res.data.items
      })
    },
    {
      refreshDeps: [
        groupListName,
        modelName,
        connectivity,
        channel,
        modelUrl,
        pagination.current,
        pagination.pageSize,
        channelType,
        channelStatus,
      ],
      debounceWait: 300,
    },
  )

  useEffect(() => {
    if (groupListName) getList()
  }, [groupListName, getList])

  const handleTest = useCallback(async (channelId: number, model: string) => {
    const key = `${channelId}-${model}`
    setTestingModels((prev) => ({ ...prev, [key]: true }))
    try {
      const result: any = await apiModelTest(channelId, model)
      if (result.message === 'success') message.success($t('测试成功'))
      else message.error(result.message)
      getList()
    }
    finally {
      setTestingModels((prev) => ({ ...prev, [key]: false }))
    }
  }, [$t, getList])

  const handleTestAllChannel = useCallback(async () => {
    if (!groupListName) return
    apiAllModelChanelTest(groupListName).then((res: any) => {
      message.success(res.message)
      getList()
    })
  }, [getList, groupListName])

  const columns: TableProps<ModelItem>['columns'] = useMemo(() => ([
    {
      title: $t('模型ID'),
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (text: string) => <TooltipContent content={text} />,
    },
    {
      title: $t('模型名称'),
      dataIndex: 'model',
      key: 'model',
      width: 160,
      ellipsis: true,
      render: (text: string) => <TooltipContent content={text} />,
    },
    {
      title: $t('模型地址'),
      dataIndex: 'base_url',
      key: 'base_url',
      width: 100,
      ellipsis: true,
      render: (text: string) => <TooltipContent content={text} />,
    },
    {
      title: $t('提供商'),
      dataIndex: 'provider_type',
      key: 'provider_type',
      width: 120,
      render: (v: number) =>
        channelTypeOptions.find((t) => t.value === v)?.label ?? '--',
    },
    {
      title: $t('渠道'),
      dataIndex: 'channel_name',
      key: 'channel_name',
      width: 160,
      render: (text: string) => (
        <Link
          to={`/channel-manage?channel=${encodeURIComponent(text)}`}
          className="text-blue-600 cursor-pointer hover:underline"
          target="_blank"
        >
          {text}
        </Link>
      ),
    },
    {
      title: $t('响应时间'),
      dataIndex: 'response_time',
      key: 'response_time',
      width: 100,
      render: (text: number) => {
        if (text === null) return '--'
        if (text === 0) return <Tag color="error">{$t('未通过')}</Tag>
        return <Tag color="success">{text}</Tag>
      },
    },
    {
      title: $t('状态'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag color={status === STATUS.ENABLE ? 'success' : 'error'}>
          {status === STATUS.ENABLE ? $t('已启用') : $t('已禁用')}
        </Tag>
      ),
    },
    {
      title: $t('创建人'),
      dataIndex: 'creator',
      key: 'creator',
      width: 100,
    },
    {
      title: $t('修改时间'),
      dataIndex: 'updated_time',
      key: 'updated_time',
      width: 200,
      render: (text: number) => dayjs(text * 1000).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: $t('操作'),
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_: any, record: ModelItem) => {
        const key = `${record.channel_id}-${record.model}`
        return (
          <Button
            loading={testingModels[key]}
            type="link"
            size="small"
            onClick={() => handleTest(record.channel_id, record.model)}
          >
            {$t('连通性测试')}
          </Button>
        )
      },
    },
  ]), [channelTypeOptions, testingModels, $t, handleTest])

  return (
    <div>
      <BackTabbar
        label={$t('返回渠道列表')}
        backFunc={() => navigate(-1)}
      />

      <div className="my-4 p-4 bg-white rounded-lg h-full">
        <div className="mb-6">
          <h2 className="text-lg font-bold mb-4">{$t('实例列表')}</h2>
          <div className="flex gap-4 flex-wrap">
            <Input
              placeholder={$t('请输入模型名称')}
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              prefix={<SearchOutlined className="text-gray-400" />}
              className="w-[240px]!"
            />
            <Input
              placeholder={$t('请输入模型地址')}
              value={modelUrl}
              onChange={(e) => setModelUrl(e.target.value)}
              prefix={<SearchOutlined className="text-gray-400" />}
              className="w-[240px]!"
            />
            <Input
              placeholder={$t('请输入渠道名称')}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              prefix={<SearchOutlined className="text-gray-400" />}
              className="w-[240px]!"
            />
            <Select
              placeholder={$t('提供商')}
              className="w-[240px]!"
              allowClear
              options={[
                { value: '', label: $t('全部') },
                ...channelTypeOptions,
              ]}
              value={channelType}
              onChange={setChannelType}
            />
            <Select
              placeholder={$t('连通性')}
              className="w-40"
              allowClear
              value={connectivity}
              onChange={setConnectivity}
            >
              <Select.Option value="">{$t('全部')}</Select.Option>
              <Select.Option value={1}>{$t('已通过')}</Select.Option>
              <Select.Option value={0}>{$t('未通过')}</Select.Option>
            </Select>
            <Select
              placeholder={$t('状态')}
              className="w-40"
              allowClear
              value={channelStatus}
              onChange={setChannelStatus}
            >
              <Select.Option value="">{$t('全部')}</Select.Option>
              <Select.Option value={STATUS.ENABLE}>{$t('已启用')}</Select.Option>
              <Select.Option value={STATUS.DISABLE}>{$t('已禁用')}</Select.Option>
            </Select>

            <Button type="primary" onClick={handleTestAllChannel} disabled={!groupListName}>
              {$t('测试所有渠道')}
            </Button>
          </div>
        </div>

        <Table
          columns={columns}
          dataSource={data}
          rowKey={(row) => row.id || row.model}
          scroll={{ x: 1000 }}
          loading={loading}
          pagination={{
            ...pagination,
            current: pagination.current ?? 1,
            pageSize: pagination.pageSize ?? 10,
            total: pagination.total ?? 0,
          }}
          onChange={(pag) =>
            setPagination({
              current: pag.current ?? 1,
              pageSize: pag.pageSize ?? 10,
              total: pagination.total ?? 0,
            })}
          locale={{ emptyText: <Empty description={$t('暂无数据')} /> }}
        />
      </div>
    </div>

  )
}
