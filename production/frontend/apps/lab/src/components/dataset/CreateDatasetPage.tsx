import React, { useCallback, useEffect, useState } from 'react'
import { Button, Form, Input, Layout, Popover, Radio, Space, Tooltip, message } from 'antd'
import { CloudUploadOutlined, DownloadOutlined, FileTextOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import type { RcFile } from 'antd/es/upload'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import datasetTypeRoleImage from '../../assets/dataset_type_role.png'
import datasetTypeBasedImage from '../../assets/dataset_type_based.png'
import datasetTypeRoleTextImage from '../../assets/dataset_type_role_text.png'
import datasetTypeAlpacaImage from '../../assets/dataset_type_alpaca.png'
import datasetTypeAlpacaMessagesImage from '../../assets/dataset_type_alpaca_messages.png'
import DataAttributeFormSection from './DataAttributeFormSection'
import { DescriptionTextArea } from '@/components/common/DescriptionTextArea.tsx'
import ChunkFileUploader from '@/components/common/ChunkFileUploader'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'
import { trainingDatasetService } from '@/services/trainingApi'
import { attributeService } from '@/services/inferenceService'
import type { DatasetEnumConfig } from '@/types/enum'
import type { BusinessAttrGroupItem, BusinessAttrItem } from '@/types/inference'
import type { Attribute as TrainingAttribute } from '@/types/training'
import { downloadDatasetExample } from '@/utils/download'
import './CreateDatasetPage.css'

function buildAttrValuesFromFormValues(values: Record<string, unknown>, attrGroupList: BusinessAttrGroupItem[]): TrainingAttribute[] {
  const allItems = attrGroupList.flatMap((g) => getDataAttrItems(g))
  const result: TrainingAttribute[] = []
  allItems.forEach((attr) => {
    if (attr.input_type === '手动输入') {
      const inputValue = values[`manualInput_${attr.id}`]
      if (inputValue !== undefined && inputValue !== null && String(inputValue).trim() !== '') {
        result.push({
          attr_id: attr.id,
          attr_value: String(inputValue),
          data_type: attr.data_type,
          required_tag: attr.required_tag,
          name: attr.name,
          input_type: attr.input_type,
          multi_select: attr.multi_select,
          options: [],
        })
      }
    }
    else if (attr.input_type === '下拉选择') {
      const selectedValue = values[`dropdown_${attr.id}`]
      if (selectedValue !== undefined && selectedValue !== null && selectedValue !== '') {
        const selectedValuesArray = Array.isArray(selectedValue) ? selectedValue : [selectedValue]
        const options = selectedValuesArray.map((value: string) => ({ option_value: String(value) }))
        result.push({
          attr_id: attr.id,
          data_type: attr.data_type,
          required_tag: attr.required_tag,
          name: attr.name,
          input_type: attr.input_type,
          multi_select: attr.multi_select ?? 0,
          options,
        })
      }
    }
  })
  return result
}
const { TextArea } = Input
const TEXT_FILE_MAX_SIZE_MB = 500
const IMAGE_FILE_MAX_SIZE_MB = 1024

function getDataAttrItems(groupItem: BusinessAttrGroupItem): BusinessAttrItem[] {
  return Array.isArray(groupItem.items) ? groupItem.items : []
}
interface CreateDatasetPageProps {
  type: 'training' | 'test' | 'validation'
  usage: string
  businessType?: 'business_test' | 'business_training' | 'training_management' | 'test_management'
}
const CreateDatasetPage: React.FC<CreateDatasetPageProps> = ({ type, usage, businessType: businessTypeProp }) => {
  const navigate = useNavigate()
  const { projectId } = useParams<{
    projectId: string
  }>()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  // 状态管理
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dataSource, setDataSource] = useState<string>('text-generation')
  const [trainingMethodType, setTrainingMethodType] = useState<string>('sft')
  const [importMethod, setImportMethod] = useState<string>('本地上传')
  const [loading, setLoading] = useState(false)
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null)
  const [chunkUploadId, setChunkUploadId] = useState<string | null>(null)
  const currentDataFormat = Form.useWatch('dataFormat', form)
  const typeFromUrl = searchParams.get('type') as 'training' | 'test' | 'validation' | 'business_test' | 'business_training' | null
  const effectiveType = typeFromUrl ?? type
  const isTestDataset = effectiveType === 'test'
  const businessType = businessTypeProp ?? (
    effectiveType === 'business_test' || usage === 'business_test' ? 'business_test'
      : effectiveType === 'training' || effectiveType === 'validation' ? 'training_management' // 训练/验证数据集
        : effectiveType === 'test' ? 'test_management' // 测试数据集管理
          : 'training_management' // 默认
  )
  // 按分组获取业务属性列表（数据属性）
  const { data: attrGroupListRaw, isLoading: attrGroupLoading } = useQuery({
    queryKey: ['business-attr-group-list', businessType],
    queryFn: () => attributeService.groupList(businessType),
    enabled: !!businessType,
    refetchOnMount: 'always',
  })
  const attrGroupList: BusinessAttrGroupItem[] = Array.isArray(attrGroupListRaw)
    ? attrGroupListRaw
    : []
  // 数据用途选项
  const dataSourceOptions = [
    { value: 'text-generation', label: '文本生成', disabled: false, icon: <FileTextOutlined />, disabledTooltip: '文本生成' },
    { value: 'image-understanding', label: '图像理解', disabled: false, icon: <CloudUploadOutlined />, disabledTooltip: '图像理解' },
    // { value: 'image-generation', label: '图像生成', disabled: true, icon: <DatabaseOutlined />, disabledTooltip: '即将上线' },
  ]
  // 根据数据用途获取对应的数据预处理选项
  const getDataPreprocessOptions = useCallback((dataSource: string) => {
    switch (dataSource) {
      case 'text-generation':
        return [
          { value: 'sft', label: '监督学习SFT', enabled: false },
          ...(!isTestDataset ? [{ value: 'dpo', label: '偏好对齐DPO', enabled: false }] : []),
        ]
      case 'image-generation':
        return [
          { value: 'sft', label: '监督学习' },
        ]
      case 'image-understanding':
        return [
          { value: 'sft', label: '监督学习SFT' },
        ]
      default:
        return [
          { value: 'sft', label: '监督学习SFT' },
          // { value: 'dpo', label: '偏好对齐DPO' },
        ]
    }
  }, [isTestDataset])

  // 当数据用途改变时，自动设置默认的数据预处理选项
  const handleDataSourceChange = (e: any) => {
    const value = typeof e === 'string' ? e : e.target.value
    setDataSource(value)
    const options = getDataPreprocessOptions(value)
    const nextTrainingMethodType = options[0]?.value ?? trainingMethodType
    if (options.length > 0) {
      setTrainingMethodType(nextTrainingMethodType)
    }
    // 如果选择图像理解，自动设置数据格式为 role-based
    const defaultDataFormat = getDefaultDataFormat(value, nextTrainingMethodType)
    if (defaultDataFormat) {
      form.setFieldValue('dataFormat', defaultDataFormat)
    }
    // 切换数据用途时重置上传的文件
    setSelectedFile(null)
    setUploadedFileUrl(null)
    setChunkUploadId(null)
  }

  const handleTrainingMethodTypeChange = (e: any) => {
    const value = e.target.value
    setTrainingMethodType(value)

    const currentFormat = form.getFieldValue('dataFormat')
    if (!getAllowedDataFormats(dataSource, value).includes(currentFormat)) {
      form.setFieldValue('dataFormat', getDefaultDataFormat(dataSource, value))
    }
  }

  // 切换数据格式时清空已上传文件，避免格式与文件不匹配
  const handleDataFormatChange = () => {
    setSelectedFile(null)
    setUploadedFileUrl(null)
    setChunkUploadId(null)
  }
  // 数据格式选项
  const [dataFormatOptions, setDataFormatOptions] = useState<DatasetEnumConfig | null>(null)

  const getAllowedDataFormats = useCallback((nextDataSource = dataSource, nextTrainingMethodType = trainingMethodType) => {
    if (nextDataSource === 'image-understanding') {
      return ['role-based']
    }

    if (nextDataSource === 'text-generation') {
      if (!isTestDataset && nextTrainingMethodType === 'dpo') {
        return ['role-based', 'alpaca']
      }

      return ['prompt-response', 'role-based']
    }

    return dataFormatOptions?.options.map((option) => option.value) ?? []
  }, [dataFormatOptions?.options, dataSource, isTestDataset, trainingMethodType])

  const getDefaultDataFormat = useCallback((nextDataSource = dataSource, nextTrainingMethodType = trainingMethodType) => {
    const allowedFormats = getAllowedDataFormats(nextDataSource, nextTrainingMethodType)
    const availableFormats = dataFormatOptions?.options.map((option) => option.value) ?? []
    return allowedFormats.find((format) => availableFormats.includes(format)) ?? availableFormats[0]
  }, [dataFormatOptions?.options, getAllowedDataFormats, dataSource, trainingMethodType])

  useEffect(() => {
    const loadDatasetFormats = () => {
      try {
        const projectEnumValues = JSON.parse(localStorage.getItem('projectEnumValues') || '[]')
        if (projectEnumValues) {
          const dataFormatOptions = projectEnumValues.all_enums.find((item: any) => item.enum_name === 'DatasetFormat')
          dataFormatOptions.options = dataFormatOptions.options.filter((item: any) => !['business', 'prefix-suffix-middle'].includes(item.value))
          setDataFormatOptions(dataFormatOptions)
        }
      }
      catch (error) {
        console.error('解析训练数据集枚举值失败:', error)
      }
    }
    loadDatasetFormats()
  }, [])
  useEffect(() => {
    if (dataFormatOptions && dataFormatOptions.options && dataFormatOptions.options.length > 0) {
      // 根据数据源类型设置默认数据格式
      const currentFormat = form.getFieldValue('dataFormat')
      if (!currentFormat || !getAllowedDataFormats().includes(currentFormat)) {
        form.setFieldValue('dataFormat', getDefaultDataFormat())
      }
    }
  }, [dataFormatOptions, form, dataSource, trainingMethodType, getAllowedDataFormats, getDefaultDataFormat])

  useEffect(() => {
    const options = getDataPreprocessOptions(dataSource)
    if (options.length > 0 && !options.some((option) => option.value === trainingMethodType)) {
      const nextTrainingMethodType = options[0].value
      setTrainingMethodType(nextTrainingMethodType)

      const defaultDataFormat = getDefaultDataFormat(dataSource, nextTrainingMethodType)
      if (defaultDataFormat) {
        form.setFieldValue('dataFormat', defaultDataFormat)
      }
    }
  }, [dataSource, form, isTestDataset, trainingMethodType, getDataPreprocessOptions, getDefaultDataFormat])

  // 根据数据源类型获取允许的文件类型
  const getAcceptType = () => {
    if (dataSource === 'image-understanding') {
      return '.zip'
    }
    else if (usage === 'business_test') {
      return '.jsonl,.json,.xlsx,.csv'
    }
    else {
      return '.jsonl,.json,.xlsx,.csv'
    }
  }
  const getMaxFileSizeMB = () => {
    return dataSource === 'image-understanding' ? IMAGE_FILE_MAX_SIZE_MB : TEXT_FILE_MAX_SIZE_MB
  }
  const getMaxFileSizeLabel = () => {
    return dataSource === 'image-understanding' ? '1G' : '500M'
  }
  // 文件验证函数
  const validateFile = (file: RcFile): boolean => {
    // 图像理解类型只支持 zip 文件
    if (dataSource === 'image-understanding') {
      const isZip = file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'
      if (!isZip) {
        message.error('图像理解类型只支持 zip 文件格式!')
        return false
      }
    }
    else {
      // 文本生成类型支持 jsonl、json、xlsx，业务测试额外支持 csv
      const isJsonl = file.name.endsWith('.jsonl')
      const isJson = file.name.endsWith('.json') || file.type === 'application/json'
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx')
      const isCsv = file.name.endsWith('.csv') || file.type === 'text/csv'
      if (usage === 'business_test') {
        if (!isJsonl && !isJson && !isExcel && !isCsv) {
          message.error('只支持 jsonl、json、xlsx 和 csv 文件格式!')
          return false
        }
      }
      else {
        if (!isJsonl && !isJson && !isExcel) {
          message.error('只支持 jsonl、json 和 xlsx 文件格式!')
          return false
        }
      }
    }
    const maxFileSizeMB = getMaxFileSizeMB()
    if (file.size / 1024 / 1024 > maxFileSizeMB) {
      message.error(`文件大小不能超过 ${getMaxFileSizeLabel()}!`)
      return false
    }
    return true
  }
  // 获取提示文本
  const getHintText = () => {
    if (dataSource === 'image-understanding') {
      return (
        <>
          <p className="ant-upload-hint">支持ZIP压缩包，图片文件包含jpg、png格式，文本文件包含jsonl格式</p>
          {/* <p className="ant-upload-hint">单张图片限制在5M内，最多支持1000张</p> */}
          <p className="ant-upload-hint">文件大小不能超过1G</p>
        </>
      )
    }
    if (usage === 'business_test') {
      return <p className="ant-upload-hint">支持 .jsonl/.json/.xlsx/.csv 格式，文件大小不能超过500M</p>
    }
    return <p className="ant-upload-hint">支持 .jsonl/.json/.xlsx 格式，文件大小不能超过500M</p>
  }
  // 表单提交处理
  const handleSubmit = async (values: any) => {
    try {
      setLoading(true)
      if (!projectId || isNaN(Number(projectId))) {
        message.error('项目ID无效')
        return
      }
      // 构建query参数
      const queryParams = {
        dataset_type: dataSource,
        training_method_type: trainingMethodType,
        dataset_format: form.getFieldValue('dataFormat'),
        usage,
      }
      if (usage === 'business_test') {
        delete queryParams.training_method_type
        delete queryParams.dataset_format
        queryParams.dataset_type = 'business'
      }
      const attr_values = buildAttrValuesFromFormValues(values, attrGroupList)
      const formData: any = {
        name: values.name,
        description: values.description,
        project_id: Number(projectId),
        file: selectedFile,
        version: values.version,
        dataset_config: '',
        ...(attr_values.length > 0 && { attr_values }),
      }
      // 根据导入方式调用不同的API
      if (importMethod === '本地上传') {
        if (!selectedFile) {
          message.error('请上传文件')
          return
        }
        if (!chunkUploadId) {
          message.error('文件尚未上传完成，请等待上传完成后再提交')
          return
        }
        // 使用分片上传后的 chunk_upload_id 创建数据集
        const formDataWithUploadId: any = {
          ...formData,
          chunk_upload_ids: chunkUploadId, // 使用上传后的 uploadId
        }
        // 调用训练数据集上传API
        await trainingDatasetService.create(queryParams, formDataWithUploadId)
      }
      else if (importMethod === 'URL获取') {
        // URL获取方式，添加 dataset_config，选择的属性通过 attr_values 以 FormData 传入
        const urlFormData = {
          ...formData,
          dataset_config: values.dataset_config,
        }
        await trainingDatasetService.create(queryParams, urlFormData)
      }
      message.success(`${pageTitle}成功`)
      queryClient.invalidateQueries({ queryKey: ['training-datasets'] })
      switch (usage) {
        case 'training':
          navigate(`/project/${projectId}/datasets?key=${usage}`)
          break
        case 'validation':
          navigate(`/project/${projectId}/datasets?key=${usage}`)
          break
        case 'test':
          navigate(`/project/${projectId}/measurement?key=${usage}`)
          break
        case 'business_test':
          navigate(`/project/${projectId}/business-test`)
          break
        default:
          navigate(`/project/${projectId}/home`)
      }
    }
    catch (error: Error | any) {
      console.error('创建数据集失败:', error)
      // message.error(`创建失败: ${error.message || '未知错误'}`);
    }
    finally {
      setLoading(false)
    }
  }
  // 下载模板文件
  const downloadTemplate = async (type: string) => {
    const dataFormat = form.getFieldValue('dataFormat')
    const trainingType = trainingMethodType
    const dataset_type = dataSource
    if (!projectId || isNaN(Number(projectId))) {
      message.error('项目ID无效')
      return
    }
    if (!dataset_type || !dataFormat || !trainingType) {
      message.error('请选择数据集类型、数据格式、训练方法')
      return
    }
    try {
      await downloadDatasetExample(Number(projectId), dataset_type, dataFormat, trainingType, type, trainingDatasetService.downloadExample)
      message.success('示例文件下载成功')
    }
    catch (error: any) {
      message.error(`下载示例文件失败: ${error.message || '未知错误'}`)
      console.error('下载示例文件失败:', error)
    }
  }
  const handleCancel = () => {
    if (type === 'training') {
      const tabKey = usage === 'training' ? 'training' : usage === 'validation' ? 'validation' : 'training'
      navigate(`/project/${projectId}/datasets?key=${tabKey}`)
    }
    else if (type === 'test') {
      switch (usage) {
        case 'business_test':
          navigate(`/project/${projectId}/business-test`)
          break
        case 'validation':
          navigate(`/project/${projectId}/datasets?key=validation`)
          break
        default:
          navigate(`/project/${projectId}/measurement`)
          break
      }
    }
    else {
      // 默认情况
      navigate(`/project/${projectId}/datasets`)
    }
  }
  // 页面标题映射
  const pageTitleMap: Record<string, Record<string, string>> = {
    training: {
      training: '创建训练数据集',
      business_test: '创建业务测试数据集',
      validation: '创建验证数据集',
      test: '创建测试数据集',
      default: '创建数据集',
    },
    test: {
      validation: '创建验证数据集',
      default: '创建测试数据集',
    },
    default: {
      default: '创建数据集',
    },
  }
  // 获取页面标题
  const getPageTitle = () => {
    const typeMap = pageTitleMap[type] || pageTitleMap.default
    return typeMap[usage as string] || typeMap.default
  }
  const pageTitle = getPageTitle()
  const DataFormatImage = (format: string) => {
    if (format === 'role-based') {
      if (trainingMethodType === 'dpo') {
        return datasetTypeAlpacaMessagesImage
      }
      return dataSource === 'image-understanding'
        ? datasetTypeBasedImage
        : datasetTypeRoleTextImage
    }
    if (format === 'alpaca') {
      return datasetTypeAlpacaImage
    }
    return datasetTypeRoleImage
  }

  return (
    <Layout.Content className="create-dataset-page">
      <section className="create-dataset-card">
        <CreateFormPageHeader
          title={pageTitle}
          onBack={handleCancel}
          actions={(
            <>
              <Button className="create-dataset-cancel" onClick={handleCancel}>
                取消
              </Button>
              <Button className="create-dataset-submit" type="primary" onClick={() => form.submit()} loading={loading}>
                提交
              </Button>
            </>
          )}
        />

        <div className="create-dataset-divider" />

        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={handleSubmit}
          className="create-dataset-form"
          initialValues={{
            name: '',
            description: '',
          }}
        >
          <div className="create-dataset-basic-grid">
            <Form.Item
              className="create-dataset-name-field"
              label={(
                <span className="create-dataset-name-label">
                  <span>数据集名称</span>
                  <span className="create-dataset-required">*</span>
                  <span className="create-dataset-name-help">支持中英文、数字、下划线、中划线不能以下划线或中划线开头，2-64个字符</span>
                </span>
              )}
              name="name"
              rules={[
                { required: true, message: '请输入数据集名称' },
                {
                  pattern: /^(?!_|-)[a-zA-Z0-9_\u4E00-\u9FA5-]{2,64}$/,
                  message: '支持中英文、数字、下划线、中划线，不能以下划线或中划线开头，2-64个字符',
                },
              ]}
              validateTrigger={['onChange', 'onBlur']}
            >
              <Input placeholder="请输入任务名称" className="create-dataset-control" maxLength={64} showCount />
            </Form.Item>

            <Form.Item className="create-dataset-version-field" name="version" label="数据集版本" initialValue="V1">
              <Input className="create-dataset-control create-dataset-version-control" readOnly />
            </Form.Item>

            <Form.Item className="create-dataset-description-field" label="描述" name="description">
              <DescriptionTextArea className="create-dataset-textarea h-[85px] min-h-[85px] resize-none !p-0" placeholder="请输入数据集描述" maxLength={1000} rows={4} />
            </Form.Item>
          </div>

          {usage !== 'business_test' && (
            <Form.Item className="create-dataset-radio-field create-dataset-usage-field" label="数据用途">
              <Radio.Group onChange={handleDataSourceChange} value={dataSource} className="create-dataset-usage-options">
                <Space direction="horizontal" size={10}>
                  {dataSourceOptions.map((option) => (
                    <Tooltip title={option.disabled ? option.disabledTooltip : null} color="blue" key={option.value}>
                      <Radio.Button className="create-dataset-usage-option" disabled={option.disabled} value={option.value}>
                        <Space size={6}>
                          {option.icon}
                          <span>{option.label}</span>
                        </Space>
                      </Radio.Button>
                    </Tooltip>
                  ))}
                </Space>
              </Radio.Group>

              <div className="create-dataset-method-row">
                <Radio.Group value={trainingMethodType} onChange={handleTrainingMethodTypeChange}>
                  <Space direction="horizontal">
                    {getDataPreprocessOptions(dataSource).map((option) => (option.enabled ? (
                      <Tooltip title="即将上线" color="blue" key={option.value}>
                        <Radio value={option.value} disabled>
                          {option.label}
                        </Radio>
                      </Tooltip>
                    ) : (
                      <Radio key={option.value} value={option.value}>
                        {option.label}
                      </Radio>
                    )))}
                  </Space>
                </Radio.Group>
              </div>
            </Form.Item>
          )}

          {usage !== 'business_test' && (
            <Form.Item className="create-dataset-radio-field create-dataset-format-field" label="数据格式" name="dataFormat">
              <Radio.Group onChange={handleDataFormatChange} className="create-dataset-format-options">
                <Space direction="horizontal" size={10}>
                  {dataFormatOptions?.options
                    ?.filter((option) => {
                      return getAllowedDataFormats().includes(option.value)
                    })
                    ?.map((option) => {
                      const shouldDisable = !getAllowedDataFormats().includes(option.value)
                      const hasFormatHelp = option.value === 'role-based' || option.value === 'prompt-response' || option.value === 'alpaca'
                      return (
                        <Radio.Button key={option.value} className={`create-dataset-format-option create-dataset-format-option-${option.value}`} value={option.value} disabled={shouldDisable}>
                          <span>{option.name}</span>
                          {hasFormatHelp && (
                            <Popover
                              content={(
                                <div className="max-w-[400px]">
                                  <img
                                    src={DataFormatImage(option.value)}
                                    alt="数据格式说明"
                                    className="w-full h-auto rounded-md shadow-sm"
                                  />
                                </div>
                              )}
                              title="数据格式说明"
                              placement="right"
                              trigger="hover"
                              overlayStyle={{ maxWidth: '450px' }}
                            >
                              <QuestionCircleOutlined className="create-dataset-info-icon" />
                            </Popover>
                          )}
                        </Radio.Button>
                      )
                    })}
                </Space>
              </Radio.Group>
            </Form.Item>
          )}

          <div className="create-dataset-attr-section">
            <DataAttributeFormSection attrGroupList={attrGroupList} loading={attrGroupLoading} />
          </div>

          <Form.Item className="create-dataset-source-field" label="数据来源" name="importMethod" initialValue={importMethod}>
            <Radio.Group value={importMethod} onChange={(e) => setImportMethod(e.target.value)}>
              <Radio.Button className="create-dataset-source-option" value="本地上传">本地上传</Radio.Button>
              {/* <Tooltip title="即将上线" color="blue" >
                          <Radio value="URL获取" disabled>URL获取</Radio>
                      </Tooltip> */}
            </Radio.Group>
          </Form.Item>

          {importMethod === '本地上传' && (
            <div className="create-dataset-upload-section">
              <Form.Item className="create-dataset-upload-field" label="上传文件">
                <div className="create-dataset-upload-box">
                  <ChunkFileUploader
                    key={`${dataSource}-${currentDataFormat || ''}`}
                    accept={getAcceptType()}
                    beforeUpload={validateFile}
                    hintText={getHintText()}
                    onSuccess={(data) => {
                      setUploadedFileUrl(data.fileUrl)
                    }}
                    onUploadIdsChange={(uploadIds) => {
                      setChunkUploadId(uploadIds || null)
                    }}
                    onFileChange={(file) => {
                      setSelectedFile(file)
                      // 注意：对于多文件上传，chunkUploadId 应该通过 onUploadIdsChange 来管理
                      // 这里只在所有文件都删除时才清空
                      if (!file) {
                        setUploadedFileUrl(null)
                        // chunkUploadId 会通过 onUploadIdsChange 自动更新，不需要手动清空
                      }
                    }}
                  />
                </div>
              </Form.Item>

              <div className="create-dataset-example-row">
                <span>下载示例文件</span>
                {dataSource === 'image-understanding' ? (
                  <Button type="link" icon={<DownloadOutlined />} onClick={() => downloadTemplate('zip')}>
                    ZIP文件
                  </Button>
                ) : (
                  <>
                    <Button type="link" icon={<DownloadOutlined />} onClick={() => downloadTemplate('jsonl')}>
                      JSONL文件
                    </Button>
                    <Button type="link" icon={<DownloadOutlined />} onClick={() => downloadTemplate('json')}>
                      JSON文件
                    </Button>
                    <Button type="link" icon={<DownloadOutlined />} onClick={() => downloadTemplate('xlsx')}>
                      XLSX文件
                    </Button>
                    {usage === 'business_test' && (
                      <Button type="link" icon={<DownloadOutlined />} onClick={() => downloadTemplate('csv')}>
                        CSV文件
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {importMethod === 'URL获取' && (
            <Form.Item className="create-dataset-url-field" label="数据URL" name="dataset_config" rules={[{ required: true, message: '请输入数据URL' }]}>
              <Input placeholder="请输入数据URL" className="create-dataset-control" />
            </Form.Item>
          )}
        </Form>
      </section>
    </Layout.Content>
  )
}
export default CreateDatasetPage
