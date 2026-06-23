import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Card, Cascader, Col, Form, InputNumber, Row, Select, Switch, Typography } from 'antd'
import { ExclamationCircleOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { getKubernetesAllocatableResources, getKubernetesClusterGPUTypes, getKubernetesClusterGPUs } from '@/services/kubernetesService'
import { useConfigStore } from '@/stores/configStore'

const { Option } = Select
const { Text } = Typography

const createLimitValidator = (
  form: any,
  requestFieldPath: (string | number)[],
  errorMessage: string,
) => {
  return (_: any, value: number) => {
    const requestValue = form.getFieldValue(requestFieldPath)
    if (value && requestValue !== undefined && value < requestValue) {
      return Promise.reject(new Error(errorMessage))
    }
    return Promise.resolve()
  }
}

const createMaxValidator = (
  maxValue: number | undefined,
  errorMessage: string,
) => {
  return (_: any, value: number) => {
    if (maxValue !== undefined && value !== undefined && value > maxValue) {
      return Promise.reject(new Error(errorMessage))
    }
    return Promise.resolve()
  }
}

interface ResourceConfigProps {
  projectId?: number
  SupportedGpuCategory?: { value: string, name: string, description?: string }[]
  onAllocatableResourcesChange?: (resources: AllocatableResources | undefined) => void
  /** 为 true 时不从 localStorage taskInfo 回显，由父组件通过 form 反填 */
  skipLocalStorageEcho?: boolean
  simpleGpuCountSelect?: boolean
  /** 为 true 时不渲染外层 Card，便于嵌入已有卡片 */
  embed?: boolean
  /** CPU/内存使用顶层字段 resource_cpu_* / resource_memory_*（与 Notebook 创建接口一致） */
  useFlatResourceFields?: boolean
  /** 展示 GPU 开关；关闭时不展示显卡表单项且不校验显卡 */
  gpuOptional?: boolean
  /** 选中显卡型号后回传（与 CreateNotebook 中 selectedGpuOption 用法一致） */
  onGpuSelectionChange?: (option: {
    model?: string
    memory?: number | string
    type?: string
    value?: string | number
  } | null) => void
  /** 可分配资源接口加载状态变化 */
  onResourceLoadingChange?: (loading: boolean) => void
  /** belle 回显场景只把可分配值作为上限，不覆盖详情已有资源值 */
  preserveResourceValuesOnAllocatableChange?: boolean
}

interface AllocatableResources {
  cpu?: number
  gpu_brand?: string
  gpu_count?: number
  gpu_memory_per_card?: number
  gpu_model?: string
  ratio?: number
  gpu_usage?: string
  memory?: number
  queue_group_id?: number
}

const calculateBelleResourceValue = (
  total: number | undefined,
  ratio: number | undefined,
  availableGpuCount: number | undefined,
  selectedGpuCount: number | undefined,
) => {
  if (!total || !availableGpuCount || !selectedGpuCount)
    return undefined

  return Math.floor((total * (ratio ?? 1) / availableGpuCount) * selectedGpuCount)
}

const hasBelleAllocatableResource = (resource: AllocatableResources | undefined) => {
  return Boolean(resource?.gpu_count && resource?.cpu && resource?.memory)
}

const clampBelleResourceValue = (value: unknown, maxValue: number | undefined) => {
  if (maxValue === undefined)
    return value
  if (value === undefined || value === null || value === '')
    return maxValue

  return Math.min(Number(value), maxValue)
}

const ResourceConfig: React.FC<ResourceConfigProps> = ({
  projectId,
  SupportedGpuCategory,
  onAllocatableResourcesChange,
  skipLocalStorageEcho,
  simpleGpuCountSelect = false,
  embed = false,
  useFlatResourceFields = false,
  gpuOptional = false,
  onGpuSelectionChange,
  onResourceLoadingChange,
  preserveResourceValuesOnAllocatableChange = false,
}) => {
  const [gpuCascaderOptions, setGpuCascaderOptions] = useState<any[]>([])
  const [showGpuNotAdaptedWarning, setShowGpuNotAdaptedWarning] = useState(false)
  const [gpuTypeHelp, setGpuTypeHelp] = useState<string>('')
  const [isInitialized, setIsInitialized] = useState(false) // 标记是否已初始化
  const [allocatableResourcesLoading, setAllocatableResourcesLoading] = useState(false)
  const form = Form.useFormInstance()
  const selectedGpuCount = Form.useWatch('gpu_count', form) as number | undefined

  const [allocatableResources, setAllocatableResources] = useState<AllocatableResources>()
  const { config, providerType } = useConfigStore()
  const isBelleProvider = config?.PROVIDER_TYPE === providerType
  const shouldWaitForAllocatableResourcesEcho = (() => {
    if (simpleGpuCountSelect || !isBelleProvider || isInitialized)
      return false

    const gpuTypeValue = form.getFieldValue('gpu_type')
    const gpuModelValue = form.getFieldValue('gpu_model')
    return Array.isArray(gpuTypeValue) && gpuTypeValue.length === 2 && Boolean(gpuModelValue)
  })()
  const belleCpuLimit = calculateBelleResourceValue(
    allocatableResources?.cpu,
    allocatableResources?.ratio,
    allocatableResources?.gpu_count,
    selectedGpuCount,
  )
  const belleMemoryLimit = calculateBelleResourceValue(
    allocatableResources?.memory,
    allocatableResources?.ratio,
    allocatableResources?.gpu_count,
    selectedGpuCount,
  )

  const resetBelleResourceFields = useCallback(() => {
    const graphicsCardResource = form.getFieldValue('graphics_card_resource') || {}
    form.setFieldsValue({
      gpu_count: null,
      gpu_memory: undefined,
      graphics_card_resource: {
        ...graphicsCardResource,
        cpu_request: undefined,
        cpu_limit: undefined,
        memory_request: undefined,
        memory_limit: undefined,
      },
    })
  }, [form])

  useEffect(() => {
    if (!isBelleProvider)
      return

    if (allocatableResources && !hasBelleAllocatableResource(allocatableResources)) {
      resetBelleResourceFields()
      return
    }

    if (!allocatableResources || !selectedGpuCount)
      return

    const graphicsCardResource = form.getFieldValue('graphics_card_resource') || {}
    form.setFieldsValue({
      gpu_memory: allocatableResources.gpu_memory_per_card && allocatableResources.ratio !== undefined
        ? String(allocatableResources.gpu_memory_per_card * allocatableResources.ratio)
        : form.getFieldValue('gpu_memory'),
      graphics_card_resource: {
        ...graphicsCardResource,
        ...(belleCpuLimit !== undefined && {
          cpu_request: preserveResourceValuesOnAllocatableChange
            ? clampBelleResourceValue(graphicsCardResource.cpu_request, belleCpuLimit)
            : belleCpuLimit,
          cpu_limit: preserveResourceValuesOnAllocatableChange
            ? clampBelleResourceValue(graphicsCardResource.cpu_limit, belleCpuLimit)
            : belleCpuLimit,
        }),
        ...(belleMemoryLimit !== undefined && {
          memory_request: preserveResourceValuesOnAllocatableChange
            ? clampBelleResourceValue(graphicsCardResource.memory_request, belleMemoryLimit)
            : belleMemoryLimit,
          memory_limit: preserveResourceValuesOnAllocatableChange
            ? clampBelleResourceValue(graphicsCardResource.memory_limit, belleMemoryLimit)
            : belleMemoryLimit,
        }),
      },
    })
  }, [allocatableResources, belleCpuLimit, belleMemoryLimit, form, isBelleProvider, preserveResourceValuesOnAllocatableChange, resetBelleResourceFields, selectedGpuCount])

  // 回显显卡资源配置中的值（当非 skipLocalStorageEcho 时从 localStorage 读取）
  useEffect(() => {
    if (skipLocalStorageEcho) return
    const cpuResource = JSON.parse(localStorage.getItem('taskInfo') || 'null')
    if (cpuResource?.graphics_card_resource) {
      const { graphics_card_resource } = cpuResource
      form.setFieldsValue({
        graphics_card_resource: {
          cpu_request: graphics_card_resource.cpu_request,
          cpu_limit: graphics_card_resource.cpu_limit,
          memory_request: graphics_card_resource.memory_request,
          memory_limit: graphics_card_resource.memory_limit,
        },
      })
    }
  }, [form, skipLocalStorageEcho])
  // 获取显卡资源列表（第一级：显卡类型）
  const { data: gpuResourceOptions = [], isLoading: gpuResourceOptionsLoading, error: gpuResourceOptionsError } = useQuery({
    queryKey: ['gpuResources', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('项目ID不能为空')
      const res = await getKubernetesClusterGPUs(projectId)
      // const z = await getKubernetesClusterGPUTypes(projectId, 'CPU');
      const data = res.map((item: any) => ({
        value: item.category,
        label: item.category,
        isLeaf: false, // 标记为非叶子节点，表示有子节点
      }))
      return data
    },
    enabled: !!projectId,
  })
  useEffect(() => {
    onResourceLoadingChange?.(allocatableResourcesLoading || shouldWaitForAllocatableResourcesEcho)
  }, [allocatableResourcesLoading, onResourceLoadingChange, shouldWaitForAllocatableResourcesEcho])

  // 当查询数据加载完成后，更新 Cascader 选项
  useEffect(() => {
    if (gpuResourceOptions && gpuResourceOptions.length > 0) {
      setGpuCascaderOptions(gpuResourceOptions)
    }
  }, [gpuResourceOptions])

  // 处理回显逻辑：当表单中有 gpu_type 和 gpu_model 时，自动加载对应的选项（仅在初始化时执行一次）
  useEffect(() => {
    if (!projectId || isInitialized) return // 如果已初始化，直接返回

    const gpuTypeValue = form.getFieldValue('gpu_type')
    const gpuModelValue = form.getFieldValue('gpu_model')

    // 如果 gpu_type 是数组且长度为 2，且有 gpu_model，说明需要回显
    if (Array.isArray(gpuTypeValue) && gpuTypeValue.length === 2 && gpuModelValue) {
      const [cardType] = gpuTypeValue

      // 检查第一级选项是否已加载
      const typeOption = gpuCascaderOptions.find((opt) => opt.value === cardType)

      // 如果第一级选项存在但还没有子节点，需要加载
      if (typeOption && !typeOption.children) {
        // 加载第二级数据
        getKubernetesClusterGPUTypes(projectId, cardType)
          .then((models) => {
            const children = models.map((model: any) => ({
              value: model.model,
              label: model.desc || model.type,
              memory: model.memory,
              model: model.model,
              type: model.type,
              isLeaf: true,
            }))

            // 更新选项
            setGpuCascaderOptions((prevOptions) => {
              return prevOptions.map((option) => {
                if (option.value === cardType) {
                  return {
                    ...option,
                    children,
                  }
                }
                return option
              })
            })

            const matchedModel = children.find((child: any) => child.model === gpuModelValue)
            if (matchedModel) {
              // 设置正确的 gpu_type 值
              form.setFieldsValue({
                gpu_type: [cardType, matchedModel.value],
                gpu_model: matchedModel.model,
                gpu_memory: isBelleProvider ? undefined : matchedModel.memory,
                k8s_resource_type: matchedModel.type, // 保存type字段
              })

              // 检查是否支持
              if (SupportedGpuCategory && SupportedGpuCategory.length > 0) {
                const isSupported = SupportedGpuCategory.some(
                  (category) => category.value === matchedModel.model,
                )
                setShowGpuNotAdaptedWarning(!isSupported)
                setGpuTypeHelp(!isSupported ? '当前gpu型号暂未进行模型训练适配，将使用默认镜像开启训练' : '')
              }

              // 获取可分配资源
              if (!simpleGpuCountSelect && isBelleProvider) {
                setAllocatableResourcesLoading(true)
                getKubernetesAllocatableResources(projectId, cardType, matchedModel.value)
                  .then((allocatableResource) => {
                    if (!hasBelleAllocatableResource(allocatableResource)) {
                      setAllocatableResources(undefined)
                      onAllocatableResourcesChange?.(undefined)
                      resetBelleResourceFields()
                      return
                    }
                    setAllocatableResources(allocatableResource)
                    onAllocatableResourcesChange?.(allocatableResource)
                  })
                  .catch((error) => {
                    console.error('Failed to load allocatable resources:', error)
                    setAllocatableResources(undefined)
                    onAllocatableResourcesChange?.(undefined)
                    resetBelleResourceFields()
                  })
                  .finally(() => {
                    setAllocatableResourcesLoading(false)
                  })
              }

              // 标记为已初始化
              setIsInitialized(true)
              onGpuSelectionChange?.(matchedModel)
            }
          })
          .catch((error) => {
            console.error('Failed to load GPU models for echo:', error)
          })
      }
      else if (typeOption && typeOption.children) {
        // 如果子节点已加载，直接匹配
        const matchedModel = typeOption.children.find((child: any) => child.model === gpuModelValue)
        if (matchedModel) {
          form.setFieldsValue({
            gpu_type: [cardType, matchedModel.value],
            gpu_model: matchedModel.model,
            gpu_memory: isBelleProvider ? undefined : matchedModel.memory,
            k8s_resource_type: matchedModel.type, // 保存type字段
          })

          // 检查是否支持
          if (SupportedGpuCategory && SupportedGpuCategory.length > 0) {
            const isSupported = SupportedGpuCategory.some(
              (category) => category.value === matchedModel.model,
            )
            setShowGpuNotAdaptedWarning(!isSupported)
            setGpuTypeHelp(!isSupported ? '当前gpu型号暂未进行模型训练适配，将使用默认镜像开启训练' : '')
          }

          // 标记为已初始化
          setIsInitialized(true)
          onGpuSelectionChange?.(matchedModel)
        }
      }
    }
  }, [gpuCascaderOptions, form, projectId, SupportedGpuCategory, isInitialized, simpleGpuCountSelect, onGpuSelectionChange, onAllocatableResourcesChange, isBelleProvider, resetBelleResourceFields])

  // 处理GPU资源加载错误
  useEffect(() => {
    if (gpuResourceOptionsError) {
      // message.error('加载显卡类型失败，请稍后重试');
      console.error('Failed to load GPU resources:', gpuResourceOptionsError)
    }
  }, [gpuResourceOptionsError])

  // 加载级联数据的第二级（显卡型号）
  const loadGpuModelData = useCallback(async (selectedOptions: any[]) => {
    const targetOption = selectedOptions[selectedOptions.length - 1]
    targetOption.loading = true

    try {
      if (!projectId) {
        throw new Error('项目ID不能为空')
      }
      const resourceType = targetOption.value
      const models = await getKubernetesClusterGPUTypes(projectId, resourceType)
      const children = models.map((model: any) => ({
        value: model.model,
        label: model.desc || model.type,
        memory: model.memory,
        model: model.model,
        type: model.type,
        isLeaf: true,
      }))
      targetOption.loading = false
      targetOption.children = children

      // 更新状态，触发重新渲染
      setGpuCascaderOptions((prevOptions) => {
        return prevOptions.map((option) => {
          if (option.value === resourceType) {
            return {
              ...option,
              loading: false,
              children,
            }
          }
          return option
        })
      })
    }
    catch (error) {
      targetOption.loading = false
      setGpuCascaderOptions((prevOptions) => {
        return prevOptions.map((option) => {
          if (option.value === targetOption.value) {
            return {
              ...option,
              loading: false,
            }
          }
          return option
        })
      })
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      // message.error(`加载显卡型号失败：${errorMessage}，请稍后重试`);
      console.error('Failed to load GPU models:', error)
    }
  }, [projectId])

  const handleGpuCascaderChange = async (value: any, selectedOptions: any[]) => {
    if (!simpleGpuCountSelect) {
      form.setFieldsValue({ gpu_count: null })
    }

    let hasAvailableBelleResource = true
    if (!simpleGpuCountSelect && isBelleProvider && value?.length === 2) {
      setAllocatableResourcesLoading(true)
      try {
        const allocatableResource = await getKubernetesAllocatableResources(projectId, value[0], value[1])
        if (!hasBelleAllocatableResource(allocatableResource)) {
          setAllocatableResources(undefined)
          onAllocatableResourcesChange?.(undefined)
          resetBelleResourceFields()
          hasAvailableBelleResource = false
        }
        else {
          setAllocatableResources(allocatableResource)
          onAllocatableResourcesChange?.(allocatableResource)
        }
      }
      catch (error) {
        console.error('Failed to load allocatable resources:', error)
        setAllocatableResources(undefined)
        onAllocatableResourcesChange?.(undefined)
        resetBelleResourceFields()
        hasAvailableBelleResource = false
      }
      finally {
        setAllocatableResourcesLoading(false)
      }
    }
    else if (isBelleProvider) {
      setAllocatableResources(undefined)
      onAllocatableResourcesChange?.(undefined)
      resetBelleResourceFields()
    }

    // 当选择完成时（选择了类型和型号），设置gpu_model和gpu_memory
    if (value && value.length === 2) {
      // 优先从selectedOptions获取，因为它包含完整的选项信息
      let modelOption: any = null
      if (selectedOptions && selectedOptions.length === 2) {
        modelOption = selectedOptions[1]
      }
      else {
        // 如果selectedOptions不可用，从gpuCascaderOptions中查找
        const typeOption = gpuCascaderOptions.find((opt) => opt.value === value[0])
        if (typeOption && typeOption.children) {
          modelOption = typeOption.children.find((child: any) => child.value === value[1])
        }
      }

      if (modelOption && modelOption.memory !== undefined && modelOption.model !== undefined) {
        form.setFieldsValue({
          gpu_model: modelOption.model,
          gpu_memory: isBelleProvider ? undefined : modelOption.memory,
          k8s_resource_type: modelOption.type, // 保存type字段
        })

        // 检查选择的GPU型号是否在SupportedGpuCategory中
        if (SupportedGpuCategory && SupportedGpuCategory.length > 0) {
          const isSupported = SupportedGpuCategory.some(
            (category) => category.value === modelOption.model,
          )
          setShowGpuNotAdaptedWarning(!isSupported)
          setGpuTypeHelp(!isSupported ? '当前gpu型号暂未进行模型训练适配，将使用默认镜像开启训练' : '')
        }
        else {
          setShowGpuNotAdaptedWarning(false)
          setGpuTypeHelp('')
        }
        if (isBelleProvider && !hasAvailableBelleResource) {
          resetBelleResourceFields()
        }
        onGpuSelectionChange?.(modelOption)
      }
      else {
        onGpuSelectionChange?.(null)
      }
    }
    else {
      setShowGpuNotAdaptedWarning(false)
      setGpuTypeHelp('')
      if (simpleGpuCountSelect) {
        form.setFieldsValue({
          gpu_model: undefined,
          gpu_memory: undefined,
          k8s_resource_type: undefined,
        })
      }
      onGpuSelectionChange?.(null)
    }
  }

  const notebookLayout = gpuOptional && useFlatResourceFields

  const gpuTypeRules = notebookLayout
    ? [
        ({ getFieldValue }: any) => ({
          validator(_: unknown, value: unknown) {
            if (!getFieldValue('gpu_enabled')) return Promise.resolve()
            if (!value || !Array.isArray(value) || (value as unknown[]).length !== 2) {
              return Promise.reject(new Error('请选择显卡类型及型号'))
            }
            return Promise.resolve()
          },
        }),
      ]
    : [{ required: true, message: '请选择显卡类型及型号' }]

  const gpuCountRules = notebookLayout
    ? [
        ({ getFieldValue }: any) => ({
          validator(_: unknown, value: unknown) {
            if (!getFieldValue('gpu_enabled')) return Promise.resolve()
            if (value == null || value === '' || (typeof value === 'number' && value < 1)) {
              return Promise.reject(new Error('请选择显卡数量'))
            }
            return Promise.resolve()
          },
        }),
      ]
    : [{ required: true, message: '请选择显卡卡数配置' }]

  const gpuPickerBlock = (
    <>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item
            name="gpu_type"
            label="显卡类型及型号"
            rules={gpuTypeRules}
            help={gpuTypeHelp ? (
              <span style={{ color: '#faad14' }}>
                <ExclamationCircleOutlined className="mr-1" />
                {gpuTypeHelp}
              </span>
            ) : undefined}
            validateStatus={gpuTypeHelp ? 'warning' : ''}
          >
            <Cascader
              placeholder="请选择显卡类型及型号"
              options={gpuCascaderOptions}
              loadData={loadGpuModelData}
              changeOnSelect={false}
              loading={gpuResourceOptionsLoading}
              disabled={!projectId}
              onChange={handleGpuCascaderChange}
            />
          </Form.Item>
        </Col>
        <Col span={8} hidden>
          <Form.Item
            name="gpu_model"
            label="显卡型号"
          >
            <Text></Text>
          </Form.Item>
        </Col>
        <Col span={8} hidden>
          <Form.Item
            name="gpu_memory"
            label="显卡内存"
          >
            <Text></Text>
          </Form.Item>
        </Col>
        <Col span={8} hidden>
          <Form.Item
            name="k8s_resource_type"
            label="显卡类型"
          >
            <Text></Text>
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            name="gpu_count"
            label={notebookLayout ? '显卡数量' : '显卡 卡数配置'}
            help={!simpleGpuCountSelect && isBelleProvider ? (
              !allocatableResources?.gpu_count ? (
                <span style={{ color: '#faad14' }}>
                  <ExclamationCircleOutlined className="mr-1" />
                  当前暂无可用显卡资源
                </span>
              )
                : undefined
            ) : undefined}
            rules={gpuCountRules}
          >
            <Select placeholder="请选择显卡数量">
              {Array.from({
                length: simpleGpuCountSelect
                  ? 8
                  : isBelleProvider
                    ? allocatableResources?.gpu_count || 0
                    : 8,
              }, (_, i) => i + 1).map((count) => (
                <Option key={count} value={count}>
                  {count}
                  张
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>
      {notebookLayout && (
        <Alert
          message="显卡资源有限,建议根据实际需求合理选择显卡资源规格。"
          type="info"
          showIcon
          className="mt-4"
        />
      )}
    </>
  )

  const flatCpuMemoryBlock = useFlatResourceFields && (
    <>
      <div className="mb-6">
        <Text strong className="block mb-4">CPU配置</Text>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="resource_cpu_request"
              label="CPU 请求"
              rules={[
                { required: true, message: '请输入CPU请求' },
                { type: 'number', min: 0.1 },
                ({ getFieldValue }: any) => ({
                  validator(_: unknown, value: number) {
                    const limit = getFieldValue('resource_cpu_limit')
                    if (value && limit && value > limit) {
                      return Promise.reject(new Error('CPU请求值不能大于CPU限制值'))
                    }
                    return Promise.resolve()
                  },
                }),
              ]}
            >
              <InputNumber
                min={0.1}
                step={0.1}
                placeholder="请输入CPU请求"
                className="w-full"
                addonAfter="Core"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="resource_cpu_limit"
              label="CPU 限制"
              rules={[
                { required: true, message: '请输入CPU限制' },
                { type: 'number', min: 1 },
                ({ getFieldValue }: any) => ({
                  validator(_: unknown, value: number) {
                    const request = getFieldValue('resource_cpu_request')
                    if (value && request && value < request) {
                      return Promise.reject(new Error('CPU限制值不能小于CPU请求值'))
                    }
                    return Promise.resolve()
                  },
                }),
              ]}
            >
              <InputNumber
                min={1}
                step={0.1}
                placeholder="请输入CPU限制"
                className="w-full"
                addonAfter="Core"
              />
            </Form.Item>
          </Col>
        </Row>
      </div>
      <div className="mb-6">
        <Text strong className="block mb-4">内存配置</Text>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="resource_memory_request"
              label="内存请求"
              rules={[
                { required: true, message: '请输入内存请求' },
                { type: 'number', min: 0.1 },
                ({ getFieldValue }: any) => ({
                  validator(_: unknown, value: number) {
                    const limit = getFieldValue('resource_memory_limit')
                    if (value && limit && value > limit) {
                      return Promise.reject(new Error('内存请求值不能大于内存限制值'))
                    }
                    return Promise.resolve()
                  },
                }),
              ]}
            >
              <InputNumber
                min={0.1}
                step={0.1}
                placeholder="请输入内存请求"
                className="w-full"
                addonAfter="GB"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="resource_memory_limit"
              label="内存限制"
              rules={[
                { required: true, message: '请输入内存限制' },
                { type: 'number', min: 1 },
                ({ getFieldValue }: any) => ({
                  validator(_: unknown, value: number) {
                    const request = getFieldValue('resource_memory_request')
                    if (value && request && value < request) {
                      return Promise.reject(new Error('内存限制值不能小于内存请求值'))
                    }
                    return Promise.resolve()
                  },
                }),
              ]}
            >
              <InputNumber
                min={1}
                step={0.1}
                placeholder="请输入内存限制"
                className="w-full"
                addonAfter="GB"
              />
            </Form.Item>
          </Col>
        </Row>
      </div>
    </>
  )

  const nestedCpuMemoryBlock = !useFlatResourceFields && (
    <>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item
            name={['graphics_card_resource', 'cpu_request']}
            label="CPU 请求"
            rules={[
              { required: true, message: '请输入CPU请求' },
              { validator: createMaxValidator(belleCpuLimit, 'CPU请求不能超过可分配CPU上限') },
            ]}
            initialValue={0.5}
          >
            <InputNumber
              min={0}
              max={isBelleProvider ? belleCpuLimit : undefined}
              step={0.1}
              placeholder="请输入CPU请求"
              className="w-full"
              addonAfter="Core"
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            name={['graphics_card_resource', 'cpu_limit']}
            label="CPU 限制"
            dependencies={[['graphics_card_resource', 'cpu_request']]}
            rules={[
              { required: true, message: '请输入CPU限制' },
              {
                validator: createLimitValidator(
                  form,
                  ['graphics_card_resource', 'cpu_request'],
                  'CPU限制必须大于或等于CPU请求的值',
                ),
              },
              { validator: createMaxValidator(belleCpuLimit, 'CPU限制不能超过可分配CPU上限') },
            ]}
            initialValue={16}
          >
            <InputNumber
              min={0}
              max={isBelleProvider ? belleCpuLimit : undefined}
              step={0.1}
              placeholder="请输入CPU限制"
              className="w-full"
              addonAfter="Core"
            />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item
            name={['graphics_card_resource', 'memory_request']}
            label="内存请求"
            rules={[
              { required: true, message: '请输入内存请求' },
              { validator: createMaxValidator(belleMemoryLimit, '内存请求不能超过可分配内存上限') },
            ]}
            initialValue={0.5}
          >
            <InputNumber
              min={0}
              max={isBelleProvider ? belleMemoryLimit : undefined}
              step={0.1}
              placeholder="请输入内存请求"
              className="w-full"
              addonAfter="GB"
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            name={['graphics_card_resource', 'memory_limit']}
            label="内存限制"
            dependencies={[['graphics_card_resource', 'memory_request']]}
            rules={[
              { required: true, message: '请输入内存限制' },
              {
                validator: createLimitValidator(
                  form,
                  ['graphics_card_resource', 'memory_request'],
                  '内存限制必须大于或等于内存请求的值',
                ),
              },
              { validator: createMaxValidator(belleMemoryLimit, '内存限制不能超过可分配内存上限') },
            ]}
            initialValue={16}
          >
            <InputNumber
              min={0}
              max={isBelleProvider ? belleMemoryLimit : undefined}
              step={0.1}
              placeholder="请输入内存限制"
              className="w-full"
              addonAfter="GB"
            />
          </Form.Item>
        </Col>
      </Row>
    </>
  )

  const innerContent = notebookLayout
    ? (
        <>
          {flatCpuMemoryBlock}
          <div className="mb-6">
            <div className="mb-4 flex h-8 items-center gap-4">
              <Text strong className="leading-8">显卡配置</Text>
              <Form.Item
                name="gpu_enabled"
                valuePropName="checked"
                noStyle
              >
                <Switch />
              </Form.Item>
            </div>
            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.gpu_enabled !== currentValues.gpu_enabled}
            >
              {({ getFieldValue }) => (getFieldValue('gpu_enabled') ? <div>{gpuPickerBlock}</div> : null)}
            </Form.Item>
          </div>
        </>
      )
    : (
        <>
          {gpuPickerBlock}
          {nestedCpuMemoryBlock}
        </>
      )

  const wrapped = embed
    ? innerContent
    : (
        <Card
          title={(
            <div className="flex items-center !rounded-md">
              <ThunderboltOutlined className="mr-2 !text-red-500" />
              显卡资源配置
            </div>
          )}
          size="small"
        >
          {innerContent}
        </Card>
      )

  return <>{wrapped}</>
}

export default ResourceConfig
