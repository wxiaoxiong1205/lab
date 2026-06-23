export interface ThemePalette {
  neutral: {
    black: string
    blackSoft: string
    gray: string
    white: string
  }
  blue: {
    100: string
    200: string
    300: string
    400: string
    500: string
    600: string
    700: string
    accent: string
  }
  gray: {
    50: string
    100: string
    200: string
    300: string
    400: string
    500: string
  }
  yellow: {
    100: string
    500: string
  }
  green: {
    500: string
  }
  red: {
    500: string
  }
}

export interface ThemeColors {
  foreground: {
    primary: string
    secondary: string
    muted: string
    inverse: string
  }
  brand: {
    primary: string
    secondary: string
    accent: string
  }
  status: {
    success: string
    stopped: string
    normal: string
    failed: string
    standby: string
  }
  background: {
    menu: string
    menuSelected: string
    container: string
  }
  tag: {
    blue: string
    yellow: string
    gray: string
  }
  button: {
    primary: string
  }
  control: {
    border: string
    placeholder: string
    selectedBg: string
    subtleBg: string
    brandBorderActive: string
  }
  surface: {
    page: string
    muted: string
    elevated: string
  }
  divider: {
    subtle: string
    default: string
  }
}

export interface ThemeGradient {
  modelButton: {
    from: string
    to: string
  }
  headerMenu: {
    from: string
    to: string
  }
}

export interface ThemeBoxShadow {
  soft: string
  card: string
  brand: string
}

export interface ThemeFontSize {
  xl: [string, { lineHeight: string }]
  lg: [string, { lineHeight: string }]
  base: [string, { lineHeight: string }]
  sm: [string, { lineHeight: string }]
}

export interface ThemeMode {
  palette: ThemePalette
  semantic: ThemeColors
  gradient: ThemeGradient
}

export declare const themeModes: {
  light: ThemeMode
}

export declare const themeTokens: {
  palette: ThemePalette
  colors: ThemeColors
  gradient: ThemeGradient
  boxShadow: ThemeBoxShadow
  fontSize: ThemeFontSize
  fontWeight: {
    regular: string
    medium: string
    bold: string
  }
}
