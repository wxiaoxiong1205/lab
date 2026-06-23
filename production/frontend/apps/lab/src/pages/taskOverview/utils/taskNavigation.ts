import type { LatestComputeTask } from '@/services/taskOverviewService'

const getTaskSourceId = (task: LatestComputeTask) => {
  const sourceId = task.detail_ref?.source_id ?? task.source?.source_id
  return typeof sourceId === 'number' && Number.isFinite(sourceId) ? sourceId : undefined
}

const getMachineLearningImageBuildPath = (projectId: number) => `/project/${projectId}/machine-notebook/mirror`

const getLlmImageBuildPath = (projectId: number) => `/project/${projectId}/finetune/notebooks/mirror`

const getNotebookImagePath = (projectId: number, task: LatestComputeTask) => {
  return task.task_scope === 'machine_learning'
    ? getMachineLearningImageBuildPath(projectId)
    : getLlmImageBuildPath(projectId)
}

const getEncodedTaskName = (task: LatestComputeTask) => {
  return task.task_name ? encodeURIComponent(task.task_name) : undefined
}

export const getLatestTaskTargetPath = (task: LatestComputeTask, projectId?: number) => {
  if (!projectId) return `/tasks/${task.task_id}`

  const sourceId = getTaskSourceId(task)
  const taskName = getEncodedTaskName(task)
  const projectPath = `/project/${projectId}`

  switch (task.task_type) {
    case 'llm_training':
      return taskName ? `${projectPath}/training/tasks/${taskName}` : `${projectPath}/training`

    case 'llm_deployment':
      return sourceId ? `${projectPath}/service/inference/hosted/${sourceId}` : `${projectPath}/service/inference/hosted`

    case 'llm_inference_result':
      return sourceId ? `${projectPath}/Inference/${sourceId}` : `${projectPath}/Inference`

    case 'llm_evaluation':
      return sourceId ? `${projectPath}/effect-evaluation/report/${sourceId}?evaluationType=auto` : `${projectPath}/effect-evaluation/auto`

    case 'llm_benchmark':
      return sourceId ? `${projectPath}/effect-evaluation/report/${sourceId}?evaluationType=benchmark` : `${projectPath}/effect-evaluation/benchmark`

    case 'llm_notebook':
      return sourceId ? `${projectPath}/finetune/notebooks/${sourceId}` : `${projectPath}/finetune/notebooks`

    case 'machine_learning_model_deployment':
      return sourceId ? `${projectPath}/machine-model-deployment/${sourceId}` : `${projectPath}/machine-model-deployment`

    case 'machine_learning_notebook':
      return sourceId ? `${projectPath}/machine-notebook/${sourceId}` : `${projectPath}/machine-notebook`

    case 'data_cleaning':
      return sourceId ? `${projectPath}/data-cleaning/${sourceId}` : `${projectPath}/data-cleaning`

    case 'llm_image_build':
      return getLlmImageBuildPath(projectId)

    case 'machine_learning_image_build':
      return getMachineLearningImageBuildPath(projectId)

    case 'image_build':
      return getNotebookImagePath(projectId, task)

    case 'machine_learning_model':
    default:
      return `${projectPath}/tasks/${task.task_id}`
  }
}
