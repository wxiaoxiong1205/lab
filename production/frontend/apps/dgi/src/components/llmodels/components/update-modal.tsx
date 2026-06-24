import { Button, Form, Modal } from 'antd'
import _ from 'lodash'
import React, { useEffect, useMemo, useRef } from 'react'
import {
  backendLabelMap,
  backendOptionsMap,
  backendTipsList,
  updateExcludeFields as excludeFields,
  getSourceRepoConfigValue,
  modelSourceMap,
  sourceOptions,
  updateIgnoreFields,
} from '../config'
import { FormContext, FormInnerContext } from '../config/form-context'
import type { FormData, ListItem } from '../config/types'
import HuggingFaceForm from '../forms/hugging-face'
import LocalPathForm from '../forms/local-path'
import OllamaForm from '../forms/ollama_library'
import { useCheckCompatibility } from '../hooks'
import AdvanceConfig from './advance-config'
import ColumnWrapper from './column-wrapper'
import CompatibilityAlert from './compatible-alert'
import useAppUtils from '@/hooks/use-app-utils'
import type { PageActionType } from '@/components/gpustacks/config/types'
import { PageAction } from '@/components/gpustacks/config'
import TooltipList from '@/components/tooltip-list'
import SealSelect from '@/components/seal-form/seal-select'
import SealInput from '@/components/seal-form/seal-input'
import ModalFooter from '@/components/modal-footer'
import { useTransform } from '@/locales'

type AddModalProps = {
  title: string
  action: PageActionType
  open: boolean
  updateFormInitials: {
    data?: ListItem
    gpuOptions: any[]
    isGGUF: boolean
  }
  onOk: (values: FormData) => void
  onCancel: () => void
}

const UpdateModal: React.FC<AddModalProps> = (props) => {
  const {
    title,
    action,
    open,
    onOk,
    onCancel,
    updateFormInitials: { gpuOptions, isGGUF, data: formData },
  } = props || {}
  // const intl = useIntl();
  const { $t } = useTransform()
  const {
    setWarningStatus,
    generateGPUIds,
    handleBackendChangeBefore,
    checkTokenRef,
    warningStatus,
  } = useCheckCompatibility()

  const { getRuleMessage } = useAppUtils()
  const [form] = Form.useForm()
  const submitAnyway = useRef<boolean>(false)
  const originFormData = useRef<any>(null)

  const setOriginalFormData = () => {
    if (!originFormData.current) {
      originFormData.current = _.cloneDeep(formData)
    }
  }

  const customizer = (val1: any, val2: any) => {
    if (
      (val1 === null && val2 === '')
      || (val1 === '' && val2 === null)
      || (_.isEmpty(val1) && val2 === null)
      || (_.isEmpty(val2) && val1 === null)
    ) {
      return true
    }
    return undefined
  }

  const handleOnValuesChange = _.debounce((data: any) => {
    const formdata = form.getFieldsValue?.()

    let alldata = {}
    if (formdata.scheduleType === 'manual') {
      alldata = {
        ..._.omit(formdata, ['worker_selector']),
        env: formdata.env || originFormData.current?.env || null,
        gpu_selector: formdata.gpu_selector,
      }
    }
    else {
      alldata = {
        ..._.omit(formdata, ['gpu_selector']),
        env: formdata.env || originFormData.current?.env || null,
        worker_selector:
          formdata.worker_selector
          || originFormData.current?.worker_selector
          || null,
      }
    }

    const originalData = _.pick(originFormData.current, Object.keys(alldata))

    const isEqual = _.isEqualWith(
      _.omit(alldata, updateIgnoreFields),
      _.omit(originalData, updateIgnoreFields),
      customizer,
    )
    if (isEqual) {
      setWarningStatus({
        show: false,
        message: '',
      })
    }
    else {
      setWarningStatus({
        show: true,
        isDefault: true,
        message: $t('更改仅在删除并重新创建实例后生效'),
      })
    }
  }, 100)

  // voxbox is not support multi gpu
  const handleSetGPUIds = (backend: string) => {
    const gpuids = form.getFieldValue(['gpu_selector', 'gpu_ids']) || []

    if (backend === backendOptionsMap.voxBox && gpuids.length > 0) {
      form.setFieldValue(['gpu_selector', 'gpu_ids'], [gpuids[0]])
    }
  }

  const handleBackendChange = (backend: string) => {
    const updates = {
      backend_version: '',
    }
    if (backend === backendOptionsMap.llamaBox) {
      Object.assign(updates, {
        distributed_inference_across_workers: true,
        cpu_offloading: true,
      })
    }
    form.setFieldsValue({ ...updates, backend_parameters: [], env: null })
    handleSetGPUIds(backend)

    const data = form.getFieldsValue?.()
    const res = handleBackendChangeBefore(data)
    if (res.show) {
      return
    }
    if (data.local_path || data.source !== modelSourceMap.local_path_value) {
      handleOnValuesChange?.({
        changedValues: {},
        allValues:
          backend === backendOptionsMap.llamaBox
            ? data
            : _.omit(data, [
                'cpu_offloading',
                'distributed_inference_across_workers',
              ]),
        source: data.source,
      })
    }
  }

  const handleAsyncBackendChange = (backend: string) => {
    setTimeout(() => {
      handleBackendChange(backend)
    }, 100)
  }

  const handleSumit = () => {
    form.submit()
  }

  const handleSubmitAnyway = async () => {
    submitAnyway.current = true
    form.submit?.()
  }

  const handleOk = async (data: FormData) => {
    const formdata = getSourceRepoConfigValue(data.source, data).values

    let submitData = {} as FormData
    const isVoxBox = [backendOptionsMap.voxBox].includes(formdata.backend)

    submitData = {
      ..._.omit(formdata, ['scheduleType']),
      categories: formdata.categories ? [formdata.categories] : [],
      worker_selector:
        formdata.scheduleType === 'manual' ? null : formdata.worker_selector,
      ...(isVoxBox
        ? {
            distributed_inference_across_workers: false,
            cpu_offloading: false,
          }
        : {}),
      ...generateGPUIds(formdata),
    } as FormData
    onOk(submitData)
  }

  const onValuesChange = (changedValues: any, allValues: any) => {
    const fieldName = Object.keys(changedValues)[0]
    if (excludeFields.includes(fieldName)) {
      return
    }
    handleOnValuesChange({
      changedValues,
      allValues,
      source: formData?.source as string,
    })
  }

  const handleManulOnValuesChange = (changedValues: any, allValues: any) => {
    handleOnValuesChange({
      changedValues,
      allValues,
      source: formData?.source as string,
    })
  }

  const handleOnClose = () => {
    onCancel?.()
  }

  const showExtraButton = useMemo(() => {
    return (
      warningStatus.show
      && warningStatus.type !== 'success'
      && !warningStatus.isDefault
    )
  }, [warningStatus.show, warningStatus.type, warningStatus.isDefault])

  const isVllmOrAscend = useMemo(() => {
    return (
      formData?.backend === backendOptionsMap.vllm
      || formData?.backend === backendOptionsMap.ascendMindie
    )
  }, [formData?.backend])

  useEffect(() => {
    if (open && formData) {
      setOriginalFormData()

      // 处理表单数据格式转换
      const processedData = { ...formData }

      // 处理 categories 字段 - 如果是数组取第一个元素
      const categories = processedData.categories && Array.isArray(processedData.categories)
        ? processedData.categories[0]
        : processedData.categories

      // 设置调度类型
      const scheduleType = (processedData.gpu_selector?.gpu_ids?.length || 0) > 0 ? 'manual' : 'auto'

      // 合并处理后的数据
      Object.assign(processedData, { categories, scheduleType })

      // 使用 setTimeout 确保表单已经渲染完成
      setTimeout(() => {
        form.setFieldsValue(processedData)
      }, 100)
    }
    if (!open) {
      checkTokenRef.current?.cancel?.()
      originFormData.current = null
      setWarningStatus({
        show: false,
        message: '',
      })
    }
  }, [open, formData, form])

  // 添加一个专门处理表单重置和设置的 effect
  useEffect(() => {
    if (open && formData && Object.keys(formData).length > 0) {
      // 重置表单然后设置新值
      form.resetFields()

      setTimeout(() => {
        // 再次设置值确保所有字段都能正确显示
        const dataToSet = {
          ...formData,
          scheduleType: (formData.gpu_selector?.gpu_ids?.length || 0) > 0 ? 'manual' : 'auto',
          categories: Array.isArray(formData.categories) ? formData.categories[0] : formData.categories,
        }

        form.setFieldsValue(dataToSet)

        // 验证设置结果
        const currentValues = form.getFieldsValue()
      }, 200)
    }
  }, [open, formData])

  return (
    <Modal
      title={title}
      open={open}
      centered
      onOk={handleSumit}
      onCancel={onCancel}
      destroyOnClose
      closeIcon
      maskClosable={false}
      keyboard={false}
      width={600}
      styles={{
        content: {
          padding: '0 0 16px 0',
        },
        header: {
          padding: '20px 24px 0',
          paddingBottom: '0',
        },
        body: {
          padding: '0',
        },
        footer: {
          padding: '16px 24px',
          margin: '0',
        },
      }}
      footer={(
        <ModalFooter
          onCancel={onCancel}
          onOk={handleSumit}
          showOkBtn={!showExtraButton}
          extra={
            showExtraButton && (
              <Button type="primary" onClick={handleSubmitAnyway}>
                models.form.submit.anyway
              </Button>
            )
          }
        >
        </ModalFooter>
      )}
    >
      <ColumnWrapper
        maxHeight={550}
        paddingBottom={
          warningStatus.show ? (warningStatus.isDefault ? 50 : 100) : 0
        }
        footer={(
          <CompatibilityAlert
            showClose={false}
            onClose={() => {
              setWarningStatus({
                show: false,
                message: '',
              })
            }}
            warningStatus={warningStatus}
            contentStyle={{ paddingInline: 0 }}
          >
          </CompatibilityAlert>
        )}
      >
        <FormContext.Provider
          value={{
            isGGUF,
            pageAction: action,
            onValuesChange: handleManulOnValuesChange,
          }}
        >
          <Form
            name="updateModalForm"
            form={form}
            onFinish={handleOk}
            onValuesChange={onValuesChange}
            scrollToFirstError
            preserve={false}
            clearOnDestroy
            style={{
              padding: '20px 24px 0',
              paddingBlock: 0,
            }}
          >
            <Form.Item<FormData>
              name="name"
              rules={[
                {
                  required: true,
                  message: getRuleMessage('input', $t('名称')),
                },
              ]}
            >
              <SealInput.Input
                label={$t('名称')}
                required
              >
              </SealInput.Input>
            </Form.Item>
            <Form.Item<FormData>
              name="source"
              rules={[
                {
                  required: true,
                  message: getRuleMessage('select', $t('模型来源')),
                },
              ]}
            >
              {action === PageAction.EDIT && (
                <SealSelect
                  disabled
                  label={$t('模型来源')}
                  options={sourceOptions}
                  required
                >
                </SealSelect>
              )}
            </Form.Item>
            <FormInnerContext.Provider
              value={{
                onBackendChange: handleBackendChange,
                gpuOptions,
              }}
            >
              <HuggingFaceForm></HuggingFaceForm>
              <OllamaForm></OllamaForm>
              <LocalPathForm></LocalPathForm>
            </FormInnerContext.Provider>
            <Form.Item name="backend" rules={[{ required: true }]}>
              <SealSelect
                required
                onChange={handleAsyncBackendChange}
                label={$t('后端')}
                description={<TooltipList list={backendTipsList}></TooltipList>}
                options={[
                  // {
                  //   label: backendLabelMap[backendOptionsMap.llamaBox],
                  //   value: backendOptionsMap.llamaBox,
                  //   disabled:
                  //     formData?.source === modelSourceMap.local_path_value
                  //       ? false
                  //       : !isGGUF
                  // },
                  {
                    label: backendLabelMap[backendOptionsMap.vllm],
                    value: backendOptionsMap.vllm,
                    disabled:
                      formData?.source === modelSourceMap.local_path_value
                      || isVllmOrAscend
                        ? false
                        : isGGUF,
                  },
                  {
                    label: backendLabelMap[backendOptionsMap.ascendMindie],
                    value: backendOptionsMap.ascendMindie,
                    disabled:
                      formData?.source === modelSourceMap.local_path_value
                      || isVllmOrAscend
                        ? false
                        : isGGUF,
                  },
                  {
                    label: backendLabelMap[backendOptionsMap.dgiServer],
                    value: backendOptionsMap.dgiServer,
                    disabled:
                      formData?.source === modelSourceMap.local_path_value
                      || isVllmOrAscend
                        ? false
                        : isGGUF,
                  },
                  // {
                  //   label: backendLabelMap[backendOptionsMap.voxBox],
                  //   value: backendOptionsMap.voxBox,
                  //   disabled:
                  //     formData?.source !== modelSourceMap.local_path_value ||
                  //     !isVllmOrAscend
                  // }
                ]}
                disabled={
                  action === PageAction.EDIT
                  && formData?.source !== modelSourceMap.local_path_value
                  && !isVllmOrAscend
                }
              >
              </SealSelect>
            </Form.Item>
            <Form.Item<FormData>
              name="replicas"
              rules={[
                {
                  required: true,
                  message: getRuleMessage('input', $t('副本数')),
                },
              ]}
            >
              <SealInput.Number
                style={{ width: '100%' }}
                label={$t('副本数')}
                required
                description={$t('多副本数实现') + (typeof window !== 'undefined' ? `${window.location.origin}/gpustack/v1` : '') + $t('接口推理请求的负载均衡')}
                min={0}
              >
              </SealInput.Number>
            </Form.Item>
            <Form.Item<FormData> name="description">
              <SealInput.TextArea
                scaleSize
                label={$t('描述')}
              >
              </SealInput.TextArea>
            </Form.Item>

            <AdvanceConfig
              form={form}
              gpuOptions={gpuOptions}
              action={PageAction.EDIT}
              source={formData?.source || ''}
              isGGUF={formData?.backend === backendOptionsMap.llamaBox}
            >
            </AdvanceConfig>
          </Form>
        </FormContext.Provider>
      </ColumnWrapper>
    </Modal>
  )
}

export default UpdateModal
