export const formatDatasetCreationStatus = (status?: string | null) => {
  if (!status) return '-'
  const normalized = String(status).trim()
  const statusMap: Record<string, string> = {
    pending: '创建中',
    processing: '创建中',
    running: '创建中',
    completed: '创建成功',
    success: '创建成功',
    failed: '创建失败',
    error: '创建失败',
    处理中: '创建中',
    待处理: '创建中',
    处理完成: '创建成功',
    处理成功: '创建成功',
    创建完成: '创建成功',
    创建成功: '创建成功',
    处理失败: '创建失败',
    创建失败: '创建失败',
  }
  return statusMap[normalized] || normalized
}

export const isDatasetCreating = (status?: string | null) => {
  return formatDatasetCreationStatus(status) === '创建中'
}

export const isDatasetCreateFailed = (status?: string | null) => {
  return formatDatasetCreationStatus(status) === '创建失败'
}

export const isDatasetCreateSucceeded = (status?: string | null) => {
  return formatDatasetCreationStatus(status) === '创建成功'
}

export const formatDatasetVersionStatus = (versionItem?: Record<string, any> | null) => {
  if (!versionItem) return '-'

  const creationStatus = formatDatasetCreationStatus(
    versionItem.processing_status_display ?? versionItem.processing_status,
  )
  if (creationStatus === '创建中' || creationStatus === '创建失败') {
    return creationStatus
  }

  const rawPublishStatus = versionItem.status_display ?? versionItem.publish_display
  const publishStatus = rawPublishStatus === '处理完成' || rawPublishStatus === '创建成功' || rawPublishStatus === '-'
    ? ''
    : rawPublishStatus

  if (publishStatus === '已发布' || publishStatus === '未发布') {
    return publishStatus
  }
  if (versionItem.is_published !== undefined && versionItem.is_published !== null) {
    return versionItem.is_published ? '已发布' : '未发布'
  }
  if (versionItem.publish !== undefined && versionItem.publish !== null) {
    return Number(versionItem.publish) === 1 ? '已发布' : '未发布'
  }

  return creationStatus === '创建成功' ? '未发布' : creationStatus
}
