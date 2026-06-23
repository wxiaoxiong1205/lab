import React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Typography } from 'antd'
import {
  HomeOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import TaskForm from '../components/task/TaskForm'
import { useProjectStore } from '../stores/projectStore'

const { Title } = Typography

const TaskCreatePage = () => {
  const { projectId } = useParams()
  const { currentProject } = useProjectStore()
  const navigate = useNavigate()
  const numericProjectId = projectId
    ? parseInt(projectId, 10)
    : currentProject?.id

  const handleTaskCreated = (task) => {
    // Navigate back to the task list page with project context
    const taskListPath = numericProjectId
      ? `/project/${numericProjectId}/tasks`
      : '/tasks'
    navigate(taskListPath)
  }

  return (
    <div className="p-4">
      <TaskForm projectId={numericProjectId} onSuccess={handleTaskCreated} />
    </div>
  )
}

export default TaskCreatePage
