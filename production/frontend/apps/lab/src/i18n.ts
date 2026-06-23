import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import translations
import enTranslation from './locales/en/translation.json'
import zhCNTranslation from './locales/zh-CN/translation.json'
import zhTWTranslation from './locales/zh-TW/translation.json'

// Initialize i18next
i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    resources: {
      'en': {
        translation: enTranslation,
      },
      'zh-CN': {
        translation: zhCNTranslation,
      },
      'zh-TW': {
        translation: zhTWTranslation,
      },
    },
    fallbackLng: 'zh-CN',
    debug: process.env.NODE_ENV === 'development',

    // Common namespace used around the full app
    ns: ['translation'],
    defaultNS: 'translation',

    interpolation: {
      escapeValue: false, // React already safes from XSS
    },

    // Detect language from localStorage first, then browser
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'language',
      caches: ['localStorage'],
    },
  })

export default i18n
