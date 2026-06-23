require('dotenv').config()

const baseUrl = process.env.BASE_URL || '/'
const isProduction = process.env.NODE_ENV === 'production'
/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'DeepexiLab 文档中心',
  tagline: '一站式模型训练平台产品文档',
  url: 'https://example.com',
  baseUrl,
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'favicon.ico',

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans']
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.cjs'),
          beforeDefaultRemarkPlugins: [
            require('./src/remark/runtimeImageUrls.cjs')
          ],
          lastVersion: 'current',
          versions: {
            current: {
              label: 'v0.0.1'
            }
          }
        },
        blog: false,
        theme: {
          customCss: [
            require.resolve('./src/css/custom.css'),
            ...(isProduction
              ? [require.resolve('./src/css/production.css')]
              : [])
          ]
        }
      }
    ]
  ],

  plugins: [
    function webpackFallbacks() {
      return {
        name: 'webpack-fallbacks',
        configureWebpack() {
          return {
            resolve: {
              fallback: {
                url: require.resolve('url/')
              }
            }
          }
        }
      }
    }
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'light',
      disableSwitch: true,
      respectPrefersColorScheme: false
    },
    navbar: {
      title: 'DeepexiLab 文档中心',
      items: [
        { to: '/', label: '首页', position: 'left' },
        { to: '/config', label: '配置平台', position: 'left' },
        {
          type: 'dropdown',
          label: 'API 文档',
          position: 'left',
          items: [
            { to: '/api', label: '固定 OpenAPI' },
            { to: '/api/dynamic', label: '动态 OpenAPI' }
          ]
        }
      ]
    }
  }
  ,
  customFields: {
    apiSpec: {
      defaultSpecPath: process.env.API_DEFAULT_SPEC_PATH || '/openapi.json',
      redocScriptPath:
        process.env.API_REDOC_SCRIPT_PATH || '/redoc/redoc.standalone.js',
      specQueryParam: process.env.API_SPEC_QUERY_PARAM || 'spec',
      defaultDynamicSpecUrl:
        process.env.API_DEFAULT_DYNAMIC_SPEC_URL ||
        'http://127.0.0.1:8000/openapi.json'
    }
  }
}

module.exports = config
