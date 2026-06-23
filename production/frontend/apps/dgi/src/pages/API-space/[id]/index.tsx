import { useNavigate, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Button, Card, Col, Row, Spin, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useRequest } from 'ahooks'
import ApiDocPanel from './components/ApiDocPanel'
import type { ApiServiceParamNode } from '@/services/apiService'
import { apiService } from '@/services/apiService'
import { useTransform } from '@/locales'
import { ModelLogo } from '@/components/model-card/ModelLogo'
import { withBasePath } from '@/utils'
import BackTabbar from '@/components/BackTabbar'

const SectionTitle = ({ title }: { title: string }) => (
  <div className="flex items-center gap-2 mb-4">
    <span className="w-1 h-4 bg-blue-500 rounded" />
    <span className="font-bold">{title}</span>
  </div>
)

const InfoRow = ({ label, value }: { label: string, value: ReactNode }) => (
  <div className="flex justify-between items-center border-b border-gray-300 py-3">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium">{value}</span>
  </div>
)

interface ApiDetail {
  id: number
  name: string
  description?: string
  logo?: string
  price?: number
  url?: string
  method?: string
  request_type?: string
  header?: Array<{ name: string, value?: string }>
  request_param?: ApiServiceParamNode[]
  response_param?: ApiServiceParamNode[]
  can_use?: 'usable' | 'viewable' | string
  view?: 'usable' | 'viewable' | string
  permission_status?: string | number
  custom_attribute_values?: Array<{
    attribute_id: number
    attribute_name: string
    value: string
  }>
}

export default function ApiSpaceDetailPage() {
  const navigate = useNavigate()
  const { $t } = useTransform()
  const params = useParams()
  const apiId = params.id

  const {
    data: detail,
    loading,
  } = useRequest(
    () => {
      if (!apiId) return Promise.resolve(undefined)
      return apiService.getApiDetail(apiId).then((res) => res as ApiDetail)
    },
    { refreshDeps: [apiId], staleTime: 0 },
  )

  const getPermissionLabel = (it?: ApiDetail) => {
    const v = it?.can_use ?? it?.view ?? it?.permission_status
    if (v === 'usable') return $t('使用权限' as any)
    if (v === 'viewable') return $t('查看权限' as any)
    return undefined
  }

  return (
    <div className="flex flex-col gap-6 h-full">
      <BackTabbar
        label={$t('返回')}
        backFunc={() => navigate('/api-space')}
      />

      <Spin spinning={loading}>
        <Card>
          <div className="flex flex-row justify-between items-center">
            <div className="flex flex-row items-center gap-6 p-4">
              <div className="w-20 h-20">
                {detail && <ModelLogo name={detail.name} logo={detail.logo} size="large" />}
              </div>
              <div className="text-gray-500 text-sm min-h-[40px] overflow-hidden">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base font-medium text-gray-900">{detail?.name || $t('API详情' as any)}</span>
                  {getPermissionLabel(detail) && (
                    <Tag>{getPermissionLabel(detail)}</Tag>
                  )}
                </div>
                <p
                  title={detail?.description || ''}
                  className="wrap-break-word line-clamp-4 m-0"
                >
                  {detail?.description || $t('暂无描述')}
                </p>
              </div>
            </div>

            <div className="flex flex-row items-center gap-6 p-4">
              <a
                href={withBasePath('/access-key')}
                target="_blank"
                rel="noreferrer"
              >
                <Button icon={<PlusOutlined />}>
                  {$t('创建密钥')}
                </Button>
              </a>
            </div>
          </div>
        </Card>

        <Card className="mt-4! flex-1">
          <SectionTitle title={$t('API价格' as any)} />
          <Row gutter={48}>
            <Col span={12}>
              <InfoRow
                label={$t('调用价格' as any)}
                value={(
                  <span>
                    {detail?.price ?? '--'}
                    {' '}
                    ￥/万次
                  </span>
                )}
              />
            </Col>
          </Row>

          <div className="mt-6">
            <SectionTitle title={$t('标签')} />
            {detail?.custom_attribute_values && detail.custom_attribute_values.length > 0 ? (
              <Row gutter={48}>
                {detail.custom_attribute_values.map((item) => (
                  <Col
                    span={12}
                    key={item.attribute_id}
                    className="mb-4!"
                  >
                    <InfoRow
                      label={item.attribute_name}
                      value={item.value.split(',').map((o) => <Tag key={`${item.attribute_id}-${o}`}>{o}</Tag>)}
                    />
                  </Col>
                ))}
              </Row>
            ) : (
              <div className="empty text-gray-400 text-sm min-h-[34px] flex items-center pl-2">
                {$t('暂无标签' as any)}
              </div>
            )}
          </div>

          <div className="mt-6">
            <SectionTitle title={$t('接口文档')} />
            <ApiDocPanel apiId={apiId} />
          </div>
        </Card>
      </Spin>
    </div>
  )
}
