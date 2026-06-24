import { Empty } from 'antd'
import React from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { baseColorMap } from '../../config'

// 临时的CardWrapper组件
const CardWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      minHeight: '300px',
    }}
    >
      {children}
    </div>
  )
}

// 临时的formatLargeNumber函数
const formatLargeNumber = (num: number) => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

interface TopUserProps {
  userData?: {
    name: string
    color: string
    data: { name: string, value: number }[]
  }[]
  topUserList?: string[]
}

const TopUser: React.FC<TopUserProps> = (props) => {
  const { userData = [], topUserList = [] } = props

  // 检查是否有数据
  const hasData = userData.length > 0 && topUserList.length > 0

  // 转换数据格式适配recharts
  const chartData = React.useMemo(() => {
    if (!hasData) return []

    return topUserList.map((username) => {
      const dataPoint: any = { username }

      userData.forEach((series) => {
        const userDataPoint = series.data.find((item) => item.name === username)
        dataPoint[series.name] = userDataPoint ? userDataPoint.value : 0
      })

      return dataPoint
    })
  }, [userData, topUserList, hasData])

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
          <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>{label}</p>
          {payload.map((entry: any, index: number) => (
            <p
              key={index}
              style={{
                margin: '2px 0',
                color: entry.color,
              }}
            >
              {entry.name}
              :
              {formatLargeNumber(entry.value)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <CardWrapper>
      {hasData ? (
        <div style={{ height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              layout="horizontal"
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis
                dataKey="username"
                type="category"
                width={80}
                tick={{ fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />

              {userData.map((series, index) => (
                <Bar
                  key={index}
                  dataKey={series.name}
                  stackId="tokens"
                  fill={series.color}
                  name={series.name}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '300px',
          flexDirection: 'column',
        }}
        >
          <Empty
            description="暂无热门用户数据"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ color: '#999' }}
          />
          <p style={{ marginTop: '8px', color: '#666', fontSize: '14px' }}>
            当前没有用户使用记录
          </p>
        </div>
      )}
    </CardWrapper>
  )
}

export default TopUser
