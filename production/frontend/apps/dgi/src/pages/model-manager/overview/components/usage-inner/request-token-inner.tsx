import { Button, Empty } from 'antd'
import dayjs from 'dayjs'
import React, { useMemo } from 'react'
import styled from 'styled-components'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { baseColorMap } from '../../config'

// 临时的CardWrapper组件
const CardWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      position: 'relative',
    }}
    >
      {children}
    </div>
  )
}

// 临时的SimpleCard组件
const SimpleCard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div style={{
      background: '#f8f9fa',
      borderRadius: '6px',
      padding: '12px',
      margin: '8px 0',
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

const DownloadButton = styled(Button).attrs({
  className: 'download-button',
})`
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  display: none;
`

const CardWrapperBox = styled.div`
  &:hover {
    .download-button {
      display: flex;
    }
  }
`

interface RequestTokenInnerProps {
  requestData?: {
    name: string
    color: string
    areaStyle: any
    data: { time: string, value: number }[]
  }[]
  tokenData?: {
    name?: string
    color?: string
    data: { time: string, value: number }[]
  }[]
  xAxisData?: string[]
  overViewData?: {
    requestCount: number
    completionCount: number
    promptCount: number
  }
}

const labelFormatter = (v: any) => {
  return dayjs(v).format('MM-DD')
}

const RequestTokenInner: React.FC<RequestTokenInnerProps> = (props) => {
  const { requestData = [], tokenData = [], xAxisData = [], overViewData } = props

  // 检查是否有数据
  const hasData = useMemo(() => {
    return requestData.length > 0 && tokenData.length > 0 && xAxisData.length > 0
  }, [requestData, tokenData, xAxisData])

  // 转换数据格式适配recharts
  const chartData = useMemo(() => {
    if (!xAxisData.length) return []

    return xAxisData.map((time, index) => {
      const point: any = { time }

      // 处理请求数据
      requestData.forEach((series) => {
        const dataPoint = series.data.find((item) => item.time === time)
        point[series.name] = dataPoint ? dataPoint.value : 0
      })

      // 处理token数据
      tokenData.forEach((series, seriesIndex) => {
        const seriesName = series.name || (seriesIndex === 0 ? 'Completion tokens' : 'Prompt tokens')
        const dataPoint = series.data.find((item) => item.time === time)
        point[seriesName] = dataPoint ? dataPoint.value : 0
      })

      return point
    })
  }, [requestData, tokenData, xAxisData])

  // 计算总数据用于显示
  const totalData = useMemo(() => {
    const requestCount = requestData.reduce((sum, series) =>
      sum + series.data.reduce((seriesSum, item) => seriesSum + item.value, 0), 0,
    )

    const completionCount = tokenData[0]?.data.reduce((sum, item) => sum + item.value, 0) || 0
    const promptCount = tokenData[1]?.data.reduce((sum, item) => sum + item.value, 0) || 0

    return {
      requestCount,
      completionCount,
      promptCount,
    }
  }, [requestData, tokenData])

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
          <p style={{ margin: '0 0 4px 0' }}>{labelFormatter(label)}</p>
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
    <CardWrapperBox>
      <CardWrapper>
        {/* 统计卡片 */}
        <SimpleCard>
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#666' }}>API请求数</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: baseColorMap.baseR1 }}>
                {formatLargeNumber(totalData.requestCount)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#666' }}>Completion Tokens</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: baseColorMap.base }}>
                {formatLargeNumber(totalData.completionCount)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '12px', color: '#666' }}>Prompt Tokens</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: baseColorMap.baseR3 }}>
                {formatLargeNumber(totalData.promptCount)}
              </div>
            </div>
          </div>
        </SimpleCard>

        {/* 图表区域 */}
        <div style={{ height: 350, marginTop: 16 }}>
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  tickFormatter={labelFormatter}
                />
                <YAxis yAxisId="requests" orientation="left" />
                <YAxis yAxisId="tokens" orientation="right" />
                <Tooltip content={<CustomTooltip />} />
                <Legend />

                {/* 请求数据用柱状图 */}
                {requestData.map((series, index) => (
                  <Bar
                    key={`request-${index}`}
                    yAxisId="requests"
                    dataKey={series.name}
                    fill={series.color}
                    name={series.name}
                  />
                ))}

                {/* Token数据用线图 */}
                {tokenData.map((series, index) => {
                  const seriesName = series.name || (index === 0 ? 'Completion tokens' : 'Prompt tokens')
                  const color = series.color || (index === 0 ? baseColorMap.base : baseColorMap.baseR3)
                  return (
                    <Line
                      key={`token-${index}`}
                      yAxisId="tokens"
                      type="monotone"
                      dataKey={seriesName}
                      stroke={color}
                      strokeWidth={2}
                      name={seriesName}
                      dot={false}
                    />
                  )
                })}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              flexDirection: 'column',
            }}
            >
              <Empty
                description="暂无使用数据"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ color: '#999' }}
              />
              <p style={{ marginTop: '8px', color: '#666', fontSize: '14px' }}>
                当前没有API请求和Token使用记录
              </p>
            </div>
          )}
        </div>
      </CardWrapper>
    </CardWrapperBox>
  )
}

export default RequestTokenInner
