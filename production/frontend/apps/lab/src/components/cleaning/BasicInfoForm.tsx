import React, { useEffect, useMemo } from 'react'
import { DatePicker, Empty, Form, Input, Radio, Space, Switch, TimePicker, Typography, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { RcFile, UploadProps } from 'antd/es/upload'
import Dragger from 'antd/es/upload/Dragger'
import DatasetCascaderSelector from '@/components/inference/DatasetCascaderSelector'
import type { TrainingDatasetItem } from '@/types/training'
import { getDisabledTimeWhenDateIsToday, getScheduleDatePickerOnChange } from '@/utils/scheduleTimeUtils'

const { Text } = Typography

function findCascadeOptionPath(options, path: string[]) {
  const dfs = (nodes, depth: number, item) => {
    if (depth === path.length) return item
    if (!nodes?.length) return null
    const target = path[depth]
    for (const node of nodes) {
      if (node.value !== target) continue
      const next = [...item, node]
      if (depth === path.length - 1) return next
      if (!node.children) continue
      const found = dfs(node.children, depth + 1, next)
      if (found) return found
    }
    return null
  }
  return dfs(options, 0, [])
}

interface BasicInfoFormProps {
  form: any
  dataSource: 'existed_dataset' | 'upload'
  selectedInputDataset: string
  selectedInputVersion: string
  outputMode: 'new' | 'override'
  selectedFile: File | null
  datasetsData?: { items: TrainingDatasetItem[] }
  datasetsLoading: boolean
  datasetVersions: Record<string, any[]>
  cascaderOptions?: any[]
  /** 数据集字段列表，支持 string[] 或 对话格式 { role, content }[]，后者会以 role 作为可选项 */
  datasetFields?: string[] | Array<{ role: string, content?: string }>
  selectedField?: string // 选中的清洗字段
  fieldsLoading?: boolean // 字段加载状态
  onDataSourceChange: (value: 'existed_dataset' | 'upload') => void
  onCascaderChange?: (value: (string | number)[] | null, selectedOptions?: any[]) => void
  onOutputModeChange: (value: 'new' | 'override') => void
  onFileChange: (file: File | null) => void
  onFieldChange?: (field: string) => void // 字段选择变化回调
  /** 是否启用定时执行 */
  scheduleEnabled?: boolean
  /** 定时启用切换回调 */
  onScheduleEnabledChange?: (checked: boolean) => void
}

const BasicInfoForm: React.FC<BasicInfoFormProps> = ({
  form,
  dataSource,
  selectedInputDataset,
  selectedInputVersion,
  outputMode,
  selectedFile,
  datasetsLoading,
  datasetVersions,
  cascaderOptions = [],
  datasetFields = [],
  selectedField,
  fieldsLoading = false,
  onDataSourceChange,
  onCascaderChange,
  onOutputModeChange,
  onFileChange,
  onFieldChange,
  scheduleEnabled = false,
  onScheduleEnabledChange,
}) => {
  const hasDatasets = useMemo(() => {
    return cascaderOptions.some((typeOption) =>
      typeOption.children && typeOption.children.length > 0
      && typeOption.children.some((child: any) => child.value !== '__no_dataset__'),
    )
  }, [cascaderOptions])

  const scheduleDate = Form.useWatch('schedule_date', form)
  const disabledScheduleTime = useMemo(
    () => getDisabledTimeWhenDateIsToday(scheduleDate),
    [scheduleDate],
  )

  const cascaderValue = useMemo(() => {
    if (!selectedInputDataset || !selectedInputVersion) return undefined
    let usageType = 'training'
    if (cascaderOptions.length > 0) {
      for (const typeOption of cascaderOptions) {
        const found = typeOption.children?.find(
          (ds: any) => ds.value === selectedInputDataset,
        )
        if (found) {
          usageType = typeOption.value
          break
        }
      }
    }
    return [usageType, selectedInputDataset, selectedInputVersion]
  }, [selectedInputDataset, selectedInputVersion, cascaderOptions])

  // 获取下一个版本号（最新版本+1）
  const getNextVersion = (selectedOptions?: any[]): string => {
    if (!selectedOptions || selectedOptions.length < 2) {
      return ''
    }

    const datasetName = selectedOptions[1]?.value || selectedOptions[1]?.label || ''
    if (!datasetName) {
      return ''
    }

    // 优先从datasetVersions中获取版本信息
    const versions: number[] = []

    if (datasetVersions[datasetName] && Array.isArray(datasetVersions[datasetName])) {
      // 从datasetVersions中提取版本号
      datasetVersions[datasetName].forEach((v: any) => {
        if (v.version) {
          const versionStr = v.version.toString()
          const match = versionStr.match(/V?(\d+)/i)
          if (match) {
            versions.push(parseInt(match[1], 10))
          }
        }
      })
    }

    // 如果datasetVersions中没有，尝试从级联选项的children中获取
    if (versions.length === 0) {
      const datasetOption = selectedOptions[1]
      if (datasetOption?.children && Array.isArray(datasetOption.children)) {
        datasetOption.children.forEach((versionOption: any) => {
          if (versionOption.value && versionOption.value !== '__no_version__' && versionOption.value !== '__load_error__') {
            const versionStr = versionOption.value.toString()
            const match = versionStr.match(/V?(\d+)/i)
            if (match) {
              versions.push(parseInt(match[1], 10))
            }
          }
        })
      }
    }

    if (versions.length === 0) {
      return 'V1'
    }

    // 找到最大版本号并+1
    const maxVersion = Math.max(...versions)
    return `V${maxVersion + 1}`
  }

  // 生成清洗后的数据集名称
  const generateOutputDatasetName = (selectedOptions?: any[]): string => {
    if (!selectedOptions || selectedOptions.length !== 3) {
      return ''
    }
    // selectedOptions[0]: 第一级（训练数据集/验证数据集/测试数据集）
    // selectedOptions[1]: 第二级（数据集名称）
    // selectedOptions[2]: 第三级（版本号）
    const firstLevelName = selectedOptions[0]?.label || ''
    const secondLevelName = selectedOptions[1]?.label || ''

    if (!firstLevelName || !secondLevelName) {
      return ''
    }

    // 获取下一个版本号
    const nextVersion = getNextVersion(selectedOptions)
    if (!nextVersion) {
      return ''
    }

    // 格式：{第一级名称}/{第二级名称}-{下一个版本号}
    // 例如：验证数据集/验证数据集JSON-V3
    return `${firstLevelName}/${secondLevelName}-${nextVersion}`
  }

  // 从 cascaderValue 和 cascaderOptions 中获取选中的选项信息
  const getSelectedOptionsFromValue = useMemo(() => {
    if (!cascaderValue || cascaderValue.length !== 3) {
      return null
    }

    const path = cascaderValue as string[]
    return findCascadeOptionPath(cascaderOptions, path)
  }, [cascaderValue, cascaderOptions])

  /** 弹窗选择器不再往 cascaderOptions 挂第三级时，用 value 构造与 generateOutputDatasetName 兼容的选项 */
  const selectedOptionsForOutput = useMemo(() => {
    if (getSelectedOptionsFromValue) {
      return getSelectedOptionsFromValue
    }
    if (!cascaderValue || cascaderValue.length !== 3) {
      return null
    }
    const [usageType, datasetName, version] = cascaderValue as string[]
    const usageLabelMap: Record<string, string> = {
      training: '训练数据集',
      validation: '验证数据集',
      test: '测试数据集',
    }
    return [
      { label: usageLabelMap[usageType] ?? usageType, value: usageType },
      { label: datasetName, value: datasetName },
      { label: version, value: version },
    ]
  }, [getSelectedOptionsFromValue, cascaderValue])

  // 归一化清洗字段：若为 { role, content }[] 则取 role 列表，否则按 string[] 使用
  const normalizedDatasetFields = useMemo((): string[] => {
    if (!datasetFields || !Array.isArray(datasetFields) || datasetFields.length === 0) {
      return []
    }
    const first = datasetFields[0]
    if (typeof first === 'string') {
      return datasetFields as string[]
    }
    if (first && typeof first === 'object' && 'role' in first) {
      const roles = (datasetFields as Array<{ role: string }>)
        .map((item) => item.role)
        .filter(Boolean)
      return [...new Set(roles)]
    }
    return []
  }, [datasetFields])

  // 计算生成的数据集名称
  const outputDatasetName = useMemo(() => {
    if (!selectedOptionsForOutput) {
      return ''
    }
    return generateOutputDatasetName(selectedOptionsForOutput)
  }, [selectedOptionsForOutput, datasetVersions])

  // 处理级联选择器变化
  const handleCascaderChange = (value: (string | number)[] | null, selectedOptions?: any[]) => {
    // 调用原有的回调
    onCascaderChange?.(value, selectedOptions)

    // 如果选择完成（三级都选择），自动生成并设置清洗后的数据集名称
    if (selectedOptions && selectedOptions.length === 3 && outputMode === 'new') {
      const generatedName = generateOutputDatasetName(selectedOptions)
      if (generatedName) {
        form.setFieldsValue({ output_dataset_name: generatedName })
      }
    }
    else {
      // 如果选择未完成，清空名称
      form.setFieldsValue({ output_dataset_name: '' })
    }
  }

  // 当级联选择器已有值或 outputMode 变化时，自动生成名称
  useEffect(() => {
    if (outputMode === 'new' && selectedOptionsForOutput) {
      const generatedName = generateOutputDatasetName(selectedOptionsForOutput)
      if (generatedName) {
        const currentName = form.getFieldValue('output_dataset_name')
        // 只有当名称为空或者是自动生成的格式时才更新
        if (!currentName || currentName === '' || currentName.includes('/')) {
          form.setFieldsValue({ output_dataset_name: generatedName })
        }
      }
    }
    else if (outputMode !== 'new') {
      form.setFieldsValue({ output_dataset_name: '' })
    }
  }, [selectedOptionsForOutput, outputMode, form])

  // 与 DatasetCascaderSelector（字段 data_to_infer）同步，便于编辑回显与展示
  useEffect(() => {
    if (cascaderValue && cascaderValue.length === 3) {
      form.setFieldsValue({ data_to_infer: cascaderValue })
    }
    else if (!selectedInputDataset && !selectedInputVersion) {
      form.setFieldsValue({ data_to_infer: undefined })
    }
  }, [cascaderValue, selectedInputDataset, selectedInputVersion, form])

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    showUploadList: true,
    beforeUpload: (file: RcFile) => {
      const isJsonl = file.name.endsWith('.jsonl')
      const isCsv = file.name.endsWith('.csv') || file.type === 'text/csv'
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx')

      if (!isJsonl && !isCsv && !isExcel) {
        message.error('只支持 jsonl、csv 和 xlsx 文件格式!')
        return false
      }

      const isLt100M = file.size / 1024 / 1024 < 100
      if (!isLt100M) {
        message.error('文件大小不能超过 100MB!')
        return false
      }

      onFileChange(file)
      return false // 阻止自动上传
    },
    onRemove: () => {
      onFileChange(null)
    },
    fileList: selectedFile ? [selectedFile as RcFile] : [],
    maxCount: 1,
  }

  return (
    <Form form={form} layout="vertical" className="create-cleaning-task-basic-form">
      <Form.Item
        name="task_name"
        label="任务名称"
        rules={[
          { required: true, message: '请输入任务名称' },
          { min: 2, max: 64, message: '任务名称长度为2-64个字符' },
          { pattern: /^[^-_].*$/, message: '任务名称不能以下划线和中划线开头' },
          { pattern: /^[\u4E00-\u9FA5a-zA-Z0-9._-]*$/, message: '只支持中英文、数字、小数点、中划线(-)、下划线(_)，且不能以下划线和中划线开头，不允许空格和特殊符号' },
        ]}
        initialValue=""
      >
        <Input placeholder="请输入任务名称" maxLength={64} />
      </Form.Item>

      <Form.Item label="数据来源" required>
        <Radio.Group value={dataSource} onChange={(e) => onDataSourceChange(e.target.value)}>
          <Radio value="existed_dataset">已有数据集</Radio>
        </Radio.Group>
      </Form.Item>

      {dataSource === 'existed_dataset' && (
        <>
          {!datasetsLoading && !hasDatasets ? (
            <div className="py-4">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无可用数据集，请先创建数据集"
                className="m-0"
              />
            </div>
          ) : (
            <DatasetCascaderSelector
              form={form}
              label=""
              onChange={handleCascaderChange}
              loading={datasetsLoading}
              disabled={!hasDatasets && !datasetsLoading}
            />
          )}
          <Form.Item
            name="selected_field"
            className="create-cleaning-task-field-options"
            label="清洗字段"
            required
            rules={[{ required: true, message: '请选择清洗字段' }]}
          >
            {fieldsLoading ? (
              <div className="py-2 text-center w-[100px]">加载中...</div>
            ) : normalizedDatasetFields.length === 0 ? (
              <Typography.Text type="secondary">暂无可用字段</Typography.Text>
            ) : (
              <Radio.Group
                value={selectedField}
                onChange={(e) => {
                  form.setFieldsValue({ selected_field: e.target.value })
                  onFieldChange?.(e.target.value)
                }}
                disabled={fieldsLoading}
              >
                {normalizedDatasetFields.map((field) => (
                  <Radio.Button key={field} value={field}>
                    {field}
                  </Radio.Button>
                ))}
              </Radio.Group>
            )}
          </Form.Item>
        </>
      )}

      {dataSource === 'upload' && (
        <>
          <Form.Item label="上传文件" required>
            <Dragger {...uploadProps} className="w-full p-10">
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
              <p className="ant-upload-hint">
                支持 .jsonl、.csv、.xlsx 格式，单个文件不超过 100MB
              </p>
            </Dragger>
          </Form.Item>
          <Form.Item label="数据量">
            <Text type="secondary">-</Text>
          </Form.Item>
        </>
      )}

      <Form.Item label="处理后数据集" required className="create-cleaning-task-output-mode">
        <Radio.Group value={outputMode} onChange={(e) => onOutputModeChange(e.target.value)}>
          <Radio.Button value="new">新增版本</Radio.Button>
        </Radio.Group>
      </Form.Item>

      {outputMode === 'new' && (
        <Form.Item label="清洗后数据集名称" className="create-cleaning-task-output-name">
          <div className="create-cleaning-task-output-name-value">
            {outputDatasetName ? `数据集名称: ${outputDatasetName}` : '数据集名称: -'}
          </div>
        </Form.Item>
      )}

      <Form.Item label="任务定时配置" className="create-cleaning-task-schedule-field">
        <Space direction="vertical" className="create-cleaning-task-schedule-wrap">
          <Form.Item name="schedule_enabled" valuePropName="checked" className="mb-0">
            <Switch
              checked={scheduleEnabled}
              onChange={(checked) => {
                onScheduleEnabledChange?.(checked)
                form.setFieldsValue({ schedule_enabled: checked })
                if (!checked) {
                  form.setFieldsValue({ schedule_date: undefined, schedule_time: undefined })
                }
              }}
            />
          </Form.Item>
          {scheduleEnabled && (
            <div className="create-cleaning-task-schedule-card">
              <Form.Item
                name="schedule_date"
                label="执行时间"
                rules={[
                  {
                    validator(_, value) {
                      if (!form.getFieldValue('schedule_enabled')) return Promise.resolve()
                      if (!value) return Promise.reject(new Error('请选择日期'))
                      return Promise.resolve()
                    },
                  },
                ]}
              >
                <DatePicker
                  className="w-full"
                  placeholder="请选择日期"
                  format="YYYY-MM-DD"
                  disabledDate={(current) => current && current < dayjs().startOf('day')}
                  onChange={getScheduleDatePickerOnChange(form)}
                />
              </Form.Item>
              <Form.Item
                name="schedule_time"
                label={null}
                rules={[
                  {
                    validator(_, value) {
                      if (!form.getFieldValue('schedule_enabled')) return Promise.resolve()
                      if (!value) return Promise.reject(new Error('请选择时间'))
                      return Promise.resolve()
                    },
                  },
                ]}
              >
                <TimePicker
                  className="w-full"
                  placeholder="请选择时间"
                  format="HH:mm:ss"
                  disabled={!scheduleDate}
                  disabledTime={disabledScheduleTime}
                />
              </Form.Item>
            </div>
          )}
        </Space>
      </Form.Item>
    </Form>
  )
}

export default BasicInfoForm
