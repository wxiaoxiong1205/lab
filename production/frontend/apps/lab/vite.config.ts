/*
 * @Author: fangjun fangjun@deepexi.com
 * @Date: 2025-08-27 15:39:53
 * @LastEditors: fangjun fangjun@deepexi.com
 * @LastEditTime: 2025-09-19 09:52:15
 * @FilePath: \deepexi-lab-web\vite.config.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv } from 'vite'
import AutoImport from 'unplugin-auto-import/vite'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { visualizer } from 'rollup-plugin-visualizer'
import qiankun from 'vite-plugin-qiankun'

export default defineConfig(({ mode, command }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd())
  const useMicroAppDevMode = mode === 'development' && env.VITE_QIANKUN_DEV === 'true'

  return {
    base: env.VITE_PUBLIC_PATH,
    port: 5178,
    plugins: [
      qiankun('lab', {
        useDevMode: useMicroAppDevMode,
      }),
      codeInspectorPlugin({
        bundler: 'vite',
        hideDomPathAttr: true,
      }),
      react(),
      tailwindcss(),
      AutoImport({
        imports: [
          {
            'i18n-auto-extractor': ['$at'], // 自动引入$at函数
          },
        ],
        dts: 'types/auto-import.d.ts',
      }),
      command === 'build' && process.env.REPORT && visualizer({
        // 生成报告的文件名
        filename: 'stats.html',
        open: true,
        // 报告类型：'treemap'（树图，默认）、'sunburst'（太阳burst图）、'network'（网络关系图）、'raw-data'（原始数据）、'list'（列表）
        template: 'treemap',
      }),
    ].filter(Boolean),
    optimizeDeps: {
      include: ['react-syntax-highlighter', 'openseadragon', '@annotorious/openseadragon', '@annotorious/react'],
    },
    server: {
      hmr: !useMicroAppDevMode, // vite-plugin-qiankun 开发模式和 vite 热更新冲突
      cors: {
        origin: '*',
        credentials: true,
        preflightContinue: true,
        optionsSuccessStatus: 204,
      },
      proxy: {
        [`${env.VITE_PREFIX_BASE_URL}/api/v1`]: {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          rewrite: (path) => path,
          ws: true,
          configure: useMicroAppDevMode ? (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Cookie', '')
            })
            proxy.on('proxyRes', (proxyRes) => {
              proxyRes.headers['Access-Control-Allow-Origin'] = '*'
              proxyRes.headers['Access-Control-Allow-Credentials'] = 'true'
            })
          } : undefined,
        },
        '/deepexi-client-iam-sso': {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          rewrite: (path) => path,
          configure: useMicroAppDevMode ? (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Cookie', '')
            })
            proxy.on('proxyRes', (proxyRes) => {
              proxyRes.headers['Access-Control-Allow-Origin'] = '*'
              proxyRes.headers['Access-Control-Allow-Credentials'] = 'true'
            })
          } : undefined,
        },
      },
      host: '0.0.0.0',
      port: 5177,
    },
    // 添加别名配置
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        // 确保 @annotorious/openseadragon 能正确解析 peer 依赖
        'openseadragon': resolve(__dirname, 'node_modules/openseadragon'),
      },
      dedupe: [
        '@tanstack/react-query',
      ],
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            xlsx: ['xlsx'],
            katex: ['katex'],
            reactSyntaxHighlighter: ['react-syntax-highlighter'],
          },
        },
      },
    },
  }
})
