import { Popover, Tag } from 'antd'
import { useEffect, useRef, useState } from 'react'

// 动态的标签组件，超出长度部分省略，使用popover显示所有标签
export default function DynamicTags({ data }: { data: string[] }) {
  /** 所有标签页标记 */
  const containerRef = useRef<HTMLDivElement>(null)
  /** 关于主内容排布标记 */
  const measureRef = useRef<HTMLDivElement>(null)
  // 可见的模型
  const [visibleData, setVisibleData] = useState(data)
  const visibleCountRef = useRef<number>(data.length)

  // 动态修改标签显示数量
  useEffect(() => {
    const check = () => {
      if (!containerRef.current || !measureRef.current) return

      const containerWidth = containerRef.current.offsetWidth
      const measureTags = measureRef.current.querySelectorAll<HTMLElement>('.ant-tag')
      if (measureTags.length === 0) return

      const ellipsisWidth = 50
      let totalWidth = 0
      let count = 0

      for (let i = 0; i < measureTags.length; i++) {
        const tagWidth = measureTags[i].offsetWidth + 8
        if (totalWidth + tagWidth + ellipsisWidth <= containerWidth) {
          totalWidth += tagWidth
          count++
        }
        else {
          break
        }
      }

      const visibleCount = count < data.length ? count : data.length
      if (visibleCount !== visibleCountRef.current) {
        visibleCountRef.current = visibleCount
        setVisibleData(data.slice(0, visibleCount))
      }
    }

    const observer = new ResizeObserver(check)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div
        ref={measureRef}
        className="absolute invisible"
        style={{ left: '-9999px' }}
      >
        {data?.map((item: string) => (
          <Tag key={item}>{item}</Tag>
        ))}
      </div>
      <div ref={containerRef} className="flex items-center overflow-hidden">
        {visibleData?.map((item: string) => (
          <Tag key={item}>{item}</Tag>
        ))}
        {visibleData.length < data.length && (
          <Popover
            content={(
              <div className="flex flex-wrap" style={{ maxWidth: '300px' }}>
                {data.map((item: string) => (
                  <Tag key={item} className="!mb-2">{item}</Tag>
                ))}
              </div>
            )}
            title={null}
          >
            <div className="cursor-pointer">...</div>
          </Popover>
        )}
      </div>
    </>
  )
};
