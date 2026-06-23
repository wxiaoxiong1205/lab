import type { TableColumnsType } from 'antd'
import { Button, Checkbox, Form, Input, InputNumber, Modal, Select, Space, Spin, Tooltip, message } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import { useRequest } from 'ahooks'
import type { DataType } from '../../access-key/components/TableTransfer'
import { TableTransfer } from '../../access-key/components/TableTransfer'

import {
  apiGetWebhookList,
  apiModelList,
  apiMonitorRuleAdd,
  apiMonitorRuleDetail,
  apiMonitorRuleUpdate,
  apiSensitiveCategoriesGet,
  apiSystemConfig,
  apiUserList,
} from '@/services/api'
import { useTransform } from '@/locales'

const { Option } = Select

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

interface AlarmRuleFormData {
  id?: number
  rule_name: string
  monitor_models: string
  sensitive_types: string
  alert_count: number
  alert_interval: number
  alert_methods: string
  receivers: string
  webhooks: string
}

interface EditAlarmRuleModalProps {
  visible: boolean
  onCancel: () => void
  onOk: (values: AlarmRuleFormData) => void
  editingRule?: any
  type: string
}
interface WebHookItem {
  id: number
  tenant_id: string
  name: string
  type: string
  url: string
  encrypt_method: 'none' | 'signature'
  status: number
  description: string
  creator: string
  created_time: number
  updated_time: number
}

const EditAlarmRuleModal: React.FC<EditAlarmRuleModalProps> = ({
  visible,
  onCancel,
  onOk,
  editingRule,
  type,
}) => {
  const [form] = Form.useForm()
  const [isModelOpen, setIsModelOpen] = useState(false)
  const [targetKeys, setTargetKeys] = useState<string[]>([])
  const [modelType, setModelType] = useState<Record<string, string>>({})
  const [submitLoading, setSubmitLoading] = useState(false)
  const [transferKey, setTransferKey] = useState<number>(0)
  const { $t } = useTransform()

  const [webHookLists, setWebHookLists] = useState<WebHookItem[][]>([])

  // 获取模型列表数据
  const { data: modelList = [], run: getModelList } = useRequest<DataType[], any>(
    () =>
      apiModelList({
        page_number: 1,
        page_size: 9999,
        // security_policy_has_l1_l2: 1,
        // security_policy: 'L1,L2',
        view: 'usable',
      }).then((res) => {
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
      }),
    {
      manual: true,
    },
  )

  // 获取系统配置（模型类型映射）
  const { run: getConfig } = useRequest(
    () =>
      apiSystemConfig().then((res) => {
        setModelType(res.data.MODEL_TYPE || {})
      }),
    {
      manual: true,
    },
  )

  // 获取敏感类别数据
  const { data: sensitiveCategoriesData } = useRequest(
    () => apiSensitiveCategoriesGet(editingRule?.id),
    {
      ready: visible,
      refreshDeps: [editingRule?.id],
      onError: (error) => {
        console.error('获取敏感类别失败:', error)
      },
    },
  )

  // 获取用户列表数据
  const { data: usersListData = [] } = useRequest(
    () => apiUserList({
      page_number: 1,
      page_size: 9999,
    }).then((res) => res.data),
    {
      ready: visible,
      onSuccess: () => { },
      onError: () => { },
    },
  )

  // 获取规则详情数据（编辑时使用）
  const { run: fetchRuleDetail } = useRequest(
    apiMonitorRuleDetail,
    {
      manual: true,
      onSuccess: (result) => {
        if (result?.data) {
          const monitorModels = result.data.monitor_models ? result.data.monitor_models.split(',') : []
          const receivers = result.data.receivers
            ? (typeof result.data.receivers === 'string'
                ? result.data.receivers.split(',').map((id: string) => parseInt(id.trim())).filter(Boolean)
                : Array.isArray(result.data.receivers) ? result.data.receivers : []
              ) : []

          const webhooks = result.data.webhooks ? JSON.parse(result.data.webhooks) : {}
          form.setFieldsValue({
            ...result.data,
            alert_methods: result.data.alert_methods ? result.data.alert_methods.split(',') : [],
            monitor_models: monitorModels,
            receivers,
            sensitive_types: result.data.sensitive_types ? result.data.sensitive_types.split(',') : [],
            dingtalk: webhooks.dingtalk || [],
            wechat: webhooks.wechat || [],
            feishu: webhooks.feishu || [],
          })
          setTargetKeys(monitorModels)
        }
      },
      onError: (error) => {
        message.error('获取规则详情失败')
        console.error('获取规则详情失败:', error)
      },
    },
  )

  useEffect(() => {
    if (visible) {
      getModelList()
      getConfig()
      if (editingRule && editingRule.id) {
        // 编辑模式：获取详细信息
        fetchRuleDetail(editingRule.id)
      }
      else {
        // 新增模式：重置表单
        form.resetFields()
        form.setFieldValue('response_timeout_seconds', 20)
        form.setFieldValue('check_interval_minutes', 3)
        setTargetKeys([])
      }
    }
  }, [visible, editingRule, form, fetchRuleDetail, getModelList, getConfig])

  const handleOk = async () => {
    try {
      setSubmitLoading(true)
      const values = await form.validateFields()

      const { dingtalk, wechat, feishu, ...restValues } = values
      const formData = {
        ...restValues,
        alert_methods: Array.isArray(restValues.alert_methods)
          ? restValues.alert_methods.join(',')
          : restValues.alert_methods || '',
        monitor_models: Array.isArray(restValues.monitor_models)
          ? restValues.monitor_models.join(',')
          : restValues.monitor_models || '',
        receivers: Array.isArray(restValues.receivers)
          ? restValues.receivers.join(',')
          : restValues.receivers || '',
        sensitive_types: Array.isArray(restValues.sensitive_types)
          ? restValues.sensitive_types.join(',')
          : restValues.sensitive_types || '',
        webhooks: JSON.stringify({
          dingtalk: dingtalk || [],
          wechat: wechat || [],
          feishu: feishu || [],
        }),
      }

      if (editingRule && editingRule.id) {
        await apiMonitorRuleUpdate(editingRule.id, formData)
        // message.success('规则修改成功');

        // 编辑模式：只传递数据给父组件，由父组件统一处理接口调用
        onOk(formData)
        form.resetFields()
        setTargetKeys([])
      }
      else {
        await apiMonitorRuleAdd({ ...formData, type })
        onOk(formData)
        form.resetFields()
        setTargetKeys([])
      }
    }
    catch (error: any) {
      if (error?.errorFields) {
        return
      }

      message.error(error?.message || '操作失败，请稍后重试')
    }
    finally {
      setSubmitLoading(false)
    }
  }

  const handleCancel = () => {
    form.resetFields()
    setTargetKeys([])
    onCancel()
  }

  // 敏感类型选项 - 使用API数据或默认数据
  // const sensitiveTypeOptions = sensitiveCategoriesData?.data || [
  //   '社会公共安全类',
  //   '个人信息类',
  //   '金融信息类',
  //   '商业机密类',
  //   '政治敏感类',
  //   '暴力色情类',
  // ];
  const sensitiveTypeOptions = sensitiveCategoriesData?.data || []

  // 告警方式选项
  const alertMethodOptions = [
    { label: '邮件', value: 'email' },
    // { label: '短信', value: 'sms', disabled: true },
    // { label: '电话', value: 'phone', disabled: true },
    { label: 'Webhook', value: 'webhook', disabled: false },
  ]

  const webHookList = ['dingtalk', 'wechat', 'feishu']

  const getWebHookList = async () => {
    return Promise.all(webHookList.map((type) => apiGetWebhookList({
      page: 1,
      page_size: 999,
      type,
    }))).then((res) => res.map((item) => item.data.items))
  }

  useEffect(() => {
    const fetchWebHookList = async () => {
      const res = await getWebHookList()
      setWebHookLists(res)
    }
    fetchWebHookList()
  }, [])

  // 钉钉群选项
  const dingtalkOptions = [
    $t('请选择'),
    $t('开发团队群'),
    $t('运维团队群'),
    $t('安全团队群'),
    $t('管理团队群'),
  ]

  // 模型选择相关
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

  const onChange = (nextTargetKeys: React.Key[]) => {
    const stringKeys = nextTargetKeys.map((key) => String(key))
    setTargetKeys(stringKeys)
    form.setFieldValue('monitor_models', stringKeys)
  }

  const handleOpenModelModal = () => {
    setTransferKey((prev) => prev + 1) // 通过改变key强制重新渲染Transfer组件，清空搜索条件
    setIsModelOpen(true)
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
          onChange={onChange}
          filterOption={filterOption}
          leftColumns={columns}
          rightColumns={columns}
        />
      </Modal>
    )
  }, [isModelOpen, modelList, targetKeys, onChange, columns, filterOption, transferKey, $t])

  const alertMethods = Form.useWatch('alert_methods', form)

  return (
    <>
      <Modal
        title={`${editingRule ? $t('编辑') : $t('新建')} ${$t('告警规则')}`}
        open={visible}
        onCancel={handleCancel}
        width={600}
        footer={[
          <Button key="cancel" onClick={handleCancel}>
            {$t('取消')}
          </Button>,
          <Button key="submit" type="primary" loading={submitLoading} onClick={handleOk}>
            {$t('确定')}
          </Button>,
        ]}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            alert_interval: 1,
            alert_count: 1,
            alert_methods: [],
            monitor_models: [],
            receivers: [],
            sensitive_types: [],
          }}
          onValuesChange={(changedValues) => {
            if ('monitor_models' in changedValues) {
              setTargetKeys(changedValues.monitor_models || [])
            }
          }}
        >
          <Form.Item
            name="rule_name"
            label={<span>{$t('规则名称')}</span>}
            rules={[{ required: true, message: $t('请输入规则名称') }]}
          >
            <Input placeholder={$t('请输入规则名称')} />
          </Form.Item>

          <Form.Item
            name="monitor_models"
            label={<span>{$t('监控模型')}</span>}
            rules={[{ required: true, message: $t('请选择监控模型') }]}
          >
            <Select
              placeholder={$t('请选择监控模型')}
              open={false}
              mode="multiple"
              value={targetKeys}
              onClick={handleOpenModelModal}
              options={modelList}
              fieldNames={{
                label: 'model_name',
                value: 'model_name',
              }}
            />
          </Form.Item>

          {type === 'content_security' && (
            <Form.Item
              name="sensitive_types"
              label={(
                <span>
                  {$t('敏感类型')}
                  <Tooltip
                    title={(
                      <div>
                        {$t('可依据不同的敏感类型配置不同的告警策略分级告警，会触发不同级别的事件')}
                        <br />
                        <br />
                        <div style={{ color: '#ff4d4f' }}>{$t('高风险：')}</div>
                        {$t('社会公共安全类、人身权益侵害类、道德伦理类、政治与国际关系安全类、社会公平与正义类、违禁品类')}
                        <br />
                        <br />
                        <div style={{ color: '#faad14' }}>{$t('中风险：')}</div>
                        {$t('经济犯罪类、环境与资源类、技术安全类、信息安全类、医疗健康安全类')}
                        <br />
                        <br />
                        <div style={{ color: '#52c41a' }}>{$t('低风险：')}</div>
                        {$t('知识产权类')}
                      </div>
                    )}
                    placement="topLeft"
                  >
                    <QuestionCircleOutlined style={{ marginLeft: '4px', color: '#1890ff' }} />
                  </Tooltip>
                </span>
              )}
              rules={[{ required: true, message: $t('请选择敏感类型') }]}
            >
              <Select placeholder={$t('请选择敏感类型')} mode="multiple">
                {sensitiveTypeOptions.map((type: string) => (
                  <Option key={type} value={type}>
                    {type}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}

          {type === 'model_connectivity' && (
            <>
              <Form.Item
                name="check_interval_minutes"
                label={$t('监测频率')}
                rules={[
                  { required: true, message: $t('请输入监测频率') },
                  {
                    validator: (rule, value, callback) => {
                      if (value === undefined || value === null || value === '') {
                        callback()
                        return
                      }
                      if (Number(value) < 3) {
                        callback($t('监测间隔时间应大于等于3分钟'))
                        return
                      }
                      callback()
                    },
                  },
                ]}
              >
                <InputNumber
                  addonBefore={$t('每')}
                  addonAfter={$t('分钟触发监测')}
                />
              </Form.Item>

              <Form.Item
                name="response_timeout_seconds"
                label={$t('响应超时')}
                tooltip={$t('指定时间内模型无响应会触发告警，对于需复杂推理的模型建议调大响应超时，避免发送告警。')}
                rules={[
                  { required: true, message: $t('请输入响应超时时间') },
                  {
                    validator: (rule, value, callback) => {
                      if (value === undefined || value === null || value === '') {
                        callback()
                        return
                      }
                      if (Number(value) < 5) {
                        callback($t('响应超时应大于等于5秒'))
                        return
                      }
                      callback()
                    },
                  },
                ]}
              >
                <InputNumber
                  placeholder="20"
                  addonAfter={$t('秒')}
                />
              </Form.Item>
            </>
          )}

          <Space size="large" style={{ width: '100%' }}>
            <Form.Item
              name="alert_count"
              label={(
                <span>
                  {$t('告警次数')}
                  {' '}
                  <span style={{ color: '#ff4d4f' }}>*</span>
                </span>
              )}
              rules={[{ required: true, message: $t('请输入告警次数') }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={1} placeholder={$t('请输入告警次数')} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="alert_interval"
              label={(
                <span>
                  {$t('间隔时间')}
                  {' '}
                  <span style={{ color: '#ff4d4f' }}>*</span>
                </span>
              )}
              rules={[
                { required: true, message: $t('请输入间隔时间') },
                {
                  validator: (rule, value, callback) => {
                    if (value < 1 || value > 30) {
                      callback($t('间隔时间范围在1~30分钟之间'))
                    }
                    callback()
                  },
                },
              ]}
              style={{ flex: 1 }}
            >
              <InputNumber
                min={1}
                max={300}
                placeholder={$t('请输入间隔时间')}
                addonAfter={$t('分钟')}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Space>

          {/* <div style={{ fontSize: '12px', color: '#999', marginTop: '-10px', marginBottom: '16px' }}>
            间隔时间范围在1~30分钟之间
          </div> */}

          <Form.Item
            name="alert_methods"
            label={$t('告警方式')}
          >
            <Checkbox.Group options={alertMethodOptions} />
          </Form.Item>

          {alertMethods?.includes('email') && (
            <Form.Item
              name="receivers"
              label={$t('接收人')}
            >
              <Select
                placeholder={$t('请选择接收人')}
                mode="multiple"
                showSearch
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
              >
                {(usersListData || []).map((user: any) => (
                  <Option key={user.id} value={user.id} label={user.username || user.display_name}>
                    {user.username || user.display_name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}

          {alertMethods?.includes('webhook') && (
            <>
              <Form.Item
                name="dingtalk"
                label={$t('钉钉群')}
              >
                <Select placeholder={$t('请选择钉钉群')} mode="multiple">
                  {(webHookLists[0] || []).map((item) => (
                    <Option key={item.id} value={item.id} disabled={item.name === '请选择'}>
                      {item.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="wechat"
                label={$t('企微群')}
              >
                <Select placeholder={$t('请选择企微群')} mode="multiple">
                  {(webHookLists[1] || []).map((item) => (
                    <Option key={item.id} value={item.id} disabled={item.name === ($t('请选择'))}>
                      {item.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="feishu"
                label={$t('飞书群')}
              >
                <Select placeholder={$t('请选择飞书群')} mode="multiple">
                  {(webHookLists[2] || []).map((item) => (
                    <Option key={item.id} value={item.id} disabled={item.name === ($t('请选择'))}>
                      {item.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </>
          )}
          {/* <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.alert_methods !== currentValues.alert_methods
            }
          >
            {({ getFieldValue }) => {
              const alertMethods = getFieldValue('alert_methods') || [];
              const showDingtalk = alertMethods.includes('webhook');

              return showDingtalk ? (
                <Form.Item
                  name="dingtalk_group"
                  label="钉钉群"
                >
                  <Select placeholder="请选择钉钉群">
                    {dingtalkOptions.map(group => (
                      <Option key={group} value={group} disabled={group === '请选择'}>
                        {group}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              ) : null;
            }}
          </Form.Item> */}
        </Form>
      </Modal>
      {ModelTransferModal}
    </>
  )
}

export default EditAlarmRuleModal
