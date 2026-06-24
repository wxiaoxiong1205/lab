import { useState } from 'react'
import { Affix, Button, Form, Input, Tooltip, message } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import '@toast-ui/editor/dist/toastui-editor.css'
import { notebookService } from '@/services/notebookService'
import { useNotebookBasePath } from '@/hooks/getProjectPath'
import MarkdownEditor from '@/components/MdEditor'

const PUBLISH_NOTICE = `发布注意事项：
1.严禁包含虚拟环境： 请确保工作目录下没有 .venv、env 等自定义环境目录。
2.禁止软链接： 系统不支持发布包含“软链接”的文件，这通常是手动构建虚拟环境导致的，会导致发布失败。
3.正确处理依赖： 如需额外第三方库，请直接通过 pip install 安装或配置 requirements.txt，严禁将环境直接安装在当前工作目录下。`

export default function PublishCase() {
  const { projectId, notebookId } = useParams()
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { notebookBasePath } = useNotebookBasePath()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const handlePublishCase = async () => {
    setLoading(true)
    try {
      await form.validateFields()
      if (!form.getFieldValue('description')) {
        message.error('请输入案例说明')
        return
      }
      const values = form.getFieldsValue()
      await notebookService.publishCase(projectId, notebookId, {
        project_id: projectId,
        notebook_id: notebookId,
        name: values.name,
        describe: values.description ?? '',
      })
      await queryClient.invalidateQueries({ queryKey: ['notebookSquareList'] })
      message.success('发布案例成功')
      setLoading(false)
      navigate(`${notebookBasePath}/tabs/square`)
    }
    catch (error) {
      console.error('Failed to publish case:', error)
      message.error('发布案例失败')
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full min-h-0 flex flex-col p-4">
      <div className="flex-1 min-h-0 overflow-hidden">
        <Form form={form} layout="vertical" className="h-full min-h-0 flex flex-col">
          <Form.Item
            label="案例名称"
            name="name"
            rules={[{ required: true, message: '请输入案例名称' }]}
          >
            <Input placeholder="请输入案例名称" />
          </Form.Item>

          <Form.Item
            name="description"
            label={(
              <span className="inline-flex items-center gap-1">
                案例说明
                <Tooltip
                  title={<span className="whitespace-pre-wrap">{PUBLISH_NOTICE}</span>}
                  placement="topLeft"
                >
                  <QuestionCircleOutlined className="cursor-help text-gray-400" />
                </Tooltip>
              </span>
            )}
            required
            className="
            !mb-0
            [&_.ant-form-item-control-input]:!min-h-0
            [&_.ant-form-item-control-input-content]:!h-0
            "
          >
          </Form.Item>

          <div className="flex flex-1 min-h-0 flex-col">
            <div className="flex-1 min-h-0 overflow-hidden pb-12">
              <MarkdownEditor
                value=""
                height="100%"
                placeholder={PUBLISH_NOTICE}
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
          <Button onClick={() => navigate(`${notebookBasePath}/tabs/mine`)}>取消</Button>
          <Button type="primary" onClick={handlePublishCase} loading={loading}>
            发布为案例
          </Button>
        </div>
      </Affix>
    </div>
  )
}
