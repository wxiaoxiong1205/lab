/**
 * 图片处理工具函数
 */

/**
 * 替换 content 中的 <image> 占位符为 img 标签
 * @param content 包含 <image> 占位符的内容字符串
 * @param images 图片路径数组
 * @param baseUrl 基础 URL 路径
 * @param startIndex 起始图片索引，默认为 0
 * @returns 处理后的内容和下一个图片索引
 */
export const replaceImagePlaceholders = (
  content: string,
  images: string[],
  baseUrl: string,
  startIndex: number = 0,
): { processedContent: string, nextIndex: number } => {
  if (!content) {
    return { processedContent: '', nextIndex: startIndex }
  }

  if (!images || images.length === 0) {
    return { processedContent: content, nextIndex: startIndex }
  }

  let imageIndex = startIndex
  const imageBaseUrl = import.meta.env.DEV
    ? `${import.meta.env.VITE_PREFIX_BASE_URL}/api/v1/storage/download/`
    : '/lab-backend/api/v1/storage/download/'

  const processedContent = content.replace(/<image>/g, () => {
    if (imageIndex >= images.length) {
      return '<image>' // 如果没有更多图片，保留占位符
    }

    const imagePath = images[imageIndex]
    const fileName = imagePath.includes('/') ? imagePath.split('/').pop() : imagePath

    const imageUrl = `${imageBaseUrl}${baseUrl}/${fileName}`

    imageIndex++

    return `<img src="${imageUrl}" alt="Image" class="max-w-full h-auto rounded my-1" />`
  })

  return { processedContent, nextIndex: imageIndex }
}

/**
 * 处理图像类型数据的 messages，将 system/user/assistant 分组
 * @param messages 消息数组
 * @param images 图片路径数组
 * @param baseUrl 基础 URL 路径
 * @returns 处理后的结果，包含 system、prompts 和 responses
 */
export const processImageMessages = (
  messages: any[],
  images: string[] = [],
  baseUrl: string = '',
): {
  system: string
  prompts: string[]
  responses: string[]
} => {
  const result = {
    system: '',
    prompts: [] as string[],
    responses: [] as string[],
  }

  // 用于跟踪已使用的图片索引
  let imageIndex = 0

  messages.forEach((msg) => {
    const content = msg.content || ''

    // 替换占位符，并更新图片索引
    const { processedContent, nextIndex } = replaceImagePlaceholders(content, images, baseUrl, imageIndex)
    imageIndex = nextIndex

    if (msg.role === 'system') {
      result.system = processedContent
    }
    else if (msg.role === 'user') {
      result.prompts.push(processedContent)
    }
    else if (msg.role === 'assistant') {
      result.responses.push(processedContent)
    }
  })

  return result
}

/**
 * 标准化图像数据，统一不同的数据结构
 * @param item 原始数据项
 * @returns 标准化后的数据，包含 messages 和 images
 */
export const normalizeImageData = (item: any): {
  messages: any[]
  images: string[]
  baseUrl: string
  originalData: any
} => {
  // 调试信息
  console.log('原始数据项结构:', Object.keys(item))
  if (item.sample_data) {
    console.log('sample_data 结构:', Object.keys(item.sample_data))
  }

  // 情况1: 数据直接包含 messages 和 images
  if (item.messages && item.images) {
    return {
      messages: item.messages,
      images: item.images,
      baseUrl: item.base_url || item.baseUrl || '',
      originalData: item,
    }
  }

  // 情况2: 数据嵌套在 sample_data 中（您的数据结构）
  if (item.sample_data) {
    return {
      messages: item.sample_data.messages || [],
      images: item.sample_data.images || [],
      baseUrl: item.base_url || item.baseUrl || '',
      originalData: item,
    }
  }

  // 情况3: 其他可能的数据结构
  console.warn('无法识别的数据结构，使用空数组:', item)
  return {
    messages: [],
    images: [],
    baseUrl: item.base_url || item.baseUrl || '',
    originalData: item,
  }
}

/**
 * 处理图像数据或文本多轮对话数据，将 messages 分类并格式化，但不展开成多行
 * 每条原始数据对应一行，所有对话内容显示在同一个单元格内，用分隔线分隔
 * 注意：messages 只用于在单元格内显示内容，不影响分页计算
 * 分页应该按照原始数据条数计算，而不是展开后的行数
 * @param data 原始数据数组
 * @returns 处理后的数据数组，每条数据一行
 */
export const expandImageData = (data: any[]): any[] => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return []
  }

  return data.map((item, dataIndex) => {
    try {
      // 从数据中提取 messages 和 images
      // 兼容两种格式：顶层或 sample_data 中
      const messages = item.messages || item.sample_data?.messages || []
      const images = item.images || item.sample_data?.images || []
      const baseUrl = item.base_url || ''

      // 分类处理 messages
      let systemMessage = ''
      const userMessages: string[] = []
      const assistantMessages: string[] = []

      // 用于跟踪已使用的图片索引
      let imageIndex = 0

      // 按顺序遍历 messages，分类到对应的数组
      if (messages && Array.isArray(messages) && messages.length > 0) {
        messages.forEach((msg: any) => {
          if (!msg || !msg.role) return

          const content = msg.content || ''

          // 如果有图片数组且不为空，则替换图片占位符；否则直接使用文本内容
          let processedContent = content
          if (images && Array.isArray(images) && images.length > 0) {
            const result = replaceImagePlaceholders(
              content,
              images,
              baseUrl,
              imageIndex,
            )
            processedContent = result.processedContent
            imageIndex = result.nextIndex
          }

          // 按 role 分类
          if (msg.role === 'system') {
            systemMessage = processedContent
          }
          else if (msg.role === 'user') {
            userMessages.push(processedContent)
          }
          else if (msg.role === 'assistant') {
            assistantMessages.push(processedContent)
          }
        })
      }

      return {
        ...item,
        // 保存处理后的数据，用于渲染
        _systemMessage: systemMessage,
        _userMessages: userMessages,
        _assistantMessages: assistantMessages,
      }
    }
    catch (error) {
      console.error(`处理数据 ${item.row_number || dataIndex} 时出错:`, error, item)
      return {
        ...item,
        _systemMessage: '',
        _userMessages: [],
        _assistantMessages: [],
      }
    }
  })
}

/**
 * 获取所有图片 URL（用于预加载或批量下载）
 * @param data 原始数据数组
 * @param baseUrl 基础 URL 路径
 * @returns 所有图片的 URL 数组
 */
export const getAllImageUrls = (data: any[], baseUrl: string = ''): string[] => {
  const allUrls: string[] = []

  data.forEach((item) => {
    const normalized = normalizeImageData(item)

    normalized.images.forEach((imagePath) => {
      const fileName = imagePath.includes('/') ? imagePath.split('/').pop() : imagePath
      const imageBaseUrl = import.meta.env.DEV
        ? `${import.meta.env.VITE_PREFIX_BASE_URL}/api/v1/storage/download/`
        : '/lab-backend/api/v1/storage/download/'

      const imageUrl = `${imageBaseUrl}${baseUrl || normalized.baseUrl}/${fileName}`
      allUrls.push(imageUrl)
    })
  })

  return allUrls
}

/**
 * 用于表格展示的简单数据格式化（不展开）
 * @param data 原始数据数组
 * @returns 格式化后的数据，每条数据只显示第一条对话
 */
export const formatImageDataForTable = (data: any[]): any[] => {
  return data.map((item, index) => {
    const normalized = normalizeImageData(item)
    const processed = processImageMessages(
      normalized.messages,
      normalized.images,
      normalized.baseUrl,
    )

    return {
      ...item,
      system_preview: processed.system
        ? (processed.system.length > 50 ? `${processed.system.substring(0, 50)}...` : processed.system)
        : '',
      prompt_preview: processed.prompts[0]
        ? (processed.prompts[0].length > 50 ? `${processed.prompts[0].replace(/<[^>]+>/g, '').substring(0, 50)}...` : processed.prompts[0])
        : '',
      response_preview: processed.responses[0]
        ? (processed.responses[0].length > 50 ? `${processed.responses[0].substring(0, 50)}...` : processed.responses[0])
        : '',
      images_count: normalized.images.length,
      dialogues_count: Math.max(processed.prompts.length, processed.responses.length),
    }
  })
}

/**
 * 解析文本中的 <User> 和 <Assistant> 标签，替换为带有 antd Tag 样式的 HTML
 * @param content 包含 <User> 和 <Assistant> 标签的内容字符串（可能已包含其他 HTML 标签，如图片）
 * @returns 处理后的 HTML 字符串，其中标签被替换为带样式的元素（第一个User标签不独占一行，其他标签独占一行）
 */
export const parseUserAssistantTags = (content: string): string => {
  if (!content) {
    return ''
  }

  // User 标签样式（第一个，不独占一行）：蓝色，类似 antd Tag color="blue"
  const userTagHtmlInline = '<span style="display: inline-block; padding: 0 7px; color: #1890ff; font-size: 12px; line-height: 20px; white-space: nowrap; background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 2px; cursor: default; margin-right: 4px; font-weight: 500;">User</span>'

  // User 标签样式（非第一个，独占一行）：蓝色，类似 antd Tag color="blue"
  const userTagHtmlBlock = '<div style="display: block; padding: 0 7px; color: #1890ff; font-size: 12px; line-height: 20px; white-space: nowrap; background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 2px; cursor: default; margin: 4px 0; font-weight: 500; width: fit-content;">User</div>'

  // Assistant 标签样式：绿色，类似 antd Tag color="green"，独占一行
  const assistantTagHtml = '<div style="display: block; padding: 0 7px; color: #52c41a; font-size: 12px; line-height: 20px; white-space: nowrap; background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 2px; cursor: default; margin: 4px 0; font-weight: 500; width: fit-content;">Assistant</div>'

  let processed = content
  let isFirstUser = true

  // 处理 User 标签：第一个如果后面跟了 image 标签才是 inline，其他使用 block
  processed = processed.replace(/<User>/gi, (match, offset, string) => {
    // 检查是否是第一个 User 标签（前面只有空白字符或没有内容）
    if (isFirstUser) {
      const beforeMatch = string.substring(0, offset)
      // 如果前面只有空白字符或为空，则是第一个
      if (!beforeMatch.trim() || beforeMatch.trim().length === 0) {
        // 检查后面是否有 image 标签（<image> 或 <img）
        const afterMatch = string.substring(offset + match.length)
        const hasImageAfter = /<image>|<img/i.test(afterMatch)

        isFirstUser = false
        // 只有后面跟了 image 标签才使用 inline
        return hasImageAfter ? userTagHtmlInline : userTagHtmlBlock
      }
    }
    isFirstUser = false
    return userTagHtmlBlock
  })

  // 处理 Assistant 标签：全部使用 block
  processed = processed
    .replace(/<Assistant>/gi, assistantTagHtml)
    .replace(/<\/Assistant>/gi, '') // 闭合标签直接移除

  // 移除 User 闭合标签
  processed = processed.replace(/<\/User>/gi, '')

  return processed
}
