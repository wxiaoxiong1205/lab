# DgiDateTimePicker 完美日期时间选择器

这是一个功能完整、用户体验极佳的日期时间范围选择器组件。

## 特性

✅ **完美的交互体验**
- 点击输入框展开，选择日期不自动收起
- 只有点击确定、取消或外部区域才关闭
- 隐藏了左侧预设范围，界面更简洁

✅ **功能完整**
- 日期范围选择（双月显示）
- 精确的时分秒控制
- 快捷时间设置（全天、工作时间）
- 中文本地化支持

## 基础用法

```tsx
import { useState } from 'react'
import dayjs, { Dayjs } from 'dayjs'
import DgiDateTimePicker from '@/components/perfect-date-time-picker'

function MyComponent() {
  const [timeRange, setTimeRange] = useState<[Dayjs?, Dayjs?]>([
    dayjs().subtract(7, 'day'),
    dayjs()
  ])

  return (
    <DgiDateTimePicker
      value={timeRange}
      onChange={(range) => setTimeRange(range)}
      placeholder="请选择时间范围"
      className="w-[380px]"
    />
  )
}
```

## API

| 参数 | 说明 | 类型 | 默认值 |
|------|------|------|--------|
| value | 当前选中的时间范围 | `[Dayjs?, Dayjs?]` | `undefined` |
| onChange | 时间范围改变的回调 | `(value: [Dayjs, Dayjs]) => void` | - |
| placeholder | 输入框占位符 | `string` | `"选择时间范围"` |
| className | 自定义样式类名 | `string` | `"w-[380px]"` |
| disabled | 是否禁用 | `boolean` | `false` |

## 注意事项

- 确保项目中已安装 `react-date-range`、`date-fns` 和 `@types/react-date-range`
- 组件依赖 Antd 和 dayjs
- 使用 Tailwind CSS 样式
