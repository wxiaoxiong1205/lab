import { Button, Form, Input, Modal, Upload, message } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import { useEffect, useState } from 'react'
import { useTransform } from '@/locales'
import { apiDownloadPluginDoc, apiPluginCreate, apiPluginUpdate } from '@/services/api'

interface PluginData {
  id?: number
  name: string
  description?: string
  file?: File
}

interface AddPluginModalProps {
  type: 'add' | 'edit'
  open: boolean
  initialData?: PluginData
  onCancel: () => void
  onSuccess: () => void
}

export default function AddPluginModal({
  type,
  open,
  initialData,
  onCancel,
  onSuccess,
}: AddPluginModalProps) {
  const [form] = Form.useForm()
  const { $t } = useTransform()
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [downloading, setDownloading] = useState(false)

  // 当弹窗打开时，如果是编辑模式，设置初始值
  useEffect(() => {
    if (open && type === 'edit' && initialData) {
      form.setFieldsValue({
        name: initialData.name,
        description: initialData.description,
      })
    }
  }, [open, type, initialData, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      if (type === 'add') {
        // 新增逻辑
        const fileObj = (fileList[0] as any)?.originFileObj || fileList[0]

        // 验证新增时必须有文件
        if (!fileObj) {
          message.error($t('请上传文件'))
          return
        }

        console.log('fileList:', fileList)
        console.log('fileObj:', fileObj)

        // 创建 FormData 对象
        const formData = new FormData()
        formData.append('name', values.name)
        formData.append('description', values.description || '')

        // 添加文件
        if (fileObj instanceof File) {
          formData.append('plugin_file', fileObj, fileObj.name)
          console.log('✅ 上传文件:', fileObj.name, '大小:', fileObj.size, '类型:', fileObj.type)
        }
        else {
          console.error('❌ fileObj 不是 File 类型:', fileObj)
        }

        // 调试：打印 FormData 内容
        console.log('📦 FormData 内容:')
        for (const [key, value] of formData.entries()) {
          console.log('  ', key, ':', value instanceof File ? `File(${value.name}, ${value.size} bytes)` : value)
        }

        // 调用创建API
        await apiPluginCreate(formData)
        message.success($t('创建成功'))
      }
      else {
        // 编辑逻辑 - 只提交 description（JSON 格式）
        if (initialData?.id) {
          console.log('📝 编辑插件，只更新描述:', values.description)

          await apiPluginUpdate(initialData.id, {
            description: values.description || '',
          })
          message.success($t('更新成功'))
        }
      }

      form.resetFields()
      setFileList([])
      onSuccess()
    }
    catch (error: any) {
      console.error('提交失败:', error)
      message.error(error?.message || '操作失败')
    }
  }

  const handleCancel = () => {
    form.resetFields()
    setFileList([])
    onCancel()
  }

  // 下载开发文档
  const handleDownloadDoc = async () => {
    try {
      setDownloading(true)
      const blob = await apiDownloadPluginDoc() as unknown as Blob

      // 检查是否成功获取到 blob
      if (!(blob instanceof Blob)) {
        throw new TypeError('下载文件失败')
      }

      // 创建下载链接
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = '插件开发文档.docx' // 设置下载文件名
      document.body.appendChild(link)
      link.click()

      // 清理
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      message.success('下载成功')
    }
    catch (error: any) {
      console.error('下载失败:', error)
      message.error(error?.message || '下载失败')
    }
    finally {
      setDownloading(false)
    }
  }

  const uploadProps = {
    beforeUpload: (file: File) => {
      console.log('📎 选择文件:', file.name, '类型:', file.type, '大小:', file.size)

      // 将 File 对象包装成 UploadFile 格式
      const uploadFile: UploadFile = {
        uid: Date.now().toString(),
        name: file.name,
        status: 'done',
        originFileObj: file as any,
      }

      setFileList([uploadFile])
      return false // 阻止自动上传
    },
    fileList,
    maxCount: 1,
    onRemove: () => {
      setFileList([])
    },
  }

  return (
    <Modal
      title={type === 'add' ? $t('新增插件') : $t('编辑插件')}
      open={open}
      onCancel={handleCancel}
      onOk={handleSubmit}
      okText={$t('确定')}
      cancelText={$t('取消')}
      width={520}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark
      >
        <Form.Item
          label={$t('插件名称')}
          name="name"
          rules={[{ required: true, message: $t('请输入插件名称') }]}
        >
          <Input
            placeholder={$t('请输入插件名称')}
            disabled={type === 'edit'}
          />
        </Form.Item>

        <Form.Item
          label={$t('上传文件')}
          name="file"
          required={type === 'add'}
          rules={[
            {
              validator: (_, value) => {
                // 新增时必须上传文件，编辑时可选
                if (type === 'add' && fileList.length === 0) {
                  return Promise.reject($t('请上传文件'))
                }
                return Promise.resolve()
              },
            },
          ]}
        >
          <Upload {...uploadProps} disabled={type === 'edit'}>
            <Button
              icon={<UploadOutlined />}
              disabled={type === 'edit'}
            >
              {$t('选择文件')}
            </Button>
          </Upload>
        </Form.Item>

        <div className="mb-4">
          <a
            href="#"
            className="text-blue-600"
            onClick={(e) => {
              e.preventDefault()
              handleDownloadDoc()
            }}
          >
            {downloading ? '下载中...' : $t('下载开发文档')}
          </a>
        </div>

        <Form.Item
          label={$t('说明')}
          name="description"
        >
          <Input.TextArea
            rows={4}
            placeholder={$t('请输入说明')}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
