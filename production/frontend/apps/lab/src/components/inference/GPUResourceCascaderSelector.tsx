import React from 'react'
import { Cascader, Form, InputNumber, Select } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'

const { Option } = Select
interface GPUResourceCascaderSelectorProps {
  form: any
  gpuCascaderOptions: any[]
  onLoadData: (selectedOptions: any[]) => void
  loading?: boolean
}
const createLimitValidator = (form: any, requestFieldPath: (string | number)[], errorMessage: string) => {
  return (_: any, value: number) => {
    const requestValue = form.getFieldValue(requestFieldPath)
    if (value && requestValue !== undefined && value < requestValue) {
      return Promise.reject(new Error(errorMessage))
    }
    return Promise.resolve()
  }
}
/**
 * GPU资源级联选择器组件
 */
const GPUResourceCascaderSelector: React.FC<GPUResourceCascaderSelectorProps> = ({ form, gpuCascaderOptions, onLoadData, loading = false }) => {
  return (
    <div className="create-inference-gpu-resource">
      <div className="create-inference-gpu-resource-title">
        <span>显卡资源配置</span>
        <InfoCircleOutlined className="create-inference-gpu-resource-info" />
      </div>
      <div className="create-inference-gpu-resource-panel">
        <div className="create-inference-gpu-resource-grid">
          <Form.Item name="gpu_type" label="显卡类型及型号" rules={[{ required: true, message: '请选择显卡类型及型号' }]}>
            <Cascader className="create-inference-gpu-resource-control" placeholder="请选择显卡类型及型号" options={gpuCascaderOptions} loadData={onLoadData} changeOnSelect={false} loading={loading} disabled={loading} />
          </Form.Item>
          <Form.Item name="gpu_count" label="显卡数量" rules={[{ required: true, message: '请选择显卡数量' }]}>
            <Select placeholder="请选择显卡数量" className="create-inference-gpu-resource-control" disabled={loading}>
              {Array.from({ length: 8 }, (_, i) => i + 1).map((count) => (
                <Option key={count} value={count}>
                  {count}
                  张
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name={['graphics_card_resource', 'cpu_request']} label="CPU请求" rules={[{ required: true, message: '请输入CPU请求' }]} initialValue={0.5}>
            <InputNumber min={0} step={0.1} placeholder="请输入CPU请求" className="create-inference-gpu-resource-control" addonAfter="Core" disabled={loading} />
          </Form.Item>
          <Form.Item
            name={['graphics_card_resource', 'cpu_limit']}
            label="CPU限制"
            dependencies={[['graphics_card_resource', 'cpu_request']]}
            rules={[
              { required: true, message: '请输入CPU限制' },
              {
                validator: createLimitValidator(form, ['graphics_card_resource', 'cpu_request'], 'CPU限制必须大于或等于CPU请求的值'),
              },
            ]}
            initialValue={16.0}
          >
            <InputNumber min={0} step={0.1} placeholder="请输入CPU限制" className="create-inference-gpu-resource-control" addonAfter="Core" disabled={loading} />
          </Form.Item>
          <Form.Item name={['graphics_card_resource', 'memory_request']} label="内存请求" rules={[{ required: true, message: '请输入内存请求' }]} initialValue={0.5}>
            <InputNumber min={0} step={0.1} placeholder="请输入内存请求" className="create-inference-gpu-resource-control" addonAfter="GB" disabled={loading} />
          </Form.Item>
          <Form.Item
            name={['graphics_card_resource', 'memory_limit']}
            label="内存限制"
            dependencies={[['graphics_card_resource', 'memory_request']]}
            rules={[
              { required: true, message: '请输入内存限制' },
              {
                validator: createLimitValidator(form, ['graphics_card_resource', 'memory_request'], '内存限制必须大于或等于内存请求的值'),
              },
            ]}
            initialValue={16.0}
          >
            <InputNumber min={0} step={0.1} placeholder="请输入内存限制" className="create-inference-gpu-resource-control" addonAfter="GB" disabled={loading} />
          </Form.Item>
        </div>
      </div>
    </div>
  )
}
export default GPUResourceCascaderSelector
