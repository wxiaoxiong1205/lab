import React, { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { CreateProjectMetricParams } from '@/services/modelEvaluationServices'
import { modelEvaluationServices } from '@/services/modelEvaluationServices'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

const { Title, Text } = Typography
const { TextArea } = Input

interface CreateEvaluationIndicatorPageProps { }

const CreateEvaluationIndicatorPage: React.FC<CreateEvaluationIndicatorPageProps> = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId, id } = useParams<{ projectId: string, id: string }>()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [isBuiltin, setIsBuiltin] = useState<boolean | null>(null)

  // 根据 URL 路径判断是编辑还是查看模式
  const isViewMode = location.pathname.includes('/view/')
  const isEditMode = location.pathname.includes('/edit/')

  // 如果是内置指标（is_builtin=true），则强制为查看模式；否则根据 URL 路径判断
  const isView = isBuiltin === true || isViewMode
  const isEdit = isEditMode && isBuiltin !== true
  const initialValues = location.state?.initialValues || null

  const handleBack = () => {
    navigate(-1)
  }

  const transformDetailToFormData = (detail: any) => {
    const formData: any = {
      name: detail.name,
      description: detail.description,
      dataType: 10,
      evaluationDependencies: ['input', 'actual_output', 'expected_output'], // 默认值
      scaleDescriptions: [],
    }

    if (detail.score_scope && Array.isArray(detail.score_scope)) {
      formData.scaleDescriptions = detail.score_scope.map((scope: any) => ({
        minValue: scope.score_min,
        maxValue: scope.score_max,
        description: scope.score_definitions,
      }))

      const maxScore = Math.max(...detail.score_scope.map((s: any) => s.score_max || 0))
      formData.dataType = maxScore || 10
    }

    // 转换 metrics_param 为表单的 evaluationDependencies
    if (detail.metrics_param && Array.isArray(detail.metrics_param)) {
      formData.evaluationDependencies = detail.metrics_param
    }

    return formData
  }

  // 将表单数据转换为预览渲染接口参数格式（包含 metrics_mapping）
  const transformFormToPreviewParams = (values: any) => {
    const name = values.name || ''
    const description = values.description || ''

    if (!name && !description) {
      return null
    }

    const scoreScope: Array<{
      score_min: number
      score_max: number
      score_definitions: string
    }> = []

    if (values.scaleDescriptions && values.scaleDescriptions.length > 0) {
      values.scaleDescriptions.forEach((item: any) => {
        // if (!item?.description) return;

        const minValue = item.minValue !== undefined && item.minValue !== null && item.minValue !== ''
          ? item.minValue
          : undefined
        const maxValue = item.maxValue !== undefined && item.maxValue !== null && item.maxValue !== ''
          ? item.maxValue
          : undefined

        if (minValue === undefined && maxValue === undefined) return

        scoreScope.push({
          score_min: minValue !== undefined ? minValue : maxValue!,
          score_max: maxValue !== undefined ? maxValue : minValue!,
          score_definitions: item.description,
        })
      })
    }

    const metricsMapping: any = {}
    const fieldNameMap: Record<string, string> = {
      input: 'Prompt',
      actual_output: 'Model Response',
      expected_output: 'Expected Output',
      retrieval_context: 'Retrieval Context',
    }

    if (values.evaluationDependencies && Array.isArray(values.evaluationDependencies)) {
      values.evaluationDependencies.forEach((field: string) => {
        if (fieldNameMap[field]) {
          metricsMapping[field] = fieldNameMap[field]
        }
      })
    }

    return {
      name,
      description,
      score_scope: scoreScope,
      metrics_mapping: metricsMapping,
    }
  }

  // 调用渲染接口
  const fetchPreview = async (values: any) => {
    const params = transformFormToPreviewParams(values)
    if (!params) {
      setPreviewContent(placeholderText)
      return
    }

    try {
      setPreviewLoading(true)
      const response = await modelEvaluationServices.renderEvaluationTemplate(params)
      setPreviewContent(response || placeholderText)
    }
    catch (error) {
      console.error('渲染预览失败:', error)
      setPreviewContent(placeholderText)
    }
    finally {
      setPreviewLoading(false)
    }
  }

  useEffect(() => {
    const loadDetail = async () => {
      const currentProjectId = projectId || location.state?.projectId
      const currentMetricId = id || initialValues?.id

      // 只要有 id，就应该加载详情数据
      if (!currentProjectId || !currentMetricId) {
        return
      }

      try {
        setDetailLoading(true)
        const detail = await modelEvaluationServices.getProjectMetricDetail(
          Number(currentProjectId),
          Number(currentMetricId),
        )

        // 设置 is_builtin 状态
        setIsBuiltin(detail.is_builtin || false)

        const formData = transformDetailToFormData(detail)
        form.setFieldsValue(formData)

        // 编辑模式或查看模式下，加载详情后自动调用一次模板渲染
        await fetchPreview(formData)
      }
      catch (error) {
        console.error('加载详情失败:', error)
        message.error('加载详情失败')
        navigate(-1)
      }
      finally {
        setDetailLoading(false)
      }
    }

    loadDetail()
  }, [projectId, id])

  // 处理指标评分量级变化，清空评分区间
  const handleDataTypeChange = (value: number) => {
    // 重置评分区间为空数组
    form.setFieldsValue({
      scaleDescriptions: [{ minValue: undefined, maxValue: undefined, description: '' }],
    })
    // 清除验证错误
    form.setFields([
      {
        name: 'scaleDescriptions',
        errors: [],
      },
    ])
  }

  // 将表单数据转换为创建/更新接口参数格式
  const transformFormToCreateParams = (values: any): CreateProjectMetricParams => {
    const scoreScope: Array<{
      score_min: number
      score_max: number
      score_definitions: string
    }> = []

    if (values.scaleDescriptions && values.scaleDescriptions.length > 0) {
      values.scaleDescriptions.forEach((item: any) => {
        const minValue = item.minValue !== undefined && item.minValue !== null && item.minValue !== ''
          ? item.minValue
          : undefined
        const maxValue = item.maxValue !== undefined && item.maxValue !== null && item.maxValue !== ''
          ? item.maxValue
          : undefined
        const description = item.description

        if (minValue === undefined && maxValue === undefined) return

        if ((minValue !== undefined || maxValue !== undefined) && (!description || description.trim() === '')) {
          return
        }

        scoreScope.push({
          score_min: minValue !== undefined ? minValue : maxValue!,
          score_max: maxValue !== undefined ? maxValue : minValue!,
          score_definitions: description || '',
        })
      })
    }

    // 获取表单中的 evaluationDependencies 字段，直接作为数组传递
    const metricsParam = values.evaluationDependencies || []

    return {
      name: values.name,
      description: values.description,
      score_scope: scoreScope,
      metrics_param: metricsParam,
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      const currentProjectId = projectId || location.state?.projectId

      if (!currentProjectId) {
        message.error('缺少项目ID')
        setLoading(false)
        return
      }

      const params = transformFormToCreateParams(values)

      if (isEdit) {
        const currentMetricId = id || initialValues?.id
        if (!currentMetricId) {
          message.error('缺少指标ID')
          setLoading(false)
          return
        }
        await modelEvaluationServices.updateProjectMetric(
          Number(currentProjectId),
          Number(currentMetricId),
          { ...params, id: Number(currentMetricId) },
        )
      }
      else {
        await modelEvaluationServices.createProjectMetric(Number(currentProjectId), params)
      }

      message.success(isEdit ? '编辑成功' : '创建成功')
      handleBack()
    }
    catch (error: any) {
      console.error('提交失败:', error)
      message.error(error?.message || '提交失败，请重试')
    }
    finally {
      setLoading(false)
    }
  }

  const placeholderText = `请输入指标说明，如评估生成文本中词汇、短语或句子的多样性，是否词汇丰富`

  const dataType = Form.useWatch('dataType', form) || 10
  const nameValue = Form.useWatch('name', form) || ''
  const descriptionValue = Form.useWatch('description', form) || ''

  // 验证评分区间不交叉
  const validateScaleDescriptions = (_: any, value: any[]) => {
    if (!value || value.length === 0) {
      return Promise.reject(new Error('请至少添加一个评分区间'))
    }

    // 检查是否有任何内容被填写（最小值、最大值或描述）
    const hasAnyContent = value.some((item: any) => {
      const minValue = item?.minValue
      const maxValue = item?.maxValue
      const description = item?.description
      return (minValue !== undefined && minValue !== null && minValue !== '')
        || (maxValue !== undefined && maxValue !== null && maxValue !== '')
        || (description !== undefined && description !== null && description !== '')
    })

    // 如果没有任何内容，显示必填错误
    if (!hasAnyContent) {
      return Promise.reject(new Error('请至少添加一个评分区间'))
    }

    // 如果有内容，继续后续验证，但不显示必填错误
    // 检查是否至少有一个有效的区间（同时有最小值、最大值和描述）
    const hasValidRange = value.some((item: any) => {
      const minValue = item?.minValue
      const maxValue = item?.maxValue
      const description = item?.description
      return minValue !== undefined && minValue !== null && minValue !== ''
        && maxValue !== undefined && maxValue !== null && maxValue !== ''
        && description !== undefined && description !== null && description !== ''
    })

    // 如果有内容但还没有完整区间，不显示错误（让用户继续填写）
    if (!hasValidRange) {
      return Promise.resolve()
    }

    // 检查每个区间的最小值是否小于等于最大值，以及描述是否填写
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      const minValue = item?.minValue
      const maxValue = item?.maxValue
      const description = item?.description

      if (minValue !== undefined && minValue !== null && minValue !== ''
        && maxValue !== undefined && maxValue !== null && maxValue !== '') {
        if (minValue > maxValue) {
          return Promise.reject(new Error(`第${i + 1}个区间的最小值不能大于最大值`))
        }
        if (!description || description.trim() === '') {
          return Promise.reject(new Error(`第${i + 1}个区间请填写含义说明`))
        }
      }
    }

    // 获取所有有效的区间并按最小值排序
    const validRanges = value
      .map((item, index) => ({
        min: item?.minValue,
        max: item?.maxValue,
        index,
      }))
      .filter((range) =>
        range.min !== undefined
        && range.min !== null
        && range.max !== undefined
        && range.max !== null
        && !isNaN(Number(range.min))
        && !isNaN(Number(range.max)),
      )
      .sort((a, b) => Number(a.min) - Number(b.min))

    // 检查区间是否交叉：排序后，每个区间的最大值要小于下一个区间的最小值
    for (let i = 0; i < validRanges.length - 1; i++) {
      const currentMax = Number(validRanges[i].max)
      const nextMin = Number(validRanges[i + 1].min)

      if (currentMax >= nextMin) {
        return Promise.reject(
          new Error(`第${validRanges[i].index + 1}个区间和第${validRanges[i + 1].index + 1}个区间存在交叉`),
        )
      }
    }

    return Promise.resolve()
  }

  // 手动触发预览
  const handlePreview = async () => {
    const values = form.getFieldsValue()
    await fetchPreview(values)
  }

  const DefeniteIndicator = () => {
    return (
      <div className="flex items-center justify-between">
        <h4>评估指标定义</h4>
        {!isView && (
          <Button
            type="primary"
            onClick={handlePreview}
            loading={previewLoading}
            size="small"
          >
            效果预览
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="create-evaluation-indicator-page create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title={isView ? '查看评估指标' : isEdit ? '编辑评估指标' : '创建评估指标'}
          onBack={handleBack}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleBack}>{isView ? '返回' : '取消'}</Button>
              {!isView && (
                <Button className="create-form-submit" type="primary" loading={loading} onClick={handleSubmit}>
                  保存指标
                </Button>
              )}
            </>
          )}
        />
        <div className="create-form-divider" />
        <div className="flex-1 overflow-hidden bg-white flex flex-col">
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-auto create-form-body pb-20">
              <Spin spinning={detailLoading} tip="加载中...">
                <Form
                  form={form}
                  layout="vertical"
                  initialValues={{
                    dataType: 10,
                    evaluationDependencies: [],
                    scaleDescriptions: [{ minValue: undefined, maxValue: undefined, description: '' }],
                  }}
                >
                  <Card title={<DefeniteIndicator />} className="mb-6">
                    <Form.Item
                      label="指标名称"
                      name="name"
                      rules={[
                        { required: true, message: '请输入指标名称' },
                        { min: 2, max: 64, message: '指标名称长度为2-64个字符' },
                        { pattern: /^(?!_|-)[\u4E00-\u9FA5a-zA-Z0-9._-]*$/, message: '指标名称只支持中英文、数字、小数点、中划线(-)、下划线(_)，且不能以下划线和中划线开头，不允许空格和特殊符号' },
                      ]}
                      extra={
                        !isView && (
                          <div className="flex justify-end">
                            <Text type="secondary">
                              {nameValue.length}
                              /50
                            </Text>
                          </div>
                        )
                      }
                    >
                      <Input placeholder="请输入指标名称" maxLength={50} readOnly={isView} />
                    </Form.Item>
                    <Form.Item
                      label="指标说明"
                      name="description"
                      rules={[
                        { required: true, message: '请输入指标说明' },
                        { max: 1000, message: '指标说明不能超过1000个字符' },
                      ]}
                      extra={
                        !isView && (
                          <div className="flex justify-end">
                            <Text type="secondary">
                              {descriptionValue.length}
                              /1000
                            </Text>
                          </div>
                        )
                      }
                    >
                      <TextArea
                        placeholder={placeholderText}
                        rows={2}
                        className="text-[13px]"
                        maxLength={1000}
                        readOnly={isView}
                      />
                    </Form.Item>

                    <Form.Item
                      label="指标评分量级"
                      name="dataType"
                      rules={[{ required: true, message: '请选择数据类型' }]}
                    >
                      <Select placeholder="请选择" onChange={handleDataTypeChange} disabled={isView}>
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                          <Select.Option key={num} value={num}>
                            {num}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>

                    <Form.Item
                      label="评分区间"
                      className="!mb-0"
                      name="scaleDescriptions"
                      required
                      rules={[{ validator: validateScaleDescriptions }]}
                      dependencies={['scaleDescriptions']}
                      validateTrigger={['onChange', 'onBlur']}
                    >
                      <Form.List name="scaleDescriptions">
                        {(fields, { add, remove }) => (
                          <>
                            {fields.map((field, index) => (
                              <div key={field.key} className="mb-4">
                                <div className="flex items-start w-full gap-4">
                                  <Space className="flex items-center flex-shrink-0" size="small">
                                    <Form.Item
                                      {...field}
                                      name={[field.name, 'minValue']}
                                      noStyle
                                      dependencies={[[field.name, 'maxValue']]}
                                      rules={[
                                        {
                                          validator: (_, value) => {
                                            if (value !== undefined && value !== null && value !== '') {
                                              if (!Number.isInteger(value)) {
                                                return Promise.reject(new Error('只能输入整数'))
                                              }
                                              // 如果填写了最小值，检查最大值是否已填写
                                              const maxValue = form.getFieldValue(['scaleDescriptions', field.name, 'maxValue'])
                                              if (maxValue === undefined || maxValue === null || maxValue === '') {
                                                return Promise.reject(new Error('请填写最大值'))
                                              }
                                            }
                                            return Promise.resolve()
                                          },
                                        },
                                      ]}
                                    >
                                      <InputNumber
                                        placeholder="最小值"
                                        className="w-[100px]"
                                        min={0}
                                        max={dataType}
                                        precision={0}
                                        step={1}
                                        disabled={isView}
                                        onChange={() => {
                                        // 手动触发外层字段验证和当前字段的验证
                                          setTimeout(() => {
                                            form.validateFields([
                                              ['scaleDescriptions', field.name, 'minValue'],
                                              ['scaleDescriptions', field.name, 'maxValue'],
                                              'scaleDescriptions',
                                            ])
                                          }, 0)
                                        }}
                                        parser={(value) => {
                                          const parsed = value?.replace(/\D/g, '') || ''
                                          return parsed === '' ? '' : Number(parsed)
                                        }}
                                        formatter={(value) => {
                                          if (value === undefined || value === null || value === '') return ''
                                          return String(Math.floor(Number(value)))
                                        }}
                                      />
                                    </Form.Item>
                                    <span>-</span>
                                    <Form.Item
                                      {...field}
                                      name={[field.name, 'maxValue']}
                                      noStyle
                                      dependencies={[[field.name, 'minValue']]}
                                      rules={[
                                        {
                                          validator: (_, value) => {
                                            if (value !== undefined && value !== null && value !== '') {
                                              if (!Number.isInteger(value)) {
                                                return Promise.reject(new Error('只能输入整数'))
                                              }
                                              // 如果填写了最大值，检查最小值是否已填写
                                              const minValue = form.getFieldValue(['scaleDescriptions', field.name, 'minValue'])
                                              if (minValue === undefined || minValue === null || minValue === '') {
                                                return Promise.reject(new Error('请填写最小值'))
                                              }
                                            }
                                            return Promise.resolve()
                                          },
                                        },
                                      ]}
                                    >
                                      <InputNumber
                                        placeholder="最大值"
                                        className="w-[100px]"
                                        min={0}
                                        max={dataType}
                                        precision={0}
                                        step={1}
                                        disabled={isView}
                                        onChange={() => {
                                        // 手动触发外层字段验证和当前字段的验证
                                          setTimeout(() => {
                                            form.validateFields([
                                              ['scaleDescriptions', field.name, 'minValue'],
                                              ['scaleDescriptions', field.name, 'maxValue'],
                                              'scaleDescriptions',
                                            ])
                                          }, 0)
                                        }}
                                        parser={(value) => {
                                          const parsed = value?.replace(/\D/g, '') || ''
                                          return parsed === '' ? '' : Number(parsed)
                                        }}
                                        formatter={(value) => {
                                          if (value === undefined || value === null || value === '') return ''
                                          return String(Math.floor(Number(value)))
                                        }}
                                      />
                                    </Form.Item>
                                  </Space>
                                  <Form.Item
                                    {...field}
                                    name={[field.name, 'description']}
                                    noStyle
                                    className="flex-1 min-w-0"
                                    rules={[{ required: true, message: '请输入评分区间含义说明' }]}
                                    validateTrigger={['onChange', 'onBlur']}
                                  >
                                    <Input
                                      placeholder="请输入评分区间含义说明，如：0-1分"
                                      className="text-[13px] w-full"
                                      readOnly={isView}
                                      onChange={() => {
                                      // 手动触发外层字段验证
                                        setTimeout(() => {
                                          form.validateFields(['scaleDescriptions'])
                                        }, 0)
                                      }}
                                    />
                                  </Form.Item>
                                  {fields.length > 1 && !isView && (
                                    <MinusCircleOutlined
                                      onClick={() => remove(field.name)}
                                      className="text-red-500 cursor-pointer flex-shrink-0"
                                    />
                                  )}
                                </div>
                              </div>
                            ))}
                            {!isView && (
                              <Button
                                type="dashed"
                                onClick={() => add()}
                                icon={<PlusOutlined />}
                                className="w-full"
                              >
                                增加
                              </Button>
                            )}
                          </>
                        )}
                      </Form.List>
                    </Form.Item>

                    <p className="mt-4"></p>

                    <Form.Item
                      label="指标关键字段"
                      name="evaluationDependencies"
                      rules={[
                        {
                          validator: (_, value) => {
                            if (!value || value.length === 0) {
                              return Promise.reject(new Error('请至少选择一个指标关键字段'))
                            }
                            return Promise.resolve()
                          },
                        },
                      ]}
                    >
                      <Checkbox.Group className="w-full" disabled={isView}>
                        <div className="flex flex-col gap-3">
                          <Checkbox value="input_content">
                            <Space>
                              <span>input_content</span>
                              <Text type="secondary">（用户问题）</Text>
                            </Space>
                          </Checkbox>
                          <Checkbox value="actual_output">
                            <Space>
                              <span>actual_output</span>
                              <Text type="secondary">（模型答案）</Text>
                            </Space>
                          </Checkbox>
                          <Checkbox value="expected_output">
                            <Space>
                              <span>expected_output</span>
                              <Text type="secondary">（期待答案）</Text>
                            </Space>
                          </Checkbox>
                          <Checkbox value="retrieval_context">
                            <Space>
                              <span>retrieval_context</span>
                              <Text type="secondary">（召回上下文）</Text>
                            </Space>
                          </Checkbox>
                        </div>
                      </Checkbox.Group>
                    </Form.Item>

                  </Card>
                </Form>
              </Spin>
            </div>

            <div className="w-1/2 bg-white border-r border-gray-200 overflow-auto my-6">
              <div className="sticky top-0 bg-white z-10 px-6 pt-6 pb-2 border-b border-gray-100 flex justify-between items-center">
                <Title level={5} className="!mb-0">预览效果</Title>
              </div>
              <div className="p-6">
                {previewLoading ? (
                  <div className="flex justify-center items-center py-8">
                    <Spin tip="渲染中..." />
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-gray-600 text-sm leading-relaxed">
                    {previewContent || placeholderText}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* <div className="px-6 py-4 bg-white border-t border-gray-200 flex justify-end gap-3">
          <Button
            onClick={handleBack}
            size="large"
          >
            {isView ? "返回" : "取消"}
          </Button>
          {!isView && (
            <Button
              type="primary"
              onClick={handleSubmit}
              loading={loading}
              size="large"
            >
              确定
            </Button>
          )}
        </div> */}
          {/* <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "16px",
            backgroundColor: "white",
            zIndex: 100,
          }}
          className="ml-[200px]"
        >
          <Space className="ml-1">
            <Button type="primary" loading={loading} onClick={handleSubmit}>
              确定
            </Button>
            <Button onClick={handleBack}>{isView ? "返回" : "取消"}</Button>
          </Space>
        </div> */}
        </div>
      </section>
    </div>
  )
}

export default CreateEvaluationIndicatorPage
