import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Divider, Form, Input, Select, Spin, Typography, message } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ApiAttribute } from '../../utils/createApiServiceUtils.ts'
import {
  buildAttrInstanceIdMap,
  detailAttrValuesToFormPatch,
  findParamByJsonPath,
  getJSONPathParts,
  jsonPathToObject,
  pickApiServicePayload,
  selectOptionStrings,
} from '../../utils/createApiServiceUtils.ts'
import BaseForm from '@/components/apiService/BaseForm'
import ApiConfigForm from '@/components/apiService/ApiConfigForm'
import type { ParamListType, ParamType } from '@/components/apiService/ApiParamsView'
import ApiParamsView from '@/components/apiService/ApiParamsView'
import type { ApiDetailResponse, CreateApiRequest, VerifyConnectResponse } from '@/services/apiService'
import apiService from '@/services/apiService'
import { attributeService } from '@/services/inferenceService'
import type { ApiResponse, Attribute } from '@/types/inference'
import { CodeView } from '@/components/codeView'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

const { Title } = Typography

const API_SERVICE_ATTR_BUSINESS_TYPE = 'api_service'

export default function CreateApiService({
  action,
}: {
  action?: 'create' | 'edit' | 'test'
}) {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const [form] = Form.useForm()
  const request_type = Form.useWatch('request_type', form)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const { apiId } = useParams<{ apiId: string }>()

  const [verifyConnectResponse, setVerifyConnectResponse] = useState<VerifyConnectResponse>()
  const [real_response_param, setReal_response_param] = useState<any>()

  const { data: apiDetail, isLoading: apiDetailLoading } = useQuery({
    queryKey: ['apiDetail', apiId],
    queryFn: () => {
      if (!apiId) {
        return Promise.resolve(null)
      }
      return apiService.getApiDetail(projectId, apiId).then((res: ApiDetailResponse) => {
        const formRest = { ...res }
        delete formRest.attr_values
        form.setFieldsValue(formRest)
        return res
      })
    },
    enabled: !!apiId,
    staleTime: 0,
    gcTime: 0,
  })

  const { data: attributesData, error: attributesError } = useQuery<ApiResponse>({
    queryKey: ['attributes', API_SERVICE_ATTR_BUSINESS_TYPE, projectId],
    queryFn: async () => {
      if (!projectId) {
        throw new Error('项目ID不存在')
      }
      return await attributeService.list({ page: 1, size: 100, business_type: API_SERVICE_ATTR_BUSINESS_TYPE })
    },
    enabled: !!projectId && action !== 'test',
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  const attributes = useMemo((): ApiAttribute[] => {
    return Array.isArray(attributesData?.items)
      ? (attributesData.items as unknown as ApiAttribute[])
      : []
  }, [attributesData?.items])

  /** 创建：展示业务下全部属性；编辑：只展示详情接口 attr_values 中已存在的属性 */
  const attributesForForm = useMemo(() => {
    if (action !== 'edit') {
      return attributes
    }
    const detailAttrIds = new Set(
      (apiDetail?.attr_values ?? [])
        .map((av) => Number(av.attr_id))
        .filter((n) => Number.isFinite(n)),
    )
    return attributes.filter((attr) => detailAttrIds.has(Number(attr.id)))
  }, [action, attributes, apiDetail?.attr_values])

  const attrByIdMap = useMemo(
    () => new Map(attributes.map((item) => [Number(item.id), item])),
    [attributes],
  )

  const manualAttrsForForm = useMemo(
    () => attributesForForm.filter((a) => a.input_type === '手动输入'),
    [attributesForForm],
  )

  const dropdownAttrsForForm = useMemo(
    () => attributesForForm.filter((a) => a.input_type === '下拉选择'),
    [attributesForForm],
  )

  const showAttributeSection = useMemo(() => {
    if (action === 'test' || attributes.length === 0) {
      return false
    }
    if (action === 'create') {
      return true
    }
    return (apiDetail?.attr_values?.length ?? 0) > 0
  }, [action, attributes.length, apiDetail?.attr_values])

  useEffect(() => {
    if (attributesError) {
      message.error('获取属性列表失败')
    }
  }, [attributesError])

  useEffect(() => {
    if (action === 'test' || !apiDetail?.attr_values?.length || !attributes.length) {
      return
    }
    const patch = detailAttrValuesToFormPatch(apiDetail.attr_values, attrByIdMap)
    if (Object.keys(patch).length > 0) {
      form.setFieldsValue(patch)
    }
  }, [action, apiDetail?.attr_values, attrByIdMap, attributes.length, form])

  const buildAttrValuesFromForm = useCallback((formValues: Record<string, any>): Attribute[] => {
    const idMap = buildAttrInstanceIdMap(apiDetail?.attr_values)
    const out: Attribute[] = []
    for (const attr of attributesForForm) {
      const instanceId = idMap.get(Number(attr.id))
      const idOpt = instanceId !== undefined ? { id: instanceId } : {}
      if (attr.input_type === '手动输入') {
        const inputValue = formValues[`manualInput_${attr.id}`]
        if (inputValue === undefined || inputValue === null || inputValue === '') {
          continue
        }
        out.push({
          ...idOpt,
          business_type: API_SERVICE_ATTR_BUSINESS_TYPE,
          attr_id: attr.id,
          attr_value: inputValue,
          data_type: attr.data_type,
          required_tag: attr.required_tag,
          name: attr.name,
          input_type: attr.input_type,
          options: [],
        })
      }
      else if (attr.input_type === '下拉选择') {
        const selectedValue = formValues[`dropdown_${attr.id}`]
        if (selectedValue === undefined || selectedValue === null || selectedValue === '') {
          continue
        }
        const selectedValuesArray = Array.isArray(selectedValue) ? selectedValue : [selectedValue]
        const options = selectedValuesArray.map((value: string) => ({ option_value: value }))
        out.push({
          ...idOpt,
          business_type: API_SERVICE_ATTR_BUSINESS_TYPE,
          attr_id: attr.id,
          data_type: attr.data_type,
          required_tag: attr.required_tag,
          name: attr.name,
          input_type: attr.input_type,
          multi_select: attr.multi_select ?? 0,
          options,
        })
      }
    }
    return out
  }, [attributesForForm, apiDetail?.attr_values])

  const initTestData = (paramsType: 'request' | 'response') => {
    const binding = paramsType === 'request' ? bindingFields?.request_binding : bindingFields?.response_binding
    const detail = paramsType === 'request' ? apiDetail?.request_param : apiDetail?.response_param
    if (!binding || !detail) {
      return []
    }
    return binding.map((item) => {
      const foundParam = findParamByJsonPath(detail, item.jsonpath)

      if (foundParam) {
        return {
          name: item.name,
          desc: item.desc,
          data_type: foundParam.data_type,
          default_value: paramsType === 'request' ? foundParam.default_value : '',
          binding: foundParam.binding,
          inference: foundParam.inference,
          child: foundParam.child,
        }
      }

      return {
        name: item.name,
        desc: item.desc,
        data_type: 'string',
        default_value: '',
        child: [],
        binding: false,
        inference: false,
      }
    })
  }
  const { data: bindingFields, isLoading: bindingFieldsLoading } = useQuery({
    queryKey: ['bindingFields', apiId],
    queryFn: () => {
      return apiService.getApiBindingFields(projectId, apiId)
    },
    enabled: !!apiId,
    staleTime: 0,
    gcTime: 0,
  })
  const testRequest_binding = useMemo(() => {
    if (!bindingFields?.request_binding || !apiDetail?.request_param) {
      return []
    }

    return initTestData('request')
  }, [bindingFields?.request_binding, apiDetail?.request_param])
  const testResponse_binding = useMemo(() => {
    if (!apiDetail?.response_param || !bindingFields?.response_binding) {
      return []
    }
    if (!verifyConnectResponse?.original_data) {
      return initTestData('response')
    }

    return bindingFields.response_binding.map((item) => {
      const responseConstraint = findParamByJsonPath(apiDetail?.response_param, item.jsonpath)
      const pathParts = getJSONPathParts(item.jsonpath)

      let foundParam = verifyConnectResponse?.original_data

      try {
        pathParts.forEach((part) => {
          if (!foundParam) return

          if (Array.isArray(foundParam)) {
            foundParam = foundParam[0]
          }

          if (foundParam && typeof foundParam === 'object') {
            foundParam = foundParam[part]
          }
          else {
            foundParam = undefined
          }
        })

        if (responseConstraint?.child?.length > 0 && foundParam && typeof foundParam === 'object') {
          responseConstraint.child.forEach((child) => {
            child.default_value = foundParam[child.name] || ''
          })
        }
      }
      catch (error) {
        console.error('Error processing binding:', item.jsonpath, error)
        foundParam = undefined
      }

      return {
        name: item.name,
        data_type: responseConstraint?.data_type,
        default_value: foundParam || '',
        binding: responseConstraint?.binding,
        inference: responseConstraint?.inference,
        child: responseConstraint?.child || [],
        desc: responseConstraint?.desc,
      }
    })
  }, [verifyConnectResponse, bindingFields?.response_binding, apiDetail?.response_param])

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
  }, [request_type, apiDetail?.request_type])

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

    if (action !== 'test') {
      values.attr_values = buildAttrValuesFromForm(values as unknown as Record<string, any>)
    }

    const params = {
      ...pickApiServicePayload(values as unknown as Record<string, any>),
      ...(apiId ? { id: Number(apiId) } : {}),
    }

    try {
      setIsSubmitting(true)
      switch (action) {
        case 'create':
          await apiService.createApi(projectId, params)
          message.success('API创建成功')
          break
        case 'edit':
          await apiService.updateApi(projectId, params)
          message.success('API更新成功')
          break
        case 'test':
          await apiTest(projectId, params)
          setIsSubmitting(false)
          return
      }
      setIsSubmitting(false)
      navigate(-1)
    }
    catch (e) {
      setIsSubmitting(false)
    }
  }

  // api测试
  const apiTest = async (projectId, values) => {
    const verify_request_param = {}
    values.request_param.forEach((item, index) => {
      verify_request_param[bindingFields.request_binding[index].jsonpath] = item.default_value || ''
    })
    const data = {
      id: Number(apiId),
      verify_request_param,
    }

    setReal_response_param(jsonPathToObject(verify_request_param))

    const res = await apiService.verifyConnect(projectId, data)
    setVerifyConnectResponse(res)
    if (res.state === 200) {
      message.success('API测试成功')
    }
    else {
      message.error('API测试失败')
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
        initialValue={action === 'test' ? testResponse_binding : apiDetail?.response_param}
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
        initialValue={action === 'test' ? testRequest_binding : apiDetail?.request_param}
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
        initialValue={apiDetail?.header?.map((item) => ({
          name: item?.name,
          data_type: 'string',
          default_value: item?.value,
          binding: item?.binding || false,
          desc: item?.desc || '',
          inference: item?.inference || false,
          child: [],
        }))}
        dataType={['string', 'number', 'boolean']}
        action={action}
        onChange={handleParamsChange}
      />
    )
  }

  return (
    <div className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title={action === 'edit' ? '编辑 API 服务' : action === 'test' ? '测试 API 服务' : '创建 API 服务'}
          onBack={() => navigate(-1)}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={() => navigate(-1)}>
                {action === 'test' ? '返回' : '取消'}
              </Button>
              <Button className="create-form-submit" type="primary" onClick={() => form.submit()} loading={isSubmitting}>
                {action === 'test' ? '测试' : '提交'}
              </Button>
            </>
          )}
        />
        <div className="create-form-divider" />
        <div className="create-form-body">
          {apiDetailLoading ? <Spin spinning={apiDetailLoading} tip="加载中..."></Spin>
            : (
                <Form
                  form={form}
                  layout="vertical"
                  className="!mt-4"
                  onFinish={handleSubmit}
                >
                  {/* 基本信息 */}
                  <BaseForm canEdit={action !== 'test'} />

                  {/* 属性配置（与模型服务创建页一致，业务类型为 api_service） */}
                  {showAttributeSection && (
                    <>
                      <Divider />
                      <div className="mb-8">
                        {manualAttrsForForm.map((attr) => (
                          <Form.Item
                            key={attr.id}
                            name={`manualInput_${attr.id}`}
                            label={(
                              <span>
                                {attr.name}
                              </span>
                            )}
                            rules={[
                              ...(attr.required_tag === 1
                                ? [{ required: true, message: `请输入${attr.name}` }]
                                : []),
                              { max: 64, message: '输入值不能超过64个字符' },
                            ]}
                          >
                            <Input
                              placeholder="请输入属性值"
                              maxLength={64}
                              showCount
                            />
                          </Form.Item>
                        ))}

                        {dropdownAttrsForForm.map((attr) => {
                          const selectOptions = selectOptionStrings(attr)
                          const isMultiple = attr.multi_select === 1

                          return (
                            <Form.Item
                              key={attr.id}
                              name={`dropdown_${attr.id}`}
                              label={(
                                <span>
                                  {attr.name}
                                </span>
                              )}
                              rules={[
                                ...(attr.required_tag === 1
                                  ? [{ required: true, message: '请选择必选属性值' }]
                                  : []),
                              ]}
                            >
                              <Select
                                mode={isMultiple ? 'multiple' : undefined}
                                placeholder="请选择属性值"
                                allowClear
                                showSearch
                                filterOption={(input, option) => {
                                  const value = option?.value as string
                                  return value ? value.toLowerCase().includes(input.toLowerCase()) : false
                                }}
                                options={selectOptions.map((optionValue: string) => ({
                                  label: optionValue,
                                  value: optionValue,
                                }))}
                              />
                            </Form.Item>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {/* API服务配置 */}
                  {action !== 'test' && (
                    <ApiConfigForm
                      requestTypeOptions={requestTypeOptions}
                      protocolOptions={protocolOptions}
                    />
                  )}

                  {action === 'test' && (
                    <Form.Item
                      name="base_url"
                      label="API地址"
                    >
                      <Input placeholder="请输入API地址" readOnly />
                    </Form.Item>
                  )}

                  {/* 请求参数 */}
                  <Title level={4} className="mb-4">请求参数</Title>
                  {hideFormView()}
                  {action !== 'test' && headerParamView()}
                  {requestParamView()}
                  {action !== 'test' && responseParamView()}

                  {action === 'test'
                  && (
                    <>
                      <Title level={4} className="mb-4">响应参数</Title>
                      {responseParamView()}
                      {verifyConnectResponse?.original_data && (
                        <>
                          <Title level={4} className="mb-4">实际请求参数</Title>
                          <CodeView text={JSON.stringify(real_response_param, null, 2) || ''} language="json" />

                          <Title level={4} className="my-4">实际响应参数</Title>
                          <CodeView text={JSON.stringify(verifyConnectResponse?.original_data, null, 2) || ''} language="json" />
                        </>
                      )}
                    </>
                  )}

                </Form>
              )}
        </div>
      </section>
    </div>
  )
}
