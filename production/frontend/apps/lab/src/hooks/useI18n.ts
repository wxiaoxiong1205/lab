import { useTranslation } from 'react-i18next'
import { changeLanguage as changeAppLanguage } from '../utils/languageUtils'

/**
 * Custom hook for internationalization
 * Provides translation functions and language switching capabilities
 */
const useI18n = () => {
  const { t, i18n } = useTranslation()

  /**
   * Change the application language
   * @param language - The language code to change to
   */
  const changeLanguage = (language: string) => {
    changeAppLanguage(language)
  }

  /**
   * Get the current language
   * @returns The current language code
   */
  const getCurrentLanguage = () => {
    return i18n.language
  }

  return {
    t,
    i18n,
    changeLanguage,
    getCurrentLanguage,
  }
}

export default useI18n
