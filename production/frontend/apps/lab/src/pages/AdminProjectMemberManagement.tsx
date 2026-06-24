import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { projectApi } from '../services/api'
import type { Project } from '../types'
import ProjectMemberManagerComponent from '../components/ProjectMemberManagerComponent'

const AdminProjectMemberManagement: React.FC = () => {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const urlProjectId = searchParams.get('projectId')
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(
    urlProjectId ? Number(urlProjectId) : undefined,
  )

  const { data: projects = [], isLoading: projectsLoading, refetch: refetchProjects } = useQuery({
    queryKey: ['admin-projects'],
    queryFn: () => projectApi.list({ page: 1, size: 50 }),
    select: (data) => data.items || [],
  })

  useEffect(() => {
    if (urlProjectId) {
      const projectId = Number(urlProjectId)
      setSelectedProjectId(projectId)
      const projectExists = projects.some((p) => p.id === projectId)
      if (!projectExists && !projectsLoading && projects.length > 0) {
        refetchProjects()
      }
    }
  }, [urlProjectId, projects, projectsLoading, refetchProjects])

  return (
    <ProjectMemberManagerComponent
      isAdminMode
      projectId={selectedProjectId}
      availableProjects={projects}
      onProjectChange={setSelectedProjectId}
      title={t('admin.projectMemberManagement')}
    />
  )
}

export default AdminProjectMemberManagement
