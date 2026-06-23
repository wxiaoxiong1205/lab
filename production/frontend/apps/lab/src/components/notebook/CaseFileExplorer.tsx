import React, { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Row, Space, Spin, Tag, Tree } from 'antd'
import {
  CodeOutlined, CopyOutlined, DownloadOutlined,
  FileExcelOutlined, FileImageOutlined, FileMarkdownOutlined,
  FileOutlined, FilePdfOutlined, FileTextOutlined,
  FolderOpenOutlined, FolderOutlined, FullscreenOutlined,
} from '@ant-design/icons'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactMarkdown from 'react-markdown'
import type { JupyterNotebook, NotebookCaseDetail } from '../../types'
import { notebookService } from '../../services/notebookService'
import JupyterViewer from './JupyterViewer'
import './CaseFileExplorer.css'

interface CaseFileExplorerProps {
  caseDetail: NotebookCaseDetail
  selectedFile: string
  onFileSelect: (filePath: string, fileType: string) => void
}

interface FileNode {
  key: string
  title: string
  type: 'file' | 'folder'
  size?: number
  children?: FileNode[]
  icon?: React.ReactNode
}

/**
 * 案例文件浏览器组件
 * 提供文件树浏览和文件内容展示功能
 */
const CaseFileExplorer: React.FC<CaseFileExplorerProps> = ({
  caseDetail,
  selectedFile,
  onFileSelect,
}) => {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [fileContent, setFileContent] = useState<string>('')
  const [fileType, setFileType] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [notebookContent, setNotebookContent] = useState<JupyterNotebook | null>(null)

  // 获取文件图标
  const getFileIcon = (fileName: string, type: string) => {
    if (type === 'folder') {
      return <FolderOutlined />
    }

    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'ipynb':
        return <CodeOutlined className="case-file-icon-ipynb" />
      case 'md':
        return <FileMarkdownOutlined className="case-file-icon-md" />
      case 'py':
        return <CodeOutlined className="case-file-icon-py" />
      case 'js':
      case 'jsx':
        return <CodeOutlined className="case-file-icon-js" />
      case 'ts':
      case 'tsx':
        return <CodeOutlined className="case-file-icon-ts" />
      case 'json':
        return <FileTextOutlined className="case-file-icon-json" />
      case 'csv':
      case 'xlsx':
      case 'xls':
        return <FileExcelOutlined className="case-file-icon-excel" />
      case 'pdf':
        return <FilePdfOutlined className="case-file-icon-pdf" />
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return <FileImageOutlined className="case-file-icon-image" />
      default:
        return <FileOutlined />
    }
  }

  // 生成文件树数据
  const generateFileTreeData = (): FileNode[] => {
    const fileTree: FileNode[] = []

    // 添加主notebook文件
    if (caseDetail.notebook_file) {
      fileTree.push({
        key: caseDetail.notebook_file,
        title: caseDetail.notebook_file.split('/').pop() || 'notebook.ipynb',
        type: 'file',
        icon: getFileIcon(caseDetail.notebook_file, 'file'),
      })
    }

    // 添加README文件
    if (caseDetail.readme_file) {
      fileTree.push({
        key: caseDetail.readme_file,
        title: caseDetail.readme_file.split('/').pop() || 'README.md',
        type: 'file',
        icon: getFileIcon(caseDetail.readme_file, 'file'),
      })
    }

    // 添加数据集文件夹
    if (caseDetail.dataset_files && caseDetail.dataset_files.length > 0) {
      const datasetFolder: FileNode = {
        key: 'dataset',
        title: 'dataset',
        type: 'folder',
        icon: <FolderOutlined />,
        children: caseDetail.dataset_files.map((file) => ({
          key: file,
          title: file.split('/').pop() || file,
          type: 'file' as const,
          icon: getFileIcon(file, 'file'),
        })),
      }
      fileTree.push(datasetFolder)
    }

    // 添加requirements.txt
    fileTree.push({
      key: 'requirements.txt',
      title: 'requirements.txt',
      type: 'file',
      icon: getFileIcon('requirements.txt', 'file'),
    })

    // 添加配置文件
    fileTree.push({
      key: 'config.json',
      title: 'config.json',
      type: 'file',
      icon: getFileIcon('config.json', 'file'),
    })

    return fileTree
  }

  // 获取文件内容
  const fetchFileContent = async (filePath: string) => {
    setLoading(true)
    try {
      const response = await notebookService.getCaseFileContent(caseDetail.id, filePath)

      if (filePath.endsWith('.ipynb')) {
        setNotebookContent(response.content)
        setFileType('ipynb')
      }
      else {
        setFileContent(response.content)
        setFileType(getFileTypeFromPath(filePath))
      }
    }
    catch (error) {
      console.error('获取文件内容失败:', error)
      setFileContent('')
      setFileType('text')
    }
    finally {
      setLoading(false)
    }
  }

  // 从文件路径获取文件类型
  const getFileTypeFromPath = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'md':
        return 'markdown'
      case 'py':
        return 'python'
      case 'js':
      case 'jsx':
        return 'javascript'
      case 'ts':
      case 'tsx':
        return 'typescript'
      case 'json':
        return 'json'
      case 'csv':
        return 'csv'
      case 'txt':
        return 'text'
      default:
        return 'text'
    }
  }

  // 树节点选择处理
  const handleTreeSelect = (selectedKeys: React.Key[]) => {
    if (selectedKeys.length > 0) {
      const key = selectedKeys[0] as string
      setSelectedKeys([key])
      onFileSelect(key, getFileTypeFromPath(key))
      fetchFileContent(key)
    }
  }

  // 树节点展开处理
  const handleTreeExpand = (expandedKeys: React.Key[]) => {
    setExpandedKeys(expandedKeys as string[])
  }

  // 渲染文件内容
  const renderFileContent = () => {
    if (loading) {
      return (
        <div className="text-center p-[50px]">
          <Spin size="large" />
        </div>
      )
    }

    if (!selectedFile) {
      return (
        <Alert
          message="请选择一个文件查看内容"
          type="info"
          showIcon
          className="m-5"
        />
      )
    }

    if (fileType === 'ipynb' && notebookContent) {
      return (
        <div className="p-5">
          <JupyterViewer
            notebook={notebookContent}
            title={selectedFile}
            onDownload={() => {}}
            onCopy={() => {}}
          />
        </div>
      )
    }

    if (fileType === 'markdown') {
      return (
        <div className="p-5">
          <ReactMarkdown>{fileContent}</ReactMarkdown>
        </div>
      )
    }

    // 代码文件
    if (['python', 'javascript', 'typescript', 'json'].includes(fileType)) {
      return (
        <div className="p-5">
          <SyntaxHighlighter
            language={fileType}
            style={oneDark}
            customStyle={{
              margin: 0,
              borderRadius: '6px',
            }}
          >
            {fileContent}
          </SyntaxHighlighter>
        </div>
      )
    }

    // 纯文本文件
    return (
      <div className="p-5">
        <pre className="bg-[var(--lab-color-surface-page)] p-4 rounded-[6px] overflow-auto">
          {fileContent}
        </pre>
      </div>
    )
  }

  useEffect(() => {
    if (selectedFile) {
      fetchFileContent(selectedFile)
    }
  }, [selectedFile])

  useEffect(() => {
    // 默认展开根目录
    setExpandedKeys(['dataset'])

    // 默认选择主notebook文件
    if (caseDetail.notebook_file) {
      setSelectedKeys([caseDetail.notebook_file])
      fetchFileContent(caseDetail.notebook_file)
    }
  }, [caseDetail])

  return (
    <div className="case-file-explorer">
      <Row gutter={16} className="min-h-[600px]">
        {/* 左侧文件树 */}
        <Col span={6}>
          <Card
            title="文件"
            size="small"
            className="file-tree-card h-full"
          >
            <Tree
              showIcon
              expandedKeys={expandedKeys}
              selectedKeys={selectedKeys}
              treeData={generateFileTreeData()}
              onSelect={handleTreeSelect}
              onExpand={handleTreeExpand}
              switcherIcon={({ expanded }) =>
                expanded ? <FolderOpenOutlined /> : <FolderOutlined />}
            />
          </Card>
        </Col>

        {/* 右侧文件内容 */}
        <Col span={18}>
          <Card
            title={(
              <Space>
                {selectedFile && getFileIcon(selectedFile, 'file')}
                <span>{selectedFile || '选择文件'}</span>
                {selectedFile && (
                  <Tag color="blue">
                    {getFileTypeFromPath(selectedFile)}
                  </Tag>
                )}
              </Space>
            )}
            size="small"
            className="file-content-card h-full"
            extra={
              selectedFile && (
                <Space>
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    size="small"
                    onClick={() => {
                      navigator.clipboard.writeText(fileContent)
                    }}
                  />
                  <Button
                    type="text"
                    icon={<DownloadOutlined />}
                    size="small"
                    onClick={() => {}}
                  />
                  <Button
                    type="text"
                    icon={<FullscreenOutlined />}
                    size="small"
                    onClick={() => {}}
                  />
                </Space>
              )
            }
          >
            {renderFileContent()}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default CaseFileExplorer
