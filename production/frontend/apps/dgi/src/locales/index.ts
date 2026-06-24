import { createI18nTool } from 'easy-lang'
import { createReactI18nTool } from '@easy-lang/react'
import Transform from './translation.json'

export const langOptions = [
  {
    label: 'English',
    value: 'en-US',
  },
  {
    label: '简体中文',
    value: 'zh-CN',
  },
  {
    label: '繁体中文',
    value: 'zh-TW',
  },
] as const

export const DEFAULT_LANG = 'zh-CN'

export type Lang = (typeof langOptions)[number]['value']

export const i18nTool = createReactI18nTool<typeof Transform, Lang>(
  createI18nTool({
    defaultLang: DEFAULT_LANG,
    langs: langOptions.map((lang) => lang.value),
    translations: Transform,
  }),
)

export const useTransform = i18nTool.useTranslate

// export const getCurrentLang = reactI18nTool.

export const $t = i18nTool.$t
