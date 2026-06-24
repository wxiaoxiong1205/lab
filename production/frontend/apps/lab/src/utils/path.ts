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
 * 为静态资源路径添加 public path 前缀
 * 用于处理普通 img 标签和 CSS backgroundImage 等场景
 *
 * @param path - 原始路径（如 "/logo.png"）
 * @returns 添加了 public path 的完整路径
 */
export const withBasePath = (path: string) => {
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

  // 如果是相对路径（不以 / 开头），不添加 public path
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
