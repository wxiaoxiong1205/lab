import { message } from 'antd'

/**
 * 复制文本到剪贴板 - 兼容Mac和鼠标右键复制
 * @param text 要复制的文本
 * @param fieldName 字段名称（用于提示消息）
 * @returns Promise<boolean> 复制是否成功
 */
export const copyToClipboard = (text: string, fieldName: string = '内容'): Promise<boolean> => {
  if (!text) {
    message.warning(`没有可复制的${fieldName}`)
    return Promise.resolve(false)
  }

  // 优先使用现代 Clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => {
      message.success(`${fieldName}已复制到剪贴板`)
      return true
    }).catch((err) => {
      // 如果 Clipboard API 失败，回退到传统方法
      return fallbackCopyTextToClipboard(text, fieldName)
    })
  }
  else {
    // 回退到传统方法（兼容旧浏览器和某些安全上下文）
    return Promise.resolve(fallbackCopyTextToClipboard(text, fieldName))
  }
}

/**
 * 传统复制方法 - 兼容所有浏览器和Mac
 * @param text 要复制的文本
 * @param fieldName 字段名称（用于提示消息）
 * @returns boolean 复制是否成功
 */
const fallbackCopyTextToClipboard = (text: string, fieldName: string): boolean => {
  const textArea = document.createElement('textarea')
  textArea.value = text

  // 避免滚动到底部
  textArea.style.top = '0'
  textArea.style.left = '0'
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'

  document.body.appendChild(textArea)
  textArea.focus()
  textArea.select()

  try {
    const successful = document.execCommand('copy')
    if (successful) {
      message.success(`${fieldName}已复制到剪贴板`)
      return true
    }
    else {
      message.error(`${fieldName}复制失败`)
      return false
    }
  }
  catch (err) {
    message.error(`${fieldName}复制失败: ${err}`)
    return false
  }
  finally {
    document.body.removeChild(textArea)
  }
}

/**
 * 为输入框添加右键复制支持
 * @param e 鼠标事件
 */
export const handleInputContextMenu = (e: React.MouseEvent<HTMLTextAreaElement | HTMLInputElement>) => {
  e.preventDefault()
  // 选中所有文本以便右键复制
  e.currentTarget.select()
}

/**
 * 检查浏览器是否支持现代剪贴板API
 * @returns boolean 是否支持
 */
export const isClipboardSupported = (): boolean => {
  return !!(navigator.clipboard && window.isSecureContext)
}
