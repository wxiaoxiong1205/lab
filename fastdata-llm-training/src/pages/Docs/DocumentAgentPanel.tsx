import React, { useState } from 'react'
import { Alert, Button, Card, Empty, Input, Space, Spin, Tag, Typography, message } from 'antd'
import { MessageOutlined, SendOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  documentAgentApi,
  type DocumentAgentChatResponse,
  type DocumentAgentServiceRecord,
} from '../../services/documentAgentService'

const { Text, Paragraph } = Typography

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  result?: DocumentAgentChatResponse
}

interface DocumentAgentPanelProps {
  activeService: DocumentAgentServiceRecord | null
  loading?: boolean
}

const DocumentAgentPanel: React.FC<DocumentAgentPanelProps> = ({ activeService, loading: serviceLoading = false }) => {
  const navigate = useNavigate()
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const sendQuestion = async () => {
    const trimmed = question.trim()
    if (!trimmed) {
      message.warning('请输入要查找的文档问题')
      return
    }
    if (!activeService) {
      message.warning('当前没有启动中的文档中心 Agent 服务')
      return
    }

    setLoading(true)
    setQuestion('')
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    }
    setMessages(previous => [...previous, userMessage])

    try {
      const result = await documentAgentApi.chat(trimmed, conversationId)
      setConversationId(result.conversationId)
      setMessages(previous => [
        ...previous,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.answer,
          result,
        },
      ])
    } catch {
      message.error('Agent 助手暂时不可用，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const jumpToCitation = (routePath: string, anchor?: string) => {
    navigate(`${routePath}${anchor ? `#${anchor}` : ''}`)
  }

  return (
    <aside
      style={{
        width: 380,
        flexShrink: 0,
        borderLeft: '1px solid #e2e8f0',
        background: '#f8fafc',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid #e2e8f0' }}>
        <Space align="start" size={10}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <MessageOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a' }}>Agent助手</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {activeService?.name ?? '文档中心 Agent 服务'}
            </Text>
          </div>
        </Space>
        <div style={{ marginTop: 12 }}>
          <Tag color={activeService ? 'green' : 'default'}>{activeService ? '运行中' : serviceLoading ? '加载中' : '未启动'}</Tag>
          <Tag color={activeService?.indexStatus === 'ready' ? 'blue' : 'orange'}>
            索引{activeService?.indexStatus === 'ready' ? '就绪' : '未就绪'}
          </Tag>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
        {!activeService && !serviceLoading ? (
          <Alert
            type="warning"
            showIcon
            message="Agent 服务未启动"
            description="请在系统管理 - 系统配置 - Agent助手中保存并启动文档中心 Agent 服务。"
          />
        ) : serviceLoading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Spin size="small" /> <Text type="secondary">正在加载 Agent 服务...</Text>
          </div>
        ) : messages.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="通过对话查找平台文档，回答会附带文档定位"
          />
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {messages.map(item => (
              <Card
                key={item.id}
                size="small"
                style={{
                  borderRadius: 12,
                  border: item.role === 'user' ? '1px solid #bfdbfe' : '1px solid #e5e7eb',
                  background: item.role === 'user' ? '#eff6ff' : '#fff',
                }}
              >
                <Paragraph style={{ marginBottom: item.result?.citations?.length ? 12 : 0, whiteSpace: 'pre-wrap' }}>
                  {item.content}
                </Paragraph>
                {item.result?.citations?.length ? (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    {item.result.citations.map(citation => (
                      <button
                        key={`${citation.docId}-${citation.sectionTitle}`}
                        type="button"
                        onClick={() => jumpToCitation(citation.routePath, citation.anchor)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: '1px solid #dbeafe',
                          background: '#f8fbff',
                          borderRadius: 10,
                          padding: '10px 12px',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ color: '#1d4ed8', fontWeight: 700, marginBottom: 4 }}>
                          {citation.title} / {citation.sectionTitle}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>{citation.snippet}</div>
                      </button>
                    ))}
                  </Space>
                ) : null}
              </Card>
            ))}
          </Space>
        )}
        {loading && (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <Spin size="small" /> <Text type="secondary">正在检索文档...</Text>
          </div>
        )}
      </div>

      <div style={{ padding: 16, borderTop: '1px solid #e2e8f0', background: '#fff' }}>
        <Input.TextArea
          rows={3}
          value={question}
          onChange={event => setQuestion(event.target.value)}
          onPressEnter={event => {
            if (!event.shiftKey) {
              event.preventDefault()
              void sendQuestion()
            }
          }}
          placeholder="输入问题，例如：如何创建训练任务？"
          disabled={!activeService || serviceLoading}
          style={{ borderRadius: 10, resize: 'none' }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={loading}
          disabled={!activeService || serviceLoading}
          onClick={sendQuestion}
          style={{ marginTop: 10, width: '100%' }}
        >
          发送
        </Button>
      </div>
    </aside>
  )
}

export default DocumentAgentPanel
