import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useProjectStore } from '@/stores/projectStore'

/**
 * 获取当前项目路径，优先 URL 中的 projectId，否则用 store 中的 currentProject
 * @returns projectPath 与 ensureProject（无项目时提示并跳转，返回 false）
 */
export function useProjectPath() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const currentProject = useProjectStore((s) => s.currentProject)

  const projectPath = projectId
    ? `/project/${projectId}`
    : currentProject?.id
      ? `/project/${currentProject.id}`
      : ''

  const ensureProject = () => {
    if (projectPath) return true
    navigate('/projects')
    return false
  }

  return { projectPath, ensureProject }
}

export function useNotebookBasePath() {
  const { projectPath } = useProjectPath()
  const { pathname } = useLocation()
  if (!projectPath) {
    return { notebookBasePath: '' as const }
  }
  const notebookBasePath = pathname.includes('/machine-notebook')
    ? `${projectPath}/machine-notebook`
    : `${projectPath}/finetune/notebooks`
  return { notebookBasePath }
}
