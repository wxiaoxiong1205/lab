---
name: integration-console-qiankun
description: 控制台qiankun微前端对接方案，控制台作为基座应用提供统一的头部导航，管理子应用的生命周期，下发部分数据及方法供子应用完成登录、识别加载方式、切换子应用等操作，子产品因此与控制台融为一体。在子产品希望通过以应用级嵌入控制台时进行改造使用。
---

# 控制台qiankun微前端对接

微前端接入的子应用都有专门的路由上下文，通过管理系统配置，如DGI应用的路由上下文是 `/dgi/`，即访问路径以`/dgi/`开头时，控制台qiankun就会加载DGI应用。

控制台可以下发数据及方法供子应用使用，具体配置可查看`console-mfe-props.d.ts` 的 `AppProps`。
另外控制台设置了一个css变量`--mfe-height`，用于子应用的布局高度。

## 子应用接入改造

根据子应用的打包工具或框架决定。下面说明以接入 DGI 应用为例。

### 选项：vite应用

#### 构建及入口改造

- 安装并接入vite的qiankun插件

```sh
pnpm add -D vite-plugin-qiankun
```

```ts vite.config.ts
import qiankun from 'vite-plugin-qiankun';

export default defineConfig(() => {
  const useMicroAppDevMode = process.env.NODE_ENV === 'development' && process.env.VITE_QIANKUN_DEV
  return {
    plugins: [
      qiankun('dgi', {
        useDevMode: useMicroAppDevMode
      }),
    ],

    server: {
      hmr: !useMicroAppDevMode, // vite-plugin-qiankun 开发模式和 vite 热更新冲突
      // 微前端本地联调跨域处理
      // https://github.com/expressjs/cors#configuration-options
      cors: {
        origin: '*',
        credentials: true,
        preflightContinue: true,
        optionsSuccessStatus: 204,
      },
    },

    // 如果后端服务未允许跨域，则本地反向代理增加cors配置
    proxy: {
      '/api': {
        // ...
        configure: useMicroAppDevMode ? (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            proxyReq.setHeader('Cookie', '')
          })
          proxy.on('proxyRes', (proxyRes, req) => {
            proxyRes.headers['Access-Control-Allow-Origin'] = '*'
            proxyRes.headers['Access-Control-Allow-Credentials'] = 'true'
          })
        } : () => {},
      },
    }
  }
})
```

- 将`console-mfe-props.d.ts` 复制到子应用项目中使用
- 在应用脚本入口文件（如`main.ts`），配置qiankun生命周期方法，并将原应用的react、vue等根组件初始化方法调整根据是否是qiankun子应用改变初始化时机

以react应用为例。

```ts main.ts
import type { Root } from 'react-dom/client'
import ReactDOM from 'react-dom/client'
import {
  renderWithQiankun,
  qiankunWindow,
} from "vite-plugin-qiankun/dist/helper";
import { AppProps } from './types/console-qiankun-props.d.ts'
import App from './App.tsx'

let root: Root
function render(props?: AppProps) {
  const locale = props?.system.locale || getLocale() // 如果有国际化，优先使用基座应用传下来的语言
  root = ReactDOM.createRoot(
    typeof props?.container
      ? typeof props.container === 'string' 
        ? document.querySelector(`${props.container} #app`)
        : props.container.querySelector('#app')
      : document.getElementById('#app'),
  )

  root.render(
    <I18NContext.Provider
      value={{
        locale
      }}
    >
      <App />
    </I18NContext.Provider>
  )
}

renderWithQiankun({
  mount(props) {
    // 子应用挂载钩子，此时index.html的挂载节点已渲染，可以进行应用初始化
    console.log("mount", import.meta.env.DEV ? props : '');
    window.qiankunProps = props
    render(props);
  },
  bootstrap() {
    // 首次加载钩子
    console.log("bootstrap");
  },
  unmount(props: any) {
    // 子应用被卸载钩子，进行销毁处理
    console.log("unmount");
    root.unmount();
  },
  update(props: any) { },
});

// 根据qiankunWindow.__POWERED_BY_QIANKUN__可以判断是否是作为qiankun子应用加载
if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  render(null);
}
```

- 增加相应全局类型定义，`window.qiankunProps` 的类型为 `AppProps`

```ts
import { AppProps } from 'console-qiankun-props.d.ts'

interface Window {
  qiankunProps?: AppProps;
}
```

至此，控制台下发的数据及方法就可以在子应用中通过`window.qiankunProps`访问到。

继续完成一些关键改造。需要万分注意，所有改造需要同时兼容原有独立访问的情况，即增加微前端模式情况。

#### 路由改造

根据路由模式选择处理。

##### 选项：history模式

路由base前面增加`window.qiankunProps.base`，如：

```ts
import { createBrowserRouter, useRouteError } from 'react-router-dom'

const router = createBrowserRouter(
  [],
  {basename: window.qiankunProps.base},
)
```

##### 选项：hash/memory等模式

与url path无关，无须处理。

#### 用户及鉴权

- **用户信息同步**：
  - `window.qiankunProps.userInfo`或`window.qiankunProps.authStorage.getUserInfo` 可以取到用户信息
  - 一般更新到现有应用全局store里的用户信息即可，注意用户信息不一致时的转换
  - 如果原来的系统初始化流程有获取用户信息等步骤，可以考虑在qiankun下时跳过，减少不必要的请求阻塞带来的性能问题

- **请求token获取或同步**：
  - `window.qiankunProps.authStorage.getAuthInfo()` 可获取token或refreshToken。
  - 注意检查请求拦截器及使用到token的地方
  - 如有场景需要，通过`window.qiankunProps.authStorage.onAuthChange(listener)`主动订阅token的变更

- **刷新token**：
  - 注意检查是否有请求拦截器处理token过期情况然后有刷新token的逻辑
  - 如没有则需要增加，如有，刷新请求需要改为使用基座的刷新token方法 `window.qiankunProps.authStorage.refresh(callback)`

- **登出**：
  - 使用`window.qiankunProps.methods.logout()` 登出

#### 导航改造

通过`qiankunWindow.__POWERED_BY_QIANKUN__`判断如果是qiankun子应用，则隐藏与控制台统一头部导航及右上角用户操作重复或冲突的内容。

- 子应用是有自己的头部导航，需要隐藏。如果头部有一些专有操作（除了登出、用户信息等），需要在最后列出遗留项待给开发者后处理
- 如果子应用是只有侧边导航，则去掉相应logo、用户信息等
- 注意改造后可能出现的高度问题，子应用应占满页面除了控制台头部的区域，注意不要出现不占满或超出的情况。

#### 国际化对接

- 控制台下发的当前语言 `window.qiankunProps.system.locale`
- 如果子应用的的语言枚举跟控制台的不一致，调整为一致
- 如果子应用缺乏对应的语言资源，增加对应的语言
- 注意：控制台切换语言后会刷新页面，所以无须考虑语言切换的响应式问题

#### 高度对接

- 使用控制台下发的css变量`--mfe-height`设置到子应用的根元素上

```css index.css
#root {
  height: var(--mfe-height, 100%);
}
```

#### 弹窗、弹层层级

控制台头部导航会设置z-index为1000，子应用的组件库弹窗、弹层等需要设置一个比1000大的z-index，避免被控制台头部导航遮挡。

- react应用使用antd，通过ConfigProvider的theme配置zIndexBase和zIndexPopupBase来设置弹窗、弹层的基准z-index。

```tsx App.tsx
<ConfigProvider
  theme={{
    token: {
      zIndexBase: 2000,
      zIndexPopupBase: 2000,
    },
  }}
>
</ConfigProvider>
```

#### public path与静态资源路径处理

子应用assets一般来说需要补充public路径前缀，而子应用可能与基座应用部署在不同域名（如本地开发时就不同），为了兼容不同的访问模式，qiankun下使用基座下发的entry路径作为public路径前缀。

- **public path检查**：可能使用了了诸如`VITE_PUBLIC_PATH`、`VITE_BASE_URL`、`import.meta.env.BASE_URL`等环境变量来获取public路径
- **public path补充**：如果上述public path未检测到定义，增加环境变量`VITE_PUBLIC_PATH`定义。如果有新增，需要告知用户并更新文档。
- **静态资源路径处理**：使用`withBasePath`函数处理静态资源路径，确保路径正确。

```ts utils/path.ts
export const getPublicPath = () => {
  let publicPath = ''
  // 优先使用qiankun下发的entry路径
  if (window.qiankunProps?.entry) {
    const entryUrl = new URL(window.qiankunProps.entry)
    publicPath = entryUrl.origin + entryUrl.pathname
  }

  // 其次使用环境变量
  if (import.meta.env.VITE_PUBLIC_PATH) {
    publicPath = import.meta.env.VITE_PUBLIC_PATH
  }
  publicPath = publicPath || import.meta.env.BASE_URL

  // 确保public path以/结尾
  if(!publicPath.endsWith('/')) {
    publicPath += '/'
  }

  return publicPath
}

export const withBasePath = (path: string) => {
  const publicPath = getPublicPath()
  return `${publicPath}${path.startsWith('/') ? path.substring(1) : path}`
}
```
