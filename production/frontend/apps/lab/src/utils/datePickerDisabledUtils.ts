import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'

/** 0..n-1，用于禁用时间面板中早于当前时刻的选项 */
function rangeLen(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

/** 中文展示：年月日 + 时分秒（常用于 Ant Design DatePicker showTime） */
export const DATE_TIME_PICKER_ZH_FORMAT = 'YYYY年MM月DD日 HH:mm:ss'

/**
 * Ant Design DatePicker `disabledDate`：不可选今天之前的日期。
 */
export function disabledDateNotBeforeToday(current: Dayjs): boolean {
  return !!(current && current.isBefore(dayjs().startOf('day')))
}

/**
 * Ant Design DatePicker `disabledTime`（需配合 showTime）：若选中「今天」，
 * 则不可选当前时刻之前的小时/分钟/秒。
 */
export function disabledTimeNotBeforeNow(date: Dayjs | null) {
  if (!date || !date.isSame(dayjs(), 'day')) {
    return {}
  }
  const now = dayjs()
  return {
    disabledHours: () => rangeLen(now.hour()),
    disabledMinutes: (selectedHour: number) => {
      if (selectedHour < now.hour()) return rangeLen(60)
      if (selectedHour === now.hour()) return rangeLen(now.minute())
      return []
    },
    disabledSeconds: (selectedHour: number, selectedMinute: number) => {
      if (selectedHour < now.hour()) return rangeLen(60)
      if (selectedHour === now.hour() && selectedMinute < now.minute()) return rangeLen(60)
      if (selectedHour === now.hour() && selectedMinute === now.minute()) return rangeLen(now.second())
      return []
    },
  }
}
