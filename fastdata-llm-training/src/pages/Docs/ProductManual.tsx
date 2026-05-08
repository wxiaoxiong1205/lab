import React, { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { productManual } from '../../docs/productManual'
import './ProductManual.css'

const ProductManual: React.FC = () => {
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
      aria-label={productManual.title}
      dangerouslySetInnerHTML={{ __html: productManual.html }}
    />
  )
}

export default ProductManual
