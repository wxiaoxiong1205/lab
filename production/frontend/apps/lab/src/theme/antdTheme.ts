import type { ThemeConfig } from 'antd'
import { themeTokens } from '@deep/theme'

export const labAntdTheme: ThemeConfig = {
  token: {
    colorPrimary: themeTokens.colors.button.primary,
    colorSuccess: themeTokens.colors.status.success,
    colorError: themeTokens.colors.status.failed,
    colorText: themeTokens.colors.foreground.primary,
    colorTextSecondary: themeTokens.colors.foreground.muted,
    colorBgLayout: themeTokens.colors.surface.page,
    colorBgContainer: themeTokens.colors.surface.elevated,
    colorBorder: themeTokens.colors.divider.default,
    borderRadius: 6,
    // 控制台头部导航会设置 z-index: 1000，子应用弹层需要高于基座。
    zIndexBase: 2000,
    zIndexPopupBase: 2000,
    fontFamily: '"Helvetica Neue", Arial, sans-serif',
    fontSize: 14,
    lineHeight: 1.5714285714,
  },
  components: {
    Button: {
      borderRadius: 6,
      controlHeight: 36,
      colorPrimary: themeTokens.colors.button.primary,
      primaryShadow: 'none',
    },
    Card: {
      borderRadiusLG: 8,
      boxShadowTertiary: themeTokens.boxShadow.card,
    },
    Form: {
      labelColor: themeTokens.colors.foreground.primary,
      labelFontSize: 14,
      itemMarginBottom: 24,
    },
    Input: {
      borderRadius: 6,
      controlHeight: 40,
      colorTextPlaceholder: themeTokens.colors.control.placeholder,
    },
    InputNumber: {
      borderRadius: 6,
      controlHeight: 40,
    },
    Modal: {
      borderRadiusLG: 8,
    },
    Select: {
      borderRadius: 6,
      controlHeight: 40,
      colorTextPlaceholder: themeTokens.colors.control.placeholder,
    },
    Table: {
      borderColor: themeTokens.colors.divider.default,
      headerBg: themeTokens.colors.surface.muted,
      headerColor: themeTokens.colors.foreground.primary,
      headerBorderRadius: 6,
    },
    Tabs: {
      itemSelectedColor: themeTokens.colors.button.primary,
      inkBarColor: themeTokens.colors.button.primary,
    },
  },
}
