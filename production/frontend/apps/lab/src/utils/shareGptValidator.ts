import type { RoleConversation } from '../types'

/**
 * Role(user+assistant)格式验证工具
 */
export class RoleValidator {
  /**
   * 验证Role(user+assistant)文件格式
   */
  static async validateFile(file: File): Promise<{
    valid: boolean
    error?: string
    data?: RoleConversation[]
    stats?: {
      totalConversations: number
      totalMessages: number
      averageMessagesPerConversation: number
    }
  }> {
    try {
      const content = await file.text()
      const jsonData = JSON.parse(content)

      // 检查根级别是否为数组
      if (!Array.isArray(jsonData)) {
        return {
          valid: false,
          error: 'Role(user+assistant)格式要求根级别为数组',
        }
      }

      if (jsonData.length === 0) {
        return {
          valid: false,
          error: '文件不能为空',
        }
      }

      // 验证每个对话
      let totalMessages = 0
      for (let i = 0; i < jsonData.length; i++) {
        const conversation = jsonData[i]
        const validationResult = this.validateConversation(conversation, i)

        if (!validationResult.valid) {
          return validationResult
        }

        totalMessages += conversation.conversations.length
      }

      // 计算统计信息
      const stats = {
        totalConversations: jsonData.length,
        totalMessages,
        averageMessagesPerConversation: Math.round(totalMessages / jsonData.length * 100) / 100,
      }

      return {
        valid: true,
        data: jsonData as RoleConversation[],
        stats,
      }
    }
    catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : '文件解析失败，请检查JSON格式',
      }
    }
  }

  /**
   * 验证单个对话格式
   */
  static validateConversation(conversation: any, index: number): { // eslint-disable-line @typescript-eslint/no-explicit-any
    valid: boolean
    error?: string
  } {
    // 检查conversations字段
    if (!conversation.conversations) {
      return {
        valid: false,
        error: `第${index + 1}个对话缺少conversations字段`,
      }
    }

    if (!Array.isArray(conversation.conversations)) {
      return {
        valid: false,
        error: `第${index + 1}个对话的conversations字段必须是数组`,
      }
    }

    if (conversation.conversations.length === 0) {
      return {
        valid: false,
        error: `第${index + 1}个对话不能为空`,
      }
    }

    // 验证每条消息
    for (let i = 0; i < conversation.conversations.length; i++) {
      const message = conversation.conversations[i]
      const messageValidation = this.validateMessage(message, index, i)

      if (!messageValidation.valid) {
        return messageValidation
      }
    }

    return { valid: true }
  }

  /**
   * 验证单条消息格式
   */
  static validateMessage(message: any, conversationIndex: number, messageIndex: number): { // eslint-disable-line @typescript-eslint/no-explicit-any
    valid: boolean
    error?: string
  } {
    // 检查必需字段
    if (!message.from) {
      return {
        valid: false,
        error: `第${conversationIndex + 1}个对话的第${messageIndex + 1}条消息缺少from字段`,
      }
    }

    if (!message.value) {
      return {
        valid: false,
        error: `第${conversationIndex + 1}个对话的第${messageIndex + 1}条消息缺少value字段`,
      }
    }

    // 检查from字段值
    const validRoles = ['system', 'user', 'assistant']
    if (!validRoles.includes(message.from)) {
      return {
        valid: false,
        error: `第${conversationIndex + 1}个对话的第${messageIndex + 1}条消息的from字段值无效：${message.from}。允许的值：${validRoles.join(', ')}`,
      }
    }

    // 检查value字段类型
    if (typeof message.value !== 'string') {
      return {
        valid: false,
        error: `第${conversationIndex + 1}个对话的第${messageIndex + 1}条消息的value字段必须是字符串`,
      }
    }

    // 检查value字段不能为空
    if (message.value.trim().length === 0) {
      return {
        valid: false,
        error: `第${conversationIndex + 1}个对话的第${messageIndex + 1}条消息的value字段不能为空`,
      }
    }

    return { valid: true }
  }

  /**
   * 生成Role(user+assistant)格式模板
   */
  static generateTemplate(): RoleConversation[] {
    return [
      {
        conversations: [
          { from: 'system', value: '你是一个有用的AI助手。' },
          { from: 'user', value: '你好，请介绍一下自己。' },
          { from: 'assistant', value: '你好！我是一个AI助手，可以帮助你回答问题、处理任务和提供信息。有什么我可以帮助你的吗？' },
        ],
      },
      {
        conversations: [
          { from: 'system', value: '你是一个专业的编程助手。' },
          { from: 'user', value: '如何用Python打印Hello World？' },
          { from: 'assistant', value: '在Python中打印Hello World很简单，只需要使用print函数：\n\n```python\nprint("Hello World")\n```\n\n运行这行代码就会在控制台输出"Hello World"。' },
        ],
      },
      {
        conversations: [
          { from: 'user', value: '什么是机器学习？' },
          { from: 'assistant', value: '机器学习是人工智能的一个重要分支，它使计算机能够在不被明确编程的情况下学习和改进。通过分析大量数据，机器学习算法可以识别模式，做出预测，并随着接触更多数据而提高性能。' },
          { from: 'user', value: '能举个具体的例子吗？' },
          { from: 'assistant', value: '当然！一个经典的例子是电子邮件垃圾邮件过滤器。系统通过分析数千封标记为"垃圾邮件"和"非垃圾邮件"的邮件，学习识别垃圾邮件的特征，如特定关键词、发送者模式等，然后能够自动识别新的垃圾邮件。' },
        ],
      },
    ]
  }

  /**
   * 预览数据集内容
   */
  static previewData(data: RoleConversation[], limit = 3): RoleConversation[] {
    return data.slice(0, limit)
  }

  /**
   * 检查数据集质量
   */
  static analyzeQuality(data: RoleConversation[]): {
    totalConversations: number
    totalMessages: number
    averageMessagesPerConversation: number
    roleDistribution: Record<string, number>
    warnings: string[]
  } {
    let totalMessages = 0
    const roleDistribution: Record<string, number> = {}
    const warnings: string[] = []

    data.forEach((conversation, index) => {
      totalMessages += conversation.conversations.length

      // 分析角色分布
      conversation.conversations.forEach((message) => {
        roleDistribution[message.from] = (roleDistribution[message.from] || 0) + 1
      })

      // 检查对话质量
      if (conversation.conversations.length < 2) {
        warnings.push(`第${index + 1}个对话只有${conversation.conversations.length}条消息，建议至少包含2条消息`)
      }

      // 检查是否有system消息
      const hasSystem = conversation.conversations.some((msg) => msg.from === 'system')
      if (!hasSystem && conversation.conversations.length > 2) {
        warnings.push(`第${index + 1}个对话建议添加system消息来设定AI角色`)
      }
    })

    return {
      totalConversations: data.length,
      totalMessages,
      averageMessagesPerConversation: Math.round(totalMessages / data.length * 100) / 100,
      roleDistribution,
      warnings,
    }
  }
}
