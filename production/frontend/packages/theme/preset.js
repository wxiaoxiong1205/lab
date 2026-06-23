import { themeTokens } from './tokens.js'

const tailwindPreset = {
  theme: {
    extend: {
      colors: themeTokens.colors,
      boxShadow: themeTokens.boxShadow,
      fontSize: themeTokens.fontSize,
      fontWeight: themeTokens.fontWeight,
    },
  },
}

export default tailwindPreset
