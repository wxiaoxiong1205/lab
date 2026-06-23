import React, { useEffect, useState } from 'react'
import {
  Tabs,
  Typography,
} from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import AutoEvaluation from './components/AutoEvaluation'
import BenchmarkEvaluation from './components/BenchmarkEvaluation'
import ManualEvaluation from './components/ManualEvaluation'

const { Title, Text } = Typography

const EffectEvaluationPage: React.FC<{ evaluationPrefix?: string }> = ({ evaluationPrefix }) => {
  const { type, projectId } = useParams()
  const navigate = useNavigate()

  // 从 URL 参数读取 type，默认为 "auto"
  const [activeTab, setActiveTab] = useState(type || 'auto')

  // 当 URL 参数变化时，更新 activeTab
  useEffect(() => {
    if (type && ['auto', 'benchmark', 'manual'].includes(type)) {
      setActiveTab(type)
    }
    else if (!type) {
      setActiveTab('auto')
    }
  }, [type])

  // 当 tab 切换时，更新 URL
  const handleTabChange = (key: string) => {
    setActiveTab(key)
    if (projectId) {
      const basePath = evaluationPrefix === 'BUSSINESS' ? 'business-effect-evaluation' : 'effect-evaluation'
      navigate(`/project/${projectId}/${basePath}/${key}`, { replace: true })
    }
  }

  const tabItems = [
    {
      key: 'auto',
      label: '自动评估',
      children: <AutoEvaluation evaluationPrefix={evaluationPrefix} />,
    },
    {
      key: 'benchmark',
      label: '基准评估',
      hidden: evaluationPrefix === 'BUSSINESS',
      children: <BenchmarkEvaluation />,
    },
    {
      key: 'manual',
      label: '人工评估',
      hidden: evaluationPrefix === 'BUSSINESS',
      children: <ManualEvaluation />,
    },
  ]

  return (
    <div className="effect-evaluation-container lab-list-page-shell">
      <div className="mb-4">
        <Title level={4} className="m-0 mb-2">
          {evaluationPrefix === 'BUSSINESS' ? `业务效果评估` : '效果评估'}
        </Title>
        <Text type="secondary">
          对大模型的任务效果进行全方位评价，当前支持文本生成、图像理解模型。
        </Text>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={tabItems.filter((item) => !item.hidden)}
        type="line"
        size="large"
      />
    </div>
  )
}

export default EffectEvaluationPage
