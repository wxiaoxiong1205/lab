import React from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../stores/projectStore'
import ProjectMemberManagerComponent from '../components/ProjectMemberManagerComponent'

const ProjectMemberManagement: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const { currentProject } = useProjectStore()

  const numericProjectId = projectId ? parseInt(projectId, 10) : currentProject?.id

  return (
    <ProjectMemberManagerComponent
      isAdminMode={false}
      projectId={numericProjectId}
      currentProject={currentProject}
    />
  )
}

export default ProjectMemberManagement
