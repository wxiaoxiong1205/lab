# Config 目录

这个目录包含了项目的各种配置文件。

## 文件说明

- `tsconfig.json` - TypeScript主配置文件
- `tsconfig.app.json` - TypeScript应用配置文件
- `tsconfig.node.json` - TypeScript Node.js配置文件
- `tailwind.config.js` - Tailwind CSS配置文件
- `eslint.config.js` - ESLint代码检查配置文件

## 配置说明

### TypeScript配置
- `tsconfig.json` - 项目根配置，定义了编译选项和路径映射
- `tsconfig.app.json` - 应用代码的TypeScript配置
- `tsconfig.node.json` - Node.js环境（构建工具）的TypeScript配置

### 样式配置
- `tailwind.config.js` - Tailwind CSS框架配置，包含主题、插件等设置

### 代码质量
- `eslint.config.js` - ESLint代码检查规则配置

## 使用方法

这些配置文件通过根目录的符号链接保持兼容性，项目可以正常使用原有的命令：

```bash
pnpm dev      # 使用 tsconfig.json
pnpm build    # 使用 tsconfig.json
pnpm lint     # 使用 eslint.config.js
``` 