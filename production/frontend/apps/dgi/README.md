## 环境变量

环境变量说明：
```sh
VITE_PUBLIC_PATH: 前端应用的base路径，默认开发环境为空，生产环境为/dgi
VITE_API_SERVER: 后端服务的base url，用于代理请求
```

本地开发时复制`.env.development`为`.env.development.local`，并修改相关环境变量。

## 关于RSC漏洞

[《【安全通告】React Server Components 远程代码执行漏洞风险通告（CVE-2025-55182）》](https://cloud.tencent.com/announce/detail/2179)

DGI目前使用next.js 14.2+，未受影响。

TODO: 后续将去掉next.js
