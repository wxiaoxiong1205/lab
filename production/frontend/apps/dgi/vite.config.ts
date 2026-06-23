import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { visualizer } from 'rollup-plugin-visualizer'
import qiankun from 'vite-plugin-qiankun'
// import htmlRemoveModulePlugin from './plugins/vite-plugin-remove-module.js'

export default defineConfig(({ mode, command }) => {
  // 加载环境变量
  const env = loadEnv(mode, __dirname)
  const isProd = mode === 'production'
  const useMicroAppDevMode = mode === 'development' && env.VITE_QIANKUN_DEV === 'true'

  const getProxyConfigure = () => {
    return useMicroAppDevMode ? (proxy: any) => {
      proxy.on('proxyReq', (proxyReq: any) => {
        // proxyReq.setHeader('Cookie', '')
      })
      proxy.on('proxyRes', (proxyRes: any) => {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*'
        proxyRes.headers['Access-Control-Allow-Credentials'] = 'true'
      })
    } : undefined
  }

  return {
    base: env.VITE_PUBLIC_PATH || '',
    plugins: [
      // module script在qiankun会执行报错，热更新、legacy插件等会引入
      // ...isProd ? [htmlRemoveModulePlugin()] : [],
      qiankun('dgi', {
        useDevMode: useMicroAppDevMode,
      }),
      codeInspectorPlugin({
        bundler: 'vite',
        hideDomPathAttr: true,
      }),
      react(),
      tailwindcss(),
      command === 'build' && mode === 'development' && visualizer({
        // 生成报告的文件名
        filename: 'stats.html',
        open: true,
        // 报告类型：'treemap'（树图，默认）、'sunburst'（太阳burst图）、'network'（网络关系图）、'raw-data'（原始数据）、'list'（列表）
        template: 'treemap',
      }),
    ].filter(Boolean),
    server: {
      cors: {
        origin: '*',
        credentials: true,
        preflightContinue: true,
        optionsSuccessStatus: 204,
      },
      proxy: {
        '/dgi-backend': {
          target: env.VITE_API_SERVER,
          changeOrigin: true,
          rewrite: (path) => path,
          ws: true,
          configure: getProxyConfigure(),
        },
        '/deepexi-client-iam-sso': {
          target: env.VITE_API_SERVER,
          changeOrigin: true,
          rewrite: (path) => path,
          configure: getProxyConfigure(),
        },
        '/api_v2': {
          target: env.VITE_API_SERVER,
          changeOrigin: true,
          rewrite: (path) => path,
          configure: getProxyConfigure(),
        },
        '/iam/': {
          target: env.VITE_API_SERVER,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/iam/, '/'),
          configure: getProxyConfigure(),
        },
        '/v1': {
          target: env.VITE_API_SERVER,
          changeOrigin: true,
          rewrite: (path) => path,
          configure: getProxyConfigure(),
        },
        '/gpustack': {
          target: env.VITE_API_SERVER,
          changeOrigin: true,
          rewrite: (path) => path, // .replace(/^\/gpustack/, '/gpustack/v1'),
          configure: getProxyConfigure(),
        },
        '/files': {
          target: env.VITE_API_SERVER,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/files/, '/api_v2/files'),
          configure: getProxyConfigure(),
        },
      },
      host: '0.0.0.0',
      port: 3004,
      hmr: useMicroAppDevMode ? false : {
        timeout: 5000,
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      // sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            antd: ['antd', '@ant-design/icons'],
            monaco: ['@monaco-editor/react'],
          },
        },
      },
    },
  }
})
