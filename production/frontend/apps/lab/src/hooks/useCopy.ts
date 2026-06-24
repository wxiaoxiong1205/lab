import copyToClipboard from 'copy-to-clipboard'
import { message } from 'antd'

/**
 * 用于有关复制的自定义hook
 */
export function useCopy() {
  /**
   * 复制文本到剪贴板
   */
  const copy = (text: string, label: string = '') => {
    const ok = copyToClipboard(text)
    message[ok ? 'success' : 'error'](ok ? `${label}已复制` : '复制失败')
  }

  return {
    copy,
  }
}
