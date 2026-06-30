/* eslint-disable react-dom/no-missing-iframe-sandbox */
import { Button } from 'antd'
import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AdaptedModels from './AdaptedModels'

const DOC_CENTER_PATH = '/doc-center/plat-lab/DeepexiLab 产品使用手册/产品概述/产品介绍/'
const DEFAULT_API_BASE_URL = 'https://deepexilab-dev.deepexi.com'

const getDocCenterUrl = () => {
  const baseUrl = import.meta.env.PROD
    ? window.location.origin
    : (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL)

  return `${baseUrl.replace(/\/+$/, '')}${DOC_CENTER_PATH}`
}

const DocCenterFrame = () => {
  const location = useLocation()
  const docCenterUrl = useMemo(() => {
    const url = new URL(getDocCenterUrl())
    url.searchParams.set('_t', String(Date.now()))

    return url.toString()
  }, [])

  if (location.pathname === '/docs/adapted-models') {
    return (
      <div className="h-screen min-h-0 overflow-auto bg-white">
        <AdaptedModels />
      </div>
    )
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-white">
      <div className="flex h-12 shrink-0 items-center justify-end border-b border-[var(--lab-color-border-secondary)] px-6">
        <Link to="/docs/adapted-models">
          <Button size="small">模型适配名单</Button>
        </Link>
      </div>
      <iframe
        src={docCenterUrl}
        title="文档中心"
        className="block min-h-0 flex-1 w-full border-0"
      />
    </div>
  )
}

export default DocCenterFrame
