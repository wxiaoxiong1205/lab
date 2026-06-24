/**
 * DOM 相关的工具函数
 */

/**
 * 判断点击的元素是否为交互元素（按钮、输入框、链接等）
 * 用于在表格行点击事件中判断是否应该触发行展开等操作
 *
 * @param target - 被点击的 HTML 元素
 * @returns 如果是交互元素返回 true，否则返回 false
 */
export const isInteractiveElement = (target: HTMLElement): boolean => {
  return (
    target.tagName === 'BUTTON'
    || target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.tagName === 'A'
    || !!target.closest('button')
    || !!target.closest('input')
    || !!target.closest('textarea')
    || !!target.closest('a')
    || !!target.closest('.ant-btn')
    || !!target.closest('.ant-input')
    || !!target.closest('.ant-typography')
  )
}
