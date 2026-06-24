import { getDisplayPrompt, getRawDataImages } from './multiLabelDataCompat'
import { replaceImagePlaceholders } from '@/utils/imageUtils'

export const formatGrpoValue = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return String(value)
  }
}

export const getGrpoStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

export const formatGrpoPrompt = (rawData: Record<string, unknown>, baseUrl: string): string => {
  const prompt = rawData.prompt
  const images = getRawDataImages(rawData)

  if (!Array.isArray(prompt)) {
    return getDisplayPrompt(rawData)
  }

  let imageIndex = 0
  return prompt.map((item) => {
    const message = item && typeof item === 'object' && !Array.isArray(item)
      ? item as Record<string, unknown>
      : {}
    const role = getGrpoStringValue(message.role)
    const rawContent = formatGrpoValue(message.content)
    const { processedContent, nextIndex } = replaceImagePlaceholders(rawContent, images, baseUrl, imageIndex)
    imageIndex = nextIndex
    return role ? `${role}\n${processedContent}` : processedContent
  }).filter(Boolean).join('\n\n')
}

export const getGrpoRewardModel = (
  rawData: Record<string, unknown>,
  annotation?: Record<string, unknown> | null,
): string => {
  const rawRewardModel = rawData.reward_model && typeof rawData.reward_model === 'object' && !Array.isArray(rawData.reward_model)
    ? rawData.reward_model as Record<string, unknown>
    : {}
  const annotationRewardModel = annotation?.reward_model && typeof annotation.reward_model === 'object' && !Array.isArray(annotation.reward_model)
    ? annotation.reward_model as Record<string, unknown>
    : {}

  return formatGrpoValue({
    ...rawRewardModel,
    ...annotationRewardModel,
  })
}
