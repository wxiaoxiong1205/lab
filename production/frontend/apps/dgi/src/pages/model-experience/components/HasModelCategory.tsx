export function hasModelCategory(category: string | undefined, targetCategory: string) {
  return category?.split(',').map((item) => item.trim()).includes(targetCategory) ?? false
}
