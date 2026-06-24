/**
 * 验证并规范化baseURL格式
 * @param url 待验证的URL
 * @returns 规范化后的URL，如果无效则返回null
 */
function normalizeBaseURL(url: string | null): string | null {
  if (!url) return null

  // 去除首尾空格
  url = url.trim()
  if (!url) return null

  // 如果URL不包含协议，尝试添加http://
  if (!url.match(/^https?:\/\//i)) {
    // 如果以//开头，添加http:
    if (url.startsWith('//')) {
      url = `http:${url}`
    }
    else {
      // 否则添加http://
      url = `http://${url}`
    }
  }

  try {
    const urlObj = new URL(url)
    // 确保URL格式有效
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      // 移除末尾的斜杠，统一格式
      return url.replace(/\/+$/, '')
    }
  }
  catch (e) {
    console.warn('无效的baseURL格式:', url)
    return null
  }

  return null
}

/**
 * 从URL参数获取后端地址
 * 支持参数名: baseurl, api, backend
 * @returns 规范化后的baseURL，如果不存在则返回null
 */
export function getBackendURLFromParams(): string | null {
  const urlParams = new URLSearchParams(window.location.search)
  const backendURL = urlParams.get('baseurl') || urlParams.get('api') || urlParams.get('backend')

  // 检查是否需要清除配置
  const clearBackend = urlParams.get('clearBackend') || urlParams.get('clear')
  if (clearBackend === 'true' || clearBackend === '1') {
    clearBackendConfig()
    return null
  }

  return normalizeBaseURL(backendURL)
}

/**
 * 保存后端配置到localStorage
 * @param baseURL 后端地址
 * @param envName 环境名称（可选）
 */
export function sstBackendConfig(baseURL: string, envName?: string): void {
  if (!baseURL) {
    console.warn('尝试保存空的baseURL')
    return
  }

  const normalizedURL = normalizeBaseURL(baseURL)
  if (!normalizedURL) {
    console.error('无效的baseURL，无法保存:', baseURL)
    return
  }

  localStorage.setItem('debug_backend_url', normalizedURL)
  if (envName) {
    localStorage.setItem('debug_backend_env', envName)
  }

  console.log('✅ 后端配置已保存:', {
    baseURL: normalizedURL,
    envName: envName || '未命名环境',
  })
}

/**
 * 获取已保存的后端配置
 * @returns 后端配置对象，如果不存在则返回null
 */
export function getBackendConfig(): { baseURL: string, envName: string | null } | null {
  const baseURL = localStorage.getItem('debug_backend_url')
  if (!baseURL) {
    return null
  }

  return {
    baseURL,
    envName: localStorage.getItem('debug_backend_env'),
  }
}

/**
 * 清除后端配置
 */
export function clearBackendConfig(): void {
  localStorage.removeItem('debug_backend_url')
  localStorage.removeItem('debug_backend_env')
  console.log('🗑️ 后端配置已清除')
}
