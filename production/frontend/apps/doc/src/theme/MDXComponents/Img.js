import React, { useEffect, useState } from 'react'
import OriginalImg from '@theme-original/MDXComponents/Img'

function getRuntimeSrc(src) {
  if (typeof src !== 'string' || !src.startsWith('/lab-backend/')) {
    return src
  }

  if (typeof window === 'undefined') {
    return src
  }

  return `${window.location.origin}${src}`
  // return `${'https://deepexilab-test.deepexi.com/'}${src}`
}

export default function MDXImg(props) {
  const [src, setSrc] = useState(props.src)

  useEffect(() => {
    setSrc(getRuntimeSrc(props.src))
  }, [props.src])

  return <OriginalImg {...props} src={src} />
}
