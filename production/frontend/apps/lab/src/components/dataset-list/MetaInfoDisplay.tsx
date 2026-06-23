import React from 'react'
import { Button, Modal, Space, message } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import ReactJson from '@microlink/react-json-view'

interface MetaInfoDisplayProps {
  metaInfo: Record<string, any>
}
export const MetaInfoDisplay: React.FC<MetaInfoDisplayProps> = ({ metaInfo }) => {
  if (!metaInfo || Object.keys(metaInfo).length === 0) {
    return <span>-</span>
  }
  // 创建预览文本
  const previewItems = []
  if (metaInfo.prompt?.title) {
    previewItems.push(`Prompt: ${metaInfo.prompt.title}`)
  }
  if (metaInfo.model?.name) {
    previewItems.push(`Model: ${metaInfo.model.name}`)
  }
  const preview = previewItems.length > 0
    ? previewItems.join(', ')
    : `${Object.keys(metaInfo).length} fields`
  return (
    <div>
      <div className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
        {preview}
      </div>
      <Space>
        <Button
          type="link"
          size="small"
          onClick={() => {
            Modal.info({
              title: '元数据详情',
              content: (
                <div className="max-h-[60vh] overflow-auto p-[10px] rounded-[4px]">
                  <ReactJson src={metaInfo} theme="monokai" displayDataTypes={false} name={false} collapsed={1} enableClipboard />
                </div>
              ),
              width: 800,
            })
          }}
        >
          查看详情
        </Button>
        <Button
          type="link"
          size="small"
          icon={<CopyOutlined />}
          onClick={(e) => {
            e.stopPropagation()
            navigator.clipboard.writeText(JSON.stringify(metaInfo, null, 2))
            message.success('内容已复制到剪贴板')
          }}
        >
          复制
        </Button>
      </Space>
    </div>
  )
}
