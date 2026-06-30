import React from 'react'
import type { RouteObject } from 'react-router-dom'
import ProductPlanning from '../pages/Docs/ProductPlanning'
import DocsIndex from '../pages/Docs'
import AdaptedModels from '../pages/Docs/AdaptedModels'

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
      {
        path: 'adapted-models',
        element: <AdaptedModels />,
      },
    ],
  },
]

export default docsRoutes
