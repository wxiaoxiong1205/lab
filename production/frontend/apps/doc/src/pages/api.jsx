import React, { useEffect, useRef, useState } from 'react'
import Layout from '@theme/Layout'
import useBaseUrl from '@docusaurus/useBaseUrl'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'

const SCRIPT_ID = 'redoc-standalone'

export default function ApiPage() {
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
  const [specUrl] = useState(defaultSpecUrl)

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

    let script = document.getElementById(SCRIPT_ID)
    if (!script) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
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
    <Layout title="API 文档" className="api-page">
      <div className="api-page__content" style={{ minHeight: '100vh' }}>
        <div ref={containerRef} />
        {error ? <p style={{ color: '#d03050' }}>{error}</p> : null}
      </div>
    </Layout>
  )
}
