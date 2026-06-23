# Lab Token Launcher

这个扩展的目标是省掉“手动从官网缓存复制 `auth_token`，再改 `.env.development.local`”这条链路。

它的工作方式是：

1. 在你当前打开的官网页面里读取 `localStorage` 或 `sessionStorage` 中的 `auth_token`
2. 打开本地 `lab`，并把 token 通过 `?_tk=...` 传进去
3. `lab` 启动后自动写入自己的 `localStorage`，随后清掉 URL 中的敏感参数

## 为什么不直接改 `.env.development.local`

浏览器扩展默认不能直接写你本机项目目录里的文件。要做到这一点，通常需要再配一个 Native Messaging 宿主程序，维护成本会明显上升。

而 `lab` 本身已经支持 `_tk` 自动登录，所以更轻的方案是直接走 URL token 注入。

## 使用方法

1. 打开 Chrome 扩展页：`chrome://extensions/`
2. 开启“开发者模式”
3. 选择“加载已解压的扩展程序”
4. 选中当前目录：

```text
tools/lab-token-launcher-extension
```

5. 打开官网并保持登录状态
6. 启动本地 `lab`
7. 点击扩展按钮，再点击“读取当前页 Token 并打开 Lab”

## 可配置项

- `labUrl`：本地开发地址，默认 `http://localhost:5173/`
- `tokenKey`：默认 `auth_token`
- `refreshTokenKey`：默认 `auth_refresh_token`

## 适用前提

- 官网 token 存在当前页面对应域名的 `localStorage` 或 `sessionStorage`
- 本地 `lab` 可通过 `?_tk=` 完成自动登录

## 后续可扩展

如果你后面确实想把 token 自动写回本地文件，也可以在这个基础上升级成：

- 浏览器扩展 + Native Messaging
- 浏览器扩展 + 本地小型 HTTP 服务

但这两种都比当前方案更重，建议先把这个最小闭环跑通。
