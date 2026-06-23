function htmlRemoveModulePlugin() {
  return {
    name: 'html-remove-module',
    enforce: 'post', // 确保在其他插件处理完后执行
    apply: 'build', // 只在构建阶段生效
    // Vite 6 中 transformIndexHtml 推荐直接返回处理后的字符串
    transformIndexHtml(html, context) {
      console.log('transformIndexHtml 执行中', context.path)
      // 直接返回处理后的 HTML 字符串（Vite 6 推荐的格式）
      return html.replace(/<script type="module"(.*?)<\/script>/gs, '')
    },
    // 保留 generateBundle 作为兜底，防止 HTML 处理有遗漏
    generateBundle(options, bundle) {
      const htmlFile = bundle['index.html']
      if (htmlFile && htmlFile.source) {
        console.log('generateBundle 执行 HTML 兜底处理')
        // 使用 /gs 修饰符确保匹配跨换行的 script 标签
        htmlFile.source = htmlFile.source.replace(/<script type="module"(.*?)<\/script>/gs, '')
      }
    },
  }
}

export default htmlRemoveModulePlugin
