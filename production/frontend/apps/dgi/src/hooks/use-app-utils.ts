import { message } from 'antd'

const useAppUtils = () => {
  const [messageApi, contextHolder] = message.useMessage()

  const getRuleMessage = (
    type: 'input' | 'select',
    name: string,
    locale = true,
  ) => {
    const nameStr = name

    if (type === 'input') {
      return `请输入${nameStr}`
    }
    return `请选择${nameStr}`
  }

  const showSuccess = (msg?: string) => {
    messageApi.success(msg || '操作成功')
  }

  return {
    getRuleMessage,
    showSuccess,
  }
}

export default useAppUtils
