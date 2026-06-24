import React, { useEffect, useRef, useState } from 'react'
import './ExpandableCell.css'

interface ExpandableCellProps {
  text: string
  content?: React.ReactNode
  rowKey: string
  columnKey: string
  bgColor: string
  borderColor: string
  isExpanded: boolean
  onToggle: (rowKey: string, columnKey: string) => void
  onHeightChange?: (rowKey: string, columnKey: string, height: number) => void
  synchronizedHeight?: number // 同步的高度（同一行中最高单元格的高度）
}
const ExpandableCell: React.FC<ExpandableCellProps> = ({ text, rowKey, content, columnKey, bgColor, borderColor, isExpanded, onToggle, onHeightChange, synchronizedHeight }) => {
  // 安全地将 text 转换为字符串
  const textString = React.useMemo(() => {
    if (text === null || text === undefined)
      return ''
    if (typeof text === 'string')
      return text
    // 如果是对象或数组，尝试转换为 JSON 字符串
    if (typeof text === 'object') {
      try {
        return JSON.stringify(text)
      }
      catch {
        return String(text)
      }
    }
    return String(text)
  }, [text])
  const hasContent = textString && textString.trim().length > 0
  const displayText = hasContent ? textString : '无'
  const contentRef = useRef<HTMLDivElement>(null)
  const [needsExpandButton, setNeedsExpandButton] = useState(false)
  // 监听高度变化并通知父组件（仅在展开时）
  useEffect(() => {
    if (!contentRef.current || !onHeightChange || !isExpanded)
      return
    let rafId: number | null = null
    const updateHeight = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
      rafId = requestAnimationFrame(() => {
        const height = contentRef.current?.offsetHeight || 0
        // 只有当高度大于100px时才更新（避免收起时的100px高度）
        if (height > 100) {
          onHeightChange(rowKey, columnKey, height)
        }
        rafId = null
      })
    }
    // 初始高度（延迟执行，确保 DOM 已渲染）
    const timer = setTimeout(() => {
      updateHeight()
    }, 0)
    // 使用 ResizeObserver 监听高度变化
    const resizeObserver = new ResizeObserver(() => {
      updateHeight()
    })
    resizeObserver.observe(contentRef.current)
    return () => {
      clearTimeout(timer)
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
      resizeObserver.disconnect()
    }
  }, [rowKey, columnKey, isExpanded, onHeightChange])
  useEffect(() => {
    if (!hasContent) {
      setNeedsExpandButton(false)
      return
    }
    // 如果已经展开，直接显示按钮（允许收起）
    if (isExpanded) {
      setNeedsExpandButton(true)
      return
    }
    const checkHeight = () => {
      if (!contentRef.current) {
        setNeedsExpandButton(false)
        return
      }
      const cellWidth = contentRef.current.offsetWidth || 300
      const tempDiv = document.createElement('div')
      tempDiv.style.cssText = `
        position: absolute;
        visibility: hidden;
        width: ${cellWidth - 24}px;
        padding: 8px 12px;
        word-break: break-word;
        white-space: pre-wrap;
        font-size: 13px;
        line-height: 1.6;
        top: -9999px;
        left: -9999px;
      `
      tempDiv.innerHTML = text
      document.body.appendChild(tempDiv)
      // 检查是否包含图片
      const images = tempDiv.querySelectorAll('img')
      const hasImages = images.length > 0
      if (hasImages) {
        // 如果有图片，等待所有图片加载完成后再计算高度
        let loadedCount = 0
        const totalImages = images.length
        let cleanup: (() => void) | null = null
        const checkAllLoaded = () => {
          if (loadedCount === totalImages) {
            // 所有图片处理完成，计算高度
            const contentHeight = tempDiv.offsetHeight
            document.body.removeChild(tempDiv)
            setNeedsExpandButton(contentHeight > 100)
            if (cleanup)
              cleanup()
          }
        }
        const onImageLoad = () => {
          loadedCount++
          checkAllLoaded()
        }
        const onImageError = () => {
          loadedCount++
          checkAllLoaded()
        }
        // 为每个图片添加加载监听
        images.forEach((img) => {
          const imgElement = img as HTMLImageElement
          if (imgElement.complete) {
            // 图片已经加载完成
            loadedCount++
          }
          else {
            imgElement.addEventListener('load', onImageLoad)
            imgElement.addEventListener('error', onImageError)
          }
        })
        // 清理函数
        cleanup = () => {
          images.forEach((img) => {
            const imgElement = img as HTMLImageElement
            imgElement.removeEventListener('load', onImageLoad)
            imgElement.removeEventListener('error', onImageError)
          })
        }
        // 如果所有图片都已经加载完成
        checkAllLoaded()
      }
      else {
        // 没有图片，直接计算高度
        const contentHeight = tempDiv.offsetHeight
        document.body.removeChild(tempDiv)
        setNeedsExpandButton(contentHeight > 100)
      }
    }
    // 延迟执行，确保 DOM 已更新
    const timer = setTimeout(checkHeight, 0)
    return () => clearTimeout(timer)
  }, [text, hasContent, isExpanded])
  return (
    <div className="relative w-full">
      <div
        className="expandable-cell-content p-[8px_12px] rounded-[4px] overflow-x-hidden whitespace-pre-wrap text-[13px]"
        ref={contentRef}
        style={{
        // borderLeft: borderColor === "transparent" || borderColor === "#ffffff" ? "none" : `3px solid ${borderColor}`,
          height: isExpanded
            ? (synchronizedHeight ? `${synchronizedHeight}px` : 'auto')
            : '100px',
          maxHeight: isExpanded
            ? (synchronizedHeight ? `${synchronizedHeight}px` : 'none')
            : '100px',
          overflowY: isExpanded ? (synchronizedHeight ? 'auto' : 'visible') : 'auto',
          wordBreak: 'break-word',
          lineHeight: '1.6',
          color: hasContent ? '#333' : '#999',
          paddingRight: needsExpandButton ? '32px' : '12px',
          scrollbarWidth: 'none',
        }}
      >
        {content || <span dangerouslySetInnerHTML={{ __html: displayText }} />}
      </div>
      {/* {hasContent && needsExpandButton && (
          <div
            style={{
              position: "absolute",
              top: "2px",
              right: "15px",
              padding: "2px 4px",
              minWidth: "24px",
              height: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255, 255, 255, 0.8)",
              borderRadius: "4px",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
              zIndex: 10,
              pointerEvents: "none", // 禁用点击，让点击事件冒泡到行
            }}
            title={isExpanded ? "已展开" : "可展开"}
          >
            {isExpanded ? <CompressOutlined /> : <ExpandOutlined />}
          </div>
        )} */}
    </div>
  )
}
export default ExpandableCell
