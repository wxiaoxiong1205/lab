import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const cacheBustPlugin = () => ({
  name: 'cache-bust',
  transformIndexHtml(html: string) {
    // 每次请求都重新注入时间戳，确保浏览器拉取最新 index.html + 入口模块
    const ts = Date.now()
    return html.replace(
      'src="/src/main.tsx"',
      `src="/src/main.tsx?v=${ts}"`
    );
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cacheBustPlugin()],
  css: {
    devSourcemap: true,
  },
  build: {
    cssMinify: false,
  },
  server: {
    port: 5202,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },
  preview: {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },
})
