import { useState } from 'react'
import { Form, Input, Select, Typography, message } from 'antd'
import type { FormInstance } from 'antd/es/form'
import { DeploymentUnitOutlined, RadarChartOutlined } from '@ant-design/icons'
import type { TrainedModelVersion } from './deployServiceFormTypes'
import type { ItemListResponse } from '@/types/model'
import { type DeplopServerDetailResponse, ModelSource } from '@/types/inference/deplop'
import { mlModelService } from '@/services/mlModelService'
import type { MlModelVersion } from '@/types/mlModel'

function findMlModelRow(rows: ItemListResponse[], id: unknown) {
  return rows.find((i) => i.id === id || String(i.id) === String(id))
}
const { Title } = Typography
const SERVICE_NAME_RULES = [
  { required: true, message: '请输入服务名称' },
  { min: 2, max: 64, message: '服务名称长度为2-64个字符' },
  {
    pattern: /^[^\u4E00-\u9FA5]+$/,
    message: '服务名称不能包含中文',
  },
]
const SERVICE_MACHINE_NAME_RULES = [
  { required: true, message: '请输入服务名称' },
  { min: 2, max: 64, message: '服务名称长度为2-64个字符' },
  { pattern: /^(?!_|-)[\u4E00-\u9FA5a-zA-Z0-9._-]*$/, message: '服务名称只支持中英文、数字、小数点、中划线(-)、下划线(_)，且不能以下划线和中划线开头，不允许空格和特殊符号' },
]
const MODEL_SOURCE_OPTIONS = [
  {
    key: 'trained_model',
    title: '训练生成',
    description: '通过训练生成的模型部署在线服务',
    icon: <DeploymentUnitOutlined className="text-[32px] text-[var(--lab-color-brand-primary)]" />,
  },
  {
    key: 'base_model',
    title: '模型仓库',
    description: '选择模型仓库的模型部署在线服务',
    icon: <RadarChartOutlined className="text-[32px] text-[var(--lab-color-brand-primary)]" />,
  },
] as const
export interface DeployServiceBasicFormProps {
  form: FormInstance
  isMachine: boolean
  twice?: boolean
  readyDelopMsg?: DeplopServerDetailResponse
  mlModelListLoading: boolean
  mlModelSelectOptions: ItemListResponse[]
  projectId?: string
  mlRedeployVersionList?: MlModelVersion[] | null
  selectedSource?: string
  modelVersion?: string
  modelsOptions: any[]
  trainedModelVersions: TrainedModelVersion[]
  onMachineModelChange?: (resetKey: string) => void
}
export function DeployServiceBasicForm(props: DeployServiceBasicFormProps) {
  const { form, isMachine, twice, readyDelopMsg, mlModelListLoading, mlModelSelectOptions, projectId, mlRedeployVersionList, selectedSource, modelVersion, modelsOptions, trainedModelVersions, onMachineModelChange } = props
  const [mlModelVersions, setMlModelVersions] = useState<MlModelVersion[]>([])
  const [mlModelVersionsLoading, setMlModelVersionsLoading] = useState(false)
  /** 详情重新部署：版本列表由父组件拉取（与 trainedModelVersions 一致）；创建页用本地拉取结果 */
  const isMlDetailRedeploy = !!twice && isMachine
  const mlVersionSelectOptions = isMlDetailRedeploy
    ? (mlRedeployVersionList ?? [])
    : mlModelVersions
  const clearMachineNotebookSelection = () => {
    form.setFieldsValue({
      ml_notebook_id: undefined,
      ml_notebook_source_ref: '',
    })
    form.setFields([
      { name: 'ml_notebook_id', errors: [] },
      { name: 'ml_notebook_source_ref', errors: [] },
    ])
  }
  const handleMachineModelChange = async (modelId: string | number) => {
    const row = findMlModelRow(mlModelSelectOptions, modelId)
    form.setFieldsValue({
      ml_model_id: modelId,
      modelName: row?.model_name,
      ml_model_version: undefined,
      ml_model_version_id: '',
      ml_handle_upload_id: '',
      ml_notebook_id: undefined,
      ml_notebook_source_ref: '',
    })
    form.setFields([{ name: 'ml_handle_upload_id', errors: [] }])
    clearMachineNotebookSelection()
    onMachineModelChange?.(`${modelId}-${Date.now()}`)
    if (!projectId)
      return
    const name = row?.model_name?.trim()
    if (!name) {
      setMlModelVersions([])
      message.warning('未找到模型名称')
      return
    }
    setMlModelVersionsLoading(true)
    try {
      const list = await mlModelService.getVersions(parseInt(projectId, 10), name, '已完成')
      const arr = Array.isArray(list) ? list : []
      if (arr.length === 0)
        message.warning('该模型暂无版本，请先在模型管理中创建版本')
      setMlModelVersions(arr)
    }
    catch (e) {
      console.error('Failed to load ml model versions:', e)
      message.error('加载机器模型版本失败')
      setMlModelVersions([])
    }
    finally {
      setMlModelVersionsLoading(false)
    }
  }
  const handleMachineVersionChange = (version: string) => {
    const selectedVersion = mlVersionSelectOptions.find((item) => String(item.model_version) === String(version))
    form.setFieldsValue({
      ml_model_version: version,
      /** 提交时映射为 ml_model_config.ml_model_id（版本记录主键） */
      ml_model_version_id: selectedVersion?.id ?? '',
    })
    clearMachineNotebookSelection()
  }
  if (isMachine) {
    return (
      <div className="mb-10">
        <Title level={4} className="mb-6">基本信息</Title>
        <Form form={form} labelAlign="right" labelCol={{ flex: '110px' }}>
          <Form.Item name="source" hidden initialValue={ModelSource.MachineModel}>
            <Input />
          </Form.Item>
          <Form.Item name="ml_model_version_id" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="服务名称" rules={SERVICE_MACHINE_NAME_RULES}>
            <Input placeholder="请输入服务名称" className="max-w-2xl" disabled={!!(twice && readyDelopMsg)} />
          </Form.Item>

          <Form.Item label="模型来源">
            <span className="text-gray-700">我的模型</span>
          </Form.Item>

          <Form.Item label="选择模型" required className="mb-6">
            <div className="flex gap-6 max-w-2xl items-center">
              <Form.Item className="!flex-2 mb-[0]" name="ml_model_id" rules={[{ required: true, message: '请选择模型名称' }]} style={{ flex: 3 }}>
                <Select
                  placeholder="请选择模型名称"
                  // disabled={!!(twice && readyDelopMsg)}
                  loading={mlModelListLoading}
                  onChange={handleMachineModelChange}
                >
                  {mlModelSelectOptions.map((item) => (
                    <Select.Option key={item.id} value={item.id}>
                      {item.model_name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="ml_model_version" rules={[{ required: true, message: '请选择版本号' }]} className="!flex-1 flex-1 mb-0">
                <Select
                  placeholder="请选择版本"
                  title="版本号"
                  // disabled={!!(twice && readyDelopMsg)}
                  loading={isMlDetailRedeploy ? false : mlModelVersionsLoading}
                  onChange={handleMachineVersionChange}
                  onFocus={() => {
                    if (!form.getFieldValue('ml_model_id'))
                      message.warning('请先选择模型名称')
                  }}
                >
                  {mlVersionSelectOptions.map((item) => (
                    <Select.Option key={`${item.id}-${String(item.model_version)}`} value={String(item.model_version)}>
                      {item.model_version}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </div>
          </Form.Item>

          <Form.Item name="modelName" hidden rules={[{ required: true, message: '请选择模型' }]}>
            <Input />
          </Form.Item>
        </Form>
      </div>
    )
  }
  const versionInfo = trainedModelVersions.find((item) => item.value === modelVersion)
  const versionSource = versionInfo?.model_source_type === 'training'
    ? `${versionInfo?.task_name}>${versionInfo?.task_version}>${versionInfo?.checkpoint}`
    : `${versionInfo?.notebook_name}>${versionInfo?.notebook_path}`
  return (
    <div className="mb-10">
      <Title level={4} className="mb-6">基本信息</Title>
      <Form form={form} labelAlign="right" labelCol={{ flex: '110px' }}>
        <Form.Item name="name" label="服务名称" rules={SERVICE_NAME_RULES}>
          <Input placeholder="请输入服务名称" className="max-w-2xl" disabled={!!(twice && readyDelopMsg)} />
        </Form.Item>

        <Form.Item name="source" label="模型来源" rules={[{ required: true, message: '请选择模型来源' }]}>
          <div className="flex gap-4 max-w-2xl">
            {MODEL_SOURCE_OPTIONS.map((option) => (
              <div
                key={option.key}
                className={`
                    flex-1 p-4 rounded-lg cursor-pointer transition-all duration-200
                    border-2 hover:shadow-md
                    ${selectedSource === option.key
                ? 'border-[#7d81ff] bg-blue-50'
                : 'border-gray-200 bg-white hover:border-blue-300'}
                  `}
                onClick={() => form.setFieldValue('source', option.key)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {option.icon}
                  </div>
                  <div className="flex-1">
                    <div className={`text-lg font-semibold mb-1 ${selectedSource === option.key ? 'text-blue-600' : 'text-gray-800'}`}>
                      {option.title}
                    </div>
                    <div className="text-sm text-gray-600">
                      {option.description}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Form.Item>

        <Form.Item label="选择模型" required className="mb-6">
          <div className={`flex gap-6 ${modelVersion ? 'max-w-3xl' : 'max-w-2xl'} items-start`}>
            <Form.Item name="modelName" rules={[{ required: true, message: '请选择模型名称' }]} style={{ flex: modelVersion ? 1 : 2, marginBottom: 0 }}>
              <Select
                placeholder="请选择模型名称"
                onFocus={() => {
                  if (!form.getFieldValue('source'))
                    message.warning('请先选择模型来源')
                }}
              >
                {modelsOptions.map((item) => (
                  <Select.Option key={item.name} label={item.name} value={item.name}>
                    {item.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            {selectedSource === 'trained_model' && (
              <Form.Item name="model_version" rules={[{ required: true, message: '请选择版本号' }]} style={{ flex: 1, marginBottom: 0 }}>
                <Select
                  placeholder="请选择版本"
                  title="版本号"
                  onFocus={() => {
                    if (trainedModelVersions.length === 0)
                      message.warning('请先选择模型名称')
                  }}
                >
                  {trainedModelVersions.map((item) => (
                    <Select.Option key={item.value} value={item.value}>
                      {item.label}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            )}

            {selectedSource === 'trained_model' && modelVersion && (
              <div className="flex flex-1 items-center min-h-[32px]">
                <span className="text-gray-600 leading-[32px]">
                  版本来源：
                  {versionSource}
                </span>
              </div>
            )}
          </div>
        </Form.Item>
      </Form>
    </div>
  )
}
