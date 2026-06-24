import type { AxiosError, AxiosRequestConfig } from 'axios'
import axios from 'axios'
import { message } from 'antd'
import { debounce } from 'lodash'
import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper'
import { logout } from './system'
import { i18nTool } from '@/locales'
import useAuthStore from '@/stores/auth'
import { useIamLogin } from '@/hooks/use-iam-login'

interface IResponse<D> {
  items: never[]
  results: never[]
  id: string | number
  code: number
  data: D
  msg: string
  message: string
}

declare module 'axios' {
  interface AxiosRequestConfig {
    isRefreshToken?: boolean
    isLLMStreamRequest?: boolean
  }
}

// 创建 axios 实例
const http = axios.create({
  timeout: 30000, // 请求超时时间
  baseURL: '/dgi-backend/api_v2/',
  headers: {
    'Content-Type': 'application/json',
  },
})

async function handle401(error: AxiosError | IResponse<any>) {
  if (error) {
    await handleStreamError(error)
  }

  return new Promise((resolve, reject) => {
    // 1秒后弹出提示，1秒后执行logout
    message.error('未登录或登录已过期', 1, () => {
      if (typeof window !== 'undefined') {
        logout()
      }
      reject(new Error('未登录或登录已过期'))
    })
  })
}
const debounceHandle401 = debounce(handle401, 100)

async function handleStreamError(error: AxiosError | any) {
  if ('config' in error && error.config?.isLLMStreamRequest) {
    const e = await readErrorFromReadableStream(error.response?.data as ReadableStream)
    error.response!.data = e
    throw error
  }
}

function tryRefreshToken(config: AxiosRequestConfig, error: any) {
  if (qiankunWindow.__POWERED_BY_QIANKUN__ && window.qiankunProps?.authStorage?.refresh) {
    return new Promise((resolve, reject) => {
      window.qiankunProps.authStorage.refresh(() => {
        // 刷新成功，更新本地 token
        const authInfo = window.qiankunProps.authStorage.getAuthInfo?.() || {}
        if (authInfo.token) {
          useAuthStore.getState().setToken(authInfo.token)
        }
        if (authInfo.refreshToken) {
          useAuthStore.getState().setRefreshToken(authInfo.refreshToken)
        }
        // 重试请求
        resolve(request(config))
      })
    })
  }

  const rtk = useAuthStore.getState().refreshToken
  const { refreshToken } = useIamLogin()

  if (rtk && !config.isRefreshToken) {
    return refreshToken().then(() => {
      return request(config)
    }).catch((error) => {
      return debounceHandle401(error)
    })
  }

  return debounceHandle401(error)
}

/** API 测试转发：透传结果可能非 code:0 统一包装，放行整包 */
function isApiServiceTestForwardUrl(url: string | undefined) {
  if (!url) return false
  const path = url.split('?')[0] ?? ''
  return /\/api_service\/[^/]+\/test$/.test(path)
}

// 请求拦截器
http.interceptors.request.use(
  (config) => {
    if (config.url?.includes('/gpustack')) {
      // 如果 URL 以 gpustack 开头，保持原样
      config.baseURL = '/'
    }
    // 如果 URL 包含 /lab/，确保 baseURL 为根路径以使用 Next.js 代理
    if (config.url?.includes('/lab/')) {
      config.baseURL = '/'
    }

    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    config.headers['Accept-Language'] = i18nTool.getCurrentLang()

    // 如果请求数据是 FormData，删除 Content-Type 让 axios 自动设置（包含 boundary）
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

// 响应拦截器
http.interceptors.response.use(
  (response) => {
    // 如果是 blob 类型，直接返回数据（用于文件下载）
    if (response.config.responseType === 'blob') {
      return response.data
    }

    if (response.config.adapter === 'fetch') {
      return response
    }

    const res = response.data

    const url = response?.config.url
    const specialPatterns = ['gpustack', '/lab-backend', 'dgi-dev.deepexi.com']

    if (url && specialPatterns.some((pattern) => url.includes(pattern))) {
      return res
    }

    // 这里假设后端返回的数据结构为 { code: number, data: any, message: string }
    if (res.code == 0 || isApiServiceTestForwardUrl(url)) {
      return res
    }

    // 处理特定的错误码
    if (res.code === 401 || res.message === 'Token expired') {
      return tryRefreshToken(response.config, res)
    }

    if (res.code === -1) {
      message.error(res.message)
      return Promise.reject(new Error(res.message || '请求失败'))
    }

    return Promise.reject(new Error(res.message || '请求失败'))
  },
  (error) => {
    // 处理网络错误
    if (error.response) {
      // 服务器返回错误状态码
      switch (error.response.status) {
        case 401:
          return handleStreamError(error).then(() => {
            return tryRefreshToken(error.response.config, error.response)
          })
        case 402:
          message.error('当前余额不足')
          break
        case 403:
          message.error('没有权限访问')
          break
        case 404:
          message.error('请求的资源不存在')
          break
        // 409 表示请求的资源已存在,gpustack部署模型
        // case 409:
        //   message.error(error.response.data.message);
        //   break;
        case 500:
          message.error('服务器错误')
          break
        default:
          if (error.response.config.url?.includes('gpustack')) {
            const deepexiStackServerEnabled = !!JSON.parse(localStorage.getItem('deepexiStackServerEnabled') || '{}').deepexiStackServerEnabled
            if (deepexiStackServerEnabled) {
              message.error(`${error.response.data.message}`)
            }
          }
          else {
            message.error(`请求失败: ${error.message}`)
          }
      }
    }
    else if (error.request) {
      // 请求发出但没有收到响应
      // message.error("网络错误，请检查网络连接");
    }
    else {
      if (error.message === 'canceled') return
      // 请求配置出错
      message.error(`请求配置错误: ${error.message}`)
    }

    // 都可能是流式请求的错误，先处理流式请求的错误
    return handleStreamError(error).then(() => {
      return Promise.reject(error)
    })
  },
)

/**
 * 从 ReadableStream 中读取 JSON 错误信息
 * @param {ReadableStream} stream 可读流
 * @returns {Promise<object>} 解析后的 JSON 错误对象
 */
async function readErrorFromReadableStream(stream: ReadableStream) {
  let text = ''
  try {
    // 将 ReadableStream 转换为文本
    text = await new Response(stream).text()
    // 尝试解析为 JSON
    return JSON.parse(text)
  }
  catch (parseError: any) {
    // 如果不是 JSON 格式，返回原始文本
    console.warn('无法解析为 JSON，返回原始文本:', parseError.message)
    return text
  }
}

function request<D = any, Resp = IResponse<D>>(config: AxiosRequestConfig) {
  return http(config) as Promise<Resp>
}

export default request
