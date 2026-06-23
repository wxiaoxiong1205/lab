/**
 * Check if a content string contains think tags
 * @param content The content to check
 * @returns Boolean indicating if the content has think tags
 */
export const hasThinkTags = (content?: string): boolean => {
  if (!content) return false
  return content.includes('<think>') || content.includes('</think>')
}
