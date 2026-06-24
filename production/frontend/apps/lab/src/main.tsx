import { StrictMode } from 'react'
import type { Root } from 'react-dom/client'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// Import i18n configuration
import './i18n'
// Import update checker
import { initUpdateChecker } from './plugins/check-update'
// eslint-disable-next-line import/order
import { qiankunWindow, renderWithQiankun } from 'vite-plugin-qiankun/dist/helper'
import type { AppProps } from './types/console-mfe-props.d.ts'
import { useAuthStore } from './stores/authStore'
import { getPublicPath } from './utils/path'

// 嵌入（qiankun/无界）时标记 html，供 index.css 使用 100% 高度，避免子应用内容溢出被裁剪
if (qiankunWindow.__POWERED_BY_QIANKUN__ || window.__POWERED_BY_WUJIE__) {
  document.documentElement.setAttribute('data-embedding', 'mfe')
}

let root: Root | null = null

function render(props?: AppProps) {
  const { container } = props || {}

  const target = container
    ? (typeof container === 'string' ? document.querySelector(container) : container)?.querySelector('#root')
    : document.getElementById('root')

  if (!target) {
    console.error('Root element not found')
    return
  }

  // 避免重复创建 root
  if (!root) {
    root = createRoot(target)
  }

  root.render(
    <StrictMode>
      <App locale={props?.system?.locale} />
    </StrictMode>,
  )
}

renderWithQiankun({
  mount(props) {
    console.log('lab mount', import.meta.env.DEV ? props : '')
    window.qiankunProps = props as AppProps

    // 同步用户信息和 token
    if (props.authStorage) {
      const authInfo = props.authStorage.getAuthInfo?.() || {}
      if (authInfo.token) {
        useAuthStore.getState().setAuth(
          {
            userId: Number(props.userInfo?.userId || 0),
            username: props.userInfo?.username || '',
            accountId: Number(props.userInfo?.accountId || 0),
            tenantId: props.userInfo?.tenantId || '',
            enterpriseCode: props.userInfo?.enterpriseCode || '',
          },
          authInfo.token,
        )
      }
    }

    if (props.userInfo) {
      // 将控制台的用户信息同步到应用状态
      useAuthStore.getState().setAuth(
        {
          userId: Number(props.userInfo.userId || 0),
          username: props.userInfo.username || '',
          accountId: Number(props.userInfo.accountId || 0),
          tenantId: props.userInfo.tenantId || '',
          enterpriseCode: props.userInfo.enterpriseCode || '',
        },
        props.authStorage?.getAuthInfo?.()?.token || '',
      )
    }

    render(props as AppProps)
  },
  bootstrap() {
    console.log('lab bootstrap')
  },
  unmount(props) {
    console.log('lab unmount')
    root?.unmount()
    root = null
  },
  update(props) {
    console.log('lab update', props)
  },
})

// 仅 qiankun 时等待基座 mount 再渲染；无界与独立运行无 mount 钩子，需直接渲染否则白屏
if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  render()
}

// 初始化更新检测（仅在生产环境启用）
if (import.meta.env.PROD) {
  initUpdateChecker({
    checkUrl: getPublicPath(), // 使用 getPublicPath 获取正确的 public path
    checkInterval: 1 * 60 * 1000, // 1 分钟检查一次
    silent: false,
  })
}
