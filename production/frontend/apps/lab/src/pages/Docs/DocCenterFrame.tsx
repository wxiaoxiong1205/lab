/* eslint-disable react-dom/no-missing-iframe-sandbox */
import { useMemo } from 'react'

const DOC_CENTER_PATH = '/doc-center/plat-lab/DeepexiLab 产品使用手册/产品概述/产品介绍/'
const DEFAULT_API_BASE_URL = 'https://deepexilab-dev.deepexi.com'

const getDocCenterUrl = () => {
  const baseUrl = import.meta.env.PROD
    ? window.location.origin
    : (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL)

  return `${baseUrl.replace(/\/+$/, '')}${DOC_CENTER_PATH}`
}

const DocCenterFrame = () => {
  const docCenterUrl = useMemo(() => {
    const url = new URL(getDocCenterUrl())
    url.searchParams.set('_t', String(Date.now()))

    return url.toString()
  }, [])

  return (
    <div
      className="h-[calc(100vh-60px)] min-h-0 bg-white"
    >
      <iframe
        src={docCenterUrl}
        title="文档中心"
        className="block h-full w-full border-0"
      />
    </div>
  )
}

export default DocCenterFrame
