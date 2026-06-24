/// <reference types="vite/client" />

declare global {
  interface Window {
    /** 无界微前端框架标识 */
    __POWERED_BY_WUJIE__?: boolean
    /** 检测是否为微前端环境的函数 */
    isMicroFrontend: () => boolean
  }
}

export {}
