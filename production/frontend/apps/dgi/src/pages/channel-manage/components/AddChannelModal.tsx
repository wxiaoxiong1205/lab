import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AutoComplete,
  Button,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Spin,
  message,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useRequest } from 'ahooks'
import {
  PROVIDER_AZURE_OPENAI,
  PROVIDER_CUSTOM,
  PROVIDER_VOLCENGI,
} from '@/constants'
import type {
  ChannelForm,
  InferenceTaskItem,
  ProjectItem } from '@/services/api'
import {
  apiChannelAdd,
  apiChannelDetail,
  apiChannelUpdate,
  apiGroupListGet,
  apiModelList,
  apiProviderModelMapList,
  inferenceTask,
  projectsList,
} from '@/services/api'
import { useTransform } from '@/locales'
import { useSystemConfig } from '@/hooks/use-system-config'

const { TextArea } = Input

interface AddChannelModalProps {
  editId?: number
  readOnly?: boolean
  open: boolean
  onCancel: () => void
  onSuccess: () => void
  preSelectedModel?: string // 从模型页面传入的预选模型名称
  defaultAddressType?: 'custom' | 'deployed' // 默认地址类型
  urlParams?: {
    projectName?: string
    serverName?: string
    modelName?: string
    accessUrl?: string
  } // URL 参数，用于回显表单
  // securityLevels?: { label: string; value: string }[];
}

export default function AddChannelModal({
  open,
  onCancel,
  onSuccess,
  editId,
  readOnly = false,
  preSelectedModel,
  defaultAddressType,
  urlParams,
  // securityLevels
}: AddChannelModalProps) {
  const isEdit = !!editId || editId === 0
  const [form] = Form.useForm<ChannelForm>()
  const [loading, setLoading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [addressType, setAddressType] = useState<'custom' | 'deployed'>(
    defaultAddressType || (preSelectedModel ? 'deployed' : 'custom'),
  )
  // 添加状态保存手动输入的URL
  const [manualBaseUrl, setManualBaseUrl] = useState<string>('')
  // 使用 ref 跟踪是否已经设置过 URL 参数，避免重复设置
  const hasSetUrlParams = useRef(false)
  // 使用 ref 标记是否正在回填编辑数据，避免 useEffect 干扰
  const isFillingBackFormRef = useRef(false)
  const { $t } = useTransform()
  const { channelTypeOptions, gpuStackServer, gpuStackToken, securityLevel, securityLevelEnabled, deepexiLabServer, deepexiLabServerEnabled } = useSystemConfig(true)
  // const { data: groupList = [], run: getGroupList } = useRequest(
  //   () => apiGroupListGet().then((res) => res.data),
  //   {
  //     manual: true,
  //   }
  // );
  const { data: modelMap, run: getModelMap } = useRequest(
    () =>
      apiProviderModelMapList().then(
        (res) => res.data as Record<number, string[]>,
      ),
    {
      manual: true,
    },
  )

  // 获取已部署的模型列表
  const { data: deployedModels = [], run: getDeployedModels } = useRequest(
    () =>
      apiModelList({
        page_number: 1,
        page_size: 9999,
      }).then((res) =>
        res.data.items.map((item: any) => ({
          label: item.model_name,
          value: item.model_name,
          key: item.id,
        })),
      ),
    {
      manual: true,
    },
  )

  // const { data: modelInstances = [], run: getModelInstances } = useRequest(
  //   () => queryModelsList({
  //     page: 1,
  //     perPage: 100
  //   }).then((res: any) => res.items.filter((item: any) => item.ready_replicas >= 1)),
  //   {
  //     manual: true
  //   }
  // );

  // 获取项目列表
  const { data: projectsListData = [], run: getProjectsList } = useRequest(
    () =>
      projectsList().then((res) => {
        // dgi-dev.deepexi.com 接口直接返回数据，没有 code 和 data 包装
        return (res.items || res.data?.items || []) as ProjectItem[]
      }),
    {
      manual: true,
    },
  )

  // 监听选择的项目ID
  const selectedProjectId = Form.useWatch('project_id', form)
  // 监听选择的服务名称
  const selectedServiceName = Form.useWatch('service_name', form)

  // 获取服务列表（基于project_id）
  const { data: servicesListData = [], run: getServicesList, loading: servicesLoading } = useRequest(
    (projectId: number) =>
      inferenceTask(projectId).then((res) => {
        return (res.items || res.data?.items || []) as InferenceTaskItem[]
      }),
    {
      manual: true,
    },
  )

  useEffect(() => {
    if (urlParams?.projectName && projectsListData.length > 0 && hasSetUrlParams.current) {
      const currentProjectId = form.getFieldValue('lab_project_id')
      const matchedProject = projectsListData.find(
        (item) => item.name === urlParams.projectName,
      )
      // 只有当项目ID还没设置或设置的项目名称不匹配时才更新
      if (matchedProject && currentProjectId !== matchedProject.id) {
        form.setFieldsValue({
          project_id: matchedProject.id,
        } as any)
      }
    }
  }, [projectsListData, urlParams?.projectName])

  // 当选择的项目ID变化时，获取对应的服务列表
  useEffect(() => {
    // 如果正在回填编辑数据，不执行清空操作
    if (isFillingBackFormRef.current) {
      return
    }

    if (selectedProjectId) {
      getServicesList(selectedProjectId)
    }

    // 只有在新增模式下才清空服务名称
    if (!isEdit) {
      form.setFieldsValue({
        service_name: undefined,
      })
    }
  }, [selectedProjectId, isEdit])

  // 当选择项目后 回显模型链接（根据接口返回的 access_url）
  useEffect(() => {
    // 如果正在回填编辑数据，不执行任何操作，避免覆盖已回显的值
    if (isFillingBackFormRef.current) {
      return
    }

    if (addressType === 'deployed') {
      // 优先使用 URL 参数中的 accessUrl（仅新增模式）
      if (urlParams?.accessUrl && !isEdit) {
        const currentEndpoint = form.getFieldValue('model_endpoint')
        if (!currentEndpoint || currentEndpoint !== urlParams.accessUrl) {
          form.setFieldsValue({
            model_endpoint: urlParams.accessUrl,
          } as any)
        }
        return
      }

      // 只有在新增模式下才从服务列表中获取值
      if (!isEdit && selectedProjectId && selectedServiceName) {
        // 如果项目和服务都选择了，尝试从服务列表中获取 access_url
        const selectedService = servicesListData.find(
          (item) => item.server_name === selectedServiceName,
        )

        if (selectedService?.access_url) {
          form.setFieldsValue({
            model_endpoint: selectedService.access_url,
          })
        }
      }
      else if (!isEdit && !urlParams?.accessUrl) {
        const currentEndpoint = form.getFieldValue('model_endpoint')
        if (currentEndpoint) {
          form.setFieldsValue({
            model_endpoint: undefined,
          })
        }
      }
    }
  }, [selectedProjectId, selectedServiceName, addressType, servicesListData, urlParams?.accessUrl, isEdit, form])

  // 当服务名称变化时，自动设置模型名称为服务名称
  useEffect(() => {
    // 如果正在回填编辑数据，不执行任何操作，避免覆盖已回显的值
    if (isFillingBackFormRef.current) {
      return
    }

    if (addressType === 'deployed' && selectedServiceName && !isEdit) {
      form.setFieldsValue({
        models: [selectedServiceName],
      } as any)
    }
  }, [selectedServiceName, addressType, isEdit, form])

  // 监听服务列表变化，如果有 URL 参数中的 serverName，自动设置服务名称和模型重定向
  useEffect(() => {
    if (urlParams?.serverName && selectedProjectId && servicesListData.length > 0 && hasSetUrlParams.current) {
      const currentServiceName = form.getFieldValue('service_name')
      const matchedService = servicesListData.find(
        (item) => item.server_name === urlParams.serverName,
      )

      // 如果服务名称还没设置或与URL参数不一致，则更新
      if (!currentServiceName || currentServiceName !== urlParams.serverName) {
        form.setFieldsValue({
          service_name: urlParams.serverName,
        })
      }
    }
  }, [servicesListData, selectedProjectId, urlParams?.serverName, urlParams?.modelName, form])

  // 监听提供商的变化
  const provider = Form.useWatch('type', form)
  // 监听base_url的变化，在手动模式下自动保存
  const currentBaseUrl = Form.useWatch('base_url', form)

  // 当 deepexiLabServerEnabled 为 false 时，如果当前是 deployed 模式，强制切换为 custom
  useEffect(() => {
    if (!deepexiLabServerEnabled && addressType === 'deployed') {
      setAddressType('custom')
      form.setFieldsValue({
        model_source: 'custom',
      } as any)
    }
  }, [deepexiLabServerEnabled, addressType, form])

  // 当在手动模式下base_url发生变化时，保存到状态中
  useEffect(() => {
    if (addressType === 'custom' && currentBaseUrl && currentBaseUrl !== manualBaseUrl) {
      setManualBaseUrl(currentBaseUrl)
    }
  }, [currentBaseUrl, addressType, manualBaseUrl])

  const modelList = useMemo(() => {
    const list = modelMap?.[provider] || modelMap?.[PROVIDER_CUSTOM] || []
    return list.map((item) => ({
      value: item,
      label: item,
      key: item,
    }))
  }, [provider, modelMap])

  const modelEndpointOptions = useSystemConfig(true).endpointList.map((item: string) => ({
    label: item,
    value: item,
  }))

  const handleOk = async () => {
    try {
      setConfirmLoading(true)
      const values = await form.validateFields()
      const formValues = JSON.parse(JSON.stringify(values)) as any
      formValues.group = values.group?.join(',') ?? ''
      // formValues.models = values.models?.join(",") ?? "";

      // 处理模型地址逻辑
      if (addressType === 'deployed') {
        // 如果选择已部署模型，使用 model_endpoint 作为 base_url
        formValues.base_url = formValues.model_endpoint || ''
      }

      // 清理不需要的字段
      // delete formValues.selected_models;
      delete formValues.model_endpoint

      // 如果选择了已部署模型（新增和编辑都需要）
      if (addressType === 'deployed') {
        const projectId = (values as any).project_id as number | undefined
        const serviceName = values.service_name

        // 设置项目ID
        if (projectId) {
          formValues.lab_project_id = projectId

          // 获取项目名称
          const selectedProject = projectsListData.find((item) => item.id === projectId)
          if (selectedProject) {
            formValues.lab_project_name = selectedProject.name
          }
        }

        // 获取服务ID和服务名称
        if (serviceName) {
          const selectedService = servicesListData.find((item) => item.server_name === serviceName)
          if (selectedService) {
            formValues.lab_inference_task_id = selectedService.id
            formValues.lab_inference_task_name = selectedService.server_name
          }
        }
      }

      formValues.model_endpoints = formValues.models
      delete formValues.models

      // 删除表单中的临时字段
      delete (formValues as any).project_id
      delete formValues.service_name

      try {
        if (isEdit) {
          await apiChannelUpdate(editId, formValues)
          message.success($t('编辑渠道成功'))
          onSuccess()
          handleCancel()
        }
        else {
          await apiChannelAdd(formValues)
          message.success($t('新增渠道成功'))
          onSuccess()
          handleCancel()
        }
      }
      catch (error: any) {
        // 捕获错误并显示错误消息（错误消息已经在 request.ts 拦截器中处理，这里直接显示）
        const errorMessage = error?.message || '操作失败'
        message.error(errorMessage)
        // 错误时不调用 onSuccess 和 handleCancel，让用户可以修改后重试
      }
    }
    finally {
      setConfirmLoading(false)
    }
  }

  const handleCancel = () => {
    form.resetFields()
    // 重置状态
    setAddressType(defaultAddressType || (preSelectedModel ? 'deployed' : 'custom'))
    setManualBaseUrl('') // 重置保存的手动URL
    onCancel()
  }

  // 当提供商变化时，清除相关字段
  const handleProviderChange = () => {
    form.setFieldsValue({
      models: [''],
    })
  }

  // 处理模型地址类型变化
  const handleAddressTypeChange = (e: any) => {
    const type = e.target.value

    // 获取当前的base_url值
    const currentBaseUrl = form.getFieldValue('base_url') || ''

    if (type === 'custom') {
      // 切换到手动输入时，恢复之前保存的URL
      form.setFieldsValue({
        base_url: manualBaseUrl,
      })
    }
    else if (type === 'deployed') {
      // 切换到已部署模型时，保存当前手动输入的URL
      if (currentBaseUrl && currentBaseUrl !== gpuStackServer && currentBaseUrl !== deepexiLabServer) {
        setManualBaseUrl(currentBaseUrl)
      }

      // 切换到已部署模型时，不清空模型链接，等待选择项目后由 useEffect 回显
      form.setFieldsValue({
        base_url: '',
        model_endpoint: undefined,
      } as any)

      // 如果有预选模型，重新设置
      if (preSelectedModel) {
        setTimeout(() => {
          form.setFieldsValue({
            selected_models: preSelectedModel,
            models: [preSelectedModel],
          } as any)
        }, 50)
      }
    }

    setAddressType(type)
  }

  const fillBackForm = () => {
    if (isEdit) {
      setLoading(true)
      // 标记正在回填数据
      isFillingBackFormRef.current = true

      apiChannelDetail(editId).then((res) => {
        const data = res.data

        // 根据model_source设置addressType状态
        if (data.model_source) {
          setAddressType(data.model_source)
          // 如果是手动模式，保存当前的base_url
          if (data.model_source === 'custom' && data.base_url) {
            setManualBaseUrl(data.base_url)
          }
        }

        // 构建表单数据，所有值都直接从详情接口返回的数据获取
        const models = data.models?.split(',')
        const endpoints = data.endpoints?.split(',')
        const formData: any = {
          ...data,
          // group: data.group?.split(",") ?? [],
          models: models
            ?.map((item: string, index: number) => ({ name: item, endpoint: endpoints?.[index] })),
        }

        // 将 lab_project_id 映射为 project_id（表单字段名）
        const projectId = (data as any).project_id || data.lab_project_id
        if (projectId) {
          formData.project_id = projectId
        }

        // 优先使用 lab_inference_task_name，如果没有则使用 service_name
        const savedServiceName = data.lab_inference_task_name || data.service_name
        if (savedServiceName) {
          formData.service_name = savedServiceName
          // 如果是已部署模式，模型名称设置为服务名称
          if (data.model_source === 'deployed') {
            // formData.models = [savedServiceName];
          }
        }

        // 如果是已部署模式，将 base_url 转换为 model_endpoint
        if (data.model_source === 'deployed' && data.base_url) {
          formData.model_endpoint = data.base_url
        }

        //  模型重定向回显
        if (data.model_mapping) {
          if (typeof data.model_mapping === 'object') {
            formData.model_mapping = JSON.stringify(data.model_mapping, null, 2)
          }
          else if (typeof data.model_mapping === 'string') {
            try {
              const parsed = JSON.parse(data.model_mapping)
              formData.model_mapping = JSON.stringify(parsed, null, 2)
            }
            catch {
              formData.model_mapping = data.model_mapping
            }
          }
        }
        else {
          // 如果没有值
          formData.model_mapping = ''
        }

        if (projectId) {
          form.setFieldsValue({
            project_id: projectId,
          } as any)
          getServicesList(projectId)
        }

        // 直接设置所有字段（所有值都从详情接口返回的数据获取）
        form.setFieldsValue(formData)

        // 延迟重置标记，确保所有字段都已设置完成
        setTimeout(() => {
          isFillingBackFormRef.current = false
        }, 500)
      }).catch(() => {
        // 如果出错，也要重置标记
        isFillingBackFormRef.current = false
        setLoading(false)
      })
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      if (isEdit) {
        fillBackForm()
      }
      // getGroupList();
      getModelMap()
      // 只有当 deepexiLabServerEnabled 为 true 时才调用已部署模型相关接口
      if (deepexiLabServerEnabled) {
        getDeployedModels()
        getProjectsList()
      }
      // getModelInstances();

      // 如果有预选模型，设置表单值（仅在 deepexiLabServerEnabled 为 true 时）
      if (preSelectedModel && deepexiLabServerEnabled) {
        setAddressType('deployed')
        setTimeout(() => {
          form.setFieldsValue({
            model_source: 'deployed',
            selected_models: preSelectedModel,
            models: [preSelectedModel], // 在模型名称中也反填预选模型
            model_endpoint: undefined, // 不自动设置模型链接，等待选择项目后回显
          } as any)
        }, 100)
      }
      else if (defaultAddressType === 'deployed' && deepexiLabServerEnabled) {
        // 如果设置了默认地址类型为"已部署模型"，设置表单值（仅在 deepexiLabServerEnabled 为 true 时）
        setAddressType('deployed')
        setTimeout(() => {
          form.setFieldsValue({
            model_source: 'deployed',
            model_endpoint: undefined, // 不自动设置模型链接，等待选择项目后回显
          } as any)
        }, 100)
      }

      // 处理 URL 参数回显（只在首次打开时执行一次）
      if (urlParams && !isEdit && !hasSetUrlParams.current) {
        hasSetUrlParams.current = true
        const { projectName, serverName, modelName, accessUrl } = urlParams

        // 设置模型链接（accessUrl）- 优先设置，不依赖于服务选择
        // 模型名称会由 useEffect 在设置 service_name 后自动设置为服务名称
        // 只有在已部署模式下才设置 model_endpoint
        if (accessUrl && addressType === 'deployed') {
          setTimeout(() => {
            form.setFieldsValue({
              model_endpoint: accessUrl,
            })
          }, 150)
        }

        // 直接设置项目和服务名称，不等待列表加载完成
        if (projectName) {
          // 立即尝试设置项目（如果列表已加载）
          const matchedProject = projectsListData.find(
            (item) => item.name === projectName,
          )
          if (matchedProject) {
            setTimeout(() => {
              form.setFieldsValue({
                project_id: matchedProject.id,
              } as any)
            }, 200)
          }
        }

        // 直接设置服务名称（service_name 字段直接使用名称）
        if (serverName) {
          setTimeout(() => {
            form.setFieldsValue({
              service_name: serverName,
            } as any)
          }, 250)
        }
      }

      // 处理 gpuStackServer 和 gpuStackToken 的赋值
      setTimeout(() => {
        if (isEdit) {
          // 编辑模式：只赋值密钥，不覆盖从详情接口获取的其他字段
          form.setFieldsValue({
            key: form.getFieldValue('key') || gpuStackToken,
          } as any)
        }
        else {
          // 新增模式：只赋值密钥
          form.setFieldsValue({
            key: gpuStackToken,
          } as any)
        }
      }, 150)
    }
    else {
      form.resetFields()
      setAddressType(defaultAddressType || (preSelectedModel ? 'deployed' : 'custom'))
      setManualBaseUrl('') // 重置保存的手动URL
      hasSetUrlParams.current = false // 重置 URL 参数设置标记
    }
  }, [open, preSelectedModel, isEdit, gpuStackServer, gpuStackToken, deepexiLabServer, defaultAddressType, deepexiLabServerEnabled])

  // // 获取可用的数据安全级别选项
  // const [securityLevels, setSecurityLevels] = useState<DataSecurityLevelOption[]>([]);

  // useEffect(() => {
  //   const enabledLevels = PermissionHelper.getEnabledDataSecurityLevels('非密');
  //   setSecurityLevels(enabledLevels);
  // }, [])

  return (
    <Modal
      title={isEdit ? $t('编辑渠道') : $t('新增渠道')}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={confirmLoading}
      width={640}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          {$t('取消')}
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={confirmLoading}
          onClick={handleOk}
        >
          {$t('确定')}
        </Button>,
      ]}
    >
      <Spin spinning={loading}>
        <Form
          form={form}
          layout="vertical"
          requiredMark
          initialValues={{
            type: PROVIDER_CUSTOM,
            models: [''],
            model_source: defaultAddressType || (preSelectedModel ? 'deployed' : 'custom'),
          }}
          disabled={readOnly}
        >
          <Form.Item
            label={$t('渠道名称')}
            name="name"
            required
            rules={[{ required: true, message: $t('请输入渠道名称') }]}
          >
            <Input placeholder={$t('请输入渠道名称')} />
          </Form.Item>
          <Form.Item
            label={$t('提供商')}
            name="type"
            required
            rules={[{ required: true, message: $t('请选择提供商') }]}
            tooltip={(
              <p>
                OpenAI：直接返回模型原生输出格式，不对相应数据做任何转换。
                <br />
                {`OpenAI_Think标签补全：将模型的推理过程 (reasoning_content) 整合到 content 字段，自动补全 <think> 标签`}
              </p>
            )}
          >
            <Select
              placeholder={$t('请选择提供商')}
              onChange={handleProviderChange}
              options={channelTypeOptions}
            >
            </Select>
          </Form.Item>
          {provider === PROVIDER_AZURE_OPENAI ? (
            <>
              <Form.Item
                label="AZURE_OPENAI_ENDPOINT"
                name="base_url"
                tooltip={
                  `${$t('例如：')}https://docs-test-001.openai.azure.com`
                }
                required
                rules={[
                  {
                    required: true,
                    message: `${$t('请输入')} AZURE_OPENAI_ENDPOINT`,
                  },
                ]}
              >
                <Input
                  placeholder={
                    `${$t('请输入')
                    } AZURE_OPENAI_ENDPOINT${
                      $t('例如：')
                    }https://docs-test-001.openai.azure.com`
                  }
                />
              </Form.Item>

              <Form.Item
                label={$t('默认 API 版本')}
                name="other"
                tooltip={$t('该配置可以被实际的请求参数覆盖')}
                required
                rules={[{ required: true, message: $t('请输入默认 API 版本') }]}
              >
                <Input
                  placeholder={
                    `${$t('请输入默认API版本')
                    + $t('例如：')
                    }2024-03-01-preview`
                  }
                />
              </Form.Item>
            </>
          ) : null}
          {provider === PROVIDER_VOLCENGI ? (
            <Form.Item
              label={$t('代理地址')}
              name="base_url"
              tooltip={$t(
                '此项可选，用于通过代理站来进行API调用，请输入代理地址，格式为：https:/domaincom。注意，这里所需要填入的代理地址仅会在实际请求时替换域名部分',
              )}
            >
              <Input
                placeholder={$t('请输入代理地址，格式为：https:/domaincom')}
              />
            </Form.Item>
          ) : null}
          {/* 自定义或其他 */}
          {![PROVIDER_AZURE_OPENAI, PROVIDER_VOLCENGI].includes(provider) ? (
            <>
              <Form.Item
                label={$t('模型地址')}
                name="model_source"
                initialValue="custom"
              >
                <Radio.Group onChange={handleAddressTypeChange} value={addressType}>
                  <Radio value="custom">手动输入URL</Radio>
                  {/* {deepexiLabServerEnabled && <Radio value="deployed">已部署模型</Radio>} */}
                </Radio.Group>
              </Form.Item>

              {addressType === 'custom' ? (
                <Form.Item
                  name="base_url"
                  required
                  rules={[{ required: true, message: $t('请输入自定义模型地址') }]}
                >
                  <Input
                    placeholder={
                      `${$t('请输入自定义渠道的 Base URL')
                      + $t('例如：')
                      }https://ip:port`
                    }
                  />
                </Form.Item>
              ) : (
                <div className="flex gap-4 mb-6">
                  <Form.Item
                    label="选择项目"
                    name="project_id"
                    className="flex-1 mb-0"
                    required
                    rules={[{ required: true, message: '请选择项目' }]}
                  >
                    <Select
                      placeholder="请选择项目"
                      options={projectsListData.map((item) => ({
                        label: item.name,
                        value: item.id,
                        key: item.id,
                      }))}
                      showSearch
                      filterOption={(input, option) =>
                        (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false}
                    />
                  </Form.Item>
                  <Form.Item
                    label="选择服务"
                    name="service_name"
                    className="flex-1 mb-0"
                    required
                    rules={[{ required: true, message: '请选择服务' }]}
                  >
                    <Select
                      placeholder="请选择服务"
                      loading={servicesLoading}
                      disabled={!selectedProjectId}
                      options={servicesListData.map((item) => ({
                        label: item.server_name,
                        value: item.server_name,
                        key: item.id,
                      }))}
                      showSearch
                      filterOption={(input, option) =>
                        (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false}
                    />
                  </Form.Item>
                  <Form.Item
                    label="模型链接"
                    name="model_endpoint"
                    className="flex-1 mb-0"
                    required
                    rules={[{ required: true, message: '请输入模型链接' }]}
                  >
                    <Input
                      placeholder="请输入模型链接"
                      readOnly
                    />
                  </Form.Item>
                </div>
              )}
            </>
          ) : null}
          <Form.List name="models">
            {(fields, { add, remove }) => (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[14px] font-medium">
                    {$t('模型名称')}
                  </span>
                </div>
                {fields.map((field, index) => {
                  const { key, ...fieldProps } = field
                  return (
                    <div key={key} className="flex gap-2 mb-2">
                      <Form.Item
                        {...fieldProps}
                        name={[field.name, 'name']}
                        className="flex-6 mb-0"
                        rules={[
                          { required: true, message: $t('请输入模型名称') },
                        ]}
                      >
                        <AutoComplete
                          placeholder={$t('请输入模型名称')}
                          options={modelList}
                          filterOption={(input, option) =>
                            option.value?.includes(input)}
                        />
                        {/* <Input placeholder={$t("请输入模型名称")} /> */}
                      </Form.Item>
                      {/* <Form.Item
                        {...field}
                        name={[field.name, "endpoint"]}
                        className="flex-4 mb-0"
                        rules={[
                          { required: true, message: $t("请选择模型端点") },
                        ]}
                      >
                        <AutoComplete
                          options={modelEndpointOptions}
                          placeholder={$t("请选择模型端点")}
                          filterOption={(input, option) =>
                            option.value?.includes(input)
                          }
                        ></AutoComplete>
                        <Select placeholder={$t("请选择模型端点")} options={modelEndpointOptions} />
                      </Form.Item> */}
                      <Button
                        type="text"
                        onClick={() => add('')}
                        icon={<PlusOutlined />}
                      />
                      {fields.length > 1 && (
                        <Button
                          type="text"
                          onClick={() => remove(index)}
                          icon={<DeleteOutlined className="text-red-500" />}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Form.List>
          <Form.Item
            label={$t('模型重定向')}
            name="model_mapping"
            tooltip={
              `${$t(
                '此项可选，用于修改请求中的模型名称，为一个 JSON 字符串，键为请求中的模型名称，值为要替换的模型名称，例如：',
              )
              }
{
  "gpt-3.5-turbo-0301": "gpt-3.5-turbo",
  "gpt-4-0314": "gpt-4",
  "gpt-4-32k-0314": "gpt-4-32k"
}`
            }
            rules={[
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve()
                  try {
                    const parsed = JSON.parse(value)
                    if (typeof parsed !== 'object' || parsed === null) {
                      return Promise.reject(
                        new Error($t('必须是一个有效的对象格式 JSON 字符串')),
                      )
                    }
                    return Promise.resolve()
                  }
                  catch (error) {
                    return Promise.reject(
                      new Error($t('请输入正确的 JSON 字符串')),
                    )
                  }
                },
              },
            ]}
          >
            <TextArea
              placeholder={
                `${$t('例如：')
                }
{
  "gpt-3.5-turbo-0301": "gpt-3.5-turbo",
  "gpt-4-0314": "gpt-4",
  "gpt-4-32k-0314": "gpt-4-32k"
}`
              }
              rows={4}
            />
          </Form.Item>
          {securityLevelEnabled && (
            <Form.Item
              label={$t('密级')}
              name="data_level"
              required
              rules={[{ required: true, message: $t('请选择密级') }]}
              // tooltip={$t("人员权限与数据密级的关系，可根据不同的项目需求初始化不同的数据")}
            >
              <Select
                placeholder={$t('请选择密级')}
                options={securityLevel}
                showSearch
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false}
              />
            </Form.Item>
          )}
          <Form.Item
            label={$t('密钥')}
            name="key"
            required
            rules={[{ required: true, message: $t('请输入密钥') }]}
          >
            <Input.Password
              placeholder={
                isEdit
                  ? $t('请输入密钥')
                  : $t('请输入密钥,多个密钥请用换行符分隔')
              }
              autoComplete="off"
            />
          </Form.Item>
          {/* <Form.Item
            label={$t("分组")}
            name="group"
            rules={[{ required: true, message: $t("请选择分组") }]}
          >
            <Select
              mode="multiple"
              placeholder={$t("请选择所属分组")}
              options={groupList.map((group) => ({
                label: group,
                value: group,
                key: group,
              }))}
            />
          </Form.Item> */}
        </Form>
      </Spin>
    </Modal>
  )
}
