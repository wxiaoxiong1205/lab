---
name: lab-style-governance
description: Style governance for the deepexi-lab-web lab app. Use when creating, refactoring, or reviewing React/TSX/CSS styles in apps/lab, especially tasks involving antd component styling, Tailwind classes, inline style cleanup, custom page CSS, @deep/theme tokens, theme switching readiness, ConfigProvider theme tokens, or scattered style consolidation.
---

# Lab Style Governance

## Overview

Apply this skill when changing UI styles in `apps/lab`. Keep antd component styling centralized, use Tailwind for simple page layout and spacing, reserve custom CSS for complex or reusable view styling, and keep every color/size decision ready for future theme switching through `@deep/theme`.

## Project Style Sources

- Treat `packages/theme/themes.js` as the design token source for project colors, semantic colors, gradients, shadows, font sizes, and weights.
- Treat `packages/theme/preset.js` and `apps/lab/config/tailwind.config.js` as the Tailwind bridge to those tokens.
- Treat `apps/lab/src/App.tsx` `ConfigProvider` theme configuration as the current antd runtime entry.
- Treat `apps/lab/src/index.css` as the current global CSS entry, but avoid growing it with page-specific rules.
- Treat page or component CSS files as local custom style modules by ownership, for example `apps/lab/src/pages/inference/CreateInferenceResultSetPage.css`.

## Decision Rules

1. Put antd-wide visual changes in one theme entry, not in scattered TSX `style` props or page CSS overrides.
2. Use Tailwind classes for simple layout, spacing, typography, flex/grid, and common token-backed colors.
3. Use custom CSS when selectors are complex, when styling antd internals, when responsive layout needs stable constraints, or when a view has repeated semantic parts.
4. Avoid inline `style={{ ... }}` in TSX except for genuinely dynamic runtime values or isolated one-off values that cannot be represented clearly by class names.
5. Do not hard-code colors that already exist in `themeTokens`; add semantic tokens first when a value must survive theme switching.
6. Prefer semantic tokens such as `themeTokens.colors.foreground.primary` over raw palette values when styling product UI.

## Antd Styling

- For global antd defaults, update the shared `ConfigProvider` theme object or extract it to a dedicated theme module before adding more local overrides.
- Keep antd token values derived from `@deep/theme`, for example `colorPrimary: themeTokens.colors.button.primary`.
- Prefer antd component `className` and local wrapper classes for page-specific composition.
- Avoid local nested `.ant-*` overrides unless the requirement is truly page-specific and the selector is scoped under a page-owned root class.
- If the same `.ant-*` override appears on multiple pages, move it to the shared antd style entry instead of duplicating it.
- Avoid nested `ConfigProvider` usage for styling. Use it only for a contained third-party conflict or a documented local exception.

## Tailwind Usage

- Use Tailwind for non-complex page structure: `flex`, `grid`, `gap-*`, `p-*`, `m-*`, `w-*`, `h-*`, `items-*`, `justify-*`, `text-*`, `font-*`, `bg-*`, `rounded-*`, and shadows.
- Prefer token-backed classes exposed by `@deep/theme/preset` when available.
- Keep Tailwind class lists readable. If class strings become long, conditional, repeated, or contain many arbitrary values, move the style to a named CSS class.
- Do not mix Tailwind and custom CSS for the same property on the same element unless one is a deliberate state override.
- Do not use arbitrary color classes when a semantic token or CSS variable should be introduced.

## Custom CSS Usage

- Give each page or complex component one stable root class, then scope custom selectors under it.
- Name classes by UI role, not by visual accident: use `inference-create-shell`, `result-table-toolbar`, `dataset-filter-panel`; avoid names like `blue-box` or `left-div`.
- Keep page-specific CSS next to the page. Keep reusable component CSS next to the component.
- Use CSS custom properties or theme tokens for values that should change across themes.
- Use raw pixel values only for stable product layout constraints; otherwise prefer Tailwind spacing or tokenized CSS variables.
- Avoid adding page rules to `apps/lab/src/index.css` unless the rule is truly global.

## Refactor Workflow

1. Search the target TSX/CSS files for `style={{`, `className=`, `.ant-`, raw hex colors, `rgba(`, and repeated layout values.
2. Classify each style as antd-global, page-simple, page-complex, reusable-component, or dynamic-runtime.
3. Move antd-global rules into the shared theme/style entry. If none exists yet, create a small dedicated module instead of expanding page code.
4. Convert simple static layout styles to Tailwind classes.
5. Move complex or repeated styles to a scoped CSS class in the nearest owner CSS file.
6. Replace hard-coded theme values with `themeTokens`, Tailwind preset tokens, or CSS variables backed by the theme package.
7. Verify no page CSS unintentionally changes every antd component in the app.

## Acceptable Inline Styles

Allow inline style only when:

- The value depends on runtime data, such as computed width, height, transform, color from API data, or virtualization coordinates.
- The style is passed to a third-party renderer API that requires a style object.
- The style object is a small, named constant for a non-visual technical wrapper, for example a full-screen loading layout. Prefer moving even these to CSS during cleanup when practical.

When inline style remains, keep it minimal and document why only if the reason is not obvious.

## Theme Switching Readiness

- Add new colors to `packages/theme/themes.js` as semantic tokens when they represent UI meaning.
- Mirror token changes through `packages/theme/preset.js` only when Tailwind needs to consume them.
- Avoid directly importing `themeModes.light` in page code. Page code should consume stable semantic tokens or CSS variables.
- Keep antd token configuration derived from the same token source used by Tailwind and CSS.
- For future dark mode, assume `themeModes` can gain additional modes; do not bake `light` naming into page components.

## Review Checklist

- Confirm antd-global styling has one owner.
- Confirm page CSS is scoped under a page-owned root class.
- Confirm simple static layout uses Tailwind where readable.
- Confirm complex selectors and repeated view parts use custom classes.
- Confirm no new hard-coded design colors bypass `@deep/theme`.
- Confirm inline styles are dynamic or explicitly justified.
- Run the relevant app lint/build command when the change is large enough to affect TSX or shared styles.
