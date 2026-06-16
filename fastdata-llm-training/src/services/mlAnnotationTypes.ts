export type MLDataTypeValue = 'text' | 'image'

export type MLWorkbenchKind =
  | 'text-classification'
  | 'entity'
  | 'image-classification'
  | 'object-detection'
  | 'image-segmentation-standard'
  | 'image-segmentation-hole'
  | 'semantic-segmentation'

export type MLAnnotationTemplateConfig = {
  value: string
  label: string
  workbenchKind: MLWorkbenchKind
}

export type MLAnnotationTypeConfig = {
  value: string
  label: string
  templates: MLAnnotationTemplateConfig[]
}

export const ML_ANNOTATION_TYPES_BY_DATA_TYPE: Record<MLDataTypeValue, MLAnnotationTypeConfig[]> = {
  text: [
    {
      value: '文本分类',
      label: '文本分类',
      templates: [
        { value: '文本单标签', label: '文本单标签', workbenchKind: 'text-classification' },
        { value: '文本多标签', label: '文本多标签', workbenchKind: 'text-classification' },
      ],
    },
    {
      value: '实体识别',
      label: '实体识别',
      templates: [
        { value: '文本实体识别', label: '文本实体识别', workbenchKind: 'entity' },
      ],
    },
  ],
  image: [
    {
      value: '图像分类',
      label: '图像分类',
      templates: [
        { value: '单图单标签', label: '单图单标签', workbenchKind: 'image-classification' },
        { value: '单图多标签', label: '单图多标签', workbenchKind: 'image-classification' },
      ],
    },
    {
      value: '物体检测',
      label: '物体检测',
      templates: [
        { value: '矩形框标注', label: '矩形框标注', workbenchKind: 'object-detection' },
      ],
    },
    {
      value: '图像分割',
      label: '图像分割',
      templates: [
        { value: '实例分割（标准）', label: '实例分割（标准）', workbenchKind: 'image-segmentation-standard' },
        { value: '实例分割（孔洞）', label: '实例分割（孔洞）', workbenchKind: 'image-segmentation-hole' },
        { value: '语义分割', label: '语义分割', workbenchKind: 'semantic-segmentation' },
      ],
    },
  ],
}

export function getMLAnnotationTypes(dataType: MLDataTypeValue) {
  return ML_ANNOTATION_TYPES_BY_DATA_TYPE[dataType]
}

export function getDefaultMLAnnotationType(dataType: MLDataTypeValue) {
  return getMLAnnotationTypes(dataType)[0]
}

export function getMLAnnotationType(annotationType: string, dataType?: MLDataTypeValue) {
  const candidates = dataType ? getMLAnnotationTypes(dataType) : Object.values(ML_ANNOTATION_TYPES_BY_DATA_TYPE).flat()
  return candidates.find(item => item.value === annotationType)
}

export function getMLAnnotationTemplates(annotationType: string, dataType?: MLDataTypeValue) {
  return getMLAnnotationType(annotationType, dataType)?.templates ?? []
}

export function getDefaultMLAnnotationTemplate(annotationType: string, dataType?: MLDataTypeValue) {
  return getMLAnnotationTemplates(annotationType, dataType)[0]
}

export function getMLWorkbenchKind(annotationType: string, annotationTemplate?: string): MLWorkbenchKind {
  const normalizedTemplate = normalizeMLAnnotationTemplate(annotationTemplate)
  const target = Object.values(ML_ANNOTATION_TYPES_BY_DATA_TYPE)
    .flat()
    .find(item => item.value === annotationType)
    ?.templates.find(template => template.value === normalizedTemplate)

  return target?.workbenchKind ?? 'text-classification'
}

export function getMLDataTypeLabel(dataType: MLDataTypeValue) {
  return dataType === 'image' ? '图片' : '文本'
}

export function getMLDataTypeValue(label: string): MLDataTypeValue {
  return label === '图片' ? 'image' : 'text'
}

export function normalizeMLAnnotationTemplate(template?: string) {
  if (template === '实例分割') {
    return '实例分割（标准）'
  }
  if (template === '带孔实例分割') {
    return '实例分割（孔洞）'
  }
  return template ?? ''
}

export function getMLAnnotationPathLabel(annotationType: string, annotationTemplate?: string) {
  const normalizedTemplate = normalizeMLAnnotationTemplate(annotationTemplate)
  return normalizedTemplate ? `${annotationType}/${normalizedTemplate}` : annotationType
}
