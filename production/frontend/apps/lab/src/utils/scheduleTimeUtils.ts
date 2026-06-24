import dayjs, { type Dayjs } from 'dayjs'
import type { FormInstance } from 'antd'

/**
 * Ant Design TimePicker 的 disabledTime 返回类型
 */
export interface DisabledTimes {
  disabledHours?: () => number[]
  disabledMinutes?: (selectedHour: number) => number[]
  disabledSeconds?: (selectedHour: number, selectedMinute: number) => number[]
}

/**
 * 当所选日期为「今天」时，返回禁用早于当前时间选项的 disabledTime 函数。
 * 用于 TimePicker，配合日期选择：选今天则过去时间置灰，选未来日期则全部可选。
 *
 * @param selectedDate 当前选中的日期（dayjs 或可解析的日期值）
 * @returns 传给 TimePicker 的 disabledTime 函数，非今天时返回 undefined
 */
export function getDisabledTimeWhenDateIsToday(
  selectedDate: Dayjs | string | null | undefined,
): (() => DisabledTimes) | undefined {
  const now = dayjs()
  const isToday = selectedDate && dayjs(selectedDate).isSame(now, 'day')
  if (!isToday) return undefined

  const currentHour = now.hour()
  const currentMinute = now.minute()
  const currentSecond = now.second()

  return () => ({
    disabledHours: () => Array.from({ length: currentHour }, (_, i) => i),
    disabledMinutes: (selectedHour: number) => {
      if (selectedHour < currentHour) return Array.from({ length: 60 }, (_, i) => i)
      if (selectedHour > currentHour) return []
      return Array.from({ length: currentMinute }, (_, i) => i)
    },
    disabledSeconds: (selectedHour: number, selectedMinute: number) => {
      if (selectedHour < currentHour) return Array.from({ length: 60 }, (_, i) => i)
      if (selectedHour > currentHour) return []
      if (selectedMinute < currentMinute) return Array.from({ length: 60 }, (_, i) => i)
      if (selectedMinute > currentMinute) return []
      return Array.from({ length: currentSecond }, (_, i) => i)
    },
  })
}

export interface ScheduleDatePickerOnChangeOptions {
  /** 日期字段名，默认 'schedule_date' */
  dateFieldName?: string
  /** 时间字段名，默认 'schedule_time' */
  timeFieldName?: string
}

/**
 * 日期+时间联动：DatePicker 的 onChange 逻辑。
 * - 清空日期时清空时间
 * - 切回「今天」时，若已选时间早于当前时间则清空时间，避免保留无效值
 *
 * @param form Ant Design Form 实例
 * @param options 可选，日期/时间字段名
 * @returns 可直接作为 DatePicker onChange 使用的函数
 */
export function getScheduleDatePickerOnChange(
  form: FormInstance,
  options: ScheduleDatePickerOnChangeOptions = {},
): (date: Dayjs | null, dateStr: string | string[]) => void {
  const { dateFieldName = 'schedule_date', timeFieldName = 'schedule_time' } = options

  return (date, dateStr) => {
    if (!dateStr) {
      form.setFieldsValue({ [timeFieldName]: undefined })
      return
    }
    if (!date?.isSame(dayjs(), 'day')) return

    const timeValue = form.getFieldValue(timeFieldName)
    const time = dayjs.isDayjs(timeValue) ? timeValue : dayjs(timeValue as string, 'HH:mm:ss', true)
    if (!timeValue || !time.isValid()) return

    const combined = dayjs(date)
      .hour(time.hour())
      .minute(time.minute())
      .second(time.second())
    if (combined.isBefore(dayjs())) {
      form.setFieldsValue({ [timeFieldName]: undefined })
    }
  }
}
