import React, { useEffect, useRef, useState } from 'react'
import Layout from '@theme/Layout'
import useBaseUrl from '@docusaurus/useBaseUrl'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

export default function ApiDynamicPage() {
  const {
    siteConfig: { customFields }
  } = useDocusaurusContext()
  const apiSpec = customFields?.apiSpec || {}
  const defaultSpecUrl = useBaseUrl(apiSpec.defaultSpecPath || '/openapi.json')
  const scriptUrl = useBaseUrl(
    apiSpec.redocScriptPath || '/redoc/redoc.standalone.js'
  )
  const containerRef = useRef(null)
  const redocRef = useRef(null)
  const [error, setError] = useState('')
  const [specUrl, setSpecUrl] = useState(
    apiSpec.defaultDynamicSpecUrl || defaultSpecUrl
  )

  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      const override = url.searchParams.get(apiSpec.specQueryParam || 'spec')
      if (override) {
        setSpecUrl(override)
      }
    } catch {
      // ignore invalid URL
    }
  }, [defaultSpecUrl])

  useEffect(() => {
    let mounted = true

    const init = () => {
      if (!mounted) return
      if (!window.Redoc || !containerRef.current) {
        setError('ReDoc 初始化失败')
        return
      }
      if (redocRef.current) {
        redocRef.current.destroy()
        redocRef.current = null
      }
      containerRef.current.innerHTML = ''
      redocRef.current = window.Redoc.init(specUrl, {}, containerRef.current)
    }

    if (window.Redoc) {
      init()
      return () => {
        mounted = false
        if (redocRef.current) {
          redocRef.current.destroy()
          redocRef.current = null
        }
      }
    }

    let script = document.getElementById('redoc-standalone')
    if (!script) {
      script = document.createElement('script')
      script.id = 'redoc-standalone'
      script.src = scriptUrl
      script.onload = init
      script.onerror = () => setError('ReDoc 资源加载失败')
      document.body.appendChild(script)
    } else {
      script.addEventListener('load', init, { once: true })
    }
    return () => {
      mounted = false
      if (redocRef.current) {
        redocRef.current.destroy()
        redocRef.current = null
      }
    }
  }, [specUrl, scriptUrl])

  return (
    <Layout title="API 文档（动态）" className="api-page">
      <div className="api-page__content" style={{ minHeight: '100vh' }}>
        <div ref={containerRef} />
        {error ? <p style={{ color: '#d03050' }}>{error}</p> : null}
      </div>
    </Layout>
  )
}
