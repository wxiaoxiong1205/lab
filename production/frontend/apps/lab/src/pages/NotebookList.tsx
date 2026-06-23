import { useEffect, useState } from 'react'
import {
  Card, Space,
  Tabs, Typography,
  message,
} from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useProjectStore } from '../stores/projectStore'
import MyNoteBook from './noteBook/MyNoteBook'
import NotebookSquare from './noteBook/NotebookSquare'

const { Title } = Typography

/**
 * Notebook列表页面
 * 包含"我的Notebook"和"精选案例"两个标签页
 */
export default function NotebookList() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const { currentProject } = useProjectStore()

  // 精选案例相关状态
  const { tab } = useParams<{ tab: string }>()
  const [activeTab, setActiveTab] = useState<string>(tab || 'mine')

  const getProjectPath = () => {
    if (projectId) {
      return `/project/${projectId}`
    }
    if (currentProject?.id) {
      return `/project/${currentProject.id}`
    }
    message.error('未找到项目信息，请先选择一个项目')
    navigate('/projects')
    return ''
  }

  // useEffect(() => {
  //   navigate(`${getProjectPath()}/finetune/notebooks/tabs/${activeTab}`)
  // }, [activeTab])

  const tabItems = [
    {
      key: 'mine',
      label: (
        <span>
          我的Notebook
        </span>
      ),
      children: <MyNoteBook />,
    },
    {
      key: 'square',
      label: (
        <span>
          Notebook广场
        </span>
      ),
      children: <NotebookSquare />,
    },
  ]

  return (
    <div className="notebook-list-container lab-list-page-shell">
      <Card
        title={(
          <Space>
            <Title level={4} className="m-0">在线Notebook</Title>
          </Space>
        )}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Card>
    </div>
  )
};
