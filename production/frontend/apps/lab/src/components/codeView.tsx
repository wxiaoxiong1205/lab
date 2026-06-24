import { ArrowsAltOutlined, CopyOutlined, ShrinkOutlined } from '@ant-design/icons'
import { Button, Modal } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useCopy } from '@/hooks/useCopy'
/**
 * 代码块展示组件
 * @param text 代码内容
 * @param language 代码语言
 * @param customStyle 自定义样式
 */
interface CodeViewProps {
  text: string
  language: string
  customStyle?: CSSProperties
  featureControl?: FeatureControl
}
/**
 * 功能控制
 * @param languageShow 是否显示语言
 * @param copy 是否显示复制按钮
 * @param fullScreen 是否显示全屏按钮
 * @param wordCount 是否显示字数
 * @param hideTopToolBar 是否隐藏顶部工具栏
 */
interface FeatureControl {
  languageShow?: boolean
  copy?: boolean
  fullScreen?: boolean
  wordCount?: boolean
  hideTopToolBar?: boolean
}
// 代码块预览
export function CodeView(params: CodeViewProps) {
  const { text, language, customStyle, featureControl } = params
  const codeContainerRef = useRef<HTMLDivElement>(null)
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false)
  const [control, setControl] = useState<FeatureControl>(Object.assign({
    languageShow: true,
    copy: true,
    fullScreen: true,
    wordCount: true,
    hideTopToolBar: featureControl
      ? !featureControl?.copy && !featureControl?.fullScreen && !featureControl?.wordCount && !featureControl?.languageShow
          ? false : featureControl?.hideTopToolBar : false,
  }, featureControl))
  const { copy } = useCopy()
  // 自动滚动到底部
  const scrollToBottom = () => {
    if (codeContainerRef.current) {
      const preElement = codeContainerRef.current.querySelector('pre')
      if (preElement) {
        preElement.scrollTop = preElement.scrollHeight
      }
    }
  }
  // 功能开关
  useEffect(() => {
    scrollToBottom()
  }, [text])
  // 默认样式
  const defaultStyle: CSSProperties = {
    margin: 0,
    padding: '16px',
    paddingTop: !control.hideTopToolBar ? '48px' : '10px',
    fontSize: '14px',
    fontFamily: '"Fira Code", "Courier New", monospace',
    backgroundColor: '#1e1e1e',
    scrollbarColor: 'white transparent',
    overflow: 'auto',
  }
  const mergedStyle = Object.assign(defaultStyle, customStyle)
  // 全屏展示
  const onToggleScreen = () => {
    setIsFullScreen(!isFullScreen)
  }
  // 全屏模式的代码样式
  const fullScreenStyle: CSSProperties = {
    margin: 0,
    padding: '16px',
    paddingTop: '60px',
    fontSize: '14px',
    fontFamily: '"Fira Code", "Courier New", monospace',
    backgroundColor: '#1e1e1e',
    height: 'calc(100vh - 80px)',
    overflow: 'auto',
  }
  // 渲染代码编辑器（复用逻辑）
  const renderCodeEditor = (isFullScreen: boolean) => {
    const style = isFullScreen ? fullScreenStyle : mergedStyle
    // 确保至少显示一行（即使内容为空）
    const displayText = text || ' '
    return (
      <div className="relative h-full bg-[#1e1e1e]">
        <SyntaxHighlighter language={language} style={vscDarkPlus} customStyle={style} showLineNumbers>
          {displayText}
        </SyntaxHighlighter>

        {/* 顶部工具栏 */}
        {!control.hideTopToolBar && (
          <div className="absolute top-0 left-0 right-0 h-10 flex items-center pl-4 pr-4 bg-[#1e1e1e] z-10 border-b border-gray-700">
            {control?.languageShow && <div className="text-gray-400">{params.language}</div>}

            <div className="flex-1 flex justify-end items-center gap-2">
              {control?.wordCount && (
                <div className="text-gray-400 text-sm">
                  {text.length}
                  个字符
                </div>
              )}

              {control?.copy
              && (
                <Button type="text" icon={<CopyOutlined className="!text-gray-400" />} onClick={() => copy(text)} className={isFullScreen ? 'hover:bg-gray-700' : ''}>
                </Button>
              )}

              {control?.fullScreen
              && (
                <Button type="text" icon={isFullScreen ? <ShrinkOutlined className="!text-gray-400" /> : <ArrowsAltOutlined className="!text-gray-400" />} onClick={onToggleScreen} className={isFullScreen ? 'hover:bg-gray-700' : ''}>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }
  return (
    <div>
      <div ref={codeContainerRef}>
        {renderCodeEditor(false)}
      </div>

      {/* 全屏模态框 */}
      <Modal
        className="top-[0] pb-[0] max-w-[100vw]"
        open={isFullScreen}
        onCancel={onToggleScreen}
        footer={null}
        width="100vw"
        styles={{
          body: { padding: 0, height: 'calc(100vh - 80px)' },
          content: { height: '100vh', borderRadius: 0 },
        }}
        closeIcon={null}
      >
        {renderCodeEditor(true)}
      </Modal>
    </div>
  )
}
