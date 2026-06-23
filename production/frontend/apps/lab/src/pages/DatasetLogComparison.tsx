import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Card, Collapse, Flex, Select, Space, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, EyeInvisibleOutlined, EyeOutlined, FilterOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import ThinkableContent from '../components/ThinkableContent'
import './DatasetLogComparison.css'

const { Text, Title } = Typography
const { Option } = Select
// Define dataset log interface
interface DatasetLog {
  id: number
  dataset_id: number
  question: string
  output: string
  prompt_messages: any
  llm_config_content: any
  created_at: string
  execution_time_ms: number
}
interface LocationState {
  selectedLogs: DatasetLog[]
  projectId?: string
}
const DatasetLogComparison: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  // Get selected logs from location state or initialize empty array
  const [selectedLogs, setSelectedLogs] = useState<DatasetLog[]>([])
  // State for tracking which logs are visible in each comparison group
  const [visibleLogs, setVisibleLogs] = useState<{
    [key: string]: {
      [key: string]: boolean
    }
  }>({})
  // State for prompt filters
  const [promptFilters, setPromptFilters] = useState<string[]>([])
  // Get selected logs from location state or localStorage
  useEffect(() => {
    // 首先尝试从location.state获取数据
    const state = location.state as LocationState
    if (state?.selectedLogs) {
      setSelectedLogs(state.selectedLogs)
      console.log('Selected logs from state:', state.selectedLogs)
      return
    }
    // 如果location.state没有数据，尝试从localStorage获取
    try {
      const storedData = localStorage.getItem('comparison_logs')
      if (storedData) {
        const parsedData = JSON.parse(storedData)
        if (parsedData.selectedLogs && Array.isArray(parsedData.selectedLogs)) {
          setSelectedLogs(parsedData.selectedLogs)
          console.log('Selected logs from localStorage:', parsedData.selectedLogs)
          // 清除localStorage中的数据，避免后续访问页面时读取旧数据
          localStorage.removeItem('comparison_logs')
        }
      }
    }
    catch (error) {
      console.error('Error parsing localStorage data:', error)
    }
  }, [location])
  // Extract all unique prompt titles from logs
  const promptTitles = useMemo(() => {
    if (!selectedLogs.length)
      return []
    const titles = new Set<string>()
    selectedLogs.forEach((log) => {
      if (log.prompt_messages?.title) {
        titles.add(log.prompt_messages.title)
      }
    })
    return Array.from(titles)
  }, [selectedLogs])
  // Filter logs based on selected prompts
  const filteredLogs = useMemo(() => {
    if (!promptFilters.length)
      return selectedLogs
    return selectedLogs.filter((log) => promptFilters.includes(log.prompt_messages?.title || ''))
  }, [selectedLogs, promptFilters])
  // Group logs by question
  const comparisonGroups = useMemo(() => {
    if (!filteredLogs.length)
      return []
    const groupedByQuestion: {
      [key: string]: DatasetLog[]
    } = {}
    // Group logs by question
    filteredLogs.forEach((log) => {
      const question = log.question
      if (!groupedByQuestion[question]) {
        groupedByQuestion[question] = []
      }
      groupedByQuestion[question].push(log)
    })
    // Convert to array of comparison groups
    // Only include groups with at least 2 logs
    return Object.entries(groupedByQuestion)
      .map(([question, logs]) => ({ question, logs }))
      .filter((group) => group.logs.length >= 2)
  }, [filteredLogs])
  // Initialize visibility state for all logs
  useEffect(() => {
    const newVisibleLogs: {
      [key: string]: {
        [key: string]: boolean
      }
    } = {}
    comparisonGroups.forEach((group) => {
      newVisibleLogs[group.question] = {}
      group.logs.forEach((log) => {
        newVisibleLogs[group.question][log.id] = true
      })
    })
    setVisibleLogs(newVisibleLogs)
  }, [comparisonGroups])
  // Helper function to get model name from a log
  const getModelName = (log: DatasetLog) => {
    return (log.llm_config_content?.name
      || log.llm_config_content?.model
      || 'Unknown Model')
  }
  // Helper function to get prompt title
  const getPromptTitle = (log: DatasetLog) => {
    return log.prompt_messages?.title || t('datasetLog.unknownPrompt')
  }
  // Toggle visibility of a log in a comparison group
  const toggleLogVisibility = (question: string, logId: number) => {
    setVisibleLogs((prev) => ({
      ...prev,
      [question]: {
        ...prev[question],
        [logId]: !prev[question][logId],
      },
    }))
  }
  // Handle prompt filter change
  const handlePromptFilterChange = (values: string[]) => {
    setPromptFilters(values)
  }
  // Update the handleBack function to navigate back to the dataset logs page with the project ID
  const handleBack = () => {
    // 尝试从 location.state 获取 projectId
    const stateProjectId = location.state?.projectId
    // 如果 location.state 中没有，尝试从 localStorage 中获取
    let projectId = stateProjectId
    if (!projectId) {
      try {
        const storedData = localStorage.getItem('comparison_logs')
        if (storedData) {
          const parsedData = JSON.parse(storedData)
          projectId = parsedData.projectId
        }
      }
      catch (error) {
        console.error('Error getting projectId from localStorage:', error)
      }
    }
    navigate(projectId ? `/project/${projectId}/logs` : '/projects')
  }
  // If no logs are selected, show message
  if (!selectedLogs.length) {
    return (
      <div className="dataset-comparison-page">
        <Flex className="mt-[100px]" vertical gap="middle" align="center">
          <Title level={4}>{t('datasetLog.comparison')}</Title>
          <Text>{t('datasetLog.warningSelectAtLeastTwo')}</Text>
          <Button type="primary" onClick={handleBack} icon={<ArrowLeftOutlined />}>
            {t('common.back')}
          </Button>
        </Flex>
      </div>
    )
  }
  // If no comparable groups found, show message
  if (comparisonGroups.length === 0) {
    return (
      <div className="dataset-comparison-page">
        <Flex className="mt-[100px]" vertical gap="middle" align="center">
          <Title level={4}>{t('datasetLog.comparison')}</Title>
          <Text>{t('datasetLog.warningNoCommonQuestions')}</Text>
          <Button type="primary" onClick={handleBack} icon={<ArrowLeftOutlined />}>
            {t('common.back')}
          </Button>
        </Flex>
      </div>
    )
  }
  return (
    <div className="dataset-comparison-page">
      <Flex className="mb-[16px]" justify="space-between" align="center">
        <Button type="primary" onClick={handleBack} icon={<ArrowLeftOutlined />}>
          {t('common.back')}
        </Button>
        <Title level={4} className="m-0">
          {t('datasetLog.comparison')}
        </Title>
        <div className="w-[70px]"></div>
        {' '}
        {/* Placeholder for alignment */}
      </Flex>

      {promptTitles.length > 0 && (
        <Card className="mb-4">
          <Flex align="center" gap="small">
            <FilterOutlined />
            <Text strong>
              {t('datasetLog.filterByPrompt')}
              :
            </Text>
            <Select mode="multiple" placeholder={t('datasetLog.selectPrompts')} className="min-w-[250px] flex-1" value={promptFilters} onChange={handlePromptFilterChange} allowClear>
              {promptTitles.map((title) => (
                <Option key={title} value={title}>
                  {title}
                </Option>
              ))}
            </Select>
          </Flex>
        </Card>
      )}

      <Space direction="vertical" size="large" className="w-full">
        {comparisonGroups.map((group) => (
          <Card
            key={group.question}
            title={(
              <Collapse ghost>
                <Collapse.Panel
                  header={(
                    <>
                      {t('common.question')}
                      {group.question && (
                        <span className="ml-2 text-[var(--lab-color-text-muted)] font-normal">
                          {group.question.length > 100
                            ? `${group.question.slice(0, 100)}...`
                            : group.question}
                        </span>
                      )}
                    </>
                  )}
                  key="1"
                >
                  <div
                    className="font-normal max-h-[200px] overflow-auto p-[0_8px]"
                    style={{
                      whiteSpace: 'break-spaces',
                    }}
                  >
                    {group.question}
                  </div>
                </Collapse.Panel>
              </Collapse>
            )}
            className="w-full"
          >
            <Flex className="mb-[16px]" wrap="wrap" gap="small">
              {group.logs.map((log) => {
                const isVisible = visibleLogs[group.question]?.[log.id]
                return (
                  <Button key={log.id} type={isVisible ? 'primary' : 'default'} icon={isVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />} onClick={() => toggleLogVisibility(group.question, log.id)}>
                    {getModelName(log)}
                  </Button>
                )
              })}
            </Flex>

            <div className="comparison-cards">
              {group.logs.map((log) => {
                if (!visibleLogs[group.question]?.[log.id])
                  return null
                return (
                  <Card
                    key={log.id}
                    className="log-card"
                    title={(
                      <Flex align="center" justify="space-between">
                        <div>
                          <Tag color="blue">
                            {getModelName(log)}
                          </Tag>
                          <Tag color="purple">{getPromptTitle(log)}</Tag>
                        </div>
                        <Space>
                          <Text type="secondary">
                            {t('datasetLog.executionTime')}
                            :
                            {' '}
                            {log.execution_time_ms / 1000}
                            s
                          </Text>
                          <Button type="text" icon={<EyeInvisibleOutlined />} onClick={() => toggleLogVisibility(group.question, log.id)} />
                        </Space>
                      </Flex>
                    )}
                  >
                    <div className="content-wrapper">
                      <div className="markdown-content-wrapper">
                        <ThinkableContent content={log.output || ''} />
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </Card>
        ))}
      </Space>
    </div>
  )
}
export default DatasetLogComparison
