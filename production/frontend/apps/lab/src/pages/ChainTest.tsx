import { useEffect, useRef, useState } from 'react'
import React from 'react'
import type { InputRef } from 'antd'
import { Alert, Tag as AntTag, Avatar, Button, Card, Divider, Form, Input, Select, Space, Tooltip, Typography, message } from 'antd'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BulbOutlined, ClearOutlined, CopyOutlined, EditOutlined, FolderOutlined, HistoryOutlined, InfoCircleOutlined, RobotOutlined, SendOutlined, SwapOutlined, UserOutlined } from '@ant-design/icons'
import { v4 as uuidv4 } from 'uuid'
import { datasetApi, datasetDirectoryApi, datasetLogApi, llmConfigApi, promptApi, promptDirectoryApi } from '../services/api'
import type { Prompt, PromptUpdate } from '../services/api'
import { useProjectStore } from '../stores/projectStore'
import type { Dataset } from '../types'
import { ThinkableMessage } from '../components/chain-test/ThinkableMessage'
import useI18n from '../hooks/useI18n'
import PromptEditModal from '../components/prompt/PromptEditModal'
import type { PromptFormValues } from '../components/prompt/PromptEditModal'
import type { LLMConfig } from '../types'
import type { DatasetDirectory, DatasetLogResponse } from '../types/dataset'

const { Title, Text } = Typography
const { TextArea } = Input
const { Option } = Select
interface InputVariable {
  name: string
  value: string
}
interface Message {
  type: 'user' | 'assistant'
  content: string
}
interface DatasetFieldMapping {
  promptVariable: string
  datasetField: 'question' | 'ground_truth' | 'context' | 'output'
}
const ChainTest = () => {
  const { t } = useI18n()
  const { projectId } = useParams<{
    projectId: string
  }>()
  const { currentProject } = useProjectStore()
  const queryClient = useQueryClient()
  const [messageApi, contextHolder] = message.useMessage()
  // 优先使用URL中的projectId，如果没有则使用store中的
  const numericProjectId = projectId
    ? parseInt(projectId, 10)
    : currentProject?.id
  const [form] = Form.useForm()
  const [selectedPrompt, setSelectedPrompt] = useState<number | null>(null)
  const [selectedLLMConfig, setSelectedLLMConfig] = useState<number | null>(null)
  const [inputVariables, setInputVariables] = useState<InputVariable[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [currentMessage, setCurrentMessage] = useState<Message | null>(null)
  const [isStreaming, setIsStreaming] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null)
  const [fieldMappings, setFieldMappings] = useState<DatasetFieldMapping[]>([])
  // Add session ID state
  const [sessionId, setSessionId] = useState<string>('')
  // 添加数据集目录选择状态
  const [selectedDirectoryId, setSelectedDirectoryId] = useState<number | null>(null)
  // 添加提示词目录选择状态
  const [selectedPromptDirectoryId, setSelectedPromptDirectoryId] = useState<number | null>(null)
  // Add state for the follow-up question input
  const [followUpQuestion, setFollowUpQuestion] = useState<string>('')
  const followUpInputRef = useRef<InputRef>(null)
  // 添加提示词编辑相关状态
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false)
  const [currentEditPrompt, setCurrentEditPrompt] = useState<Prompt | null>(null)
  const [editForm] = Form.useForm()
  // 添加历史日志相关状态
  const [historyLogs, setHistoryLogs] = useState<DatasetLogResponse[]>([])
  const [selectedLogIds, setSelectedLogIds] = useState<number[]>([])
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false)
  // Generate a session ID when the component mounts
  useEffect(() => {
    setSessionId(uuidv4())
  }, [])
  // Fetch prompts for the current project
  const { data: prompts = [], isLoading: isLoadingPrompts } = useQuery({
    queryKey: ['prompts', numericProjectId, selectedPromptDirectoryId],
    queryFn: () => {
      if (selectedPromptDirectoryId) {
        // 如果选择了目录，则获取该目录下的提示词
        return promptApi
          .list(Number(numericProjectId), Number(selectedPromptDirectoryId), {
            size: 100,
          })
          .then((res) => res.items)
      }
      // 如果没有选择目录，返回空数组
      return []
    },
    enabled: !!numericProjectId,
  })
  // 获取提示词目录列表
  const { data: promptDirectories = [], isLoading: isLoadingPromptDirectories } = useQuery({
    queryKey: ['promptDirectories', numericProjectId],
    queryFn: () => promptDirectoryApi
      .list(numericProjectId, { page: 1, size: 99 })
      .then((res) => res.items),
    enabled: !!numericProjectId,
  })
  // Fetch LLM configs for the current project
  const { data: llmConfigs = [], isLoading: isLoadingLLMConfigs } = useQuery({
    queryKey: ['llmConfigs', numericProjectId],
    queryFn: () => llmConfigApi.list(Number(numericProjectId)).then((res) => res.items),
    enabled: !!numericProjectId,
  })
  // 获取数据集目录列表
  const { data: directories = [], isLoading: isLoadingDirectories } = useQuery({
    queryKey: ['directories', numericProjectId],
    queryFn: () => datasetDirectoryApi
      .list(Number(numericProjectId))
      .then((res) => res.items),
    enabled: !!numericProjectId,
  })
  // 根据选择的目录获取数据集列表
  const { data: datasets = [], isLoading: isLoadingDatasets } = useQuery({
    queryKey: ['datasets', numericProjectId, selectedDirectoryId],
    queryFn: () => {
      // 如果选择了目录，则搜索该目录下的数据集
      if (selectedDirectoryId) {
        return datasetApi
          .list(Number(numericProjectId), Number(selectedDirectoryId), {
            size: 100,
          })
          .then((response) => response.items)
      }
      // 否则返回空数组
      return []
    },
    enabled: !!numericProjectId,
  })
  // Update input variables when prompt changes
  useEffect(() => {
    if (selectedPrompt) {
      const prompt = prompts.find((p) => p.id === selectedPrompt)
      if (prompt?.input_variables) {
        const newInputVariables = prompt.input_variables.map((name) => ({
          name,
          value: '',
        }))
        setInputVariables(newInputVariables)
        // Reset form values for input variables
        const formValues: Record<string, string> = {}
        newInputVariables.forEach((variable) => {
          formValues[variable.name] = ''
        })
        form.setFieldsValue(formValues)
      }
    }
    else {
      setInputVariables([])
    }
  }, [selectedPrompt, prompts, form])
  // Update field mappings when prompt changes
  useEffect(() => {
    if (selectedPrompt) {
      const prompt = prompts.find((p) => p.id === selectedPrompt)
      if (prompt?.input_variables) {
        const newMappings: DatasetFieldMapping[] = prompt.input_variables.map((variable) => ({
          promptVariable: variable,
          datasetField: 'question' as const, // explicitly type as literal
        }))
        setFieldMappings(newMappings)
      }
    }
    else {
      setFieldMappings([])
    }
  }, [selectedPrompt, prompts])
  // Auto-fill input variables when dataset or mapping changes
  useEffect(() => {
    if (selectedDataset && fieldMappings.length > 0) {
      const newInputVariables = fieldMappings.map((mapping) => ({
        name: mapping.promptVariable,
        value: selectedDataset[mapping.datasetField] || '',
      }))
      setInputVariables(newInputVariables)
      // Update form values
      const formValues: Record<string, string> = {}
      newInputVariables.forEach((variable) => {
        formValues[variable.name] = variable.value
      })
      form.setFieldsValue(formValues)
    }
  }, [selectedDataset, fieldMappings, form])
  // Handle prompt selection
  const handlePromptChange = (promptId: number) => {
    setSelectedPrompt(promptId)
  }
  // Handle LLM config selection
  const handleLLMConfigChange = (configId: number) => {
    setSelectedLLMConfig(configId)
  }
  // Handle input variable change
  const handleInputVariableChange = (name: string, value: string) => {
    setInputVariables((prev) => prev.map((variable) => variable.name === name ? { ...variable, value } : variable))
  }
  // Handle dataset selection
  const handleDatasetChange = (datasetId: number) => {
    const dataset = datasets.find((d) => d.id === datasetId)
    setSelectedDataset(dataset || null)
  }
  // Handle field mapping change
  const handleFieldMappingChange = (promptVariable: string, datasetField: DatasetFieldMapping['datasetField']) => {
    setFieldMappings((prev) => prev.map((mapping) => mapping.promptVariable === promptVariable
      ? { ...mapping, datasetField }
      : mapping))
  }
  // 刷新数据集并显示成功消息
  const refreshDatasets = async (datasetId?: number) => {
    if (numericProjectId) {
      // 清除任何错误
      setError(null)
      // 刷新数据集列表
      await queryClient.invalidateQueries({
        queryKey: ['datasets', numericProjectId],
      })
      // 显示成功消息
      if (!datasetId) {
        message.success(t('chainTest.newDatasetSuccess'))
      }
    }
  }
  // 获取历史日志函数
  const fetchHistoryLogs = async () => {
    if (!numericProjectId || !selectedDataset)
      return
    setIsLoadingLogs(true)
    try {
      const response = await datasetLogApi.listByProject(numericProjectId, {
        log_type: 'chat',
        question: inputVariables
          .map((variable) => `${variable.value}`)
          .join('\n'),
        page: 1,
        size: 99,
        sort_by: 'created_at',
        sort_order: 'desc',
      })
      setHistoryLogs(response.items || [])
    }
    catch (err) {
      console.error('Error fetching dataset logs:', err)
      messageApi.error('获取历史日志失败')
    }
    finally {
      setIsLoadingLogs(false)
    }
  }
  const scrollToBottom = () => {
    if (resultRef.current) {
      const scrollElement = resultRef.current
      // Use requestAnimationFrame for better performance
      requestAnimationFrame(() => {
        scrollElement.scrollTop = scrollElement.scrollHeight
        // Add a second scroll after a short delay to handle Chrome rendering issues
        setTimeout(() => {
          scrollElement.scrollTop = scrollElement.scrollHeight
        }, 50)
        // Additional delayed scroll for complex content and different browser timings
        setTimeout(() => {
          scrollElement.scrollTop = scrollElement.scrollHeight
        }, 150)
      })
    }
  }
  // Make sure to scroll to bottom whenever messages or currentMessage changes
  useEffect(() => {
    scrollToBottom()
  }, [messages, currentMessage])
  // Modify runChain to handle both initial and follow-up questions
  const runChain = async (isFollowUp = false) => {
    try {
      let currentSessionId = sessionId
      setError(null)
      setIsStreaming(true)
      setCurrentMessage(null)
      // Prepare input values and create user message
      const inputValues: Record<string, string> = {}
      let userMessage = ''
      if (isFollowUp) {
        // For follow-up questions, use the followUpQuestion as the input
        userMessage = followUpQuestion
        // Find the question variable name from input variables
        const questionVarName = 'follow_up_question'
        inputValues[questionVarName] = followUpQuestion
        // Clear the follow-up question input
        setFollowUpQuestion('')
      }
      else {
        setMessages([])
        currentSessionId = uuidv4()
        setSessionId(currentSessionId)
        // For initial questions, use all input variables
        userMessage = inputVariables
          .map((variable) => `${variable.name}: ${variable.value}`)
          .join('\n')
        inputVariables.forEach((variable) => {
          inputValues[variable.name] = variable.value
        })
      }
      // Add the new user message to existing messages
      setMessages((prevMessages) => [
        ...prevMessages,
        { type: 'user', content: userMessage },
      ])
      // Scroll to bottom after adding user message
      setTimeout(scrollToBottom, 100)
      // Initialize new assistant message
      let currentContent = ''
      setCurrentMessage({ type: 'assistant', content: currentContent })
      // Get auth token
      const token = localStorage.getItem('auth_token')
      const requestBody = {
        prompt_id: selectedPrompt,
        llm_config_id: selectedLLMConfig,
        input_values: inputValues,
        dataset_id: selectedDataset?.id,
        session_id: currentSessionId, // Include the session ID in the request
      }
      // Set a timeout for the request
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout
      try {
        const response = await fetch(`/api/v1/chain_test/by-project/${projectId}/invoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })
        // Clear the timeout since the request completed
        clearTimeout(timeoutId)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        if (!response.body) {
          throw new Error('Response body is null')
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }
          // Decode the chunk
          const chunks = decoder.decode(value, { stream: true })
          if (chunks.startsWith('data: [DONE]')) {
            break
          }
          if (chunks.startsWith('data: [ERROR]')) {
            const errorMessage = chunks
              .substring('data: [ERROR]'.length)
              .trim()
            throw new Error(`Server error: ${errorMessage}`)
          }
          // Process chunks - preserve any <think></think> tags
          const chunkList = chunks
            .split('data: ')
            .filter(Boolean)
            .map((m) => m.replace(/[\r\n][\r\n]$/, ''))
          for (const line of chunkList) {
            // Add the chunk to current content - the <think></think> tags will be preserved
            // and processed by the ThinkableMessage component
            currentContent += line
            // Update the current message with the new content
            setCurrentMessage({ type: 'assistant', content: currentContent })
            // Scroll to bottom with each content update during streaming
            setTimeout(scrollToBottom, 10)
          }
        }
        // When streaming is done, add the final message to the chat history
        setMessages((prev) => [
          ...prev,
          {
            type: 'assistant',
            content: currentContent,
          },
        ])
        setCurrentMessage(null)
        // If the response was part of an existing dataset, refresh the datasets to reflect changes
        if (selectedDataset) {
          // Refresh the datasets to reflect changes
          await refreshDatasets(selectedDataset.id)
        }
        // 发送后刷新历史日志
        await fetchHistoryLogs()
      }
      catch (err) {
        clearTimeout(timeoutId)
        throw err
      }
      setIsStreaming(false)
    }
    catch (err) {
      console.error('Error:', err)
      setIsStreaming(false)
      // Add a more user-friendly error message
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out. Please try again or check your network connection.')
      }
      else {
        setError(`Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  // Add a function to handle follow-up question submission
  const handleFollowUpSubmit = () => {
    if (followUpQuestion.trim() && !isStreaming) {
      runChain(true)
    }
  }
  // Add a function to handle Enter key press in the follow-up input
  const handleFollowUpKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleFollowUpSubmit()
    }
  }
  // Add a function to clear the conversation
  const clearConversation = async () => {
    try {
      setMessages([])
      setCurrentMessage(null)
      setError(null)
      // Call the backend to clear the conversation memory
      const token = localStorage.getItem('auth_token')
      const response = await fetch(`/api/chain-test/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      messageApi.success(t('chainTest.conversationCleared'))
    }
    catch (err) {
      console.error('Error clearing conversation:', err)
      messageApi.error(`${t('chainTest.clearConversationError')}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  // Get the selected prompt details
  const selectedPromptDetails = selectedPrompt
    ? prompts.find((p) => p.id === selectedPrompt)
    : null
    // 处理目录选择变化
  const handleDirectoryChange = (directoryId: number | null) => {
    setSelectedDirectoryId(directoryId)
    // 清除已选择的数据集，因为已经切换了目录
    setSelectedDataset(null)
  }
  // 处理提示词目录选择变化
  const handlePromptDirectoryChange = (directoryId: number | null) => {
    setSelectedPromptDirectoryId(directoryId)
    // 清除已选择的提示词，因为已经切换了目录
    setSelectedPrompt(null)
  }
  // 处理更新提示词
  const handleUpdatePrompt = async (values: PromptFormValues) => {
    if (!currentEditPrompt || !numericProjectId)
      return
    try {
      const submitData: PromptUpdate = {
        title: values.title,
        description: values.description,
        messages: values.messages || [],
        input_variables: values.input_variables || [],
      }
      await promptApi.update(numericProjectId, currentEditPrompt.directory_id, currentEditPrompt.id, submitData)
      // 重置表单并关闭弹窗
      editForm.resetFields()
      setEditModalVisible(false)
      messageApi.success(t('prompt.updateSuccess') || '更新提示词成功')
      // 刷新提示词列表
      queryClient.invalidateQueries({
        queryKey: ['prompts', numericProjectId, selectedPromptDirectoryId],
      })
    }
    catch (err) {
      console.error('Error updating prompt:', err)
      messageApi.error(t('prompt.updateError') || '更新提示词失败')
    }
  }
  // 显示编辑提示词弹窗
  const showEditModal = (prompt: Prompt) => {
    setCurrentEditPrompt(prompt)
    // 设置表单初始值
    const initialValues = {
      title: prompt.title,
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
    editForm.resetFields()
    setTimeout(() => {
      editForm.setFieldsValue(initialValues)
      setEditModalVisible(true)
    }, 100)
  }
  const renderMessage = (message: Message) => {
    const isAssistant = message.type === 'assistant'
    const handleCopy = (e: React.MouseEvent) => {
      e.stopPropagation() // 阻止事件冒泡
      // Extract only the text after the final </think> tag
      let contentToCopy = message.content
      if (isAssistant) {
        // If there's a </think> tag, take only what comes after the last one
        if (contentToCopy.includes('</think>')) {
          const parts = contentToCopy.split('</think>')
          // Get the last part (everything after the final </think>)
          contentToCopy = parts[parts.length - 1].trim()
        }
      }
      // Try to copy the text to clipboard with fallback method
      try {
        // Modern approach using Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(contentToCopy)
            .then(() => {
              messageApi.success(t('chainTest.copySuccess'))
            })
            .catch((err) => {
              console.error('Clipboard API failed:', err)
              fallbackCopyToClipboard(contentToCopy)
            })
        }
        else {
          // Fallback for browsers without Clipboard API support
          fallbackCopyToClipboard(contentToCopy)
        }
      }
      catch (err) {
        messageApi.error(t('chainTest.copyError'))
        console.error('Copy error:', err)
      }
    }
    // Fallback copy method using document.execCommand
    const fallbackCopyToClipboard = (text: string) => {
      try {
        const textArea = document.createElement('textarea')
        textArea.value = text
        // Make the textarea out of viewport
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)
        if (successful) {
          messageApi.success(t('chainTest.copySuccess'))
        }
        else {
          messageApi.error(t('chainTest.copyError'))
        }
      }
      catch (err) {
        messageApi.error(t('chainTest.copyError'))
        console.error('Fallback copy error:', err)
      }
    }
    return (
      <div
        className="flex mb-[20px] items-start w-[100%]"
        style={{
          flexDirection: isAssistant ? 'row' : 'row-reverse',
        }}
      >
        <Avatar
          className="shrink-0"
          icon={isAssistant ? <RobotOutlined /> : <UserOutlined />}
          style={{
            backgroundColor: isAssistant ? '#1890ff' : '#87d068',
            marginRight: isAssistant ? '12px' : '0',
            marginLeft: isAssistant ? '0' : '12px',
          }}
        />
        <div
          className="max-w-[80%] w-[auto] p-[12px_16px] rounded-[12px] font-mono text-[14px] overflow-hidden relative flex flex-col"
          style={{
            backgroundColor: isAssistant ? '#f5f5f5' : '#e6f7ff',
            lineHeight: '1.6',
            wordBreak: 'break-word',
          }}
          onMouseEnter={(e) => {
            const copyBtn = e.currentTarget.querySelector('.copy-button') as HTMLElement
            if (copyBtn)
              copyBtn.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            const copyBtn = e.currentTarget.querySelector('.copy-button') as HTMLElement
            if (copyBtn)
              copyBtn.style.opacity = '0'
          }}
        >
          <Button
            className="copy-button absolute top-[8px] right-[8px] opacity-[0] z-[1]"
            type="text"
            icon={<CopyOutlined />}
            size="small"
            onClick={handleCopy}
            style={{
              transition: 'opacity 0.2s',
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
            }}
          />
          <div
            className="max-w-[100%] w-[100%] box-border"
            style={{
              userSelect: 'text',
            }}
          >
            {isAssistant ? (<ThinkableMessage content={message.content} />) : (
              <div className="whitespace-pre-wrap break-words">
                {message.content}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
  // 处理日志选择变化
  const handleLogSelectionChange = (values: number[]) => {
    setSelectedLogIds(values)
  }
  // 处理日志对比
  const handleCompare = () => {
    if (selectedLogIds.length < 2) {
      messageApi.warning(t('datasetLog.warningSelectAtLeastTwo') || '请至少选择两条日志进行对比')
      return
    }
    const selectedLogsData = historyLogs.filter((log) => selectedLogIds.includes(log.id))
    // 打开新标签页进行对比
    const newWindow = window.open(`/project/${numericProjectId}/logs/comparison`, '_blank')
    // 通过 localStorage 传递数据，因为新窗口无法直接传递状态
    localStorage.setItem('comparison_logs', JSON.stringify({
      selectedLogs: selectedLogsData,
      projectId: numericProjectId,
    }))
    // 确保新窗口已准备好接收数据
    if (newWindow) {
      newWindow.focus()
    }
    else {
      messageApi.error('无法打开新窗口，请检查是否启用了弹窗阻止程序')
    }
  }
  // 格式化时间显示
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }
  return (
    <div className="p-[20px] flex flex-col h-[100%] min-h-[calc(100vh_-_64px)] overflow-hidden">
      {contextHolder}
      <div className="mb-5">
        <div className="flex justify-between items-center">
          <Title level={2}>{t('chainTest.title')}</Title>
          {messages.length > 0 && (
            <AntTag className="mr-[8px]" color="blue">
              <InfoCircleOutlined className="mr-1" />
              {t('chainTest.memoryEnabled')}
            </AntTag>
          )}
        </div>
        <Alert
          message={(
            <Space>
              <BulbOutlined />
              <span>{t('chainTest.thinkTagInfo')}</span>
            </Space>
          )}
          type="info"
          showIcon={false}
          className="mt-3"
        />
      </div>

      <div className="flex flex-row gap-5 flex-1 overflow-hidden">
        {/* Left Side - Configuration Panel */}
        <div className="w-[40%] flex flex-col overflow-y-auto">
          {/* Form Card */}
          <Card className="flex-1">
            <Form form={form} layout="vertical">
              <Space className="w-full" direction="vertical">
                <div className="flex gap-4 flex-col">
                  {/* 添加提示词目录选择 */}
                  <Form.Item
                    label={(
                      <Space>
                        <FolderOutlined />
                        选择提示词目录
                        <Tooltip title="先选择提示词目录，再选择该目录下的提示词">
                          <InfoCircleOutlined />
                        </Tooltip>
                      </Space>
                    )}
                    required
                  >
                    <Select placeholder="选择提示词目录" loading={isLoadingPromptDirectories} onChange={handlePromptDirectoryChange} className="w-full" value={selectedPromptDirectoryId}>
                      {promptDirectories.map((directory) => (
                        <Option key={directory.id} value={directory.id}>
                          {directory.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item label={t('chainTest.selectPrompt')} required>
                    <Select
                      placeholder={selectedPromptDirectoryId
                        ? t('chainTest.selectPromptPlaceholder')
                        : t('chainTest.selectDirectoryTooltip')
                          || '先选择提示词目录，再选择该目录下的提示词'}
                      loading={isLoadingPrompts}
                      onChange={handlePromptChange}
                      className="w-full"
                      disabled={!selectedPromptDirectoryId}
                      value={selectedPrompt}
                      dropdownRender={(menu) => <div>{menu}</div>}
                    >
                      {prompts.map((prompt) => (
                        <Option key={prompt.id} value={prompt.id}>
                          <div className="flex justify-between items-center">
                            <span>{prompt.title}</span>
                            <Tooltip title={t('prompt.edit') || '编辑提示词'}>
                              <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={(e) => {
                                  e.stopPropagation() // 阻止事件冒泡，避免触发选择操作
                                  showEditModal(prompt)
                                }}
                              />
                            </Tooltip>
                          </div>
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item label={t('chainTest.selectLLMConfig')} required>
                    <Select placeholder={t('chainTest.selectLLMConfigPlaceholder')} loading={isLoadingLLMConfigs} onChange={handleLLMConfigChange} className="w-full">
                      {llmConfigs.map((config: LLMConfig) => (
                        <Option key={config.id} value={config.id}>
                          {config.name}
                          {' '}
                          (
                          {config.model}
                          )
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </div>

                {selectedPromptDetails && (
                  <div className="bg-[var(--lab-color-surface-page)] p-3 rounded-[6px] mb-4">
                    <Text type="secondary" className="text-[12px]">
                      {t('chainTest.templateFormat')}
                      :
                      {' '}
                      {selectedPromptDetails.template_format || 'f-string'}
                      {selectedPromptDetails.input_variables?.length > 0 && (
                        <>
                          {' '}
                          |
                          {' '}
                          {t('chainTest.variables')}
                          :
                          {' '}
                          {selectedPromptDetails.input_variables?.join(', ')}
                        </>
                      )}
                    </Text>
                  </div>
                )}

                {/* 数据集目录选择 */}
                <Form.Item
                  label={(
                    <Space>
                      <FolderOutlined />
                      选择评估数据集目录
                      <Tooltip title="先选择评估数据集目录，再选择该目录下的数据集">
                        <InfoCircleOutlined />
                      </Tooltip>
                    </Space>
                  )}
                  required
                >
                  <Select placeholder="请选择评估数据集目录" loading={isLoadingDirectories} onChange={handleDirectoryChange} className="w-full" value={selectedDirectoryId}>
                    {(Array.isArray(directories)
                      ? directories
                      : directories
                        && typeof directories === 'object'
                        && Array.isArray((directories as unknown as {
                          items?: DatasetDirectory[]
                        }).items)
                        ? (directories as unknown as {
                            items: DatasetDirectory[]
                          }).items
                        : []).map((directory: DatasetDirectory) => (
                      <Option key={directory.id} value={directory.id}>
                        {directory.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                {/* Dataset Selection */}
                <Form.Item
                  label={(
                    <Space>
                      {t('chainTest.selectDataset')}
                      <Tooltip title={t('chainTest.selectDatasetTooltip')}>
                        <InfoCircleOutlined />
                      </Tooltip>
                    </Space>
                  )}
                  required
                >
                  <Select
                    placeholder={selectedDirectoryId
                      ? t('chainTest.selectDatasetFromDirectory')
                      || '请从所选目录中选择数据集'
                      : '先选择评估数据集目录，再选择该目录下的数据集'}
                    loading={isLoadingDatasets}
                    onChange={handleDatasetChange}
                    allowClear
                    className="w-full"
                    value={selectedDataset?.id}
                    disabled={!selectedDirectoryId}
                  >
                    {datasets.map((dataset) => (
                      <Option key={dataset.id} value={dataset.id}>
                        {dataset.question.substring(0, 50)}
                        {dataset.question.length > 50 ? '...' : ''}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                {/* Field Mappings */}
                {selectedPrompt && fieldMappings.length > 0 && (
                  <Card size="small" title={t('chainTest.datasetFieldMappings')}>
                    <Space direction="vertical" className="w-full">
                      {fieldMappings.map((mapping) => (
                        <div key={mapping.promptVariable} className="flex gap-2 items-center">
                          <Text className="w-[150px]">
                            {mapping.promptVariable}
                            :
                          </Text>
                          <Select value={mapping.datasetField} onChange={(value) => handleFieldMappingChange(mapping.promptVariable, value)} className="w-[200px]">
                            <Option key="question" value="question">
                              {t('chainTest.question')}
                            </Option>
                            <Option key="ground_truth" value="ground_truth">
                              {t('chainTest.groundTruth')}
                            </Option>
                            <Option key="context" value="context">
                              {t('chainTest.context')}
                            </Option>
                            <Option key="output" value="output">
                              {t('chainTest.output')}
                            </Option>
                          </Select>
                        </div>
                      ))}
                    </Space>
                  </Card>
                )}

                {/* Input Variables */}
                {inputVariables.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {inputVariables.map((variable) => (
                      <Form.Item key={variable.name} label={variable.name} name={variable.name} required className="mb-2">
                        <TextArea
                          rows={2}
                          placeholder={t('chainTest.enterValueFor', {
                            name: variable.name,
                          })}
                          onChange={(e) => handleInputVariableChange(variable.name, e.target.value)}
                        />
                      </Form.Item>
                    ))}
                  </div>
                )}

                <Form.Item className="mb-0">
                  <Button
                    type="primary"
                    onClick={() => runChain()}
                    loading={isStreaming}
                    disabled={!selectedPrompt
                    || !selectedLLMConfig
                    || inputVariables.some((v) => !v.value)}
                    block
                  >
                    发送
                  </Button>
                </Form.Item>
              </Space>
            </Form>
          </Card>
        </div>

        {/* Right Side - Chat Interface */}
        <div className="w-[60%] h-[calc(100vh_-_160px)]">
          {/* Chat Card */}
          <Card
            className="h-full"
            styles={{
              body: {
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
              },
            }}
          >
            {error && (<Alert message={t('common.error')} description={error} type="error" showIcon className="mb-4" />)}

            {/* 历史日志选择器 */}
            {selectedDataset && historyLogs.length > 0 && (
              <div className="mb-4">
                <Space className="w-full">
                  <Space align="start">
                    <HistoryOutlined />
                    <Text strong>历史日志:</Text>
                  </Space>
                  <Select mode="multiple" className="min-w-[350px] max-w-[500px]" placeholder="选择历史日志以进行对比" onChange={handleLogSelectionChange} value={selectedLogIds} loading={isLoadingLogs} optionLabelProp="label">
                    {historyLogs.map((log) => (
                      <Option key={log.id} value={log.id} label={`#${log.dataset_id} - ${formatDateTime(log.created_at)}`}>
                        <div className="flex justify-between">
                          <span>{formatDateTime(log.created_at)}</span>
                        </div>
                      </Option>
                    ))}
                  </Select>
                  {selectedLogIds.length >= 2 && (
                    <Button type="primary" icon={<SwapOutlined />} onClick={handleCompare}>
                      对比
                    </Button>
                  )}
                </Space>
                <Divider className="my-3" />
              </div>
            )}

            <div className="flex justify-end mb-2">
              {messages.length > 0 && (
                <Button icon={<ClearOutlined />} onClick={clearConversation} disabled={isStreaming}>
                  {t('chainTest.clearConversation')}
                </Button>
              )}
            </div>

            {/* Message Container */}
            <div
              className="overflow-y-auto p-[16px] rounded-[4px]"
              ref={resultRef}
              style={{
                flex: 1,
                border: '1px solid #f0f0f0',
                backgroundColor: '#fafafa',
                marginBottom: messages.length > 0 ? '12px' : '0',
              }}
            >
              {messages.map((message, index) => (<div key={`message-${index}`}>{renderMessage(message)}</div>))}
              {currentMessage && (<div key="current-message">{renderMessage(currentMessage)}</div>)}
              {!messages.length && !currentMessage && (
                <div className="h-full flex items-center justify-center">
                  <Text type="secondary">
                    {t('chainTest.startConversation')}
                  </Text>
                </div>
              )}
            </div>

            {/* Chat Input Area */}
            {messages.length > 0 && (
              <div className="flex items-center gap-[8px] mt-[auto] w-[100%] relative">
                <Input.TextArea
                  className="resize-none rounded-[8px] p-[8px_12px] text-[14px]"
                  ref={followUpInputRef}
                  value={followUpQuestion}
                  onChange={(e) => setFollowUpQuestion(e.target.value)}
                  onKeyDown={handleFollowUpKeyPress}
                  placeholder={t('chainTest.enterFollowUpQuestion')}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  disabled={isStreaming}
                  style={{
                    flex: 1,
                    lineHeight: '1.5',
                  }}
                />
                <Button type="primary" icon={<SendOutlined />} onClick={handleFollowUpSubmit} disabled={!followUpQuestion.trim() || isStreaming} className="shrink-0 rounded-[8px]">
                  {t('chainTest.send')}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 编辑提示词弹窗 */}
      <PromptEditModal visible={editModalVisible} form={editForm} onCancel={() => setEditModalVisible(false)} onSubmit={handleUpdatePrompt} />
    </div>
  )
}
export default ChainTest
