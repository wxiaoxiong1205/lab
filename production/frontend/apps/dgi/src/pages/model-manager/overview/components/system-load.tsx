import { Col, Row } from 'antd'
import _ from 'lodash'
import { memo, useContext, useEffect, useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { DashboardContext } from '../config/dashboard-context'
import type { DashboardProps } from '../config/types'
import ResourceUtilization from './resource-utilization'

// 使用Recharts的PieChart实现
import { useTransform } from '@/locales'

// 临时的breakpoints配置
const breakpoints = {
  xl: 1200,
}

// 临时的CardWrapper组件
const CardWrapper: React.FC<{ style?: React.CSSProperties, children: React.ReactNode }> = ({
  style,
  children,
}) => {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      ...style,
    }}
    >
      {children}
    </div>
  )
}

// 临时的PageTools组件
const PageTools: React.FC<{ style?: React.CSSProperties, left?: React.ReactNode }> = ({
  style,
  left,
}) => {
  return (
    <div style={style}>
      {left}
    </div>
  )
}

// 临时的useWindowResize hook
const useWindowResize = () => {
  const [size, setSize] = useState({ width: 1200, height: 800 })

  useEffect(() => {
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize)
      handleResize()

      return () => window.removeEventListener('resize', handleResize)
    }
  }, [])

  return { size }
}

const GaugeChart: React.FC<{
  height: number
  value: number
  color: string
  title: string
}> = ({ height, value, color, title }) => {
  const data = [
    { name: 'used', value },
    { name: 'unused', value: 100 - value },
  ]

  const COLORS = [color, '#f0f0f0']

  return (
    <div style={{
      height,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 4px',
      overflow: 'hidden',
    }}
    >
      <div style={{
        fontSize: '12px',
        textAlign: 'center',
        lineHeight: '16px',
        marginBottom: '4px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        width: '100%',
      }}
      >
        {title}
      </div>
      <div style={{ flex: 1, width: '100%', minHeight: '80px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              startAngle={180}
              endAngle={0}
              innerRadius={20}
              outerRadius={40}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{
        fontSize: '14px',
        fontWeight: 'bold',
        marginTop: '4px',
        lineHeight: '16px',
      }}
      >
        {value}
        %
      </div>
    </div>
  )
}

const strokeColorFunc = (percent: number) => {
  if (percent <= 50 || percent === undefined) {
    return 'rgb(84, 204, 152, 80%)'
  }
  if (percent <= 80) {
    return 'rgba(250, 173, 20, 80%)'
  }
  return 'rgba(255, 77, 79, 80%)'
}

const SystemLoad = () => {
  const { $t } = useTransform()
  const data = useContext(DashboardContext)?.system_load?.current || {} as DashboardProps['system_load']['current']
  const { size } = useWindowResize()
  const [paddingRight, setPaddingRight] = useState<string>('20px')
  const [smallChartHeight, setSmallChartHeight] = useState<number>(180)
  const [largeChartHeight, setLargeChartHeight] = useState<number>(400)

  const height = 400

  const chartData = useMemo(() => {
    return {
      gpu: {
        data: _.round(data.gpu || 0, 1),
        color: strokeColorFunc(data.gpu),
      },
      vram: {
        data: _.round(data.vram || 0, 1),
        color: strokeColorFunc(data.vram),
      },
      cpu: {
        data: _.round(data.cpu || 0, 1),
        color: strokeColorFunc(data.cpu),
      },
      ram: {
        data: _.round(data.ram || 0, 1),
        color: strokeColorFunc(data.ram),
      },
    }
  }, [data])

  useEffect(() => {
    if (size.width < breakpoints.xl) {
      setPaddingRight('0')
      setSmallChartHeight(160)
      setLargeChartHeight(360)
    }
    else {
      setPaddingRight('20px')
      setSmallChartHeight(180)
      setLargeChartHeight(400)
    }
  }, [size.width])

  return (
    <div>
      <div className="system-load">
        <PageTools
          style={{ margin: '26px 0px' }}
          left={(
            <span className="font-bold">
              系统负载
            </span>
          )}
        />
        <Row style={{ width: '100%' }} gutter={[0, 20]}>
          <Col
            xs={24}
            sm={24}
            md={24}
            lg={24}
            xl={16}
            style={{ paddingRight }}
          >
            <CardWrapper style={{ height, width: '100%' }}>
              <ResourceUtilization />
            </CardWrapper>
          </Col>
          <Col xs={24} sm={24} md={24} lg={24} xl={8}>
            <CardWrapper style={{
              height: largeChartHeight,
              width: '100%',
              padding: '12px',
              overflow: 'hidden',
            }}
            >
              <Row style={{
                height: '100%',
                width: '100%',
                margin: 0,
              }}
              >
                <Col
                  span={12}
                  style={{
                    height: `${smallChartHeight}px`,
                    padding: '4px',
                  }}
                >
                  <GaugeChart
                    height={smallChartHeight - 8}
                    value={chartData.gpu.data}
                    color={chartData.gpu.color}
                    title="GPU利用率"
                  />
                </Col>
                <Col
                  span={12}
                  style={{
                    height: `${smallChartHeight}px`,
                    padding: '4px',
                  }}
                >
                  <GaugeChart
                    title="显存利用率"
                    height={smallChartHeight - 8}
                    color={chartData.vram.color}
                    value={chartData.vram.data}
                  />
                </Col>
                <Col
                  span={12}
                  style={{
                    height: `${smallChartHeight}px`,
                    padding: '4px',
                  }}
                >
                  <GaugeChart
                    title="CPU利用率"
                    height={smallChartHeight - 8}
                    color={chartData.cpu.color}
                    value={chartData.cpu.data}
                  />
                </Col>
                <Col
                  span={12}
                  style={{
                    height: `${smallChartHeight}px`,
                    padding: '4px',
                  }}
                >
                  <GaugeChart
                    title="内存利用率"
                    height={smallChartHeight - 8}
                    color={chartData.ram.color}
                    value={chartData.ram.data}
                  />
                </Col>
              </Row>
            </CardWrapper>
          </Col>
        </Row>
      </div>
    </div>
  )
}

export default memo(SystemLoad)
