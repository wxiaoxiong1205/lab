function visit(node) {
  if (!node || typeof node !== 'object') return

  if (Array.isArray(node.children)) {
    node.children.forEach((child) => {
      if (child?.type === 'image' && child.url?.startsWith('/lab-backend/')) {
        child.url = `pathname://${child.url}`
      }
      visit(child)
    })
  }
}

module.exports = function runtimeImageUrls() {
  return (tree) => {
    visit(tree)
  }
}
