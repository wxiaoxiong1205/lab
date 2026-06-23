import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button,
  Card,
  Col,
  Row,
  Tag,
  message,
} from 'antd'
import { ArrowLeftOutlined, PlusOutlined, RocketOutlined } from '@ant-design/icons'
import { useRequest } from 'ahooks'
import dayjs from 'dayjs'
import type { TableProps } from 'antd'
import { useShallow } from 'zustand/react/shallow'
import {
  apiAllModelChanelTest,
  apiChannelModelList,
  apiModelDetail,
  apiModelTest,
  apiSecurityLevelSwitch,
} from '@/services/api'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTransform } from '@/locales'
import TooltipContent from '@/components/TooltipContent'
import { ModelLogo } from '@/components/model-card/ModelLogo'
import { getModelExperienceRoute, withBasePath } from '@/utils'
import useMenuStore from '@/stores/menu'
import BackTabbar from '@/components/BackTabbar'

interface ModelDetail {
  id: number
  model_name: string
  model_type: string
  description?: string
  logo?: string
  updated_time?: number
  model_count?: number
  category?: string
}

const SectionTitle = ({ title }: { title: string }) => (
  <div className="flex items-center gap-2 mb-1">
    <span className="w-1 h-4 bg-blue-500 rounded" />
    <span className="font-bold">{title}</span>
  </div>
)

const InfoRow = ({ label, value }: { label: string, value: ReactNode }) => (
  <div className="flex justify-between items-center border-b border-gray-200 py-3">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium">{value}</span>
  </div>
)

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

export default function ModelDetailPage() {
  const navigate = useNavigate()
  const params = useParams()
  const modelId = Number(params.id)
  const isSanYuan = useMenuStore(useShallow((state) => state.isSanYuan))
  const { data: securityLevelEnabled = false } = useRequest(() => {
    return apiSecurityLevelSwitch().then((res) => res.data.security_level_enabled)
  })

  // 基础信息
  const {
    data: detail,
    loading: detailLoading,
    error: detailError,
    refresh: refreshDetail,
  } = useRequest(() => apiModelDetail(modelId).then((res) => res.data), {
    refreshDeps: [modelId],
  })

  const { $t } = useTransform()

  // 搜索与表格相关
  const [modelName, setModelName] = useState('')
  const [modelUrl, setModelUrl] = useState('')
  const [channel, setChannel] = useState('')
  const [connectivity, setConnectivity] = useState<string | undefined>(
    undefined,
  )
  const [channelType, setChannelType] = useState<string | undefined>(undefined)
  const [channelStatus, setChannelStatus] = useState<string | undefined>(
    undefined,
  )
  // 获取模型类型
  const { modelTypeOptions, securityPolicyOptions, channelTypeOptions, modelPermissionOptions }
    = useSystemConfig(true)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  const [testingModels, setTestingModels] = useState<Record<string, boolean>>(
    {},
  )

  // 表格数据
  const {
    data = [],
    loading,
    run: getList,
  } = useRequest(
    () => {
      if (!detail) return Promise.resolve([])
      return apiChannelModelList({
        // TODO： 待优化，isEmpty 解决多条件判断
        connect_status:
          connectivity === undefined
            ? undefined
            : connectivity === ''
              ? undefined
              : Number(connectivity),
        group_list_name: detail?.model_name,
        channel_name: channel || undefined,
        base_url: modelUrl || undefined,
        page_number: pagination.current,
        page_size: pagination.pageSize,
        model_name: modelName || undefined,
        types: channelType ? [channelType] : undefined,
        status: channelStatus ? Number(channelStatus) : undefined,
      }).then((res) => {
        setPagination((prev) => ({
          ...prev,
          total: res.data.total,
        }))
        return res.data.items
      })
    },
    {
      refreshDeps: [
        modelId,
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
    if (detail) getList()
  }, [detail])

  const columns: TableProps<ModelItem>['columns'] = [
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
      render: (text: number) =>
        dayjs(text * 1000).format('YYYY-MM-DD HH:mm:ss'),
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
  ]

  const handleTest = async (channelId: number, modelName: string) => {
    const key = `${channelId}-${modelName}`
    setTestingModels((prev) => ({ ...prev, [key]: true }))
    try {
      const result: any = await apiModelTest(channelId, modelName)
      if (result.message === 'success') {
        message.success($t('测试成功'))
      }
      else {
        message.error(result.message)
      }
      getList()
    }
    finally {
      setTestingModels((prev) => ({ ...prev, [key]: false }))
    }
  }

  const handleTestAllChannel = async () => {
    apiAllModelChanelTest(detail.model_name).then((res: any) => {
      // message.success($t("测试成功"));
      message.success(res.message)
      getList()
    })
  }

  // 详情加载异常
  if (detailError) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-red-500">
        {$t('加载失败')}
        <Button type="link" onClick={refreshDetail}>
          {$t('重试')}
        </Button>
      </div>
    )
  }

  // 立即体验
  const handleExperience = () => {
    if (detail?.can_use !== 'usable') {
      message.error($t('用户无该模型使用权限。'))
      return
    }

    const url = getModelExperienceRoute(detail?.category, detail?.model_name)
    if (url) {
      navigate(url)
    }
    else {
      console.warn('未找到支持的模型类型:', detail?.category, detail)
      // 如果没有匹配的类型，默认跳转到文本体验页面
      const encodedModelName = encodeURIComponent(detail?.model_name || '')
      navigate(`/model-experience/text?models=${encodedModelName}`)
    }
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <BackTabbar
        label={$t('返回模型广场')}
        backFunc={() => navigate('/model-space')}
      />
      {/* 基础信息区 */}
      <Card>
        <div className="flex flex-row justify-between items-center">
          <div className="flex flex-row items-center gap-6 p-4">
            <div className="w-20 h-20">
              {detail && <ModelLogo name={detail.model_name} logo={detail.logo} size="large" />}
            </div>
            <div className="text-gray-500 text-sm min-h-[40px] overflow-hidden">
              <p className="mb-2">
                {$t('名称')}
                ：
                {detail?.model_name || $t('模型详情')}
              </p>
              <p className="mb-2">
                {$t('类型')}
                ：
                {detail?.category && detail.category
                  .split(',')
                  .map(
                    (m: string) =>
                      modelTypeOptions.find((t) => t.value === m)?.label || m,
                  )
                  .map((t: string) => <Tag>{t}</Tag>)}
              </p>
              {/* <p>
                {$t('安全审核策略')}
                ：
                <Tag>
                  {securityPolicyOptions.find(
                    (t) => t.value === detail?.security_policy,
                  )?.label ?? '--'}
                </Tag>
              </p>
              <p>
                {$t('价格')}
                ：
                <span className="mr-4">
                  {$t('输入价格')}
                  ：
                  {detail?.input_token_price ?? '--'}
                  {' '}
                  ￥/1k tokens
                </span>
                <span>
                  {$t('输出价格')}
                  ：
                  {detail?.output_token_price ?? '--'}
                  {' '}
                  ￥/1k tokens
                </span>
              </p> */}
              {!isSanYuan && (
                <p className="mb-2">
                  {$t('模型权限')}
                  ：
                  <Tag>
                    {modelPermissionOptions.find(
                      (t) => t.value === detail?.can_use,
                    )?.label ?? '--'}
                  </Tag>
                </p>
              )}
              <p
                title={detail?.description || ''}
                className="break-words line-clamp-4"
              >
                {$t('描述')}
                ：
                {detail?.description || $t('暂无描述')}
              </p>
              {(securityLevelEnabled && isSanYuan) && (
                <p
                  title={detail?.description || ''}
                  className="break-words line-clamp-4"
                >
                  {$t('模型密级')}
                  ：
                  {detail?.data_level || '--'}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-row items-center gap-6 p-4">
            {detail?.category !== 'Embeddings' && (
              <Button type="primary" onClick={handleExperience} icon={<RocketOutlined />}>
                {$t('立即体验')}
              </Button>
            )}
            <a
              href={withBasePath('/access-key')}
              target="_blank"
            >
              <Button icon={<PlusOutlined />}>
                {$t('创建密钥')}
              </Button>
            </a>
          </div>
        </div>
      </Card>
      {/* 模型实例列表 */}
      <Card className="mt-4 flex-1">
        <SectionTitle title={$t('内容安全审核策略')} />
        <Row gutter={48}>
          <Col span={12}>
            <InfoRow
              label={$t('输入审核策略')}
              value={securityPolicyOptions.find((t) => t.value === detail?.security_policy)?.label ?? '--'}
            />
          </Col>
          <Col span={12}>
            <InfoRow
              label={$t('输出审核策略')}
              value={securityPolicyOptions.find((t) => t.value === detail?.security_policy_out)?.label ?? '--'}
            />
          </Col>
        </Row>

        <div className="mt-12">
          <SectionTitle title={$t('模型价格')} />
          {
            detail?.category !== 'Realtime' ? (
              <Row gutter={48}>
                <Col span={12}>
                  <InfoRow
                    label={$t('输入价格')}
                    value={(
                      <span>
                        {detail?.input_token_price ?? '--'}
                        {' '}
                        ￥/1k tokens
                      </span>
                    )}
                  />
                </Col>
                <Col span={12}>
                  <InfoRow
                    label={$t('输出价格')}
                    value={(
                      <span>
                        {detail?.output_token_price ?? '--'}
                        {' '}
                        ￥/1k tokens
                      </span>
                    )}
                  />
                </Col>
              </Row>
            ) : (
              <InfoRow
                label={$t('价格')}
                value={(
                  <span>
                    {detail?.second_price ?? '--'}
                    {' '}
                    ￥/秒
                  </span>
                )}
              />
            )
          }
        </div>

        <div className="mt-12">
          <SectionTitle title={$t('模型属性')} />
          {detail?.custom_attribute_values && detail.custom_attribute_values.length > 0 ? (
            <Row gutter={48}>
              {detail.custom_attribute_values.map((item) => {
                return (
                  <Col
                    span={12}
                    key={item.attribute_id}
                    className="!mb-4"
                  >
                    <InfoRow
                      label={item.attribute_name}
                      value={item.value.split(',').map((o) => <Tag key={o}>{o}</Tag>)}
                    />
                  </Col>
                )
              })}
            </Row>
          ) : (
            <div className="empty text-gray-400 text-sm min-h-[34px] flex items-center pl-2">
              暂未设置模型属性
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
