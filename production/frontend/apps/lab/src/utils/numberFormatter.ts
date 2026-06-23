/**
 * 数值格式化工具函数
 * 当数值过大或过小时使用科学计数法显示
 */

/**
 * 格式化数值，自动选择最合适的显示方式
 * @param value 要格式化的数值
 * @param precision 小数位数，默认为4
 * @returns 格式化后的字符串
 */
export const formatNumber = (value: number, precision: number = 4): string => {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    return 'N/A'
  }

  // 定义阈值：绝对值小于0.001或大于999999时使用科学计数法
  const scientificThreshold = 0.0001
  const maxThreshold = 999999

  const absValue = Math.abs(value)

  // 如果数值为0，直接返回0
  if (absValue === 0) {
    return '0'
  }

  // 如果数值过小或过大，使用科学计数法
  if (absValue < scientificThreshold || absValue > maxThreshold) {
    return value.toExponential(precision)
  }

  // 否则使用固定小数位显示
  return value.toFixed(precision)
}

/**
 * 格式化数值用于图表显示
 * @param value 要格式化的数值
 * @param precision 小数位数，默认为4
 * @returns 格式化后的字符串
 */
export const formatNumberForChart = (value: number, precision: number = 4): string => {
  return formatNumber(value, precision)
}

/**
 * 格式化数值用于表格显示
 * @param value 要格式化的数值
 * @param precision 小数位数，默认为4
 * @returns 格式化后的字符串
 */
export const formatNumberForTable = (value: number, precision: number = 4): string => {
  return formatNumber(value, precision)
}
