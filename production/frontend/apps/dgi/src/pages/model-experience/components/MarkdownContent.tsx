import { Collapse, Typography } from 'antd'
import markdownit from 'markdown-it'
import React from 'react'
import { extractThinkContent } from './chat'

const md = markdownit({ html: true, breaks: true })

/**
 * Markdown 内容渲染组件 - 实时版本
 * 移除React.memo以确保每次内容变化都立即重渲染
 */
export const MarkdownContent: React.FC<{ content: string }> = ({ content }) => {
  const { mainContent, thinkContent } = extractThinkContent(content)

  return (
    <Typography>
      {thinkContent && (
        <Collapse
          defaultActiveKey={['1']}
          className="mt-4"
          bordered={false}
          style={{ backgroundColor: 'transparent' }}
          items={[
            {
              key: '1',
              label: '深度思考',
              styles: {
                body: {
                  backgroundColor: '#e8e8e8',
                  borderLeft: '1px solid #bfbfbf',
                  padding: 0,
                  margin: '4px 12px',
                },
              },
              children: (
                <div
                  className="p-4 rounded"
                  dangerouslySetInnerHTML={{
                    __html: md.render(thinkContent),
                  }}
                />
              ),
            },
          ]}
        />
      )}
      <div dangerouslySetInnerHTML={{ __html: md.render(mainContent) }} />
    </Typography>
  )
}

MarkdownContent.displayName = 'MarkdownContent'
