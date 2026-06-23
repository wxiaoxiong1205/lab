import React, { useEffect, useRef, useState } from 'react'
import { Card, theme } from 'antd'

export type SplitCardProps = {
  left: React.ReactNode
  right: React.ReactNode
  initialLeftPercent?: number
  minPercent?: number
}
export const SplitCard: React.FC<SplitCardProps> = ({ left, right, initialLeftPercent = 50, minPercent = 35 }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  // 设置为ref为了避免数据发送变化后重新渲染
  const draggingRef = useRef(false)
  const [leftPercent, setLeftPercent] = useState(initialLeftPercent)
  const rightPercent = 100 - leftPercent
  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])
  const onMouseDown = () => {
    draggingRef.current = true
    // 设置鼠标样式为左右拉伸图标
    document.body.style.cursor = 'col-resize'
    // 禁止鼠标在移动的过程中选中文本
    document.body.style.userSelect = 'none'
  }
  const onMouseMove = (e: MouseEvent) => {
    if (!draggingRef.current || !containerRef.current)
      return
    // 计算鼠标距离组件最左侧的距离
    const rect = containerRef.current.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const percent = (offsetX / rect.width) * 100
    // 判断是否超出边界
    const maxPercent = 100 - minPercent
    if (percent < minPercent || percent > maxPercent)
      return
    // 设置左侧元素宽度
    setLeftPercent(percent)
  }
  const onMouseUp = () => {
    draggingRef.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  return (
    <Card bodyStyle={{ padding: 0 }}>
      <div ref={containerRef} className="flex w-full min-h-50">
        {/* 左侧 */}
        <div
          className="p-[16px] overflow-auto"
          style={{
            width: `${leftPercent}%`,
          }}
        >
          {left}
        </div>

        {/* 分割线 */}
        <div onMouseDown={onMouseDown} className="w-1 cursor-col-resize bg-gray-300 hover:bg-blue-500 transition-colorsd" />

        {/* 右侧 */}
        <div
          className="p-[16px] overflow-auto"
          style={{
            width: `${rightPercent}%`,
          }}
        >
          {right}
        </div>
      </div>
    </Card>
  )
}
