# Lab 样式治理执行规范

## 目标

1. 组件内静态样式抽离到独立 CSS 文件。
2. 重复样式沉淀到 `src/styles` 公共样式层。
3. 色值、边框、圆角、阴影、间距优先引用 `@deep/theme/theme.css` 中的 token。

## 文件分层

- `src/index.css`: 样式入口，只保留全局导入和少量全局基础规则。
- `src/styles/antd-overrides.css`: 全局 Antd 覆盖。页面级 Antd 覆盖不放这里。
- `src/styles/page-shell.css`: 页面壳、列表页、详情页等重复布局。
- `src/styles/table.css`: 表格、分页、操作列等重复规则。
- `src/styles/form.css`: 表单页、创建页、只读字段等重复规则。
- `src/styles/utilities.css`: Tailwind 不适合表达、且跨模块复用的低层工具类。
- 同目录 CSS: 单个页面或组件私有样式，例如 `MainLayout.css`。

## 迁移规则

- 必须抽离：静态 `style={{ ... }}`、组件内 `<style>`、重复 Antd 覆盖、硬编码视觉值。
- 可以暂留：运行时尺寸、坐标、图表颜色、标注区域颜色、第三方组件必须传入的 `customStyle`。
- 私有优先：第一次出现的样式放同目录 CSS；第二个模块也需要时再上移到 `src/styles`。
- token 优先：CSS 中不新增硬编码主色、文本色、边框色、阴影、常用圆角和间距。

## 审计命令

```bash
pnpm --filter lab style:audit
```

严格模式用于后续 CI 兜底，当前债务清理完成前不要开启：

```bash
pnpm --filter lab style:audit:strict
```

## 推荐批次

1. 先清理剩余 `<style>` 标签。
2. 处理 `StorageConfigList.tsx`、`EvaluationCompare.tsx`、`RegistryConfigForm.tsx` 这类内联样式高频文件。
3. 把布局、列表、表格、表单中重复 class 上移到 `src/styles`。
4. 最后替换 CSS/TSX 中的硬编码色值为 theme token。
