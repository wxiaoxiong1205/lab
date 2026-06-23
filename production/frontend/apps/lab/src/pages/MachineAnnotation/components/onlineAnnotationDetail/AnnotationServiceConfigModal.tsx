import React, { useCallback, useEffect, useState } from 'react'
import { Button, Cascader, Form, Modal, message } from 'antd'
import type { CascaderProps } from 'antd'
import { useParams } from 'react-router-dom'
import { labelTaskService } from '@/services/dataAnnotationService'
import apiClient from '@/services/apiClient'

type AnnotationServiceType = 'model_deployment' | 'online_annotation_service' | 'online_notebook_service'

export interface MachineAnnotationConfig {
  model_id?: number
  service_type?: AnnotationServiceType
  base_url?: string
  service_name?: string
}

interface AnnotationServiceConfigModalProps {
  visible: boolean
  taskId?: number
  taskTemplateType?: string
  initialConfig?: MachineAnnotationConfig | null
  onCancel: () => void
  onConfirm?: (config: MachineAnnotationConfig) => void
}

interface ServiceOption {
  id: number
  name: string
  description?: string
  base_url?: string
}

function buildProxyPredictUrl(service: any): string | undefined {
  const proxyAccessUrl = service?.proxy_access_url || service?.ports?.[0]?.proxy_access_url
  if (typeof proxyAccessUrl === 'string' && proxyAccessUrl) {
    return `${proxyAccessUrl.replace(/\/?$/, '/')}predict`
  }

  return undefined
}

interface CascaderOption {
  value: string | number
  label: string
  isLeaf?: boolean
  loading?: boolean
  disabled?: boolean
  base_url?: string
  children?: CascaderOption[]
}

const AnnotationServiceConfigModal: React.FC<AnnotationServiceConfigModalProps> = ({
  visible,
  taskId,
  taskTemplateType,
  initialConfig,
  onCancel,
  onConfirm,
}) => {
  const { projectId } = useParams<{ projectId: string }>()
  const [form] = Form.useForm()
  const serviceSelector = Form.useWatch('service_selector', form) as [AnnotationServiceType, number] | undefined
  const [loading, setLoading] = useState(false)
  const [modelDeploymentOptions, setModelDeploymentOptions] = useState<ServiceOption[]>([])
  const [onlineAnnotationServiceOptions, setOnlineAnnotationServiceOptions] = useState<ServiceOption[]>([])
  const [onlineNotebookServiceOptions, setOnlineNotebookServiceOptions] = useState<ServiceOption[]>([])
  const [serviceCascaderOptions, setServiceCascaderOptions] = useState<CascaderOption[]>([
    {
      value: 'model_deployment',
      label: '模型部署',
      isLeaf: false,
    },
    {
      value: 'online_annotation_service',
      label: '在线标注服务',
      isLeaf: false,
    },
    {
      value: 'online_notebook_service',
      label: '在线Notebook服务',
      isLeaf: false,
    },
  ])

  useEffect(() => {
    if (!visible) return

    if (initialConfig?.model_id && initialConfig?.service_type) {
      form.setFieldsValue({
        service_selector: [initialConfig.service_type, initialConfig.model_id],
      })
      return
    }

    form.setFieldsValue({
      service_selector: undefined,
    })
  }, [form, initialConfig?.model_id, initialConfig?.service_type, visible])

  const updateCascaderChildren = useCallback((serviceType: AnnotationServiceType, children: CascaderOption[], disabled = false) => {
    setServiceCascaderOptions((prev) => prev.map((option) => {
      if (option.value !== serviceType) return option

      return {
        ...option,
        loading: false,
        disabled,
        children: [...children],
      }
    }))
  }, [])

  const fetchModelDeploymentOptions = useCallback(async () => {
    if (!projectId) return []

    const response = await apiClient.get(`/inference_tasks/project/${projectId}?model_source=ml_model&status=运行中`, {
      params: {
        page: 1,
        size: 100,
        ...(taskTemplateType ? { usage: taskTemplateType } : {}),
      },
    })
    const data = response?.data?.data || response?.data || response
    const options = (data?.items || []).map((service: any) => ({
      id: service.id,
      name: service.server_name || service.model_name || `服务-${service.id}`,
      description: service.model_name || service.status || '-',
      base_url: buildProxyPredictUrl(service),
    }))
    setModelDeploymentOptions(options)
    return options
  }, [projectId, taskTemplateType])

  const fetchOnlineAnnotationServiceOptions = useCallback(async () => {
    if (!projectId) return []

    const response = await apiClient.get(`/online_annotation_service/project/${projectId}/list`, {
      params: {
        page: 1,
        size: 100,
        status: '测试通过',
        ...(taskTemplateType ? { template_type: taskTemplateType } : {}),
      },
    })
    const data = response?.data?.data || response?.data || response
    const options = (data?.items || []).map((service: any) => ({
      id: service.id,
      name: service.name || service.service_name || `服务-${service.id}`,
      description: service.description || service.status || '-',
      base_url: service.base_url || service.access_url,
    }))
    setOnlineAnnotationServiceOptions(options)
    return options
  }, [projectId, taskTemplateType])

  const fetchOnlineNotebookServiceOptions = useCallback(async () => {
    if (!projectId) return []

    const response = await apiClient.get(`/notebooks/${projectId}/list`, {
      params: {
        biz_type: 'machine_learning',
        status: '运行中',
        ...(taskTemplateType ? { usage: taskTemplateType } : {}),
        page: 1,
        size: 100,
        is_ml_debug: true,
      },
    })
    const data = response?.data?.data || response?.data || response
    const options = (data?.items || []).map((service: any) => ({
      id: service.id,
      name: service.instance_name || service.name || `服务-${service.id}`,
      description: service.description || service.status || '-',
      base_url: buildProxyPredictUrl(service),
    }))
    setOnlineNotebookServiceOptions(options)
    return options
  }, [projectId, taskTemplateType])

  const getServiceTypeLabel = useCallback((serviceType: AnnotationServiceType) => {
    if (serviceType === 'model_deployment') return '模型部署'
    if (serviceType === 'online_annotation_service') return '在线标注服务'
    return '在线Notebook服务'
  }, [])

  const getSelectedServiceOptions = useCallback((serviceType: AnnotationServiceType) => {
    if (serviceType === 'model_deployment') return modelDeploymentOptions
    if (serviceType === 'online_annotation_service') return onlineAnnotationServiceOptions
    return onlineNotebookServiceOptions
  }, [modelDeploymentOptions, onlineAnnotationServiceOptions, onlineNotebookServiceOptions])

  const loadServiceOptions: CascaderProps['loadData'] = async (selectedOptions) => {
    const targetOption = selectedOptions[selectedOptions.length - 1] as CascaderOption | undefined
    if (!targetOption || !projectId) return
    if (targetOption.children) return

    const serviceType = targetOption.value as AnnotationServiceType
    targetOption.loading = true
    setServiceCascaderOptions((prev) => prev.map((option) => (
      option.value === serviceType
        ? { ...option, loading: true }
        : option
    )))

    try {
      const services = serviceType === 'model_deployment'
        ? await fetchModelDeploymentOptions()
        : serviceType === 'online_annotation_service'
          ? await fetchOnlineAnnotationServiceOptions()
          : await fetchOnlineNotebookServiceOptions()
      const children = services.map((service) => ({
        value: service.id,
        label: service.name,
        isLeaf: true,
        base_url: service.base_url,
      }))
      updateCascaderChildren(serviceType, children, children.length === 0)
      if (!children.length) {
        message.warning(`${getServiceTypeLabel(serviceType)}下暂无可用数据`)
      }
    }
    catch (error: any) {
      updateCascaderChildren(serviceType, [], true)
      message.error(error?.message || '获取服务列表失败')
    }
  }

  useEffect(() => {
    if (!visible || !initialConfig?.model_id || !initialConfig?.service_type) return

    form.setFieldsValue({
      service_selector: [initialConfig.service_type, initialConfig.model_id],
    })

    const expectedServiceType = initialConfig.service_type

    if (expectedServiceType === 'model_deployment') {
      const matchedModelDeployment = modelDeploymentOptions.find((item) => item.id === initialConfig.model_id)
      if (!matchedModelDeployment) return
      form.setFieldsValue({
        service_selector: [expectedServiceType, initialConfig.model_id],
      })
      return
    }

    const matchedService = getSelectedServiceOptions(expectedServiceType).find((item) => item.id === initialConfig.model_id)
    if (matchedService) {
      form.setFieldsValue({
        service_selector: [expectedServiceType, initialConfig.model_id],
      })
    }
  }, [
    form,
    initialConfig?.model_id,
    initialConfig?.service_type,
    modelDeploymentOptions,
    onlineAnnotationServiceOptions,
    onlineNotebookServiceOptions,
    getSelectedServiceOptions,
    visible,
  ])

  useEffect(() => {
    if (!visible || !projectId || !initialConfig?.model_id) return
    if (modelDeploymentOptions.length || onlineAnnotationServiceOptions.length || onlineNotebookServiceOptions.length) return

    const hydrateInitialSelection = async () => {
      try {
        const [deployments, services, notebooks] = await Promise.all([
          fetchModelDeploymentOptions(),
          fetchOnlineAnnotationServiceOptions(),
          fetchOnlineNotebookServiceOptions(),
        ])

        updateCascaderChildren('model_deployment', deployments.map((item) => ({
          value: item.id,
          label: item.name,
          isLeaf: true,
          base_url: item.base_url,
        })), deployments.length === 0)

        updateCascaderChildren('online_annotation_service', services.map((item) => ({
          value: item.id,
          label: item.name,
          isLeaf: true,
          base_url: item.base_url,
        })), services.length === 0)

        updateCascaderChildren('online_notebook_service', notebooks.map((item) => ({
          value: item.id,
          label: item.name,
          isLeaf: true,
          base_url: item.base_url,
        })), notebooks.length === 0)
      }
      catch {
        // 初始回显失败时保持静默，避免重复弹错
      }
    }

    void hydrateInitialSelection()
  }, [
    initialConfig?.model_id,
    modelDeploymentOptions.length,
    onlineAnnotationServiceOptions.length,
    onlineNotebookServiceOptions.length,
    projectId,
    taskTemplateType,
    fetchModelDeploymentOptions,
    fetchOnlineAnnotationServiceOptions,
    fetchOnlineNotebookServiceOptions,
    updateCascaderChildren,
    visible,
  ])

  const handleCancel = () => {
    form.resetFields()
    onCancel()
  }

  const handleConfirm = async () => {
    if (!taskId) {
      message.error('任务ID不存在')
      return
    }

    try {
      const values = await form.validateFields()
      const selectedPath = values.service_selector as [AnnotationServiceType, number]
      const serviceType = selectedPath?.[0]
      const modelId = selectedPath?.[1]
      const selectedService = getSelectedServiceOptions(serviceType).find((item) => item.id === modelId)
      const selectedCascaderOption = serviceCascaderOptions
        .find((item) => item.value === serviceType)
        ?.children?.find((item) => item.value === modelId)
      const serviceName = selectedService?.name || selectedCascaderOption?.label || initialConfig?.service_name
      const baseUrl = selectedService?.base_url || selectedCascaderOption?.base_url || initialConfig?.base_url
      setLoading(true)

      await labelTaskService.saveModelConfig({
        task_id: taskId,
        model_id: modelId,
        param_config_json: {
          service_type: serviceType,
          serviceName,
          base_url: baseUrl,
        },
      })

      message.success('配置保存成功')
      onConfirm?.({
        model_id: modelId,
        service_type: serviceType,
        base_url: baseUrl,
        service_name: serviceName,
      })
      onCancel()
    }
    catch (error: any) {
      if (error?.errorFields) return
      message.error(error?.message || '保存配置失败')
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title="标注配置"
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={560}
      destroyOnClose
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item
          name="service_selector"
          label={<span className="text-base font-medium">选择服务</span>}
          rules={[{ required: true, message: '请选择服务' }]}
        >
          <Cascader
            options={serviceCascaderOptions}
            placeholder="请先选择服务类型，再选择具体服务"
            loadData={loadServiceOptions}
            changeOnSelect={false}
            displayRender={() => {
              const path = serviceSelector
              if (!path?.[0] || path[1] == null) return ''
              const typeNode = serviceCascaderOptions.find((o) => o.value === path[0])
              const child = typeNode?.children?.find((c) => c.value === path[1])
              if (child?.label) return child.label
              if (
                initialConfig?.model_id === path[1]
                && initialConfig?.service_type === path[0]
                && initialConfig?.service_name
              ) {
                return initialConfig.service_name
              }
              return String(path[1])
            }}
          />
        </Form.Item>

        {/* <Form.Item shouldUpdate noStyle>
          {() => {
            const selectedPath = form.getFieldValue('service_selector') as [AnnotationServiceType, number] | undefined
            const selectedType = selectedPath?.[0] || initialConfig?.service_type
            const selectedId = selectedPath?.[1]
            const currentOption = selectedType === 'model_deployment'
              ? modelDeploymentOptions.find((item) => item.id === selectedId)
              : onlineAnnotationServiceOptions.find((item) => item.id === selectedId)
            const fallbackName = initialConfig?.service_name

            if (!currentOption && !fallbackName) return null

            return (
              <div className="mb-6 rounded-md bg-[#f8fafc] px-4 py-3">
                <div className="text-sm text-[#0f172a]">{currentOption?.name || fallbackName}</div>
                <Text type="secondary">
                  {selectedType === 'model_deployment' ? '模型部署' : '在线标注服务'}
                  {currentOption?.description ? ` · ${currentOption.description}` : ''}
                  {selectedType === 'online_annotation_service' && currentOption?.base_url ? ` · ${currentOption.base_url}` : ''}
                </Text>
              </div>
            )
          }}
        </Form.Item> */}

        <div className="flex justify-end gap-3">
          <Button onClick={handleCancel} disabled={loading}>取消</Button>
          <Button type="primary" loading={loading} onClick={handleConfirm}>确定</Button>
        </div>
      </Form>
    </Modal>
  )
}

export default AnnotationServiceConfigModal
