import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import zhTW from 'antd/locale/zh_TW'
import enUS from 'antd/locale/en_US'
import type { Locale } from 'antd/es/locale'
import { useMemo } from 'react'
import { useTransform } from '@/locales'

interface AntdLocaleProviderProps {
  children: React.ReactNode
}

export default function AntdLocaleProvider({
  children,
}: AntdLocaleProviderProps) {
  const { currentLang } = useTransform()

  // 根据当前语言选择对应的 Antd locale
  const antdLocale = useMemo<Locale>(() => {
    switch (currentLang) {
      case 'zh-CN':
        return zhCN
      case 'zh-TW':
        return zhTW
      case 'en-US':
        return enUS
      default:
        return zhCN
    }
  }, [currentLang])

  return <ConfigProvider locale={antdLocale}>{children}</ConfigProvider>
}
