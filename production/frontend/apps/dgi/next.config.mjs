const nextConfig = {
  /* config options here */
  output: 'standalone',
  basePath: process.env.VITE_PUBLIC_PATH,
  // 生产环境不需要 assetPrefix，因为 standalone 模式会自动处理
  // assetPrefix 只在使用 CDN 或特殊部署场景时需要
  ...(process.env.NODE_ENV === 'development' && { assetPrefix: process.env.VITE_PUBLIC_PATH }),
  // 不开启压缩，默认压缩会导致本地开发sse接口数据是被buffer住的
  compress: false,
  experimental: {
    esmExternals: false,
  },
  webpack: (config, { isServer, webpack }) => {
    // 处理第三方库在服务端渲染时的问题
    if (isServer) {
      config.externals = [...config.externals, {
        'overlayscrollbars': 'overlayscrollbars',
        'overlayscrollbars-react': 'overlayscrollbars-react',
        'simplebar-react': 'simplebar-react',
        'monaco-editor': 'monaco-editor',
        '@monaco-editor/react': '@monaco-editor/react',
      }]
    }

    // 添加全局定义
    config.plugins = config.plugins || []
    config.plugins.push(
      new webpack.DefinePlugin({
        'typeof window': JSON.stringify(isServer ? 'undefined' : 'object'),
        'typeof document': JSON.stringify(isServer ? 'undefined' : 'object'),
        'typeof navigator': JSON.stringify(isServer ? 'undefined' : 'object'),
      }),
    )

    return config
  },
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      const rewrites = [
        {
          source: '/dgi-backend/:path*',
          destination: `${process.env.API_SERVER}/dgi-backend/:path*`,
          basePath: false,
        },
        {
          source: '/deepexi-client-iam-sso/:path*',
          destination: `${process.env.API_SERVER}/deepexi-client-iam-sso/:path*`,
          basePath: false,
        },
        {
          source: '/api_v2/:path*',
          destination: `${process.env.API_SERVER}/api_v2/:path*`,
          basePath: false,
        },
        {
          source: '/iam/:path*',
          destination: `${process.env.API_SERVER}/:path*`,
          basePath: false,
        },
        {
          source: '/v1/:path*',
          destination: `${process.env.API_SERVER}/v1/:path*`,
          basePath: false,
        },
        {
          source: '/gpustack/:path*',
          destination: `${process.env.API_SERVER}/gpustack/v1/:path*`,
          basePath: false,
        },
        {
          source: '/files/:path*',
          destination: `${process.env.API_SERVER}/api_v2/files/:path*`,
          basePath: false,
        },
        {
          source: '/lab-backend/:path*',
          destination: `${process.env.API_SERVER}/lab-backend/:path*`,
          basePath: false,
        },
      ]
      console.log('代理配置：', rewrites)
      return rewrites
    }
    return []
  },
}

export default nextConfig
