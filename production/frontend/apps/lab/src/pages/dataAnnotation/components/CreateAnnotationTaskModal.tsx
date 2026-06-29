import React, { useMemo, useState } from 'react'
import {
  Button,
  Form,
  Input,
  Layout,
  Radio,
  Space,
  Typography,
  message,
} from 'antd'
import { ArrowLeftOutlined, FileTextOutlined, PictureOutlined } from '@ant-design/icons'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { type CreateLabelTaskRequest, type SourceType, labelTaskService } from '../../../services/dataAnnotationService'
import { DatasetCascaderSelector } from '@/components/inference'
import type { TrainingDatasetItem } from '@/types/training'
import './CreateAnnotationTaskModal.css'

const { Text } = Typography

const datasetTypeOptions = [
  { value: 'text-generation', label: '文本生成', icon: <FileTextOutlined /> },
  { value: 'image-understanding', label: '图像理解', icon: <PictureOutlined /> },
  { value: 'image-generation', label: '图像生成', icon: <PictureOutlined /> },
]

const CreateAnnotationTaskModal: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm()
  const [datasetName, setDatasetName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [selectedDatasetObj, setSelectedDatasetObj] = useState<any | null>(null)
  const [selectedDatasetVersionObj, setSelectedDatasetVersionObj] = useState<any | null>(null)

  const initialDatasetType = useMemo(() => {
    const datasetType = searchParams.get('dataset_type')
    return datasetType === 'image-understanding' || datasetType === 'image-generation'
      ? datasetType
      : 'text-generation'
  }, [searchParams])

  const [datasetType, setDatasetType] = useState<string>(initialDatasetType)

  const currentDatasetTypeLabel = datasetTypeOptions.find((item) => item.value === datasetType)?.label ?? '文本生成'

  const calculateNewDatasetName = (datasetName: string, selectedVersionStr: string) => {
    const match = selectedVersionStr?.match(/v(\d+)/i)
    if (match) {
      const n = parseInt(match[1], 10)
      return `${datasetName}-v${n + 1}`
    }
    return `${datasetName}-v1`
  }

  const resetDatasetSelection = () => {
    setSelectedDatasetObj(null)
    setSelectedDatasetVersionObj(null)
    setDatasetName('')
    form.setFieldsValue({ data_to_infer: undefined })
  }

  const handleDatasetCascaderChange = (value: any[], selectedOptions?: any[]) => {
    if (!value || value.length === 0) {
      resetDatasetSelection()
      return
    }

    if (value.length >= 2 && selectedOptions && selectedOptions.length >= 2) {
      const datasetNameValue = value[1]
      const rowData = (selectedOptions[1] as { data?: TrainingDatasetItem })?.data
      setSelectedDatasetObj(rowData ?? null)

      if (value.length >= 3 && selectedOptions.length >= 3 && selectedOptions[2]) {
        const versionData = selectedOptions[2].versionData

        setSelectedDatasetVersionObj(versionData || null)

        const newDatasetName = calculateNewDatasetName(datasetNameValue, String(value[2]))
        setDatasetName(newDatasetName)
      }
      else {
        setSelectedDatasetVersionObj(null)
        setDatasetName('')
      }
    }
  }

  const handleDatasetTypeChange = (value: string) => {
    setDatasetType(value)
    resetDatasetSelection()
  }

  const goBack = () => {
    const datasetTypeQuery = datasetType ? `?dataset_type=${datasetType}` : ''
    navigate(`/project/${projectId}/data-annotation${datasetTypeQuery}`)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      if (!projectId) {
        message.error('项目ID不存在')
        return
      }

      if (!selectedDatasetVersionObj) {
        message.error('请选择需要标注的数据集和版本')
        return
      }

      setLoading(true)

      const datasetId = selectedDatasetVersionObj?.id || selectedDatasetObj?.id

      const requestData: CreateLabelTaskRequest = {
        task_type: 'online',
        task_name: values.task_name || '',
        dataset_description: selectedDatasetVersionObj.description || '',
        project_id: Number(projectId),
        source: 'existed_dataset' as SourceType,
        source_dataset_id: datasetId || 0,
        override: values.override === 'override',
      }

      await labelTaskService.create(requestData)
      message.success('创建标注任务成功')
      goBack()
    }
    catch {
      // antd Form validation and request interceptor already surface errors.
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <Layout.Content className="create-annotation-task-page mr-[10px] mb-[21px] h-[calc(100%_-_21px)] min-h-0 overflow-hidden rounded-lg bg-[var(--lab-color-surface-elevated)] shadow-[0_2px_8px_rgba(24,24,25,0.06)]">
      <div className="create-annotation-header flex h-[103px] items-start justify-between border-b border-[var(--lab-color-divider)] pt-5 pr-7 pl-7">
        <div>
          <div className="flex h-7 items-center">
            <Button
              type="text"
              className="create-annotation-back mr-[18px] !h-6 !w-6 !p-0 text-[21px] leading-6"
              icon={<ArrowLeftOutlined />}
              onClick={goBack}
            />
            <h1 className="m-0 h-7 text-xl font-medium leading-7 text-[var(--lab-color-text-primary)]">创建标注任务</h1>
          </div>
        </div>
        <div className="create-annotation-actions mt-0.5 flex gap-2.5">
          <Button onClick={goBack}>取消</Button>
          <Button type="primary" onClick={handleSubmit} loading={loading}>
            提交
          </Button>
        </div>
      </div>

      <div className="pt-7 pl-[26px]">
        <Form
          form={form}
          layout="vertical"
          className="create-annotation-form w-[900px]"
          initialValues={{
            override: 'new_version',
            sourceType: 'existed_dataset',
          }}
        >
          <Form.Item
            name="task_name"
            label="任务名称"
            rules={[
              { required: true, message: '请输入任务名称' },
              { min: 2, max: 64, message: '长度为2-64个字符' },
              { pattern: /^[a-zA-Z0-9\u4E00-\u9FA5][a-zA-Z0-9_\u4E00-\u9FA5-]*$/, message: '支持中英文、数字、下划线、中划线，不能以下划线或中划线开头' },
            ]}
          >
            <Input className="create-annotation-task-name" placeholder="请输入任务名称" />
          </Form.Item>

          <Form.Item label="数据集类型">
            <Radio.Group
              className="create-annotation-radio-buttons"
              onChange={(e) => handleDatasetTypeChange(e.target.value)}
              value={datasetType}
            >
              {datasetTypeOptions.map((option) => (
                <Radio.Button key={option.value} value={option.value}>
                  <Space size={6}>
                    {/* {option.icon} */}
                    <span>{option.label}</span>
                  </Space>
                </Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>

          <div className="mb-7">
            <Text className="create-annotation-section-title mb-2.5 block h-[22px] text-sm leading-[22px] text-[var(--lab-color-text-primary)]">数据选择</Text>
            <div className="create-annotation-selected-data-type mb-2.5">
              {currentDatasetTypeLabel}
            </div>
            <div className="flex items-center">
              <div className="create-annotation-dataset-selector">
                <DatasetCascaderSelector
                  form={form}
                  placeholder="请选择需要标注的数据集"
                  modalTitle="待标注数据集"
                  selectionNotice="请选择已发布的数据集版本作为标注数据源；图像生成首版仅支持 SFT image-prompt 数据，标注时只能补充或修改文字。"
                  onChange={handleDatasetCascaderChange}
                  label=""
                  selectButtonText="+ 选择"
                  statsQuery={{ dataset_type: [datasetType] }}
                  listDatasetType={datasetType}
                />
              </div>
              <Text className="ml-4 text-sm leading-5 text-[var(--lab-color-text-muted)]">
                数据量:
                {`${selectedDatasetVersionObj?.total_samples || '0'}条`}
              </Text>
            </div>
          </div>

          <div className="mb-7">
            <Text className="create-annotation-section-title mb-2.5 block h-[22px] text-sm leading-[22px] text-[var(--lab-color-text-primary)]">处理后数据集</Text>
            <Form.Item name="override" className="!mb-0">
              <Radio.Group className="create-annotation-radio-buttons">
                <Radio.Button value="new_version">新增版本</Radio.Button>
              </Radio.Group>
            </Form.Item>

            <div className="mt-[22px] flex h-[52px] w-[580px] items-center rounded-md bg-[var(--lab-color-surface-control-muted)] px-4 text-sm leading-5 text-[var(--lab-color-text-muted)]">
              {datasetName ? `数据集名称: ${datasetName}` : '数据集名称: -'}
            </div>
          </div>
        </Form>
      </div>
    </Layout.Content>
  )
}

export default CreateAnnotationTaskModal
