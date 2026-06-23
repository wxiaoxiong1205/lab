import React, { useMemo, useState } from 'react'
import { Badge, Button, Typography } from 'antd'
import { BulbOutlined, DownOutlined, RightOutlined } from '@ant-design/icons'
import useI18n from '../../hooks/useI18n'

const { Text } = Typography
interface ThinkableMessageProps {
  content: string
}
/**
 * Component to render message content with collapsible <think></think> sections
 */
export const ThinkableMessage: React.FC<ThinkableMessageProps> = ({ content }) => {
  const { t } = useI18n()
  // Process the content to identify think tags - moved to useMemo to avoid re-processing on every render
  const parts = useMemo(() => {
    const parsedParts: Array<{
      type: 'normal' | 'thinking'
      content: string
      isOpen: boolean
    }> = []
    let remainingContent = content
    while (remainingContent.length > 0) {
      const thinkStartIndex = 0
      // if (thinkStartIndex === -1) {
      //   // No more think tags, add remaining content as normal
      //   if (remainingContent.length > 0) {
      //     parsedParts.push({ type: 'normal', content: remainingContent, isOpen: true });
      //   }
      //   break;
      // }
      // Add content before <think> as normal
      if (thinkStartIndex > 0) {
        parsedParts.push({ type: 'normal', content: remainingContent.substring(0, thinkStartIndex), isOpen: true })
      }
      // Find the closing </think> tag
      const thinkEndIndex = remainingContent.indexOf('</think>', thinkStartIndex)
      if (thinkEndIndex === -1) {
        // No closing think tag, treat rest as normal content
        parsedParts.push({ type: 'normal', content: remainingContent.substring(thinkStartIndex), isOpen: true })
        break
      }
      // Extract the thinking content (without the tags)
      const thinkContent = remainingContent.substring(thinkStartIndex + '<think>'.length, thinkEndIndex)
      parsedParts.push({ type: 'thinking', content: thinkContent, isOpen: false })
      // Move to the content after </think>
      remainingContent = remainingContent.substring(thinkEndIndex + '</think>'.length)
    }
    return parsedParts
  }, [content])
  // Count how many thinking sections we have
  const thinkingSectionsCount = useMemo(() => parts.filter((part) => part.type === 'thinking').length, [parts])
  // State to track which thinking sections are expanded
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({})
  // Toggle all thinking sections at once
  const toggleAllSections = () => {
    // Check if all sections are currently expanded
    const allExpanded = Object.values(expandedSections).length === thinkingSectionsCount
      && Object.values(expandedSections).every((value) => value)
    // Create a new state with all sections either expanded or collapsed
    const newExpandedState: Record<number, boolean> = {}
    for (let i = 0; i < thinkingSectionsCount; i++) {
      newExpandedState[i] = !allExpanded
    }
    setExpandedSections(newExpandedState)
  }
  // Toggle a single section
  const toggleSection = (index: number) => {
    setExpandedSections((prev) => ({
      ...prev,
      [index]: !prev[index],
    }))
  }
  // Counter for think sections
  let thinkCount = 0
  // Only show the "Toggle all thinking" button if there are thinking sections
  const hasThinkingSections = thinkingSectionsCount > 0
  return (
    <div
      className="whitespace-pre-wrap max-w-[100%] box-border"
      style={{
        wordBreak: 'break-word',
      }}
    >
      {hasThinkingSections && (
        <div className="mb-3">
          <Button size="small" type="text" icon={<BulbOutlined />} onClick={toggleAllSections} className="inline-flex items-center">
            <Badge count={thinkingSectionsCount} size="small" className="mr-2" />
            <span>{t('chainTest.toggleAllThinking')}</span>
          </Button>
        </div>
      )}

      <div className="max-w-full flex flex-col">
        {parts.map((part, index) => {
          if (part.type === 'normal') {
            return (
              <div
                className="max-w-[100%] overflow-hidden"
                key={index}
                style={{
                  overflowWrap: 'break-word',
                }}
              >
                {part.content}
              </div>
            )
          }
          else {
            // This is a thinking section
            const sectionIndex = thinkCount++
            const isExpanded = expandedSections[sectionIndex] || false
            return (
              <div key={index} className="my-2 max-w-full">
                <div
                  className="flex items-center cursor-pointer p-[4px] rounded-[4px] max-w-[100%]"
                  onClick={() => toggleSection(sectionIndex)}
                  style={{
                    backgroundColor: '#f0f0f0',
                  }}
                >
                  {isExpanded ? <DownOutlined className="mr-2 shrink-0" /> : <RightOutlined className="mr-2 shrink-0" />}
                  <Text type="secondary" className="font-medium shrink-0">
                    {isExpanded ? t('chainTest.hideThinking') : t('chainTest.showThinking')}
                  </Text>
                </div>

                {isExpanded && (
                  <div
                    className="p-[8px_16px] m-[4px_0_4px_20px] text-[0.9em] max-w-[calc(100%_-_23px)] overflow-x-auto whitespace-pre-wrap"
                    style={{
                      backgroundColor: '#f9f9f9',
                      borderLeft: '3px solid #ccc',
                      color: '#666',
                      overflowWrap: 'break-word',
                    }}
                  >
                    {part.content}
                  </div>
                )}
              </div>
            )
          }
        })}
      </div>
    </div>
  )
}
