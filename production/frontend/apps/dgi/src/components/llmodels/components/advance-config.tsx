import { DownOutlined, LinkOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import {
  Checkbox,
  Collapse,
  Form,
  FormInstance,
  Tooltip,
  Typography,
} from 'antd'
import { CheckboxChangeEvent } from 'antd/es/checkbox'
import _ from 'lodash'
import React, { useCallback, useMemo } from 'react'
import {
  backendLabelMap,
  backendOptionsMap,
  backendParamsHolderTips,
  getBackendParamsTips,
  modelCategories,
  placementStrategyOptions,
} from '../config'
import { useFormContext } from '../config/form-context'
import llamaConfig from '../config/llama-config'
import mindieConfig from '../config/mindie-config'
import { FormData } from '../config/types'
import vllmConfig from '../config/vllm-config'
import dataformStyles from '../style/data-form.module.css'
import GPUCard from './gpu-card'
import dgiServerConfig from '../config/dgiServerConfig'
import { $t } from '@/locales'
import useAppUtils from '@/hooks/use-app-utils'
import type { PageActionType } from '@/components/gpustacks/config/types'
import TooltipList from '@/components/tooltip-list'
import SealSelect from '@/components/seal-form/seal-select'
import SealInput from '@/components/seal-form/seal-input'
import SealCascader from '@/components/seal-form/seal-cascader'
import ListInput from '@/components/list-input'
import LabelSelector from '@/components/label-selector'

interface AdvanceConfigProps {
  isGGUF: boolean
  form: FormInstance
  gpuOptions: Array<any>
  action: PageActionType
  source: string
}

const placementStrategyTips = [
  {
    title: 'Spread',
    tips: $t('使得集群整体的资源在所有 Worker 之间分配得相对均匀。可能会在单个 Worker 上产生较多资源碎片。'),
  },
  {
    title: 'Binpack',
    tips: $t('优先考虑整体集群的资源最大化利用，减少 GPU/Worker 上的资源碎片。'),
  },
]

const scheduleTypeTips = [
  {
    title: $t('自动'),
    tips: $t('自动根据当前资源情况部署模型实例到合适的 GPU/Worker。'),
  },
  {
    title: $t('手动'),
    tips: $t('手动调度可指定模型实例部署的 GPU/Worker'),
  },
]

const CheckboxField: React.FC<{
  title: string
  label: string
  checked?: boolean
  onChange?: (e: CheckboxChangeEvent) => void
}> = ({ title, label, checked, onChange }) => {
  return (
    <Checkbox className="p-l-6" checked={checked} onChange={onChange}>
      <Tooltip title={title}>
        <span style={{ color: 'var(--ant-color-text-tertiary)' }}>{label}</span>
        <QuestionCircleOutlined
          className="m-l-4"
          style={{ color: 'var(--ant-color-text-tertiary)' }}
        />
      </Tooltip>
    </Checkbox>
  )
}

const AdvanceConfig: React.FC<AdvanceConfigProps> = (props) => {
  const { form, isGGUF, gpuOptions, source } = props
  const { getRuleMessage } = useAppUtils()
  const wokerSelector = Form.useWatch('worker_selector', form)
  const EnviromentVars = Form.useWatch('env', form)
  const scheduleType = Form.useWatch('scheduleType', form)
  const backend = Form.useWatch('backend', form)
  const backend_parameters = Form.useWatch('backend_parameters', form)
  const categories = Form.useWatch('categories', form)
  const backend_version = Form.useWatch('backend_version', form)
  const placement_strategy = Form.useWatch('placement_strategy', form)
  const gpuSelectorIds = Form.useWatch(['gpu_selector', 'gpu_ids'], form)
  const worker_selector = Form.useWatch('worker_selector', form)
  const { onValuesChange } = useFormContext()

  const paramsConfig = useMemo(() => {
    if (backend === backendOptionsMap.dgiServer) {
      return dgiServerConfig
    }
    if (backend === backendOptionsMap.llamaBox) {
      return llamaConfig
    }
    if (backend === backendOptionsMap.vllm) {
      return vllmConfig
    }
    if (backend === backendOptionsMap.ascendMindie) {
      return mindieConfig
    }
    return []
  }, [backend])

  const backendParamsTips = useMemo(() => {
    return getBackendParamsTips(backend)
  }, [backend])

  const handleWorkerLabelsChange = useCallback(
    (labels: Record<string, any>) => {
      form.setFieldValue('worker_selector', labels)
    },
    [],
  )
  const handleEnviromentVarsChange = useCallback(
    (labels: Record<string, any>) => {
      form.setFieldValue('env', labels)
    },
    [],
  )

  const handleBackendParametersChange = useCallback((list: string[]) => {
    form.setFieldValue('backend_parameters', list)
  }, [])

  const handleBackendParametersOnBlur = () => {
    onValuesChange?.({}, form.getFieldsValue())
  }

  const handleDeleteBackendParameters = (index: number) => {
    onValuesChange?.({}, form.getFieldsValue())
  }

  const onSelectorChange = (field: string, allowEmpty?: boolean) => {
    const workerSelector = form.getFieldValue(field)
    // check if all keys have values
    const hasEmptyValue = _.some(_.keys(workerSelector), (k: string) => {
      return !workerSelector[k]
    })
    if (!hasEmptyValue || allowEmpty) {
      onValuesChange?.({}, form.getFieldsValue())
    }
  }

  const handleSelectorOnBlur = () => {
    onSelectorChange('worker_selector')
  }

  const handleDeleteWorkerSelector = (index: number) => {
    onValuesChange?.({}, form.getFieldsValue())
  }

  const handleEnvSelectorOnBlur = () => {
    onSelectorChange('env', true)
  }

  const handleDeleteEnvSelector = (index: number) => {
    onValuesChange?.({}, form.getFieldsValue())
  }

  const handleBackendVersionOnBlur = () => {
    onValuesChange?.({}, form.getFieldsValue())
  }

  const handleScheduleTypeChange = (value: string) => {
    if (value === 'auto') {
      onValuesChange?.({}, form.getFieldsValue())
    }
  }

  const handleBeforeGpuSelectorChange = (gpuIds: any[]) => { }

  const handleGpuSelectorChange = (value: any[]) => {
    handleBeforeGpuSelectorChange(value)
    onValuesChange?.({}, form.getFieldsValue())
  }

  const collapseItems = useMemo(() => {
    const children = (
      <>
        {/* <Form.Item<FormData> name="categories">
          <SealSelect
            allowNull
            label="模型分类"
            options={modelCategories}
          ></SealSelect>
        </Form.Item> */}
        <Form.Item name="scheduleType">
          <SealSelect
            onChange={handleScheduleTypeChange}
            label={$t('调度类型')}
            description={<TooltipList list={scheduleTypeTips}></TooltipList>}
            options={[
              {
                label: $t('自动调度'),
                value: 'auto',
              },
              {
                label: $t('手动调度'),
                value: 'manual',
              },
            ]}
          >
          </SealSelect>
        </Form.Item>
        {scheduleType === 'auto' && (
          <>
            <Form.Item<FormData> name="placement_strategy">
              <SealSelect
                label={$t('放置策略')}
                options={placementStrategyOptions}
                description={
                  <TooltipList list={placementStrategyTips}></TooltipList>
                }
              >
              </SealSelect>
            </Form.Item>
            <Form.Item<FormData>
              name="worker_selector"
              rules={[
                ({ getFieldValue }) => ({
                  validator(rule, value) {
                    if (
                      getFieldValue('scheduleType') === 'auto'
                      && _.keys(value).length > 0
                    ) {
                      if (_.some(_.keys(value), (k: string) => !value[k])) {
                        return Promise.reject($t('请输入选择器值'))
                      }
                    }
                    return Promise.resolve()
                  },
                }),
              ]}
            >
              <LabelSelector
                label={$t('Worker选择器')}
                labels={wokerSelector}
                onChange={handleWorkerLabelsChange}
                onBlur={handleSelectorOnBlur}
                onDelete={handleDeleteWorkerSelector}
                description={(
                  <span>
                    {$t('系统在部署模型实例时，会根据预定义的标签来选择最符合要求的 Worker。')}
                  </span>
                )}
              >
              </LabelSelector>
            </Form.Item>
          </>
        )}
        {scheduleType === 'manual' && (
          <Form.Item
            name={['gpu_selector', 'gpu_ids']}
            rules={[
              {
                required: true,
                message: getRuleMessage('select', $t('GPU选择器')),
              },
            ]}
          >
            <SealCascader
              required
              showSearch
              expandTrigger="hover"
              multiple={backend !== backendOptionsMap.voxBox}
              popupClassName="cascader-popup-wrapper gpu-selector"
              maxTagCount={1}
              label={$t('GPU选择器')}
              options={gpuOptions}
              showCheckedStrategy="SHOW_CHILD"
              value={form.getFieldValue(['gpu_selector', 'gpu_ids'])}
              optionNode={GPUCard}
              getPopupContainer={(triggerNode) => triggerNode.parentNode}
              onChange={handleGpuSelectorChange}
            >
            </SealCascader>
          </Form.Item>
        )}

        {/* <Form.Item name="backend_version">
          <SealInput.Input
            placeholder={
              backendParamsTips?.version
                ? `例如 ${backendParamsTips?.version}`
                : ''
            }
            onBlur={handleBackendVersionOnBlur}
            label={$t('后端版本')}
            description={
              <>
                {$t('后端版本 {backend}', { backend: backendLabelMap[backend] })}
                {backendParamsTips?.version ? `(例如 ${backendParamsTips?.version})` : ''}
                {backendParamsTips?.releases && (
                  <span style={{ marginLeft: 5 }}>
                    <Typography.Link
                      className="flex-center"
                      style={{ display: 'inline' }}
                      href={backendParamsTips?.releases}
                      target="_blank"
                    >
                      <span>{$t('发布版本')}</span>
                      <LinkOutlined
                        className="font-size-14 m-l-4"
                      />
                    </Typography.Link>
                  </span>
                )}
              </>
            }
          ></SealInput.Input>
        </Form.Item> */}

        <Form.Item<FormData> name="backend_parameters">
          <ListInput
            placeholder={
              backendParamsHolderTips[backend]
                ? backendParamsHolderTips[backend].holder
                : ''
            }
            btnText={$t('添加参数')}
            label={$t('后端参数')}
            dataList={form.getFieldValue('backend_parameters') || []}
            onChange={handleBackendParametersChange}
            onBlur={handleBackendParametersOnBlur}
            onDelete={handleDeleteBackendParameters}
            options={paramsConfig}
            description={
              backendParamsTips.link && (
                <span>
                  {/* {backend === backendOptionsMap.ascendMindie && (
                      <span>
                        仅支持310P
                      </span>
                    )} */}
                  {backend !== backendOptionsMap.ascendMindie ? (
                    <span style={{ marginLeft: 5 }}>
                      {$t('查看 {backend} 参数说明', { backend: backendParamsTips.backend || '' })}
                      <Typography.Link
                        style={{ display: 'inline' }}
                        className="flex-center"
                        href={backendParamsTips.link}
                        target="_blank"
                      >
                        <span>
                          {$t('点击这里')}
                        </span>
                        <LinkOutlined
                          className="font-size-14 m-l-4"
                        />
                      </Typography.Link>
                    </span>
                  ) : <span>{$t('Ascend 310P 仅支持 FP16，需要设置 --dtype=float16')}</span>}
                </span>
              )
            }
          >
          </ListInput>
        </Form.Item>
        {backend !== backendOptionsMap.dgiServer && (
          <Form.Item<FormData> name="env">
            <LabelSelector
              label={$t('环境变量')}
              labels={EnviromentVars}
              btnText={$t('添加变量')}
              onBlur={handleEnvSelectorOnBlur}
              onDelete={handleDeleteEnvSelector}
              onChange={handleEnviromentVarsChange}
            >
            </LabelSelector>
          </Form.Item>
        )}

        {backend === backendOptionsMap.llamaBox && (
          <div style={{ paddingBottom: 22, paddingLeft: 10 }}>
            <Form.Item<FormData>
              name="cpu_offloading"
              valuePropName="checked"
              style={{ padding: '0 10px', marginBottom: 0 }}
              noStyle
            >
              <CheckboxField
                title={$t('部分卸载提示')}
                label={$t('启用部分卸载')}
              >
              </CheckboxField>
            </Form.Item>
          </div>
        )}
        {scheduleType === 'auto'
        && [
          backendOptionsMap.llamaBox,
          backendOptionsMap.vllm,
          backendOptionsMap.ascendMindie,
        ].includes(backend) && (
          <div style={{ paddingBottom: 22, paddingLeft: 10 }}>
            <Form.Item<FormData>
              name="distributed_inference_across_workers"
              valuePropName="checked"
              style={{ padding: '0 10px', marginBottom: 0 }}
              noStyle
            >
              <CheckboxField
                title={$t('允许在单个 Worker 资源不足时，将部分计算卸载到一个或多个远程 Worker。')}
                label={$t('启用跨Worker分布式推理')}
              >
              </CheckboxField>
            </Form.Item>
          </div>
        )}
        <div style={{ paddingBottom: 22, paddingLeft: 10 }}>
          <Form.Item<FormData>
            name="restart_on_error"
            valuePropName="checked"
            style={{ padding: '0 10px', marginBottom: 0 }}
            noStyle
          >
            <CheckboxField
              title={$t('当发生错误时，将自动尝试恢复')}
              label={$t('错误时重启')}
            >
            </CheckboxField>
          </Form.Item>
        </div>
      </>
    )
    return [
      {
        key: '1',
        label: (
          <span
            style={{ fontWeight: 'bold' }}
          >
            {$t('高级配置')}
          </span>
        ),
        forceRender: true,
        children,
      },
    ]
  }, [
    form,
    source,
    gpuOptions,
    paramsConfig,
    scheduleType,
    wokerSelector,
    backend,
    backend_parameters,
    isGGUF,
    categories,
    backend_version,
    placement_strategy,
    gpuSelectorIds,
    EnviromentVars,
    worker_selector,
  ])

  return (
    <Collapse
      expandIconPosition="start"
      bordered={false}
      ghost
      destroyInactivePanel={false}
      className={dataformStyles['advanced-collapse']}
      expandIcon={({ isActive }) => (
        <DownOutlined className={`${isActive ? 'rotate-180' : 'rotate-0'} text-xs`} />
      )}
      items={collapseItems}
    >
    </Collapse>
  )
}

export default AdvanceConfig
