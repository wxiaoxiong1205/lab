import React, { useState } from 'react'
import { Button, Collapse, Space } from 'antd'
import { BulbOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'
import MdPreview from './md-preview'
import './ThinkableContent.css'

interface ThinkableContentProps {
  content: string
}

const { Panel } = Collapse

const ThinkableContent: React.FC<ThinkableContentProps> = ({ content }) => {
  let displayContent = content
  // State to track which think sections are expanded
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({})

  // Regex to match <think>...</think> tags, being tolerant of potential errors
  const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|<\/thinkd>|$)/g

  // 补数据 <think> 标签
  if (
    /<\/think(d)?>/.exec(content) && !content.includes('<think>')
  ) {
    displayContent = `<think>\n${displayContent}`
  }

  // If no think tags are found, just render the content as is
  if (!displayContent.match(thinkRegex)) {
    return <MdPreview content={displayContent} />
  }

  // Split the content into think and non-think sections
  const sections: { type: 'text' | 'think', content: string, index?: number }[] = []
  let lastIndex = 0
  let match
  let thinkCount = 0

  while ((match = thinkRegex.exec(displayContent)) !== null) {
    // Add the text before the think tag
    if (match.index > lastIndex) {
      sections.push({
        type: 'text',
        content: displayContent.substring(lastIndex, match.index),
      })
    }

    // Increment think section counter
    thinkCount++

    // Add the think tag content
    sections.push({
      type: 'think',
      content: match[1], // The content inside the think tags
      index: thinkCount,
    })

    lastIndex = match.index + match[0].length
  }

  // Add any remaining text after the last think tag
  if (lastIndex < displayContent.length) {
    sections.push({
      type: 'text',
      content: displayContent.substring(lastIndex),
    })
  }

  // Function to toggle a specific think section
  const toggleSection = (index: number) => {
    setExpandedSections((prev) => ({
      ...prev,
      [index]: !prev[index],
    }))
  }

  // Function to expand all think sections
  const expandAllSections = () => {
    const allExpanded: Record<number, boolean> = {}
    sections
      .filter((section) => section.type === 'think')
      .forEach((section) => {
        if (section.index) {
          allExpanded[section.index] = true
        }
      })
    setExpandedSections(allExpanded)
  }

  // Function to collapse all think sections
  const collapseAllSections = () => {
    setExpandedSections({})
  }

  // Count think sections
  const thinkSectionsCount = sections.filter((section) => section.type === 'think').length

  return (
    <div className="thinkable-content">
      {thinkSectionsCount > 1 && (
        <div className="think-controls">
          <Space>
            <Button
              type="text"
              size="small"
              icon={<DownOutlined />}
              onClick={expandAllSections}
            >
              展开所有思考过程 (
              {thinkSectionsCount}
              )
            </Button>
            <Button
              type="text"
              size="small"
              icon={<UpOutlined />}
              onClick={collapseAllSections}
            >
              收起所有
            </Button>
          </Space>
        </div>
      )}

      {sections.map((section, idx) => (
        <React.Fragment key={idx}>
          {section.type === 'text' ? (
            <MdPreview content={section.content} />
          ) : (
            <div className="think-section">
              <Collapse
                ghost
                bordered={false}
                className="think-collapse"
                activeKey={expandedSections[section.index as number] ? ['1'] : []}
                onChange={() => section.index && toggleSection(section.index)}
              >
                <Panel
                  header={(
                    <div className="think-header">
                      <BulbOutlined />
                      {' '}
                      思考过程 #
                      {section.index}
                      {' '}
                      （点击展开）
                    </div>
                  )}
                  key="1"
                  className="think-panel"
                >
                  <div className="think-content">
                    <MdPreview content={section.content} />
                  </div>
                </Panel>
              </Collapse>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

export default ThinkableContent
