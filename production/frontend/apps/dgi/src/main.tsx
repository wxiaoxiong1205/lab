import { StrictMode } from 'react'
import type { Root } from 'react-dom/client'
import { createRoot } from 'react-dom/client'
import './index.css'
import { qiankunWindow, renderWithQiankun } from 'vite-plugin-qiankun/dist/helper'
import App from './App'
import useAuthStore from './stores/auth'
import type { AppProps } from './types/console-mfe-props'

let root: Root | null = null

function render(props?: AppProps) {
  const { container } = props || {}

  const target = container
    ? (typeof container === 'string' ? document.querySelector(container) : container).querySelector('#root')
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
    console.log('dgi mount', props)
    window.qiankunProps = props as AppProps

    if (props.authStorage) {
      const authInfo = props.authStorage.getAuthInfo?.() || {}
      if (authInfo.token) {
        useAuthStore.getState().setToken(authInfo.token)
      }
      if (authInfo.refreshToken) {
        useAuthStore.getState().setRefreshToken(authInfo.refreshToken)
      }
    }

    if (props.userInfo) {
      useAuthStore.getState().setUserInfo(props.userInfo)
    }

    render(props as AppProps)
  },
  bootstrap() {
    console.log('dgi bootstrap')
  },
  unmount(props) {
    console.log('dgi unmount')
    root?.unmount()
    root = null
  },
  update(props) {
    console.log('dgi update', props)
  },
})

if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  render()
}
