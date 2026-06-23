import React from 'react'
import { Button, Modal, Space, message } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import './OutputText.css'
// 添加剪贴板兼容性函数
const copyToClipboard = async (text: string): Promise<void> => {
  // 方法1: 使用 Clipboard API (现代浏览器)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text)
  }
  // 方法2: 使用 document.execCommand (兼容旧浏览器)
  return new Promise((resolve, reject) => {
    try {
      const textArea = document.createElement('textarea')
      textArea.value = text
      // 防止滚动到底部
      textArea.style.position = 'fixed'
      textArea.style.top = '0'
      textArea.style.left = '0'
      textArea.style.width = '2em'
      textArea.style.height = '2em'
      textArea.style.padding = '0'
      textArea.style.border = 'none'
      textArea.style.outline = 'none'
      textArea.style.boxShadow = 'none'
      textArea.style.background = 'transparent'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      if (successful) {
        resolve()
      }
      else {
        reject(new Error('execCommand 复制失败'))
      }
    }
    catch (err) {
      reject(err)
    }
  })
}
interface OutputTextProps {
  text: string
  maxLength?: number
}
export const OutputText: React.FC<OutputTextProps> = ({ text, maxLength = 50 }) => {
  if (!text)
    return <span>-</span>
    // 提取 think 标签内容
  const thinkMatches = text.match(/<think>([\s\S]*?)<\/think>/g)
  const hasThinkContent = !!thinkMatches
  // 如果有 think 标签，分别处理 think 内容和其他内容
  let displayContent
  let fullContent
  if (hasThinkContent) {
    // 提取所有思考内容和其他内容
    let otherContent = text
    const thoughts = thinkMatches.map((match) => {
      const content = match.match(/<think>([\s\S]*?)<\/think>/)[1].trim()
      otherContent = otherContent.replace(match, '').trim()
      return content
    })
    // 为显示准备内容
    displayContent = (
      <div>
        {thoughts.map((thought, index) => (
          <div
            className="output-text-thinking rounded-[6px] p-[12px] mb-[8px] relative"
            key={index}
          >
            <div
              className="output-text-thinking-label absolute top-[-10px] left-[10px] p-[0_6px] text-[12px]"
            >
              深度思考
              {' '}
              {index + 1}
            </div>
            {thought.length > maxLength ? `${thought.substring(0, maxLength)}...` : thought}
          </div>
        ))}
        {otherContent && (<div>{otherContent.length > maxLength ? `${otherContent.substring(0, maxLength)}...` : otherContent}</div>)}
      </div>
    )
    // 为完整内容准备格式化显示
    fullContent = (
      <div>
        {thoughts.map((thought, index) => (
          <div
            className="output-text-thinking rounded-[6px] p-[16px] mb-[16px] relative"
            key={index}
          >
            <div
              className="output-text-thinking-label absolute top-[-10px] left-[10px] p-[0_6px] text-[12px]"
            >
              深度思考
              {' '}
              {index + 1}
            </div>
            <pre
              className="output-text-pre whitespace-pre-wrap m-[0]"
            >
              {thought}
            </pre>
          </div>
        ))}
        {otherContent && (
          <div className="mt-4">
            <pre
              className="output-text-pre whitespace-pre-wrap m-[0]"
            >
              {otherContent}
            </pre>
          </div>
        )}
      </div>
    )
  }
  else {
    // 如果没有 think 标签，保持原来的处理方式
    displayContent = text.length > maxLength ? `${text.substring(0, maxLength)}...` : text
    fullContent = <pre className="whitespace-pre-wrap break-words">{text}</pre>
  }
  return (
    <div className="relative">
      <div className="max-h-[200px] overflow-hidden">
        {displayContent}
      </div>
      {((hasThinkContent && (thinkMatches.some((match) => match.length > maxLength) || text.length > maxLength))
        || (!hasThinkContent && text.length > maxLength)) && (
        <Button
          type="link"
          className="p-0"
          onClick={() => {
            Modal.info({
              title: 'Chain Output',
              content: (
                <div className="relative">
                  <Button
                    className="absolute top-[0] right-[0] z-[1]"
                    icon={<CopyOutlined />}
                    type="text"
                    onClick={(e) => {
                      e.stopPropagation()
                      copyToClipboard(text)
                        .then(() => {
                          message.success('内容已复制到剪贴板')
                        })
                        .catch((err) => {
                          console.error('复制失败:', err)
                          message.error('复制失败，请重试')
                        })
                    }}
                  />
                  <div
                    className="output-text-modal-body max-h-[60vh] overflow-auto p-[12px] pt-[40px] whitespace-pre-wrap font-mono"
                  >
                    {fullContent}
                  </div>
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
