import { Form } from 'antd'
import React from 'react'
import { modelSourceMap } from '../config'
import { useFormContext } from '../config/form-context'
import type { FormData } from '../config/types'
import useAppUtils from '@/hooks/use-app-utils'
import { PageAction } from '@/components/gpustacks/config'
import SealInput from '@/components/seal-form/seal-input'

const HuggingFaceForm: React.FC = () => {
  const formInstance = Form.useFormInstance()
  const formCtx = useFormContext()
  const { getRuleMessage } = useAppUtils()
  const { isGGUF, byBuiltIn, pageAction, onValuesChange } = formCtx
  const source = Form.useWatch('source')

  if (
    ![
      modelSourceMap.huggingface_value,
      modelSourceMap.modelscope_value,
    ].includes(source)
    || byBuiltIn
  ) {
    return null
  }

  const handleOnBlur = (e: any) => {
    onValuesChange?.({}, formInstance.getFieldsValue())
  }

  return (
    <>
      <Form.Item<FormData>
        name="repo_id"
        key="repo_id"
        rules={[
          {
            required: true,
            message: getRuleMessage('input', 'models.form.repoid'),
          },
        ]}
      >
        <SealInput.Input
          label="仓库 ID"
          required
          disabled={pageAction === PageAction.CREATE}
          onBlur={handleOnBlur}
        >
        </SealInput.Input>
      </Form.Item>
      {isGGUF && (
        <Form.Item<FormData>
          name="file_name"
          key="file_name"
          rules={[
            {
              required: true,
              message: getRuleMessage('input', 'models.form.filename'),
            },
          ]}
        >
          <SealInput.Input
            label="文件名"
            required
            disabled={pageAction === PageAction.CREATE}
            onBlur={handleOnBlur}
          >
          </SealInput.Input>
        </Form.Item>
      )}
    </>
  )
}

export default HuggingFaceForm
