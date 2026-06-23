import React, { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Divider, Image, Modal, Space, Spin, Tag, Tooltip, Typography } from 'antd'
import { BugOutlined, CheckCircleOutlined, ClockCircleOutlined, CodeOutlined, CompressOutlined, CopyOutlined, DownloadOutlined, ExclamationCircleOutlined, ExpandOutlined, EyeOutlined, FileMarkdownOutlined, FileTextOutlined, FullscreenOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactMarkdown from 'react-markdown'
import type { JupyterCell, JupyterCellOutput, JupyterNotebook } from '../../types'
import './JupyterViewer.css'

const { Title, Text } = Typography
interface JupyterViewerProps {
  notebook: JupyterNotebook
  loading?: boolean
  error?: string
  title?: string
  onDownload?: () => void
  onCopy?: () => void
  className?: string
  theme?: 'dark' | 'light'
  showLineNumbers?: boolean
  showExecutionCount?: boolean
  readOnly?: boolean
}
/**
 * Jupyter Notebook 查看器组件
 * 支持渲染代码单元格、markdown单元格和输出内容
 */
const JupyterViewer: React.FC<JupyterViewerProps> = ({ notebook, loading = false, error, title, onDownload, onCopy, className, theme = 'dark', showLineNumbers = true, showExecutionCount = true, readOnly = true }) => {
  const [expandedCells, setExpandedCells] = useState<Set<number>>(new Set())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [codeTheme, setCodeTheme] = useState<'dark' | 'light'>(theme)
  const [imageModal, setImageModal] = useState<{
    visible: boolean
    src: string
    alt: string
  }>({
    visible: false,
    src: '',
    alt: '',
  })
  // 更新主题
  useEffect(() => {
    setCodeTheme(theme)
  }, [theme])
  // 切换单元格展开状态
  const toggleCellExpansion = (index: number) => {
    const newExpanded = new Set(expandedCells)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    }
    else {
      newExpanded.add(index)
    }
    setExpandedCells(newExpanded)
  }
  // 切换全屏模式
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }
  // 复制代码到剪贴板
  const copyCodeToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      // 这里可以添加一个成功提示
    }
    catch (err) {
      console.error('Failed to copy code:', err)
    }
  }
  // 切换主题
  const toggleTheme = () => {
    setCodeTheme(codeTheme === 'dark' ? 'light' : 'dark')
  }
  // 显示图像模态框
  const showImageModal = (src: string, alt: string) => {
    setImageModal({ visible: true, src, alt })
  }
  // 关闭图像模态框
  const closeImageModal = () => {
    setImageModal({ visible: false, src: '', alt: '' })
  }
  // 获取执行状态图标
  const getExecutionStatusIcon = (cell: JupyterCell) => {
    if (cell.execution_count) {
      return <CheckCircleOutlined className="text-[var(--lab-color-success)]" />
    }
    return <ClockCircleOutlined style={{ color: '#faad14' }} />
  }
  // 渲染代码单元格
  const renderCodeCell = (cell: JupyterCell, index: number) => {
    const code = cell.source.join('')
    const isExpanded = expandedCells.has(index)
    const shouldTruncate = code.length > 1000
    const displayCode = shouldTruncate && !isExpanded ? `${code.substring(0, 1000)}...` : code
    return (
      <Card
        key={index}
        className="jupyter-cell code-cell"
        size="small"
        title={(
          <Space>
            <CodeOutlined />
            <Text type="secondary">代码单元格</Text>
            {showExecutionCount && cell.execution_count && (<Badge count={cell.execution_count} className="bg-[var(--lab-color-success)]" title={`执行次数: ${cell.execution_count}`} />)}
            {showExecutionCount && getExecutionStatusIcon(cell)}
          </Space>
        )}
        extra={(
          <Space>
            <Tooltip title="复制代码">
              <Button type="text" icon={<CopyOutlined />} onClick={() => copyCodeToClipboard(code)} size="small" />
            </Tooltip>
            {shouldTruncate && (
              <Button type="text" icon={isExpanded ? <CompressOutlined /> : <ExpandOutlined />} onClick={() => toggleCellExpansion(index)} size="small">
                {isExpanded ? '收起' : '展开'}
              </Button>
            )}
            {!readOnly && (
              <Tooltip title="运行代码">
                <Button type="text" icon={<PlayCircleOutlined />} size="small" onClick={() => { }} />
              </Tooltip>
            )}
          </Space>
        )}
      >
        <div className="code-content">
          <SyntaxHighlighter language="python" style={codeTheme === 'dark' ? oneDark : oneLight} customStyle={{ margin: 0, fontSize: '13px' }} wrapLines showLineNumbers={showLineNumbers} startingLineNumber={1}>
            {displayCode}
          </SyntaxHighlighter>
        </div>

        {cell.outputs && cell.outputs.length > 0 && (
          <div className="cell-outputs">
            <Divider className="my-2" />
            <Text type="secondary" className="text-[12px]">输出:</Text>
            {cell.outputs.map((output, outputIndex) => (
              <div key={outputIndex} className="output-item">
                {renderCellOutput(output)}
              </div>
            ))}
          </div>
        )}
      </Card>
    )
  }
  // 渲染markdown单元格
  const renderMarkdownCell = (cell: JupyterCell, index: number) => {
    const markdownContent = cell.source.join('')
    return (
      <Card
        key={index}
        className="jupyter-cell markdown-cell"
        size="small"
        title={(
          <Space>
            <FileMarkdownOutlined />
            <Text type="secondary">Markdown单元格</Text>
          </Space>
        )}
        extra={(<Button type="text" icon={<CopyOutlined />} onClick={() => copyCodeToClipboard(markdownContent)} size="small" />)}
      >
        <div className="markdown-content">
          <ReactMarkdown>{markdownContent}</ReactMarkdown>
        </div>
      </Card>
    )
  }
  // 渲染原始单元格
  const renderRawCell = (cell: JupyterCell, index: number) => {
    const rawContent = cell.source.join('')
    return (
      <Card
        key={index}
        className="jupyter-cell raw-cell"
        size="small"
        title={(
          <Space>
            <FileTextOutlined />
            <Text type="secondary">原始单元格</Text>
          </Space>
        )}
        extra={(<Button type="text" icon={<CopyOutlined />} onClick={() => copyCodeToClipboard(rawContent)} size="small" />)}
      >
        <pre className="raw-content">{rawContent}</pre>
      </Card>
    )
  }
  // 渲染单元格输出
  const renderCellOutput = (output: JupyterCellOutput) => {
    switch (output.output_type) {
      case 'stream':
        return (
          <div className="stream-output">
            <pre>{output.text?.join('') || ''}</pre>
          </div>
        )
      case 'execute_result':
      case 'display_data':
        if (output.data) {
          // 处理HTML输出
          if (output.data['text/html']) {
            return (
              <div className="html-output">
                <div dangerouslySetInnerHTML={{ __html: output.data['text/html'] as string }} />
              </div>
            )
          }
          // 处理纯文本输出
          if (output.data['text/plain']) {
            return (
              <div className="text-output">
                <pre>{String(output.data['text/plain'])}</pre>
              </div>
            )
          }
          // 处理图像输出
          if (output.data['image/png']) {
            const imageSrc = `data:image/png;base64,${output.data['image/png']}`
            return (
              <div className="image-output">
                <img src={imageSrc} alt="输出图像" className="max-w-full h-auto cursor-pointer" onClick={() => showImageModal(imageSrc, '输出图像')} />
              </div>
            )
          }
        }
        return <div className="unknown-output">未知输出类型</div>
      case 'error':
        return (
          <div className="error-output">
            <Alert
              type="error"
              icon={<ExclamationCircleOutlined />}
              message={output.ename}
              description={(
                <div>
                  <div>{output.evalue}</div>
                  {output.traceback && (
                    <pre className="mt-2 text-[12px]">
                      {output.traceback.join('\n')}
                    </pre>
                  )}
                </div>
              )}
            />
          </div>
        )
      default:
        return <div className="unknown-output">未知输出类型</div>
    }
  }
  // 渲染单元格
  const renderCell = (cell: JupyterCell, index: number) => {
    switch (cell.cell_type) {
      case 'code':
        return renderCodeCell(cell, index)
      case 'markdown':
        return renderMarkdownCell(cell, index)
      case 'raw':
        return renderRawCell(cell, index)
      default:
        return (
          <Card key={index} className="jupyter-cell unknown-cell">
            <div>
              未知单元格类型:
              {cell.cell_type}
            </div>
          </Card>
        )
    }
  }
  if (loading) {
    return (
      <div className={`jupyter-viewer ${className || ''}`}>
        <Spin size="large" />
      </div>
    )
  }
  if (error) {
    return (
      <div className={`jupyter-viewer ${className || ''}`}>
        <Alert type="error" message="加载失败" description={error} />
      </div>
    )
  }
  return (
    <div className={`jupyter-viewer ${isFullscreen ? 'fullscreen' : ''} ${className || ''}`}>
      <div className="viewer-header">
        <div className="header-left">
          {title && <Title level={4}>{title}</Title>}
          <Space>
            {notebook.metadata.kernelspec && (
              <Tag color="green">
                {notebook.metadata.kernelspec.display_name}
              </Tag>
            )}
            <Tag>
              {notebook.cells.length}
              {' '}
              个单元格
            </Tag>
          </Space>
        </div>

        <div className="header-right">
          <Space>
            <Tooltip title="切换主题">
              <Button icon={codeTheme === 'dark' ? <EyeOutlined /> : <BugOutlined />} onClick={toggleTheme} size="small" />
            </Tooltip>
            {onCopy && (
              <Button icon={<CopyOutlined />} onClick={onCopy} size="small">
                复制
              </Button>
            )}
            {onDownload && (
              <Button icon={<DownloadOutlined />} onClick={onDownload} size="small">
                下载
              </Button>
            )}
            <Button icon={isFullscreen ? <CompressOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen} size="small">
              {isFullscreen ? '退出全屏' : '全屏'}
            </Button>
          </Space>
        </div>
      </div>

      <div className="viewer-content">
        <div className="cells-container">
          {notebook.cells.map((cell, index) => renderCell(cell, index))}
        </div>
      </div>

      {/* 图像查看模态框 */}
      <Modal title="图像查看" open={imageModal.visible} onCancel={closeImageModal} footer={null} width="80%" centered>
        <Image className="w-[100%] h-[auto]" src={imageModal.src} alt={imageModal.alt} />
      </Modal>
    </div>
  )
}
export default JupyterViewer
