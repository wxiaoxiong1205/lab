import { useAtom } from 'jotai'
import { useEffect, useMemo } from 'react'
import { userSettingsHelperAtom } from '@/stores/settings'
import themeConfig from '@/components/gpustacks/config/theme'

type Theme = 'light' | 'realDark' | 'auto'

export default function useUserSettings() {
  const { light, dark, colorPrimary } = themeConfig
  const [userSettings, setUserSettings] = useAtom(userSettingsHelperAtom)

  const getCurrentTheme = (mode: Theme): 'light' | 'realDark' => {
    if (mode === 'auto') {
      return (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
        ? 'realDark'
        : 'light'
    }
    return mode
  }

  const setHtmlThemeAttr = (theme: string) => {
    if (typeof document !== 'undefined') {
      const html = document.querySelector('html')
      if (html) {
        html.setAttribute('data-theme', theme)
      }
    }
  }

  const themeData = useMemo(() => {
    const baseTokens = userSettings.theme === 'realDark' ? dark : light
    return {
      ...baseTokens,
      token: {
        ...baseTokens.token,
        colorPrimary: userSettings.colorPrimary || colorPrimary,
      },
    }
  }, [userSettings.theme, userSettings.colorPrimary])

  const setTheme = (mode: Theme) => {
    const currentTheme = getCurrentTheme(mode)
    setHtmlThemeAttr(currentTheme)
    setUserSettings({
      theme: currentTheme,
      mode,
      isDarkTheme: currentTheme === 'realDark',
    })
  }

  useEffect(() => {
    setHtmlThemeAttr(userSettings.theme)
  }, [userSettings.theme])

  useEffect(() => {
    if (userSettings.mode !== 'auto' || typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      setTheme('auto')
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [userSettings.mode])

  return {
    userSettings,
    setUserSettings,
    setTheme,
    isDarkTheme: userSettings.isDarkTheme,
    themeData,
    componentSize: 'large',
  }
}
