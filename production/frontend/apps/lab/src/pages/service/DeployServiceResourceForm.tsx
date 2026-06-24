import { Cascader, Form, InputNumber, Radio, Select, Typography } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { useCallback, useEffect, useMemo } from 'react'
import type { RegistryMirrorImage } from '@/services/RegistryMirrorService'

const { Title } = Typography
export interface DeployServiceResourceFormProps {
  form: FormInstance
  gpuCascaderOptions: any[]
  loadGpuModelData: (selectedOptions: any[]) => Promise<void>
  isMlDeployContext: boolean
  mirrorTypeList: string[]
  mirrors?: RegistryMirrorImage[]
}
export function DeployServiceResourceForm(props: DeployServiceResourceFormProps) {
  const { form, gpuCascaderOptions, loadGpuModelData, isMlDeployContext, mirrorTypeList, mirrors } = props
  const gpuType = Form.useWatch('gpu_type', form)
  const mirrorType = Form.useWatch('mirror_type', form)
  const resourceType = String(gpuType?.[0] ?? '').toUpperCase()
  const isGpuResource = resourceType === 'GPU'
  const availableMirrorTypeList = useMemo(() => {
    if (isMlDeployContext)
      return ['ML']
    return mirrorTypeList.filter((item) => item !== 'DGI Server')
  }, [isMlDeployContext, mirrorTypeList])
  const isMirrorDisabled = useCallback((item: string) => {
    if (isGpuResource)
      return item !== 'vLLM'
    return item === ''
  }, [isGpuResource])
  useEffect(() => {
    if (isMlDeployContext || !mirrorType)
      return
    if (availableMirrorTypeList.includes(mirrorType) && !isMirrorDisabled(mirrorType))
      return
    const fallbackType = availableMirrorTypeList.find((item) => !isMirrorDisabled(item))
    if (fallbackType)
      form.setFieldValue('mirror_type', fallbackType)
  }, [availableMirrorTypeList, form, isMirrorDisabled, isMlDeployContext, mirrorType, resourceType])
  return (
    <div className="mb-10">
      <Title level={4} className="mb-6">资源信息</Title>
      <Form
        form={form}
        labelAlign="right"
        labelCol={{ flex: '110px' }}
        initialValues={{
          type: '',
          deploy_count: null,
          mirror_type: isMlDeployContext ? 'ML' : 'vLLM',
          ReasoningMirror: '',
        }}
      >
        <div className="flex gap-6 !w-2xl justify-between">
          <Form.Item label="CPU请求" required className="flex-1 mb-6">
            <div className="flex gap-2 items-center">
              <Form.Item name="resource_cpu_request" noStyle>
                <InputNumber placeholder="请输入CPU请求" className="max-w-2xl !w-full" min={0.1} step={0.1} />
              </Form.Item>
              <div>Core</div>
            </div>
          </Form.Item>
          <Form.Item label="CPU限制" required className="flex-1 mb-6">
            <div className="flex gap-2 items-center">
              <Form.Item name="resource_cpu_limit" noStyle>
                <InputNumber placeholder="请输入CPU限制" className="max-w-2xl !w-full" min={1} step={1} precision={0} />
              </Form.Item>
              <div>Core</div>
            </div>
          </Form.Item>
        </div>
        <div className="flex gap-6 !w-2xl justify-between">
          <Form.Item label="内存请求" required className="flex-1 mb-6">
            <div className="flex gap-2 items-center">
              <Form.Item name="resource_memory_request" noStyle>
                <InputNumber placeholder="请输入内存请求" className="max-w-2xl !w-full" min={0.1} step={0.1} />
              </Form.Item>
              <div>GB</div>
            </div>
          </Form.Item>
          <Form.Item label="内存限制" required className="flex-1 mb-6">
            <div className="flex gap-2 items-center">
              <Form.Item name="resource_memory_limit" noStyle>
                <InputNumber placeholder="请输入内存限制" className="max-w-2xl !w-full" min={1} step={1} precision={0} />
              </Form.Item>
              <div>GB</div>
            </div>
          </Form.Item>
        </div>

        <Form.Item label="显卡配置" required className="mb-6">
          <div className="flex gap-6 max-w-2xl items-start">
            <Form.Item className="mb-[0]" name="gpu_type" rules={[{ required: true, message: '请选择显卡类型或型号' }]} style={{ flex: 3 }}>
              <Cascader placeholder="请选择显卡类型及型号" options={gpuCascaderOptions} loadData={loadGpuModelData} />
            </Form.Item>

            <Form.Item name="gpu_count" rules={[{ required: true, message: '请选择数量' }]} className="flex-1 mb-0">
              <Select placeholder="显卡数量">
                {Array.from({ length: 8 }, (_, i) => i + 1).map((count) => (
                  <Select.Option key={count} value={count}>
                    {count}
                    张
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>
        </Form.Item>

        <Form.Item
          name="deploy_count"
          label="部署实例数"
          rules={[{ required: true, message: '请输入部署实例数' },
            {
              pattern: /^[1-9]\d*$/,
              message: '部署实例数必须为正整数',
            },
          ]}
        >
          <InputNumber placeholder="请输入部署实例数" className="!w-40" />
        </Form.Item>

        <Form.Item name="mirror_type" label="镜像类型" rules={[{ required: true, message: '请选择镜像类型' }]}>
          <Radio.Group>
            {availableMirrorTypeList.map((item) => (<Radio.Button key={item} value={item} disabled={isMirrorDisabled(item)}>{item}</Radio.Button>))}
          </Radio.Group>
        </Form.Item>

        <Form.Item name="ReasoningMirror" label="镜像" rules={[{ required: true, message: '请选择镜像' }]}>
          <Select className="max-w-2xl" placeholder="请选择镜像">
            {mirrors?.map((item) => (<Select.Option key={item.id} label={item.id} value={item.id}>{item.image}</Select.Option>))}
          </Select>
        </Form.Item>
      </Form>
    </div>
  )
}
