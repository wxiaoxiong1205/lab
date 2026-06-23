import { useState } from 'react'
import {
  Affix,
  Button,
  Form,
  Input,
  message,
} from 'antd'
import MarkdownEditor from '@/components/MdEditor'
import { notebookService } from '@/services/notebookService'

export interface NotebookCaseEditProps {
  caseNumericId: number
  initialName: string
  initialDescribe: string
  onCancel: () => void
  onSaved: () => void | Promise<void>
}

export default function NotebookCaseEdit({
  caseNumericId,
  initialName,
  initialDescribe,
  onCancel,
  onSaved,
}: NotebookCaseEditProps) {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    try {
      await form.validateFields()
      if (!form.getFieldValue('description')) {
        message.error('请输入案例说明')
        return
      }
      const values = form.getFieldsValue()
      setSaving(true)
      await notebookService.editCase(caseNumericId, {
        name: values.name,
        describe: values.description ?? '',
      })
      message.success('编辑成功')
      await onSaved()
    }
    catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e)
        return
      message.error('编辑失败')
    }
    finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col p-4">
      <div className="flex-1 min-h-0 overflow-hidden">
        <Form
          form={form}
          layout="vertical"
          className="h-full min-h-0 flex flex-col"
          initialValues={{
            name: initialName,
            description: initialDescribe,
          }}
        >
          <Form.Item
            label="案例名称"
            name="name"
            rules={[
              { required: true, message: '请输入名称' },
              { pattern: /^[^ ]+$/, message: '输入不能包含空格' },
            ]}
          >
            <Input placeholder="请输入案例名称" />
          </Form.Item>

          <Form.Item
            name="description"
            label="案例说明"
            required
            className="!mb-0 [&_.ant-form-item-control-input]:!min-h-0 [&_.ant-form-item-control-input-content]:!h-0"
          >
          </Form.Item>

          <div className="flex flex-1 min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-hidden pb-12">
              <MarkdownEditor
                value={initialDescribe}
                height="100%"
                onChange={(markdown) => {
                  form.setFieldValue('description', markdown)
                }}
              />
            </div>
          </div>
        </Form>
      </div>

      <Affix offsetBottom={0}>
        <div className="flex gap-2 p-4">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存
          </Button>
        </div>
      </Affix>
    </div>
  )
}
