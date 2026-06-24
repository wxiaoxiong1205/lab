/*
 * @Author: fangjun fangjun@deepexi.com
 * @Date: 2025-08-27 15:39:53
 * @LastEditors: fangjun fangjun@deepexi.com
 * @LastEditTime: 2025-09-10 14:27:08
 * @FilePath: \deepexi-lab-web\src\components\LanguageSwitcher.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { Button, Dropdown } from 'antd'
import { GlobalOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useReactAt } from 'i18n-auto-extractor/react'
import useI18n from '../hooks/useI18n'
import enJSON from '@/locales/en.json'
import zhCNJSON from '@/locales/zh-CN.json'
import zhTWJSON from '@/locales/zh-TW.json'
/**
 * Language switcher component
 * Allows users to switch between supported languages
 */
const LanguageSwitcher = () => {
  const { t, changeLanguage, getCurrentLanguage } = useI18n()
  const currentLanguage = getCurrentLanguage()
  const { setCurrentLang, langSet } = useReactAt()
  // Language dropdown menu items
  const languageItems: MenuProps['items'] = [
    {
      key: 'en',
      label: t('language.english'),
      onClick: () => {
        changeLanguage('en')
        setCurrentLang('en', enJSON)
      },
      disabled: currentLanguage === 'en',
    },
    {
      key: 'zh-CN',
      label: t('language.simplifiedChinese'),
      onClick: () => {
        changeLanguage('zh-CN')
        setCurrentLang('zh-CN', zhCNJSON)
      },
      disabled: currentLanguage === 'zh-CN',
    },
    {
      key: 'zh-TW',
      label: t('language.traditionalChinese'),
      onClick: () => {
        changeLanguage('zh-TW')
        setCurrentLang('zh-TW', zhTWJSON)
      },
      disabled: currentLanguage === 'zh-TW',
    },
  ]

  return (
    <Dropdown menu={{ items: languageItems }} placement="bottomRight">
      <Button type="text" icon={<GlobalOutlined />}>
        {t('language.title')}
      </Button>
    </Dropdown>
  )
}

export default LanguageSwitcher
