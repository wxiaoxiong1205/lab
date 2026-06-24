import { BrowserRouter as Router } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
// import 'antd/dist/reset.css'
import '@ant-design/v5-patch-for-react-19'
import { useEffect } from 'react'
import AppRoutes from './routes'
import AntdLocaleProvider from '@/components/antd-locale-provider'
import SSOInitializer from '@/components/SSOInitializer'
import type { Lang } from '@/locales'
import { useTransform } from '@/locales'

function App({ locale }: { locale?: string }) {
  const { changeLang, currentLang } = useTransform()

  useEffect(() => {
    if (locale) {
      const map: Record<string, Lang> = {
        'zh-CN': 'zh-CN',
        'zh_CN': 'zh-CN',
        'en-US': 'en-US',
        'en_US': 'en-US',
        'en': 'en-US',
        'zh-TW': 'zh-TW',
        'zh_TW': 'zh-TW',
        'zh-HK': 'zh-TW',
        'zh_HK': 'zh-TW',
      }
      const targetLang = map[locale]
      if (targetLang && targetLang !== currentLang) {
        changeLang(targetLang)
      }
    }
  }, [locale, currentLang, changeLang])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          zIndexBase: 2000,
          zIndexPopupBase: 2000,
        },
      }}
    >
      <Router basename={window.qiankunProps?.base || import.meta.env.BASE_URL || import.meta.env.VITE_BASE_URL || ''}>
        <SSOInitializer />
        <AntdLocaleProvider>
          <AppRoutes />
        </AntdLocaleProvider>
      </Router>
    </ConfigProvider>
  )
}

export default App
