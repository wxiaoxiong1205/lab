import type {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'
import axios from 'axios'
import { message, notification } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import React from 'react'
import { debounce } from 'lodash-es'
import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper'
import { copyToClipboard } from '../utils/clipboard'
import { tokenStorage, useAuthStore } from '../stores/authStore'
import { getBackendConfig, getBackendURLFromParams, sstBackendConfig } from '../utils/getBackendURL'
import { useIamLogin as iamLogin } from '@/hooks/use-iam-login'
import { getShowcaseStaticResponse, showcaseStaticAdapter } from '@/showcase/staticApi'

declare module 'axios' {
  interface AxiosRequestConfig {
    isRefreshToken?: boolean
  }
}

interface PageResponse {
  items: any[]
  total: number
  page: number
  size: number
}

interface ErrorResponse {
  detail: string
}

const normalizeApiBaseURL = (value?: string): string | null => {
  if (!value) {
    return null
  }

  const normalized = value.replace(/\/+$/, '')
  return normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`
}

// 根据环境设置 baseURL。独立部署时优先使用 VITE_API_BASE_URL，控制台内仍可走 /lab-backend。
const configuredBaseURL = normalizeApiBaseURL(import.meta.env.VITE_API_BASE_URL)
const baseURL = import.meta.env.DEV
  ? normalizeApiBaseURL(`${import.meta.env.VITE_PREFIX_BASE_URL || ''}`) || '/api/v1'
  : configuredBaseURL || '/lab-backend/api/v1'
const showcasePreviewToken = 'local-preview-lab-tenant-admin-token'
const isShowcasePreview = import.meta.env.VITE_SHOWCASE_PREVIEW === 'true'

const isShowcasePreviewBackend = (value?: string) => {
  return normalizeApiBaseURL(value) === normalizeApiBaseURL(baseURL)
}

const isShowcasePreviewAuth = (config?: InternalAxiosRequestConfig) => {
  const authorization = config?.headers?.Authorization || config?.headers?.authorization
  return isShowcasePreview && (
    tokenStorage.getToken() === showcasePreviewToken
    || authorization === `Bearer ${showcasePreviewToken}`
  )
}

const apiClient: AxiosInstance = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：自动附加 token，兜底处理
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 使用URL参数中的baseURL
    const backendURLFromParams = getBackendURLFromParams()
    if (backendURLFromParams) {
      config.baseURL = backendURLFromParams
      // 保存到localStorage
      sstBackendConfig(backendURLFromParams)
    }
    else {
      // 如果URL参数中没有，则使用localStorage中保存的配置
      const backendConfig = getBackendConfig()
      if (backendConfig?.baseURL) {
        config.baseURL = backendConfig.baseURL
      }
      // 如果都没有，使用默认的baseURL
    }

    if (getShowcaseStaticResponse(config)) {
      config.adapter = showcaseStaticAdapter
    }

    // 优先使用 qiankun 下发的 token
    let token: string | null = null
    if (window.qiankunProps?.authStorage) {
      const authInfo = window.qiankunProps.authStorage.getAuthInfo()
      token = authInfo?.token || null
    }

    // 如果没有 qiankun token，则使用原有的获取方式
    if (!token) {
      token
        = localStorage.getItem('auth_token')
          || tokenStorage?.getToken()
          || useAuthStore?.getState()?.token
    }

    if (!token && isShowcasePreview && isShowcasePreviewBackend(config.baseURL ?? baseURL)) {
      token = showcasePreviewToken
    }

    // 设置 token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error: AxiosError) => {
    console.error('❌ Request Error:', error)
    return Promise.reject(error)
  },
)

// 响应拦截器错误处理函数
const handleResponseError = (error: any) => {
  // 如果是取消请求，不显示错误提示
  if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
    return Promise.reject(error)
  }

  // 401 自动登出
  if (error?.response?.status === 401) {
    if (isShowcasePreviewAuth(error.response.config)) {
      return Promise.reject(error)
    }
    return tryRefreshToken(error.response.config)
  }

  // const errorMessage = getErrorMessage(error)
  // if (typeof errorMessage === 'string') {
  //   message.error(`${errorMessage}`)
  // }

  const data = error?.response?.data

  if (data?.msg) {
    openErrorNotification({
      msg: data?.msg,
      request_id: data?.request_id,
    })
  }

  return Promise.reject(error)
}

// 响应拦截器
apiClient.interceptors.response.use(
  (response: AxiosResponse<PageResponse | ErrorResponse>) => {
    return response
  },
  handleResponseError,
)

function handle401() {
  // 如果是微前端模式，logout 方法会调用控制台的登出方法
  const isQiankun = qiankunWindow.__POWERED_BY_QIANKUN__

  useAuthStore.getState()?.logout()

  // 非微前端模式才需要手动重定向
  if (!isQiankun) {
    const loginUrl = localStorage.getItem('login_url')
    if (loginUrl) {
      window.location.href = loginUrl
    }
    else {
      message.error('认证失效，请重新通过授权链接访问')
    }
  }
}

const debounceHandle401 = debounce(handle401, 100)

function tryRefreshToken(config: InternalAxiosRequestConfig) {
  // 如果是 qiankun 子应用，使用控制台的刷新 token 方法
  if (window.qiankunProps?.authStorage?.refresh) {
    return window.qiankunProps.authStorage.refresh(() => {
      return apiClient(config)
    }).catch(() => {
      return debounceHandle401()
    })
  }

  // 非 qiankun 模式的原有逻辑
  const rtk = tokenStorage.getRefreshToken()
  const { refreshToken } = iamLogin()

  if (rtk && !config.isRefreshToken) {
    return refreshToken().then(() => {
      return apiClient(config)
    }).catch(() => {
      return debounceHandle401()
    })
  }

  return debounceHandle401()
}

function getErrorMessage(error: any): string {
  if (error?.response) {
    const data = error.response.data
    if (data?.detail) {
      if (typeof data.detail === 'string') {
        return data.detail
      }
      else if (Array.isArray(data.detail)) {
        return data.detail[0]?.msg
      }
      return JSON.stringify(data.detail)
    }
    return data?.msg || data?.message || error?.message
  }
  return error?.message
}

export const openErrorNotification = debounce((error: {
  msg?: string
  request_id?: string
}) => {
  const requestId = error?.request_id
  notification.error({
    message: error?.msg,
    ...(requestId && {
      description: React.createElement(
        'span',
        { className: 'flex items-center gap-1' },
        `请求id: ${requestId}`,
        React.createElement(CopyOutlined, {
          className: 'cursor-pointer text-gray-400 ml-2',
          onClick: () => copyToClipboard(requestId ?? '', '请求id'),
        }),
      ),
    }),
    placement: 'topRight',
    duration: 4,
  })
}, 300)

export default apiClient
