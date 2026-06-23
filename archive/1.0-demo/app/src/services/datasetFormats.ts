export type CanonicalDatasetFormat = 'prompt-response' | 'role-based' | 'alpaca'
export type DatasetFormatInput = CanonicalDatasetFormat | 'PROMPT_RESPONSE' | 'ROLE_BASED' | 'ALPACA' | 'Chosen_Rejected' | string

export function isDpoUsage(value?: string): boolean {
  return String(value ?? '').startsWith('DPO-')
}

export function normalizeDatasetFormat(format: DatasetFormatInput | undefined, dataUsage?: string): CanonicalDatasetFormat {
  const value = String(format ?? '').trim()
  if (isDpoUsage(dataUsage)) {
    if (value === 'ROLE_BASED' || value === 'role-based') {
      return 'role-based'
    }
    return 'alpaca'
  }
  if (value === 'ROLE_BASED' || value === 'role-based') {
    return 'role-based'
  }
  return 'prompt-response'
}

export function toPickerDataFormat(format: DatasetFormatInput | undefined, dataUsage?: string): string {
  const normalized = normalizeDatasetFormat(format, dataUsage)
  if (isDpoUsage(dataUsage)) {
    return normalized === 'role-based' ? 'ROLE_BASED' : 'ALPACA'
  }
  return normalized === 'role-based' ? 'ROLE_BASED' : 'PROMPT_RESPONSE'
}

export function getDatasetFormatLabel(dataUsage?: string, dataFormat?: DatasetFormatInput): string {
  const normalized = normalizeDatasetFormat(dataFormat, dataUsage)
  if (isDpoUsage(dataUsage)) {
    return normalized === 'role-based' ? 'Role-Based' : 'Alpaca'
  }
  return normalized === 'role-based' ? 'ROLE_BASED' : 'PROMPT_RESPONSE'
}

export function isPreferenceOrRewardFormat(dataFormat?: string, name?: string): boolean {
  const format = String(dataFormat ?? '')
  const upperName = String(name ?? '').toUpperCase()
  return format === 'ALPACA' || format === 'Chosen_Rejected' || format === 'Completion_Reward' || upperName.includes('DPO') || upperName.includes('RFT')
}
