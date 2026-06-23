import { Button, notification } from 'antd'
import { IssuesCloseOutlined } from '@ant-design/icons'

/**
 * 更新检测插件配置
 */
export interface CheckUpdateOptions {
  /** 检测的 URL，默认为根路径 */
  checkUrl?: string
  /** 定时检查间隔（毫秒），默认 5 分钟 */
  checkInterval?: number
  /** 是否静默模式（仅控制台日志），默认 false */
  silent?: boolean
  /** 本地存储的版本标识 key，默认 'app_version' */
  storageKey?: string
}

/**
 * 更新检测插件类
 */
class UpdateChecker {
  private checkUrl: string
  private checkInterval: number
  private silent: boolean
  private storageKey: string
  private timer: number | null = null
  private isChecking = false
  private hasShownNotification = false
  private currentVersion: string | null = null
  private hasNewVersionChecked = false

  constructor(options: CheckUpdateOptions = {}) {
    // 默认请求 index.html，这是 SPA 的入口文件
    this.checkUrl = options.checkUrl || '/index.html'
    this.checkInterval = options.checkInterval || 5 * 60 * 1000 // 默认 5 分钟
    this.silent = options.silent || false
    this.storageKey = options.storageKey || 'lab_app_version'

    // 初始化时获取当前版本
    this.currentVersion = this.getStoredVersion()
  }

  /**
   * 启动更新检测
   */
  start(): void {
    if (!this.silent) {
      console.log('[UpdateChecker] 更新检测已启动')
    }

    // 初始化时立即检查一次
    // this.check();

    // 设置定时检查
    this.startTimer()

    // 监听窗口可见性变化
    this.setupVisibilityListener()

    // 监听页面聚焦
    this.setupFocusListener()
  }

  /**
   * 停止更新检测
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.removeListeners()
    if (!this.silent) {
      console.log('[UpdateChecker] 更新检测已停止')
    }
  }

  /**
   * 执行更新检测
   */
  private async check(): Promise<void> {
    // 防止重复检查
    if (this.isChecking || this.hasNewVersionChecked) {
      return
    }

    this.isChecking = true

    try {
      // 使用 HEAD 请求获取响应头，添加时间戳防止缓存
      let url: string
      if (this.checkUrl.startsWith('http://') || this.checkUrl.startsWith('https://')) {
        // 绝对路径
        const urlObj = new URL(this.checkUrl)
        urlObj.searchParams.set('_t', Date.now().toString())
        url = urlObj.toString()
      }
      else {
        // 相对路径，添加时间戳参数
        const separator = this.checkUrl.includes('?') ? '&' : '?'
        url = `${this.checkUrl}${separator}_t=${Date.now()}`
      }

      console.log('url', url)
      const response = await fetch(url, {
        method: 'HEAD',
        cache: 'no-store', // 不使用缓存
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // 优先使用 ETag（更可靠），其次使用 Last-Modified
      const etag = response.headers.get('ETag')
      const lastModified = response.headers.get('Last-Modified')

      // ETag 和 Last-Modified 都没有时，使用 Content-Length 作为备选（虽然不够准确）
      const version = etag || lastModified || response.headers.get('Content-Length') || 'unknown'

      if (!this.silent) {
        console.log('[UpdateChecker] 检测到版本:', version)
      }

      // 如果是首次检查，保存版本并返回
      if (!this.currentVersion) {
        this.saveVersion(version)
        this.currentVersion = version
        this.isChecking = false
        return
      }

      // 对比版本
      if (this.currentVersion !== version) {
        if (!this.silent) {
          console.log('[UpdateChecker] 检测到新版本，当前版本:', this.currentVersion, '新版本:', version)
        }
        this.showUpdateNotification()
        // 更新存储的版本
        this.saveVersion(version)
        this.currentVersion = version
        this.hasNewVersionChecked = true
      }
      else if (!this.silent) {
        console.log('[UpdateChecker] 当前已是最新版本')
      }
    }
    catch (error) {
      if (!this.silent) {
        console.warn('[UpdateChecker] 检测更新失败:', error)
      }
    }
    finally {
      this.isChecking = false
    }
  }

  /**
   * 显示更新通知
   */
  private showUpdateNotification(): void {
    // 避免重复显示通知
    if (this.hasShownNotification) {
      return
    }

    this.hasShownNotification = true

    const key = `update-notification-${Date.now()}`

    notification.info({
      key,
      message: '发现新版本',
      description: '检测到应用有新版本可用，请刷新页面以获取最新功能。',
      placement: 'bottomRight',
      duration: 0, // 不自动关闭
      icon: <IssuesCloseOutlined className="text-[var(--lab-color-brand-primary)]" />,
      btn: (
        <Button
          type="primary"
          onClick={() => {
            notification.destroy(key)
            window.location.reload()
          }}
        >
          立即刷新
        </Button>
      ),
      onClose: () => {
        this.hasShownNotification = false
      },
    })
  }

  /**
   * 启动定时器
   */
  private startTimer(): void {
    if (this.timer) {
      clearInterval(this.timer)
    }

    this.timer = window.setInterval(() => {
      this.check()
    }, this.checkInterval)
  }

  /**
   * 设置窗口可见性监听
   */
  private setupVisibilityListener(): void {
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  }

  /**
   * 设置页面聚焦监听
   */
  private setupFocusListener(): void {
    window.addEventListener('focus', this.handleFocus)
  }

  /**
   * 移除所有监听器
   */
  private removeListeners(): void {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('focus', this.handleFocus)
  }

  /**
   * 处理窗口可见性变化
   */
  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      // 窗口变为可见时检查更新
      this.check()
    }
  }

  /**
   * 处理页面聚焦
   */
  private handleFocus = (): void => {
    // 页面聚焦时检查更新
    this.check()
  }

  /**
   * 获取存储的版本
   */
  private getStoredVersion(): string | null {
    try {
      return localStorage.getItem(this.storageKey)
    }
    catch (error) {
      if (!this.silent) {
        console.warn('[UpdateChecker] 读取本地版本失败:', error)
      }
      return null
    }
  }

  /**
   * 保存版本到本地存储
   */
  private saveVersion(version: string): void {
    try {
      localStorage.setItem(this.storageKey, version)
    }
    catch (error) {
      if (!this.silent) {
        console.warn('[UpdateChecker] 保存版本失败:', error)
      }
    }
  }
}

/**
 * 创建并启动更新检测器
 * @param options 配置选项
 * @returns 更新检测器实例
 */
export function initUpdateChecker(options?: CheckUpdateOptions): UpdateChecker {
  const checker = new UpdateChecker(options)
  checker.start()
  return checker
}

/**
 * 默认导出更新检测器类
 */
export default UpdateChecker
