import React, { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { developerGuide } from '../../docs/developerGuide'
import './ProductManual.css'

const DeveloperGuide: React.FC = () => {
  const location = useLocation()

  useEffect(() => {
    if (!location.hash) {
      return
    }

    window.requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
      target?.scrollIntoView({ block: 'start' })
    })
  }, [location.hash])

  return (
    <article
      className="product-manual"
      aria-label={developerGuide.title}
      dangerouslySetInnerHTML={{ __html: developerGuide.html }}
    />
  )
}

export default DeveloperGuide
