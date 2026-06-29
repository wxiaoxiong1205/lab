import React, { useEffect, useState } from 'react'
import type { SelectProps } from 'antd'
import { Alert, Button, Form, Input, Layout, Radio, Select, Space, Switch, Tag, Tooltip, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { RcFile } from 'antd/es/upload'
import { DescriptionTextArea } from '@/components/common/DescriptionTextArea.tsx'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'
import { SegmentedRadioButton, SegmentedRadioGroup } from '@/components/common/SegmentedRadio'
import { trainingDatasetService } from '@/services/trainingApi.ts'
import type { UploadDatasetVersionRequest } from '@/types/training'
import { ModelTypeMapping, TrainingMethodTypeMapping } from '@/utils/EnumMaping.ts'
import { downloadDatasetExample } from '@/utils/download'
import ChunkFileUploader from '@/components/common/ChunkFileUploader'
import { formatDatasetVersionStatus } from '@/utils/datasetStatus'
import './CreateDatasetPage.css'

const TEXT_FILE_MAX_SIZE_MB = 500
const IMAGE_FILE_MAX_SIZE_MB = 1024

type LabelRender = SelectProps['labelRender']

interface CreateDatasetVersionPageProps {
  type: 'training' | 'test'
  usage: string
}

const CreateDatasetVersionPage: React.FC<CreateDatasetVersionPageProps> = ({ type, usage }) => {
  const navigate = useNavigate()
  const { projectId, datasetId } = useParams<{ projectId: string, datasetId: string }>()
  const [form] = Form.useForm()
  const [inheritFromHistory, setInheritFromHistory] = useState(false)
  const [selectedHistoryVersion, setSelectedHistoryVersion] = useState<string>('')
  const [importMethod, setImportMethod] = useState<string>('本地上传')
  const [chunkUploadId, setChunkUploadId] = useState<string | null>(null)
  const [datasetInfo, setDatasetInfo] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const queryClient = useQueryClient()

  useEffect(() => {
    const fetchData = async () => {
      if (!!datasetId && !!projectId) {
        // 尝试从React Query缓存中获取数据
        const cacheKey = type === 'training' ? ['training-dataset-detail', datasetId] : ['test-dataset-detail', datasetId]
        const cachedData: any = queryClient.getQueryData(cacheKey)

        if (cachedData && cachedData.data) {
          setDatasetInfo(cachedData.data)
        }
        else {
          try {
            const versionDetails = await trainingDatasetService.detail(Number(projectId), datasetId, usage)
            if (versionDetails) {
              setDatasetInfo(versionDetails)
            }
          }
          catch (error) {
            console.error('获取数据集详情失败:', error)
          }
        }
      }
    }

    fetchData() // 立即调用异步函数
  }, [datasetId, projectId, queryClient, type, usage])

  const latestVersionItem
    = Array.isArray(datasetInfo) && datasetInfo.length > 0 ? datasetInfo[datasetInfo.length - 1] : null
  const latestVersionStatus = latestVersionItem ? formatDatasetVersionStatus(latestVersionItem) : ''
  const canCreateNextVersion = !!latestVersionItem && latestVersionStatus === '已发布'
  const newVersionBlockedReason = latestVersionItem
    ? latestVersionStatus === '创建失败'
      ? '最新版本创建失败，不能新增下一个版本'
      : latestVersionStatus === '未发布'
        ? '最新版本未发布，发布后才能新增下一个版本'
        : latestVersionStatus === '创建中'
          ? '最新版本创建中，创建完成并发布后才能新增下一个版本'
          : latestVersionStatus === '已发布'
            ? ''
            : '最新版本需已发布后才能新增下一个版本'
    : '正在读取最新版本状态'
  const isPublishedVersion = (item: any) => {
    if (!item) return false
    return formatDatasetVersionStatus(item) === '已发布'
  }
  const publishedVersionOptions = Array.isArray(datasetInfo)
    ? datasetInfo.filter(isPublishedVersion)
    : []
  /**
   * 计算新版本号
   * @returns 新版本号字符串，如 "V6"
   */
  const calculateNewVersion = () => {
    // 添加空值检查和默认值处理
    if (!datasetInfo || !Array.isArray(datasetInfo) || datasetInfo.length === 0) {
      return 'V1' // 如果没有数据，默认为 V1
    }

    // 从 datasetInfo 中提取版本号
    const currentVersions = datasetInfo.map((item) => {
      // 确保 item 和 item.version 存在
      if (!item || !item.version) {
        return 0 // 无效版本默认为 0
      }

      // 提取版本号中的数字部分
      const versionNumber = parseInt(item.version.replace(/\D/g, ''), 10)
      return isNaN(versionNumber) ? 0 : versionNumber
    })

    // 找出最大版本号并加1
    const maxVersion = Math.max(...currentVersions)
    return `V${maxVersion + 1}`
  }
  /**
   * 获取训练类型标签
   * @param dataSource 数据格式
   */
  const getDatasetFormat = (dataSource: string) => {
    const projectEnumValues = JSON.parse(localStorage.getItem('projectEnumValues') || '[]')
    const datasetFormat = projectEnumValues?.all_enums?.find((item: any) => item.enum_name === 'DatasetFormat')
    return datasetFormat?.options?.find((item: any) => item.value === dataSource)?.name || dataSource || '-'
  }
  /**
   * 获取数据用途标签
   * @param dataSource 数据集类型
   * @param trainingMethodType 训练方法
   */
  const getDataType = (dataSource: string, trainingMethodType: string) => {
    switch (dataSource) {
      case 'text-generation':
        return `${TrainingMethodTypeMapping(trainingMethodType).text}-${ModelTypeMapping(dataSource).text}`
      case 'image-generation':
        return `${TrainingMethodTypeMapping(trainingMethodType).text}-${ModelTypeMapping(dataSource).text}`
      case 'image-understanding':
        return `${TrainingMethodTypeMapping(trainingMethodType).text}-${ModelTypeMapping(dataSource).text}`
      default:
        return `${TrainingMethodTypeMapping(trainingMethodType).text}-${ModelTypeMapping(dataSource).text}`
    }
  }
  // 表单提交处理
  const handleSubmit = async (values: any) => {
    if (!canCreateNextVersion) {
      message.error(newVersionBlockedReason)
      return
    }

    setLoading(true)
    try {
      // 根据接口要求创建UploadDatasetVersionRequest对象
      const requestData: UploadDatasetVersionRequest = {
        name: datasetInfo?.[datasetInfo?.length - 1]?.name || '',
        usage,
        project_id: Number(projectId),
        new_version: calculateNewVersion(),
        inherit_from_version: inheritFromHistory,
        description: values.description,
      }

      if (Array.isArray(latestVersionItem?.attr_values) && latestVersionItem.attr_values.length > 0) {
        requestData.attr_values = latestVersionItem.attr_values
      }

      const uploadFn = (): boolean => {
        if (importMethod === '本地上传') {
          const chunkUploadIds = (chunkUploadId || '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
            .join(',')

          // 非继承的时候校验
          if (!chunkUploadIds && !inheritFromHistory) {
            message.error('文件尚未上传完成，请等待上传完成后再提交')
            setLoading(false)
            return false
          }

          // 有新上传文件时才传 chunk_upload_ids
          if (chunkUploadIds) {
            requestData.chunk_upload_ids = chunkUploadIds
          }
        }
        else if (importMethod === 'URL获取' && values.dataset_config) {
          requestData.dataset_config = values.dataset_config
        }

        return true
      }

      // 根据模式添加不同字段
      if (inheritFromHistory && selectedHistoryVersion) {
        // 继承模式：添加源版本
        requestData.source_version = selectedHistoryVersion

        if (!uploadFn()) return
      }
      else if (inheritFromHistory) {
        message.error('请选择已发布的历史版本')
        return
      }
      else {
        if (!uploadFn()) return
      }

      await trainingDatasetService.uploadVersion(requestData)
      message.success('新版本创建成功！')
      // 使数据集详情查询失效，强制刷新数据
      const cacheKey = type === 'training' ? ['training-dataset-detail', datasetId] : ['test-dataset-detail', datasetId]
      queryClient.invalidateQueries({ queryKey: cacheKey })
      // 使数据集列表查询失效，强制刷新数据
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
    catch (error) {
      // message.error(error.message || '创建新版本失败')
      console.error('创建新版本失败:', error)
    }
    finally {
      setLoading(false)
    }
  }

  // 获取数据集类型
  const getDatasetType = () => {
    return datasetInfo?.[datasetInfo?.length - 1]?.dataset_type
  }

  // 根据数据集类型获取允许的文件类型
  const getAcceptType = () => {
    const datasetType = getDatasetType()
    if (datasetType === 'image-understanding' || datasetType === 'image-generation') {
      return '.zip'
    }
    else if (usage === 'business_test') {
      return '.jsonl,.json,.xlsx,.csv'
    }
    else {
      // 文本生成类型支持 jsonl、json、xlsx
      return '.jsonl,.json,.xlsx'
    }
  }
  const getMaxFileSizeMB = () => {
    return (getDatasetType() === 'image-understanding' || getDatasetType() === 'image-generation') ? IMAGE_FILE_MAX_SIZE_MB : TEXT_FILE_MAX_SIZE_MB
  }
  const getMaxFileSizeLabel = () => {
    return (getDatasetType() === 'image-understanding' || getDatasetType() === 'image-generation') ? '1G' : '500M'
  }

  // 文件验证函数
  const validateFile = (file: RcFile): boolean => {
    const datasetType = getDatasetType()

    // 图像类数据集只支持 zip 文件
    if (datasetType === 'image-understanding' || datasetType === 'image-generation') {
      const isZip = file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'
      if (!isZip) {
        message.error('图像类数据集只支持 zip 文件格式!')
        return false
      }
    }
    else if (usage === 'business_test') {
      const isJsonl = file.name.endsWith('.jsonl')
      const isJson = file.name.endsWith('.json') || file.type === 'application/json'
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx')
      const isCsv = file.name.endsWith('.csv') || file.type === 'text/csv'
      if (!isJsonl && !isJson && !isExcel && !isCsv) {
        message.error('只支持 jsonl、json、xlsx 和 csv 文件格式!')
        return false
      }
    }
    else {
      // 文本生成类型支持 jsonl、json、xlsx
      const isJsonl = file.name.endsWith('.jsonl')
      const isJson = file.name.endsWith('.json') || file.type === 'application/json'
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx')

      if (!isJsonl && !isJson && !isExcel) {
        message.error('只支持 jsonl、json 和 xlsx 文件格式!')
        return false
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
    const datasetType = getDatasetType()
    if (datasetType === 'image-generation') {
      return (
        <>
          <p className="ant-upload-hint">有标注ZIP包含 data.jsonl 与 images/；未标注ZIP仅包含 images/ 图片目录</p>
          <p className="ant-upload-hint">文件大小不能超过1G</p>
        </>
      )
    }
    if (datasetType === 'image-understanding') {
      return (
        <>
          <p className="ant-upload-hint">支持ZIP压缩包，包含 data.jsonl 与 images/ 目录</p>
          <p className="ant-upload-hint">文件大小不能超过1G</p>
        </>
      )
    }
    else if (usage === 'business_test') {
      return <p className="ant-upload-hint">支持 .jsonl/.json/.xlsx/.csv 格式，文件大小不能超过500M</p>
    }
    else {
      return <p className="ant-upload-hint">支持 .jsonl/.json/.xlsx 格式，文件大小不能超过500M</p>
    }
  }
  // 下载模板文件
  const downloadTemplate = async (type: string) => {
    const dataFormat = datasetInfo?.[datasetInfo?.length - 1]?.dataset_format
    const trainingType = datasetInfo?.[datasetInfo?.length - 1]?.training_method_type
    const dataset_type = datasetInfo?.[datasetInfo?.length - 1]?.dataset_type
    const fileType = type

    if (!projectId || isNaN(Number(projectId))) {
      message.error('项目ID无效')
      return
    }
    if (!dataset_type || !dataFormat || !trainingType) {
      message.error('请选择数据集类型、数据格式、训练方法')
      return
    }

    try {
      await downloadDatasetExample(
        Number(projectId),
        dataset_type,
        dataFormat,
        trainingType,
        fileType,
        trainingDatasetService.downloadExample,
      )
      message.success('示例文件下载成功')
    }
    catch (error: any) {
      message.error(`下载示例文件失败: ${error.message || '未知错误'}`)
      console.error('下载示例文件失败:', error)
    }
  }
  // 选择器自定义渲染函数
  const labelRender: LabelRender = (props) => {
    const { value } = props
    return (
      <div className="flex flex-col">
        <div className="font-medium">{value}</div>
      </div>
    )
  }

  const handleCancel = () => {
    navigate(-1)
  }

  return (
    <Layout.Content className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title="新增数据集版本"
          onBack={handleCancel}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleCancel}>
                取消
              </Button>
              <Button className="create-form-submit" type="primary" onClick={() => form.submit()} loading={loading} disabled={!canCreateNextVersion}>
                提交
              </Button>
            </>
          )}
        />

        <div className="create-form-divider" />

        <div className="create-form-body">
          {!canCreateNextVersion && (
            <Alert
              className="mb-4"
              type="warning"
              showIcon
              message={newVersionBlockedReason}
            />
          )}
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            onFinish={handleSubmit}
            className="create-dataset-form"
            initialValues={{
              description: '',
            }}
          >
            <div className="create-dataset-basic-grid">
              <Form.Item className="create-dataset-version-field" label="数据集版本">
                <Input className="create-dataset-control create-dataset-version-control" value={calculateNewVersion()} readOnly />
              </Form.Item>
              <Form.Item
                className="create-dataset-description-field"
                name="description"
                label="描述"
              >
                <DescriptionTextArea
                  className="create-dataset-textarea h-[85px] min-h-[85px] resize-none"
                  placeholder="请输入数据集描述"
                  maxLength={1000}
                  rows={4}
                />
              </Form.Item>
            </div>

            {usage !== 'business_test' && (
              <>
                <Form.Item className="create-dataset-radio-field" label="数据用途">
                  <div className="create-dataset-readonly-option create-dataset-readonly-usage-option">
                    {getDataType((datasetInfo?.[datasetInfo?.length - 1]?.dataset_type), (datasetInfo?.[datasetInfo?.length - 1]?.training_method_type))}
                  </div>
                </Form.Item>

                <Form.Item className="create-dataset-radio-field" label="数据格式">
                  <div className="create-dataset-readonly-option">
                    {getDatasetFormat((datasetInfo?.[datasetInfo?.length - 1]?.dataset_format))}
                  </div>
                </Form.Item>
              </>
            )}

            {/* 继承历史版本 */}
            <Form.Item className="create-dataset-source-field" label="继承历史版本">
              <Switch
                checked={inheritFromHistory}
                onChange={setInheritFromHistory}
              />
            </Form.Item>

            {inheritFromHistory && (
              <Form.Item className="create-dataset-url-field" label="历史版本">
                {publishedVersionOptions.length > 0 ? (
                  <Select
                    placeholder="请选择已发布版本"
                    value={selectedHistoryVersion}
                    onChange={setSelectedHistoryVersion}
                    allowClear
                    showSearch
                    labelRender={labelRender}
                    optionFilterProp="label"
                    className="w-[400px]"
                    filterOption={(input, option) =>
                      (option?.label as string)?.toLowerCase()?.includes(input.toLowerCase()) ?? false}
                  >
                    {publishedVersionOptions.map((item) => {
                      const isActive = item.id === latestVersionItem?.id
                      const formattedDate = item.created_at
                        ? new Date(item.created_at).toLocaleString()
                        : '未知'

                      return (
                        <Select.Option
                          key={item.version}
                          value={item.version}
                          label={item.version || ''}
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center">
                              <span className="mr-2 font-medium">{item.version}</span>
                              {isActive && (
                                <Tag color="blue">当前版本</Tag>
                              )}
                            </div>
                            {item.description && (
                              <div className="text-xs text-gray-500 mt-1">
                                描述:
                                {' '}
                                {item.description}
                              </div>
                            )}
                            <div className="text-xs text-gray-400 mt-1">
                              创建时间:
                              {' '}
                              {formattedDate}
                            </div>
                            {item.total_samples !== undefined && (
                              <div className="text-xs text-gray-400">
                                数据量:
                                {' '}
                                {item.total_samples ?? 0}
                                {' '}
                                条
                              </div>
                            )}
                          </div>
                        </Select.Option>
                      )
                    })}
                  </Select>
                ) : (
                  // 空状态处理
                  <div className="p-4 bg-gray-50 rounded-md text-center text-gray-500">
                    暂无已发布历史版本
                  </div>
                )}
              </Form.Item>
            )}

            <Form.Item
              className="create-dataset-source-field !mt-4"
              label="数据来源"
              name="importMethod"
              initialValue={importMethod}
            >
              <SegmentedRadioGroup value={importMethod} onChange={(e) => setImportMethod(e.target.value)}>
                <SegmentedRadioButton variant="source" value="本地上传">本地上传</SegmentedRadioButton>
                <Tooltip title="即将上线">
                  <SegmentedRadioButton variant="source" value="URL获取" disabled>URL获取</SegmentedRadioButton>
                </Tooltip>

              </SegmentedRadioGroup>
            </Form.Item>
            {/* {!inheritFromHistory && (importMethod === '本地上传') && ( */}
            <div className="create-dataset-upload-section">
              <Form.Item className="create-dataset-upload-field" label="上传文件">
                <div className="create-dataset-upload-box">
                  <ChunkFileUploader
                    accept={getAcceptType()}
                    beforeUpload={validateFile}
                    hintText={getHintText()}
                    onUploadIdsChange={(uploadIds) => {
                      setChunkUploadId(uploadIds || null)
                    }}
                    onFileChange={(file) => {
                      if (!file) {
                        setChunkUploadId(null)
                      }
                    }}
                  />
                </div>
              </Form.Item>

              <div className="create-dataset-example-row">
                <span>下载示例文件</span>
                {getDatasetType() === 'image-generation' ? (
                  <Space size={4} wrap>
                    <Tooltip title="有标注模板：zip 根目录包含 data.jsonl 与 images/，data.jsonl 每行包含 prompt、images[]，可选 negative_prompt、metadata">
                      <Button type="link" icon={<DownloadOutlined />} onClick={() => downloadTemplate('image-prompt-annotated-zip')}>
                        有标注模板
                      </Button>
                    </Tooltip>
                    <Tooltip title="未标注模板：zip 仅包含 images/ 图片目录，用于先上传图片素材后续补充提示词标注">
                      <Button type="link" icon={<DownloadOutlined />} onClick={() => downloadTemplate('image-prompt-unannotated-zip')}>
                        未标注模板
                      </Button>
                    </Tooltip>
                  </Space>
                ) : getDatasetType() === 'image-understanding' ? (
                  <Space>
                    <Button
                      type="link"
                      icon={<DownloadOutlined />}
                      onClick={() => downloadTemplate('zip')}
                    >
                      ZIP 格式
                    </Button>
                  </Space>
                ) : (
                  <Space>
                    <Button
                      type="link"
                      icon={<DownloadOutlined />}
                      onClick={() => downloadTemplate('jsonl')}
                    >
                      JSONL 格式
                    </Button>
                    <Button
                      type="link"
                      icon={<DownloadOutlined />}
                      onClick={() => downloadTemplate('json')}
                    >
                      JSON 格式
                    </Button>
                    <Button
                      type="link"
                      icon={<DownloadOutlined />}
                      onClick={() => downloadTemplate('xlsx')}
                    >
                      XLSX 格式
                    </Button>
                    {usage === 'business_test' && (
                      <Button
                        type="link"
                        icon={<DownloadOutlined />}
                        onClick={() => downloadTemplate('csv')}
                      >
                        CSV 格式
                      </Button>
                    )}
                  </Space>
                )}
              </div>
            </div>
            {/* )} */}

            {!inheritFromHistory && (importMethod === 'URL获取') && (
              <Form.Item
                className="create-dataset-url-field"
                label="数据URL"
                name="dataset_config"
                rules={[{ required: true, message: '请输入数据URL' }]}
              >
                <Input
                  placeholder="请输入数据URL"
                  className="create-dataset-control"
                />
              </Form.Item>
            )}
          </Form>
        </div>
      </section>
    </Layout.Content>
  )
}

export default CreateDatasetVersionPage
