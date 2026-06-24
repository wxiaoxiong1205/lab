import { useState } from 'react'
import {
  Button,
  Dropdown,
  Input,
  TimePicker,
} from 'antd'
import { DateRangePicker } from 'react-date-range'
import { zhCN } from 'date-fns/locale'
import { CalendarOutlined, CloseCircleFilled } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import 'react-date-range/dist/styles.css'
import 'react-date-range/dist/theme/default.css'
import cn from 'classnames'

export interface PerfectDateTimePickerProps {
  value?: [Dayjs?, Dayjs?]
  onChange?: (value: [Dayjs, Dayjs]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  hasOptions?: boolean
  hasTimer?: boolean
}

export default function PerfectDateTimePicker({
  value,
  onChange,
  placeholder = '选择时间范围',
  className = 'w-[380px]',
  disabled = false,
  hasOptions = true,
  hasTimer = true,
}: PerfectDateTimePickerProps) {
  const [datePickerVisible, setDatePickerVisible] = useState(false)

  // 使用外部传入的值
  const searchTime = value

  const selectionRange = {
    startDate: searchTime?.[0]?.toDate() || dayjs().toDate(),
    endDate: searchTime?.[1]?.toDate() || dayjs().toDate(),
    key: 'selection',
  }

  const handleSelect = (ranges: any) => {
    const { startDate, endDate } = ranges.selection
    // 保持已有的时分秒，只修改日期部分
    const currentStartTime = searchTime?.[0] || dayjs().hour(0).minute(0).second(0)
    const currentEndTime = searchTime?.[1] || dayjs().hour(23).minute(59).second(59)

    const newStartDate = dayjs(startDate)
      .hour(currentStartTime.hour())
      .minute(currentStartTime.minute())
      .second(currentStartTime.second())
    const newEndDate = dayjs(endDate)
      .hour(currentEndTime.hour())
      .minute(currentEndTime.minute())
      .second(currentEndTime.second())

    onChange?.([newStartDate, newEndDate])
    // 不在这里关闭下拉框，让用户可以继续选择时间或手动关闭
  }

  // 格式化显示的日期时间范围
  const formatDateTimeRange = () => {
    if (!searchTime?.[0] || !searchTime?.[1]) {
      // return placeholder;
      return ''
    }
    const start = searchTime[0].format('YYYY-MM-DD HH:mm:ss')
    const end = searchTime[1].format('YYYY-MM-DD HH:mm:ss')
    return `${start} ~ ${end}`
  }

  // 清除时间选择
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange?.([] as any)
    setDatePickerVisible(false)
  }

  // 检查是否有值
  const hasValue = searchTime?.[0] && searchTime?.[1]

  return (
    <Dropdown
      open={datePickerVisible && !disabled}
      onOpenChange={(open) => {
        if (!disabled) {
          setDatePickerVisible(open)
        }
      }}
      placement="bottomLeft"
      trigger={['click']}
      dropdownRender={() => (
        <div
          className="bg-white border border-gray-200 rounded-lg shadow-lg p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <style>
            {`
            .rdrDefinedRangesWrapper {
              display: none !important;
            }
            .rdrInputRangesWrapper {
              display: none !important;
            }
          `}
          </style>
          <DateRangePicker
            ranges={[selectionRange]}
            onChange={handleSelect}
            locale={zhCN}
            showDateDisplay={false}
            showPreview
            moveRangeOnFirstSelection={false}
            months={2}
            direction="horizontal"
            rangeColors={['#1890ff']}
            color="#1890ff"
            staticRanges={[]}
            inputRanges={[]}
          />

          {/* 时间选择区域 */}
          <div className="mt-4 p-3 border-t border-gray-200">
            {hasTimer && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    开始时间
                  </label>
                  <TimePicker
                    value={searchTime?.[0]}
                    onChange={(time) => {
                      if (time && onChange) {
                        onChange([time, searchTime?.[1] || dayjs()])
                      }
                    }}
                    format="HH:mm:ss"
                    size="small"
                    placeholder="选择开始时间"
                    className="w-full"
                    showNow={false}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    结束时间
                  </label>
                  <TimePicker
                    value={searchTime?.[1]}
                    onChange={(time) => {
                      if (time && onChange) {
                        onChange([searchTime?.[0] || dayjs(), time])
                      }
                    }}
                    format="HH:mm:ss"
                    size="small"
                    placeholder="选择结束时间"
                    className="w-full"
                    showNow={false}
                  />
                </div>
              </div>
            )}

            <div className={cn('flex items-center mt-3', !hasOptions ? 'justify-end' : 'justify-between')}>
              {hasOptions && (
                <div className="flex gap-2">
                  <Button
                    size="small"
                    type="link"
                    onClick={() => {
                      if (onChange) {
                        const start = searchTime?.[0]?.hour(0).minute(0).second(0) || dayjs().hour(0).minute(0).second(0)
                        const end = searchTime?.[1]?.hour(23).minute(59).second(59) || dayjs().hour(23).minute(59).second(59)
                        onChange([start, end])
                      }
                    }}
                  >
                    全天
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => {
                      if (onChange) {
                        const start = searchTime?.[0]?.hour(8).minute(0).second(0) || dayjs().hour(8).minute(0).second(0)
                        const end = searchTime?.[1]?.hour(18).minute(0).second(0) || dayjs().hour(18).minute(0).second(0)
                        onChange([start, end])
                      }
                    }}
                  >
                    工作时间
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  size="small"
                  onClick={() => setDatePickerVisible(false)}
                >
                  取消
                </Button>
                <Button
                  type="primary"
                  size="small"
                  onClick={() => {
                    setDatePickerVisible(false)
                  }}
                >
                  确定
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    >
      <div className="group relative">
        <Input
          value={formatDateTimeRange()}
          readOnly
          placeholder={placeholder}
          suffix={(
            <div className="flex items-center gap-1">
              {/* 清除图标 - 只在有值且hover时显示 */}
              {hasValue && !disabled && (
                <CloseCircleFilled
                  className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                  onClick={handleClear}
                />
              )}
              <CalendarOutlined className="text-gray-400" />
            </div>
          )}
          className="cursor-pointer !min-w-[340px]"
          onClick={() => !disabled && setDatePickerVisible(!datePickerVisible)}
          disabled={disabled}
        />
      </div>
    </Dropdown>
  )
}
