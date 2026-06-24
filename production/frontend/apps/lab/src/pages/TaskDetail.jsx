import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Tabs, Typography } from 'antd'
import {
  BugOutlined,
  FileOutlined,
  HomeOutlined,
  InfoCircleOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import TaskDetailComponent from '../components/task/TaskDetail'
import { useProjectStore } from '../stores/projectStore'

const { Title } = Typography
const { TabPane } = Tabs

const TaskDetailPage = () => {
  const { taskId, projectId } = useParams()
  const { currentProject } = useProjectStore()
  const [activeTab, setActiveTab] = useState('details')

  // Use projectId from URL or fall back to current project
  const numericProjectId = projectId
    ? parseInt(projectId, 10)
    : currentProject
      ? currentProject.id
      : null

  return (
    <div className="p-4">
      <TaskDetailComponent
        taskId={parseInt(taskId, 10)}
        projectId={numericProjectId}
      />
    </div>
  )
}

export default TaskDetailPage
