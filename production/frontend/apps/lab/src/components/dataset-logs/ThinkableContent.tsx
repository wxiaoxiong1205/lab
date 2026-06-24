import React, { useMemo, useState } from 'react'
import { Badge, Button } from 'antd'
import { BulbOutlined, DownOutlined, RightOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

interface ThinkableContentProps {
  content: string
}
const ThinkableContent: React.FC<ThinkableContentProps> = ({ content }) => {
  const { t } = useTranslation()
  // Process the content to identify think tags
  const parts = useMemo(() => {
    // Handle the case where content starts with thinking text without opening tag
    if (content.trimStart().startsWith('<think>') || (!content.includes('<think>') && content.includes('</think>'))) {
      const processedContent = content.includes('<think>') ? content : `<think>${content}`
      return processContent(processedContent)
    }
    return processContent(content)
  }, [content])
  // State for tracking which thinking sections are expanded
  const [expandedSections, setExpandedSections] = useState<boolean[]>([])
  // Initialize all sections to collapsed
  React.useEffect(() => {
    const thinkingCount = parts.filter((part) => part.isThinking).length
    setExpandedSections(new Array(thinkingCount).fill(false))
  }, [parts])
  // Process the content to separate thinking and non-thinking parts
  function processContent(text: string) {
    const result = []
    let currentText = text
    let thinkIndex = 0
    // Find all think tags and split the content
    while (currentText.includes('<think>')) {
      const startIndex = currentText.indexOf('<think>')
      if (startIndex > 0) {
        // Add non-thinking content before the tag
        result.push({
          text: currentText.substring(0, startIndex),
          isThinking: false,
        })
      }
      const endIndex = currentText.indexOf('</think>', startIndex)
      if (endIndex === -1) {
        // No closing tag, treat the rest as thinking content
        result.push({
          text: currentText.substring(startIndex + 7),
          isThinking: true,
          index: thinkIndex++,
        })
        currentText = ''
      }
      else {
        // Add thinking content between tags
        result.push({
          text: currentText.substring(startIndex + 7, endIndex),
          isThinking: true,
          index: thinkIndex++,
        })
        currentText = currentText.substring(endIndex + 8)
      }
    }
    // Add any remaining text
    if (currentText) {
      result.push({
        text: currentText,
        isThinking: false,
      })
    }
    return result
  }
  // Toggle all sections expanded/collapsed
  const toggleAllSections = () => {
    const allExpanded = expandedSections.every(Boolean)
    setExpandedSections(expandedSections.map(() => !allExpanded))
  }
  // Toggle a specific section
  const toggleSection = (index: number) => {
    setExpandedSections(expandedSections.map((expanded, i) => i === index ? !expanded : expanded))
  }
  // Count thinking sections
  const thinkingCount = parts.filter((part) => part.isThinking).length
  if (thinkingCount === 0) {
    return <div className="whitespace-pre-wrap break-words">{content}</div>
  }
  return (
    <div>
      {thinkingCount > 0 && (
        <div className="mb-2">
          <Button size="small" onClick={toggleAllSections} icon={<BulbOutlined />}>
            {expandedSections.every(Boolean)
              ? t('datasetLog.hideThinking')
              : t('datasetLog.showThinking')}
          </Button>
          <Badge count={thinkingCount} size="small" className="ml-[5px] bg-[var(--lab-color-success)]" />
        </div>
      )}

      {parts.map((part, i) => {
        if (!part.isThinking) {
          return (
            <div key={i} className="whitespace-pre-wrap break-words">
              {part.text}
            </div>
          )
        }
        const isExpanded = expandedSections[part.index as number]
        return (
          <div key={i}>
            <div
              className="cursor-pointer p-[4px_8px] rounded-[4px] flex items-center"
              onClick={() => toggleSection(part.index as number)}
              style={{
                backgroundColor: '#f5f5f5',
                marginBottom: isExpanded ? 0 : 8,
              }}
            >
              {isExpanded ? <DownOutlined /> : <RightOutlined />}
              <span className="ml-2">
                {isExpanded ? t('datasetLog.hideThinking') : t('datasetLog.showThinking')}
              </span>
            </div>

            {isExpanded && (
              <div
                className="p-[8px_16px] ml-[16px] mb-[8px] whitespace-pre-wrap"
                style={{
                  borderLeft: '2px solid #f0f0f0',
                  backgroundColor: '#fafafa',
                  wordBreak: 'break-word',
                }}
              >
                {part.text}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
export default ThinkableContent
