import type { Options } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
// 公式
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus as theme } from 'react-syntax-highlighter/dist/esm/styles/prism'

// 自定义样式
import './index.css'

const preprocessLaTeX = (content: string): string => {
  // Replace block-level LaTeX delimiters \[ \] with $$ $$
  const blockProcessedContent = content.replace(
    /\\\[(.*?)\\\]/g,
    (_, equation) => `$$${equation}$$`,
  )
  // Replace inline LaTeX delimiters \( \) with $ $
  const inlineProcessedContent = blockProcessedContent.replace(
    /\\\((.*?)\\\)/g,
    (_, equation) => `$${equation}$`,
  )
  return inlineProcessedContent
}

const MdPreview: React.FC<{
  content: string
  props?: Options
}> = ({ content, ...props }) => {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        {...props}
        remarkPlugins={[
          [remarkGfm, { singleTilde: false }],
          remarkBreaks,
          remarkMath,
        ]}
        rehypePlugins={[[rehypeKatex as any, { strict: false }]]}
        components={{
          img({ ...props }) {
            return (
              <img
                {...props}
                className="rounded-lg block cursor-pointer max-w-full"
              />
            )
          },
          table({ children }) {
            return (
              <div className="w-fit overflow-auto max-w-full max-h-[410px]">
                <table>{children}</table>
              </div>
            )
          },
          a({ ...props }) {
            return <a {...props} target="_blank"></a>
          },
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            return match ? (
              <SyntaxHighlighter
                style={theme as any}
                language={match[1]}
                PreTag="div"
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code {...props} className={className}>
                {children}
              </code>
            )
          },
        }}
      >
        {preprocessLaTeX(content)}
      </ReactMarkdown>
    </div>
  )
}

export default MdPreview
