import { useCallback, useMemo, useState } from 'react'
import { Breadcrumb, Button, Form, Input, Spin, Typography, message } from 'antd'
import { useRequest } from 'ahooks'
import { useNavigate, useParams } from 'react-router-dom'
import type { CreateApiServiceReq } from '../../services/apiService'
import { apiService } from '../../services/apiService'
import BaseForm from '@/components/apiService/BaseForm'
import ApiConfigForm from '@/components/apiService/ApiConfigForm'
import type { ParamListType, ParamType } from '@/components/apiService/ApiParamsView'
import ApiParamsView from '@/components/apiService/ApiParamsView'
import MultiApiTestResultPanel, { type ApiTestResultByIndex } from '@/components/apiService/MultiApiTestResultPanel'

const { Title } = Typography

function createDefaultParams(count = 3): ParamListType[] {
  return Array.from({ length: count }, () => ({
    name: '',
    data_type: 'string',
    default_value: '',
    binding: false,
    desc: '',
    inference: false,
    child: [],
  }))
}

interface CreateApiRequest {
  name: string
  description?: string
  /** 多地址；详情可能仍返回单字段 url */
  urls?: string[]
  url?: string
  header?: Array<{ name: string, value?: string, default_value?: string, desc?: string }>
  request_param?: any[]
  response_param?: any[]
  request_type?: 'POST' | 'GET' | 'PUT' | 'DELETE' | 'PATCH'
  protocol?: string
  category?: string
  price?: number
  logo?: string
  status?: number
}

interface ApiDetailResponse extends CreateApiRequest {
  id: number
}

/**
 * 将参数树转换为对象（用于测试透传请求体）
 */
function paramsToObject(params: any[] = []): Record<string, any> {
  const hasNodeName = (item: any) => item?.name && item.name.trim() !== ''

  const shouldKeepNode = (item: any, parentType?: string) =>
    parentType === 'array' || hasNodeName(item)

  const resolveLeafValue = (type: string, value: any) => {
    if (value !== '' && value !== null && value !== undefined) {
      switch (type) {
        case 'array':
          return Array.isArray(value) ? value : []
        case 'number': {
          const num = Number(value)
          return Number.isNaN(num) ? 0 : num
        }
        case 'boolean':
          if (typeof value === 'boolean') return value
          return value === 'true' || value === '1'
        case 'object':
          return typeof value === 'object' ? value : {}
        default:
          return value
      }
    }

    switch (type) {
      case 'string':
        return ''
      case 'number':
        return 0
      case 'boolean':
        return false
      case 'object':
        return {}
      case 'array':
        return []
      default:
        return null
    }
  }

  const buildNodeValue = (item: any): any => {
    const validChildren = Array.isArray(item?.child)
      ? item.child.filter((child: any) => shouldKeepNode(child, item.data_type))
      : []

    if (validChildren.length === 0) {
      return resolveLeafValue(item?.data_type, item?.default_value)
    }

    if (item?.data_type === 'array') {
      return validChildren.map((child: any) => buildNodeValue(child))
    }

    return validChildren.reduce((acc: Record<string, any>, child: any) => {
      if (!hasNodeName(child)) return acc
      acc[child.name] = buildNodeValue(child)
      return acc
    }, {})
  }

  const walk = (items: any[]): Record<string, any> => {
    return items.reduce((acc: Record<string, any>, item: any) => {
      if (!hasNodeName(item)) return acc
      acc[item.name] = buildNodeValue(item)
      return acc
    }, {})
  }

  return walk(params)
}

function normalizeUrlsForForm(detail: { urls?: string[], url?: string }): string[] {
  const trimmed = (detail.urls || [])
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter(Boolean)
  if (trimmed.length) return trimmed
  const single = typeof detail.url === 'string' ? detail.url.trim() : ''
  return single ? [single] : ['']
}

export default function CreateApiService({
  action,
}: {
  action?: 'create' | 'edit' | 'test'
}) {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const [form] = Form.useForm()
  const request_type = Form.useWatch('request_type', form)
  const watchedUrls = Form.useWatch('urls', form) as string[] | undefined

  const [isSubmitting, setIsSubmitting] = useState(false)
  const { apiId } = useParams<{ apiId: string }>()

  const [verifyConnectResponse, setVerifyConnectResponse] = useState<ApiTestResultByIndex | undefined>(undefined)
  const [isTesting, setIsTesting] = useState(false)

  const { data: apiDetail, loading: apiDetailLoading } = useRequest(
    () => {
      if (!apiId) return Promise.resolve(null)
      return apiService.getApiDetail(apiId).then((res: ApiDetailResponse) => {
        form.setFieldsValue({
          ...res,
          urls: normalizeUrlsForForm(res),
        })
        return res
      })
    },
    { ready: !!apiId, refreshDeps: [apiId, projectId], staleTime: 0 },
  )

  // DGI 侧不使用 jsonpath/bindingFields，测试直接透传请求体并展示原始响应

  type ApiHeaderItem = {
    name?: string
    value?: string
    binding?: boolean
    desc?: string
    inference?: boolean
  }

  const headerInitialValue = useMemo<ParamListType[] | undefined>(() => {
    if (action === 'create') return createDefaultParams(3)
    const headers = apiDetail?.header as unknown as ApiHeaderItem[] | undefined
    return headers?.map((item) => ({
      name: item?.name ?? '',
      data_type: 'string',
      default_value: item?.value ?? '',
      binding: item?.binding ?? false,
      desc: item?.desc ?? '',
      inference: item?.inference ?? false,
      child: [],
    }))
  }, [action, apiDetail?.header])

  const requestInitialValue = useMemo<ParamListType[] | undefined>(() => {
    if (action === 'create') return createDefaultParams(3)
    return apiDetail?.request_param as unknown as ParamListType[] | undefined
  }, [action, apiDetail?.request_param])

  const responseInitialValue = useMemo<ParamListType[] | undefined>(() => {
    if (action === 'create') return createDefaultParams(3)
    return apiDetail?.response_param as unknown as ParamListType[] | undefined
  }, [action, apiDetail?.response_param])

  const paramsTitle = useMemo(() => {
    const type = action === 'test' ? apiDetail?.request_type : request_type
    switch (type) {
      case 'GET':
        return 'params'
      case 'POST':
        return 'body'
      default:
        return 'request_param'
    }
  }, [action, request_type, apiDetail?.request_type])

  const requestTypeOptions = [
    // { label: 'GET', value: 'GET' },
    { label: 'POST', value: 'POST' },
    // { label: 'PUT', value: 'PUT' },
    // { label: 'DELETE', value: 'DELETE' },
  ]

  const protocolOptions = [
    { label: 'application/json', value: 'application/json' },
    // { label: 'application/x-www-form-urlencoded', value: 'application/x-www-form-urlencoded' },
    // { label: 'application/xml', value: 'application/xml' },
  ]

  // 面包屑数据
  const breadcrumbItems = [
    {
      title: 'API服务',
      onClick: () => navigate(`/api-service`),
    },
    {
      title: action === 'create' ? '添加API' : action === 'edit' ? '编辑API' : '测试API',
    },
  ]

  const handleSubmit = async (values: CreateApiRequest) => {
    // 修改响应参数字段,"binding" 和 "inference" 同步
    values.response_param = values.response_param?.map((item) => {
      return {
        ...item,
        binding: item.inference,
      }
    })

    // 修改请求头字段
    values.header = values.header?.map((item) => {
      const newItem = {
        ...item,
        value: item.default_value || '',
      }
      delete newItem.default_value
      return newItem
    })

    // 构建请求参数
    const params = {
      ...values,
      ...(apiId ? { id: Number(apiId) } : {}),
    }

    const urls = (values.urls || [])
      .map((u: string) => (typeof u === 'string' ? u.trim() : ''))
      .filter(Boolean)
    if ((action === 'create' || action === 'edit') && !urls.length) {
      message.error('至少填写一个 API 地址')
      return
    }

    const payload: CreateApiServiceReq = {
      method: (values.request_type ?? 'POST') as CreateApiServiceReq['method'],
      name: values.name,
      urls,
      category: values.category,
      description: values.description,
      protocol: values.protocol,
      price: values.price,
      logo: values.logo,
      header: values.header?.map((h) => ({
        name: h.name,
        value: h.value ?? '',
        desc: h.desc ?? '',
      })) ?? [],
      request_param: values.request_param,
      response_param: values.response_param,
      status: values.status,
    }

    try {
      setIsSubmitting(true)
      switch (action) {
        case 'create':
          await apiService.createApi(payload)
          message.success('API创建成功')
          break
        case 'edit':
          await apiService.updateApi(Number(apiId), payload)
          message.success('API更新成功')
          break
        case 'test':
          await apiTest(Number(apiId), params)
          setIsSubmitting(false)
          return
      }
      setIsSubmitting(false)
      navigate(-1)
    }
    catch {
      setIsSubmitting(false)
    }
  }

  // api测试：按 urls 顺序依次请求，query 带 url_index
  const apiTest = async (_projectId, values) => {
    const body = paramsToObject(values.request_param ?? [])

    setIsTesting(true)
    const acc: ApiTestResultByIndex = {}

    try {
      for (let index = 0; index < watchedUrls.length; index++) {
        const url = watchedUrls[index]
        const res = await apiService.testApiForward(
          Number(apiId),
          Object.assign(body, {
            _test_headers: values.header?.map((h) => ({ [h.name]: (h as any).value ?? (h as any).default_value ?? '' })),
          }),
          index,
        )
        acc[index] = { url, result: res }
        setVerifyConnectResponse((prev) => ({ ...prev, ...acc }))
      }
      message.success('API测试完成')
    }
    catch (error) {
      console.error(error)
      setVerifyConnectResponse(Object.keys(acc).length ? { ...acc } : undefined)
      message.error('API测试失败')
      throw error
    }
    finally {
      setIsTesting(false)
    }
  }

  const handleParamsChange = useCallback((params: ParamListType[], type: ParamType) => {
    form.setFieldsValue({
      [type]: params,
    })
  }, [form])

  // 隐藏的 Form.Item 用于存储 header 数据
  const hideFormView = () => {
    return (
      <>
        {/* 隐藏的 Form.Item 用于存储 header 数据 */}
        <Form.Item name="header" hidden>
          <input />
        </Form.Item>
        <Form.Item name="request_param" hidden>
          <input />
        </Form.Item>
        <Form.Item name="response_param" hidden>
          <input />
        </Form.Item>
      </>
    )
  }

  const responseParamView = () => {
    return (
      <ApiParamsView
        type="response_param"
        title="响应参数"
        initialValue={responseInitialValue}
        canPushChild
        onChange={handleParamsChange}
        action={action}
      />
    )
  }
  const requestParamView = () => {
    return (
      <ApiParamsView
        type="request_param"
        title={paramsTitle}
        initialValue={requestInitialValue}
        canPushChild
        action={action}
        onChange={handleParamsChange}
      />
    )
  }
  const headerParamView = () => {
    return (
      <ApiParamsView
        type="header"
        initialValue={headerInitialValue}
        dataType={['string', 'number', 'boolean']}
        action={action}
        onChange={handleParamsChange}
      />
    )
  }

  return (
    <div className="bg-white min-h-full rounded-lg p-6">
      {/* 面包屑导航 */}
      <Breadcrumb
        items={breadcrumbItems.map((item, index) => {
          if (index < breadcrumbItems.length - 1) {
            return {
              title: (
                <a onClick={item.onClick}>{item.title}</a>
              ),
            }
          }
          return {
            title: item.title,
          }
        })}
        className="mb-6"
      />

      {apiDetailLoading
        ? <Spin spinning={apiDetailLoading} tip="加载中..."></Spin>
        : (
            <Form
              form={form}
              layout="vertical"
              className="mt-4! pb-8!"
              onFinish={handleSubmit}
              initialValues={{ urls: [''] }}
            >
              {/* 基本信息 */}
              <BaseForm canEdit={action !== 'test'} />

              {/* API服务配置 */}
              {action !== 'test' && (
                <ApiConfigForm
                  requestTypeOptions={requestTypeOptions}
                  protocolOptions={protocolOptions}
                />
              )}

              {action === 'test' && (
                <>
                  <Title level={5} className="mt-2 mb-2">API 地址</Title>
                  <Form.List name="urls">
                    {(fields) => (
                      <div className="flex w-full max-w-[640px] flex-col gap-2">
                        {fields.map((field, index) => (
                          <Form.Item key={field.key} label={`API${index + 1}`} name={field.name} className="!mb-0">
                            <Input readOnly placeholder={`回显API${index + 1}的地址`} className="bg-[#fafafa]" />
                          </Form.Item>
                        ))}
                      </div>
                    )}
                  </Form.List>
                </>
              )}

              {/* 请求参数 */}
              <Title level={4} className="mb-4 mt-6">请求参数</Title>
              {hideFormView()}
              {headerParamView()}
              {requestParamView()}
              {action !== 'test' && (
                <>
                  <Title level={4} className="my-6 mb-4">响应参数</Title>
                  {responseParamView()}
                </>
              )}

              {action === 'test' && (
                <>
                  <Title level={4} className="my-6 mb-4">响应结果</Title>
                  <MultiApiTestResultPanel resultsByIndex={verifyConnectResponse} loading={isTesting} />
                </>
              )}

              {/* 操作按钮：视口右下角固定 */}
              <div className="fixed bottom-8 right-16 z-100 flex gap-2">
                <Button type="default" onClick={() => navigate(-1)}>
                  取消
                </Button>
                <Button type="primary" htmlType="submit" loading={isSubmitting}>
                  {action === 'test' ? '测试' : '确定'}
                </Button>
              </div>
            </Form>
          )}
    </div>
  )
}
