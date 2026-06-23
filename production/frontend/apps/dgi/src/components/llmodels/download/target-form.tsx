import { Form, Input, Typography } from 'antd'
import { LinkOutlined } from '@ant-design/icons'
import _ from 'lodash'
import React, { forwardRef, useEffect, useImperativeHandle, useMemo } from 'react'
import OllamaTips from '../components/ollama-tips'
import {
  localPathTipsList,
  modelSourceMap,
  ollamaModelOptions,
  sourceOptions,
} from '../config'
import SealAutoComplete from '@/components/seal-form/auto-complete'
import SealInput from '@/components/seal-form/seal-input'
import SealSelect from '@/components/seal-form/seal-select'
import TooltipList from '@/components/tooltip-list'
import useAppUtils from '@/hooks/use-app-utils'
import type { ModelFileFormData as FormData } from '@/components/gpustacks/config/types'
import { useTransform } from '@/locales'

interface TargetFormProps {
  ref?: any
  workersList: Global.BaseOption<number>[]
  source: string
  onOk: (values: any) => void
}

const TargetForm: React.FC<TargetFormProps> = forwardRef((props, ref) => {
  const { onOk, source, workersList } = props
  const { getRuleMessage } = useAppUtils()
  const [form] = Form.useForm()

  const { $t } = useTransform()

  useImperativeHandle(ref, () => ({
    form,
  }))

  // 监听 source 变化并更新表单值
  useEffect(() => {
    if (source) {
      form.setFieldsValue({
        source,
      })
    }
  }, [source, form])

  const handleOk = (values: any) => {
    const data = _.pickBy(values, (val: string) => val)
    onOk(data)
  }

  const handleOnLocalPathBlur = (e: any) => {
    let { value } = e.target

    // remove all the backslashes and slashes at the end of the string
    value = value.replace(/(\\|\/)+$/, '')
    form.setFieldsValue({
      local_path: value,
    })
  }

  const renderLocalPathFields = () => {
    return (
      <Form.Item<FormData>
        name="local_path"
        key="local_path"
        rules={[
          {
            required: true,
            message: getRuleMessage('input', $t('模型路径')),
          },
        ]}
      >
        <SealInput.Input
          required
          label="文件路径"
          onBlur={handleOnLocalPathBlur}
          description={<TooltipList list={localPathTipsList}></TooltipList>}
        >
        </SealInput.Input>
      </Form.Item>
    )
  }

  const renderOllamaModelFields = () => {
    return (
      <Form.Item<FormData>
        name="ollama_library_model_name"
        key="ollama_library_model_name"
        rules={[
          {
            required: true,
            message: getRuleMessage('input', 'models.table.name'),
          },
        ]}
      >
        <SealAutoComplete
          allowClear
          filterOption
          defaultActiveFirstOption
          disabled={false}
          options={ollamaModelOptions}
          description={(
            <span>
              <span>
                Ollama 模型库
              </span>
              <Typography.Link
                className="flex-center"
                href="https://www.ollama.com/library"
                target="_blank"
              >
                <LinkOutlined
                  className="font-size-14"
                />
              </Typography.Link>
            </span>
          )}
          label="Ollama 模型"
          placeholder="请输入 Ollama 模型名称"
          required
        >
        </SealAutoComplete>
      </Form.Item>
    )
  }

  const renderFieldsBySource = useMemo(() => {
    if (props.source === modelSourceMap.ollama_library_value) {
      return renderOllamaModelFields()
    }

    if (props.source === modelSourceMap.local_path_value) {
      return renderLocalPathFields()
    }

    return null
  }, [props.source])

  return (
    <div>
      {source === modelSourceMap.ollama_library_value && (
        <OllamaTips></OllamaTips>
      )}
      <Form
        form={form}
        onFinish={handleOk}
        preserve={false}
        style={{ padding: '16px 24px' }}
        clearOnDestroy
        initialValues={{
          source,
        }}
      >
        <Form.Item<FormData>
          name="source"
          rules={[
            {
              required: true,
              message: getRuleMessage('select', 'models.form.source'),
            },
          ]}
        >
          <SealSelect
            disabled
            label="来源"
            options={sourceOptions}
            required
          >
          </SealSelect>
        </Form.Item>
        {renderFieldsBySource}
        <Form.Item
          name="worker_id"
          rules={[
            {
              required: true,
              message: getRuleMessage('select', 'worker', false),
            },
          ]}
        >
          <SealSelect
            label="Worker"
            options={workersList}
            required
          >
          </SealSelect>
        </Form.Item>
        <Form.Item
          name=""
          rules={[
            {
              required: true,
              message: getRuleMessage('select', $t('描述'), false),
            },
          ]}
        >
          <Input.TextArea placeholder="描述" />
        </Form.Item>
        {source !== modelSourceMap.local_path_value && (
          <Form.Item<FormData>
            name="local_dir"
            rules={[
              {
                required: false,
                message: getRuleMessage(
                  'input',
                  'resources.modelfiles.form.localdir',
                ),
              },
            ]}
          >
            <SealInput.Input
              description={(
                <span>
                  本地目录，用于存储下载的模型文件。如果不填写，将使用默认目录。
                </span>
              )}
              label="本地目录"
            >
            </SealInput.Input>
          </Form.Item>
        )}
      </Form>
    </div>
  )
})

export default TargetForm
