import React, { useCallback, useEffect, useState } from 'react'
import { Cascader, Form, Radio, Select, message } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useLocation, useParams } from 'react-router-dom'
import { ModelService } from '@/services/modelsApi'
import { inferenceServiceApi } from '@/services/inferenceService'

const { Option } = Select

interface ModelListOption {
  name: string
  value: string
}

function normalizeModelVersions(versions: unknown): any[] {
  if (Array.isArray(versions)) return versions
  return versions ? [versions as any] : []
}

function trainedVersionCascaderChildren(list: any[]) {
  return list.map((v: any) => ({
    value: v.id,
    label: v.model_version || v.task_version || `版本 ${v.id}`,
    isLeaf: true,
  }))
}

function mergeTrainedModelVersionChildren(prev: any[], modelName: string, children: any[]): any[] {
  const trainedRoot = prev.find((o: any) => o.value === 'trained')
  if (!trainedRoot) return prev
  return prev.map((o: any) => {
    if (o.value !== 'trained') return o
    return {
      ...trainedRoot,
      children: (trainedRoot.children || []).map((ch: any) =>
        ch.value !== modelName ? ch : { ...ch, isLeaf: false, children },
      ),
    }
  })
}

export interface BenchmarkEvaluationModelOrServiceFieldsProps {
  form: FormInstance
}

/**
 * 基准评估：待评估模型/服务（模型类型 + 级联或服务选择 + 服务提供商）
 */
export const BenchmarkEvaluationModelService: React.FC<BenchmarkEvaluationModelOrServiceFieldsProps> = ({
  form,
}) => {
  const { projectId } = useParams()
  const location = useLocation()
  const modelType = Form.useWatch('model_type', form) ?? 'model'

  const [baseModels, setBaseModels] = useState<any[]>([])
  const [trainedModels, setTrainedModels] = useState<any[]>([])
  const [modelCascaderOptions, setModelCascaderOptions] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [modelList, setModelList] = useState<ModelListOption[]>()

  useEffect(() => {
    const projectEnumValues = JSON.parse(localStorage.getItem('projectEnumValues') || '{}')
    const list: ModelListOption[] = projectEnumValues?.enums_by_module?.benchmark?.[0]?.options ?? []
    setModelList(list)
  }, [])

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const [trainedModelsResponse, baseModelsResponse] = await Promise.all([
          ModelService.getBaseModelsByProjectId(Number(projectId), {
            page: 1,
            size: 100,
          }),
          ModelService.getBaseModels({
            page: 1,
            size: 100,
            is_available: true,
          }),
        ])

        const trained = (trainedModelsResponse.items || []).map((model: any) => ({
          ...model,
          name: model.model_name || model.name,
        }))
        const base = (baseModelsResponse.items || []).map((model: any) => ({
          ...model,
          name: model.name,
        }))

        setTrainedModels(trained)
        setBaseModels(base)
      }
      catch (error) {
        console.error('获取模型列表失败:', error)
        message.error('获取模型列表失败')
      }
    }

    if (projectId && modelType === 'model') {
      fetchModels()
    }
  }, [projectId, modelType])

  useEffect(() => {
    setModelCascaderOptions([
      {
        value: 'base',
        label: '模型仓库',
        disabled: baseModels.length === 0,
        children: baseModels.map((m: any) => ({
          value: m.id,
          label: m.name || m.model_name,
          isLeaf: true,
        })),
      },
      {
        value: 'trained',
        label: '我的模型',
        disabled: trainedModels.length === 0,
        children: trainedModels.map((m: any) => {
          const modelName = m.model_name || m.name
          return {
            value: modelName,
            label: modelName,
            isLeaf: false,
          }
        }),
      },
    ])
  }, [baseModels, trainedModels])

  const loadModelCascaderData = useCallback(async (selectedOptions: any[]) => {
    if (!projectId) return
    const targetOption = selectedOptions[selectedOptions.length - 1]
    const root = selectedOptions[0]
    if (!root || root.value !== 'trained' || selectedOptions.length !== 2) return

    const modelName = String(targetOption.value)
    targetOption.loading = true
    setModelCascaderOptions((opts) => [...opts])

    try {
      const raw = await ModelService.getModelVersions(Number(projectId), modelName, '已完成')
      const list = normalizeModelVersions(raw)
      targetOption.children = trainedVersionCascaderChildren(list)
      if (!targetOption.children.length) {
        message.warning('该模型暂无已完成版本')
      }
    }
    catch (error) {
      console.error('加载模型版本失败:', error)
      message.error('加载模型版本失败')
      targetOption.children = []
    }
    finally {
      targetOption.loading = false
      setModelCascaderOptions((opts) => [...opts])
    }
  }, [projectId])

  const displayModelCascader = useCallback(
    (labels: any[], selectedOptions?: any[]) => {
      const path = selectedOptions
      if (path?.[0]?.value === 'trained' && path.length >= 3) {
        return `${path[1].label}/${path[2].label}`
      }
      if (path?.[0]?.value === 'base' && path.length >= 2) {
        return path[1].label
      }
      const v = form.getFieldValue('model_cascader') as any[] | undefined
      if (!v?.length) return ''
      if (v[0] === 'trained' && v.length >= 3) {
        const root = modelCascaderOptions.find((o: any) => o.value === 'trained')
        const mid = root?.children?.find((c: any) => c.value === v[1])
        const leaf = mid?.children?.find((c: any) => String(c.value) === String(v[2]))
        if (leaf?.label) return `${mid?.label ?? v[1]}/${leaf.label}`
        return String(mid?.label ?? v[1] ?? '')
      }
      if (v[0] === 'base' && v.length >= 2) {
        const root = modelCascaderOptions.find((o: any) => o.value === 'base')
        const leaf = root?.children?.find((c: any) => String(c.value) === String(v[1]))
        return leaf?.label ?? labels?.[labels.length - 1] ?? ''
      }
      return labels?.[labels.length - 1] ?? ''
    },
    [form, modelCascaderOptions],
  )

  useEffect(() => {
    const editData = (location.state as any)?.editData
    const cloneData = (location.state as any)?.cloneData
    const data = editData || cloneData
    const editModelId = data?.models?.[0]?.model_id
    if (!data || !editModelId || !projectId || (!baseModels.length && !trainedModels.length)) {
      return
    }
    if (data.model_type && data.model_type !== 'model') {
      return
    }

    let cancelled = false

    const resolve = async () => {
      const idStr = String(editModelId)
      const inBase = baseModels.some((m: any) => String(m.id) === idStr)
      if (inBase) {
        if (!cancelled) {
          form.setFieldsValue({ model_cascader: ['base', editModelId] })
        }
        return
      }

      for (const item of trainedModels) {
        const modelName = item.model_name || item.name
        if (!modelName) continue
        try {
          const raw = await ModelService.getModelVersions(Number(projectId), modelName, '已完成')
          const list = normalizeModelVersions(raw)
          const hit = list.find((ver: any) => String(ver.id) === idStr)
          if (hit) {
            if (!cancelled) {
              setModelCascaderOptions((prev) =>
                mergeTrainedModelVersionChildren(prev, modelName, trainedVersionCascaderChildren(list)),
              )
              form.setFieldsValue({ model_cascader: ['trained', modelName, hit.id] })
            }
            return
          }
        }
        catch (e) {
          console.error(e)
        }
      }
    }

    void resolve()
    return () => {
      cancelled = true
    }
  }, [baseModels, trainedModels, location.state, form, projectId])

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const response = await inferenceServiceApi.list({
          projectId: projectId!,
          page: 1,
          size: 100,
          status: '测试通过',
        })
        setServices(response.items || [])
      }
      catch (error) {
        console.error('获取服务列表失败:', error)
      }
    }

    if (projectId && modelType === 'service') {
      fetchServices()
    }
  }, [projectId, modelType])

  return (
    <>
      <Form.Item
        label={(
          <span>
            待评估模型/服务
            {' '}
            <span className="text-[var(--lab-color-danger)]">*</span>
          </span>
        )}
        name="model_type"
        rules={[{ required: true, message: '请选择模型或服务' }]}
      >
        <Radio.Group
          onChange={(e) => {
            form.setFieldsValue({ model_cascader: undefined, model_id: undefined, model_provider: undefined })
            if (e.target.value === 'service') {
              form.setFieldsValue({
                gpu_type: undefined,
                gpu_model: undefined,
                gpu_memory: undefined,
                gpu_count: undefined,
                k8s_resource_type: undefined,
              })
            }
          }}
        >
          <Radio value="model">模型</Radio>
          <Radio value="service">服务</Radio>
        </Radio.Group>
      </Form.Item>

      {modelType === 'model' ? (
        <Form.Item
          name="model_cascader"
          label="请选择待评估模型"
          rules={[
            { required: true, message: '请选择待评估模型' },
            {
              validator: (_, val) => {
                if (!val || !Array.isArray(val)) {
                  return Promise.reject(new Error('请选择待评估模型'))
                }
                if (val[0] === 'base' && val.length >= 2) {
                  return Promise.resolve()
                }
                if (val[0] === 'trained' && val.length >= 3) {
                  return Promise.resolve()
                }
                return Promise.reject(new Error('请选择模型来源、模型及已完成版本'))
              },
            },
          ]}
        >
          <Cascader
            options={modelCascaderOptions}
            loadData={loadModelCascaderData}
            placeholder="请先选择模型来源，再选择具体模型与版本"
            changeOnSelect={false}
            displayRender={displayModelCascader}
          />
        </Form.Item>
      ) : (
        <>
          <Form.Item
            name="model_id"
            label="请选择待评估服务"
            rules={[{ required: true, message: '请选择待评估服务' }]}
          >
            <Select placeholder="请选择待评估服务">
              {services.map((service: any) => (
                <Option key={service.id} value={service.id}>
                  {service.name || service.service_name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="model_provider"
            label="服务提供商"
            rules={[{ required: true, message: '请选择服务提供商' }]}
          >
            <Select placeholder="请选择服务提供商" allowClear>
              {(modelList ?? []).map((item) => (
                <Option key={item.value} value={item.value}>
                  {item.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </>
      )}
    </>
  )
}
