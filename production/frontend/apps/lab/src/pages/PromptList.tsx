import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  Divider,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Row,
  Space,
  Spin,
  Typography,
  Upload,
  message,
} from 'antd'
import {
  ClearOutlined,
  DownOutlined,
  DownloadOutlined,
  FolderOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import type { RcFile } from 'antd/es/upload'
import { useQuery } from '@tanstack/react-query'
import type { UploadProps } from 'antd/es/upload'
import type {
  PromptSearchParams } from '../services/api'
import {
  CreatePromptRequest,
  PromptUpdate,
  promptApi,
} from '../services/api'
import { promptDirectoryApi } from '../services/api'
import { useProjectStore } from '../stores/projectStore'
import useI18n from '../hooks/useI18n'

// Import components
import PromptCard from '../components/prompt/PromptCard'
import PromptCreateModal from '../components/prompt/PromptCreateModal'
import PromptEditModal from '../components/prompt/PromptEditModal'
import PromptDeleteModal from '../components/prompt/PromptDeleteModal'
import type { PromptResponse } from '../types'

const { Title } = Typography
const { Dragger } = Upload

const PromptList: React.FC = () => {
  const { t } = useI18n()
  const { projectId, directoryId } = useParams<{
    projectId: string
    directoryId: string
  }>()
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()

  // 优先使用URL中的projectId，如果没有则使用store中的
  const numericProjectId = projectId
    ? parseInt(projectId, 10)
    : currentProject?.id

  // 获取URL参数中的目录ID，优先使用路由参数
  const numericDirectoryId = directoryId ? parseInt(directoryId, 10) : null

  // 获取当前目录信息（如果指定了目录ID）
  const { data: currentDirectory } = useQuery({
    queryKey: ['promptDirectory', numericProjectId, numericDirectoryId],
    queryFn: () => {
      if (!numericDirectoryId) return null
      return promptDirectoryApi
        .get(numericProjectId, numericDirectoryId)
        .then((response) => {
          console.log('Directory response:', response)
          return response
        })
    },
    enabled: !!numericProjectId && !!numericDirectoryId,
  })

  // 状态管理
  const [prompts, setPrompts] = useState<PromptResponse[]>([])
  const [searchTitle, setSearchTitle] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  // 对话框状态
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [currentPrompt, setCurrentPrompt] = useState<PromptResponse | null>(
    null,
  )

  // 表单状态
  const [form] = Form.useForm()
  const [editForm] = Form.useForm()

  // 在组件内添加导入弹窗相关 state
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importFile, setImportFile] = useState<RcFile | null>(null)

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      setImportFile(file)
      return false
    },
    onRemove: () => {
      setImportFile(null)
    },
    fileList: importFile ? [importFile] : [],
  }

  const handleImportModalOk = async () => {
    if (!importFile) {
      message.error('请先选择文件')
      return
    }
    setImporting(true)
    await handleImportXlsx(importFile)
    setImporting(false)
    setImportModalVisible(false)
    setImportFile(null)
  }

  // 加载提示词列表
  useEffect(() => {
    const fetchPrompts = async () => {
      setLoading(true)

      try {
        const searchParams: PromptSearchParams = {
          project_id: numericProjectId,
          title: searchTitle || undefined,
          sort_by: 'created_at',
          sort_order: 'desc',
          skip: (page - 1) * pageSize,
          limit: pageSize,
          directory_id: numericDirectoryId,
        }

        const data = await promptApi.list(
          numericProjectId,
          numericDirectoryId,
          searchParams,
        )
        setPrompts(data.items)

        setTotal(data.total)
      }
      catch (err) {
        console.error('Error fetching prompts:', err)
        message.error('加载提示词列表失败')
      }
      finally {
        setLoading(false)
      }
    }

    fetchPrompts()
  }, [numericProjectId, searchTitle, page, pageSize, numericDirectoryId])

  // 处理复制提示词
  const handleCopyPrompt = (prompt: PromptResponse) => {
    // 设置表单初始值，但修改标题以表明这是一个副本
    const initialValues = {
      title: `${prompt.title} (Copy)`,
      description: prompt.description || '',
      project_id: prompt.project_id,
      messages: prompt.messages
        ? JSON.parse(JSON.stringify(prompt.messages))
        : [],
      input_variables: prompt.input_variables
        ? [...prompt.input_variables]
        : [],
      directory_id: prompt.directory_id,
    }

    form.resetFields()
    setTimeout(() => {
      form.setFieldsValue(initialValues)
      setCreateModalVisible(true)
      message.success(t('prompt.copySuccess'))
    }, 100)
  }

  // 处理创建提示词
  const handleCreatePrompt = async (values: any) => {
    try {
      await promptApi.create(numericProjectId, numericDirectoryId, values)

      // 重置表单并刷新列表
      form.resetFields()
      setCreateModalVisible(false)
      message.success(t('prompt.createSuccess'))
      setPage(1)
      refreshPromptList()
    }
    catch (err: any) {
      console.error('Error creating prompt:', err)
      message.error(err.message || t('prompt.createError'))
    }
  }

  // 处理更新提示词
  const handleUpdatePrompt = async (values: any) => {
    if (!currentPrompt || !numericProjectId) return

    try {
      await promptApi.update(
        numericProjectId,
        numericDirectoryId,
        currentPrompt.id,
        values,
      )

      editForm.resetFields()
      setEditModalVisible(false)
      message.success(t('prompt.updateSuccess'))
      refreshPromptList()
    }
    catch (err) {
      console.error('Error updating prompt:', err)
      message.error(t('prompt.updateError'))
    }
  }

  // 处理删除提示词
  const handleDeletePrompt = async () => {
    if (!currentPrompt || !numericProjectId) return

    try {
      await promptApi.delete(
        numericProjectId,
        numericDirectoryId,
        currentPrompt.id,
      )
      setDeleteModalVisible(false)
      message.success(t('prompt.deleteSuccess'))
      refreshPromptList()

      // 如果当前页没有数据且不是第一页，则返回上一页
      if (prompts.length === 1 && page > 1) {
        setPage(page - 1)
      }
    }
    catch (err) {
      console.error('Error deleting prompt:', err)
      message.error(t('prompt.deleteError'))
    }
  }

  // 刷新提示词列表
  const refreshPromptList = async () => {
    const searchParams: PromptSearchParams = {
      project_id: numericProjectId,
      title: searchTitle || undefined,
      skip: (page - 1) * pageSize,
      limit: pageSize,
      directory_id: numericDirectoryId,
    }

    const data = await promptApi.list(
      numericProjectId,
      numericDirectoryId,
      searchParams,
    )
    setPrompts(data.items)
  }

  // Handle XLSX import
  const handleImportXlsx = async (file: RcFile) => {
    if (!numericProjectId) {
      message.error('请先选择项目')
      return false
    }

    if (
      file.type
      !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      message.error('只支持.xlsx格式的文件')
      return false
    }

    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      message.error('文件大小不能超过10MB')
      return false
    }

    try {
      const result = await promptApi.importXlsx(
        numericProjectId,
        numericDirectoryId,
        file,
      )

      if (result.imported_count > 0) {
        message.success(
          t('prompt.importSuccess', { count: result.imported_count }),
        )
      }

      if (result.errors.length > 0) {
        Modal.warning({
          title: t('prompt.importWarning'),
          content: (
            <div>
              <p>
                {t('prompt.importResult')}
                ：
              </p>
              <ul>
                <li>
                  {t('prompt.importedCount')}
                  ：
                  {result.imported_count}
                </li>
                <li>
                  {t('prompt.failedCount')}
                  ：
                  {result.failed_count}
                </li>
              </ul>
              <Divider />
              <p>
                {t('prompt.failureDetails')}
                ：
              </p>
              <ul>
                {result.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          ),
          width: 600,
        })
      }

      refreshPromptList()
    }
    catch (err: any) {
      console.error('Error importing prompts:', err)
      message.error(err.message || t('prompt.importError'))
    }
    return false
  }

  // Handle XLSX export
  const handleExportXlsx = async () => {
    if (!numericProjectId) {
      message.error(t('project.selectRequired'))
      return
    }

    try {
      const searchParams: PromptSearchParams = {
        project_id: numericProjectId,
        title: searchTitle || undefined,
        sort_by: 'created_at',
        sort_order: 'desc',
      }

      await promptApi.exportXlsx(
        numericProjectId,
        numericDirectoryId,
        searchParams,
      )
      message.success(t('prompt.exportSuccess'))
    }
    catch (err: any) {
      console.error('Error exporting prompts:', err)
      message.error(err.message || t('prompt.exportError'))
    }
  }

  // Handle XLSX template download
  const handleDownloadXlsxTemplate = async () => {
    try {
      await promptApi.getXlsxTemplate()
      message.success(t('prompt.templateDownloadSuccess'))
    }
    catch (err) {
      console.error('Error downloading template:', err)
      message.error(t('prompt.templateDownloadError'))
    }
  }

  // 导航到目录管理页面
  const navigateToDirectories = () => {
    navigate(`/project/${numericProjectId}/prompts/directories`)
  }

  // 导航回提示词列表页面
  const navigateBackToPrompts = () => {
    navigate(`/project/${numericProjectId}/prompts`)
  }

  return (
    <div className="prompt-list-container">
      <Card
        title={(
          <div
            className="flex items-center justify-between"
          >
            <div>
              {numericDirectoryId ? (
                <Title level={4} className="m-0">
                  {currentDirectory?.name || t('prompt.promptLibrary') || '提示词库'}
                </Title>
              ) : (
                <Title level={4} className="m-0">
                  {t('prompt.promptLibrary') || '提示词库'}
                </Title>
              )}
            </div>
            {!numericDirectoryId && (
              <Button
                type="primary"
                icon={<FolderOutlined />}
                onClick={navigateToDirectories}
              >
                {t('prompt.manageDirectories') || '管理目录'}
              </Button>
            )}
          </div>
        )}
        className="overflow-hidden"
      >
        <div
          className="mb-4 flex justify-between"
        >
          <Input
            placeholder={
              t('prompt.search.titlePlaceholder') || '请输入标题关键词'
            }
            className="w-[200px]"
            value={searchTitle}
            onChange={(e) => setSearchTitle(e.target.value)}
            suffix={
              searchTitle ? (
                <ClearOutlined onClick={() => setSearchTitle('')} />
              ) : (
                <SearchOutlined />
              )
            }
            allowClear
          />
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields()
                form.setFieldsValue({
                  project_id: numericProjectId,
                  directory_id: numericDirectoryId,
                })
                setCreateModalVisible(true)
              }}
            >
              {t('prompt.createPrompt') || '创建提示词'}
            </Button>
            <Dropdown
              menu={{
                items: [
                  {
                    key: '1',
                    icon: <UploadOutlined />,
                    label: t('prompt.importXlsx') || '导入XLSX',
                    onClick: () => setImportModalVisible(true),
                  },
                  {
                    key: '2',
                    icon: <DownloadOutlined />,
                    label: t('prompt.exportXlsx') || '导出XLSX',
                    onClick: handleExportXlsx,
                  },
                ],
              }}
            >
              <Button icon={<DownOutlined />}>
                {t('prompt.moreActions') || '更多操作'}
              </Button>
            </Dropdown>
          </Space>
        </div>

        {/* 提示词卡片网格 */}
        <div className="prompt-card-grid">
          <Row gutter={[16, 16]}>
            {loading ? (
              <Col span={24} className="text-center p-10">
                <Spin size="large" />
              </Col>
            ) : prompts.length > 0 ? (
              prompts.map((prompt) => (
                <Col xs={24} sm={12} md={8} lg={8} xl={8} key={prompt.id}>
                  <PromptCard
                    prompt={prompt}
                    onEdit={(p) => {
                      setCurrentPrompt(p)
                      editForm.resetFields()
                      setTimeout(() => {
                        editForm.setFieldsValue(p)
                        setEditModalVisible(true)
                      }, 100)
                    }}
                    onDelete={(p) => {
                      setCurrentPrompt(p)
                      setDeleteModalVisible(true)
                    }}
                    onCopy={handleCopyPrompt}
                  />
                </Col>
              ))
            ) : (
              <Col span={24} className="text-center p-10">
                <Empty description={t('prompt.noPrompts') || '暂无提示词'} />
              </Col>
            )}
          </Row>
        </div>

        {/* 分页 */}
        {total > 0 && (
          <div className="text-right mt-4">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={(page, pageSize) => {
                setPage(page)
                setPageSize(pageSize)
              }}
              showTotal={(total) => `${t('common.total') || '共'}: ${total}`}
              showSizeChanger
              showQuickJumper
            />
          </div>
        )}

        {/* 创建提示词对话框 */}
        <PromptCreateModal
          visible={createModalVisible}
          form={form}
          onCancel={() => setCreateModalVisible(false)}
          onSubmit={handleCreatePrompt}
        />

        {/* 编辑提示词对话框 */}
        <PromptEditModal
          visible={editModalVisible}
          form={editForm}
          onCancel={() => setEditModalVisible(false)}
          onSubmit={handleUpdatePrompt}
        />

        {/* 删除提示词对话框 */}
        <PromptDeleteModal
          visible={deleteModalVisible}
          onCancel={() => setDeleteModalVisible(false)}
          onConfirm={handleDeletePrompt}
        />

        {/* 导入弹窗 */}
        <Modal
          title="导入提示词"
          open={importModalVisible}
          onCancel={() => {
            setImportModalVisible(false)
            setImportFile(null)
          }}
          onOk={handleImportModalOk}
          confirmLoading={importing}
          okText="导入"
          cancelText="取消"
        >
          <div className="mt-4">
            <Button
              type="link"
              icon={<DownloadOutlined />}
              onClick={handleDownloadXlsxTemplate}
            >
              下载模板
            </Button>
          </div>
          <Dragger
            {...uploadProps}
            accept=".xlsx"
            showUploadList
            multiple={false}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽XLSX文件到此区域上传</p>
            <p className="ant-upload-hint">仅支持 .xlsx 格式，最大10MB</p>
          </Dragger>
        </Modal>
      </Card>
    </div>
  )
}

export default PromptList
