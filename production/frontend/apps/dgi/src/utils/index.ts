import _ from 'lodash'

// 定义扩展的 HTMLElement 接口，支持浏览器厂商前缀
interface ExtendedHTMLElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>
  mozRequestFullScreen?: () => Promise<void>
  msRequestFullscreen?: () => Promise<void>
}

// 定义扩展的 Document 接口，支持浏览器厂商前缀
interface ExtendedDocument extends Document {
  webkitExitFullscreen?: () => Promise<void>
  mozCancelFullScreen?: () => Promise<void>
  msExitFullscreen?: () => Promise<void>
}

export const isNotEmptyValue = (value: any) => {
  if (Array.isArray(value)) {
    return value.length > 0
  }
  return !!value || value === 0 || value === false
}

export const isNotEmptyValueAllowNull = (value: any) => {
  if (Array.isArray(value)) {
    return value.length > 0
  }
  return !!value || value === 0 || value === false || value === null
}

export const handleBatchRequest = async (
  list: any[],
  fn: (args: any) => void,
) => {
  return Promise.allSettled(list.map((item) => fn(item)))
}

export const convertFileSize = (
  sizeInBytes?: number,
  prec = 1,
  allowEmpty = false,
): string | number => {
  if (!sizeInBytes) return allowEmpty ? '' : 0

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let size = sizeInBytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${_.round(size, prec)} ${units[unitIndex]}`
}

export const platformCall = () => {
  const platform = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isMac = () => {
    return platform.includes('Mac')
  }
  const isWin = () => {
    return platform.includes('Win')
  }
  return {
    isMac: isMac(),
    isWin: isWin(),
  }
}

export const formatTime = (seconds: number) => {
  if (isNaN(seconds) || !seconds || seconds === Infinity) {
    return '00:00'
  }
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  const formatted = [
    hrs.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
  ]

  if (hrs > 0) {
    return `${formatted[0]}:${formatted[1]}:${formatted[2]}`
  }
  return `${formatted[1]}:${formatted[2]}`
}

export const formatNumber = (num: number) => {
  if (!num) {
    return '0'
  }
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`
  }
  else if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}k`
  }
  else {
    return num.toString()
  }
}

export const formatLargeNumber = (value: number) => {
  if (typeof value !== 'number' || isNaN(value)) {
    return value
  }

  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(1).replace(/\.0$/, '')}B`
  }
  else if (value >= 1e6) {
    return `${(value / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  }
  else if (value >= 1e3) {
    return `${(value / 1e3).toFixed(1).replace(/\.0$/, '')}K`
  }
  else {
    return value
  }
}

export function loadLanguageConfig(language: string) {
  // @ts-ignore
  const requireContext = require.context(`./${language}`, false, /\.ts$/)

  const languageConfig: Record<string, string> = {}

  requireContext.keys().forEach((fileName: any) => {
    const moduleConfig = requireContext(fileName).default

    const moduleName = fileName.replace(/(\.\/|\.ts)/g, '')

    languageConfig[moduleName] = moduleConfig
  })

  return languageConfig
}

export function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = function (e: any) {
      resolve(e.target.result)
    }
    reader.readAsText(blob, 'utf-8')
  })
}

export const cosineSimilarity = (vec1: number[], vec2: number[]) => {
  if (vec1.length !== vec2.length) {
    throw new Error('both vectors must have the same length')
  }

  const dotProduct = vec1.reduce(
    (sum, value, index) => sum + value * vec2[index],
    0,
  )

  const magnitudeA = Math.sqrt(
    vec1.reduce((sum, value) => sum + value * value, 0),
  )
  const magnitudeB = Math.sqrt(
    vec2.reduce((sum, value) => sum + value * value, 0),
  )

  if (magnitudeA === 0 || magnitudeB === 0) {
    throw new Error('both vectors must have a length greater than 0')
  }

  return dotProduct / (magnitudeA * magnitudeB)
}

const htmlSpecialTags = /^<html>(.|[\n\r])*<\/html>$/i

export const isHTMLDocumentString = (str: string) => {
  return htmlSpecialTags.test(str?.trim())
}

// generate a random number between 0 and 64 bit

export const generateRandomNumber = () => {
  // 16: 0x1000；32:0x100000000
  return Math.floor(Math.random() * 0x100000000)
}

function base64ToBlob(base64: string, contentType = '', sliceSize = 512) {
  try {
    const base64Content = base64.replace(/^data:image\/[^;]+;base64,/, '')
    const byteCharacters = atob(base64Content)
    const byteArrays = []

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize)

      const byteNumbers = new Array(slice.length)
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i)
      }

      const byteArray = new Uint8Array(byteNumbers)
      byteArrays.push(byteArray)
    }

    return new Blob(byteArrays, { type: contentType })
  }
  catch (error) {
    return null
  }
}

export const base64ToFile = (base64String: string, fileName: string) => {
  try {
    if (!base64String) {
      return null
    }
    const match = base64String.match(/data:(.*?);base64,/)
    if (!match) {
      throw new Error('Invalid base64 string')
    }
    const contentType = match[1]
    const blob = base64ToBlob(base64String, contentType)
    if (!blob) {
      throw new Error('Failed to convert base64 to blob')
    }
    return new File([blob], fileName || contentType, { type: contentType })
  }
  catch (error) {
    return null
  }
}

// check onlinestatus
export const isOnline = () => {
  return typeof window !== 'undefined' ? window.navigator.onLine : true
}

// 递归检查 code 是否存在于菜单树中
export const hasMenuPermission = (code: string, menuList: any[]): boolean => {
  if (!menuList || !Array.isArray(menuList)) return false

  for (const menu of menuList) {
    if (menu.code === code) return true
    if (menu.children && hasMenuPermission(code, menu.children)) {
      return true
    }
  }
  return false
}

export const requestFullscreen = (element: HTMLElement) => {
  const extendedElement = element as ExtendedHTMLElement

  if (extendedElement.requestFullscreen) {
    return extendedElement.requestFullscreen()
  }
  else if (extendedElement.webkitRequestFullscreen) {
    return extendedElement.webkitRequestFullscreen()
  }
  else if (extendedElement.mozRequestFullScreen) {
    return extendedElement.mozRequestFullScreen()
  }
  else if (extendedElement.msRequestFullscreen) {
    return extendedElement.msRequestFullscreen()
  }
  return Promise.reject(new Error('Fullscreen not supported'))
}

export const exitFullscreen = () => {
  const extendedDocument = document as ExtendedDocument

  if (extendedDocument.exitFullscreen) {
    return extendedDocument.exitFullscreen()
  }
  else if (extendedDocument.webkitExitFullscreen) {
    return extendedDocument.webkitExitFullscreen()
  }
  else if (extendedDocument.mozCancelFullScreen) {
    return extendedDocument.mozCancelFullScreen()
  }
  else if (extendedDocument.msExitFullscreen) {
    return extendedDocument.msExitFullscreen()
  }
  return Promise.reject(new Error('Exit fullscreen not supported'))
}

// 跨浏览器全屏API兼容性处理
export const getFullscreenElement = () => {
  return (
    document.fullscreenElement
    || (document as any).webkitFullscreenElement
    || (document as any).mozFullScreenElement
    || (document as any).msFullscreenElement
  )
}

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const base64String = reader.result as string
      // 移除 base64 URL 的前缀 (e.g., "data:image/jpeg;base64,")
      const base64 = base64String.split(',')[1]
      resolve(base64)
    }
    reader.onerror = (error) => reject(error)
  })
}

/**
 * 获取 public path
 * 优先使用 qiankun 下发的 entry 路径，其次使用环境变量，最后使用 BASE_URL
 */
export const getPublicPath = () => {
  let publicPath = ''

  // 优先使用 qiankun 下发的 entry 路径
  if (window.qiankunProps?.entry) {
    try {
      const entryUrl = new URL(window.qiankunProps.entry)
      publicPath = entryUrl.origin + entryUrl.pathname
    }
    catch (e) {
      // 如果 entry 不是完整 URL，忽略错误，继续使用其他方式
      console.warn('Failed to parse qiankun entry URL:', window.qiankunProps.entry)
    }
  }

  // 其次使用环境变量
  if (import.meta.env.VITE_PUBLIC_PATH) {
    publicPath = import.meta.env.VITE_PUBLIC_PATH
  }

  // 最后使用 BASE_URL
  publicPath = publicPath || import.meta.env.BASE_URL

  // 确保 public path 以 / 结尾
  if (!publicPath.endsWith('/')) {
    publicPath += '/'
  }

  return publicPath
}

/**
 * 为静态资源路径添加 basePath 前缀
 * 用于处理普通 img 标签和 CSS backgroundImage 等场景
 * Next.js 的 Image 组件会自动处理 basePath，不需要使用此函数
 *
 * @param path - 原始路径（如 "/logo.png"）
 * @returns 添加了 basePath 的完整路径（如 "/dgi/logo.png"）
 */
export const withBasePath = (path: string): string => {
  // 如果路径为空或不是字符串，返回原值
  if (!path || typeof path !== 'string') {
    return path
  }

  // 如果是外部链接、协议相对路径或 data URL，直接返回
  if (
    path.startsWith('http://')
    || path.startsWith('https://')
    || path.startsWith('//')
    || path.startsWith('data:')
    || path.startsWith('blob:')
  ) {
    return path
  }

  // 如果是相对路径（不以 / 开头），不添加 basePath
  if (!path.startsWith('/')) {
    return path
  }

  const publicPath = getPublicPath()

  // 如果路径已经包含 public path，直接返回
  if (publicPath && path.startsWith(publicPath)) {
    return path
  }

  // 移除 public path 末尾的斜杠，然后拼接路径
  const normalizedPublicPath = publicPath.endsWith('/') ? publicPath.slice(0, -1) : publicPath
  return `${normalizedPublicPath}${path.startsWith('/') ? path : `/${path}`}`
}

export function withApiPath(path?: string): string {
  if (!path) {
    return ''
  }

  if (
    path.startsWith('http://')
    || path.startsWith('https://')
    || path.startsWith('//')
    || path.startsWith('data:')
    || path.startsWith('blob:')
  ) {
    return path
  }

  const basePath = '/dgi-backend'

  // 如果路径已经包含 basePath，直接返回
  if (path.startsWith(`${basePath}/`)) {
    return path
  }

  return `${basePath}${path}`
}

/**
 * 根据模型类型获取体验路由
 * @param category 模型的 category 字段，可以是逗号分隔的多个类型
 * @param modelName 模型名称
 * @returns 体验路由 URL，如果未找到匹配的类型则返回 null
 */
export function getModelExperienceRoute(category?: string, modelName?: string): string | null {
  // 模型类型到路由的映射
  const categoryRouteMap: Record<string, string> = {
    ChatCompletions: 'text',
    DeepReasoning: 'text',
    Vision_Language: 'vl-model',
    Rerank: 'rerank',
    AudioTranscription: 'transcriptions',
    Realtime: 'transcriptions',
    AudioSpeech: 'transcriptions',
  }

  if (!category || !modelName) {
    return null
  }

  const categories = category.split(',')
  const matchedCategory = categories.find((cat) => categoryRouteMap[cat.trim()])

  if (matchedCategory) {
    const experienceRoute = categoryRouteMap[matchedCategory.trim()]
    const encodedModelName = encodeURIComponent(modelName)
    return `/model-experience/${experienceRoute}?models=${encodedModelName}`
  }

  return null
}
