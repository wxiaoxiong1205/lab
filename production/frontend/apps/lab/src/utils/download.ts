// 工具函数：下载 blob 文件
export function downloadUrlFile(url: string, filename?: string, target?: HTMLAnchorElement['target']) {
  const link = document.createElement('a')
  link.href = url
  if (filename) {
    link.setAttribute('download', filename)
  }
  if (target) {
    link.target = target
    link.rel = 'noopener noreferrer'
  }
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function downloadBlobFile(blob: Blob, filename?: string) {
  const url = window.URL.createObjectURL(blob)
  downloadUrlFile(url, filename)
  window.URL.revokeObjectURL(url)
}

/**
 * 从响应头中获取 Content-Disposition 值
 * @param headers 响应头对象
 * @returns Content-Disposition 字符串
 */
function getContentDisposition(headers: any): string {
  return headers?.['content-disposition'] || headers?.['Content-Disposition'] || ''
}

/**
 * 清理文件名：移除路径分隔符和非法字符
 * @param filename 原始文件名
 * @returns 清理后的文件名
 */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[/\\?%*:|"<>]/g, '').trim()
}

/**
 * 从响应头中提取文件名
 * @param headers 响应头对象
 * @param defaultFilename 默认文件名（可选）
 * @returns 提取的文件名，如果未找到则返回默认文件名或空字符串
 */
export function extractFilenameFromHeaders(headers: any, defaultFilename?: string): string {
  const contentDisposition = getContentDisposition(headers)
  let filename = ''

  if (!contentDisposition) {
    filename = defaultFilename || ''
  }
  else {
    // 优先处理 filename*=UTF-8'' 格式 (RFC 5987)
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
    if (utf8Match && utf8Match[1]) {
      try {
        filename = decodeURIComponent(utf8Match[1].trim())
      }
      catch {
        filename = utf8Match[1].trim()
      }
    }
    else {
      // 处理标准的 filename= 格式
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]+)/i)
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].trim().replace(/^["']|["']$/g, '')
        // 尝试解码 URL 编码的文件名
        try {
          filename = decodeURIComponent(filename)
        }
        catch {
          // 如果解码失败，保持原样
        }
      }
      else {
        filename = defaultFilename || ''
      }
    }
  }

  // 清理文件名：移除路径分隔符和非法字符
  return sanitizeFilename(filename)
}

/**
 * 从 Content-Type 响应头推断实际文件类型（用于区分透传的 fileType 与真实返回格式，如 jsonl 可能实际返回 zip）
 */
function getFileTypeFromContentType(contentType: string): string | undefined {
  if (!contentType) return undefined
  const ct = contentType.toLowerCase().split(';')[0].trim()
  if (ct.includes('application/zip') || ct.includes('application/x-zip-compressed')) return 'zip'
  if (ct.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') || ct.includes('application/vnd.ms-excel')) return 'xlsx'
  if (ct.includes('text/csv') || ct.includes('application/csv')) return 'csv'
  if (ct.includes('application/jsonl')) return 'jsonl'
  if (ct.includes('application/json') || ct.includes('text/json')) return 'json'
  return undefined
}

/**
 * 根据文件类型获取 MIME 类型
 * @param fileType 文件类型
 * @returns MIME 类型字符串
 */
export function getMimeType(fileType: string): string {
  switch (fileType) {
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'zip':
      return 'application/zip'
    case 'jsonl':
      return 'application/jsonl'
    case 'csv':
      return 'text/csv'
    case 'json':
    default:
      return 'application/json'
  }
}

/**
 * 根据导出类型处理文件名扩展名
 * @param filename 原始文件名
 * @param exportType 导出类型 ('json' | 'jsonl' | 'xlsx')
 * @param datasetFormat 数据集格式（可选，用于fallback）
 * @param contentType 内容类型（可选，用于fallback）
 * @returns 处理后的文件名
 */
export function processFilenameExtension(
  filename: string,
  exportType?: string,
  datasetFormat?: string,
  contentType?: string,
): string {
  // 优先使用 exportType 参数来确定文件扩展名
  if (exportType) {
    const extensionMap: Record<string, string> = {
      json: '.json',
      jsonl: '.jsonl',
      xlsx: '.xlsx',
    }
    const extension = extensionMap[exportType]
    if (extension) {
      // 移除现有的扩展名，然后添加新的扩展名
      return filename.replace(/\.[^.]+$/, '') + extension
    }
  }

  // 如果没有指定 exportType，使用原有逻辑
  // 检查数据集格式，如果是jsonl，确保扩展名为.jsonl
  if (datasetFormat === 'jsonl') {
    // 替换现有的扩展名（如果有）为.jsonl
    return filename.replace(/\.(json|jsonl)?$/, '.jsonl')
  }

  // 如果文件名没有扩展名，根据内容类型添加适当的后缀
  const hasExtension = filename.includes('.')
  if (!hasExtension && contentType) {
    if (contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      || contentType.includes('application/vnd.ms-excel')) {
      return `${filename}.xlsx`
    }
    else if (contentType.includes('text/csv') || contentType.includes('application/csv')) {
      return `${filename}.csv`
    }
    else if (contentType.includes('application/json') || contentType.includes('text/json')) {
      return `${filename}.json`
    }
    else if (contentType.includes('json')) {
      return `${filename}.jsonl`
    }
    else if (contentType.includes('application/zip') || contentType.includes('application/x-zip-compressed')) {
      return `${filename}.zip`
    }
  }

  return filename
}

/**
 * 从响应头中获取 Content-Type
 * @param headers 响应头对象
 * @param data 响应数据（可选，用于fallback）
 * @returns Content-Type 字符串
 */
export function getContentType(headers: any, data?: any): string {
  return headers?.['content-type']
    || headers?.['Content-Type']
    || data?.type
    || ''
}

/**
 * 创建 Blob 对象
 * @param data 响应数据
 * @param contentType 内容类型
 * @returns Blob 对象
 */
export function createBlobFromResponse(data: any, contentType?: string): Blob {
  if (data instanceof Blob) {
    return data
  }

  const dataToUse = typeof data === 'string' ? data : JSON.stringify(data)
  const blobType = contentType || 'application/octet-stream'
  return new Blob([dataToUse], { type: blobType })
}

/**
 * 处理下载错误
 * @param error 错误对象
 * @param onError 错误处理回调函数（可选）
 */
function handleDownloadError(error: any, onError?: (error: any) => void): never {
  if (onError) {
    onError(error)
  }
  throw error
}

/**
 * 下载数据集示例文件
 * @param projectId 项目ID
 * @param datasetType 数据集类型
 * @param dataFormat 数据格式
 * @param trainingType 训练方法类型
 * @param fileType 文件类型 ('json' | 'jsonl' | 'xlsx' | 'zip')
 * @param downloadExampleService 下载示例文件的API服务函数
 * @param onError 错误处理回调函数
 */
export async function downloadDatasetExample(
  projectId: number,
  datasetType: string,
  dataFormat: string,
  trainingType: string,
  fileType: string,
  downloadExampleService: (
    projectId: number,
    datasetType: string,
    dataFormat: string,
    trainingType: string,
    fileType: string
  ) => Promise<{ data: any, headers: any }>,
  onError?: (error: any) => void,
): Promise<void> {
  // 验证参数
  if (!projectId || isNaN(Number(projectId))) {
    throw new Error('项目ID无效')
  }
  if (!datasetType || !dataFormat || !trainingType) {
    throw new Error('请选择数据集类型、数据格式、训练方法')
  }

  try {
    // 调用API获取数据
    const response = await downloadExampleService(projectId, datasetType, dataFormat, trainingType, fileType)
    const data = response.data

    // 从响应头中提取文件名（content-disposition 返回的文件名会带后缀，如 .zip）
    const filename = extractFilenameFromHeaders(response.headers)
    const contentType = getContentType(response.headers, data)

    // 实际格式优先用响应里的信息：文件名后缀 > Content-Type > 透传的 fileType（透传的 fileType 可能是“内容格式”如 jsonl，但实际下载的是 zip 包装）
    const ext = filename ? filename.replace(/^.*\.([^.]+)$/, '$1').toLowerCase() : ''
    const knownTypes = ['json', 'jsonl', 'xlsx', 'zip', 'csv']
    const fromExt = ext && knownTypes.includes(ext) ? ext : undefined
    const fromContentType = getFileTypeFromContentType(contentType)
    const effectiveFileType = fromExt ?? fromContentType ?? fileType

    // 创建 Blob：接口已用 responseType: 'blob' 时，直接使用原始二进制，避免二次处理破坏 zip 等
    let blob: Blob
    if (data instanceof Blob) {
      blob = data
    }
    else {
      const mimeType = getMimeType(effectiveFileType)
      if (effectiveFileType === 'json') {
        const dataToUse = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
        blob = new Blob([dataToUse], { type: mimeType })
      }
      else if (effectiveFileType === 'jsonl') {
        let dataToUse: string
        if (typeof data === 'string') {
          dataToUse = data
        }
        else if (Array.isArray(data)) {
          dataToUse = data.map((item) => JSON.stringify(item)).join('\n')
        }
        else {
          dataToUse = JSON.stringify(data)
        }
        blob = new Blob([dataToUse], { type: mimeType })
      }
      else {
        blob = createBlobFromResponse(data, mimeType)
      }
    }

    // 下载文件（使用从 Content-Disposition 中提取的文件名）
    downloadBlobFile(blob, filename)
  }
  catch (error) {
    handleDownloadError(error, onError)
  }
}

/**
 * 下载推理结果集示例文件
 * @param fileType 文件类型 ('json' | 'jsonl' | 'xlsx' | 'csv' | 'zip')
 * @param downloadSampleService 下载示例文件的API服务函数
 * @param onError 错误处理回调函数
 * @param datasetFormat 数据集格式（可选）
 * @param datasetType 数据集类型（可选）
 * @param importDataUsage 导入数据用途（可选，用于区分 DPO/RFT-GRPO 样例）
 */
export async function downloadInferenceResultSetSample(
  fileType: 'jsonl' | 'csv' | 'xlsx' | 'json' | 'zip',
  downloadSampleService: (fileType: 'jsonl' | 'csv' | 'xlsx' | 'json' | 'zip', datasetFormat?: string, datasetType?: string, importDataUsage?: string) => Promise<{ data: any, headers: any }>,
  onError?: (error: any) => void,
  datasetFormat?: string,
  datasetType?: string,
  importDataUsage?: string,
): Promise<void> {
  try {
    // 调用API获取数据
    const response = await downloadSampleService(fileType, datasetFormat, datasetType, importDataUsage)
    const data = response.data

    // 从响应头中提取文件名和内容类型
    const contentType = getContentType(response.headers, data)

    // 从响应头中提取文件名
    const filename = extractFilenameFromHeaders(response.headers)

    // 创建 Blob
    const blobType = contentType || getMimeType(fileType)
    const blob = createBlobFromResponse(data, blobType)

    // 下载文件
    downloadBlobFile(blob, filename)
  }
  catch (error) {
    handleDownloadError(error, onError)
  }
}

/**
 * 下载数据集文件
 * @param downloadService 下载数据集的API服务函数
 * @param defaultFilename 默认文件名
 * @param exportType 导出类型 ('json' | 'jsonl' | 'xlsx')
 * @param datasetFormat 数据集格式（可选）
 * @param onError 错误处理回调函数（可选）
 */
export async function downloadDataset(
  downloadService: () => Promise<{ data: any, headers: any }>,
  defaultFilename: string,
  exportType?: string,
  datasetFormat?: string,
  onError?: (error: any) => void,
): Promise<void> {
  try {
    // 调用API获取数据
    const response = await downloadService()
    const data = response.data

    // 从响应头中提取文件名
    let filename = extractFilenameFromHeaders(response.headers, defaultFilename)

    // 获取内容类型
    const contentType = getContentType(response.headers, data)

    // 处理文件名扩展名
    filename = processFilenameExtension(filename, exportType, datasetFormat, contentType)

    // 创建 Blob 对象
    const blob = createBlobFromResponse(data, contentType)

    // 下载文件
    downloadBlobFile(blob, filename)
  }
  catch (error) {
    handleDownloadError(error, onError)
  }
}
