import dayjs from 'dayjs'

// xxxx/xx/xx时间格式化函数
export function formatDate(dateString: string): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}
// xxxx/xx/xx xx:xx:xx时间格式化函数
export function formatDateTime(dateString: string): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}/${month}/${day} ${hour}:${minute}:${second}`
}

export function trainType(type: string): string {
  if (type === 'text-generation') return '文本生成'
  if (type === 'image-understanding') return '图像理解'
}

// 将秒数格式化为xx小时xx分xx秒
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  let result = ''
  if (hours > 0) {
    result += `${hours}小时`
  }
  if (minutes > 0) {
    result += `${minutes}分`
  }
  if (remainingSeconds > 0 || result === '') {
    result += `${remainingSeconds}秒`
  }

  return result
}
// 将分钟数格式化为xx小时xx分
export function formatMaxRuntimeMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) return '-'
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}小时${remainingMinutes}分钟`
  }
  else if (hours > 0) {
    return `${hours}小时`
  }
  else if (remainingMinutes > 0) {
    return `${remainingMinutes}分钟`
  }
  else {
    return '--'
  }
}

// 根据开始/结束时间计算运行时长
export function calculateRunningTime(startedAt: string | null | undefined, finishedAt: string | null | undefined): string {
  if (!startedAt) {
    return '-'
  }

  const startTime = dayjs(startedAt)
  const endTime = dayjs(finishedAt)
  const diffInSeconds = endTime.diff(startTime, 'second')

  const hours = Math.floor(diffInSeconds / 3600)
  const minutes = Math.floor((diffInSeconds % 3600) / 60)
  const seconds = diffInSeconds % 60

  const parts: string[] = []
  if (hours > 0) {
    parts.push(`${hours} 小时`)
  }
  if (minutes > 0) {
    parts.push(`${minutes} 分钟`)
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} 秒`)
  }

  return parts.join(' ')
}
