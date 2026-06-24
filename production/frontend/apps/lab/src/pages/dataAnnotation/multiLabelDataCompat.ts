type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as UnknownRecord
  }
  return null
}

function getString(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return ''
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringifyAnnotationArray(value: unknown): string {
  const items = getArray(value)
  if (items.length === 0) {
    return ''
  }
  return items.map((item) => getString(item) || JSON.stringify(item)).join(', ')
}

function formatMessageArray(value: unknown): string {
  const items = getArray(value)
  if (items.length === 0) {
    return ''
  }

  return items.map((item) => {
    const record = asRecord(item)
    if (!record) {
      return getString(item) || JSON.stringify(item)
    }
    const role = getString(record.role)
    const content = getString(record.content)
    return role ? `${role}\n${content}` : content
  }).filter(Boolean).join('\n\n')
}

export function getNormalizedRawData(rawData: unknown): UnknownRecord {
  const raw = asRecord(rawData) ?? {}
  const nested = asRecord(raw.data)
  return nested ? { ...raw, ...nested } : raw
}

export function getRawDataText(rawData: unknown, ...keys: string[]): string {
  const raw = getNormalizedRawData(rawData)
  for (const key of keys) {
    const value = getString(raw[key])
    if (value) {
      return value
    }
  }
  return ''
}

export function getRawDataMessages(rawData: unknown): unknown[] {
  const raw = getNormalizedRawData(rawData)
  return getArray(raw.messages)
}

export function getRawDataImages(rawData: unknown): string[] {
  const raw = getNormalizedRawData(rawData)
  return getArray(raw.images).map((item) => getString(item)).filter(Boolean)
}

export function getDisplayPrompt(rawData: unknown): string {
  const raw = getNormalizedRawData(rawData)
  const promptMessages = formatMessageArray(raw.prompt)
  if (promptMessages) {
    return promptMessages
  }
  return getRawDataText(raw, 'prompt', 'content', 'text')
}

export function getDisplaySystem(rawData: unknown): string {
  return getRawDataText(rawData, 'system')
}

export function getDisplayGroundTruth(rawData: unknown, annotation: unknown): string {
  const annotationRecord = asRecord(annotation)
  const annotationRewardModel = asRecord(annotationRecord?.reward_model)
  const annotationRewardGroundTruth = getString(annotationRewardModel?.ground_truth)
  if (annotationRewardGroundTruth) {
    return annotationRewardGroundTruth
  }

  const annotationResponse = getString(annotationRecord?.response)
  if (annotationResponse) {
    return annotationResponse
  }

  const annotationContent = getString(annotationRecord?.content)
  if (annotationContent) {
    return annotationContent
  }

  const rawResponse = getRawDataText(rawData, 'response', 'ground_truth')
  if (rawResponse) {
    return rawResponse
  }

  const raw = getNormalizedRawData(rawData)
  const rewardModel = asRecord(raw.reward_model)
  const rewardGroundTruth = getString(rewardModel?.ground_truth)
  if (rewardGroundTruth) {
    return rewardGroundTruth
  }

  return stringifyAnnotationArray(raw.annotations)
}

export function getRewardModelStyle(rawData: unknown, annotation: unknown): string {
  const annotationRewardModel = asRecord(asRecord(annotation)?.reward_model)
  const annotationStyle = getString(annotationRewardModel?.style)
  if (annotationStyle) {
    return annotationStyle
  }

  const rewardModel = asRecord(getNormalizedRawData(rawData).reward_model)
  return getString(rewardModel?.style)
}
