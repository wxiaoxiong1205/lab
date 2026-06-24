import i18n from '../i18n'

/**
 * Get the current language from localStorage or use the default
 * @returns {string} The current language code
 */
export const getCurrentLanguage = (): string => {
  return localStorage.getItem('language') || 'zh-CN'
}

/**
 * Initialize the language based on localStorage or browser settings
 */
export const initializeLanguage = (): void => {
  const savedLanguage = localStorage.getItem('language')

  if (savedLanguage && ['en', 'zh-CN', 'zh-TW'].includes(savedLanguage)) {
    i18n.changeLanguage(savedLanguage)
  }
  else {
    // If no saved language, detect from browser and save to localStorage
    const detectedLanguage = i18n.language
    localStorage.setItem('language', detectedLanguage)
  }
}

/**
 * Change the application language
 * @param {string} language - The language code to change to
 */
export const changeLanguage = (language: string): void => {
  if (['en', 'zh-CN', 'zh-TW'].includes(language)) {
    i18n.changeLanguage(language)
    localStorage.setItem('language', language)
  }
}
