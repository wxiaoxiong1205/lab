const lightPalette = {
  neutral: {
    black: '#181819',
    blackSoft: '#1F1F1F',
    gray: '#70767F',
    white: '#FFFFFF',
  },
  blue: {
    100: '#E8F0FF',
    200: '#C7DDFF',
    300: '#609DFF',
    400: '#5285F7',
    500: '#0054DD',
    600: '#195ECD',
    700: '#0047BB',
    accent: '#0091FF',
  },
  gray: {
    50: '#F4F6F8',
    100: '#ECEEEF',
    200: '#F8F9FA',
    300: '#E9ECEF',
    400: '#D8D9DC',
    500: '#9DA1A7',
  },
  yellow: {
    100: '#FEF5EA',
    500: '#EC911A',
  },
  green: {
    500: '#32BE48',
  },
  red: {
    500: '#E02020',
  },
}

const withHexAlpha = (hexColor, alpha) => {
  const normalizedHex = hexColor.replace('#', '')
  const alphaHex = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
  return `#${normalizedHex}${alphaHex}`
}

export const themeModes = {
  light: {
    palette: lightPalette,
    semantic: {
      foreground: {
        primary: lightPalette.neutral.black,
        secondary: lightPalette.neutral.blackSoft,
        muted: lightPalette.neutral.gray,
        inverse: lightPalette.neutral.white,
      },
      brand: {
        primary: lightPalette.blue[700],
        secondary: lightPalette.blue[600],
        accent: lightPalette.blue.accent,
      },
      status: {
        success: lightPalette.green[500],
        stopped: lightPalette.neutral.gray,
        normal: lightPalette.blue.accent,
        failed: lightPalette.red[500],
        standby: lightPalette.yellow[500],
      },
      background: {
        dropdown: lightPalette.gray[50],
        menu: lightPalette.gray[200],
        menuSelected: lightPalette.gray[100],
        container: lightPalette.neutral.white,
      },
      tag: {
        blue: lightPalette.blue[100],
        yellow: lightPalette.yellow[100],
        gray: lightPalette.gray[50],
      },
      button: {
        primary: lightPalette.blue[700],
      },
      control: {
        border: lightPalette.gray[400],
        placeholder: lightPalette.gray[500],
        selectedBg: '#EEF8FF',
        subtleBg: lightPalette.gray[50],
        brandBorderActive: withHexAlpha(lightPalette.blue[700], 0.7),
      },
      surface: {
        page: lightPalette.gray[200],
        muted: lightPalette.gray[100],
        elevated: lightPalette.neutral.white,
      },
      divider: {
        default: lightPalette.gray[300],
        subtle: withHexAlpha(lightPalette.gray[300], 0.5),
      },
    },
    gradient: {
      modelButton: {
        from: lightPalette.blue[400],
        to: lightPalette.blue[500],
      },
      headerMenu: {
        from: lightPalette.blue[300],
        to: lightPalette.blue[200],
      },
    },
  },
}

const light = themeModes.light

export const themeTokens = {
  palette: light.palette,
  colors: light.semantic,
  gradient: light.gradient,
  boxShadow: {
    soft: '0px 0px 4px 0px rgba(0, 0, 0, 0.1)',
    card: '2px 2px 8px 0px rgba(0, 0, 0, 0.12)',
    brand: '0px 2px 4px 0px rgba(0, 71, 187, 0.12)',
  },
  fontSize: {
    xl: ['20px', { lineHeight: '28px' }],
    lg: ['16px', { lineHeight: '24px' }],
    base: ['14px', { lineHeight: '22px' }],
    sm: ['12px', { lineHeight: '20px' }],
  },
  fontWeight: {
    regular: '400',
    medium: '500',
    bold: '700',
  },
}
