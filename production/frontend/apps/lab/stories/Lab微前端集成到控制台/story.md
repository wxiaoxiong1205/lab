---
name: Lab微前端集成到控制台
version: v1.10.0
tapd: --story=1074034@tapd-37328953 --user=曾传球 优化项：Lab页面固定使用控制台导航 https://www.tapd.cn/37328953/s/2853915
---

# Lab微前端集成到控制台

## 背景

控制台是公司产品的统一入口，现在Lab应用在控制台已经有导航入口，但是是通过新开页跳转的方式打开，存在无法跳回控制台、切换到其他子产品、Lab独立页面头部过于简陋等问题。

## 目标

改造Lab以微前端的方式集成到控制台加载。

现控制台已有支持微前端接入的机制，采用的是qiankun微前端方案。

## 任务清单

- [x] 任务1：使用 `integration-console-qiankun` skill对lab应用进行qiankun微前端子应用改造，使其能对接控制台

## 遗留项：由agent更新
无

## 改造完成说明

已完成 Lab 应用的 qiankun 微前端子应用改造，主要改造内容如下：

1. **构建配置改造**：
   - 安装并配置 `vite-plugin-qiankun` 插件
   - 添加微前端开发模式支持（通过 `VITE_QIANKUN_DEV` 环境变量控制）
   - 配置开发服务器跨域和代理设置

2. **入口文件改造**：
   - 在 `main.tsx` 中添加 qiankun 生命周期方法（mount、bootstrap、unmount、update）
   - 支持 qiankun 模式下的容器挂载
   - 同步控制台下发的用户信息和 token

3. **路由改造**：
   - 在 `App.tsx` 中支持使用控制台下发的 `base` 作为路由 basename
   - 兼容独立访问和微前端模式

4. **用户认证改造**：
   - 在 qiankun 模式下使用控制台下发的用户信息
   - 在 `apiClient.ts` 中优先使用控制台下发的 token
   - 使用控制台的 `authStorage.refresh` 方法进行 token 刷新

5. **导航改造**：
   - 在 `MainLayout.tsx` 中，qiankun 模式下隐藏头部导航（避免与控制台头部重复）
   - 在 `ProjectLayout.tsx` 中，qiankun 模式下使用 `--mfe-height` CSS 变量设置高度

6. **样式改造**：
   - 在 `index.css` 中使用 `--mfe-height` CSS 变量设置根元素高度
   - 调整 antd 弹窗、弹层的 z-index 为 1010（高于控制台头部的 1000）

7. **国际化对接**：
   - 在 qiankun 模式下使用控制台下发的语言设置
   - 支持语言格式转换（zh-CN/zh_CN、en-US/en_US/en 等）

8. **类型定义**：
   - 复制 `console-mfe-props.d.ts` 类型定义文件
   - 添加 `window.qiankunProps` 的全局类型定义

所有改造均兼容原有独立访问模式，应用可以同时支持独立访问和微前端嵌入两种方式。
