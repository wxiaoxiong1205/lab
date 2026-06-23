import React, { useState } from 'react'
import { Button, Card, Col, Progress, Row, Select, Spin, Table } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiGetRegisterWorkerNames, apiQueryCpuageSummary, apiQueryDisksSummary, apiQueryGpuSummary, apiQueryLoadavgSummary, apiQueryMemorySummary, apiQueryNetworkSummary, apiQueryNodeDashboards, apiQueryTcpSummary, apiQueryVramSummary, apiQueryWorkerResourceCounts } from '@/services/api'
import { $t } from '@/locales'

interface TimeSeriesData {
  timestamp: number
  value: number
  used?: number
  total?: number
}

interface DiskData {
  name: string
  read_bytes: TimeSeriesData[]
  write_bytes: TimeSeriesData[]
  read_iops: TimeSeriesData[]
  write_iops: TimeSeriesData[]
  avg_read_time_per_op: TimeSeriesData[]
  avg_write_time_per_op: TimeSeriesData[]
}

interface GpuData {
  index: number
  type: string
  utilization_rate: number
}

interface VramData {
  index: number
  utilization_rate: number
  used: number
  total: number
}

interface DiskSummary {
  current: DiskData[]
  history: DiskData[]
}

interface GpuSummary {
  current: GpuData[]
  history: {
    index: number
    utilization_rate: TimeSeriesData[]
  }[]
}

interface VramSummary {
  current: VramData[]
  history: {
    index: number
    utilization_rate: TimeSeriesData[]
  }[]
}

interface TcpSummary {
  current: {
    ESTABLISHED: number
    TCP_tw: number
    ActiveOpens: number
    PassiveOpens: number
    TCP_alloc: number
    TCP_inuse: number
  }
  history: {
    ESTABLISHED: TimeSeriesData[]
    TCP_tw: TimeSeriesData[]
    ActiveOpens: TimeSeriesData[]
    PassiveOpens: TimeSeriesData[]
    TCP_alloc: TimeSeriesData[]
    TCP_inuse: TimeSeriesData[]
  }
}

interface NetworkSummary {
  current: {
    upload: number
    download: number
  }
  history: {
    upload: TimeSeriesData[]
    download: TimeSeriesData[]
  }
}

interface LoadavgSummary {
  current: {
    loadavg_1: number
    loadavg_5: number
    loadavg_15: number
  }
  history: {
    loadavg_1: TimeSeriesData[]
    loadavg_5: TimeSeriesData[]
    loadavg_15: TimeSeriesData[]
  }
}

interface CpuageSummary {
  current: {
    cpu_user: number
    cpu_system: number
    cpu_iowait: number
    cpu_idle: number
  }
  history: {
    cpu_user: TimeSeriesData[]
    cpu_system: TimeSeriesData[]
    cpu_iowait: TimeSeriesData[]
    cpu_idle: TimeSeriesData[]
  }
}

interface MemorySummary {
  current: {
    utilization_rate: number
  }
  history: TimeSeriesData[]
}

interface WorkerResourceCounts {
  uptime_days: number
  cpu_total: number
  cpu_utilization_rate: number
  cpu_iowait: number
  memory_total: number
  memory_used: number
  file_descriptor: number
  disk_io_rate: number
  root_directory_utilization_rate: number
  max_directory_utilization_rate: number
  filesystem: Array<{
    mount_point: string
    total: number
    used: number
    free: number
  }>
}

interface DiskSpaceTableItem {
  key: string
  filesystem: string
  partition: string
  totalSpace: string
  usageRate: string
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

const formatGiB = (bytes: number) => {
  const gib = bytes / (1024 * 1024 * 1024)
  return `${gib.toFixed(2)} GiB`
}

const formatTime = (time: number) => {
  if (time === 0) return '0 ms'
  if (time < 1) return `${(time * 1000).toFixed(2)} ms`
  return `${time.toFixed(2)} s`
}

// 为每个磁盘生成固定的颜色
const getDiskColor = (diskName: string, isRead: boolean) => {
  // 使用字符串哈希算法生成一个固定的色相值
  const hash = diskName.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc)
  }, 0)

  // 生成基础色相值 (0-360)
  const baseHue = hash % 360

  // 为读写操作设置不同的饱和度和亮度
  const saturation = 70 // 固定饱和度
  const lightness = isRead ? 45 : 65 // 读操作深色，写操作浅色

  return `hsl(${baseHue}, ${saturation}%, ${lightness}%)`
}

// GPU和显存固定颜色数组
const getGpuColor = (index: number) => {
  const colors = [
    '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe',
    '#00c49f', '#ffbb28', '#ff8042', '#8dd1e1', '#d084d0',
  ]
  return colors[index % colors.length]
}

// 自定义Legend组件
const CustomLegend = ({ payload, onClick, disabledItems }: any) => {
  return (
    <div className="flex flex-wrap justify-center gap-4 mt-2">
      {payload.map((entry: any, index: number) => (
        <div
          key={entry.dataKey}
          className="flex items-center cursor-pointer hover:opacity-80"
          onClick={() => onClick({ dataKey: entry.dataKey })}
        >
          <div
            className="w-3 h-3 mr-2"
            style={{
              backgroundColor: disabledItems.includes(entry.dataKey) ? '#ccc' : entry.color,
              opacity: disabledItems.includes(entry.dataKey) ? 0.5 : 1,
            }}
          />
          <span
            className="text-sm"
            style={{
              color: disabledItems.includes(entry.dataKey) ? '#999' : '#333',
              textDecoration: disabledItems.includes(entry.dataKey) ? 'line-through' : 'none',
            }}
          >
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

const PowerResource: React.FC = () => {
  const [worker_name, setWorker_name] = useState('')
  const [workerList, setWorkerList] = useState<{ label: string, value: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [disabledGpuLines, setDisabledGpuLines] = useState<string[]>([])
  const [disabledVramLines, setDisabledVramLines] = useState<string[]>([])

  const [workerResourceCounts, setWorkerResourceCounts] = useState<WorkerResourceCounts | null>(null)
  const [cpuageSummary, setCpuageSummary] = useState<CpuageSummary | null>(null)
  const [memorySummary, setMemorySummary] = useState<MemorySummary | null>(null)
  const [gpuSummary, setGpuSummary] = useState<GpuSummary | null>(null)
  const [vramSummary, setVramSummary] = useState<VramSummary | null>(null)
  const [disksSummary, setDisksSummary] = useState<DiskSummary | null>(null)
  const [networkSummary, setNetworkSummary] = useState<NetworkSummary | null>(null)
  const [loadavgSummary, setLoadavgSummary] = useState<LoadavgSummary | null>(null)
  const [tcpSummary, setTcpSummary] = useState<TcpSummary | null>(null)

  const [dashboardLoadingMap, setDashboardLoadingMap] = useState<Record<string, boolean>>({
    workerResource: false,
    cpuageSummary: false,
    memorySummary: false,
    gpuSummary: false,
    vramSummary: false,
    disksSummary: false,
    networkSummary: false,
    loadavgSummary: false,
    tcpSummary: false,
  })

  // 处理GPU图例点击 - 使用useCallback优化性能
  const handleGpuLegendClick = useCallback((e: any) => {
    const { dataKey } = e
    setDisabledGpuLines((prev) =>
      prev.includes(dataKey)
        ? prev.filter((key) => key !== dataKey)
        : [...prev, dataKey],
    )
  }, [])

  // 处理显存图例点击 - 使用useCallback优化性能
  const handleVramLegendClick = useCallback((e: any) => {
    const { dataKey } = e
    setDisabledVramLines((prev) =>
      prev.includes(dataKey)
        ? prev.filter((key) => key !== dataKey)
        : [...prev, dataKey],
    )
  }, [])

  // 处理内存信息数据
  const memoryData = useMemo(() => {
    if (!memorySummary) return []
    return memorySummary.history.map((item: TimeSeriesData) => ({
      timestamp: item.timestamp,
      [$t('已用内存')]: item.value,
    }))
  }, [memorySummary])

  // 处理CPU使用率数据
  const cpuUsageData = useMemo(() => {
    if (!cpuageSummary) return []

    const data: Array<{
      timestamp: number
      [key: string]: number
    }> = []

    const timestamps = new Set<number>();
    [...cpuageSummary.history.cpu_user,
      ...cpuageSummary.history.cpu_system,
      ...cpuageSummary.history.cpu_iowait,
      ...cpuageSummary.history.cpu_idle,
    ].forEach((item) => timestamps.add(item.timestamp))

    Array.from(timestamps).sort().forEach((timestamp) => {
      const point = {
        timestamp,
        [$t('CPU使用')]: cpuageSummary.history.cpu_user.find((x: TimeSeriesData) => x.timestamp === timestamp)?.value || 0,
        [$t('系统')]: cpuageSummary.history.cpu_system.find((x: { timestamp: number, value: number }) => x.timestamp === timestamp)?.value || 0,
        [$t('IO等待')]: cpuageSummary.history.cpu_iowait.find((x: { timestamp: number, value: number }) => x.timestamp === timestamp)?.value || 0,
        [$t('空闲')]: cpuageSummary.history.cpu_idle.find((x: { timestamp: number, value: number }) => x.timestamp === timestamp)?.value || 0,
      }
      data.push(point)
    })

    return data
  }, [cpuageSummary])

  // 处理网络流量数据
  const networkData = useMemo(() => {
    if (!networkSummary) return []

    const timestamps = new Set<number>();
    [...networkSummary.history.upload,
      ...networkSummary.history.download,
    ].forEach((item) => timestamps.add(item.timestamp))

    return Array.from(timestamps).sort().map((timestamp) => ({
      timestamp,
      [$t('in下载')]: networkSummary.history.upload.find((x) => x.timestamp === timestamp)?.value || 0,
      [$t('out上传')]: networkSummary.history.download.find((x) => x.timestamp === timestamp)?.value || 0,
    }))
  }, [networkSummary])

  // 处理系统负载数据
  const loadAvgData = useMemo(() => {
    if (!loadavgSummary) return []

    const data: Array<{
      'timestamp': number
      '1m': number
      '5m': number
      '15m': number
    }> = []

    const timestamps = new Set<number>();
    [...loadavgSummary.history.loadavg_1,
      ...loadavgSummary.history.loadavg_5,
      ...loadavgSummary.history.loadavg_15,
    ].forEach((item) => timestamps.add(item.timestamp))

    Array.from(timestamps).sort().forEach((timestamp) => {
      const point = {
        timestamp,
        '1m': loadavgSummary.history.loadavg_1.find((x) => x.timestamp === timestamp)?.value || 0,
        '5m': loadavgSummary.history.loadavg_5.find((x) => x.timestamp === timestamp)?.value || 0,
        '15m': loadavgSummary.history.loadavg_15.find((x) => x.timestamp === timestamp)?.value || 0,
      }
      data.push(point)
    })

    return data
  }, [loadavgSummary])

  // 处理TCP连接数据
  const tcpData = useMemo(() => {
    if (!tcpSummary) return []

    const data: Array<{
      timestamp: number
      ESTABLISHED: number
      TCP_tw: number
      ActiveOpens: number
      PassiveOpens: number
      TCP_alloc: number
      TCP_inuse: number
    }> = []

    const timestamps = new Set<number>()
    Object.values(tcpSummary.history).forEach((history: TimeSeriesData[]) => {
      history.forEach((item: TimeSeriesData) => timestamps.add(item.timestamp))
    })

    Array.from(timestamps).sort().forEach((timestamp) => {
      const point = {
        timestamp,
        ESTABLISHED: tcpSummary.history.ESTABLISHED.find((x) => x.timestamp === timestamp)?.value || 0,
        TCP_tw: tcpSummary.history.TCP_tw.find((x) => x.timestamp === timestamp)?.value || 0,
        ActiveOpens: tcpSummary.history.ActiveOpens.find((x) => x.timestamp === timestamp)?.value || 0,
        PassiveOpens: tcpSummary.history.PassiveOpens.find((x) => x.timestamp === timestamp)?.value || 0,
        TCP_alloc: tcpSummary.history.TCP_alloc.find((x) => x.timestamp === timestamp)?.value || 0,
        TCP_inuse: tcpSummary.history.TCP_inuse.find((x) => x.timestamp === timestamp)?.value || 0,
      }
      data.push(point)
    })

    return data
  }, [tcpSummary])

  // 处理GPU使用率数据
  const gpuData = useMemo(() => {
    if (!gpuSummary) return []

    const data: Array<{
      timestamp: number
      [key: string]: number
    }> = []

    const timestamps = new Set<number>()
    gpuSummary.history.forEach((gpu: { index: number, utilization_rate: TimeSeriesData[] }) => {
      gpu.utilization_rate.forEach((item: TimeSeriesData) => timestamps.add(item.timestamp))
    })

    Array.from(timestamps).sort().forEach((timestamp) => {
      const point: { [key: string]: number, timestamp: number } = { timestamp }
      gpuSummary.history.forEach((gpu: { index: number, utilization_rate: TimeSeriesData[] }) => {
        const value = gpu.utilization_rate.find((x: TimeSeriesData) => x.timestamp === timestamp)?.value || 0
        point[`${gpuSummary.current[gpu.index]?.type}${gpu.index}`] = value
      })
      data.push(point)
    })

    return data
  }, [gpuSummary])

  // 缓存GPU Line组件渲染
  const gpuLines = useMemo(() => {
    if (!gpuSummary) return []

    return gpuSummary.current.map((gpu, index) => {
      const dataKey = `${gpu.type}${gpu.index}`
      const isDisabled = disabledGpuLines.includes(dataKey)
      return (
        <Line
          key={gpu.index}
          type="monotone"
          dataKey={dataKey}
          name={dataKey}
          stroke={isDisabled ? '#ccc' : getGpuColor(index)}
          strokeOpacity={isDisabled ? 0.3 : 1}
          dot={false}
        />
      )
    })
  }, [gpuSummary, disabledGpuLines])

  // 处理磁盘读写速率数据
  const diskIopsData = useMemo(() => {
    if (!disksSummary) return []

    const data: Array<{
      timestamp: number
      [key: string]: number
    }> = []

    const timestamps = new Set<number>()
    disksSummary.history.forEach((disk: {
      name: string
      read_iops: TimeSeriesData[]
      write_iops: TimeSeriesData[]
    }) => {
      disk.read_iops.forEach((item: TimeSeriesData) => timestamps.add(item.timestamp))
      disk.write_iops.forEach((item: TimeSeriesData) => timestamps.add(item.timestamp))
    })

    Array.from(timestamps).sort().forEach((timestamp) => {
      const point: { [key: string]: number, timestamp: number } = { timestamp }
      disksSummary.history.forEach((disk: {
        name: string
        read_iops: TimeSeriesData[]
        write_iops: TimeSeriesData[]
      }) => {
        const readValue = disk.read_iops.find((x: TimeSeriesData) => x.timestamp === timestamp)?.value || 0
        const writeValue = disk.write_iops.find((x: TimeSeriesData) => x.timestamp === timestamp)?.value || 0
        point[`${disk.name}_read`] = readValue
        point[`${disk.name}_write`] = writeValue
      })
      data.push(point)
    })

    return data
  }, [disksSummary])

  // 处理磁盘读写容量数据
  const diskBytesData = useMemo(() => {
    if (!disksSummary) return []

    const data: Array<{
      timestamp: number
      [key: string]: number
    }> = []

    const timestamps = new Set<number>()
    disksSummary.history.forEach((disk) => {
      disk.read_bytes.forEach((item) => timestamps.add(item.timestamp))
      disk.write_bytes.forEach((item) => timestamps.add(item.timestamp))
    })

    Array.from(timestamps).sort().forEach((timestamp) => {
      const point: { [key: string]: number, timestamp: number } = { timestamp }
      disksSummary.history.forEach((disk) => {
        const readValue = disk.read_bytes.find((x) => x.timestamp === timestamp)?.value || 0
        const writeValue = disk.write_bytes.find((x) => x.timestamp === timestamp)?.value || 0
        point[`${disk.name}_read`] = readValue
        point[`${disk.name}_write`] = writeValue
      })
      data.push(point)
    })

    return data
  }, [disksSummary])

  // 处理磁盘IO时间数据
  const diskTimeData = useMemo(() => {
    if (!disksSummary) return []

    const data: Array<{
      timestamp: number
      [key: string]: number
    }> = []

    const timestamps = new Set<number>()
    disksSummary.history.forEach((disk) => {
      disk.avg_read_time_per_op.forEach((item) => timestamps.add(item.timestamp))
      disk.avg_write_time_per_op.forEach((item) => timestamps.add(item.timestamp))
    })

    Array.from(timestamps).sort().forEach((timestamp) => {
      const point: { [key: string]: number, timestamp: number } = { timestamp }
      disksSummary.history.forEach((disk) => {
        const readValue = disk.avg_read_time_per_op.find((x) => x.timestamp === timestamp)?.value || 0
        const writeValue = disk.avg_write_time_per_op.find((x) => x.timestamp === timestamp)?.value || 0
        point[`${disk.name}_read`] = readValue
        point[`${disk.name}_write`] = writeValue
      })
      data.push(point)
    })

    return data
  }, [disksSummary])

  // 处理显存使用率数据
  const vramData = useMemo(() => {
    if (!vramSummary) return []

    const data: Array<{
      timestamp: number
      [key: string]: number
    }> = []

    const timestamps = new Set<number>()
    vramSummary.history.forEach((vram: {
      index: number
      utilization_rate: TimeSeriesData[]
    }) => {
      vram.utilization_rate.forEach((item: TimeSeriesData) => timestamps.add(item.timestamp))
    })

    Array.from(timestamps).sort().forEach((timestamp) => {
      const point: { [key: string]: any, timestamp: number } = { timestamp }
      vramSummary.history.forEach((vram: {
        index: number
        utilization_rate: TimeSeriesData[]
      }) => {
        const currentVram = vram.utilization_rate.find((x: TimeSeriesData) => x.timestamp === timestamp)
        const key = `显存${vram.index}`
        // 保持原来的数值用于绘制线条
        point[key] = currentVram?.value || 0
        // 添加额外的信息用于tooltip
        point[`${key}_info`] = {
          value: currentVram?.value || 0,
          used: currentVram?.used || 0,
          total: currentVram?.total || 0,
        }
      })
      data.push(point)
    })

    return data
  }, [vramSummary])

  // 缓存显存 Line组件渲染
  const vramLines = useMemo(() => {
    if (!vramSummary) return []

    return vramSummary.current.map((vram, index) => {
      const dataKey = `显存${vram.index}`
      const isDisabled = disabledVramLines.includes(dataKey)
      return (
        <Line
          key={vram.index}
          type="monotone"
          dataKey={dataKey}
          name={dataKey}
          stroke={isDisabled ? '#ccc' : getGpuColor(index)}
          strokeOpacity={isDisabled ? 0.3 : 1}
          dot={false}
        />
      )
    })
  }, [vramSummary, disabledVramLines])

  // 磁盘空间表格列定义
  const diskSpaceColumns: ColumnsType<DiskSpaceTableItem> = [
    {
      title: $t('文件系统'),
      dataIndex: 'filesystem',
      key: 'filesystem',
    },
    {
      title: $t('分区'),
      dataIndex: 'partition',
      key: 'partition',
    },
    {
      title: $t('总空间'),
      dataIndex: 'totalSpace',
      key: 'totalSpace',
    },
    {
      title: $t('使用率'),
      dataIndex: 'usageRate',
      key: 'usageRate',
      render: (text: string) => {
        const percentage = parseFloat(text.replace('%', ''))
        return (
          <div className="flex items-center">
            <Progress
              percent={percentage}
              size="small"
              style={{ width: 100, marginRight: 8 }}
            />
          </div>
        )
      },
    },
  ]

  const diskSpaceData: DiskSpaceTableItem[] = useMemo(() => {
    // if (!resourceData) return [];
    if (!workerResourceCounts) return []
    return workerResourceCounts.filesystem.map((fs: {
      mount_point: string
      total: number
      used: number
      free: number
    }, index: number) => ({
      key: index.toString(),
      filesystem: fs.mount_point === '/' ? 'ext4' : 'xfs',
      partition: fs.mount_point,
      totalSpace: formatBytes(fs.total),
      usageRate: `${((fs.used / fs.total) * 100).toFixed(2)}%`,
    }))
  }, [workerResourceCounts])
  const queryWorkerResourceCounts = useCallback(async (worker_name: string) => {
    try {
      setDashboardLoadingMap((prev) => ({ ...prev, workerResource: true }))
      const res: any = await apiQueryWorkerResourceCounts({ worker_name })
      setWorkerResourceCounts(res)
      // setResourceData((prev: ResourceData | null) => prev ? { ...prev, worker_resource_counts: res } : null);
      setDashboardLoadingMap((prev) => ({ ...prev, workerResource: false }))
      console.log(res, '拆分后的数据')
    }
    catch (error) {
      console.error('获取节点数据失败:', error)
    }
    finally {
      setLoading(false)
    }
  }, [worker_name])

  const queryLoadavgSummary = useCallback(async (worker_name: string) => {
    try {
      const res: any = await apiQueryLoadavgSummary({ worker_name })
      setLoadavgSummary(res)
    }
    catch (error) {
      console.error('获取负载数据失败:', error)
    }
  }, [])

  const queryTcpSummary = useCallback(async (worker_name: string) => {
    try {
      const res: any = await apiQueryTcpSummary({ worker_name })
      setTcpSummary(res)
    }
    catch (error) {
      console.error('获取TCP数据失败:', error)
    }
  }, [])

  const queryNetworkSummary = useCallback(async (worker_name: string) => {
    try {
      const res: any = await apiQueryNetworkSummary({ worker_name })
      setNetworkSummary(res)
    }
    catch (error) {
      console.error('获取网络数据失败:', error)
    }
  }, [])

  const queryCpuageSummary = useCallback(async (worker_name: string) => {
    try {
      setDashboardLoadingMap((prev) => ({ ...prev, cpuageSummary: true }))
      const res: any = await apiQueryCpuageSummary({ worker_name })
      setCpuageSummary(res)
      setDashboardLoadingMap((prev) => ({ ...prev, cpuageSummary: false }))
    }
    catch (error) {
      console.error('获取CPU使用率数据失败:', error)
    }
  }, [])

  const queryMemorySummary = useCallback(async (worker_name: string) => {
    try {
      setDashboardLoadingMap((prev) => ({ ...prev, memorySummary: true }))
      const res: any = await apiQueryMemorySummary({ worker_name })
      setMemorySummary(res)
      setDashboardLoadingMap((prev) => ({ ...prev, memorySummary: false }))
    }
    catch (error) {
      console.error('获取内存数据失败:', error)
    }
  }, [])

  const queryGpuSummary = useCallback(async (worker_name: string) => {
    try {
      setDashboardLoadingMap((prev) => ({ ...prev, gpuSummary: true }))
      const res: any = await apiQueryGpuSummary({ worker_name })
      setGpuSummary(res)
      setDashboardLoadingMap((prev) => ({ ...prev, gpuSummary: false }))
    }
    catch (error) {
      console.error('获取GPU数据失败:', error)
    }
  }, [])

  const queryVramSummary = useCallback(async (worker_name: string) => {
    try {
      setDashboardLoadingMap((prev) => ({ ...prev, vramSummary: true }))
      const res: any = await apiQueryVramSummary({ worker_name })
      setVramSummary(res)
      setDashboardLoadingMap((prev) => ({ ...prev, vramSummary: false }))
    }
    catch (error) {
      console.error('获取显存数据失败:', error)
    }
  }, [])

  const queryDisksSummary = useCallback(async (worker_name: string) => {
    try {
      setDashboardLoadingMap((prev) => ({ ...prev, disksSummary: true }))
      const res: any = await apiQueryDisksSummary({ worker_name })
      setDisksSummary(res)
      setDashboardLoadingMap((prev) => ({ ...prev, disksSummary: false }))
    }
    catch (error) {
      console.error('获取磁盘数据失败:', error)
    }
  }, [])

  const loadDashBoardData = (worker_name: string) => {
    queryWorkerResourceCounts(worker_name)
    queryCpuageSummary(worker_name)
    queryMemorySummary(worker_name)
    queryGpuSummary(worker_name)
    queryVramSummary(worker_name)
    queryDisksSummary(worker_name)
    queryNetworkSummary(worker_name)
    queryLoadavgSummary(worker_name)
    queryTcpSummary(worker_name)
  }

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true)
        const workersRes: any = await apiGetRegisterWorkerNames()
        setWorkerList(workersRes.worker_names.map((item: any) => ({ label: item, value: item })))
        if (workersRes.worker_names.length > 0) {
          const firstWorker = workersRes.worker_names[0]
          setWorker_name(firstWorker)
          // 按顺序加载各个模块
          loadDashBoardData(firstWorker)
        }
      }
      catch (error) {
        console.error('初始化数据失败:', error)
      }
      finally {
        setLoading(false)
      }
    }

    loadInitialData()
  }, [])

  return (
    <div className="p-1">
      <div className="flex items-center gap-2 mb-2">
        <Select
          options={workerList}
          onChange={(value: any) => {
            setWorker_name(value)
            // 按顺序加载各个模块
            loadDashBoardData(value)
          }}
          value={worker_name}
          style={{ width: 200 }}
        />
        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => {
            // 按顺序加载各个模块
            loadDashBoardData(worker_name)
          }}
          title="刷新数据"
        />
      </div>
      {/* 系统资源监控面板 */}
      <Spin spinning={dashboardLoadingMap.workerResource} tip="">
        <Row gutter={[16, 16]} className="mt-2">
          <Col span={3}>
            <Card bodyStyle={{ padding: '12px' }} style={{ height: '168px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
              <div className="h-full flex flex-col justify-center">
                <div className="text-sm mb-2">{$t('系统运行时间')}</div>
                <div className="text-xl font-medium">
                  {workerResourceCounts?.uptime_days.toFixed(1) || '-'}
                </div>
                <div className="text-sm">{$t('week')}</div>
              </div>
            </Card>
          </Col>
          <Col span={3}>
            <div className="flex flex-col justify-between h-[168px]">
              <Card bodyStyle={{ padding: '12px' }} style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
                <div className="text-sm mb-1">{$t('CPU核数')}</div>
                <div className="text-xl font-medium">
                  {workerResourceCounts?.cpu_total || '-'}
                </div>
              </Card>
              <Card bodyStyle={{ padding: '12px' }} style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
                <div className="text-sm mb-1">{$t('内存总量')}</div>
                <div className="text-xl font-medium">
                  {workerResourceCounts ? formatBytes(workerResourceCounts.memory_total) : '-'}
                </div>
              </Card>
            </div>
          </Col>
          <Col span={3}>
            <Card bodyStyle={{ padding: '12px' }} style={{ height: '168px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
              <div className="text-sm">{$t('CPU使用率')}</div>
              <div className="flex items-center justify-center h-[120px]">
                <Progress
                  type="dashboard"
                  percent={Number(workerResourceCounts?.cpu_utilization_rate.toFixed(2)) || 0}
                  size={80}
                />
              </div>
            </Card>
          </Col>
          <Col span={3}>
            <Card bodyStyle={{ padding: '12px' }} style={{ height: '168px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
              <div className="text-sm">{$t('CPU iowait')}</div>
              <div className="flex items-center justify-center h-[120px]">
                <Progress
                  type="dashboard"
                  percent={workerResourceCounts?.cpu_iowait || 0}
                  size={80}
                />
              </div>
            </Card>
          </Col>
          <Col span={3}>
            <Card bodyStyle={{ padding: '12px' }} style={{ height: '168px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
              <div className="text-sm">{$t('内存使用率')}</div>
              <div className="flex items-center justify-center h-[120px]">
                <Progress
                  type="dashboard"
                  percent={Number(workerResourceCounts?.memory_used.toFixed(2)) || 0}
                  size={80}
                />
              </div>
            </Card>
          </Col>
          <Col span={3}>
            <Card bodyStyle={{ padding: '12px' }} style={{ height: '168px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
              <div className="text-sm truncate" title={$t('当前打开文件描述符')}>{$t('当前打开文件描述符')}</div>
              <div className="flex items-center justify-center h-[120px]">
                <Progress
                  type="dashboard"
                  percent={100}
                  format={() => workerResourceCounts ? `${(workerResourceCounts.file_descriptor ?? 0 / 1000).toFixed(2)}K` : '-'}
                  size={80}
                />
              </div>
            </Card>
          </Col>
          <Col span={3}>
            <Card bodyStyle={{ padding: '12px' }} style={{ height: '168px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
              <div className="text-sm">{$t('根分区使用率')}</div>
              <div className="flex items-center justify-center h-[120px]">
                <Progress
                  type="dashboard"
                  percent={Number(workerResourceCounts?.root_directory_utilization_rate.toFixed(2)) || 0}
                  size={80}
                />
              </div>
            </Card>
          </Col>
          <Col span={3}>
            <Card bodyStyle={{ padding: '12px' }} style={{ height: '168px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
              <div className="text-sm truncate" title={$t('最大分区(/data)使用率')}>{$t('最大分区(/data)使用率')}</div>
              <div className="flex items-center justify-center h-[120px]">
                <Progress
                  type="dashboard"
                  percent={Number(workerResourceCounts?.max_directory_utilization_rate.toFixed(2)) || 0}
                  size={80}
                />
              </div>
            </Card>
          </Col>
        </Row>
      </Spin>
      {/* CPU使用率详情 */}
      <Spin spinning={dashboardLoadingMap.cpuageSummary} tip="">
        <Row gutter={[16, 16]} className="mt-4">
          <Col span={24}>
            <Card
              title={$t('CPU使用率详情')}
              bodyStyle={{ padding: '12px' }}
              style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}
            >
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={cpuUsageData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm')}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      labelFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm:ss')}
                      formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name]}
                    />
                    <Line
                      type="monotone"
                      dataKey="CPU使用"
                      stroke="#8884d8"
                      name="CPU使用"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="系统"
                      stroke="#82ca9d"
                      name="系统"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="IO等待"
                      stroke="#ffc658"
                      name="IO等待"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="空闲"
                      stroke="#ff7300"
                      name="空闲"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="text-sm mt-4">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100">
                      <td className="w-[160px] py-2"></td>
                      <td className="w-[60px] text-right font-medium py-2">max</td>
                      <td className="w-[60px] text-right font-medium pl-6 py-2 pr-2">current</td>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="h-8 hover:bg-gray-50 bg-gray-50">
                      <td className="text-[#8884d8] py-2 bg-gray-50 pl-2">CPU使用</td>
                      <td className="text-right bg-gray-50 py-2">27.9%</td>
                      <td className="text-right pl-6 bg-gray-50 py-2 pr-4">
                        {cpuageSummary?.current.cpu_user || 0}
                        %
                      </td>
                    </tr>
                    <tr className="h-8 hover:bg-gray-50">
                      <td className="text-[#82ca9d] py-2 pl-2">系统</td>
                      <td className="text-right py-2">6.8%</td>
                      <td className="text-right pl-6 py-2 pr-4">
                        {cpuageSummary?.current.cpu_system || 0}
                        %
                      </td>
                    </tr>
                    <tr className="h-8 hover:bg-gray-50 bg-gray-50">
                      <td className="text-[#ffc658] py-2 bg-gray-50 pl-2">IO等待</td>
                      <td className="text-right bg-gray-50 py-2">0.0%</td>
                      <td className="text-right pl-6 bg-gray-50 py-2 pr-4">
                        {cpuageSummary?.current.cpu_iowait || 0}
                        %
                      </td>
                    </tr>
                    <tr className="h-8 hover:bg-gray-50">
                      <td className="text-[#ff7300] py-2 pl-2">空闲</td>
                      <td className="text-right py-2">71.0%</td>
                      <td className="text-right pl-6 py-2 pr-4">
                        {cpuageSummary?.current.cpu_idle || 0}
                        %
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </Col>
        </Row>
      </Spin>
      {/* GPU使用率 */}
      <Spin spinning={dashboardLoadingMap.gpuSummary} tip="">
        <Row gutter={[16, 16]} className="mt-4">
          <Col span={24}>
            <Card
              title={$t('显卡使用率')}
              bodyStyle={{ padding: '12px' }}
              style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}
            >
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={gpuData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm')}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      labelFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm:ss')}
                      formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name]}
                    />
                    <Legend
                      content={(props) => (
                        <CustomLegend
                          {...props}
                          onClick={handleGpuLegendClick}
                          disabledItems={disabledGpuLines}
                        />
                      )}
                    />
                    {gpuLines}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="text-sm mt-4">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100">
                      <td className="w-[160px] py-2 pl-2">{$t('显卡')}</td>
                      <td className="w-[60px] text-right font-medium py-2">{$t('当前使用率')}</td>
                    </tr>
                  </thead>
                  <tbody>
                    {gpuSummary?.current.map((gpu: {
                      index: number
                      type: string
                      utilization_rate: number
                    }, index: number) => (
                      <tr key={gpu.index} className={`h-8 hover:bg-gray-50 ${index % 2 === 0 ? 'bg-gray-50' : ''}`}>
                        <td className="py-2 pl-2">{`${gpu.type}${gpu.index}`}</td>
                        <td className="text-right py-2 pr-4">{`${gpu.utilization_rate}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </Col>
        </Row>
      </Spin>
      {/* 显存使用率 */}
      <Spin spinning={dashboardLoadingMap.vramSummary} tip="">
        <Row gutter={[16, 16]} className="mt-4">
          <Col span={24}>
            <Card
              title={$t('显存使用率')}
              bodyStyle={{ padding: '12px' }}
              style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}
            >
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={vramData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm')}
                    />
                    <YAxis dataKey="value" domain={[0, 100]} />
                    <Tooltip
                      labelFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm:ss')}
                      formatter={(value: number, name: string, props: any) => {
                        const info = props.payload[`${name}_info`]
                        if (info) {
                          return [
                            `${value.toFixed(2)}% (已用：${formatBytes(info.used)}, 总量：${formatBytes(info.total)})`,
                            name,
                          ]
                        }
                        return [`${value.toFixed(2)}%`, name]
                      }}
                    />
                    <Legend
                      content={(props) => (
                        <CustomLegend
                          {...props}
                          onClick={handleVramLegendClick}
                          disabledItems={disabledVramLines}
                        />
                      )}
                    />
                    {vramLines}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="text-sm mt-4">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100">
                      <td className="w-[160px] py-2 pl-2">{$t('显存')}</td>
                      <td className="w-[160px] py-2 pl-2">{$t('已用')}</td>
                      <td className="w-[160px] py-2 pl-2">{$t('总量')}</td>
                      <td className="w-[60px] text-right font-medium py-2">{$t('当前使用率')}</td>
                    </tr>
                  </thead>
                  <tbody>
                    {vramSummary?.current.map((vram: VramData, index: number) => (
                      <tr key={vram.index} className={`h-8 hover:bg-gray-50 ${index % 2 === 0 ? 'bg-gray-50' : ''}`}>
                        <td className="py-2 pl-2">{`显存${vram.index}`}</td>
                        <td className="text-left py-2 pr-4">{`${formatBytes(vram.used)}`}</td>
                        <td className="text-left py-2 pr-4">{`${formatBytes(vram.total)}`}</td>
                        <td className="text-right py-2 pr-4">{`${vram.utilization_rate?.toFixed(2) || 0}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </Col>
        </Row>
      </Spin>

      {/* 系统负载、内存信息和分区使用情况并排显示 */}
      <Row gutter={[16, 16]} className="mt-4">
        <Col span={8}>
          <Spin spinning={dashboardLoadingMap.loadavgSummary} tip="">
            <Card
              title={$t('系统平均负载')}
              bodyStyle={{ padding: '12px' }}
              style={{ height: '340px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}
            >
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={loadAvgData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm')}
                    />
                    <YAxis domain={[0, 2]} />
                    <Tooltip
                      labelFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm:ss')}
                    />
                    <Line
                      type="monotone"
                      dataKey="1m"
                      stroke="#8884d8"
                      name="1m平均负载"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="5m"
                      stroke="#82ca9d"
                      name="5m平均负载"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="15m"
                      stroke="#ffc658"
                      name="15m平均负载"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Spin>
        </Col>
        <Col span={8}>
          <Spin spinning={dashboardLoadingMap.memorySummary} tip="">
            <Card
              title={$t('内存信息')}
              bodyStyle={{ padding: '12px' }}
              style={{ height: '340px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}
            >
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer>
                  <LineChart data={memoryData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm')}
                    />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      labelFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm:ss')}
                      formatter={(value: number, name: string) => `${value?.toFixed(2)}%`}
                    />
                    <Line
                      type="monotone"
                      dataKey="已用内存"
                      stroke="#8884d8"
                      name="已用内存"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="text-sm mt-4">
                <table className="w-full">
                  <tbody>
                    <tr className="h-8 hover:bg-gray-50">
                      <td className="py-2 pl-2">{$t('内存总量')}</td>
                      <td className="text-right py-2 pr-4">
                        {formatGiB(workerResourceCounts?.memory_total || 0)}
                      </td>
                    </tr>
                    <tr className="h-8 hover:bg-gray-50 bg-gray-50">
                      <td className="py-2 pl-2">{$t('当前已用')}</td>
                      <td className="text-right py-2 pr-4">
                        {`${workerResourceCounts?.memory_used?.toFixed(2)}%` || '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </Spin>
        </Col>
        <Col span={8}>
          <Spin spinning={dashboardLoadingMap.disksSummary} tip="">
            <Card
              title={$t('各分区可使用空间')}
              bodyStyle={{ padding: '12px' }}
              style={{ height: '340px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}
            >
              <Table
                columns={diskSpaceColumns}
                dataSource={diskSpaceData}
                pagination={false}
                size="small"
                style={{ height: 240 }}
                scroll={{ y: 220 }}
              />
            </Card>
          </Spin>
        </Col>
      </Row>

      {/* 磁盘性能监控 */}
      <Row gutter={[16, 16]} className="mt-4">
        <Col span={8}>
          <Spin spinning={dashboardLoadingMap.disksSummary} tip="">
            <Card
              title={$t('磁盘读写速率')}
              bodyStyle={{ padding: '12px' }}
              style={{ height: '100%', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}
            >
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={diskIopsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm')}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm:ss')}
                      formatter={(value: number, name: string) => {
                        const [diskName, type] = name.split('_')
                        return [`${value.toFixed(2)} 次/秒`, `${diskName} ${type === 'read' ? '读' : '写'}`]
                      }}
                    />
                    {disksSummary?.current.map((disk) => (
                      <React.Fragment key={disk.name}>
                        <Line
                          type="monotone"
                          dataKey={`${disk.name}_read`}
                          name={`${disk.name}_read`}
                          stroke={getDiskColor(disk.name, true)}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey={`${disk.name}_write`}
                          name={`${disk.name}_write`}
                          stroke={getDiskColor(disk.name, false)}
                          dot={false}
                        />
                      </React.Fragment>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Spin>
        </Col>
        <Col span={8}>
          <Spin spinning={dashboardLoadingMap.disksSummary} tip="">
            <Card
              title={$t('磁盘读写容量')}
              bodyStyle={{ padding: '12px' }}
              style={{ height: '100%', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}
            >
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={diskBytesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm')}
                    />
                    <YAxis width={60} dx={4} />
                    <Tooltip
                      labelFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm:ss')}
                      formatter={(value: number, name: string) => {
                        const [diskName, type] = name.split('_')
                        return [formatBytes(value), `${diskName} ${type === 'read' ? '读' : '写'}`]
                      }}
                    />
                    {disksSummary?.current.map((disk) => (
                      <React.Fragment key={disk.name}>
                        <Line
                          type="monotone"
                          dataKey={`${disk.name}_read`}
                          name={`${disk.name}_read`}
                          stroke={getDiskColor(disk.name, true)}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey={`${disk.name}_write`}
                          name={`${disk.name}_write`}
                          stroke={getDiskColor(disk.name, false)}
                          dot={false}
                        />
                      </React.Fragment>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Spin>
        </Col>
        <Col span={8}>
          <Spin spinning={dashboardLoadingMap.disksSummary} tip="">
            <Card
              title={$t('磁盘IO读写时间')}
              bodyStyle={{ padding: '12px' }}
              style={{ height: '100%', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}
            >
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={diskTimeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm')}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm:ss')}
                      formatter={(value: number, name: string) => {
                        const [diskName, type] = name.split('_')
                        return [formatTime(value), `${diskName} ${type === 'read' ? '读' : '写'}`]
                      }}
                    />
                    {disksSummary?.current.map((disk) => (
                      <React.Fragment key={disk.name}>
                        <Line
                          type="monotone"
                          dataKey={`${disk.name}_read`}
                          name={`${disk.name}_read`}
                          stroke={getDiskColor(disk.name, true)}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey={`${disk.name}_write`}
                          name={`${disk.name}_write`}
                          stroke={getDiskColor(disk.name, false)}
                          dot={false}
                        />
                      </React.Fragment>
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Spin>
        </Col>
      </Row>

      {/* TCP连接情况和网络流量图表 */}
      <Row gutter={[16, 16]} className="mt-4">
        <Col span={12}>
          <Spin spinning={dashboardLoadingMap.tcpSummary} tip="">
            <Card title={$t('TCP连接情况')} bodyStyle={{ padding: '12px' }} style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
              <div className="flex">
                <div style={{ width: '70%', height: 300 }}>
                  <ResponsiveContainer>
                    <LineChart data={tcpData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm')}
                      />
                      <YAxis />
                      <Tooltip
                        labelFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm:ss')}
                      />
                      <Line
                        type="monotone"
                        dataKey="ESTABLISHED"
                        stroke="#8884d8"
                        name="ESTABLISHED"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="TCP_tw"
                        stroke="#82ca9d"
                        name="TCP_tw"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="ActiveOpens"
                        stroke="#ffc658"
                        name="ActiveOpens"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="PassiveOpens"
                        stroke="#ff7300"
                        name="PassiveOpens"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="TCP_alloc"
                        stroke="#0088fe"
                        name="TCP_alloc"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="TCP_inuse"
                        stroke="#00c49f"
                        name="TCP_inuse"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 pl-4 text-sm">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-100">
                        <td className="w-[160px] py-2"></td>
                        {/* <td className="w-[60px] text-right font-medium py-2">max</td> */}
                        <td className="w-[60px] text-right font-medium pl-6 py-2 pr-2">current</td>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="h-8 hover:bg-gray-50 bg-gray-50">
                        <td className="text-[#8884d8] py-2 bg-gray-50 pl-2">ESTABLISHED</td>
                        {/* <td className="text-right bg-gray-50 py-2">1013</td> */}
                        <td className="text-right pl-6 bg-gray-50 py-2 pr-4">{tcpSummary?.current.ESTABLISHED || 0}</td>
                      </tr>
                      <tr className="h-8 hover:bg-gray-50">
                        <td className="text-[#82ca9d] py-2 pl-2">TCP_tw</td>
                        {/* <td className="text-right py-2">382</td> */}
                        <td className="text-right pl-6 py-2 pr-4">{tcpSummary?.current.TCP_tw || 0}</td>
                      </tr>
                      <tr className="h-8 hover:bg-gray-50 bg-gray-50">
                        <td className="text-[#ffc658] py-2 bg-gray-50 pl-2">ActiveOpens</td>
                        {/* <td className="text-right bg-gray-50 py-2">12</td> */}
                        <td className="text-right pl-6 bg-gray-50 py-2 pr-4">{tcpSummary?.current.ActiveOpens || 0}</td>
                      </tr>
                      <tr className="h-8 hover:bg-gray-50">
                        <td className="text-[#ff7300] py-2 pl-2">PassiveOpens</td>
                        {/* <td className="text-right py-2">5</td> */}
                        <td className="text-right pl-6 py-2 pr-4">{tcpSummary?.current.PassiveOpens || 0}</td>
                      </tr>
                      <tr className="h-8 hover:bg-gray-50 bg-gray-50">
                        <td className="text-[#0088fe] py-2 bg-gray-50 pl-2">TCP_alloc</td>
                        {/* <td className="text-right bg-gray-50 py-2">1106</td> */}
                        <td className="text-right pl-6 bg-gray-50 py-2 pr-4">{tcpSummary?.current.TCP_alloc || 0}</td>
                      </tr>
                      <tr className="h-8 hover:bg-gray-50">
                        <td className="text-[#00c49f] py-2 pl-2">TCP_inuse</td>
                        {/* <td className="text-right py-2">242</td> */}
                        <td className="text-right pl-6 py-2 pr-4">{tcpSummary?.current.TCP_inuse || 0}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </Spin>
        </Col>
        <Col span={12}>
          <Spin spinning={dashboardLoadingMap.networkSummary} tip="">
            <Card title={$t('网络流量')} bodyStyle={{ padding: '12px' }} style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)' }}>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart
                    data={networkData}
                    margin={{
                      top: 10,
                      right: 30,
                      left: 0,
                      bottom: 0,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm')}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => dayjs(Number(value) * 1000).format('HH:mm:ss')}
                      formatter={(value: number, name: string) => [`${value} Mbps`, name]}
                    />
                    <Line
                      type="monotone"
                      dataKey="in下载"
                      name="in下载"
                      stroke="#8884d8"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="out上传"
                      name="out上传"
                      stroke="#82ca9d"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Spin>
        </Col>
      </Row>

    </div>
  )
}

export default PowerResource
