import React from 'react'
import type { RouteObject } from 'react-router-dom'
import ProductPlanning from '../pages/Docs/ProductPlanning'
import DocsIndex from '../pages/Docs'

const docsRoutes: RouteObject[] = [
  {
    path: '/docs',
    children: [
      {
        index: true,
        element: <DocsIndex />,
      },
      {
        path: 'product-planning',
        element: <ProductPlanning />,
      },
    ],
  },
]

export default docsRoutes
