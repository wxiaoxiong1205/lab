import dayjs from 'dayjs'
import _ from 'lodash'
import { memo, useContext, useMemo } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DashboardContext } from '../config/dashboard-context'
import { useTransform } from '@/locales'

const TypeKeyMap = {
  cpu: {
    label: 'CPU',
    type: 'CPU',
    intl: false,
    color: 'rgba(250, 173, 20,.8)',
  },
  ram: {
    label: '内存',
    type: 'Memory',
    intl: false,
    color: 'rgba(114, 46, 209,.8)',
  },
  gpu: {
    label: 'GPU',
    type: 'GPU',
    intl: false,
    color: 'rgba(84, 204, 152,.8)',
  },
  vram: {
    label: '显存',
    type: 'VRAM',
    intl: false,
    color: 'rgba(255, 107, 179, 80%)',
  },
}

const UtilizationOvertime: React.FC = () => {
  const { $t } = useTransform()
  const data = useContext(DashboardContext)?.system_load?.history || {}

  const typeList = ['gpu', 'cpu', 'ram', 'vram']

  const generateData = useMemo(() => {
    // 获取所有时间戳
    const allTimestamps = new Set<number>()
    typeList.forEach((type) => {
      const typeData = _.get(data, type, []) as any[]
      typeData.forEach((item: any) => {
        if (item && item.timestamp) {
          allTimestamps.add(item.timestamp)
        }
      })
    })

    // 按时间戳排序
    const sortedTimestamps = Array.from(allTimestamps).sort()

    // 生成图表数据
    const chartData = sortedTimestamps.map((timestamp) => {
      const point: any = {
        time: dayjs(timestamp * 1000).format('HH:mm:ss'),
        timestamp,
      }

      typeList.forEach((type) => {
        const typeData = _.get(data, type, []) as any[]
        const dataPoint = typeData.find((item: any) => item && item.timestamp === timestamp)
        point[type] = dataPoint && dataPoint.value ? _.round(dataPoint.value, 1) : 0
      })

      return point
    })

    return chartData
  }, [data])

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: '#fff',
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '8px',
        }}
        >
          <p style={{ margin: '0 0 4px 0' }}>{label}</p>
          {payload.map((entry: any, index: number) => (
            <p
              key={index}
              style={{
                margin: '2px 0',
                color: entry.color,
              }}
            >
              {TypeKeyMap[entry.dataKey as keyof typeof TypeKeyMap]?.label}
              :
              {entry.value}
              %
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div style={{ width: '100%', height: '350px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={generateData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis
            label={{ value: '(%)', angle: -90, position: 'insideLeft' }}
            domain={[0, 100]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {typeList.map((type) => {
            const config = TypeKeyMap[type as keyof typeof TypeKeyMap]
            return (
              <Line
                key={type}
                type="monotone"
                dataKey={type}
                stroke={config.color}
                strokeWidth={2}
                name={config.label}
                dot={false}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default memo(UtilizationOvertime)
