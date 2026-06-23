import type {
  TableColumnsType,
} from 'antd'
import {
  Button,
  Checkbox,
  ConfigProvider,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Segmented,
  Select,
  Spin,
  Tooltip,
  message,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import zhCN from 'antd/locale/zh_CN'
import 'dayjs/locale/zh-cn'
import { useRequest } from 'ahooks'
import { CircleQuestionMark } from 'lucide-react'
import type { DataType } from './TableTransfer'
import { TableTransfer } from './TableTransfer'
import type {
  AccessKeyForm,
} from '@/services/api'
import {
  apiModelList,
  apiSecretAdd,
  apiSecretDetail,
  apiSecretUpdate,
  apiSystemConfig,
} from '@/services/api'
import { useTransform } from '@/locales'
import { useSystemConfig } from '@/hooks/use-system-config'
import { apiService } from '@/services/apiService'

// 处理拼接的英文类型名称
const formatModelType = (
  category: string,
  typeMap: Record<string, string>,
): string => {
  if (!category || !typeMap || Object.keys(typeMap).length === 0) {
    return category
  }

  if (category.includes(',')) {
    return category
      .split(',')
      .map((type) => typeMap[type.trim()] || type.trim())
      .filter(Boolean)
      .join('、')
  }

  if (category.includes('_')) {
    // 优先使用完整的映射
    if (typeMap[category]) {
      return typeMap[category]
    }
    // 如果没有完整映射，尝试翻译各个部分
    const parts = category.split('_')
    const translated = parts.map((part) => typeMap[part] || part).join('')
    return translated || category
  }

  return typeMap[category] || category
}

interface CreateAccessKeyModalProps {
  open: boolean
  isView?: boolean
  onCancel: () => void
  onSuccess: () => void
  accessId?: number
  mode?: 'create' | 'edit'
  securityLevels: { label: string, value: string }[]
}

export default function CreateAccessKeyModal({
  open,
  onCancel,
  onSuccess,
  accessId,
  isView = false,
  securityLevels,
}: CreateAccessKeyModalProps) {
  const [submitLoading, setSubmitLoading] = useState(false)
  const [isModelOpen, setIsModelOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [transferKey, setTransferKey] = useState(0)
  const isEdit = !!accessId || accessId === 0
  const [modelType, setModelType] = useState<Record<string, string>>({})
  const { $t } = useTransform()
  const { amountSymbol, securityLevelEnabled } = useSystemConfig(true)

  // 设置 dayjs 默认语言为中文
  useEffect(() => {
    dayjs.locale('zh-cn')
  }, [])

  const [form] = Form.useForm<
    AccessKeyForm & {
      models: string[]
      apis: string[]
      expired_time: Dayjs | null
      balance: number
    }
  >()

  const dataLevel = Form.useWatch<string>('data_level', form)
  const [internalModelList, setInternalModelList] = useState<DataType[]>([])
  const [resourceTab, setResourceTab] = useState<'model' | 'api'>('model')
  const [internalApiList, setInternalApiList] = useState<Array<{ id: number, name: string, key: string }>>([])
  const [isApiOpen, setIsApiOpen] = useState(false)
  const [apiTargetKeys, setApiTargetKeys] = useState<string[]>([])
  const [apiTransferKey, setApiTransferKey] = useState(0)

  const hasSelected = (v: any) => (Array.isArray(v) ? v.length > 0 : !!v)
  const eitherOrRequiredRule = (otherField: 'models' | 'apis', messageText: string) =>
    ({ getFieldValue }: any) => ({
      validator: (_: any, value: any) => {
        const otherValue = getFieldValue(otherField)
        if (hasSelected(value) || hasSelected(otherValue)) return Promise.resolve()
        return Promise.reject(new Error(messageText))
      },
    })

  const { run: getApiList, loading: apiLoading } = useRequest(
    () =>
      apiService.getApiList({
        page_number: 1,
        page_size: 9999,
        view: 'usable',
      }).then((res: any) => {
        const items = (res?.items ?? []) as Array<{ id: number, name: string }>
        const list = items.map((it) => ({ id: it.id, name: it.name, key: it.name }))
        setInternalApiList(list)
        return list
      }),
    {
      manual: true,
    },
  )

  const { run: getModelList } = useRequest<
    DataType[],
    any
  >(
    () => {
      const params: any = {
        page_number: 1,
        page_size: 9999,
        view: 'usable',
      }
      if (securityLevelEnabled && dataLevel) {
        params.token_data_level = dataLevel
      }

      return apiModelList(params).then((res) => {
        const uniqueModels = Array.from(
          new Map(
            res.data.items.map((item: any) => [
              item.model_name,
              {
                id: item.id ?? 0,
                logo: item.logo ?? '',
                model_name: item.model_name,
                category: item.category ?? '',
                created_time: item.created_time ?? 0,
                updated_time: item.updated_time ?? 0,
                creator: item.creator ?? '',
                security_policy: item.security_policy ?? '',
                ability_count: item.ability_count ?? 0,
                key: item.model_name,
              } as DataType,
            ]),
          ).values(),
        )
        return uniqueModels as DataType[]
      })
    },
    {
      manual: true,
      onSuccess: (data) => {
        setInternalModelList(data)
      },
    },
  )

  const modelList = useMemo(() => {
    if (securityLevelEnabled && !dataLevel) {
      return []
    }
    return internalModelList
  }, [securityLevelEnabled, dataLevel, internalModelList])

  useEffect(() => {
    if (securityLevelEnabled) {
      if (dataLevel) {
        getModelList()
      }
      else {
        setInternalModelList([])
      }
    }
    else {
      getModelList()
    }
  }, [dataLevel, securityLevelEnabled])

  const { run: getConfig } = useRequest(
    () =>
      apiSystemConfig().then((res) => {
        // 编辑模式下不设置 qpm 和 tpm 的默认值，优先使用编辑数据
        if (!isEdit) {
          form.setFieldValue('qpm', res.data.TOKEN_RATE_LIMIT_QPM || undefined)
          form.setFieldValue('tpm', res.data.TOKEN_RATE_LIMIT_TPM || undefined)
        }
        setModelType(res.data.MODEL_TYPE || {})
      }),
    {
      manual: true,
    },
  )

  const isUnlimited = Form.useWatch('unlimited_quota', form)

  const fillBackForm = async () => {
    if (!accessId) return
    try {
      setLoading(true)
      const res = await apiSecretDetail(accessId)
      const apisArr = res.data.apis ? String(res.data.apis).split(',').filter(Boolean) : []
      form.setFieldsValue({
        name: res.data.name,
        models: res.data.models ? res.data.models.split(',') : [],
        apis: apisArr,
        expired_time: res.data.expired_time
          ? dayjs(res.data.expired_time * 1000)
          : undefined,
        unlimited_quota: res.data.unlimited_quota,
        balance: res.data.balance,
        tpm: res.data.tpm,
        qpm: res.data.qpm,
        subnet: res.data.subnet,
        data_level: res.data.data_level,
      })
      setApiTargetKeys(apisArr)
      if (!res.data.models && res.data.apis) {
        setResourceTab('api')
      }
      else if (res.data.models && !res.data.apis) {
        setResourceTab('model')
      }
      setTargetKeys(res.data.models ? res.data.models.split(',') : [])
    }
    finally {
      setLoading(false)
    }
  }

  // 当编辑数据变化时，更新表单
  useEffect(() => {
    if (accessId && open) {
      fillBackForm()
    }
    else if (!open) {
      form.resetFields()
    }
  }, [accessId, open, form])

  // 处理永久有效按钮点击
  const handleSetPermanent = () => {
    form.setFieldValue('expired_time', dayjs('2099-01-01'))
  }

  // 处理快捷时间按钮
  const handleQuickTime = (value: number, unit: 'day' | 'hour' = 'day') => {
    const date = dayjs().add(value, unit)
    form.setFieldValue('expired_time', date)
  }

  // 处理表单提交
  const handleSubmit = async () => {
    try {
      setSubmitLoading(true)
      const values = await form.validateFields()
      const { apis, ...restValues } = values
      const expiredTime = values.expired_time
        ? Math.floor(values.expired_time.valueOf() / 1000)
        : null

      // 对模型和API输入做非空处理
      let modelsStr = ''
      let apisStr = ''
      if (values.models) {
        modelsStr = values.models.join(',')
      }
      if (apis) {
        apisStr = apis.join(',')
      }

      if (isEdit) {
        await apiSecretUpdate(accessId, {
          ...restValues,
          models: modelsStr,
          expired_time: expiredTime,
          apis: apisStr,
        })
        message.success($t('编辑成功'))
      }
      else {
        await apiSecretAdd({
          ...restValues,
          models: modelsStr,
          expired_time: expiredTime,
          apis: apisStr,
        })
        message.success($t('新增成功'))
      }
      onSuccess()
      onCancel()
    }
    finally {
      setSubmitLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      if (!securityLevelEnabled || (securityLevelEnabled && isEdit)) {
        getModelList()
      }
      getApiList()
      getConfig()
      setTransferKey((prev) => prev + 1) // 重置搜索条件
      setApiTransferKey((prev) => prev + 1)
    }
    else {
      form.resetFields()
      setTargetKeys([])
      setApiTargetKeys([])
    }
  }, [open])

  const columns: TableColumnsType<DataType> = [
    {
      dataIndex: 'model_name',
      title: $t('模型名称'),
    },
    {
      dataIndex: 'category',
      title: $t('模型类型'),
      render: (_, record) => {
        return <div>{formatModelType(record.category, modelType)}</div>
      },
    },
  ]

  const filterOption = (input: string, item: DataType) =>
    item.model_name?.includes(input) || item.category?.includes(input)

  const [targetKeys, setTargetKeys] = useState<any>([])
  const onChange: any['onChange'] = (nextTargetKeys: any) => {
    setTargetKeys(nextTargetKeys)
    form.setFieldValue('models', nextTargetKeys)
  }

  const onApiChange: any['onChange'] = (nextTargetKeys: string[]) => {
    setApiTargetKeys(nextTargetKeys)
    form.setFieldValue('apis', nextTargetKeys)
  }

  const ModelTransferModal = useMemo(() => {
    return (
      <Modal
        title={$t('选择模型')}
        open={isModelOpen}
        onCancel={() => setIsModelOpen(false)}
        width={1040}
        styles={{
          body: {
            height: 'calc(100vh - 320px)',
            overflowY: 'auto',
          },
        }}
        footer={[]}
      >
        <TableTransfer
          key={transferKey}
          dataSource={modelList}
          targetKeys={targetKeys}
          showSearch
          showSelectAll={false}
          disabled={isView}
          onChange={onChange}
          filterOption={filterOption}
          leftColumns={columns}
          rightColumns={columns}
        />
      </Modal>
    )
  }, [isModelOpen, onChange, transferKey])

  const apiColumns: TableColumnsType<any> = [
    {
      dataIndex: 'name',
      title: $t('API名称'),
    },
  ]

  const ApiTransferModal = useMemo(() => {
    return (
      <Modal
        title={$t('选择API')}
        open={isApiOpen}
        onCancel={() => setIsApiOpen(false)}
        width={1040}
        styles={{
          body: {
            height: 'calc(100vh - 320px)',
            overflowY: 'auto',
          },
        }}
        footer={[]}
      >
        <TableTransfer
          key={apiTransferKey}
          dataSource={internalApiList as any}
          targetKeys={apiTargetKeys}
          showSearch
          showSelectAll={false}
          disabled={isView}
          onChange={onApiChange}
          filterOption={(input: string, item: any) => item.name?.includes(input)}
          leftColumns={apiColumns as any}
          rightColumns={apiColumns as any}
          titles={[$t('待添加API'), $t('已添加API')]}
          locale={{
            itemUnit: $t('API'),
            itemsUnit: $t('API'),
            searchPlaceholder: $t('请输入API名称'),
          }}
        />
      </Modal>
    )
  }, [apiTargetKeys, apiTransferKey, internalApiList, isApiOpen, isView, onApiChange])

  const handleFormChange = (changedValues: any) => {
    if ('models' in changedValues) {
      setTargetKeys(changedValues.models)
    }
    if ('apis' in changedValues) {
      setApiTargetKeys(changedValues.apis)
    }
  }

  return (
    <>
      <ConfigProvider locale={zhCN}>
        <Modal
          title={
            isView ? $t('查看密钥') : isEdit ? $t('编辑密钥') : $t('新增密钥')
          }
          open={open}
          onCancel={onCancel}
          width={660}
          footer={[
            <Button key="cancel" onClick={onCancel}>
              {$t('取消')}
            </Button>,
            <Button
              key="submit"
              type="primary"
              disabled={isView}
              loading={submitLoading}
              onClick={handleSubmit}
              className="bg-[#1677ff]"
            >
              {$t('确定')}
            </Button>,
          ]}
        >
          <Spin spinning={loading}>
            <Form
              form={form}
              layout="vertical"
              className="mt-4"
              disabled={isView}
              initialValues={{
                modelType: ['gpt1'],
              }}
              onValuesChange={handleFormChange}
            >
              <div className="border-l-4 border-blue-600 pl-2 text-base mb-4">
                {$t('基本信息')}
              </div>
              <Form.Item
                label={$t('密钥名称')}
                name="name"
                rules={[{ required: true, message: $t('请输入密钥名称') }]}
              >
                <Input placeholder={$t('请输入名称')} />
              </Form.Item>
              {securityLevelEnabled && (
                <Form.Item
                  label={$t('密钥密级')}
                  name="data_level"
                  rules={[{ required: true, message: $t('请选择密钥密级') }]}
                >
                  <Select placeholder={$t('请选择密钥密级')} options={securityLevels} />
                </Form.Item>
              )}

              <Segmented
                value={resourceTab}
                onChange={(v) => setResourceTab(v as any)}
                options={[
                  { label: $t('模型'), value: 'model' },
                  { label: $t('API'), value: 'api' },
                ]}
              />

              <div className="border-l-4 border-blue-600 pl-2 text-base mb-4 mt-4">
                <div className="flex items-center justify-between">
                  <span>
                    {resourceTab === 'api' ? $t('API配置') : $t('模型配置')}
                  </span>
                </div>
              </div>

              <Form.Item
                label={$t('选择模型')}
                name="models"
                required
                dependencies={['apis']}
                rules={[
                  eitherOrRequiredRule('apis', $t('请选择模型')),
                ]}
                hidden={resourceTab !== 'model'}
              >
                <Select
                  placeholder={$t('请选择模型')}
                  open={false}
                  mode="multiple"
                  onClick={() => {
                    if (isView) return
                    setIsModelOpen(true)
                    setTransferKey((prev) => prev + 1) // 重置搜索条件
                  }}
                  options={modelList}
                  fieldNames={{
                    label: 'model_name',
                    value: 'model_name',
                  }}
                />
              </Form.Item>

              <Form.Item
                label={$t('选择API')}
                name="apis"
                required
                dependencies={['models']}
                rules={[
                  eitherOrRequiredRule('models', $t('请选择API')),
                ]}
                hidden={resourceTab !== 'api'}
              >
                <Select
                  placeholder={$t('请选择API')}
                  open={false}
                  mode="multiple"
                  loading={apiLoading}
                  onClick={() => {
                    if (isView) return
                    setIsApiOpen(true)
                    setApiTransferKey((prev) => prev + 1)
                  }}
                  options={internalApiList as any}
                  fieldNames={{ label: 'name', value: 'key' }}

                />
              </Form.Item>

              <div className="border-l-4 border-blue-600 pl-2 text-base mb-4">
                {$t('密钥配置')}
              </div>

              <Form.Item
                label={$t('密钥过期时间')}
                name="expired_time"
                rules={[{ required: true, message: $t('请选择过期时间') }]}
              >
                <DatePicker
                  className="w-full"
                  showTime
                  placeholder={$t('请选择过期时间')}
                />
              </Form.Item>

              <div className="flex gap-2 -mt-4 mb-4">
                <Button size="small" onClick={() => handleSetPermanent()}>
                  {$t('设为永久生效')}
                </Button>
                <Button size="small" onClick={() => handleQuickTime(30)}>
                  {$t('一个月后过期')}
                </Button>
                <Button size="small" onClick={() => handleQuickTime(1)}>
                  {$t('一天后过期')}
                </Button>
                <Button size="small" onClick={() => handleQuickTime(1, 'hour')}>
                  {$t('一小时后过期')}
                </Button>
              </div>
              <Form.Item
                label={$t('额度')}
                name="balance"
                tooltip={$t('密钥的额度仅用于密钥本身的最大额度使用量，实际的使用受到账户的剩余额度限制。')}
                rules={[
                  {
                    required: !isUnlimited,
                    message: $t('请输入额度'),
                  },
                  // 最多六小数位数
                  {
                    validator: (_, value) => {
                      if (value && String(value).split('.')[1]?.length > 6) {
                        return Promise.reject(new Error($t('额度最多六位小数')))
                      }
                      return Promise.resolve()
                    },
                  },
                ]}
              >
                <InputNumber
                  prefix={amountSymbol}
                  className="w-[240px]!"
                  placeholder={$t('请输入额度')}
                  disabled={isUnlimited || isView}
                  min={0}
                />
              </Form.Item>
              {/* 无限额度 */}
              <Form.Item label="" name="unlimited_quota" valuePropName="checked">
                <Checkbox>{$t('无限额度')}</Checkbox>
              </Form.Item>

              <Form.Item
                label={$t('IP 限制')}
                name="subnet"
                tooltip={$t('多个网段请使用英文逗号分隔')}
              >
                <Input
                  placeholder={$t('请输入允许访问的网段，例如：192.168.0.0/24')}
                />
              </Form.Item>

              {resourceTab === 'model' && (
                <div className="border-l-4 border-blue-600 pl-2 text-base mb-4 flex items-center gap-1">
                  {$t('限流')}
                  <Tooltip title={$t('限流条件(超出任一数值时触发限流)：每分钟调用次数（QPM）和每分钟消耗Token数（TPM）')}>
                    <CircleQuestionMark className="w-[16px] h-[16px] text-gray-400 cursor-pointer" />
                  </Tooltip>
                </div>
              )}
              <div className="flex gap-10">
                <Form.Item
                  label={$t('每分钟调用次数')}
                  name="qpm"
                  rules={[
                    {
                      type: 'number',
                      min: 0,
                      message: $t('数字必须大于或等于 0!'),
                    },
                  ]}
                  hidden={resourceTab !== 'model'}
                >
                  <InputNumber
                    className="w-[240px]!"
                    placeholder={$t('请输入')}
                  />
                </Form.Item>
                <Form.Item
                  label={$t('每分钟消耗Token数')}
                  name="tpm"
                  rules={[
                    {
                      type: 'number',
                      min: 0,
                      message: $t('数字必须大于或等于 0!'),
                    },
                  ]}
                  hidden={resourceTab !== 'model'}
                >
                  <InputNumber
                    className="w-[240px]!"
                    placeholder={$t('请输入')}
                  />
                </Form.Item>
              </div>
            </Form>
          </Spin>
        </Modal>
      </ConfigProvider>
      {ModelTransferModal}
      {ApiTransferModal}
    </>
  )
}
