import { DownloadOutlined } from '@ant-design/icons'
import { Button, DatePicker, Select, Tooltip } from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import React from 'react'
import styled from 'styled-components'
import { DASHBOARD_STATS_API } from '../../apis'
import { useTransform } from '@/locales'

// 临时的SimpleSelect组件
const SimpleSelect = Select

const DefaultDateConfig = {
  maxRange: 60,
  defaultRange: 29,
}

const FilterWrapper = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0px;
  .selection {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ant-select-selection-overflow-item > span {
    height: 24px;
  }
`

interface FilterBarProps {
  query: any
  userList: any[]
  modelList: any[]
  handleDateChange: (dates: any, dateStrings: [string, string]) => void
  handleUsersChange: (value: any) => void
  handleModelsChange: (value: any) => void
  handleExport?: () => void
  url: string
  disabledDate?: boolean
}

// 临时的useRangePickerPreset hook
const useRangePickerPreset = () => {
  return {
    presets: [
      {
        label: '今日',
        value: () => [dayjs().startOf('day'), dayjs().endOf('day')] as [Dayjs, Dayjs],
      },
      {
        label: '昨日',
        value: () => [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')] as [Dayjs, Dayjs],
      },
      {
        label: '近7天',
        value: () => [dayjs().subtract(7, 'day').startOf('day'), dayjs().endOf('day')] as [Dayjs, Dayjs],
      },
      {
        label: '近30天',
        value: () => [dayjs().subtract(30, 'day').startOf('day'), dayjs().endOf('day')] as [Dayjs, Dayjs],
      },
    ],
  }
}

const FilterBar: React.FC<FilterBarProps> = (props) => {
  const {
    query,
    userList,
    modelList,
    handleDateChange,
    handleUsersChange,
    handleModelsChange,
    handleExport,
    url,
    disabledDate = false,
  } = props

  const { $t } = useTransform()
  const { presets } = useRangePickerPreset()

  const disabledDateFunc = (current: dayjs.Dayjs) => {
    if (!disabledDate) return false
    const today = dayjs()
    return current && current > today.endOf('day')
  }

  return (
    <FilterWrapper>
      <div className="selection">
        <DatePicker.RangePicker
          value={query.dateRange}
          onChange={handleDateChange}
          presets={presets}
          disabledDate={disabledDateFunc}
          format="YYYY-MM-DD"
          allowClear={false}
        />

        <SimpleSelect
          placeholder="选择用户"
          mode="multiple"
          style={{ minWidth: 120 }}
          value={query.user_ids}
          onChange={handleUsersChange}
          options={userList.map((user: any) => ({
            label: user.name || user.username,
            value: user.id,
          }))}
          allowClear
        />

        <SimpleSelect
          placeholder="选择模型"
          mode="multiple"
          style={{ minWidth: 120 }}
          value={query.model_ids}
          onChange={handleModelsChange}
          options={modelList.map((model: any) => ({
            label: model.name,
            value: model.id,
          }))}
          allowClear
        />
      </div>

      {handleExport && (
        <Tooltip title="导出数据">
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            type="primary"
          >
            导出
          </Button>
        </Tooltip>
      )}
    </FilterWrapper>
  )
}

export default FilterBar
