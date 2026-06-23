/**
 * 密码强度校验工具函数
 */

export interface PasswordValidationResult {
  isValid: boolean
  errors: string[]
  strength: 'weak' | 'medium' | 'strong'
  score: number // 0-100
}

/**
 * 校验密码强度
 * @param password 待校验的密码
 * @returns 校验结果
 */
export const validatePassword = (password: string): PasswordValidationResult => {
  const errors: string[] = []
  let score = 0

  // 长度检查（最少8个字符）
  if (password.length < 8) {
    errors.push('密码长度至少为8个字符')
  }
  else {
    score += 20
    if (password.length >= 12) {
      score += 10 // 奖励长密码
    }
  }

  // 字符类型检查
  const hasUpperCase = /[A-Z]/.test(password)
  const hasLowerCase = /[a-z]/.test(password)
  const hasNumbers = /\d/.test(password)
  const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)

  const characterTypes = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar]
  const typesCount = characterTypes.filter(Boolean).length

  // 至少包含两类字符（大写字母、小写字母、数字）
  const requiredTypes = [hasUpperCase, hasLowerCase, hasNumbers]
  const requiredTypesCount = requiredTypes.filter(Boolean).length

  if (requiredTypesCount < 2) {
    errors.push('密码必须包含大写字母、小写字母、数字中至少两类')
  }
  else {
    score += 30
  }

  // 加分项
  if (hasUpperCase) score += 15
  if (hasLowerCase) score += 15
  if (hasNumbers) score += 15
  if (hasSpecialChar) score += 10 // 特殊字符加分但非必须

  // 连续字符检查（减分项）
  if (/(.)\1{2,}/.test(password)) {
    score -= 10 // 三个或更多相同字符连续出现
    errors.push('避免使用连续相同的字符')
  }

  // 常见模式检查（减分项）
  const commonPatterns = ['123456', 'abcdef', 'qwerty', 'password']
  for (const pattern of commonPatterns) {
    if (password.toLowerCase().includes(pattern)) {
      score -= 15
      errors.push('避免使用常见的字符序列')
      break
    }
  }

  // 确保分数在0-100范围内
  score = Math.max(0, Math.min(100, score))

  // 确定强度等级
  let strength: 'weak' | 'medium' | 'strong'
  if (score >= 80) {
    strength = 'strong'
  }
  else if (score >= 60) {
    strength = 'medium'
  }
  else {
    strength = 'weak'
  }

  return {
    isValid: errors.length === 0,
    errors,
    strength,
    score,
  }
}

/**
 * 获取密码强度颜色
 * @param strength 密码强度
 * @returns 对应的颜色值
 */
export const getPasswordStrengthColor = (strength: 'weak' | 'medium' | 'strong'): string => {
  switch (strength) {
    case 'weak':
      return '#ff4d4f' // 红色
    case 'medium':
      return '#faad14' // 橙色
    case 'strong':
      return '#52c41a' // 绿色
    default:
      return '#d9d9d9' // 灰色
  }
}

/**
 * 获取密码强度文本
 * @param strength 密码强度
 * @returns 对应的文本描述
 */
export const getPasswordStrengthText = (strength: 'weak' | 'medium' | 'strong'): string => {
  switch (strength) {
    case 'weak':
      return '弱'
    case 'medium':
      return '中'
    case 'strong':
      return '强'
    default:
      return ''
  }
}
