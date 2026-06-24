import React from 'react'
import { Button, Modal } from 'antd'

interface TruncatedTextProps {
  text: string
  maxLength?: number
  modalTitle?: string
  maxHeight?: string
}
export const TruncatedText: React.FC<TruncatedTextProps> = ({ text, maxLength = 100, modalTitle = 'Full Content', maxHeight = '100px' }) => {
  if (!text)
    return <span>-</span>
  const displayText = text.length > maxLength ? `${text.substring(0, maxLength)}...` : text
  return (
    <div className="relative">
      <div className="overflow-hidden" style={{ maxHeight, textOverflow: 'ellipsis' }}>
        {displayText}
      </div>
      {text.length > maxLength && (
        <Button
          type="link"
          className="p-0"
          onClick={() => {
            Modal.info({
              title: modalTitle,
              content: (
                <div className="max-h-[60vh] overflow-auto">
                  <pre className="whitespace-pre-wrap break-words">{text}</pre>
                </div>
              ),
              width: 800,
            })
          }}
        >
          查看完整内容
        </Button>
      )}
    </div>
  )
}
