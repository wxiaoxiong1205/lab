import { ArrowsAltOutlined, ShrinkOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
import { Editor as ToastEditor } from '@toast-ui/react-editor'
import '@toast-ui/editor/dist/toastui-editor.css'
import { Button, Spin, Tooltip } from 'antd'
import { notebookService } from '@/services/notebookService'

interface Props {
  value?: string
  onChange?: (md: string, html: string) => void
  placeholder?: string
  height?: string
}

export default function MdEditor({
  value = '',
  onChange,
  placeholder = '请输入内容...',
  height = '550px',
}: Props) {
  const editorRef = useRef<ToastEditor>(null)
  const [loading, setLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const editorHeight = isFullscreen ? 'calc(100vh - 32px)' : height

  useEffect(() => {
    const editor = editorRef.current?.getInstance()
    editor?.setHeight(editorHeight)
  }, [editorHeight])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false)
      }
    }

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen])

  const handleChange = () => {
    const editor = editorRef.current?.getInstance()
    if (!editor)
      return

    onChange?.(editor.getMarkdown(), editor.getHTML())
  }

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-[9999] bg-white p-4' : 'relative h-full min-h-0'}>
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60">
          <Spin tip="图片上传中..." />
        </div>
      )}

      <Tooltip title={isFullscreen ? '退出全屏' : '全屏'}>
        <Button
          type="text"
          size="small"
          icon={isFullscreen ? <ShrinkOutlined /> : <ArrowsAltOutlined />}
          onClick={() => setIsFullscreen((prev) => !prev)}
          className="!absolute right-5 top-5 z-40"
        />
      </Tooltip>

      <ToastEditor
        ref={editorRef}
        initialValue={value || ' '}
        previewStyle="vertical"
        height={editorHeight}
        minHeight="300px"
        initialEditType="wysiwyg"
        usageStatistics={false}
        placeholder={placeholder}
        onChange={handleChange}
        toolbarItems={[
          ['heading', 'bold', 'italic', 'strike'],
          ['hr', 'quote'],
          ['ul', 'ol', 'task'],
          ['link', 'image', 'code', 'codeblock'],
        ]}
        hooks={{
          addImageBlobHook: async (blob, callback) => {
            try {
              setLoading(true)
              const file = new File([blob], 'upload.png', { type: blob.type })
              const url = (await notebookService.uploadImage(file)).image_url
              callback(`/lab-backend${url}`, '图片描述')
            }
            catch (error) {
              console.error('图片上传失败', error)
            }
            finally {
              setTimeout(() => {
                setLoading(false)
              }, 500)
            }
          },
        }}
      />
    </div>
  )
}
