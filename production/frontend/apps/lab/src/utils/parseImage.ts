export interface ImageParts {
  registry: string
  namespace: string
  image: string
  tag: string
}

/**
 * 解析 OCI 镜像地址
 * 格式: registry/namespace/image:tag
 * 示例:
 * lab-cn-guangzhou.cr.volces.com/fs/jupyter/deepexi-notebook:datascience-cpu-python312-ubuntu24.04
 */
export function parseImage(image: string): ImageParts {
  // registry/namespace/image:tag
  const regex = /^([^/]+)\/([^/]+)\/(.+):([^:]+)$/
  const match = image.trim().match(regex)

  if (!match) {
    throw new Error(`Invalid image format: ${JSON.stringify(image)}`)
  }

  const [, registry, namespace, img, tag] = match

  return {
    registry,
    namespace,
    image: img,
    tag,
  }
}

/**
 * 安全解析镜像地址，解析失败时返回 null
 */
export function safeParseImage(image?: string | null): ImageParts | null {
  if (!image?.trim())
    return null

  try {
    return parseImage(image)
  }
  catch {
    return null
  }
}

/**
 * 获取用于展示的镜像字段，顺序为 namespace / image / tag
 */
export function getImageDisplayParts(image?: string | null): string[] {
  const parts = safeParseImage(image)
  if (!parts)
    return image?.trim() ? [image.trim()] : []

  return [parts.namespace, parts.image, parts.tag]
}
