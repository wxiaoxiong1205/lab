import { Collapse, Image, Typography } from 'antd'
import markdownit from 'markdown-it'
import type { MessageContent } from './types'
import { extractThinkContent } from './chat'

const md = markdownit({ html: true, breaks: true })
/**
 * 带图片的消息内容渲染组件 - 实时版本
 * 移除React.memo以确保每次内容变化都立即重渲染
 */
export const MessageContentWithImages: React.FC<{ content: string | MessageContent[] }> = ({ content }) => {
  // 如果内容是数组（包含图片），需要特殊处理
  if (Array.isArray(content)) {
    // 分离图片和文本内容
    const images = content.filter((item) => item.type === 'image_url' && item.image_url?.url)
    const textItems = content.filter((item) => item.type === 'text' && item.text)

    return (
      <div className="space-y-3">
        {/* 图片网格显示 */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((item, index) => (
              <div key={index}>
                <Image
                  src={item.image_url?.url}
                  alt={`上传的图片 ${index + 1}`}
                  className="!w-16 !h-16 object-cover rounded-lg border-2 border-gray-200 shadow-sm"
                />
              </div>
            ))}
          </div>
        )}

        {/* 文本内容 */}
        {textItems.map((item, index) => {
          if (item.type === 'text' && item.text) {
            const { mainContent, thinkContent } = extractThinkContent(item.text)
            return (
              <div key={index}>
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
              </div>
            )
          }
          return null
        })}
      </div>
    )
  }

  // 如果是字符串，使用原有的逻辑
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

MessageContentWithImages.displayName = 'MessageContentWithImages'
